import "server-only";

/**
 * Client REST reale per Zernio (`https://zernio.com/api/v1`, auth
 * `Authorization: Bearer sk_...` — stessa chiave della configurazione MCP in
 * ~/.claude.json). CORREZIONE 2026-08-03: la versione precedente di questo
 * file dichiarava "Zernio non è raggiungibile da questa app, esiste solo via
 * MCP" — era una deduzione plausibile ma FALSA, mai verificata con una
 * chiamata vera. Verificato dal vivo (curl e Python) lo stesso giorno:
 * `GET /accounts` risponde 200 con 2 account reali collegati (facebook
 * alkemia.marketing, instagram andrei_arsinte). Il blocco vero non è "manca
 * l'integrazione": è **"nessun account SHEis è collegato"** — sono due frasi
 * molto diverse per chi legge (vedi correzione del team lead).
 *
 * Riferimento di partenza: tools/zernio_post.py nel repo scalers-plus.
 *
 * Verifica dal vivo su OGNI chiamata (mai una cache locale): la lista account
 * la interroga `pubblicaSuZernio()` a ogni invocazione, così un account
 * appena collegato da Mauro sblocca la pubblicazione senza bisogno di
 * riavviare l'app.
 */

const API_BASE = (process.env.ZERNIO_API_BASE || "https://zernio.com/api/v1").replace(/\/+$/, "");

export type AccountZernio = {
  id: string;
  piattaforma: string;
  username: string;
  nomeVisualizzato: string;
  attivo: boolean;
};

export type EsitoAccount = { ok: true; account: AccountZernio[] } | { ok: false; errore: string };

/** Estrae l'array di account dalla risposta, qualunque sia l'involucro (`{accounts:[...]}`, `{data:[...]}`, `[...]`). */
function estraiListaGrezza(corpo: unknown): unknown[] {
  if (Array.isArray(corpo)) return corpo;
  if (corpo && typeof corpo === "object") {
    const rec = corpo as Record<string, unknown>;
    if (Array.isArray(rec.accounts)) return rec.accounts;
    if (Array.isArray(rec.data)) return rec.data;
  }
  return [];
}

/** Forma reale verificata il 2026-08-03: {_id, platform, username, displayName, enabled, ...}. */
function normalizzaAccount(raw: unknown): AccountZernio | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const id = typeof r._id === "string" ? r._id : typeof r.id === "string" ? r.id : "";
  const piattaforma = typeof r.platform === "string" ? r.platform : "";
  if (!id || !piattaforma) return null;
  const username = typeof r.username === "string" ? r.username : "";
  return {
    id,
    piattaforma,
    username,
    nomeVisualizzato: typeof r.displayName === "string" ? r.displayName : username || piattaforma,
    attivo: r.enabled !== false,
  };
}

/** GET /accounts — dal vivo, mai mockato. */
async function listaAccount(): Promise<EsitoAccount> {
  const key = process.env.ZERNIO_API_KEY;
  if (!key) return { ok: false, errore: "Manca ZERNIO_API_KEY nelle variabili del server." };

  let r: Response;
  try {
    r = await fetch(`${API_BASE}/accounts`, {
      headers: { authorization: `Bearer ${key}`, accept: "application/json" },
      cache: "no-store",
    });
  } catch (e) {
    return { ok: false, errore: `Errore di rete verso Zernio: ${e instanceof Error ? e.message : "sconosciuto"}.` };
  }

  const testo = await r.text();
  if (!r.ok) {
    return { ok: false, errore: `Zernio ha risposto ${r.status} su /accounts: ${testo.slice(0, 200) || "nessun dettaglio"}.` };
  }

  let corpo: unknown;
  try {
    corpo = JSON.parse(testo);
  } catch {
    return { ok: false, errore: "Zernio ha restituito una risposta non valida su /accounts." };
  }

  const account = estraiListaGrezza(corpo)
    .map(normalizzaAccount)
    .filter((a): a is AccountZernio => a !== null);
  return { ok: true, account };
}

