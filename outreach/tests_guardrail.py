#!/usr/bin/env python3
"""Test dei guardrail — si inietta la violazione vera e si verifica che blocchi.

  python3 tests_guardrail.py
"""
import sys
import types
from datetime import datetime

from sheis_outreach.linter import lint
from sheis_outreach import cli, discovery, statemachine as sm, store, zones, config
from sheis_outreach import unipile

FAILS = []


def check(label, got, want):
    ok = got == want
    print(f"  {'PASS' if ok else 'FAIL'}  {label}")
    if not ok:
        FAILS.append(f"{label}: atteso {want}, ottenuto {got}")


print("=== 1. LINTER · violazioni che DEVONO bloccare ===")
BAD = [
    ("prezzo esplicito in euro",
     "Buongiorno, il flacone da 100ml viene 12 euro e le faccio uno sconto sul primo ordine."),
    ("simbolo di valuta",
     "Le posso proporre la linea colore a €8,50 a tubo."),
    ("percentuale di margine",
     "Le lasciamo un margine del 45% su tutta la linea professionale."),
    ("listino a freddo",
     "Le allego subito il listino completo con le condizioni riservate ai distributori."),
    ("parola shop",
     "Trova tutto sul nostro shop, la registrazione è immediata."),
    ("carrello / acquista",
     "Aggiunga i prodotti al carrello e acquista direttamente dal sito."),
    ("e-commerce proposto",
     "Stiamo aprendo un e-commerce dedicato ai saloni, vuole essere tra i primi?"),
    ("Metodo 29 esplicito",
     "Applichiamo il Metodo 29 per portare i distributori a regime in tre mesi."),
    ("M29 abbreviato",
     "Il framework M29 le garantisce copertura sulla zona."),
    ("claim clinico",
     "YOUNIC è clinicamente provato contro la caduta dei capelli."),
    ("garanzia di risultato",
     "Con SHEis Color ha risultati garantiti su ogni testa, glielo assicuro."),
    ("superlativo non dimostrabile",
     "Siamo il migliore del mercato nella cosmetica professionale italiana."),
    ("claim medico",
     "Il sistema YOUNIC cura la calvizie in dodici settimane."),
    ("100% naturale (il dato vero è 99% origine naturale)",
     "BABILON è una linea 100% naturale, senza alcun ingrediente di sintesi."),
    ("linguaggio da consumatore finale",
     "Ordina il tuo shampoo BABILON, spedizione a casa tua in 48 ore."),
    ("partnership a freddo (touch1)",
     "Buongiorno, le propongo una partnership per la sua zona. Le interessa?"),
    ("messaggio vuoto", "   "),
]
for label, text in BAD:
    touch = "touch1" if "touch1" in label else "touch2"
    r = lint(text, "linkedin", touch)
    check(f"blocca: {label}", r.ok, False)

print("\n=== 2. LINTER · testo APPROVATO che NON deve essere bloccato ===")
GOOD = [
    ("nega l'e-commerce (leva approvata)",
     "Lavoriamo solo tramite distribuzione professionale, con zona in esclusiva. "
     "E una cosa che ad alcuni interessa: non siamo in vendita online. "
     "Né sito nostro al consumatore, né Amazon."),
    ("copione §1 EN",
     "Hello Peter, I'm writing from SHEis Beauty International, an Italian manufacturer of "
     "professional hair care. We're selecting one importer for the UK and your company came up "
     "among the serious distributors in the market. Worth a two-line intro?"),
    ("copione §3 IT — 15 minuti di posa, 83 nuance",
     "In due righe: produzione italiana, tre linee. Il pezzo di volume è SHEis Color, "
     "colorazione senza ammoniaca, 83 nuance, 15 minuti di posa. "
     "Quindici minuti invece di trentacinque cambiano quanti clienti fa in una giornata."),
    ("obiezione 'quanto costa' gestita senza dare cifre",
     "I prezzi li vediamo in call, perché dipendono dalla zona. Quello che le posso dire subito "
     "è che non ci trova online: nessuno le sconterà il prodotto sotto casa."),
]
for label, text in GOOD:
    r = lint(text, "linkedin", "touch2")
    check(f"passa: {label}", r.ok, True)
    if not r.ok:
        print(r.render())

print("\n=== 3. LINTER · limiti di canale ===")
check("nota LinkedIn 301 caratteri bloccata",
      lint("A" * 301, "linkedin", "touch1").ok, False)
