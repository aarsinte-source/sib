#!/usr/bin/env python3
"""Tiene allineata la SCELTA DEL MODELLO creativo fra i sistemi che generano.

PERCHÉ ESISTE
-------------
Stessa storia dei filtri di marca, un piano più in basso: il modello da usare
era scritto a mano dentro il codice — `gpt_image_2`, sempre, per qualunque
lavoro. Non era una scelta sbagliata: era una scelta fatta una volta e mai più
discussa, che intanto era invecchiata. Costa 7 crediti contro i 2 di Nano
Banana Pro, si blocca per minuti, e non è il migliore né sulle grafiche né sui
video.

Peggio: il modello stava scritto in DUE posti (lo Studio e i worker) e nessuno
dei due sapeva dell'altro. Cambiare idea significava ricordarsi di cambiarla
due volte.

Da qui in avanti la scelta vive in `modelli-creativi.json`, con accanto il
costo MISURATO e la ragione. I due sistemi la leggono; nessuno la ricopia.

COSA FA
-------
  (senza argomenti)  dice quali moduli divergono dalla fonte, ed esce con
                     codice ≠ 0: può fare da cancello prima di un rilascio
  --allinea          li rigenera
"""
import argparse
import hashlib
import json
import sys
from pathlib import Path

FONTE = Path(__file__).resolve().parent / "modelli-creativi.json"

GENERATI = [
    (Path.home() / "alkemia-sheis-workers" / "lib" / "modelli_creativi.py", "python"),
    (Path.home() / "alkemia-sheis-studio" / "src" / "lib" / "modelli-creativi.ts", "typescript"),
]

INTESTAZIONE = (
    "GENERATO da sincronizza_modelli.py — NON modificare a mano.\n"
    "\n"
    "Viene da modelli-creativi.json (impronta {impronta}). Cambiare qui il\n"
    "modello significa farlo divergere dall'altro sistema, che è esattamente\n"
    "il difetto per cui questo file esiste.\n"
    "\n"
    "Per cambiare modello si modifica la fonte e si rilancia:\n"
    "    python3 ~/alkemia-sheis-backend/sincronizza_modelli.py --allinea\n"
)


