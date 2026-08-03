/**
 * Costanti di costo Higgsfield — client-safe (nessun "server-only", nessun
 * env server). src/lib/higgsfield.ts (server-only) importa e ri-esporta
 * questi valori per il codice server; i componenti client che devono solo
 * MOSTRARE il costo (gate di costo in UI) importano da qui.
 */

export const COSTO_EUR_PER_CREDITO = 0.033;

export type QualitaImmagine = "2k_high" | "1k_low";

export const CREDITI_PER_VARIANTE: Record<QualitaImmagine, number> = {
  "2k_high": 7, // default gpt_image_2, misurato
  "1k_low": 0.5, // economico, misurato — ×14 più economico del default
};

export const QUALITA_LABEL: Record<QualitaImmagine, string> = {
  "2k_high": "2K alta qualità (default) — 7 crediti/immagine",
  "1k_low": "1K economico — 0,5 crediti/immagine",
};

export function costoStimato(
  qualita: QualitaImmagine,
  numeroVarianti = 3,
): { crediti: number; eur: number } {
  const crediti = CREDITI_PER_VARIANTE[qualita] * numeroVarianti;
  return { crediti, eur: Math.round(crediti * COSTO_EUR_PER_CREDITO * 100) / 100 };
}
