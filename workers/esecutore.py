#!/usr/bin/env python3
"""L'esecutore: il processo che fa il lavoro mentre il portale sta altrove.

IL PROBLEMA CHE RISOLVE
-----------------------
SHEis Studio faceva tutto da sé, e per farlo lanciava processi locali:
`higgsfield` per le immagini, `monid` per le aziende, `node` per il motore
campagne. Finché il portale girava sul portatile di Andrei funzionava. Il
giorno che il portale si sposta su Vercel — perché deve restare raggiungibile
anche a computer spento — quei processi non esistono più. Non «vanno più
lenti»: non esistono. Le funzioni serverless non hanno né i comandi installati
né le credenziali in `~/.config`, e muoiono in pochi secondi mentre una
generazione video ne chiede centinaia.

La soluzione non è rinunciare né riscrivere tutto in HTTP: è **separare chi
chiede da chi esegue**.

    portale (Vercel)  →  scrive una riga in sheis_lavori  →  torna subito
    esecutore (VPS)   →  prende la riga, esegue, scrive il risultato

Il portale può stare ovunque. L'esecutore sta dove ci sono le credenziali. E
il Mac può spegnersi senza che niente si fermi.

PERCHÉ LA PRESA È ATOMICA
-------------------------
La riga si prende con `sheis_prendi_lavoro()` (migrazione 0008), che dentro il
database fa `for update skip locked`. La versione ingenua — «leggo il primo in
attesa, poi lo segno preso» — ha una finestra fra i due comandi in cui un
secondo esecutore legge la STESSA riga. Con un esecutore solo non si vede mai;
il giorno che ne partono due (o che un watchdog ne lascia due vivi, com'è già
successo col bot Telegram) la stessa generazione parte due volte e **si paga
due volte**.

COME SI AVVIA
-------------
    python3 esecutore.py                 # gira in continuo
    python3 esecutore.py --una-volta     # un giro solo, per provare
    python3 esecutore.py --tipi genera-creativa,ricerca-mercato
    LIVE=1 python3 esecutore.py          # esegue davvero; senza, simula

⚠️ `LIVE=1` è la stessa regola di tutti i worker di questo repo: senza, si
dichiara cosa si farebbe e non si spende. Un esecutore che spende per difetto
è un esecutore che nessuno prova.
"""
from __future__ import annotations

import argparse
import json
import os
import socket
import sys
import time
import traceback
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from lib.supabase import SupabaseClient  # noqa: E402

INTERVALLO = int(os.environ.get("ESECUTORE_INTERVALLO", "10"))          # secondi fra un giro e l'altro
RECUPERO_MINUTI = int(os.environ.get("ESECUTORE_RECUPERO_MINUTI", "30"))
NOME = os.environ.get("ESECUTORE_NOME") or f"{socket.gethostname()}:{os.getpid()}"
LIVE = os.environ.get("LIVE") == "1"

TIPI_NOTI = [
    "ricerca-mercato",
    "genera-creativa",
    "pubblica-zernio",
    "costruisci-campagna",
    "diagnostica",
]


# ══════════════════════════════════════════════════════════════════ la coda

