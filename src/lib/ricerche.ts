import "server-only";
import fonti from "@/brand/fonti-ricerca.json";
import { sbFetch } from "@/lib/supabase";

/**
 * Le ricerche di mercato: il passo 1 della procedura.
 *
 * DUE COSE CHE QUESTO MODULO FA E CHE PRIMA NON SI FACEVANO
 * ---------------------------------------------------------
 * 1. **Il piano si vede prima di eseguirlo.** `costruisciPiano` dice quali
 *    fonti verranno interrogate, per quali piattaforme, e QUALI COSTANO. Chi
 *    legge può dire di no prima che il denaro sia speso. La regola è scritta
 *    in `fonti-ricerca.json`: ScrapeCreators e DataForSEO sono a canone (una
 *    chiamata in più non costa nulla), Monid consuma saldo vero.
 *
 * 2. **La ricerca resta.** Prima l'analisi viveva nello stato del browser e
 *    moriva al primo aggiornamento di pagina. Un piano editoriale nato da
 *    un'analisi che non esiste più non è difendibile: nessuno può più
 *    chiedergli «su cosa ti basavi?».
 *
 * ⚠️ `fonti-ricerca.json` è una COPIA tenuta allineata da
 * ~/alkemia-sheis-backend/sincronizza_brand.py. Non si modifica qui: la fonte
 * è nel backend, e il gate di allineamento fallisce se le due divergono.
 * Scriverla due volte significherebbe che un giorno il portale dichiara un
 * costo e l'esecutore ne paga un altro.
 */

export const PIATTAFORME = fonti.piattaforme as readonly string[];
export const TIPI_ANALISI = fonti.tipi_analisi as readonly string[];

export type TipoAnalisi = "organico" | "pubblicitario" | "entrambi";
export type StatoRicerca = "in_attesa" | "in_corso" | "completata" | "fallita" | "annullata";

export const PIATTAFORMA_LABEL: Record<string, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
  youtube: "YouTube",
  linkedin: "LinkedIn",
  google: "Google",
};

export const TIPO_LABEL: Record<TipoAnalisi, string> = {
  organico: "Solo organico",
  pubblicitario: "Solo pubblicitario",
  entrambi: "Organico e pubblicitario",
};

export type PillarProposto = {
  nome: string;
  descrizione: string;
  obiettivo: "attrazione" | "consapevolezza" | "vendita" | "fiducia";
  quota_pct: number;
  esempi?: string[];
  lessico?: string[];
};

export type SintesiRicerca = {
  pain?: string[];
  desideri?: string[];
  lessico?: string[];
  angoli?: string[];
  cosa_funziona?: string[];
  concorrenti_attivi?: Array<{ nome?: string; dove?: string; segnale?: string }>;
  pillar?: PillarProposto[];
  buchi?: string[];
  errore?: string;
  _nota_quote?: string;
  modello?: string;
};

export type Ricerca = {
  id: string;
  tema: string;
  piattaforme: string[];
  tipo: TipoAnalisi;
  paesi: string[];
  stato: StatoRicerca;
  piano: { racconto?: string; passi?: unknown[]; saltati?: string[] } | null;
  risultati: Record<string, unknown> | null;
  sintesi: SintesiRicerca | null;
  fonti_usate: string[] | null;
  costo_monid_eur: number | null;
  errore: string | null;
  creata_da: string | null;
  created_at: string;
  updated_at: string;
};

/* ------------------------------------------------------------------ piano */

export type PassoPiano = {
  capacita: string;
  fonte: string;
  cosa: string;
  costo: string;
  aConsumo: boolean;
  piattaforme: string[];
};

export type PianoRicerca = {
  passi: PassoPiano[];
  saltati: string[];
  aCanone: number;
  aConsumo: number;
};

type Capacita = {
  fonte: string;
  cosa: string;
  come: string;
  costo: string;
  attenzione?: string;
  /** false quando la fonte è stata MISURATA non funzionante (es. libreria inserzioni TikTok: 404). */
  disponibile?: boolean;
};

/**
 * Cosa verrà interrogato, e quanto costa. Stessa logica di
 * `ricerca_mercato.costruisci_piano` lato Python — e stessa fonte dati, che è
 * il motivo per cui i due non possono divergere.
 */