check("nota LinkedIn 299 caratteri passa",
      lint("Buongiorno, " + "a" * 287, "linkedin", "touch1").ok, True)

print("\n=== 4. MACCHINA A STATI · transizioni illegali ===")
check("replied -> touched vietata", sm.can(sm.REPLIED, sm.TOUCHED), False)
check("escalated -> touched vietata", sm.can(sm.ESCALATED, sm.TOUCHED), False)
check("exhausted -> queued vietata", sm.can(sm.EXHAUSTED, sm.QUEUED), False)
check("invited -> accepted consentita", sm.can(sm.INVITED, sm.ACCEPTED), True)
check("queued -> replied consentita", sm.can(sm.QUEUED, sm.REPLIED), True)
try:
    sm.assert_transition(sm.REPLIED, sm.TOUCHED)
    check("assert_transition solleva su replied->touched", False, True)
except ValueError:
    check("assert_transition solleva su replied->touched", True, True)

print("\n=== 5. GATE ZONE ESCLUSIVE ===")
con = store.connect(":memory:")
con.execute("INSERT INTO prospects (id,name,prospect_type,zone) VALUES "
            "('s1','Salone Test','salon','te'),"
            "('d1','Distrib Test','distributor','te'),"
            "('s2','Salone NoZone','salon','')")
con.commit()
g = store.get_prospect(con, "s1")
check("salone + mappa assente -> BLOCCATO", zones.check(g)[0], False)
check("distributore -> gate non applicabile", zones.check(store.get_prospect(con, "d1"))[0], True)
check("salone senza zona -> BLOCCATO", zones.check(store.get_prospect(con, "s2"))[0], False)

print("\n=== 6. IDEMPOTENZA E REGOLA 'UN TOCCO AL GIORNO' ===")
store.record_send(con, "d1", "linkedin", "touch1", "ciao", "it", "LIVE", "ok")
check("already_sent riconosce l'invio", store.already_sent(con, "d1", "linkedin", "touch1"), True)
store.record_send(con, "d1", "linkedin", "touch1", "DOPPIONE", "it", "LIVE", "ok")
n = con.execute("SELECT COUNT(*) c FROM sends WHERE prospect_id='d1'").fetchone()["c"]
check("doppio invio dello stesso tocco NON crea una seconda riga", n, 1)
body = con.execute("SELECT body FROM sends WHERE prospect_id='d1'").fetchone()["body"]
check("il primo invio non viene sovrascritto", body, "ciao")
check("touched_today blocca un secondo tocco oggi", store.touched_today(con, "d1"), True)
check("touched_today non blocca un altro prospect", store.touched_today(con, "s1"), False)

print("\n=== 7. DEFAULT DI SICUREZZA ===")
check("DRY_RUN è il default (LIVE non impostata)", config.LIVE, False)
check("Instagram non ha account configurato di default",
      bool(config.ACCOUNTS["instagram"]), False)

# ============================================================================
# Regressioni sui 5 difetti trovati dal collegio avversariale (3/8). Ognuna
# riproduce lo scenario ESATTO segnalato: senza il fix, fallisce; con il fix
# applicato, passa. Non sono probe generiche — sono la prova che il bug
# specifico non torna.
# ============================================================================

print("\n=== 8. REGRESSIONE ① · DRY_RUN non deve bruciare un tick LIVE successivo ===")
# Prima del fix: un tick DRY_RUN scriveva in sends (mode=DRY_RUN) e avanzava
# channel_state a 'invited' per davvero. Il tick LIVE successivo leggeva quel
# touch1 come già spedito, passava al touch2, trovava lo stato 'invited' invece
# di 'accepted' (nessuno ha mai accettato un invito mai spedito) e si bloccava
# per sempre — esattamente il flusso che il README raccomanda (dry-run prima,
# poi LIVE=1).
con8 = store.connect(":memory:")
con8.execute("INSERT INTO prospects (id,name,persona,prospect_type,lang,linkedin_public_id) "
             "VALUES ('r8','Reg Test','it_distributor_small','distributor','it','reg8-li')")
con8.commit()
store.set_state(con8, "r8", "linkedin", sm.QUEUED, reason="setup test")
store.save_draft(con8, "r8", "linkedin", "touch1", "it", "Buongiorno, testo di prova.",
                  True, "linter: OK", "test")
p8 = store.get_prospect(con8, "r8")

