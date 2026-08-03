---
titolo: "SHEis Beauty — pronti al lancio: cosa chiedere, in che ordine, cosa lanciare"
aggiornato: 2026-08-03
audience: "responsabile marketing / chi riceve le credenziali — non serve sapere programmare"
---

# Pronti al lancio

Questa pagina serve a UNA cosa sola: quando arrivano le credenziali Meta di
SHEis, sapere **cosa chiedere**, **in che ordine**, e **quale comando
lanciare** dopo ogni pezzo che arriva. Non serve aprire nessun file di
configurazione a mano: c'è un comando che fa le domande e verifica le
risposte da solo.

Tutto gira da un terminale, dentro la cartella `~/alkemia-sheis-ads`. Se non
sai cos'è un terminale, fatti aiutare per aprirlo una volta: da lì in poi è
solo copiare-incollare i comandi scritti qui sotto.

---

## ⚠️ Prima di tutto — i lead di A e B rischiano di restare prigionieri

Verificato **eseguendo** il controllo il 2026-08-03 (non solo leggendo i
permessi dichiarati): il token Meta disponibile **non ha `leads_retrieval`**.
Un modulo lead si crea e si vede senza problemi, ma i contatti raccolti
dentro **non si leggono via API** — l'errore è specifico e riproducibile:
`(#200) Requires leads_retrieval permission to manage the object`.

Questo tocca **A-estero-spagna** e **B-italia-distributori** (usano moduli
istantanei nativi Meta). **Non tocca C-saloni-awareness**, che non raccoglie
lead per costruzione.

**Ci sono due vie, entrambe già pronte in questo repo:**

| | Via (a) — modulo nativo | Via (b) — pagina del sito |
|---|---|---|
| Cosa serve | Il permesso `leads_retrieval` sul token | Il dominio vero del sito pubblicato |
| Chi lo fa | Revisione app Meta (developers.facebook.com) | Chi gestisce `~/alkemia-sheis-web` + Supabase |
| Quanto ci vuole | Giorni, non minuti — dipende da Meta | Un Personal Access Token Supabase (2 minuti, self-service) |
| Blueprint da lanciare | `A-estero-spagna`, `B-italia-distributori` | `A-estero-spagna-web`, `B-italia-distributori-web` |
| Verificato con `node attiva.mjs` | Sì (sezione "Consegna lead") | Struttura sì, consegna reale no — serve un invio di prova |

**Cosa fare praticamente:**
1. `node attiva.mjs` verifica da solo se il permesso c'è (esegue una lettura vera, non guarda solo gli scope). Se manca, te lo dice chiaramente.
2. Se manca e serve lanciare **subito**, usa la via (b): compila i due `LANDING_URL` nel wizard e lancia `A-estero-spagna-web`/`B-italia-distributori-web` invece degli originali (stesso pubblico, stesso budget, stessa copy — cambia solo dove arriva il click).
3. La via (b) ha un suo prerequisito, più leggero ma reale: la tabella `sheis_lead_ads` su Supabase non esiste ancora finché qualcuno non applica la migrazione con un **Personal Access Token** (`sbp_...`, si genera in 2 minuti su `supabase.com/dashboard/account/tokens` — istruzioni in `~/alkemia-sheis-backend/applica_migrazioni.py`). **Prima di spendere un euro sulla variante web, fai un invio di prova sul form vero e verifica che la riga arrivi in `sheis_lead_ads`.**
4. Se nessuna delle due è pronta oggi, **C-saloni-awareness parte comunque**: non dipende da nessuna delle due vie.

---

## Il comando unico: `node attiva.mjs`

```bash
cd ~/alkemia-sheis-ads
node attiva.mjs
```

Fa le domande **una alla volta**, nell'ordine giusto. Per ogni risposta che
dai, il comando la **verifica davvero** contro Meta (quando è possibile) e
la salva subito — se ti fermi a metà, la prossima volta che lo rilanci
riparte da dove avevi lasciato, senza farti ripetere le domande già fatte
(basta premere Invio per tenere il valore già dato).

**Se non hai ancora la risposta a una domanda**, premi Invio e passa oltre:
tornaci quando arriva.

