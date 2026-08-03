#!/usr/bin/env python3
"""publisher_zernio.py — mette in coda / pubblica su Zernio i contenuti SHEis
approvati e programmati.

Pipeline per ogni riga di `sheis_contenuti` con `stato='programmato'`:

  1. idempotenza — se (contenuto_id, canale) risulta già 'inviato'/'pubblicato'
     in `sheis_pubblicazioni`, si salta: un rerun non ripubblica.
  2. linter di marca — blocca prezzi/cifre, lessico da negozio (multilingua),
     «Metodo 29» in ogni grafia, claim numerici non documentati. Un BLOCK ferma
     TUTTO: si scrive stato='bloccato' con il motivo esatto, si passa oltre.
  3. gate account Zernio — verifica IN TEMPO REALE (non da un commento nel
     codice) che esista un account SHEis collegato per quel canale. Oggi (fatto
     misurato) la chiave Zernio vede SOLO 2 account Alkemia: nessuna
     pubblicazione SHEis può quindi mai passare questo gate, ed è voluto.
     Pubblicare "per prova" sui canali Alkemia è vietato: è peggio che non
     pubblicare.
  4. finestra oraria — 08:00-18:30 Europe/Rome, mai domenica.
  5. invio reale — SOLO con LIVE=1. Il default è simulazione: stampa cosa
     partirebbe, non tocca Zernio in scrittura (la lista account in LETTURA
     viene comunque interrogata: è come si verifica il gate 3, non è un invio).

Il database non ancora inizializzato è uno STATO dichiarato, non un crash.
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from lib import canali, finestra, linter, supabase, zernio  # noqa: E402

LIVE = os.environ.get("LIVE") == "1"
TABELLE_NECESSARIE = ["sheis_contenuti", "sheis_varianti", "sheis_pubblicazioni", "sheis_approvazioni_log"]


def testo_da_lintare(contenuto: dict) -> str:
    pezzi = [contenuto.get("hook") or "", contenuto.get("copy") or "", contenuto.get("cta") or ""]
    hashtag = contenuto.get("hashtag") or []
    if hashtag:
        pezzi.append(" ".join(f"#{h.lstrip('#')}" for h in hashtag))
    if contenuto.get("copy_secondario"):
        pezzi.append(contenuto["copy_secondario"])
    return "\n\n".join(p for p in pezzi if p.strip())


def gia_pubblicato(db: supabase.SupabaseClient, contenuto_id: str, canale: str) -> bool:
    esito = db.select(
        "sheis_pubblicazioni",
        query=f"select=stato&contenuto_id=eq.{contenuto_id}&canale=eq.{canale}",
    )
    if not esito.ok:
        return False
    return any(r.get("stato") in ("inviato", "pubblicato") for r in esito.dati)


def account_sheis_per_canale(canale: str, account_live: list[dict], mappa_attesa: dict) -> tuple[bool, str]:
    """Verifica REALE: la chiave Zernio ha in QUESTO momento un account CON
    L'IDENTITÀ SHEis attesa per questo canale? Non basta che esista *un*
    account su quella piattaforma — oggi l'unico account instagram è quello
    personale di Andrei, e un controllo di sola piattaforma lo farebbe
    passare per "SHEis". Qui si confronta l'identità VERA restituita da
    Zernio (username, o l'id interno `_id`) con quella dichiarata in
    `config/workers.json`.

    ⚠️ Bug reale trovato e corretto (revisione avversariale 2026-08-03): la
    versione precedente leggeva `atteso_id` solo per controllare che NON
    fosse vuoto, poi verificava solo `platform == canale` — qualunque valore
    non-vuoto in config, anche un segnaposto scritto per errore, avrebbe
    fatto passare l'unico account esistente su quella piattaforma (quello di
    Andrei). "Impossibile per costruzione" richiede un confronto vero, non
    un controllo di presenza.
    """
    riepilogo = ", ".join(
        f"{a['platform']}:{a.get('username') or a.get('display_name') or a.get('zernio_account_id')}"
        for a in account_live
    ) or "nessuno"

    atteso = (mappa_attesa.get("zernio_account_ids_sheis", {}) or {}).get(canale)
    if not atteso or not isinstance(atteso, dict):
        return False, (
            f"nessuna identità SHEis configurata per il canale '{canale}' in "
            f"config/workers.json→zernio_account_ids_sheis (serve un oggetto con "
            f"'username' e/o 'zernio_account_id', non una stringa vuota o segnaposto) "
            f"— verificato ora: la chiave Zernio vede {len(account_live)} account ({riepilogo}). "
            "Collegare l'account SHEis via OAuth su Zernio e configurare qui la sua identità reale."
        )

    atteso_username = (str(atteso.get("username") or "")).strip().lower() or None
    atteso_id = (str(atteso.get("zernio_account_id") or "")).strip() or None
    if not atteso_username and not atteso_id:
        return False, (
            f"la configurazione per '{canale}' non contiene né 'username' né 'zernio_account_id' "
            "validi — non verificabile, blocco per sicurezza invece di assumere un match"
        )

    for a in account_live:
        if a.get("platform") != canale:
            continue
        if atteso_id and a.get("zernio_account_id") == atteso_id:
            return True, f"account SHEis verificato per identità (zernio_account_id={atteso_id})"
        if atteso_username and (a.get("username") or "").strip().lower() == atteso_username:
            return True, f"account SHEis verificato per identità (username={atteso_username})"

    riferimento = f"zernio_account_id={atteso_id}" if atteso_id else f"username={atteso_username}"
    return False, (
        f"nessun account su '{canale}' corrisponde all'identità SHEis attesa ({riferimento}) — "
        f"trovati invece: {riepilogo}. Non pubblico su un'identità diversa da quella dichiarata, "
        "anche se esiste un account sulla stessa piattaforma."
    )


def gestisci_candidato(db: supabase.SupabaseClient, zc: zernio.ZernioClient, contenuto: dict,
                        account_live: list[dict], mappa_attesa: dict) -> str:
    cid = contenuto["id"]
    canale = (contenuto.get("canale") or "").strip()
    if not canale:
        print(f"  ⏭️  {cid[:8]}… — nessun 'canale' impostato, salto")
        return "saltato"

    if gia_pubblicato(db, cid, canale):
        print(f"  ⏭️  {cid[:8]}…/{canale} — già pubblicato in precedenza (idempotenza), salto")
        return "idempotente"

    testo = testo_da_lintare(contenuto)
    esito_lint = linter.lint_pubblicazione(testo, canale=canale)
    if not esito_lint.ok:
        motivo = esito_lint.motivo_blocco()
        print(f"  🛑 {cid[:8]}…/{canale} — BLOCCATO dal linter:\n{esito_lint.render()}")
        db.upsert("sheis_pubblicazioni", {
            "contenuto_id": cid, "canale": canale, "stato": "bloccato",
            "motivo_blocco": motivo,
            "linter_esito": json.dumps([v.__dict__ for v in esito_lint.violazioni]),
        }, conflitto="contenuto_id,canale")
        return "bloccato_linter"

    ok_account, msg_account = account_sheis_per_canale(canale, account_live, mappa_attesa)
    if not ok_account:
        print(f"  🛑 {cid[:8]}…/{canale} — BLOCCATO: {msg_account}")
        db.upsert("sheis_pubblicazioni", {
            "contenuto_id": cid, "canale": canale, "stato": "bloccato",
            "motivo_blocco": msg_account,
        }, conflitto="contenuto_id,canale")
        return "bloccato_account"

    ok_finestra, msg_finestra = finestra.dentro_finestra()
    if not ok_finestra:
        print(f"  ⏳ {cid[:8]}…/{canale} — {msg_finestra}: resta in coda per il prossimo run")
        db.upsert("sheis_pubblicazioni", {
            "contenuto_id": cid, "canale": canale, "stato": "in_coda",
            "motivo_blocco": "",
        }, conflitto="contenuto_id,canale")
        return "in_coda_finestra"

    if not LIVE:
        print(f"  🧪 DRY-RUN {cid[:8]}…/{canale} — passerebbe TUTTI i gate. Payload che partirebbe:")
        print(f"      testo: {testo[:120]}…")
        db.upsert("sheis_pubblicazioni", {
            "contenuto_id": cid, "canale": canale, "stato": "in_coda", "motivo_blocco": "",
        }, conflitto="contenuto_id,canale")
        return "dry_run_pronto"

    esito = zc.crea_post(testo, [canale])
    if esito.ok:
        print(f"  ✅ {cid[:8]}…/{canale} — pubblicato")
        db.upsert("sheis_pubblicazioni", {
            "contenuto_id": cid, "canale": canale, "stato": "inviato",
            "zernio_post_id": str((esito.dati or {}).get("id", "")),
        }, conflitto="contenuto_id,canale")
        return "pubblicato"
    print(f"  ❌ {cid[:8]}…/{canale} — invio fallito: {esito.errore}")
    db.upsert("sheis_pubblicazioni", {
        "contenuto_id": cid, "canale": canale, "stato": "fallito", "ultimo_errore": esito.errore,
    }, conflitto="contenuto_id,canale")
    return "fallito"


def main() -> int:
    print(f"=== publisher_zernio.py — {'LIVE' if LIVE else 'SIMULAZIONE (default)'} ===")

    db = supabase.SupabaseClient()
    pronto, msg = db.schema_pronto(TABELLE_NECESSARIE)
    if not pronto:
        print(f"⚠️  {msg}")
        print("   Il worker si ferma qui, in modo pulito: niente da pubblicare finché lo schema non esiste.")
        return 0
    print(f"✓ {msg}")

    zc = zernio.ZernioClient()
    esito_acc = zc.accounts()
    if not esito_acc.ok:
        print(f"⚠️  impossibile leggere gli account Zernio: {esito_acc.errore}")
        print("   Nessuna pubblicazione può procedere senza sapere quali account esistono davvero.")
        return 0
    account_live = zernio.account_per_brand(esito_acc)
    print(f"✓ account Zernio verificati ora: {len(account_live)} "
          f"({', '.join(a['platform'] for a in account_live) or 'nessuno'})")

    try:
        mappa_attesa = json.loads((Path(__file__).parent / "config" / "workers.json").read_text())
    except (OSError, ValueError):
        mappa_attesa = {}

    esito_candidati = db.select("sheis_contenuti", query="select=*&stato=eq.programmato")
    if not esito_candidati.ok:
        print(f"⚠️  errore leggendo sheis_contenuti: {esito_candidati.errore}")
        return 0

    candidati = esito_candidati.dati
    print(f"→ {len(candidati)} contenuti in stato 'programmato'")
    conteggi: dict[str, int] = {}
    for c in candidati:
        esito = gestisci_candidato(db, zc, c, account_live, mappa_attesa)
        conteggi[esito] = conteggi.get(esito, 0) + 1

    print("\n=== riepilogo ===")
    if not candidati:
        print("  nessun contenuto da processare in questo run")
    for chiave, n in sorted(conteggi.items()):
        print(f"  {chiave}: {n}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
