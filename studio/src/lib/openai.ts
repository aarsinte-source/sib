import "server-only";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Generazione testi con TRE motori, in ordine, e il ripiego dichiarato.
 *
 * 1. OpenRouter (HTTP). È il motore PRINCIPALE, e l'ordine non è casuale:
 *    è l'unico dei tre che funziona anche quando il portale non gira sul
 *    portatile di Andrei. Su Vercel non esiste alcun processo locale da
 *    lanciare, quindi un motore che dipende da un binario installato è un
 *    motore che il giorno del trasloco smette di esistere.
 * 2. Claude headless (`claude --print`), se il binario è presente. Resta
 *    come riserva locale.
 *    ⚠️ MISURATO il 2026-08-04: su questa macchina `claude --print` NON
 *    risponde — resta appeso oltre i 45 secondi senza scrivere un byte, e
 *    il timeout a 300s lo uccide. È il difetto già noto del ponte headless
 *    (la CLI aspetta una conferma interattiva che in `--print` nessuno può
 *    dare). Per questo è stato retrocesso da primo a secondo: era il primo,
 *    e faceva aspettare cinque minuti prima di provare qualcosa che
 *    funzionava.
 * 3. OpenAI, se OPENAI_API_KEY è impostata.
 * 4. Se nessuno funziona: ApiError col motivo di OGNI tentativo, non un
 *    errore tecnico incomprensibile (SPEC.md §"Il degrado si dichiara").
 *
 * Il motore che ha prodotto il testo viene sempre restituito insieme ai
 * dati: chi consuma il risultato lo mostra in UI, così chi legge un piano
 * editoriale sa da cosa è stato generato — un ripiego silenzioso è un
 * guasto mai riparato.
 */

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export type Motore = "openrouter" | "claude" | "openai";

export type RisultatoGenerazione = {
  dati: Record<string, unknown>;
  motore: Motore;
  /**
   * I motori provati PRIMA di quello che ha funzionato, col motivo del
   * fallimento. Vuoto quando il primo ha risposto.
   *
   * ⚠️ Esiste per un difetto vero, non per completezza. Il 2026-08-04 il
   * portale ha prodotto un'analisi dichiarando `motore: claude`: significava
   * che OpenRouter aveva fallito con un 401 e nessuno lo diceva. La chiamata
   * riusciva, quindi il guasto era invisibile — e un motore rotto che nessuno
   * vede resta rotto, finché un giorno non cade anche il ripiego e allora
   * cadono tutti insieme.
   */
  ripieghi: string[];
};

/* --------------------------------------------------- motore 1: OpenRouter */

const OPENROUTER_MODELLO = process.env.OPENROUTER_MODEL || "anthropic/claude-sonnet-4.5";
// 240s: un piano a 30 giorni è la richiesta più lunga che passa di qui, e su
// Vercel il tetto della funzione è comunque più basso — chi la supera lo vede
// dal messaggio, non da una pagina che gira a vuoto.
const OPENROUTER_TIMEOUT_MS = Number(process.env.OPENROUTER_TIMEOUT_MS || 240_000);

/**
 * Ripulisce una risposta che dovrebbe essere solo JSON. Serve anche qui, non
 * solo per la CLI: MISURATO il 2026-08-04, con `response_format: json_object`
 * il modello ha comunque incorniciato la risposta in un fence markdown. Un
 * `JSON.parse` diretto sarebbe fallito su una chiamata già pagata.
 */
function ripulisciJSON(testo: string): string {
  let c = testo.trim();
  const tag = c.match(/<risposta>([\s\S]*?)<\/risposta>/i);
  if (tag) c = tag[1].trim();
  if (c.startsWith("```")) {
    c = c.replace(/^```[a-zA-Z]*\n?/, "").replace(/```\s*$/, "").trim();
  }
  // Ultima rete: se resta del testo attorno, si prende il primo oggetto JSON
  // bilanciato invece di arrendersi.
  if (!c.startsWith("{")) {
    const i = c.indexOf("{");
    const j = c.lastIndexOf("}");
    if (i >= 0 && j > i) c = c.slice(i, j + 1);
  }
  return c;
}

