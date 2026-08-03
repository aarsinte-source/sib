#!/usr/bin/env python3
"""ingest_metriche_ig.py — raccoglie periodicamente le metriche reali del
profilo @sheisbeautyhair e le conserva in `sheis_metriche_ig`, così il report
del lunedì può dire cosa ha funzionato e PERCHÉ, invece di dichiarare un buco.

Tre chiamate ScrapeCreators per run (contate in `sc.chiamate_fatte`, mai
gratis): profilo (follower), post (v2/instagram/user/posts), reel
(v1/instagram/user/reels — niente cursore, sempre i più recenti). Le risposte
sono enormi: vengono processate qui dentro e mai stampate per intero — solo i
numeri derivati arrivano su stdout/DB.

**Serie storica, non l'ultimo valore**: ogni run scrive una NUOVA riga per
ogni contenuto (chiave unica ig_id+rilevato_il). Senza due rilevazioni sullo
stesso contenuto non esiste una tendenza — è il punto di questo worker.

**Il segnale che conta**: like/views sui reel. Riferimenti misurati (BRAND-
IDENTITY_sheis_2026-08-03.json, aggiornato dopo la misura sui competitor):
mediana SHEis 1,61%, concorrenti 1,27-3,14%. Sotto 0,5% = rumore (reach senza
risonanza), sopra ~2% = pubblico affine. Questo worker calcola la mediana nel
modo CORRETTO — mediana dei rapporti per-reel, non rapporto fra due mediane
calcolate separatamente (un errore facile: dà un numero diverso e sbagliato).

**Aggancio ai contenuti pubblicati**: quando possibile con ragionevole
certezza (finestra ±1 giorno + frammento di testo della caption in comune),
il contenuto ScrapeCreators viene agganciato a `sheis_contenuti`. Se
l'aggancio non è certo, `attribuzione_esito='non_agganciato'` e il motivo è
scritto — mai un'attribuzione a caso.
"""
from __future__ import annotations

import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from statistics import median

sys.path.insert(0, str(Path(__file__).resolve().parent))

from lib import scrapecreators, supabase  # noqa: E402

LIVE = os.environ.get("LIVE") == "1"
HANDLE = "sheisbeautyhair"
QUI = Path(__file__).resolve().parent
RAW_DIR = QUI / "data" / "raw"
TABELLE_NECESSARIE = ["sheis_metriche_ig"]


# ------------------------------------------------------------------ parsing
def _normalizza_ig_id(raw) -> str:
    """Fatto misurato: /v2/instagram/user/posts restituisce l'id come
    '<media_id>_<owner_id>' (es. '3872338178708929907_6048585099'), mentre
    /v1/instagram/user/reels restituisce lo stesso media come solo
    '3872338178708929907' — gli stessi reel escono su ENTRAMBI gli endpoint,
    perché un reel è anche un "post" video. Senza normalizzare, lo stesso
    contenuto genererebbe due ig_id diversi e due righe scollegate. Si taglia
    il suffisso '_<cifre>' quando presente."""
    s = str(raw or "")
    return re.sub(r"_\d+$", "", s)


def _caption_testo(cap) -> str:
    if isinstance(cap, dict):
        return (cap.get("text") or "").strip()
    return (cap or "").strip()


def _timestamp_a_iso(ts) -> str | None:
    if not ts:
        return None
    try:
        return datetime.fromtimestamp(int(ts), tz=timezone.utc).isoformat()
    except (ValueError, OSError, OverflowError):
        return None


def normalizza_post(item: dict, follower: int | None) -> dict:
    caption = _caption_testo(item.get("caption"))
    return {
        "tipo_contenuto": "post",
        "ig_id": _normalizza_ig_id(item.get("id") or item.get("pk")),
        "ig_code": item.get("code") or item.get("shortcode"),
        "data_pubblicazione_ig": _timestamp_a_iso(item.get("timestamp")),
        "caption_estratto": caption[:200],
        "follower_al_momento": follower,
        "like_count": item.get("likeCount"),
        "comment_count": item.get("commentCount"),
        "views_count": None,  # ScrapeCreators non espone le view sui post immagine: non è zero, è non misurato
        "like_su_views_pct": None,
    }


def normalizza_reel(item: dict, follower: int | None) -> dict:
    # Alcuni item arrivano avvolti sotto "media", altri sono già il reel.
    reel = item.get("media", item) if isinstance(item, dict) else {}
    caption = _caption_testo(reel.get("caption"))
    views = reel.get("play_count") or reel.get("ig_play_count") or 0
    like = reel.get("like_count") or 0
    like_su_views = round(100 * like / views, 4) if views > 0 else None
    return {
        "tipo_contenuto": "reel",
        "ig_id": _normalizza_ig_id(reel.get("pk") or reel.get("id")),
        "ig_code": reel.get("code"),
        "data_pubblicazione_ig": _timestamp_a_iso(reel.get("taken_at")),
        "caption_estratto": caption[:200],
        "follower_al_momento": follower,
        "like_count": like,
        "comment_count": reel.get("comment_count") or 0,
        "views_count": views if views > 0 else None,
        "like_su_views_pct": like_su_views,
    }


