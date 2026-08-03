# SHEis Studio

Strumento operativo del reparto marketing di SHEis Beauty International.
Non è una vetrina (quella è `alkemia-sheis-console`): qui si lavora — piano
editoriale, approvazioni, creatività, calendario.

Costruito secondo `SPEC.md` (il contratto di questo repo). Leggilo prima di
toccare il codice.

## Avvio

```bash
npm install
npm run dev      # http://localhost:3330
npm run build    # produzione
npm run typecheck
npm run lint
npm run test:flow      # test del giro completo (vedi sotto)
npm run seed:utente -- --email mauro@sheishair.com --nome "Mauro" --ruolo mauro --password "..."
```

`.env.local` (gitignored) contiene le chiavi vere: Supabase (progetto
dedicato SHEis), OpenAI (stessa variabile della console), ScrapeCreators
(opzionale, per i segnali di mercato in Analisi). `HIGGSFIELD_API_KEY` /
`HIGGSFIELD_API_SECRET` non sono impostate in questo ambiente — vedi sotto.

## Stato reale: cosa funziona e cosa è bloccato, e perché

### 🔴 Bloccato — database non inizializzato

Il progetto Supabase (`wwbfysrqxbwfankkoppt`) ha **0 tabelle `sheis_*` su
15**. Verificato il 2026-08-03 con:

```bash
cd ~/alkemia-sheis-backend && python3 applica_migrazioni.py --verifica
```

Il DDL richiede un **Personal Access Token** Supabase (`sbp_...`), che oggi
manca — la sola chiave di servizio (`sb_secret_...`) sa scrivere righe, non
creare tabelle (401 "JWT could not be decoded" sulla Management API).

