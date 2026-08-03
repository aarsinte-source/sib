"""Motore di ricerca di mercato — organico e pubblicitario, su più piattaforme.

COSA FA
-------
Data una richiesta («i competitor hair-care in Spagna, sia organico sia
pubblicitario»), decide QUALI fonti interrogare e le interroga, poi restituisce
un risultato unico invece di dieci file sparsi.

LA REGOLA CHE GOVERNA TUTTO
---------------------------
Le stesse informazioni si comprano da più parti a prezzi molto diversi. La
precedenza è dichiarata in `fonti-ricerca.json` e vale sempre:

  1. ScrapeCreators e DataForSEO PRIMA — sono già pagati a canone: una
     chiamata in più non costa nulla.
  2. Monid DOPO, e solo per ciò che i primi due non sanno fare — ogni run
     scala un saldo vero.
  3. Se nessuno copre la capacità, si dice. Non si improvvisa uno scraper.

Senza questa regola scritta si finisce a pagare a consumo un dato che era già
compreso nell'abbonamento, e nessuno se ne accorge perché funziona lo stesso.

⚠️ Questo modulo NON esegue le chiamate ScrapeCreators: quelle passano dagli
strumenti MCP, che vivono nella sessione dell'agente, non in un processo
Python. Qui si costruisce il PIANO — chi chiamare, con che parametri, quanto
costa — e si eseguono le sole parti che un processo può fare da solo (Monid,
via riga di comando). È una divisione onesta: il piano è verificabile prima di
spendere.
"""
from __future__ import annotations

import json
import os
import shutil
import subprocess
from dataclasses import dataclass, field
from pathlib import Path

FONTI = Path(os.environ.get(
    "SHEIS_FONTI_RICERCA",
    Path.home() / "alkemia-sheis-backend" / "fonti-ricerca.json",
))


def _carica() -> dict:
    if not FONTI.is_file():
        raise FileNotFoundError(
            f"Manca la mappa delle fonti in {FONTI}. Senza, il motore non sa a chi "
            f"chiedere cosa — e indovinare significherebbe spendere a caso."
        )
    return json.loads(FONTI.read_text(encoding="utf-8"))


@dataclass
class Passo:
    """Una singola interrogazione: a chi, per cosa, a che prezzo."""
    capacita: str
    fonte: str
    cosa: str
    come: str
    costo: str
    parametri: dict = field(default_factory=dict)
    attenzione: str = ""
    # Per quali piattaforme vale questa interrogazione: una sola chiamata
    # può coprirne più di una (le inserzioni Meta valgono IG e FB insieme).
    per_piattaforme: list = field(default_factory=list)

    @property
    def a_consumo(self) -> bool:
        return self.fonte == "monid"


@dataclass
class Piano:
    passi: list[Passo]
    saltati: list[str] = field(default_factory=list)

    @property
    def a_canone(self) -> list[Passo]:
        return [p for p in self.passi if not p.a_consumo]

    @property
    def a_consumo(self) -> list[Passo]:
        return [p for p in self.passi if p.a_consumo]

    def racconta(self) -> str:
        """Il piano in italiano, prima di eseguirlo. Chi lo legge deve poter
        dire «no, questo non farlo» PRIMA che il denaro sia speso."""
        righe = [f"Piano di ricerca — {len(self.passi)} interrogazioni"]
        if self.a_canone:
            righe.append(f"\n  Già pagate a canone ({len(self.a_canone)}) — nessun costo aggiuntivo:")
            for p in self.a_canone:
                righe.append(f"    · {p.capacita:26} {p.cosa}"
                             + (f"  [{', '.join(p.per_piattaforme)}]" if len(p.per_piattaforme) > 1 else ""))
        if self.a_consumo:
            righe.append(f"\n  ⚠️ A consumo sul saldo Monid ({len(self.a_consumo)}):")
            for p in self.a_consumo:
                righe.append(f"    · {p.capacita:26} {p.cosa}")
                righe.append(f"      perché non è a canone: {p.come.split(' — ')[0]}")
        if self.saltati:
            righe.append(f"\n  Non coperto da nessuna fonte ({len(self.saltati)}):")
            for s in self.saltati:
                righe.append(f"    · {s}")
        return "\n".join(righe)


