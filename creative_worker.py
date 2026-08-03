#!/usr/bin/env python3
"""creative_worker.py — genera le 3 varianti per ogni contenuto approvato.

Le tre varianti differiscono per **una variabile dichiarata** — qui
l'inquadratura/ambientazione — salvata in `sheis_varianti.angolo_visivo`: chi
sceglie deve capire CHE COSA sta scegliendo, non solo vedere tre immagini diverse.

Gate di costo OBBLIGATORIO prima di ogni generazione (1 credito = €0,033,
misurato). Se il tetto giornaliero Higgsfield scatta durante il batch, la
variante in corso va in `errore` col motivo in italiano, e le SORELLE (le
varianti successive, per questo contenuto e per quelli dopo in coda) non
partono — mai un fallimento silenzioso che il resto del run ignora.

Ogni prompt è vincolato a BRAND-IDENTITY: palette (#0B2A4A blu profondo,
#C9A227 oro sobrio), registro luxury sobrio, MAI un prezzo o un CTA d'acquisto
nell'immagine.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from lib import higgsfield, supabase  # noqa: E402

LIVE = os.environ.get("LIVE") == "1"
TABELLE_NECESSARIE = ["sheis_contenuti", "sheis_varianti"]

# Le tre varianti dichiarate — SEMPRE la stessa terna, per costruzione: chi
# approva impara a leggerle ("questa è la vicina, questa è la larga...").
VARIANTI_DICHIARATE = [
    {
        "angolo_visivo": "primo piano prodotto, fondo neutro studio",
        "istruzione": "inquadratura macro/primo piano sul prodotto, sfondo studio pulito e neutro, luce frontale morbida",
    },
    {
        "angolo_visivo": "ambientazione in salone, sul banco da lavoro",
        "istruzione": "prodotto ambientato su un banco da lavoro da salone professionale, contesto reale ma ordinato, luce ambiente calda",
    },
    {
        "angolo_visivo": "piano ampio lifestyle stagionale",
        "istruzione": "piano ampio, ambientazione lifestyle coerente con la stagione/occasione, prodotto presente ma non invasivo, luce naturale",
    },
]

VINCOLO_BRAND = (
    "Registro luxury sobrio, mai gridato. Palette: blu profondo #0B2A4A, oro sobrio #C9A227, "
    "neutri bianco/crema/nero. Nessun prezzo, nessuna cifra, nessun testo che inviti all'acquisto "
    "nell'immagine. Nessun riferimento a 'Metodo 29' in nessuna forma."
)


def prompt_variante(contenuto: dict, variante: dict) -> str:
    base = contenuto.get("prompt_creativo") or contenuto.get("hook") or contenuto.get("copy") or ""
    brand = contenuto.get("brand") or "SHEis"
    return (
        f"{base.strip()} — brand: {brand}. {variante['istruzione']}. {VINCOLO_BRAND}"
    ).strip()


def varianti_esistenti(db: supabase.SupabaseClient, contenuto_id: str) -> set[int]:
    esito = db.select("sheis_varianti", query=f"select=indice,stato&contenuto_id=eq.{contenuto_id}")
    if not esito.ok:
        return set()
    return {r["indice"] for r in esito.dati if r.get("stato") in ("pronta", "approvata", "in_corso")}


def genera_per_contenuto(db: supabase.SupabaseClient, contenuto: dict, tetto_raggiunto: list[bool]) -> str:
    cid = contenuto["id"]
    gia_fatte = varianti_esistenti(db, cid)
    if len(gia_fatte) >= 3:
        print(f"  ⏭️  {cid[:8]}… — già ha {len(gia_fatte)} varianti, salto (idempotenza)")
        return "idempotente"

    esito_finale = "generato"
    for i, variante in enumerate(VARIANTI_DICHIARATE, start=1):
        if i in gia_fatte:
            continue
        if tetto_raggiunto[0]:
            print(f"  🛑 {cid[:8]}…/variante {i} — NON generata: tetto giornaliero già raggiunto in questo run")
            db.upsert("sheis_varianti", {
                "contenuto_id": cid, "indice": i,
                "prompt": prompt_variante(contenuto, variante),
                "angolo_visivo": variante["angolo_visivo"],
                "stato": "errore",
                "errore": "tetto giornaliero Higgsfield raggiunto in questo run — variante non tentata, riprovare domani",
            }, conflitto="contenuto_id,indice")
            esito_finale = "bloccato_tetto"
            continue

        prompt = prompt_variante(contenuto, variante)
        crediti_stimati = higgsfield.CREDITI_DEFAULT_PER_VARIANTE
        ok_gate, msg_gate = higgsfield.gate_costo(crediti_stimati)
        print(f"  · {cid[:8]}…/variante {i} ({variante['angolo_visivo']}) — {msg_gate}")

        risultato = higgsfield.genera_variante(prompt, crediti_stimati=crediti_stimati, live=LIVE)
        riga = {
            "contenuto_id": cid, "indice": i, "prompt": prompt,
            "angolo_visivo": variante["angolo_visivo"],
            "provider": risultato.provider, "costo_crediti": risultato.costo_crediti,
            "costo_eur": risultato.costo_eur, "stato": risultato.stato,
            "errore": risultato.errore, "asset_url": risultato.asset_url,
        }
        db.upsert("sheis_varianti", riga, conflitto="contenuto_id,indice")

        if risultato.tetto_raggiunto:
            print(f"    🛑 TETTO GIORNALIERO: {risultato.errore}")
            tetto_raggiunto[0] = True
            esito_finale = "bloccato_tetto"
        elif risultato.ok:
            print(f"    ✓ {risultato.stato} — costo €{risultato.costo_eur:.3f}"
                  + (f" (SIMULATO)" if not LIVE else ""))
        else:
            print(f"    ✗ errore: {risultato.errore}")
            esito_finale = "errore"

    return esito_finale


def main() -> int:
    print(f"=== creative_worker.py — {'LIVE' if LIVE else 'SIMULAZIONE (default)'} ===")
    print(f"soglia di conferma: €{os.environ.get('SHEIS_CREATIVE_SOGLIA_EUR', higgsfield.SOGLIA_EUR_DEFAULT)}")

    db = supabase.SupabaseClient()
    pronto, msg = db.schema_pronto(TABELLE_NECESSARIE)
    if not pronto:
        print(f"⚠️  {msg}")
        print("   Il worker si ferma qui, in modo pulito: niente da generare finché lo schema non esiste.")
        return 0
    print(f"✓ {msg}")

    esito = db.select("sheis_contenuti", query="select=*&stato=eq.approvato")
    if not esito.ok:
        print(f"⚠️  errore leggendo sheis_contenuti: {esito.errore}")
        return 0

    contenuti = esito.dati
    print(f"→ {len(contenuti)} contenuti in stato 'approvato'")
    tetto_raggiunto = [False]
    conteggi: dict[str, int] = {}
    for c in contenuti:
        esito_c = genera_per_contenuto(db, c, tetto_raggiunto)
        conteggi[esito_c] = conteggi.get(esito_c, 0) + 1
        if tetto_raggiunto[0]:
            print("🛑 tetto giornaliero raggiunto: interrompo il run, i contenuti restanti restano in coda per il prossimo giro")
            break

    print("\n=== riepilogo ===")
    if not contenuti:
        print("  nessun contenuto da processare in questo run")
    for chiave, n in sorted(conteggi.items()):
        print(f"  {chiave}: {n}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
