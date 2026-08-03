"""CLI operativa — SHEis Outreacher.

  preflight   verifica pairing Unipile, warm-up, copione, mappa zone, linter
  import      carica una lista CSV di prospect
  compose     genera il testo di un tocco (Claude headless) e lo passa al linter
  tick        avanza la sequenza — DRY_RUN salvo LIVE=1
  status      stato della macchina a stati
  report      riepilogo per canale/stato + eventi recenti
"""
import argparse
import csv
import sys
import time
from pathlib import Path

from . import composer, config, discovery, guards, statemachine as sm, store, unipile, zones
from .linter import lint

C_OK, C_NO, C_WARN, C_OFF = "\033[92m", "\033[91m", "\033[93m", "\033[0m"


def _m(ok):
    return f"{C_OK}OK{C_OFF}" if ok else f"{C_NO}KO{C_OFF}"


# ---------------------------------------------------------------- preflight
def cmd_preflight(args):
    print("=== PREFLIGHT — SHEis Outreacher ===\n")
    problems = []

    print("[1] Credenziali Unipile")
    try:
        env = config.load_env()
        has = bool(env.get("UNIPILE_DSN") and env.get("UNIPILE_API_KEY"))
        print(f"    {_m(has)} .env: {config.ENV_FILE}")
        if not has:
            problems.append("credenziali Unipile mancanti")
    except Exception as e:
        print(f"    {_m(False)} {e}")
        problems.append(str(e))

    print("\n[2] Account pairati su Unipile")
    paired = {}
    try:
        for a in unipile.list_accounts():
            t = (a.get("type") or "").lower()
            st = (a.get("sources") or [{}])[0].get("status", "?")
            paired[t] = a.get("id")
            print(f"    · {t:<10} {a.get('id')}  {a.get('name')}  [{st}]")
    except Exception as e:
        print(f"    {_m(False)} impossibile leggere gli account: {e}")
        problems.append("Unipile non raggiungibile")

    print("\n[3] Canali con sender implementato")
    for ch in config.SENDABLE:
        acc = config.ACCOUNTS.get(ch)
        live_ok = bool(acc) and acc in paired.values()
        note = "pronto" if live_ok else (
            "account_id configurato ma NON pairato" if acc else
            f"nessun account: collega «SHEis partners» su Unipile (QR) e imposta "
            f"SHEIS_ACCOUNT_{ch.upper()}")
        print(f"    {_m(live_ok)} {ch:<10} {acc or '—'}  {note}")
        if not live_ok:
            problems.append(f"canale {ch} non inviabile: {note}")

    print("\n[4] Warm-up account")
    done, msg, days = guards.warmup_status()
    cap, capmsg = guards.max_per_run()
    print(f"    {_m(done)} {msg}")
    print(f"    · {capmsg}")

    print("\n[5] Finestra di invio")
    okw, wmsg = guards.within_window()
    print(f"    {_m(okw)} {wmsg}")

    print("\n[6] Fonti di contenuto")
    pb = Path(config.PLAYBOOK).exists()
    print(f"    {_m(pb)} copione approvato: {config.PLAYBOOK}")
    if not pb:
        problems.append("copione non trovato")
    vl = Path(config.VOICE_LEARNED).exists()
    print(f"    {'OK' if vl else '--'} VOICE-LEARNED (correzioni di Mauro): {config.VOICE_LEARNED}"
          + ("" if vl else "  [assente: si usa il copione base]"))

    print("\n[7] Mappa zone esclusive")
    zm = zones.load_map()
    avail = zm.get("map_available")
    print(f"    {_m(avail)} zone note: {len(zm.get('zones', {}))}")
    if not avail:
        print(f"    {C_WARN}    → ogni lead-SALONE finirà in escalation umana. "
              f"Input bloccante da Mauro.{C_OFF}")

    print("\n[8] Claude headless (compositore)")
    cb = Path(config.CLAUDE_BIN).exists()
    print(f"    {_m(cb)} {config.CLAUDE_BIN} (modello: {config.CLAUDE_MODEL})")
    if not cb:
        problems.append("Claude CLI non trovato")

    print("\n[9] Linter pre-invio (self-test)")
    probes = [("Il prezzo è 12 euro a flacone.", False), ("Vai sul nostro shop online.", False),
              ("Applichiamo il Metodo 29.", False), ("Risultati garantiti in 4 settimane.", False),
              ("Non siamo in vendita online, né Amazon né e-commerce nostro.", True)]
    allok = all(lint(t).ok == exp for t, exp in probes)
    print(f"    {_m(allok)} {len(probes)}/{len(probes)} sonde attese" if allok
          else f"    {_m(False)} il linter non si comporta come atteso")
    if not allok:
        problems.append("linter non affidabile")

    print("\n=== ESITO ===")
    print(f"MODALITÀ: {'LIVE (invii reali)' if config.LIVE else 'DRY_RUN (default, nessun invio)'}")
    if problems:
        print(f"{C_WARN}{len(problems)} punti aperti:{C_OFF}")
        for p in problems:
            print(f"  · {p}")
    else:
        print(f"{C_OK}tutto verde{C_OFF}")
    return 0