class Coda:
    """L'accesso alla tabella `sheis_lavori`. Tutto passa di qui, così le
    regole (presa atomica, tentativi, recupero) stanno in un posto solo."""

    def __init__(self, sb: SupabaseClient) -> None:
        self.sb = sb

    def prendi(self, tipi: list[str] | None = None) -> dict | None:
        corpo = {"esecutore": NOME}
        if tipi:
            corpo["tipi"] = tipi
        e = self.sb._req("POST", "/rest/v1/rpc/sheis_prendi_lavoro", body=corpo)
        if not e.ok:
            # Distinguere «la funzione non c'è» da «la rete è caduta»: la prima
            # significa migrazione 0008 non applicata, ed è una cosa che si
            # risolve una volta sola, non riprovando.
            if "sheis_prendi_lavoro" in e.errore or e.schema_mancante:
                raise SchemaMancante(
                    "La coda non esiste ancora: manca la funzione sheis_prendi_lavoro. "
                    "Va applicata la migrazione 0008 "
                    "(~/alkemia-sheis-backend/migrations/0008_ricerche_pillar_lavori.sql)."
                )
            print(f"  ! coda non raggiungibile: {e.errore[:160]}")
            return None
        righe = e.dati if isinstance(e.dati, list) else []
        return righe[0] if righe else None

    def concludi(self, id_lavoro: str, risultato: dict) -> None:
        self.sb.update("sheis_lavori", f"id=eq.{id_lavoro}", {
            "stato": "completato",
            "risultato": risultato,
            "errore": None,
            "completato_il": _adesso(),
        })

    def fallisci(self, lavoro: dict, motivo: str) -> None:
        """Un fallimento non è definitivo finché restano tentativi: si rimette
        in attesa. All'ultimo tentativo diventa `fallito` e resta visibile —
        un lavoro che sparisce senza dire perché è la cosa peggiore di una
        coda."""
        tentativi = int(lavoro.get("tentativi") or 0)
        massimo = int(lavoro.get("max_tentativi") or 3)
        finale = tentativi >= massimo
        self.sb.update("sheis_lavori", f"id=eq.{lavoro['id']}", {
            "stato": "fallito" if finale else "in_attesa",
            "errore": motivo[:2000],
            "preso_da": None if not finale else NOME,
            "completato_il": _adesso() if finale else None,
        })
        print(f"  ✗ {lavoro['tipo']} — {'FALLITO definitivamente' if finale else f'tentativo {tentativi}/{massimo}'}: {motivo[:150]}")

    def recupera_appesi(self) -> int:
        e = self.sb._req("POST", "/rest/v1/rpc/sheis_recupera_lavori_appesi",
                         body={"minuti": RECUPERO_MINUTI})
        if not e.ok:
            return 0
        try:
            return int(e.dati if not isinstance(e.dati, list) else (e.dati[0] if e.dati else 0))
        except (TypeError, ValueError):
            return 0


class SchemaMancante(RuntimeError):
    """Lo schema non c'è. Non è un errore da riprovare in ciclo: è uno stato da
    dichiarare una volta e fermarsi."""


def _adesso() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


# ═══════════════════════════════════════════════════════════════ i mestieri
# Ogni funzione riceve (sb, payload) e restituisce il dizionario che finisce in
# `risultato`. Se solleva, la coda registra il motivo e riprova.

def _ricerca_mercato(sb: SupabaseClient, payload: dict) -> dict:
    from lib.ricerca_mercato import costruisci_piano
    from lib.ricerca_esegui import esegui, compatta_per_sintesi, CONCORRENTI_VALIDATI
    from lib.sintesi import sintetizza_ricerca

    ricerca_id = payload.get("ricerca_id")
    tema = (payload.get("tema") or "").strip()
    if not tema:
        raise ValueError("Manca il tema della ricerca.")
    piattaforme = payload.get("piattaforme") or ["instagram", "tiktok"]
    tipo = payload.get("tipo") or "entrambi"
    paesi = payload.get("paesi") or ["it"]
    concorrenti = payload.get("concorrenti") or CONCORRENTI_VALIDATI

    piano = costruisci_piano(
        piattaforme, tipo=tipo,
        con_domanda=bool(payload.get("con_domanda")),
        con_aziende=bool(payload.get("con_aziende")),
    )

    if ricerca_id:
        sb.update("sheis_ricerche", f"id=eq.{ricerca_id}", {
            "stato": "in_corso",
            "piano": {
                "passi": [{"capacita": p.capacita, "fonte": p.fonte, "costo": p.costo,
                           "piattaforme": p.per_piattaforme} for p in piano.passi],
                "saltati": piano.saltati,
                "racconto": piano.racconta(),
            },
        })

    if not LIVE:
        return {"simulato": True, "piano": piano.racconta(),
                "nota": "LIVE non impostata: nessuna fonte è stata interrogata e nulla è stato speso."}

    esito = esegui(piano, tema=tema, paesi=paesi,
                   parole_chiave=payload.get("parole_chiave"),
                   settore_aziende=payload.get("settore_aziende"),
                   concorrenti=concorrenti)

    sintesi = sintetizza_ricerca(tema, compatta_per_sintesi(esito), paesi)

    if ricerca_id:
        sb.update("sheis_ricerche", f"id=eq.{ricerca_id}", {
            "stato": "completata",
            "risultati": esito.dict(),
            "sintesi": sintesi,
            "fonti_usate": [r.capacita for r in esito.raccolte if r.quanti],
            "costo_monid_eur": esito.costo_monid_eur,
            "errore": "; ".join(esito.errori)[:2000] or None,
        })

    return {
        "elementi": esito.quanti_elementi,
        "chiamate_a_canone": esito.chiamate_a_canone,
        "costo_monid_eur": esito.costo_monid_eur,
        "fonti_con_dati": [r.capacita for r in esito.raccolte if r.quanti],
        "fonti_mute": [f"{r.capacita}: {r.errore}" for r in esito.raccolte if r.errore],
        "pillar_proposti": len((sintesi or {}).get("pillar") or []),
    }


