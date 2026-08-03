import { NextResponse } from "next/server";
import { getSessione } from "@/lib/auth";
import { rispondiErrore } from "@/lib/api";
import { chiediAlCoach, formazioniCaricate, buchiFormazione, registraDomanda } from "@/lib/coach";

/**
 * Il coach commerciale.
 *
 * ⚠️ Il ruolo richiesto è il più basso: un agente di commercio è esattamente
 * chi deve poterlo usare. Le altre rotte del portale chiedono un ruolo che
 * approva o propone contenuti; qui la domanda è «come gestisco questa
 * obiezione», e chiuderla dietro un permesso di redazione significherebbe
 * escludere il solo pubblico per cui lo strumento esiste.
 */
export const runtime = "nodejs";

export async function GET() {
  try {
    const sessione = await getSessione();
    if (!sessione) return NextResponse.json({ error: "Devi accedere." }, { status: 401 });

    const [formazioni, buchi] = await Promise.all([
      formazioniCaricate(),
      // Le domande scoperte le vede chi decide cosa mettere nella prossima
      // giornata d'aula, non chi fa le telefonate.
      sessione.ruolo === "mauro" || sessione.ruolo === "marketing"
        ? buchiFormazione()
        : Promise.resolve([]),
    ]);

    return NextResponse.json({
      formazioni,
      buchi,
      caratteriTotali: formazioni.reduce((s, f) => s + (f.caratteri ?? 0), 0),
    });
  } catch (e) {
    return rispondiErrore(e);
  }
}

export async function POST(req: Request) {
  try {
    const sessione = await getSessione();
    if (!sessione) return NextResponse.json({ error: "Devi accedere." }, { status: 401 });

    const body = (await req.json().catch(() => ({}))) as { domanda?: string };
    const domanda = (body.domanda ?? "").trim();
    if (domanda.length < 5) {
      return NextResponse.json(
        { error: "Scrivi la situazione per esteso: «il cliente mi ha detto che…», «non riesco a…»." },
        { status: 400 },
      );
    }

    const esito = await chiediAlCoach(domanda);

    // Si registra sempre, anche quando la risposta è buona: le domande che
    // tornano spesso sono l'indice di cosa la rete non ha capito in aula.
    await registraDomanda({
      domanda,
      risposta: esito.risposta,
      pezziUsati: [],
      trovato: esito.trovato,
      chiestaDa: sessione.id,
    }).catch(() => {
      /* la registrazione non deve poter far fallire la risposta all'agente */
    });

    return NextResponse.json(esito);
  } catch (e) {
    return rispondiErrore(e);
  }
}
