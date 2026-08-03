#!/usr/bin/env node
/**
 * SHEis Beauty International — prova a secco end-to-end
 *
 * Simula il lancio dei 3 blueprint statici (percorso launch.mjs) E di 3
 * brief rappresentativi (percorso campagna_da_brief.mjs), con TUTTI i
 * placeholder risolti a valori FINTI ma plausibili — mai chiamando Meta.
 * Verifica esattamente cio' che la Graph API pretenderebbe:
 *
 *   - nessun placeholder <<...>> residuo dopo la risoluzione
 *   - advantage_audience presente nel payload FINALE (non solo nel blueprint)
 *   - campi obbligatori per campagna/adset/creativita'/annuncio, tutti presenti
 *   - budget in centesimi: intero positivo, coerente col dichiarato
 *   - ogni annuncio punta a un adset e una creativita' che esistono davvero
 *     (nessuna creativita' orfana, nessun riferimento rotto)
 *   - guardrail di brand: zero violazioni sui testi pubblici
 *   - (solo per i brief) date del calendario coerenti: inizio <= fine
 *
 * Per ogni blueprint/brief dice "SI, QUESTO PARTIREBBE" oppure l'elenco
 * ESATTO di cosa lo bloccherebbe. Exit code 1 se anche un solo controllo
 * fallisce, cosi' puo' girare come gate prima di un --live.
 *
 *   node prova-a-secco.mjs
 */
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { C, ok, warn, fail, info, title } from './lib/ui.mjs';
import { validaBlueprint } from './lib/validate.mjs';
import { trovaPlaceholder, risolvi } from './lib/placeholders.mjs';
import { buildPayload } from './lib/payload-builder.mjs';
import { stampaPianoSpesa, GIORNI_MESE } from './lib/budget.mjs';
import { analizzaBrief } from './lib/brief-parser.mjs';
import { scegliBlueprint, soloPrimari, soloVarianti } from './lib/blueprint-selector.mjs';
import { costruisciCampagna } from './lib/campaign-builder.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));
const BLUEPRINT_DIR = join(ROOT, 'blueprints');

// ── valori finti ma plausibili, SOLO per questa simulazione ────────────────
// Mai reali, mai da copiare in config.local.json. Coprono ogni placeholder
// che compare nei 3 blueprint (verificato sotto: se ne manca uno, lo script
// lo dice invece di lasciarlo irrisolto in silenzio).
function creaValoriFinti() {
  let contatore = 0;
  const prossimo = () => String(1000000000000 + contatore++);

  const fissi = {
    PAGE_ID: `FAKE_PAGE_${prossimo()}`,
    INSTAGRAM_ACTOR_ID: `FAKE_IG_${prossimo()}`,
    PRIVACY_URL: 'https://www.sheishair.com/privacy-policy/',
    'LEAD_FORM_ID:ES': `FAKE_FORM_ES_${prossimo()}`,
    'LEAD_FORM_ID:IT': `FAKE_FORM_IT_${prossimo()}`,
    LEAD_FORM_LINK: 'https://www.sheishair.com/',
    'IMAGE_HASH:A1': 'f'.repeat(32), 'IMAGE_HASH:A2': 'f'.repeat(32), 'IMAGE_HASH:A3': 'f'.repeat(32),
    'IMAGE_HASH:B1': 'f'.repeat(32), 'IMAGE_HASH:B2': 'f'.repeat(32), 'IMAGE_HASH:B3': 'f'.repeat(32),
    'IMAGE_HASH:C1': 'f'.repeat(32), 'IMAGE_HASH:C2': 'f'.repeat(32),
    GEO_ZONA_PILOTA: 'Zona pilota di prova (dry-run, non reale)',
    GEO_LAT: '42.4618',
    GEO_LNG: '14.1697',
    'CUSTOM_AUDIENCE_ID:ateco-4645': `FAKE_CA_${prossimo()}`,
    'LANDING_URL:distributori-es': 'https://esempio-dry-run.invalid/es/distributori',
    'LANDING_URL:distributori-it': 'https://esempio-dry-run.invalid/it/distributori',
  };

  for (const nome of [
    'Davines', 'Kevin Murphy', 'Alfaparf Milano', 'Kemon', 'Framesi',
    'Peluqueria', 'Distribucion mayorista', 'Parrucchiere',
    'Cosmetica professionale', 'Salone di bellezza', 'Colorazione capelli',
  ]) fissi[`INTEREST_ID:${nome}`] = `FAKE_INTEREST_${prossimo()}`;

  fissi['BEHAVIOR_ID:Facebook Page admins'] = `FAKE_BEHAVIOR_${prossimo()}`;
  fissi['WORK_POSITION_ID:Parrucchiere'] = `FAKE_WORKPOS_${prossimo()}`;

  return fissi;
}

