#!/usr/bin/env python3
"""Test diretti del gate account di publisher_zernio.py — REGRESSIONE del
difetto ① segnalato dal collegio di revisione (2026-08-03): il gate
confrontava solo la PIATTAFORMA, mai l'IDENTITÀ. Con una configurazione non
vuota ma sbagliata (un segnaposto qualsiasi), l'unico account instagram
esistente — quello personale di Andrei, `andrei_arsinte` — passava come se
fosse SHEis.

La fixture `ACCOUNT_LIVE` riproduce la forma REALE della risposta Zernio
(verificata dal vivo il 2026-08-03, vedi lib/zernio.py account_per_brand):
2 account, entrambi Alkemia, nessun SHEis.

Esegui: python3 tests/test_publisher_gate.py
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from publisher_zernio import account_sheis_per_canale  # noqa: E402

problemi = 0


def check(cond: bool, descrizione: str) -> None:
    global problemi
    if cond:
        print(f"✓ {descrizione}")
    else:
        print(f"✗ FALLITO: {descrizione}")
        problemi += 1


# Forma reale, verificata dal vivo il 2026-08-03 (vedi commento in lib/zernio.py):
# 2 account Alkemia, zero SHEis.
ACCOUNT_LIVE = [
    {"zernio_account_id": "6a438fca9d9472faae2cbb05", "platform": "facebook",
     "username": "alkemia.marketing", "display_name": "Alkemia Marketing - Acquisizioni Qualificate", "enabled": True},
    {"zernio_account_id": "6a438feb9d9472faae2cbc2c", "platform": "instagram",
     "username": "andrei_arsinte", "display_name": "Andrei Arsinte | Sistemi AI per acquisire clienti", "enabled": True},
]

print("=== configurazione VUOTA (comportamento invariato: blocco) ===")
ok, msg = account_sheis_per_canale("instagram", ACCOUNT_LIVE, {})
check(not ok, f"config vuota → bloccato (msg: {msg!r})")

print("\n=== REGRESSIONE ①: configurazione PIENA ma con identità SBAGLIATA ===")
config_placeholder = {"zernio_account_ids_sheis": {"instagram": {"username": "QUALSIASI-VALORE"}}}
ok, msg = account_sheis_per_canale("instagram", ACCOUNT_LIVE, config_placeholder)
check(not ok, f"placeholder non corrispondente a nessun account reale → bloccato (msg: {msg!r})")
check("andrei_arsinte" not in msg or "non pubblico" in msg.lower() or "corrisponde" in msg.lower(),
      "il messaggio non lascia intendere che andrei_arsinte sia stato accettato")

print("\n=== stringa nuda invece di un oggetto → rifiutata (formato non ambiguo) ===")
config_stringa = {"zernio_account_ids_sheis": {"instagram": "andrei_arsinte"}}
ok, msg = account_sheis_per_canale("instagram", ACCOUNT_LIVE, config_stringa)
check(not ok, f"una stringa nuda (non un dict) → bloccato, mai interpretato come match implicito (msg: {msg!r})")

print("\n=== configurazione con username CORRETTO (quando l'account SHEis esisterà) ===")
config_corretta = {"zernio_account_ids_sheis": {"instagram": {"username": "sheisbeautyhair"}}}
account_con_sheis = ACCOUNT_LIVE + [
    {"zernio_account_id": "zzz-sheis-vero", "platform": "instagram",
     "username": "sheisbeautyhair", "display_name": "SHEis Beauty Hair", "enabled": True},
]
ok, msg = account_sheis_per_canale("instagram", account_con_sheis, config_corretta)
check(ok, f"username reale corrispondente → verificato (msg: {msg!r})")

print("\n=== configurazione con username CORRETTO ma canale SBAGLIATO (facebook invece di instagram) ===")
ok, msg = account_sheis_per_canale("facebook", account_con_sheis, config_corretta)
check(not ok, f"l'account SHEis è su instagram, non su facebook → bloccato anche se il canale esiste (msg: {msg!r})")

print("\n=== configurazione con zernio_account_id CORRETTO ===")
config_per_id = {"zernio_account_ids_sheis": {"instagram": {"zernio_account_id": "zzz-sheis-vero"}}}
ok, msg = account_sheis_per_canale("instagram", account_con_sheis, config_per_id)
check(ok, f"zernio_account_id corrispondente → verificato (msg: {msg!r})")

print("\n=== configurazione con zernio_account_id SBAGLIATO (anche se sulla piattaforma giusta) ===")
config_id_sbagliato = {"zernio_account_ids_sheis": {"instagram": {"zernio_account_id": "id-inventato-non-esiste"}}}
ok, msg = account_sheis_per_canale("instagram", account_con_sheis, config_id_sbagliato)
check(not ok, f"id inventato → bloccato, anche con un account instagram vero presente (msg: {msg!r})")

print(f"\n=== RISULTATO: {'TUTTO OK' if problemi == 0 else f'{problemi} problemi'} ===")
raise SystemExit(0 if problemi == 0 else 1)
