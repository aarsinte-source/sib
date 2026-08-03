import "server-only";
import { NextResponse } from "next/server";
import { SchemaNotInitializedError, SupabaseConfigError, SupabaseRequestError } from "@/lib/supabase";
import { ErroreAutorizzazione } from "@/lib/auth";
import { ApiError } from "@/lib/openai";

/**
 * Traduttore unico errore→risposta HTTP per le route API. Ogni errore
 * conosciuto diventa un messaggio in italiano con lo status corretto — mai
 * uno stack trace grezzo, mai un 500 muto (SPEC.md §"Il degrado si dichiara").
 */
export function rispondiErrore(e: unknown): NextResponse {
  if (e instanceof ErroreAutorizzazione) {
    return NextResponse.json({ error: e.message }, { status: e.status });
  }
  if (e instanceof SchemaNotInitializedError) {
    return NextResponse.json(
      { error: "Database non ancora inizializzato: le tabelle sheis_* non esistono su Supabase.", schemaNonInizializzato: true },
      { status: 503 },
    );
  }
  if (e instanceof SupabaseConfigError) {
    return NextResponse.json({ error: e.message }, { status: 503 });
  }
  if (e instanceof SupabaseRequestError) {
    return NextResponse.json({ error: e.message }, { status: e.status >= 400 ? e.status : 502 });
  }
  if (e instanceof ApiError) {
    return NextResponse.json({ error: e.message }, { status: e.status });
  }
  const message = e instanceof Error ? e.message : "Errore imprevisto.";
  return NextResponse.json({ error: message }, { status: 500 });
}