def _genera_creativa(sb: SupabaseClient, payload: dict) -> dict:
    from lib.higgsfield import genera_per_lavoro, gate_costo
    from lib.modelli_creativi import scegli

    variante_id = payload.get("variante_id")
    prompt = payload.get("prompt") or ""
    lavoro_visivo = payload.get("lavoro") or "grafica"
    canale = payload.get("canale") or "instagram"
    if not prompt:
        raise ValueError("Manca il prompt della creativa.")

    s = scegli(lavoro_visivo)
    entro, messaggio = gate_costo(s["crediti"])

    if not LIVE:
        return {"simulato": True, "modello": s["modello"], "crediti_previsti": s["crediti"],
                "gate_costo": messaggio,
                "nota": "LIVE non impostata: nessun credito è stato speso."}

    # Il gate di costo non chiede conferma da sé: chi accoda il lavoro l'ha già
    # data mettendolo in coda. Qui si REGISTRA che è stato superato, così se un
    # giorno un lavoro costoso passa senza che nessuno l'abbia voluto, si vede
    # da dove è entrato.
    esito = genera_per_lavoro(prompt, lavoro=lavoro_visivo, canale=canale, live=True)

    if variante_id:
        sb.update("sheis_varianti", f"id=eq.{variante_id}", {
            "stato": esito.stato,
            "asset_url": esito.asset_url or None,
            "provider": esito.provider or None,
            "costo_crediti": esito.costo_crediti,
            "costo_eur": esito.costo_eur,
            "errore": esito.errore[:1000] or None,
            "generata_il": _adesso() if esito.ok else None,
        })

    if not esito.ok:
        raise RuntimeError(esito.errore or "generazione fallita senza motivo dichiarato")
    return {"url": esito.asset_url, "modello": esito.provider,
            "crediti": esito.costo_crediti, "costo_eur": esito.costo_eur,
            "gate_costo": messaggio if not entro else "entro soglia",
            "nota": esito.errore or None}