# -------------------------------------------------------------- attribuzione
def _norm(s: str) -> str:
    return re.sub(r"\s+", " ", (s or "").strip().lower())


def prova_attribuzione(record: dict, contenuti_pubblicati: list[dict]) -> tuple[str | None, str, str]:
    """(contenuto_id o None, esito, motivo). Mai un aggancio indovinato:
    serve finestra ±1 giorno E un frammento di testo in comune."""
    if not contenuti_pubblicati:
        return None, "non_agganciato", "sheis_contenuti non ha (ancora) contenuti pubblicati da confrontare"

    data_ig = record.get("data_pubblicazione_ig")
    if not data_ig:
        return None, "non_agganciato", "data di pubblicazione IG non disponibile: impossibile restringere la finestra"

    try:
        d_ig = datetime.fromisoformat(data_ig).date()
    except ValueError:
        return None, "non_agganciato", "data di pubblicazione IG malformata"

    caption_norm = _norm(record.get("caption_estratto", ""))
    candidati = []
    for c in contenuti_pubblicati:
        dp = c.get("data_pubblicazione")
        if not dp:
            continue
        try:
            d_c = datetime.fromisoformat(dp).date()
        except ValueError:
            continue
        if abs((d_c - d_ig).days) > 1:
            continue
        frammento = _norm(c.get("hook") or c.get("copy") or "")[:40]
        if frammento and frammento in caption_norm:
            candidati.append(c)

    if len(candidati) == 1:
        return candidati[0]["id"], "agganciato", "finestra ±1 giorno + frammento di caption corrispondente, un solo candidato"
    if len(candidati) == 0:
        return None, "non_agganciato", "nessun contenuto pubblicato in finestra ±1 giorno con caption corrispondente"
    return None, "non_agganciato", f"{len(candidati)} contenuti candidati nella finestra, nessuna corrispondenza univoca — non si indovina"


