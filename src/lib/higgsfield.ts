import "server-only";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { scegli, formatoPer, formatoAmmesso, GATE } from "@/lib/modelli-creativi";
import type { Brand, Formato } from "@/lib/brand";
import { BRAND_LABEL, VALORI_ASSE, asseVarianteDeterministico, type AsseVariante } from "@/lib/brand";
import {
  COSTO_EUR_PER_CREDITO,
  CREDITI_PER_VARIANTE,
  QUALITA_LABEL,
  costoStimato,
  type QualitaImmagine,
} from "@/lib/higgsfield-shared";

/**
 * Generazione delle varianti creative + GATE DI COSTO obbligatorio.
 *
 * 1 credito = €0,0330, misurato (vedi memoria reference_higgsfield_costi_euro,
 * campionato da 774 preventivi reali dell'API costi Higgsfield). Per gpt_image_2
 * i due costi DOCUMENTATI sono: default 2k/high = 7 crediti/immagine, economico
 * 1k/low = 0,5 crediti/immagine. Non si inventano numeri intermedi.
 *
 * Stato reale di questo ambiente: nessuna HIGGSFIELD_API_KEY è stata fornita a
 * questa app (solo Supabase e OpenAI, per istruzione esplicita). generaVariante()
 * quindi degrada SEMPRE a "non collegato" finché quella chiave non arriva — è
 * il comportamento corretto per "il degrado si dichiara", non un bug: il
 * prompt e il costo restano comunque calcolati e visibili, pronti per quando
 * la chiave ci sarà (o per un worker esterno che legge la coda, come fa già
 * ~/alkemia-sheis-console per lo stesso motivo).
 */

export type { QualitaImmagine };
export { COSTO_EUR_PER_CREDITO, CREDITI_PER_VARIANTE, QUALITA_LABEL, costoStimato };

const BRAND_PROMPT: Record<Brand, { palette: string; soggetto: string; segno: string }> = {
  "sheis-color": {
    palette: "warm bone and near-black ink tones with restrained desaturated gold accents",
    soggetto: "an editorial still-life of a professional hair-colour tube resting beside a fanned-out colour swatch chart",
    segno: "evoke the depth of an 83-shade professional colour range, ammonia-free and precise",
  },
  babilon: {
    palette: "soft botanical greens, earthy neutrals and warm bone light",
    soggetto: "an editorial still-life of a professional hair-care bottle among natural botanical elements, dried leaves and raw stone",
    segno: "evoke 99% natural-origin, honest and quiet, nothing artificial in frame",
  },
  younic: {
    palette: "calm spa neutrals, warm greys and a single soft gold highlight",
    soggetto: "an editorial still-life of professional hair-treatment vessels arranged on a clean surface",
    segno: "evoke a structured three-phase professional treatment, clinical yet warm",
  },
};

function aspectRatioDa(formato: Formato): "1:1" | "4:5" | "9:16" {
  if (formato === "video") return "9:16";
  return "4:5";
}

export type SpecVariante = { indice: 1 | 2 | 3; asse: AsseVariante; angoloVisivo: string; prompt: string };

/**
 * Costruisce le 3 varianti deterministicamente: sceglie UN asse dichiarato
 * (inquadratura | ambientazione | luce, mai a caso — SPEC.md) e ne applica i
 * 3 valori fissi, uno per variante, tenendo fisso tutto il resto.
 */
export function costruisciVarianti(input: {
  brand: Brand;
  formato: Formato;
  angolo: string;
  hook: string;
}): SpecVariante[] {
  const asse = asseVarianteDeterministico(input.brand, input.formato);
  const valori = VALORI_ASSE[asse];
  const b = BRAND_PROMPT[input.brand];
  const ar = aspectRatioDa(input.formato);
  const clean = ar === "9:16" ? "keep the lower third clean for on-screen text" : "keep a clean empty area in the upper third for headline text";

  return valori.map((valore, i) => ({
    indice: (i + 1) as 1 | 2 | 3,
    asse,
    angoloVisivo: `${asse}: ${valore}`,
    prompt: [
      `Luxury editorial product photograph, ${ar} aspect ratio, ${BRAND_LABEL[input.brand]} professional hair-care.`,
      `${b.soggetto}.`,
      `Palette: ${b.palette}. Variation axis (${asse}): ${valore}.`,
      `Creative angle: ${input.angolo}. Mood cue from the hook: "${input.hook}".`,
      `${b.segno}.`,
      `Composition: ${clean}. Minimal, sophisticated, B2B professional register — speaks to distributors and salons, never to a retail consumer.`,
      `Strict constraints: no price, no percentages or numbers rendered as graphics, no shop or e-commerce cues, no logos, no on-image text. Photorealistic, high resolution.`,
    ].join(" "),
  }));
}

export type EsitoGenerazione =
  | { ok: true; assetUrl: string; costoCrediti: number; costoEur: number; nota?: string }
  | { ok: false; errore: string; tettoRaggiunto: boolean };

