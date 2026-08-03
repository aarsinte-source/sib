/**
 * Test del giro completo, contro un mock in-memory di PostgREST.
 *
 * Perché un mock e non Supabase vero: il progetto reale ha 0/15 tabelle
 * sheis_* (verificato il 2026-08-03 con `python3 applica_migrazioni.py
 * --verifica` in ~/alkemia-sheis-backend) — il DDL richiede un Personal
 * Access Token che oggi manca. Questo script prova che la LOGICA applicativa
 * (lib/dati.ts, lib/linter.ts, la matrice dei ruoli in lib/auth.ts) è
 * corretta a prescindere: intercetta `fetch` con un finto PostgREST che
 * implementa solo le operazioni che l'app usa davvero (select/insert/patch
 * con gli stessi filtri), e fa girare le funzioni REALI sopra quel mock.
 *
 * Non è una prova che Supabase funziona (non può esserlo, le tabelle non
 * esistono): è la prova che il codice è corretto e pronto per quando
 * esisteranno. La verifica dal vivo di "schema non inizializzato" è invece
 * reale (vedi README.md), perché quella condizione è reale oggi.
 *
 * Esecuzione: npm run test:flow (usa tsx).
 */

process.env.SUPABASE_URL = "http://mock.supabase.local";
process.env.SUPABASE_SECRET_KEY = "mock-service-key";
process.env.SESSION_SECRET = "test-secret";

