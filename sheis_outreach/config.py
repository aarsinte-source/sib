"""Configurazione centrale — SHEis Outreacher operativo.

Tutto ciò che cambia quando si passa dagli account di Andrei a quelli del cliente
vive QUI (o nel .env locale). Nessun account_id hardcoded nella logica.
"""
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
DB_PATH = Path(os.environ.get("SHEIS_DB", DATA / "outreach.db"))

# --- Fonti di verità del contenuto -------------------------------------------
SCALERS = Path(os.environ.get(
    "SCALERS_ROOT",
    Path.home() / "Desktop" / "ALKEMIA - AGENCY" / "scalers-plus",
))
PLAYBOOK = Path(os.environ.get(
    "SHEIS_PLAYBOOK",
    SCALERS / "clienti" / "sheis-beauty-aiconsult" / "copy"
    / "OUTREACH-CONVERSAZIONI_linkedin-instagram_2026-07-20.md",
))
# Lezioni imparate da Mauro nella demo conversazionale. Se esiste, sovrascrive il copione.
VOICE_LEARNED = Path(os.environ.get(
    "SHEIS_VOICE_LEARNED",
    Path.home() / "alkemia-sheis-outreach-demo" / "data" / "VOICE-LEARNED.md",
))
ZONES = Path(os.environ.get("SHEIS_ZONES", DATA / "zones.json"))

# --- Credenziali Unipile ------------------------------------------------------
# Oggi: account personali di Andrei. Domani: account "SHEis partners" del cliente.
# Cambiare = cambiare queste variabili, non il codice.
ENV_FILE = Path(os.environ.get(
    "SHEIS_ENV_FILE",
    SCALERS / "alkemia" / "05-automations" / "wa-assistant" / ".env",
))


def load_env() -> dict:
    d = {}
    if ENV_FILE.exists():
        for line in ENV_FILE.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                d[k.strip()] = v.strip()
    d.update({k: v for k, v in os.environ.items() if k.startswith("UNIPILE_")})
    return d


# Mappa canale -> account Unipile. Override via env: SHEIS_ACCOUNT_LINKEDIN, ...
ACCOUNTS = {
    "linkedin": os.environ.get("SHEIS_ACCOUNT_LINKEDIN", "7DNaKyuUQnq7rFmlF6TP8w"),
    "instagram": os.environ.get("SHEIS_ACCOUNT_INSTAGRAM", ""),   # da pairare
    "whatsapp": os.environ.get("SHEIS_ACCOUNT_WHATSAPP", "lmfSM9L3Qt-DpN8mvsbFjQ"),
    "email": os.environ.get("SHEIS_ACCOUNT_EMAIL", ""),
}

# --- Guardrail runtime --------------------------------------------------------
LIVE = os.environ.get("LIVE") == "1"          # DRY_RUN è il default, sempre
MAX_PER_RUN = int(os.environ.get("MAX_PER_RUN", "3"))
SLEEP_BETWEEN = int(os.environ.get("SLEEP_BETWEEN", "25"))
ALLOW_TODAY = os.environ.get("ALLOW_TODAY") == "1"
WINDOW_START, WINDOW_END = 8, (18, 30)         # 08:00-18:30 Europe/Rome
WARMUP_DAYS = int(os.environ.get("SHEIS_WARMUP_DAYS", "14"))
ACCOUNT_START = os.environ.get("SHEIS_ACCOUNT_START", "")  # YYYY-MM-DD pairing account
COOLDOWN_DAYS = {"touch1": 0, "touch2": 3, "touch3": 5, "touch4": 7}

# --- Claude headless ----------------------------------------------------------
CLAUDE_BIN = os.environ.get("CLAUDE_BIN", str(Path.home() / ".local/bin/claude"))
CLAUDE_MODEL = os.environ.get("CLAUDE_MODEL", "sonnet")
CLAUDE_TIMEOUT = int(os.environ.get("CLAUDE_TIMEOUT", "180"))

CHANNELS = ("linkedin", "instagram", "email", "whatsapp")
SENDABLE = ("linkedin", "instagram")   # gli unici con sender implementato
LANGS = ("it", "en", "es")