stato_prima = store.get_state(con8, "r8", "linkedin")["state"]
cli._advance(con8, p8, "linkedin", "DRY_RUN")
stato_dopo = store.get_state(con8, "r8", "linkedin")["state"]
check("① DRY_RUN non cambia channel_state", stato_dopo, stato_prima)
check("① DRY_RUN non scrive in sends",
      con8.execute("SELECT COUNT(*) c FROM sends WHERE prospect_id='r8'").fetchone()["c"], 0)

# Registratore finto al posto di unipile.send (stesso metodo del collegio):
# nessuna chiamata di rete vera in un test.
inviato = {}


def _fake_send(ch, touch, target, text):
    inviato["fatto"] = (ch, touch, target)
    return {"ok": True}


_orig_send = unipile.send
unipile.send = _fake_send
try:
    esito_live = cli._advance(con8, p8, "linkedin", "LIVE")
finally:
    unipile.send = _orig_send
check("① dopo il DRY_RUN, il tick LIVE invia DAVVERO il touch1 (non resta bloccato)",
      inviato.get("fatto", (None, None))[1], "touch1")
check("① _advance ritorna True sull'invio LIVE riuscito", esito_live, True)
check("① il tocco reale è registrato con mode=LIVE",
      con8.execute("SELECT mode FROM sends WHERE prospect_id='r8' AND touch='touch1'")
      .fetchone()["mode"], "LIVE")

print("\n=== 9. REGRESSIONE ② · stessa persona, due grafie, un solo prospect ===")
con9 = store.connect(":memory:")
pid_a = store.import_prospect_row(con9, {"name": "Giulia Neri", "instagram_username": "GiuliaNeri"})
pid_b = store.import_prospect_row(con9, {"name": "Giulia Neri", "instagram_username": "giulianeri"})
check("② la seconda grafia è riconosciuta come lo stesso prospect (non una nuova pid)",
      pid_b, None)
check("② una sola riga in prospects per le due grafie",
      con9.execute("SELECT COUNT(*) c FROM prospects WHERE instagram_username='giulianeri'")
      .fetchone()["c"], 1)
check("② pid normalizzato in minuscolo", pid_a, "giulianeri")

print("\n=== 10. REGRESSIONE ③ · fuso Europe/Rome vero, non un offset fisso ===")
check("③ store.ROME segue ora legale/solare (zoneinfo, non timezone fisso)",
      type(store.ROME).__module__.startswith("zoneinfo"), True)
offset_inverno = datetime(2026, 1, 15, 12, 0, tzinfo=store.ROME).utcoffset().total_seconds() / 3600
offset_estate = datetime(2026, 7, 15, 12, 0, tzinfo=store.ROME).utcoffset().total_seconds() / 3600
check("③ gennaio è CET (+1h), non +2h fisso", offset_inverno, 1.0)
check("③ luglio è CEST (+2h)", offset_estate, 2.0)

print("\n=== 11. REGRESSIONE ④ · le 5 vie di elusione trovate ora bloccano ===")
ELUSIONI = [
    ("metodo ventinove (grafia estesa)",
     "Applichiamo il metodo ventinove per portare a regime la zona."),
    ("m 2 9 (cifre separate da spazi)",
     "Il framework m 2 9 le garantisce copertura sulla zona."),
    ("parafrasi elusiva (ventinovesimo pilastro)",
     "Le sveliamo il ventinovesimo pilastro del nostro sistema esclusivo."),
    ("tienda online (spagnolo, sinonimo non coperto prima)",
     "Visite nuestra tienda online para más información."),
    ("stesso testo vietato in arabo",
     "نطبق الطريقة رقم 29 لتنظيم الموزعين في المنطقة"),
    ("claim di eredità senza cifre ('da tre generazioni')",
     "Siamo il partner più richiesto dai saloni italiani da tre generazioni."),
    ("prezzo scritto per esteso e isolato ('venti euro')",
     "Il flacone viene venti euro al pubblico."),
]
for label, text in ELUSIONI:
    check(f"④ blocca: {label}", lint(text).ok, False)
# Non-regressione: un testo che PARLA di "ventinove" senza il contesto
# metodo/pilastro non deve diventare un falso positivo permanente.
check("④ NON blocca 'ventinovesima collezione' isolata (nessun falso positivo)",
      lint("La collezione ventinovesima è appena uscita.").ok, True)

