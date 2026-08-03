/**
 * Guardrail di brand SHEis — cablati, non opzionali.
 *
 * FONTE UNICA: legge le liste vietate direttamente da
 * clienti/sheis-beauty-aiconsult/data/BRAND-IDENTITY_sheis_2026-08-03.json,
 * invece di copiarle a mano. Prima dell'8 agosto 2026 questo file duplicava le
 * liste a mano: la BRAND-IDENTITY aveva gia' "carrinho" (PT) e "koszyk" (PL)
 * con una nota esplicita sul confronto per radice, ma questo linter non li
 * aveva mai ricopiati — "carrito" e "koszyka" passavano indisturbati, ed era
 * esattamente la divergenza silenziosa descritta in
 * feedback_agent_team_adjacent_drift (piu' costruttori paralleli che
 * duplicano lo stesso gate e finiscono per non essere piu' identici). Con la
 * lettura diretta del file, un termine aggiunto alla BRAND-IDENTITY arriva
 * qui senza un secondo intervento: sparisce la CAUSA, non solo il sintomo.
 *
 * Se il file non e' raggiungibile (macchina diversa, path spostato) si usa
 * uno snapshot integrato delle stesse liste, con un avviso esplicito
 * stampato su stderr: mai un fallback silenzioso (vedi memoria
 * feedback_degrado_silenzioso_va_dichiarato — il ripiego dichiara sempre il
 * motivo dove chi legge lo vede).
 *
 * Motore di confronto allineato a ~/alkemia-sheis-studio/src/lib/linter.ts:
 * confronto per RADICE, non per parola esatta. Misurato il 2026-08-03:
 * «koszyka» (genitivo polacco di «koszyk») sfuggiva a un confronto esatto
 * perche' le lingue slave declinano; il suffisso libero e' ammesso SOLO da 6
 * caratteri in su, altrimenti "cart" colpirebbe "cartella". Le variazioni
 * italiane/spagnole per accordo di genere/numero (prezzo/prezzi,
 * sconto/sconti...) non sono un suffisso appeso in coda — cambiano l'ultima
 * vocale — quindi il confronto per radice da solo non le copre: hanno una
 * piccola tabella dedicata (VARIANTI_ACCORDO) qui sotto, non un secondo
 * elenco parallelo.
 *
 * Aggiunta nuova rispetto a linter.ts: le regole 1-3 (prezzi, lessico da
 * negozio, firewall M29) qui sono declinate su ANNUNCI pubblicitari, non su
 * post editoriali — e un annuncio legittimo puo' dover DICHIARARE l'assenza
 * di un canale ("non siamo in vendita online, ne' su Amazon ne' su un
 * e-commerce nostro") usando proprio la parola vietata dentro una negazione.
 * Solo la categoria "canale" ammette questa eccezione: prezzi e firewall
 * restano assoluti, la negazione non li disinnesca mai (vedi README §3 —
 * "Non e' aggirabile con un flag").
 */
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

// ── fonte: BRAND-IDENTITY ---------------------------------------------------
const CANDIDATI_BRAND_IDENTITY = [
  process.env.SHEIS_BRAND_IDENTITY_PATH,
  join(homedir(), 'Desktop', 'ALKEMIA - AGENCY', 'scalers-plus', 'clienti', 'sheis-beauty-aiconsult', 'data', 'BRAND-IDENTITY_sheis_2026-08-03.json'),
].filter(Boolean);

// Rete di sicurezza se il file vero non e' raggiungibile (gira su un altro
// computer, il percorso e' cambiato, il Desktop e' su iCloud e non risponde).
//
// ⚠️ Fino al 3/8 queste liste erano ricopiate a mano qui dentro, e la copia era
// gia' rimasta indietro: mancavano «ordina», «buy» e «shopping», e il numero 83
// era in whitelist SOLO qui. Ora la rete di sicurezza arriva da vincoli-brand.mjs,
// che e' GENERATO dalla stessa fonte e vive nel repository — quindi non puo'
// invecchiare in silenzio: `sincronizza_brand.py --verifica` fallisce se diverge.
import {
  NEGOZIO as NEGOZIO_GENERATO,
  PREZZO as PREZZO_GENERATO,
  FIREWALL as FIREWALL_GENERATO,
  ECCEZIONI_RADICE,
  FORME_FLESSE,
  NEGAZIONI_AMMESSE,
  CLAIM_VIETATI,
  NUMERI_DOCUMENTATI as NUMERI_DA_FONTE,
  QUANTITA_GENERICA,
  numeroDocumentato,
} from './vincoli-brand.mjs';

