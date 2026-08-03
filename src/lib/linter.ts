import { BRAND, GUARDRAILS } from "@/lib/brand";
import {
  FORME_FLESSE,
  NEGAZIONI_AMMESSE,
  CLAIM_VIETATI,
  ECCEZIONI_RADICE,
  NUMERI_DOCUMENTATI,
  negozioEccezione,
  numeroDocumentato,
} from "@/lib/vincoli-brand";

const ELENCO_DOCUMENTATI = NUMERI_DOCUMENTATI.map((n) => n.valore).join(", ");

/**
 * Il linter blocca, non avvisa (SPEC.md §"Vincoli non negoziabili" #2). Viene
 * chiamato in due soli punti: prima di salvare un contenuto come approvato, e
 * prima di metterlo in coda di pubblicazione. Ogni blocco dice QUALE regola
 * ha fermato QUALE frase, in italiano — mai un rifiuto generico.
 *
 * Regole 1-3 (prezzi, lessico da negozio, firewall Metodo 29) sono
 * deterministiche su liste misurate/validate dal cliente. Le regole 4-5
 * (claim numerici, nomi senza consenso) sono euristiche best-effort — lo
 * dichiarano esplicitamente i commenti sotto — perché non esiste ancora un
 * registro dei consensi in database: è un gap reale, non nascosto.
 */

export type ViolazioneLinter = {
  regola: string;
  descrizione: string;
  frase: string;
};

export type EsitoLinter = {
  bloccato: boolean;
  violazioni: ViolazioneLinter[];
};

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function estraiContesto(testo: string, indice: number, lunghezza: number): string {
  const inizio = Math.max(0, indice - 30);
  const fine = Math.min(testo.length, indice + lunghezza + 30);
  const prefisso = inizio > 0 ? "…" : "";
  const suffisso = fine < testo.length ? "…" : "";
  return `${prefisso}${testo.slice(inizio, fine).trim()}${suffisso}`;
}

function cercaTermini(testo: string, termini: readonly string[], regola: string, descrizione: string): ViolazioneLinter[] {
  const trovate: ViolazioneLinter[] = [];
  for (const termine of termini) {
    if (!termine) continue;
    // "€" e simili non hanno confini di parola: gestiti senza \b.
    // ⚠️ Il confine di parola `\b` è ASCII anche con la bandiera `u`: fra due
    // caratteri arabi non esiste, quindi «متجر» dentro «متجرنا» non veniva
    // mai trovato. Il confine ha senso solo per gli alfabeti latini.
    const haWordBoundary = /[A-Za-z0-9]/.test(termine);
    // ⚠️ Confronto per RADICE, non per parola esatta — misurato il 2026-08-03.
    // Con i soli confini di parola, «koszyka» (genitivo polacco di «koszyk»)
    // passava indisturbato: le lingue slave declinano e quelle romanze concordano,
    // quindi chi confronta parole intere blocca il caso da manuale e lascia passare
    // quello vero. Due linter dello stesso sistema davano verdetti diversi sullo
    // stesso testo, che è il modo peggiore di sbagliare.
    // Il suffisso libero è ammesso SOLO da 6 caratteri in su: sotto quella soglia
    // causerebbe falsi positivi grossolani ("cart" colpirebbe "cartella",
    // "compra" colpirebbe "comprare" — che però è già in elenco per esteso).
    const ammettiSuffisso = haWordBoundary && termine.length >= 6 && !termine.includes(" ");
    const pattern = !haWordBoundary
      ? new RegExp(escapeRegExp(termine), "gi")
      : ammettiSuffisso
        ? new RegExp(`\\b${escapeRegExp(termine)}\\p{L}{0,3}\\b`, "giu")
        : new RegExp(`\\b${escapeRegExp(termine)}\\b`, "giu");
    const m = pattern.exec(testo);
    if (m) {
      // Il confronto per radice ha un costo: «ordina» + 3 lettere prende anche
      // «ordinario». Le parole innocenti sono dichiarate nella fonte (§lessico.
      // eccezioni_radice) e valgono per tutti e quattro i filtri allo stesso modo.
      if (negozioEccezione(m[0])) continue;
      trovate.push({
        regola,
        descrizione: `${descrizione} — termine vietato: "${termine}"`,
        frase: estraiContesto(testo, m.index, m[0].length),
      });
    }
  }
  return trovate;
}

