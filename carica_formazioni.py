#!/usr/bin/env python3
"""Carica le formazioni commerciali nel database, pronte per il coach.

COSA CARICA, E IN CHE ORDINE DI FIDUCIA
---------------------------------------
Due tipi di materiale, e la differenza conta:

  1. Le TRASCRIZIONI grezze delle giornate di formazione (26-27 luglio 2026).
     Sono la fonte primaria: contengono tutto, comprese le sfumature e gli
     esempi concreti che una sintesi perde. Sono anche disordinate — parlato,
     ripetizioni, frasi lasciate a metà.
  2. La KNOWLEDGE BASE già distillata (`Skill(sheis-sales-method)`), che quelle
     stesse trascrizioni le ha già lette e ordinate, con le citazioni verbatim
     e i riferimenti di riga.

Entrambe finiscono nella stessa tabella, perché il coach deve poter pescare da
tutte e due: la distillazione risponde meglio alle domande generali, la
trascrizione risponde meglio a «ma quando gli ho detto X, lui cosa ha risposto?».

⚠️ IL RELATORE NON È MAURO. Lo dichiara la testata delle trascrizioni: la
formazione è stata erogata da un formatore esterno scelto da Mauro. Il coach
citerà «la formazione alla rete», mai «Mauro dice» — attribuire a una persona
parole che non ha detto è il difetto peggiore che uno strumento di questo tipo
possa avere, perché è invisibile a chi non era in aula.

USO
    python3 carica_formazioni.py             # dice cosa caricherebbe
    python3 carica_formazioni.py --carica    # carica davvero
    python3 carica_formazioni.py --carica --rifai   # cancella e ricarica
"""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from lib.supabase import SupabaseClient  # noqa: E402

REPO = Path.home() / "Desktop" / "ALKEMIA - AGENCY" / "scalers-plus"
GREZZE = REPO / "clienti" / "sheis-beauty-aiconsult" / "raw"
DISTILLATA = REPO / ".claude" / "skills" / "sheis-sales-method"

# Un pezzo abbastanza lungo da contenere un ragionamento intero, abbastanza
# corto da poterne passare otto in un prompt senza riempirlo. Misurato sul
# parlato: sotto i 1200 caratteri le risposte si spezzano a metà frase.
PEZZO = 1600
SOVRAPPOSIZIONE = 200

FONTI = [
    {
        "fonte": "formazione-2026-07-26-framework-venditori",
        "titolo": "Framework di formazione venditori — dalla mentalità alla vendita consulenziale",
        "tenuta_il": "2026-07-26",
        "argomenti": ["mentalita", "vendita-consulenziale", "ciclo-vendita"],
        "file": GREZZE / "TRANSCRIPT_2026-07-26_framework-formazione-venditori-mentalita-vendita-consulenziale.md",
    },
    {
        "fonte": "formazione-2026-07-27-psicologia-organizzazione",
        "titolo": "Psicologia della vendita e organizzazione del lavoro",
        "tenuta_il": "2026-07-27",
        "argomenti": ["psicologia", "organizzazione", "gestione-tempo"],
        "file": GREZZE / "TRANSCRIPT_2026-07-27_lezione-psicologia-vendita-organizzazione-lavoro.md",
    },
    {
        "fonte": "formazione-2026-07-27-strategie-prodotti-capelli",
        "titolo": "Strategie di vendita sui prodotti per capelli",
        "tenuta_il": "2026-07-27",
        "argomenti": ["prodotto", "caratteristica-vantaggio-beneficio", "obiezioni"],
        "file": GREZZE / "TRANSCRIPT_2026-07-27_lezione-strategie-vendita-prodotti-capelli.md",
    },
    {
        "fonte": "metodo-distillato",
        "titolo": "Metodo di vendita SHEis — sintesi con citazioni verbatim",
        "tenuta_il": "2026-07-27",
        "argomenti": ["sintesi", "metodo", "citazioni"],
        "file": DISTILLATA / "SKILL.md",
    },
    {
        "fonte": "metodo-obiezioni",
        "titolo": "Metodo di vendita SHEis — gestione delle obiezioni",
        "tenuta_il": "2026-07-27",
        "argomenti": ["obiezioni"],
        "file": DISTILLATA / "references" / "01-obiezioni.md",
    },
]