**Un punto è bloccante e non si aggira**: la valuta dell'account
pubblicitario deve essere **EUR** e il fuso orario **Europe/Rome**. Si
scelgono nel momento in cui l'account viene creato e **non si possono più
cambiare**. Se il comando ti dice che sono sbagliati, si ferma apposta:
non ha senso continuare a rispondere ad altre 20 domande su un account che
va rifatto da zero.

---

## Cosa chiedere, a chi, in che ordine

### 1. A chi crea/gestisce il Business Manager di SHEis

- Il nome e l'ID del Business Manager di SHEis su `business.facebook.com`.
  Se non esiste ancora, va creato (10 minuti).
- Aggiungere `a.arsinte@andreiarsinte.it` come **Amministratore**, oppure
  collegare il Business Manager di Alkemia come partner
  (ID business Alkemia: `260406431383223`).

*Nessun comando qui: è un passaggio che si fa dentro Meta Business Suite.*

### 2. L'account pubblicitario — IL PASSAGGIO SENZA RITORNO

- Esiste già un account pubblicitario SHEis? Serve l'ID (comincia con
  `act_...`, o anche solo il numero).
- Se non esiste, va creato **dentro** il Business Manager di SHEis (non da
  un profilo personale), scegliendo esplicitamente:
  - **Valuta: EUR**
  - **Fuso orario: Europe/Rome**
- Ruolo per Alkemia: Inserzionista (basta) o Amministratore.

**Appena hai l'ID e il token**, lancia `node attiva.mjs` e rispondi alle
prime due domande (token, poi ID account). Se valuta o fuso sono sbagliati
il comando **si ferma e te lo dice**: in quel caso non andare oltre, torna
da chi ha creato l'account e fallo rifare.

### 3. La Pagina Facebook

- La Pagina Facebook SHEis va portata **dentro** il Business Manager SHEis
  (Impostazioni azienda → Pagine → Aggiungi → Aggiungi una pagina esistente).
- Ruolo per Alkemia: Accesso completo (o almeno Crea inserzioni).

Poi rispondi alla domanda sul `PAGE_ID` in `node attiva.mjs`: verifica da
solo se la Pagina è raggiungibile e se ha un Instagram collegato.

### 4. Instagram

- Il profilo Instagram deve essere **Business** (non Creator, non
  personale): App IG → Impostazioni → Tipo di account.
- Va **collegato alla Pagina Facebook** (Business Suite → Impostazioni →
  Account Instagram) — senza questo passaggio gli annunci **non escono su
  Instagram**, ed è l'errore più facile da non notare finché non è troppo
  tardi.

`node attiva.mjs` rileva da solo l'Instagram collegato alla Pagina, se c'è.

### 5. Pagamento

- Metodo di pagamento sull'account, intestato a **SHEis Beauty
  International S.r.l.**
- Consigliato (non obbligatorio per lanciare): uno **spend cap** di 1.000
  EUR/mese impostato dentro Meta stesso — è la rete di sicurezza vera,
  ferma la spesa anche se qualcuno sbaglia un numero.

### 6. Privacy e destinatario dei lead

- Conferma l'URL della privacy policy da usare nei moduli
  (`https://www.sheishair.com/privacy-policy/` è quello di partenza — verifica
  che sia quello giusto).
- **Chi deve ricevere i lead raccolti**, e su quale email o CRM. Senza una
  destinazione reale, i contatti restano dentro Meta e nessuno li vede.

### 7. Moduli lead

Vanno creati a mano in *Business Suite → Moduli per l'acquisizione contatti*
(le domande da mettere in ogni modulo sono già scritte, una per lingua, nei
file `blueprints/A-estero-spagna.json` e `blueprints/B-italia-distributori.json`,
sezione `lead_form_spec`). Poi incolla i due ID (spagnolo e italiano) quando
`node attiva.mjs` te li chiede.

### 8. Immagini

Carica ogni visual (istruzioni in `README.md` §2) e incolla i relativi hash
quando richiesto. Se non hai ancora un'immagine, salta: la aggiungerai dopo.

### 9. Interessi di targeting

`node attiva.mjs` fa una **ricerca live su Meta** per ogni nome (Davines,
Kevin Murphy, Parrucchiere, ecc.) e ti mostra i risultati veri: scegli l'ID
da lì, non a occhio. *Un ID sbagliato non dà errore: spende sul pubblico
sbagliato, in silenzio* — per questo la ricerca guidata conta.

### 10. La zona pilota (solo per la campagna C — saloni)

