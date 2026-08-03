import { BRAND, GUARDRAILS } from "@/lib/brand";

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
    const haWordBoundary = /^[\p{L}\p{N}]/u.test(termine) && /[\p{L}\p{N}]$/u.test(termine);
    const pattern = haWordBoundary
      ? new RegExp(`\\b${escapeRegExp(termine)}\\b`, "giu")
      : new RegExp(escapeRegExp(termine), "gi");
    const m = pattern.exec(testo);
    if (m) {
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
function checkLessicoNegozio(testo: string): ViolazioneLinter[] {
  return cercaTermini(
    testo,
    BRAND.lessico.vietato_assoluto.lessico_da_negozio,
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
  const numeriAmmessi = new Set(["15", "99", "3", "tre"]);
  const pattern = /\b(\d+(?:[.,]\d+)?)\s*(minuti|minuto|%|percento|per\s*cento|fasi|fase|clienti|cliente|follower|anni|anno|ore|ora|giorni|giorno|nuance|tonalità)\b/giu;
  const trovate: ViolazioneLinter[] = [];
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(testo)) !== null) {
    const numero = m[1];
    if (!numeriAmmessi.has(numero)) {
      trovate.push({
        regola: "numero_non_documentato",
        descrizione: `Numero "${numero}" accostato a "${m[2]}" non è nell'elenco dei dati documentati (15 minuti di posa, 99% naturale, 3 fasi YOUNIC) — marca [DA CONFERMARE] o rimuovi`,
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
    ...checkNomiSenzaConsenso(testo, opzioni.nomiSenzaConsenso ?? []),
  ];
  return { bloccato: violazioni.length > 0, violazioni };
}