async function generaConOpenRouter(system: string, user: string): Promise<Record<string, unknown>> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("OPENROUTER_API_KEY non impostata");

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), OPENROUTER_TIMEOUT_MS);
  let r: Response;
  try {
    r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        authorization: `Bearer ${key}`,
        "content-type": "application/json",
        // OpenRouter chiede l'identificazione dell'applicazione: senza, alcune
        // rotte rispondono con limiti più stretti.
        "HTTP-Referer": process.env.OPENROUTER_REFERER || "https://sheis.alkemia",
        "X-Title": "SHEis Studio",
      },
      body: JSON.stringify({
        model: OPENROUTER_MODELLO,
        temperature: 0.7,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      throw new Error(`timeout dopo ${Math.round(OPENROUTER_TIMEOUT_MS / 1000)}s`);
    }
    throw new Error(`errore di rete (${e instanceof Error ? e.message : "sconosciuto"})`);
  } finally {
    clearTimeout(timer);
  }

  if (!r.ok) {
    const corpo = await r.text().catch(() => "");
    throw new Error(`ha risposto ${r.status}${corpo ? ` — ${corpo.slice(0, 200)}` : ""}`);
  }

  const j = (await r.json()) as {
    choices?: { message?: { content?: string } }[];
    error?: { message?: string };
  };
  if (j.error?.message) throw new Error(j.error.message.slice(0, 200));
  const content = j.choices?.[0]?.message?.content;
  if (!content) throw new Error("risposta vuota");

  const corpo = ripulisciJSON(content);
  try {
    return JSON.parse(corpo) as Record<string, unknown>;
  } catch {
    throw new Error(`formato non valido, parsing JSON fallito su: ${corpo.slice(0, 200)}`);
  }
}

/* ------------------------------------------------------- motore 2: Claude */

// 300s di default: più alto dei 180s di ~/alkemia-sheis-outreach/sheis_outreach/config.py
// perché lì un tocco è UN messaggio breve, qui un piano editoriale sono 8 post
// strutturati e bilingue nello stesso prompt — misurato: l'analisi (4 liste corte)
// impiega ~1 minuto, il piano ne richiede di più. Configurabile via env.
const CLAUDE_TIMEOUT_MS = Number(process.env.CLAUDE_TIMEOUT_MS || 300_000);
const CLAUDE_MODEL = process.env.CLAUDE_MODEL || "sonnet";

function claudeBinPath(): string {
  const configurato = process.env.CLAUDE_BIN;
  if (configurato) return configurato.startsWith("~") ? configurato.replace("~", os.homedir()) : configurato;
  // turbopackIgnore: percorso risolto a runtime (home dell'utente), non un asset da tracciare al build.
  return path.join(/* turbopackIgnore: true */ os.homedir(), ".local", "bin", "claude");
}

function claudeDisponibile(): boolean {
  try {
    // turbopackIgnore: il path è risolto a runtime (home dell'utente + env var), non un asset del progetto.
    return existsSync(/* turbopackIgnore: true */ claudeBinPath());
  } catch {
    return false;
  }
}

/**
 * Estrae il contenuto fra <risposta>...</risposta>. Non ci si fida di una
 * risposta "solo JSON": il modello tende a premettere commenti o a chiudere
 * in un fence markdown — senza questo contratto un preambolo finisce dentro
 * il JSON.parse e lo rompe (stesso motivo del tag <messaggio> in composer.py).
 */
function estraiTag(testo: string): string {
  const m = testo.match(/<risposta>([\s\S]*?)<\/risposta>/i);
  let corpo = (m ? m[1] : testo).trim();
  if (corpo.startsWith("```")) {
    corpo = corpo
      .replace(/^```[a-zA-Z]*\n?/, "")
      .replace(/```\s*$/, "")
      .trim();
  }
  return corpo;
}

function eseguiClaude(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      claudeBinPath(),
      ["--print", "--permission-mode", "bypassPermissions", "--model", CLAUDE_MODEL, prompt],
      { timeout: CLAUDE_TIMEOUT_MS, maxBuffer: 10 * 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err) {
          const segnalato = err as NodeJS.ErrnoException & { killed?: boolean; signal?: string | null };
          if (segnalato.killed || segnalato.signal) {
            reject(new Error(`timeout dopo ${Math.round(CLAUDE_TIMEOUT_MS / 1000)}s`));
            return;
          }
          reject(new Error(`processo fallito: ${(stderr || err.message || "").slice(0, 300)}`));
          return;
        }
        const out = (stdout || "").trim();
        if (!out) {
          reject(new Error(`risposta vuota. stderr: ${(stderr || "").slice(0, 300) || "(nessuno)"}`));
          return;
        }
        resolve(out);
      },
    );
  });
}

async function generaConClaude(system: string, user: string): Promise<Record<string, unknown>> {
  const prompt = `${system}

${user}

FORMATO DI OUTPUT — obbligatorio e non negoziabile: racchiudi l'oggetto JSON di risposta, e SOLO quello, fra i tag <risposta> e </risposta>. Nessun commento, nessuna spiegazione, nessun markdown né prima né dopo i tag.`;

  const raw = await eseguiClaude(prompt);
  const corpo = estraiTag(raw);
  try {
    return JSON.parse(corpo) as Record<string, unknown>;
  } catch {
    throw new Error(`formato non valido, parsing JSON fallito su: ${corpo.slice(0, 200)}`);
  }
}

/* ------------------------------------------------------- motore 3: OpenAI */

