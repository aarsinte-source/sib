"""Dai dati grezzi alla lettura: sintesi di mercato e pilastri di contenuto.

PERCHÉ NON BASTA IL MODELLO DA SOLO
-----------------------------------
Chiedere a un modello «analizza il mercato dell'hair-care professionale»
produce un testo plausibile e generico: pain point che valgono per qualunque
settore, un lessico inventato, angoli che nessuno ha mai visto funzionare.
Sembra un'analisi e non lo è, perché non è ancorata a niente.

Qui il modello riceve **duecento elementi reali** — post con le loro
interazioni, inserzioni con da quanti giorni girano, volumi di ricerca veri —
e il suo compito non è sapere il mercato: è LEGGERE quei dati. È una differenza
che si vede subito nel risultato, perché il lessico che esce è quello che i
professionisti usano davvero, non quello che il modello immagina usino.

PERCHÉ OPENROUTER
-----------------
HTTP puro, nessun processo locale. È l'unico motore che funziona sia qui, sulla
macchina di Andrei, sia sul VPS, sia dentro una funzione Vercel. La riga di
comando `claude` non funziona in nessuno dei tre casi in modo affidabile:
misurato il 2026-08-04, resta appesa senza rispondere.
"""
from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from pathlib import Path

MODELLO = os.environ.get("OPENROUTER_MODEL", "anthropic/claude-sonnet-4.5")
TIMEOUT = int(os.environ.get("OPENROUTER_TIMEOUT", "240"))


def _candidati_env() -> list[Path]:
    qui = Path(__file__).resolve().parent.parent
    return [
        qui / ".env",
        Path.home() / "alkemia-sheis-studio" / ".env.local",
        Path.home() / "Desktop" / "ALKEMIA - AGENCY" / "scalers-plus" / ".claude" / "skills" / "autorouter" / ".env",
    ]


def _chiave() -> str:
    v = os.environ.get("OPENROUTER_API_KEY", "").strip()
    if v:
        return v
    for p in _candidati_env():
        if not p.is_file():
            continue
        for riga in p.read_text(encoding="utf-8").splitlines():
            if riga.strip().startswith("OPENROUTER_API_KEY="):
                return riga.strip().split("=", 1)[1].strip().strip('"').strip("'")
    return ""


def _ripulisci(testo: str) -> str:
    """Il modello incornicia in markdown anche quando gli si chiede JSON puro:
    misurato. Un `json.loads` diretto fallirebbe su una chiamata già pagata."""
    c = testo.strip()
    if c.startswith("```"):
        c = c.split("\n", 1)[-1].rsplit("```", 1)[0].strip()
    if not c.startswith("{"):
        i, j = c.find("{"), c.rfind("}")
        if i >= 0 and j > i:
            c = c[i:j + 1]
    return c


def genera_json(sistema: str, utente: str) -> dict:
    """Una chiamata, JSON in uscita. Solleva con un messaggio in italiano: chi
    la usa deve poterlo mostrare a un umano senza tradurlo."""
    chiave = _chiave()
    if not chiave:
        raise RuntimeError(
            "OPENROUTER_API_KEY assente. Sta nel .env di questo repo, in quello dello "
            "Studio, o nella skill autorouter di scalers-plus."
        )
    corpo = json.dumps({
        "model": MODELLO,
        "temperature": 0.6,
        "response_format": {"type": "json_object"},
        "messages": [{"role": "system", "content": sistema},
                     {"role": "user", "content": utente}],
    }).encode("utf-8")
    req = urllib.request.Request(
        "https://openrouter.ai/api/v1/chat/completions", data=corpo,
        headers={"Authorization": f"Bearer {chiave}", "Content-Type": "application/json",
                 "HTTP-Referer": "https://sheis.alkemia", "X-Title": "SHEis esecutore"},
    )
    try:
        risposta = json.loads(urllib.request.urlopen(req, timeout=TIMEOUT).read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"OpenRouter ha risposto {e.code}: {e.read().decode('utf-8', 'replace')[:200]}") from e
    except urllib.error.URLError as e:
        raise RuntimeError(f"OpenRouter non raggiungibile: {e}") from e

    if risposta.get("error"):
        raise RuntimeError(str(risposta["error"])[:200])
    testo = (((risposta.get("choices") or [{}])[0].get("message") or {}).get("content") or "").strip()
    if not testo:
        raise RuntimeError("OpenRouter ha risposto vuoto.")
    try:
        return json.loads(_ripulisci(testo))
    except json.JSONDecodeError as e:
        raise RuntimeError(f"Risposta non in formato JSON: {testo[:200]}") from e


# ══════════════════════════════════════════════════════ regole di marca

def _regole_marca() -> str:
    """Le regole generate da BRAND-IDENTITY. Se il modulo generato non c'è, si
    DICE invece di procedere senza regole: un'analisi prodotta senza vincoli di
    marca è peggio di nessuna analisi, perché sembra a norma."""
    try:
        from .vincoli_brand import NEGOZIO, PREZZO, CTA_AMMESSE, CTA_VIETATE  # type: ignore
        negozio = ", ".join(list(NEGOZIO)[:25])
        prezzi = ", ".join(list(PREZZO)[:15])
        cta_ok = ", ".join(list(CTA_AMMESSE)[:8])
        cta_no = ", ".join(list(CTA_VIETATE)[:8])
    except Exception:
        return ("⚠️ I vincoli di marca generati non sono disponibili: applica comunque "
                "le regole minime — mai prezzi, mai lessico da negozio, mai «Metodo 29», "
                "pubblico sempre professionale.")
    return (
        "REGOLE DI MARCA NON NEGOZIABILI:\n"
        "- Il pubblico è SEMPRE professionale: distributore o salone. Mai il consumatore finale.\n"
        f"- MAI prezzi né cifre commerciali: {prezzi}.\n"
        f"- MAI lessico da negozio, in nessuna lingua: {negozio}.\n"
        "- MAI nominare «Metodo 29» in alcuna forma, grafia o parafrasi.\n"
        "- Nessun numero non documentato: se un dato non è nelle fonti, non si scrive.\n"
        f"- CTA ammesse: {cta_ok}. CTA vietate: {cta_no}."
    )


