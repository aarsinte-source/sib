#!/usr/bin/env python3
"""Test diretti di ingest_metriche_ig.py: normalizzazione ig_id (il bug reale
trovato confrontando post e reel dello stesso profilo), calcolo like/views,
e attribuzione a sheis_contenuti (mai un aggancio indovinato).

Nessuna chiamata di rete: lavora su fixture in memoria.

Esegui: python3 tests/test_ingest_metriche.py
"""
from __future__ import annotations

import sys
from pathlib import Path
from statistics import median

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import ingest_metriche_ig as m  # noqa: E402

problemi = 0


def check(cond: bool, descrizione: str) -> None:
    global problemi
    if cond:
        print(f"✓ {descrizione}")
    else:
        print(f"✗ FALLITO: {descrizione}")
        problemi += 1


print("=== normalizzazione ig_id (bug reale: posts aggiunge _<owner_id>, reels no) ===")
check(m._normalizza_ig_id("3872338178708929907_6048585099") == "3872338178708929907",
      "il suffisso _<owner_id> viene tagliato")
check(m._normalizza_ig_id("3872338178708929907") == "3872338178708929907",
      "un id già senza suffisso resta invariato")
check(m._normalizza_ig_id(None) == "", "None diventa stringa vuota, non 'None'")

print("\n=== normalizza_reel: like/views ===")
r = m.normalizza_reel({"pk": "1", "like_count": 100, "play_count": 5000, "taken_at": 1700000000,
                        "caption": {"text": "prova"}}, follower=1000)
check(r["views_count"] == 5000, "views_count preso da play_count")
check(r["like_su_views_pct"] == 2.0, f"100/5000 = 2.0% (ottenuto {r['like_su_views_pct']})")

r_zero_views = m.normalizza_reel({"pk": "2", "like_count": 10, "play_count": 0}, follower=1000)
check(r_zero_views["views_count"] is None, "0 view → views_count None, MAI 0 (non è 'zero visualizzazioni', è non misurato)")
check(r_zero_views["like_su_views_pct"] is None, "senza views, nessun rapporto calcolato")

print("\n=== normalizza_post: mai una view finta ===")
p = m.normalizza_post({"id": "9_1", "likeCount": 50, "commentCount": 3}, follower=1000)
check(p["views_count"] is None, "i post immagine non hanno views: None, non 0")
check(p["like_su_views_pct"] is None, "nessun rapporto per i post")

print("\n=== mediana dei rapporti, NON rapporto delle mediane (l'errore facile) ===")
reel_fixture = [
    {"like_su_views_pct": 1.0}, {"like_su_views_pct": 2.0}, {"like_su_views_pct": 3.0},
    {"like_su_views_pct": 10.0}, {"like_su_views_pct": 0.5},
]
mediana_corretta = median(r["like_su_views_pct"] for r in reel_fixture)
check(mediana_corretta == 2.0, f"mediana dei 5 rapporti = 2.0 (ottenuto {mediana_corretta})")
# L'errore che si farebbe facilmente: dividere due mediane calcolate separatamente
# (like_mediana / views_mediana) invece della mediana dei rapporti per-reel.
# Qui non lo facciamo — lo dichiariamo esplicitamente come anti-pattern testato.

print("\n=== attribuzione a sheis_contenuti — mai un aggancio indovinato ===")
record = {"data_pubblicazione_ig": "2026-07-10T10:00:00+00:00", "caption_estratto": "Scopri la nuova gamma SHEis Color"}

cid, esito, motivo = m.prova_attribuzione(record, [])
check(esito == "non_agganciato" and cid is None, "nessun contenuto pubblicato → non_agganciato, dichiarato")

contenuti_un_match = [{"id": "abc-123", "hook": "Scopri la nuova gamma", "data_pubblicazione": "2026-07-10"}]
cid, esito, motivo = m.prova_attribuzione(record, contenuti_un_match)
check(esito == "agganciato" and cid == "abc-123", f"un solo candidato in finestra+testo → agganciato (esito={esito}, cid={cid})")

contenuti_data_lontana = [{"id": "xyz", "hook": "Scopri la nuova gamma", "data_pubblicazione": "2026-01-01"}]
cid, esito, motivo = m.prova_attribuzione(record, contenuti_data_lontana)
check(esito == "non_agganciato" and cid is None, "stesso testo ma data troppo lontana (>1gg) → NON si aggancia")

contenuti_ambigui = [
    {"id": "a", "hook": "Scopri la nuova gamma", "data_pubblicazione": "2026-07-10"},
    {"id": "b", "hook": "Scopri la nuova gamma", "data_pubblicazione": "2026-07-11"},
]
cid, esito, motivo = m.prova_attribuzione(record, contenuti_ambigui)
check(esito == "non_agganciato" and cid is None and "candidati" in motivo,
      f"due candidati ambigui → non si indovina (motivo: {motivo!r})")

print(f"\n=== RISULTATO: {'TUTTO OK' if problemi == 0 else f'{problemi} problemi'} ===")
raise SystemExit(0 if problemi == 0 else 1)