Questa la decide **Mauro**: il territorio di UN distributore già
identificato, con nome, latitudine e longitudine del centro. Senza questo
dato la campagna C resta in attesa — non blocca A e B.

---

## Dopo aver finito con `node attiva.mjs`

Tre comandi, in quest'ordine:

```bash
node prova-a-secco.mjs      # verifica strutturale dei 3 blueprint, senza toccare Meta
node launch.mjs --preflight # verifica gli accessi VERI (token, account, Pagina, IG, moduli)
node launch.mjs              # anteprima completa, non crea nulla
```

Se tutti e tre vanno bene, il lancio vero e proprio (sempre in **PAUSA**,
mai in automatico):

```bash
node launch.mjs --live --only A-estero-spagna
```

Chiede di scrivere `CONFERMO` a mano. Anche dopo aver creato, **nessuna
campagna parte da sola**: si accende manualmente in Gestione Inserzioni,
dopo aver guardato le anteprime.

---

## ⚠️ Quattro cose da NON fare

1. **Non lanciare mai `--live` senza `--only`, finché il tetto di spesa
   resta a 1.000 EUR/mese.** I 3 blueprint insieme costano **1.003,20
   EUR/mese** — 3,20 EUR sopra il tetto. In anteprima (`node launch.mjs`,
   senza `--live`) questo è solo un avviso, apposta: un freno che impedisce
   di GUARDARE non protegge niente. In `--live` invece blocca sul serio e
   non si discute. Non è un errore da correggere nei file: è il motivo per
   cui la sequenza di accensione è già decisa a fasi — vedi punto 2.

2. **Segui la sequenza già decisa**: la campagna **A** (estero) e la **C**
   (saloni, awareness) si accendono nel **mese 1** (760 EUR/mese insieme,
   sotto il tetto). La **B** (Italia) entra solo nel **mese 2**, dopo che A
   ha un costo-per-lead misurato. Accendere tutto insieme vuol dire
   dimezzare due campagne già sotto la soglia minima per imparare.

3. **Non saltare `node prova-a-secco.mjs`** prima del primo `--live`: è la
   prova che il payload che Meta si aspetta è davvero completo — nomi,
   budget in centesimi, `advantage_audience`, creatività collegate, testi
   che passano il linter di brand. Se dice "SI, PARTIREBBE" per tutti e tre
   i blueprint, il resto dipende solo dagli accessi veri.

4. **Non lanciare `A-estero-spagna` o `B-italia-distributori` (le versioni
   native, non `-web`) senza aver visto "Consegna lead verificata" in
   `node attiva.mjs` o `node launch.mjs --preflight`.** Un modulo che esiste
   non basta: se `leads_retrieval` manca, la campagna raccoglie lead che
   restano dentro Meta, illeggibili via API, e nessuno se ne accorge da
   solo — vedi la sezione "Prima di tutto" più sopra per le due vie d'uscita.

---

## Se qualcosa si blocca

- **"Fermo — errore che si paga una volta sola"** (durante `attiva.mjs`):
  valuta o fuso dell'account sbagliati. Non si corregge: si butta l'account
  e se ne crea uno nuovo in EUR / Europe/Rome.
- **Guardrail di brand bloccato**: il testo di un annuncio contiene una
  parola vietata (prezzo, "shop", "e-commerce", varianti in altre lingue, o
  un riferimento a "Metodo 29"). Lo dice esattamente quale parola, dove, e
  perché — si riscrive l'annuncio, non si aggira.
- **`advantage_audience` mancante**: non dovrebbe succedere sui blueprint
  già pronti (è verificato da `prova-a-secco.mjs`), ma se Meta lo rifiuta
  comunque, la correzione è nel `README.md` §3 ("Fallback advantage_audience").
- **"Consegna lead: NON verificata" / `(#200) Requires leads_retrieval`**:
  il modulo lead esiste ma i lead dentro non si leggono via API. Vedi
  "⚠️ Prima di tutto" in cima a questa pagina per le due vie d'uscita — non
  è un errore da ignorare o rilanciare: senza risolverlo, i lead raccolti
  da A/B (versioni native) andrebbero persi in silenzio.

Per qualunque altro dubbio, il comando `node stato_accessi.mjs` dà sempre
il verdetto aggiornato — "possiamo lanciare?" — con la lista esatta di cosa
manca ancora.