const SNAPSHOT_FALLBACK = {
  prezzi_e_cifre_commerciali: PREZZO_GENERATO,
  // Le forme flesse entrano insieme ai lemmi: «sklepie» e «gekauft» non si
  // ricavano dalla radice, e passavano da qui indisturbate.
  lessico_da_negozio: [...NEGOZIO_GENERATO, ...FORME_FLESSE],
  firewall: FIREWALL_GENERATO,
};

function caricaListeVietate() {
  for (const percorso of CANDIDATI_BRAND_IDENTITY) {
    try {
      const dati = JSON.parse(readFileSync(percorso, 'utf8'));
      const v = dati?.lessico?.vietato_assoluto;
      if (v?.prezzi_e_cifre_commerciali?.length && v?.lessico_da_negozio?.length && v?.firewall?.length) {
        return {
          prezzi: v.prezzi_e_cifre_commerciali,
          // ⚠️ Le forme flesse vanno aggiunte ANCHE qui, non solo nel ripiego:
          // «sklepie» e «gekauft» non si ricavano dalla radice e nel percorso
          // normale passavano lo stesso.
          canale: [...v.lessico_da_negozio, ...(v.forme_flesse ?? FORME_FLESSE)],
          firewall: v.firewall,
          fonte: percorso,
        };
      }
    } catch {
      // prova il prossimo candidato
    }
  }
  console.error(
    `  \x1b[33mATTENZIONE\x1b[0m  lib/guardrails.mjs: BRAND-IDENTITY non raggiungibile ` +
    `(provati: ${CANDIDATI_BRAND_IDENTITY.join(' | ')}). Uso lo snapshot integrato del 2026-08-03: ` +
    `se la fonte e' cambiata da allora, questo linter e' disallineato. Imposta la variabile ` +
    `d'ambiente SHEIS_BRAND_IDENTITY_PATH per puntare al file vero.`
  );
  return {
    prezzi: SNAPSHOT_FALLBACK.prezzi_e_cifre_commerciali,
    canale: SNAPSHOT_FALLBACK.lessico_da_negozio,
    firewall: SNAPSHOT_FALLBACK.firewall,
    fonte: '(snapshot integrato — fallback, BRAND-IDENTITY non trovata)',
  };
}

const LISTE = caricaListeVietate();
/** Da dove vengono davvero le liste in questa run — utile a stato_accessi.mjs/test. */
export const FONTE_TERMINI = LISTE.fonte;

// Firewall M29: "M29" da solo non e' nella BRAND-IDENTITY ma e' un alias gia'
// noto altrove nel workspace. Il firewall e' l'unica categoria dove un
// doppio presidio (JSON + questa riga) e' voluto: non ammette eccezioni.
const ALIAS_FIREWALL_EXTRA = ['M29'];

// ── variazioni per accordo (IT/ES) non coperte dal confronto per radice -----
const VARIANTI_ACCORDO = {
  negozio: /\bnegozi(?:o)?\b/iu,
  prezzo: /\bprezz[oi]\b/iu,
  sconto: /\bscont[oi]\b/iu,
  listino: /\blistin[oi]\b/iu,
  offerta: /\boffert[ae]\b/iu,
  saldo: /\bsald[oi]\b/iu,
  carrello: /\bcarrell[oi]\b/iu,
  promo: /\bpromo(?:zion[ei])?\b/iu,
};

// ── negazioni che esentano SOLO la categoria "canale" ------------------------
const NEGAZIONI = [
  /\bnon\b/iu, /\bné\b/iu, /\bne'\b/iu, /\bnessun[oa]?\b/iu, /\bmai\b/iu,
  /\bno\b/iu, /\bnot\b/iu, /\bnever\b/iu, /\bni\b/iu, /\bsin\b/iu,
  /\baucun[e]?\b/iu, /\bpas\s+de\b/iu,
];

