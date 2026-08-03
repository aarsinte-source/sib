/**
 * Parser del brief in linguaggio naturale del responsabile marketing.
 *
 * Deliberatamente NON usa un LLM: e' una serie di regole trasparenti, ognuna
 * annotata col frammento di testo che l'ha fatta scattare. Cosi' chi legge il
 * risultato puo' vedere ESATTAMENTE perche' il sistema ha capito quel che ha
 * capito, e dissentire su una singola regola invece che su una scatola nera.
 * Coerente con lo spirito del resto del kit (launch.mjs): niente magia,
 * niente valori inventati — se il brief non dice una cosa, il campo resta
 * vuoto e viene segnalato, non indovinato.
 */

const NUMERI_ITALIANI = {
  un: 1, uno: 1, una: 1, due: 2, tre: 3, quattro: 4, cinque: 5,
  sei: 6, sette: 7, otto: 8, nove: 9, dieci: 10, undici: 11, dodici: 12,
};

function numeroDaTesto(token) {
  const pulito = token.trim().toLowerCase();
  if (/^\d+([.,]\d+)?$/.test(pulito)) return parseFloat(pulito.replace(',', '.'));
  return NUMERI_ITALIANI[pulito] ?? null;
}

/** Estrae brand SHEis citati nel brief. */
function estraiBrand(testo) {
  const trovati = [];
  if (/\bbabilon\b/i.test(testo)) trovati.push({ brand: 'BABILON', match: testo.match(/\bbabilon\b/i)[0] });
  if (/\byounic\b/i.test(testo)) trovati.push({ brand: 'YOUNIC', match: testo.match(/\byounic\b/i)[0] });
  if (/\bsheis\s*color\b/i.test(testo) || /\bcolore\b/i.test(testo)) {
    const m = testo.match(/\bsheis\s*color\b/i) || testo.match(/\bcolore\b/i);
    trovati.push({ brand: 'SHEis Color', match: m[0] });
  }
  return trovati;
}

/** Paese / geografia. Ritorna { paese: 'ES'|'IT'|null, match }. */
function estraiPaese(testo) {
  if (/\bspagn[ao]l[ai]?\b|\bspagna\b|\bspain\b|\bespañ|\bespana\b/i.test(testo)) {
    return { paese: 'ES', match: testo.match(/\bspagn[ao]l[ai]?\b|\bspagna\b|\bspain\b|\bespañ\w*|\bespana\b/i)[0] };
  }
  if (/\bitalian[oi]\b|\bitalia\b(?!no della rete)/i.test(testo)) {
    return { paese: 'IT', match: testo.match(/\bitalian[oi]\b|\bitalia\b/i)[0] };
  }
  return { paese: null, match: null };
}

/** Segmento di pubblico: rete (distributori/importatori) vs saloni/mercato. */
function estraiSegmento(testo) {
  if (/\bsalon[ei]\b|\bparrucchier[ei]\b|\bhairdresser\b/i.test(testo)) {
    return { segmento: 'saloni', match: testo.match(/\bsalon[ei]\b|\bparrucchier[ei]\b|\bhairdresser\b/i)[0] };
  }
  if (/\bdistributor[ei]\b|\bimportador[ei]\b|\bimportatori\b|\bdistribuzione\b|\bdistribucion\b/i.test(testo)) {
    return { segmento: 'rete', match: testo.match(/\bdistributor[ei]\b|\bimportador[ei]\b|\bimportatori\b|\bdistribuzione\b|\bdistribucion\b/i)[0] };
  }
  return { segmento: null, match: null };
}

/**
 * Obiettivo. Priorita': una riga esplicita "Obiettivo: ..." vince su ogni
 * altro segnale nel resto del testo (e' il segnale piu' forte che il
 * richiedente puo' dare).
 */
/**
 * Il segnale è NEGATO nel testo?
 *
 * ⚠️ Difetto misurato il 3/8 su un brief scritto come li scrive una persona:
 * «voglio farmi conoscere, NON raccogliere contatti». Il parser vedeva
 * «contatti», dichiarava OUTCOME_LEADS e costruiva la campagna sbagliata —
 * esattamente l'opposto di quello che era stato chiesto, e con l'aria di aver
 * capito benissimo (stampava pure il match che l'aveva convinto).
 *
 * In italiano il modo naturale di precisare un obiettivo è dire anche cosa NON
 * si vuole. Un parser che ignora la negazione non è approssimativo: è
 * fiducioso al contrario.
 */