# ---------------------------------------------------------------- import
# Fonte unica in store.py — riusata anche da discovery.cmd_promote (candidati promossi).
CSV_FIELDS = store.CSV_FIELDS


def cmd_import(args):
    con = store.connect()
    path = Path(args.file)
    if not path.exists():
        print(f"file non trovato: {path}")
        return 1
    added = skipped = 0
    with path.open() as f:
        for row in csv.DictReader(f):
            row = {k.strip(): (v or "").strip() for k, v in row.items() if k}
            pid = store.import_prospect_row(con, row)
            if pid:
                added += 1
            elif row.get("name"):
                skipped += 1
    print(f"importati {added} prospect · {skipped} già presenti · DB: {config.DB_PATH}")
    return 0


# ---------------------------------------------------------------- compose
def cmd_compose(args):
    con = store.connect()
    p = store.get_prospect(con, args.prospect)
    if not p:
        print(f"prospect '{args.prospect}' non trovato")
        return 1
    lang = args.lang or p["lang"] or "it"
    ch, touch = args.channel, args.touch

    print(f"--- compose · {p['name']} ({p['company']}) · {ch}/{touch} · {lang} ---")
    try:
        text, source, res = composer.compose(p, ch, touch, lang)
    except RuntimeError as e:
        print(f"{C_NO}compositore fallito: {e}{C_OFF}")
        store.event(con, p["id"], ch, "compose_failed", str(e))
        return 1

    print(text)
    print(f"\n  [{len(text)} caratteri · fonte: {source}]")
    print(res.render())
    if not res.ok:
        print(f"{C_NO}  ⛔ BLOCCATO dal linter — non inviabile{C_OFF}")
    store.save_draft(con, p["id"], ch, touch, lang, text, res.ok, res.render(), source)
    store.event(con, p["id"], ch, "composed", f"{touch}/{lang} lint_ok={res.ok}")
    return 0 if res.ok else 2


# ---------------------------------------------------------------- tick
def cmd_tick(args):
    con = store.connect()
    mode = "LIVE" if config.LIVE else "DRY_RUN"
    okw, wmsg = guards.within_window()
    cap, capmsg = guards.max_per_run()

    print(f"=== TICK [{mode}] · {wmsg} · {capmsg} ===")
    if config.LIVE and not okw:
        print(f"{C_NO}STOP: fuori finestra di invio.{C_OFF}")
        return 1

    if config.LIVE and not args.no_sync:
        _sync_replies(con)

    acted = 0
    for p in store.all_prospects(con):
        if acted >= cap:
            print(f"  [stop] raggiunto il tetto di {cap} azioni per run (warm-up)")
            break
        for ch in (args.channel,) if args.channel else config.SENDABLE:
            if acted >= cap:
                break
            r = _advance(con, p, ch, mode)
            if r:
                acted += 1
                if config.LIVE:
                    time.sleep(config.SLEEP_BETWEEN)
    print(f"=== fine: {acted} azioni {'simulate' if mode == 'DRY_RUN' else 'eseguite'} ===")
    return 0


