"""Client REST minimale per Supabase (PostgREST), stdlib puro — nessun `requests`,
nessun `supabase-py`. Solo `urllib`, come già fa il motore outreach.

Le tabelle `sheis_*` sono definite in ~/alkemia-sheis-backend/migrations/0001 e 0002,
ma **non esistono ancora nel progetto reale** (verificato 2026-08-03: manca il
Personal Access Token per il DDL via Management API — la sola service key legge/scrive
RIGHE via PostgREST ma non crea tabelle). Ogni worker DEVE partire lo stesso e
DICHIARARE questo stato invece di andare in crash con un errore tecnico: è il compito
di `schema_pronto()` qui sotto.
"""
from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from pathlib import Path

TIMEOUT = 30

# Tabelle che i worker di questo repo si aspettano di trovare (0001 + 0002).
TABELLE_ATTESE = [
    "sheis_utenti", "sheis_contenuti", "sheis_varianti", "sheis_pubblicazioni",
    "sheis_candidati", "sheis_campagne", "sheis_articoli", "sheis_report",
    "sheis_approvazioni_log", "sheis_distributori", "sheis_catalogo",
]


def _candidati_env() -> list[Path]:
    """.env di QUESTO repo prima di tutto; poi (stesso cliente, stesso progetto
    Supabase) il .env di alkemia-sheis-backend, che possiede lo schema. Non si
    risale a nient'altro: è lo stesso pattern-lezione di canali.py — solo file
    che appartengono allo STESSO cliente/progetto, mai a un altro.
    """
    qui = Path(__file__).resolve().parent.parent
    return [
        Path(os.environ.get("SHEIS_ENV_FILE", "")) if os.environ.get("SHEIS_ENV_FILE") else None,
        qui / ".env",
        Path(os.environ.get("SHEIS_BACKEND_ENV", str(Path.home() / "alkemia-sheis-backend" / ".env"))),
    ]


def _carica_env() -> None:
    if os.environ.get("SUPABASE_URL") and os.environ.get("SUPABASE_SECRET_KEY"):
        return
    for p in _candidati_env():
        if not p or not p.is_file():
            continue
        for riga in p.read_text(encoding="utf-8").splitlines():
            riga = riga.strip()
            if not riga or riga.startswith("#") or "=" not in riga:
                continue
            k, v = riga.split("=", 1)
            k = k.strip()
            if k in ("SUPABASE_URL", "SUPABASE_SECRET_KEY", "SUPABASE_PROJECT_REF") and k not in os.environ:
                os.environ[k] = v.strip().strip('"').strip("'")
        if os.environ.get("SUPABASE_URL") and os.environ.get("SUPABASE_SECRET_KEY"):
            return


@dataclass
class Esito:
    ok: bool
    dati: list | dict = field(default_factory=list)
    errore: str = ""
    schema_mancante: bool = False


class SupabaseClient:
    def __init__(self) -> None:
        _carica_env()
        self.url = (os.environ.get("SUPABASE_URL") or "").rstrip("/")
        self.chiave = os.environ.get("SUPABASE_SECRET_KEY") or ""
        self.credenziali_presenti = bool(self.url and self.chiave)

    # ------------------------------------------------------------ richiesta grezza
    def _req(self, method: str, path: str, body: dict | list | None = None,
              extra_headers: dict | None = None) -> Esito:
        if not self.credenziali_presenti:
            return Esito(ok=False, errore="SUPABASE_URL/SUPABASE_SECRET_KEY assenti — vedi .env.example")

        headers = {
            "apikey": self.chiave,
            "Authorization": f"Bearer {self.chiave}",
            "Content-Type": "application/json",
        }
        headers.update(extra_headers or {})
        data = json.dumps(body).encode("utf-8") if body is not None else None
        req = urllib.request.Request(f"{self.url}{path}", data=data, headers=headers, method=method)
        try:
            with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
                grezzo = r.read().decode("utf-8")
                return Esito(ok=True, dati=json.loads(grezzo) if grezzo else [])
        except urllib.error.HTTPError as e:
            corpo = e.read().decode("utf-8", errors="replace")
            schema_mancante = e.code in (400, 404) and (
                "PGRST205" in corpo or "does not exist" in corpo or "relation" in corpo.lower()
            )
            return Esito(ok=False, errore=f"HTTP {e.code}: {corpo[:300]}", schema_mancante=schema_mancante)
        except urllib.error.URLError as e:
            return Esito(ok=False, errore=f"rete: {e}")
        except Exception as e:  # json malformato, timeout residuo, ecc.
            return Esito(ok=False, errore=f"{type(e).__name__}: {e}")

    # ------------------------------------------------------------------- CRUD
    def select(self, tabella: str, query: str = "select=*", limit: int | None = None) -> Esito:
        qs = query
        if limit is not None:
            qs += f"&limit={limit}"
        return self._req("GET", f"/rest/v1/{tabella}?{qs}")

    def insert(self, tabella: str, righe: list[dict] | dict) -> Esito:
        return self._req("POST", f"/rest/v1/{tabella}", body=righe,
                          extra_headers={"Prefer": "return=representation"})

    def upsert(self, tabella: str, righe: list[dict] | dict, conflitto: str) -> Esito:
        return self._req("POST", f"/rest/v1/{tabella}?on_conflict={conflitto}", body=righe,
                          extra_headers={"Prefer": "return=representation,resolution=merge-duplicates"})

    def update(self, tabella: str, filtro: str, patch: dict) -> Esito:
        return self._req("PATCH", f"/rest/v1/{tabella}?{filtro}", body=patch,
                          extra_headers={"Prefer": "return=representation"})

    # ------------------------------------------------------ stato dello schema
    def tabella_esiste(self, tabella: str) -> bool:
        esito = self.select(tabella, query="select=id", limit=0)
        return esito.ok

    def schema_pronto(self, tabelle: list[str] | None = None) -> tuple[bool, str]:
        """(pronto, messaggio in italiano). Non solleva mai: un DB non ancora
        inizializzato è uno STATO da dichiarare, non un errore tecnico da esporre.
        """
        if not self.credenziali_presenti:
            return False, (
                "database non ancora inizializzato: mancano SUPABASE_URL/SUPABASE_SECRET_KEY "
                "(vedi .env.example — copiali da ~/alkemia-sheis-backend/.env)"
            )
        attese = tabelle or TABELLE_ATTESE
        mancanti = [t for t in attese if not self.tabella_esiste(t)]
        if mancanti:
            return False, (
                "database non ancora inizializzato: mancano le tabelle "
                f"{', '.join(mancanti)} (le migrazioni 0001/0002 non sono state applicate — "
                "serve un Personal Access Token Supabase per il DDL, vedi "
                "~/alkemia-sheis-backend/applica_migrazioni.py)"
            )
        return True, f"schema pronto — {len(attese)} tabelle verificate"
