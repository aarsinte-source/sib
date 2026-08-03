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
| `ingest_metriche_ig.py` | ogni giorno, 07:00 (prima del report di lunedì) | Raccoglie follower/like/commenti/views reali di @sheisbeautyhair e li scrive in `sheis_metriche_ig` — la fonte di `report_settimanale.py` per "cosa ha funzionato e perché" |

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

3. **Nessuna generazione Higgsfield è mai stata fatta in questa sessione.**
   `creative_worker.py` gira SOLO in simulazione finché `LIVE=1` non è
   impostato esplicitamente — e in questa sessione non lo è mai stato.
   `analisi_mensile.py` idem: sempre in DRY-RUN in questa sessione.

4. **`ingest_metriche_ig.py` invece È STATO eseguito davvero il 2026-08-03**
   (letture ScrapeCreators, ammesse — mai un invio/pubblicazione/generazione).
   **5 chiamate totali in questa sessione**: 2 di calibrazione (per verificare
   la forma reale della risposta prima di scrivere il codice di parsing — vedi
   `lib/scrapecreators.py`, il profilo vive sotto `data.user`, non alla radice)
   + 3 dell'ingestione ufficiale (profilo + 50 post + 30 reel, di cui 12
   effettivamente restituiti su entrambi). Risultato reale: **12 post + 12
   reel raccolti** (2 duplicati fra i due feed scartati — vedi bug qui sotto),
   **mediana like/views sui reel: 1,615%** — coincide con l'1,61% già misurato
   in `BRAND-IDENTITY_sheis_2026-08-03.json` da un'altra sessione, con un
   metodo di raccolta diverso: **conferma incrociata**, non lo stesso calcolo
   rieseguito. Il DB non esiste ancora, quindi i 22 record (10 post + 12 reel,
   dopo dedup) sono salvati SOLO su file locale
   (`data/METRICHE-IG_ultima-rilevazione.json` + snapshot grezzi in
   `data/raw/`) — `report_settimanale.py` li legge da lì come fallback
   esplicitamente etichettato, finché `sheis_metriche_ig` non esiste.

   **Bug reale trovato e corretto durante lo sviluppo**: `/v2/instagram/user/
   posts` restituisce l'id come `<media_id>_<owner_id>`, `/v1/instagram/user/
   reels` lo stesso media come solo `<media_id>` — gli stessi reel escono su
   ENTRAMBI gli endpoint. Senza normalizzare l'id, lo stesso contenuto
   generava due righe scollegate (una "post" senza view, una "reel" con le
   view) e avrebbe fatto fallire il vincolo unique su un DB reale. Scoperto
   confrontando gli id reali, non per ispezione del codice — vedi
   `_normalizza_ig_id()` e la deduplica in `ingest_metriche_ig.py`, e
   `tests/test_ingest_metriche.py`.

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

python3 tests/test_ingest_metriche.py   # normalizzazione id · like/views · attribuzione

python3 publisher_zernio.py             # simulazione (default)
python3 report_settimanale.py           # simulazione (default)
python3 creative_worker.py              # simulazione (default)
python3 analisi_mensile.py              # simulazione (default, nessun credito)
python3 ingest_metriche_ig.py           # simulazione (default, nessun credito)
```

`LIVE=1` davanti a un comando abilita l'invio/pubblicazione/generazione vera
(o, per `ingest_metriche_ig.py`, la lettura reale — 3 crediti ScrapeCreators
per run). **Mai messo su publisher/creative/analisi-mensile in questa fase**:
girano SOLO in simulazione. `ingest_metriche_ig.py` è stato eseguito con
`LIVE=1` una volta, il 2026-08-03, per popolare la prima rilevazione reale
(vedi sopra) — è l'unica eccezione, ed è una lettura, non un invio.

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
sudo systemctl enable --now sheis-ingest-metriche.timer
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
- **ingest_metriche_ig**: verificare il credito ScrapeCreators residuo prima
  di attivare il timer giornaliero (3 chiamate/giorno, ~90/mese) — e applicare
  `~/alkemia-sheis-backend/migrations/0003_metriche.sql` non appena il
  Personal Access Token Supabase è disponibile, così le rilevazioni smettono
  di vivere solo su file locale.

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
│   ├── scrapecreators.py  client Instagram profilo/post/reel (urllib) + contatore chiamate reali
│   └── dataforseo.py      client keyword search volume (urllib, Basic Auth)
├── publisher_zernio.py    idempotenza · linter · gate account · finestra · invio
├── report_settimanale.py  organico (+ affinità reel da sheis_metriche_ig) + pubblicitario + outreach → email + Telegram
├── creative_worker.py     3 varianti (angolo_visivo dichiarato) · gate costo · tetto giornaliero
├── analisi_mensile.py     ScrapeCreators + DataForSEO → file + sheis_report(tipo=mensile)
├── ingest_metriche_ig.py  follower/like/commenti/views reali → sheis_metriche_ig (serie storica) + attribuzione a sheis_contenuti
├── config/workers.json    SCELTE non segrete (destinatari, mappa account) — mai chiavi API qui
├── systemd/                10 unit (5 .service + 5 .timer), pronte da installare
└── tests/
    ├── test_linter.py             regole di marca dirette
    ├── test_firewall_m29.py       i 14 test avversariali di sheis-brand-core
    ├── test_higgsfield_gate.py    gate di costo + tetto giornaliero
    └── test_ingest_metriche.py    normalizzazione ig_id · like/views · attribuzione (mai un aggancio indovinato)
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
- Schema DB: `~/alkemia-sheis-backend/migrations/0001_sheis_schema.sql`, `0002_studio.sql`, `0003_metriche.sql`
  (quest'ultima scritta DA questo repo — unica eccezione al "mai scrivere negli altri repo", perché lo
  schema DB è di competenza di `alkemia-sheis-backend`, non un file operativo di questo repo)
- Copione/voce outreach: `~/alkemia-sheis-outreach/` (letto in sola lettura da `report_settimanale.py`)
- Metriche IG reali: `data/METRICHE-IG_ultima-rilevazione.json` (fallback locale finché `sheis_metriche_ig`
  non esiste) + `data/raw/` (risposte grezze ScrapeCreators, per riprocessare senza richiamare l'API)