export function costruisciPiano(
  piattaforme: string[],
  tipo: TipoAnalisi,
  extra: { conDomanda?: boolean; conAziende?: boolean } = {},
): PianoRicerca {
  const cap = fonti.capacita as unknown as Record<string, Capacita>;
  const alias = Object.fromEntries(
    Object.entries(fonti.alias_capacita ?? {}).filter(([k]) => !k.startsWith("_")),
  ) as Record<string, string>;

  const tipi = tipo === "entrambi" ? ["organico", "pubblicitario"] : [tipo];
  const passi: PassoPiano[] = [];
  const saltati: string[] = [];

  for (const grezza of piattaforme) {
    const p = grezza.trim().toLowerCase();
    if (!PIATTAFORME.includes(p)) {
      saltati.push(`${p}: piattaforma non prevista`);
      continue;
    }
    for (const t of tipi) {
      const chiave = `${t}-${p}`;
      // Instagram e Facebook condividono UNA sola libreria inserzioni: una
      // chiamata vale per due piattaforme, e va detto — altrimenti chi le
      // chiede entrambe crede di aver pagato due ricerche.
      const risolta = alias[chiave] ?? chiave;
      const c = cap[risolta];
      if (!c) {
        saltati.push(`${chiave}: nessuna fonte copre questa combinazione`);
        continue;
      }
      // Una fonte dichiarata non disponibile NON entra nel piano: entrarci
      // significherebbe promettere un dato che non arriverà, e chi legge il
      // risultato vuoto ne trarrebbe una conclusione di mercato da un guasto.
      if (c.disponibile === false) {
        saltati.push(`${chiave}: ${c.attenzione ?? "fonte non disponibile"}`);
        continue;
      }
      const gia = passi.find((x) => x.capacita === risolta);
      if (gia) {
        gia.piattaforme.push(p);
        continue;
      }
      passi.push({
        capacita: risolta,
        fonte: c.fonte,
        cosa: c.cosa,
        costo: c.costo,
        aConsumo: c.fonte === "monid",
        piattaforme: [p],
      });
    }
  }

  for (const [attivo, chiave] of [
    [extra.conDomanda, "domanda-di-ricerca"],
    [extra.conAziende, "aziende-per-settore-e-paese"],
  ] as const) {
    if (!attivo) continue;
    const c = cap[chiave];
    if (!c) continue;
    passi.push({
      capacita: chiave,
      fonte: c.fonte,
      cosa: c.cosa,
      costo: c.costo,
      aConsumo: c.fonte === "monid",
      piattaforme: [],
    });
  }

  return {
    passi,
    saltati,
    aCanone: passi.filter((p) => !p.aConsumo).length,
    aConsumo: passi.filter((p) => p.aConsumo).length,
  };
}

/* ------------------------------------------------------------------- dati */

export async function creaRicerca(input: {
  tema: string;
  piattaforme: string[];
  tipo: TipoAnalisi;
  paesi: string[];
  creataDa?: string;
}): Promise<Ricerca> {
  const [riga] = await sbFetch<Ricerca[]>("sheis_ricerche", {
    method: "POST",
    prefer: "return=representation",
    body: [
      {
        tema: input.tema,
        piattaforme: input.piattaforme,
        tipo: input.tipo,
        paesi: input.paesi,
        creata_da: input.creataDa ?? null,
      },
    ],
  });
  return riga;
}

export async function ricerca(id: string): Promise<Ricerca | null> {
  const righe = await sbFetch<Ricerca[]>("sheis_ricerche", {
    query: `select=*&id=eq.${id}&limit=1`,
  });
  return righe[0] ?? null;
}

export async function listaRicerche(limite = 25): Promise<Ricerca[]> {
  return sbFetch<Ricerca[]>("sheis_ricerche", {
    query: `select=*&order=created_at.desc&limit=${limite}`,
  });
}

/** L'ultima ricerca completata: è quella da cui il piano editoriale parte per difetto. */
export async function ultimaCompletata(): Promise<Ricerca | null> {
  const righe = await sbFetch<Ricerca[]>("sheis_ricerche", {
    query: "select=*&stato=eq.completata&order=created_at.desc&limit=1",
  });
  return righe[0] ?? null;
}