def _pubblica_zernio(sb: SupabaseClient, payload: dict) -> dict:
    """Mette in coda o pubblica subito su Zernio.

    ⚠️ Due guardie prima di uscire verso il pubblico, entrambe già scritte
    altrove e qui solo applicate: il linter di marca (nessun prezzo, nessun
    lessico da negozio, nessun Metodo 29) e la finestra oraria. Un contenuto
    che esce alle tre di notte in un settore B2B non è un contenuto: è un
    campanello che nessuno voleva.
    """
    from lib.zernio import ZernioClient
    from lib.linter import lint_pubblicazione
    from lib.finestra import dentro_finestra

    pubblicazione_id = payload.get("pubblicazione_id")
    contenuto = (payload.get("contenuto") or "").strip()
    piattaforme = payload.get("piattaforme") or []
    media = payload.get("media_url") or []
    quando = payload.get("programmato_per")

    if not contenuto or not piattaforme:
        raise ValueError("Servono almeno il testo e una piattaforma.")

    canale_linter = piattaforme[0] if piattaforme else "generico"
    esito_linter = lint_pubblicazione(contenuto, canale_linter)
    if not esito_linter.ok:
        motivi = esito_linter.motivo_blocco()
        if pubblicazione_id:
            sb.update("sheis_pubblicazioni", f"id=eq.{pubblicazione_id}", {
                "stato": "bloccato", "motivo_blocco": motivi[:1000],
                "linter_esito": {"ok": False, "violazioni": [str(v) for v in esito_linter.violazioni]},
            })
        raise RuntimeError(f"Bloccato dal linter di marca: {motivi}")

    # Pubblicare SUBITO fuori orario si rifiuta; PROGRAMMARE per un orario
    # futuro è sempre lecito — è proprio a cosa serve la programmazione.
    if not quando:
        ok_ora, perche = dentro_finestra()
        if not ok_ora:
            raise RuntimeError(f"Fuori dalla finestra di pubblicazione: {perche}. "
                               f"Programmalo invece di pubblicarlo adesso.")

    if not LIVE:
        return {"simulato": True, "piattaforme": piattaforme, "quando": quando or "subito",
                "linter": "superato",
                "nota": "LIVE non impostata: niente è stato pubblicato."}

    z = ZernioClient()
    e = z.crea_post(contenuto, piattaforme, media_url=media or None, schedula_per=quando)

    if pubblicazione_id:
        sb.update("sheis_pubblicazioni", f"id=eq.{pubblicazione_id}", {
            "stato": "inviato" if e.ok else "fallito",
            "zernio_post_id": (e.dati or {}).get("_id") if isinstance(e.dati, dict) else None,
            "ultimo_errore": None if e.ok else e.errore[:1000],
            "linter_esito": {"ok": True},
        })
    if not e.ok:
        raise RuntimeError(e.errore)
    return {"inviato": True, "piattaforme": piattaforme, "quando": quando or "subito",
            "risposta": e.dati if isinstance(e.dati, dict) else {}}


def _costruisci_campagna(sb: SupabaseClient, payload: dict) -> dict:
    import subprocess
    motore = Path.home() / "alkemia-sheis-ads" / "campagna_da_brief.mjs"
    if not motore.is_file():
        raise FileNotFoundError(f"Motore campagne non trovato in {motore}")
    ambiente = {**os.environ, "LIVE": "1" if LIVE else ""}
    r = subprocess.run(["node", str(motore), "--json", json.dumps(payload)],
                       capture_output=True, text=True, timeout=300, env=ambiente)
    if r.returncode != 0:
        raise RuntimeError((r.stderr or r.stdout)[:500])
    i = r.stdout.find("{")
    return json.loads(r.stdout[i:]) if i >= 0 else {"uscita": r.stdout[:1000]}


def _diagnostica(sb: SupabaseClient, payload: dict) -> dict:
    """Lo stato di ciò che costa: crediti Higgsfield, saldo Monid, crediti
    ScrapeCreators. Gira dall'esecutore e non dal portale perché è l'esecutore
    ad avere le credenziali — il portale legge il risultato dalla coda."""
    from lib.ricerca_mercato import saldo_monid
    from lib.fonti_social import FontiSocial

    fuori: dict = {"quando": _adesso()}
    fuori["monid_saldo"] = saldo_monid()

    f = FontiSocial()
    if f.pronto:
        e = f.sc._get("/v1/instagram/profile", {"handle": "sheisbeautyhair"})
        fuori["scrapecreators_crediti"] = e.crediti_rimasti
        fuori["scrapecreators_ok"] = e.ok
    else:
        fuori["scrapecreators_ok"] = False

    # Higgsfield non ha una API di saldo: lo stato si chiede alla riga di
    # comando, che è anche l'unico posto dove vivono le sue credenziali (una
    # coppia di token che si rinnova da sola in ~/.config/higgsfield).
    from lib.higgsfield import _cli_disponibile
    cli = _cli_disponibile()
    if not cli:
        fuori["higgsfield_ok"] = False
        fuori["higgsfield_nota"] = (
            "La riga di comando Higgsfield non è raggiungibile su questa macchina. "
            "Si installa con `npm i -g @higgsfield/cli` e si collega con `higgsfield auth login`.")
    else:
        import subprocess
        try:
            r = subprocess.run([cli, "account", "status"], capture_output=True, text=True,
                               timeout=60, env={**os.environ, "NO_COLOR": "1"})
            fuori["higgsfield_ok"] = r.returncode == 0
            fuori["higgsfield_stato"] = (r.stdout or r.stderr)[:400].strip()
        except subprocess.SubprocessError as e:
            fuori["higgsfield_ok"] = False
            fuori["higgsfield_nota"] = f"{type(e).__name__}: {e}"

    return fuori


