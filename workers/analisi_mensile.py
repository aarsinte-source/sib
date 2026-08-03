#!/usr/bin/env python3
"""analisi_mensile.py — rigenera ogni mese l'analisi di mercato e i trend.

Due fonti, entrambe a pagamento sull'account Alkemia — per questo, come per
Higgsfield, girano SOLO con `LIVE=1`. Di default il worker stampa esattamente
quali chiamate farebbe, senza consumare un credito:

  · ScrapeCreators — profilo Instagram dei competitor validati da Mauro
    (Skill sheis-brand-core §6: Davines · Kemon · Alfaparf Milano · Framesi ·
    Insight Professional · Echoline · Vitalis — diretti; Sebastian · Kevin
    Murphy · Oribe — riferimento internazionale; Medavita — caso hype/
    e-commerce da studiare). Nessun nome fuori da questa lista validata.
  · DataForSEO — volume di ricerca dei semi IT+ES sulla categoria hair-care
    professionale, stesso perimetro della baseline già prodotta on-site.

⚠️ **Dove lo legge lo Studio**: al momento in cui questo worker è stato
scritto, `alkemia-sheis-studio` è ancora in costruzione (Cantiere 3, un altro
agente) e non ha uno schema di lettura confermato per l'analisi di mercato.
Per non bloccarsi su un'incognita altrui, questo worker scrive l'output in
DUE posti stabili, così qualunque sia la scelta finale dello Studio i dati
ci sono già:
  1. file — `data/ANALISI-MERCATO_<AAAA-MM>.json` e `.md` in QUESTO repo;
  2. database — una riga in `sheis_report` (tipo='mensile'), riusando la
     colonna generica `markdown` (le colonne organico/pubblicitario/outreach
     sono tipizzate per il report settimanale e qui restano vuote apposta,
     invece di essere riusate in modo fuorviante).
"""
from __future__ import annotations

import json
import os
import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from lib import dataforseo, scrapecreators, supabase  # noqa: E402

LIVE = os.environ.get("LIVE") == "1"
QUI = Path(__file__).resolve().parent
DATA_DIR = QUI / "data"

# Lista VALIDATA da Mauro (sheis-brand-core §6) — non se ne aggiungono altri di iniziativa.
COMPETITOR_DIRETTI = ["davines", "kemon", "alfaparfmilano", "framesi", "insightprofessional", "echoline", "vitalis"]
COMPETITOR_INTERNAZIONALI = ["sebastianprofessional", "kevinmurphy", "oribe"]
COMPETITOR_CASO_HYPE = ["medavita"]
TUTTI_COMPETITOR = COMPETITOR_DIRETTI + COMPETITOR_INTERNAZIONALI + COMPETITOR_CASO_HYPE

SEMI_KEYWORD_IT = ["colorazione senza ammoniaca", "prodotti professionali capelli", "tricologia salone", "distributore prodotti capelli"]
SEMI_KEYWORD_ES = ["coloración sin amoniaco", "productos profesionales cabello", "distribuidor productos peluquería"]


def periodo_mese_corrente() -> tuple[date, date]:
    oggi = date.today()
    primo = oggi.replace(day=1)
    if primo.month == 12:
        ultimo = primo.replace(year=primo.year + 1, month=1, day=1)
    else:
        ultimo = primo.replace(month=primo.month + 1, day=1)
    from datetime import timedelta
    ultimo = ultimo - timedelta(days=1)
    return primo, ultimo


def raccogli_competitor(sc: scrapecreators.ScrapeCreatorsClient) -> list[dict]:
    risultati = []
    for handle in TUTTI_COMPETITOR:
        if not LIVE:
            print(f"  🧪 DRY-RUN → GET /v1/instagram/profile?handle={handle}")
            risultati.append({"handle": handle, "disponibile": False, "motivo": "simulazione: nessuna chiamata reale (LIVE non impostato)"})
            continue
        esito = sc.profilo_instagram(handle)
        if esito.ok:
            d = esito.dati.get("data") or esito.dati
            risultati.append({
                "handle": handle, "disponibile": True,
                "follower": d.get("follower_count") or d.get("edge_followed_by", {}).get("count"),
                "bio": d.get("biography"),
            })
            print(f"  ✓ {handle} — follower: {risultati[-1]['follower']}")
        else:
            risultati.append({"handle": handle, "disponibile": False, "motivo": esito.errore})
            print(f"  ✗ {handle} — {esito.errore}")
    return risultati