def costruisci_piano(piattaforme: list[str], tipo: str = "entrambi",
                     con_aziende: bool = False, con_domanda: bool = False,
                     con_verifica_email: bool = False, con_tecnologie: bool = False,
                     parametri: dict | None = None) -> Piano:
    """Che cosa interrogare, per le piattaforme e il tipo di analisi chiesti.

    `tipo` è «organico», «pubblicitario» o «entrambi». Le piattaforme non
    previste NON vengono ignorate in silenzio: finiscono in `saltati`, perché
    chi chiede TikTok e non lo vede nel risultato deve sapere perché.
    """
    dati = _carica()
    cap = dati["capacita"]
    alias = {k: v for k, v in dati.get("alias_capacita", {}).items()
             if not k.startswith("_")}
    note = parametri or {}

    if tipo not in dati["tipi_analisi"]:
        raise ValueError(
            f"Tipo di analisi sconosciuto: {tipo!r}. Previsti: {', '.join(dati['tipi_analisi'])}."
        )

    tipi = ["organico", "pubblicitario"] if tipo == "entrambi" else [tipo]
    passi: list[Passo] = []
    saltati: list[str] = []

    for piattaforma in piattaforme:
        p = piattaforma.strip().lower()
        if p not in dati["piattaforme"]:
            saltati.append(f"{p}: piattaforma non prevista (previste: {', '.join(dati['piattaforme'])})")
            continue
        for t in tipi:
            chiave = f"{t}-{p}"
            # ⚠️ Instagram e Facebook condividono UNA sola libreria inserzioni.
            # Senza questa corrispondenza il piano dichiarava «nessuna fonte
            # copre pubblicitario-instagram», che è falso — e un buco dichiarato
            # per errore fa rinunciare a un'analisi che si poteva fare.
            risolta = alias.get(chiave, chiave)
            c = cap.get(risolta)
            if not c:
                saltati.append(f"{chiave}: nessuna fonte copre questa combinazione")
                continue
            # Una fonte MISURATA non funzionante non entra nel piano. Entrarci
            # significherebbe promettere un dato che non arriverà — e chi legge
            # il risultato vuoto ne trae una conclusione di mercato da un
            # guasto. È già successo con la libreria inserzioni TikTok.
            if c.get("disponibile") is False:
                saltati.append(f"{chiave}: {c.get('attenzione') or 'fonte non disponibile'}")
                continue
            gia = next((x for x in passi if x.capacita == risolta), None)
            if gia:
                # Stessa interrogazione chiesta da due piattaforme: si fa una
                # volta sola e si dice per chi vale, invece di pagarla due volte.
                gia.per_piattaforme.append(p)
                continue
            passi.append(Passo(
                capacita=risolta, fonte=c["fonte"], cosa=c["cosa"], come=c["come"],
                costo=c["costo"], parametri=dict(note), attenzione=c.get("attenzione", ""),
                per_piattaforme=[p],
            ))

    for attivo, chiave in ((con_aziende, "aziende-per-settore-e-paese"),
                           (con_domanda, "domanda-di-ricerca"),
                           (con_verifica_email, "verifica-email"),
                           (con_tecnologie, "tecnologie-sito")):
        if not attivo:
            continue
        c = cap[chiave]
        passi.append(Passo(capacita=chiave, fonte=c["fonte"], cosa=c["cosa"],
                            come=c["come"], costo=c["costo"], parametri=dict(note),
                            attenzione=c.get("attenzione", "")))

    return Piano(passi=passi, saltati=saltati)


# ── Esecuzione della sola parte che un processo può fare da solo ─────────────

