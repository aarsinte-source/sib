/**
 * Validazione di un blueprint (statico o generato da brief): placeholder non
 * risolti, advantage_audience obbligatorio, guardrail di brand, coerenza del
 * budget dichiarato. Un solo validatore per entrambi i generatori.
 */
import { C } from './ui.mjs';
import { lintCopy } from './guardrails.mjs';
import { trovaPlaceholder } from './placeholders.mjs';
import { GIORNI_MESE } from './budget.mjs';

export function validaBlueprint(bp, config) {
  const errori = [];
  const avvisi = [];

  // a) placeholder non risolti
  const placeholder = trovaPlaceholder(bp);
  const nonRisolti = [];
  for (const [key, dove] of placeholder) {
    if (config.resolve?.[key] === undefined) nonRisolti.push({ key, dove });
  }
  if (nonRisolti.length) {
    errori.push({
      tipo: 'PLACEHOLDER',
      dettaglio: nonRisolti.map((p) => `<<${p.key}>>  (${p.dove.length}x, es. ${p.dove[0]})`),
      spiegazione: 'Valori non ancora noti. Vanno messi in config.local.json → resolve. ' +
                   'Nessun valore viene inventato: un ID di interesse sbagliato spende soldi sul pubblico sbagliato.',
    });
  }

  // b) advantage_audience — la sua assenza fa fallire la creazione dell'adset
  for (const [i, adset] of (bp.adsets || []).entries()) {
    const t = adset.targeting || {};
    const val = t.targeting_automation?.advantage_audience ?? t.advantage_audience;
    if (val === undefined) {
      errori.push({
        tipo: 'ADVANTAGE_AUDIENCE',
        dettaglio: [`adsets[${i}] "${adset.name}" non dichiara advantage_audience`],
        spiegazione: 'Meta oggi rifiuta la creazione di un adset senza questo campo nel targeting. Va messo a 0 o 1, mai omesso.',
      });
    } else if (![0, 1].includes(Number(val))) {
      errori.push({ tipo: 'ADVANTAGE_AUDIENCE', dettaglio: [`adsets[${i}]: valore "${val}" non valido`], spiegazione: 'Ammessi solo 0 o 1.' });
    }
  }

  // c) guardrail di brand
  const violazioni = lintCopy(bp);
  if (violazioni.length) {
    errori.push({
      tipo: 'GUARDRAIL BRAND',
      dettaglio: violazioni.map((v) => `"${v.trovato}" in ${v.percorso}\n         ${C.dim}${v.estratto}${C.reset}\n         → ${v.perche}`),
      spiegazione: 'Regole non negoziabili di SHEis. Non aggirabili con un flag: se un annuncio le viola, si riscrive l\'annuncio.',
    });
  }

  // d) coerenza budget dichiarato / budget reale degli adset
  const centesimi = (bp.adsets || []).reduce((s, a) => s + (a.daily_budget_cents || 0), 0);
  const giornalieroReale = centesimi / 100;
  if (bp.budget?.daily_eur !== undefined && Math.abs(giornalieroReale - bp.budget.daily_eur) > 0.01) {
    avvisi.push(`budget.daily_eur dichiara ${bp.budget.daily_eur} ma la somma degli adset fa ${giornalieroReale.toFixed(2)}. Vale la somma degli adset.`);
  }

  // e) piu' di un adset a budget basso = garanzia di non imparare mai
  if ((bp.adsets || []).length > 1 && giornalieroReale < 50) {
    avvisi.push(`${bp.adsets.length} adset con ${giornalieroReale.toFixed(2)}/giorno complessivi: il budget si frammenta e nessun adset esce dall'apprendimento. A questi livelli si tiene UN adset solo.`);
  }

  return { errori, avvisi, giornalieroReale, mensileStimato: giornalieroReale * GIORNI_MESE };
}

/**
 * Un errore PLACEHOLDER e' bloccante SOLO se esistono davvero gli accessi
 * (config.local.json con access_token): altrimenti e' l'esito normale del
 * girare senza credenziali, e va mostrato come informazione, non come blocco.
 * Questa distinzione vive qui una volta sola: launch.mjs (validazione offline
 * vs online) e campagna_da_brief.mjs la applicano allo stesso modo.
 */
export function classificaErrori(errori, { accessiPresenti }) {
  const bloccanti = [];
  const informativi = [];
  for (const e of errori) {
    if (e.tipo === 'PLACEHOLDER' && !accessiPresenti) informativi.push(e);
    else bloccanti.push(e);
  }
  return { bloccanti, informativi };
}
