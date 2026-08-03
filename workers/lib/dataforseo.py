"""Client minimale DataForSEO (keyword search volume), stdlib puro — urllib +
Basic Auth, nessuna dipendenza pesante. Usato solo da `analisi_mensile.py`.

Ogni chiamata è a pagamento sull'account DataForSEO: stessa regola di
scrapecreators.py — mai chiamata senza `LIVE=1` esplicito.
"""
from __future__ import annotations

import base64
import json
import os
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from pathlib import Path

API_BASE = "https://api.dataforseo.com/v3"
TIMEOUT = 30


def _candidati_env() -> list[Path]:
    qui = Path(__file__).resolve().parent.parent
    return [
        Path(os.environ.get("SHEIS_ENV_FILE", "")) if os.environ.get("SHEIS_ENV_FILE") else None,
        qui / ".env",
    ]


def _carica(chiave: str) -> str:
    v = os.environ.get(chiave, "").strip()
    if v:
        return v
    for p in _candidati_env():
        if not p or not p.is_file():
            continue
        for riga in p.read_text(encoding="utf-8").splitlines():
            if riga.strip().startswith(f"{chiave}="):
                return riga.strip().split("=", 1)[1].strip().strip('"').strip("'")
    return ""


@dataclass
class Esito:
    ok: bool
    dati: dict = field(default_factory=dict)
    errore: str = ""


class DataForSEOClient:
    def __init__(self) -> None:
        self.login = _carica("DATAFORSEO_LOGIN")
        self.password = _carica("DATAFORSEO_PASSWORD")
        self.credenziali_presenti = bool(self.login and self.password)

    def _auth_header(self) -> str:
        token = base64.b64encode(f"{self.login}:{self.password}".encode()).decode()
        return f"Basic {token}"

    def volume_ricerca(self, keywords: list[str], location_code: int, language_code: str) -> Esito:
        if not self.credenziali_presenti:
            return Esito(ok=False, errore="DATAFORSEO_LOGIN/PASSWORD assenti — vedi .env.example")
        payload = [{
            "keywords": keywords,
            "location_code": location_code,
            "language_code": language_code,
        }]
        req = urllib.request.Request(
            f"{API_BASE}/keywords_data/google_ads/search_volume/live",
            data=json.dumps(payload).encode("utf-8"),
            headers={"Authorization": self._auth_header(), "Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
                return Esito(ok=True, dati=json.loads(r.read().decode("utf-8")))
        except urllib.error.HTTPError as e:
            return Esito(ok=False, errore=f"HTTP {e.code}: {e.read().decode('utf-8', errors='replace')[:300]}")
        except urllib.error.URLError as e:
            return Esito(ok=False, errore=f"rete: {e}")
        except (ValueError, OSError) as e:
            return Esito(ok=False, errore=f"{type(e).__name__}: {e}")


# Location code Google Ads: Italia=2380, Spagna=2724 (valori pubblici DataForSEO).
LOCATION_ITALIA = 2380
LOCATION_SPAGNA = 2724
