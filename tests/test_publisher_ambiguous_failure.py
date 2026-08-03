#!/usr/bin/env python3
"""Test diretti di publisher_zernio.py — REGRESSIONE del difetto ④ segnalato
dal collegio di revisione (2026-08-03): un esito 'fallito' veniva SEMPRE
ritentato al giro successivo, senza distinguere un rifiuto HTTP netto (la
richiesta non è mai stata accettata: ritentare è sicuro) da un timeout/errore
di rete DOPO l'invio (ambiguo: Zernio potrebbe aver comunque creato il post —
ritentare rischia un doppio post reale). Riprodotto: nel caso classico
("Zernio ha già accettato ma la risposta si perde") il vecchio codice faceva
2 chiamate reali.

Copre anche il caso sano: un rifiuto HTTP netto (400/422) resta ritentabile
in automatico — non si vuole trasformare OGNI fallimento in uno stallo
manuale, solo quello davvero ambiguo.

Esegui: python3 tests/test_publisher_ambiguous_failure.py
"""
from __future__ import annotations

import sys
from dataclasses import dataclass, field
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import publisher_zernio as pz  # noqa: E402
from lib.supabase import Esito as EsitoDB  # noqa: E402
from lib.zernio import Esito as EsitoZernio  # noqa: E402

problemi = 0


def check(cond: bool, descrizione: str) -> None:
    global problemi
    if cond:
        print(f"✓ {descrizione}")
    else:
        print(f"✗ FALLITO: {descrizione}")
        problemi += 1


@dataclass
class FakeDB:
    select_ok: bool = True
    select_dati: list = field(default_factory=list)
    upsert_ok: bool = True
    upsert_chiamate: list = field(default_factory=list)

    def select(self, tabella, query=""):
        if not self.select_ok:
            return EsitoDB(ok=False, errore="simulato: connessione DB caduta")
        return EsitoDB(ok=True, dati=self.select_dati)

    def upsert(self, tabella, riga, conflitto=""):
        self.upsert_chiamate.append(riga)
        if not self.upsert_ok:
            return EsitoDB(ok=False, errore="simulato: scrittura rifiutata")
        return EsitoDB(ok=True, dati=[riga])


@dataclass
class FakeZernio:
    esito_crea_post: EsitoZernio
    chiamate: list = field(default_factory=list)

    def crea_post(self, contenuto, piattaforme, **kw):
        self.chiamate.append((contenuto, piattaforme))
        return self.esito_crea_post


CONTENUTO = {
    "id": "cid-1", "canale": "instagram",
    "hook": "Il rituale di cura per capelli sani", "copy": "Scopri la gamma SHEis Color.", "cta": "",
}
ACCOUNT_SHEIS = [{"zernio_account_id": "z1", "platform": "instagram", "username": "sheisbeautyhair",
                   "display_name": "SHEis", "enabled": True}]
CONFIG_OK = {"zernio_account_ids_sheis": {"instagram": {"username": "sheisbeautyhair"}}}

pz.LIVE = True  # forza il ramo di invio reale per questi test (nessuna rete vera: FakeZernio)
import lib.finestra as finestra  # noqa: E402
finestra.ALLOW_OUTSIDE_WINDOW = True  # non far dipendere il test dall'ora del giorno


print("=== lettura stato precedente fallita → NON pubblica alla cieca ===")
db_rotto = FakeDB(select_ok=False)
zc = FakeZernio(EsitoZernio(ok=True, dati={"id": "post-1"}))
esito = pz.gestisci_candidato(db_rotto, zc, CONTENUTO, ACCOUNT_SHEIS, CONFIG_OK)
check(esito == "errore_lettura_db", f"esito='errore_lettura_db' (ottenuto: {esito!r})")
check(len(zc.chiamate) == 0, "ZERO chiamate a Zernio: con la lettura rotta non si pubblica")

print("\n=== REGRESSIONE ④: timeout/rete DOPO l'invio → esito ambiguo, marcato, NON ritentato al giro dopo ===")
db1 = FakeDB(select_ok=True, select_dati=[])  # nessun tentativo precedente
zc_timeout = FakeZernio(EsitoZernio(ok=False, errore="rete: timed out", ambiguo=True))
esito1 = pz.gestisci_candidato(db1, zc_timeout, CONTENUTO, ACCOUNT_SHEIS, CONFIG_OK)
check(esito1 == "fallito_ambiguo", f"primo tentativo: esito='fallito_ambiguo' (ottenuto: {esito1!r})")
check(len(zc_timeout.chiamate) == 1, "UNA sola chiamata reale a Zernio nel primo tentativo")
riga_scritta = db1.upsert_chiamate[-1]
check(pz.MARCATORE_AMBIGUO in (riga_scritta.get("ultimo_errore") or ""),
      f"il marcatore ambiguo è nel record scritto: {riga_scritta.get('ultimo_errore')!r}")

# Simula il giro successivo: il DB ora contiene quello stato 'fallito' ambiguo.
db2 = FakeDB(select_ok=True, select_dati=[{"stato": "fallito", "ultimo_errore": riga_scritta["ultimo_errore"]}])
zc_secondo_giro = FakeZernio(EsitoZernio(ok=True, dati={"id": "post-2"}))
esito2 = pz.gestisci_candidato(db2, zc_secondo_giro, CONTENUTO, ACCOUNT_SHEIS, CONFIG_OK)
check(esito2 == "ambiguo_da_verificare", f"secondo giro: esito='ambiguo_da_verificare' (ottenuto: {esito2!r})")
check(len(zc_secondo_giro.chiamate) == 0,
      "ZERO chiamate a Zernio al giro successivo: il caso classico (accettato ma risposta persa) "
      "NON produce un doppio post reale")

print("\n=== rifiuto HTTP netto (400) → NON ambiguo, resta ritentabile in automatico ===")
db3 = FakeDB(select_ok=True, select_dati=[])
zc_rifiuto = FakeZernio(EsitoZernio(ok=False, status=400, errore="Bad Request: campo mancante", ambiguo=False))
esito3 = pz.gestisci_candidato(db3, zc_rifiuto, CONTENUTO, ACCOUNT_SHEIS, CONFIG_OK)
check(esito3 == "fallito", f"rifiuto netto: esito='fallito' semplice, non 'fallito_ambiguo' (ottenuto: {esito3!r})")
riga3 = db3.upsert_chiamate[-1]
check(pz.MARCATORE_AMBIGUO not in (riga3.get("ultimo_errore") or ""), "nessun marcatore ambiguo su un rifiuto netto")

db4 = FakeDB(select_ok=True, select_dati=[{"stato": "fallito", "ultimo_errore": riga3["ultimo_errore"]}])
zc_retry = FakeZernio(EsitoZernio(ok=True, dati={"id": "post-3"}))
esito4 = pz.gestisci_candidato(db4, zc_retry, CONTENUTO, ACCOUNT_SHEIS, CONFIG_OK)
check(esito4 == "pubblicato", f"giro successivo: il rifiuto netto VIENE ritentato normalmente (ottenuto: {esito4!r})")
check(len(zc_retry.chiamate) == 1, "una chiamata reale nel retry legittimo")

print(f"\n=== RISULTATO: {'TUTTO OK' if problemi == 0 else f'{problemi} problemi'} ===")
raise SystemExit(0 if problemi == 0 else 1)
