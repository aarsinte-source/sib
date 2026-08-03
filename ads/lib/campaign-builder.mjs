/**
 * Clona un blueprint scelto e lo personalizza coi segnali del brief: budget,
 * calendario, nome campagna, creativita' collegata. Non chiama mai la rete:
 * produce solo l'oggetto campagna e il payload che PARTIREBBE, per essere
 * ispezionato prima che qualcuno prema un bottone.
 */
import { buildPayload } from './payload-builder.mjs';
import { validaBlueprint, classificaErrori } from './validate.mjs';
import { GIORNI_MESE } from './budget.mjs';

function oggiISO(offsetGiorni = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetGiorni);
  return d.toISOString().slice(0, 10);
}

/**
 * Trova, dentro il blueprint, la creativita' (e il suo annuncio) che meglio
 * corrisponde al brand del brief. Priorita' a una creativita' DEDICATA (il
 * brand compare nel suo nome, es. "babilon-99") rispetto a una che lo cita
 * solo di sfuggita nel testo (es. un annuncio che elenca tutte e tre le
 * linee): altrimenti il primo annuncio della lista vince sempre per caso,
 * solo perche' nomina il brand en passant.
 */
function trovaCreativePerBrand(bp, brand) {
  if (!brand) return null;
  const chiave = brand.toLowerCase().replace(/\s+/g, '');
  const creatives = bp.creatives || [];

  const dedicata = creatives.find((c) => c.name.toLowerCase().replace(/\s+/g, '').includes(chiave));
  if (dedicata) return dedicata;

  const citataDiSfuggita = creatives.find((c) => JSON.stringify(c.object_story_spec).toLowerCase().includes(chiave));
  return citataDiSfuggita ?? null;
}

/**
 * @param {object} bp - blueprint scelto (JSON gia' parsato, NON mutato).
 * @param {object} segnali - risultato di analizzaBrief().
 * @param {object} opts - { creativeRefForzato, config } config = config.local.json se esiste, altrimenti {}.
 */
