#!/usr/bin/env python3
"""Test diretti di report_settimanale.py — REGRESSIONE del difetto ②
segnalato dal collegio di revisione (2026-08-03): sezione_outreach() apriva
il DB in modo protetto ma le query dentro erano in un try/finally SENZA
except. Con un outreach.db che ha 'prospects' ma non ancora 'sends' (schema
incompleto — plausibile dato lo stato reale del progetto), l'eccezione
risaliva fuori dalla funzione, fuori da main(), non catturata da nessuno:
l'INTERO report moriva, comprese le sezioni organico/pubblicitario già
calcolate.

Copre anche il guscio _sicuro() in main(): un'eccezione imprevista in UNA
sezione non deve mai far perdere le altre due.

Esegui: python3 tests/test_report_resilience.py
"""
from __future__ import annotations

import sqlite3
import sys
import tempfile
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import report_settimanale as r  # noqa: E402

problemi = 0


def check(cond: bool, descrizione: str) -> None:
    global problemi
    if cond:
        print(f"✓ {descrizione}")
    else:
        print(f"✗ FALLITO: {descrizione}")
        problemi += 1


print("=== REGRESSIONE ②: outreach.db con schema incompleto (manca 'sends') ===")
with tempfile.TemporaryDirectory() as tmp:
    db_incompleto = Path(tmp) / "outreach_incompleto.db"
    con = sqlite3.connect(db_incompleto)
    con.execute("CREATE TABLE prospects (id TEXT PRIMARY KEY, name TEXT)")
    con.execute("INSERT INTO prospects VALUES ('p1', 'Prospect Uno')")
    con.commit()
    con.close()

    originale = r.OUTREACH_DB
    r.OUTREACH_DB = db_incompleto
    try:
        risultato = r.sezione_outreach(date(2026, 7, 27), date(2026, 8, 2))
        check(isinstance(risultato, dict), "sezione_outreach() ritorna un dict, non solleva")
        check(risultato.get("disponibile") is False, "disponibile=False dichiarato, non un crash")
        check("motivo" in risultato and risultato["motivo"], f"motivo presente: {risultato.get('motivo')!r}")
    except Exception as e:  # se il bug NON è corretto, arriviamo qui
        check(False, f"sezione_outreach() ha sollevato invece di dichiarare: {type(e).__name__}: {e}")
    finally:
        r.OUTREACH_DB = originale

print("\n=== guscio _sicuro(): un'eccezione imprevista non propaga ===")
def sezione_che_esplode(*args):
    raise RuntimeError("errore imprevisto simulato, non uno sqlite3.OperationalError")

risultato = r._sicuro("test-esplosione", sezione_che_esplode)
check(isinstance(risultato, dict), "_sicuro() ritorna sempre un dict")
check(risultato.get("disponibile") is False, "sezione fallita → disponibile=False")
check("affinita" in risultato and "attivo" in risultato and "pubblicati" in risultato,
      "il fallback contiene TUTTE le chiavi lette dai render (organico/pubblicitario/outreach)")

print("\n=== render_markdown non solleva con un fallback di _sicuro() ===")
fallback_organico = r._sicuro("organico", sezione_che_esplode)
fallback_pubbl = r._sicuro("pubblicitario", sezione_che_esplode)
fallback_outreach = r._sicuro("outreach", sezione_che_esplode)
try:
    corpo = r.render_markdown(date(2026, 7, 27), date(2026, 8, 2), fallback_organico, fallback_pubbl, fallback_outreach)
    check(bool(corpo), "render_markdown produce comunque un report leggibile con 3 sezioni fallite")
except Exception as e:
    check(False, f"render_markdown è andato in crash sui fallback: {type(e).__name__}: {e}")

print(f"\n=== RISULTATO: {'TUTTO OK' if problemi == 0 else f'{problemi} problemi'} ===")
raise SystemExit(0 if problemi == 0 else 1)