const NEGAZIONI = /\b(non|senza|niente|nessun[ao]?|no)\b/i;

function eNegato(testo, indice) {
  // Si guarda indietro fino all'inizio della frase o della proposizione: una
  // negazione conta se sta PRIMA del segnale e nella stessa frase.
  const inizioFrase = Math.max(
    testo.lastIndexOf('.', indice), testo.lastIndexOf('!', indice),
    testo.lastIndexOf('?', indice), testo.lastIndexOf('\n', indice), -1,
  );
  const prima = testo.slice(inizioFrase + 1, indice);
  // Solo le ultime parole contano: «non voglio X, e poi voglio Y» non deve far
  // sembrare negato anche Y.
  const vicine = prima.split(/[,;]/).pop() ?? prima;
  return NEGAZIONI.test(vicine);
}

/** Cerca il primo match NON negato di un'espressione. */
function cercaNonNegato(testo, regex) {
  const globale = new RegExp(regex.source, regex.flags.includes('g') ? regex.flags : regex.flags + 'g');
  let m;
  while ((m = globale.exec(testo)) !== null) {
    if (!eNegato(testo, m.index)) return m[0];
  }
  return null;
}

const RE_LEADS = /\brichieste? di contatto\b|\bcontatt[oi]\b|\blead\b|\bprenotazion[ei]\b|\biscrizion[ei]\b|\bmi contatt\w*/i;

// ⚠️ `\b` dopo una lettera accentata NON combacia mai: «à» non è un carattere
// di parola per il motore delle espressioni regolari, quindi fra «à» e la
// virgola non c'è alcun confine da trovare. Risultato misurato il 3/8:
// «Voglio visibilità, senza raccogliere lead» non veniva riconosciuto come
// campagna di notorietà, e l'obiettivo restava vuoto. È lo stesso errore di
// forma già pagato sul «%» nel filtro di marca: si intercetta il caso da
// manuale e sfugge quello che una persona scrive davvero.
// `(?![\p{L}])` con la bandiera `u` fa il lavoro che `\b` non sa fare qui.
const RE_AWARENESS = new RegExp(
  '\\bfa(?:r|re|rmi|rti|rci|rvi|rlo|rla|rli|rle)\\s+conoscere(?![\\p{L}])' +
  '|\\bconoscenza(?![\\p{L}])' +
  '|\\bawareness(?![\\p{L}])' +
  '|\\bvisibilit[aà](?![\\p{L}])' +
  '|\\bnotoriet[aà](?![\\p{L}])',
  'iu',
);

function estraiObiettivo(testo) {
  const rigaEsplicita = testo.match(/obiettivo\s*[:\-]\s*(.+)/i) || testo.match(/(?:scopo|goal)\s*[:\-]\s*(.+)/i);
  const daAnalizzare = rigaEsplicita ? rigaEsplicita[1] : testo;
  const fonte = rigaEsplicita ? `riga esplicita "Obiettivo:"` : 'nessuna riga "Obiettivo:" esplicita, analizzato il testo intero';

  const leads = cercaNonNegato(daAnalizzare, RE_LEADS);
  if (leads) {
    return { objective: 'OUTCOME_LEADS', match: leads, fonte };
  }
  // "far/fare conoscere" copriva la forma piana ma non quella riflessiva —
  // "farmi conoscere ai parrucchieri" e' come un responsabile marketing scrive
  // davvero, e prima di questa correzione (misurato con prova-a-secco.mjs)
  // restava non riconosciuta: objective=null abbassava il punteggio del
  // blueprint C sotto la soglia minima senza un vero motivo di contenuto.
  const awareness = cercaNonNegato(daAnalizzare, RE_AWARENESS);
  if (awareness) {
    return { objective: 'OUTCOME_AWARENESS', match: awareness, fonte };
  }
  const traffico = cercaNonNegato(daAnalizzare, /\btraffico\b|\bvisite\s+al\s+sito\b/i);
  if (traffico) {
    return { objective: 'OUTCOME_TRAFFIC', match: traffico, fonte };
  }
  return { objective: null, match: null, fonte };
}

