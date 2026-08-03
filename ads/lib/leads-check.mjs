/**
 * Verifica ESEGUITA — non dichiarata — che i lead dei moduli istantanei Meta
 * siano davvero leggibili con questo token.
 *
 * Perché non basta guardare gli scope: `leads_retrieval` è un permesso
 * granulare legato all'oggetto (pagina/modulo) via Business Manager, non
 * sempre riflesso in modo affidabile nell'array `scopes` che ritorna
 * `debug_token` (quello che lib/preflight.mjs controlla già). Misurato il
 * 2026-08-03: un token System User con `ads_management`, `business_management`,
 * `pages_show_list`, `ads_read`, `pages_manage_ads` — MA SENZA
 * `leads_retrieval` — elenca i moduli lead senza problemi (`GET
 * /{page}/leadgen_forms` risponde 200) e poi fallisce SOLO al momento di
 * leggere i lead dentro (`GET /{form}/leads` → "(#200) Requires
 * leads_retrieval permission to manage the object"). Un controllo che si
 * fermasse a "il modulo esiste" avrebbe dato luce verde a un lancio che
 * raccoglie lead irraggiungibili — peggio di un lancio non fatto.
 *
 * Due modalità:
 *   - verificaLeadsSuModuli: prova DIRETTA sui moduli reali di SHEis, quando
 *     esistono (config.resolve.LEAD_FORM_ID:*).
 *   - verificaLeadsRetrievalGenerica: prova INDIRETTA, PRIMA che SHEis abbia
 *     un proprio modulo — usa un modulo qualsiasi già gestito da questo
 *     Business Manager come cartina di tornasole sulla capacità del TOKEN.
 *     Sempre dichiarata come proxy, mai spacciata per una prova su SHEis.
 */
import { makeApi } from './meta-api.mjs';

