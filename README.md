# alkemia-sheis-workers

I **worker di produzione** di SHEis Beauty International: i processi che girano a
orario e fanno il lavoro mentre nessuno guarda. Nessuna dipendenza pesante — solo
Python stdlib (`urllib`, `sqlite3`, `smtplib`, `zoneinfo`), come già fa
`~/alkemia-sheis-outreach`.

**Architettura del cliente**:
```
~/alkemia-sheis-studio     l'interfaccia (in costruzione)
~/alkemia-sheis-backend    schema Supabase (migrations/0001 e 0002)
~/alkemia-sheis-outreach   motore outreach (LinkedIn/Instagram via Unipile)
~/alkemia-sheis-workers    ← QUI. I processi schedulati.
```

Questo repo LEGGE gli altri tre (schema, dati) ma non ci scrive mai dentro.

---

## Cosa gira, quando

| Worker | Timer | Cosa fa |
|---|---|---|
| `publisher_zernio.py` | ogni 15 min (si ferma da solo fuori finestra) | Pubblica/programma su Zernio i contenuti `programmato` con variante approvata |
| `report_settimanale.py` | lunedì 09:00 Europe/Rome | Report organico + pubblicitario + outreach via email + Telegram |
| `creative_worker.py` | ogni ora | Genera le 3 varianti Higgsfield per ogni contenuto `approvato` |
| `analisi_mensile.py` | 1° del mese, 06:00 | Rigenera mercato/trend (ScrapeCreators + DataForSEO) |

Le unit systemd sono in `systemd/` — **non installate**, solo pronte (vedi
"Installazione sul VPS" più sotto).

---

## Cosa è bloccato oggi, e perché (fatti misurati, non assunzioni)

1. **Il database Supabase `sheis_*` non esiste ancora.** Verificato il 2026-08-03
   eseguendo davvero questi worker: rispondono con
   *"database non ancora inizializzato: mancano le tabelle …"* invece di andare
   in crash. Le migrazioni sono pronte in `~/alkemia-sheis-backend/migrations/`
   ma serve un Personal Access Token Supabase per applicarle (la service key non
   basta per il DDL). Ogni worker qui **parte comunque** e dichiara lo stato —
   nessuno di questi quattro script solleva un'eccezione tecnica per questo motivo.

