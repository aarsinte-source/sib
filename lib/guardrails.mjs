/**
 * Guardrail di brand SHEis — cablati, non opzionali, UNICA fonte di verita'.
 *
 * Fonte: .claude/skills/sheis-brand-core/SKILL.md §7, §8 e guardrails.json,
 * incrociata con clienti/sheis-beauty-aiconsult/data/BRAND-IDENTITY_sheis_2026-08-03.json
 * (sezione lessico.vietato_assoluto, misurata sul profilo reale).
 *
 * Questi termini non sono uno stile: il cliente ha rifiutato esplicitamente il
 * canale che rappresentano. Un annuncio che li contiene e' un danno verso la
 * rete di distributori, che e' l'unico canale di vendita che SHEis ha.
 *
 * Sia launch.mjs (blueprint statici) sia campagna_da_brief.mjs (campagne
 * generate a richiesta) importano da qui: un solo elenco, per non rischiare
 * che i due generatori derivino nel tempo (vedi memoria
 * feedback_agent_team_adjacent_drift — costruttori paralleli che duplicano
 * lo stesso gate e finiscono per non essere piu' identici).
 */
export const TERMINI_VIETATI = [
  // Conflitto di canale — "conoscendo il retroterra culturale dei parrucchieri
  // loro ti dicono: pero' quello e' un e-commerce" (6b6cc1a3 · 2:13:22)
  { re: /\bshop\b/i,                    perche: 'parola vietata: conflitto di canale coi parrucchieri. Usa "portale ordini" o "area riservata".' },
  { re: /\bnegoz(io|i)\b/i,             perche: 'parola vietata: conflitto di canale. Usa "portale ordini".' },
  { re: /\bcarrell[oi]\b/i,             perche: 'parola vietata: implica vendita diretta.' },
  { re: /\be-?commerce\b/i,             perche: 'parola vietata: e\' esattamente il modello che il cliente ha rifiutato.' },
  { re: /\bacquist[ao]\b|\bacquistare\b/i, perche: 'parola vietata: implica vendita al lettore.' },
  { re: /\bcheckout\b/i,                perche: 'parola vietata: implica vendita diretta.' },
  { re: /\btiend[ao]s?\b/i,             perche: 'parola vietata (ES): implica vendita diretta.' },
  { re: /\bcomprar\s+ahora\b|\bbuy\s+now\b|\badd\s+to\s+cart\b/i, perche: 'CTA da consumatore: il lettore e\' un imprenditore della distribuzione.' },
  { re: /\bcompr[ao]\b|\bcomprare\b/i,  perche: 'lessico da negozio (IT/ES "compra"): implica vendita al lettore — BRAND-IDENTITY §lessico.vietato_assoluto.' },
  { re: /\bordina\s+ora\b|\bordine\s+ora\b/i, perche: 'CTA da e-commerce vietata — BRAND-IDENTITY §regole_di_generazione.cta_vietate.' },
  { re: /\bcart\b|\bpanier\b|\bwarenkorb\b|\bkoszyk\b|\bloja\b/i, perche: 'lessico da negozio in altra lingua — BRAND-IDENTITY §lessico.vietato_assoluto.' },

  // Prezzi — "La discriminante e' il prezzo, se non sanno il prezzo
  // difficilmente fanno questa cosa" (6b6cc1a3 · 2:12:18)
  { re: /€/,                            perche: 'mai un prezzo o un simbolo di valuta in un annuncio SHEis.' },
  { re: /\b\d+[.,]\d{1,2}\s*(eur|euro|usd)\b/i, perche: 'importo in valuta nel testo pubblico: e\' un prezzo anche senza il simbolo.' },
  { re: /\beuros?\b/i,                  perche: 'mai riferimenti a valuta in un annuncio SHEis: il prezzo e\' la discriminante che fa scattare l\'obiezione del parrucchiere.' },
  { re: /\bprezz[oi]\b/i,               perche: 'mai prezzi al pubblico.' },
  { re: /\bprecios?\b/i,                perche: 'mai prezzi al pubblico (ES).' },
  { re: /\bpricing\b|\bprice\s?list\b/i, perche: 'mai prezzi al pubblico (EN).' },
  { re: /\blistin[oi]\b/i,              perche: 'il listino non e\' materiale pubblico.' },
  { re: /\bscont[oi]\b|\bdescuentos?\b|\bdiscounts?\b/i, perche: 'lo sconto del 75% e\' economics interna della rete, mai pubblica.' },
  { re: /\bpromo(zion[ei])?s?\b/i,      perche: 'lessico da saldo/promo — BRAND-IDENTITY §lessico.vietato_assoluto (prezzi_e_cifre_commerciali).' },
  { re: /\bsald[oi]\b|\boffert[ae]\b/i, perche: 'lessico da saldo/offerta commerciale — BRAND-IDENTITY §lessico.vietato_assoluto. Se si intende "un\'offerta B2B" (proposta commerciale), va riformulato senza questa parola: e\' ambigua con lo sconto al pubblico.' },

  // Firewall Metodo 29 — divieto assoluto e trasversale (guardrails.json §1)
  { re: /\bmetodo\s?29\b/i,             perche: 'FIREWALL M29: Metodo 29 non deve mai risultare collegato a SHEis. Un solo leak e\' un danno che non si ripara.' },
  { re: /\bm29\b/i,                     perche: 'FIREWALL M29: alias vietato.' },
];

// Solo i campi che finiscono davvero sotto gli occhi di un lettore.
// I metadati del blueprint (note, budget, kill_criteria) parlano di prezzi e
// sconti di proposito: sono per noi, non per il pubblico.
export const CAMPI_COPY = new Set(['message', 'name', 'description', 'caption', 'title', 'label', 'link']);

export function estraiContesto(testo, idx, raggio = 45) {
  const da = Math.max(0, idx - raggio);
  const a = Math.min(testo.length, idx + raggio);
  return `${da > 0 ? '…' : ''}${testo.slice(da, a).replace(/\n/g, ' ')}${a < testo.length ? '…' : ''}`;
}

/** Lint dei guardrail di brand su un blueprint (o su un oggetto campagna generato). */
export function lintCopy(blueprint) {
  const violazioni = [];

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

    for (const { re, perche } of TERMINI_VIETATI) {
      const m = nodo.match(re);
      if (m) violazioni.push({ percorso, trovato: m[0], perche, estratto: estraiContesto(nodo, m.index) });
    }
  };

  // Si lintano le creativita' e i moduli lead: e' li' che vive il testo pubblico.
  visita(blueprint.creatives ?? [], 'creatives');
  visita(blueprint.lead_form_spec ?? {}, 'lead_form_spec');
  return violazioni;
}
