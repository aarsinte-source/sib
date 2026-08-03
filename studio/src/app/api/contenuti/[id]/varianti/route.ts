import { NextResponse } from "next/server";
import { listaVarianti } from "@/lib/dati";
import { richiedeRuolo, RUOLI_PROPONE } from "@/lib/auth";
import { rispondiErrore } from "@/lib/api";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await richiedeRuolo(RUOLI_PROPONE);
    const { id } = await params;
    const varianti = await listaVarianti(id);
    return NextResponse.json({ varianti });
  } catch (e) {
    return rispondiErrore(e);
  }
}