function confiniFrase(testo) {
  const confini = [];
  let inizio = 0;
  for (let i = 0; i < testo.length; i++) {
    if ('.!?\n'.includes(testo[i])) { confini.push([inizio, i]); inizio = i + 1; }
  }
  confini.push([inizio, testo.length]);
  return confini;
}

/** true se, nella STESSA frase e PRIMA del match, compare una negazione. */
function eNegatoNellaFrase(testo, idx) {
  const span = confiniFrase(testo).find(([a, b]) => idx >= a && idx <= b) ?? [0, testo.length];
  const primaDelMatch = testo.slice(span[0], idx);
  return NEGAZIONI.some((re) => re.test(primaDelMatch));
}

// ── motore di confronto per radice (allineato a linter.ts) ------------------
function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const ECCEZIONI_RE = ECCEZIONI_RADICE.length
  ? new RegExp(`^(${ECCEZIONI_RADICE.join('|')})$`, 'iu')
  : null;

/** Parola innocente che condivide solo la radice con un termine vietato. */
function eEccezioneDichiarata(frase) {
  return Boolean(ECCEZIONI_RE && ECCEZIONI_RE.test(frase.trim()));
}

function creaPattern(termine) {
  const chiave = termine.toLowerCase();
  if (VARIANTI_ACCORDO[chiave]) return VARIANTI_ACCORDO[chiave];

  // ⚠️ Il confine di parola `\b` è ASCII anche con la bandiera `u`: fra due
  // caratteri arabi non esiste, quindi «متجر» dentro «متجرنا» non veniva mai
  // trovato. Il confine ha senso solo per gli alfabeti latini.
  const haConfiniDiParola = /[A-Za-z0-9]/.test(termine);
  if (!haConfiniDiParola) return new RegExp(escapeRegExp(termine), 'giu');

  // Suffisso libero SOLO da 6 caratteri in su e senza spazi interni: sotto
  // quella soglia "cart" (4) prenderebbe "cartella", "loja" (4) "lojas" e
  // basta, ma anche parole innocue piu' lunghe per caso.
  const ammettiSuffisso = termine.length >= 6 && !termine.includes(' ');
  return ammettiSuffisso
    ? new RegExp(`\\b${escapeRegExp(termine)}\\p{L}{0,3}\\b`, 'giu')
    : new RegExp(`\\b${escapeRegExp(termine)}\\b`, 'giu');
}

// ── spiegazioni: specifiche dove servono, generiche altrimenti --------------
const SPIEGAZIONI_SPECIFICHE = {
  '€': 'mai un prezzo o un simbolo di valuta in un annuncio SHEis.',
  euro: "mai riferimenti a valuta in un annuncio SHEis: il prezzo e' la discriminante che fa scattare l'obiezione del parrucchiere (6b6cc1a3 · 2:12:18).",
  prezzo: "mai prezzi al pubblico — 'La discriminante e' il prezzo' (6b6cc1a3 · 2:12:18).",
  listino: "il listino non e' materiale pubblico.",
  sconto: "lo sconto (75% alla rete) e' economics interna della rete, mai pubblica.",
  offerta: "lessico da saldo/offerta commerciale, ambiguo con lo sconto al pubblico anche quando si intende una proposta B2B: va riformulato senza questa parola.",
  promo: 'lessico da saldo/promo.',
  saldo: 'lessico da saldo.',
  shop: 'parola vietata: conflitto di canale coi parrucchieri — "conoscendo il retroterra culturale dei parrucchieri loro ti dicono: pero\' quello e\' un e-commerce" (6b6cc1a3 · 2:13:22). Usa "portale ordini" o "area riservata".',
  negozio: 'parola vietata: conflitto di canale. Usa "portale ordini".',
  carrello: 'parola vietata: implica vendita diretta.',
  'e-commerce': "parola vietata: e' esattamente il modello che il cliente ha rifiutato.",
  ecommerce: "parola vietata: e' esattamente il modello che il cliente ha rifiutato.",
  checkout: 'parola vietata: implica vendita diretta.',
  acquista: 'parola vietata: implica vendita al lettore.',
  acquistare: 'parola vietata: implica vendita al lettore.',
  compra: 'lessico da negozio: implica vendita al lettore.',
  comprare: 'lessico da negozio: implica vendita al lettore.',
  tienda: '(ES) implica vendita diretta.',
  carrito: '(ES) lessico da negozio.',
  cesta: '(ES) lessico da negozio.',
  comprar: '(ES) implica vendita al lettore.',
  cart: '(EN) lessico da negozio.',
  'metodo 29': "FIREWALL M29: Metodo 29 non deve mai risultare collegato a SHEis. Un solo leak e' un danno che non si ripara.",
  metodo29: 'FIREWALL M29: alias vietato.',
  'method 29': 'FIREWALL M29: alias vietato (EN).',
  m29: 'FIREWALL M29: alias vietato.',
};

