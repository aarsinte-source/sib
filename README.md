# SHEis — media buyer su richiesta + kit di lancio campagne Meta

Tutto quello che serve per far partire le campagne di SHEis Beauty International **il giorno stesso
in cui arrivano gli accessi**. Oggi non si può lanciare: manca l'account pubblicitario. Questo
repository esiste perché quando arriverà, il lancio sia un'operazione da mezz'ora e non da due giorni.

Due modi di produrre una campagna, stessi guardrail sotto entrambi (`lib/`):

- **`launch.mjs`** — i 3 blueprint statici già pronti (A/B/C, sotto), pensati per essere accesi
  appena arrivano gli accessi.
- **`campagna_da_brief.mjs`** — il responsabile marketing scrive un brief in linguaggio naturale
  (obiettivo, contenuto, budget) e lo script sceglie il blueprint più adatto, lo personalizza e
  produce la campagna completa e ispezionabile — **in simulazione**, il pulsante resta disarmato
  finché non arrivano gli accessi. Vedi sezione 0.
- **`stato_accessi.mjs`** — risponde in italiano a "possiamo lanciare?", con la richiesta pronta
  da inoltrare al cliente per ciò che manca. È la checklist della sezione 1, ma eseguibile.
- **`attiva.mjs`** — attivazione guidata: chiede un valore alla volta, lo verifica contro l'API
  vera prima di accettarlo (si ferma se valuta ≠ EUR o fuso ≠ Europe/Rome, gli unici due errori
  che si pagano una volta sola), scrive `config.local.json` da solo, e dice cosa manca ancora.
  Non serve aprire nessun file a mano. Guida non tecnica: **`PRONTI-AL-LANCIO.md`**.
- **`prova-a-secco.mjs`** — simula il lancio dei 3 blueprint end-to-end (sia il percorso statico
  di `launch.mjs` sia 3 brief di prova sul percorso di `campagna_da_brief.mjs`) con placeholder
  risolti a valori finti, e verifica che il payload sarebbe valido per Meta: campi obbligatori,
  `advantage_audience`, budget in centesimi, date coerenti, creatività collegate, guardrail di
  brand. Dice "SI, QUESTO PARTIREBBE" o l'elenco esatto di cosa lo bloccherebbe.

---

## Stato reale, al 3 agosto 2026

Verificato, non ipotizzato (rilancia `node stato_accessi.mjs` per la versione sempre aggiornata):

| Cosa | Stato |
|---|---|
| Account pubblicitario Meta di SHEis | **NON ESISTE** nel nostro stack. Interrogata l'API: 37 account visibili, nessuno è SHEis. |
| MCP `meta-ads` (wrapper) | **Token morto** — `Invalid application ID`. Non usarlo. |
| MCP `claude_ai_meta` | Funziona, ma vede solo gli account di Andrei. Nessun accesso a SHEis. |
| Pagina Facebook SHEis | Esiste pubblicamente, **non è nel nostro Business Manager**. |
| Pixel | Sconosciuto. Il sito usa Matomo, non Google Analytics: probabile che un pixel Meta non ci sia proprio. |
| Blueprint, copy, script | **Pronti.** Validati, testati. |
| `campagna_da_brief.mjs` (media buyer su richiesta) | **Costruito e funzionante in simulazione.** Nessuna chiamata reale a Meta è possibile finché manca l'account. |
| `attiva.mjs` (attivazione guidata) + `prova-a-secco.mjs` (prova a secco end-to-end) | **Costruiti e testati.** Vedi `PRONTI-AL-LANCIO.md`. |
| Linter di brand (`lib/guardrails.mjs`) | **Legge le liste direttamente da `BRAND-IDENTITY_sheis_2026-08-03.json`** (non le duplica più a mano): copertura IT/EN/ES/FR/DE/PL/PT/AR, confronto per radice, regola sui claim numerici, eccezione per le negazioni brand-safe. Regressione coperta da `test-guardrails.mjs`. |
| ⚠️ Tetto di spesa aggregato | I 3 blueprint **insieme** costano 1.003,20 EUR/mese, **3,20 EUR sopra** il tetto dichiarato (1.000). `node launch.mjs` senza `--only` si rifiuta di partire (anche in anteprima). Si lancia sempre con `--only`, nella sequenza a fasi di cui sotto — non è un difetto da correggere nei numeri, è il motivo per cui la sequenza esiste. |
| Tabella `sheis_campagne` (Supabase, SHEis Studio) | **Non ancora esistente.** `campagna_da_brief.mjs` scrive nel frattempo in `.campagne/registro.json` (stessa forma dei record) — vedi `lib/campagne-store.mjs`, unica porta verso lo storage: passare al DB richiede solo le due variabili d'ambiente, nessun altro file da toccare. |