MESTIERI = {
    "ricerca-mercato": _ricerca_mercato,
    "genera-creativa": _genera_creativa,
    "pubblica-zernio": _pubblica_zernio,
    "costruisci-campagna": _costruisci_campagna,
    "diagnostica": _diagnostica,
}


# ═════════════════════════════════════════════════════════════════════ ciclo

def un_giro(coda: Coda, sb: SupabaseClient, tipi: list[str] | None) -> int:
    """Svuota la coda finché c'è lavoro. Restituisce quanti ne ha fatti."""
    fatti = 0
    while True:
        lavoro = coda.prendi(tipi)
        if not lavoro:
            return fatti
        tipo = lavoro["tipo"]
        print(f"  → {tipo} ({lavoro['id'][:8]}) tentativo {lavoro.get('tentativi')}")
        mestiere = MESTIERI.get(tipo)
        if not mestiere:
            # Un tipo che il database accetta ma nessun esecutore conosce: va
            # detto, non lasciato girare all'infinito.
            coda.fallisci(lavoro, f"Nessun esecutore conosce il tipo «{tipo}».")
            continue
        try:
            risultato = mestiere(sb, lavoro.get("payload") or {})
            coda.concludi(lavoro["id"], risultato)
            print(f"  ✓ {tipo} — {json.dumps(risultato, ensure_ascii=False)[:200]}")
            fatti += 1
        except Exception as e:
            coda.fallisci(lavoro, f"{type(e).__name__}: {e}\n{traceback.format_exc()[-800:]}")
    return fatti


def main() -> int:
    ap = argparse.ArgumentParser(description="Esegue i lavori accodati dal portale SHEis")
    ap.add_argument("--una-volta", action="store_true", help="un giro solo, poi esce")
    ap.add_argument("--tipi", help=f"solo questi tipi, separati da virgola ({', '.join(TIPI_NOTI)})")
    args = ap.parse_args()

    tipi = [t.strip() for t in args.tipi.split(",")] if args.tipi else None
    if tipi:
        ignoti = [t for t in tipi if t not in TIPI_NOTI]
        if ignoti:
            print(f"✗ Tipi sconosciuti: {', '.join(ignoti)}. Previsti: {', '.join(TIPI_NOTI)}")
            return 2

    sb = SupabaseClient()
    if not sb.credenziali_presenti:
        print("✗ Mancano SUPABASE_URL/SUPABASE_SECRET_KEY — vedi .env.example")
        return 1

    coda = Coda(sb)
    print(f"esecutore «{NOME}» · {'LIVE — esegue e spende davvero' if LIVE else 'SIMULAZIONE (LIVE non impostata)'}")
    print(f"  tipi: {', '.join(tipi or TIPI_NOTI)}")
    print(f"  intervallo: {INTERVALLO}s · recupero appesi dopo {RECUPERO_MINUTI} min\n")

    while True:
        try:
            recuperati = coda.recupera_appesi()
            if recuperati:
                print(f"  ↺ {recuperati} lavori rimessi in coda (esecutore interrotto a metà)")
            un_giro(coda, sb, tipi)
        except SchemaMancante as e:
            print(f"\n✗ {e}")
            return 1
        except KeyboardInterrupt:
            print("\nfermato.")
            return 0
        except Exception as e:  # il ciclo non deve morire per un giro storto
            print(f"  ! giro fallito: {type(e).__name__}: {e}")

        if args.una_volta:
            return 0
        time.sleep(INTERVALLO)


if __name__ == "__main__":
    raise SystemExit(main())
