import "server-only";
import { sbFetch, SchemaNotInitializedError } from "@/lib/supabase";
import type { Brand, Canale, Formato, Lingua, Pubblico } from "@/lib/brand";
import type { Ruolo } from "@/lib/auth";

/**
 * L'UNICO punto che parla col database (SPEC.md §Architettura). Ogni pagina e
 * ogni route API passa da qui — mai una fetch a Supabase altrove. Le funzioni
 * non nascondono MAI SchemaNotInitializedError: la lasciano risalire, così il
 * chiamante (route/pagina) può dichiararla all'utente invece di un 500 muto.
 */

export { SchemaNotInitializedError };

/* -------------------------------------------------------------- tipi riga */

export type StatoContenuto =
  | "in_attesa"
  | "approvato"
  | "modificato"
  | "scartato"
  | "in_produzione"
  | "prodotto"
  | "programmato"
  | "pubblicato"
  | "errore";

export type Contenuto = {
  id: string;
  piano_id: string | null;
  data_pubblicazione: string | null;
  canale: Canale;
  brand: Brand;
  pubblico: Pubblico | null;
  lingua: Lingua;
  lingua_secondaria: Lingua | null;
  formato: Formato;
  angolo: string;
  hook: string;
  copy: string;
  copy_secondario: string | null;
  cta: string;
  hashtag: string[] | null;
  asset_path: string | null;
  prompt_creativo: string | null;
  nota_interna: string | null;
  variante_scelta_id: string | null;
  ora_pubblicazione: string | null;
  stato: StatoContenuto;
  feedback_mauro: string | null;
  creato_da: string | null;
  created_at: string;
  updated_at: string;
};

export type StatoVariante = "da_generare" | "in_corso" | "pronta" | "approvata" | "scartata" | "errore";

export type Variante = {
  id: string;
  contenuto_id: string;
  indice: number;
  prompt: string;
  angolo_visivo: string | null;
  asset_url: string | null;
  asset_path: string | null;
  provider: string | null;
  costo_crediti: number | null;
  costo_eur: number | null;
  stato: StatoVariante;
  errore: string | null;
  generata_il: string | null;
  created_at: string;
};

export type Piano = {
  id: string;
  titolo: string;
  periodo_da: string | null;
  periodo_a: string | null;
  stato: "attivo" | "archiviato";
  created_at: string;
};

export type AzioneLog =
  | "approvato"
  | "modificato"
  | "scartato"
  | "riaperto"
  | "variante_approvata"
  | "variante_scartata"
  | "programmato"
  | "pubblicato"
  | "pubblicazione_fallita";

export type Utente = {
  id: string;
  email: string;
  nome: string;
  ruolo: Ruolo;
  attivo: boolean;
  pwd_hash: string | null;
  ultimo_accesso: string | null;
  created_at: string;
};

export type StatoPubblicazione = "in_coda" | "inviato" | "pubblicato" | "fallito" | "bloccato";

export type Pubblicazione = {
  id: string;
  contenuto_id: string;
  canale: Canale;
  programmato_per: string | null;
  stato: StatoPubblicazione;
  motivo_blocco: string | null;
  zernio_post_id: string | null;
  linter_esito: unknown;
  tentativi: number;
  ultimo_errore: string | null;
  created_at: string;
  updated_at: string;
};

export type Campagna = {
  id: string;
  nome: string;
  obiettivo: string | null;
  pubblico: string | null;
  brand: string | null;
  budget_giorno: number | null;
  budget_totale: number | null;
  contenuto_id: string | null;
  blueprint: string | null;
  stato: "bozza" | "pronta" | "bloccata" | "attiva" | "in_pausa" | "conclusa";
  motivo_blocco: string | null;
  meta_campaign_id: string | null;
  payload: unknown;
  richiesta_da: string | null;
  created_at: string;
  updated_at: string;
};

export type Articolo = {
  id: string;
  slug: string;
  lingua: string;
  titolo: string;
  sommario: string | null;
  blocchi: unknown[];
  copertina_url: string | null;
  seo: unknown;
  stato: "bozza" | "in_revisione" | "pubblicato" | "archiviato";
  fonte_lingua: string | null;
  autore_id: string | null;
  pubblicato_il: string | null;
  created_at: string;
  updated_at: string;
};