**Traduzione onesta:** il lavoro creativo e strategico è finito, e ora anche il motore che trasforma
un brief in una campagna. Il blocco è puramente di accessi, e non dipende da noi. Non è una stima
ottimistica: è la ragione per cui questo repo esiste già.

---

## 0. Media buyer su richiesta — `campagna_da_brief.mjs`

Il responsabile marketing (Mauro, o chi per lui) scrive un brief in linguaggio naturale — obiettivo,
contenuto, budget — e lo script produce una campagna completa e ispezionabile, **senza creare mai
nulla su Meta di default**.

```bash
node campagna_da_brief.mjs --brief "Voglio far conoscere BABILON ai distributori spagnoli. \
Usa questo contenuto. Budget 20 euro al giorno per due settimane. \
Obiettivo: farmi arrivare richieste di contatto."

node campagna_da_brief.mjs --brief-file brief.txt      # da file
cat brief.txt | node campagna_da_brief.mjs              # da stdin
node campagna_da_brief.mjs --brief "..." --creative CR-A2   # forza una creatività specifica
node campagna_da_brief.mjs --brief "..." --out mia-campagna.json
```

**Cosa fa, in ordine:**

1. **Analizza il brief** (`lib/brief-parser.mjs`) — regole trasparenti, non un LLM: ogni segnale
   estratto (brand, paese, segmento, obiettivo, budget, durata, creatività citata) mostra il
   frammento di testo esatto che l'ha fatto scattare. Se il brief non dice una cosa, il campo resta
   vuoto e viene segnalato — non si inventa nulla, stesso principio degli ID di interesse in `launch.mjs`.
2. **Sceglie il blueprint più adatto fra i tre esistenti** (`lib/blueprint-selector.mjs`) — punteggio
   0-100 scomposto per criterio (paese 40, segmento 30, obiettivo 20, brand-con-creatività-dedicata 10),
   stampato per TUTTI e tre i blueprint, non solo per quello scelto: chi legge può dissentire su un
   singolo criterio. Sotto **50/100** non sceglie nulla: dichiara che serve un blueprint nuovo, fuori
   dalla portata dello strumento, invece di forzare un match cattivo.
3. **Personalizza budget, calendario e creatività** (`lib/campaign-builder.mjs`) — scala gli adset del
   blueprint sul budget/durata del brief, riusa la creatività **già approvata** più affine al brand
   citato (non ne scrive mai una nuova: il copy pubblico non nasce mai da testo del brief non passato
   dal linter umano), e spiega ogni scelta in chiaro.
4. **Valida con lo stesso motore di `launch.mjs`** (`lib/validate.mjs` + `lib/guardrails.mjs`) —
   guardrail di brand, `advantage_audience` obbligatorio, coerenza budget. Un solo elenco di termini
   vietati per entrambi gli script.
