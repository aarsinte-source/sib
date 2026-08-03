import "server-only";
import { sbFetch } from "@/lib/supabase";
import { statoCoda } from "@/lib/lavori";

/**
 * LE FASI — la spina dorsale del portale.
 *
 * PERCHÉ ESISTE QUESTO FILE
 * -------------------------
 * Prima il portale era un insieme di pagine slegate: Analisi, Piano,
 * Creatività, Calendario. Ognuna funzionava, ma nessuna sapeva delle altre.
 * Chi entrava non aveva modo di capire *a che punto è il lavoro* — e
 * soprattutto non c'era niente che impedisse di generare trenta creative da un
 * piano che nessuno aveva approvato.
 *
 * Qui la produzione è una CATENA. Ogni fase dichiara tre cose:
 *
 *   · di cosa ha bisogno per poter partire  (`richiede`)
 *   · come si misura se è fatta             (`misura`)
 *   · cosa consegna alla fase successiva    (`consegna`)
 *
 * Lo stato NON è memorizzato da nessuna parte: si MISURA dal database ogni
 * volta. Uno stato salvato è uno stato che prima o poi mente — basta che
 * qualcuno cancelli un contenuto e la fase resta «fatta» per sempre. Uno stato
 * misurato non può divergere da ciò che descrive.
 *
 * LA REGOLA CHE GOVERNA IL BLOCCO
 * -------------------------------
 * Una fase bloccata NON nasconde il pulsante: lo mostra spento e dice cosa
 * manca. Nascondere significa lasciare qualcuno a cercare una funzione che
 * crede di non aver trovato; dire significa dargli il prossimo passo.
 */

export type IdFase =
  | "analisi"
  | "piano"
  | "pilastri"
  | "testi"
  | "creative"
  | "approvazione"
  | "uscita";

export type StatoFase = "bloccata" | "da_fare" | "in_corso" | "fatta";

export type Fase = {
  id: IdFase;
  numero: number;
  titolo: string;
  cosa: string;
  consegna: string;
  percorso: string;
  stato: StatoFase;
  /** Quello che manca perché la fase possa partire. Vuoto se può partire. */
  manca: string[];
  /** La misura, in italiano: «8 contenuti su 30», «nessuna variante approvata». */
  misura: string;
  /** Il prossimo gesto concreto, quando la fase è aperta. */
  prossimoPasso: string;
};

export type QuadroFasi = {
  fasi: Fase[];
  correnteId: IdFase;
  coda: Awaited<ReturnType<typeof statoCoda>>;
};

/* --------------------------------------------------------------- conteggi */

type Conteggi = {
  ricercheCompletate: number;
  ricercaRecente: { id: string; tema: string; conPillar: boolean } | null;
  pillar: number;
  contenuti: number;
  contenutiConTesti: number;
  contenutiApprovati: number;
  contenutiConUgc: number;
  contenutiConGrafica: number;
  variantiPronte: number;
  variantiApprovate: number;
  programmati: number;
  pubblicati: number;
};

async function conta(): Promise<Conteggi> {
  // Ogni interrogazione è indipendente: se una tabella non esiste ancora
  // (migrazione non applicata) le altre devono comunque rispondere, così il
  // quadro dice «manca lo schema» invece di non dire niente.
  const sicuro = async <T,>(p: Promise<T>, difetto: T): Promise<T> => {
    try {
      return await p;
    } catch {
      return difetto;
    }
  };

  const [ricerche, pillar, contenuti, varianti, pubblicazioni] = await Promise.all([
    sicuro(
      sbFetch<Array<{ id: string; tema: string; sintesi: { pillar?: unknown[] } | null }>>(
        "sheis_ricerche",
        { query: "select=id,tema,sintesi&stato=eq.completata&order=created_at.desc&limit=5" },
      ),
      [],
    ),
    sicuro(sbFetch<Array<{ id: string }>>("sheis_pillar", { query: "select=id" }), []),
    sicuro(
      sbFetch<
        Array<{
          id: string;
          stato: string;
          copy: string | null;
          copy_ugc: string | null;
          copy_grafica: unknown;
          formato: string;
        }>
      >("sheis_contenuti", { query: "select=id,stato,copy,copy_ugc,copy_grafica,formato" }),
      [],
    ),
    sicuro(sbFetch<Array<{ id: string; stato: string }>>("sheis_varianti", { query: "select=id,stato" }), []),
    sicuro(
      sbFetch<Array<{ id: string; stato: string }>>("sheis_pubblicazioni", { query: "select=id,stato" }),
      [],
    ),
  ]);

  const recente = ricerche[0];
  const video = (c: { formato: string }) => c.formato === "video" || c.formato === "ugc";

  return {
    ricercheCompletate: ricerche.length,
    ricercaRecente: recente
      ? {
          id: recente.id,
          tema: recente.tema,
          conPillar: Array.isArray(recente.sintesi?.pillar) && recente.sintesi!.pillar!.length > 0,
        }
      : null,
    pillar: pillar.length,
    contenuti: contenuti.length,
    contenutiConTesti: contenuti.filter((c) => (c.copy ?? "").trim().length > 10).length,
    contenutiApprovati: contenuti.filter((c) => c.stato === "approvato").length,
    // Il copy UGC serve solo dove c'è un video: pretenderlo su un carosello
    // farebbe risultare la fase incompleta per sempre.
    contenutiConUgc: contenuti.filter((c) => !video(c) || (c.copy_ugc ?? "").trim().length > 10).length,
    contenutiConGrafica: contenuti.filter((c) => c.copy_grafica != null).length,
    variantiPronte: varianti.filter((v) => v.stato === "pronta" || v.stato === "approvata").length,
    variantiApprovate: varianti.filter((v) => v.stato === "approvata").length,
    programmati: pubblicazioni.filter((p) => p.stato === "in_coda").length,
    pubblicati: pubblicazioni.filter((p) => p.stato === "pubblicato" || p.stato === "inviato").length,
  };
}

