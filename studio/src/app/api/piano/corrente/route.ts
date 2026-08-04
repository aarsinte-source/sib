import { NextResponse } from "next/server";
import { contenutiDelPiano, pianoCorrente } from "@/lib/dati";
import { pillarDelPiano, resaPillar } from "@/lib/pillar";
import { ultimaCompletata } from "@/lib/ricerche";
import { BRAND_LABEL, type Brand } from "@/lib/brand";
import { richiedeRuolo, RUOLI_PROPONE } from "@/lib/auth";
import { rispondiErrore } from "@/lib/api";

/**
 * Il piano su cui si sta lavorando, con tutto quello che serve per giudicarlo.
 *
 * `resa` è il pezzo che rende il piano criticabile: quota CHIESTA a ciascun
 * pilastro contro quota OTTENUTA. «Rispetta le quote» scritto nel prompt di un
 * modello non è una garanzia, è una richiesta — contarlo dopo è l'unico modo di
 * sapere se è stata ascoltata. Uno scarto di venti punti su un pilastro è la
 * differenza fra un piano equilibrato e un mese passato a dire la stessa cosa.
 */
export const runtime = "nodejs";

export async function GET() {
  try {
    await richiedeRuolo(RUOLI_PROPONE);

    const piano = await pianoCorrente();
    if (!piano) {
      const analisi = await ultimaCompletata().catch(() => null);
      return NextResponse.json({
        piano: null,
        analisiDisponibile: analisi
          ? { id: analisi.id, tema: analisi.tema, pillar: analisi.sintesi?.pillar?.length ?? 0 }
          : null,
        messaggio: analisi
          ? `C'è un'analisi pronta su «${analisi.tema}». Da lì nasce il piano.`
          : "Serve prima un'analisi di mercato: un piano scritto senza aver guardato il mercato è un elenco di supposizioni.",
      });
    }

    const [contenuti, pillar] = await Promise.all([
      contenutiDelPiano(piano.id),
      pillarDelPiano(piano.id).catch(() => []),
    ]);

    const senzaTesti = contenuti.filter((c) => !(c.copy ?? "").trim());
    const senzaGrafica = contenuti.filter((c) => c.copy_grafica == null);
    const vuoleUgc = contenuti.filter((c) => c.formato === "video" || c.formato === "ugc");
    const senzaUgc = vuoleUgc.filter((c) => !(c.copy_ugc ?? "").trim());

    return NextResponse.json({
      piano,
      pillar,
      resa: resaPillar(pillar, contenuti),
      contenuti: contenuti.map((c) => ({
        ...c,
        brandLabel: BRAND_LABEL[c.brand as Brand] ?? c.brand,
        pillarNome: pillar.find((p) => p.id === c.pillar_id)?.nome ?? null,
      })),
      conteggi: {
        totali: contenuti.length,
        conTesti: contenuti.length - senzaTesti.length,
        senzaTesti: senzaTesti.length,
        conGrafica: contenuti.length - senzaGrafica.length,
        video: vuoleUgc.length,
        senzaUgc: senzaUgc.length,
        inAttesa: contenuti.filter((c) => c.stato === "in_attesa").length,
        approvati: contenuti.filter((c) => c.stato === "approvato").length,
        scartati: contenuti.filter((c) => c.stato === "scartato").length,
      },
    });
  } catch (e) {
    return rispondiErrore(e);
  }
}
