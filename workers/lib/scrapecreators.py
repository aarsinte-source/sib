"""Client minimale ScrapeCreators (Instagram), stdlib puro — urllib, nessuna
dipendenza pesante. Usato da `analisi_mensile.py` e `ingest_metriche_ig.py`.

Ogni chiamata consuma credito reale sull'account ScrapeCreators: per questo,
come per Higgsfield, il worker non chiama MAI questa API a meno di `LIVE=1`
esplicito — di default stampa cosa interrogherebbe. `self.chiamate_fatte`
conta OGNI chiamata HTTP reale (mai quelle simulate): chi orchestra deve
poter dire quante ne ha fatte, i crediti non sono gratis.

⚠️ Le risposte sono enormi (profilo ~200KB, posts/reels anche più) e vanno
SEMPRE processate in uno script — mai lette per intero da un umano o da un
agente. Questo client non le stampa mai: le ritorna come dict Python, pronte
per essere filtrate PRIMA di finire in un log o in una conversazione.

Endpoint verificati LIVE il 2026-08-03 contro @sheisbeautyhair (fonte:
scalers-plus/.claude/skills/instagram-{profile,posts,reels}/scripts/*.py +
memoria di progetto sui bug di parametro, già corretti — non replicati qui):
  - GET /v1/instagram/profile?handle=…            → {success, credits_remaining,
    credits_charged, data:{user:{…}}, status}. Il profilo vive sotto data.user,
    NON al livello radice — un'assunzione diversa qui avrebbe fatto fallire il
    parsing su una chiamata già pagata.
  - GET /v2/instagram/user/posts?handle=…&count=…&next_max_id=…  → {items:[…],
    more_available, next_max_id}. Pagina con cursore (v1 è morto, v2 confermato).
  - GET /v1/instagram/user/reels?handle=…&count=… → {items:[…]}. NIENTE
    cursore: max ~30 per chiamata, non enumerabile oltre la prima pagina.
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
        # Chiave Alkemia condivisa (non un segreto di UN cliente): stessa
        # sottoscrizione ScrapeCreators usata da tutto lo stack scalers-plus.
        Path(os.environ.get(
            "SHEIS_SCALERS_ENV",
            str(Path.home() / "Desktop" / "ALKEMIA - AGENCY" / "scalers-plus" / ".env"),
        )),
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
    crediti_rimasti: int | None = None


class ScrapeCreatorsClient:
    def __init__(self) -> None:
        self.chiave = _carica_chiave()
        self.credenziali_presenti = bool(self.chiave)
        self.chiamate_fatte = 0  # SOLO chiamate HTTP reali, mai simulate

    def _get(self, path: str, params: dict) -> Esito:
        if not self.credenziali_presenti:
            return Esito(ok=False, errore="SCRAPECREATORS_API_KEY assente — vedi .env.example")
        url = f"{API_BASE}{path}?{urllib.parse.urlencode(params)}"
        req = urllib.request.Request(url, headers={"x-api-key": self.chiave})
        try:
            self.chiamate_fatte += 1
            with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
                dati = json.loads(r.read().decode("utf-8"))
                return Esito(ok=True, dati=dati, crediti_rimasti=dati.get("credits_remaining"))
        except urllib.error.HTTPError as e:
            return Esito(ok=False, errore=f"HTTP {e.code}: {e.read().decode('utf-8', errors='replace')[:300]}")
        except urllib.error.URLError as e:
            return Esito(ok=False, errore=f"rete: {e}")
        except (ValueError, OSError) as e:
            return Esito(ok=False, errore=f"{type(e).__name__}: {e}")

    def profilo_instagram(self, handle: str) -> Esito:
        """Ritorna l'oggetto `user` già estratto da `data.user` — vedi nota
        endpoint in testa al file: il profilo NON vive alla radice."""
        esito = self._get("/v1/instagram/profile", {"handle": handle})
        if not esito.ok:
            return esito
        user = (esito.dati.get("data") or {}).get("user") or {}
        return Esito(ok=True, dati=user, crediti_rimasti=esito.crediti_rimasti)

    def post_instagram(self, handle: str, count: int = 50, cursor: str | None = None) -> Esito:
        params = {"handle": handle, "count": count}
        if cursor:
            params["next_max_id"] = cursor
        return self._get("/v2/instagram/user/posts", params)

    def reel_instagram(self, handle: str, count: int = 30) -> Esito:
        """Nessun cursore disponibile su questo endpoint: max ~30 per chiamata,
        sempre i più recenti. Per la serie storica basta e avanza: ogni run
        successivo aggiunge una nuova rilevazione sugli stessi reel."""
        return self._get("/v1/instagram/user/reels", {"handle": handle, "count": count})
