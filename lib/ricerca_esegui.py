"""Esegue un piano di ricerca e ne restituisce i dati reali.

DOVE STA IL CONFINE
-------------------
`ricerca_mercato.costruisci_piano` decide COSA interrogare e a che prezzo.
Questo modulo lo ESEGUE. La separazione non è pedanteria: il piano si può
mostrare a chi paga PRIMA di spendere, e chi paga può dire di no.

⚠️ Una correzione a un'assunzione precedente. `ricerca_mercato` dichiarava:
«questo modulo NON esegue le chiamate ScrapeCreators: quelle passano dagli
strumenti MCP, che vivono nella sessione dell'agente, non in un processo
Python». Era vero quando fu scritto, e ha smesso di esserlo: ScrapeCreators ha
una API HTTP, la chiave è nel `.env`, e `lib/fonti_social.py` la usa — rotte
verificate live il 2026-08-04. La mappa di ciò che risponde davvero, e di ciò
che NON risponde (la libreria inserzioni TikTok), sta in testa a
`fonti_social.py`: è lì che va letta, e lì che va aggiornata quando cambia.

La differenza è sostanziale: un piano che si può solo raccontare serve a poco,
un piano che si esegue da sé può girare su un server mentre il portatile è
spento. Era esattamente il limite che teneva l'analisi legata alla sessione.

COSA SI PAGA DAVVERO
--------------------
Sei piattaforme, organico e pubblicitario: **tutto compreso nel canone
ScrapeCreators**. Il saldo Monid si tocca solo per ciò che nessun canone
copre — aziende per settore e paese, verifica email, tecnologie del sito. È la
regola scritta in `fonti-ricerca.json` e qui viene applicata, non ripetuta.
"""
from __future__ import annotations

import os
from dataclasses import dataclass, field

from .dataforseo import DataForSEOClient, LOCATION_ITALIA, LOCATION_SPAGNA
from .fonti_social import FontiSocial, Raccolta, esegui_capacita
from .ricerca_mercato import Piano, Passo, cerca_aziende, saldo_monid

# Paese ISO-2 → (location_code Google Ads, lingua). Solo i mercati dichiarati
# nel piano commerciale di SHEis: l'estero è la priorità #1, la Spagna il
# beachhead. Aggiungerne uno significa aggiungerlo qui, non indovinarlo.
MERCATI = {
    "it": (LOCATION_ITALIA, "it"),
    "es": (LOCATION_SPAGNA, "es"),
}


@dataclass
class EsitoRicerca:
    raccolte: list[Raccolta] = field(default_factory=list)
    domanda: dict = field(default_factory=dict)     # volumi di ricerca per paese
    aziende: dict = field(default_factory=dict)     # solo se richiesto: costa
    saltati: list[str] = field(default_factory=list)
    errori: list[str] = field(default_factory=list)
    chiamate_a_canone: int = 0
    costo_monid_eur: float = 0.0

    def dict(self, massimo_per_fonte: int = 40) -> dict:
        return {
            "raccolte": [r.dict(massimo_per_fonte) for r in self.raccolte],
            "domanda": self.domanda,
            "aziende": self.aziende,
            "saltati": self.saltati,
            "errori": self.errori,
            "chiamate_a_canone": self.chiamate_a_canone,
            "costo_monid_eur": round(self.costo_monid_eur, 4),
        }

    @property
    def quanti_elementi(self) -> int:
        return sum(r.quanti for r in self.raccolte)


# I concorrenti validati verbatim da Mauro (sheis-brand-core §6). Le librerie
# inserzioni di LinkedIn e Google cercano per NOME, non per tema: senza questa
# lista quelle due fonti tacciono. Non se ne aggiungono di propria iniziativa —
# un nome non validato finisce in un'analisi e poi in una presentazione.
CONCORRENTI_VALIDATI = [
    "Davines", "Kemon", "Alfaparf Milano", "Framesi",
    "Insight Professional", "Echoline", "Vitalis",
    "Sebastian Professional", "Kevin Murphy", "Oribe",
]