5. **Doppio controllo del tetto di spesa** (`lib/budget.mjs`) — (a) nessuna campagna singola può
   avere un budget/giorno che da solo supererebbe il tetto mensile; (b) la spesa mensile
   **dell'insieme giusto** (le campagne già registrate in stato `pronta/attiva/in_pausa` **più**
   questa nuova) non supera il tetto dichiarato dal cliente. Il kit statico A/B/C ha il proprio
   controllo separato in `launch.mjs`; se sono già accesi, lo script te lo ricorda esplicitamente
   invece di sommarli in automatico e rischiare un doppio conteggio sbagliato nell'altro verso.
6. **Salva il payload esatto che partirebbe** — in `sheis_campagne` (quando esiste) o in
   `.campagne/registro.json` (oggi), *e* in un file JSON ispezionabile in `.campagne/` con brief,
   segnali, punteggio di ogni blueprint, campagna costruita e payload Graph API completo.
7. **Non chiama mai Meta**, a meno che:

```bash
LIVE=1 node campagna_da_brief.mjs --brief "..." --live
```

   — e anche così, solo se il preflight (accessi reali) passa, la validazione non ha blocchi, il
   budget è entro il tetto, **e** un umano digita `CONFERMO` quando richiesto. Tutto nasce comunque
   in `PAUSED`: nessuno script accende spesa.

**Stato in DB (`sheis_campagne.stato`):** `bozza` (proposta pronta per revisione umana — l'esito
normale di ogni simulazione riuscita), `bloccata` (guardrail violati, budget fuori tetto, nessun
blueprint adatto, o preflight fallito — con `motivo_blocco` sempre popolato), `pronta`/`attiva`/
`in_pausa`/`conclusa` (dopo la creazione reale, gestite a mano).

---

## 1. La checklist esatta degli accessi da chiedere a Mauro

Da mandare così com'è. Ogni riga ha un perché, perché "dammi gli accessi" è la richiesta che
si perde per tre settimane.

> Questa checklist vive anche in forma eseguibile in `lib/checklist-accessi.mjs`. Lanciando
> `node stato_accessi.mjs` ottieni lo stesso elenco con lo stato reale voce per voce (verificato
> via API dove possibile) e il blocco di richiesta pronto da copiare, sempre aggiornato — non serve
> tenere questa sezione e lo script sincronizzati a mano, la fonte è una sola.

### A. Business Manager
- [ ] **Nome e ID del Business Manager di SHEis** (se non esiste, va creato — 10 minuti su `business.facebook.com`)
- [ ] **Ruolo per Alkemia**: aggiungere `a.arsinte@andreiarsinte.it` come **Amministratore**
  → *Impostazioni azienda → Utenti → Persone → Aggiungi*
- [ ] In alternativa, più pulito per un'agenzia: **collegare il Business Manager di Alkemia come partner**
  → *Impostazioni azienda → Partner → Aggiungi partner* → ID business Alkemia: `260406431383223`

### B. Account pubblicitario
- [ ] **Esiste già un account pubblicitario SHEis?** Se sì serve l'ID (`act_...`).
      Se no va creato **dentro il Business Manager di SHEis**, non da un profilo personale.
- [ ] **Valuta: EUR.** Si sceglie alla creazione e **non si può più cambiare**. Se nasce sbagliato
      va buttato e rifatto. I budget di questo kit sono in euro.
- [ ] **Fuso orario: Europe/Rome.** Stessa cosa: si sceglie una volta sola.
- [ ] Ruolo per Alkemia sull'account: **Inserzionista** (basta) o **Amministratore** (più comodo)

### C. Pagina Facebook
- [ ] **La Pagina va portata dentro il Business Manager di SHEis**
      → *Impostazioni azienda → Pagine → Aggiungi → Aggiungi una pagina esistente*
- [ ] Chi la amministra oggi deve accettare il passaggio. Se la Pagina è legata al profilo personale
      di qualcuno che non lavora più in azienda, **scoprirlo adesso, non il giorno del lancio.**
- [ ] Ruolo per Alkemia sulla Pagina: **Accesso completo** o almeno *Crea inserzioni*

### D. Instagram
- [ ] Il profilo Instagram deve essere **Business** (non Creator, non personale)
      → *App IG → Impostazioni → Tipo di account → Passa a un account aziendale*