/** Consultazione dal vivo per una pagina di stato/diagnostica. */
export async function statoAccountZernio(): Promise<EsitoAccount> {
  return listaAccount();
}

/**
 * Quali degli account collegati sono di SHEis. Allowlist esplicita via
 * `ZERNIO_SHEIS_USERNAMES` (csv di username, case-insensitive) — oggi VUOTA:
 * nessun account è collegato per SHEis (i due esistenti sono entrambi
 * Alkemia). Una allowlist vuota blocca sempre, per costruzione: non c'è modo
 * di far sembrare "SHEis" un account che non è stato dichiarato tale.
 */
function filtraAccountSheis(account: AccountZernio[]): AccountZernio[] {
  const allowlist = (process.env.ZERNIO_SHEIS_USERNAMES ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (allowlist.length === 0) return [];
  return account.filter((a) => allowlist.includes(a.username.toLowerCase()));
}

export type EsitoPubblicazione = { ok: true; postId: string } | { ok: false; motivo: string };

/**
 * Pubblica (o schedula) un post reale su Zernio — SOLO se esiste un account
 * SHEis collegato per quel canale. Non ripiega MAI sui canali Alkemia, anche
 * se sono gli unici disponibili: pubblicare lì "per prova" è peggio che non
 * pubblicare (SPEC.md).
 */
export async function pubblicaSuZernio(input: {
  contenutoId: string;
  canale: string;
  testo: string;
  mediaUrls?: string[];
  programmatoPer?: string; // ISO 8601
}): Promise<EsitoPubblicazione> {
  const esitoAccount = await listaAccount();
  if (!esitoAccount.ok) {
    return { ok: false, motivo: `Zernio non raggiungibile per il contenuto ${input.contenutoId}: ${esitoAccount.errore}` };
  }

  const sheis = filtraAccountSheis(esitoAccount.account);
  if (sheis.length === 0) {
    const collegati = esitoAccount.account.length
      ? esitoAccount.account.map((a) => `${a.piattaforma} ${a.username}`).join(", ")
      : "nessuno";
    return {
      ok: false,
      motivo:
        `Nessun account SHEis è collegato a Zernio: oggi risultano collegati solo ${collegati}, tutti Alkemia. ` +
        "Collega i profili SHEis su zernio.com (OAuth) prima di pubblicare — non si pubblica MAI sui canali Alkemia, nemmeno per prova.",
    };
  }

  const account = sheis.find((a) => a.piattaforma === input.canale);
  if (!account) {
    return {
      ok: false,
      motivo: `Nessun account SHEis collegato per il canale "${input.canale}" (SHEis collegati oggi: ${sheis.map((a) => a.piattaforma).join(", ")}).`,
    };
  }

  const key = process.env.ZERNIO_API_KEY;
  if (!key) return { ok: false, motivo: "Manca ZERNIO_API_KEY nelle variabili del server." };

  const payload: Record<string, unknown> = { content: input.testo, platforms: [input.canale] };
  if (input.mediaUrls?.length) payload.mediaUrls = input.mediaUrls;
  if (input.programmatoPer) payload.scheduledFor = input.programmatoPer;
  else payload.publishNow = true;

  let r: Response;
  try {
    r = await fetch(`${API_BASE}/posts`, {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    return { ok: false, motivo: `Errore di rete verso Zernio in pubblicazione: ${e instanceof Error ? e.message : "sconosciuto"}.` };
  }

  const testoRisposta = await r.text();
  if (!r.ok) {
    return { ok: false, motivo: `Zernio ha rifiutato la pubblicazione (${r.status}): ${testoRisposta.slice(0, 200) || "nessun dettaglio"}.` };
  }

  let corpo: Record<string, unknown> = {};
  try {
    corpo = JSON.parse(testoRisposta) as Record<string, unknown>;
  } catch {
    /* risposta senza corpo JSON: il post può comunque essere partito */
  }
  const postId = typeof corpo.id === "string" ? corpo.id : typeof corpo._id === "string" ? corpo._id : "";
  return { ok: true, postId };
}
