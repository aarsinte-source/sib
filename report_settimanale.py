#!/usr/bin/env python3
"""report_settimanale.py — il report che arriva ogni lunedì alle 09:00.

Tre metà, come richiesto dal cliente:

  organico       contenuti usciti, andamento, cosa ha funzionato e perché.
                 Segnale di affinità = rapporto like/views sui reel (soglia
                 BRAND-IDENTITY: sopra 2% il contenuto ha trovato le persone
                 giuste, sotto 0,5% ha solo fatto numero — mediana profilo
                 misurata 1,61%). La fonte è `sheis_metriche_ig`, popolata da
                 `ingest_metriche_ig.py`; finché quella tabella non esiste nel
                 DB, si usa come fallback l'ultima rilevazione locale
                 (`data/METRICHE-IG_ultima-rilevazione.json`) — e lo si dice,
                 sempre, con la fonte esplicita in chiaro.
  pubblicitario  spesa, costo per contatto, creatività migliori. Legge
                 `sheis_campagne`. Se non c'è nessuna campagna attiva, lo dice:
                 "nessuna campagna attiva: manca l'account pubblicitario" — MAI
                 uno zero silenzioso che si legge come un fallimento.
  outreach       contatti, risposte, appuntamenti — legge in SOLA LETTURA lo
                 SQLite del motore outreach (~/alkemia-sheis-outreach/data/
                 outreach.db). Gli appuntamenti fissati non sono tracciati in
                 quel DB (li gestisce sheis-detector-trattativa a valle): anche
                 questo si dichiara, non si inventa.

Consegna via email + Telegram (lib/canali.py), stesso principio di
canali.py del centralino: un canale che cade non fa cadere l'altro.
"""
from __future__ import annotations

import json
import os
import sqlite3
import sys
from datetime import date, timedelta
from pathlib import Path
from statistics import median

sys.path.insert(0, str(Path(__file__).resolve().parent))

from lib import canali, supabase  # noqa: E402

LIVE = os.environ.get("LIVE") == "1"
QUI = Path(__file__).resolve().parent
OUTREACH_DB = Path(os.environ.get("SHEIS_OUTREACH_DB", str(Path.home() / "alkemia-sheis-outreach" / "data" / "outreach.db")))
SOGLIA_AFFINE_PCT = 2.0
SOGLIA_RUMORE_PCT = 0.5


def periodo_settimana_scorsa(oggi: date | None = None) -> tuple[date, date]:
    """Lunedì-domenica appena conclusi, rispetto a `oggi` (di norma: oggi=lunedì
    del run schedulato, quindi la settimana scorsa è "ieri e i 6 giorni prima").
    """
    n = oggi or date.today()
    lunedi_corrente = n - timedelta(days=n.weekday())
    periodo_a = lunedi_corrente - timedelta(days=1)      # domenica scorsa
    periodo_da = periodo_a - timedelta(days=6)            # lunedì scorso
    return periodo_da, periodo_a


# --------------------------------------------------------------------- organico
def _riga_affinita(fonte: str, disponibile: bool, motivo: str = "", mediana_pct: float | None = None,
                    n_reel: int = 0, migliore: dict | None = None, peggiore: dict | None = None,
                    rilevato_il: str = "") -> dict:
    return {"fonte": fonte, "disponibile": disponibile, "motivo": motivo, "mediana_pct": mediana_pct,
            "n_reel": n_reel, "migliore": migliore, "peggiore": peggiore, "rilevato_il": rilevato_il}


def _statistiche_da_record(record: list[dict]) -> tuple[float | None, int, dict | None, dict | None]:
    reel = [r for r in record if r.get("tipo_contenuto") == "reel" and r.get("like_su_views_pct") is not None]
    if not reel:
        return None, 0, None, None
    mediana = round(median(r["like_su_views_pct"] for r in reel), 3)
    migliore = max(reel, key=lambda r: r["like_su_views_pct"])
    peggiore = min(reel, key=lambda r: r["like_su_views_pct"])
    return mediana, len(reel), migliore, peggiore


