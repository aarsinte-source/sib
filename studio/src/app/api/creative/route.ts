import { NextResponse } from "next/server";
import { contenutiDelPiano, pianoCorrente } from "@/lib/dati";
import { sbFetch } from "@/lib/supabase";
import { statoCoda, COPERTURA } from "@/lib/lavori";
import { BRAND_LABEL, type Brand } from "@/lib/brand";
import { richiedeRuolo, RUOLI_PROPONE } from "@/lib/auth";
import { rispondiErrore } from "@/lib/api";

/**
 * Tutto ciò che serve alla pagina Creatività in UNA risposta: i contenuti del
 * piano, le loro varianti, e lo stato della coda.
 *
 * Una richiesta sola e non tre perché la pagina mostra trenta contenuti: con
 * una chiamata per contenuto sarebbero trentuno richieste, e la pagina si
 * riempirebbe a scatti mostrando per qualche secondo uno stato che non è
 * quello vero.
 */
export const runtime = "nodejs";

type Variante = {
  id: string;
  contenuto_id: string;
  indice: number;
  angolo_visivo: string | null;
  asset_url: string | null;
  stato: string;
  errore: string | null;
  costo_crediti: number | null;
  costo_eur: number | null;
  generata_il: string | null;
};

export async function GET(req: Request) {
  try {
    await richiedeRuolo(RUOLI_PROPONE);
    const url = new URL(req.url);
    const pianoId = url.searchParams.get("piano");

    const piano = pianoId ? { id: pianoId, titolo: null } : await pianoCorrente();
    if (!piano) {
      return NextResponse.json({
        piano: null,
        contenuti: [],
        varianti: [],
        coda: await statoCoda().catch(() => null),
        messaggio: "Nessun piano ancora. La catena comincia dall'analisi di mercato.",
      });
    }

    const contenuti = await contenutiDelPiano(piano.id);
    const ids = contenuti.map((c) => c.id);

    // `in.(…)` in una sola query invece di una per contenuto.
    const varianti = ids.length
      ? await sbFetch<Variante[]>("sheis_varianti", {
          query: `select=*&contenuto_id=in.(${ids.join(",")})&order=indice.asc`,
        })
      : [];

    const coda = await statoCoda().catch(() => null);

    return NextResponse.json({
      piano,
      contenuti: contenuti.map((c) => ({
        ...c,
        brandLabel: BRAND_LABEL[c.brand as Brand] ?? c.brand,
      })),
      varianti,
      coda,
      copertura: COPERTURA["genera-creativa"],
      conteggi: {
        totali: contenuti.length,
        approvati: contenuti.filter((c) => c.stato === "approvato").length,
        inProduzione: contenuti.filter((c) => c.stato === "in_produzione").length,
        conCreative: new Set(varianti.map((v) => v.contenuto_id)).size,
        pronte: varianti.filter((v) => v.stato === "pronta").length,
        approvate: varianti.filter((v) => v.stato === "approvata").length,
        inCorso: varianti.filter((v) => v.stato === "in_corso" || v.stato === "da_generare").length,
        inErrore: varianti.filter((v) => v.stato === "errore").length,
        spesoEur: Number(
          varianti.reduce((s, v) => s + (v.costo_eur ?? 0), 0).toFixed(2),
        ),
      },
    });
  } catch (e) {
    return rispondiErrore(e);
  }
}