export type Candidato = {
  id: string;
  username: string;
  nome: string | null;
  bio: string | null;
  follower: number | null;
  citta: string | null;
  zona: string | null;
  tipo: "salone" | "distributore" | "non_pertinente" | "incerto" | null;
  tipo_motivo: string | null;
  score: number | null;
  hook: string | null;
  hook_fonte: string | null;
  email: string | null;
  scoperto_da: string | null;
  stato: "nuovo" | "promosso" | "scartato" | "in_sequenza" | "risposto";
  created_at: string;
};

export type Report = {
  id: string;
  tipo: "settimanale" | "mensile";
  periodo_da: string;
  periodo_a: string;
  organico: unknown;
  pubblicitario: unknown;
  outreach: unknown;
  canali_spenti: string[] | null;
  markdown: string | null;
  inviato_il: string | null;
  esiti_invio: unknown;
  created_at: string;
};

/* --------------------------------------------------------------- piano */

export async function creaPiano(titolo: string, giorni = 21): Promise<Piano> {
  const oggi = new Date();
  const fine = new Date(oggi.getTime() + giorni * 86_400_000);
  const [riga] = await sbFetch<Piano[]>("sheis_piani", {
    method: "POST",
    prefer: "return=representation",
    body: [
      {
        titolo,
        periodo_da: oggi.toISOString().slice(0, 10),
        periodo_a: fine.toISOString().slice(0, 10),
        stato: "attivo",
      },
    ],
  });
  return riga;
}

export type NuovoContenuto = Omit<
  Contenuto,
  "id" | "created_at" | "updated_at" | "asset_path" | "prompt_creativo" | "nota_interna" | "variante_scelta_id" | "ora_pubblicazione" | "feedback_mauro"
>;

export async function creaContenuti(righe: NuovoContenuto[]): Promise<Contenuto[]> {
  if (righe.length === 0) return [];
  return sbFetch<Contenuto[]>("sheis_contenuti", {
    method: "POST",
    prefer: "return=representation",
    body: righe,
  });
}

export async function listaContenuti(filtro?: { stato?: StatoContenuto; pianoId?: string }): Promise<Contenuto[]> {
  const parti = ["select=*", "order=created_at.desc"];
  if (filtro?.stato) parti.push(`stato=eq.${filtro.stato}`);
  if (filtro?.pianoId) parti.push(`piano_id=eq.${filtro.pianoId}`);
  return sbFetch<Contenuto[]>("sheis_contenuti", { query: parti.join("&") });
}

export async function getContenuto(id: string): Promise<Contenuto | null> {
  const righe = await sbFetch<Contenuto[]>("sheis_contenuti", {
    query: `select=*&id=eq.${id}&limit=1`,
  });
  return righe[0] ?? null;
}

async function patchContenuto(id: string, patch: Partial<Contenuto>): Promise<Contenuto> {
  const [riga] = await sbFetch<Contenuto[]>("sheis_contenuti", {
    method: "PATCH",
    query: `id=eq.${id}`,
    prefer: "return=representation",
    body: patch,
  });
  return riga;
}

/* ---------------------------------------------------------------- log */

export async function scriviLog(input: {
  contenutoId: string;
  azione: AzioneLog;
  attore: string;
  attoreId?: string;
  note?: string;
  dettaglio?: unknown;
}): Promise<void> {
  await sbFetch("sheis_approvazioni_log", {
    method: "POST",
    prefer: "return=minimal",
    body: [
      {
        contenuto_id: input.contenutoId,
        azione: input.azione,
        attore: input.attore,
        attore_id: input.attoreId ?? null,
        note: input.note ?? null,
        dettaglio: input.dettaglio ?? null,
      },
    ],
  });
}

export async function logDiContenuto(contenutoId: string): Promise<
  { id: string; contenuto_id: string; azione: AzioneLog; attore: string; note: string | null; dettaglio: unknown; created_at: string }[]
> {
  return sbFetch("sheis_approvazioni_log", {
    query: `select=*&contenuto_id=eq.${contenutoId}&order=created_at.desc`,
  });
}

/* -------------------------------------------------- azioni sul contenuto */

export async function approvaContenuto(id: string, attore: string, attoreId: string): Promise<Contenuto> {
  const aggiornato = await patchContenuto(id, { stato: "approvato" });
  await scriviLog({ contenutoId: id, azione: "approvato", attore, attoreId });
  return aggiornato;
}

export async function rifiutaContenuto(id: string, attore: string, attoreId: string, nota?: string): Promise<Contenuto> {
  const aggiornato = await patchContenuto(id, { stato: "scartato", feedback_mauro: nota ?? null });
  await scriviLog({ contenutoId: id, azione: "scartato", attore, attoreId, note: nota });
  return aggiornato;
}