def sezione_affinita(db: supabase.SupabaseClient, periodo_da: date, periodo_a: date) -> dict:
    """Rapporto like/views sui reel — fonte preferita: sheis_metriche_ig nel
    periodo. Se la tabella non esiste ancora, fallback sull'ultima rilevazione
    locale scritta da ingest_metriche_ig.py (sempre etichettata come tale)."""
    pronto, msg = db.schema_pronto(["sheis_metriche_ig"])
    if pronto:
        esito = db.select(
            "sheis_metriche_ig",
            query=(
                "select=like_su_views_pct,caption_estratto,tipo_contenuto"
                f"&tipo_contenuto=eq.reel&like_su_views_pct=not.is.null"
                f"&rilevato_il=gte.{periodo_da.isoformat()}T00:00:00"
                f"&rilevato_il=lte.{periodo_a.isoformat()}T23:59:59"
            ),
        )
        if not esito.ok:
            return _riga_affinita("db", False, f"errore lettura sheis_metriche_ig: {esito.errore}")
        if not esito.dati:
            return _riga_affinita("db", False, "tabella pronta ma nessuna rilevazione nel periodo — eseguire ingest_metriche_ig.py")
        mediana, n_reel, migliore, peggiore = _statistiche_da_record(esito.dati)
        return _riga_affinita("db", True, mediana_pct=mediana, n_reel=n_reel, migliore=migliore, peggiore=peggiore)

    # Fallback: ultima rilevazione locale (file piccolo, già normalizzato — sicuro da leggere per intero)
    riepilogo = QUI / "data" / "METRICHE-IG_ultima-rilevazione.json"
    if not riepilogo.is_file():
        return _riga_affinita("nessuna", False, f"{msg} — nessuna rilevazione locale trovata: eseguire ingest_metriche_ig.py almeno una volta")

    try:
        dati = json.loads(riepilogo.read_text(encoding="utf-8"))
    except (OSError, ValueError) as e:
        return _riga_affinita("nessuna", False, f"{msg} — file locale illeggibile: {e}")

    mediana, n_reel, migliore, peggiore = _statistiche_da_record(dati.get("record", []))
    if mediana is None:
        return _riga_affinita("file_locale", False, f"{msg} — rilevazione locale del {dati.get('rilevato_il', '?')} senza reel con views > 0")
    return _riga_affinita(
        "file_locale", True, mediana_pct=mediana, n_reel=n_reel, migliore=migliore, peggiore=peggiore,
        rilevato_il=dati.get("rilevato_il", "?"),
    )


def sezione_organico(db: supabase.SupabaseClient, periodo_da: date, periodo_a: date) -> dict:
    affinita = sezione_affinita(db, periodo_da, periodo_a)

    pronto, msg = db.schema_pronto(["sheis_contenuti"])
    if not pronto:
        return {"disponibile": False, "motivo": msg, "pubblicati": [], "n": 0, "affinita": affinita}

    esito = db.select(
        "sheis_contenuti",
        query=(
            "select=id,canale,brand,formato,hook,data_pubblicazione"
            f"&stato=eq.pubblicato&data_pubblicazione=gte.{periodo_da.isoformat()}"
            f"&data_pubblicazione=lte.{periodo_a.isoformat()}"
        ),
    )
    if not esito.ok:
        return {"disponibile": False, "motivo": f"errore lettura sheis_contenuti: {esito.errore}", "pubblicati": [], "n": 0, "affinita": affinita}

    return {"disponibile": True, "pubblicati": esito.dati, "n": len(esito.dati), "affinita": affinita}


