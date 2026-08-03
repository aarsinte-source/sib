#!/usr/bin/env python3
"""Porta i candidati trovati dalla discovery Instagram dentro lo Studio.

PERCHÉ ESISTE
-------------
La discovery Instagram gira dentro `~/alkemia-sheis-outreach` e scrive in un
SQLite locale. Lo Studio legge da Supabase. Nessuno dei due sbaglia da solo, ma
insieme producono il difetto peggiore di tutti: **112 prospect reali, già
trovati, già classificati e già scorati, che nessuno vedrà mai**. Non c'è un
errore, non c'è un avviso — c'è solo una tabella vuota nell'interfaccia e una
piena sul disco.

I due lati chiamano le stesse cose con nomi diversi. Sei campi su diciassette:

    SQLite (discovery)      →  Supabase (Studio)
    full_name               →  nome
    followers               →  follower
    city                    →  citta
    zone                    →  zona
    business_email          →  email
    motivo_score            →  tipo_motivo

L'ultimo è quello che conta davvero. `motivo_score` non è un numero: è la frase
che spiega PERCHÉ un profilo è stato classificato come distributore invece che
come salone — «parole distribuzione in bio: per parrucchieri, forniture; +20
confidenza classificazione». Senza quella frase, chi apre lo Studio vede un
punteggio e deve fidarsi. Con quella frase può dissentire, che è il solo modo in
cui un punteggio automatico diventa utile a una persona.

COSA FA
-------
  (senza argomenti)  dice cosa passerebbe, e non scrive niente
  --scrivi           scrive davvero su Supabase

È idempotente: si può rilanciare quante volte si vuole. I candidati che nel
frattempo sono stati promossi o scartati **dallo Studio** non vengono riportati
indietro allo stato «nuovo» — lo stato lo possiede lo Studio, non la discovery.
"""
import argparse
import json
import os
import sqlite3
import sys
import urllib.error
import urllib.request
from pathlib import Path

SQLITE = Path.home() / "alkemia-sheis-outreach" / "data" / "outreach.db"
ENV = Path.home() / "alkemia-sheis-studio" / ".env.local"

# I sei campi che cambiano nome fra i due lati, più quelli che coincidono.
MAPPA = {
    "username": "username",
    "full_name": "nome",
    "bio": "bio",
    "followers": "follower",
    "city": "citta",
    "zone": "zona",
    "tipo": "tipo",
    "motivo_score": "tipo_motivo",
    "score": "score",
    "hook": "hook",
    "hook_fonte": "hook_fonte",
    "business_email": "email",
    "scoperto_da": "scoperto_da",
}

# Lo stato vive nello Studio: qui si porta solo la prima volta.
STATI_CHE_LO_STUDIO_POSSIEDE = {"promosso", "scartato", "in_sequenza", "risposto"}

# ⚠️ Col TRATTINO. La prima volta che questo ponte è girato, il database ha
# rifiutato tutti e 112 i candidati: la discovery scriveva «non_pertinente» col
# trattino basso, il vincolo voleva «non-pertinente». La regola era scritta da
# giorni nel vocabolario canonico; mancava l'elenco dei VALORI, così ognuno dei
# tre lati l'ha dedotta per conto suo. Ora è dichiarata alla fonte
# (§_vocabolario_canonico.classificazione_candidato) e qui si verifica PRIMA di
# spedire, così l'errore lo spiega questo script invece di un codice 23514.
TIPI_AMMESSI = {"salone", "distributore", "non-pertinente", "incerto"}


def leggi_env() -> tuple[str, str]:
    if not ENV.is_file():
        sys.exit(f"✗ Manca {ENV}: non so a quale Supabase parlare.")
    valori = {}
    for riga in ENV.read_text(encoding="utf-8").splitlines():
        riga = riga.strip()
        if riga.startswith("#") or "=" not in riga:
            continue
        k, _, v = riga.partition("=")
        valori[k.strip()] = v.strip()
    url = os.environ.get("SUPABASE_URL") or valori.get("SUPABASE_URL", "")
    key = os.environ.get("SUPABASE_SECRET_KEY") or valori.get("SUPABASE_SECRET_KEY", "")
    if not url or not key:
        sys.exit("✗ SUPABASE_URL o SUPABASE_SECRET_KEY mancanti in .env.local.")
    return url.rstrip("/"), key


