import type { Brand, Canale, Formato, Lingua, Pubblico } from "@/lib/brand";
import { BRAND_LABEL } from "@/lib/brand";

export function metaRiga(c: { brand: Brand; canale: Canale; formato: Formato; lingua: Lingua; pubblico: Pubblico | null }): string {
  return `${BRAND_LABEL[c.brand]} · ${c.canale} · ${c.formato} · ${c.lingua}${c.pubblico ? ` · ${c.pubblico}` : ""}`;
}

/** Etichetta del motore di generazione, per mostrare in UI da cosa è nato un testo
 * (SPEC.md §"Il degrado si dichiara" — un ripiego silenzioso è un guasto mai riparato). */
export const ETICHETTA_MOTORE: Record<string, string> = {
  claude: "Claude (locale)",
  openai: "OpenAI",
};

export function labelStato(stato: string): string {
  const mappa: Record<string, string> = {
    in_attesa: "In attesa",
    approvato: "Approvato",
    modificato: "Modificato",
    scartato: "Scartato",
    in_produzione: "In produzione",
    prodotto: "Prodotto",
    programmato: "Programmato",
    pubblicato: "Pubblicato",
    errore: "Errore",
  };
  return mappa[stato] ?? stato;
}