def _advance(con, p, ch, mode) -> bool:
    pid, tag = p["id"], f"{p['name']:<24} {ch:<10}"
    st = store.get_state(con, pid, ch)
    state = st["state"]

    if sm.is_terminal(state):
        return False
    if state == sm.SKIPPED:
        return False

    # Gate zone esclusive — prima di ogni altra cosa.
    can_go, why, distributor = zones.check(p)
    if not can_go:
        sm.assert_transition(state, sm.ESCALATED)
        store.set_state(con, pid, ch, sm.ESCALATED, reason=why)
        store.event(con, pid, ch, "escalated", why)
        print(f"  [ESCALATION] {tag} {why}")
        return False

    # Mai due tocchi lo stesso giorno allo stesso prospect, su qualunque canale.
    if store.touched_today(con, pid):
        print(f"  [skip] {tag} già toccato oggi")
        return False

    # ⚠️ Fix di revisione (3/8) — bug più grave trovato nel motore: un tick DRY_RUN
    # scriveva comunque in `sends`, e questa query leggeva TUTTI i mode senza
    # distinzione. Risultato: il touch1 "visto" in simulazione risultava già
    # spedito per un tick LIVE successivo, che passava al touch2 trovando lo stato
    # ancora `invited` (nessuno ha mai accettato un invito mai spedito davvero) e
    # si bloccava per sempre — in silenzio, seguendo esattamente il flusso che il
    # README raccomanda (dry-run prima, poi LIVE=1). Ora un tick LIVE conta SOLO
    # gli invii LIVE; un tick DRY_RUN (di sola anteprima, non scrive più nulla —
    # vedi sotto) continua a vedere tutto per poter mostrare l'anteprima del tocco
    # successivo anche dopo un invio reale.
    sent = {r["touch"] for r in con.execute(
        "SELECT touch FROM sends WHERE prospect_id=? AND channel=?"
        + (" AND mode='LIVE'" if mode == "LIVE" else ""), (pid, ch))}
    touch = sm.next_touch(ch, sent)
    if touch is None:
        store.set_state(con, pid, ch, sm.EXHAUSTED, reason="sequenza completata")
        return False

    # LinkedIn: dal touch2 in poi si scrive solo a chi ha accettato.
    if ch == "linkedin" and touch != "touch1" and state != sm.ACCEPTED:
        print(f"  [wait] {tag} {touch} richiede il collegamento accettato (stato: {state})")
        return False

    ok_cd, cd_why = guards.cooldown_ok(st["last_touch_at"], touch)
    if not ok_cd:
        print(f"  [wait] {tag} {cd_why}")
        return False

    target = p["linkedin_public_id"] if ch == "linkedin" else p["instagram_username"]
    if not target:
        store.set_state(con, pid, ch, sm.SKIPPED, reason="identificativo assente")
        return False

    lang = p["lang"] or "it"
    draft = store.get_draft(con, pid, ch, touch, lang)
    if draft and draft["lint_ok"]:
        text, source = draft["body"], draft["source"] + "(cache)"
    else:
        try:
            text, source, res = composer.compose(p, ch, touch, lang)
        except RuntimeError as e:
            store.event(con, pid, ch, "compose_failed", str(e))
            print(f"  [ERR ] {tag} compositore: {e}")
            return False
        store.save_draft(con, pid, ch, touch, lang, text, res.ok, res.render(), source)
        if not res.ok:
            store.event(con, pid, ch, "lint_blocked", res.render())
            print(f"  [BLOCK] {tag} {touch} bloccato dal linter:")
            print(res.render())
            return False

    # Linter di nuovo, anche sul testo in cache: è l'ultimo cancello.
    final = lint(text, ch, touch)
    if not final.ok:
        store.event(con, pid, ch, "lint_blocked", final.render())
        print(f"  [BLOCK] {tag} {touch} bloccato dal linter (ricontrollo pre-invio)")
        print(final.render())
        return False

    if store.already_sent(con, pid, ch, touch, mode=mode):
        return False

    if mode == "DRY_RUN":
        # La simulazione non deve lasciare traccia che il codice reale possa
        # scambiare per un invio: NESSUNA scrittura in `sends` né in
        # `channel_state`. Prima di questo fix un tick DRY_RUN avanzava lo stato a
        # `invited` per davvero — un LIVE successivo trovava un invito "già
        # inviato" mai realmente partito e restava bloccato in eterno (bug ①,
        # revisione 3/8). Solo un evento in log per tracciabilità umana, che non
        # è mai letto da nessuna decisione del motore.
        print(f"  [dry ] {tag} {touch} ({lang}, {len(text)} car., {source}) → {target}")
        for line in text.splitlines():
            print(f"         │ {line}")
        store.event(con, pid, ch, "dry_run_preview",
                    f"{touch}: anteprima, nessuna scrittura in sends/channel_state")
        return True

    try:
        res_api = unipile.send(ch, touch, target, text)
        store.record_send(con, pid, ch, touch, text, lang, "LIVE", str(res_api)[:200])
        nxt = sm.state_after_send(ch, touch, sm.next_touch(ch, sent | {touch}) is None)
        sm.assert_transition(store.get_state(con, pid, ch)["state"], nxt)
        store.set_state(con, pid, ch, nxt, last_touch=touch, reason="inviato")
        store.event(con, pid, ch, "sent", touch)
        print(f"  [SENT] {tag} {touch} → {target}")
        return True
    except unipile.UnipileError as e:
        store.event(con, pid, ch, "send_failed", str(e))
        store.set_state(con, pid, ch, sm.FAILED, reason=str(e)[:200])
        print(f"  [ERR ] {tag} {e}")
        return False


