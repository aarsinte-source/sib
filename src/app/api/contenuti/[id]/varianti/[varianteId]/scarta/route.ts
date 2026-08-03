import { NextResponse } from "next/server";
import { scartaVariante } from "@/lib/dati";
import { richiedeRuolo, RUOLI_APPROVA } from "@/lib/auth";
import { rispondiErrore } from "@/lib/api";

export const runtime = "nodejs";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string; varianteId: string }> }) {
  try {
    const sessione = await richiedeRuolo(RUOLI_APPROVA);
    const { id, varianteId } = await params;
    await scartaVariante(varianteId, id, sessione.nome, sessione.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return rispondiErrore(e);
  }
}
