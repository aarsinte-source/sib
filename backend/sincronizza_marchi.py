#!/usr/bin/env python3
"""Tiene allineato il registro dei MARCHI fra i sistemi che devono obbedirgli.

PERCHÉ ESISTE
-------------
Stesso motivo di `sincronizza_brand.py`, su un oggetto diverso e con una
lezione già pagata due volte.

Fino al 2026-08-04 i marchi di SHEis vivevano come una lista scritta a mano in
`src/lib/brand.ts`: `["sheis-color", "babilon", "younic"]`. Erano dedotti dalle
trascrizioni, non dai file del cliente. Quando Mauro ha consegnato il foglio
marchi, ne sono comparsi **tre in più** — il marchio ombrello SHEis BEAUTY, la
linea SHEis COLOR FIRST e VR Intelligent.

Nello stesso momento la migrazione 0007 stava per essere applicata con un
vincolo `check (brand in ('sheis-color','babilon','younic'))`. Sarebbe entrata
in produzione una regola che RIFIUTA A SCRITTURA tre marchi veri del cliente:
non un filtro troppo permissivo, ma un filtro che blocca il corretto e lo fa
sembrare un guasto del programma.

Da qui la regola: **i marchi hanno una sola fonte**, `marchi.json`, e i moduli
per gli altri sistemi si GENERANO da lì. Copiare un elenco a mano significa
scoprirne la divergenza il giorno in cui costa.

COSA FA
-------
  (senza argomenti)  dice quali copie divergono dalla fonte; esce ≠ 0 se almeno
                     una diverge — così può fare da cancello in una verifica.
  --allinea          rigenera le copie divergenti.

COSA GENERA
-----------
  · studio  → src/lib/marchi.ts        (TypeScript, usato dall'interfaccia)
  · workers → lib/marchi.py            (Python, usato dai generatori)
  · ads     → lib/marchi.mjs           (JavaScript, usato dal motore campagne)
  · studio  → public/marchi/*.png|svg  (gli asset veri, serviti al browser)

Gli asset si COPIANO, non si rigenerano: un logotipo non si ridisegna mai.
"""
from __future__ import annotations

import argparse
import json
import shutil
from pathlib import Path

QUI = Path(__file__).resolve().parent
FONTE = QUI / "marchi.json"
ASSET = QUI / "marchi"

STUDIO = Path.home() / "alkemia-sheis-studio"
WORKERS = Path.home() / "alkemia-sheis-workers"
ADS = Path.home() / "alkemia-sheis-ads"

GENERATI = [
    (STUDIO / "src" / "lib" / "marchi.ts", "ts"),
    (WORKERS / "lib" / "marchi.py", "py"),
    (ADS / "lib" / "marchi.mjs", "mjs"),
]

INTESTAZIONE = (
    "GENERATO da ~/alkemia-sheis-backend/sincronizza_marchi.py — NON MODIFICARE A MANO.\n"
    "La fonte è marchi.json. Una modifica qui viene sovrascritta al primo riallineamento,\n"
    "e nel frattempo fa divergere questo sistema dagli altri senza che nessuno se ne accorga."
)


def carica() -> dict:
    if not FONTE.is_file():
        raise SystemExit(f"✗ Fonte non trovata: {FONTE}")
    return json.loads(FONTE.read_text(encoding="utf-8"))


def estrai(d: dict) -> dict:
    """Solo ciò che serve ai consumatori: gli slug, i colori, i file, le regole.
    Le descrizioni lunghe restano nel JSON — chi genera un prompt le legge da
    lì, chi valida un valore non ne ha bisogno."""
    marchi = d["marchi"]
    return {
        "slug": list(marchi),
        "marchi": {
            k: {
                "nome": v["nome"],
                "tipo": v["tipo"],
                "inchiostro": v["inchiostro"],
                "rapporto": v["rapporto"],
                "svg": v["file"]["svg"].split("/")[-1],
                "png": v["file"]["png"].split("/")[-1],
                "descrizione": v["descrizione"],
                "quando_si_usa": v["quando_si_usa"],
                "avvertenze": v.get("avvertenze", []),
            }
            for k, v in marchi.items()
        },
        "palette_marchio": d["palette"]["marchio"],
        "palette_comunicazione": d["palette"]["comunicazione"],
        "regole_sempre": d["regole_uso"]["sempre"],
        "regole_mai": d["regole_uso"]["mai"],
        "prompt_sempre": d["prompt_generativo"]["sempre_incluso"],
        "prompt_mai": d["prompt_generativo"]["mai_chiedere"],
    }


def rendi(v: dict, linguaggio: str) -> str:
    testa = "\n".join(f"{'#' if linguaggio == 'py' else ' *'} {r}" for r in INTESTAZIONE.split("\n"))

    if linguaggio == "py":
        import pprint
        # ⚠️ pprint, NON json.dumps: json scrive `true`/`null`, che in Python
        # non esistono e fanno esplodere l'import con un NameError. È già
        # successo una volta su sincronizza_modelli.py.
        corpo = "\n".join(
            f"{nome.upper()} = {pprint.pformat(v[nome], width=100, sort_dicts=False)}\n"
            for nome in v
        )
        return f'"""Registro dei marchi SHEis.\n\n{INTESTAZIONE}\n"""\nfrom __future__ import annotations\n\n{corpo}\n{_py_aiuti()}'

    dati = json.dumps(v, ensure_ascii=False, indent=2)
    if linguaggio == "ts":
        return f"/**\n{testa}\n */\n\nexport const MARCHI_REGISTRO = {dati} as const;\n\n{_ts_aiuti()}"
    return f"/**\n{testa}\n */\n\nexport const MARCHI_REGISTRO = {dati};\n\n{_mjs_aiuti()}"


