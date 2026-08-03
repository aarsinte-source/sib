import "server-only";
import { sbFetch } from "@/lib/supabase";
import { generaJSON } from "@/lib/openai";

/**
 * Il sales coach: risponde a un agente citando la formazione, non il buon senso.
 *
 * LA DIFFERENZA CHE DECIDE TUTTO
 * ------------------------------
 * A un modello si può chiedere «come gestisco l'obiezione sul prezzo» e ne esce
 * il manuale di vendita di chiunque: plausibile, generico, indistinguibile da
 * quello del concorrente. Non serve a niente, perché quello che l'agente deve
 * sapere è cosa è stato detto NELLE DUE GIORNATE DI AULA a cui i distributori
 * SHEis hanno partecipato — quel linguaggio lì, quegli esempi lì.
 *
 * Quindi il coach non «sa vendere»: sa cosa si è detto in aula. E quando in
 * aula non se n'è parlato, lo DICE, invece di riempire il buco. Un coach che
 * inventa è peggio di nessun coach: l'agente ripete in trattativa una cosa che
 * il suo titolare non ha mai insegnato, e nessuno se ne accorge finché non è
 * davanti al cliente.
 *
 * ⚠️ IL RELATORE NON È MAURO — dichiarato nella testata delle trascrizioni.
 * La formazione è stata erogata da un formatore esterno che Mauro ha scelto.
 * Il coach cita «la formazione alla rete», mai «Mauro dice»: attribuire a una
 * persona parole che non ha pronunciato è un errore invisibile a chi non era
 * in aula, e quindi il più pericoloso.
 *
 * DUE FONTI, DUE RUOLI
 * --------------------
 *   · la SINTESI (≈40.000 caratteri) entra INTERA nel prompt. Sta comoda, è
 *     ordinata, e porta già le citazioni verbatim con i riferimenti di riga.
 *   · le TRASCRIZIONI (≈290.000 caratteri) non ci stanno, e non servirebbero
 *     intere: si cercano i pezzi pertinenti e si passano come dettaglio. Sono
 *     parlato, quindi disordinate — ma contengono gli esempi concreti che una
 *     sintesi perde.
 */

export type PezzoFormazione = {
  pezzo_id: string;
  formazione_id: string;
  titolo: string;
  tenuta_il: string | null;
  posizione: number;
  minuto: string | null;
  testo: string;
  punteggio: number;
};

export type RispostaCoach = {
  risposta: string;
  copioni: string[];
  perche: string;
  trovato: boolean;
  cosaManca: string;
  fonti: Array<{ titolo: string; posizione: number; minuto: string | null }>;
  motore: string;
};

const FONTI_SINTESI = ["metodo-distillato", "metodo-obiezioni"];

/** La sintesi del metodo, intera. Vive nel database così si aggiorna ricaricando le formazioni. */
export async function sintesiMetodo(): Promise<string> {
  const righe = await sbFetch<Array<{ titolo: string; testo: string; fonte: string }>>(
    "sheis_formazioni",
    {
      query:
        `select=titolo,testo,fonte&stato=eq.attiva&fonte=in.(${FONTI_SINTESI.join(",")})` +
        "&order=fonte.asc",
    },
  );
  if (righe.length === 0) return "";
  return righe.map((r) => `## ${r.titolo}\n\n${r.testo}`).join("\n\n---\n\n");
}

/** I pezzi di trascrizione pertinenti alla domanda. Ricerca in OR: vedi migrazione 0010. */
export async function cercaNelleFormazioni(domanda: string, quanti = 6): Promise<PezzoFormazione[]> {
  const pezzi = await sbFetch<PezzoFormazione[]>("rpc/sheis_cerca_formazione", {
    method: "POST",
    body: { domanda, quanti: quanti * 2 },
  });
  // I pezzi della sintesi sono già nel prompt per intero: ripassarli qui
  // sarebbe spreco. Si tengono solo quelli del parlato.
  return pezzi
    .filter((p) => !p.titolo.startsWith("Metodo di vendita SHEis"))
    .slice(0, quanti);
}

