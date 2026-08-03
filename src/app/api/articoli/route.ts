import { NextResponse } from "next/server";
import { listaArticoli, creaArticolo } from "@/lib/dati";
import { lintTesto } from "@/lib/linter";
import { richiedeRuolo, RUOLI_PROPONE } from "@/lib/auth";
import { rispondiErrore } from "@/lib/api";

/** Articoli del sito (passo "sito", impianto onesto). Il dipendente scrive; la pubblicazione resta un passo separato non implementato qui. */
export const runtime = "nodejs";

export async function GET() {
  try {
    await richiedeRuolo(RUOLI_PROPONE);
    const articoli = await listaArticoli();
    return NextResponse.json({ articoli });
  } catch (e) {
    return rispondiErrore(e);
  }
}

export async function POST(req: Request) {
  try {
    const sessione = await richiedeRuolo(RUOLI_PROPONE);
    const body = (await req.json().catch(() => ({}))) as { slug?: string; lingua?: string; titolo?: string; sommario?: string };
    if (!body.slug?.trim() || !body.titolo?.trim()) {
      return NextResponse.json({ error: "Servono almeno slug e titolo." }, { status: 400 });
    }
    const esito = lintTesto(`${body.titolo} ${body.sommario ?? ""}`);
    if (esito.bloccato) {
      return NextResponse.json({ error: "Il linter ha bloccato titolo/sommario.", linter: esito }, { status: 422 });
    }
    const articolo = await creaArticolo({
      slug: body.slug.trim(),
      lingua: body.lingua?.trim() || "it",
      titolo: body.titolo.trim(),
      sommario: body.sommario?.trim(),
      autoreId: sessione.id,
    });
    return NextResponse.json({ articolo });
  } catch (e) {
    return rispondiErrore(e);
  }
}