def esegui(piano: Piano, tema: str, paesi: list[str] | None = None,
           parole_chiave: list[str] | None = None,
           settore_aziende: str | None = None,
           concorrenti: list[str] | None = None) -> EsitoRicerca:
    """Esegue il piano. Non solleva mai per una fonte che non risponde: una
    fonte muta è un'informazione da consegnare, non un motivo per buttare via
    le altre cinque che hanno risposto."""
    esito = EsitoRicerca(saltati=list(piano.saltati))
    fonti = FontiSocial()

    if not fonti.pronto:
        esito.errori.append(
            "SCRAPECREATORS_API_KEY assente: nessuna piattaforma è interrogabile. "
            "La chiave sta nel .env di questo repo o in quello di scalers-plus."
        )
        return esito

    paesi = [p.lower() for p in (paesi or ["it"])]

    for passo in piano.passi:
        # Le capacità Monid hanno un percorso diverso: costano, e vanno
        # eseguite solo se chi ha letto il piano le ha volute.
        if passo.a_consumo:
            continue
        if passo.capacita == "domanda-di-ricerca":
            continue  # gestita sotto, ha bisogno delle parole chiave

        try:
            r = esegui_capacita(fonti, passo.capacita, {
                "tema": tema,
                "paese": paesi[0].upper(),
                "concorrenti": concorrenti if concorrenti is not None else CONCORRENTI_VALIDATI,
            })
        except Exception as e:  # una fonte non deve poter far cadere le altre
            esito.errori.append(f"{passo.capacita}: {type(e).__name__}: {e}")
            continue
        if r.errore:
            esito.errori.append(f"{passo.capacita}: {r.errore}")
        esito.raccolte.append(r)

    esito.chiamate_a_canone = fonti.chiamate_fatte

    # ── domanda di ricerca (DataForSEO, a canone) ────────────────────────────
    if any(p.capacita == "domanda-di-ricerca" for p in piano.passi):
        esito.domanda = _domanda(parole_chiave or [tema], paesi, esito)

    # ── aziende (Monid, a consumo) ───────────────────────────────────────────
    passo_aziende = next((p for p in piano.passi if p.capacita == "aziende-per-settore-e-paese"), None)
    if passo_aziende and settore_aziende:
        prima = saldo_monid()
        for paese in paesi:
            r = cerca_aziende(settore_aziende, paese.upper())
            esito.aziende[paese] = r
            if not r.get("ok"):
                esito.errori.append(f"aziende/{paese}: {r.get('errore')}")
        dopo = saldo_monid()
        # Il costo si MISURA dalla differenza di saldo, non si stima dal
        # listino: il listino cambia e nessuno se ne accorge finché non è
        # troppo tardi.
        if prima is not None and dopo is not None and prima > dopo:
            esito.costo_monid_eur = round(prima - dopo, 4)

    return esito


def _domanda(parole: list[str], paesi: list[str], esito: EsitoRicerca) -> dict:
    """Volumi di ricerca reali. ⚠️ DataForSEO restituisce `null`, non zero, su
    keyword di nicchia: sono due cose diverse e vanno tenute diverse. Zero
    significa «nessuno la cerca»; null significa «non lo sappiamo». Appiattire
    il secondo sul primo fa scartare una parola che magari funziona."""
    d = DataForSEOClient()
    if not d.credenziali_presenti:
        esito.errori.append(
            "DATAFORSEO_LOGIN/PASSWORD assenti: la domanda di ricerca resta vuota. "
            "Le altre fonti hanno comunque risposto."
        )
        return {}

    fuori = {}
    for paese in paesi:
        if paese not in MERCATI:
            esito.saltati.append(f"domanda-di-ricerca/{paese}: mercato non mappato (previsti: {', '.join(MERCATI)})")
            continue
        codice, lingua = MERCATI[paese]
        r = d.volume_ricerca(parole[:20], codice, lingua)
        if not r.ok:
            esito.errori.append(f"domanda/{paese}: {r.errore}")
            continue
        voci = []
        for task in (r.dati.get("tasks") or []):
            for ris in (task.get("result") or []):
                voci.append({
                    "parola": ris.get("keyword"),
                    "volume": ris.get("search_volume"),          # può essere None: NON convertire a 0
                    "volume_ignoto": ris.get("search_volume") is None,
                    "concorrenza": ris.get("competition"),
                    "cpc": ris.get("cpc"),
                })
        fuori[paese] = {
            "voci": sorted(voci, key=lambda v: (v["volume"] or -1), reverse=True),
            "con_volume": sum(1 for v in voci if v["volume"]),
            "senza_dato": sum(1 for v in voci if v["volume_ignoto"]),
        }
    return fuori


