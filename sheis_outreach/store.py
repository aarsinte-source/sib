"""Persistenza SQLite. Lo stato è nel DB, non in un dizionario aggiornato a mano.

Idempotenza garantita a livello di schema: UNIQUE(prospect_id, channel, touch) sulla
tabella `sends`. Se il processo muore a metà run, il rerun non ri-invia.
"""
import sqlite3
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from . import config

# ⚠️ Bug corretto in revisione (3/8): un offset fisso timezone(timedelta(hours=2))
# è CEST tutto l'anno, ma l'Italia è CET (+1) da fine ottobre a fine marzo — in
# quella finestra il motore si crede in orario un'ora prima della realtà (crede
# aperta la finestra 08:00-18:30 alle 07:00-17:30 vere). ZoneInfo segue il
# passaggio ora legale/solare da solo. Stesso pattern già in uso in
# ~/alkemia-sheis-workers per lo stesso motivo.
ROME = ZoneInfo("Europe/Rome")

SCHEMA = """
CREATE TABLE IF NOT EXISTS prospects (
    id                 TEXT PRIMARY KEY,
    name               TEXT NOT NULL,
    first_name         TEXT,
    company            TEXT,
    persona            TEXT,           -- estero_importer|it_distributor_competitor|
                                       -- it_distributor_small|instagram_cold|salon
    prospect_type      TEXT,           -- distributor|importer|salon
    lang               TEXT DEFAULT 'it',
    country            TEXT,
    city               TEXT,
    zone               TEXT,
    competitor_brand   TEXT,
    hook               TEXT,           -- aggancio reale; senza, il prospect si salta
    linkedin_public_id TEXT,
    instagram_username TEXT,
    email              TEXT,
    phone              TEXT,
    created_at         TEXT
);

CREATE TABLE IF NOT EXISTS channel_state (
    prospect_id   TEXT NOT NULL,
    channel       TEXT NOT NULL,
    state         TEXT NOT NULL DEFAULT 'new',
    last_touch    TEXT,
    last_touch_at TEXT,
    next_due_at   TEXT,
    reason        TEXT,
    updated_at    TEXT,
    PRIMARY KEY (prospect_id, channel)
);

CREATE TABLE IF NOT EXISTS sends (
    prospect_id TEXT NOT NULL,
    channel     TEXT NOT NULL,
    touch       TEXT NOT NULL,
    body        TEXT,
    lang        TEXT,
    sent_at     TEXT,
    sent_date   TEXT,
    mode        TEXT,      -- DRY_RUN | LIVE
    result      TEXT,
    PRIMARY KEY (prospect_id, channel, touch)
);

CREATE TABLE IF NOT EXISTS drafts (
    prospect_id TEXT NOT NULL,
    channel     TEXT NOT NULL,
    touch       TEXT NOT NULL,
    lang        TEXT NOT NULL,
    body        TEXT,
    lint_ok     INTEGER,
    lint_detail TEXT,
    composed_at TEXT,
    source      TEXT,      -- claude | playbook-fallback
    PRIMARY KEY (prospect_id, channel, touch, lang)
);

CREATE TABLE IF NOT EXISTS events (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    ts          TEXT,
    prospect_id TEXT,
    channel     TEXT,
    kind        TEXT,
    detail      TEXT
);

-- Staging della discovery (discovery.py). Un candidato NON è un prospect: entra
-- qui, e passa a `prospects` solo tramite `promote` (import_prospect_row), mai
-- in automatico.
CREATE TABLE IF NOT EXISTS candidates (
    username         TEXT PRIMARY KEY,      -- handle Instagram, senza @
    full_name        TEXT,
    bio              TEXT,
    followers        INTEGER,
    following        INTEGER,
    posts_count      INTEGER,
    external_url     TEXT,
    business_email   TEXT,
    business_phone   TEXT,
    city             TEXT,
    zone             TEXT,                  -- quasi sempre vuoto: niente mappa zone, niente indovinelli
    country          TEXT,
    lang             TEXT DEFAULT 'it',
    competitor_brand TEXT,                  -- marchio concorrente rilevato in bio (lista validata Mauro)
    tipo             TEXT,                  -- salone|distributore|non-pertinente|incerto
    score            INTEGER,
    motivo_score     TEXT,                  -- spiegazione ispezionabile: perché questo tipo/punteggio
    hook             TEXT,                  -- aggancio REALE o vuoto (mai inventato)
    hook_fonte       TEXT,                  -- da dove viene l'aggancio (bio / post + data)
    scoperto_da      TEXT,                  -- query o fonte che l'ha trovato (search:.../hashtag:.../espansione:...)
    scoperto_il      TEXT,                  -- prima apparizione: non si sposta alle riscoperte
    stato            TEXT DEFAULT 'nuovo',  -- nuovo|promosso|scartato
    motivo_scarto    TEXT,
    updated_at       TEXT
);
"""

