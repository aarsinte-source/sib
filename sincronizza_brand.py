#!/usr/bin/env python3
"""Tiene allineate le regole di marca fra i sistemi che devono obbedirle.

PERCHÉ ESISTE
-------------
`BRAND-IDENTITY_sheis_*.json` è dichiarato «vincolo eseguibile»: le regole di
marca non sono un documento da leggere, sono un file che i generatori devono
obbedire e i linter far rispettare.

La prova d'insieme del 2026-08-03 ha misurato che **un sistema su quattro lo
legge davvero**. Gli altri tre hanno liste scritte a mano, copiate una volta e
mai più aggiornate. Conseguenza misurata: quel giorno il file è stato corretto
due volte — il lessico da negozio da 15 a 41 termini, e il vocabolario dei
pubblici — e **tre sistemi su quattro non se ne sono accorti**.

Il risultato non è che un filtro sia più permissivo dell'altro. È peggio: due
filtri dello stesso sistema danno **verdetti opposti sullo stesso testo**, e
nessuno dei due sembra rotto. Un contenuto approvato dall'interfaccia viene poi
bloccato dal worker; oppure — e va peggio — passa da entrambi quando uno dei due
avrebbe dovuto fermarlo.

Casi reali già pagati:
  · «100% naturale» passava nell'interfaccia, veniva bloccato dal worker
  · «carrito» e «koszyka» passavano nell'interfaccia, bloccati altrove
  · le liste del media buyer non hanno mai avuto nessuna lingua oltre it/en

COSA FA
-------
  --verifica   dice quali copie divergono dalla fonte. Esce con codice ≠ 0 se
               almeno una diverge: può fare da cancello prima di un rilascio.
  --allinea    riallinea le copie alla fonte.

Non tocca le liste scritte a mano dentro il codice: quelle vanno sostituite da
una lettura del file, ed è un lavoro di chi possiede quei repository. Questo
script rende però **visibile** la divergenza, invece di lasciarla accadere in
silenzio — che era il vero problema.
"""
import argparse
import hashlib
import json
import shutil
import sys
from pathlib import Path

FONTE = Path.home() / "Desktop" / "ALKEMIA - AGENCY" / "scalers-plus" / \
    "clienti" / "sheis-beauty-aiconsult" / "data" / "BRAND-IDENTITY_sheis_2026-08-03.json"

GUARDRAILS_FONTE = Path.home() / "Desktop" / "ALKEMIA - AGENCY" / "scalers-plus" / \
    ".claude" / "skills" / "sheis-brand-core" / "guardrails.json"

# Copie che devono restare identiche alla fonte.
COPIE = [
    (FONTE, Path.home() / "alkemia-sheis-studio" / "src" / "brand" / "BRAND-IDENTITY.json"),
    (GUARDRAILS_FONTE, Path.home() / "alkemia-sheis-studio" / "src" / "brand" / "guardrails.json"),
]

# Sistemi che DOVREBBERO leggere la fonte e oggi non lo fanno. Non è un elenco
# di colpe: è il debito da chiudere, tenuto dove si vede.
DA_COLLEGARE = [
    (Path.home() / "alkemia-sheis-workers" / "lib" / "linter.py",
     "liste scritte a mano in Python"),
    (Path.home() / "alkemia-sheis-outreach" / "sheis_outreach" / "linter.py",
     "liste scritte a mano in Python"),
    (Path.home() / "alkemia-sheis-ads" / "lib" / "guardrails.mjs",
     "liste scritte a mano in JavaScript — il più incompleto dei quattro: "
     "nessuna lingua oltre italiano e inglese, nessuna regola sui claim numerici"),
]


def impronta(p: Path) -> str | None:
    if not p.is_file():
        return None
    return hashlib.sha256(p.read_bytes()).hexdigest()[:16]


def conta_termini(p: Path) -> int | None:
    """Quanti termini vietati contiene una copia. Serve a rendere la divergenza
    leggibile: «15 contro 41» dice molto più di due impronte diverse."""
    try:
        d = json.loads(p.read_text(encoding="utf-8"))
        return len(d["lessico"]["vietato_assoluto"]["lessico_da_negozio"])
    except Exception:
        return None


def main() -> int:
    ap = argparse.ArgumentParser(description="Allinea le regole di marca fra i sistemi")
    ap.add_argument("--allinea", action="store_true", help="riallinea le copie alla fonte")
    args = ap.parse_args()

    if not FONTE.is_file():
        print(f"✗ Fonte non trovata: {FONTE}")
        return 1

    print(f"fonte: {FONTE.name}")
    n = conta_termini(FONTE)
    if n:
        print(f"       {n} termini nel lessico vietato\n")

    divergenti = 0
    for sorgente, copia in COPIE:
        i_src, i_cp = impronta(sorgente), impronta(copia)
        nome = f"{copia.parent.parent.parent.name}/{copia.name}"
        if i_cp is None:
            print(f"  ✗ {nome} — assente")
            divergenti += 1
        elif i_src == i_cp:
            print(f"  ✓ {nome}")
        else:
            n_cp = conta_termini(copia)
            extra = f" ({n_cp} termini contro {conta_termini(sorgente)})" if n_cp else ""
            print(f"  ✗ {nome} — DIVERGE{extra}")
            divergenti += 1
        if args.allinea and i_src != i_cp and sorgente.is_file():
            copia.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(sorgente, copia)
            print(f"    → riallineata")
            divergenti -= 1

    print("\n  ── sistemi che NON leggono la fonte (debito aperto) ──")
    for p, nota in DA_COLLEGARE:
        stato = "esiste" if p.is_file() else "non trovato"
        print(f"  ⚠ {p.parent.parent.name}/{p.name} — {nota} [{stato}]")
    print("\n  Finché restano scritte a mano, ogni modifica alla fonte va")
    print("  riportata in ognuna: è esattamente il modo in cui i quattro filtri")
    print("  hanno cominciato a dare verdetti diversi sullo stesso testo.")

    if divergenti:
        print(f"\n✗ {divergenti} copie divergono. `--allinea` per correggere.")
        return 2
    print("\n✓ Tutte le copie sono allineate alla fonte.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
