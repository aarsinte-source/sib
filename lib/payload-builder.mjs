/**
 * Costruisce il payload ESATTO che verrebbe inviato alla Graph API per un
 * blueprint (campagna + adset + creativita' + annunci) — e separatamente lo
 * esegue davvero. Le due cose sono divise apposta: buildPayload() e' pura
 * (nessuna rete, nessun effetto), cosi' sia launch.mjs (quando crea davvero)
 * sia campagna_da_brief.mjs (quando mostra "il payload che partirebbe" in
 * simulazione) usano la STESSA funzione. Non possono disallinearsi perche'
 * sono la stessa funzione.
 */
import { ok, warn } from './ui.mjs';

/** Toglie dal targeting i campi di documentazione: Meta rifiuta le chiavi che non conosce. */
export function pulisciTargeting(t) {
  const fuori = new Set([
    'geo_note', 'age_note', 'interests_source', 'positions_note',
    'advantage_audience_note', 'custom_audiences_optional',
  ]);
  const out = {};
  for (const [k, v] of Object.entries(t)) {
    if (fuori.has(k) || k.endsWith('_note')) continue;
    if (Array.isArray(v)) {
      out[k] = v.map((el) => (el && typeof el === 'object' ? pulisciOggetto(el) : el));
    } else if (v && typeof v === 'object') {
      out[k] = pulisciOggetto(v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

function pulisciOggetto(o) {
  if (Array.isArray(o)) return o.map((el) => (el && typeof el === 'object' ? pulisciOggetto(el) : el));
  const out = {};
  for (const [k, v] of Object.entries(o)) {
    if (k === 'note' || k.endsWith('_note')) continue;
    out[k] = v && typeof v === 'object' ? pulisciOggetto(v) : v;
  }
  return out;
}

/**
 * Costruisce (senza chiamare la rete) i payload esatti per campagna, adset,
 * creativita' e annunci di un blueprint gia' risolto (placeholder sostituiti,
 * o ancora coi placeholder se e' una simulazione senza accessi).
 */
export function buildPayload(bp) {
  const campaign = {
    name: bp.campaign.name,
    objective: bp.campaign.objective,
    status: 'PAUSED', // sempre. Non negoziabile.
    buying_type: bp.campaign.buying_type || 'AUCTION',
    special_ad_categories: bp.campaign.special_ad_categories || [],
    ...(bp.campaign.campaign_budget_optimization ? { bid_strategy: bp.campaign.bid_strategy } : {}),
  };

  const adsets = (bp.adsets || []).map((a) => ({
    name: a.name,
    payload: {
      name: a.name,
      daily_budget: a.daily_budget_cents,
      billing_event: a.billing_event,
      optimization_goal: a.optimization_goal,
      bid_strategy: bp.campaign.bid_strategy || 'LOWEST_COST_WITHOUT_CAP',
      targeting: pulisciTargeting(a.targeting),
      status: 'PAUSED',
      ...(a.destination_type ? { destination_type: a.destination_type } : {}),
      ...(a.promoted_object ? { promoted_object: a.promoted_object } : {}),
      ...(a.frequency_control_specs ? { frequency_control_specs: a.frequency_control_specs } : {}),
      // campaign_id viene aggiunto solo in esecuzione, quando la campagna
      // reale esiste e ha un id: qui e' un placeholder esplicito, non un dato
      // inventato.
      campaign_id: '<<ID_CAMPAGNA_CREATA_IN_QUESTO_STESSO_RUN>>',
    },
  }));

  const creatives = (bp.creatives || []).map((c) => ({
    ref: c.ref,
    name: c.name,
    payload: {
      name: c.name,
      object_story_spec: c.object_story_spec,
    },
  }));

  const ads = (bp.ads || []).map((ad) => ({
    name: ad.name,
    adset_ref: ad.adset_ref,
    creative_ref: ad.creative_ref,
    payload: {
      name: ad.name,
      adset_id: '<<ID_ADSET_CREATO_IN_QUESTO_STESSO_RUN — ref: ' + ad.adset_ref + '>>',
      creative: { creative_id: '<<ID_CREATIVITA_CREATA_IN_QUESTO_STESSO_RUN — ref: ' + ad.creative_ref + '>>' },
      status: 'PAUSED',
    },
  }));

  return { blueprintId: bp.id, campaign, adsets, creatives, ads };
}

/** Esegue davvero (POST) un payload gia' costruito. Effetti collaterali: rete + log. */
export async function executePayload(api, actId, built) {
  const creati = { blueprint: built.blueprintId, campaign: null, adsets: [], creatives: [], ads: [] };

  const campagna = await api.post(`${actId}/campaigns`, built.campaign);
  creati.campaign = campagna.id;
  ok(`Campagna creata: ${campagna.id} — ${built.campaign.name}`);

  const mappaAdset = new Map();
  for (const a of built.adsets) {
    const { campaign_id, ...resto } = a.payload;
    const adset = await api.post(`${actId}/adsets`, { ...resto, campaign_id: campagna.id });
    mappaAdset.set(a.name, adset.id);
    creati.adsets.push({ id: adset.id, name: a.name });
    ok(`  Adset creato: ${adset.id} — ${a.name}`);
  }

  const mappaCreative = new Map();
  for (const c of built.creatives) {
    const creative = await api.post(`${actId}/adcreatives`, c.payload);
    mappaCreative.set(c.ref, creative.id);
    creati.creatives.push({ id: creative.id, ref: c.ref });
    ok(`  Creativita' creata: ${creative.id} — ${c.name}`);
  }

  for (const ad of built.ads) {
    const adsetId = mappaAdset.get(ad.adset_ref);
    const creativeId = mappaCreative.get(ad.creative_ref);
    if (!adsetId || !creativeId) {
      warn(`  Annuncio "${ad.name}" saltato: riferimento non risolto (adset=${adsetId ?? 'assente'}, creative=${creativeId ?? 'assente'}).`);
      continue;
    }
    const creato = await api.post(`${actId}/ads`, {
      name: ad.name,
      adset_id: adsetId,
      creative: { creative_id: creativeId },
      status: 'PAUSED',
    });
    creati.ads.push({ id: creato.id, name: ad.name });
    ok(`  Annuncio creato: ${creato.id} — ${ad.name}`);
  }

  return creati;
}
