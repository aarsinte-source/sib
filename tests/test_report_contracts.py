#!/usr/bin/env python3
"""Test diretti di report_settimanale.py — REGRESSIONE del difetto ⑦
segnalato dal collegio di revisione (2026-08-03): due contratti dichiarati
nel codice e non rispettati.

(a) `calcola_canali_spenti()` tracciava SOLO il canale pubblicitario:
    organico e outreach hanno il proprio 'disponibile: False' ma non
    comparivano mai — il dato strutturato mentiva per omissione su due
    canali su tre.
(b) `decidi_invio_reale()`: il docstring di lib/finestra.py dichiara che la
    finestra 08:00-18:30 Europe/Rome vale anche per le email/Telegram del
    report, ma report_settimanale.py non la chiamava mai — un rerun manuale
    fuori orario mandava comunque.

Esegui: python3 tests/test_report_contracts.py
"""
from __future__ import annotations

import sys
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import report_settimanale as r  # noqa: E402
from lib import finestra  # noqa: E402

problemi = 0


def check(cond: bool, descrizione: str) -> None:
    global problemi
    if cond:
        print(f"✓ {descrizione}")
    else:
        print(f"✗ FALLITO: {descrizione}")
        problemi += 1


print("=== REGRESSIONE ⑦a: canali_spenti deve coprire tutti e tre i canali ===")

tutti_attivi = calcola = r.calcola_canali_spenti(
    {"disponibile": True}, {"attivo": True}, {"disponibile": True},
)
check(calcola == [], f"nessun canale spento quando tutti sono attivi (ottenuto: {calcola!r})")

solo_ads_spento = r.calcola_canali_spenti(
    {"disponibile": True}, {"attivo": False}, {"disponibile": True},
)
check(solo_ads_spento == ["pubblicitario"], f"solo pubblicitario spento (ottenuto: {solo_ads_spento!r})")

organico_spento = r.calcola_canali_spenti(
    {"disponibile": False}, {"attivo": True}, {"disponibile": True},
)
check("organico" in organico_spento,
      f"organico spento DEVE comparire (era il bug: non compariva mai) — ottenuto: {organico_spento!r}")

outreach_spento = r.calcola_canali_spenti(
    {"disponibile": True}, {"attivo": True}, {"disponibile": False},
)
check("outreach" in outreach_spento,
      f"outreach spento DEVE comparire (era il bug: non compariva mai) — ottenuto: {outreach_spento!r}")

tutti_spenti = r.calcola_canali_spenti(
    {"disponibile": False}, {"attivo": False}, {"disponibile": False},
)
check(set(tutti_spenti) == {"organico", "pubblicitario", "outreach"},
      f"tutti e tre spenti → tutti e tre in lista (ottenuto: {tutti_spenti!r})")

print("\n=== REGRESSIONE ⑦b: decidi_invio_reale() rispetta la finestra su LIVE ===")

dry, motivo = r.decidi_invio_reale(live=False)
check(dry is True, "LIVE assente → sempre simulazione (comportamento invariato)")

n_fuori = datetime(2026, 8, 3, 3, 0, tzinfo=ZoneInfo("Europe/Rome"))  # le 3 di notte
ok_finestra, _ = finestra.dentro_finestra(n_fuori)
check(not ok_finestra, "fixture di controllo: le 3 di notte sono davvero fuori finestra")

originale = finestra.dentro_finestra
finestra.dentro_finestra = lambda *a, **kw: (False, "fuori finestra (le 3 di notte, simulato)")
r.finestra.dentro_finestra = finestra.dentro_finestra
try:
    dry, motivo = r.decidi_invio_reale(live=True)
    check(dry is True, f"LIVE=1 ma fuori finestra → invio resta in simulazione (era il bug: mandava comunque). dry={dry!r}")
    check(bool(motivo), f"il motivo del blocco è dichiarato: {motivo!r}")
finally:
    finestra.dentro_finestra = originale
    r.finestra.dentro_finestra = originale

finestra.dentro_finestra = lambda *a, **kw: (True, "dentro finestra (simulato)")
r.finestra.dentro_finestra = finestra.dentro_finestra
try:
    dry, motivo = r.decidi_invio_reale(live=True)
    check(dry is False, f"LIVE=1 e dentro finestra → invio reale abilitato. dry={dry!r}")
finally:
    finestra.dentro_finestra = originale
    r.finestra.dentro_finestra = originale

print(f"\n=== RISULTATO: {'TUTTO OK' if problemi == 0 else f'{problemi} problemi'} ===")
raise SystemExit(0 if problemi == 0 else 1)
