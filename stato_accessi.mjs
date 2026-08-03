#!/usr/bin/env node
/**
 * SHEis Beauty International — "possiamo lanciare?"
 *
 * Risponde in italiano, onestamente, elencando cosa c'e' e cosa manca — e
 * produce la richiesta pronta da inoltrare al cliente per cio' che manca.
 *
 * Se esiste config.local.json con un token, interroga DAVVERO la Graph API
 * (stesso motore di launch.mjs/campagna_da_brief.mjs — lib/preflight.mjs).
 * Se non esiste, lo dice chiaramente e mostra la checklist completa, senza
 * fingere di aver verificato nulla che non ha potuto verificare.
 *
 *   node stato_accessi.mjs
 */
import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { C, ok, warn, fail, info, title } from './lib/ui.mjs';
import { preflight, BloccoPreflight } from './lib/preflight.mjs';
import { CHECKLIST, OBBLIGATORIE } from './lib/checklist-accessi.mjs';
import { dbAttivo } from './lib/campagne-store.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));
const BLUEPRINT_DIR = join(ROOT, 'blueprints');
const CONFIG_PATH = join(ROOT, 'config.local.json');

async function leggiConfig() {
  if (!existsSync(CONFIG_PATH)) return null;
  try {
    return JSON.parse(await readFile(CONFIG_PATH, 'utf8'));
  } catch (e) {
    return { _erroreParsing: e.message };
  }
}