def chiama(url: str, key: str, percorso: str, metodo="GET", corpo=None, prefer=None):
    req = urllib.request.Request(
        f"{url}/rest/v1/{percorso}",
        method=metodo,
        data=json.dumps(corpo).encode() if corpo is not None else None,
        headers={
            "apikey": key,
            "authorization": f"Bearer {key}",
            "content-type": "application/json",
            **({"prefer": prefer} if prefer else {}),
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=45) as r:
            testo = r.read().decode()
            return json.loads(testo) if testo.strip() else []
    except urllib.error.HTTPError as e:
        dettaglio = e.read().decode()[:400]
        sys.exit(f"✗ Supabase ha risposto {e.code}: {dettaglio}")
    except urllib.error.URLError as e:
        sys.exit(f"✗ Supabase non raggiungibile: {e.reason}")


def normalizza(riga: sqlite3.Row) -> dict:
    fuori = {}
    for da, a in MAPPA.items():
        v = riga[da]
        # La stringa vuota non è un dato: è l'assenza di un dato scritta male.
        # Salvarla come "" fa sembrare compilato un campo che non lo è.
        if isinstance(v, str) and not v.strip():
            v = None
        fuori[a] = v
    return fuori


def main() -> int:
    ap = argparse.ArgumentParser(description="Porta i candidati della discovery nello Studio")
    ap.add_argument("--scrivi", action="store_true", help="scrive davvero (senza, dice solo cosa farebbe)")
    args = ap.parse_args()

    if not SQLITE.is_file():
        sys.exit(f"✗ Nessun database della discovery in {SQLITE}.")

    con = sqlite3.connect(f"file:{SQLITE}?mode=ro", uri=True)
    con.row_factory = sqlite3.Row
    locali = list(con.execute("select * from candidates"))
    if not locali:
        print("Nessun candidato nella discovery: niente da portare.")
        return 0

    url, key = leggi_env()
    remoti = chiama(url, key, "sheis_candidati?select=username,stato")
    stato_remoto = {r["username"]: r["stato"] for r in remoti}

    fuori_vocabolario = sorted({r["tipo"] for r in locali
                                if r["tipo"] and r["tipo"] not in TIPI_AMMESSI})
    if fuori_vocabolario:
        print("✗ La discovery usa classificazioni fuori dal vocabolario canonico:")
        for t in fuori_vocabolario:
            n = sum(1 for r in locali if r["tipo"] == t)
            suggerito = t.replace("_", "-")
            extra = f" — forse intendeva «{suggerito}»" if suggerito in TIPI_AMMESSI else ""
            print(f"    «{t}» su {n} candidati{extra}")
        print(f"  Ammessi: {', '.join(sorted(TIPI_AMMESSI))}")
        print("  Il database li rifiuterebbe in blocco. Correggi la discovery, non questo ponte.")
        return 2

    nuovi, aggiornati, intoccabili = [], [], []
    for riga in locali:
        u = riga["username"]
        record = normalizza(riga)
        if u not in stato_remoto:
            record["stato"] = "nuovo"
            nuovi.append(record)
        elif stato_remoto[u] in STATI_CHE_LO_STUDIO_POSSIEDE:
            # Già lavorato nello Studio: si aggiornano i dati del profilo, MAI
            # lo stato. Riportarlo a «nuovo» cancellerebbe una decisione umana.
            intoccabili.append(record)
        else:
            aggiornati.append(record)

    per_tipo = {}
    for r in locali:
        per_tipo[r["tipo"]] = per_tipo.get(r["tipo"], 0) + 1

    print(f"discovery: {len(locali)} candidati — " +
          " · ".join(f"{k}: {v}" for k, v in sorted(per_tipo.items())))
    print(f"nello Studio ora: {len(remoti)}")
    print(f"  · da inserire:            {len(nuovi)}")
    print(f"  · da aggiornare:          {len(aggiornati)}")
    print(f"  · già lavorati (stato intatto): {len(intoccabili)}")

    senza_motivo = sum(1 for r in locali if not (r["motivo_score"] or "").strip())
    if senza_motivo:
        print(f"\n  ⚠ {senza_motivo} candidati senza la spiegazione del punteggio: "
              f"nello Studio compariranno con un numero e nessuna ragione accanto.")

    if not args.scrivi:
        print("\n(prova a vuoto: non ho scritto niente. `--scrivi` per farlo davvero.)")
        return 0

    da_mandare = nuovi + aggiornati + intoccabili
    for i in range(0, len(da_mandare), 100):
        lotto = da_mandare[i:i + 100]
        chiama(url, key, "sheis_candidati?on_conflict=username", "POST", lotto,
               prefer="resolution=merge-duplicates,return=minimal")

    dopo = chiama(url, key, "sheis_candidati?select=username")
    print(f"\n✓ Fatto. Nello Studio ora: {len(dopo)} candidati "
          f"(erano {len(remoti)}).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
