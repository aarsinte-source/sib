#!/usr/bin/env node
/**
 * SHEis Beauty International — launcher campagne Meta
 *
 * Filosofia: questo script parte dal presupposto che tutto sia rotto finche' non
 * ha dimostrato il contrario. Non crea NULLA senza aver verificato token, account,
 * pagina, moduli e budget, e senza che un umano abbia digitato una conferma.
 *
 *   node launch.mjs                      # DRY-RUN di tutti i blueprint (default)
 *   node launch.mjs --preflight          # solo i controlli, nessuna simulazione
 *   node launch.mjs --only A-estero-spagna
 *   node launch.mjs --live               # crea davvero (sempre in PAUSA)
 *
 * Tutto cio' che viene creato nasce in stato PAUSED. Nessuno script accende
 * spesa: quello lo fa una persona, in Gestione Inserzioni, guardando lo schermo.
 *
 * La logica condivisa (guardrail di brand, placeholder, validazione, Graph API,
 * preflight accessi, budget, payload) vive in lib/ — la usano anche
 * campagna_da_brief.mjs e stato_accessi.mjs. Un solo posto: i tre script non
 * possono derivare l'uno dall'altro.
 */

import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { C, ok, warn, fail, info, title } from './lib/ui.mjs';
import { validaBlueprint } from './lib/validate.mjs';
import { risolvi } from './lib/placeholders.mjs';
import { makeApi, normalizzaAdAccountId } from './lib/meta-api.mjs';
import { preflight, BloccoPreflight } from './lib/preflight.mjs';
import { buildPayload, executePayload } from './lib/payload-builder.mjs';
import { GIORNI_MESE, stampaPianoSpesa } from './lib/budget.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));
const BLUEPRINT_DIR = join(ROOT, 'blueprints');
const CONFIG_PATH = join(ROOT, 'config.local.json');
const RUNS_DIR = join(ROOT, '.runs');

