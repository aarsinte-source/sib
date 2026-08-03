import { NextResponse } from "next/server";
import { richiedeRuolo, RUOLI_PROPONE } from "@/lib/auth";
import { rispondiErrore } from "@/lib/api";
import { accoda } from "@/lib/lavori";
import {
  costruisciPiano,
  creaRicerca,
  listaRicerche,
  PIATTAFORME,
  TIPI_ANALISI,
  type TipoAnalisi,
} from "@/lib/ricerche";

/**
 * Passo 1 della procedura: l'analisi di mercato con dati reali.
 *
 * ⚠️ Questa rotta NON esegue la ricerca. La ACCODA e torna subito.
 * Misurato il 2026-08-04: una passata completa su cinque piattaforme impiega
 * 55 secondi di raccolta più 50 di lettura. Una funzione serverless muore
 * molto prima — e anche qui in locale, tenere aperta una richiesta HTTP per
 * due minuti significa che chiunque ricarichi la pagina perde tutto.
 *
 * Chi esegue è `~/alkemia-sheis-workers/esecutore.py`, che gira dove ci sono
 * le credenziali. Questa rotta scrive la riga e restituisce l'id da seguire.
 */
export const runtime = "nodejs";

const PAESI_PREVISTI = ["it", "es"];

export async function GET() {
  try {
    await richiedeRuolo(RUOLI_PROPONE);
    return NextResponse.json({ ricerche: await listaRicerche() });
  } catch (e) {
    return rispondiErrore(e);
  }
}

export async function POST(req: Request) {
  try {
    const sessione = await richiedeRuolo(RUOLI_PROPONE);
    const body = (await req.json().catch(() => ({}))) as {
      tema?: string;
      piattaforme?: string[];
      tipo?: string;
      paesi?: string[];
      conDomanda?: boolean;
      conAziende?: boolean;
      settoreAziende?: string;
      /** true = mostra soltanto il piano e il suo costo, senza accodare niente. */
      soloPiano?: boolean;
    };

    const tema = (body.tema ?? "").trim();
    if (!tema) {
      return NextResponse.json(
        { error: "Scrivi il tema da analizzare — una parola, un concetto o una linea prodotto." },
        { status: 400 },
      );
    }

    const piattaforme = (body.piattaforme ?? []).filter((p) => PIATTAFORME.includes(p));
    if (piattaforme.length === 0) {
      return NextResponse.json(
        { error: `Scegli almeno una piattaforma fra ${PIATTAFORME.join(", ")}.` },
        { status: 400 },
      );
    }

    const tipo = (TIPI_ANALISI.includes(body.tipo ?? "") ? body.tipo : "entrambi") as TipoAnalisi;
    const paesi = (body.paesi ?? ["it"]).map((p) => p.toLowerCase()).filter((p) => PAESI_PREVISTI.includes(p));

    const piano = costruisciPiano(piattaforme, tipo, {
      conDomanda: body.conDomanda,
      conAziende: body.conAziende,
    });

    // Il piano si guarda PRIMA di spendere. Chi lo legge può dire di no.
    if (body.soloPiano) {
      return NextResponse.json({ piano });
    }

    const ricerca = await creaRicerca({
      tema,
      piattaforme,
      tipo,
      paesi: paesi.length ? paesi : ["it"],
      creataDa: sessione.id,
    });

    const lavoro = await accoda({
      tipo: "ricerca-mercato",
      payload: {
        ricerca_id: ricerca.id,
        tema,
        piattaforme,
        tipo,
        paesi: paesi.length ? paesi : ["it"],
        parole_chiave: [tema],
        con_domanda: !!body.conDomanda,
        con_aziende: !!body.conAziende,
        settore_aziende: body.settoreAziende || null,
      },
      riferimentoTipo: "ricerca",
      riferimentoId: ricerca.id,
      // Una ricerca è il primo passo di tutto il resto: passa avanti alle
      // generazioni, che possono aspettare.
      priorita: 3,
      richiestoDa: sessione.id,
    });

    return NextResponse.json({ ricerca, piano, lavoro });
  } catch (e) {
    return rispondiErrore(e);
  }
}