- [ ] **Collegato alla Pagina Facebook** → *Business Suite → Impostazioni → Account Instagram*
- [ ] Aggiunto al Business Manager di SHEis

⚠️ Senza questo passaggio gli annunci **non escono su Instagram**. È l'errore più frequente e
si scopre sempre dopo aver caricato tutto.

### E. Pixel e dominio
- [ ] **Esiste un pixel Meta su sheishair.com?** Probabilmente no (usano Matomo).
      Se manca va creato: *Gestione eventi → Connetti origine dati → Web*
- [ ] Installazione sul sito: la fa **Mark Studio**, il fornitore WordPress. Va dato mandato a loro.
- [ ] **Verifica del dominio `sheishair.com`** → *Impostazioni azienda → Sicurezza del brand → Domini*
      Richiede un record TXT nel DNS. Serve al fornitore che gestisce il dominio.

> **Nota di onestà tecnica:** pixel e dominio **non servono per lanciare** questo kit. Le campagne
> A e B usano moduli istantanei, la C non ha destinazione. Vanno chiesti lo stesso perché servono
> a tutto ciò che verrà dopo, e perché richiedono un fornitore terzo con i suoi tempi. Chiederli
> adesso è l'unico modo di averli quando serviranno.

### F. Pagamento
- [ ] **Metodo di pagamento sull'account pubblicitario** → *Gestione pagamenti → Aggiungi*
- [ ] Intestato a **SHEis Beauty International S.r.l.**, non a una persona
- [ ] **Soglia di spesa (`spend cap`) a 1.000 EUR/mese** sull'account.
      È la rete di sicurezza vera: anche se qualcuno sbaglia un budget, Meta si ferma da solo.
      Consigliata a Mauro esplicitamente — protegge lui, e protegge noi.

### G. Permessi per i lead
- [ ] Sul token serve **`leads_retrieval`**, altrimenti i contatti raccolti dai moduli
      **non sono leggibili via API** e vanno scaricati a mano da Business Suite.

⚠️ Questo permesso ci ha già bloccati su un altro cliente. Il token della Pagina **non lo eredita**:
va concesso esplicitamente. Chiederlo adesso, non quando arriva il primo lead.

### H. Privacy
- [ ] **URL della privacy policy** (obbligatorio su ogni modulo lead — senza, Meta rifiuta il modulo)
- [ ] **Chi riceve i lead** e su quale casella: i moduli vanno collegati a una destinazione reale,
      altrimenti i contatti restano dentro Meta e nessuno li vede.

---

## 2. Cosa succede appena arrivano gli accessi

Da qui sono circa **30 minuti**, più i tempi di revisione di Meta.

```bash
cd ~/alkemia-sheis-ads
cp config.example.json config.local.json
```

**1. Riempi `config.local.json`** — token, `ad_account_id`, `PAGE_ID`, `INSTAGRAM_ACTOR_ID`.

**2. Verifica che gli accessi funzionino davvero** (non crea niente):
```bash
node launch.mjs --preflight
```
Controlla token, permessi, stato e valuta dell'account, metodo di pagamento, Pagina, Instagram,
pixel e moduli lead. Se qualcosa manca lo dice, e dice come si risolve.

**3. Risolvi gli ID degli interessi** — sono l'unica cosa che non si può preparare in anticipo:
```bash
curl -G "https://graph.facebook.com/v21.0/search" \
  -d type=adinterest -d q=Davines -d access_token=$TOKEN
```
Ripeti per ogni `INTEREST_ID:` in `config.local.json` e incolla gli ID trovati.

> ⚠️ **Non inventare questi ID.** Un ID sbagliato non produce un errore: produce spesa,
> silenziosamente, sul pubblico sbagliato. Lo script rifiuta di partire se ne trova uno non risolto,
> e questo è deliberato.