async function generaConOpenAI(system: string, user: string): Promise<Record<string, unknown>> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY non impostata");
  const model = process.env.OPENAI_MODEL || "gpt-4o";

  let r: Response;
  try {
    r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({
        model,
        temperature: 0.7,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });
  } catch (e) {
    throw new Error(`errore di rete (${e instanceof Error ? e.message : "sconosciuto"})`);
  }

  if (!r.ok) throw new Error(`ha risposto ${r.status}`);

  const j = (await r.json()) as { choices?: { message?: { content?: string } }[] };
  const content = j.choices?.[0]?.message?.content;
  if (!content) throw new Error("risposta vuota");

  try {
    return JSON.parse(content) as Record<string, unknown>;
  } catch {
    throw new Error("formato non valido");
  }
}

/* -------------------------------------------------------- orchestratore */

/**
 * Prova OpenRouter, poi Claude locale, poi OpenAI, e restituisce SEMPRE quale
 * motore ha prodotto il risultato. Se falliscono tutti, solleva un ApiError
 * 503 col motivo di ciascun tentativo — mai un errore tecnico incomprensibile
 * propagato al chiamante.
 *
 * ⚠️ `SOLO_MOTORI_HTTP=1` disattiva il motore locale. Va impostata ovunque il
 * portale non giri sul portatile (Vercel lo fa da sé, vedi sotto): senza,
 * l'ambiente proverebbe a lanciare un binario che non c'è e sprecherebbe un
 * tentativo per dire una cosa già nota.
 */
const SOLO_HTTP =
  process.env.SOLO_MOTORI_HTTP === "1" || !!process.env.VERCEL || !!process.env.AWS_LAMBDA_FUNCTION_NAME;

export async function generaJSON(system: string, user: string): Promise<RisultatoGenerazione> {
  const tentativi: string[] = [];

  if (process.env.OPENROUTER_API_KEY) {
    try {
      const dati = await generaConOpenRouter(system, user);
      return { dati, motore: "openrouter", ripieghi: [] };
    } catch (e) {
      tentativi.push(`OpenRouter: ${e instanceof Error ? e.message : "errore sconosciuto"}.`);
    }
  } else {
    tentativi.push("OpenRouter: OPENROUTER_API_KEY non impostata.");
  }

  if (!SOLO_HTTP) {
    if (claudeDisponibile()) {
      try {
        const dati = await generaConClaude(system, user);
        return { dati, motore: "claude", ripieghi: [...tentativi] };
      } catch (e) {
        tentativi.push(`Claude locale: ${e instanceof Error ? e.message : "errore sconosciuto"}.`);
      }
    } else {
      tentativi.push(`Claude locale: binario non trovato in "${claudeBinPath()}".`);
    }
  }

  if (process.env.OPENAI_API_KEY) {
    try {
      const dati = await generaConOpenAI(system, user);
      return { dati, motore: "openai", ripieghi: [...tentativi] };
    } catch (e) {
      tentativi.push(`OpenAI: ${e instanceof Error ? e.message : "errore sconosciuto"}.`);
    }
  } else {
    tentativi.push("OpenAI: OPENAI_API_KEY non impostata.");
  }

  throw new ApiError(
    503,
    `Generazione non disponibile: nessun motore ha funzionato. ${tentativi.join(" ")}`,
  );
}

export const MOTORE_LABEL: Record<Motore, string> = {
  openrouter: "OpenRouter",
  claude: "Claude (locale)",
  openai: "OpenAI",
};

/** Segnali reali dal mercato, best-effort via ScrapeCreators. Non blocca mai: timeout corto, [] su errore. */
export async function segnaliMercato(query: string): Promise<string[]> {
  const key = process.env.SCRAPECREATORS_API_KEY;
  if (!key) return [];
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 4000);
  try {
    const url = `https://api.scrapecreators.com/v1/reddit/search?query=${encodeURIComponent(query)}&sort=relevance`;
    const r = await fetch(url, { headers: { "x-api-key": key }, signal: ctrl.signal });
    if (!r.ok) return [];
    const j = (await r.json()) as unknown;
    return estraiTitoli(j).slice(0, 5);
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

function estraiTitoli(j: unknown): string[] {
  const out: string[] = [];
  const visita = (node: unknown, depth: number) => {
    if (depth > 4 || out.length >= 8 || node === null || typeof node !== "object") return;
    if (Array.isArray(node)) {
      for (const el of node) visita(el, depth + 1);
      return;
    }
    const rec = node as Record<string, unknown>;
    const t = rec.title ?? rec.selftext ?? rec.body;
    if (typeof t === "string" && t.trim().length > 12) out.push(t.trim().slice(0, 200));
    for (const v of Object.values(rec)) if (typeof v === "object") visita(v, depth + 1);
  };
  visita(j, 0);
  return out;
}

/* ------------------------------------------------------------- coercizioni */

export function pick<T extends string>(v: unknown, allowed: readonly T[], def: T): T {
  return typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : def;
}
export function str(v: unknown, def = ""): string {
  return typeof v === "string" && v.trim() ? v.trim() : def;
}
export function strArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string" && x.trim().length > 0).map((x) => x.trim());
}
