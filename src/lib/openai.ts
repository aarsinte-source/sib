import "server-only";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Generazione testi con DUE motori, in ordine, e il ripiego dichiarato.
 *
 * 1. Claude headless (`claude --print`), se il binario è presente. Stesso
 *    pattern di ~/alkemia-sheis-outreach/sheis_outreach/composer.py: prompt
 *    unico (system+user concatenati), timeout esplicito (il processo non
 *    deve appendere una richiesta web per sempre), estrazione della risposta
 *    fra tag invece di sperare in un output "solo JSON".
 * 2. OpenAI, se OPENAI_API_KEY è impostata (era l'unico motore, oggi la
 *    chiave è vuota e non recuperabile — Vercel la marca "Sensitive").
 * 3. Se nessuno dei due funziona: ApiError con il motivo di ENTRAMBI i
 *    tentativi, non un errore tecnico incomprensibile (SPEC.md §"Il degrado
 *    si dichiara").
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

export type Motore = "claude" | "openai";

export type RisultatoGenerazione = {
  dati: Record<string, unknown>;
  motore: Motore;
};

/* ------------------------------------------------------- motore 1: Claude */

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

/* ------------------------------------------------------- motore 2: OpenAI */

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
 * Prova Claude headless, poi OpenAI, e restituisce SEMPRE quale motore ha
 * prodotto il risultato. Se entrambi falliscono (o mancano), solleva un
 * ApiError 503 col motivo di ciascun tentativo — mai un errore tecnico
 * incomprensibile propagato al chiamante.
 */
export async function generaJSON(system: string, user: string): Promise<RisultatoGenerazione> {
  const tentativi: string[] = [];

  if (claudeDisponibile()) {
    try {
      const dati = await generaConClaude(system, user);
      return { dati, motore: "claude" };
    } catch (e) {
      tentativi.push(`Claude: ${e instanceof Error ? e.message : "errore sconosciuto"}.`);
    }
  } else {
    tentativi.push(`Claude: binario non trovato in "${claudeBinPath()}".`);
  }

  if (process.env.OPENAI_API_KEY) {
    try {
      const dati = await generaConOpenAI(system, user);
      return { dati, motore: "openai" };
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
