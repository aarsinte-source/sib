import { NextResponse } from "next/server";
import { getArticolo, pubblicaArticolo } from "@/lib/dati";
import { lintTesto } from "@/lib/linter";
import { estraiTestoBlocchi } from "@/lib/articoli";
import { richiedeRuolo, RUOLI_APPROVA } from "@/lib/auth";
import { rispondiErrore } from "@/lib/api";

/**
 * Il gate di pubblicazione degli articoli — solo marketing/mauro. Un
 * dipendente che chiama questa route riceve un vero 403 (richiedeRuolo),
 * non un pulsante nascosto. Linter su titolo+sommario+TUTTI i blocchi prima
 * di passare a "pubblicato".
 */
export const runtime = "nodejs";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessione = await richiedeRuolo(RUOLI_APPROVA);
    const { id } = await params;

    const articolo = await getArticolo(id);
    if (!articolo) return NextResponse.json({ error: "Articolo non trovato." }, { status: 404 });

    const testoCompleto = [articolo.titolo, articolo.sommario ?? "", estraiTestoBlocchi(articolo.blocchi)].join("\n");
    const esito = lintTesto(testoCompleto);
    if (esito.bloccato) {
      return NextResponse.json({ error: "Il linter ha bloccato la pubblicazione.", linter: esito }, { status: 422 });
    }
    if (articolo.blocchi.length === 0) {
      return NextResponse.json({ error: "L'articolo non ha ancora blocchi di contenuto: aggiungine almeno uno prima di pubblicare." }, { status: 422 });
    }

    const aggiornato = await pubblicaArticolo(id, sessione.id);
    return NextResponse.json({ articolo: aggiornato });
  } catch (e) {
    return rispondiErrore(e);
  }
}