function spiegazione(categoria, termine) {
  const specifica = SPIEGAZIONI_SPECIFICHE[termine.toLowerCase()];
  if (specifica) return specifica;
  if (categoria === 'firewall') return `FIREWALL M29: "${termine}" e' un alias/variante vietata — divieto assoluto e trasversale, in ogni lingua e parafrasi.`;
  if (categoria === 'prezzi') return `mai prezzi o cifre commerciali al pubblico ("${termine}") — BRAND-IDENTITY §lessico.vietato_assoluto.prezzi_e_cifre_commerciali.`;
  return `lessico da negozio/e-commerce ("${termine}") — il cliente ha rifiutato la vendita diretta, e' un danno verso la rete di distributori. BRAND-IDENTITY §lessico.vietato_assoluto.lessico_da_negozio.`;
}

export function estraiContesto(testo, idx, raggio = 45) {
  const da = Math.max(0, idx - raggio);
  const a = Math.min(testo.length, idx + raggio);
  return `${da > 0 ? '…' : ''}${testo.slice(da, a).replace(/\n/g, ' ')}${a < testo.length ? '…' : ''}`;
}

function cercaTermini(testo, termini, { categoria, esentaSeNegato = false }) {
  const violazioni = [];
  const esenzioni = [];
  for (const termine of termini) {
    if (!termine) continue;
    const pattern = creaPattern(termine);
    pattern.lastIndex = 0;
    const m = pattern.exec(testo);
    if (!m) continue;
    // La parola trovata e' innocente e condivide solo la radice col termine
    // vietato? («ordinario» non e' «ordina».) Le eccezioni sono dichiarate
    // nella fonte, non sepolte qui — cosi' valgono per tutti e quattro i filtri.
    if (eEccezioneDichiarata(m[0])) continue;
    if (esentaSeNegato && eNegatoNellaFrase(testo, m.index)) {
      esenzioni.push({ trovato: m[0], categoria, estratto: estraiContesto(testo, m.index) });
      continue;
    }
    violazioni.push({ trovato: m[0], categoria, perche: spiegazione(categoria, termine), estratto: estraiContesto(testo, m.index) });
  }
  return { violazioni, esenzioni };
}

