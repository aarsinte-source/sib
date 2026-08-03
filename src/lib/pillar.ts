import "server-only";
import { sbFetch } from "@/lib/supabase";

/**
 * I pilastri di contenuto.
 *
 * PERCHÉ APPARTENGONO AL PIANO E NON AL SINGOLO POST
 * ---------------------------------------------------
 * Cambiare pilastri significa cambiare piano. Se vivessero sul contenuto, si
 * potrebbero modificare uno alla volta e il piano diventerebbe, senza che
 * nessuno lo decida, qualcosa di diverso da ciò che era stato approvato.
 *
 * `quota_pct` è la quota DESIDERATA. Quella reale si conta dai contenuti, e la
 * differenza fra le due è l'informazione utile: è il modo per dire «questo mese
 * abbiamo parlato troppo di prodotto e troppo poco di formazione» con un numero
 * invece che con un'impressione.
 */

export type ObiettivoPillar = "attrazione" | "consapevolezza" | "vendita" | "fiducia";

export type Pillar = {
  id: string;
  piano_id: string | null;
  nome: string;
  descrizione: string;
  obiettivo: ObiettivoPillar;
  quota_pct: number;
  esempi: string[] | null;
  lessico: string[] | null;
  ordine: number;
  ricerca_id: string | null;
  created_at: string;
};

export type NuovoPillar = Omit<Pillar, "id" | "created_at">;

export const OBIETTIVO_LABEL: Record<ObiettivoPillar, string> = {
  attrazione: "attrazione",
  consapevolezza: "consapevolezza",
  fiducia: "fiducia",
  vendita: "vendita",
};

export const OBIETTIVO_COLORE: Record<ObiettivoPillar, string> = {
  attrazione: "#B45309",
  consapevolezza: "#1D4ED8",
  fiducia: "#047857",
  vendita: "#9333EA",
};

export async function creaPillar(righe: NuovoPillar[]): Promise<Pillar[]> {
  if (righe.length === 0) return [];
  return sbFetch<Pillar[]>("sheis_pillar", {
    method: "POST",
    prefer: "return=representation",
    body: righe,
  });
}

export async function pillarDelPiano(pianoId: string): Promise<Pillar[]> {
  return sbFetch<Pillar[]>("sheis_pillar", {
    query: `select=*&piano_id=eq.${pianoId}&order=ordine.asc`,
  });
}

export async function tuttiIPillar(): Promise<Pillar[]> {
  return sbFetch<Pillar[]>("sheis_pillar", { query: "select=*&order=created_at.desc" });
}

/**
 * Quota chiesta contro quota ottenuta, per ogni pilastro.
 *
 * Serve perché «rispetta le quote» scritto nel prompt di un modello non è una
 * garanzia: è una richiesta. Contarlo dopo è l'unico modo di sapere se è stata
 * ascoltata — e uno scarto di venti punti su un pilastro è la differenza fra un
 * piano equilibrato e un mese passato a parlare sempre della stessa cosa.
 */
export function resaPillar(
  pillar: Pillar[],
  contenuti: Array<{ pillar_id: string | null }>,
): Array<{ nome: string; quotaChiesta: number; giorniAssegnati: number; quotaReale: number; scarto: number }> {
  const totale = contenuti.length || 1;
  return pillar.map((p) => {
    const quanti = contenuti.filter((c) => c.pillar_id === p.id).length;
    const reale = Math.round((quanti / totale) * 100);
    return {
      nome: p.nome,
      quotaChiesta: p.quota_pct,
      giorniAssegnati: quanti,
      quotaReale: reale,
      scarto: reale - p.quota_pct,
    };
  });
}