/** Regola 1 — prezzi e cifre commerciali. */
function checkPrezzi(testo: string): ViolazioneLinter[] {
  return cercaTermini(
    testo,
    BRAND.lessico.vietato_assoluto.prezzi_e_cifre_commerciali,
    "prezzi_cifre_commerciali",
    "Prezzo o cifra commerciale non ammessi in un contenuto SHEis",
  );
}

/** Regola 2 — lessico da negozio, in ogni lingua. */
const NEGAZIONI_RE = NEGAZIONI_AMMESSE.map((p) => new RegExp(p, "iu"));

/**
 * La frase NEGA il canale invece di proporlo?
 *
 * ⚠️ «Non siamo in vendita online, né Amazon né e-commerce nostro» è testo
 * APPROVATO e usato nel copione: nega il canale, è la leva di SHEis. Questo
 * filtro era l'UNICO dei quattro senza questa guardia, e lo bloccava perché
 * conteneva «e-commerce». Un filtro che rifiuta il testo approvato viene
 * disattivato da chi lo usa, e allora non ferma più niente.
 */
function negaIlCanale(testo: string): boolean {
  return NEGAZIONI_RE.some((r) => r.test(testo));
}

function checkLessicoNegozio(testo: string): ViolazioneLinter[] {
  if (negaIlCanale(testo)) return [];
  return cercaTermini(
    testo,
    [...BRAND.lessico.vietato_assoluto.lessico_da_negozio, ...FORME_FLESSE],
    "lessico_da_negozio",
    "Lessico da e-commerce/negozio non ammesso — il pubblico è sempre professionale",
  );
}

/** Regola 3 — firewall Metodo 29 (assoluto, in ogni grafia/lingua/parafrasi). */
function checkFirewallM29(testo: string): ViolazioneLinter[] {
  const alias = GUARDRAILS.worlds.world_m29.entities.flatMap((e) => [e.canonical, ...e.aliases]);
  const dirette = cercaTermini(
    testo,
    alias,
    "firewall_metodo_29",
    'Firewall Metodo 29: nessun collegamento pubblico ammesso con SHEis (regola non negoziabile)',
  );
  if (dirette.length > 0) return dirette;

  // Parafrasi/numero (test avversariale T13 in tests/firewall-m29.md): "ventinove"
  // o "29" in prossimità della parola "metodo" resta un indizio ricostruibile.
  const euristiche = [
    /\bventinove\w*\b[^.!?]{0,40}\bmetodo\b/giu,
    /\bmetodo\b[^.!?]{0,40}\bventinove\w*\b/giu,
    /\b29\b[^.!?]{0,30}\bmetodo\b/giu,
    /\bmetodo\b[^.!?]{0,30}\b29\b/giu,
  ];
  const trovate: ViolazioneLinter[] = [];
  for (const pattern of euristiche) {
    const m = pattern.exec(testo);
    if (m) {
      trovate.push({
        regola: "firewall_metodo_29_parafrasi",
        descrizione:
          "Firewall Metodo 29: formulazione che permette di ricostruire il collegamento (numero/parafrasi vicino a \"metodo\") — bloccata per prudenza, verifica a mano",
        frase: estraiContesto(testo, m.index, m[0].length),
      });
      break; // una sola segnalazione euristica basta a bloccare e a farsi rivedere
    }
  }
  return trovate;
}