# ---------------------------------------------------------------- pubblicitario
def sezione_pubblicitario(db: supabase.SupabaseClient, periodo_da: date, periodo_a: date) -> dict:
    pronto, msg = db.schema_pronto(["sheis_campagne"])
    if not pronto:
        return {"attivo": False, "motivo": msg, "campagne": []}

    esito = db.select("sheis_campagne", query="select=*&stato=eq.attiva")
    if not esito.ok:
        return {"attivo": False, "motivo": f"errore lettura sheis_campagne: {esito.errore}", "campagne": []}

    if not esito.dati:
        return {
            "attivo": False,
            "motivo": "nessuna campagna attiva: manca l'account pubblicitario",
            "campagne": [],
        }
    return {"attivo": True, "campagne": esito.dati}


# --------------------------------------------------------------------- outreach
def sezione_outreach(periodo_da: date, periodo_a: date) -> dict:
    if not OUTREACH_DB.is_file():
        return {"disponibile": False, "motivo": f"outreach.db non trovato in {OUTREACH_DB}"}

    try:
        # sola lettura: uri=true + mode=ro impedisce anche una scrittura per errore.
        con = sqlite3.connect(f"file:{OUTREACH_DB}?mode=ro", uri=True)
        con.row_factory = sqlite3.Row
    except sqlite3.OperationalError as e:
        return {"disponibile": False, "motivo": f"impossibile aprire outreach.db in sola lettura: {e}"}

    # ⚠️ REGRESSIONE (revisione avversariale 2026-08-03): questo blocco era un
    # try/finally SENZA except. Con uno outreach.db che ha 'prospects' ma non
    # ancora 'sends' (schema incompleto, scenario plausibile dato lo stato del
    # progetto), sqlite3.OperationalError risaliva fuori da questa funzione,
    # fuori da main() — non catturata da nessuno — e faceva morire l'INTERO
    # report: organico e pubblicitario già calcolati venivano persi, zero
    # email, zero Telegram quel lunedì. Contraddice il principio dichiarato
    # nel docstring del file ("un canale che cade non fa cadere l'altro").
    try:
        tocchi_periodo = con.execute(
            "SELECT COUNT(*) FROM sends WHERE sent_date BETWEEN ? AND ?",
            (periodo_da.isoformat(), periodo_a.isoformat()),
        ).fetchone()[0]
        contattati_totale = con.execute(
            "SELECT COUNT(DISTINCT prospect_id) FROM sends"
        ).fetchone()[0]
        risposte_totale = con.execute(
            "SELECT COUNT(*) FROM channel_state WHERE state = 'replied'"
        ).fetchone()[0]
        per_stato = {
            r["state"]: r["n"]
            for r in con.execute("SELECT state, COUNT(*) AS n FROM channel_state GROUP BY state")
        }
        totale_prospect = con.execute("SELECT COUNT(*) FROM prospects").fetchone()[0]
    except sqlite3.OperationalError as e:
        return {"disponibile": False, "motivo": f"schema outreach.db incompleto o inatteso: {e}"}
    finally:
        con.close()

    return {
        "disponibile": True,
        "tocchi_nel_periodo": tocchi_periodo,
        "prospect_contattati_totale": contattati_totale,
        "prospect_caricati_totale": totale_prospect,
        "risposte_totale": risposte_totale,
        "per_stato": per_stato,
        "appuntamenti_disponibile": False,
        "appuntamenti_motivo": (
            "gli appuntamenti fissati dopo una risposta non sono tracciati in questo database: "
            "li gestisce sheis-detector-trattativa a valle, in un sistema diverso. Non zero: non tracciato qui."
        ),
    }


