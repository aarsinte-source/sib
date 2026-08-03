"""Client Higgsfield per le 3 varianti creative — gate di costo SEMPRE prima
della generazione, mai in silenzio.

Fatti misurati (memoria di progetto, riusati qui come costanti dichiarate,
non ricalcolati): **1 credito = €0,033**. Higgsfield ha anche un **tetto
giornaliero oltre ai crediti** che ha già bloccato altre pipeline (Mc&Co,
campagne Meta) — quando scatta, la generazione fallisce con un errore
riconoscibile e va trattata come STATO ("oggi non si genera più"), non come
un errore tecnico da far rimbalzare.

Questo modulo non chiama MAI l'API/CLI reale a meno che:
  - `LIVE=1` nell'ambiente, E
  - il costo stimato sia sotto `SHEIS_CREATIVE_SOGLIA_EUR` (default €2,00),
    oppure sia stata passata `conferma=True` esplicitamente da chi orchestra
    (in questo repo: mai in questa sessione — solo simulazione).

In simulazione (default, e l'UNICA modalità usata in questa sessione) il
client calcola il costo, applica il gate, e ritorna un esito realistico senza
generare nulla e senza spendere nulla.
"""
from __future__ import annotations

import json
import os
import shutil
import subprocess
from dataclasses import dataclass

EUR_PER_CREDITO = 0.033          # misurato, vedi reference_higgsfield_costi_euro
CREDITI_DEFAULT_PER_VARIANTE = 12  # gpt_image_2 / nano_banana_2, ordine di grandezza tipico
SOGLIA_EUR_DEFAULT = 2.00

# Sottostringhe con cui il CLI/API segnala il tetto giornaliero — non un errore
# tecnico, uno STATO. Elenco onesto e parziale: da arricchire quando se ne vede uno.
MARCATORI_TETTO_GIORNALIERO = (
    "daily limit", "daily cap", "daily quota", "rate limit exceeded",
    "tetto giornaliero", "limite giornaliero",
)


@dataclass
class EsitoGenerazione:
    ok: bool
    stato: str            # pronta | errore
    asset_url: str = ""
    provider: str = ""
    costo_crediti: float = 0.0
    costo_eur: float = 0.0
    errore: str = ""       # SEMPRE in italiano, visibile all'utente
    tetto_raggiunto: bool = False


def stima_costo(crediti: float = CREDITI_DEFAULT_PER_VARIANTE) -> float:
    return round(crediti * EUR_PER_CREDITO, 3)


def gate_costo(crediti_stimati: float, soglia_eur: float | None = None) -> tuple[bool, str]:
    """(ok_senza_conferma, messaggio). Se il costo supera la soglia, ok=False:
    chi orchestra deve chiedere conferma esplicita prima di procedere — questo
    gate non la chiede da solo, la impone.
    """
    soglia = soglia_eur if soglia_eur is not None else float(
        os.environ.get("SHEIS_CREATIVE_SOGLIA_EUR", SOGLIA_EUR_DEFAULT)
    )
    costo = stima_costo(crediti_stimati)
    if costo <= soglia:
        return True, f"costo stimato €{costo:.3f} ≤ soglia €{soglia:.2f} — procedo senza conferma aggiuntiva"
    return False, (
        f"costo stimato €{costo:.3f} > soglia €{soglia:.2f} — serve conferma esplicita "
        f"prima di generare (alza SHEIS_CREATIVE_SOGLIA_EUR o conferma a voce)"
    )


def _cli_disponibile() -> str | None:
    return shutil.which(os.environ.get("HIGGSFIELD_CLI", "higgsfield"))