/** Budget giornaliero, totale, durata in giorni. */
function estraiBudget(testo) {
  const risultato = { dailyEur: null, totalEur: null, durataGiorni: null, note: [] };

  const mGiorno = testo.match(/(\d+(?:[.,]\d+)?)\s*(?:€|eur|euro)?\s*(?:al\s+giorno|\/\s*giorno|giornalier[oi])/i)
    || testo.match(/(?:budget\s*[:\-]?\s*)(\d+(?:[.,]\d+)?)\s*(?:€|eur|euro)\s*(?:al\s+giorno)?/i);
  if (mGiorno) {
    risultato.dailyEur = parseFloat(mGiorno[1].replace(',', '.'));
    risultato.note.push(`budget giornaliero letto da "${mGiorno[0]}"`);
  }

  const mTotale = testo.match(/(\d+(?:[.,]\d+)?)\s*(?:€|eur|euro)\s*(?:al\s+mese|\/\s*mese|mensil[ei]|total[ei]|in\s+totale|complessiv[oi])/i);
  if (mTotale) {
    risultato.totalEur = parseFloat(mTotale[1].replace(',', '.'));
    risultato.note.push(`budget totale/mensile letto da "${mTotale[0]}"`);
  }

  const mDurata = testo.match(/(\d+|un|uno|una|due|tre|quattro|cinque|sei|sette|otto|nove|dieci)\s*(settiman[ae]|mes[ei]|giorni|gg)\b/i);
  if (mDurata) {
    const n = numeroDaTesto(mDurata[1]);
    const unita = mDurata[2].toLowerCase();
    if (n != null) {
      if (unita.startsWith('settiman')) risultato.durataGiorni = n * 7;
      else if (unita.startsWith('mes')) risultato.durataGiorni = Math.round(n * 30.4);
      else risultato.durataGiorni = n; // giorni/gg
      risultato.note.push(`durata letta da "${mDurata[0]}" (${risultato.durataGiorni} giorni)`);
    }
  }

  // completa i due valori mancanti se possibile
  if (risultato.dailyEur == null && risultato.totalEur != null && risultato.durataGiorni) {
    risultato.dailyEur = risultato.totalEur / risultato.durataGiorni;
    risultato.note.push(`daily derivato: ${risultato.totalEur} / ${risultato.durataGiorni}gg`);
  }
  if (risultato.totalEur == null && risultato.dailyEur != null && risultato.durataGiorni) {
    risultato.totalEur = risultato.dailyEur * risultato.durataGiorni;
    risultato.note.push(`totale derivato: ${risultato.dailyEur} × ${risultato.durataGiorni}gg`);
  }

  return risultato;
}

/** Riferimento esplicito a una creativita' gia' pronta (ref CR-XX o percorso file). */
function estraiCreativeRef(testo) {
  const mRef = testo.match(/\bCR-[A-Z]\d\b/);
  if (mRef) return { ref: mRef[0], tipo: 'ref_blueprint', match: mRef[0] };

  const mFile = testo.match(/[\w\-./]+\.(jpe?g|png|mp4|mov)\b/i);
  if (mFile) return { ref: mFile[0], tipo: 'file', match: mFile[0] };

  const RE_DICHIARA_CONTENUTO = /\busa\s+quest[oa]\s+contenut[oi]\b|\busa\s+quest[ae]\s+creativit[aà]\b|\ballegat[oi]\b/i;
  const dichiaraContenuto = RE_DICHIARA_CONTENUTO.test(testo);
  if (dichiaraContenuto) return { ref: null, tipo: 'dichiarato_ma_non_risolvibile', match: testo.match(RE_DICHIARA_CONTENUTO)[0] };

  return { ref: null, tipo: 'assente', match: null };
}

/**
 * Analizza un brief in linguaggio naturale e ritorna i segnali estratti +
 * il testo grezzo. Non decide nulla da solo: chi chiama (blueprint-selector,
 * campaign-builder) usa questi segnali con le proprie regole, sempre citando
 * cosa li ha fatti scattare.
 */
export function analizzaBrief(testoGrezzo) {
  const testo = String(testoGrezzo || '').trim();
  if (!testo) throw new Error('Brief vuoto: niente da analizzare.');

  const brand = estraiBrand(testo);
  const geo = estraiPaese(testo);
  const segmento = estraiSegmento(testo);
  const obiettivo = estraiObiettivo(testo);
  const budget = estraiBudget(testo);
  const creativeRef = estraiCreativeRef(testo);

  return {
    testoGrezzo: testo,
    brand: brand[0]?.brand ?? null,
    brandMatches: brand,
    paese: geo.paese,
    paeseMatch: geo.match,
    segmento: segmento.segmento,
    segmentoMatch: segmento.match,
    objective: obiettivo.objective,
    objectiveMatch: obiettivo.match,
    objectiveFonte: obiettivo.fonte,
    budget,
    creativeRef,
  };
}