**L'app non si rompe per questo.** `lib/supabase.ts` rileva l'errore esatto
di PostgREST (`404` + `code: PGRST205`, "Could not find the table ... in the
schema cache" — verificato in diretta con `curl` sul progetto reale) e ogni
pagina/route lo dichiara in italiano invece di un 500. Prova dal vivo,
eseguita su questo ambiente:

```bash
curl -s http://localhost:3330/entra | grep -o "Database non ancora inizializzato"
curl -s http://localhost:3330/api/stato
# → {"schema":{"ok":false,"motivo":"Il database non è ancora stato
#    inizializzato: le tabelle sheis_* non esistono su Supabase. Serve
#    applicare le migrazioni ... (richiede un Personal Access Token
#    Supabase, oggi mancante)."},"sessione":null}
```

Tutte le pagine (`/`, `/piano`, `/creativita`, `/calendario`, `/analisi`,
`/outreach`, `/campagne`, `/sito`, `/report`, `/utenti`) sono state verificate
dal vivo con questo stato: nessuna crasha, tutte rispondono 200 o 307
(redirect a `/entra` per chi non ha sessione).

**Conseguenza a cascata**: senza `sheis_utenti` non si può accedere (nessun
utente esiste). Quando le migrazioni saranno applicate, crea il primo utente
con `npm run seed:utente` (bootstrap — è l'unico modo di rompere il
cane-che-si-morde-la-coda: senza un utente non entri, senza entrare non puoi
usare la pagina "Utenti" per crearne uno).

### 🔴 Bloccato — Higgsfield (generazione reale delle varianti)

Nessuna `HIGGSFIELD_API_KEY`/`HIGGSFIELD_API_SECRET` è stata fornita a questa
app (solo Supabase e OpenAI, per istruzione esplicita del team lead). Il gate
di costo e i tre prompt (inquadratura/ambientazione/luce) sono reali e
calcolati (1 credito = €0,0330, misurato; gpt_image_2 2K/high = 7
crediti/immagine, 1K/low = 0,5 — vedi `lib/higgsfield.ts`), ma la chiamata
degrada sempre a:

> "Higgsfield non è collegato in questo ambiente: mancano HIGGSFIELD_API_KEY
> e HIGGSFIELD_API_SECRET nelle variabili del server. Il prompt e il costo
> stimato restano pronti; la generazione reale può partire da un worker con
> quelle credenziali."

Il codice per la chiamata reale (incluso il riconoscimento del tetto
giornaliero, `grace_daily_limit_reached`) è scritto e pronto in
`lib/higgsfield.ts`, ma **non testato** perché non esiste una chiave con cui
testarlo: dichiararlo "funzionante" sarebbe stata una finzione.

### 🔴 Bloccato — Zernio (pubblicazione reale)

Zernio in questo ambiente esiste solo come server MCP cablato dentro Claude
Code, non come API REST che un'app Next.js server-side possa chiamare in
autonomia. `lib/zernio.ts` dichiara sempre questo blocco, con il motivo
esatto — la coda (`sheis_pubblicazioni`) resta scritta e consultabile.
Inventare un endpoint REST non documentato avrebbe violato "Non pubblicare
nulla davvero". Anche a ponte collegato, resta vero che Zernio oggi vede solo
gli account Alkemia, non SHEis.

### ✅ Costruito e verificato

1. **Fondamenta**: `lib/supabase.ts` (client REST + rilevamento schema),
   `lib/dati.ts` (unico punto che parla col database), `lib/brand.ts` (carica
   `BRAND-IDENTITY_sheis_2026-08-03.json` come vincolo eseguibile,
   copiato in `src/brand/`), `lib/linter.ts`, `lib/auth.ts` + `lib/ruoli.ts`
   (sessione firmata HMAC, tre ruoli).
2. **`/piano`**: analisi di mercato (OpenAI + segnali ScrapeCreators
   best-effort) → piano di 8 post bilingue con hashtag → **approva · rifiuta
   · modifica** (sia riscrittura AI su nota, sia editing manuale dei campi —
   quest'ultimo non esisteva da nessuna parte prima). Ogni azione scrive in
   `sheis_approvazioni_log` con attore e ora.
3. **`/creativita`**: 3 varianti per contenuto approvato, con asse di
   variazione dichiarato (inquadratura/ambientazione/luce, deterministico non
   casuale) e **gate di costo obbligatorio** con anteprima prima di spendere.
4. **`/calendario`**: coda verso Zernio, linter obbligatorio prima della
   messa in coda, blocco dichiarato per ogni riga.
5. **`/analisi`, `/outreach`, `/campagne`, `/sito`, `/report`, `/utenti`**:
   impianto onesto — funzionano quando il DB è pronto, dichiarano
   esplicitamente cosa manca (account Meta, CMS reale, motore report) quando
   non lo è.

## Il linter — dimostrazione (giro completo mockato, vedi sotto)

```
— linter: blocco prezzo —
  ✓ un contenuto con prezzo/sconto viene bloccato
  ✓ la violazione è marcata "prezzi_cifre_commerciali"
    → "Prezzo o cifra commerciale non ammessi in un contenuto SHEis —
       termine vietato: "€"" su "…20% su tutta la gamma, solo 15€.
       Scopri la gamma su www.sheis…"

— linter: firewall Metodo 29 —
  ✓ un contenuto che nomina "Metodo 29" viene bloccato
  ✓ la violazione è marcata "firewall_metodo_29"
    → "Firewall Metodo 29: nessun collegamento pubblico ammesso con SHEis
       (regola non negoziabile) — termine vietato: "Metodo 29"" su
       "…HEis Color, BABILON, YOUNIC e Metodo 29, tutti nati dalla stessa
       pass…"
```

Il linter (`lib/linter.ts`) applica 5 regole: (1) prezzi/cifre commerciali,
(2) lessico da negozio in ogni lingua, (3) firewall Metodo 29 — inclusa
un'euristica anti-parafrasi (numero "29"/"ventinove" vicino a "metodo", vedi
il test T13 di `tests/firewall-m29.md` nel repo `scalers-plus`), (4) claim
numerici non documentati (best-effort: solo 15/99/3 sono nell'elenco
misurato), (5) nomi senza consenso (denylist oggi vuota — manca un registro
consensi in database, dichiarato come gap nel codice). Le regole 1-3 sono
deterministiche su liste misurate/validate dal cliente; le regole 4-5 sono
euristiche, dichiarate tali nei commenti.

## Perché un test mockato e non contro Supabase vero

`npm run test:flow` (vedi `scripts/test-flow.ts`) fa girare il **codice
reale** di `lib/dati.ts`, `lib/linter.ts`, `lib/auth.ts` contro un mock
in-memory di PostgREST — perché le tabelle vere non esistono ancora (vedi
sopra). Non è una prova che Supabase funziona: non può esserlo. È la prova
che la logica applicativa è corretta e pronta per quando le tabelle
esisteranno. Risultato attuale: **20/20 test superati**, incluso il giro
completo genera-piano → approva/rifiuta/modifica-manuale → verifica nel
registro con attore e ora per ciascuna delle tre azioni.

La verifica di "schema non inizializzato" invece **è reale**, fatta contro il
progetto Supabase vero (non mockata) — perché quella condizione è vera oggi.

## Ruoli

| Ruolo | Può | Non può |
|---|---|---|
| `mauro` | tutto: vede, approva, lancia campagne, gestisce utenti | — |
| `marketing` | approva/rifiuta contenuti e varianti, programma, lancia campagne, scrive articoli | gestire utenti |
| `dipendente` | scrive articoli, carica, propone, modifica (AI o manuale) | approvare, rifiutare, generare varianti (spende crediti), programmare, lanciare campagne, gestire utenti |

Il gate è **sempre server-side** (`lib/auth.ts` → `richiedeRuolo`), letto dal
cookie di sessione firmato (HMAC), indipendente dal database: un `dipendente`
che chiama `/api/contenuti/[id]/approva` riceve un vero `403` con messaggio
in italiano — non un pulsante nascosto. Verificato in `scripts/test-flow.ts`
sulla matrice dei ruoli (`RUOLI_APPROVA` non contiene `dipendente`, ecc.).

## Architettura

```
src/
  brand/                  copia locale di BRAND-IDENTITY + guardrails.json (fonte: repo scalers-plus)
  lib/
    supabase.ts           client REST + rilevamento "schema non inizializzato"
    dati.ts                l'UNICO punto che parla col database
    ruoli.ts / auth.ts    sessione, ruoli, guardie (ruoli.ts è client-safe, auth.ts è server-only)
    linter.ts             le regole di marca, con motivo del blocco
    brand.ts              carica BRAND-IDENTITY e lo espone tipizzato
    openai.ts             generazione testi
    higgsfield.ts / higgsfield-shared.ts   varianti + gate di costo (shared = costanti client-safe)
    zernio.ts             coda — dichiaratamente non collegata
    api.ts                traduttore errore → risposta HTTP in italiano
  app/
    (auth)/entra/          accesso
    piano/                 passo 2 e 3 — il cuore
    creativita/            passo 4 — le tre varianti
    calendario/            passo 5
    analisi/ outreach/ campagne/ sito/ report/ utenti/
    api/…                  una route per azione
  components/              kit UI + componenti per pagina
scripts/
  seed-utente.mjs          bootstrap del primo utente
  test-flow.ts             test del giro completo (mock PostgREST)
```

## Non fatto per mancanza di tempo (dichiarato, non nascosto)

- Nessuna UI per rivedere/filtrare il registro completo delle approvazioni
  (esiste l'endpoint `GET /api/contenuti/[id]/log` e il pulsante "Mostra
  registro" per singolo contenuto in `/piano`, ma non una vista aggregata).
- `/sito` produce solo bozze in tabella (`sheis_articoli`): niente editor a
  blocchi, niente pubblicazione reale sul CMS (il sito è file-based, gestito
  da Mark Studio).
- `/report` è sola lettura: non genera report, li consulta soltanto (per
  design — il motore è esterno).
- Nessun retry automatico sulla generazione varianti dopo un tetto
  giornaliero raggiunto: bisogna tornare il giorno dopo (comportamento
  voluto, non un bug: evita spese ripetute senza controllo umano).