const RE_PERMESSO_MANCANTE = /leads_retrieval|\(#200\)|Requires leads_retrieval/i;

/** true se l'errore Graph indica specificamente il permesso mancante (non un altro problema). */
export function eErrorePermessoLeadsRetrieval(messaggioErrore) {
  return RE_PERMESSO_MANCANTE.test(String(messaggioErrore || ''));
}

/** Prova diretta: legge davvero /leads da uno o più moduli espliciti. */
export async function verificaLeadsSuModuli(api, formIds) {
  const risultati = [];
  for (const formId of formIds) {
    try {
      await api.get(`${formId}/leads`, { limit: 1 });
      risultati.push({ formId, ok: true, dettaglio: 'lead leggibili' });
    } catch (e) {
      risultati.push({ formId, ok: false, permessoMancante: eErrorePermessoLeadsRetrieval(e.message), dettaglio: e.message });
    }
  }
  return risultati;
}

/**
 * Prova indiretta: cerca un modulo lead qualsiasi tra le pagine che questo
 * token gestisce e prova a leggerne i lead. E' un PROXY sulla capacità del
 * token, non una prova sull'account SHEis (che oggi non ha ancora moduli).
 */
export async function verificaLeadsRetrievalGenerica(api, config, { maxPagine = 15, maxFormPerPagina = 5 } = {}) {
  let pagine;
  try {
    pagine = await api.get('me/accounts', { fields: 'id,name', limit: maxPagine });
  } catch (e) {
    return { verificabile: false, motivo: `me/accounts non raggiungibile: ${e.message}` };
  }

  const tentativi = [];
  for (const pagina of pagine.data || []) {
    // /leadgen_forms e /leads pretendono un token DI PAGINA, non il token
    // utente/System User diretto ("(#190) This method must be called with a
    // Page Access Token" — misurato il 2026-08-03): si ottiene con un giro in
    // piu' su /{page_id}?fields=access_token, poi si usa quello.
    let pageToken;
    try {
      const dettaglioPagina = await api.get(pagina.id, { fields: 'access_token' });
      pageToken = dettaglioPagina.access_token;
      if (!pageToken) { tentativi.push({ pagina: pagina.name, esito: 'nessun access_token di pagina disponibile per questo utente/token' }); continue; }
    } catch (e) {
      tentativi.push({ pagina: pagina.name, esito: `token di pagina non ottenibile: ${e.message}` });
      continue;
    }
    const apiPagina = makeApi({ ...config, access_token: pageToken });

    let forms;
    try {
      forms = await apiPagina.get(`${pagina.id}/leadgen_forms`, { fields: 'id,name,leads_count', limit: maxFormPerPagina });
    } catch (e) {
      tentativi.push({ pagina: pagina.name, esito: `leadgen_forms non elencabili: ${e.message}` });
      continue;
    }
    for (const form of forms.data || []) {
      try {
        await apiPagina.get(`${form.id}/leads`, { limit: 1 });
        return {
          verificabile: true, leadsRetrievalOk: true,
          pagina: pagina.name, formId: form.id, formNome: form.name,
          metodo: 'indiretto — modulo esistente di un\'altra pagina del Business Manager, NON di SHEis',
          tentativi,
        };
      } catch (e) {
        const permessoMancante = eErrorePermessoLeadsRetrieval(e.message);
        tentativi.push({ pagina: pagina.name, form: form.name, formId: form.id, esito: e.message });
        if (permessoMancante) {
          return {
            verificabile: true, leadsRetrievalOk: false,
            pagina: pagina.name, formId: form.id, formNome: form.name,
            metodo: 'indiretto — modulo esistente di un\'altra pagina del Business Manager, NON di SHEis',
            dettaglio: e.message, tentativi,
          };
        }
        // errore di altro tipo (es. modulo senza lead, permesso pagina): prova il prossimo
      }
    }
  }
  return { verificabile: false, motivo: 'nessun modulo lead trovato su nessuna pagina di questo token entro i limiti di ricerca', tentativi };
}

/**
 * Punto unico: dato config + i blueprint in gioco, dice se la consegna dei
 * lead nativi Meta è a rischio, ESEGUENDO un controllo vero — non solo
 * guardando che il modulo esista o che lo scope sia dichiarato.
 *
 * Rilevante SOLO per blueprint OUTCOME_LEADS con almeno un adset
 * destination_type "ON_AD" (modulo istantaneo nativo): un blueprint
 * OUTCOME_AWARENESS (C) o con destination_type "WEBSITE" non dipende da
 * questo permesso e non viene bloccato da questa funzione.
 */
export async function verificaConsegnaLead(config, blueprints) {
  const rilevanti = (blueprints || []).filter(
    (bp) => bp.campaign?.objective === 'OUTCOME_LEADS' && (bp.adsets || []).some((a) => a.destination_type === 'ON_AD')
  );
  if (!rilevanti.length) {
    return { rilevante: false, motivo: 'nessun blueprint in gioco usa moduli istantanei nativi (ON_AD) — questo controllo non si applica.' };
  }

  const api = makeApi(config);

  // 1) prova diretta sui moduli VERI di SHEis, se già risolti
  const formIdsDiretti = new Set();
  for (const bp of rilevanti) {
    for (const key of Object.keys(config.resolve || {})) {
      if (key.startsWith('LEAD_FORM_ID') && config.resolve[key]) formIdsDiretti.add(config.resolve[key]);
    }
  }
  if (formIdsDiretti.size) {
    const risultati = await verificaLeadsSuModuli(api, [...formIdsDiretti]);
    const ok = risultati.every((r) => r.ok);
    return { rilevante: true, verificabile: true, leadsRetrievalOk: ok, metodo: 'diretto — moduli reali di SHEis', risultati, blueprintCoinvolti: rilevanti.map((b) => b.id) };
  }

  // 2) SHEis non ha ancora moduli: proxy sulla capacità del token
  const proxy = await verificaLeadsRetrievalGenerica(api, config);
  return { rilevante: true, blueprintCoinvolti: rilevanti.map((b) => b.id), ...proxy };
}
