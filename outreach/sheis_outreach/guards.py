"""Guardrail runtime: finestra oraria, warm-up account, volume per run."""
from datetime import datetime, date, timedelta

from . import config
from .store import ROME


def within_window() -> tuple[bool, str]:
    n = datetime.now(ROME)
    if n.weekday() == 6 and not config.ALLOW_TODAY:
        return False, f"oggi è domenica ({n:%d/%m}) — nessun invio"
    ok_h = (config.WINDOW_START <= n.hour < config.WINDOW_END[0]) or (
        n.hour == config.WINDOW_END[0] and n.minute <= config.WINDOW_END[1])
    if not ok_h:
        return False, (f"fuori finestra ({n:%H:%M}) — invii solo "
                       f"{config.WINDOW_START:02d}:00-"
                       f"{config.WINDOW_END[0]:02d}:{config.WINDOW_END[1]:02d} Europe/Rome")
    return True, f"finestra OK ({n:%H:%M} Europe/Rome)"


def warmup_status() -> tuple[bool, str, int]:
    """(warm-up completato?, messaggio, giorni trascorsi).

    Un account LinkedIn/IG nuovo che parte a volume viene limitato o sospeso.
    10-14 giorni di attività leggera non sono un ritardo di sviluppo: sono un
    vincolo di piattaforma.
    """
    if not config.ACCOUNT_START:
        return False, ("SHEIS_ACCOUNT_START non impostata: data di pairing dell'account "
                       "sconosciuta → si assume account NUOVO, warm-up non completato"), 0
    try:
        start = date.fromisoformat(config.ACCOUNT_START)
    except ValueError:
        return False, f"SHEIS_ACCOUNT_START='{config.ACCOUNT_START}' non è una data ISO", 0
    days = (date.today() - start).days
    if days < config.WARMUP_DAYS:
        return False, (f"account in warm-up: {days}/{config.WARMUP_DAYS} giorni "
                       f"— tenere MAX_PER_RUN basso"), days
    return True, f"warm-up completato ({days} giorni dal pairing)", days


def max_per_run() -> tuple[int, str]:
    """Durante il warm-up il volume è forzato basso, qualunque cosa dica l'env."""
    done, _, days = warmup_status()
    cap = config.MAX_PER_RUN
    if not done:
        warm_cap = 3 if days < 7 else 5
        if cap > warm_cap:
            return warm_cap, f"MAX_PER_RUN ridotto a {warm_cap} (warm-up giorno {days})"
    return cap, f"MAX_PER_RUN={cap}"


def cooldown_ok(last_touch_at: str | None, touch: str) -> tuple[bool, str]:
    """Distanza minima fra un tocco e il successivo."""
    days = config.COOLDOWN_DAYS.get(touch, 3)
    if not last_touch_at or days == 0:
        return True, ""
    try:
        last = datetime.strptime(last_touch_at[:10], "%Y-%m-%d").date()
    except ValueError:
        return True, ""
    elapsed = (datetime.now(ROME).date() - last).days
    if elapsed < days:
        return False, f"cooldown: {elapsed}/{days} giorni dal tocco precedente"
    return True, ""