def pulisci(testo: str) -> str:
    """Toglie la testata YAML e il grassetto parola-per-parola che la
    trascrizione automatica lascia («**Della** **gente** **che**»), che
    altrimenti finisce nei risultati e li rende illeggibili."""
    testo = re.sub(r"^---\n.*?\n---\n", "", testo, flags=re.S)
    testo = re.sub(r"\*\*(\S+)\*\*", r"\1", testo)
    return re.sub(r"\n{3,}", "\n\n", testo).strip()


def spezza(testo: str) -> list[tuple[int, str, str]]:
    """(posizione, minuto, testo). Si spezza sui capoversi e non a caratteri
    fissi: tagliare a metà una frase significa perderla in ricerca, perché
    nessuna delle due metà contiene più il concetto intero."""
    capoversi = [c.strip() for c in testo.split("\n\n") if c.strip()]
    pezzi: list[tuple[int, str, str]] = []
    corrente: list[str] = []
    lunghezza = 0
    ultimo_minuto = ""

    def chiudi():
        nonlocal corrente, lunghezza
        if corrente:
            pezzi.append((len(pezzi), ultimo_minuto, "\n\n".join(corrente)))
            # La sovrapposizione tiene il filo del discorso fra un pezzo e il
            # successivo: senza, una risposta che comincia alla fine di un pezzo
            # e finisce all'inizio del prossimo non si trova mai per intero.
            coda = corrente[-1] if len(corrente[-1]) < SOVRAPPOSIZIONE else corrente[-1][-SOVRAPPOSIZIONE:]
            corrente = [coda]
            lunghezza = len(coda)

    for c in capoversi:
        m = re.search(r"\b(\d{1,2}:\d{2}(?::\d{2})?)\b", c[:60])
        if m:
            ultimo_minuto = m.group(1)
        if lunghezza + len(c) > PEZZO:
            chiudi()
        corrente.append(c)
        lunghezza += len(c)
    chiudi()
    return pezzi


def main() -> int:
    ap = argparse.ArgumentParser(description="Carica le formazioni per il sales coach")
    ap.add_argument("--carica", action="store_true", help="scrive davvero sul database")
    ap.add_argument("--rifai", action="store_true", help="cancella e ricarica tutto")
    args = ap.parse_args()

    sb = SupabaseClient()
    if not sb.credenziali_presenti:
        print("✗ Mancano SUPABASE_URL/SUPABASE_SECRET_KEY.")
        return 1

    totale_pezzi = 0
    for f in FONTI:
        percorso: Path = f["file"]
        if not percorso.is_file():
            print(f"  ✗ {f['fonte']}: file assente ({percorso})")
            continue

        testo = pulisci(percorso.read_text(encoding="utf-8"))
        pezzi = spezza(testo)
        totale_pezzi += len(pezzi)
        print(f"  · {f['fonte']:44s} {len(testo):>7,} caratteri → {len(pezzi):>3} pezzi")

        if not args.carica:
            continue

        if args.rifai:
            sb._req("DELETE", f"/rest/v1/sheis_formazioni?fonte=eq.{f['fonte']}")

        e = sb.upsert("sheis_formazioni", [{
            "fonte": f["fonte"], "titolo": f["titolo"], "tenuta_il": f["tenuta_il"],
            "argomenti": f["argomenti"], "testo": testo,
        }], conflitto="fonte")
        if not e.ok:
            print(f"    ✗ {e.errore[:150]}")
            continue
        formazione_id = e.dati[0]["id"]

        # I pezzi si riscrivono sempre da zero: un aggiornamento parziale
        # lascerebbe in giro i pezzi della versione precedente, e la ricerca
        # restituirebbe frasi che nella lezione non ci sono più.
        sb._req("DELETE", f"/rest/v1/sheis_formazione_pezzi?formazione_id=eq.{formazione_id}")

        righe = [{"formazione_id": formazione_id, "posizione": pos,
                  "minuto": minuto or None, "testo": corpo}
                 for pos, minuto, corpo in pezzi]
        for i in range(0, len(righe), 50):
            r = sb.insert("sheis_formazione_pezzi", righe[i:i + 50])
            if not r.ok:
                print(f"    ✗ pezzi {i}: {r.errore[:150]}")
                break
        else:
            print(f"    ✓ caricata")

    print(f"\n  {totale_pezzi} pezzi in totale.")
    if not args.carica:
        print("  (nessuna scrittura: rilancia con --carica)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
