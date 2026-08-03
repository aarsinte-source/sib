#!/usr/bin/env python3
"""Test diretti del linter di marca (prezzi, lessico da negozio multilingua,
claim numerici non documentati) — complemento a test_firewall_m29.py, che
copre solo il dominio Metodo 29.

Esegui: python3 tests/test_linter.py
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from lib.linter import lint_pubblicazione  # noqa: E402

CASI_BLOCCO = [
    ("prezzo esplicito", "SHEis Color oggi in promo a soli €12,90, acquista ora!"),
    ("sconto/listino", "Sconto del 20% sul listino per i nuovi distributori."),
    ("shop IT", "Vai sul nostro shop e aggiungi al carrello i tuoi preferiti."),
    ("cart EN", "Add to cart now and get your favorite BABILON products."),
    ("tienda ES", "Visita nuestra tienda online y compra ahora."),
    ("panier FR", "Ajoutez au panier vos produits BABILON préférés."),
    ("Warenkorb DE", "Legen Sie SHEis Color in den Warenkorb und kaufen Sie jetzt."),
    ("koszyk PL", "Dodaj do koszyka swoje ulubione produkty SHEis."),
    ("loja PT", "Visite nossa loja e compre agora os produtos SHEis."),
    ("متجر AR", "قم بزيارة متجرنا الآن"),
    ("metodo 29", "Siamo orgogliosi dei nostri brand: SHEis Color, BABILON, YOUNIC e Metodo 29."),
    ("claim clinico non documentato", "Clinicamente provato: risultati garantiti in una settimana."),
    ("claim naturale assoluto", "BABILON è composto al 100% naturale, zero eccezioni."),
    ("claim numerico non documentato", "Provato: il 40% delle clienti nota la differenza in 3 giorni."),
    # --- REGRESSIONE ⑥ (revisione avversariale 2026-08-03) ---
    ("prezzo in lettere, senza cifra", "Il trattamento costa duecento euro, prenota subito."),
    ("prezzo in lettere EN", "The treatment costs two hundred dollars."),
    ("shop con zero-width space dentro la parola", "Vai sul nostro sh​op oggi stesso."),
    ("carrello con zero-width space dentro la parola", "Aggiungi al car​rello i tuoi preferiti."),
    ("acquista con non-breaking space dentro la parola", "Acqui\xa0sta ora la nuova gamma."),
]

CASI_OK = [
    "Scopri la gamma SHEis Color su www.sheishair.com. Colorazione senza ammoniaca, posa 15 minuti.",
    "BABILON, 99% di origine naturale: il rituale wash-care-style per il salone.",
    "Non vendiamo online, né su Amazon: SHEis passa solo dai distributori ufficiali.",
    "YOUNIC, il sistema brevettato a tre fasi per cute e capelli. Trova il tuo salone.",
]


def esegui() -> int:
    problemi = 0
    print("=== Casi che DEVONO essere bloccati ===")
    for nome, testo in CASI_BLOCCO:
        esito = lint_pubblicazione(testo)
        if esito.ok:
            print(f"✗ FALSO NEGATIVO — '{nome}' non è stato bloccato: {testo!r}")
            problemi += 1
        else:
            print(f"✓ '{nome}' bloccato:\n{esito.render()}")

    print("\n=== Casi che devono PASSARE (nessun falso positivo) ===")
    for testo in CASI_OK:
        esito = lint_pubblicazione(testo)
        if not esito.ok:
            print(f"✗ FALSO POSITIVO su testo pulito: {testo!r}\n{esito.render()}")
            problemi += 1
        else:
            print(f"✓ passa: {testo[:70]}…")

    print(f"\n=== RISULTATO: {'TUTTO OK' if problemi == 0 else f'{problemi} problemi'} ===")
    return 0 if problemi == 0 else 1


if __name__ == "__main__":
    raise SystemExit(esegui())
