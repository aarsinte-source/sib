# SHEis Studio — specifica di costruzione

> Strumento operativo del reparto marketing di SHEis Beauty International.
> Non è una vetrina: la vetrina è `alkemia-sheis-console`. Qui si lavora.

## Chi lo usa

Tre ruoli, tre poteri diversi. Ogni azione finisce nel registro con nome e ora.

| Ruolo | Può |
|---|---|
| `mauro` | tutto: vede, approva, lancia campagne, gestisce gli utenti |
| `marketing` | approva e rifiuta contenuti e varianti, programma, lancia campagne, scrive articoli |
| `dipendente` | scrive articoli, carica immagini, propone. **Non approva e non pubblica** |

L'autorizzazione vive nell'applicazione, che parla col database da server con la
chiave di servizio. Nessuna policy RLS basata sui ruoli: su un altro cliente una
policy che interrogava la propria tabella ha generato ricorsione infinita e ha
declassato in silenzio tutti gli amministratori a operatori. Non si ripete.

## Il flusso, in sei passi

```
1 Analisi      →  2 Piano      →  3 Decisione   →  4 Creatività  →  5 Uscita   →  6 Report
  mercato+IG      contenuti       approva /        3 varianti      calendario    lunedì
                  per brand       rifiuta /        automatiche     → Zernio      09:00
                  ×pubblico       modifica         → si sceglie
                  ×lingua                            LA variante
```

I passi 1-3 girano su richiesta. I passi 4-5 partono **da soli** su ciò che è
stato approvato. Il 6 è schedulato.

---

## Vincoli non negoziabili

### 1. Il file di identità di marca è una regola, non un documento

`clienti/sheis-beauty-aiconsult/data/BRAND-IDENTITY_sheis_2026-08-03.json`
(nel repo `scalers-plus`) va **caricato e applicato** da ogni generatore, e fatto
rispettare dal linter prima che qualsiasi cosa esca. Contiene lessico ammesso e
vietato, struttura delle caption, mix dei formati, CTA ammesse e vietate, numeri
documentati. Copiane una versione in `src/brand/` al build, ma la fonte resta quella.

### 2. Il linter blocca, non avvisa

Prima di salvare un contenuto come approvato e prima di metterlo in coda:
- prezzi e cifre commerciali (`€`, `euro`, `prezzo`, `listino`, `sconto`, `offerta`, `promo`)
- lessico da negozio in **ogni lingua** (`shop`, `carrello`, `acquista`, `cart`, `tienda`, `panier`, `Warenkorb`, `koszyk`, `loja`, `متجر`)
- **«Metodo 29»** in ogni grafia e parafrasi — firewall assoluto del cliente
- claim numerici non presenti nell'elenco dei numeri documentati
- nomi di clienti o distributori senza consenso registrato

Un blocco deve dire **quale regola** ha fermato **quale frase**, in italiano.

### 3. Il degrado si dichiara

Se Higgsfield esaurisce i crediti o incontra il tetto giornaliero, se Zernio non
ha account SHEis collegati, se Meta non ha un account pubblicitario: il pezzo si
ferma e **scrive il motivo dove l'utente lo vede**, tradotto in italiano. Mai un
fallimento silenzioso, mai un finto verde.

### 4. Nessuna finzione

Un pulsante che porta a un servizio non collegato non è verde: è un'etichetta
ferma che dice cosa manca. Vale ovunque.

---

## Architettura

- **Next.js 15+ App Router**, TypeScript, Tailwind. `export const runtime = "nodejs"` sulle route.
- **Supabase** come unica persistenza, via REST con la chiave di servizio, **solo da server**.
  Progetto `wwbfysrqxbwfankkoppt`. Schema in `~/alkemia-sheis-backend/migrations/`.
  ⚠️ Le tabelle **non esistono ancora**: il DDL richiede un Personal Access Token che
  oggi manca. L'app deve funzionare e dire chiaramente «database non ancora
  inizializzato» invece di rompersi con un errore tecnico.
- **Nessun segreto nel client.** Le chiavi vivono in `.env.local` e nelle variabili
  di Vercel. Ogni chiamata a un servizio esterno passa da una route server.