// ─────────────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────────────
async function main() {
  const argv = process.argv.slice(2);
  const live = argv.includes('--live');
  const soloPreflight = argv.includes('--preflight');
  const filtro = argv.includes('--only') ? argv[argv.indexOf('--only') + 1] : null;

  console.log(`\n${C.bold}SHEis Beauty International — launcher campagne Meta${C.reset}`);
  console.log(`${C.dim}Modalita': ${live ? `${C.red}LIVE (crea davvero, tutto in PAUSA)` : `${C.green}DRY-RUN (non crea nulla)`}${C.reset}`);

  // config
  if (!existsSync(CONFIG_PATH)) {
    title('CONFIGURAZIONE ASSENTE');
    console.log(`  Manca ${C.bold}config.local.json${C.reset}.\n`);
    console.log('  E\' normale: quel file esiste solo dopo che Mauro ha dato gli accessi.');
    console.log('  Copia config.example.json in config.local.json e riempilo.');
    console.log(`  La checklist di cosa chiedere sta nel README.\n`);
    console.log(`  ${C.dim}Intanto puoi validare i blueprint senza accessi:${C.reset}`);
    console.log(`  ${C.dim}i controlli di guardrail, advantage_audience e budget girano lo stesso.${C.reset}\n`);
    await validazioneOffline(filtro);
    process.exit(1);
  }

  const config = JSON.parse(await readFile(CONFIG_PATH, 'utf8'));
  for (const k of ['access_token', 'ad_account_id', 'monthly_budget_cap_eur']) {
    if (!config[k]) {
      console.log(`\n  ${C.red}BLOCCO${C.reset}  config.local.json: manca "${k}".`);
      process.exit(1);
    }
  }

  // blueprint
  const files = (await readdir(BLUEPRINT_DIR)).filter((f) => f.endsWith('.json')).sort();
  let blueprints = await Promise.all(files.map(async (f) => JSON.parse(await readFile(join(BLUEPRINT_DIR, f), 'utf8'))));
  if (filtro) {
    blueprints = blueprints.filter((b) => b.id === filtro);
    if (!blueprints.length) {
      console.log(`\n  ${C.red}BLOCCO${C.reset}  Nessun blueprint con id "${filtro}". Disponibili: ${files.join(', ')}`);
      process.exit(1);
    }
  }
  console.log(`${C.dim}Blueprint caricati: ${blueprints.map((b) => b.id).join(', ')}${C.reset}`);

  // I controlli locali girano PRIMA di quelli di rete, di proposito: sono gratis
  // e pescano i danni peggiori (un annuncio che viola i guardrail di brand).
  // Se li mettessimo dopo il preflight, un token scaduto nasconderebbe una
  // violazione di firewall M29 — e si scoprirebbe una cosa per volta.
  title('VALIDAZIONE BLUEPRINT');
  const voci = [];
  let bloccanti = 0;

  for (const bp of blueprints) {
    console.log(`\n  ${C.bold}${bp.id}${C.reset} — ${bp.label}`);
    const { errori, avvisi, giornalieroReale, mensileStimato } = validaBlueprint(bp, config);

    for (const a of avvisi) warn(a);
    for (const e of errori) {
      bloccanti++;
      fail(`${e.tipo}`);
      for (const d of e.dettaglio) console.log(`       ${d}`);
      console.log(`       ${C.dim}${e.spiegazione}${C.reset}`);
    }
    if (!errori.length && !avvisi.length) ok('Nessun problema.');

    voci.push({ id: bp.id, blueprint: bp, giornaliero: giornalieroReale, mensile: mensileStimato, errori });
  }

  // piano di spesa
  const { sforato } = stampaPianoSpesa(voci, config.monthly_budget_cap_eur);

  // preflight (rete) — dopo i controlli locali, prima di qualunque creazione
  let preflightFallito = null;
  try {
    await preflight(config, blueprints);
  } catch (e) {
    if (e instanceof BloccoPreflight) preflightFallito = e;
    else throw e;
  }

  // Riepilogo unico: tutto cio' che blocca, in un colpo solo.
  const blocchi = [];
  if (bloccanti) blocchi.push(`${bloccanti} ${bloccanti === 1 ? 'blocco' : 'blocchi'} di validazione blueprint`);

  // ⚠️ Il tetto di spesa blocca in LIVE, AVVISA in anteprima. Misurato il 3/8:
  // i tre blueprint insieme fanno 1.003,20 EUR/mese contro un tetto di 1.000,
  // quindi `node launch.mjs` nudo si rifiutava di partire — anche solo per
  // MOSTRARE l'anteprima, che non spende un centesimo.
  //
  // Un freno che impedisce di GUARDARE non protegge niente: spinge chi lo
  // incontra ad aggirarlo, e a quel punto lo aggira anche quando conta. Il
  // freno vero e' sull'azione che costa: in `--live` resta duro e non si
  // discute. In anteprima diventa un avviso che dice quanto si sfora e come.
  //
  // Il tetto NON si alza da qui: e' un numero del cliente. Ma il caso pratico
  // non lo sfora, perche' le campagne si lanciano a fasi con --only (A+C il
  // primo mese, B il secondo) — e con --only il conteggio vede solo cio' che
  // stai davvero lanciando, non tutti i blueprint che esistono su disco.
  if (sforato && live) blocchi.push('budget mensile oltre il tetto dichiarato dal cliente');
  if (preflightFallito) blocchi.push('preflight accessi fallito');

  if (sforato && !live) {
    warn('budget oltre il tetto: in anteprima e\' solo un avviso, in --live blocca');
    console.log(`  ${C.dim}Con --only <blueprint> il conteggio guarda solo quello che lanci davvero.${C.reset}`);
  }

  if (blocchi.length) {
    title('NON SI PARTE');
    for (const b of blocchi) fail(b);

    if (preflightFallito) {
      console.log(`\n  ${C.bold}Preflight:${C.reset} ${preflightFallito.message}`);
      console.log(`  ${C.bold}Come si risolve:${C.reset} ${preflightFallito.comeSiRisolve}`);
    }
    if (sforato) {
      console.log(`\n  ${C.bold}Budget:${C.reset} riduci i daily_budget_cents nei blueprint, o lancia meno campagne con --only.`);
      console.log(`  ${C.dim}Il tetto non si alza da qui: si alza parlando con Mauro.${C.reset}`);
    }
    console.log(`\n  ${C.dim}Non e' stato creato nulla.${C.reset}\n`);
    process.exit(1);
  }

  if (soloPreflight) { console.log(''); return; }

  if (!live) {
    console.log(`\n  ${C.green}${C.bold}DRY-RUN completato: tutto pronto, niente creato.${C.reset}`);
    console.log(`  ${C.dim}Per creare davvero: node launch.mjs --live${C.reset}\n`);
    return;
  }

  // conferma umana
  title('CONFERMA');
  console.log(`  Stai per creare ${voci.length} ${voci.length === 1 ? 'campagna' : 'campagne'} sull'account ${config.ad_account_id}.`);
  console.log(`  Impegno di spesa se poi le attivi: ${C.bold}${voci.reduce((s, v) => s + v.mensile, 0).toFixed(2)} EUR/mese${C.reset}.`);
  console.log(`  ${C.dim}Tutto nasce in PAUSA. Nessuna spesa parte da questo script.${C.reset}\n`);

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const risposta = await rl.question(`  Scrivi ${C.bold}CONFERMO${C.reset} per procedere (qualsiasi altra cosa annulla): `);
  rl.close();

  if (risposta.trim() !== 'CONFERMO') {
    console.log(`\n  ${C.yellow}Annullato. Non e' stato creato nulla.${C.reset}\n`);
    process.exit(0);
  }

  // creazione
  title('CREAZIONE');
  const api = makeApi(config);
  const actId = normalizzaAdAccountId(config.ad_account_id);
  const registro = { quando: new Date().toISOString(), account: actId, campagne: [] };

  for (const v of voci) {
    console.log(`\n  ${C.bold}${v.id}${C.reset}`);
    const risolto = risolvi(v.blueprint, config.resolve || {});
    try {
      registro.campagne.push(await executePayload(api, actId, buildPayload(risolto)));
    } catch (e) {
      fail(`Creazione interrotta su ${v.id}: ${e.message}`);
      if (e.graph?.error_user_msg) info(`Meta dice: ${e.graph.error_user_msg}`);
      if (/advantage_audience/i.test(e.message)) {
        info('Errore su advantage_audience: prova a spostarlo da targeting.targeting_automation.advantage_audience a targeting.advantage_audience (vedi README).');
      }
      console.log(`  ${C.dim}Cio' che era gia' stato creato resta, in PAUSA. Gli ID sono nel registro qui sotto.${C.reset}`);
      break;
    }
  }

  await mkdir(RUNS_DIR, { recursive: true });
  const registroPath = join(RUNS_DIR, `run-${Date.now()}.json`);
  await writeFile(registroPath, JSON.stringify(registro, null, 2));

  console.log(`\n  ${C.green}${C.bold}Fatto.${C.reset} Registro degli ID creati: ${registroPath}`);
  console.log(`  ${C.dim}Serve per cancellare o modificare in blocco cio' che e' stato creato.${C.reset}`);
  console.log(`\n  ${C.yellow}${C.bold}Tutto e' in PAUSA.${C.reset} Le campagne si accendono a mano in Gestione Inserzioni,`);
  console.log(`  dopo aver guardato le anteprime. ${C.dim}Nessuno script accende spesa.${C.reset}\n`);
}

