import { NextResponse } from "next/server";
import { getContenuto, creaVarianti, listaVarianti, aggiornaVariante, scriviLog, segnaContenutoInErrore } from "@/lib/dati";
import { sbFetch } from "@/lib/supabase";
import { costoStimato, costruisciVarianti, generaImmagine, QUALITA_LABEL, type QualitaImmagine } from "@/lib/higgsfield";
import { richiedeRuolo, RUOLI_APPROVA } from "@/lib/auth";
import { rispondiErrore } from "@/lib/api";

/**
 * Le tre varianti creative, sul contenuto approvato. GATE DI COSTO
 * obbligatorio prima di ogni generazione (SPEC.md §"Le tre varianti
 * creative"): senza `conferma:true` la route restituisce solo l'anteprima
 * di costo, non scrive nulla. Con `conferma:true` crea le 3 righe e prova a
 * generarle IN SEQUENZA: se Higgsfield segnala il tetto giornaliero, quella
 * variante va in errore e le successive NON partono.
 */
export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessione = await richiedeRuolo(RUOLI_APPROVA);
    const { id } = await params;

    const body = (await req.json().catch(() => ({}))) as { qualita?: QualitaImmagine; conferma?: boolean };
    const qualita: QualitaImmagine = body.qualita === "1k_low" ? "1k_low" : "2k_high";

    const contenuto = await getContenuto(id);
    if (!contenuto) return NextResponse.json({ error: "Contenuto non trovato." }, { status: 404 });
    if (contenuto.stato !== "approvato" && contenuto.stato !== "in_produzione" && contenuto.stato !== "errore") {
      return NextResponse.json(
        { error: `Il contenuto è in stato "${contenuto.stato}": si generano varianti solo su un contenuto approvato.` },
        { status: 409 },
      );
    }

    const specifiche = costruisciVarianti({
      brand: contenuto.brand,
      formato: contenuto.formato,
      angolo: contenuto.angolo,
      hook: contenuto.hook,
    });
    const costo = costoStimato(qualita, specifiche.length);

    if (!body.conferma) {
      return NextResponse.json({
        anteprima: true,
        qualita,
        qualitaLabel: QUALITA_LABEL[qualita],
        costo,
        varianti: specifiche.map((s) => ({ indice: s.indice, angoloVisivo: s.angoloVisivo })),
      });
    }

    const esistenti = await listaVarianti(id);
    if (esistenti.length > 0) {
      return NextResponse.json(
        {
          error:
            "Esistono già varianti per questo contenuto. Se sono tutte in errore o nessuna è pronta, usa \"Ritenta\" invece di generare di nuovo.",
        },
        { status: 409 },
      );
    }

    await sbFetch("sheis_contenuti", {
      method: "PATCH",
      query: `id=eq.${id}`,
      prefer: "return=minimal",
      body: { stato: "in_produzione" },
    });

    const righe = await creaVarianti(
      id,
      specifiche.map((s) => ({ indice: s.indice, prompt: s.prompt, angoloVisivo: s.angoloVisivo, provider: "higgsfield:gpt_image_2" })),
    );

    let bloccato = false;
    for (const riga of righe) {
      if (bloccato) continue; // le rimanenti restano "da_generare": non partono dopo un tetto raggiunto
      await aggiornaVariante(riga.id, { stato: "in_corso" });
      const esito = await generaImmagine(riga.prompt, qualita);
      if (esito.ok) {
        await aggiornaVariante(riga.id, {
          stato: "pronta",
          asset_url: esito.assetUrl,
          costo_crediti: esito.costoCrediti,
          costo_eur: esito.costoEur,
          generata_il: new Date().toISOString(),
        });
      } else {
        await aggiornaVariante(riga.id, { stato: "errore", errore: esito.errore });
        if (esito.tettoRaggiunto) bloccato = true;
      }
    }

    await scriviLog({
      contenutoId: id,
      azione: "modificato",
      attore: sessione.nome,
      attoreId: sessione.id,
      dettaglio: { tipo: "varianti_generate", qualita, costo },
    });

    const finali = await listaVarianti(id);
    // Nessuna variante utilizzabile (tutte in errore, o alcune mai partite
    // perché il tetto giornaliero ha bloccato la coda a metà): il contenuto
    // va segnato in errore, altrimenti resta "in_produzione" per sempre
    // senza che nessuno stato lo dichiari (vicolo cieco corretto insieme a
    // /varianti/riprova).
    const nessunaRiuscita = finali.length > 0 && !finali.some((v) => v.stato === "pronta" || v.stato === "approvata");
    if (nessunaRiuscita) {
      await segnaContenutoInErrore(id);
    }

    return NextResponse.json({ varianti: finali, costo });
  } catch (e) {
    return rispondiErrore(e);
  }
}
