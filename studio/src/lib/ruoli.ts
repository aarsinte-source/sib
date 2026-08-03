/**
 * Ruoli e matrice dei permessi — file client-safe (nessun "server-only",
 * nessuna dipendenza da next/headers). src/lib/auth.ts (server-only) importa
 * e ri-esporta questi stessi valori per il codice server; i componenti
 * client che devono solo CONOSCERE i ruoli (etichette, gating visivo)
 * importano da qui, non da auth.ts — altrimenti trascinerebbero
 * "server-only"/"next/headers" nel bundle browser (SPEC.md: "Nessun segreto
 * nel client" — e nessuna dipendenza server nel client, per lo stesso motivo).
 */

export type Ruolo = "mauro" | "marketing" | "dipendente";
export const RUOLI: readonly Ruolo[] = ["mauro", "marketing", "dipendente"];

export const RUOLO_LABEL: Record<Ruolo, string> = {
  mauro: "Mauro — tutto",
  marketing: "Marketing — approva e lancia",
  dipendente: "Dipendente — scrive e propone",
};

/** Chi può approvare/rifiutare contenuti, varianti, programmare e lanciare campagne. */
export const RUOLI_APPROVA: readonly Ruolo[] = ["mauro", "marketing"];
/** Chi può proporre/modificare contenuti (scrivere, caricare, rielaborare). */
export const RUOLI_PROPONE: readonly Ruolo[] = ["mauro", "marketing", "dipendente"];
/** Solo Mauro gestisce gli utenti. */
export const RUOLI_ADMIN: readonly Ruolo[] = ["mauro"];
