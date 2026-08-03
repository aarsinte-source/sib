# SHEis · Outreacher operativo

La macchina che manda **davvero** i messaggi su LinkedIn e Instagram via Unipile.

Non va confusa con `~/alkemia-sheis-outreach-demo`: quella è la demo conversazionale, serve a far
provare la voce a Mauro e non invia niente a nessuno. Questo è il motore di produzione.
I due sistemi sono collegati in un punto solo, ed è il punto che conta:
**quello che Mauro corregge nella demo (`data/VOICE-LEARNED.md`) entra nel prompt che genera i
messaggi veri.** Nessuno deve riscrivere codice perché il tono cambi.

---

## Cosa fa, in una riga

Prende una lista di prospect, decide per ciascuno il prossimo tocco, **scrive il messaggio con
Claude a partire dal copione approvato**, lo passa da un linter di brand, e solo se tutto è verde
lo invia — dentro una finestra oraria, a volume basso, senza mai ripetersi.

## Cosa NON fa, per costruzione

- Non invia nulla senza `LIVE=1`. Il default è DRY_RUN, sempre.
- Non manda due tocchi lo stesso giorno allo stesso prospect, su nessun canale.
- Non riparte dopo una risposta: alla prima risposta l'automazione si ferma e passa all'umano.
- Non risponde mai a un salone di cui non conosce la zona. Escala, non indovina.
- Non fa uscire un messaggio con prezzi, "shop", "Metodo 29" o claim non documentati.

---

## Installazione

Nessuna dipendenza esterna: solo Python 3 di sistema (`urllib` + `sqlite3`).

```bash
cd ~/alkemia-sheis-outreach
python3 -m sheis_outreach.cli preflight
```

---

## Uso quotidiano

```bash
# 1. Verifica che la macchina sia in ordine (pairing, warm-up, copione, zone, linter)
python3 -m sheis_outreach.cli preflight

# 2. Carica una lista di prospect
python3 -m sheis_outreach.cli import data/prospects_sample.csv

# 3. Guarda cosa direbbe a un singolo prospect, prima di far girare tutto
python3 -m sheis_outreach.cli compose --prospect javier-moreno-demo \
        --channel linkedin --touch touch1 --lang es

# 4. Avanza la sequenza — SIMULAZIONE, non invia
python3 -m sheis_outreach.cli tick

# 5. Stato e riepilogo
python3 -m sheis_outreach.cli status
python3 -m sheis_outreach.cli report

# 6. Invio REALE (solo quando il warm-up è finito e il preflight è verde)
LIVE=1 MAX_PER_RUN=3 python3 -m sheis_outreach.cli tick --channel linkedin
```

**Regola operativa**: si guarda sempre il `tick` in DRY_RUN prima di metterci `LIVE=1`. Il DRY_RUN
stampa il testo esatto che partirebbe, destinatario per destinatario.

### Formato della lista (CSV)

Colonne: `name, first_name, company, persona, prospect_type, lang, country, city, zone,
competitor_brand, hook, linkedin_public_id, instagram_username, email, phone`

- `persona` → quale sezione del copione usare: `estero_importer` (§1) ·
  `it_distributor_competitor` (§2) · `it_distributor_small` (§3) · `instagram_cold` (§4) · `salon`
- `prospect_type` → `distributor` | `importer` | `salon`. **`salon` attiva il gate zone esclusive.**
- `hook` → l'aggancio reale visto sul profilo. **Se manca, il messaggio si scrive senza.**
  Un aggancio inventato si riconosce e brucia il contatto: il prompt lo vieta esplicitamente.

---

## Collegare l'account LinkedIn "SHEis partners" su Unipile

Oggi la macchina gira sugli account **personali di Andrei** (LinkedIn `7DNaKyuUQnq7rFmlF6TP8w`),
perché sono gli unici pairati. Sono un banco di prova, non la destinazione.

1. Entra nel dashboard Unipile → **Add account** → LinkedIn.
2. Unipile mostra un **QR code**. Dal telefono, con l'app LinkedIn loggata sull'account
   "SHEis partners", scansiona il QR e conferma l'accesso.
3. Unipile restituisce un `account_id`. Verificalo con `preflight`, che elenca tutti gli account
   pairati con il loro stato.
4. Per Instagram: stessa procedura, sezione Instagram. **Serve un account Instagram di tipo
   Business/Creator**, non personale.

### Passare dagli account di Andrei a quelli del cliente

Non si tocca il codice. Si cambiano due variabili d'ambiente:

```bash
export SHEIS_ACCOUNT_LINKEDIN=<account_id di SHEis partners>
export SHEIS_ACCOUNT_INSTAGRAM=<account_id IG di SHEis>
export SHEIS_ACCOUNT_START=2026-08-01     # data del pairing → fa partire il conto del warm-up
python3 -m sheis_outreach.cli preflight   # deve tornare verde sui canali che vuoi usare
```

Se il cliente ha un proprio workspace Unipile, cambia anche `SHEIS_ENV_FILE` puntandolo a un `.env`
con `UNIPILE_DSN` e `UNIPILE_API_KEY` suoi.

---

## Perché servono 10-14 giorni di warm-up

**Non è un ritardo di sviluppo: è un vincolo di piattaforma.** Un account LinkedIn o Instagram
appena creato che inizia a mandare decine di inviti viene classificato come automazione. L'esito
non è un avviso: è la limitazione delle funzioni di ricerca e messaggistica, o la sospensione.
Su LinkedIn un account nuovo e sospeso è difficile da recuperare, e ci si porta dietro il dominio.

