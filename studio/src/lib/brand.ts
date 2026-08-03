import { SLUG_MARCHI } from "./marchi";
import brandIdentityRaw from "@/brand/BRAND-IDENTITY.json";
import guardrailsRaw from "@/brand/guardrails.json";

/**
 * Carica l'identità di marca e i guardrail come VINCOLO ESEGUIBILE, non come
 * documentazione. Fonte: clienti/sheis-beauty-aiconsult/data/BRAND-IDENTITY_
 * sheis_2026-08-03.json nel repo scalers-plus — copiata qui al build (SPEC.md
 * §"Vincoli non negoziabili" #1). In caso di conflitto vince sheis-brand-core
 * (guardrails.json), come dichiarato in BRAND-IDENTITY._meta.regola_di_precedenza.
 */

export type BrandIdentity = typeof brandIdentityRaw;
export type Guardrails = typeof guardrailsRaw;

export const BRAND: BrandIdentity = brandIdentityRaw;
export const GUARDRAILS: Guardrails = guardrailsRaw;

export type Brand =
  | "sheis-beauty"
  | "sheis-color"
  | "sheis-color-first"
  | "younic"
  | "babilon"
  | "vr-intelligent";
export type Canale = "instagram" | "facebook" | "tiktok" | "linkedin";
export type Pubblico = "distributore-estero" | "distributore-italia" | "salone";
export type Lingua = "it" | "en" | "es";
export type Formato = "statico" | "carosello" | "video" | "ugc";

/**
 * ⚠️ SEI marchi, non tre. La fonte è il registro generato `marchi.ts`, che a
 * sua volta nasce da ~/alkemia-sheis-backend/marchi.json — cioè dai file
 * vettoriali che Mauro ha consegnato il 2026-08-04.
 *
 * Fino a quel giorno questa riga era un elenco scritto a mano di tre marchi,
 * dedotti dalle trascrizioni. Ne mancavano tre: il marchio ombrello SHEis
 * BEAUTY, la linea SHEis COLOR FIRST e VR Intelligent. Un elenco scritto a
 * mano non sbaglia il giorno che lo scrivi: sbaglia il giorno che la realtà
 * cambia e nessuno lo aggiorna.
 *
 * L'ordine è quello del registro, che è quello del foglio marchi del cliente.
 */
export const BRANDS: readonly Brand[] = SLUG_MARCHI as readonly Brand[];
export const CANALI: readonly Canale[] = ["instagram", "facebook", "tiktok", "linkedin"];
export const PUBBLICI: readonly Pubblico[] = [
  "distributore-estero",
  "distributore-italia",
  "salone",
];
export const LINGUE: readonly Lingua[] = ["it", "en", "es"];
export const FORMATI: readonly Formato[] = ["statico", "carosello", "video", "ugc"];

export const BRAND_LABEL: Record<Brand, string> = {
  "sheis-beauty": "SHEis BEAUTY",
  "sheis-color": "SHEis COLOR",
  "sheis-color-first": "SHEis COLOR FIRST",
  younic: "YOUNIC",
  babilon: "BABILON",
  "vr-intelligent": "VR Intelligent",
};

/**
 * Blocco di regole da iniettare in OGNI system prompt che genera testo
 * pubblico per SHEis: mix formati, hashtag, cta ammesse/vietate, lessico,
 * numeri documentati. Misurato sul profilo reale, non dichiarato a memoria.
 */
export function regoleBrandTesto(): string {
  const g = BRAND.regole_di_generazione;
  const l = BRAND.lessico;
  return `REGOLE DI BRAND NON NEGOZIABILI — valgono su ogni testo che produci per SHEis Beauty International:
- Pubblico SEMPRE professionale: distributore o salone. Mai il consumatore finale.
- MAI prezzi, importi, sconti, listini, percentuali di prezzo: ${l.vietato_assoluto.prezzi_e_cifre_commerciali.join(", ")}.
- MAI lessico da e-commerce, in nessuna lingua: ${l.vietato_assoluto.lessico_da_negozio.join(", ")}.
- MAI nominare "Metodo 29" in nessuna forma, grafia o parafrasi.
- Tono: ${BRAND.voce.registro}
- Struttura caption misurata: ${BRAND.voce.struttura_caption_misurata.join(" ")}
- Bilinguismo reale: caption in due lingue nello stesso post, separate da "--" quando richiesto.
- CTA ammesse: ${g.cta_ammesse.join(" · ")}. CTA vietate: ${g.cta_vietate.join(" · ")}.
- Hashtag per post: tra ${g.hashtag_per_post.min} e ${g.hashtag_per_post.max}, misti italiano/inglese, generici di categoria + specifici professionali.
- Numeri ammessi, SOLO questi, documentati: ${g.numeri_ammessi} Ogni altro numero va marcato [DA CONFERMARE] e NON deve uscire nel testo pubblico.
- Lessico ammesso di riferimento: ${l.ammesso_misurato.slice(0, 14).join(", ")}…
- Non inventare mai nomi di clienti o distributori: senza consenso scritto registrato non si nominano.`;
}

export type AsseVariante = "inquadratura" | "ambientazione" | "luce";

/** I tre valori dichiarati per ciascun asse di variazione delle 3 creatività. */
export const VALORI_ASSE: Record<AsseVariante, readonly string[]> = {
  inquadratura: [
    "macro ravvicinato sul prodotto, dettaglio texture ed etichetta",
    "mezzo campo editoriale, prodotto al centro con spazio negativo",
    "campo ampio ambientato, prodotto in scena con contesto brand",
  ],
  ambientazione: [
    "still-life su superficie materica pulita, studio controllato",
    "contesto botanico naturale, elementi organici a contorno",
    "scenografia luxury minimale, texture pietra/tessuto in ombra",
  ],
  luce: [
    "luce calda direzionale laterale, ombre morbide",
    "luce fredda diffusa da softbox, contrasto contenuto",
    "controluce dorato, silhouette del prodotto valorizzata",
  ],
};

/** Sceglie l'asse di variazione in modo deterministico dal brand e formato, non a caso. */
export function asseVarianteDeterministico(brand: Brand, formato: Formato): AsseVariante {
  const assi: AsseVariante[] = ["inquadratura", "ambientazione", "luce"];
  const seme = `${brand}:${formato}`;
  let h = 0;
  for (let i = 0; i < seme.length; i++) h = (h * 31 + seme.charCodeAt(i)) >>> 0;
  return assi[h % assi.length];
}
