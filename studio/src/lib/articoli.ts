/**
 * Tipi e helper per l'editor a blocchi di `/sito` — client-safe (nessun
 * "server-only"). La forma dei blocchi combacia ESATTAMENTE con i file reali
 * in `~/alkemia-sheis-web/src/content/articles/*.json` (verificato leggendo
 * `colorazione-senza-ammoniaca-guida-salone.it.json`): `{tipo, contenuto}`,
 * dove `contenuto` cambia forma per tipo. Non è un capriccio di stile: se
 * questa forma diverge da quella del sito, ciò che si scrive qui non si vede
 * là (correzione esplicita del team lead).
 *
 * Le 8 lingue sono quelle di `~/alkemia-sheis-web/src/lib/locales.ts`
 * (`LOCALES`), non un elenco inventato: l'italiano è la fonte
 * (`DEFAULT_LOCALE`), l'inglese è la lingua di default per chi non ha una
 * traduzione (`X_DEFAULT_LOCALE`).
 */

export type Lingua8 = "it" | "en" | "es" | "fr" | "de" | "pt" | "pl" | "ar";

export const LINGUE_SITO: readonly Lingua8[] = ["it", "en", "es", "fr", "de", "pt", "pl", "ar"];

export const LINGUA_SITO_LABEL: Record<Lingua8, string> = {
  it: "Italiano",
  en: "English",
  es: "Español",
  fr: "Français",
  de: "Deutsch",
  pt: "Português",
  pl: "Polski",
  ar: "العربية",
};

/** Le lingue scritte da destra a sinistra: l'editor deve saperlo per l'allineamento del testo. */
export const LINGUE_RTL: readonly Lingua8[] = ["ar"];

/** L'italiano è SEMPRE la fonte: chi scrive parte da qui, le altre lingue sono traduzioni tracciate (fonte_lingua). */
export const LINGUA_FONTE: Lingua8 = "it";

export type TipoBlocco = "paragrafo" | "titolo" | "citazione" | "elenco" | "immagine";

export const TIPI_BLOCCO: readonly TipoBlocco[] = ["paragrafo", "titolo", "citazione", "elenco", "immagine"];

export const TIPO_BLOCCO_LABEL: Record<TipoBlocco, string> = {
  paragrafo: "Paragrafo",
  titolo: "Titolo di sezione",
  citazione: "Citazione",
  elenco: "Elenco puntato",
  immagine: "Immagine",
};

export type BloccoTesto = { tipo: "paragrafo" | "titolo" | "citazione"; contenuto: string };
export type BloccoElenco = { tipo: "elenco"; contenuto: string[] };
export type BloccoImmagine = { tipo: "immagine"; contenuto: { src: string; alt: string } };
export type Blocco = BloccoTesto | BloccoElenco | BloccoImmagine;

export function bloccoVuoto(tipo: TipoBlocco): Blocco {
  if (tipo === "elenco") return { tipo, contenuto: [""] };
  if (tipo === "immagine") return { tipo, contenuto: { src: "", alt: "" } };
  return { tipo, contenuto: "" };
}

/** Tutto il testo pubblico di un articolo, concatenato — per il linter e per un conteggio parole onesto. */
export function estraiTestoBlocchi(blocchi: Blocco[]): string {
  return blocchi
    .map((b) => {
      if (b.tipo === "elenco") return b.contenuto.join("\n");
      if (b.tipo === "immagine") return b.contenuto.alt;
      return b.contenuto;
    })
    .join("\n");
}

/** Un blocco è vuoto (da non contare, da poter rimuovere senza avvisi) se non ha contenuto reale. */
export function bloccoEVuoto(b: Blocco): boolean {
  if (b.tipo === "elenco") return b.contenuto.every((v) => !v.trim());
  if (b.tipo === "immagine") return !b.contenuto.src.trim();
  return !b.contenuto.trim();
}

/** Verifica minima di struttura, difensiva su dati che potrebbero arrivare grezzi dal DB. */
export function normalizzaBlocchi(v: unknown): Blocco[] {
  if (!Array.isArray(v)) return [];
  const out: Blocco[] = [];
  for (const item of v) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const tipo = o.tipo;
    if (tipo === "elenco") {
      const contenuto = Array.isArray(o.contenuto) ? o.contenuto.filter((x): x is string => typeof x === "string") : [];
      out.push({ tipo, contenuto });
    } else if (tipo === "immagine") {
      const c = (o.contenuto ?? {}) as Record<string, unknown>;
      out.push({ tipo, contenuto: { src: typeof c.src === "string" ? c.src : "", alt: typeof c.alt === "string" ? c.alt : "" } });
    } else if (tipo === "paragrafo" || tipo === "titolo" || tipo === "citazione") {
      out.push({ tipo, contenuto: typeof o.contenuto === "string" ? o.contenuto : "" });
    }
  }
  return out;
}