def _cli_monid() -> str | None:
    esplicito = os.environ.get("MONID_CLI")
    if esplicito and os.path.isfile(esplicito):
        return esplicito
    trovato = shutil.which("monid")
    if trovato:
        return trovato
    for c in (os.path.expanduser("~/.npm-global/bin/monid"),
              "/usr/local/bin/monid", "/opt/homebrew/bin/monid"):
        if os.path.isfile(c):
            return c
    return None


def saldo_monid() -> float | None:
    """Quanto resta. Serve PRIMA di eseguire: un piano che non si può pagare
    va detto adesso, non a metà."""
    cli = _cli_monid()
    if not cli:
        return None
    try:
        r = subprocess.run([cli, "balance", "-j"], capture_output=True, text=True,
                            timeout=60, env={**os.environ, "NO_COLOR": "1"})
        if r.returncode != 0:
            return None
        i = r.stdout.find("{")
        d = json.loads(r.stdout[i:]) if i >= 0 else {}
        for k in ("balance", "amount", "value"):
            v = d.get(k) if isinstance(d, dict) else None
            if isinstance(v, (int, float)):
                return float(v)
            if isinstance(v, dict) and isinstance(v.get("value"), (int, float)):
                return float(v["value"])
        return None
    except (subprocess.SubprocessError, json.JSONDecodeError, ValueError):
        return None


def cerca_aziende(settore: str, paese: str, dipendenti: list[str] | None = None,
                  quante: int = 25, timeout: int = 120) -> dict:
    """Aziende per settore e paese, via Apollo su Monid.

    È la capacità che giustifica Monid nello stack: gli strumenti a canone
    cercano PROFILI social, non IMPRESE — e un importatore spagnolo può non
    avere alcun Instagram. La priorità commerciale numero uno di SHEis sono
    proprio i distributori esteri.
    """
    cli = _cli_monid()
    if not cli:
        return {"ok": False, "errore": (
            "La riga di comando Monid non è raggiungibile. Si installa con "
            "`npm i -g @monid-ai/cli` e si collega con `monid keys add`.")}

    query = {
        "q_organization_keyword_tags[]": [settore],
        "organization_locations[]": [paese],
        "per_page": max(1, min(quante, 100)),
    }
    if dipendenti:
        query["organization_num_employees_ranges[]"] = dipendenti

    try:
        r = subprocess.run(
            [cli, "run", "-p", "apollo", "-e", "/mixed_companies/search",
             "--query", json.dumps(query), "-w", str(timeout), "-j"],
            capture_output=True, text=True, timeout=timeout + 60,
            env={**os.environ, "NO_COLOR": "1"},
        )
    except subprocess.TimeoutExpired:
        return {"ok": False, "errore": f"Monid non ha risposto entro {timeout + 60} secondi."}

    uscita = (r.stdout or "") + (r.stderr or "")
    if "BLOCKED" in uscita:
        return {"ok": False, "errore": (
            "Un limite dello spazio di lavoro Monid ha fermato la ricerca prima che partisse "
            "(tetto di spesa o di run). Si sblocca da app.monid.ai — riprovare così com'è "
            "verrebbe fermato di nuovo.")}
    if r.returncode != 0:
        return {"ok": False, "errore": f"Monid non ha completato la ricerca: {uscita[:250]}"}

    i = uscita.find("{")
    try:
        d = json.loads(uscita[i:]) if i >= 0 else {}
    except json.JSONDecodeError:
        return {"ok": False, "errore": "Monid ha risposto in un formato non leggibile."}

    out = d.get("output") or d.get("result") or d
    aziende = (out or {}).get("organizations") or (out or {}).get("accounts") or []
    return {
        "ok": True,
        "quante": len(aziende),
        "costo": d.get("cost"),
        "aziende": [
            {
                "nome": a.get("name"),
                "dominio": a.get("primary_domain") or a.get("website_url"),
                "dipendenti": a.get("estimated_num_employees"),
                "paese": a.get("country"),
                "citta": a.get("city"),
                "linkedin": a.get("linkedin_url"),
                "settori": a.get("keywords") or [],
            }
            for a in aziende if isinstance(a, dict)
        ],
    }
