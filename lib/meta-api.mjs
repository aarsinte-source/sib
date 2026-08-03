/**
 * Client minimo per la Graph API di Meta. Nessuna dipendenza esterna: usa
 * fetch nativo (Node >= 18). Condiviso da launch.mjs e campagna_da_brief.mjs.
 */
export const STATI_ACCOUNT = {
  1: 'ACTIVE', 2: 'DISABLED', 3: 'UNSETTLED', 7: 'PENDING_RISK_REVIEW',
  8: 'PENDING_SETTLEMENT', 9: 'IN_GRACE_PERIOD', 100: 'PENDING_CLOSURE',
  101: 'CLOSED', 201: 'ANY_ACTIVE', 202: 'ANY_CLOSED',
};

export function makeApi(config) {
  const versione = config.api_version || 'v21.0';
  const base = `https://graph.facebook.com/${versione}`;

  async function get(path, params = {}) {
    const url = new URL(`${base}/${path.replace(/^\//, '')}`);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    url.searchParams.set('access_token', config.access_token);

    const r = await fetch(url);
    const body = await r.json().catch(() => ({}));
    if (!r.ok) {
      const e = body.error || {};
      throw new Error(`GET ${path} → ${r.status} ${e.message || 'errore sconosciuto'}${e.error_user_msg ? ` — ${e.error_user_msg}` : ''}`);
    }
    return body;
  }

  async function post(path, params = {}) {
    const form = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined || v === null) continue;
      form.set(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
    }
    form.set('access_token', config.access_token);

    const r = await fetch(`${base}/${path.replace(/^\//, '')}`, { method: 'POST', body: form });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) {
      const e = body.error || {};
      const err = new Error(`POST ${path} → ${r.status} ${e.message || 'errore sconosciuto'}${e.error_user_msg ? ` — ${e.error_user_msg}` : ''}`);
      err.graph = e;
      throw err;
    }
    return body;
  }

  return { get, post, versione };
}

/** act_XXXX a partire da un ID con o senza prefisso. */
export function normalizzaAdAccountId(id) {
  return String(id).startsWith('act_') ? String(id) : `act_${id}`;
}