// ── regola 4: claim numerici non documentati ---------------------------------
// ⚠️ Difetto misurato il 3/8: la whitelist era un insieme di NUMERI NUDI
// (15, 83, 99, 3) senza contesto — quindi "99% di sconto" e "15 anni di
// esperienza" passavano di qui e venivano bloccati dagli altri tre filtri.
// A decidere dev'essere il contesto, non la cifra: "99% di origine naturale"
// e' un dato del cliente, "99% di sconto" e' un prezzo.
// ⚠️ Il `\b` finale NON può applicarsi al «%»: misurato il 3/8 su questo
// stesso file. «%» non è un carattere di parola, quindi «97% naturale»
// (spazio dopo) non produce alcun confine e sfuggiva — mentre
// «97%naturale», che nessuno scrive, veniva preso. È lo STESSO errore di
// forma già corretto nel filtro dello Studio: qui era rimasto.
// «97%» è il caso più pericoloso di tutti: plausibile e vicino al vero (99%).
// ⚠️ REGOLA ROVESCIATA — 2026-08-04.
// Prima l'unita' doveva stare in un ELENCO. Il piano editoriale ha prodotto
// «28 lavaggi» — un dato di prodotto inventato — ed e' passato da TUTTI e
// quattro i filtri, perche' «lavaggi» non c'era. Un elenco di unita' e' per
// costruzione incompleto: ogni unita' nuova e' un claim che passa, e ce ne si
// accorge solo dopo la pubblicazione. In un annuncio A PAGAMENTO, dopo la
// pubblicazione significa dopo aver speso.
//
// Ora vale il contrario: qualunque cifra attaccata a una parola e' un claim,
// salvo i numeri documentati col loro contesto e salvo le eccezioni dichiarate
// nella fonte. La percentuale resta a parte perche' puo' chiudere la frase.
const UNITA_NUMERICHE = new RegExp(
  `(?:\\b(\\d+(?:[.,]\\d+)?)\\s*(%|percento|per\\s*cento|por\\s*ciento|percent))|(?:${QUANTITA_GENERICA.pattern ?? "\\b\\d{1,4}\\s+[A-Za-z\u00c0-\u00ff]{3,}"})`,
  'giu',
);
const ECCEZIONI_QUANTITA = (QUANTITA_GENERICA.eccezioni_contesto ?? []).map(
  (e) => new RegExp(e.pattern, 'iu'),
);
/** La frase attorno alla cifra: le eccezioni valgono nella frase, non nel testo intero. */
function fraseAttorno(s, i, len) {
  const inizio = Math.max(0, ...['.', '\n', '!', '?'].map((c) => s.lastIndexOf(c, i) + 1));
  const fini = ['.', '\n', '!', '?'].map((c) => s.indexOf(c, i + len)).filter((x) => x >= 0);
  return s.slice(inizio, fini.length ? Math.min(...fini) : s.length);
}

const ELENCO_DOCUMENTATI = NUMERI_DA_FONTE.map((n) => n.valore).join(', ');

function checkNumeriNonDocumentati(testo) {
  const violazioni = [];
  UNITA_NUMERICHE.lastIndex = 0;
  let m;
  while ((m = UNITA_NUMERICHE.exec(testo)) !== null) {
    if (numeroDocumentato(testo, m.index, m.index + m[0].length)) continue;
    // «ne parliamo in venti minuti» e' la durata di una call, non un dato
    // di prodotto: falso positivo gia' pagato una volta.
    if (ECCEZIONI_QUANTITA.some((r) => r.test(fraseAttorno(testo, m.index, m[0].length)))) continue;
    violazioni.push({
      trovato: m[0],
      categoria: 'numero_non_documentato',
      perche: `"${m[0]}" non e' fra i dati documentati (${ELENCO_DOCUMENTATI}) — BRAND-IDENTITY §regole_di_generazione.numeri_documentati. Non basta la cifra: serve anche il contesto giusto ("99% di origine naturale" si', "99% di sconto" no). Marca [DA CONFERMARE] o rimuovi.`,
      estratto: estraiContesto(testo, m.index),
    });
  }
  return violazioni;
}

// ── regola 5: claim non dimostrabili ----------------------------------------
// ⚠️ Assente fino al 3/8: questo filtro non aveva NESSUNA regola sui claim.
// «Risultati garantiti», «clinicamente provata», «il migliore del mercato»
// entravano in un annuncio a pagamento senza che nulla li fermasse — e sono
// esattamente le affermazioni che il cliente non puo' dimostrare e che Meta
// stessa rifiuta. Le forme vengono dalla fonte, uguali agli altri tre filtri.
function checkClaimNonDimostrabili(testo) {
  const violazioni = [];
  for (const { pattern, cosa } of CLAIM_VIETATI) {
    const re = new RegExp(pattern, 'giu');
    const m = re.exec(testo);
    if (!m) continue;
    violazioni.push({
      trovato: m[0],
      categoria: 'claim_non_dimostrabile',
      perche: `${cosa} — riformula su un dato documentato o marca [DA CONFERMARE].`,
      estratto: estraiContesto(testo, m.index),
    });
  }
  return violazioni;
}

