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

from .modelli_creativi import CREDITO_EUR, GATE, formato_per, scegli

EUR_PER_CREDITO = CREDITO_EUR
SOGLIA_EUR_DEFAULT = GATE["soglia_eur_default"]

# ⚠️ Era 12 crediti «ordine di grandezza tipico». Misurato il 2026-08-03 sui
# preventivi veri: una grafica con Nano Banana Pro ne costa 2, non 12. La stima
# era sei volte più alta del vero, quindi il cancello di costo scattava su
# passate che erano trascurabili — e chi lo vede scattare a sproposito impara a
# ignorarlo. Ora il costo di ogni lavoro viene dal catalogo misurato.
CREDITI_DEFAULT_PER_VARIANTE = scegli("grafica")["crediti"]

# Sottostringhe con cui il CLI/API segnala il tetto giornaliero — non un errore
# tecnico, uno STATO. Vengono dalla fonte: se ne compare uno nuovo si aggiunge
# lì, e vale per lo Studio e per i worker insieme.
MARCATORI_TETTO_GIORNALIERO = tuple(GATE["marcatori_tetto_giornaliero"])


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
    """Dove sta la riga di comando Higgsfield.

    ⚠️ Prima si cercava SOLO sul PATH. La CLI si installa con npm in
    ~/.npm-global/bin, che un processo schedulato non ha quasi mai nel PATH:
    il worker avrebbe detto «non trovata» su una macchina dove è installata.
    """
    esplicito = os.environ.get("HIGGSFIELD_CLI")
    if esplicito and os.path.isfile(esplicito):
        return esplicito
    trovato = shutil.which(esplicito or "higgsfield")
    if trovato:
        return trovato
    for c in (os.path.expanduser("~/.npm-global/bin/higgsfield"),
              "/usr/local/bin/higgsfield", "/opt/homebrew/bin/higgsfield"):
        if os.path.isfile(c):
            return c
    return None


def _estrai_url(uscita: str) -> str:
    """L'indirizzo dell'asset dentro la risposta della CLI.

    ⚠️ Misurato su una generazione vera il 2026-08-03: la CLI risponde con un
    ARRAY di oggetti e la chiave è `result_url`. Qui si cercavano `asset_url` e
    `url` su un OGGETTO: avrebbe restituito sempre stringa vuota, cioè un
    successo senza asset. Questo ramo non era mai stato eseguito, quindi
    l'errore non poteva emergere: è la ragione per cui ora è stato eseguito.
    """
    inizio = min((i for i in (uscita.find("["), uscita.find("{")) if i >= 0), default=-1)
    if inizio >= 0:
        try:
            trovato = _cerca_url(json.loads(uscita[inizio:]))
            if trovato:
                return trovato
        except (json.JSONDecodeError, ValueError):
            pass
    import re
    m = re.search(r"https?://\S+\.(?:png|jpe?g|webp|mp4|mov)", uscita, re.IGNORECASE)
    return m.group(0) if m else ""


def _cerca_url(o) -> str:
    if isinstance(o, str):
        return o if o.startswith(("http://", "https://")) else ""
    if isinstance(o, list):
        for v in o:
            t = _cerca_url(v)
            if t:
                return t
        return ""
    if isinstance(o, dict):
        for k in ("url", "asset_url", "output_url", "result_url", "download_url"):
            v = o.get(k)
            if isinstance(v, str) and v.startswith(("http://", "https://")):
                return v
        for v in o.values():
            t = _cerca_url(v)
            if t:
                return t
    return ""


def _recupera_job_recente(cli: str, modello: str, entro_secondi: int = 900) -> str:
    """L'ultimo lavoro COMPLETATO con questo modello, se è appena successo.

    Serve dopo un'attesa caduta: il lavoro può essere andato a buon fine e
    l'addebito essere già avvenuto. Si limita alla finestra recente e allo
    stesso modello, così non si recupera per sbaglio il risultato di un'altra
    generazione — meglio nessun recupero che il video sbagliato.
    """
    import time
    try:
        r = subprocess.run([cli, "generate", "list", "--json"],
                           capture_output=True, text=True, timeout=90,
                           env={**os.environ, "NO_COLOR": "1"})
        if r.returncode != 0:
            return ""
        dati = json.loads(r.stdout[r.stdout.find("["):] or "[]")
    except (subprocess.SubprocessError, json.JSONDecodeError, ValueError):
        return ""

    adesso = time.time()
    for j in dati if isinstance(dati, list) else []:
        if not isinstance(j, dict):
            continue
        if j.get("job_set_type") != modello or j.get("status") != "completed":
            continue
        creato = j.get("created_at")
        if isinstance(creato, (int, float)) and adesso - creato > entro_secondi:
            continue
        url = j.get("result_url") or _cerca_url(j)
        if url:
            return url
    return ""