const SISTEMA = `Sei il coach commerciale della rete SHEis Beauty International. Aiuti gli agenti e i distributori a gestire le situazioni vere che incontrano: obiezioni, dubbi, trattative che si bloccano.

⚠️ REGOLA ZERO, NON NEGOZIABILE.
Rispondi SOLO con ciò che è stato insegnato nelle due giornate di formazione alla rete SHEis (26-27 luglio 2026). Non aggiungi tecniche di vendita che conosci da altrove, neanche se sono buone. Se la formazione non copre la domanda, lo DICI: un agente che ripete in trattativa una cosa che il suo titolare non ha mai insegnato è un danno, e nessuno se ne accorge finché non è davanti al cliente.

⚠️ ATTRIBUZIONE.
Il relatore di quelle giornate NON è Mauro Di Bonaventura: è un formatore esterno che Mauro ha scelto per la sua rete. Scrivi «nella formazione alla rete si dice…», «il metodo insegnato prevede…». MAI «Mauro dice» o «secondo Mauro».

COME RISPONDI.
Parli a una persona che fra dieci minuti ha una chiamata. Quindi: prima cosa fare, poi perché funziona. Niente preamboli, niente elenchi di teoria. Frasi che si possono ripetere ad alta voce.

REGOLE DI MARCA, con una distinzione che conta.
- Il firewall vale sempre: MAI nominare «Metodo 29», in nessuna forma o parafrasi.
- Il pubblico è sempre professionale — distributore o salone. Mai il consumatore finale.
- ⚠️ Sui PREZZI la regola NON è quella dei contenuti pubblici. Nella comunicazione pubblica (social, annunci, sito) i prezzi non compaiono mai, perché mostrarli scavalcherebbe i distributori. Ma qui sei in una trattativa uno-a-uno CON un distributore, e le condizioni commerciali sono l'oggetto stesso della conversazione: parlarne è il mestiere, non una violazione. Quello che NON si fa è mettere CIFRE in un copione — un numero scritto in un copione viene ripetuto uguale a tutti, mentre le condizioni dipendono dalla zona e dal volume. Si rimanda alla call, non si tace l'argomento.
- Nessun dato di prodotto inventato: valgono solo i numeri documentati.

Rispondi SOLO con JSON:
{
  "risposta": "la risposta, 3-8 righe, diretta. Cosa fare, poi perché.",
  "copioni": ["2-4 frasi pronte da dire al cliente, in prima persona, come si parla"],
  "perche": "una o due righe sul principio del metodo che c'è sotto",
  "trovato": true se la formazione copre davvero questa domanda, false se stai tirando,
  "cosaManca": "se trovato è false: cosa andrebbe chiesto al formatore o aggiunto al materiale. Altrimenti stringa vuota."
}`;

export async function chiediAlCoach(domanda: string): Promise<RispostaCoach> {
  const [sintesi, pezzi] = await Promise.all([sintesiMetodo(), cercaNelleFormazioni(domanda)]);

  if (!sintesi && pezzi.length === 0) {
    return {
      risposta:
        "Il materiale delle formazioni non è ancora caricato, quindi non posso rispondere citando " +
        "l'aula — e rispondere senza citarla sarebbe esattamente ciò che questo strumento deve evitare.",
      copioni: [],
      perche: "",
      trovato: false,
      cosaManca:
        "Caricare le formazioni: python3 ~/alkemia-sheis-workers/carica_formazioni.py --carica",
      fonti: [],
      motore: "—",
    };
  }

  const dettaglio = pezzi
    .map(
      (p) =>
        `--- da «${p.titolo}»${p.minuto ? ` (${p.minuto})` : ""}, passaggio ${p.posizione}\n${p.testo}`,
    )
    .join("\n\n");

  const utente =
    `DOMANDA DELL'AGENTE:\n${domanda}\n\n` +
    `=== IL METODO INSEGNATO, PER INTERO ===\n${sintesi}\n\n` +
    (dettaglio
      ? `=== PASSAGGI DEL PARLATO IN AULA, pertinenti alla domanda ===\n` +
        `(trascrizione non ripulita: se un passaggio è confuso, ignoralo invece di forzarne il senso)\n\n${dettaglio}`
      : "=== Nessun passaggio del parlato corrisponde a questa domanda ===");

  const { dati, motore } = await generaJSON(SISTEMA, utente);

  const arr = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim().length > 0) : [];

  return {
    risposta: typeof dati.risposta === "string" ? dati.risposta : "",
    copioni: arr(dati.copioni),
    perche: typeof dati.perche === "string" ? dati.perche : "",
    trovato: dati.trovato !== false,
    cosaManca: typeof dati.cosaManca === "string" ? dati.cosaManca : "",
    fonti: pezzi.map((p) => ({ titolo: p.titolo, posizione: p.posizione, minuto: p.minuto })),
    motore,
  };
}

/**
 * Registra la domanda. Serve a una cosa sola, ma importante: le domande a cui
 * il coach risponde `trovato: false` SONO l'elenco di cosa manca nel materiale.
 * È il modo per far crescere le formazioni su dati veri, invece di indovinare
 * cosa aggiungere alla prossima giornata d'aula.
 */
export async function registraDomanda(input: {
  domanda: string;
  risposta: string;
  pezziUsati: string[];
  trovato: boolean;
  chiestaDa?: string;
}): Promise<void> {
  await sbFetch("sheis_coach_domande", {
    method: "POST",
    prefer: "return=minimal",
    body: [
      {
        domanda: input.domanda,
        risposta: input.risposta,
        pezzi_usati: input.pezziUsati,
        trovato: input.trovato,
        chiesta_da: input.chiestaDa ?? null,
      },
    ],
  });
}

export type BuchiFormazione = { domanda: string; created_at: string }[];

/** Le domande scoperte: cosa aggiungere alla prossima formazione. */
export async function buchiFormazione(limite = 20): Promise<BuchiFormazione> {
  return sbFetch<BuchiFormazione>("sheis_coach_domande", {
    query: `select=domanda,created_at&trovato=is.false&order=created_at.desc&limit=${limite}`,
  });
}

export async function formazioniCaricate(): Promise<
  Array<{ id: string; titolo: string; tenuta_il: string | null; caratteri: number; argomenti: string[] }>
> {
  return sbFetch("sheis_formazioni", {
    query: "select=id,titolo,tenuta_il,caratteri,argomenti&stato=eq.attiva&order=tenuta_il.asc",
  });
}