# ------------------------------------------------------------------------ render
def render_markdown(periodo_da: date, periodo_a: date, organico: dict, pubbl: dict, outreach: dict) -> str:
    righe = [f"# Report settimanale SHEis — {periodo_da:%d/%m} → {periodo_a:%d/%m/%Y}", ""]

    righe.append("## Organico")
    if not organico["disponibile"]:
        righe.append(f"⚠️ {organico['motivo']}")
    else:
        righe.append(f"- Contenuti pubblicati nel periodo: **{organico['n']}**")
        for p in organico["pubblicati"][:15]:
            righe.append(f"  - {p.get('data_pubblicazione')} · {p.get('canale')} · {p.get('brand') or '—'} · {p.get('formato') or '—'} — {p.get('hook') or '(senza hook)'}")

    aff = organico["affinita"]
    if aff["disponibile"]:
        m = aff["mediana_pct"]
        giudizio = "✅ pubblico affine trovato" if m >= SOGLIA_AFFINE_PCT else (
            "⚠️ sotto la soglia di rumore — reach senza risonanza" if m < SOGLIA_RUMORE_PCT else "nella norma, non eccezionale")
        nota_fonte = f" (rilevazione locale del {aff['rilevato_il']}, DB non ancora popolato)" if aff["fonte"] == "file_locale" else ""
        righe.append(f"- Affinità reel (like/views): mediana **{m}%** su {aff['n_reel']} reel{nota_fonte} — {giudizio}")
        righe.append(f"  (soglie BRAND-IDENTITY: <{SOGLIA_RUMORE_PCT}% = rumore, >{SOGLIA_AFFINE_PCT}% = pubblico affine, mediana profilo misurata 1,61%)")
        if aff.get("migliore"):
            righe.append(f"  - Ha funzionato meglio: {aff['migliore']['like_su_views_pct']}% — «{(aff['migliore'].get('caption_estratto') or '')[:80]}…»")
        if aff.get("peggiore"):
            righe.append(f"  - Ha funzionato peggio: {aff['peggiore']['like_su_views_pct']}% — «{(aff['peggiore'].get('caption_estratto') or '')[:80]}…»")
    else:
        righe.append(f"- ⚠️ Affinità (like/views): {aff['motivo']}")
    righe.append("")

    righe.append("## Pubblicitario")
    if not pubbl["attivo"]:
        righe.append(f"⚠️ {pubbl['motivo']}")
    else:
        righe.append(f"- Campagne attive: **{len(pubbl['campagne'])}**")
        for c in pubbl["campagne"]:
            righe.append(f"  - {c.get('nome')} — budget/gg €{c.get('budget_giorno') or '—'} — {c.get('blueprint') or '—'}")
    righe.append("")

    righe.append("## Outreach")
    if not outreach["disponibile"]:
        righe.append(f"⚠️ {outreach['motivo']}")
    else:
        righe.append(f"- Tocchi inviati nel periodo: **{outreach['tocchi_nel_periodo']}**")
        righe.append(f"- Prospect contattati (totale, da sempre): **{outreach['prospect_contattati_totale']}** su {outreach['prospect_caricati_totale']} caricati")
        righe.append(f"- Risposte ricevute (totale): **{outreach['risposte_totale']}**")
        righe.append(f"- Stato canali: {', '.join(f'{k}={v}' for k, v in sorted(outreach['per_stato'].items()))}")
        righe.append(f"- ⚠️ Appuntamenti: {outreach['appuntamenti_motivo']}")
    righe.append("")
    righe.append("---")
    righe.append("_Generato automaticamente da report_settimanale.py — alkemia-sheis-workers_")
    return "\n".join(righe)


def render_telegram(periodo_da: date, periodo_a: date, organico: dict, pubbl: dict, outreach: dict) -> str:
    righe = [f"📊 Report SHEis {periodo_da:%d/%m}-{periodo_a:%d/%m}", ""]
    righe.append(f"Organico: {organico['n'] if organico['disponibile'] else 'n/d — ' + organico['motivo']}")
    aff = organico["affinita"]
    if aff["disponibile"]:
        righe.append(f"Affinità reel: {aff['mediana_pct']}% mediana su {aff['n_reel']} reel"
                      + (" (fonte locale, DB vuoto)" if aff["fonte"] == "file_locale" else ""))
    else:
        righe.append(f"Affinità reel: n/d — {aff['motivo']}")
    righe.append(f"Ads: {'attivo' if pubbl['attivo'] else pubbl['motivo']}")
    if outreach["disponibile"]:
        righe.append(f"Outreach: {outreach['tocchi_nel_periodo']} tocchi, {outreach['risposte_totale']} risposte totali")
    else:
        righe.append(f"Outreach: n/d — {outreach['motivo']}")
    return "\n".join(righe)


