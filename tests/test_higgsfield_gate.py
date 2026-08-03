#!/usr/bin/env python3
"""Test diretti di lib/higgsfield.py: gate di costo e gestione del tetto
giornaliero — senza toccare la rete, senza spendere un credito.

Esegui: python3 tests/test_higgsfield_gate.py
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from lib import higgsfield  # noqa: E402

problemi = 0

print("=== gate di costo ===")
ok, msg = higgsfield.gate_costo(12)  # 12 crediti ≈ €0,396 — sotto soglia default €2,00
print(f"12 crediti (~€{higgsfield.stima_costo(12):.3f}): ok={ok} — {msg}")
if not ok:
    print("✗ atteso ok=True sotto soglia default"); problemi += 1

ok, msg = higgsfield.gate_costo(100)  # 100 crediti ≈ €3,30 — sopra soglia default
print(f"100 crediti (~€{higgsfield.stima_costo(100):.3f}): ok={ok} — {msg}")
if ok:
    print("✗ atteso ok=False sopra soglia default"); problemi += 1

print("\n=== generazione in simulazione (mai rete, mai LIVE) ===")
esito = higgsfield.genera_variante("prompt di prova", crediti_stimati=12, live=False)
print(f"stato={esito.stato} ok={esito.ok} costo=€{esito.costo_eur:.3f} errore={esito.errore!r}")
if esito.stato != "pronta" or not esito.ok:
    print("✗ atteso stato=pronta in simulazione sotto soglia"); problemi += 1

print("\n=== gestione tetto giornaliero (knob SHEIS_SIMULA_TETTO=1) ===")
os.environ["SHEIS_SIMULA_TETTO"] = "1"
esito = higgsfield.genera_variante("prompt di prova", crediti_stimati=12, live=False)
print(f"stato={esito.stato} tetto_raggiunto={esito.tetto_raggiunto} errore={esito.errore!r}")
if not esito.tetto_raggiunto or esito.stato != "errore":
    print("✗ atteso tetto_raggiunto=True e stato=errore"); problemi += 1
del os.environ["SHEIS_SIMULA_TETTO"]

print(f"\n=== RISULTATO: {'TUTTO OK' if problemi == 0 else f'{problemi} problemi'} ===")
raise SystemExit(0 if problemi == 0 else 1)
