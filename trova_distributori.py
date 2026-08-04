#!/usr/bin/env python3
"""Trova distributori e importatori, e li scarta quando non sono di fascia.

LA PARTE CHE VALE NON È TROVARLI
--------------------------------
Un elenco di «distributori di prodotti per capelli» si compra in dieci minuti e
non serve a niente: dentro ci sono i grossisti da supermercato, chi vende al
pubblico su Amazon, e chi ha un magazzino ma nessun tecnico. Contattarli tutti
non è ottimismo, è danno: un contatto bruciato non si recupera, e i distributori
italiani del settore sono qualche centinaio, non qualche migliaio.

Quindi il lavoro vero è lo SCARTO. `bersagli-outreach.json` dichiara quattro
motivi per scartare e sei voci di punteggio; sotto quaranta non si contatta.

⚠️ IL DISCRIMINANTE PIÙ FORTE È LA FORMAZIONE, e non l'abbiamo scelto noi:
viene dalla classificazione Profit/Break-even/KO già in uso su SHEis. Un
distributore che non forma i saloni non fa provare il prodotto, e una
colorazione professionale che non si prova non si vende. Vale trenta punti su
cento.

DA DOVE ARRIVANO
----------------
Due strade, e la seconda costa:
  1. ScrapeCreators — profili social e siti. Compreso nel canone.
  2. Monid/Apollo — aziende per settore e paese. Consuma saldo, e serve proprio
     per l'estero: un importatore spagnolo può benissimo non avere Instagram.

USO
    python3 trova_distributori.py --mercato spagna
    python3 trova_distributori.py --mercato italia --regione Piemonte
    python3 trova_distributori.py --mercato italia --tutte-le-regioni --salva
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from lib.fonti_social import FontiSocial  # noqa: E402
from lib.ricerca_mercato import cerca_aziende, saldo_monid  # noqa: E402
from lib.supabase import SupabaseClient  # noqa: E402

BERSAGLI = Path(os.environ.get(
    "SHEIS_BERSAGLI",
    Path.home() / "alkemia-sheis-backend" / "bersagli-outreach.json",
))


def carica() -> dict:
    if not BERSAGLI.is_file():
        raise SystemExit(
            f"Manca la mappa dei bersagli in {BERSAGLI}. Senza, non si sa chi cercare "
            f"né chi scartare — e cercare senza scartare produce un elenco inutile."
        )
    return json.loads(BERSAGLI.read_text(encoding="utf-8"))


# ── segnali, cercati nel testo pubblico ─────────────────────────────────────
# Sono espressi come FORME, non come parole: «formazione», «formativo»,
# «formiamo» sono lo stesso segnale, e un elenco di parole intere ne perde due
# su tre. È la stessa lezione già pagata sui claim di marca.
SEGNALI = {
    "formazione": r"\b(formazion\w*|formiamo|accademi\w*|academy|corsi?\b|masterclass|educational|training|capacitaci[óo]n|escuela|curso)",
    "professionale": r"\b(professional\w*|profesional\w*|per parrucchier|per saloni|per il salone|solo per (i )?professionist|uso professionale|peluquer[íi]as?)",
    "fiere": r"\b(cosmoprof|sal[óo]n\s*look|cosmobeauty|estetica\s*20\d\d|beauty\s*forum|fiera|feria|expo)",
    "agenti": r"\b(agent[ei]\b|rete\s+vendita|consulent[ei]\s+tecnic|tecnic[oi]\s+di\s+zona|comerciales?|representantes?)",
    "esclusiva": r"\b(esclusiv\w*|distribuzione\s+esclusiva|distribuidor\s+exclusivo|in\s+esclusiva)",
}

# Motivi di scarto. Ogni pattern qui dentro è un «no» secco: nessun punteggio
# lo riscatta, perché non sono difetti di grado ma di natura.
SCARTI = {
    "vende-al-pubblico": r"\b(aggiungi\s+al\s+carrello|acquista\s+ora|compra\s+ahora|a[ñn]adir\s+al\s+carrito|shop\s+online|vendita\s+al\s+pubblico|spedizione\s+gratuita|checkout)",
    "generalista": r"\b(casalinghi|detersiv|alimentari|ferramenta|supermercat|cash\s*&\s*carry|drogher)",
    # ⚠️ MISURATO il 2026-08-04. La prima passata sulla Spagna ha portato in cima
    # Revlon Professional e Tahe: sono PRODUTTORI, cioè concorrenti, non
    # prospect. Un elenco di contatti che contiene i tuoi concorrenti non è una
    # lista imperfetta: è una lista che, se qualcuno la usa, manda a un
    # concorrente un messaggio che dice cosa stai facendo.
    "e-un-produttore": r"\b(fabricante|fabricamos|nuestra\s+f[áa]brica|manufacturer|we\s+manufacture|produttore|produciamo|nostro\s+stabilimento|laboratorio\s+propio|marca\s+propia\s+de\s+fabricaci[óo]n)",
    # Una catena di saloni non distribuisce: è il cliente del distributore.
    "catena-di-saloni": r"\b(nuestros\s+sal[óo]nes|cadena\s+de\s+peluquer[íi]as|reserva\s+tu\s+cita|pide\s+cita|prenota\s+il\s+tuo\s+appuntamento|i\s+nostri\s+saloni)",
}


def marchio_da_scartare(nome: str, regole: dict) -> str:
    """Il nome è quello di un concorrente o di un produttore noto?

    Il confronto è sul NOME, non sul testo del sito, perché la homepage di un
    marchio famoso non dice «fabricante»: dice il proprio nome, che tutti già
    conoscono. Revlon Professional e Tahe erano finiti in cima alla lista dei
    contatti proprio così.
    """
    blocco = regole.get("marchi_da_scartare") or {}
    n = (nome or "").lower()
    for elenco, motivo in ((blocco.get("concorrenti_validati", []), "e-un-concorrente"),
                           (blocco.get("produttori_noti", []), "e-un-produttore-noto")):
        for marca in elenco:
            if re.search(marca.lower(), n, re.IGNORECASE):
                return motivo
    return ""


def punteggia(testo: str, regole: dict, in_zona: bool, nome: str = "") -> tuple[int, list[str], list[str]]:
    """(punteggio, segnali trovati, motivi di scarto). Il testo è tutto ciò che
    si è potuto leggere pubblicamente: bio, descrizione, sito."""
    t = (testo or "").lower()
    scarti = [nome_r for nome_r, p in SCARTI.items() if re.search(p, t, re.IGNORECASE)]
    marca = marchio_da_scartare(nome, regole)
    if marca:
        scarti.append(marca)

    trovati = [nome for nome, p in SEGNALI.items() if re.search(p, t, re.IGNORECASE)]
    pesi = {
        "formazione": 30,
        "professionale": 15,
        "fiere": 10,
        "agenti": 10,
        "esclusiva": 20,   # tratta marchi in esclusiva = catalogo, non magazzino
    }
    punti = sum(pesi.get(s, 0) for s in trovati)
    if in_zona:
        punti += 15
    return min(100, punti), trovati, scarti


def leggi_sito(dominio: str, timeout: int = 12) -> str:
    """Il testo pubblico del sito. È QUI che si vede la fascia.

    ⚠️ Difetto misurato il 2026-08-04: si giudicava dalla bio Instagram, che sono
    ventiquattro caratteri («Lencería para el hogar 🏡»). Su un testo così non si
    distingue un distributore professionale da un negozio di biancheria — e
    infatti la ricerca per parole generiche restituiva skateboard, alluminio e
    biciclette. Il sito invece dice se c'è un'accademia, se parlano ai
    parrucchieri, a quali fiere vanno.
    """
    import urllib.request, urllib.error
    for schema in ("https://", "http://"):
        try:
            req = urllib.request.Request(
                schema + dominio,
                headers={"User-Agent": "Mozilla/5.0 (compatible; SHEis/1.0)"},
            )
            grezzo = urllib.request.urlopen(req, timeout=timeout).read(400_000)
            testo = grezzo.decode("utf-8", errors="replace")
            testo = re.sub(r"<(script|style)[^>]*>.*?</\1>", " ", testo, flags=re.S | re.I)
            testo = re.sub(r"<[^>]+>", " ", testo)
            return re.sub(r"\s+", " ", testo)[:20000]
        except Exception:
            continue
    return ""


def cerca_social(fonti: FontiSocial, query: str, quanti: int = 25) -> list[dict]:
    r = fonti.instagram_profili(query, quanti=quanti)
    if r.errore:
        print(f"    ! {r.errore[:110]}")
    return [
        {"fonte": "instagram", "nome": c.autore, "testo": c.testo,
         "follower": c.autore_follower, "url": c.url}
        for c in r.contenuti
    ]


def cerca_aziende_monid(settore: str, paese: str, quante: int) -> list[dict]:
    prima = saldo_monid()
    r = cerca_aziende(settore, paese, quante=quante)
    dopo = saldo_monid()
    costo = round(prima - dopo, 4) if (prima is not None and dopo is not None and prima > dopo) else 0.0
    if not r.get("ok"):
        print(f"    ! Monid: {r.get('errore','')[:130]}")
        return []
    print(f"    Monid: {r['quante']} aziende · costo misurato €{costo}")
    return [
        {"fonte": "apollo", "nome": a["nome"], "testo": " ".join(filter(None, [
            a.get("nome"), a.get("dominio"), " ".join(a.get("settori") or [])])),
         "dominio": a.get("dominio"), "citta": a.get("citta"),
         "dipendenti": a.get("dipendenti"), "url": a.get("linkedin")}
        for a in r["aziende"]
    ]


def main() -> int:
    ap = argparse.ArgumentParser(description="Trova distributori di fascia alta per SHEis")
    ap.add_argument("--mercato", choices=["spagna", "italia"], required=True)
    ap.add_argument("--regione", help="una regione italiana fra quelle bersaglio")
    ap.add_argument("--tutte-le-regioni", action="store_true")
    ap.add_argument("--con-social", action="store_true",
                    help="aggiunge i profili social come fonte secondaria (rumorosa)")
    ap.add_argument("--salva", action="store_true", help="scrive i candidati sul database")
    args = ap.parse_args()

    d = carica()
    m = d["mercati"][args.mercato]
    soglia = d["punteggio"]["soglia_contatto"]

    zone: list[str] = []
    if args.mercato == "italia":
        previste = m["regioni"]
        if args.tutte_le_regioni:
            zone = previste
        elif args.regione:
            if args.regione not in previste:
                print(f"✗ «{args.regione}» non è fra le regioni bersaglio: {', '.join(previste)}")
                return 2
            zone = [args.regione]
        else:
            zone = previste
    else:
        zone = ["Spagna"]

    print(f"mercato: {args.mercato} · zone: {', '.join(zone)}")
    print(f"soglia di contatto: {soglia}/100 — sotto, non si scrive\n")

    fonti = FontiSocial()
    trovati: list[dict] = []

    # ⚠️ MONID È LA FONTE PRIMARIA QUI, e non è una preferenza: è misurato.
    # La ricerca profili Instagram per parole generiche («distribuidor
    # exclusivo») restituisce skateboard, alluminio, biciclette — e Brasile,
    # Venezuela, Messico invece della Spagna. Cerca profili, non IMPRESE, e non
    # sa filtrare per settore né per paese. Un importatore spagnolo di prodotti
    # professionali può benissimo non avere alcun Instagram.
    for zona in zone:
        print(f"  ── {zona}")
        # ⚠️ La zona è un LUOGO, non una parola chiave di settore.
        # Misurato il 2026-08-04: concatenandola al settore («professional hair
        # products Piemonte») Apollo restituiva ZERO per tutte e cinque le
        # regioni. Non era «non ci sono distributori in Piemonte»: era una
        # domanda malformata. Zero risultati su una domanda sbagliata è il
        # peggiore dei guasti, perché somiglia a un dato.
        luoghi = (m.get("luoghi_apollo", {}).get(zona)
                  if args.mercato == "italia" else [m["paese"]]) or [f"{zona}, Italy"]
        for luogo in luoghi:
            for settore in m.get("settori_apollo", ["hair care distribution"]):
                for a in cerca_aziende_monid(settore, luogo, quante=25):
                    a["zona"] = zona
                    trovati.append(a)

        # I social restano come fonte SECONDARIA: quando la parola chiave è
        # abbastanza specifica da nominare il mestiere, qualche profilo vero lo
        # trovano — e la bio, per quanto corta, dice se parlano ai saloni.
        if fonti.pronto and args.con_social:
            for chiave in m["cerca_anche"][:2]:
                q = f"{chiave} {zona}" if args.mercato == "italia" else chiave
                grezzi = cerca_social(fonti, q, quanti=15)
                print(f"    social «{q}» → {len(grezzi)}")
                for g in grezzi:
                    g["zona"] = zona
                    trovati.append(g)

    # De-duplica: lo stesso profilo esce da più parole chiave.
    visti: dict[str, dict] = {}
    for t in trovati:
        chiave = (t.get("nome") or t.get("dominio") or "").lower().strip()
        if chiave and chiave not in visti:
            visti[chiave] = t

    print(f"\n  {len(visti)} distinti · leggo i siti per giudicare la fascia…")
    valutati = []
    for t in visti.values():
        # Il sito è la fonte su cui si giudica: la bio non basta.
        dom = t.get("dominio")
        if dom:
            sito = leggi_sito(dom)
            if sito:
                t["testo"] = (t.get("testo") or "") + " " + sito
                t["sito_letto"] = True
        punti, segnali, scarti = punteggia(t.get("testo", ""), d, in_zona=True, nome=t.get("nome", ""))
        t.update({"punteggio": punti, "segnali": segnali, "scarti": scarti})
        valutati.append(t)

    buoni = sorted(
        [t for t in valutati if not t["scarti"] and t["punteggio"] >= soglia],
        key=lambda x: -x["punteggio"],
    )
    scartati = [t for t in valutati if t["scarti"]]
    sotto = [t for t in valutati if not t["scarti"] and t["punteggio"] < soglia]

    print(f"\n  {len(visti)} distinti · {len(buoni)} sopra soglia · "
          f"{len(scartati)} scartati per natura · {len(sotto)} sotto soglia")

    if scartati:
        print("\n  scartati (nessun punteggio li riscatta):")
        for s in scartati[:6]:
            print(f"    ✗ {s['nome'][:34]:34s} {', '.join(s['scarti'])}")

    print("\n  da contattare:")
    for b in buoni[:20]:
        print(f"    {b['punteggio']:3d}  {b['nome'][:34]:34s} {b.get('zona',''):12s} {', '.join(b['segnali'])}")

    if not buoni:
        print("    nessuno. Non è un guasto: significa che con queste parole chiave, in questa")
        print("    zona, non c'è nessuno di fascia. Cambiare parole chiave prima di abbassare la soglia.")

    if args.salva and buoni:
        sb = SupabaseClient()
        righe = [{
            "username": b["nome"], "nome": b["nome"], "bio": (b.get("testo") or "")[:900],
            "follower": b.get("follower"), "citta": b.get("citta"), "zona": b.get("zona"),
            "tipo": "distributore", "tipo_motivo": ", ".join(b["segnali"]) or "segnali deboli",
            "score": b["punteggio"], "scoperto_da": f"trova_distributori/{args.mercato}",
            "stato": "nuovo",
        } for b in buoni]
        e = sb.upsert("sheis_candidati", righe, conflitto="username")
        print(f"\n  salvati: {'✓ ' + str(len(righe)) if e.ok else '✗ ' + e.errore[:130]}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