def _sync_replies(con):
    """STOP alla prima risposta + rilevamento accettazioni LinkedIn."""
    try:
        rel = unipile.linkedin_relations()
    except Exception as e:
        print(f"  [warn] relations non leggibili: {e}")
        rel = set()
    for p in store.all_prospects(con):
        if p["linkedin_public_id"] and str(p["linkedin_public_id"]) in rel:
            st = store.get_state(con, p["id"], "linkedin")
            if st["state"] == sm.INVITED:
                store.set_state(con, p["id"], "linkedin", sm.ACCEPTED, reason="collegamento accettato")
                store.event(con, p["id"], "linkedin", "accepted", "")
    for ch in config.SENDABLE:
        try:
            replied = unipile.chats_with_replies(ch)
        except Exception:
            continue
        for p in store.all_prospects(con):
            tgt = p["linkedin_public_id"] if ch == "linkedin" else p["instagram_username"]
            if tgt and str(tgt) in replied:
                st = store.get_state(con, p["id"], ch)
                if st["state"] not in sm.TERMINAL:
                    store.set_state(con, p["id"], ch, sm.REPLIED,
                                    reason="ha risposto → gestione umana")
                    store.event(con, p["id"], ch, "replied", "STOP automazione")
                    print(f"  [REPLY] {p['name']} su {ch} → automazione fermata")


# ---------------------------------------------------------------- status / report
def cmd_status(args):
    con = store.connect()
    rows = store.all_prospects(con)
    print(f"=== STATUS · {len(rows)} prospect · DB {config.DB_PATH} ===")
    print(f"MODALITÀ: {'LIVE' if config.LIVE else 'DRY_RUN'}\n")
    hdr = f"{'ID':<22}{'NOME':<24}{'TIPO':<12}{'LANG':<6}{'LINKEDIN':<26}{'INSTAGRAM':<26}"
    print(hdr)
    print("-" * len(hdr))
    for p in rows:
        cells = []
        for ch in ("linkedin", "instagram"):
            st = store.get_state(con, p["id"], ch)
            cells.append(f"{st['state']}/{st['last_touch'] or '-'}")
        print(f"{p['id'][:21]:<22}{p['name'][:23]:<24}{(p['prospect_type'] or '-'):<12}"
              f"{(p['lang'] or '-'):<6}{cells[0]:<26}{cells[1]:<26}")
    return 0


def cmd_report(args):
    con = store.connect()
    print("=== REPORT ===\n")
    print("Stati per canale:")
    for r in con.execute("SELECT channel, state, COUNT(*) n FROM channel_state "
                         "GROUP BY channel, state ORDER BY channel, n DESC"):
        print(f"  {r['channel']:<12}{r['state']:<12}{r['n']}")
    print("\nInvii registrati:")
    rows = list(con.execute("SELECT channel, touch, mode, COUNT(*) n FROM sends "
                            "GROUP BY channel, touch, mode ORDER BY channel, touch"))
    if not rows:
        print("  nessuno")
    for r in rows:
        print(f"  {r['channel']:<12}{r['touch']:<10}{r['mode']:<10}{r['n']}")
    print("\nEscalation aperte (gate zone esclusive):")
    esc = list(con.execute(
        "SELECT p.name, c.channel, c.reason FROM channel_state c "
        "JOIN prospects p ON p.id=c.prospect_id WHERE c.state='escalated'"))
    if not esc:
        print("  nessuna")
    for r in esc:
        print(f"  · {r['name']} [{r['channel']}] {r['reason']}")
    print("\nUltimi 15 eventi:")
    for r in con.execute("SELECT * FROM events ORDER BY id DESC LIMIT 15"):
        print(f"  {r['ts']}  {(r['prospect_id'] or '')[:14]:<16}{(r['channel'] or ''):<11}"
              f"{r['kind']:<16}{(r['detail'] or '')[:60]}")
    return 0