// Il pacchetto "server-only" lancia SEMPRE quando risolto fuori dalla
// condizione "react-server" di Next.js (per design: è un marker di build, non
// un guard runtime universale). Qui siamo in uno script Node puro, non dentro
// Next — quindi lo intercettiamo con uno stub vuoto, esattamente come
// farebbe `vi.mock("server-only", () => ({}))` in un test runner. Non tocca
// il codice spedito: src/lib/*.ts continuano a importare "server-only" per
// davvero, e Next continua a farlo rispettare in build.
import Module from "node:module";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ModuleAny = Module as any;
const caricaOriginale = ModuleAny._load;
ModuleAny._load = function (richiesta: string, ...resto: unknown[]) {
  if (richiesta === "server-only") return {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return caricaOriginale.call(this, richiesta, ...(resto as any[]));
};

type Riga = Record<string, unknown>;
const db = new Map<string, Riga[]>();
let contatoreId = 0;
function nuovoId(): string {
  contatoreId += 1;
  return `mock-${contatoreId.toString().padStart(4, "0")}`;
}

function applicaFiltri(righe: Riga[], params: URLSearchParams): Riga[] {
  let out = righe;
  for (const [chiave, valore] of params.entries()) {
    if (chiave === "select" || chiave === "order" || chiave === "limit") continue;
    if (valore.startsWith("eq.")) {
      const atteso = decodeURIComponent(valore.slice(3));
      out = out.filter((r) => String(r[chiave]) === atteso);
    }
  }
  const order = params.get("order");
  if (order) {
    const [col, dir] = order.split(".");
    out = [...out].sort((a, b) => {
      const av = String(a[col] ?? "");
      const bv = String(b[col] ?? "");
      return dir === "desc" ? (av < bv ? 1 : -1) : av < bv ? -1 : 1;
    });
  }
  const limit = params.get("limit");
  if (limit) out = out.slice(0, Number(limit));
  return out;
}

const fetchOriginale = global.fetch;
// @ts-expect-error — mock volutamente più permissivo del tipo fetch reale
global.fetch = async (url: string, init: RequestInit = {}) => {
  const u = new URL(url);
  if (u.hostname !== "mock.supabase.local") return fetchOriginale(url, init);

  const tabella = u.pathname.replace("/rest/v1/", "");
  const metodo = (init.method ?? "GET").toUpperCase();
  const params = u.searchParams;
  if (!db.has(tabella)) db.set(tabella, []);
  const righe = db.get(tabella)!;

  const prefer = String((init.headers as Record<string, string> | undefined)?.prefer ?? "");
  const rappresentazione = prefer.includes("representation");

  if (metodo === "GET") {
    const risultato = applicaFiltri(righe, params);
    return new Response(JSON.stringify(risultato), { status: 200 });
  }

  if (metodo === "POST") {
    const corpo = JSON.parse(String(init.body ?? "[]")) as Riga[];
    const ora = new Date().toISOString();
    const create = corpo.map((r) => ({ id: nuovoId(), created_at: ora, updated_at: ora, ...r }));
    righe.push(...create);
    return new Response(rappresentazione ? JSON.stringify(create) : "", { status: 201 });
  }

  if (metodo === "PATCH") {
    const corpo = JSON.parse(String(init.body ?? "{}")) as Riga;
    const daAggiornare = applicaFiltri(righe, params);
    const ora = new Date().toISOString();
    for (const r of daAggiornare) {
      Object.assign(r, corpo);
      if ("updated_at" in r) r.updated_at = ora;
    }
    return new Response(rappresentazione ? JSON.stringify(daAggiornare) : "", { status: 200 });
  }

  return new Response("metodo non gestito dal mock", { status: 500 });
};

/* ------------------------------------------------------------------ test */

let pass = 0;
let fail = 0;
function assert(cond: unknown, msg: string) {
  if (cond) {
    pass++;
    console.log(`  ✓ ${msg}`);
  } else {
    fail++;
    console.log(`  ✗ ${msg}`);
  }
}

async function main() {
  const dati = await import("../src/lib/dati");
  const linter = await import("../src/lib/linter");
  const auth = await import("../src/lib/auth");

  console.log("\n— matrice dei ruoli —");
  assert(!auth.RUOLI_APPROVA.includes("dipendente"), 'RUOLI_APPROVA NON include "dipendente"');
  assert(auth.RUOLI_APPROVA.includes("mauro") && auth.RUOLI_APPROVA.includes("marketing"), 'RUOLI_APPROVA include "mauro" e "marketing"');
  assert(auth.RUOLI_ADMIN.length === 1 && auth.RUOLI_ADMIN[0] === "mauro", 'RUOLI_ADMIN è solo "mauro"');
  assert(auth.RUOLI_PROPONE.includes("dipendente"), 'RUOLI_PROPONE include "dipendente" (scrive, propone)');

  console.log("\n— sessione firmata —");
  const token = auth.creaTokenSessione({ id: "u1", email: "mauro@sheishair.com", nome: "Mauro", ruolo: "mauro" });
  const letta = auth.leggiTokenSessione(token);
  assert(letta?.ruolo === "mauro" && letta?.email === "mauro@sheishair.com", "il token firmato si rilegge correttamente");
  assert(auth.leggiTokenSessione(token.slice(0, -2) + "00") === null, "un token manomesso viene rifiutato");

  console.log("\n— hash password (scrypt) —");
  const hash = auth.hashPassword("una-password-vera-123");
  assert(auth.verificaPassword("una-password-vera-123", hash), "la password corretta verifica");
  assert(!auth.verificaPassword("password-sbagliata", hash), "una password sbagliata NON verifica");

  console.log("\n— linter: blocco prezzo —");
  const esitoPrezzo = linter.lintContenuto({
    hook: "La nuova promo SHEis Color",
    copy: "Approfitta dello sconto del 20% su tutta la gamma, solo 15€.",
    cta: "Scopri la gamma su www.sheishair.com",
  });
  assert(esitoPrezzo.bloccato, "un contenuto con prezzo/sconto viene bloccato");
  const vPrezzo = esitoPrezzo.violazioni.find((v) => v.regola === "prezzi_cifre_commerciali");
  assert(!!vPrezzo, 'la violazione è marcata "prezzi_cifre_commerciali"');
  console.log(`    → "${vPrezzo?.descrizione}" su "${vPrezzo?.frase}"`);

  console.log("\n— linter: firewall Metodo 29 —");
  const esitoM29 = linter.lintContenuto({
    hook: "Siamo orgogliosi dei nostri brand",
    copy: "SHEis Color, BABILON, YOUNIC e Metodo 29, tutti nati dalla stessa passione.",
    cta: "Scopri la gamma su www.sheishair.com",
  });
  assert(esitoM29.bloccato, 'un contenuto che nomina "Metodo 29" viene bloccato');
  const vM29 = esitoM29.violazioni.find((v) => v.regola === "firewall_metodo_29");
  assert(!!vM29, 'la violazione è marcata "firewall_metodo_29"');
  console.log(`    → "${vM29?.descrizione}" su "${vM29?.frase}"`);

  console.log("\n— linter: un contenuto pulito passa —");
  const esitoPulito = linter.lintContenuto({
    hook: "Una cartella colore che i tuoi saloni non vogliono più lasciare.",
    copy: "SHEis Color lavora su un'ampia cartella professionale, posa di 15 minuti, senza ammoniaca.",
    cta: "Scopri la gamma su www.sheishair.com",
  });
  assert(!esitoPulito.bloccato, "un contenuto brand-safe NON viene bloccato");
  if (esitoPulito.bloccato) console.log("    →", JSON.stringify(esitoPulito.violazioni));

  console.log("\n— linter: verifica indipendente della correzione radice/suffisso (team lead, 2026-08-03) —");
  const koszykaEsito = linter.lintTesto("Aggiungi il prodotto al koszyka prima di uscire dal salone.");
  assert(koszykaEsito.bloccato, '"koszyka" (genitivo polacco di "koszyk") viene bloccato dopo la correzione');
  const carritoEsito = linter.lintTesto("El salón puede añadir el producto al carrito profesional.");
  assert(carritoEsito.bloccato, '"carrito" (nuovo nell\'elenco) viene bloccato');
  const cartellaEsito = linter.lintTesto("Sfoglia la cartella colore SHEis in salone con il tuo distributore.");
  assert(!cartellaEsito.bloccato, '"cartella" NON viene bloccata da "cart" (falso positivo evitato, suffisso solo da 6 caratteri)');
  const comprareEsito = linter.lintTesto("Il distributore può comprare la linea BABILON in blocco.");
  assert(comprareEsito.bloccato, '"comprare" (forma estesa già in elenco) viene bloccato');

  console.log("\n— giro completo: piano → approva/rifiuta/modifica → registro —");
  const piano = await dati.creaPiano("senza ammoniaca");
  const [c1, c2, c3] = await dati.creaContenuti([
    riga(piano.id, "sheis-color", "Angolo 1", "Hook 1"),
    riga(piano.id, "babilon", "Angolo 2", "Hook 2"),
    riga(piano.id, "younic", "Angolo 3", "Hook 3"),
  ]);
  assert([c1, c2, c3].every((c) => c.stato === "in_attesa"), "i 3 contenuti nascono in_attesa");

  const approvato = await dati.approvaContenuto(c1.id, "Mauro Di Bonaventura", "u1");
  assert(approvato.stato === "approvato", "approva → stato approvato");

  const rifiutato = await dati.rifiutaContenuto(c2.id, "Mauro Di Bonaventura", "u1", "Hook debole");
  assert(rifiutato.stato === "scartato" && rifiutato.feedback_mauro === "Hook debole", "rifiuta → stato scartato + nota salvata");

  const modificato = await dati.modificaContenutoManuale(c3.id, { hook: "Hook riscritto a mano" }, "Elena", "u2");
  assert(modificato.stato === "modificato" && modificato.hook === "Hook riscritto a mano", "modifica manuale → stato modificato + campo aggiornato");

  const log1 = await dati.logDiContenuto(c1.id);
  const log2 = await dati.logDiContenuto(c2.id);
  const log3 = await dati.logDiContenuto(c3.id);
  assert(log1.some((l) => l.azione === "approvato" && l.attore === "Mauro Di Bonaventura" && !!l.created_at), "il registro di c1 ha una riga 'approvato' con attore e ora");
  assert(log2.some((l) => l.azione === "scartato" && l.attore === "Mauro Di Bonaventura" && l.note === "Hook debole"), "il registro di c2 ha una riga 'scartato' con nota");
  assert(log3.some((l) => l.azione === "modificato" && l.attore === "Elena" && (l.dettaglio as { tipo?: string } | null)?.tipo === "manuale"), "il registro di c3 ha una riga 'modificato' con tipo 'manuale'");

  console.log(`\n${pass} superati, ${fail} falliti.\n`);
  process.exit(fail > 0 ? 1 : 0);
}

function riga(pianoId: string, brand: string, angolo: string, hook: string) {
  return {
    piano_id: pianoId,
    data_pubblicazione: "2026-08-10",
    canale: "instagram" as const,
    brand: brand as "sheis-color" | "babilon" | "younic",
    pubblico: "distributore-estero" as const,
    lingua: "it" as const,
    lingua_secondaria: "en" as const,
    formato: "video" as const,
    angolo,
    hook,
    copy: "Copy di prova.",
    copy_secondario: null,
    cta: "Scrivici per saperne di più.",
    hashtag: null,
    stato: "in_attesa" as const,
    creato_da: "u1",
  };
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
