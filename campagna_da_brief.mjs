#!/usr/bin/env node
/**
 * SHEis Beauty International — media buyer su richiesta
 *
 * Il responsabile marketing scrive un brief in linguaggio naturale (obiettivo,
 * contenuto, budget) e questo script costruisce una campagna Meta completa e
 * ispezionabile: sceglie il blueprint piu' adatto fra i tre esistenti,
 * personalizza budget/calendario/creativita', valida tutto contro gli stessi
 * guardrail di launch.mjs, e salva il payload esatto che partirebbe.
 *
 * NON crea mai nulla su Meta di default. Simulazione soltanto.
 *
 *   node campagna_da_brief.mjs --brief "Voglio far conoscere BABILON ai
 *     distributori spagnoli. Usa questo contenuto. Budget 20 euro al giorno
 *     per due settimane. Obiettivo: farmi arrivare richieste di contatto."
 *
 *   node campagna_da_brief.mjs --brief-file brief.txt
 *   cat brief.txt | node campagna_da_brief.mjs
 *   node campagna_da_brief.mjs --brief "..." --creative CR-A2
 *   node campagna_da_brief.mjs --brief "..." --out .campagne/mia-campagna.json
 *
 * Per creare DAVVERO (richiede accessi reali e comunque conferma umana):
 *   LIVE=1 node campagna_da_brief.mjs --brief "..." --live
 */

import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { C, ok, warn, fail, info, title } from './lib/ui.mjs';
import { analizzaBrief } from './lib/brief-parser.mjs';
import { scegliBlueprint, soloPrimari } from './lib/blueprint-selector.mjs';
import { costruisciCampagna } from './lib/campaign-builder.mjs';
import { controllaBudget, GIORNI_MESE } from './lib/budget.mjs';
import { salvaCampagna, elencaCampagne, STATI_CHE_PESANO_SUL_BUDGET, dbAttivo } from './lib/campagne-store.mjs';
import { makeApi, normalizzaAdAccountId } from './lib/meta-api.mjs';
import { preflight, BloccoPreflight } from './lib/preflight.mjs';
import { risolvi } from './lib/placeholders.mjs';
import { buildPayload, executePayload } from './lib/payload-builder.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));
const BLUEPRINT_DIR = join(ROOT, 'blueprints');
const CONFIG_PATH = join(ROOT, 'config.local.json');
const CAMPAGNE_DIR = join(ROOT, '.campagne');

// Priorita' dei pubblici dichiarata dal cliente — estero prima, poi Italia,
// saloni per ultimi (sheis-brand-core §13.1 / README §4). Usata solo come
// AVVISO non bloccante: un brief legittimo puo' voler testare un segmento
// diverso di proposito.
const ORDINE_PRIORITA = { 'A-estero-spagna': 1, 'B-italia-distributori': 2, 'C-saloni-awareness': 3 };

function parseArgv(argv) {
  const out = { live: false, confirm: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--live') out.live = true;
    else if (a === '--confirm') out.confirm = true;
    else if (a === '--brief') out.brief = argv[++i];
    else if (a === '--brief-file') out.briefFile = argv[++i];
    else if (a === '--creative') out.creative = argv[++i];
    else if (a === '--out') out.out = argv[++i];
  }
  return out;
}

async function leggiStdin() {
  if (process.stdin.isTTY) return null;
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  const testo = Buffer.concat(chunks).toString('utf8').trim();
  return testo || null;
}

function slugifica(testo) {
  return String(testo).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
}