const FINTI = creaValoriFinti();
const CONFIG_FINTO = { resolve: FINTI, monthly_budget_cap_eur: 1000 };

// ── controlli strutturali sul payload gia' risolto ──────────────────────────
function verificaCampiObbligatori(built) {
  const problemi = [];
  const c = built.campaign;
  if (!c.name) problemi.push('campaign.name mancante');
  if (!c.objective) problemi.push('campaign.objective mancante');
  if (c.status !== 'PAUSED') problemi.push(`campaign.status deve essere PAUSED, e' "${c.status}"`);
  if (!c.buying_type) problemi.push('campaign.buying_type mancante');

  for (const a of built.adsets) {
    const p = a.payload;
    if (!p.name) problemi.push(`adset "${a.name}": name mancante`);
    if (!Number.isInteger(p.daily_budget) || p.daily_budget <= 0) problemi.push(`adset "${a.name}": daily_budget non e' un intero positivo di centesimi (${p.daily_budget})`);
    if (!p.billing_event) problemi.push(`adset "${a.name}": billing_event mancante`);
    if (!p.optimization_goal) problemi.push(`adset "${a.name}": optimization_goal mancante`);
    if (!p.targeting || typeof p.targeting !== 'object') problemi.push(`adset "${a.name}": targeting mancante`);
    if (p.status !== 'PAUSED') problemi.push(`adset "${a.name}": status deve essere PAUSED, e' "${p.status}"`);
    const adv = p.targeting?.targeting_automation?.advantage_audience ?? p.targeting?.advantage_audience;
    if (adv === undefined) problemi.push(`adset "${a.name}": advantage_audience assente nel PAYLOAD FINALE — la create_ad_set fallirebbe`);
    else if (![0, 1].includes(Number(adv))) problemi.push(`adset "${a.name}": advantage_audience="${adv}" non valido (ammessi solo 0/1)`);
  }

  for (const cr of built.creatives) {
    if (!cr.payload.name) problemi.push(`creativita' "${cr.ref}": name mancante`);
    if (!cr.payload.object_story_spec || typeof cr.payload.object_story_spec !== 'object') problemi.push(`creativita' "${cr.ref}": object_story_spec mancante`);
  }

  for (const ad of built.ads) {
    if (!ad.payload.name) problemi.push(`annuncio "${ad.name}": name mancante`);
    if (ad.payload.status !== 'PAUSED') problemi.push(`annuncio "${ad.name}": status deve essere PAUSED`);
  }

  return problemi;
}

function verificaCollegamenti(bp) {
  const problemi = [];
  const nomiAdset = new Set((bp.adsets || []).map((a) => a.name));
  const refCreative = new Set((bp.creatives || []).map((c) => c.ref));
  const refCreativeUsati = new Set();

  for (const ad of bp.ads || []) {
    if (!nomiAdset.has(ad.adset_ref)) problemi.push(`annuncio "${ad.name}" punta a un adset inesistente: "${ad.adset_ref}"`);
    if (!refCreative.has(ad.creative_ref)) problemi.push(`annuncio "${ad.name}" punta a una creativita' inesistente: "${ad.creative_ref}"`);
    else refCreativeUsati.add(ad.creative_ref);
  }
  for (const c of bp.creatives || []) {
    if (!refCreativeUsati.has(c.ref)) problemi.push(`creativita' "${c.ref}" non e' collegata a NESSUN annuncio (orfana)`);
  }
  return problemi;
}

function verificaPlaceholderRisolti(risolto, id) {
  const rimasti = trovaPlaceholder(risolto);
  if (!rimasti.size) return [];
  return [...rimasti.keys()].map((k) => `placeholder <<${k}>> ancora presente dopo la risoluzione (manca nei FINTI di questo script, id ${id})`);
}

