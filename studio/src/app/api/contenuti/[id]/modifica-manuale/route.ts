import { NextResponse } from "next/server";
import { modificaContenutoManuale } from "@/lib/dati";
import { richiedeRuolo, RUOLI_PROPONE } from "@/lib/auth";
import { rispondiErrore } from "@/lib/api";
import { BRANDS, CANALI, FORMATI, LINGUE, PUBBLICI } from "@/lib/brand";
import { str } from "@/lib/openai";

/**
 * Editing MANUALE dei campi — l'azione che oggi non esiste da nessuna parte
 * e che il responsabile marketing userà di più (SPEC.md §"Differenza
 * importante rispetto alla console"). Nessuna chiamata AI: scrittura diretta.
 */
export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessione = await richiedeRuolo(RUOLI_PROPONE);
    const { id } = await params;
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

    const campi: Record<string, unknown> = {};
    if (typeof body.angolo === "string") campi.angolo = str(body.angolo);
    if (typeof body.hook === "string") campi.hook = str(body.hook);
    if (typeof body.copy === "string") campi.copy = str(body.copy);
    if (typeof body.copy_secondario === "string") campi.copy_secondario = str(body.copy_secondario) || null;
    if (typeof body.cta === "string") campi.cta = str(body.cta);
    if (Array.isArray(body.hashtag)) campi.hashtag = body.hashtag.filter((h): h is string => typeof h === "string");
    if (typeof body.canale === "string" && (CANALI as string[]).includes(body.canale)) campi.canale = body.canale;
    if (typeof body.brand === "string" && (BRANDS as string[]).includes(body.brand)) campi.brand = body.brand;
    if (typeof body.pubblico === "string" && (PUBBLICI as string[]).includes(body.pubblico)) campi.pubblico = body.pubblico;
    if (typeof body.lingua === "string" && (LINGUE as string[]).includes(body.lingua)) campi.lingua = body.lingua;
    if (typeof body.lingua_secondaria === "string" && (LINGUE as string[]).includes(body.lingua_secondaria)) campi.lingua_secondaria = body.lingua_secondaria;
    if (typeof body.formato === "string" && (FORMATI as string[]).includes(body.formato)) campi.formato = body.formato;
    if (typeof body.data_pubblicazione === "string") campi.data_pubblicazione = body.data_pubblicazione;

    if (Object.keys(campi).length === 0) {
      return NextResponse.json({ error: "Nessun campo valido da modificare." }, { status: 400 });
    }

    const aggiornato = await modificaContenutoManuale(id, campi, sessione.nome, sessione.id);
    return NextResponse.json({ contenuto: aggiornato });
  } catch (e) {
    return rispondiErrore(e);
  }
}