async function main() {
  const argv = parseArgv(process.argv.slice(2));

  console.log(`\n${C.bold}SHEis Beauty International — media buyer su richiesta${C.reset}`);
  console.log(`${C.dim}Modalita': ${argv.live ? `${C.red}LIVE (tentera' di creare davvero, tutto in PAUSA)` : `${C.green}SIMULAZIONE (non crea nulla)`}${C.reset}\n`);

  // ── 1. il brief ────────────────────────────────────────────────────────
  let testoBrief = argv.brief;
  if (!testoBrief && argv.briefFile) testoBrief = (await readFile(argv.briefFile, 'utf8')).trim();
  if (!testoBrief) testoBrief = await leggiStdin();
  if (!testoBrief) {
    fail('Nessun brief fornito.');
    info('Usa --brief "testo", --brief-file <file>, oppure passalo su stdin: cat brief.txt | node campagna_da_brief.mjs');
    process.exit(1);
  }

  title('BRIEF RICEVUTO');
  console.log(`  ${C.dim}"${testoBrief}"${C.reset}`);

  const segnali = analizzaBrief(testoBrief);

  title('SEGNALI ESTRATTI DAL BRIEF');
  stampaSegnale('Brand', segnali.brand, segnali.brandMatches[0]?.match);
  stampaSegnale('Paese', segnali.paese, segnali.paeseMatch);
  stampaSegnale('Segmento pubblico', segnali.segmento, segnali.segmentoMatch);
  stampaSegnale('Obiettivo', segnali.objective, `${segnali.objectiveMatch ?? '—'} (${segnali.objectiveFonte})`);
  stampaSegnale('Budget/giorno', segnali.budget.dailyEur != null ? `${segnali.budget.dailyEur.toFixed(2)} EUR` : null, segnali.budget.note.join('; '));
  stampaSegnale('Durata', segnali.budget.durataGiorni != null ? `${segnali.budget.durataGiorni} giorni` : null, null);
  stampaSegnale('Creativita\' riferita', segnali.creativeRef.ref ?? segnali.creativeRef.tipo, segnali.creativeRef.match);

  // ── 2. blueprint ──────────────────────────────────────────────────────
  const files = (await readdir(BLUEPRINT_DIR)).filter((f) => f.endsWith('.json')).sort();
  const blueprints = await Promise.all(files.map(async (f) => JSON.parse(await readFile(join(BLUEPRINT_DIR, f), 'utf8'))));

  // Le varianti (es. "-web") restano fuori dalla scelta automatica: sono
  // alternative dello stesso obiettivo commerciale, non candidate proprie —
  // si selezionano solo esplicitamente (oggi: solo via launch.mjs --only).
  const { scelto, classifica, sogliaMinima } = scegliBlueprint(soloPrimari(blueprints), segnali);

  title('SCELTA DEL BLUEPRINT — perche\'');
  for (const v of classifica) {
    const evidenziato = scelto && v.id === scelto.id;
    const marcatore = evidenziato ? `${C.green}${C.bold}→ SCELTO${C.reset}` : `  ${C.dim}scartato${C.reset}`;
    console.log(`\n  ${C.bold}${v.id}${C.reset}  —  punteggio ${v.punteggio}/100  ${marcatore}`);
    for (const c of v.criteri) {
      const simbolo = c.match === true ? `${C.green}✓${C.reset}` : c.match === false ? `${C.red}✗${C.reset}` : `${C.dim}·${C.reset}`;
      console.log(`     ${simbolo} ${c.criterio} (peso ${c.peso}) — brief: ${c.brief}  |  blueprint: ${c.blueprint}`);
    }
  }
  console.log(`\n  ${C.dim}Soglia minima per una scelta automatica: ${sogliaMinima}/100.${C.reset}`);

  if (!scelto) {
    fail('Nessun blueprint esistente copre bene questo brief.');
    info('Non ne viene forzato uno a caso: servirebbe un blueprint nuovo, fuori dalla scelta automatica di questo tool.');
    const record = {
      nome: `DA-BRIEF | nessun match | ${new Date().toISOString().slice(0, 10)}`,
      obiettivo: testoBrief,
      pubblico: segnali.segmento ?? null,
      brand: segnali.brand ?? null,
      budget_giorno: segnali.budget.dailyEur ?? null,
      budget_totale: segnali.budget.totalEur ?? null,
      blueprint: null,
      stato: 'bloccata',
      motivo_blocco: `Nessun blueprint copre il brief con punteggio sufficiente (migliore: ${classifica[0]?.punteggio ?? 0}/100, soglia ${sogliaMinima}). Serve costruire un blueprint nuovo.`,
      payload: { segnali, classifica },
    };
    const { id, sorgente } = await salvaCampagna(record, {});
    info(`Registrato come bloccata (${sorgente}, id ${id}).`);
    process.exit(1);
  }

  const bp = blueprints.find((b) => b.id === scelto.id);

  // avviso di priorita' (non bloccante)
  const prioritaScelta = ORDINE_PRIORITA[scelto.id];
  if (prioritaScelta > 1) {
    const { righe: esistenti } = await elencaCampagne({ stati: STATI_CHE_PESANO_SUL_BUDGET }, await leggiConfig());
    const hannoPrioritaSuperiore = esistenti.some((r) => ORDINE_PRIORITA[r.blueprint] && ORDINE_PRIORITA[r.blueprint] < prioritaScelta);
    if (!hannoPrioritaSuperiore) {
      warn(`Il cliente ha dichiarato l'ordine estero → Italia → saloni (sheis-brand-core §13.1). Questo brief seleziona priorita' ${prioritaScelta} (${scelto.id}) e non risultano campagne registrate di priorita' superiore. Non e' un blocco: verifica con Mauro se e' voluto.`);
    }
  }

  // ── 3. costruzione ────────────────────────────────────────────────────
  const config = await leggiConfig();
  const { campagna, note, validazione, payload, riepilogoBudget } = costruisciCampagna(bp, segnali, {
    creativeRefForzato: argv.creative,
    config,
  });

  title('COSTRUZIONE CAMPAGNA');
  for (const n of note) info(n);

  title('PUBBLICO E CREATIVITA\' COLLEGATE');
  const targeting = campagna.adsets?.[0]?.targeting;
  console.log(`  Paese/i: ${targeting?.geo_locations?.countries?.join(', ') ?? targeting?.geo_locations?.custom_locations?.map((l) => l.name).join(', ') ?? '—'}`);
  console.log(`  Eta': ${targeting?.age_min ?? '—'}-${targeting?.age_max ?? '—'}`);
  console.log(`  Segmento: ${bp.audience_segment} (priorita' dichiarata dal cliente: ${prioritaScelta})`);
  console.log(`  Creativita' collegate: ${(campagna.creatives || []).map((c) => `${c.ref} (${c.name})`).join(', ') || '—'}`);
  console.log(`  Annunci: ${(campagna.ads || []).map((a) => a.name).join(', ') || '—'}`);

  title('BUDGET E CALENDARIO');
  console.log(`  Giornaliero: ${riepilogoBudget.dailyEur.toFixed(2)} EUR/giorno`);
  console.log(`  Durata: ${riepilogoBudget.durataGiorni} giorni`);
  console.log(`  Totale periodo: ${riepilogoBudget.totalEur.toFixed(2)} EUR`);
  console.log(`  Finestra: ${campagna.piano_calendario.inizio} → ${campagna.piano_calendario.fine}`);

  // ── 4. doppio controllo di budget ────────────────────────────────────
  // L'insieme che il tetto protegge: le campagne GIA' registrate da questo
  // stesso tool in stato pronta/attiva/in_pausa (STATI_CHE_PESANO_SUL_BUDGET,
  // vedi lib/campagne-store.mjs) PIU' questa nuova campagna. Dichiarato qui
  // esplicitamente perche' e' l'esatto punto dove un freno puo' finire per
  // contare l'insieme sbagliato (vedi lib/budget.mjs).
  const capMensileEur = config.monthly_budget_cap_eur ?? 1000;
  const { righe: campagneEsistenti, sorgente: sorgenteStore } = await elencaCampagne({ stati: STATI_CHE_PESANO_SUL_BUDGET }, config);
  const spesaCampagneRegistrateEur = campagneEsistenti.reduce((s, r) => s + (r.budget_totale ?? (r.budget_giorno ? r.budget_giorno * GIORNI_MESE : 0)), 0);

  const spesaStaticaKitEur = soloPrimari(blueprints).reduce((s, b) => s + (b.budget?.monthly_eur_est ?? 0), 0);

  title('TETTO DI SPESA — doppio controllo');
  info(`Insieme sommato per il controllo: campagne registrate (${sorgenteStore}) in stato ${STATI_CHE_PESANO_SUL_BUDGET.join('/')} — oggi ${campagneEsistenti.length}, ${spesaCampagneRegistrateEur.toFixed(2)} EUR/mese — PIU' questa campagna.`);
  warn(`Il kit statico A/B/C (launch.mjs) impegnerebbe ${spesaStaticaKitEur.toFixed(2)} EUR/mese se acceso: NON e' sommato automaticamente qui (ha il proprio controllo in launch.mjs). Se A/B/C sono gia' in corso sull'account, somma questa cifra a mano prima di decidere.`);

  const esitoBudget = controllaBudget({
    dailyEur: riepilogoBudget.dailyEur,
    totalEur: riepilogoBudget.totalEur,
    capMensileEur,
    spesaEsistenteMensileEur: spesaCampagneRegistrateEur,
  });
  if (esitoBudget.ok) ok(`Entro il tetto (${esitoBudget.mensileComplessivo.toFixed(2)} / ${capMensileEur.toFixed(2)} EUR/mese sull'insieme sopra).`);
  else for (const p of esitoBudget.problemi) fail(p);

  // ── 5. validazione (guardrail, advantage_audience, placeholder) ─────────
  title('VALIDAZIONE (stesso motore di launch.mjs)');
  for (const e of validazione.bloccanti) {
    fail(e.tipo);
    for (const d of e.dettaglio) console.log(`       ${d}`);
    console.log(`       ${C.dim}${e.spiegazione}${C.reset}`);
  }
  for (const e of validazione.informativi) info(`${e.tipo}: ${e.dettaglio.length} valori non ancora risolti — normale finche' non ci sono accessi.`);
  for (const a of validazione.avvisi) warn(a);
  if (!validazione.bloccanti.length && !validazione.informativi.length && !validazione.avvisi.length) ok('Nessun problema.');

  // ── 6. stato finale ───────────────────────────────────────────────────
  let stato = 'bozza';
  let motivoBlocco = null;
  const problemiBloccanti = [];
  if (validazione.bloccanti.length) problemiBloccanti.push(`${validazione.bloccanti.length} blocco/i di validazione (guardrail di brand o advantage_audience)`);
  if (!esitoBudget.ok) problemiBloccanti.push('tetto di spesa superato sull\'insieme corretto');

  let preflightEsito = null;
  if (config.access_token) {
    try {
      await preflight(config, blueprints, { silenzioso: true });
      preflightEsito = 'ok';
    } catch (e) {
      preflightEsito = e instanceof BloccoPreflight ? e.message : `errore: ${e.message}`;
      problemiBloccanti.push('preflight accessi fallito');
    }
  } else {
    preflightEsito = 'config.local.json assente o senza access_token — account pubblicitario Meta di SHEis non verificabile ora (vedi node stato_accessi.mjs)';
  }

  if (problemiBloccanti.length) {
    stato = 'bloccata';
    motivoBlocco = problemiBloccanti.join('; ') + (preflightEsito && preflightEsito !== 'ok' ? ` — ${preflightEsito}` : '');
  } else if (preflightEsito !== 'ok') {
    // Nessun blocco locale, ma senza accessi verificati non si puo' promuovere oltre 'bozza'.
    stato = 'bozza';
    motivoBlocco = preflightEsito;
  }

  title('ESITO');
  console.log(`  Stato: ${stato === 'bloccata' ? C.red : C.yellow}${C.bold}${stato}${C.reset}`);
  if (motivoBlocco) console.log(`  Motivo: ${motivoBlocco}`);

  // ── 7. salvataggio ───────────────────────────────────────────────────
  const record = {
    nome: campagna.campaign.name,
    obiettivo: testoBrief,
    pubblico: bp.audience_segment,
    brand: segnali.brand,
    budget_giorno: riepilogoBudget.dailyEur,
    budget_totale: riepilogoBudget.totalEur,
    blueprint: bp.id,
    stato,
    motivo_blocco: motivoBlocco,
    payload: { segnali, scelta: { id: scelto.id, punteggio: scelto.punteggio, criteri: scelto.criteri, classifica }, campagna, payload, note },
  };
  const { id, sorgente } = await salvaCampagna(record, config);
  ok(`Registrato in sheis_campagne (${sorgente}) — id ${id}, stato "${stato}".`);
  if (sorgente === 'locale' && !dbAttivo(config)) {
    info('Tabella sheis_campagne non ancora raggiungibile: salvato nel registro locale .campagne/registro.json. Si collegherà al DB automaticamente quando SUPABASE_URL/SUPABASE_SECRET_KEY (o config.local.json → supabase) saranno impostati — nessun altro cambiamento richiesto.');
  }

  // ── 8. file ispezionabile ─────────────────────────────────────────────
  await mkdir(CAMPAGNE_DIR, { recursive: true });
  const slug = slugifica(`${segnali.brand || bp.id}-${segnali.paese || ''}`);
  const outPath = argv.out || join(CAMPAGNE_DIR, `${new Date().toISOString().replace(/[:.]/g, '-')}_${slug}.json`);
  await writeFile(outPath, JSON.stringify(record, null, 2));
  console.log(`\n  ${C.bold}Campagna completa salvata in:${C.reset} ${outPath}`);
  console.log(`  ${C.dim}Contiene: brief, segnali estratti, punteggio di ogni blueprint, campagna costruita, payload esatto per Meta.${C.reset}`);

  // ── 9. LIVE — crea davvero, solo su richiesta esplicita e doppia conferma ──
  if (!argv.live) {
    console.log(`\n  ${C.green}Simulazione completata. Nessuna chiamata a Meta e' stata fatta.${C.reset}`);
    console.log(`  ${C.dim}Per tentare la creazione reale: LIVE=1 node campagna_da_brief.mjs --brief "..." --live${C.reset}\n`);
    return;
  }

  title('LIVE — tentativo di creazione reale');
  if (process.env.LIVE !== '1') {
    fail('--live richiede anche la variabile d\'ambiente LIVE=1 (doppio gate). Non e\' stato creato nulla.');
    process.exit(1);
  }
  if (stato === 'bloccata') {
    fail(`Campagna in stato "bloccata": ${motivoBlocco}`);
    console.log(`  ${C.dim}Non e' stato creato nulla.${C.reset}\n`);
    process.exit(1);
  }
  if (preflightEsito !== 'ok') {
    fail(`Preflight non superato: ${preflightEsito}`);
    console.log(`  ${C.dim}Non e' stato creato nulla.${C.reset}\n`);
    process.exit(1);
  }

  console.log(`  Stai per creare la campagna "${campagna.campaign.name}" sull'account ${config.ad_account_id}.`);
  console.log(`  Impegno di spesa se poi la attivi: ${C.bold}${riepilogoBudget.totalEur.toFixed(2)} EUR nel periodo${C.reset} (${riepilogoBudget.dailyEur.toFixed(2)} EUR/giorno).`);
  console.log(`  ${C.dim}Nasce in PAUSA. Nessuna spesa parte da questo script.${C.reset}\n`);

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const risposta = await rl.question(`  Scrivi ${C.bold}CONFERMO${C.reset} per procedere (qualsiasi altra cosa annulla): `);
  rl.close();
  if (risposta.trim() !== 'CONFERMO') {
    console.log(`\n  ${C.yellow}Annullato. Non e' stato creato nulla.${C.reset}\n`);
    process.exit(0);
  }

  const api = makeApi(config);
  const actId = normalizzaAdAccountId(config.ad_account_id);
  const risolto = risolvi(campagna, config.resolve || {});
  try {
    const creati = await executePayload(api, actId, buildPayload(risolto));
    await salvaCampagna({ ...record, id, stato: 'pronta', meta_campaign_id: creati.campaign, motivo_blocco: null }, config);
    console.log(`\n  ${C.green}${C.bold}Fatto.${C.reset} Campagna creata in PAUSA: ${creati.campaign}`);
    console.log(`  ${C.yellow}Si accende a mano in Gestione Inserzioni, dopo aver guardato le anteprime.${C.reset}\n`);
  } catch (e) {
    fail(`Creazione interrotta: ${e.message}`);
    if (e.graph?.error_user_msg) info(`Meta dice: ${e.graph.error_user_msg}`);
    await salvaCampagna({ ...record, id, stato: 'bloccata', motivo_blocco: `Creazione interrotta: ${e.message}` }, config);
    process.exit(1);
  }
}

function stampaSegnale(etichetta, valore, dettaglio) {
  if (valore) {
    ok(`${etichetta}: ${C.bold}${valore}${C.reset}${dettaglio ? `  ${C.dim}(${dettaglio})${C.reset}` : ''}`);
  } else {
    warn(`${etichetta}: non specificato nel brief.`);
  }
}

async function leggiConfig() {
  if (!existsSync(CONFIG_PATH)) return {};
  try {
    return JSON.parse(await readFile(CONFIG_PATH, 'utf8'));
  } catch {
    return {};
  }
}

main().catch((e) => {
  console.error(`\n  ${C.red}${C.bold}ERRORE NON GESTITO${C.reset}\n  ${e.stack || e.message}\n`);
  process.exit(1);
});
