import { NextResponse } from "next/server";
import { listaCampagne, creaCampagna } from "@/lib/dati";
import { richiedeRuolo, RUOLI_APPROVA } from "@/lib/auth";
import { rispondiErrore } from "@/lib/api";

/**
 * Media buyer su richiesta (passo 7, impianto onesto). Ogni campagna nasce
 * "bloccata": non esiste un account pubblicitario Meta SHEis collegato in
 * questo ambiente — dichiarato nel motivo_blocco, non finto attivo.
 */
export const runtime = "nodejs";

export async function GET() {
  try {
    await richiedeRuolo(RUOLI_APPROVA);
    const campagne = await listaCampagne();
    return NextResponse.json({ campagne });
  } catch (e) {
    return rispondiErrore(e);
  }
}

export async function POST(req: Request) {
  try {
    const sessione = await richiedeRuolo(RUOLI_APPROVA);
    const body = (await req.json().catch(() => ({}))) as {
      nome?: string;
      obiettivo?: string;
      pubblico?: string;
      brand?: string;
      budgetGiorno?: number;
    };
    if (!body.nome?.trim()) {
      return NextResponse.json({ error: "Serve un nome campagna." }, { status: 400 });
    }
    const campagna = await creaCampagna({
      nome: body.nome.trim(),
      obiettivo: body.obiettivo?.trim(),
      pubblico: body.pubblico?.trim(),
      brand: body.brand?.trim(),
      budgetGiorno: typeof body.budgetGiorno === "number" ? body.budgetGiorno : undefined,
      richiestaDa: sessione.id,
    });
    return NextResponse.json({ campagna });
  } catch (e) {
    return rispondiErrore(e);
  }
}