/** Regola 4 — claim numerici non documentati (best-effort: vedi commento sopra). */
function checkNumeriNonDocumentati(testo: string): ViolazioneLinter[] {
  // ⚠️ Difetto misurato il 3/8: la whitelist era un insieme di CIFRE NUDE, senza
  // contesto — quindi «99% di sconto» e «15 anni di esperienza» passavano di qui
  // e venivano bloccati dagli altri tre filtri. A decidere è il contesto, non la
  // cifra. La regola vive ora in un solo posto: NUMERI_DOCUMENTATI, generato da
  // BRAND-IDENTITY, che tutti e quattro leggono.
  //
  // ⚠️ Il `\b` finale NON può applicarsi a "%": misurato il 2026-08-03.
  // "%" non è un carattere di parola, quindi `%\b` pretende che subito dopo ci sia
  // una lettera — cioè intercetta "100%naturale" e lascia passare "100% naturale",
  // che è il modo in cui chiunque lo scrive davvero. Il caso reale sfuggiva, quello
  // da manuale veniva bloccato. Ora "%" sta in un ramo senza `\b`, e le parole
  // conservano il loro confine.
  const pattern = /\b(\d+(?:[.,]\d+)?)\s*(?:(%|percento|per\s*cento)|(minuti|minuto|fasi|fase|clienti|cliente|follower|anni|anno|ore|ora|giorni|giorno|nuance|tonalità)\b)/giu;
  const trovate: ViolazioneLinter[] = [];
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(testo)) !== null) {
    if (numeroDocumentato(testo, m.index, m.index + m[0].length)) continue;
    const unita = m[2] ?? m[3] ?? "";
    trovate.push({
      regola: "numero_non_documentato",
      descrizione: `Numero "${m[1]}" accostato a "${unita}" non è fra i dati documentati (${ELENCO_DOCUMENTATI}) — non basta la cifra, serve il contesto giusto: «99% di origine naturale» sì, «99% di sconto» no. Marca [DA CONFERMARE] o rimuovi`,
      frase: estraiContesto(testo, m.index, m[0].length),
    });
  }
  return trovate;
}

/** Regola 6 — claim assoluti, clinici e garanzie.
 *
 * ⚠️ Regola MANCANTE fino al 2026-08-03, trovata confrontando questo linter con
 * quello dei worker: «BABILON è una linea 100% naturale» passava qui e veniva
 * bloccato là. Due filtri dello stesso sistema con verdetti opposti sullo stesso
 * testo sono peggio di un filtro assente, perché nessuno dei due sembra rotto.
 *
 * Perché sono vietati, al di là della coerenza fra strumenti: sono affermazioni
 * che l'azienda non può dimostrare. «99% di origine naturale» è documentato e
 * passa; «100% naturale» non lo è. In cosmetica un claim di questo tipo non è
 * una sfumatura di marketing — è un'affermazione contestabile.
 */