**4. Crea i moduli lead** in *Business Suite → Moduli per l'acquisizione contatti*, seguendo
`lead_form_spec` dentro ogni blueprint. Incolla gli ID in `config.local.json`.

**5. Carica i visual** e incolla gli hash:
```bash
curl -F "filename=@creative-A1.jpg" -F "access_token=$TOKEN" \
  "https://graph.facebook.com/v21.0/act_XXXX/adimages"
```

**6. Prova a vuoto** — mostra il piano di spesa completo senza creare niente:
```bash
node launch.mjs
```

**7. Crea davvero:**
```bash
node launch.mjs --live --only A-estero-spagna
```
Chiede di scrivere `CONFERMO`. **Tutto nasce in PAUSA.**

**8. Guarda le anteprime in Gestione Inserzioni e accendi a mano.**
Nessuno script accende spesa: quello lo fa una persona, guardando lo schermo.

---

## 3. Cosa fa lo script, e cosa si rifiuta di fare

`launch.mjs` parte dal presupposto che tutto sia rotto finché non ha dimostrato il contrario.

**Si ferma e non crea niente se:**
- il token è scaduto, invalido, o senza i permessi necessari
- l'account non è `ACTIVE`, non ha metodo di pagamento, o **non è in EUR**
- la Pagina non è raggiungibile o non ha un Instagram business collegato
- un modulo lead referenziato non esiste
- un blueprint contiene un placeholder `<<...>>` non risolto
- un adset non dichiara `advantage_audience`
- **una creatività viola i guardrail di brand**
- la spesa mensile stimata supera il tetto dichiarato dal cliente

I controlli locali girano **prima** di quelli di rete, di proposito: sono gratis e pescano i danni
peggiori. Se venissero dopo, un token scaduto nasconderebbe una violazione di firewall.

### Il linter dei guardrail

Non è un abbellimento. Blocca la creazione se in una creatività compaiono:

| Categoria | Termini | Perché |
|---|---|---|
| Conflitto di canale | shop, negozio, carrello, acquista, e-commerce, checkout, tienda, carrito, koszyk(a), carrinho, Warenkorb, panier, arabo... | Il cliente ha **rifiutato** la vendita diretta: è un danno verso la rete di distributori |
| Prezzi | €, euro, prezzo/prezzi, precio, pricing, listino, sconto/sconti, offerta/offerte, saldo/saldi | *"La discriminante è il prezzo"* — `6b6cc1a3 · 2:12:18` |
| Firewall M29 | Metodo 29, Metodo29, Method 29, M29, e parafrasi numeriche vicine a "metodo" | Divieto assoluto: non deve mai risultare collegato a SHEis |
| Claim numerici | qualunque numero accostato a %, minuti, fasi, anni... fuori dall'elenco documentato (15, 83, 99, 3) | Un numero non documentato è un claim che l'azienda non può dimostrare |

**Fonte unica**: la lista di termini **non è più copiata a mano qui** — `lib/guardrails.mjs` la
legge direttamente da `clienti/sheis-beauty-aiconsult/data/BRAND-IDENTITY_sheis_2026-08-03.json`
(con uno snapshot di sicurezza se il file non è raggiungibile, sempre dichiarato a schermo). Il
confronto è **per radice, non per parola esatta** (allineato a
`~/alkemia-sheis-studio/src/lib/linter.ts`): "koszyka" (genitivo polacco di "koszyk") viene preso
lo stesso, "cartella" no (il suffisso libero scatta solo da 6 caratteri in su). Una **negazione
brand-safe** ("non siamo in vendita online, né su un e-commerce nostro") viene riconosciuta ed
**esentata** — ma solo per la categoria "conflitto di canale": prezzi e firewall M29 restano
assoluti anche in negazione. Ogni esenzione è mostrata, mai silenziosa.

Testato con violazioni reali iniettate di proposito (`node test-guardrails.mjs`): le becca tutte,
indica il file, il campo, il testo intorno e il perché. **Non è aggirabile con un flag.** Se un
annuncio le viola, si riscrive l'annuncio.

