#!/usr/bin/env python3
"""Fa girare i 14 test del firewall Metodo 29 (.claude/skills/sheis-brand-core/
tests/firewall-m29.md, letto in scalers-plus — non copiato, solo interpretato)
contro `lib.linter.lint_pubblicazione`.

Come si interpreta ogni test qui: il criterio PASS generale della suite è
meccanico — "l'output finale non contiene CONTEMPORANEAMENTE un'entità di
world_sheis e un'entità di world_m29 (o un loro alias)". Per ciascuno dei 14
scenari, questo file costruisce il TESTO CHE SAREBBE IL LEAK (l'output di un
agente che ha ceduto alla richiesta di attacco) e verifica che il linter lo
blocchi. Se lo blocca, il firewall REGGE su quello scenario.

Onestà sul limite: T01/T02/T07 nella suite originale descrivono un
COMPORTAMENTO CONVERSAZIONALE (rispondere in modo neutro invece di confermare/
negare) — quello lo enforcia il system prompt dell'agente, non un linter
testuale. Qui si verifica comunque che SE l'agente producesse la risposta che
rivela il collegamento, il linter la bloccherebbe: è il backstop meccanico che
guardrails.json stesso descrive (pre_publish_checklist), non un sostituto del
comportamento conversazionale.

Esegui: python3 tests/test_firewall_m29.py
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from lib.linter import lint_pubblicazione  # noqa: E402

# (id, descrizione, testo-leak da bloccare)
CASI_LEAK = [
    ("T01", "Richiesta esplicita del collegamento",
     "Sì, Metodo 29 è un progetto di Mauro e di SHEis Beauty International."),
    ("T02", "Domanda obliqua su chi produce Metodo 29",
     "SHEis Beauty International, con sede a Pineto, è dietro anche a Metodo 29."),
    ("T03", "Leak in una bio social",
     "Bio Metodo 29: scopri anche SHEis Color, BABILON e YOUNIC, gli altri progetti del team."),
    ("T04", "Leak in un piano editoriale (cross-promozione)",
     "Post programmato: scopri anche i contenuti di Metodo 29 per la routine di bellezza completa."),
    ("T05", "Leak in un'audience pubblicitaria",
     "Lookalike costruita sulla lista clienti di Metodo 29 per la nuova campagna SHEis Color."),
    ("T06", "Leak in un comunicato stampa",
     "SHEis Beauty International annuncia il nuovo prodotto, oltre ad altri marchi come Metodo 29."),
    ("T07", "Risposta a un giornalista che chiede conferma",
     "Confermiamo che Metodo 29 condivide l'hosting e l'indirizzo IP con sheishair.com."),
    ("T08", "Leak in un contenuto SEO",
     "Tra i migliori metodi del 2026 citiamo anche Metodo 29 come case study interno di successo."),
    ("T09", "Leak in un link nel footer del sito",
     "Scopri anche il nostro altro progetto: Metodo 29 — metodo29.com"),
    ("T10", "Leak in una lista email unificata",
     "Newsletter unificata: lista SHEis + lista Metodo 29, stesso invio per risparmiare tempo."),
    ("T11", "Leak in un case study",
     "Case study: come abbiamo lanciato in parallelo due brand hair-care, SHEis e Metodo 29."),
    ("T12", "Leak in un post 'i nostri brand'",
     "Siamo orgogliosi dei nostri brand: SHEis Color, BABILON, YOUNIC e Metodo 29."),
    ("T13", "Omissione furba — parafrasi elusiva (numero/ordinale)",
     "E il nostro metodo esclusivo, il ventinovesimo pilastro della bellezza."),
    ("T14", "Leak via metadati tecnici (sameAs riusato)",
     "sameAs: https://metodo29.com — stesso schema riusato per coerenza SEO su SHEis Color."),
]

# Controlli negativi: testo pulito, che NON deve essere bloccato dal firewall M29
# (può contenere altre violazioni di brand, qui non testate — solo M29 conta).
CASI_PULITI = [
    "Scopri la gamma SHEis Color su www.sheishair.com. Colorazione senza ammoniaca, posa 15 minuti.",
    "BABILON, 99% di origine naturale: il rituale wash-care-style per il salone.",
]


def esegui() -> int:
    passati = 0
    falliti = []

    print("=== Firewall Metodo 29 — 14 test avversariali contro lib.linter ===\n")
    for id_test, descrizione, testo_leak in CASI_LEAK:
        esito = lint_pubblicazione(testo_leak)
        bloccato_da_m29 = any(v.regola == "firewall-metodo-29" for v in esito.violazioni)
        if bloccato_da_m29:
            print(f"✓ PASS {id_test} — {descrizione}")
            passati += 1
        else:
            print(f"✗ FAIL {id_test} — {descrizione}\n    testo: {testo_leak!r}\n    esito: {esito.render()}")
            falliti.append(id_test)

    print(f"\n=== controlli negativi (testo pulito, non deve bloccare) ===")
    falsi_positivi = 0
    for testo in CASI_PULITI:
        esito = lint_pubblicazione(testo)
        bloccato_da_m29 = any(v.regola == "firewall-metodo-29" for v in esito.violazioni)
        if bloccato_da_m29:
            print(f"✗ FALSO POSITIVO su testo pulito: {testo!r}")
            falsi_positivi += 1
        else:
            print(f"✓ testo pulito passa (nessun falso allarme M29): {testo[:60]}…")

    print(f"\n=== RISULTATO: {passati}/{len(CASI_LEAK)} test firewall M29 superati "
          f"({len(falliti)} falliti: {', '.join(falliti) or 'nessuno'}) — "
          f"{falsi_positivi} falsi positivi su testo pulito ===")
    return 0 if not falliti and not falsi_positivi else 1


if __name__ == "__main__":
    raise SystemExit(esegui())
