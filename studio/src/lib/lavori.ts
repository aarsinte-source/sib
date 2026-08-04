import "server-only";
import { sbFetch } from "@/lib/supabase";

/**
 * La coda dei lavori, vista dal portale.
 *
 * PERCHÉ IL PORTALE NON ESEGUE PIÙ
 * --------------------------------
 * Finora lo Studio faceva tutto da sé: lanciava `higgsfield` per le immagini,
 * `monid` per le aziende, `node` per il motore campagne. Funzionava perché
 * girava sul portatile di Andrei, dove quei comandi esistono.
 *
 * Su Vercel non esistono. Non «vanno più lenti»: non esistono. Le funzioni
 * serverless non hanno né i comandi installati né le credenziali in
 * `~/.config`, e muoiono in pochi secondi mentre una ricerca di mercato ne
 * chiede centocinque (misurato: 55s di raccolta + 50s di sintesi).
 *
 * Quindi il portale ACCODA e torna subito; l'esecutore sul VPS PRENDE ed
 * esegue. Il portale può stare ovunque, l'esecutore sta dove ci sono le
 * credenziali, e il Mac può spegnersi senza che niente si fermi.
 *
 * ⚠️ Da qui NON si esegue mai niente. Se un giorno qualcuno aggiunge uno
 * `spawn()` in questo file o in uno dei suoi chiamanti, il portale torna
 * legato a una macchina precisa e se ne accorgerà solo dopo il deploy.
 */

export type TipoLavoro =
  | "ricerca-mercato"
  | "genera-creativa"
  | "pubblica-zernio"
  | "costruisci-campagna"
  | "diagnostica";

export type StatoLavoro = "in_attesa" | "in_corso" | "completato" | "fallito" | "annullato";

export type Lavoro = {
  id: string;
  tipo: TipoLavoro;
  stato: StatoLavoro;
  priorita: number;
  payload: Record<string, unknown>;
  risultato: Record<string, unknown> | null;
  errore: string | null;
  tentativi: number;
  max_tentativi: number;
  riferimento_tipo: string | null;
  riferimento_id: string | null;
  preso_da: string | null;
  preso_il: string | null;
  completato_il: string | null;
  richiesto_da: string | null;
  created_at: string;
  updated_at: string;
};

export const STATO_LAVORO_LABEL: Record<StatoLavoro, string> = {
  in_attesa: "in coda",
  in_corso: "in corso",
  completato: "fatto",
  fallito: "fallito",
  annullato: "annullato",
};

export async function accoda(input: {
  tipo: TipoLavoro;
  payload: Record<string, unknown>;
  riferimentoTipo?: "contenuto" | "variante" | "ricerca" | "campagna" | "pubblicazione";
  riferimentoId?: string;
  priorita?: number;
  richiestoDa?: string;
}): Promise<Lavoro> {
  const [riga] = await sbFetch<Lavoro[]>("sheis_lavori", {
    method: "POST",
    prefer: "return=representation",
    body: [
      {
        tipo: input.tipo,
        payload: input.payload,
        riferimento_tipo: input.riferimentoTipo ?? null,
        riferimento_id: input.riferimentoId ?? null,
        priorita: input.priorita ?? 5,
        richiesto_da: input.richiestoDa ?? null,
      },
    ],
  });
  return riga;
}

/** Accoda più lavori in una sola scrittura — «genera tutte le creative» ne mette in coda anche trenta. */
export async function accodaMolti(
  righe: Array<{
    tipo: TipoLavoro;
    payload: Record<string, unknown>;
    riferimentoTipo?: string;
    riferimentoId?: string;
    priorita?: number;
    richiestoDa?: string;
  }>,
): Promise<Lavoro[]> {
  if (righe.length === 0) return [];
  return sbFetch<Lavoro[]>("sheis_lavori", {
    method: "POST",
    prefer: "return=representation",
    body: righe.map((r) => ({
      tipo: r.tipo,
      payload: r.payload,
      riferimento_tipo: r.riferimentoTipo ?? null,
      riferimento_id: r.riferimentoId ?? null,
      priorita: r.priorita ?? 5,
      richiesto_da: r.richiestoDa ?? null,
    })),
  });
}

export async function lavoro(id: string): Promise<Lavoro | null> {
  const righe = await sbFetch<Lavoro[]>("sheis_lavori", { query: `select=*&id=eq.${id}&limit=1` });
  return righe[0] ?? null;
}

export async function lavoriPer(riferimentoTipo: string, riferimentoId: string): Promise<Lavoro[]> {
  return sbFetch<Lavoro[]>("sheis_lavori", {
    query:
      `select=*&riferimento_tipo=eq.${riferimentoTipo}` +
      `&riferimento_id=eq.${riferimentoId}&order=created_at.desc`,
  });
}

export async function lavoriRecenti(limite = 30): Promise<Lavoro[]> {
  return sbFetch<Lavoro[]>("sheis_lavori", {
    query: `select=*&order=created_at.desc&limit=${limite}`,
  });
}

/**
 * Quanti sono in coda e da quanto aspetta il più vecchio.
 *
 * Il secondo numero è quello che conta: una coda con tre lavori è sana, una
 * coda con tre lavori fermi da un'ora significa che **l'esecutore non sta
 * girando**. Senza questa misura il portale accetterebbe richieste all'infinito
 * mostrando «in coda» per sempre, e nessuno saprebbe che dall'altra parte non
 * c'è nessuno.
 */
