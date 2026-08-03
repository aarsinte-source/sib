import "server-only";

/**
 * Client Supabase minimale, server-only, via REST + chiave di servizio.
 * Nessun SDK pesante: la superficie che serve è piccola (select/insert/update)
 * e un client scritto a mano rende ESPLICITO il punto in cui rilevare lo
 * "schema non inizializzato" — la condizione reale del progetto oggi
 * (0/15 tabelle sheis_*, manca il Personal Access Token per il DDL).
 *
 * Non importare MAI questo file da un componente client: usa solo da route
 * API e Server Component. La chiave di servizio non deve mai arrivare al browser.
 */

const SUPABASE_URL = process.env.SUPABASE_URL ?? "";
const SERVICE_KEY = process.env.SUPABASE_SECRET_KEY ?? "";

/** Lo schema sheis_* non esiste ancora in questo progetto Supabase. */
export class SchemaNotInitializedError extends Error {
  table: string;
  constructor(table: string) {
    super(
      `La tabella "${table}" non esiste ancora: lo schema del database non è stato inizializzato.`,
    );
    this.name = "SchemaNotInitializedError";
    this.table = table;
  }
}

/** Manca la configurazione minima (URL o chiave di servizio) in .env.local. */
export class SupabaseConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SupabaseConfigError";
  }
}

/** Supabase ha risposto con un errore che non è "tabella mancante". */
export class SupabaseRequestError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "SupabaseRequestError";
    this.status = status;
  }
}

function assertConfigured(): void {
  if (!SUPABASE_URL || !SERVICE_KEY) {
    throw new SupabaseConfigError(
      "Configurazione Supabase mancante: imposta SUPABASE_URL e SUPABASE_SECRET_KEY in .env.local.",
    );
  }
}

type Metodo = "GET" | "POST" | "PATCH" | "DELETE";

export type RestOptions = {
  method?: Metodo;
  /** Querystring PostgREST già composta, es. "select=*&stato=eq.approvato&order=created_at.desc". */
  query?: string;
  body?: unknown;
  /** Header Prefer, es. "return=representation" per riavere le righe scritte. */
  prefer?: string;
};

/**
 * Chiamata REST diretta a PostgREST. Lancia SchemaNotInitializedError quando
 * Supabase risponde col codice PGRST205 (tabella non trovata nello schema
 * cache) — è la firma esatta misurata su questo progetto il 2026-08-03.
 */
export async function sbFetch<T>(table: string, opts: RestOptions = {}): Promise<T> {
  assertConfigured();
  const { method = "GET", query = "", body, prefer } = opts;
  const url = `${SUPABASE_URL}/rest/v1/${table}${query ? `?${query}` : ""}`;

  const headers: Record<string, string> = {
    apikey: SERVICE_KEY,
    authorization: `Bearer ${SERVICE_KEY}`,
    "content-type": "application/json",
  };
  if (prefer) headers.prefer = prefer;

  let r: Response;
  try {
    r = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      cache: "no-store",
    });
  } catch {
    throw new SupabaseRequestError(0, "Errore di rete verso Supabase. Riprova tra poco.");
  }

  if (!r.ok) {
    const text = await r.text().catch(() => "");
    let code: string | undefined;
    try {
      code = (JSON.parse(text) as { code?: string }).code;
    } catch {
      /* corpo non JSON: ignora, resta il testo grezzo nel messaggio d'errore */
    }
    if (r.status === 404 && code === "PGRST205") {
      throw new SchemaNotInitializedError(table);
    }
    throw new SupabaseRequestError(
      r.status,
      `Supabase ha risposto ${r.status} su "${table}": ${text.slice(0, 300) || "(nessun dettaglio)"}`,
    );
  }

  if (r.status === 204) return undefined as T;
  const text = await r.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

export type StatoSchema = { ok: boolean; motivo?: string };

/**
 * Verifica se lo schema Studio risponde, senza mai lanciare. È la funzione da
 * chiamare a ogni pagina/route che tocca il database, per decidere se
 * mostrare il prodotto o dichiarare "database non ancora inizializzato".
 */
export async function schemaInizializzato(): Promise<StatoSchema> {
  if (!SUPABASE_URL || !SERVICE_KEY) {
    return {
      ok: false,
      motivo: "Configurazione Supabase mancante: imposta SUPABASE_URL e SUPABASE_SECRET_KEY in .env.local.",
    };
  }
  try {
    await sbFetch("sheis_utenti", { query: "select=id&limit=1" });
    return { ok: true };
  } catch (e) {
    if (e instanceof SchemaNotInitializedError) {
      return {
        ok: false,
        motivo:
          "Il database non è ancora stato inizializzato: le tabelle sheis_* non esistono su Supabase. " +
          "Serve applicare le migrazioni in ~/alkemia-sheis-backend/migrations/ (richiede un Personal Access Token Supabase, oggi mancante).",
      };
    }
    if (e instanceof SupabaseConfigError) return { ok: false, motivo: e.message };
    return {
      ok: false,
      motivo: e instanceof Error ? e.message : "Errore sconosciuto nel controllo del database.",
    };
  }
}