def raccogli_keyword(dfs: dataforseo.DataForSEOClient) -> dict:
    out = {"it": [], "es": []}
    piani = [("it", SEMI_KEYWORD_IT, dataforseo.LOCATION_ITALIA, "it"), ("es", SEMI_KEYWORD_ES, dataforseo.LOCATION_SPAGNA, "es")]
    for etichetta, semi, loc, lang in piani:
        if not LIVE:
            print(f"  🧪 DRY-RUN → POST search_volume/live [{etichetta}] keywords={semi}")
            out[etichetta] = [{"keyword": k, "disponibile": False, "motivo": "simulazione"} for k in semi]
            continue
        esito = dfs.volume_ricerca(semi, loc, lang)
        if esito.ok:
            tasks = esito.dati.get("tasks", [])
            risultati_riga = tasks[0].get("result", []) if tasks else []
            out[etichetta] = [
                {"keyword": r.get("keyword"), "disponibile": True, "volume_mensile": r.get("search_volume")}
                for r in (risultati_riga or [])
            ]
            print(f"  ✓ [{etichetta}] {len(out[etichetta])} keyword recuperate")
        else:
            out[etichetta] = [{"keyword": k, "disponibile": False, "motivo": esito.errore} for k in semi]
            print(f"  ✗ [{etichetta}] {esito.errore}")
    return out


def render_markdown(periodo_da: date, periodo_a: date, competitor: list[dict], keyword: dict) -> str:
    righe = [f"# Analisi di mercato SHEis — {periodo_da:%B %Y}", ""]
    righe.append("## Competitor (lista validata da Mauro, Skill sheis-brand-core §6)")
    for c in competitor:
        if c.get("disponibile"):
            righe.append(f"- **{c['handle']}** — follower: {c.get('follower', '—')}")
        else:
            righe.append(f"- {c['handle']} — n/d ({c.get('motivo', 'sconosciuto')})")
    righe.append("")
    righe.append("## Domanda di ricerca (DataForSEO)")
    for lingua, righe_kw in keyword.items():
        righe.append(f"### {lingua.upper()}")
        for r in righe_kw:
            if r.get("disponibile"):
                righe.append(f"- {r['keyword']}: {r.get('volume_mensile', '—')} ricerche/mese")
            else:
                righe.append(f"- {r['keyword']}: n/d ({r.get('motivo', 'sconosciuto')})")
    righe.append("")
    righe.append("---")
    righe.append("_Generato automaticamente da analisi_mensile.py — alkemia-sheis-workers_")
    return "\n".join(righe)


def main() -> int:
    print(f"=== analisi_mensile.py — {'LIVE' if LIVE else 'SIMULAZIONE (default, nessun credito consumato)'} ===")
    periodo_da, periodo_a = periodo_mese_corrente()
    print(f"periodo: {periodo_da:%Y-%m}")

    sc = scrapecreators.ScrapeCreatorsClient()
    dfs = dataforseo.DataForSEOClient()

    print("\n→ competitor:")
    competitor = raccogli_competitor(sc)
    print("\n→ keyword:")
    keyword = raccogli_keyword(dfs)

    corpo_md = render_markdown(periodo_da, periodo_a, competitor, keyword)
    payload = {
        "periodo": periodo_da.strftime("%Y-%m"),
        "generato_il": date.today().isoformat(),
        "live": LIVE,
        "competitor": competitor,
        "keyword": keyword,
    }

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    f_json = DATA_DIR / f"ANALISI-MERCATO_{periodo_da:%Y-%m}.json"
    f_md = DATA_DIR / f"ANALISI-MERCATO_{periodo_da:%Y-%m}.md"
    f_json.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
    f_md.write_text(corpo_md, encoding="utf-8")
    print(f"\n✓ scritto {f_json}")
    print(f"✓ scritto {f_md}")

    db = supabase.SupabaseClient()
    pronto, msg = db.schema_pronto(["sheis_report"])
    if pronto:
        db.upsert("sheis_report", {
            "tipo": "mensile", "periodo_da": periodo_da.isoformat(), "periodo_a": periodo_a.isoformat(),
            "markdown": corpo_md,
        }, conflitto="tipo,periodo_da")
        print("✓ riga salvata in sheis_report (tipo=mensile)")
    else:
        print(f"⚠️  {msg} — l'analisi resta comunque su file (vedi sopra), il DB si allinea da solo al prossimo giro utile")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
