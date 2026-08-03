/**
 * Placeholder <<TOKEN>> -> config.resolve[TOKEN].
 * Usato sia dai blueprint statici (launch.mjs) sia dalle campagne generate a
 * richiesta (campagna_da_brief.mjs): stesso formato, stessa risoluzione.
 */
export const RE_PLACEHOLDER = /<<([^>]+)>>/g;

export function trovaPlaceholder(nodo, percorso = '$', acc = new Map()) {
  if (nodo == null) return acc;
  if (Array.isArray(nodo)) {
    nodo.forEach((v, i) => trovaPlaceholder(v, `${percorso}[${i}]`, acc));
  } else if (typeof nodo === 'object') {
    for (const [k, v] of Object.entries(nodo)) trovaPlaceholder(v, `${percorso}.${k}`, acc);
  } else if (typeof nodo === 'string') {
    for (const m of nodo.matchAll(RE_PLACEHOLDER)) {
      if (!acc.has(m[1])) acc.set(m[1], []);
      acc.get(m[1]).push(percorso);
    }
  }
  return acc;
}

export function risolvi(nodo, mappa) {
  if (nodo == null) return nodo;
  if (Array.isArray(nodo)) return nodo.map((v) => risolvi(v, mappa));
  if (typeof nodo === 'object') {
    return Object.fromEntries(Object.entries(nodo).map(([k, v]) => [k, risolvi(v, mappa)]));
  }
  if (typeof nodo === 'string') {
    return nodo.replace(RE_PLACEHOLDER, (intero, key) => (mappa[key] !== undefined ? String(mappa[key]) : intero));
  }
  return nodo;
}
