import { NextResponse } from "next/server";
import { getSessione } from "@/lib/auth";
import { rispondiErrore } from "@/lib/api";
import { generaJSON } from "@/lib/openai";
import { REGOLE_VOCE, ripulisci } from "@/lib/voce-umana";
import { sintesiMetodo } from "@/lib/coach";

/**
 * La demo dell'outreach: Andrei fa il prospect, il sistema risponde.
 *
 * PERCHÉ ESISTE UNA DEMO E NON SI PROVA SUL VERO
 * ---------------------------------------------
 * Il tono di un primo messaggio a freddo si giudica leggendolo, non
 * descrivendolo. E si giudica PRIMA, perché un messaggio sbagliato a un
 * distributore non si ritira: quel contatto è bruciato, e in un settore dove i
 * distributori italiani sono qualche centinaio, bruciarne uno conta.
 *
 * ⚠️ Questa rotta NON invia niente e non tocca la pipeline di outreach vera.
 * Le conversazioni finiscono in `sheis_outreach_demo`, una tabella separata con
 * un vincolo che impone `demo = true`. Se un giorno qualcuno provasse a
 * riusarla per i contatti veri, il database lo rifiuterebbe — che è più
 * affidabile di un commento che dice di non farlo.
 */
export const runtime = "nodejs";

const SISTEMA = `${REGOLE_VOCE}

{metodo}

SEI IN UNA CONVERSAZIONE con un professionista del settore capelli che ti ha risposto. Rispondi al suo ultimo messaggio.

Rispondi SOLO con JSON:
{
  "messaggio": "il messaggio da mandare, con gli a capo dove vanno",
  "cosa_sto_facendo": "una riga: in che punto della conversazione sei e cosa stai cercando di capire",
  "prossimo_passo": "cosa faresti se rispondesse in modo positivo"
}`;

type Messaggio = { da: "prospect" | "noi"; testo: string };

export async function POST(req: Request) {
  try {
    const sessione = await getSessione();
    if (!sessione) return NextResponse.json({ error: "Devi accedere." }, { status: 401 });

    const body = (await req.json().catch(() => ({}))) as {
      messaggi?: Messaggio[];
      profilo?: { tipo?: string; nome?: string; paese?: string; note?: string };
      lingua?: string;
    };

    const messaggi = (body.messaggi ?? []).filter((m) => m?.testo?.trim());
    const profilo = body.profilo ?? {};
    const lingua = body.lingua ?? "it";

    // Il metodo di vendita entra nel prompt: è il linguaggio che i distributori
    // SHEis hanno già sentito in aula. Un messaggio che lo usa suona come «uno
    // di famiglia», uno che non lo usa suona come un fornitore qualunque.
    const metodo = await sintesiMetodo().catch(() => "");
    const sistema = SISTEMA.replace(
      "{metodo}",
      metodo
        ? `IL METODO CHE LA RETE CONOSCE (usalo per il MODO di ragionare, non per citarlo):\n${metodo.slice(0, 14000)}`
        : "",
    );

    const chi =
      `CON CHI STAI PARLANDO: ${profilo.tipo ?? "distributore"}` +
      (profilo.nome ? ` di nome ${profilo.nome}` : "") +
      (profilo.paese ? `, in ${profilo.paese}` : "") +
      (profilo.note ? `. ${profilo.note}` : "") +
      `.\nLINGUA: ${lingua === "es" ? "spagnolo" : lingua === "en" ? "inglese" : "italiano"}.`;

    const conversazione = messaggi.length
      ? messaggi.map((m) => `${m.da === "noi" ? "IO" : "LUI"}: ${m.testo}`).join("\n\n")
      : "(nessuno scambio ancora: scrivi tu il primo messaggio)";

    const { dati, motore } = await generaJSON(sistema, `${chi}\n\nLA CONVERSAZIONE FINORA:\n${conversazione}`);

    const grezzo = typeof dati.messaggio === "string" ? dati.messaggio : "";
    const { testo, correzioni, sospetti } = ripulisci(grezzo);

    return NextResponse.json({
      messaggio: testo,
      correzioni,
      sospetti,
      cosaStoFacendo: typeof dati.cosa_sto_facendo === "string" ? dati.cosa_sto_facendo : "",
      prossimoPasso: typeof dati.prossimo_passo === "string" ? dati.prossimo_passo : "",
      motore,
    });
  } catch (e) {
    return rispondiErrore(e);
  }
}