Nei primi 10-14 giorni l'account "SHEis partners" deve **sembrare una persona**: profilo completo
con foto e descrizione, qualche collegamento accettato in entrata, qualche post letto e commentato,
inviti a volume molto basso e crescente. Solo dopo si alza il volume.

La macchina applica questo da sola: finché `SHEIS_ACCOUNT_START` indica meno di 14 giorni,
`MAX_PER_RUN` viene **forzato** a 3 (primi 7 giorni) o 5, qualunque valore ci sia nell'env.
Se `SHEIS_ACCOUNT_START` non è impostata, l'account è considerato nuovo — il default è prudente.

---

## Guardrail (tutti verificati da `tests_guardrail.py`)

| Guardrail | Comportamento |
|---|---|
| **DRY_RUN di default** | Nessun invio senza `LIVE=1` esplicito |
| **Finestra oraria** | Solo 08:00–18:30 Europe/Rome, **mai domenica** (`ALLOW_TODAY=1` per forzare) |
| **Volume** | `MAX_PER_RUN` (default 3), forzato basso durante il warm-up; `SLEEP_BETWEEN` 25s |
| **Un tocco al giorno** | Mai due tocchi allo stesso prospect nello stesso giorno, su qualunque canale |
| **Idempotenza** | `UNIQUE(prospect, canale, tocco)` a livello di schema: il rerun non ri-invia |
| **STOP alla prima risposta** | Stato `replied`, terminale. Nessuna transizione riparte da lì |
| **Gate zone esclusive** | Salone in zona coperta → al distributore. Zona sconosciuta → escalation umana |
| **Linter pre-invio** | Blocca prezzi, "shop", "Metodo 29", claim non documentati. Rigirato anche sul testo in cache |
| **Cooldown** | 3 giorni prima del tocco 2, 5 prima del 3, 7 prima del 4 |

```bash
python3 tests_guardrail.py     # 36 test: violazioni iniettate + testi approvati che devono passare
```

Il linter ha due livelli, e la distinzione è voluta: **BLOCK** su cifre, sconti, listini e margini;
**WARN** sulla parola "prezzo" nuda — perché il copione §5 la usa legittimamente per *rinviare*
il prezzo alla call ("i prezzi li vediamo in call, dipendono dalla zona"). Un linter che bloccasse
anche quella riga bloccherebbe la risposta approvata dal cliente.
Stessa logica per l'e-commerce: "shop" è vietato, ma **"non siamo in vendita online, né Amazon"**
passa — è la leva più forte che abbiamo.

---

## Architettura

```
sheis_outreach/
├── config.py         tutto ciò che cambia passando al cliente (account, path, soglie)
├── store.py          SQLite: prospects · channel_state · sends · drafts · events
├── statemachine.py   stati e transizioni esplicite (le illegali sollevano)
├── guards.py         finestra oraria · warm-up · volume · cooldown
├── zones.py          gate zone esclusive
├── linter.py         cancello di brand pre-invio
├── composer.py       Claude headless: copione + VOICE-LEARNED → messaggio
├── unipile.py        client REST: LinkedIn (invito+DM) · Instagram (DM) · rilevamento risposte
└── cli.py            preflight · import · compose · tick · status · report
```

**Macchina a stati** (per coppia prospect × canale):

```
new → queued → invited ──→ accepted → touched ⟳ → exhausted
                  │            │          │
                  └────────────┴──────────┴──→ replied     (⛔ terminale: passa all'umano)
                                           └──→ escalated  (⛔ gate zone esclusive)
```

Le transizioni sono dichiarate in `statemachine.TRANSITIONS`. Una transizione non prevista solleva
`ValueError` invece di corrompere lo stato in silenzio.

---

## Stato reale · cosa è pronto e cosa è bloccato

| | Stato |
|---|---|
| Macchina a stati + persistenza SQLite | ✅ pronta |
| Sender **LinkedIn** (invito ≤300 + messaggio agli accettati) | ✅ pronto, account pairato |
| Sender **Instagram** | ⚠️ **codice scritto, non verificabile**: nessun account IG pairato su Unipile |
| Compositore Claude headless (IT/EN/ES) | ✅ verificato su 3 prospect in 3 lingue |
| Linter pre-invio | ✅ 36 test, violazioni iniettate |
| Aggancio a `VOICE-LEARNED.md` | ✅ cablato — il file non esiste ancora (Mauro non ha corretto la demo) |
| **Mappa zona → distributore** | 🔴 **NON ESISTE**. Input bloccante da Mauro. Ogni lead-salone escala |
| Account "SHEis partners" LinkedIn/IG | 🔴 da creare e pairare, poi 10-14 giorni di warm-up |
| Canali email / whatsapp | ⏸️ stato e composizione ci sono, **sender non implementato** |

Le due righe rosse non sono difetti del codice: sono decisioni che spettano al cliente. Il sistema
è costruito per mostrarle così come sono, invece di riempirle con qualcosa di inventato.

---

## Fonti di verità

- **Copione approvato** (contenuto dei messaggi):
  `scalers-plus/clienti/sheis-beauty-aiconsult/copy/OUTREACH-CONVERSAZIONI_linkedin-instagram_2026-07-20.md`
- **Correzioni di Mauro** (sovrascrivono il copione):
  `~/alkemia-sheis-outreach-demo/data/VOICE-LEARNED.md`
- **Guardrail di brand**: `scalers-plus/.claude/skills/sheis-brand-core/SKILL.md`
- **Credenziali Unipile**: `scalers-plus/alkemia/05-automations/wa-assistant/.env`

Il codice **implementa** il copione, non lo duplica. Se il copione cambia, cambiano i messaggi al
`tick` successivo, senza toccare una riga di Python.