# Colonne attese da `prospects` in un import CSV/riga — fonte unica, riusata sia da
# cli.cmd_import (file CSV) sia da discovery.cmd_promote (candidati promossi).
CSV_FIELDS = ["name", "first_name", "company", "persona", "prospect_type", "lang", "country",
              "city", "zone", "competitor_brand", "hook", "linkedin_public_id",
              "instagram_username", "email", "phone"]


def now() -> str:
    return datetime.now(ROME).strftime("%Y-%m-%d %H:%M:%S")


def today() -> str:
    return datetime.now(ROME).strftime("%Y-%m-%d")


def connect(path: Path = None) -> sqlite3.Connection:
    p = Path(path or config.DB_PATH)
    p.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(p)
    con.row_factory = sqlite3.Row
    con.executescript(SCHEMA)
    return con


def event(con, prospect_id, channel, kind, detail=""):
    con.execute(
        "INSERT INTO events (ts, prospect_id, channel, kind, detail) VALUES (?,?,?,?,?)",
        (now(), prospect_id, channel, kind, detail),
    )
    con.commit()


def get_prospect(con, pid):
    return con.execute("SELECT * FROM prospects WHERE id=?", (pid,)).fetchone()


def all_prospects(con):
    return con.execute("SELECT * FROM prospects ORDER BY id").fetchall()


def get_state(con, pid, channel):
    r = con.execute(
        "SELECT * FROM channel_state WHERE prospect_id=? AND channel=?", (pid, channel)
    ).fetchone()
    if r is None:
        con.execute(
            "INSERT INTO channel_state (prospect_id, channel, state, updated_at) VALUES (?,?,?,?)",
            (pid, channel, "new", now()),
        )
        con.commit()
        r = con.execute(
            "SELECT * FROM channel_state WHERE prospect_id=? AND channel=?", (pid, channel)
        ).fetchone()
    return r


def set_state(con, pid, channel, state, *, last_touch=None, next_due_at=None, reason=None):
    get_state(con, pid, channel)
    fields, vals = ["state=?", "updated_at=?"], [state, now()]
    if last_touch:
        fields += ["last_touch=?", "last_touch_at=?"]
        vals += [last_touch, now()]
    if next_due_at is not None:
        fields.append("next_due_at=?")
        vals.append(next_due_at)
    if reason is not None:
        fields.append("reason=?")
        vals.append(reason)
    vals += [pid, channel]
    con.execute(
        f"UPDATE channel_state SET {', '.join(fields)} WHERE prospect_id=? AND channel=?", vals
    )
    con.commit()


def already_sent(con, pid, channel, touch, mode: str | None = None) -> bool:
    """`mode="LIVE"` limita il controllo agli invii VERI: una riga DRY_RUN (simulata,
    mai un tocco reale) non deve mai far credere a un tick LIVE che il tocco sia già
    partito. Senza `mode` (default) il controllo è permissivo come prima — usato in
    contesti di sola anteprima. Bug corretto in revisione (3/8): vedi `_advance()`."""
    q = "SELECT 1 FROM sends WHERE prospect_id=? AND channel=? AND touch=?"
    params = [pid, channel, touch]
    if mode == "LIVE":
        q += " AND mode='LIVE'"
    return con.execute(q, params).fetchone() is not None