def _py_aiuti() -> str:
    return '''

def marchio(slug: str) -> dict | None:
    """Il marchio, o None. Non solleva: uno slug sconosciuto è uno STATO da
    dichiarare a chi ha chiesto, non un'eccezione da propagare."""
    return MARCHI.get(slug)


def slug_valido(slug: str) -> bool:
    return slug in MARCHI


def istruzioni_marchio(slug: str) -> str:
    """Le righe da mettere nel prompt del generatore per QUESTO marchio.
    Include sempre il divieto di disegnare testo: è la regola che protegge dal
    fallimento più comune, un logotipo inventato che somiglia a quello vero."""
    m = marchio(slug)
    if not m:
        return PROMPT_MAI
    return (
        f"Marchio: {m['nome']} ({m['tipo']}). {m['descrizione']}\\n"
        f"{PROMPT_SEMPRE}\\n{PROMPT_MAI}"
    )
'''


def _ts_aiuti() -> str:
    return """export type SlugMarchio = (typeof MARCHI_REGISTRO.slug)[number];

export const SLUG_MARCHI = MARCHI_REGISTRO.slug;

export function marchio(slug: string) {
  return (MARCHI_REGISTRO.marchi as Record<string, (typeof MARCHI_REGISTRO.marchi)[SlugMarchio]>)[slug] ?? null;
}

export function slugValido(slug: string): slug is SlugMarchio {
  return (MARCHI_REGISTRO.slug as readonly string[]).includes(slug);
}

/**
 * Le righe da mettere nel prompt del generatore per QUESTO marchio. Include
 * sempre il divieto di disegnare testo: è la regola che protegge dal fallimento
 * più comune, un logotipo inventato che somiglia a quello vero.
 */
export function istruzioniMarchio(slug: string): string {
  const m = marchio(slug);
  if (!m) return MARCHI_REGISTRO.prompt_mai;
  return `Marchio: ${m.nome} (${m.tipo}). ${m.descrizione}\\n${MARCHI_REGISTRO.prompt_sempre}\\n${MARCHI_REGISTRO.prompt_mai}`;
}
"""


def _mjs_aiuti() -> str:
    return """export const SLUG_MARCHI = MARCHI_REGISTRO.slug;

export function marchio(slug) {
  return MARCHI_REGISTRO.marchi[slug] ?? null;
}

export function slugValido(slug) {
  return MARCHI_REGISTRO.slug.includes(slug);
}

export function istruzioniMarchio(slug) {
  const m = marchio(slug);
  if (!m) return MARCHI_REGISTRO.prompt_mai;
  return `Marchio: ${m.nome} (${m.tipo}). ${m.descrizione}\\n${MARCHI_REGISTRO.prompt_sempre}\\n${MARCHI_REGISTRO.prompt_mai}`;
}
"""


def copia_asset(allinea: bool) -> int:
    """Gli asset vanno anche dove il browser li può servire. Si copiano, non si
    rigenerano: un logotipo non si ridisegna mai."""
    dest = STUDIO / "public" / "marchi"
    divergenti = 0
    if not ASSET.is_dir():
        print(f"  ✗ cartella asset assente: {ASSET}")
        return 1
    for f in sorted(ASSET.glob("*")):
        if f.name.startswith("_") or f.suffix not in (".svg", ".png"):
            continue
        d = dest / f.name
        uguale = d.is_file() and d.read_bytes() == f.read_bytes()
        if uguale:
            print(f"  ✓ public/marchi/{f.name}")
            continue
        print(f"  ✗ public/marchi/{f.name} — {'assente' if not d.is_file() else 'DIVERGE'}")
        divergenti += 1
        if allinea:
            dest.mkdir(parents=True, exist_ok=True)
            shutil.copy2(f, d)
            print("    → copiato")
            divergenti -= 1
    return divergenti


def main() -> int:
    ap = argparse.ArgumentParser(description="Allinea il registro dei marchi fra i sistemi")
    ap.add_argument("--allinea", action="store_true", help="rigenera le copie divergenti")
    args = ap.parse_args()

    d = carica()
    v = estrai(d)
    print(f"fonte: {FONTE.name} — {len(v['slug'])} marchi: {', '.join(v['slug'])}\n")

    divergenti = 0
    for percorso, linguaggio in GENERATI:
        atteso = rendi(v, linguaggio)
        nome = f"{percorso.parent.parent.parent.name if linguaggio == 'ts' else percorso.parent.parent.name}/{percorso.name}"
        attuale = percorso.read_text(encoding="utf-8") if percorso.is_file() else None
        if attuale == atteso:
            print(f"  ✓ {nome}")
            continue
        print(f"  ✗ {nome} — {'assente' if attuale is None else 'DIVERGE dalla fonte'}")
        divergenti += 1
        if args.allinea:
            percorso.parent.mkdir(parents=True, exist_ok=True)
            percorso.write_text(atteso, encoding="utf-8")
            print("    → rigenerato")
            divergenti -= 1

    print("\n  ── asset (si copiano, non si rigenerano) ──")
    divergenti += copia_asset(args.allinea)

    if divergenti:
        print(f"\n✗ {divergenti} disallineamenti. Riallinea con:  python3 {Path(__file__).name} --allinea")
        return 1
    print("\n✓ tutto allineato alla fonte.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