### Struttura

```
src/
  lib/
    supabase.ts        client server-side + rilevamento «schema non inizializzato»
    dati.ts            l'UNICO punto che parla col database (contenuti, varianti, log…)
    auth.ts            sessione, ruoli, guardie
    linter.ts          le regole di marca, con motivo del blocco
    brand.ts           carica BRAND-IDENTITY e lo espone tipizzato
    openai.ts          generazione testi (riusa il pattern di alkemia-sheis-console)
    higgsfield.ts      generazione varianti + GATE DI COSTO obbligatorio
    zernio.ts          coda e pubblicazione
  app/
    (auth)/entra/                 accesso
    analisi/                      passo 1
    piano/                        passo 2 e 3 — il cuore
    creativita/                   passo 4 — le tre varianti
    calendario/                   passo 5
    outreach/                     candidati e sequenze (sola lettura dal motore)
    campagne/                     media buyer su richiesta
    sito/                         articoli e blocchi
    report/                       passo 6
    api/…                         una route per azione
  components/                     kit UI
```

### Da riusare (non riscrivere)

Da `~/alkemia-sheis-console/src/`:
- `lib/marketing.ts` → `openaiJSON()`, `REGOLE_BRAND`, `generaPromptHiggsfield()`, le coercizioni `pick/str/strArray`
- le 6 route `api/marketing/*` (analisi, piano, sviluppa, rielabora, scarta, stato): la logica è valida, va solo staccata dallo store su file e attaccata a Supabase
- `components/ui.tsx` → `Card`, `Section`, `StatusChip`, `Reveal`, `Button`
- `app/content-board/PortaleClient.tsx` → il flusso a fasi e le azioni per contenuto

**Differenza importante rispetto alla console**: là si «sviluppa o si scarta».
Qui servono **approva · rifiuta · modifica**, dove *modifica* è sia la riscrittura
guidata dall'AI su nota, sia **l'editing manuale dei campi** — che oggi non esiste
da nessuna parte ed è la cosa che il responsabile marketing userà di più.

---

## Le tre varianti creative

Sul contenuto approvato partono **tre** generazioni, non una. Devono differire per
una variabile dichiarata (inquadratura, ambientazione, luce), non a caso: chi
sceglie deve capire *cosa* sta scegliendo. Ogni variante salva il proprio
`angolo_visivo` in una riga leggibile.

**Gate di costo, obbligatorio prima di ogni generazione**: 1 credito = €0,033
(misurato). Mostrare il costo previsto e chiedere conferma sopra una soglia
configurabile. Higgsfield ha un **tetto giornaliero oltre ai crediti**: se scatta,
la variante va in `errore` col motivo in italiano, e le altre non partono.

Si approva **la variante**, e l'approvazione scrive `variante_scelta_id` sul
contenuto e una riga nel registro.

---

## Cosa NON fare

- Non pubblicare su canali che non sono di SHEis. Zernio oggi vede solo gli account
  Alkemia: la coda si ferma e lo dichiara. Pubblicare sui canali Alkemia «per prova»
  è peggio che non pubblicare.
- Non inventare numeri. Se un dato manca, marcarlo `[DA CONFERMARE]` e non farlo uscire.
- Non introdurre dipendenze pesanti dove il kit UI basta.
- Non mettere logica di autorizzazione nel client.

---

## Definizione di fatto

1. `npm run build` verde e `tsc --noEmit` pulito.
2. Con il database non inizializzato l'app **si apre lo stesso** e spiega cosa manca.
3. Giro completo dimostrato: genero un piano, approvo un contenuto, ne rifiuto un
   altro, ne modifico un terzo a mano → le tre azioni compaiono nel registro con
   attore e ora.
4. Il linter blocca davvero un contenuto che contiene un prezzo, e dice quale
   regola e quale frase.
5. Le tre varianti si generano (o dichiarano il motivo per cui non possono) e se
   ne approva una.
6. I tre ruoli hanno poteri diversi e verificabili: un `dipendente` che tenta di
   approvare riceve un rifiuto, non un pulsante nascosto.
