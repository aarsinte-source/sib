"""canali.py — come un report o un alert di questo repo raggiunge un essere umano.

Stesso pattern di alkemia/05-automations/centralino-vapi/server/canali.py: due canali
disaccoppiati, nessuna funzione solleva eccezioni verso il chiamante (ritornano
`(ok, dettaglio)`), `dry=True` di default su tutto — un test o un rerun non deve MAI
spedire per sbaglio.

  Email  — canale primario del report settimanale (formato lungo, leggibile da desktop).
  Telegram — rete di sicurezza: se l'email fallisce (SMTP giù, credenziali scadute),
             il Telegram arriva comunque. Indipendente dall'email per costruzione.

Nessuna dipendenza esterna: `smtplib`/`email` per la posta (stdlib), `urllib` per
Telegram — stesso principio "Python puro" del motore outreach.
"""
from __future__ import annotations

import json
import os
import smtplib
import urllib.error
import urllib.request
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path

TIMEOUT = 20


# ---------------------------------------------------------------- credenziali
def _candidati_env() -> list[Path]:
    qui = Path(__file__).resolve().parent.parent
    return [
        Path(os.environ.get("SHEIS_ENV_FILE", "")) if os.environ.get("SHEIS_ENV_FILE") else None,
        qui / ".env",
    ]


def _carica_env() -> None:
    for p in _candidati_env():
        if not p or not p.is_file():
            continue
        for riga in p.read_text(encoding="utf-8").splitlines():
            riga = riga.strip()
            if not riga or riga.startswith("#") or "=" not in riga:
                continue
            k, v = riga.split("=", 1)
            k = k.strip()
            if k not in os.environ:
                os.environ[k] = v.strip().strip('"').strip("'")


def _config_destinatari() -> dict:
    """Destinatari attesi del report, da config/workers.json (non un segreto:
    solo indirizzi/chat-id, come canali_attesi in centralino.json).
    """
    qui = Path(__file__).resolve().parent.parent
    try:
        return json.loads((qui / "config" / "workers.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


# ---------------------------------------------------------------------- email
def email(destinatario: str, oggetto: str, corpo: str, dry: bool = True) -> tuple[bool, str]:
    """Manda un'email via SMTP. Ritorna (ok, dettaglio) — non solleva mai.

    `dry=True` per default: chi chiama senza dire nulla non spedisce a un
    destinatario vero. I worker di produzione passano `dry=LIVE` esplicitamente.
    """
    if not destinatario or "@" not in destinatario:
        return False, f"destinatario non valido: {destinatario!r}"

    if dry:
        return True, f"DRY-RUN → avrei mandato a {destinatario}: «{oggetto}» ({len(corpo)} caratteri)"

    _carica_env()
    host = os.environ.get("SMTP_HOST", "")
    port = int(os.environ.get("SMTP_PORT", "587") or "587")
    utente = os.environ.get("SMTP_USER", "")
    password = os.environ.get("SMTP_PASSWORD", "")
    mittente = os.environ.get("SMTP_FROM", utente)
    if not (host and utente and password):
        return False, "credenziali SMTP assenti (SMTP_HOST/SMTP_USER/SMTP_PASSWORD) — vedi .env.example"

    msg = MIMEMultipart("alternative")
    msg["Subject"] = oggetto
    msg["From"] = mittente
    msg["To"] = destinatario
    msg.attach(MIMEText(corpo, "plain", "utf-8"))

    try:
        with smtplib.SMTP(host, port, timeout=TIMEOUT) as s:
            s.starttls()
            s.login(utente, password)
            s.sendmail(mittente, [destinatario], msg.as_string())
        return True, f"inviato a {destinatario}"
    except smtplib.SMTPAuthenticationError:
        return False, "401/535 SMTP: credenziali non valide"
    except (smtplib.SMTPException, OSError) as e:
        return False, f"SMTP: {type(e).__name__}: {e}"


# ------------------------------------------------------------------- Telegram
def telegram(chat_id: str, testo: str, dry: bool = True) -> tuple[bool, str]:
    """Rete di sicurezza. Indipendente dall'email per costruzione."""
    if not chat_id:
        return False, "chat_id mancante"

    if dry:
        return True, f"DRY-RUN → Telegram a {chat_id}: {testo[:70]}…"

    _carica_env()
    token = os.environ.get("TELEGRAM_BOT_TOKEN", "")
    if not token:
        return False, "TELEGRAM_BOT_TOKEN mancante — vedi .env.example"

    atteso = str(_config_destinatari().get("telegram_bot_id") or "").strip()
    if atteso and token.split(":", 1)[0].strip() != atteso:
        return False, (
            f"MITTENTE SBAGLIATO: bot Telegram {token.split(':', 1)[0]} non è quello "
            f"dichiarato per SHEis ({atteso}). Non invio."
        )

    payload = json.dumps({
        "chat_id": chat_id, "text": testo,
        "disable_web_page_preview": True,
    }).encode("utf-8")
    req = urllib.request.Request(
        f"https://api.telegram.org/bot{token}/sendMessage",
        data=payload, headers={"Content-Type": "application/json"}, method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
            return True, f"inviato (HTTP {r.status})"
    except urllib.error.HTTPError as e:
        return False, f"HTTP {e.code}: {e.read().decode('utf-8', errors='replace')[:160]}"
    except urllib.error.URLError as e:
        return False, f"rete: {e}"


# -------------------------------------------------------------- consegna doppia
def consegna_report(oggetto: str, corpo_email: str, corpo_telegram: str, dry: bool = True) -> dict:
    """Manda il report su ENTRAMBI i canali e riporta l'esito di ciascuno,
    senza far fallire l'uno per colpa dell'altro (`canali.py` insegna: un
    canale che cade non deve mai far cadere l'altro).
    """
    cfg = _config_destinatari()
    esiti = {}

    dest_email = os.environ.get("SHEIS_REPORT_EMAIL") or cfg.get("report_email", "")
    if dest_email:
        ok, dettaglio = email(dest_email, oggetto, corpo_email, dry=dry)
        esiti["email"] = {"ok": ok, "dettaglio": dettaglio, "destinatario": dest_email}
    else:
        esiti["email"] = {"ok": False, "dettaglio": "nessun report_email in config/workers.json", "destinatario": ""}

    chat_id = os.environ.get("SHEIS_REPORT_TELEGRAM_CHAT") or cfg.get("report_telegram_chat", "")
    if chat_id:
        ok, dettaglio = telegram(chat_id, corpo_telegram, dry=dry)
        esiti["telegram"] = {"ok": ok, "dettaglio": dettaglio, "chat_id": chat_id}
    else:
        esiti["telegram"] = {"ok": False, "dettaglio": "nessun report_telegram_chat in config/workers.json", "chat_id": ""}

    return esiti
