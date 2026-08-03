#!/usr/bin/env python3
"""Test diretti di creative_worker.py — REGRESSIONE del difetto ③ segnalato
dal collegio di revisione (2026-08-03):

  (a) nessuna chiamata a db.upsert() controllava il valore di ritorno —
      con la scrittura fallita, il worker stampava "✓ pronta" per una
      generazione mai registrata;
  (b) varianti_esistenti() ritornava un insieme VUOTO sia quando le
      varianti non esistono SIA quando la lettura fallisce — il chiamante
      non poteva distinguere "0 varianti" da "non lo so", e nel secondo
      caso rigenerava (in modalità reale: ripagava) varianti già fatte.

Uso un FakeDB configurabile invece di una rete vera: i due difetti sono
deterministici e non richiedono credito Higgsfield o Supabase reale.

Esegui: python3 tests/test_creative_worker_resilience.py
"""
from __future__ import annotations

import sys
from dataclasses import dataclass, field
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import creative_worker as cw  # noqa: E402
from lib.supabase import Esito  # noqa: E402

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
    """Sostituto minimale di SupabaseClient: select/upsert programmabili,
    e traccia ogni upsert ricevuto per ispezione."""
    select_ok: bool = True
    select_dati: list = field(default_factory=list)
    upsert_ok: bool = True
    upsert_chiamate: list = field(default_factory=list)

    def select(self, tabella, query=""):
        if not self.select_ok:
            return Esito(ok=False, errore="simulato: connessione DB caduta")
        return Esito(ok=True, dati=self.select_dati)

    def upsert(self, tabella, riga, conflitto=""):
        self.upsert_chiamate.append(riga)
        if not self.upsert_ok:
            return Esito(ok=False, errore="simulato: scrittura rifiutata dal DB")
        return Esito(ok=True, dati=[riga])


print("=== REGRESSIONE ③a: lettura varianti_esistenti() fallita → (False, set()), MAI confuso con '0 varianti' ===")
db_lettura_rotta = FakeDB(select_ok=False)
letto_ok, indici = cw.varianti_esistenti(db_lettura_rotta, "cid-1")
check(letto_ok is False, "letto_ok=False quando la select fallisce")
check(indici == set(), "insieme vuoto, ma il chiamante ha il segnale per NON interpretarlo come assenza")

print("\n=== REGRESSIONE ③a (continua): genera_per_contenuto() con lettura rotta NON genera nulla ===")
contenuto = {"id": "cid-1", "brand": "SHEis Color", "hook": "prova"}
esito = cw.genera_per_contenuto(db_lettura_rotta, contenuto, [False])
check(esito == "errore_lettura_db", f"esito='errore_lettura_db', non 'generato' (ottenuto: {esito!r})")
check(len(db_lettura_rotta.upsert_chiamate) == 0,
      "ZERO chiamate upsert: con la lettura rotta il worker non genera (e non spende) alla cieca")

print("\n=== REGRESSIONE ③b: scrittura fallita dopo una generazione riuscita → MAI riportata come successo ===")
db_scrittura_rotta = FakeDB(select_ok=True, select_dati=[], upsert_ok=False)
esito = cw.genera_per_contenuto(db_scrittura_rotta, contenuto, [False])
check(esito == "scrittura_fallita", f"esito='scrittura_fallita', non 'generato' (ottenuto: {esito!r})")
check(len(db_scrittura_rotta.upsert_chiamate) == 3,
      f"il worker TENTA comunque le 3 scritture (ognuna fallisce, ognuna viene tentata): {len(db_scrittura_rotta.upsert_chiamate)}")

print("\n=== caso sano: lettura e scrittura OK → 'generato', 3 varianti scritte ===")
db_sano = FakeDB(select_ok=True, select_dati=[], upsert_ok=True)
esito = cw.genera_per_contenuto(db_sano, contenuto, [False])
check(esito == "generato", f"esito='generato' nel caso sano (ottenuto: {esito!r})")
check(len(db_sano.upsert_chiamate) == 3, f"3 varianti scritte (ottenuto: {len(db_sano.upsert_chiamate)})")

print(f"\n=== RISULTATO: {'TUTTO OK' if problemi == 0 else f'{problemi} problemi'} ===")
raise SystemExit(0 if problemi == 0 else 1)