async function main() {
  console.log(`\n${C.bold}SHEis Beauty International — possiamo lanciare?${C.reset}\n`);

  const files = (await readdir(BLUEPRINT_DIR)).filter((f) => f.endsWith('.json')).sort();
  const blueprints = await Promise.all(files.map(async (f) => JSON.parse(await readFile(join(BLUEPRINT_DIR, f), 'utf8'))));

  const config = await leggiConfig();
  let preflightOk = false;
  let preflightErrore = null;

  if (!config) {
    title('CONFIGURAZIONE');
    fail('Manca config.local.json.');
    info('Normale: quel file esiste solo dopo che Mauro ha dato gli accessi (copia config.example.json).');
  } else if (config._erroreParsing) {
    title('CONFIGURAZIONE');
    fail(`config.local.json presente ma non e' JSON valido: ${config._erroreParsing}`);
  } else if (!config.access_token || !config.ad_account_id) {
    title('CONFIGURAZIONE');
    fail('config.local.json presente ma incompleto (manca access_token o ad_account_id).');
  } else {
    try {
      await preflight(config, blueprints);
      preflightOk = true;
    } catch (e) {
      if (e instanceof BloccoPreflight) {
        preflightErrore = e;
        console.log(`\n  ${C.bold}Perche' si e' fermato:${C.reset} ${e.message}`);
        console.log(`  ${C.bold}Come si risolve:${C.reset} ${e.comeSiRisolve}`);
      } else {
        throw e;
      }
    }
  }

  // ── checklist completa, sempre mostrata ──────────────────────────────────
  title('CHECKLIST ACCESSI — stato per voce');
  let sezioneCorrente = null;
  const daChiedere = [];

  for (const voce of CHECKLIST) {
    if (voce.sezione !== sezioneCorrente) {
      sezioneCorrente = voce.sezione;
      console.log(`\n  ${C.bold}${C.cyan}${sezioneCorrente}${C.reset}`);
    }
    const etichettaObbligo = voce.obbligatorio ? '' : `  ${C.dim}(facoltativo per questo kit)${C.reset}`;

    // Un punto facoltativo non verificabile non e' un blocco al lancio: si
    // stampa con severita' piu' bassa, per non far sembrare bloccante cio'
    // che il kit dichiara esplicitamente non-bloccante (pixel, dominio, spend cap).
    const segnalaMancanza = voce.obbligatorio ? fail : warn;

    if (voce.verificabile_via_preflight && preflightOk) {
      ok(`${voce.voce}${etichettaObbligo}  ${C.dim}— verificato via preflight sopra${C.reset}`);
    } else if (voce.verificabile_via_preflight && preflightErrore) {
      warn(`${voce.voce}${etichettaObbligo}  ${C.dim}— dovrebbe risultare dal preflight sopra, che pero' si e' fermato prima${C.reset}`);
      daChiedere.push(voce);
    } else if (voce.verificabile_via_preflight && !config) {
      segnalaMancanza(`${voce.voce}${etichettaObbligo}  ${C.dim}— non verificabile: mancano gli accessi${C.reset}`);
      daChiedere.push(voce);
    } else {
      // non verificabile via API in nessun caso: e' una conferma/mandato umano
      warn(`${voce.voce}${etichettaObbligo}  ${C.dim}— non verificabile via API, va confermata a parole${C.reset}`);
      daChiedere.push(voce);
    }
  }

  // ── verdetto ──────────────────────────────────────────────────────────
  title('VERDETTO');
  const possiamoLanciare = preflightOk;
  if (possiamoLanciare) {
    console.log(`  ${C.green}${C.bold}SI — tecnicamente possiamo lanciare.${C.reset}`);
    console.log(`  Il preflight (token, account, valuta, pagamento, Pagina, Instagram, permessi lead) e' passato senza blocchi.`);
    const daConfermareAncora = OBBLIGATORIE.filter((v) => !v.verificabile_via_preflight);
    if (daConfermareAncora.length) {
      console.log(`\n  ${C.yellow}Prima di premere davvero il bottone, conferma anche questi punti (non verificabili via API):${C.reset}`);
      for (const v of daConfermareAncora) console.log(`    - ${v.voce}`);
    }
  } else {
    console.log(`  ${C.red}${C.bold}NO — non possiamo lanciare adesso.${C.reset}`);
    if (!config) console.log(`  Motivo principale: mancano del tutto gli accessi (nessun config.local.json).`);
    else if (preflightErrore) console.log(`  Motivo principale: ${preflightErrore.message}`);
  }

  // ── richiesta pronta da inoltrare al cliente ─────────────────────────────
  const davveroDaChiedere = possiamoLanciare
    ? OBBLIGATORIE.filter((v) => !v.verificabile_via_preflight)
    : (config ? daChiedere.filter((v) => v.obbligatorio) : OBBLIGATORIE);

  if (davveroDaChiedere.length) {
    title('RICHIESTA PRONTA DA INOLTRARE AL CLIENTE');
    console.log(`  ${C.dim}Copia-incolla, o gira questo blocco cosi' com'e':${C.reset}\n`);
    let n = 1;
    for (const v of davveroDaChiedere) {
      console.log(`  ${n}. ${v.richiesta}`);
      n++;
    }
  } else {
    title('RICHIESTA PRONTA DA INOLTRARE AL CLIENTE');
    ok('Nessuna richiesta pendente: tutti i punti obbligatori risultano verificati o confermati.');
  }

  // ── nota sullo Studio (sheis_campagne) ───────────────────────────────────
  title('AGGANCIO ALLO STUDIO (sheis_campagne)');
  if (dbAttivo(config || {})) {
    ok('Tabella sheis_campagne raggiungibile (SUPABASE_URL/SUPABASE_SECRET_KEY presenti). campagna_da_brief.mjs scrive li\'.');
  } else {
    warn('Tabella sheis_campagne non ancora raggiungibile: campagna_da_brief.mjs scrive nel registro locale .campagne/registro.json.');
    info('Si collega da sola quando SUPABASE_URL e SUPABASE_SECRET_KEY (stessi nomi di alkemia-sheis-backend/.env) sono impostati come variabili d\'ambiente, o in config.local.json → supabase. Nessun\'altra modifica richiesta.');
  }

  console.log('');
  process.exit(possiamoLanciare ? 0 : 1);
}

main().catch((e) => {
  console.error(`\n  ${C.red}${C.bold}ERRORE NON GESTITO${C.reset}\n  ${e.stack || e.message}\n`);
  process.exit(1);
});
