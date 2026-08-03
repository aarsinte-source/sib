import "server-only";

/**
 * Chiamate OpenAI in JSON mode. Stesso pattern di ~/alkemia-sheis-console/src/
 * lib/marketing.ts (openaiJSON): niente SDK, solo fetch, errori tradotti in
 * ApiError con messaggio pulito da mostrare in UI. La chiave riusa la stessa
 * variabile della console (OPENAI_API_KEY / OPENAI_MODEL).
 */

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export async function openaiJSON(system: string, user: string): Promise<unknown> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    throw new ApiError(503, "Generazione non disponibile: manca la chiave OpenAI lato server (OPENAI_API_KEY).");
  }
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
  } catch {
    throw new ApiError(502, "Errore di rete verso OpenAI. Riprova.");
  }

  if (!r.ok) {
    throw new ApiError(502, `OpenAI ha risposto ${r.status}. Riprova tra poco.`);
  }

  const j = (await r.json()) as { choices?: { message?: { content?: string } }[] };
  const content = j.choices?.[0]?.message?.content;
  if (!content) throw new ApiError(502, "OpenAI ha restituito una risposta vuota.");

  try {
    return JSON.parse(content) as unknown;
  } catch {
    throw new ApiError(502, "OpenAI ha restituito un formato non valido.");
  }
}

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