/**
 * CHI ESEGUE COSA, e perché non tutto può stare sullo stesso computer.
 *
 * ⚠️ MISURATO il 2026-08-04. L'API di Higgsfield risponde **521** alle
 * chiamate che arrivano dal VPS — provato su IPv4 e IPv6, tre tentativi, con
 * le credenziali trasferite e il workspace selezionato. Non è un problema di
 * autenticazione: Cloudflare tratta diversamente il traffico che arriva dai
 * datacenter. Dal portatile la stessa chiamata passa.
 *
 * Conseguenza pratica: la generazione creativa resta legata a una macchina
 * vera. Il resto — ricerca, pubblicazione, campagne — gira sul VPS e quindi
 * anche a Mac spento.
 *
 * Questa mappa esiste per DIRLO. Senza, una generazione messa in coda mentre
 * il Mac è spento resterebbe lì e il portale mostrerebbe «in coda» all'infinito
 * senza spiegare cosa aspetta.
 */
export const COPERTURA: Record<TipoLavoro, { dove: string; sempreAcceso: boolean; nota: string }> = {
  "ricerca-mercato": {
    dove: "VPS",
    sempreAcceso: true,
    nota: "Solo chiamate HTTP: gira anche a computer spento.",
  },
  "pubblica-zernio": {
    dove: "VPS",
    sempreAcceso: true,
    nota: "Solo chiamate HTTP: gira anche a computer spento.",
  },
  "costruisci-campagna": {
    dove: "VPS",
    sempreAcceso: true,
    nota: "Gira anche a computer spento.",
  },
  diagnostica: {
    dove: "VPS",
    sempreAcceso: true,
    nota: "Gira anche a computer spento. Lo stato dei crediti Higgsfield resta però leggibile solo dal portatile.",
  },
  "genera-creativa": {
    dove: "portatile",
    sempreAcceso: false,
    nota:
      "Higgsfield rifiuta le connessioni dal VPS (521, misurato il 2026-08-04 su IPv4 e IPv6): " +
      "non è l'autenticazione, è Cloudflare che blocca gli indirizzi da datacenter. " +
      "La generazione resta in coda finché l'esecutore sul portatile la raccoglie — non fallisce, aspetta.",
  },
};

export async function statoCoda(): Promise<{
  inAttesa: number;
  inCorso: number;
  falliti24h: number;
  attesaPiuVecchiaMin: number | null;
  esecutoreVivo: boolean;
  nota: string;
}> {
  const [attesa, corso, falliti] = await Promise.all([
    sbFetch<Array<{ created_at: string }>>("sheis_lavori", {
      query: "select=created_at&stato=eq.in_attesa&order=created_at.asc",
    }),
    sbFetch<Array<{ id: string; preso_il: string | null; preso_da: string | null }>>("sheis_lavori", {
      query: "select=id,preso_il,preso_da&stato=eq.in_corso",
    }),
    sbFetch<Array<{ id: string }>>("sheis_lavori", {
      query: `select=id&stato=eq.fallito&updated_at=gte.${new Date(Date.now() - 86_400_000).toISOString()}`,
    }),
  ]);

  const piuVecchio = attesa[0]?.created_at;
  const attesaMin = piuVecchio
    ? Math.round((Date.now() - new Date(piuVecchio).getTime()) / 60_000)
    : null;

  // Vivo = qualcosa si è mosso di recente. Non è una misura perfetta — un
  // esecutore acceso ma senza lavoro non lascia tracce — ma la domanda vera è
  // «i miei lavori si stanno muovendo?», e a quella risponde.
  const esecutoreVivo = corso.length > 0 || attesaMin === null || attesaMin < 5;

  // Quanti fra quelli in attesa aspettano una macchina che potrebbe essere
  // spenta: è un'attesa diversa da «la coda è lunga», e va detta diversamente.
  const attesaSuPortatile = await sbFetch<Array<{ id: string }>>("sheis_lavori", {
    query: "select=id&stato=eq.in_attesa&tipo=eq.genera-creativa",
  }).catch(() => []);

  let nota = "";
  if (attesaSuPortatile.length && !esecutoreVivo) {
    nota =
      `${attesaSuPortatile.length} generazioni creative aspettano il portatile. ` +
      COPERTURA["genera-creativa"].nota +
      " Si accende con: LIVE=1 python3 ~/alkemia-sheis-workers/esecutore.py --tipi genera-creativa";
  } else if (attesa.length && !esecutoreVivo) {
    nota =
      `${attesa.length} lavori fermi da ${attesaMin} minuti: l'esecutore non sta girando. ` +
      "Si accende sul VPS con `systemctl start sheis-esecutore` (o, in locale, " +
      "`LIVE=1 python3 ~/alkemia-sheis-workers/esecutore.py`).";
  } else if (falliti.length) {
    nota = `${falliti.length} lavori falliti nelle ultime 24 ore: vedi il motivo su ciascuno.`;
  }

  return {
    inAttesa: attesa.length,
    inCorso: corso.length,
    falliti24h: falliti.length,
    attesaPiuVecchiaMin: attesaMin,
    esecutoreVivo,
    nota,
  };
}