/**
 * Genera davvero su Higgsfield, passando dalla CLI.
 *
 * ⚠️ Perché la CLI e non l'API diretta. Prima questa funzione chiamava
 * `fnf.higgsfield.ai` con HIGGSFIELD_API_KEY e HIGGSFIELD_API_SECRET — due
 * variabili che nessuno ha mai avuto, quindi la funzione rispondeva SEMPRE
 * «non collegato» e nessuna creatività è mai uscita. Higgsfield non autentica
 * con una chiave statica: la CLI conserva una coppia di token che si rinnova
 * da sola, ed è già collegata all'account. Una chiave copiata a mano
 * scadrebbe; questa no.
 *
 * ⚠️ Il modello NON è più scritto qui. Viene dal catalogo misurato
 * (`modelli-creativi.ts`, generato dalla fonte): «grafica» → Nano Banana Pro,
 * «ugc-video» → Seedance 2.0, e così via. Prima era `gpt_image_2` per
 * qualunque cosa: 7 crediti contro 2, più lento, e migliore in niente.
 */
export async function generaImmagine(
  prompt: string,
  qualita: QualitaImmagine,
  opzioni: { lavoro?: string; canale?: string } = {},
): Promise<EsitoGenerazione> {
  const lavoro = opzioni.lavoro ?? (qualita === "2k_high" ? "grafica" : "grafica-bozza");

  let scelta: ReturnType<typeof scegli>;
  try {
    scelta = scegli(lavoro);
  } catch (e) {
    return {
      ok: false,
      tettoRaggiunto: false,
      errore: e instanceof Error ? e.message : "Lavoro creativo non riconosciuto.",
    };
  }

  const crediti = scelta.crediti;
  const eur = Math.round(crediti * COSTO_EUR_PER_CREDITO * 100) / 100;

  const cli = trovaCli();
  if (!cli) {
    return {
      ok: false,
      tettoRaggiunto: false,
      errore:
        "La riga di comando Higgsfield non è raggiungibile da questo server. " +
        "Si installa con `npm i -g @higgsfield/cli` e si collega con `higgsfield auth login`; " +
        "se è installata altrove, imposta HIGGSFIELD_CLI sul percorso. " +
        "Il prompt e il costo stimato restano pronti: non si perde nulla di quanto già deciso.",
    };
  }

  const parametri: string[] = ["--prompt", prompt];
  for (const [k, v] of Object.entries(scelta.parametri)) {
    parametri.push(`--${k}`, String(v));
  }
  // Il formato viene dal posto dove il contenuto verrà visto, non da una
  // preferenza: una grafica quadrata dentro una storia lascia due bande vuote.
  // Il canale VINCE sul default del catalogo — il default serve a quando il
  // canale non si sa, non a sovrascriverlo quando si sa.
  let notaFormato = "";
  if (opzioni.canale) {
    const richiesto = formatoPer(opzioni.canale);
    if (richiesto !== "auto") {
      // ⚠️ Il modello potrebbe non accettare quel formato: GPT Image 2 rifiuta
      // il 4:5, che è proprio quello del feed Instagram. Si prende il più
      // vicino e si dichiara.
      const [f, nota] = formatoAmmesso(lavoro, richiesto);
      notaFormato = nota;
      const i = parametri.indexOf("--aspect_ratio");
      if (i >= 0) parametri[i + 1] = f;
      else parametri.push("--aspect_ratio", f);
    }
  }

  const esito = await esegui(cli, ["generate", "create", scelta.modello, ...parametri, "--wait", "--json"]);

  if (!esito.ok) {
    // ⚠️ Un fallimento QUI non significa che il lavoro non sia stato fatto.
    // Misurato il 3/8 su un video: il comando è uscito con HTTP 502 mentre
    // aspettava l'esito, e intanto il video era stato prodotto e 22 crediti
    // addebitati. Dichiarare fallimento dopo aver speso è il modo più costoso
    // di sbagliare: chi legge rigenera, e paga due volte la stessa cosa.
    const recuperato = await recuperaJobRecente(cli, scelta.modello);
    if (recuperato) {
      return { ok: true, assetUrl: recuperato, costoCrediti: crediti, costoEur: eur };
    }
    // Il tetto giornaliero è una cosa diversa dall'aver finito i crediti: si
    // può avere saldo e vedersi rifiutare la generazione lo stesso. Chi legge
    // deve sapere se aspettare domani o ricaricare.
    const tetto = GATE.marcatori_tetto_giornaliero.some((m) =>
      esito.uscita.toLowerCase().includes(m.toLowerCase()),
    );
    return {
      ok: false,
      tettoRaggiunto: tetto,
      errore: tetto
        ? `Higgsfield ha raggiunto il tetto giornaliero di generazioni — è un limite di ritmo, non di crediti: il saldo può essere ancora capiente. Le varianti in coda non partono. Riprova domani. (${scelta.nome_umano})`
        : `Higgsfield non ha completato la generazione con ${scelta.nome_umano}: ${esito.uscita.slice(0, 240) || "nessun dettaglio"}`,
    };
  }

  const assetUrl = estraiUrl(esito.uscita);
  if (!assetUrl) {
    return {
      ok: false,
      tettoRaggiunto: false,
      errore:
        `${scelta.nome_umano} ha completato il lavoro ma non ha restituito un indirizzo utilizzabile. ` +
        `Il job esiste: si recupera con \`higgsfield generate list\`.`,
    };
  }

  return { ok: true, assetUrl, costoCrediti: crediti, costoEur: eur, nota: notaFormato || undefined };
}

