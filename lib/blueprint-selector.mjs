/**
 * Sceglie, fra i blueprint esistenti, quello piu' adatto ai segnali estratti
 * dal brief — e spiega il PERCHE' con un punteggio scomposto criterio per
 * criterio, cosi' chi legge puo' vedere dove il match e' forte e dove e'
 * debole, e dissentire su un singolo criterio invece che sul verdetto finale.
 *
 * Non inventa un blueprint nuovo: se nessuno dei tre copre bene il brief
 * (punteggio sotto SOGLIA_MATCH_MINIMO), lo dichiara e si ferma — coerente
 * col resto del kit, che non inventa ID ne' targeting.
 */
export const SOGLIA_MATCH_MINIMO = 50;

// Metadati dei 3 blueprint, derivati dai file stessi (non duplicati a mano:
// vedi estraiMetadatiBlueprint). Servono a confrontarli coi segnali del brief.
export function estraiMetadatiBlueprint(bp) {
  return {
    id: bp.id,
    label: bp.label,
    paese: bp.adsets?.[0]?.targeting?.geo_locations?.countries?.[0] ?? null,
    segmento: bp.audience_segment ?? null, // 'rete' | 'mercato'
    objective: bp.campaign?.objective ?? null,
    language: bp.language ?? null,
    priority: bp.priority ?? null,
    prioritySource: bp.priority_source ?? null,
    creativeRefs: (bp.creatives || []).map((c) => c.ref),
    // Nomi (non i ref generici "CR-A2"): sono loro a portare il brand nel
    // titolo quando una creativita' e' dedicata (es. "babilon-99").
    creativeNames: (bp.creatives || []).map((c) => c.name),
  };
}

/** Punteggio 0-100 di un blueprint rispetto ai segnali del brief, con motivazione riga per riga. */
export function punteggiaBlueprint(meta, segnali) {
  const criteri = [];
  let punteggio = 0;

  // paese — peso 40
  if (segnali.paese) {
    const match = meta.paese === segnali.paese;
    criteri.push({
      criterio: 'paese', peso: 40, match,
      brief: `${segnali.paese} (da "${segnali.paeseMatch}")`,
      blueprint: meta.paese ?? '—',
    });
    if (match) punteggio += 40;
  } else {
    criteri.push({ criterio: 'paese', peso: 40, match: null, brief: 'non specificato nel brief', blueprint: meta.paese ?? '—' });
  }

  // segmento pubblico — peso 30
  if (segnali.segmento) {
    const match = meta.segmento === segnali.segmento
      || (segnali.segmento === 'saloni' && meta.id === 'C-saloni-awareness');
    criteri.push({
      criterio: 'segmento pubblico', peso: 30, match,
      brief: `${segnali.segmento} (da "${segnali.segmentoMatch}")`,
      blueprint: meta.segmento ?? '—',
    });
    if (match) punteggio += 30;
  } else {
    criteri.push({ criterio: 'segmento pubblico', peso: 30, match: null, brief: 'non specificato nel brief', blueprint: meta.segmento ?? '—' });
  }

  // obiettivo — peso 20
  if (segnali.objective) {
    const match = meta.objective === segnali.objective;
    criteri.push({
      criterio: 'obiettivo', peso: 20, match,
      brief: `${segnali.objective} (da "${segnali.objectiveMatch}", ${segnali.objectiveFonte})`,
      blueprint: meta.objective ?? '—',
    });
    if (match) punteggio += 20;
  } else {
    criteri.push({ criterio: 'obiettivo', peso: 20, match: null, brief: 'non specificato nel brief', blueprint: meta.objective ?? '—' });
  }

  // brand — peso 10 (bonus: il blueprint ha gia' una creativita' DEDICATA a quel brand,
  // cioe' il brand compare nel NOME della creativita', non solo citato di sfuggita nel testo)
  if (segnali.brand) {
    const chiaveBrand = segnali.brand.toLowerCase().replace(/\s+/g, '');
    const haCreativePerBrand = meta.creativeNames.some((n) => n.toLowerCase().replace(/\s+/g, '').includes(chiaveBrand));
    criteri.push({
      criterio: 'brand con creativita\' pronta', peso: 10, match: haCreativePerBrand,
      brief: segnali.brand,
      blueprint: meta.creativeRefs.join(', ') || '—',
    });
    if (haCreativePerBrand) punteggio += 10;
  } else {
    criteri.push({ criterio: 'brand con creativita\' pronta', peso: 10, match: null, brief: 'non specificato nel brief', blueprint: meta.creativeRefs.join(', ') || '—' });
  }

  return { blueprintId: meta.id, punteggio, criteri };
}

/**
 * @param {object[]} blueprints - blueprint gia' caricati (JSON parsati).
 * @param {object} segnali - risultato di analizzaBrief().
 */
export function scegliBlueprint(blueprints, segnali) {
  const valutazioni = blueprints
    .map((bp) => estraiMetadatiBlueprint(bp))
    .map((meta) => ({ meta, ...punteggiaBlueprint(meta, segnali) }))
    .sort((a, b) => b.punteggio - a.punteggio);

  const migliore = valutazioni[0];
  const scelto = migliore && migliore.punteggio >= SOGLIA_MATCH_MINIMO ? migliore : null;

  return {
    scelto: scelto ? { id: scelto.blueprintId, punteggio: scelto.punteggio, criteri: scelto.criteri } : null,
    classifica: valutazioni.map((v) => ({ id: v.blueprintId, punteggio: v.punteggio, criteri: v.criteri })),
    sogliaMinima: SOGLIA_MATCH_MINIMO,
  };
}