/** Validazione senza accessi: serve a tenere i blueprint sani mentre si aspetta Mauro. */
async function validazioneOffline(filtro) {
  const files = (await readdir(BLUEPRINT_DIR)).filter((f) => f.endsWith('.json')).sort();
  let blueprints = await Promise.all(files.map(async (f) => JSON.parse(await readFile(join(BLUEPRINT_DIR, f), 'utf8'))));
  if (filtro) blueprints = blueprints.filter((b) => b.id === filtro);

  title('VALIDAZIONE OFFLINE (senza accessi)');
  let totGiorno = 0;

  for (const bp of blueprints) {
    console.log(`\n  ${C.bold}${bp.id}${C.reset}`);
    const finto = { resolve: {} };
    const { errori, avvisi, giornalieroReale } = validaBlueprint(bp, finto);
    totGiorno += giornalieroReale;

    const brand = errori.filter((e) => e.tipo === 'GUARDRAIL BRAND');
    const adv = errori.filter((e) => e.tipo === 'ADVANTAGE_AUDIENCE');
    const ph = errori.filter((e) => e.tipo === 'PLACEHOLDER');

    if (brand.length) {
      fail('GUARDRAIL BRAND violati');
      for (const e of brand) for (const d of e.dettaglio) console.log(`       ${d}`);
    } else ok('Guardrail di brand: nessuna violazione.');

    if (adv.length) { fail('advantage_audience mancante o non valido'); for (const e of adv) for (const d of e.dettaglio) console.log(`       ${d}`); }
    else ok('advantage_audience dichiarato su tutti gli adset.');

    if (ph.length) info(`${ph[0].dettaglio.length} valori ancora da risolvere (normale: arrivano con gli accessi).`);
    for (const a of avvisi) warn(a);
    info(`Budget: ${giornalieroReale.toFixed(2)} EUR/giorno → ${(giornalieroReale * GIORNI_MESE).toFixed(2)} EUR/mese`);
  }

  console.log(`\n  ${C.bold}Totale se si accendesse tutto: ${totGiorno.toFixed(2)} EUR/giorno → ${(totGiorno * GIORNI_MESE).toFixed(2)} EUR/mese${C.reset}\n`);
}

main().catch((e) => {
  console.error(`\n  ${C.red}${C.bold}ERRORE NON GESTITO${C.reset}\n  ${e.stack || e.message}\n`);
  process.exit(1);
});
