import { NextResponse } from "next/server";
import { listaContenuti, type StatoContenuto } from "@/lib/dati";
import { richiedeRuolo, RUOLI_PROPONE } from "@/lib/auth";
import { rispondiErrore } from "@/lib/api";

export const runtime = "nodejs";

const STATI_VALIDI: StatoContenuto[] = [
  "in_attesa",
  "approvato",
  "modificato",
  "scartato",
  "in_produzione",
  "prodotto",
  "programmato",
  "pubblicato",
  "errore",
];

export async function GET(req: Request) {
  try {
    await richiedeRuolo(RUOLI_PROPONE);
    const { searchParams } = new URL(req.url);
    const statoParam = searchParams.get("stato");
    const stato = statoParam && (STATI_VALIDI as string[]).includes(statoParam) ? (statoParam as StatoContenuto) : undefined;
    const contenuti = await listaContenuti(stato ? { stato } : undefined);
    return NextResponse.json({ contenuti });
  } catch (e) {
    return rispondiErrore(e);
  }
}