# ---------------------------------------------------------------- review
def cmd_review(args):
    """Gate umano di revisione (fix ⑤, revisione 3/8): un salone entra in coda con
    la protezione del gate zone esclusive (zones.check(), sempre attivo al tick).
    Un distributore promosso da discovery.cmd_promote NON aveva un gate equivalente
    — con min_score=50 poteva entrare in sequenza ed essere toccato al primo tick
    LIVE senza che nessuno l'avesse mai guardato. `promote` ora lo lascia in stato
    `skipped` con motivo "da rivedere"; questo comando mostra o approva la
    riabilitazione (skipped→queued, l'unica transizione già prevista in
    statemachine.py per la riabilitazione manuale)."""
    con = store.connect()
    p = store.get_prospect(con, args.prospect)
    if not p:
        print(f"prospect '{args.prospect}' non trovato")
        return 1
    channels = (args.channel,) if args.channel else config.CHANNELS
    if not args.approva:
        print(f"=== {p['name']} ({p['company']}) · {p['prospect_type']}/{p['persona']} ===")
        print(f"hook: {p['hook'] or '(nessuno)'}  ·  competitor_brand: {p['competitor_brand'] or '-'}")
        for ch in channels:
            st = store.get_state(con, p["id"], ch)
            print(f"  {ch:<12}{st['state']:<12}{st['reason'] or ''}")
        print("\n(nessuna modifica: aggiungi --approva per far uscire da revisione)")
        return 0
    approvati = 0
    for ch in channels:
        st = store.get_state(con, p["id"], ch)
        if st["state"] != sm.SKIPPED:
            continue
        sm.assert_transition(sm.SKIPPED, sm.QUEUED)
        store.set_state(con, p["id"], ch, sm.QUEUED,
                         reason=f"approvato manualmente da {args.chi or 'operatore'}")
        store.event(con, p["id"], ch, "review_approved", args.chi or "")
        print(f"[OK] {p['id']} · {ch} → queued")
        approvati += 1
    if not approvati:
        print("nessun canale in stato 'skipped' da approvare (o già approvato)")
    return 0


# ---------------------------------------------------------------- main
def main(argv=None):
    ap = argparse.ArgumentParser(prog="sheis-outreach", description="SHEis Outreacher operativo")
    sub = ap.add_subparsers(dest="cmd", required=True)

    sub.add_parser("preflight").set_defaults(fn=cmd_preflight)
    sub.add_parser("status").set_defaults(fn=cmd_status)
    sub.add_parser("report").set_defaults(fn=cmd_report)

    pi = sub.add_parser("import")
    pi.add_argument("file")
    pi.set_defaults(fn=cmd_import)

    pc = sub.add_parser("compose")
    pc.add_argument("--prospect", required=True)
    pc.add_argument("--channel", default="linkedin", choices=config.CHANNELS)
    pc.add_argument("--touch", default="touch1")
    pc.add_argument("--lang", choices=config.LANGS)
    pc.set_defaults(fn=cmd_compose)

    pt = sub.add_parser("tick")
    pt.add_argument("--channel", choices=config.SENDABLE)
    pt.add_argument("--no-sync", action="store_true")
    pt.set_defaults(fn=cmd_tick)

    pd = sub.add_parser("discover", help="trova saloni/distributori su Instagram da una keyword")
    pd.add_argument("--keyword", required=True)
    pd.add_argument("--max-profili", type=int, default=60)
    pd.add_argument("--espandi", action="store_true",
                     help="espande via profili correlati (edge_related_profiles)")
    pd.add_argument("--citta")
    pd.set_defaults(fn=discovery.cmd_discover)

    pcd = sub.add_parser("candidates", help="elenca i candidati in staging (tabella candidates)")
    pcd.add_argument("--tipo", choices=discovery.TIPI)
    pcd.add_argument("--stato", choices=("nuovo", "promosso", "scartato"))
    pcd.set_defaults(fn=discovery.cmd_candidates)

    ppr = sub.add_parser("promote", help="promuove i candidati sopra soglia a prospect")
    ppr.add_argument("--min-score", type=int, default=50)
    ppr.add_argument("--tipo", choices=discovery.TIPI)
    ppr.add_argument("--dry-run", action="store_true")
    ppr.set_defaults(fn=discovery.cmd_promote)

    prv = sub.add_parser("review", help="mostra/approva un prospect in attesa di revisione umana")
    prv.add_argument("--prospect", required=True)
    prv.add_argument("--channel", choices=config.CHANNELS)
    prv.add_argument("--approva", action="store_true")
    prv.add_argument("--chi", help="chi approva (per l'audit trail)")
    prv.set_defaults(fn=cmd_review)

    args = ap.parse_args(argv)
    return args.fn(args)


if __name__ == "__main__":
    sys.exit(main())