def genera_per_lavoro(prompt: str, lavoro: str = "grafica", canale: str | None = None,
                      live: bool = False) -> EsitoGenerazione:
    """Genera scegliendo il modello dal catalogo misurato invece di riceverlo.

    È la via da usare: chi chiama dice CHE COSA serve («grafica», «ugc-video»),
    non quale modello. Così il giorno che esce un modello migliore si cambia in
    un posto solo, e lo Studio e i worker cambiano insieme.
    """
    s = scegli(lavoro)
    extra: dict[str, object] = dict(s["parametri"])
    # ⚠️ Il canale VINCE sul formato di default del catalogo. Prima il default
    # veniva tenuto e il canale ignorato: una grafica destinata a una storia
    # usciva in 4:5, cioè con due bande vuote nel posto dove sarebbe stata
    # vista. Il default esiste per quando il canale non si sa, non per
    # sovrascriverlo quando si sa.
    if canale:
        f = formato_per(canale)
        if f != "auto":
            extra["aspect_ratio"] = f
    return genera_variante(prompt, modello=s["modello"], crediti_stimati=s["crediti"],
                           live=live, parametri=extra)


def genera_variante(prompt: str, modello: str = "nano_banana_2",
                     crediti_stimati: float = CREDITI_DEFAULT_PER_VARIANTE,
                     live: bool = False, parametri: dict | None = None) -> EsitoGenerazione:
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
    # ⚠️ Il comando era sbagliato: `higgsfield <modello> --prompt ...` non
    # esiste. La forma vera è `higgsfield generate create <modello>`. Questo
    # ramo non era mai stato eseguito, quindi l'errore non poteva emergere —
    # sarebbe uscito la prima volta che qualcuno avesse provato a generare
    # davvero, cioè nel momento peggiore.
    argomenti = [cli, "generate", "create", modello, "--prompt", prompt]
    for chiave, valore in (parametri or {}).items():
        argomenti += [f"--{chiave}", str(valore).lower() if isinstance(valore, bool) else str(valore)]
    argomenti += ["--wait", "--json"]

    try:
        r = subprocess.run(
            argomenti, capture_output=True, text=True, timeout=600,
            env={**os.environ, "NO_COLOR": "1"},
        )
        out = (r.stdout or "") + (r.stderr or "")
        if any(m in out.lower() for m in MARCATORI_TETTO_GIORNALIERO):
            return EsitoGenerazione(
                ok=False, stato="errore", tetto_raggiunto=True,
                errore=("tetto giornaliero Higgsfield raggiunto — è un limite di ritmo, non di "
                        "crediti: il saldo può essere ancora capiente. Riprovare domani."),
                costo_crediti=crediti_stimati, costo_eur=costo_eur,
            )
        if r.returncode != 0:
            # ⚠️ Un fallimento QUI non significa che il lavoro non sia stato
            # fatto. Misurato il 2026-08-03 su un video UGC: il comando è
            # uscito con HTTP 502 mentre aspettava l'esito, il worker ha detto
            # «fallito» — e intanto il video era stato prodotto e 22 crediti
            # (€0,73) addebitati. Dichiarare un fallimento dopo aver speso è il
            # modo più costoso di sbagliare: chi legge rigenera, e paga due
            # volte la stessa cosa.
            #
            # L'attesa e la generazione sono due cose diverse: se cade
            # l'attesa, si va a guardare se il lavoro c'è.
            recuperato = _recupera_job_recente(cli, modello)
            if recuperato:
                return EsitoGenerazione(
                    ok=True, stato="pronta", asset_url=recuperato,
                    provider=f"higgsfield:{modello}",
                    costo_crediti=crediti_stimati, costo_eur=costo_eur,
                    errore=("l'attesa dell'esito è caduta, ma il lavoro era già stato completato "
                            "e i crediti spesi: recuperato invece di rigenerare"),
                )
            return EsitoGenerazione(ok=False, stato="errore",
                                     errore=f"Higgsfield non ha completato la generazione: {out[:300]}",
                                     costo_crediti=crediti_stimati, costo_eur=costo_eur)
        url = _estrai_url(out)
        if not url:
            return EsitoGenerazione(
                ok=False, stato="errore",
                errore=("Higgsfield ha completato il lavoro ma non ha restituito un indirizzo "
                        "utilizzabile. Il job esiste: `higgsfield generate list` per recuperarlo."),
                costo_crediti=crediti_stimati, costo_eur=costo_eur,
            )
        return EsitoGenerazione(ok=True, stato="pronta", asset_url=url, provider=f"higgsfield:{modello}",
                                 costo_crediti=crediti_stimati, costo_eur=costo_eur)
    except subprocess.TimeoutExpired:
        return EsitoGenerazione(ok=False, stato="errore",
                                 errore="Higgsfield non ha risposto entro 10 minuti: generazione interrotta",
                                 costo_crediti=crediti_stimati, costo_eur=costo_eur)
    except (OSError, json.JSONDecodeError) as e:
        return EsitoGenerazione(ok=False, stato="errore", errore=f"{type(e).__name__}: {e}",
                                 costo_crediti=crediti_stimati, costo_eur=costo_eur)
