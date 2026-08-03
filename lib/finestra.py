"""Finestra oraria di invio — 08:00-18:30 Europe/Rome, mai domenica.

Vale per tutto ciò che questo repo manda verso l'esterno: post su Zernio,
email/Telegram del report, notifiche di errore. Non vale per il calcolo
interno (analisi, generazione varianti): quello può girare a qualunque ora,
è la CONSEGNA che deve rispettare l'orario umano.

Usa `zoneinfo` (stdlib da Python 3.9, nessuna dipendenza esterna) invece di un
offset fisso: un offset fisso tipo UTC+2 è sbagliato in inverno (CET=UTC+1) —
lo stesso bug che vive in ~/alkemia-sheis-outreach/sheis_outreach/store.py.
Qui non lo ripetiamo.
"""
from __future__ import annotations

import os
from datetime import datetime
from zoneinfo import ZoneInfo

ROME = ZoneInfo("Europe/Rome")

WINDOW_START_HOUR = 8
WINDOW_END_HOUR, WINDOW_END_MINUTE = 18, 30

# Solo per collaudo manuale: forza l'invio anche fuori finestra/di domenica.
# Non è una variabile che un worker schedulato deve mai avere valorizzata.
ALLOW_OUTSIDE_WINDOW = os.environ.get("SHEIS_ALLOW_OUTSIDE_WINDOW") == "1"


def ora_roma() -> datetime:
    return datetime.now(ROME)


def dentro_finestra(quando: datetime | None = None) -> tuple[bool, str]:
    """(ok, motivo). `motivo` spiega SEMPRE la decisione, anche quando ok=True."""
    n = quando or ora_roma()

    if ALLOW_OUTSIDE_WINDOW:
        return True, f"SHEIS_ALLOW_OUTSIDE_WINDOW=1 — finestra ignorata ({n:%a %H:%M} Europe/Rome)"

    if n.weekday() == 6:  # domenica
        return False, f"oggi è domenica ({n:%d/%m}) — nessun invio, mai"

    ok_ora = (WINDOW_START_HOUR <= n.hour < WINDOW_END_HOUR) or (
        n.hour == WINDOW_END_HOUR and n.minute <= WINDOW_END_MINUTE
    )
    if not ok_ora:
        return False, (
            f"fuori finestra ({n:%H:%M} Europe/Rome) — invii solo "
            f"{WINDOW_START_HOUR:02d}:00-{WINDOW_END_HOUR:02d}:{WINDOW_END_MINUTE:02d}"
        )
    return True, f"finestra OK ({n:%a %H:%M} Europe/Rome)"
