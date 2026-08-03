import { NextResponse } from "next/server";
import { caricaImmagine } from "@/lib/storage";
import { richiedeRuolo, RUOLI_PROPONE } from "@/lib/auth";
import { rispondiErrore } from "@/lib/api";

/**
 * Upload di un'immagine per un blocco "immagine" o per la copertina.
 * multipart/form-data, campo "file". Reale: bucket Supabase Storage
 * `sheis-articoli`, verificato dal vivo (vedi lib/storage.ts).
 */
export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await richiedeRuolo(RUOLI_PROPONE);
    const { id } = await params;

    const form = await req.formData().catch(() => null);
    const file = form?.get("file");
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "Manca il file (campo 'file', multipart/form-data)." }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const esito = await caricaImmagine(bytes, file.type, id);
    if (!esito.ok) {
      return NextResponse.json({ error: esito.errore }, { status: 502 });
    }
    return NextResponse.json({ url: esito.url });
  } catch (e) {
    return rispondiErrore(e);
  }
}
