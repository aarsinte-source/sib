"""Client minimale ScrapeCreators (Instagram), stdlib puro — urllib, nessuna
dipendenza pesante. Usato solo da `analisi_mensile.py`.

Ogni chiamata consuma credito reale sull'account ScrapeCreators: per questo,
come per Higgsfield, il worker non chiama MAI questa API a meno di `LIVE=1`
esplicito — di default stampa cosa interrogherebbe.
"""
from __future__ import annotations

import json
import os
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass, field
from pathlib import Path

API_BASE = "https://api.scrapecreators.com"
TIMEOUT = 30


def _candidati_env() -> list[Path]:
    qui = Path(__file__).resolve().parent.parent
    return [
        Path(os.environ.get("SHEIS_ENV_FILE", "")) if os.environ.get("SHEIS_ENV_FILE") else None,
        qui / ".env",
    ]


def _carica_chiave() -> str:
    chiave = os.environ.get("SCRAPECREATORS_API_KEY", "").strip()
    if chiave:
        return chiave
    for p in _candidati_env():
        if not p or not p.is_file():
            continue
        for riga in p.read_text(encoding="utf-8").splitlines():
            if riga.strip().startswith("SCRAPECREATORS_API_KEY="):
                return riga.strip().split("=", 1)[1].strip().strip('"').strip("'")
    return ""


@dataclass
class Esito:
    ok: bool
    dati: dict = field(default_factory=dict)
    errore: str = ""


class ScrapeCreatorsClient:
    def __init__(self) -> None:
        self.chiave = _carica_chiave()
        self.credenziali_presenti = bool(self.chiave)

    def profilo_instagram(self, handle: str) -> Esito:
        if not self.credenziali_presenti:
            return Esito(ok=False, errore="SCRAPECREATORS_API_KEY assente — vedi .env.example")
        url = f"{API_BASE}/v1/instagram/profile?{urllib.parse.urlencode({'handle': handle})}"
        req = urllib.request.Request(url, headers={"x-api-key": self.chiave})
        try:
            with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
                return Esito(ok=True, dati=json.loads(r.read().decode("utf-8")))
        except urllib.error.HTTPError as e:
            return Esito(ok=False, errore=f"HTTP {e.code}: {e.read().decode('utf-8', errors='replace')[:300]}")
        except urllib.error.URLError as e:
            return Esito(ok=False, errore=f"rete: {e}")
        except (ValueError, OSError) as e:
            return Esito(ok=False, errore=f"{type(e).__name__}: {e}")