# ══════════════════════════════════════════════════════ sintesi per il modello

def compatta_per_sintesi(esito: EsitoRicerca, massimo_per_fonte: int = 12) -> str:
    """I dati grezzi ridotti a un testo che un modello può leggere per intero.

    Serve perché le risposte vere sono enormi — una sola ricerca TikTok pesa
    2,4 MB misurati. Passarle a un modello significherebbe pagare per far
    leggere un elenco di identificativi. Qui resta ciò che porta significato:
    chi ha detto cosa, quanto ha girato, e per le inserzioni da quanti giorni
    è viva.
    """
    righe: list[str] = []

    for r in esito.raccolte:
        if not r.quanti:
            continue
        righe.append(f"\n### {r.capacita} ({', '.join(r.piattaforme)}) — {r.quanti} elementi")
        cont = sorted(r.contenuti, key=lambda c: c.punteggio, reverse=True)[:massimo_per_fonte]
        for c in cont:
            eng = f" · {c.interazioni} interazioni" if c.interazioni else ""
            viz = f" su {c.visualizzazioni} visualizzazioni" if c.visualizzazioni else ""
            righe.append(f"- @{c.autore}{eng}{viz}: {c.testo[:220]}")
        ins = sorted(r.inserzioni, key=lambda a: (a.giorni_attivi or 0), reverse=True)[:massimo_per_fonte]
        for a in ins:
            g = f"{a.giorni_attivi}gg" if a.giorni_attivi is not None else "durata ignota"
            stato = "ATTIVA" if a.attiva else "chiusa"
            righe.append(f"- [{stato} {g}] {a.inserzionista} — {(a.titolo or '')[:80]} | {a.testo[:200]}")

    if esito.domanda:
        righe.append("\n### domanda di ricerca (volumi reali Google)")
        for paese, d in esito.domanda.items():
            top = [v for v in d["voci"] if v["volume"]][:12]
            righe.append(f"- {paese.upper()}: {d['con_volume']} parole con volume, {d['senza_dato']} senza dato")
            for v in top:
                righe.append(f"    · {v['parola']}: {v['volume']}/mese")
            if d["senza_dato"]:
                righe.append(
                    f"    · ⚠️ {d['senza_dato']} parole senza dato: NON significa volume zero, "
                    "significa che la fonte non lo conosce."
                )

    if esito.aziende:
        righe.append("\n### aziende trovate (Apollo via Monid)")
        for paese, r in esito.aziende.items():
            if r.get("ok"):
                righe.append(f"- {paese.upper()}: {r['quante']} aziende")
                for a in r["aziende"][:10]:
                    righe.append(f"    · {a['nome']} — {a.get('citta') or '?'} — {a.get('dipendenti') or '?'} dip.")

    if esito.errori:
        righe.append("\n### fonti che NON hanno risposto")
        for e in esito.errori:
            righe.append(f"- {e}")

    if esito.saltati:
        righe.append("\n### combinazioni non coperte da nessuna fonte")
        for s in esito.saltati:
            righe.append(f"- {s}")

    return "\n".join(righe) if righe else "Nessun dato raccolto."