def touched_today(con, pid) -> bool:
    """Mai due tocchi lo stesso giorno allo stesso prospect — su QUALUNQUE canale."""
    return con.execute(
        "SELECT 1 FROM sends WHERE prospect_id=? AND sent_date=? AND mode='LIVE'",
        (pid, today()),
    ).fetchone() is not None


def record_send(con, pid, channel, touch, body, lang, mode, result):
    """Registra un invio. Una riga per (prospect, canale, tocco).

    ⚠️ `INSERT OR IGNORE` da solo NON basta, e il motivo è la seconda faccia del
    difetto corretto in `already_sent()`. Misurato il 3/8 eseguendo la sequenza che
    il README raccomanda:

        1. tick in DRY_RUN  → scrive una riga con mode='DRY_RUN'
        2. tick con LIVE=1  → `already_sent(mode='LIVE')` non la vede (giusto),
                              l'invio VERO parte…
        3. …ma `INSERT OR IGNORE` trova la chiave già occupata dalla riga simulata
           e **scarta silenziosamente** la registrazione dell'invio reale.
        4. tick successivo → `already_sent(mode='LIVE')` è ancora False → RIMANDA
           allo stesso prospect. E così a ogni giro.

    Prima il difetto era «non invia mai»; correggendo solo la lettura è diventato
    «può inviare più volte». Una simulazione non deve né bloccare un invio vero né
    prendergli il posto: qui la riga DRY_RUN viene PROMOSSA a LIVE quando l'invio
    reale avviene, mentre una riga LIVE già presente non viene mai sovrascritta —
    è quella che garantisce l'idempotenza vera.
    """
    esistente = con.execute(
        "SELECT mode FROM sends WHERE prospect_id=? AND channel=? AND touch=?",
        (pid, channel, touch),
    ).fetchone()

    if esistente is None:
        con.execute(
            "INSERT INTO sends "
            "(prospect_id, channel, touch, body, lang, sent_at, sent_date, mode, result) "
            "VALUES (?,?,?,?,?,?,?,?,?)",
            (pid, channel, touch, body, lang, now(), today(), mode, result),
        )
    elif esistente["mode"] != "LIVE" and mode == "LIVE":
        # Promozione: l'invio vero prende il posto della simulazione, con la sua
        # data reale. Senza questo, un invio partito non risulterebbe mai partito.
        con.execute(
            "UPDATE sends SET body=?, lang=?, sent_at=?, sent_date=?, mode=?, result=? "
            "WHERE prospect_id=? AND channel=? AND touch=?",
            (body, lang, now(), today(), mode, result, pid, channel, touch),
        )
    # Se la riga è già LIVE non si tocca: un rerun non ri-registra e non falsifica
    # la data del primo invio reale.
    con.commit()


def save_draft(con, pid, channel, touch, lang, body, lint_ok, lint_detail, source):
    con.execute(
        "INSERT OR REPLACE INTO drafts "
        "(prospect_id, channel, touch, lang, body, lint_ok, lint_detail, composed_at, source) "
        "VALUES (?,?,?,?,?,?,?,?,?)",
        (pid, channel, touch, lang, body, int(lint_ok), lint_detail, now(), source),
    )
    con.commit()


def get_draft(con, pid, channel, touch, lang):
    return con.execute(
        "SELECT * FROM drafts WHERE prospect_id=? AND channel=? AND touch=? AND lang=?",
        (pid, channel, touch, lang),
    ).fetchone()


