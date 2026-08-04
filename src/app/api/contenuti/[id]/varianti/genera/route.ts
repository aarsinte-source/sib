import { NextResponse } from "next/server";
import { getContenuto, creaVarianti, listaVarianti, scriviLog } from "@/lib/dati";
import { sbFetch } from "@/lib/supabase";
import { costoStimato, costruisciVarianti, QUALITA_LABEL, type QualitaImmagine } from "@/lib/higgsfield";
import { accodaMolti, COPERTURA } from "@/lib/lavori";
import { richiedeRuolo, RUOLI_APPROVA } from "@/lib/auth";
import { rispondiErrore } from "@/lib/api";

/**
 * Le tre varianti creative su un contenuto approvato.
 *
 * ⚠️ QUESTA ROTTA NON GENERA PIÙ: ACCODA.
 * Prima chiamava `generaImmagine()`, che lancia la riga di comando Higgsfield.
 * Funzionava perché il portale girava sul portatile. Su Vercel quel comando non
 * esiste, e una generazione impiega comunque più di quanto una funzione
 * serverless resti viva.
 *
 * Ora crea le righe in `sheis_varianti` con stato `da_generare` e mette tre
 * lavori in coda. L'esecutore li prende e le riempie.
 *
 * ⚠️ E l'esecutore che le prende è quello sul PORTATILE, non quello sul VPS:
 * l'API di Higgsfield risponde 521 alle chiamate dai datacenter (misurato).
 * Se il portatile è spento la generazione ASPETTA — non fallisce. La differenza
 * conta: «fallito» manda qualcuno a cercare un guasto che non c'è.
 *
 * IL GATE DI COSTO RESTA. Senza `conferma:true` si restituisce solo l'anteprima
 * del costo e non si scrive niente. Accodare è più economico che generare, ma
 * il conto arriva lo stesso: il gate serve a chi paga, non al processo.
 */
export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessione = await richiedeRuolo(RUOLI_APPROVA);
    const { id } = await params;

    const body = (await req.json().catch(() => ({}))) as {
      qualita?: QualitaImmagine;
      conferma?: boolean;
    };
    const qualita: QualitaImmagine = body.qualita === "1k_low" ? "1k_low" : "2k_high";

    const contenuto = await getContenuto(id);
    if (!contenuto) return NextResponse.json({ error: "Contenuto non trovato." }, { status: 404 });
    if (contenuto.stato !== "approvato" && contenuto.stato !== "in_produzione") {
      return NextResponse.json(
        {
          error: `Il contenuto è in stato "${contenuto.stato}": si generano varianti solo su un contenuto approvato. Generare costa crediti, e su un testo non approvato si pagherebbero due volte.`,
        },
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
        dove: COPERTURA["genera-creativa"],
      });
    }

    const esistenti = await listaVarianti(id);
    if (esistenti.length > 0) {
      return NextResponse.json(
        {
          error:
            'Esistono già varianti per questo contenuto. Se sono tutte in errore o nessuna è pronta, usa "Ritenta" invece di generare di nuovo: rigenerare da capo le pagherebbe due volte.',
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
      specifiche.map((s) => ({
        indice: s.indice,
        prompt: s.prompt,
        angoloVisivo: s.angoloVisivo,
        provider: "higgsfield:gpt_image_2",
      })),
    );

    const lavori = await accodaMolti(
      righe.map((r) => ({
        tipo: "genera-creativa" as const,
        payload: {
          variante_id: r.id,
          contenuto_id: id,
          prompt: r.prompt,
          lavoro: contenuto.formato === "video" || contenuto.formato === "ugc" ? "ugc-video" : "grafica",
          canale: contenuto.canale,
          qualita,
        },
        riferimentoTipo: "variante",
        riferimentoId: r.id,
        richiestoDa: sessione.id,
      })),
    );

    await scriviLog({
      contenutoId: id,
      azione: "modificato",
      attore: sessione.nome,
      attoreId: sessione.id,
      dettaglio: { tipo: "varianti_accodate", qualita, costo, lavori: lavori.length },
    });

    return NextResponse.json({
      varianti: righe,
      lavori,
      costo,
      accodate: true,
      dove: COPERTURA["genera-creativa"],
      messaggio: `${righe.length} generazioni in coda. ${COPERTURA["genera-creativa"].nota}`,
    });
  } catch (e) {
    return rispondiErrore(e);
  }
}
