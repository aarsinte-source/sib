import "server-only";
import crypto from "node:crypto";
import { cookies } from "next/headers";
import { RUOLI, RUOLI_ADMIN, RUOLI_APPROVA, RUOLI_PROPONE, RUOLO_LABEL, type Ruolo } from "@/lib/ruoli";

/**
 * Autenticazione e ruoli — SPEC.md: "L'autorizzazione vive nell'applicazione,
 * che parla col database da server con la chiave di servizio. Nessuna policy
 * RLS basata sui ruoli" (lezione già pagata su un altro cliente: una policy
 * che interrogava la propria tabella ha generato ricorsione infinita e ha
 * declassato in silenzio tutti gli amministratori a operatori).
 *
 * La sessione è un cookie firmato (HMAC), non una tabella: il ruolo è dentro
 * il cookie, così il gate di autorizzazione funziona anche se il database è
 * momentaneamente irraggiungibile — non dipende mai da un servizio esterno
 * per la sola decisione "questo ruolo può fare questa azione?".
 *
 * I ruoli/etichette vivono in lib/ruoli.ts (client-safe, niente "server-only"):
 * qui li ri-esportiamo per comodità del codice server, che continua a poter
 * fare `import { RUOLI } from "@/lib/auth"`.
 */

export type { Ruolo };
export { RUOLI, RUOLO_LABEL, RUOLI_ADMIN, RUOLI_APPROVA, RUOLI_PROPONE };

export type Sessione = {
  id: string;
  email: string;
  nome: string;
  ruolo: Ruolo;
};

const COOKIE_NAME = "sheis_studio_sessione";
const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 } as const;

function segreto(): string {
  const s = process.env.SESSION_SECRET;
  if (!s) {
    // In sviluppo locale non blocca l'avvio; in produzione va sempre impostato.
    return "dev-insecure-secret-cambia-in-produzione";
  }
  return s;
}

function firma(payload: string): string {
  return crypto.createHmac("sha256", segreto()).update(payload).digest("hex");
}

/* --------------------------------------------------------------- password */

/** Hash scrypt con parametri e maxmem espliciti (Node può altrimenti rifiutare N alti). */
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64, SCRYPT_PARAMS);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

export function verificaPassword(password: string, memorizzato: string): boolean {
  const parti = memorizzato.split("$");
  if (parti.length !== 3 || parti[0] !== "scrypt") return false;
  const [, saltHex, hashHex] = parti;
  try {
    const salt = Buffer.from(saltHex, "hex");
    const atteso = Buffer.from(hashHex, "hex");
    const attuale = crypto.scryptSync(password, salt, atteso.length, SCRYPT_PARAMS);
    return attuale.length === atteso.length && crypto.timingSafeEqual(attuale, atteso);
  } catch {
    return false;
  }
}

/* ---------------------------------------------------------------- token */

export function creaTokenSessione(s: Sessione): string {
  const payload = Buffer.from(JSON.stringify(s), "utf8").toString("base64url");
  return `${payload}.${firma(payload)}`;
}

export function leggiTokenSessione(token: string | undefined | null): Sessione | null {
  if (!token) return null;
  const idx = token.lastIndexOf(".");
  if (idx < 0) return null;
  const payload = token.slice(0, idx);
  const sig = token.slice(idx + 1);
  if (firma(payload) !== sig) return null;
  try {
    const s = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Sessione;
    if (!s.id || !s.email || !s.ruolo || !RUOLI.includes(s.ruolo)) return null;
    return s;
  } catch {
    return null;
  }
}

/* --------------------------------------------------------- cookie server */

export async function impostaCookieSessione(s: Sessione): Promise<void> {
  const jar = await cookies();
  jar.set(COOKIE_NAME, creaTokenSessione(s), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 14, // 14 giorni
  });
}

export async function rimuoviCookieSessione(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE_NAME);
}

export async function getSessione(): Promise<Sessione | null> {
  const jar = await cookies();
  return leggiTokenSessione(jar.get(COOKIE_NAME)?.value);
}

/* ------------------------------------------------------------- permessi */

/** Errore di autorizzazione, tradotto in risposta HTTP pulita dalle route. */
export class ErroreAutorizzazione extends Error {
  status: 401 | 403;
  constructor(status: 401 | 403, message: string) {
    super(message);
    this.name = "ErroreAutorizzazione";
    this.status = status;
  }
}

/**
 * Gate server-side: nessun pulsante nascosto sostituisce questo controllo.
 * Un `dipendente` che chiama un'azione riservata riceve SEMPRE un 403 con un
 * messaggio in italiano, mai un fallimento silenzioso o un 200 finto.
 */
export async function richiedeRuolo(ruoliAmmessi: readonly Ruolo[]): Promise<Sessione> {
  const sessione = await getSessione();
  if (!sessione) {
    throw new ErroreAutorizzazione(401, "Devi accedere per eseguire questa azione.");
  }
  if (!ruoliAmmessi.includes(sessione.ruolo)) {
    throw new ErroreAutorizzazione(
      403,
      `Il ruolo "${RUOLO_LABEL[sessione.ruolo]}" non può eseguire questa azione. Serve: ${ruoliAmmessi
        .map((r) => RUOLO_LABEL[r])
        .join(" o ")}.`,
    );
  }
  return sessione;
}
