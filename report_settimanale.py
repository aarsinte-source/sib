#!/usr/bin/env python3
"""report_settimanale.py — il report che arriva ogni lunedì alle 09:00.

Tre metà, come richiesto dal cliente:

  organico       contenuti usciti, andamento, cosa ha funzionato e perché.
                 Segnale di affinità = rapporto like/views (soglia BRAND-IDENTITY:
                 sopra 2% il contenuto ha trovato le persone giuste, sotto 0,5%
                 ha solo fatto numero). ⚠️ Oggi questo DB non ha ancora
                 un'ingestione delle metriche IG: la sezione lo dichiara, non
                 finge un numero.
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

import os
import sqlite3
import sys
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from lib import canali, supabase  # noqa: E402

LIVE = os.environ.get("LIVE") == "1"
OUTREACH_DB = Path(os.environ.get("SHEIS_OUTREACH_DB", str(Path.home() / "alkemia-sheis-outreach" / "data" / "outreach.db")))


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
def sezione_organico(db: supabase.SupabaseClient, periodo_da: date, periodo_a: date) -> dict:
    pronto, msg = db.schema_pronto(["sheis_contenuti"])
    if not pronto:
        return {"disponibile": False, "motivo": msg, "pubblicati": []}

    esito = db.select(
        "sheis_contenuti",
        query=(
            "select=id,canale,brand,formato,hook,data_pubblicazione"
            f"&stato=eq.pubblicato&data_pubblicazione=gte.{periodo_da.isoformat()}"
            f"&data_pubblicazione=lte.{periodo_a.isoformat()}"
        ),
    )
    if not esito.ok:
        return {"disponibile": False, "motivo": f"errore lettura sheis_contenuti: {esito.errore}", "pubblicati": []}

    return {
        "disponibile": True,
        "pubblicati": esito.dati,
        "n": len(esito.dati),
        "metrica_affinita_disponibile": False,
        "metrica_affinita_motivo": (
            "il rapporto like/views (soglia BRAND-IDENTITY: >2% = pubblico giusto, <0,5% = "
            "solo numero) non è ancora misurabile qui: manca l'ingestione delle metriche IG "
            "in questo database. Questa sezione riporta SOLO cosa è uscito, non come ha performato — "
            "finché il worker di ingestione non esiste, dirlo è più onesto che stimarlo."
        ),
    }


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
        righe.append(f"- ⚠️ Affinità (like/views): {organico['metrica_affinita_motivo']}")
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
    righe.append(f"Ads: {'attivo' if pubbl['attivo'] else pubbl['motivo']}")
    if outreach["disponibile"]:
        righe.append(f"Outreach: {outreach['tocchi_nel_periodo']} tocchi, {outreach['risposte_totale']} risposte totali")
    else:
        righe.append(f"Outreach: n/d — {outreach['motivo']}")
    return "\n".join(righe)


def main() -> int:
    print(f"=== report_settimanale.py — {'LIVE' if LIVE else 'SIMULAZIONE (default)'} ===")
    periodo_da, periodo_a = periodo_settimana_scorsa()
    print(f"periodo: {periodo_da} → {periodo_a}")

    db = supabase.SupabaseClient()
    organico = sezione_organico(db, periodo_da, periodo_a)
    pubblicitario = sezione_pubblicitario(db, periodo_da, periodo_a)
    outreach = sezione_outreach(periodo_da, periodo_a)

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