def impronta(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()[:16]


def estrai() -> dict:
    d = json.loads(FONTE.read_text(encoding="utf-8"))
    return {
        "impronta": impronta(FONTE),
        "credito_eur": d["credito_eur"],
        "lavori": d["lavori"],
        "formato": {k: v for k, v in d["formato_per_canale"].items() if not k.startswith("_")},
        "gate": d["gate_costo"],
    }


_SCELTA_PY = '''

def scegli(lavoro: str) -> dict:
    """Il modello per questo lavoro, o un errore che dice quali lavori esistono.

    Non si indovina: un lavoro non previsto è una domanda a cui il catalogo non
    risponde, e inventare un modello significherebbe spendere crediti su una
    scelta che nessuno ha preso.
    """
    if lavoro not in LAVORI:
        raise KeyError(
            f"Lavoro creativo sconosciuto: {lavoro!r}. "
            f"Previsti: {', '.join(sorted(LAVORI))}."
        )
    return LAVORI[lavoro]


def formato_per(canale: str) -> str:
    """Il formato giusto per il posto dove il contenuto verrà visto.
    Se il canale non è noto si torna a «auto»: meglio lasciar decidere al
    modello che imporre un formato sbagliato."""
    return FORMATO_PER_CANALE.get(canale, "auto")


def _rapporto(f: str) -> float:
    try:
        a, b = f.split(":")
        return float(a) / float(b)
    except (ValueError, ZeroDivisionError):
        return 1.0


def formato_ammesso(lavoro: str, formato: str) -> tuple[str, str]:
    """(formato_da_usare, spiegazione_se_sostituito).

    ⚠️ Non tutti i modelli accettano tutti i formati: GPT Image 2 rifiuta il
    4:5, che è proprio quello del feed Instagram. Misurato il 2026-08-03.

    Quando il formato chiesto non c'è si prende il PIÙ VICINO per proporzione e
    si RESTITUISCE LA SPIEGAZIONE. Sostituire in silenzio significherebbe
    consegnare grafiche del formato sbagliato senza che nessuno se ne accorga —
    e chi le pubblica scoprirebbe il taglio solo guardando il post uscito.
    """
    ammessi = scegli(lavoro).get("formati_supportati") or []
    if not ammessi or formato in ammessi:
        return formato, ""
    candidati = [f for f in ammessi if f != "auto"]
    if not candidati:
        return formato, ""
    vicino = min(candidati, key=lambda f: abs(_rapporto(f) - _rapporto(formato)))
    return vicino, (
        f"il formato {formato} non è supportato da {scegli(lavoro)['nome_umano']}: "
        f"uso {vicino}, che è il più vicino"
    )


def costo_eur(lavoro: str, quante: int = 1) -> float:
    return round(scegli(lavoro)["crediti"] * quante * CREDITO_EUR, 4)
'''

_SCELTA_TS = '''
export type Lavoro = {
  descrizione: string;
  modello: string;
  nome_umano: string;
  crediti: number;
  perche: string;
  parametri: Record<string, string | number | boolean>;
  formati_supportati?: readonly string[];
  attenzione?: string;
};

/**
 * Il modello per questo lavoro. Non si indovina: un lavoro non previsto è una
 * domanda a cui il catalogo non risponde, e inventare un modello significa
 * spendere crediti su una scelta che nessuno ha preso.
 */
export function scegli(lavoro: string): Lavoro {
  const l = (LAVORI as Record<string, Lavoro>)[lavoro];
  if (!l) {
    throw new Error(
      `Lavoro creativo sconosciuto: "${lavoro}". Previsti: ${Object.keys(LAVORI).sort().join(", ")}.`,
    );
  }
  return l;
}

/**
 * Il formato giusto per il posto dove il contenuto verrà visto. Canale non
 * noto → "auto": meglio lasciar decidere al modello che imporre un formato
 * sbagliato.
 */
export function formatoPer(canale: string): string {
  return (FORMATO_PER_CANALE as Record<string, string>)[canale] ?? "auto";
}

function rapporto(f: string): number {
  const [a, b] = f.split(":").map(Number);
  return b ? a / b : 1;
}

/**
 * [formatoDaUsare, spiegazioneSeSostituito].
 *
 * ⚠️ Non tutti i modelli accettano tutti i formati: GPT Image 2 rifiuta il 4:5,
 * che è proprio quello del feed Instagram. Misurato il 2026-08-03.
 *
 * Quando il formato chiesto non c'è si prende il PIÙ VICINO per proporzione e
 * si restituisce la spiegazione. Sostituire in silenzio significherebbe
 * consegnare grafiche del formato sbagliato senza che nessuno se ne accorga.
 */
export function formatoAmmesso(lavoro: string, formato: string): [string, string] {
  const l = scegli(lavoro) as Lavoro & { formati_supportati?: readonly string[] };
  const ammessi = l.formati_supportati ?? [];
  if (ammessi.length === 0 || ammessi.includes(formato)) return [formato, ""];
  const candidati = ammessi.filter((f) => f !== "auto");
  if (candidati.length === 0) return [formato, ""];
  const vicino = candidati.reduce((a, b) =>
    Math.abs(rapporto(b) - rapporto(formato)) < Math.abs(rapporto(a) - rapporto(formato)) ? b : a,
  );
  return [
    vicino,
    `il formato ${formato} non è supportato da ${l.nome_umano}: uso ${vicino}, che è il più vicino`,
  ];
}

export function costoEur(lavoro: string, quante = 1): number {
  return Math.round(scegli(lavoro).crediti * quante * CREDITO_EUR * 10000) / 10000;
}
'''


def _py(valore) -> str:
    """Il valore come lo scriverebbe Python, non come lo scrive JSON.

    ⚠️ Trovato eseguendo: `json.dumps` produce `true`, `false` e `null`, che in
    Python non esistono — il modulo generato falliva all'import con
    «name 'true' is not defined». Un generatore che produce codice non
    eseguibile è peggio di nessun generatore: sembra fatto.
    """
    import pprint
    return pprint.pformat(valore, width=96, sort_dicts=False)


def rendi(v: dict, linguaggio: str) -> str:
    testa = INTESTAZIONE.format(impronta=v["impronta"])
    if linguaggio == "python":
        return (
            '"""' + testa + '"""\n'
            f"IMPRONTA_FONTE = {v['impronta']!r}\n"
            f"CREDITO_EUR = {v['credito_eur']}\n\n"
            f"LAVORI = {_py(v['lavori'])}\n\n"
            f"FORMATO_PER_CANALE = {_py(v['formato'])}\n\n"
            f"GATE = {_py(v['gate'])}\n"
            + _SCELTA_PY
        )
    corpo = "\n".join(" * " + r for r in testa.split("\n"))
    return (
        "/**\n" + corpo + "\n */\n"
        f"export const IMPRONTA_FONTE = {json.dumps(v['impronta'])};\n"
        f"export const CREDITO_EUR = {v['credito_eur']};\n\n"
        f"export const LAVORI = {json.dumps(v['lavori'], ensure_ascii=False, indent=2)} as const;\n\n"
        f"export const FORMATO_PER_CANALE = {json.dumps(v['formato'], ensure_ascii=False, indent=2)} as const;\n\n"
        f"export const GATE = {json.dumps(v['gate'], ensure_ascii=False, indent=2)} as const;\n"
        + _SCELTA_TS
    )


def main() -> int:
    ap = argparse.ArgumentParser(description="Allinea la scelta dei modelli creativi")
    ap.add_argument("--allinea", action="store_true")
    args = ap.parse_args()

    if not FONTE.is_file():
        print(f"✗ Fonte non trovata: {FONTE}")
        return 1

    v = estrai()
    print(f"fonte: {FONTE.name} · {len(v['lavori'])} lavori previsti\n")
    for nome, l in v["lavori"].items():
        eur = l["crediti"] * v["credito_eur"]
        print(f"  {nome:20} → {l['nome_umano']:22} {l['crediti']:>2} crediti  €{eur:.2f}")
    print()

    divergenti = 0
    for percorso, linguaggio in GENERATI:
        atteso = rendi(v, linguaggio)
        nome = f"{percorso.parent.parent.name}/{percorso.name}"
        attuale = percorso.read_text(encoding="utf-8") if percorso.is_file() else None
        if attuale == atteso:
            print(f"  ✓ {nome}")
        elif args.allinea:
            percorso.parent.mkdir(parents=True, exist_ok=True)
            percorso.write_text(atteso, encoding="utf-8")
            print(f"  ✓ {nome} — {'creato' if attuale is None else 'rigenerato'}")
        else:
            print(f"  ✗ {nome} — {'assente' if attuale is None else 'DIVERGE dalla fonte'}")
            divergenti += 1

    if divergenti:
        print(f"\n✗ {divergenti} moduli divergono. `--allinea` per correggere.")
        return 2
    print("\n✓ Allineati alla fonte.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
