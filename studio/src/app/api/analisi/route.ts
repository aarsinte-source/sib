import { NextResponse } from "next/server";
import { generaJSON, segnaliMercato, strArray, type Motore } from "@/lib/openai";
import { regoleBrandTesto } from "@/lib/brand";
import { richiedeRuolo, RUOLI_PROPONE } from "@/lib/auth";
import { rispondiErrore } from "@/lib/api";

/**
 * Passo 1 — Analisi di mercato, su richiesta. Non persistita: alimenta il
 * passo 2 (genera piano) restando nello stato del browser, come nel prototipo
 * di ~/alkemia-sheis-console (SPEC.md §"Da riusare").
 */
export const runtime = "nodejs";

const SYSTEM = `Sei l'analista di mercato del reparto marketing di SHEis Beauty International, cosmetica professionale hair-care B2B (il pubblico sono distributori e saloni, mai il consumatore finale).
${regoleBrandTesto()}
Ti verrà dato UNA parola, un concetto o una linea prodotto. Analizza il mercato PROFESSIONALE su QUEL tema.
Rispondi SOLO con un oggetto JSON con questi campi, tutti array di stringhe brevi in italiano:
- "pain": 4-6 problemi/frustrazioni concreti di distributori o saloni legati al tema;
- "desideri": 4-6 desideri o obiettivi;
- "lessico": 6-10 parole o frasi reali che i professionisti del settore usano su questo tema;
- "angoli": 4-6 angoli di comunicazione B2B, brand-safe, utilizzabili in un contenuto.
Nessun testo fuori dal JSON.`;

export type Analisi = {
  query: string;
  pain: string[];
  desideri: string[];
  lessico: string[];
  angoli: string[];
  fonti: string[];
  creatoIl: string;
  /** Quale motore ha generato questa analisi — visibile in UI (SPEC.md §"Il degrado si dichiara"). */
  motore: Motore;
  /** Motori falliti prima di quello che ha risposto. Mostrato in UI: un ripiego silenzioso è un guasto mai riparato. */
  ripieghi: string[];
};

export async function POST(req: Request) {
  try {
    await richiedeRuolo(RUOLI_PROPONE);

    const body = (await req.json().catch(() => ({}))) as { query?: string };
    const query = (body.query ?? "").trim();
    if (!query) {
      return NextResponse.json({ error: "Scrivi una parola o un concetto da analizzare." }, { status: 400 });
    }

    const fonti = await segnaliMercato(query);
    const user =
      `Tema: "${query}".` +
      (fonti.length ? `\n\nSegnali grezzi dal web (spunti, non citarne prezzi):\n- ${fonti.join("\n- ")}` : "");

    const { dati: raw, motore, ripieghi } = await generaJSON(SYSTEM, user);

    const analisi: Analisi = {
      query,
      pain: strArray(raw.pain),
      desideri: strArray(raw.desideri),
      lessico: strArray(raw.lessico),
      angoli: strArray(raw.angoli),
      fonti,
      creatoIl: new Date().toISOString(),
      motore,
      ripieghi,
    };

    return NextResponse.json({ analisi });
  } catch (e) {
    return rispondiErrore(e);
  }
}
