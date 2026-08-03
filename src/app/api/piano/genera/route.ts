import { NextResponse } from "next/server";
import { openaiJSON, pick, str } from "@/lib/openai";
import { BRANDS, CANALI, FORMATI, LINGUE, PUBBLICI, regoleBrandTesto } from "@/lib/brand";
import { creaPiano, creaContenuti, type NuovoContenuto } from "@/lib/dati";
import { richiedeRuolo, RUOLI_PROPONE } from "@/lib/auth";
import { rispondiErrore } from "@/lib/api";
import type { Analisi } from "@/app/api/analisi/route";

/**
 * Passo 2 — dall'analisi, il piano editoriale: 8 post distribuiti sui 3 brand
 * e sui 3 pubblici, scritti secondo il mix formati e le regole hashtag
 * misurate in BRAND-IDENTITY (SPEC.md §"Il cuore").
 */
export const runtime = "nodejs";

const SYSTEM = `Sei il direttore editoriale del reparto marketing di SHEis Beauty International (hair-care professionale B2B).
${regoleBrandTesto()}
Dati un tema e la sua analisi di mercato, genera un piano editoriale di ESATTAMENTE 8 post.
Distribuisci sui 3 brand (sheis-color, babilon, younic) e sui 3 pubblici (distributore-estero, distributore-italia, salone).
Rispetta il mix formati: circa metà "video" (il reel — il formato che vince secondo i dati misurati), il resto diviso fra "carosello" e "statico" (poco "statico": è il formato più debole misurato sul profilo).
Ogni post è bilingue: il campo "copy" nella lingua principale, "copy_secondario" nella lingua secondaria (default inglese), sullo stesso schema misurato del profilo reale.
Rispondi SOLO con JSON nella forma {"posts": [ ...8 oggetti... ]}. Ogni post ha:
- "canale": uno di instagram|facebook|tiktok|linkedin
- "brand": uno di sheis-color|babilon|younic
- "pubblico": uno di distributore-estero|distributore-italia|salone
- "lingua": uno di it|en|es (usa 'es' per distributore-estero come priorità beachhead Spagna, 'en' per estero generico, 'it' per Italia/saloni)
- "linguaSecondaria": la seconda lingua della caption bilingue (default "en", "it" se lingua principale è "en" o "es")
- "formato": uno di statico|carosello|video|ugc
- "angolo": una riga che riassume l'angolo strategico
- "hook": il gancio, prima riga
- "copy": corpo del post nella lingua principale
- "copySecondario": corpo nella lingua secondaria
- "cta": call to action (mai verso un negozio/e-commerce)
- "hashtag": array di 8-15 hashtag misti italiano/inglese, generici + specifici professionali, senza il simbolo #
Nessun testo fuori dal JSON.`;

function isoData(offsetGiorni: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetGiorni);
  return d.toISOString().slice(0, 10);
}

export async function POST(req: Request) {
  try {
    const sessione = await richiedeRuolo(RUOLI_PROPONE);

    const body = (await req.json().catch(() => ({}))) as { query?: string; analisi?: Analisi };
    const query = (body.query ?? "").trim();
    const analisi = body.analisi;
    if (!query || !analisi) {
      return NextResponse.json({ error: "Serve prima un'analisi di mercato." }, { status: 400 });
    }

    const user = `Tema: "${query}".
Analisi di mercato:
- pain: ${analisi.pain.join("; ")}
- desideri: ${analisi.desideri.join("; ")}
- lessico: ${analisi.lessico.join("; ")}
- angoli: ${analisi.angoli.join("; ")}`;

    const raw = (await openaiJSON(SYSTEM, user)) as Record<string, unknown>;
    const lista = Array.isArray(raw.posts) ? raw.posts : [];

    const piano = await creaPiano(query);

    const righe: NuovoContenuto[] = lista.slice(0, 8).map((item, i) => {
      const o = (item ?? {}) as Record<string, unknown>;
      const lingua = pick(o.lingua, LINGUE, "it");
      return {
        piano_id: piano.id,
        data_pubblicazione: isoData(i * 2 + 3),
        canale: pick(o.canale, CANALI, "instagram"),
        brand: pick(o.brand, BRANDS, "sheis-color"),
        pubblico: pick(o.pubblico, PUBBLICI, "distributore-estero"),
        lingua,
        lingua_secondaria: pick(o.linguaSecondaria, LINGUE, lingua === "it" ? "en" : "it"),
        formato: pick(o.formato, FORMATI, "video"),
        angolo: str(o.angolo, "—"),
        hook: str(o.hook, "—"),
        copy: str(o.copy, "—"),
        copy_secondario: str(o.copySecondario, "") || null,
        cta: str(o.cta, "Scrivici per saperne di più."),
        hashtag: Array.isArray(o.hashtag) ? o.hashtag.filter((h): h is string => typeof h === "string").slice(0, 15) : null,
        stato: "in_attesa",
        creato_da: sessione.id,
      };
    });

    if (righe.length === 0) {
      return NextResponse.json({ error: "Il piano è tornato vuoto. Riprova con un tema più specifico." }, { status: 502 });
    }

    const contenuti = await creaContenuti(righe);
    return NextResponse.json({ piano, contenuti });
  } catch (e) {
    return rispondiErrore(e);
  }
}