// Verifica strutturale unica: usata sia per i primari sia per le varianti,
// stesso motore, nessuna divergenza fra i due percorsi.
function verificaStrutturaBlueprint(bp) {
  const blocchi = [];

  const { errori, avvisi, giornalieroReale, mensileStimato } = validaBlueprint(bp, CONFIG_FINTO);
  for (const a of avvisi) warn(a);
  for (const e of errori) blocchi.push(`${e.tipo}: ${e.dettaglio.join(' | ')}`);

  const risolto = risolvi(bp, FINTI);
  blocchi.push(...verificaPlaceholderRisolti(risolto, bp.id));

  let built = null;
  try {
    built = buildPayload(risolto);
  } catch (e) {
    blocchi.push(`buildPayload ha lanciato un'eccezione: ${e.message}`);
  }
  if (built) blocchi.push(...verificaCampiObbligatori(built));

  blocchi.push(...verificaCollegamenti(bp));

  return { blocchi, giornalieroReale, mensileStimato, errori };
}

// ── sezione 1: i 3 blueprint statici primari, percorso launch.mjs ──────────
async function provaBlueprintStatici() {
  title('1. BLUEPRINT STATICI PRIMARI (percorso launch.mjs, default senza --only) — con valori FINTI');
  const files = (await readdir(BLUEPRINT_DIR)).filter((f) => f.endsWith('.json')).sort();
  const tutti = await Promise.all(files.map(async (f) => JSON.parse(await readFile(join(BLUEPRINT_DIR, f), 'utf8'))));
  const blueprints = soloPrimari(tutti);

  const voci = [];
  const esiti = [];

  for (const bp of blueprints) {
    console.log(`\n  ${C.bold}${bp.id}${C.reset} — ${bp.label}`);
    const { blocchi, giornalieroReale, mensileStimato, errori } = verificaStrutturaBlueprint(bp);

    if (blocchi.length) {
      fail(`${blocchi.length} ${blocchi.length === 1 ? 'blocco' : 'blocchi'}:`);
      for (const b of blocchi) console.log(`       - ${b}`);
    } else {
      ok('Nessun blocco.');
    }
    info(`Date: N/A — un blueprint statico non dichiara una finestra, si accende/spegne a mano (vedi sezione 2 per la coerenza date su brief generati).`);

    console.log(`\n  ${blocchi.length === 0 ? `${C.green}${C.bold}SI, QUESTO PARTIREBBE.${C.reset}` : `${C.red}${C.bold}NO — bloccato dai punti sopra.${C.reset}`}`);

    voci.push({ id: bp.id, blueprint: bp, giornaliero: giornalieroReale, mensile: mensileStimato, errori });
    esiti.push({ id: bp.id, ok: blocchi.length === 0, blocchi });
  }

  const { sforato, totMese } = stampaPianoSpesa(voci, CONFIG_FINTO.monthly_budget_cap_eur ?? 1000);

  // ── 1b. varianti (destination_type diverso, stesso obiettivo commerciale) ──
  // Fuori dal piano di spesa aggregato di proposito (soloPrimari sopra): non
  // sono campagne aggiuntive, sono alternative — vedi lib/blueprint-selector.mjs.
  const varianti = soloVarianti(tutti);
  const esitiVarianti = [];
  if (varianti.length) {
    title('1b. VARIANTI WEBSITE (destination_type diverso, escluse dal tetto aggregato) — con valori FINTI');
    for (const bp of varianti) {
      console.log(`\n  ${C.bold}${bp.id}${C.reset} — ${bp.label}`);
      console.log(`  ${C.dim}Variante di: ${bp.variante_di}${C.reset}`);
      const { blocchi } = verificaStrutturaBlueprint(bp);

      // Le varianti web non usano moduli lead nativi: nessun dettaglio in piu'
      // da verificare qui oltre alla struttura standard (il controllo di
      // consegna lead — lib/leads-check.mjs — le ignora di proposito, sono
      // destination_type WEBSITE, non ON_AD).
      if (blocchi.length) {
        fail(`${blocchi.length} ${blocchi.length === 1 ? 'blocco' : 'blocchi'}:`);
        for (const b of blocchi) console.log(`       - ${b}`);
      } else {
        ok('Nessun blocco strutturale.');
        warn(`Dipendenza NON verificabile da questo script: la pagina/endpoint/tabella di destinazione esistono in codice ma non end-to-end (vedi 🔴_perche_esiste_questa_variante nel file). Non lanciare finche' un invio di prova reale non arriva in sheis_lead_ads.`);
      }
      console.log(`\n  ${blocchi.length === 0 ? `${C.yellow}${C.bold}STRUTTURALMENTE SI — ma verifica end-to-end la destinazione prima di spendere.${C.reset}` : `${C.red}${C.bold}NO — bloccato dai punti sopra.${C.reset}`}`);
      esitiVarianti.push({ id: bp.id, ok: blocchi.length === 0, blocchi, richiedeVerificaEndToEnd: blocchi.length === 0 });
    }
  }

  return { esiti, sforato, totMese, esitiVarianti };
}

