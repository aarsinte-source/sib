import { NextResponse } from "next/server";
import { logDiContenuto } from "@/lib/dati";
import { richiedeRuolo, RUOLI_PROPONE } from "@/lib/auth";
import { rispondiErrore } from "@/lib/api";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await richiedeRuolo(RUOLI_PROPONE);
    const { id } = await params;
    const log = await logDiContenuto(id);
    return NextResponse.json({ log });
  } catch (e) {
    return rispondiErrore(e);
  }
}
