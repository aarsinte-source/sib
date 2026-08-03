import { NextResponse } from "next/server";
import { rifiutaContenuto } from "@/lib/dati";
import { richiedeRuolo, RUOLI_APPROVA } from "@/lib/auth";
import { rispondiErrore } from "@/lib/api";

export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessione = await richiedeRuolo(RUOLI_APPROVA);
    const { id } = await params;
    const body = (await req.json().catch(() => ({}))) as { nota?: string };
    const aggiornato = await rifiutaContenuto(id, sessione.nome, sessione.id, body.nota?.trim() || undefined);
    return NextResponse.json({ contenuto: aggiornato });
  } catch (e) {
    return rispondiErrore(e);
  }
}
