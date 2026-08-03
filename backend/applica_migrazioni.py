#!/usr/bin/env python3
"""Applica le migrazioni SQL al progetto Supabase di SHEis.

Perché esiste: la chiave di servizio (`SUPABASE_SECRET_KEY`, formato `sb_secret_…`)
sa leggere e scrivere le RIGHE via PostgREST, ma **non sa creare tabelle**. Il DDL
passa dalla Management API, che accetta solo un Personal Access Token (`sbp_…`).
Misurato il 2026-08-03: con la sola chiave di servizio la Management API risponde
401 «JWT could not be decoded», e le tabelle `sheis_*` non esistono ancora.

Come ottenere il token, una volta sola:
    https://supabase.com/dashboard/account/tokens  →  «Generate new token»
Poi:
    export SUPABASE_ACCESS_TOKEN=sbp_...
    python3 applica_migrazioni.py            # anteprima: non scrive
    python3 applica_migrazioni.py --applica  # esegue davvero

Le migrazioni sono idempotenti: rieseguirle non fa danni.
"""
import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

QUI = Path(__file__).resolve().parent
MIGRAZIONI = QUI / "migrations"


def carica_env() -> dict:
    """Legge il .env accanto a questo file. Solo questo: mai risalire ad altri
    progetti — è esattamente così che, su un altro cliente, un fallback ha pescato
    le credenziali sbagliate e ha scritto a una persona vera."""
    valori = {}
    f = QUI / ".env"
    if f.exists():
        for riga in f.read_text(encoding="utf-8").splitlines():
            riga = riga.strip()
            if not riga or riga.startswith("#") or "=" not in riga:
                continue
            k, _, v = riga.partition("=")
            valori[k.strip()] = v.strip().strip('"').strip("'")
    for k in ("SUPABASE_PROJECT_REF", "SUPABASE_URL", "SUPABASE_SECRET_KEY", "SUPABASE_ACCESS_TOKEN"):
        if os.environ.get(k):
            valori[k] = os.environ[k]
    return valori


def esegui_sql(ref: str, token: str, sql: str) -> tuple[bool, str]:
    url = f"https://api.supabase.com/v1/projects/{ref}/database/query"
    req = urllib.request.Request(
        url,
        data=json.dumps({"query": sql}).encode("utf-8"),
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return True, r.read().decode("utf-8")[:400]
    except urllib.error.HTTPError as e:
        corpo = e.read().decode("utf-8")[:600]
        return False, f"HTTP {e.code} — {corpo}"
    except Exception as e:  # rete, timeout
        return False, f"{type(e).__name__}: {e}"


def verifica_tabelle(url: str, chiave: str, attese: list[str]) -> dict:
    """Chiede a PostgREST se le tabelle rispondono. È la prova che il DDL è
    passato davvero, non la fiducia nel fatto che la chiamata non abbia dato errore."""
    esiti = {}
    for t in attese:
        req = urllib.request.Request(
            f"{url}/rest/v1/{t}?select=*&limit=0",
            headers={"apikey": chiave, "Authorization": f"Bearer {chiave}"},
        )
        try:
            with urllib.request.urlopen(req, timeout=20) as r:
                esiti[t] = r.status == 200
        except urllib.error.HTTPError as e:
            esiti[t] = False if e.code == 404 else True
        except Exception:
            esiti[t] = False
    return esiti


TABELLE_ATTESE = [
    "sheis_distributori", "sheis_catalogo", "sheis_ordini", "sheis_ordine_righe",
    "sheis_foto_ordini", "sheis_piani", "sheis_contenuti", "sheis_approvazioni_log",
    "sheis_utenti", "sheis_varianti", "sheis_pubblicazioni", "sheis_candidati",
    "sheis_campagne", "sheis_articoli", "sheis_report",
]


def main() -> int:
    p = argparse.ArgumentParser(description="Applica le migrazioni SQL a Supabase")
    p.add_argument("--applica", action="store_true", help="esegue davvero (senza, è solo anteprima)")
    p.add_argument("--verifica", action="store_true", help="controlla solo quali tabelle esistono")
    args = p.parse_args()

    env = carica_env()
    ref = env.get("SUPABASE_PROJECT_REF")
    url = env.get("SUPABASE_URL")
    chiave = env.get("SUPABASE_SECRET_KEY")
    token = env.get("SUPABASE_ACCESS_TOKEN")

    if not ref or not url:
        print("✗ Manca SUPABASE_PROJECT_REF o SUPABASE_URL nel .env")
        return 1

    print(f"progetto: {ref}")

    if args.verifica or not args.applica:
        print("\n── tabelle presenti adesso ──")
        esiti = verifica_tabelle(url, chiave, TABELLE_ATTESE)
        for t, ok in esiti.items():
            print(f"  {'✓' if ok else '·'} {t}")
        mancanti = [t for t, ok in esiti.items() if not ok]
        print(f"\n  {len(esiti) - len(mancanti)}/{len(esiti)} presenti")
        if args.verifica:
            return 0

    file_sql = sorted(MIGRAZIONI.glob("*.sql"))
    print(f"\n── migrazioni trovate: {len(file_sql)} ──")
    for f in file_sql:
        print(f"  · {f.name} ({len(f.read_text(encoding='utf-8').splitlines())} righe)")

    if not args.applica:
        print("\nAnteprima. Per eseguire davvero serve un Personal Access Token:")
        print("  https://supabase.com/dashboard/account/tokens")
        print("  export SUPABASE_ACCESS_TOKEN=sbp_...")
        print("  python3 applica_migrazioni.py --applica")
        return 0

    if not token:
        print("\n✗ Manca SUPABASE_ACCESS_TOKEN (formato sbp_...).")
        print("  La chiave di servizio NON basta: sa scrivere righe, non creare tabelle.")
        print("  Generane uno qui: https://supabase.com/dashboard/account/tokens")
        return 2
    if not token.startswith("sbp_"):
        print(f"\n⚠️  Il token non inizia per 'sbp_' (inizia per '{token[:8]}…').")
        print("  Se è la chiave di servizio, non funzionerà: serve un Personal Access Token.")

    for f in file_sql:
        print(f"\n→ {f.name}")
        ok, msg = esegui_sql(ref, token, f.read_text(encoding="utf-8"))
        print(("  ✓ applicata" if ok else "  ✗ FALLITA") + (f" — {msg}" if not ok else ""))
        if not ok:
            return 3

    print("\n── verifica dopo l'applicazione ──")
    esiti = verifica_tabelle(url, chiave, TABELLE_ATTESE)
    for t, ok in esiti.items():
        print(f"  {'✓' if ok else '✗'} {t}")
    mancanti = [t for t, ok in esiti.items() if not ok]
    if mancanti:
        print(f"\n✗ Mancano ancora: {', '.join(mancanti)}")
        return 4
    print(f"\n✓ Tutte le {len(esiti)} tabelle rispondono.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
