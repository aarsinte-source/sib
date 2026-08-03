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

/**
 * Durata massima della sessione, applicata DENTRO il contenuto firmato — non
 * solo come attributo del cookie del browser. Un cookie che scade è una
 * cortesia del browser, non una garanzia: chi ripresenta il valore del token
 * direttamente (fuori dal cookie, es. copiato da un log o un proxy) bypassa
 * quella scadenza. Con `iat` dentro il payload firmato, `leggiTokenSessione`
 * rifiuta un token vecchio anche fuori dal browser, e la sessione resta
 * revocata "per il tempo" anche dopo il logout se qualcuno ne conservasse
 * una copia. Stesso valore del maxAge del cookie, così i due non divergono.
 */
const SESSIONE_DURATA_MS = 1000 * 60 * 60 * 24 * 14; // 14 giorni

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

type PayloadFirmato = Sessione & { iat: number };

export function creaTokenSessione(s: Sessione): string {
  const conScadenza: PayloadFirmato = { ...s, iat: Date.now() };
  const payload = Buffer.from(JSON.stringify(conScadenza), "utf8").toString("base64url");
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
    const s = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Partial<PayloadFirmato>;
    if (!s.id || !s.email || !s.ruolo || !RUOLI.includes(s.ruolo)) return null;
    // Token emesso prima di questa modifica (senza `iat`) o più vecchio della
    // durata massima: rifiutato come se la firma fosse invalida — fail closed,
    // forza un nuovo login invece di accettare una sessione senza scadenza.
    if (typeof s.iat !== "number" || Date.now() - s.iat > SESSIONE_DURATA_MS) return null;
    return { id: s.id, email: s.email, nome: s.nome ?? "", ruolo: s.ruolo };
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
    maxAge: SESSIONE_DURATA_MS / 1000, // stesso valore della scadenza dentro il token firmato
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
