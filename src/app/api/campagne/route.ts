import { NextResponse } from "next/server";
import { listaCampagne, creaCampagna } from "@/lib/dati";
import { richiedeRuolo, RUOLI_APPROVA } from "@/lib/auth";
import { rispondiErrore } from "@/lib/api";
import { costruisciDaBrief, motoreDisponibile } from "@/lib/motore-campagne";

/**
 * Media buyer su richiesta.
 *
 * ⚠️ Fino al 3/8 questa rotta salvava soltanto una riga — nome, obiettivo,
 * budget, stato «bloccata» — e nient'altro. Sembrava un media buyer e non lo
 * era: nessun blueprint scelto, nessun pubblico costruito, nessun controllo sul
 * tetto di spesa. Il motore vero esisteva già, completo e collaudato, in un
 * repository accanto; semplicemente nessuno lo chiamava.
 *
 * Ora si può scrivere un BRIEF in italiano e ottenere la campagna vera, con il
 * payload esatto che partirebbe per Meta. Resta possibile registrare solo una
 * richiesta (senza brief), perché a volte è tutto quello che serve.
 *
 * Non lancia mai su Meta: la creazione reale ha una tripla chiusura nel motore
 * e da qui non passa nessuna delle tre.
 */
export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET() {
  try {
    await richiedeRuolo(RUOLI_APPROVA);
    const campagne = await listaCampagne();
    // Chi apre la pagina deve sapere se il pulsante «costruisci» funziona
    // davvero, prima di premerlo e scoprirlo dopo.
    return NextResponse.json({ campagne, motore: motoreDisponibile() });
  } catch (e) {
    return rispondiErrore(e);
  }
}

export async function POST(req: Request) {
  try {
    const sessione = await richiedeRuolo(RUOLI_APPROVA);
    const body = (await req.json().catch(() => ({}))) as {
      brief?: string;
      nome?: string;
      obiettivo?: string;
      pubblico?: string;
      brand?: string;
      budgetGiorno?: number;
    };

    // Via principale: un brief in italiano → il motore costruisce la campagna
    // vera e la scrive lui stesso in sheis_campagne.
    const brief = body.brief?.trim();
    if (brief) {
      if (brief.length < 20) {
        return NextResponse.json(
          {
            error:
              "Il brief è troppo corto per costruire qualcosa di sensato. Servono almeno " +
              "obiettivo, pubblico e budget — per esempio: «Far conoscere BABILON ai " +
              "distributori spagnoli, 20 euro al giorno per due settimane, voglio " +
              "richieste di contatto».",
          },
          { status: 400 },
        );
      }
      const esito = await costruisciDaBrief(brief);
      const campagne = await listaCampagne();
      return NextResponse.json({
        ok: esito.ok,
        resoconto: esito.resoconto,
        campagna: esito.campagna,
        id: esito.id,
        campagne,
      });
    }

    // Via secondaria: registrare solo la richiesta, senza costruire nulla.
    // Resta perché a volte è tutto quello che serve — ma va detto che la
    // campagna non è stata costruita, altrimenti si scambia una nota per un
    // lavoro fatto.
    if (!body.nome?.trim()) {
      return NextResponse.json(
        { error: "Serve un brief (consigliato) oppure almeno un nome campagna." },
        { status: 400 },
      );
    }
    const campagna = await creaCampagna({
      nome: body.nome.trim(),
      obiettivo: body.obiettivo?.trim(),
      pubblico: body.pubblico?.trim(),
      brand: body.brand?.trim(),
      budgetGiorno: typeof body.budgetGiorno === "number" ? body.budgetGiorno : undefined,
      richiestaDa: sessione.id,
    });
    return NextResponse.json({
      campagna,
      avviso:
        "Registrata la richiesta, ma nessuna campagna è stata costruita: senza un brief " +
        "il motore non può scegliere il blueprint né calcolare budget e pubblico.",
    });
  } catch (e) {
    return rispondiErrore(e);
  }
}