# --- Import prospect (CSV_FIELDS) -----------------------------------------------
def import_prospect_row(con, row: dict) -> str | None:
    """Inserisce un prospect da un dict con le chiavi di CSV_FIELDS (+ 'id' opzionale).

    Ritorna il pid se inserito, None se scartato (nome mancante) o già presente.
    Riusata da cli.cmd_import (riga di un CSV) e da discovery.cmd_promote (candidato
    promosso): stessa regola di ingresso in `prospects`, un solo posto che la applica.
    """
    import uuid as _uuid

    row = {k: (v.strip() if isinstance(v, str) else v) for k, v in row.items()}
    if not row.get("name"):
        return None
    # Bug corretto in revisione (3/8): "GiuliaNeri" e "giulianeri" finivano due
    # prospect indipendenti — due sequenze verso la stessa persona — perché l'id
    # derivato distingueva maiuscole/minuscole. Instagram e LinkedIn non le
    # distinguono negli handle: si normalizza qui, un solo punto di ingresso.
    for key in ("linkedin_public_id", "instagram_username"):
        if row.get(key):
            row[key] = row[key].strip().lower()
    pid = row.get("id") or (row.get("linkedin_public_id")
                             or row.get("instagram_username")
                             or _uuid.uuid4().hex[:8])
    pid = str(pid).strip().lower()
    if get_prospect(con, pid):
        return None
    vals = [pid] + [row.get(k, "") or "" for k in CSV_FIELDS] + [now()]
    con.execute(
        f"INSERT INTO prospects (id, {', '.join(CSV_FIELDS)}, created_at) "
        f"VALUES ({', '.join('?' * (len(CSV_FIELDS) + 2))})", vals)
    for ch in config.CHANNELS:
        usable = ((ch == "linkedin" and row.get("linkedin_public_id"))
                  or (ch == "instagram" and row.get("instagram_username"))
                  or (ch == "email" and row.get("email"))
                  or (ch == "whatsapp" and row.get("phone")))
        get_state(con, pid, ch)
        # "queued"/"skipped" = statemachine.QUEUED/SKIPPED: stringhe letterali per non
        # legare store.py (persistenza pura) alla semantica della macchina a stati.
        set_state(con, pid, ch, "queued" if usable else "skipped",
                   reason="importato" if usable else "identificativo assente")
    event(con, pid, "-", "import", f"{row.get('persona')}/{row.get('prospect_type')}")
    con.commit()
    return pid


# --- Candidati (discovery.py) ---------------------------------------------------
_CAND_COLS = ["full_name", "bio", "followers", "following", "posts_count", "external_url",
              "business_email", "business_phone", "city", "zone", "country", "lang",
              "competitor_brand", "tipo", "score", "motivo_score", "hook", "hook_fonte",
              "scoperto_da"]


def get_candidate(con, username):
    return con.execute("SELECT * FROM candidates WHERE username=?", (username,)).fetchone()


def all_candidates(con, tipo=None, stato=None):
    q, params = "SELECT * FROM candidates WHERE 1=1", []
    if tipo:
        q += " AND tipo=?"
        params.append(tipo)
    if stato:
        q += " AND stato=?"
        params.append(stato)
    q += " ORDER BY score DESC, username"
    return con.execute(q, params).fetchall()


def upsert_candidate(con, username: str, **fields):
    """Idempotente per costruzione (PK=username): la riscoperta aggiorna i dati ma
    NON tocca `stato`/`motivo_scarto` se un umano (o `promote`) li ha già decisi —
    e non sposta `scoperto_il`, che resta la prima apparizione."""
    existing = get_candidate(con, username)
    ts = now()
    vals = {c: fields.get(c) for c in _CAND_COLS}
    if existing:
        set_clause = ", ".join(f"{c}=?" for c in _CAND_COLS) + ", updated_at=?"
        con.execute(f"UPDATE candidates SET {set_clause} WHERE username=?",
                    [vals[c] for c in _CAND_COLS] + [ts, username])
    else:
        cols_sql = ", ".join(_CAND_COLS)
        placeholders = ", ".join("?" * (len(_CAND_COLS) + 4))
        con.execute(
            f"INSERT INTO candidates (username, {cols_sql}, scoperto_il, stato, updated_at) "
            f"VALUES ({placeholders})",
            [username] + [vals[c] for c in _CAND_COLS] + [ts, "nuovo", ts])
    con.commit()


def set_candidate_stato(con, username, stato, motivo_scarto=None):
    con.execute(
        "UPDATE candidates SET stato=?, motivo_scarto=?, updated_at=? WHERE username=?",
        (stato, motivo_scarto, now(), username))
    con.commit()
