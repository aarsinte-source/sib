"""Gate zone esclusive — 🔴 regola politica del cliente, non aggirabile.

"Di regola non gli posso vendere, a meno che la zona non è scoperta."

Un lead-SALONE non riceve mai una risposta inventata:
  - zona COPERTA    → si passa al distributore di quella zona, e glielo si dice
  - zona SCOPERTA   → si può procedere (decisione comunque umana)
  - zona SCONOSCIUTA→ ⛔ STOP + escalation umana. Mai indovinare.

🔴 Stato reale: la mappa zona→distributore NON ESISTE in nessun file. Finché Mauro
non la fornisce, OGNI lead-salone finisce in escalation. Non è un bug: è un input
mancante, e il sistema lo deve mostrare com'è invece di inventare.
"""
import json
from pathlib import Path

from . import config

COVERED, UNCOVERED, UNKNOWN = "covered", "uncovered", "unknown"


def load_map() -> dict:
    p = Path(config.ZONES)
    if not p.exists():
        return {"map_available": False, "zones": {}}
    try:
        d = json.loads(p.read_text())
    except json.JSONDecodeError:
        return {"map_available": False, "zones": {}}
    d.setdefault("map_available", bool(d.get("zones")))
    d.setdefault("zones", {})
    return d


def classify(zone: str | None) -> tuple[str, str | None]:
    """Ritorna (esito, distributore). Senza mappa → sempre UNKNOWN."""
    m = load_map()
    if not m.get("map_available"):
        return UNKNOWN, None
    if not zone:
        return UNKNOWN, None
    entry = m["zones"].get(zone.strip().lower())
    if entry is None:
        return UNKNOWN, None
    if entry in (None, "", "scoperta", "uncovered"):
        return UNCOVERED, None
    return COVERED, entry


def check(prospect) -> tuple[bool, str, str | None]:
    """(può procedere in automatico?, motivo, distributore).

    Vale solo per i SALONI. Distributori e importatori non passano da qui.
    """
    ptype = (prospect["prospect_type"] or "").lower()
    if ptype != "salon":
        return True, "non è un salone — gate zone non applicabile", None

    outcome, distributor = classify(prospect["zone"])
    if outcome == UNKNOWN:
        return False, ("zona sconosciuta o mappa zona→distributore assente: "
                       "STOP + escalation umana, mai indovinare"), None
    if outcome == COVERED:
        return False, (f"zona coperta da «{distributor}»: il lead va passato al "
                       f"distributore di zona, non gestito in automatico"), distributor
    return True, "zona scoperta: si può procedere (con conferma umana)", None