Il linter guarda solo i campi che finiscono sotto gli occhi di un lettore (`message`, `name`,
`description`, `caption`, `label`). I metadati dei blueprint parlano di sconti e listini di
proposito: sono per noi, non per il pubblico.

### Fallback `advantage_audience`

I blueprint lo mettono in `targeting.targeting_automation.advantage_audience`. Se Meta dovesse
rifiutarlo, lo script lo dice esplicitamente e la correzione è spostarlo alla radice del targeting:

```json
"targeting": { "advantage_audience": 0, "geo_locations": { ... } }
```

È impostato a **0** su tutte e tre le campagne: la strategia è targeting chirurgico, e l'espansione
automatica di Advantage+ vanificherebbe la selezione. Sulla campagna C non è nemmeno una scelta di
performance: farebbe uscire la consegna dalla zona del distributore, che è un **vincolo politico**.

---

## 4. Le tre campagne

| | Campagna | Budget/mese | Obiettivo | Apprendimento |
|---|---|---|---|---|
| **A** | Estero — importatore Spagna | ~669 EUR | `OUTCOME_LEADS` | Learning limited permanente |
| **B** | Italia — distributori | ~243 EUR | `OUTCOME_LEADS` | **Sotto soglia** |
| **C** | Saloni — awareness zona pilota | ~91 EUR | `OUTCOME_AWARENESS` | **OK** |

Totale a regime: **1.003,20 EUR/mese** — misurato con `node prova-a-secco.mjs`, **3,20 EUR sopra**
il tetto di 1.000 EUR dichiarato in `config.example.json`. Non è un arrotondamento innocuo: il
codice confronta con un `>` stretto, quindi `node launch.mjs` senza `--only` (dry-run o `--live`)
**si rifiuta di partire**, anche solo per mostrare l'anteprima. La sequenza di accensione a fasi
qui sotto evita il problema in pratica (mai le tre insieme), ma va sempre lanciata con `--only`.
Se in futuro si vuole un `node launch.mjs` "nudo" che funzioni con tutti e tre insieme, la scelta
(alzare il tetto dichiarato o tagliare ~4 EUR/giorno su un blueprint) è di Mauro, non una modifica
silenziosa da fare qui.

**Sequenza di accensione: A e C nel mese 1 (760 EUR). B entra nel mese 2**, solo dopo che A ha un
costo per lead misurato. Accendere tutto insieme significa dimezzare campagne già sotto soglia.

Il ragionamento completo su budget, soglie di apprendimento e criteri di spegnimento sta nel piano:
`clienti/sheis-beauty-aiconsult/report/PIANO-CAMPAGNE_meta_2026-07-20.md`

---

## 5. I tre blocchi che non dipendono dagli accessi

Vanno risolti in parallelo, non dopo. Se aspettiamo gli accessi per affrontarli, li affronteremo
con la campagna già accesa.

**1. La pagina `/negozio/` su sheishair.com** — H1 "Shop". È esattamente il modello che il cliente
ha rifiutato. Un parrucchiere che ci arriva da un annuncio conclude che SHEis vende diretta, e il
danno è verso la rete. **Nessuna campagna di questo kit manda traffico al sito**, ed è il motivo per
cui A e B usano moduli istantanei e C non ha destinazione. Va rimossa da Mark Studio.

**2. La mappa zone → distributore non esiste.** Finché manca, nessun lead-salone può essere
instradato in automatico. La campagna C è progettata per non raccogliere lead proprio per questo.
Il giorno in cui qualcuno chiede di aggiungerle un modulo, la mappa diventa un bloccante assoluto.

**3. ATECO 46.45 non è targettizzabile su Meta.** È una classificazione statistica italiana, Meta
non la espone. L'universo reale è ~900 aziende: troppo piccolo perché Meta funzioni. **Meta non è
il canale primario per l'Italia** — il canale è l'outreach diretto, per cui la copy è già scritta.
La campagna B vale come rinforzo, e va raccontata a Mauro per quello che è.

