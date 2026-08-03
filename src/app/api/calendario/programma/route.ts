import { NextResponse } from "next/server";
import { getContenuto, getVariante, metteInCoda, scriviLog, bloccaPubblicazione } from "@/lib/dati";
import { lintContenuto } from "@/lib/linter";
import { pubblicaSuZernio } from "@/lib/zernio";
import { CANALI } from "@/lib/brand";
import { richiedeRuolo, RUOLI_APPROVA } from "@/lib/auth";
import { rispondiErrore } from "@/lib/api";

/**
 * Passo 5 — mette un contenuto (con variante scelta) in coda di
 * pubblicazione. Linter obbligatorio PRIMA di mettere in coda (SPEC.md).
 * La chiamata a Zernio è reale (lib/zernio.ts): blocca se non c'è un account
 * SHEis collegato per il canale, non ripiega mai su un account Alkemia.
 */
export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const sessione = await richiedeRuolo(RUOLI_APPROVA);
    const body = (await req.json().catch(() => ({}))) as { contenutoId?: string; canale?: string; quando?: string };
    const contenutoId = (body.contenutoId ?? "").trim();
    const canale = body.canale ?? "";
    const quando = (body.quando ?? "").trim();

    if (!contenutoId || !(CANALI as string[]).includes(canale) || !quando) {
      return NextResponse.json({ error: "Servono contenutoId, canale e quando (data/ora)." }, { status: 400 });
    }

    const contenuto = await getContenuto(contenutoId);
    if (!contenuto) return NextResponse.json({ error: "Contenuto non trovato." }, { status: 404 });

    const esito = lintContenuto({
      hook: contenuto.hook,
      copy: contenuto.copy,
      copySecondario: contenuto.copy_secondario ?? undefined,
      cta: contenuto.cta,
      hashtag: contenuto.hashtag ?? undefined,
    });
    if (esito.bloccato) {
      return NextResponse.json({ error: "Il linter ha bloccato la messa in coda.", linter: esito }, { status: 422 });
    }

    const pubblicazione = await metteInCoda({
      contenutoId,
      canale: canale as (typeof CANALI)[number],
      quando,
      linterEsito: esito,
    });
    await scriviLog({ contenutoId, azione: "programmato", attore: sessione.nome, attoreId: sessione.id, dettaglio: { canale, quando } });

    const testoPost = [
      contenuto.hook,
      contenuto.copy,
      contenuto.hashtag && contenuto.hashtag.length > 0 ? contenuto.hashtag.map((h) => `#${h}`).join(" ") : null,
      contenuto.cta,
    ]
      .filter(Boolean)
      .join("\n\n");

    let mediaUrls: string[] | undefined;
    if (contenuto.variante_scelta_id) {
      const variante = await getVariante(contenuto.variante_scelta_id);
      if (variante?.asset_url) mediaUrls = [variante.asset_url];
    }

    // Verifica dal vivo, a ogni chiamata: blocca se nessun account SHEis è collegato per questo canale.
    const esitoZernio = await pubblicaSuZernio({ contenutoId, canale, testo: testoPost, mediaUrls, programmatoPer: quando });
    if (!esitoZernio.ok) {
      await bloccaPubblicazione(pubblicazione.id, esitoZernio.motivo);
    }

    return NextResponse.json({ pubblicazione: { ...pubblicazione, motivo_blocco: esitoZernio.ok ? null : esitoZernio.motivo, stato: esitoZernio.ok ? pubblicazione.stato : "bloccato" } });
  } catch (e) {
    return rispondiErrore(e);
  }
}
