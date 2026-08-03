"""Client Unipile — LinkedIn (forkato e funzionante) + Instagram (nuovo).

Stesso pattern REST del client WhatsApp in wa-assistant/lib/unipile_client.py:
header X-API-KEY, base https://{DSN}/api/v1/.

LinkedIn:  POST /users/invite          (invito + nota <=300)
           POST /chats  multipart      (crea chat + primo messaggio, solo ai 1° grado)
Instagram: POST /chats  multipart      (DM diretto, non serve "accettazione")
           l'attendee è il provider_id restituito da GET /users/{username}?account_id=...
"""
import json
import urllib.error
import urllib.parse
import urllib.request
import uuid

from . import config


class UnipileError(RuntimeError):
    def __init__(self, status, body):
        self.status, self.body = status, body
        super().__init__(f"HTTP {status}: {body[:300]}")


def _creds():
    env = config.load_env()
    dsn, key = env.get("UNIPILE_DSN"), env.get("UNIPILE_API_KEY")
    if not dsn or not key:
        raise UnipileError(0, f"UNIPILE_DSN/UNIPILE_API_KEY assenti in {config.ENV_FILE}")
    return dsn, key


def get(path: str, timeout=45):
    dsn, key = _creds()
    req = urllib.request.Request(
        f"https://{dsn}/api/v1/{path}",
        headers={"X-API-KEY": key, "accept": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        raise UnipileError(e.code, e.read().decode()) from None


def post_json(path: str, body: dict, timeout=45):
    dsn, key = _creds()
    req = urllib.request.Request(
        f"https://{dsn}/api/v1/{path}",
        data=json.dumps(body).encode(),
        headers={"X-API-KEY": key, "accept": "application/json",
                 "content-type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        raise UnipileError(e.code, e.read().decode()) from None


def post_multipart(path: str, fields: dict, timeout=60):
    dsn, key = _creds()
    boundary = "----alkemia" + uuid.uuid4().hex
    nl, buf = b"\r\n", bytearray()
    for k, v in fields.items():
        buf += b"--" + boundary.encode() + nl
        buf += f'Content-Disposition: form-data; name="{k}"'.encode() + nl + nl
        buf += str(v).encode() + nl
    buf += b"--" + boundary.encode() + b"--" + nl
    req = urllib.request.Request(
        f"https://{dsn}/api/v1/{path}", data=bytes(buf),
        headers={"X-API-KEY": key, "accept": "application/json",
                 "content-type": f"multipart/form-data; boundary={boundary}"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        raise UnipileError(e.code, e.read().decode()) from None


# --- Account ------------------------------------------------------------------
def list_accounts():
    return get("accounts").get("items", [])


def account_for(channel: str) -> str:
    acc = config.ACCOUNTS.get(channel)
    if not acc:
        raise UnipileError(0, f"nessun account Unipile configurato per '{channel}' "
                              f"(imposta SHEIS_ACCOUNT_{channel.upper()})")
    return acc


def resolve_provider_id(channel: str, identifier: str) -> str:
    """public_id LinkedIn o username Instagram -> provider_id interno Unipile."""
    acc = account_for(channel)
    ident = urllib.parse.quote(str(identifier).lstrip("@"), safe="")
    p = get(f"users/{ident}?account_id={acc}")
    pid = p.get("provider_id") or p.get("member_id") or p.get("id")
    if not pid:
        raise UnipileError(0, f"provider_id non risolto per {identifier} su {channel}")
    return pid


# --- Sender LinkedIn ----------------------------------------------------------
def linkedin_invite(public_id: str, note: str | None = None):
    acc = account_for("linkedin")
    body = {"account_id": acc, "provider_id": resolve_provider_id("linkedin", public_id)}
    if note:
        if len(note) > 300:
            raise UnipileError(0, f"nota {len(note)} car. > 300 (limite LinkedIn)")
        body["message"] = note
    return post_json("users/invite", body)


def linkedin_message(public_id: str, text: str):
    acc = account_for("linkedin")
    prov = resolve_provider_id("linkedin", public_id)
    return post_multipart("chats", {"account_id": acc, "attendees_ids": prov, "text": text})


def linkedin_relations(limit=100):
    """Chi è diventato 1° grado = chi ha accettato l'invito."""
    acc = account_for("linkedin")
    out, cursor = set(), None
    for _ in range(20):
        q = f"users/relations?account_id={acc}&limit={limit}" + (f"&cursor={cursor}" if cursor else "")
        rel = get(q)
        for it in rel.get("items", []):
            for k in ("public_identifier", "member_id", "id", "provider_id"):
                if it.get(k):
                    out.add(str(it[k]))
        cursor = rel.get("cursor")
        if not cursor:
            break
    return out


# --- Sender Instagram (NUOVO) -------------------------------------------------
def instagram_dm(username: str, text: str):
    """DM Instagram. Su IG non esiste 'accettazione': il primo messaggio finisce
    nelle richieste del destinatario finché non risponde."""
    acc = account_for("instagram")
    prov = resolve_provider_id("instagram", username)
    return post_multipart("chats", {"account_id": acc, "attendees_ids": prov, "text": text})


def send(channel: str, touch: str, target: str, text: str):
    """Dispatch unico. Ritorna la risposta grezza di Unipile."""
    if channel == "linkedin":
        return linkedin_invite(target, text) if touch == "touch1" else linkedin_message(target, text)
    if channel == "instagram":
        return instagram_dm(target, text)
    raise UnipileError(0, f"canale '{channel}' senza sender implementato")


# --- Rilevamento risposte (STOP alla prima risposta) --------------------------
def chats_with_replies(channel: str, limit=100):
    """Ritorna i provider_id degli attendee che hanno scritto a noi."""
    acc = account_for(channel)
    replied = set()
    data = get(f"chats?account_id={acc}&limit={limit}")
    for chat in data.get("items", []):
        cid = chat.get("id")
        if not cid:
            continue
        try:
            msgs = get(f"chats/{cid}/messages?limit=20").get("items", [])
        except UnipileError:
            continue
        for m in msgs:
            if not m.get("is_sender"):          # messaggio in ENTRATA
                for a in chat.get("attendees", []) or []:
                    if a.get("provider_id"):
                        replied.add(str(a["provider_id"]))
                break
    return replied