/** Riapre un contenuto scartato, per poterlo rilavorare. */
export async function riapriContenuto(id: string, attore: string, attoreId: string): Promise<Contenuto> {
  const aggiornato = await patchContenuto(id, { stato: "in_attesa" });
  await scriviLog({ contenutoId: id, azione: "riaperto", attore, attoreId });
  return aggiornato;
}

/** Editing MANUALE dei campi — la cosa che oggi non esiste da nessuna parte e che il responsabile marketing userà di più. */
export async function modificaContenutoManuale(
  id: string,
  campi: Partial<Pick<Contenuto, "angolo" | "hook" | "copy" | "copy_secondario" | "cta" | "hashtag" | "canale" | "brand" | "pubblico" | "lingua" | "lingua_secondaria" | "formato" | "data_pubblicazione">>,
  attore: string,
  attoreId: string,
): Promise<Contenuto> {
  const aggiornato = await patchContenuto(id, { ...campi, stato: "modificato" });
  await scriviLog({
    contenutoId: id,
    azione: "modificato",
    attore,
    attoreId,
    dettaglio: { tipo: "manuale", campi: Object.keys(campi) },
  });
  return aggiornato;
}

/** Riscrittura guidata dall'AI su nota — l'altra metà di "modifica". */
export async function modificaContenutoAI(
  id: string,
  campi: Pick<Contenuto, "angolo" | "hook" | "copy" | "copy_secondario" | "cta">,
  nota: string,
  attore: string,
  attoreId: string,
): Promise<Contenuto> {
  const aggiornato = await patchContenuto(id, { ...campi, stato: "modificato" });
  await scriviLog({
    contenutoId: id,
    azione: "modificato",
    attore,
    attoreId,
    note: nota,
    dettaglio: { tipo: "ai_su_nota" },
  });
  return aggiornato;
}

/* -------------------------------------------------------------- varianti */

export async function creaVarianti(
  contenutoId: string,
  varianti: { indice: number; prompt: string; angoloVisivo: string; provider: string }[],
): Promise<Variante[]> {
  return sbFetch<Variante[]>("sheis_varianti", {
    method: "POST",
    prefer: "return=representation",
    body: varianti.map((v) => ({
      contenuto_id: contenutoId,
      indice: v.indice,
      prompt: v.prompt,
      angolo_visivo: v.angoloVisivo,
      provider: v.provider,
      stato: "da_generare" as StatoVariante,
    })),
  });
}

export async function listaVarianti(contenutoId: string): Promise<Variante[]> {
  return sbFetch<Variante[]>("sheis_varianti", {
    query: `select=*&contenuto_id=eq.${contenutoId}&order=indice.asc`,
  });
}

export async function aggiornaVariante(id: string, patch: Partial<Variante>): Promise<Variante> {
  const [riga] = await sbFetch<Variante[]>("sheis_varianti", {
    method: "PATCH",
    query: `id=eq.${id}`,
    prefer: "return=representation",
    body: patch,
  });
  return riga;
}

export async function approvaVariante(varianteId: string, contenutoId: string, attore: string, attoreId: string): Promise<void> {
  await aggiornaVariante(varianteId, { stato: "approvata" });
  await patchContenuto(contenutoId, { variante_scelta_id: varianteId, stato: "prodotto" });
  await scriviLog({ contenutoId, azione: "variante_approvata", attore, attoreId, dettaglio: { varianteId } });
}

export async function scartaVariante(varianteId: string, contenutoId: string, attore: string, attoreId: string): Promise<void> {
  await aggiornaVariante(varianteId, { stato: "scartata" });
  await scriviLog({ contenutoId, azione: "variante_scartata", attore, attoreId, dettaglio: { varianteId } });
}

/* ------------------------------------------------------------ calendario */

export async function metteInCoda(input: {
  contenutoId: string;
  canale: Canale;
  quando: string;
  linterEsito: unknown;
}): Promise<Pubblicazione> {
  const [riga] = await sbFetch<Pubblicazione[]>("sheis_pubblicazioni", {
    method: "POST",
    prefer: "return=representation",
    body: [
      {
        contenuto_id: input.contenutoId,
        canale: input.canale,
        programmato_per: input.quando,
        stato: "in_coda" as StatoPubblicazione,
        linter_esito: input.linterEsito,
      },
    ],
  });
  await patchContenuto(input.contenutoId, { stato: "programmato" });
  return riga;
}