const CLAIM_ASSOLUTI: readonly { re: RegExp; cosa: string }[] = [
  { re: /\b100\s*%/giu,                                                    cosa: "«100%» — nessun dato documentato lo sostiene (il valore verificato è 99% di origine naturale)" },
  { re: /\bclinicamente\s+(provat|testat|dimostrat)\w*/giu,                cosa: "claim clinico" },
  { re: /\bdermatologicamente\s+provat\w*/giu,                             cosa: "claim clinico (il documentato è «dermatologicamente testato», non «provato»)" },
  { re: /\brisultat\w*\s+garantit\w*/giu,                                  cosa: "garanzia di risultato" },
  { re: /\bgarantiam\w+\b/giu,                                             cosa: "garanzia di risultato" },
  // ⚠️ Servono le parole in mezzo: «il migliore PRODOTTO del mercato» è la forma
  // naturale, «il migliore del mercato» quella da manuale. Senza il tratto libero
  // si intercetta solo la seconda — lo stesso errore del "%" qui sopra, dove il
  // caso reale sfuggiva e quello di scuola veniva preso.
  { re: /\bmiglior\w*\b[^.!?]{0,30}\b(del|sul)\s+mercato/giu,               cosa: "superlativo assoluto non dimostrabile" },
  // «più» si scrive con l'accento (U+00F9), non con l'apostrofo: cercare `piu'`
  // avrebbe intercettato solo chi lo digita male. Si accettano entrambe le forme.
  { re: /\b(?:il|la)\s+pi(?:ù|u['’])\s+[^.!?]{0,30}\b(?:del|sul)\s+mercato/giu, cosa: "superlativo assoluto non dimostrabile" },
  { re: /\b(numero\s*uno|n\.?\s*1)\s+(in|del|sul)\b/giu,                   cosa: "primato non dimostrabile" },
  { re: /\bl['’]?unic\w+\s+(prodotto|linea|marchio|azienda)\b/giu,         cosa: "esclusività non dimostrabile" },
  { re: /\bcura\s+(la|il|i|le)\s+\w+/giu,                                  cosa: "possibile claim terapeutico — un cosmetico non cura" },
  { re: /\b(senza\s+alcun|zero)\s+(effett\w+\s+collateral\w+|rischi\w*)/giu, cosa: "assenza assoluta di rischi" },
];

function checkClaimAssoluti(testo: string): ViolazioneLinter[] {
  const trovate: ViolazioneLinter[] = [];
  // ⚠️ I claim della fonte includono le quantità scritte in LETTERE: «YOUNIC
  // lavora in cinque fasi» passava da questo filtro, e le fasi documentate sono
  // TRE. Si consulta comunque l'elenco dei numeri leciti, altrimenti si
  // bloccherebbe anche «tre fasi», che è il dato vero.
  for (const { pattern, cosa } of CLAIM_VIETATI) {
    const re = new RegExp(pattern, "iu");
    const m = re.exec(testo);
    if (m && !numeroDocumentato(testo, m.index, m.index + m[0].length)) {
      trovate.push({
        regola: "claim_non_documentato",
        descrizione: `Claim non dimostrabile: ${cosa} — riformula su un dato documentato o marca [DA CONFERMARE]`,
        frase: estraiContesto(testo, m.index, m[0].length),
      });
    }
  }
  for (const { re, cosa } of CLAIM_ASSOLUTI) {
    re.lastIndex = 0;
    const m = re.exec(testo);
    if (m) {
      trovate.push({
        regola: "claim_assoluto_o_clinico",
        descrizione: `Claim non dimostrabile: ${cosa} — riformula su un dato documentato o marca [DA CONFERMARE]`,
        frase: estraiContesto(testo, m.index, m[0].length),
      });
    }
  }
  return trovate;
}

/** Regola 5 — nomi di clienti/distributori senza consenso (denylist esplicita, oggi vuota: nessun nome è stato confermato pubblicabile). */
function checkNomiSenzaConsenso(testo: string, nomiSenzaConsenso: readonly string[]): ViolazioneLinter[] {
  if (nomiSenzaConsenso.length === 0) return [];
  return cercaTermini(
    testo,
    nomiSenzaConsenso,
    "nome_senza_consenso",
    "Nome di cliente/distributore citato senza consenso scritto registrato",
  );
}

export type OpzioniLint = {
  /** Nomi propri che NON hanno ancora consenso scritto a essere citati pubblicamente. */
  nomiSenzaConsenso?: readonly string[];
};

/** Punto unico di lint: concatena i campi pubblici e applica tutte le regole. */
export function lintContenuto(
  campi: { hook?: string; copy?: string; copySecondario?: string; cta?: string; hashtag?: readonly string[] },
  opzioni: OpzioniLint = {},
): EsitoLinter {
  const testo = [campi.hook, campi.copy, campi.copySecondario, campi.cta, (campi.hashtag ?? []).join(" ")]
    .filter(Boolean)
    .join("\n");

  const violazioni: ViolazioneLinter[] = [
    ...checkPrezzi(testo),
    ...checkLessicoNegozio(testo),
    ...checkFirewallM29(testo),
    ...checkNumeriNonDocumentati(testo),
    ...checkClaimAssoluti(testo),
    ...checkNomiSenzaConsenso(testo, opzioni.nomiSenzaConsenso ?? []),
  ];

  return { bloccato: violazioni.length > 0, violazioni };
}

/** Lint di un testo grezzo (usato anche fuori dal modello Contenuto, es. articoli sito). */
export function lintTesto(testo: string, opzioni: OpzioniLint = {}): EsitoLinter {
  const violazioni: ViolazioneLinter[] = [
    ...checkPrezzi(testo),
    ...checkLessicoNegozio(testo),
    ...checkFirewallM29(testo),
    ...checkNumeriNonDocumentati(testo),
    ...checkClaimAssoluti(testo),
    ...checkNomiSenzaConsenso(testo, opzioni.nomiSenzaConsenso ?? []),
  ];
  return { bloccato: violazioni.length > 0, violazioni };
}
