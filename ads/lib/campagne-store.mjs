/**
 * Aggancio allo Studio SHEis — tabella `sheis_campagne` (schema in
 * ~/alkemia-sheis-backend/migrations/0002_studio.sql). Quella tabella NON
 * esiste ancora oggi (2026-08). Questo file e' l'UNICA porta di accesso ai
 * dati delle campagne: quando il database sara' attivo, si collega qui e
 * basta — nessun altro file del kit tocca mai lo storage direttamente.
 *
 * Colonne reali di sheis_campagne (0002_studio.sql):
 *   nome, obiettivo, pubblico, brand, budget_giorno, budget_totale,
 *   contenuto_id, blueprint, stato, motivo_blocco, meta_campaign_id, payload,
 *   richiesta_da
 * stato ammessi: bozza | pronta | bloccata | attiva | in_pausa | conclusa.
 *
 * Fallback locale: finche' il DB non esiste, si scrive un registro JSON in
 * .campagne/registro.json (gitignorato, come .runs/). Stessa forma dei
 * record: quando arriva Supabase, i vecchi record locali si possono
 * re-inserire con un semplice script, non vanno riscritti a mano.
 *
 * Credenziali: SOLO da variabili d'ambiente o da config.local.json → supabase
 * (mai risalendo ad altri progetti/repo — e' esattamente l'errore gia' pagato
 * altrove: un fallback che pesca le credenziali sbagliate finisce per scrivere
 * dove non deve, vedi applica_migrazioni.py di alkemia-sheis-backend).
 */
import { existsSync } from 'node:fs';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const REGISTRO_LOCALE = join(ROOT, '.campagne', 'registro.json');

const STATI_VALIDI = ['bozza', 'pronta', 'bloccata', 'attiva', 'in_pausa', 'conclusa'];
// Stati che "pesano" sul tetto di spesa: una bozza scartata o una campagna
// conclusa non impegnano piu' budget futuro. E' l'insieme giusto per il
// doppio controllo di lib/budget.mjs — dichiarato qui, in un posto solo.
export const STATI_CHE_PESANO_SUL_BUDGET = ['pronta', 'attiva', 'in_pausa'];

function credenzialiSupabase(config) {
  const url = process.env.SUPABASE_URL || config?.supabase?.url;
  const key = process.env.SUPABASE_SECRET_KEY || config?.supabase?.secret_key;
  const ref = process.env.SUPABASE_PROJECT_REF || config?.supabase?.project_ref;
  if (url && key) return { url, key, ref };
  return null;
}

async function leggiRegistroLocale() {
  if (!existsSync(REGISTRO_LOCALE)) return [];
  try {
    return JSON.parse(await readFile(REGISTRO_LOCALE, 'utf8'));
  } catch {
    return [];
  }
}

async function scriviRegistroLocale(righe) {
  await mkdir(dirname(REGISTRO_LOCALE), { recursive: true });
  await writeFile(REGISTRO_LOCALE, JSON.stringify(righe, null, 2));
}

/**
 * Salva (o aggiorna, se record.id e' gia' presente) UNA campagna.
 * Ritorna { id, sorgente: 'supabase' | 'locale' }.
 */
export async function salvaCampagna(record, config = {}) {
  if (record.stato && !STATI_VALIDI.includes(record.stato)) {
    throw new Error(`Stato "${record.stato}" non valido. Ammessi: ${STATI_VALIDI.join(', ')}`);
  }

  const creds = credenzialiSupabase(config);
  if (creds) {
    const riga = { ...record };
    const metodo = riga.id ? 'PATCH' : 'POST';
    const url = riga.id
      ? `${creds.url}/rest/v1/sheis_campagne?id=eq.${riga.id}`
      : `${creds.url}/rest/v1/sheis_campagne`;
    const r = await fetch(url, {
      method: metodo,
      headers: {
        apikey: creds.key,
        Authorization: `Bearer ${creds.key}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify(riga),
    });
    if (!r.ok) {
      const testo = await r.text().catch(() => '');
      throw new Error(`Supabase ${metodo} sheis_campagne → ${r.status} ${testo}`);
    }
    const body = await r.json();
    const salvata = Array.isArray(body) ? body[0] : body;
    return { id: salvata.id, sorgente: 'supabase' };
  }

  // fallback locale
  const righe = await leggiRegistroLocale();
  const id = record.id || randomUUID();
  const ora = new Date().toISOString();
  const esistente = righe.findIndex((r) => r.id === id);
  const riga = { ...record, id, updated_at: ora, created_at: record.created_at || ora };
  if (esistente >= 0) righe[esistente] = riga;
  else righe.push(riga);
  await scriviRegistroLocale(righe);
  return { id, sorgente: 'locale' };
}

/**
 * Elenca le campagne registrate. Con filtro opzionale sugli stati.
 */
export async function elencaCampagne({ stati } = {}, config = {}) {
  const creds = credenzialiSupabase(config);
  let righe;
  let sorgente;

  if (creds) {
    const filtro = stati?.length ? `&stato=in.(${stati.join(',')})` : '';
    const r = await fetch(`${creds.url}/rest/v1/sheis_campagne?select=*${filtro}`, {
      headers: { apikey: creds.key, Authorization: `Bearer ${creds.key}` },
    });
    if (!r.ok) throw new Error(`Supabase GET sheis_campagne → ${r.status}`);
    righe = await r.json();
    sorgente = 'supabase';
  } else {
    righe = await leggiRegistroLocale();
    if (stati?.length) righe = righe.filter((r) => stati.includes(r.stato));
    sorgente = 'locale';
  }

  return { righe, sorgente };
}

/** true se la tabella sheis_campagne e' raggiungibile (per stato_accessi.mjs). */
export function dbAttivo(config = {}) {
  return credenzialiSupabase(config) !== null;
}
