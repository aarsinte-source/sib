import { NextResponse } from "next/server";
import { contenutiDelPiano, creaVarianti, listaVarianti, pianoCorrente } from "@/lib/dati";
import { sbFetch } from "@/lib/supabase";
import { costoStimato, costruisciVarianti, QUALITA_LABEL, type QualitaImmagine } from "@/lib/higgsfield";
import { accodaMolti, COPERTURA } from "@/lib/lavori";
import { richiedeRuolo, RUOLI_APPROVA } from "@/lib/auth";
import { rispondiErrore } from "@/lib/api";

/**
 * «Genera tutte le creative»: la stessa cosa di una alla volta, ma su tutto il
 * piano.
 *
 * ⚠️ IL GATE DI COSTO QUI È LA RAGIONE PER CUI QUESTA ROTTA ESISTE SEPARATA.
 * Trenta contenuti × tre varianti fanno novanta generazioni. A 7 crediti l'una
 * sono 630 crediti, cioè circa 21 euro, in un clic. Nessuno deve poterlo fare
 * senza aver visto il numero prima: la richiesta senza `conferma:true`
 * restituisce SOLO il conto e non scrive niente.
 *
 * ⚠️ SI SALTANO i contenuti che hanno già varianti. Rigenerarle sarebbe pagarle
 * due volte, ed è esattamente ciò che un pulsante «genera tutte» invoglia a
 * fare — perché chi lo preme non sta guardando quali hanno già una creativa.
 *
 * ⚠️ SI GENERANO SOLO GLI APPROVATI. Generare su un testo non ancora approvato
 * significa pagare una creativa che verrà buttata quando il testo cambia.
 */
export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const sessione = await richiedeRuolo(RUOLI_APPROVA);
    const body = (await req.json().catch(() => ({}))) as {
      pianoId?: string;
      qualita?: QualitaImmagine;
      conferma?: boolean;
      /** Quante varianti per contenuto. 1 = una sola, per provare il tono spendendo un terzo. */
      perContenuto?: number;
    };

    const qualita: QualitaImmagine = body.qualita === "1k_low" ? "1k_low" : "2k_high";
    const quante = Math.max(1, Math.min(3, body.perContenuto ?? 3));

    const piano = body.pianoId ? { id: body.pianoId } : await pianoCorrente();
    if (!piano) {
      return NextResponse.json({ error: "Nessun piano su cui lavorare." }, { status: 409 });
    }

    const tutti = await contenutiDelPiano(piano.id);
    const approvati = tutti.filter((c) => c.stato === "approvato");

    if (approvati.length === 0) {
      return NextResponse.json(
        {
          error:
            "Nessun contenuto approvato in questo piano. Generare costa crediti: si genera su ciò che è stato deciso, non su ciò che è ancora in discussione.",
          totale: tutti.length,
          approvati: 0,
        },
        { status: 409 },
      );
    }

    // Chi ha già varianti si salta: si controlla PRIMA di calcolare il costo,
    // altrimenti l'anteprima direbbe un numero e la generazione ne farebbe un
    // altro.
    const conVarianti = new Set<string>();
    for (const c of approvati) {
      const v = await listaVarianti(c.id);
      if (v.length > 0) conVarianti.add(c.id);
    }
    const daFare = approvati.filter((c) => !conVarianti.has(c.id));

    const costoTotale = costoStimato(qualita, quante * daFare.length);

    if (!body.conferma) {
      return NextResponse.json({
        anteprima: true,
        qualita,
        qualitaLabel: QUALITA_LABEL[qualita],
        perContenuto: quante,
        contenutiTotali: tutti.length,
        approvati: approvati.length,
        giaConCreative: conVarianti.size,
        daGenerare: daFare.length,
        generazioni: quante * daFare.length,
        costo: costoTotale,
        dove: COPERTURA["genera-creativa"],
        nota:
          conVarianti.size > 0
            ? `${conVarianti.size} contenuti hanno già una creativa e vengono saltati: rigenerarli sarebbe pagarli due volte.`
            : "",
      });
    }

    if (daFare.length === 0) {
      return NextResponse.json({
        accodate: 0,
        messaggio: "Tutti i contenuti approvati hanno già le loro creative.",
      });
    }

    const daAccodare: Parameters<typeof accodaMolti>[0] = [];
    for (const c of daFare) {
      const specifiche = costruisciVarianti({
        brand: c.brand,
        formato: c.formato,
        angolo: c.angolo,
        hook: c.hook,
      }).slice(0, quante);

      const righe = await creaVarianti(
        c.id,
        specifiche.map((s) => ({
          indice: s.indice,
          prompt: s.prompt,
          angoloVisivo: s.angoloVisivo,
          provider: "higgsfield:gpt_image_2",
        })),
      );

      await sbFetch("sheis_contenuti", {
        method: "PATCH",
        query: `id=eq.${c.id}`,
        prefer: "return=minimal",
        body: { stato: "in_produzione" },
      });

      for (const r of righe) {
        daAccodare.push({
          tipo: "genera-creativa",
          payload: {
            variante_id: r.id,
            contenuto_id: c.id,
            prompt: r.prompt,
            lavoro: c.formato === "video" || c.formato === "ugc" ? "ugc-video" : "grafica",
            canale: c.canale,
            qualita,
          },
          riferimentoTipo: "variante",
          riferimentoId: r.id,
          // Più basse delle ricerche: una generazione può aspettare, un'analisi
          // blocca tutto il resto della catena.
          priorita: 6,
          richiestoDa: sessione.id,
        });
      }
    }

    const lavori = await accodaMolti(daAccodare);

    return NextResponse.json({
      accodate: lavori.length,
      contenuti: daFare.length,
      saltati: conVarianti.size,
      costo: costoTotale,
      dove: COPERTURA["genera-creativa"],
      messaggio:
        `${lavori.length} generazioni in coda su ${daFare.length} contenuti. ` +
        COPERTURA["genera-creativa"].nota,
    });
  } catch (e) {
    return rispondiErrore(e);
  }
}