# ══════════════════════════════════════════════════════════════ la sintesi

SISTEMA = """Sei l'analista di mercato del reparto marketing di SHEis Beauty International, cosmetica professionale hair-care B2B con sede a Pineto (TE). Il pubblico sono distributori e saloni, MAI il consumatore finale.

{regole}

Ti vengono dati DATI REALI raccolti adesso dalle piattaforme: post organici con le loro interazioni, inserzioni con da quanti giorni girano, volumi di ricerca. Il tuo compito NON è sapere il mercato: è LEGGERE questi dati.

Regole di lettura, tassative:
- Ogni affermazione deve poter essere ricondotta a un elemento nei dati. Se una cosa non c'è nei dati, non la scrivi.
- I GIORNI DI ATTIVITÀ di un'inserzione sono il solo segnale pubblico di performance: nessuno tiene viva per 90+ giorni una campagna che perde. Trattali come tali.
- Il LESSICO va estratto dal testo vero dei post e delle inserzioni, non inventato. Riporta le parole come le usano loro.
- Se una fonte non ha risposto, non riempire il buco con supposizioni: elencalo in "buchi".

Rispondi SOLO con JSON di questa forma esatta:
{{
  "pain": ["4-6 problemi concreti di distributori o saloni, ognuno riconducibile ai dati"],
  "desideri": ["4-6 desideri o obiettivi"],
  "lessico": ["8-14 parole o frasi ESTRATTE dai testi reali"],
  "angoli": ["4-6 angoli di comunicazione B2B utilizzabili, brand-safe"],
  "cosa_funziona": ["3-6 osservazioni su cosa gira da più tempo o performa meglio, CON il riferimento (inserzionista, giorni, o autore)"],
  "concorrenti_attivi": [{{"nome": "...", "dove": "meta|linkedin|google", "segnale": "es. 3 inserzioni da 200+ giorni"}}],
  "pillar": [
    {{"nome": "...", "descrizione": "2-3 righe: di cosa parla e perché a questo pubblico",
      "obiettivo": "attrazione|consapevolezza|vendita|fiducia",
      "quota_pct": 25,
      "esempi": ["3 titoli di post concreti"],
      "lessico": ["3-5 parole del pilastro, prese dal lessico reale"]}}
  ],
  "buchi": ["cosa NON si è potuto misurare e perché"]
}}

I "pillar" sono 4 o 5, le loro quota_pct sommano a 100, e insieme devono coprire il percorso attrazione → fiducia → vendita. Non sono categorie generiche: nascono da cosa i dati dicono che funziona in QUESTO mercato."""


def sintetizza_ricerca(tema: str, dati_compattati: str, paesi: list[str] | None = None) -> dict:
    """La lettura dei dati. Restituisce sempre un dizionario: se il modello
    fallisce, un dizionario che DICE che è fallito — mai un'eccezione che fa
    perdere i dati raccolti e già pagati."""
    paesi = paesi or ["it"]
    utente = (
        f"Tema della ricerca: «{tema}».\n"
        f"Mercati: {', '.join(p.upper() for p in paesi)}.\n\n"
        f"DATI REALI RACCOLTI ADESSO:\n{dati_compattati}"
    )
    try:
        d = genera_json(SISTEMA.format(regole=_regole_marca()), utente)
    except Exception as e:
        return {
            "errore": str(e),
            "nota": ("I dati grezzi sono stati raccolti e salvati: la sintesi si può "
                     "rigenerare senza pagare di nuovo le fonti."),
        }

    # Normalizzazione difensiva: il modello a volte restituisce una stringa
    # dove ci si aspetta una lista. Meglio una lista di uno che un crash a
    # valle su una ricerca già pagata.
    def lista(v) -> list:
        if isinstance(v, list):
            return v
        return [v] if v else []

    quote = [p for p in lista(d.get("pillar")) if isinstance(p, dict)]
    somma = sum(int(p.get("quota_pct") or 0) for p in quote)
    if quote and somma != 100:
        # Si riequilibra e si DICHIARA: una quota che non fa 100 letta come se
        # facesse 100 sposta il piano editoriale senza che nessuno lo sappia.
        for p in quote:
            p["quota_pct"] = round(int(p.get("quota_pct") or 0) * 100 / somma) if somma else round(100 / len(quote))
        d["_nota_quote"] = f"Le quote dei pilastri sommavano a {somma}: riproporzionate a 100."

    return {
        "pain": lista(d.get("pain")),
        "desideri": lista(d.get("desideri")),
        "lessico": lista(d.get("lessico")),
        "angoli": lista(d.get("angoli")),
        "cosa_funziona": lista(d.get("cosa_funziona")),
        "concorrenti_attivi": lista(d.get("concorrenti_attivi")),
        "pillar": quote,
        "buchi": lista(d.get("buchi")),
        "_nota_quote": d.get("_nota_quote"),
        "modello": MODELLO,
    }