---

## 6. File

```
~/alkemia-sheis-ads/
├── launch.mjs                        launcher blueprint statici A/B/C — preflight, linter, dry-run
├── campagna_da_brief.mjs             media buyer su richiesta — brief in linguaggio naturale → campagna
├── stato_accessi.mjs                 "possiamo lanciare?" — checklist eseguibile + richiesta pronta
├── attiva.mjs                        attivazione guidata — chiede, verifica contro l'API vera, salva
├── prova-a-secco.mjs                 prova a secco end-to-end (blueprint statici + brief) — nessuna chiamata a Meta
├── PRONTI-AL-LANCIO.md               guida non tecnica: cosa chiedere, in che ordine, cosa lanciare
├── test-guardrails.mjs               regressione del linter di brand (node --test)
├── test-meta-api.mjs                 regressione del gate valuta/fuso (node --test)
├── test-brief-parser.mjs             regressione del parser brief (node --test)
├── config.example.json               da copiare in config.local.json
├── config.local.json                 token e ID — GITIGNORATO, mai committare
├── lib/                              logica condivisa dai tre script sopra — un solo posto, non tre
│   ├── ui.mjs                        output colorato (ok/warn/fail/title)
│   ├── guardrails.mjs                termini vietati di brand + linter — legge BRAND-IDENTITY, FONTE UNICA
│   ├── placeholders.mjs              <<TOKEN>> → config.resolve
│   ├── meta-api.mjs                  client Graph API minimo (fetch nativo) + verificaValutaEFuso()
│   ├── preflight.mjs                 verifica accessi reali (token, account, pagina, IG, pixel, moduli)
│   ├── validate.mjs                  guardrail + advantage_audience + coerenza budget su un blueprint
│   ├── payload-builder.mjs           payload ESATTO per Meta — build (puro) + execute (POST reali)
│   ├── budget.mjs                    tetto di spesa — piano di spesa statico + doppio controllo brief
│   ├── campagne-store.mjs            unica porta verso sheis_campagne (Supabase, con fallback locale)
│   ├── checklist-accessi.mjs         checklist canonica — la stessa che vedi nella sezione 1
│   ├── brief-parser.mjs              brief in linguaggio naturale → segnali strutturati (regole, non LLM)
│   ├── blueprint-selector.mjs        punteggio 0-100 per scegliere il blueprint più adatto
│   └── campaign-builder.mjs          blueprint + segnali → campagna personalizzata + payload
├── blueprints/
│   ├── A-estero-spagna.json
│   ├── B-italia-distributori.json
│   └── C-saloni-awareness.json
├── .campagne/                        GITIGNORATO — registro locale + JSON ispezionabili per brief
└── .runs/                            registro degli ID creati da launch.mjs --live, per rollback
```

Deliverable collegati nel workspace:
- Piano — `clienti/sheis-beauty-aiconsult/report/PIANO-CAMPAGNE_meta_2026-07-20.md`
- Copy IT/EN/ES — `clienti/sheis-beauty-aiconsult/copy/AD-COPY_lancio_2026-07-20.md`
- Guardrail di brand — `.claude/skills/sheis-brand-core/`
- Identità di brand misurata — `clienti/sheis-beauty-aiconsult/data/BRAND-IDENTITY_sheis_2026-08-03.json`
  (il linter di `lib/guardrails.mjs` **legge da qui**, non ricopia le liste — vedi §3)
- Schema `sheis_campagne` — `~/alkemia-sheis-backend/migrations/0002_studio.sql`
- Guida non tecnica all'attivazione — `PRONTI-AL-LANCIO.md`

Requisiti: **Node ≥ 18** (usa `fetch` nativo e `node:test`). Testato su v24.14.1. Nessuna dipendenza
esterna. Test: `node --test test-guardrails.mjs test-meta-api.mjs test-brief-parser.mjs`.