def genera_variante(prompt: str, modello: str = "gpt_image_2", crediti_stimati: float = CREDITI_DEFAULT_PER_VARIANTE,
                     live: bool = False) -> EsitoGenerazione:
    """Genera UNA variante. In simulazione (live=False, il default) calcola il
    gate e ritorna un esito plausibile senza toccare rete o crediti — è la
    sola modalità permessa in questa sessione (nessuna generazione a pagamento).
    """
    ok_gate, msg_gate = gate_costo(crediti_stimati)
    costo_eur = stima_costo(crediti_stimati)

    if not live:
        # Knob SOLO per dimostrare in simulazione la gestione del tetto giornaliero
        # (senza di esso non esiste modo di provare quel ramo senza spendere davvero).
        # Non tocca il ramo LIVE, non fa nulla se non impostato.
        if os.environ.get("SHEIS_SIMULA_TETTO") == "1":
            return EsitoGenerazione(
                ok=False, stato="errore", tetto_raggiunto=True,
                errore="[SIMULATO] tetto giornaliero Higgsfield raggiunto — oggi non si genera più, riprovare domani",
                costo_crediti=crediti_stimati, costo_eur=costo_eur,
            )
        # ⚠️ REGRESSIONE ⑤ (revisione avversariale 2026-08-03): qui c'era
        # `ok=True` fisso, anche quando `ok_gate=False`. Il chiamante decide
        # sempre su `.ok`, quindi un gate FALLITO veniva riportato con la
        # spunta verde della riuscita ("✓ errore — costo...") e contato come
        # "generato" nel riepilogo, mentre nel DB lo stato era 'errore'. Il
        # ramo LIVE poco sotto (righe 107-109) lo faceva già giusto — qui si
        # allinea la simulazione, che è la modalità SEMPRE usata in sessione.
        return EsitoGenerazione(
            ok=ok_gate, stato="pronta" if ok_gate else "errore",
            asset_url="" if not ok_gate else "SIMULATO://nessun-asset-generato",
            provider=f"higgsfield:{modello}",
            costo_crediti=crediti_stimati, costo_eur=costo_eur,
            errore="" if ok_gate else f"gate di costo non superato in automatico: {msg_gate}",
        )

    # --- ramo LIVE: mai eseguito in questa sessione. Implementato per correttezza,
    # non per uso: nessuna chiamata reale è stata fatta durante questo lavoro.
    if not ok_gate:
        return EsitoGenerazione(ok=False, stato="errore", errore=msg_gate,
                                 costo_crediti=crediti_stimati, costo_eur=costo_eur)

    cli = _cli_disponibile()
    if not cli:
        return EsitoGenerazione(
            ok=False, stato="errore",
            errore="CLI 'higgsfield' non trovato sul PATH — impossibile generare davvero",
            costo_crediti=crediti_stimati, costo_eur=costo_eur,
        )
    try:
        r = subprocess.run(
            [cli, modello, "--prompt", prompt, "--wait", "--json"],
            capture_output=True, text=True, timeout=300,
        )
        out = (r.stdout or "") + (r.stderr or "")
        if any(m in out.lower() for m in MARCATORI_TETTO_GIORNALIERO):
            return EsitoGenerazione(
                ok=False, stato="errore", tetto_raggiunto=True,
                errore="tetto giornaliero Higgsfield raggiunto — oggi non si genera più, riprovare domani",
                costo_crediti=crediti_stimati, costo_eur=costo_eur,
            )
        if r.returncode != 0:
            return EsitoGenerazione(ok=False, stato="errore", errore=f"CLI ha fallito: {out[:300]}",
                                     costo_crediti=crediti_stimati, costo_eur=costo_eur)
        dati = json.loads(out)
        url = dati.get("asset_url") or dati.get("url") or ""
        return EsitoGenerazione(ok=True, stato="pronta", asset_url=url, provider=f"higgsfield:{modello}",
                                 costo_crediti=crediti_stimati, costo_eur=costo_eur)
    except subprocess.TimeoutExpired:
        return EsitoGenerazione(ok=False, stato="errore", errore="timeout — Higgsfield non ha risposto in 5 minuti",
                                 costo_crediti=crediti_stimati, costo_eur=costo_eur)
    except (OSError, json.JSONDecodeError) as e:
        return EsitoGenerazione(ok=False, stato="errore", errore=f"{type(e).__name__}: {e}",
                                 costo_crediti=crediti_stimati, costo_eur=costo_eur)