export async function listaCalendario(): Promise<Pubblicazione[]> {
  return sbFetch<Pubblicazione[]>("sheis_pubblicazioni", {
    query: "select=*&order=programmato_per.asc",
  });
}

export async function bloccaPubblicazione(id: string, motivo: string): Promise<void> {
  await sbFetch("sheis_pubblicazioni", {
    method: "PATCH",
    query: `id=eq.${id}`,
    prefer: "return=minimal",
    body: { stato: "bloccato", motivo_blocco: motivo },
  });
}

/* ------------------------------------------------------------------ utenti */

export async function getUtentePerEmail(email: string): Promise<Utente | null> {
  const righe = await sbFetch<Utente[]>("sheis_utenti", {
    query: `select=*&email=eq.${encodeURIComponent(email)}&limit=1`,
  });
  return righe[0] ?? null;
}

export async function listaUtenti(): Promise<Utente[]> {
  return sbFetch<Utente[]>("sheis_utenti", { query: "select=*&order=created_at.asc" });
}

export async function creaUtente(input: { email: string; nome: string; ruolo: Ruolo; pwdHash: string }): Promise<Utente> {
  const [riga] = await sbFetch<Utente[]>("sheis_utenti", {
    method: "POST",
    prefer: "return=representation",
    body: [{ email: input.email, nome: input.nome, ruolo: input.ruolo, pwd_hash: input.pwdHash, attivo: true }],
  });
  return riga;
}

export async function aggiornaUtente(id: string, patch: Partial<Pick<Utente, "nome" | "ruolo" | "attivo" | "pwd_hash">>): Promise<Utente> {
  const [riga] = await sbFetch<Utente[]>("sheis_utenti", {
    method: "PATCH",
    query: `id=eq.${id}`,
    prefer: "return=representation",
    body: patch,
  });
  return riga;
}

export async function segnaUltimoAccesso(id: string): Promise<void> {
  await sbFetch("sheis_utenti", {
    method: "PATCH",
    query: `id=eq.${id}`,
    prefer: "return=minimal",
    body: { ultimo_accesso: new Date().toISOString() },
  });
}

/* --------------------------------------------------------- vetrine lettura */

export async function listaCandidati(limite = 50): Promise<Candidato[]> {
  return sbFetch<Candidato[]>("sheis_candidati", { query: `select=*&order=created_at.desc&limit=${limite}` });
}

export async function listaCampagne(): Promise<Campagna[]> {
  return sbFetch<Campagna[]>("sheis_campagne", { query: "select=*&order=created_at.desc" });
}

export async function creaCampagna(input: {
  nome: string;
  obiettivo?: string;
  pubblico?: string;
  brand?: string;
  budgetGiorno?: number;
  richiestaDa: string;
}): Promise<Campagna> {
  const [riga] = await sbFetch<Campagna[]>("sheis_campagne", {
    method: "POST",
    prefer: "return=representation",
    body: [
      {
        nome: input.nome,
        obiettivo: input.obiettivo ?? null,
        pubblico: input.pubblico ?? null,
        brand: input.brand ?? null,
        budget_giorno: input.budgetGiorno ?? null,
        stato: "bloccata",
        motivo_blocco: "Nessun account pubblicitario Meta collegato a SHEis in questo ambiente: la campagna resta bozza/bloccata finché non arriva l'ad account.",
        richiesta_da: input.richiestaDa,
      },
    ],
  });
  return riga;
}

export async function listaArticoli(): Promise<Articolo[]> {
  return sbFetch<Articolo[]>("sheis_articoli", { query: "select=*&order=updated_at.desc" });
}

export async function creaArticolo(input: {
  slug: string;
  lingua: string;
  titolo: string;
  sommario?: string;
  autoreId: string;
}): Promise<Articolo> {
  const [riga] = await sbFetch<Articolo[]>("sheis_articoli", {
    method: "POST",
    prefer: "return=representation",
    body: [
      {
        slug: input.slug,
        lingua: input.lingua,
        titolo: input.titolo,
        sommario: input.sommario ?? null,
        blocchi: [],
        stato: "bozza",
        autore_id: input.autoreId,
      },
    ],
  });
  return riga;
}

export async function listaReport(): Promise<Report[]> {
  return sbFetch<Report[]>("sheis_report", { query: "select=*&order=periodo_da.desc" });
}