// ── sezione 2: 3 brief rappresentativi, percorso campagna_da_brief.mjs ──────
const BRIEF_DI_PROVA = [
  { attesa: 'A-estero-spagna', testo: 'Voglio far conoscere BABILON ai distributori spagnoli. Budget 20 euro al giorno per due settimane. Obiettivo: farmi arrivare richieste di contatto.' },
  { attesa: 'B-italia-distributori', testo: 'Voglio raggiungere i distributori italiani con SHEis Color. Budget 8 euro al giorno per un mese. Obiettivo: contatti.' },
  { attesa: 'C-saloni-awareness', testo: 'Voglio far conoscere il brand ai parrucchieri della zona. Budget 3 euro al giorno per un mese. Obiettivo: farmi conoscere.' },
];

async function provaBrief() {
  title('2. MEDIA BUYER SU RICHIESTA (percorso campagna_da_brief.mjs) — 3 brief di prova');
  const files = (await readdir(BLUEPRINT_DIR)).filter((f) => f.endsWith('.json')).sort();
  const blueprints = await Promise.all(files.map(async (f) => JSON.parse(await readFile(join(BLUEPRINT_DIR, f), 'utf8'))));

  const esiti = [];

  for (const { attesa, testo } of BRIEF_DI_PROVA) {
    console.log(`\n  ${C.bold}Brief:${C.reset} "${testo}"`);
    const blocchi = [];

    const segnali = analizzaBrief(testo);
    const { scelto, classifica } = scegliBlueprint(soloPrimari(blueprints), segnali);

    if (!scelto) {
      blocchi.push(`nessun blueprint sopra soglia (migliore: ${classifica[0]?.punteggio ?? 0}/100)`);
    } else {
      if (scelto.id !== attesa) warn(`Atteso "${attesa}", scelto "${scelto.id}" (punteggio ${scelto.punteggio}/100) — verifica se il brief di prova e' ambiguo, non e' detto sia un errore dello script.`);
      else ok(`Blueprint scelto: ${scelto.id} (punteggio ${scelto.punteggio}/100).`);

      const bp = blueprints.find((b) => b.id === scelto.id);
      const { campagna, validazione, riepilogoBudget } = costruisciCampagna(bp, segnali, { config: CONFIG_FINTO });

      // date coerenti
      const inizio = new Date(campagna.piano_calendario.inizio);
      const fine = new Date(campagna.piano_calendario.fine);
      if (!(inizio <= fine)) blocchi.push(`date incoerenti: inizio ${campagna.piano_calendario.inizio} dopo fine ${campagna.piano_calendario.fine}`);
      if (riepilogoBudget.durataGiorni <= 0) blocchi.push(`durata non valida: ${riepilogoBudget.durataGiorni} giorni`);
      ok(`Calendario: ${campagna.piano_calendario.inizio} → ${campagna.piano_calendario.fine} (${riepilogoBudget.durataGiorni} giorni, ${riepilogoBudget.totalEur.toFixed(2)} EUR totali).`);

      // guardrail + advantage_audience (motore condiviso)
      for (const e of validazione.bloccanti) blocchi.push(`${e.tipo}: ${e.dettaglio.join(' | ')}`);

      // payload risolto + campi obbligatori + collegamenti
      const risolto = risolvi(campagna, FINTI);
      blocchi.push(...verificaPlaceholderRisolti(risolto, scelto.id));
      try {
        const built = buildPayload(risolto);
        blocchi.push(...verificaCampiObbligatori(built));
      } catch (e) {
        blocchi.push(`buildPayload ha lanciato un'eccezione: ${e.message}`);
      }
      blocchi.push(...verificaCollegamenti(campagna));
    }

    if (blocchi.length) {
      fail(`${blocchi.length} ${blocchi.length === 1 ? 'blocco' : 'blocchi'}:`);
      for (const b of blocchi) console.log(`       - ${b}`);
    } else {
      ok('Nessun blocco.');
    }
    console.log(`\n  ${blocchi.length === 0 ? `${C.green}${C.bold}SI, QUESTA CAMPAGNA-DA-BRIEF PARTIREBBE.${C.reset}` : `${C.red}${C.bold}NO — bloccata dai punti sopra.${C.reset}`}`);

    esiti.push({ testo, ok: blocchi.length === 0, blocchi });
  }

  return esiti;
}