// firewall — parafrasi/numero vicino a "metodo" (allineato a linter.ts checkFirewallM29)
function checkFirewallProssimita(testo) {
  const euristiche = [
    /\bventinove\w*\b[^.!?]{0,40}\bmetodo\b/giu,
    /\bmetodo\b[^.!?]{0,40}\bventinove\w*\b/giu,
    /\b29\b[^.!?]{0,30}\bmetodo\b/giu,
    /\bmetodo\b[^.!?]{0,30}\b29\b/giu,
  ];
  for (const pattern of euristiche) {
    pattern.lastIndex = 0;
    const m = pattern.exec(testo);
    if (m) {
      return [{
        trovato: m[0],
        categoria: 'firewall_parafrasi',
        perche: 'FIREWALL M29: formulazione che permette di ricostruire il collegamento (numero/parafrasi vicino a "metodo") — bloccata per prudenza, verifica a mano.',
        estratto: estraiContesto(testo, m.index),
      }];
    }
  }
  return [];
}

function lintaStringa(testo) {
  const violazioni = [];
  const esenzioni = [];

  const prezzi = cercaTermini(testo, LISTE.prezzi, { categoria: 'prezzi', esentaSeNegato: false });
  violazioni.push(...prezzi.violazioni);

  const canale = cercaTermini(testo, LISTE.canale, { categoria: 'canale', esentaSeNegato: true });
  violazioni.push(...canale.violazioni);
  esenzioni.push(...canale.esenzioni);

  const firewall = cercaTermini(testo, [...LISTE.firewall, ...ALIAS_FIREWALL_EXTRA], { categoria: 'firewall', esentaSeNegato: false });
  violazioni.push(...firewall.violazioni);
  violazioni.push(...checkFirewallProssimita(testo));

  violazioni.push(...checkNumeriNonDocumentati(testo));
  violazioni.push(...checkClaimNonDimostrabili(testo));

  return { violazioni, esenzioni };
}

// Solo i campi che finiscono davvero sotto gli occhi di un lettore.
// I metadati del blueprint (note, budget, kill_criteria) parlano di prezzi e
// sconti di proposito: sono per noi, non per il pubblico.
export const CAMPI_COPY = new Set(['message', 'name', 'description', 'caption', 'title', 'label', 'link']);

/**
 * Lint dei guardrail di brand su un blueprint (o su un oggetto campagna
 * generato). Ritorna sia le violazioni (bloccanti) sia le esenzioni per
 * negazione (non bloccanti, ma mostrate: mai un'eccezione silenziosa).
 */
export function lintCopyDettagliato(blueprint) {
  const violazioni = [];
  const esenzioni = [];

  const visita = (nodo, percorso) => {
    if (nodo == null) return;
    if (Array.isArray(nodo)) {
      nodo.forEach((v, i) => visita(v, `${percorso}[${i}]`));
      return;
    }
    if (typeof nodo === 'object') {
      for (const [k, v] of Object.entries(nodo)) visita(v, `${percorso}.${k}`);
      return;
    }
    if (typeof nodo !== 'string') return;

    const chiave = percorso.split('.').pop().replace(/\[\d+\]$/, '');
    if (!CAMPI_COPY.has(chiave)) return;

    const esito = lintaStringa(nodo);
    for (const v of esito.violazioni) violazioni.push({ percorso, ...v });
    for (const e of esito.esenzioni) esenzioni.push({ percorso, ...e });
  };

  // Si lintano le creativita' e i moduli lead: e' li' che vive il testo pubblico.
  visita(blueprint.creatives ?? [], 'creatives');
  visita(blueprint.lead_form_spec ?? {}, 'lead_form_spec');
  return { violazioni, esenzioni };
}

/** Compatibilita': solo le violazioni bloccanti (usato da lib/validate.mjs). */
export function lintCopy(blueprint) {
  return lintCopyDettagliato(blueprint).violazioni;
}

/** Lint di una stringa grezza, fuori da un blueprint — usato dai test e da attiva.mjs/prova-a-secco.mjs. */
export function lintTesto(testo) {
  return lintaStringa(String(testo ?? ''));
}
