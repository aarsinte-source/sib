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

print("\n=== generazione in simulazione, SOTTO soglia (mai rete, mai LIVE) ===")
esito = higgsfield.genera_variante("prompt di prova", crediti_stimati=12, live=False)
print(f"stato={esito.stato} ok={esito.ok} costo=€{esito.costo_eur:.3f} errore={esito.errore!r}")
if esito.stato != "pronta" or not esito.ok:
    print("✗ atteso stato=pronta in simulazione sotto soglia"); problemi += 1

print("\n=== REGRESSIONE ⑤: generazione in simulazione, SOPRA soglia ===")
# Difetto segnalato dal collegio di revisione (2026-08-03): qui `ok` era
# fisso a True anche col gate fallito — il chiamante decide su `.ok`, quindi
# un errore veniva riportato come un successo (segno di spunta verde
# accanto alla parola "errore"). Il test precedente copriva solo SOTTO
# soglia, mai sopra: per questo il difetto non era stato visto prima.
esito = higgsfield.genera_variante("prompt di prova", crediti_stimati=100, live=False)  # 100cr ≈ €3,30 > soglia €2,00
print(f"stato={esito.stato} ok={esito.ok} costo=€{esito.costo_eur:.3f} errore={esito.errore!r}")
if esito.stato != "errore" or esito.ok:
    print("✗ atteso stato=errore E ok=False sopra soglia — un gate fallito non può risultare ok=True"); problemi += 1

print("\n=== gestione tetto giornaliero (knob SHEIS_SIMULA_TETTO=1) ===")
os.environ["SHEIS_SIMULA_TETTO"] = "1"
esito = higgsfield.genera_variante("prompt di prova", crediti_stimati=12, live=False)
print(f"stato={esito.stato} tetto_raggiunto={esito.tetto_raggiunto} errore={esito.errore!r}")
if not esito.tetto_raggiunto or esito.stato != "errore":
    print("✗ atteso tetto_raggiunto=True e stato=errore"); problemi += 1
del os.environ["SHEIS_SIMULA_TETTO"]

print(f"\n=== RISULTATO: {'TUTTO OK' if problemi == 0 else f'{problemi} problemi'} ===")


# ── Fallimento ambiguo: il lavoro è stato fatto e pagato, ma l'attesa è caduta
#
# Misurato il 2026-08-03 generando un video UGC vero: il comando è uscito con
# HTTP 502 mentre aspettava l'esito. Il worker ha detto «fallito» — e intanto
# il video era stato prodotto e 22 crediti (€0,73) addebitati. Chi legge
# «fallito» rigenera, e paga due volte la stessa cosa.
#
# L'ATTESA e la GENERAZIONE sono due cose diverse: se cade l'attesa, si va a
# guardare se il lavoro c'è, invece di dichiararlo perso.

def prova_recupero_dopo_attesa_caduta():
    import json as _json
    import subprocess as _sp
    import lib.higgsfield as H

    completato = {
        "job_set_type": "seedance_2_0",
        "status": "completed",
        "result_url": "https://cdn.test/video-gia-pagato.mp4",
        "created_at": __import__("time").time(),
    }

    chiamate = []
    originale = _sp.run

    def finto(argomenti, **kwargs):
        chiamate.append(argomenti)
        class R: pass
        r = R()
        if "list" in argomenti:
            r.returncode, r.stdout, r.stderr = 0, _json.dumps([completato]), ""
        else:
            # la generazione parte, l'attesa cade dopo
            r.returncode, r.stdout, r.stderr = 1, "[]", "Error: Higgsfield API error (HTTP 502)."
        return r

    _sp.run = finto
    try:
        e = H.genera_variante("prova", modello="seedance_2_0", crediti_stimati=22, live=True)
    finally:
        _sp.run = originale

    assert e.ok, "un lavoro completato e pagato non va dichiarato fallito"
    assert e.asset_url == completato["result_url"], f"asset sbagliato: {e.asset_url}"
    assert "già stato completato" in e.errore, "va detto CHIARAMENTE che è stato recuperato, non rigenerato"
    print("✓ attesa caduta ma lavoro completato → recuperato, non dichiarato perso")

    # E non deve recuperare il lavoro di un ALTRO modello: meglio nessun
    # recupero che l'asset sbagliato.
    _sp.run = finto
    try:
        e2 = H.genera_variante("prova", modello="nano_banana_2", crediti_stimati=2, live=True)
    finally:
        _sp.run = originale
    assert not e2.ok, "non deve recuperare il risultato di un modello diverso"
    print("✓ modello diverso → nessun recupero (meglio niente che l'asset sbagliato)")


prova_recupero_dopo_attesa_caduta()


raise SystemExit(0 if problemi == 0 else 1)
