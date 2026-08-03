import { NextResponse } from "next/server";
import { getArticolo, articoliPerSlug, creaArticolo } from "@/lib/dati";
import { LINGUE_SITO, LINGUA_FONTE, type Lingua8 } from "@/lib/articoli";
import { richiedeRuolo, RUOLI_PROPONE } from "@/lib/auth";
import { rispondiErrore } from "@/lib/api";

/**
 * Duplica un articolo in un'altra lingua come bozza di traduzione — stessa
 * struttura a blocchi, testo copiato dalla fonte e pronto da riscrivere.
 * L'italiano resta SEMPRE la lingua fonte tracciata (fonte_lingua), anche
 * quando si traduce da una lingua che a sua volta non è l'italiano.
 */
export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessione = await richiedeRuolo(RUOLI_PROPONE);
    const { id } = await params;
    const body = (await req.json().catch(() => ({}))) as { lingua?: string };
    const linguaTarget = body.lingua as Lingua8;

    if (!LINGUE_SITO.includes(linguaTarget)) {
      return NextResponse.json({ error: `Lingua non valida. Ammesse: ${LINGUE_SITO.join(", ")}.` }, { status: 400 });
    }

    const sorgente = await getArticolo(id);
    if (!sorgente) return NextResponse.json({ error: "Articolo di partenza non trovato." }, { status: 404 });

    const esistenti = await articoliPerSlug(sorgente.slug);
    if (esistenti.some((a) => a.lingua === linguaTarget)) {
      return NextResponse.json({ error: `Esiste già una versione "${linguaTarget}" per lo slug "${sorgente.slug}".` }, { status: 409 });
    }

    const articolo = await creaArticolo({
      slug: sorgente.slug,
      lingua: linguaTarget,
      fonteLingua: LINGUA_FONTE,
      titolo: sorgente.titolo,
      sommario: sorgente.sommario ?? undefined,
      categoria: sorgente.categoria ?? undefined,
      tag: sorgente.tag ?? undefined,
      blocchi: sorgente.blocchi,
      autoreId: sessione.id,
    });

    return NextResponse.json({ articolo });
  } catch (e) {
    return rispondiErrore(e);
  }
}
