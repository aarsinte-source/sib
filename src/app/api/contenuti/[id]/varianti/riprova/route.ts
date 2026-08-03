import { NextResponse } from "next/server";
import { getContenuto, listaVarianti, riprovaVarianti, scriviLog } from "@/lib/dati";
import { richiedeRuolo, RUOLI_APPROVA } from "@/lib/auth";
import { rispondiErrore } from "@/lib/api";

/**
 * Ripartenza dal vicolo cieco: se le tre varianti creative finiscono tutte in
 * errore (tetto giornaliero Higgsfield, errore di rete...) — o restano mai
 * partite perché il tetto ha bloccato la coda a metà — il contenuto resta
 * bloccato in "in_produzione"/"errore" per sempre: /varianti/genera rifiuta
 * di ripartire perché le righe delle varianti esistono già, e prima d'ora
 * l'unico rimedio era intervenire a mano sul database.
 *
 * Questa rotta cancella le varianti non riuscite e riporta il contenuto ad
 * "approvato", così /varianti/genera può ripartire pulito. Se anche una sola
 * variante è utilizzabile (pronta o approvata) NON tocca nulla: in quel caso
 * si scarta o si approva la variante esistente, non si ricomincia da capo.
 */
export const runtime = "nodejs";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessione = await richiedeRuolo(RUOLI_APPROVA);
    const { id } = await params;

    const contenuto = await getContenuto(id);
    if (!contenuto) return NextResponse.json({ error: "Contenuto non trovato." }, { status: 404 });
    if (contenuto.stato !== "in_produzione" && contenuto.stato !== "errore") {
      return NextResponse.json(
        { error: `Il contenuto è in stato "${contenuto.stato}": non c'è nulla da ritentare.` },
        { status: 409 },
      );
    }

    const varianti = await listaVarianti(id);
    if (varianti.length === 0) {
      return NextResponse.json(
        { error: "Nessuna variante esistente per questo contenuto: genera le varianti da zero." },
        { status: 409 },
      );
    }
    if (varianti.some((v) => v.stato === "pronta" || v.stato === "approvata")) {
      return NextResponse.json(
        {
          error:
            "Esiste già almeno una variante utilizzabile (pronta o approvata): scartala o approvala invece di ricominciare da capo.",
        },
        { status: 409 },
      );
    }

    const aggiornato = await riprovaVarianti(id);
    await scriviLog({
      contenutoId: id,
      azione: "modificato",
      attore: sessione.nome,
      attoreId: sessione.id,
      dettaglio: { tipo: "varianti_riprova", varianti_cancellate: varianti.length },
    });

    return NextResponse.json({ contenuto: aggiornato });
  } catch (e) {
    return rispondiErrore(e);
  }
}