/**
 * L'ultimo lavoro COMPLETATO con questo modello, se è appena successo.
 *
 * Serve dopo un'attesa caduta: il lavoro può essere andato a buon fine e
 * l'addebito essere già avvenuto. Si limita alla finestra recente e allo
 * stesso modello — meglio nessun recupero che l'asset sbagliato.
 */
async function recuperaJobRecente(cli: string, modello: string, entroSecondi = 900): Promise<string | null> {
  const r = await esegui(cli, ["generate", "list", "--json"]);
  if (!r.ok) return null;
  const i = r.uscita.search(/[[{]/);
  if (i < 0) return null;
  let dati: unknown;
  try {
    dati = JSON.parse(r.uscita.slice(i));
  } catch {
    return null;
  }
  if (!Array.isArray(dati)) return null;
  const adesso = Date.now() / 1000;
  for (const j of dati as Record<string, unknown>[]) {
    if (j?.job_set_type !== modello || j?.status !== "completed") continue;
    const creato = j.created_at;
    if (typeof creato === "number" && adesso - creato > entroSecondi) continue;
    const url = typeof j.result_url === "string" ? j.result_url : cercaUrl(j);
    if (url) return url;
  }
  return null;
}

function trovaCli(): string | null {
  const candidati = [
    process.env.HIGGSFIELD_CLI,
    join(process.env.HOME ?? "", ".npm-global", "bin", "higgsfield"),
    "/usr/local/bin/higgsfield",
    "/opt/homebrew/bin/higgsfield",
  ].filter(Boolean) as string[];
  return candidati.find((p) => existsSync(p)) ?? null;
}

function esegui(cli: string, argomenti: string[]): Promise<{ ok: boolean; uscita: string }> {
  return new Promise((risolvi) => {
    const p = spawn(cli, argomenti, { env: { ...process.env, NO_COLOR: "1" } });
    let uscita = "";
    p.stdout.on("data", (d) => (uscita += d.toString()));
    p.stderr.on("data", (d) => (uscita += d.toString()));
    p.on("error", (e) => risolvi({ ok: false, uscita: `la riga di comando non è partita: ${e.message}` }));
    // Un video può richiedere minuti: il limite è generoso ma esiste, perché
    // un'attesa senza fine in un'interfaccia web è indistinguibile da un guasto.
    const timer = setTimeout(() => {
      p.kill();
      risolvi({ ok: false, uscita: "la generazione ha superato i 10 minuti ed è stata interrotta" });
    }, 600_000);
    p.on("close", (codice) => {
      clearTimeout(timer);
      risolvi({ ok: codice === 0, uscita });
    });
  });
}

/**
 * L'indirizzo dell'asset, comunque la CLI decida di chiamarlo.
 *
 * ⚠️ La CLI stampa JSON INDENTATO su più righe (verificato su una generazione
 * vera: la risposta è un array, la chiave è `result_url`). Cercare una riga che
 * sia JSON completo non trova mai niente — si finiva a pescare l'indirizzo con
 * un'espressione regolare, che funziona finché il formato non cambia di poco.
 * Qui si prova prima a leggere l'output INTERO come JSON, che è ciò che è.
 */
function estraiUrl(uscita: string): string | null {
  const inizio = uscita.search(/[[{]/);
  if (inizio >= 0) {
    try {
      const trovato = cercaUrl(JSON.parse(uscita.slice(inizio)) as unknown);
      if (trovato) return trovato;
    } catch {
      /* preambolo o coda non JSON: si prova il ripiego sotto */
    }
  }
  // Ripiego: un indirizzo nudo nell'output. Meglio di un fallimento quando
  // l'unica cosa che manca è la forma esatta della risposta.
  return uscita.match(/https?:\/\/\S+\.(?:png|jpe?g|webp|mp4|mov)/i)?.[0] ?? null;
}

function cercaUrl(o: unknown): string | null {
  if (typeof o === "string") return /^https?:\/\//.test(o) ? o : null;
  if (Array.isArray(o)) {
    for (const v of o) {
      const t = cercaUrl(v);
      if (t) return t;
    }
    return null;
  }
  if (o && typeof o === "object") {
    const d = o as Record<string, unknown>;
    for (const chiave of ["url", "asset_url", "output_url", "result_url", "download_url"]) {
      if (typeof d[chiave] === "string" && /^https?:\/\//.test(d[chiave] as string)) return d[chiave] as string;
    }
    for (const v of Object.values(d)) {
      const t = cercaUrl(v);
      if (t) return t;
    }
  }
  return null;
}
