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

# ── Moduli GENERATI dalla fonte ───────────────────────────────────────────────
# Il debito era questo: quattro linter con le stesse liste ricopiate a mano.
# Ricopiare non è un difetto di disciplina, è un difetto di struttura — prima o
# poi una copia resta indietro, e due filtri dello stesso sistema danno verdetti
# opposti sullo stesso testo senza che nessuno dei due sembri rotto.
#
# Da qui in avanti le liste NON si scrivono: si generano. Ogni repo riceve un
# modulo nella sua lingua, con in testa il divieto di modificarlo a mano e
# l'impronta della fonte da cui viene. Se la fonte cambia e un modulo resta
# indietro, `--verifica` lo dice invece di lasciarlo passare.
GENERATI = [
    (Path.home() / "alkemia-sheis-workers" / "lib" / "vincoli_brand.py", "python"),
    (Path.home() / "alkemia-sheis-outreach" / "sheis_outreach" / "vincoli_brand.py", "python"),
    (Path.home() / "alkemia-sheis-ads" / "lib" / "vincoli-brand.mjs", "javascript"),
    (Path.home() / "alkemia-sheis-studio" / "src" / "lib" / "vincoli-brand.ts", "typescript"),
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


def _estrai(fonte: Path) -> dict:
    """I pezzi della fonte che i linter devono applicare, e nient'altro."""
    d = json.loads(fonte.read_text(encoding="utf-8"))
    va = d["lessico"]["vietato_assoluto"]
    rg = d["regole_di_generazione"]
    return {
        "impronta_fonte": impronta(fonte),
        "nome_fonte": fonte.name,
        "negozio": va["lessico_da_negozio"],
        "eccezioni": va.get("eccezioni_radice", []),
        "prezzo": va["prezzi_e_cifre_commerciali"],
        "firewall": va["firewall"],
        "claim": d["lessico"].get("claim_vietati", []),
        "cta_ammesse": rg.get("cta_ammesse", []),
        "cta_vietate": rg.get("cta_vietate", []),
        "numeri_documentati": rg.get("numeri_documentati", []),
    }


_INTESTAZIONE = (
    "GENERATO da sincronizza_brand.py — NON modificare a mano.\n"
    "\n"
    "Le liste qui sotto vengono da {nome_fonte} (impronta {impronta_fonte}).\n"
    "Modificarle qui significa reintrodurre esattamente il difetto per cui\n"
    "questo file esiste: quattro linter con quattro copie divergenti delle\n"
    "stesse regole, e verdetti opposti sullo stesso testo.\n"
    "\n"
    "Per cambiare una regola si modifica la fonte e si rilancia:\n"
    "    python3 ~/alkemia-sheis-backend/sincronizza_brand.py --allinea\n"
)


def _genera_python(v: dict) -> str:
    corpo = _INTESTAZIONE.format(**v)
    return (
        '"""' + corpo + '"""\n'
        f"IMPRONTA_FONTE = {v['impronta_fonte']!r}\n\n"
        f"NEGOZIO = {json.dumps(v['negozio'], ensure_ascii=False, indent=4)}\n\n"
        f"ECCEZIONI_RADICE = {json.dumps(v['eccezioni'], ensure_ascii=False, indent=4)}\n\n"
        f"PREZZO = {json.dumps(v['prezzo'], ensure_ascii=False, indent=4)}\n\n"
        f"FIREWALL = {json.dumps(v['firewall'], ensure_ascii=False, indent=4)}\n\n"
        "# I claim sono FORME, non parole: «clinicamente provata» al femminile\n"
        "# sfuggiva a chi cercava «provato».\n"
        f"CLAIM_VIETATI = {json.dumps(v['claim'], ensure_ascii=False, indent=4)}\n\n"
        f"CTA_AMMESSE = {json.dumps(v['cta_ammesse'], ensure_ascii=False, indent=4)}\n\n"
        f"CTA_VIETATE = {json.dumps(v['cta_vietate'], ensure_ascii=False, indent=4)}\n\n"
        "# Un numero passa solo se corrisponde a `pattern` E `contesto_richiesto`\n"
        "# compare vicino: «99% di origine naturale» sì, «99% di sconto» no.\n"
        f"NUMERI_DOCUMENTATI = {json.dumps(v['numeri_documentati'], ensure_ascii=False, indent=4)}\n"
        + _CONFRONTO_PY
    )


# La fonte non dichiara solo COSA è vietato, dichiara anche COME confrontarlo
# (lessico._regola_di_confronto: per radice, non per parola esatta — «koszyka» è
# il genitivo di «koszyk», «carrito» il diminutivo di «carro»). Se ogni linter
# reimplementa quella regola a modo suo torniamo ai verdetti divergenti, quindi
# viaggia insieme ai dati.
_CONFRONTO_PY = '''

import re as _re


def _radice(termine: str) -> str:
    """Il pattern per un termine vietato, secondo lessico._regola_di_confronto.

    Tre casi, e la soglia non è arbitraria:
      · niente confini di parola per gli alfabeti non latini (arabo)
      · fino a 3 lettere di coda per i termini da 6 caratteri in su, che sono
        quelli che declinano: koszyk→koszyka, carrito→carritos
      · parola esatta per i termini brevi, altrimenti «cart» mangia «carta» e
        «cartella» e il filtro comincia a bloccare testo innocente
    """
    esc = _re.escape(termine)
    if not _re.search(r"[A-Za-z]", termine):
        return esc
    if len(termine) >= 6 and " " not in termine:
        return rf"\\b{esc}\\w{{0,3}}\\b"
    return rf"\\b{esc}\\b"


PATTERN_NEGOZIO = [
    (_radice(t), f"lessico da negozio vietato: «{t}»") for t in NEGOZIO
]

_ECCEZIONI_RE = _re.compile(
    r"\\b(" + "|".join(_re.escape(e) for e in ECCEZIONI_RADICE) + r")\\b", _re.IGNORECASE
) if ECCEZIONI_RADICE else None


def negozio_eccezione(frase: str) -> bool:
    """Il termine trovato è una delle parole innocenti dichiarate nella fonte?
    «ordinario» condivide la radice con «ordina» e non c'entra col commercio."""
    return bool(_ECCEZIONI_RE and _ECCEZIONI_RE.fullmatch(frase.strip()))


def numero_documentato(testo: str, inizio: int, fine: int) -> bool:
    """Il numero trovato fra `inizio` e `fine` è uno di quelli che il cliente ha
    documentato? Serve il contesto: «99%» da solo non dice niente, «99% di
    origine naturale» è un dato dichiarato e «99% di sconto» resta vietato."""
    intorno = testo[max(0, inizio - 35): fine + 35]
    for n in NUMERI_DOCUMENTATI:
        if _re.search(n["pattern"], testo[inizio:fine], _re.IGNORECASE) or \\
           _re.search(n["pattern"], intorno, _re.IGNORECASE):
            if _re.search(n["contesto_richiesto"], intorno, _re.IGNORECASE):
                return True
    return False
'''


def _genera_js(v: dict, tipizzato: bool) -> str:
    corpo = "\n".join(" * " + r for r in _INTESTAZIONE.format(**v).split("\n"))
    t = ""
    if tipizzato:
        t = ("export type NumeroDocumentato = {\n"
             "  valore: string;\n  pattern: string;\n"
             "  contesto_richiesto: string;\n  spiegazione: string;\n};\n\n")
    return (
        "/**\n" + corpo + "\n */\n"
        f"export const IMPRONTA_FONTE = {json.dumps(v['impronta_fonte'])};\n\n"
        + t +
        f"export const NEGOZIO = {json.dumps(v['negozio'], ensure_ascii=False, indent=2)};\n\n"
        f"export const ECCEZIONI_RADICE = {json.dumps(v['eccezioni'], ensure_ascii=False, indent=2)};\n\n"
        f"export const PREZZO = {json.dumps(v['prezzo'], ensure_ascii=False, indent=2)};\n\n"
        f"export const FIREWALL = {json.dumps(v['firewall'], ensure_ascii=False, indent=2)};\n\n"
        "// I claim sono FORME, non parole: «clinicamente provata» al femminile\n"
        "// sfuggiva a chi cercava «provato».\n"
        f"export const CLAIM_VIETATI{': { pattern: string; cosa: string }[]' if tipizzato else ''}"
        f" = {json.dumps(v['claim'], ensure_ascii=False, indent=2)};\n\n"
        f"export const CTA_AMMESSE = {json.dumps(v['cta_ammesse'], ensure_ascii=False, indent=2)};\n\n"
        f"export const CTA_VIETATE = {json.dumps(v['cta_vietate'], ensure_ascii=False, indent=2)};\n\n"
        "// Un numero passa solo se corrisponde a `pattern` E `contesto_richiesto`\n"
        "// compare vicino: «99% di origine naturale» sì, «99% di sconto» no.\n"
        "export const NUMERI_DOCUMENTATI"
        + (": NumeroDocumentato[]" if tipizzato else "")
        + f" = {json.dumps(v['numeri_documentati'], ensure_ascii=False, indent=2)};\n"
        + (_CONFRONTO_TS if tipizzato else _CONFRONTO_JS)
    )


# Stessa regola di confronto della versione Python — se le due divergessero
# saremmo di nuovo al punto di partenza, solo in due linguaggi.
_CONFRONTO_JS_CORPO = '''
/**
 * Il pattern per un termine vietato, secondo lessico._regola_di_confronto:
 * confronto per RADICE, non per parola esatta. Fino a 3 lettere di coda per i
 * termini da 6 caratteri in su (koszyk→koszyka, carrito→carritos); parola
 * esatta per i brevi, altrimenti «cart» mangia «carta» e «cartella».
 */
export function radice(termine{T_STR}){T_RE} {
  const esc = termine.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&");
  if (!/[A-Za-z]/.test(termine)) return new RegExp(esc, "giu");
  if (termine.length >= 6 && !termine.includes(" ")) return new RegExp(`\\\\b${esc}\\\\p{L}{0,3}\\\\b`, "giu");
  return new RegExp(`\\\\b${esc}\\\\b`, "giu");
}

export const PATTERN_NEGOZIO = NEGOZIO.map((t) => ({
  pattern: radice(t),
  dettaglio: `lessico da negozio vietato: «${t}»`,
}));

const ECCEZIONI_RE = ECCEZIONI_RADICE.length
  ? new RegExp(`^(${ECCEZIONI_RADICE.join("|")})$`, "iu")
  : null;

/**
 * Il termine trovato è una delle parole innocenti dichiarate nella fonte?
 * «ordinario» condivide la radice con «ordina» e non c'entra col commercio.
 */
export function negozioEccezione(frase{T_STR}){T_BOOL} {
  return Boolean(ECCEZIONI_RE && ECCEZIONI_RE.test(frase.trim()));
}

/**
 * Il numero fra `inizio` e `fine` è fra quelli documentati dal cliente?
 * «99% di origine naturale» sì, «99% di sconto» no: decide il contesto.
 */
export function numeroDocumentato(testo{T_STR}, inizio{T_NUM}, fine{T_NUM}){T_BOOL} {
  const intorno = testo.slice(Math.max(0, inizio - 35), fine + 35);
  return NUMERI_DOCUMENTATI.some((n) => {
    const p = new RegExp(n.pattern, "iu");
    if (!p.test(testo.slice(inizio, fine)) && !p.test(intorno)) return false;
    return new RegExp(n.contesto_richiesto, "iu").test(intorno);
  });
}
'''

_CONFRONTO_JS = (_CONFRONTO_JS_CORPO
                 .replace("{T_STR}", "").replace("{T_NUM}", "")
                 .replace("{T_RE}", "").replace("{T_BOOL}", ""))
_CONFRONTO_TS = (_CONFRONTO_JS_CORPO
                 .replace("{T_STR}", ": string").replace("{T_NUM}", ": number")
                 .replace("{T_RE}", ": RegExp").replace("{T_BOOL}", ": boolean"))


def rendi(v: dict, linguaggio: str) -> str:
    if linguaggio == "python":
        return _genera_python(v)
    return _genera_js(v, tipizzato=(linguaggio == "typescript"))


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

    print("\n  ── moduli generati dalla fonte ──")
    vincoli = _estrai(FONTE)
    for percorso, linguaggio in GENERATI:
        atteso = rendi(vincoli, linguaggio)
        nome = f"{percorso.parent.parent.name}/{percorso.name}"
        attuale = percorso.read_text(encoding="utf-8") if percorso.is_file() else None
        if attuale == atteso:
            print(f"  ✓ {nome}")
            continue
        if args.allinea:
            percorso.parent.mkdir(parents=True, exist_ok=True)
            percorso.write_text(atteso, encoding="utf-8")
            print(f"  ✓ {nome} — {'creato' if attuale is None else 'rigenerato'}")
        else:
            print(f"  ✗ {nome} — {'assente' if attuale is None else 'DIVERGE dalla fonte'}")
            divergenti += 1

    # Chi importa davvero il modulo? Generarlo non basta: se nessuno lo legge,
    # siamo al punto di partenza con un file in più.
    print("\n  ── chi lo importa davvero ──")
    for percorso, _ in GENERATI:
        radice = percorso.parent
        base = percorso.stem
        lettori = [
            f for f in radice.glob("*")
            if f.is_file() and f != percorso and f.suffix in {".py", ".mjs", ".ts", ".js"}
            and base in f.read_text(encoding="utf-8", errors="ignore")
        ]
        if lettori:
            print(f"  ✓ {radice.parent.name}: {', '.join(f.name for f in lettori)}")
        else:
            print(f"  ⚠ {radice.parent.name}: nessuno — il modulo esiste ma non è collegato")

    if divergenti:
        print(f"\n✗ {divergenti} copie divergono. `--allinea` per correggere.")
        return 2
    print("\n✓ Tutte le copie sono allineate alla fonte.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
