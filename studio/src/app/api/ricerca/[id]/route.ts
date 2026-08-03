import { NextResponse } from "next/server";
import { richiedeRuolo, RUOLI_PROPONE } from "@/lib/auth";
import { rispondiErrore } from "@/lib/api";
import { lavoriPer, statoCoda } from "@/lib/lavori";
import { ricerca } from "@/lib/ricerche";

/**
 * Lo stato di una ricerca, per chi la sta aspettando.
 *
 * Restituisce anche lo stato della CODA, e non è un di più: se l'esecutore non
 * sta girando, la ricerca resta «in attesa» per sempre e la pagina mostrerebbe
 * una rotellina all'infinito. Meglio dire «nessuno sta lavorando, si accende
 * così» che far aspettare qualcuno per un'ora.
 */
export const runtime = "nodejs";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await richiedeRuolo(RUOLI_PROPONE);
    const { id } = await ctx.params;

    const r = await ricerca(id);
    if (!r) return NextResponse.json({ error: "Ricerca non trovata." }, { status: 404 });

    const [lavori, coda] = await Promise.all([lavoriPer("ricerca", id), statoCoda()]);

    return NextResponse.json({ ricerca: r, lavori, coda });
  } catch (e) {
    return rispondiErrore(e);
  }
}