def _sicuro(nome: str, fn, *args) -> dict:
    """Esegue una sezione isolandola dalle altre due: un'eccezione qui — anche
    una non prevista dal codice della sezione stessa — non deve mai far
    perdere il lavoro già fatto sulle altre. `except Exception` è voluto: è
    l'ultimo argine prima del report intero, non un dettaglio interno.
    Il dict di fallback contiene l'UNIONE delle chiavi lette da tutte e tre
    le sezioni nei render, cosi qualunque sezione fallisca il render non va
    mai in KeyError.
    """
    try:
        return fn(*args)
    except Exception as e:  # noqa: BLE001 — argine finale, deliberatamente ampio
        print(f"⚠️  sezione '{nome}' ha sollevato un'eccezione imprevista: {type(e).__name__}: {e}")
        return {
            "disponibile": False, "motivo": f"errore imprevisto nella sezione '{nome}': {type(e).__name__}: {e}",
            "attivo": False, "n": 0, "pubblicati": [], "campagne": [],
            "affinita": {"fonte": "nessuna", "disponibile": False, "motivo": f"sezione '{nome}' fallita",
                         "mediana_pct": None, "n_reel": 0, "migliore": None, "peggiore": None, "rilevato_il": ""},
        }


def main() -> int:
    print(f"=== report_settimanale.py — {'LIVE' if LIVE else 'SIMULAZIONE (default)'} ===")
    periodo_da, periodo_a = periodo_settimana_scorsa()
    print(f"periodo: {periodo_da} → {periodo_a}")

    db = supabase.SupabaseClient()
    # Guscio difensivo per ognuna delle tre sezioni: un'eccezione IMPREVISTA
    # (non solo lo sqlite3.OperationalError già gestito dentro sezione_outreach)
    # non deve MAI far perdere le altre due sezioni già calcolate — è il
    # principio dichiarato in cima a questo file, applicato anche qui, non
    # solo dentro le singole funzioni (revisione avversariale 2026-08-03).
    organico = _sicuro("organico", sezione_organico, db, periodo_da, periodo_a)
    pubblicitario = _sicuro("pubblicitario", sezione_pubblicitario, db, periodo_da, periodo_a)
    outreach = _sicuro("outreach", sezione_outreach, periodo_da, periodo_a)

    corpo_email = render_markdown(periodo_da, periodo_a, organico, pubblicitario, outreach)
    corpo_telegram = render_telegram(periodo_da, periodo_a, organico, pubblicitario, outreach)

    print("\n" + corpo_email + "\n")

    pronto, _ = db.schema_pronto(["sheis_report"])
    if pronto:
        db.upsert("sheis_report", {
            "tipo": "settimanale", "periodo_da": periodo_da.isoformat(), "periodo_a": periodo_a.isoformat(),
            "organico": organico, "pubblicitario": pubblicitario, "outreach": outreach,
            "canali_spenti": [n for n, s in (("pubblicitario", pubblicitario["attivo"]),) if not s],
            "markdown": corpo_email,
        }, conflitto="tipo,periodo_da")
        print("✓ report salvato in sheis_report")
    else:
        print("⚠️  sheis_report non esiste ancora: report generato ma non salvato nel DB (solo consegnato)")

    esiti = canali.consegna_report(
        f"Report settimanale SHEis {periodo_da:%d/%m}-{periodo_a:%d/%m}",
        corpo_email, corpo_telegram, dry=not LIVE,
    )
    for canale_nome, e in esiti.items():
        stato = "✓" if e["ok"] else "✗"
        print(f"{stato} {canale_nome}: {e['dettaglio']}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
