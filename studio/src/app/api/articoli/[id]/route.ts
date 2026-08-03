import { NextResponse } from "next/server";
import { getArticolo, aggiornaArticolo, articoliPerSlug, type Articolo } from "@/lib/dati";
import { normalizzaBlocchi } from "@/lib/articoli";
import { richiedeRuolo, RUOLI_PROPONE } from "@/lib/auth";
import { rispondiErrore } from "@/lib/api";

type CampiModificabili = Partial<
  Pick<Articolo, "titolo" | "sommario" | "blocchi" | "copertina" | "categoria" | "tag" | "seo">
>;

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await richiedeRuolo(RUOLI_PROPONE);
    const { id } = await params;
    const articolo = await getArticolo(id);
    if (!articolo) return NextResponse.json({ error: "Articolo non trovato." }, { status: 404 });
    const traduzioni = await articoliPerSlug(articolo.slug);
    return NextResponse.json({ articolo, traduzioni });
  } catch (e) {
    return rispondiErrore(e);
  }
}

/**
 * Modifica i campi di contenuto. Disponibile a chiunque proponga (dipendente
 * incluso) — MAI lo stato: quello passa solo dal gate /pubblica.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await richiedeRuolo(RUOLI_PROPONE);
    const { id } = await params;
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

    const campi: CampiModificabili = {};
    if (typeof body.titolo === "string") campi.titolo = body.titolo.trim();
    if (typeof body.sommario === "string") campi.sommario = body.sommario.trim() || null;
    if (typeof body.categoria === "string") campi.categoria = body.categoria.trim() || null;
    if (Array.isArray(body.tag)) campi.tag = body.tag.filter((t): t is string => typeof t === "string" && t.trim().length > 0);
    if (body.copertina && typeof body.copertina === "object") {
      const c = body.copertina as Record<string, unknown>;
      campi.copertina = { src: typeof c.src === "string" ? c.src : "", alt: typeof c.alt === "string" ? c.alt : "" };
    }
    if (body.seo && typeof body.seo === "object") {
      const s = body.seo as Record<string, unknown>;
      campi.seo = { title: typeof s.title === "string" ? s.title : undefined, description: typeof s.description === "string" ? s.description : undefined };
    }
    if (Array.isArray(body.blocchi)) campi.blocchi = normalizzaBlocchi(body.blocchi);

    if (Object.keys(campi).length === 0) {
      return NextResponse.json({ error: "Nessun campo valido da modificare." }, { status: 400 });
    }

    const articolo = await aggiornaArticolo(id, campi);
    return NextResponse.json({ articolo });
  } catch (e) {
    return rispondiErrore(e);
  }
}
