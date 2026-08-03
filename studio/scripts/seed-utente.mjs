#!/usr/bin/env node
/**
 * Crea il primo utente (o un utente successivo) in sheis_utenti, per rompere
 * il cane-che-si-morde-la-coda: senza un utente non si può accedere allo
 * Studio, e senza accedere non si può usare la pagina "Utenti" per crearne
 * uno. Va eseguito una volta a mano, dopo che le migrazioni sono applicate.
 *
 * Uso:
 *   npm run seed:utente -- --email mauro@sheis... --nome "Mauro" --ruolo mauro --password "..."
 *
 * I parametri scrypt DEVONO restare identici a src/lib/auth.ts — se cambi uno
 * dei due file, cambia anche l'altro, altrimenti le password già create
 * smettono di funzionare.
 */
import crypto from "node:crypto";
import { caricaEnv } from "./_env.mjs";

caricaEnv();

const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64, SCRYPT_PARAMS);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

function argomento(nome, def) {
  const idx = process.argv.indexOf(`--${nome}`);
  return idx >= 0 && process.argv[idx + 1] ? process.argv[idx + 1] : def;
}

async function main() {
  const email = argomento("email");
  const nome = argomento("nome");
  const ruolo = argomento("ruolo", "mauro");
  const password = argomento("password");

  if (!email || !nome || !password) {
    console.error("Uso: npm run seed:utente -- --email <email> --nome <nome> --ruolo <mauro|marketing|dipendente> --password <password>");
    process.exit(1);
  }
  if (!["mauro", "marketing", "dipendente"].includes(ruolo)) {
    console.error(`Ruolo non valido: "${ruolo}". Usa mauro, marketing o dipendente.`);
    process.exit(1);
  }
  if (password.length < 8) {
    console.error("La password deve avere almeno 8 caratteri.");
    process.exit(1);
  }

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    console.error("Mancano SUPABASE_URL / SUPABASE_SECRET_KEY in .env.local.");
    process.exit(1);
  }

  const r = await fetch(`${url}/rest/v1/sheis_utenti`, {
    method: "POST",
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
      prefer: "return=representation",
    },
    body: JSON.stringify([{ email, nome, ruolo, pwd_hash: hashPassword(password), attivo: true }]),
  });

  const testo = await r.text();
  if (!r.ok) {
    console.error(`✗ Supabase ha risposto ${r.status}: ${testo}`);
    if (r.status === 404 && testo.includes("PGRST205")) {
      console.error("  → il database non è ancora inizializzato: applica prima le migrazioni.");
    }
    process.exit(1);
  }

  console.log(`✓ Utente creato: ${email} (${ruolo})`);
}

main();
