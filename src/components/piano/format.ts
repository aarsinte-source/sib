import type { Brand, Canale, Formato, Lingua, Pubblico } from "@/lib/brand";
import { BRAND_LABEL } from "@/lib/brand";

export function metaRiga(c: { brand: Brand; canale: Canale; formato: Formato; lingua: Lingua; pubblico: Pubblico | null }): string {
  return `${BRAND_LABEL[c.brand]} · ${c.canale} · ${c.formato} · ${c.lingua}${c.pubblico ? ` · ${c.pubblico}` : ""}`;
}

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
