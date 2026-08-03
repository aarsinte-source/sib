import { NextResponse } from "next/server";
import { listaArticoli, creaArticolo } from "@/lib/dati";
import { lintTesto } from "@/lib/linter";
import { LINGUE_SITO, LINGUA_FONTE, type Lingua8 } from "@/lib/articoli";
import { richiedeRuolo, RUOLI_PROPONE } from "@/lib/auth";
import { rispondiErrore } from "@/lib/api";

/**
 * Articoli del sito — editor a blocchi. Chiunque proponga (dipendente
 * incluso) può creare una bozza; la pubblicazione è un gate separato
 * (POST /api/articoli/[id]/pubblica, solo marketing/mauro).
 */
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
    const body = (await req.json().catch(() => ({}))) as {
      slug?: string;
      lingua?: string;
      titolo?: string;
      sommario?: string;
      categoria?: string;
      tag?: string[];
    };
    if (!body.slug?.trim() || !body.titolo?.trim()) {
      return NextResponse.json({ error: "Servono almeno slug e titolo." }, { status: 400 });
    }
    const lingua: Lingua8 = LINGUE_SITO.includes(body.lingua as Lingua8) ? (body.lingua as Lingua8) : LINGUA_FONTE;

    const esito = lintTesto(`${body.titolo} ${body.sommario ?? ""}`);
    if (esito.bloccato) {
      return NextResponse.json({ error: "Il linter ha bloccato titolo/sommario.", linter: esito }, { status: 422 });
    }
    const articolo = await creaArticolo({
      slug: body.slug.trim(),
      lingua,
      fonteLingua: LINGUA_FONTE, // l'italiano è sempre la fonte, anche per il primo articolo scritto direttamente in un'altra lingua
      titolo: body.titolo.trim(),
      sommario: body.sommario?.trim(),
      categoria: body.categoria?.trim() || undefined,
      tag: Array.isArray(body.tag) ? body.tag.filter((t) => typeof t === "string" && t.trim()) : undefined,
      autoreId: sessione.id,
    });
    return NextResponse.json({ articolo });
  } catch (e) {
    return rispondiErrore(e);
  }
}
