import { NextResponse } from "next/server";
import { schemaInizializzato } from "@/lib/supabase";
import { getSessione } from "@/lib/auth";

/** Stato globale: schema Supabase + sessione corrente. Usato da ogni pagina client per degradare onestamente. */
export const runtime = "nodejs";

export async function GET() {
  const [schema, sessione] = await Promise.all([schemaInizializzato(), getSessione()]);
  return NextResponse.json({ schema, sessione });
}
