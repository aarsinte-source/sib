"""Client REST minimale per Zernio (zernio.com/api/v1), stdlib puro — urllib,
nessun `requests`. Copia indipendente del pattern già collaudato in
scalers-plus/tools/zernio_post.py (letto per riferimento, non importato: questo
repo vive da solo e non scrive negli altri).

⚠️ Fatto misurato 2026-08-03: la chiave Zernio oggi vede **esattamente 2
account, entrambi Alkemia** (facebook `alkemia.marketing`, instagram
`andrei_arsinte` / display "Andrei Arsinte | Sistemi AI per acquisire
clienti"). Nessun account SHEis. `publisher_zernio.py` verifica questa lista
ad ogni run — non si fida di questo commento, che potrebbe invecchiare.
"""
from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from pathlib import Path

API_BASE_DEFAULT = "https://zernio.com/api/v1"
TIMEOUT = 30


def _candidati_env() -> list[Path]:
    qui = Path(__file__).resolve().parent.parent
    return [
        Path(os.environ.get("SHEIS_ENV_FILE", "")) if os.environ.get("SHEIS_ENV_FILE") else None,
        qui / ".env",
    ]


def _carica_chiave() -> str:
    chiave = os.environ.get("ZERNIO_API_KEY", "").strip().strip('"').strip("'")
    if chiave:
        return chiave
    for p in _candidati_env():
        if not p or not p.is_file():
            continue
        for riga in p.read_text(encoding="utf-8").splitlines():
            riga = riga.strip()
            if riga.startswith("ZERNIO_API_KEY="):
                return riga.split("=", 1)[1].strip().strip('"').strip("'")
    return ""


@dataclass
class Esito:
    ok: bool
    status: int = 0
    dati: list | dict = field(default_factory=dict)
    errore: str = ""
    # True quando NON sappiamo se la richiesta è arrivata a Zernio: timeout o
    # errore di rete DOPO l'invio. In quel caso il post potrebbe essere
    # partito lo stesso — un retry automatico rischia un doppio post reale.
    # False = fallimento HTTP netto (4xx/5xx): la richiesta È arrivata ed È
    # stata rifiutata, quindi NON è stata pubblicata — sicuro da ritentare.
    ambiguo: bool = False


class ZernioClient:
    def __init__(self) -> None:
        self.base = os.environ.get("ZERNIO_API_BASE", API_BASE_DEFAULT).rstrip("/")
        self.chiave = _carica_chiave()
        self.credenziali_presenti = bool(self.chiave)

    def _req(self, method: str, path: str, body: dict | None = None) -> Esito:
        if not self.credenziali_presenti:
            return Esito(ok=False, errore="ZERNIO_API_KEY assente — vedi .env.example")
        headers = {
            "Authorization": f"Bearer {self.chiave}",
            "Content-Type": "application/json",
            "accept": "application/json",
        }
        data = json.dumps(body).encode("utf-8") if body is not None else None
        req = urllib.request.Request(f"{self.base}{path}", data=data, headers=headers, method=method)
        try:
            with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
                grezzo = r.read().decode("utf-8")
                return Esito(ok=True, status=r.status, dati=json.loads(grezzo) if grezzo else {})
        except urllib.error.HTTPError as e:
            # La richiesta È arrivata al server ed È stata rifiutata (4xx/5xx
            # con risposta): non ambiguo, non pubblicato, sicuro da ritentare.
            return Esito(ok=False, status=e.code, errore=e.read().decode("utf-8", errors="replace")[:400])
        except urllib.error.URLError as e:
            # Copre anche il timeout (che in urllib arriva come URLError con
            # un socket.timeout/TimeoutError come reason): non sappiamo se il
            # server ha ricevuto ed elaborato la richiesta PRIMA che la
            # risposta si perdesse. Ambiguo per costruzione.
            return Esito(ok=False, errore=f"rete: {e}", ambiguo=True)
        except (ValueError, OSError) as e:
            return Esito(ok=False, errore=f"{type(e).__name__}: {e}", ambiguo=True)

    def accounts(self) -> Esito:
        return self._req("GET", "/accounts")

    def crea_post(self, contenuto: str, piattaforme: list[str], media_url: list[str] | None = None,
                  schedula_per: str | None = None) -> Esito:
        payload: dict = {"content": contenuto, "platforms": piattaforme}
        if media_url:
            payload["mediaUrls"] = media_url
        if schedula_per:
            payload["scheduledFor"] = schedula_per
        else:
            payload["publishNow"] = True
        return self._req("POST", "/posts", body=payload)


def account_per_brand(esito_accounts: Esito) -> list[dict]:
    """Normalizza la lista account in una forma piatta: zernio_account_id
    (l'`_id` interno di Zernio — SEMPRE presente, stabile, la chiave più
    affidabile), platform, username, display_name.

    ⚠️ Fatto verificato dal vivo il 2026-08-03: la forma dei metadata NON è la
    stessa fra piattaforme. Facebook espone `selectedPageUsername`/
    `userProfile`; Instagram invece NON ha questi campi — la sua identità vive
    sotto `metadata.profileData.username` (verificato sull'account reale
    andrei_arsinte: `selectedPageUsername` e `userProfile` erano entrambi
    `None`, `profileData.username` era `"andrei_arsinte"`). Una versione
    precedente di questa funzione cercava solo la forma Facebook e su
    Instagram tornava sempre `username=None` — il gate a valle non aveva
    nulla da confrontare e degradava silenziosamente a un controllo di sola
    piattaforma. Qui si cercano ENTRAMBE le forme.
    """
    if not esito_accounts.ok:
        return []
    dati = esito_accounts.dati
    grezzi = dati.get("accounts") if isinstance(dati, dict) else dati
    out = []
    for a in grezzi or []:
        md = a.get("metadata", {}) or {}
        profile_data = md.get("profileData") or {}
        username = (
            md.get("selectedPageUsername")
            or profile_data.get("username")
            or (md.get("userProfile") or {}).get("username")
            or md.get("username")
        )
        out.append({
            "zernio_account_id": a.get("_id"),
            "platform": a.get("platform"),
            "username": username,
            "display_name": a.get("displayName"),
            "enabled": a.get("enabled"),
        })
    return out