print("\n=== 12. REGRESSIONE ⑤ · un distributore promosso resta in revisione ===")
# Il salone è protetto dal gate zone esclusive ad ogni tick (sezione 5 sopra).
# Il distributore non aveva un gate equivalente: con min_score=50, un
# candidato a 61 entrava in coda pronto per il primo tick LIVE senza che
# nessuno l'avesse mai guardato.
con12 = store.connect(":memory:")
store.upsert_candidate(
    con12, "distrib.test", full_name="Distrib Test", bio="rivenditore Davines",
    followers=500, following=100, posts_count=50, external_url="",
    business_email="", business_phone="", city="", zone="", country="IT", lang="it",
    competitor_brand="davines", tipo="distributore", score=61, motivo_score="test",
    hook="", hook_fonte="", scoperto_da="test")
_orig_connect = store.connect
store.connect = lambda *a, **kw: con12  # discovery.cmd_promote apre la sua connessione
try:
    discovery.cmd_promote(types.SimpleNamespace(tipo=None, min_score=50, dry_run=False))
finally:
    store.connect = _orig_connect
stato_ig = store.get_state(con12, "distrib.test", "instagram")
check("⑤ il distributore promosso NON è 'queued' (pronto a partire)",
      stato_ig["state"] == "queued", False)
check("⑤ il distributore promosso è 'skipped' (in attesa di revisione umana)",
      stato_ig["state"], "skipped")
check("⑤ il motivo spiega che serve una revisione",
      "revis" in (stato_ig["reason"] or "").lower(), True)
# La riabilitazione manuale (cli.py review --approva) deve poterlo sbloccare.
sm.assert_transition(sm.SKIPPED, sm.QUEUED)  # solleva se la transizione non fosse permessa
store.set_state(con12, "distrib.test", "instagram", sm.QUEUED, reason="approvato (test)")
check("⑤ dopo l'approvazione manuale il canale torna 'queued'",
      store.get_state(con12, "distrib.test", "instagram")["state"], "queued")


# ---------------------------------------------------------------------------
# ⑥ La simulazione non deve né bloccare un invio vero né prendergli il posto.
#
# Difetto misurato il 3/8 eseguendo la sequenza che il README raccomanda
# («guarda il tick in DRY_RUN prima di mettere LIVE=1»). Aveva due facce:
#   · prima: `already_sent()` non filtrava per mode → l'invio vero non partiva MAI
#   · poi, corretta la lettura: `INSERT OR IGNORE` trovava la chiave occupata dalla
#     riga simulata e scartava in silenzio la registrazione dell'invio reale →
#     il sistema RIMANDAVA allo stesso prospect a ogni tick successivo
# Cioè: da «non invia mai» a «può inviare più volte». Servono entrambe le prove.
# ---------------------------------------------------------------------------
con6 = store.connect(":memory:")
K = ("promo.test", "linkedin", "touch1")


def _righe6():
    return con6.execute(
        "SELECT mode, body FROM sends WHERE prospect_id=? AND channel=? AND touch=?", K
    ).fetchall()


store.record_send(con6, *K, "testo simulato", "it", "DRY_RUN", "ok")
check("⑥ dopo un tick simulato, l'invio VERO può ancora partire",
      store.already_sent(con6, *K, mode="LIVE"), False)
check("⑥ il controllo generico vede comunque la simulazione (serve all'anteprima)",
      store.already_sent(con6, *K), True)

store.record_send(con6, *K, "messaggio VERO", "it", "LIVE", "ok")
check("⑥ l'invio reale PROMUOVE la riga invece di essere scartato",
      _righe6()[0]["mode"], "LIVE")
check("⑥ resta UNA sola riga per (prospect, canale, tocco)", len(_righe6()), 1)
check("⑥ dopo l'invio reale un secondo tentativo è bloccato (idempotenza vera)",
      store.already_sent(con6, *K, mode="LIVE"), True)

store.record_send(con6, *K, "rerun", "it", "LIVE", "ok")
check("⑥ un rerun non falsifica la registrazione del primo invio reale",
      _righe6()[0]["body"], "messaggio VERO")

store.record_send(con6, *K, "simulazione tardiva", "it", "DRY_RUN", "ok")
check("⑥ una simulazione tardiva non declassa un invio reale già registrato",
      _righe6()[0]["mode"], "LIVE")

print("\n" + "=" * 60)
if FAILS:
    print(f"{len(FAILS)} TEST FALLITI:")
    for f in FAILS:
        print("  ·", f)
    sys.exit(1)
print("TUTTI I TEST PASSATI")