2. **Zernio vede SOLO 2 account, entrambi Alkemia** — verificato in diretta con
   `GET /accounts` il 2026-08-03: `facebook:alkemia.marketing` e
   `instagram:andrei_arsinte` ("Andrei Arsinte | Sistemi AI per acquisire
   clienti"). **Nessun account SHEis.** `publisher_zernio.py` verifica questa
   lista ad OGNI run (non si fida di questo paragrafo, che può invecchiare) e
   blocca ogni pubblicazione con `stato='bloccato'` finché
   `config/workers.json → zernio_account_ids_sheis` resta vuoto. Pubblicare "per
   prova" sui canali Alkemia è **vietato per costruzione**: il worker non ha
   nemmeno un percorso di codice che lo permetta.

3. **Nessuna generazione Higgsfield, nessuna chiamata ScrapeCreators/DataForSEO
   è mai stata fatta in questa sessione.** `creative_worker.py` e
   `analisi_mensile.py` girano SOLO in simulazione finché `LIVE=1` non è
   impostato esplicitamente — e in questa sessione non lo è mai stato.

---

## Installazione locale (sviluppo/collaudo)

```bash
cd alkemia-sheis-workers
cp .env.example .env
# riempi .env — SUPABASE_URL/SUPABASE_SECRET_KEY si possono copiare da
# ~/alkemia-sheis-backend/.env (stesso progetto, stesso cliente)

python3 tests/test_linter.py            # regole di marca (prezzi, negozio, claim)
python3 tests/test_firewall_m29.py      # 14 test avversariali Metodo 29
python3 tests/test_higgsfield_gate.py   # gate di costo + tetto giornaliero

python3 publisher_zernio.py             # simulazione (default)
python3 report_settimanale.py           # simulazione (default)
python3 creative_worker.py              # simulazione (default)
python3 analisi_mensile.py              # simulazione (default, nessun credito)
```

`LIVE=1` davanti a un comando abilita l'invio/pubblicazione/generazione vera.
**Mai in questa fase**: nessuno dei quattro worker ha mai girato con `LIVE=1`
durante lo sviluppo di questo repo.

---

## Installazione sul VPS (quando si è pronti)

```bash
sudo mkdir -p /home/alkemia/sheis-workers
sudo chown alkemia:alkemia /home/alkemia/sheis-workers
# copia il repo lì, poi:
cd /home/alkemia/sheis-workers
cp .env.example .env && chmod 600 .env   # riempi con le credenziali vere

sudo cp systemd/*.service systemd/*.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now sheis-publisher.timer
sudo systemctl enable --now sheis-report.timer
sudo systemctl enable --now sheis-creative.timer
sudo systemctl enable --now sheis-analisi-mensile.timer
```

⚠️ `OnCalendar` nei timer usa il timezone LOCALE del sistema (`/etc/localtime`).
Il VPS deve essere impostato su `Europe/Rome`, come gli altri timer Alkemia — il
report di lunedì 09:00 altrimenti parte a un'ora sbagliata.

Prima di aggiungere `LIVE=1` in produzione:
- **publisher_zernio**: Mauro deve aver collegato gli account SHEis via OAuth su
  Zernio, e `config/workers.json → zernio_account_ids_sheis` va compilato con i
  loro id.
- **creative_worker**: verificare che il CLI `higgsfield` sia installato e
  autenticato sulla macchina che esegue il worker (vedi
  `alkemia-mcco-studio/collega-higgsfield.command` per il pattern di pairing).
- **report_settimanale**: `config/workers.json → report_email` e
  `report_telegram_chat` vanno compilati (oggi vuoti — il worker lo dichiara
  invece di fallire in silenzio).

---

## Architettura

```
alkemia-sheis-workers/
├── lib/
│   ├── supabase.py       client REST Supabase (urllib) + rilevamento schema non inizializzato
│   ├── linter.py         regole di marca condivise (prezzi · negozio multilingua · Metodo 29 · claim)
│   ├── finestra.py        08:00-18:30 Europe/Rome, mai domenica (zoneinfo stdlib, DST corretto)
│   ├── canali.py          email (smtplib) + Telegram (urllib), pattern di centralino-vapi/canali.py
│   ├── zernio.py          client REST Zernio (urllib), copia indipendente di tools/zernio_post.py
│   ├── higgsfield.py      gate di costo (1cr=€0,033) + gestione tetto giornaliero
│   ├── scrapecreators.py  client Instagram profile (urllib)
│   └── dataforseo.py      client keyword search volume (urllib, Basic Auth)
├── publisher_zernio.py    idempotenza · linter · gate account · finestra · invio
├── report_settimanale.py  organico + pubblicitario + outreach → email + Telegram
├── creative_worker.py     3 varianti (angolo_visivo dichiarato) · gate costo · tetto giornaliero
├── analisi_mensile.py     ScrapeCreators + DataForSEO → file + sheis_report(tipo=mensile)
├── config/workers.json    SCELTE non segrete (destinatari, mappa account) — mai chiavi API qui
├── systemd/                8 unit (4 .service + 4 .timer), pronte da installare
└── tests/
    ├── test_linter.py            regole di marca dirette
    ├── test_firewall_m29.py      i 14 test avversariali di sheis-brand-core
    └── test_higgsfield_gate.py   gate di costo + tetto giornaliero
```

**Perché `sheis_report.tipo='mensile'` per `analisi_mensile.py`**: lo schema
0002 anticipa già un tipo `mensile` in `sheis_report`, ma le colonne
`organico`/`pubblicitario`/`outreach` sono tipizzate per il report settimanale.
`analisi_mensile.py` riusa solo la colonna generica `markdown` e scrive
ANCHE su file (`data/ANALISI-MERCATO_<AAAA-MM>.{json,md}`) perché
`alkemia-sheis-studio` non ha ancora (2026-08-03) uno schema di lettura
confermato per l'analisi di mercato — così, qualunque sia la scelta finale
dello Studio, i dati esistono già in entrambi i posti.

## Fonti di verità (mai duplicate, sempre citate)

- Regole di marca: `scalers-plus/clienti/sheis-beauty-aiconsult/data/BRAND-IDENTITY_sheis_2026-08-03.json`
- Firewall Metodo 29: `scalers-plus/.claude/skills/sheis-brand-core/guardrails.json` + `tests/firewall-m29.md`
- Schema DB: `~/alkemia-sheis-backend/migrations/0001_sheis_schema.sql` e `0002_studio.sql`
- Copione/voce outreach: `~/alkemia-sheis-outreach/` (letto in sola lettura da `report_settimanale.py`)