/* ----------------------------------------------------------------- quadro */

export async function quadroFasi(): Promise<QuadroFasi> {
  const [c, coda] = await Promise.all([conta(), statoCoda().catch(() => null)]);

  const fasi: Fase[] = [
    {
      id: "analisi",
      numero: 1,
      titolo: "Analisi di mercato",
      cosa: "Sei piattaforme, organico e pubblicitario, con dati veri: post con le loro interazioni, inserzioni con da quanti giorni girano, volumi di ricerca.",
      consegna: "Problemi, desideri, lessico reale, angoli e cosa sta funzionando adesso.",
      percorso: "/ricerca",
      stato: c.ricercheCompletate > 0 ? "fatta" : "da_fare",
      manca: [],
      misura:
        c.ricercheCompletate > 0
          ? `${c.ricercheCompletate} analisi completate · l'ultima: «${c.ricercaRecente?.tema}»`
          : "nessuna analisi ancora",
      prossimoPasso:
        c.ricercheCompletate > 0 ? "Rifai l'analisi su un altro tema" : "Scegli il tema e le piattaforme",
    },
    {
      id: "pilastri",
      numero: 2,
      titolo: "Pilastri di contenuto",
      cosa: "Quattro o cinque pilastri con la loro quota, nati da cosa i dati dicono che funziona in questo mercato — non categorie generiche.",
      consegna: "La struttura che governa la distribuzione dei 30 giorni.",
      percorso: "/ricerca",
      stato: c.ricercaRecente?.conPillar || c.pillar > 0 ? "fatta" : c.ricercheCompletate > 0 ? "da_fare" : "bloccata",
      manca: c.ricercheCompletate > 0 ? [] : ["un'analisi di mercato completata"],
      misura: c.pillar > 0 ? `${c.pillar} pilastri salvati sul piano` : c.ricercaRecente?.conPillar ? "pilastri proposti dall'analisi, non ancora fissati su un piano" : "nessun pilastro",
      prossimoPasso: "Rivedi i pilastri proposti e passa al piano",
    },
    {
      id: "piano",
      numero: 3,
      titolo: "Piano a 30 giorni",
      cosa: "Un post per giorno, distribuito sui pilastri, sui marchi, sui pubblici e sulle lingue, con la data di uscita.",
      consegna: "Trenta contenuti in bozza, ciascuno agganciato al suo pilastro.",
      percorso: "/piano",
      stato: c.contenuti >= 25 ? "fatta" : c.contenuti > 0 ? "in_corso" : c.ricercheCompletate > 0 ? "da_fare" : "bloccata",
      manca: c.ricercheCompletate > 0 ? [] : ["un'analisi di mercato completata"],
      misura: c.contenuti > 0 ? `${c.contenuti} contenuti nel piano` : "piano non ancora generato",
      prossimoPasso: c.contenuti > 0 ? "Rivedi i contenuti generati" : "Genera il piano dall'ultima analisi",
    },
    {
      id: "testi",
      numero: 4,
      titolo: "Testi: descrizione, UGC, grafica",
      cosa: "Tre mestieri diversi per ogni contenuto: la didascalia del post, il parlato del video UGC, e le parole che vanno stampate sull'immagine.",
      consegna: "Ogni contenuto pronto da approvare a livello testuale.",
      percorso: "/piano",
      stato:
        c.contenuti === 0
          ? "bloccata"
          : c.contenutiConTesti >= c.contenuti && c.contenutiConGrafica >= c.contenuti
            ? "fatta"
            : c.contenutiConTesti > 0
              ? "in_corso"
              : "da_fare",
      manca: c.contenuti === 0 ? ["un piano editoriale generato"] : [],
      misura:
        c.contenuti === 0
          ? "nessun contenuto"
          : `${c.contenutiConTesti}/${c.contenuti} con didascalia · ${c.contenutiConGrafica}/${c.contenuti} con testo grafico`,
      prossimoPasso: "Scrivi o rigenera i testi mancanti",
    },
    {
      id: "approvazione",
      numero: 5,
      titolo: "Approvazione dei testi",
      cosa: "Mauro decide contenuto per contenuto: approva, modifica o rifiuta. Ogni decisione finisce nel registro con chi e quando.",
      consegna: "Solo gli approvati passano alla generazione — che costa crediti.",
      percorso: "/piano",
      stato:
        c.contenuti === 0
          ? "bloccata"
          : c.contenutiApprovati >= c.contenuti
            ? "fatta"
            : c.contenutiApprovati > 0
              ? "in_corso"
              : "da_fare",
      manca: c.contenutiConTesti === 0 ? ["testi scritti su almeno un contenuto"] : [],
      misura: c.contenuti === 0 ? "nessun contenuto" : `${c.contenutiApprovati}/${c.contenuti} approvati`,
      prossimoPasso: "Approva, modifica o rifiuta i contenuti in attesa",
    },
    {
      id: "creative",
      numero: 6,
      titolo: "Creatività",
      cosa: "Le immagini e i video generati su Higgsfield, uno alla volta o tutti insieme, e mostrati come apparirebbero sui social col copy sotto.",
      consegna: "Creative viste in anteprima, approvate, modificate o rifiutate.",
      percorso: "/creativita",
      stato:
        c.contenutiApprovati === 0
          ? "bloccata"
          : c.variantiApprovate > 0
            ? "fatta"
            : c.variantiPronte > 0
              ? "in_corso"
              : "da_fare",
      manca: c.contenutiApprovati === 0 ? ["almeno un contenuto approvato: generare costa crediti"] : [],
      misura:
        c.variantiPronte === 0
          ? "nessuna creativa generata"
          : `${c.variantiPronte} generate · ${c.variantiApprovate} approvate`,
      prossimoPasso: "Genera una creativa o generale tutte",
    },
    {
      id: "uscita",
      numero: 7,
      titolo: "Programmazione e uscita",
      cosa: "Il contenuto approvato va in coda su Zernio, alla data del piano o subito. Il linter di marca gira sempre prima, e la finestra oraria vale sempre.",
      consegna: "Post programmati o pubblicati.",
      percorso: "/calendario",
      stato:
        c.variantiApprovate === 0
          ? "bloccata"
          : c.pubblicati > 0
            ? "fatta"
            : c.programmati > 0
              ? "in_corso"
              : "da_fare",
      manca: c.variantiApprovate === 0 ? ["almeno una creativa approvata"] : [],
      misura:
        c.programmati + c.pubblicati === 0
          ? "niente in coda"
          : `${c.programmati} programmati · ${c.pubblicati} usciti`,
      prossimoPasso: "Programma alla data del piano o pubblica subito",
    },
  ];

  // La fase corrente è la prima non finita che può partire. Se sono tutte
  // finite, resta l'ultima: non si torna all'inizio da soli.
  const corrente =
    fasi.find((f) => f.stato === "in_corso") ??
    fasi.find((f) => f.stato === "da_fare") ??
    fasi[fasi.length - 1];

  return {
    fasi,
    correnteId: corrente.id,
    coda: coda ?? {
      inAttesa: 0,
      inCorso: 0,
      falliti24h: 0,
      attesaPiuVecchiaMin: null,
      esecutoreVivo: false,
      nota:
        "La coda dei lavori non è raggiungibile: la migrazione 0008 non è ancora stata applicata. " +
        "Finché manca, ricerca e generazione non possono partire.",
    },
  };
}

export const STATO_FASE_LABEL: Record<StatoFase, string> = {
  bloccata: "aspetta",
  da_fare: "da fare",
  in_corso: "in corso",
  fatta: "fatta",
};

export const STATO_FASE_COLORE: Record<StatoFase, string> = {
  bloccata: "#9CA3AF",
  da_fare: "#1D4ED8",
  in_corso: "#B45309",
  fatta: "#047857",
};
