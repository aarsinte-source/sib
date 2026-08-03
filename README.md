# SIB — SHEis Beauty International

Il sistema operativo di marketing e commerciale di SHEis Beauty International,
costruito da Alkemia.

## Cosa c'è dentro

| cartella | cos'è | dove gira |
|---|---|---|
| `studio/` | Il portale. Sette fasi, dall'analisi di mercato all'uscita | Vercel · [sheis-studio.vercel.app](https://sheis-studio.vercel.app) |
| `workers/` | L'esecutore della coda e i motori di ricerca, sintesi, pubblicazione | VPS (systemd) + portatile (solo creative) |
| `backend/` | Migrazioni del database, registro dei marchi, mappa delle fonti | — |
| `ads/` | Motore campagne Meta e i suoi guardrail | — |
| `outreach/` | Motore di contatto multicanale | — |

## Come sta in piedi

Il portale **non esegue** niente: accoda. Scrive una riga in `sheis_lavori` e
torna subito. L'esecutore prende il lavoro dove ci sono le credenziali.

È la separazione che permette al portale di stare su Vercel: una ricerca di
mercato completa impiega circa 105 secondi misurati, e una funzione serverless
muore molto prima.

**Chi esegue cosa**, e non è una scelta di comodo:

- **VPS** — ricerca di mercato, pubblicazione, campagne, diagnostica. Solo
  chiamate HTTP: gira anche a computer spento.
- **Portatile** — la sola generazione creativa. L'API di Higgsfield risponde
  `521` alle chiamate dal VPS: misurato il 2026-08-04 su IPv4 e IPv6, con le
  credenziali trasferite e il workspace selezionato. Non è autenticazione, è
  Cloudflare che tratta diversamente gli indirizzi da datacenter. Le
  generazioni restano in coda finché il portatile le raccoglie. Non falliscono,
  aspettano.

## Le regole che il codice fa rispettare

Non sono documentazione: sono file che i generatori devono obbedire e i linter
far rispettare, generati da **una sola fonte** in `backend/`.

- `marchi.json` — sei marchi, con i colori **misurati sui vettoriali** e non
  dedotti. Un marchio non si ridisegna mai: si compone il file.
- `BRAND-IDENTITY` — lessico, claim, numeri documentati. La regola sui numeri è
  rovesciata: qualunque cifra attaccata a una parola è un claim salvo prova
  contraria. Prima era un elenco di unità, e «28 lavaggi» passava da tutti e
  quattro i filtri.
- `fonti-ricerca.json` — chi interrogare, a che prezzo, e cosa **non** funziona.

## I segreti

Nessuno è qui dentro. Vivono nei `.env` locali, nelle variabili di Vercel e nel
`.env` del VPS. Le stringhe tipo `sb_secret_…` che compaiono nel testo sono il
*formato* di una chiave, non una chiave.
