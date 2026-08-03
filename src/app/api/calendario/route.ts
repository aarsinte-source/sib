import { NextResponse } from "next/server";
import { listaCalendario } from "@/lib/dati";
import { richiedeRuolo, RUOLI_PROPONE } from "@/lib/auth";
import { rispondiErrore } from "@/lib/api";

export const runtime = "nodejs";

export async function GET() {
  try {
    await richiedeRuolo(RUOLI_PROPONE);
    const coda = await listaCalendario();
    return NextResponse.json({ coda });
  } catch (e) {
    return rispondiErrore(e);
  }
}
