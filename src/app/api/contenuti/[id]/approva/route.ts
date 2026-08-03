import { NextResponse } from "next/server";
import { approvaContenuto, getContenuto } from "@/lib/dati";
import { lintContenuto } from "@/lib/linter";
import { richiedeRuolo, RUOLI_APPROVA } from "@/lib/auth";
import { rispondiErrore } from "@/lib/api";

/**
 * Approva: gate del linter PRIMA di salvare come approvato (SPEC.md §"Il
 * linter blocca, non avvisa"). Solo mauro/marketing possono approvare — un
 * dipendente riceve un 403 vero, non un pulsante nascosto.
 */
export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessione = await richiedeRuolo(RUOLI_APPROVA);
    const { id } = await params;

    const contenuto = await getContenuto(id);
    if (!contenuto) return NextResponse.json({ error: "Contenuto non trovato." }, { status: 404 });

    const esito = lintContenuto({
      hook: contenuto.hook,
      copy: contenuto.copy,
      copySecondario: contenuto.copy_secondario ?? undefined,
      cta: contenuto.cta,
      hashtag: contenuto.hashtag ?? undefined,
    });
    if (esito.bloccato) {
      return NextResponse.json({ error: "Il linter ha bloccato l'approvazione.", linter: esito }, { status: 422 });
    }

    const aggiornato = await approvaContenuto(id, sessione.nome, sessione.id);
    return NextResponse.json({ contenuto: aggiornato });
  } catch (e) {
    return rispondiErrore(e);
  }
}