async function main() {
  console.log(`\n${C.bold}SHEis Beauty International — prova a secco end-to-end${C.reset}`);
  console.log(`${C.dim}SIMULAZIONE STRUTTURALE — nessuna chiamata a Meta. Ogni <<PLACEHOLDER>> e' sostituito${C.reset}`);
  console.log(`${C.dim}con un ID FINTO (prefisso FAKE_) solo per validare la FORMA del payload, mai per creare nulla.${C.reset}`);

  const { esiti: esitiStatici, sforato, totMese, esitiVarianti } = await provaBlueprintStatici();
  const esitiBrief = await provaBrief();

  title('VERDETTO GLOBALE');
  let tuttoOk = true;
  for (const e of esitiStatici) {
    if (e.ok) ok(`${e.id}: SI, PARTIREBBE (singolarmente, con --only).`);
    else { fail(`${e.id}: NO — ${e.blocchi.length} blocco/i.`); tuttoOk = false; }
  }
  for (const e of esitiVarianti) {
    if (!e.ok) { fail(`${e.id}: NO — ${e.blocchi.length} blocco/i strutturali.`); tuttoOk = false; }
    else warn(`${e.id}: struttura OK, ma destinazione NON verificata end-to-end (serve sheis_lead_ads live) — non e' un blocco di questo script, e' un prerequisito fuori dal suo perimetro.`);
  }
  for (const e of esitiBrief) {
    if (e.ok) ok(`brief "${e.testo.slice(0, 40)}…": SI, PARTIREBBE.`);
    else { fail(`brief "${e.testo.slice(0, 40)}…": NO — ${e.blocchi.length} blocco/i.`); tuttoOk = false; }
  }

  if (sforato) {
    warn(
      `I 3 blueprint TUTTI INSIEME costano ${totMese.toFixed(2)} EUR/mese, sopra il tetto dichiarato di ` +
      `${(CONFIG_FINTO.monthly_budget_cap_eur ?? 1000).toFixed(2)} EUR/mese — di ` +
      `${(totMese - (CONFIG_FINTO.monthly_budget_cap_eur ?? 1000)).toFixed(2)} EUR. ` +
      `Nessun singolo blueprint sfora (ognuno passa da solo, vedi sopra): sfora solo la loro somma. ` +
      `Dal 3/8 "node launch.mjs" in ANTEPRIMA parte comunque e avvisa — un freno che impedisce di guardare ` +
      `non protegge niente. In "--live" invece BLOCCA, e non si discute. ` +
      `Il caso pratico non lo sfora: si lancia con --only <blueprint-id> nella sequenza gia' decisa ` +
      `(A e C nel mese 1, B nel mese 2), e con --only il conteggio guarda solo cio' che lanci davvero. ` +
      `Se un giorno servisse accenderli tutti e tre, il tetto va alzato da Mauro: non si aggira da qui.`
    );
    tuttoOk = false;
  }

  const soloAggregatoSforato = tuttoOk === false && sforato && esitiStatici.every((e) => e.ok) && esitiBrief.every((e) => e.ok);

  console.log('');
  if (sforato === false && esitiStatici.every((e) => e.ok) && esitiBrief.every((e) => e.ok)) {
    console.log(`  ${C.green}${C.bold}Tutti i controlli strutturali passano, anche il tetto di spesa aggregato.${C.reset} Restano da verificare,`);
    console.log('  e SOLO con accessi veri: token, ad account (valuta/fuso), Pagina, Instagram, moduli lead — vedi node launch.mjs --preflight.\n');
  } else if (soloAggregatoSforato) {
    console.log(`  ${C.yellow}${C.bold}Nessun blocco strutturale.${C.reset} L'unico punto aperto e' operativo (vedi ATTENZIONE sopra):`);
    console.log('  lanciare sempre con --only, mai i 3 blueprint insieme finche\' il tetto resta a 1.000 EUR/mese.\n');
  } else {
    console.log(`  ${C.red}${C.bold}Almeno un blocco strutturale sopra.${C.reset} Va risolto nei blueprint/librerie, non con --live.\n`);
  }

  process.exit(tuttoOk ? 0 : 1);
}

main().catch((e) => {
  console.error(`\n  ${C.red}${C.bold}ERRORE NON GESTITO${C.reset}\n  ${e.stack || e.message}\n`);
  process.exit(1);
});