export function costruisciCampagna(bp, segnali, opts = {}) {
  const config = opts.config || {};
  const note = [];
  const campagna = JSON.parse(JSON.stringify(bp)); // clone profondo, il blueprint originale resta intatto

  // ── budget e calendario ────────────────────────────────────────────────
  const budgetOriginaleGiorno = (bp.adsets || []).reduce((s, a) => s + (a.daily_budget_cents || 0), 0) / 100;
  let dailyEur = segnali.budget.dailyEur;
  let durataGiorni = segnali.budget.durataGiorni;

  if (dailyEur == null) {
    dailyEur = budgetOriginaleGiorno;
    note.push(`Budget giornaliero non specificato nel brief: uso il default del blueprint (${budgetOriginaleGiorno.toFixed(2)} EUR/giorno). Verifica con chi ha scritto il brief.`);
  } else {
    note.push(`Budget giornaliero dal brief: ${dailyEur.toFixed(2)} EUR/giorno.`);
  }
  if (durataGiorni == null) {
    durataGiorni = Math.round(GIORNI_MESE); // ipotesi prudente: un mese, se il brief non dice altro
    note.push(`Durata non specificata nel brief: ipotizzato 1 mese (${durataGiorni} giorni) in assenza di indicazioni. Verifica con chi ha scritto il brief.`);
  } else {
    note.push(`Durata dal brief: ${durataGiorni} giorni.`);
  }

  const multiplo = budgetOriginaleGiorno > 0 ? dailyEur / budgetOriginaleGiorno : 1;
  for (const adset of campagna.adsets || []) {
    const originale = adset.daily_budget_cents || 0;
    adset.daily_budget_cents = Math.round(originale * multiplo);
  }
  const giornalieroReale = (campagna.adsets || []).reduce((s, a) => s + (a.daily_budget_cents || 0), 0) / 100;
  const totaleEur = giornalieroReale * durataGiorni;

  campagna.budget = {
    ...campagna.budget,
    daily_eur: giornalieroReale,
    monthly_eur_est: giornalieroReale * GIORNI_MESE,
  };
  campagna.piano_calendario = {
    inizio: oggiISO(0),
    fine: oggiISO(durataGiorni),
    durata_giorni: durataGiorni,
    budget_totale_periodo_eur: Math.round(totaleEur * 100) / 100,
    nota: 'Calendario proposto dal brief. La campagna nasce comunque in PAUSA: la finestra si applica quando un umano la accende.',
  };

  // ── nome campagna ───────────────────────────────────────────────────────
  const oggi = oggiISO(0);
  const brandSlug = segnali.brand ? ` | ${segnali.brand}` : '';
  campagna.campaign = {
    ...campagna.campaign,
    name: `${campagna.campaign.name.split(' | 2026')[0]}${brandSlug} | DA-BRIEF | ${oggi}`,
  };

  // ── creativita' collegata ───────────────────────────────────────────────
  let creativeScelta = null;
  if (opts.creativeRefForzato) {
    creativeScelta = (campagna.creatives || []).find((c) => c.ref === opts.creativeRefForzato) ?? null;
    if (creativeScelta) note.push(`Creativita' indicata esplicitamente: ${opts.creativeRefForzato}.`);
    else note.push(`Creativita' indicata (${opts.creativeRefForzato}) non trovata nel blueprint: mantenute tutte le creativita' del blueprint, verificare a mano.`);
  } else if (segnali.creativeRef.tipo === 'ref_blueprint') {
    creativeScelta = (campagna.creatives || []).find((c) => c.ref === segnali.creativeRef.ref) ?? null;
    if (creativeScelta) note.push(`Creativita' citata nel brief (${segnali.creativeRef.ref}) trovata ed usata.`);
  }
  if (!creativeScelta && segnali.brand) {
    creativeScelta = trovaCreativePerBrand(campagna, segnali.brand);
    if (creativeScelta) {
      note.push(
        `Il brief dice "${segnali.creativeRef.match || 'usa questo contenuto'}" ma non allega un asset risolvibile: ` +
        `ho selezionato la creativita' gia' approvata piu' affine al brand citato (${creativeScelta.ref} — ${creativeScelta.name}). ` +
        `Sostituiscila se chi ha scritto il brief intendeva un asset diverso.`
      );
    }
  }
  if (creativeScelta) {
    const adCollegato = (campagna.ads || []).filter((ad) => ad.creative_ref === creativeScelta.ref);
    campagna.creatives = [creativeScelta];
    campagna.ads = adCollegato;
  } else if (segnali.creativeRef.tipo === 'dichiarato_ma_non_risolvibile' || segnali.creativeRef.tipo === 'file') {
    note.push(
      `Il brief riferisce un contenuto ("${segnali.creativeRef.match}") che questo tool non sa risolvere in automatico ` +
      `(nessun brand riconosciuto per selezionare una creativita' equivalente). Mantenute TUTTE le creativita' del blueprint: ` +
      `chi revisiona deve scegliere quella giusta o fornire l'asset nuovo.`
    );
  } else {
    note.push('Nessuna creativita\' specifica indicata nel brief: mantenute tutte le creativita\' del blueprint scelto.');
  }

  // ── validazione (stesso motore di launch.mjs: un solo gate) ─────────────
  const { errori, avvisi } = validaBlueprint(campagna, config);
  const accessiPresenti = Boolean(config.access_token);
  const { bloccanti, informativi } = classificaErrori(errori, { accessiPresenti });

  // ── payload esatto ───────────────────────────────────────────────────────
  const payload = buildPayload(campagna);

  return {
    campagna,
    note,
    validazione: { bloccanti, informativi, avvisi, accessiPresenti },
    payload,
    riepilogoBudget: { dailyEur: giornalieroReale, totalEur: totaleEur, durataGiorni },
  };
}