# ------------------------------------------------------------------- main
def main() -> int:
    print(f"=== ingest_metriche_ig.py — {'LIVE' if LIVE else 'SIMULAZIONE (default)'} — @{HANDLE} ===")

    sc = scrapecreators.ScrapeCreatorsClient()

    if not LIVE:
        print("🧪 DRY-RUN → 3 chiamate che farei (0 crediti consumati):")
        print(f"  GET /v1/instagram/profile?handle={HANDLE}")
        print(f"  GET /v2/instagram/user/posts?handle={HANDLE}&count=50")
        print(f"  GET /v1/instagram/user/reels?handle={HANDLE}&count=30")
        return 0

    if not sc.credenziali_presenti:
        print("⚠️  SCRAPECREATORS_API_KEY assente — impossibile ingerire. Vedi .env.example")
        return 0

    RAW_DIR.mkdir(parents=True, exist_ok=True)
    rilevato_il = datetime.now(timezone.utc).isoformat()
    bollino = rilevato_il.replace(":", "").replace("-", "").split(".")[0]

    print("\n→ profilo…")
    esito_profilo = sc.profilo_instagram(HANDLE)
    follower = None
    if esito_profilo.ok:
        follower = esito_profilo.dati.get("follower_count")
        print(f"  ✓ follower: {follower} — crediti rimasti: {esito_profilo.crediti_rimasti}")
    else:
        print(f"  ✗ {esito_profilo.errore}")

    print("→ post (v2/instagram/user/posts, count=50)…")
    esito_post = sc.post_instagram(HANDLE, count=50)
    post_items = []
    if esito_post.ok:
        post_items = esito_post.dati.get("items", [])
        (RAW_DIR / f"ig_posts_{bollino}.json").write_text(json.dumps(esito_post.dati, ensure_ascii=False), encoding="utf-8")
        print(f"  ✓ {len(post_items)} post — crediti rimasti: {esito_post.crediti_rimasti}")
    else:
        print(f"  ✗ {esito_post.errore}")

    print("→ reel (v1/instagram/user/reels, count=30)…")
    esito_reel = sc.reel_instagram(HANDLE, count=30)
    reel_items = []
    if esito_reel.ok:
        reel_items = esito_reel.dati.get("items", [])
        (RAW_DIR / f"ig_reels_{bollino}.json").write_text(json.dumps(esito_reel.dati, ensure_ascii=False), encoding="utf-8")
        print(f"  ✓ {len(reel_items)} reel — crediti rimasti: {esito_reel.crediti_rimasti}")
    else:
        print(f"  ✗ {esito_reel.errore}")

    print(f"\n✓ chiamate ScrapeCreators fatte in QUESTO run: {sc.chiamate_fatte}")

    # ------------------------------------------------------------ normalizza
    record_post = [normalizza_post(it, follower) for it in post_items]
    record_reel = [normalizza_reel(it, follower) for it in reel_items]

    # I reel escono ANCHE nel feed dei post (stesso ig_id normalizzato): si
    # tiene la versione reel, più ricca (ha le view), e si scarta il duplicato
    # in forma "post" per non contare due volte lo stesso contenuto né
    # scontrarsi sulla chiave unica (ig_id, rilevato_il).
    id_reel = {r["ig_id"] for r in record_reel if r["ig_id"]}
    scartati = [r for r in record_post if r["ig_id"] in id_reel]
    record_post = [r for r in record_post if r["ig_id"] not in id_reel]
    if scartati:
        print(f"  ℹ️  {len(scartati)} contenuti risultavano sia in 'post' sia in 'reel' (stesso ig_id): "
              f"tenuta solo la versione reel, con le view")

    tutti = [r for r in record_post + record_reel if r["ig_id"]]
    for r in tutti:
        r["rilevato_il"] = rilevato_il

    # ------------------------------------------------------------ attribuzione
    db = supabase.SupabaseClient()
    pronto_contenuti, _ = db.schema_pronto(["sheis_contenuti"])
    contenuti_pubblicati = []
    if pronto_contenuti:
        esito_c = db.select("sheis_contenuti", query="select=id,hook,copy,data_pubblicazione&stato=eq.pubblicato")
        if esito_c.ok:
            contenuti_pubblicati = esito_c.dati

    for r in tutti:
        cid, esito_attr, motivo = prova_attribuzione(r, contenuti_pubblicati)
        r["contenuto_id"] = cid
        r["attribuzione_esito"] = esito_attr
        r["attribuzione_motivo"] = motivo

    n_agganciati = sum(1 for r in tutti if r["attribuzione_esito"] == "agganciato")

    # Riepilogo COMPATTO (poche decine di KB, non le centinaia della risposta
    # grezza): serve a report_settimanale.py come fallback quando la tabella
    # sheis_metriche_ig non esiste ancora — vista reale, non finta, in attesa
    # che il DB sia pronto.
    riepilogo_path = QUI / "data" / "METRICHE-IG_ultima-rilevazione.json"
    riepilogo_path.write_text(json.dumps({
        "rilevato_il": rilevato_il, "handle": HANDLE, "follower": follower, "record": tutti,
    }, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"✓ riepilogo compatto scritto in {riepilogo_path}")

    # ------------------------------------------------------------ scrittura DB
    pronto_metriche, msg = db.schema_pronto(TABELLE_NECESSARIE)
    if pronto_metriche:
        scritte = 0
        for r in tutti:
            esito = db.upsert("sheis_metriche_ig", r, conflitto="ig_id,rilevato_il")
            if esito.ok:
                scritte += 1
        print(f"✓ {scritte}/{len(tutti)} rilevazioni scritte in sheis_metriche_ig")
    else:
        print(f"⚠️  {msg}")
        print(f"   {len(tutti)} rilevazioni calcolate ma NON salvate nel DB — restano nei file raw in {RAW_DIR}")

    # ------------------------------------------------------------ statistiche
    reel_con_views = [r for r in record_reel if r["like_su_views_pct"] is not None]
    mediana_like_views = round(median(r["like_su_views_pct"] for r in reel_con_views), 3) if reel_con_views else None

    print("\n=== RISULTATO ===")
    print(f"post raccolti: {len(record_post)}")
    print(f"reel raccolti: {len(record_reel)} (di cui {len(reel_con_views)} con views > 0)")
    print(f"rilevazioni totali (post+reel): {len(tutti)}")
    print(f"agganciati a sheis_contenuti: {n_agganciati}/{len(tutti)}")
    if mediana_like_views is not None:
        print(f"like/views mediano sui reel (mediana dei rapporti per-reel, calcolata ora): {mediana_like_views}%")
        print("   riferimento in BRAND-IDENTITY_sheis_2026-08-03.json: 1,61% (misurato su 12 reel, 17/06/25→10/04/26)")
        scarto = round(mediana_like_views - 1.61, 3)
        print(f"   scarto dal riferimento: {scarto:+.3f} punti percentuali"
              + (" — coincide" if abs(scarto) < 0.05 else " — NON coincide: campione diverso (i reel più recenti, non gli stessi 12)"))
    else:
        print("like/views mediano: non calcolabile (nessun reel con views > 0 in questo run)")

    if reel_con_views:
        migliore = max(reel_con_views, key=lambda r: r["like_su_views_pct"])
        peggiore = min(reel_con_views, key=lambda r: r["like_su_views_pct"])
        print(f"\nmiglior reel per affinità: {migliore['like_su_views_pct']}% like/views — "
              f"«{migliore['caption_estratto'][:80]}…»")
        print(f"peggior reel per affinità: {peggiore['like_su_views_pct']}% like/views — "
              f"«{peggiore['caption_estratto'][:80]}…»")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
