#!/usr/bin/env node
/**
 * SHEis Beauty International — attivazione guidata
 *
 * Un comando unico per chi ha in mano le credenziali Meta, appena arrivano.
 * Non serve aprire config.local.json a mano e indovinare il formato: questo
 * script chiede un valore alla volta, nell'ordine in cui servono, lo VERIFICA
 * contro l'API vera prima di accettarlo (quando e' verificabile), lo scrive
 * in config.local.json, e alla fine dice cosa manca ancora.
 *
 * Intercetta i due errori che si pagano una volta sola — valuta ≠ EUR e
 * fuso ≠ Europe/Rome — nel momento esatto in cui arriva l'ID dell'account
 * pubblicitario: si scelgono alla creazione e non si possono piu' cambiare,
 * quindi se sono sbagliati questo script SI FERMA e lo dice, invece di
 * continuare a fare altre 20 domande su un account da buttare.
 *
 * Puo' essere rilanciato piu' volte: riprende da dove aveva lasciato,
 * proponendo come default i valori gia' presenti in config.local.json.
 *
 *   node attiva.mjs
 *
 * Non crea NULLA su Meta: legge soltanto, per verificare. La creazione delle
 * campagne resta un passo separato (node launch.mjs --live), con il suo
 * stesso triplo lucchetto (LIVE=1 + --live + CONFERMO scritto a mano).
 */
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { C, ok, warn, fail, info, title } from './lib/ui.mjs';
import { makeApi, normalizzaAdAccountId, STATI_ACCOUNT, verificaValutaEFuso } from './lib/meta-api.mjs';
import { preflight, BloccoPreflight } from './lib/preflight.mjs';
import { CHECKLIST, OBBLIGATORIE } from './lib/checklist-accessi.mjs';
import { verificaConsegnaLead } from './lib/leads-check.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = join(ROOT, 'config.local.json');
const EXAMPLE_PATH = join(ROOT, 'config.example.json');
const BLUEPRINT_DIR = join(ROOT, 'blueprints');

// ─────────────────────────────────────────────────────────────────────────
// stato + persistenza — mai perdere quel che l'utente ha gia' digitato
// ─────────────────────────────────────────────────────────────────────────
async function caricaConfig() {
  const percorso = existsSync(CONFIG_PATH) ? CONFIG_PATH : EXAMPLE_PATH;
  const base = JSON.parse(await readFile(percorso, 'utf8'));
  // Ripulisce dall'esempio: niente placeholder testuali tipo "act_XXX" o
  // "INCOLLA_QUI_IL_TOKEN" quando si riparte da config.example.json.
  if (percorso === EXAMPLE_PATH) {
    base.access_token = '';
    base.ad_account_id = '';
    for (const k of Object.keys(base.resolve || {})) {
      if (k.startsWith('_')) continue;
      base.resolve[k] = '';
    }
  }
  base.resolve = base.resolve || {};
  base.supabase = base.supabase || { url: '', secret_key: '', project_ref: '' };
  return base;
}

async function salva(config) {
  await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2));
}

function mascheraToken(token) {
  if (!token || token.length < 12) return '(vuoto)';
  return `${token.slice(0, 8)}…${token.slice(-4)} (${token.length} caratteri)`;
}

// ─────────────────────────────────────────────────────────────────────────
// input
// ─────────────────────────────────────────────────────────────────────────
async function chiedi(rl, domanda, { attuale, obbligatorio = false, maschera = false } = {}) {
  const mostrato = attuale ? (maschera ? mascheraToken(attuale) : attuale) : null;
  const suffisso = mostrato ? ` ${C.dim}[invio = mantieni: ${mostrato}]${C.reset}` : obbligatorio ? '' : ` ${C.dim}[invio = salta]${C.reset}`;
  const risposta = (await rl.question(`  ${domanda}${suffisso}\n  → `)).trim();
  if (!risposta) return attuale ?? null;
  return risposta;
}

// ─────────────────────────────────────────────────────────────────────────
// main
// ─────────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n${C.bold}SHEis Beauty International — attivazione guidata${C.reset}`);
  console.log(`${C.dim}Non crea nulla su Meta: legge per verificare, poi scrive config.local.json.${C.reset}\n`);

  const config = await caricaConfig();
  const rl = createInterface({ input: process.stdin, output: process.stdout });

  const fileBlueprint = (await readdir(BLUEPRINT_DIR)).filter((f) => f.endsWith('.json')).sort();
  const blueprints = await Promise.all(fileBlueprint.map(async (f) => JSON.parse(await readFile(join(BLUEPRINT_DIR, f), 'utf8'))));

  try {
    // ── 1. access_token ────────────────────────────────────────────────
    title('1. TOKEN DI ACCESSO');
    console.log('  Serve un token con ads_management, pages_show_list, leads_retrieval, business_management.');
    console.log('  Meglio un token da Utente di Sistema del Business Manager SHEis: non scade.\n');

    config.access_token = await chiedi(rl, 'Incolla il token di accesso.', { attuale: config.access_token, maschera: true });
    await salva(config);

    if (config.access_token) {
      const api = makeApi(config);
      try {
        const me = await api.get('me', { fields: 'id,name' });
        ok(`Token valido — utente/app: ${me.name || me.id}`);
        try {
          const dbg = await api.get('debug_token', { input_token: config.access_token });
          const scopes = dbg.data?.scopes || [];
          const richiesti = ['ads_management', 'pages_show_list', 'leads_retrieval', 'business_management'];
          const mancanti = richiesti.filter((s) => !scopes.includes(s));
          if (mancanti.length) warn(`Permessi mancanti sul token: ${mancanti.join(', ')}. Le fasi successive potrebbero fallire.`);
          else ok('Permessi presenti su tutti e quattro i necessari.');
          if (!dbg.data?.expires_at) ok('Token senza scadenza (Utente di Sistema).');
          else warn(`Token con scadenza: ${new Date(dbg.data.expires_at * 1000).toLocaleDateString('it-IT')}. Meglio un token da Utente di Sistema.`);
        } catch {
          info('debug_token non interrogabile con questo token: i permessi non sono verificabili in anticipo.');
        }
      } catch (e) {
        fail(`Token non valido: ${e.message}`);
        warn('Salvato comunque in config.local.json cosi\' non lo riscrivi da capo: correggilo e rilancia node attiva.mjs.');
      }
    } else {
      warn('Nessun token: le fasi successive di verifica saranno saltate, ma puoi comunque registrare gli ID che gia\' conosci.');
    }

    // ── 2. ad_account_id — QUI si ferma se valuta/fuso sono sbagliati ──
    title('2. ACCOUNT PUBBLICITARIO — il punto senza ritorno');
    console.log('  Valuta (EUR) e fuso (Europe/Rome) si scelgono UNA VOLTA alla creazione');
    console.log('  dell\'account e non si possono piu\' cambiare. Se sono sbagliati, l\'account');
    console.log('  va buttato e ricreato: per questo la verifica qui e\' bloccante.\n');

    const adAccountInput = await chiedi(rl, 'ID dell\'account pubblicitario (con o senza "act_").', { attuale: config.ad_account_id });
    if (adAccountInput) config.ad_account_id = normalizzaAdAccountId(adAccountInput);
    await salva(config);

    if (config.access_token && config.ad_account_id) {
      const api = makeApi(config);
      try {
        const account = await api.get(config.ad_account_id, {
          fields: 'name,account_status,disable_reason,currency,timezone_name,funding_source_details,spend_cap',
        });

        const { ok: valutaEFusoOk, problemi: problemiUnaTantum } = verificaValutaEFuso(account);

        if (!valutaEFusoOk) {
          title('FERMO — errore che si paga una volta sola');
          fail(`Account "${account.name || config.ad_account_id}": ${problemiUnaTantum.join(' e ')}.`);
          console.log(`\n  ${C.bold}Non si puo' correggere in seguito.${C.reset} Valuta e fuso si scelgono alla creazione`);
          console.log('  dell\'account e restano quelli per sempre. Le uniche strade sono:');
          console.log('    1. Buttare questo account e crearne uno nuovo DENTRO il Business Manager SHEis,');
          console.log('       scegliendo esplicitamente EUR e Europe/Rome.');
          console.log('    2. Se la valuta e\' irrimediabilmente un\'altra, ricalcolare ogni budget del kit');
          console.log('       (oggi tutti in centesimi di EURO) nella valuta giusta — sconsigliato, introduce');
          console.log('       un secondo posto dove i numeri possono disallinearsi.');
          console.log(`\n  ${C.dim}L'ID che hai dato e' stato comunque salvato in config.local.json, cosi' non lo perdi;${C.reset}`);
          console.log(`  ${C.dim}ma questo script si ferma qui: non ha senso raccogliere altri 20 valori per un account da rifare.${C.reset}\n`);
          rl.close();
          process.exit(1);
        }

        ok(`Account "${account.name || config.ad_account_id}" — valuta EUR, fuso Europe/Rome. Corretto, non si torna piu\' su questo punto.`);

        const stato = STATI_ACCOUNT[account.account_status] || `sconosciuto (${account.account_status})`;
        if (account.account_status === 1) ok(`Stato account: ${stato}.`);
        else warn(`Stato account: ${stato} (non ACTIVE). Non e' un errore "una volta sola" come valuta/fuso: puo' sistemarsi (es. dopo aggiungere un metodo di pagamento). Continua pure a rispondere alle prossime domande.`);

        if (account.funding_source_details?.id) ok('Metodo di pagamento collegato.');
        else warn('Nessun metodo di pagamento collegato ancora: le campagne nascerebbero ma non consegnerebbero. Va aggiunto prima di --live.');
      } catch (e) {
        fail(`Account non raggiungibile: ${e.message}`);
        warn('Verifica che l\'ID sia giusto e che il token abbia un ruolo su quell\'account nel Business Manager SHEis.');
      }
    } else if (config.ad_account_id) {
      warn('Nessun token ancora: non posso verificare valuta/fuso adesso. Rilancia node attiva.mjs quando hai anche il token.');
    }

    // ── 3. Pagina Facebook ──────────────────────────────────────────────
    title('3. PAGINA FACEBOOK');
    config.resolve.PAGE_ID = await chiedi(rl, 'ID della Pagina Facebook SHEis.', { attuale: config.resolve.PAGE_ID });
    await salva(config);

    let igRilevato = null;
    if (config.access_token && config.resolve.PAGE_ID) {
      const api = makeApi(config);
      try {
        const page = await api.get(config.resolve.PAGE_ID, { fields: 'id,name,instagram_business_account,connected_instagram_account' });
        ok(`Pagina trovata: ${page.name} (${page.id})`);
        igRilevato = page.instagram_business_account?.id || page.connected_instagram_account?.id || null;
        if (igRilevato) ok(`Instagram business collegato: ${igRilevato}`);
        else warn('Nessun Instagram business collegato a questa Pagina: gli annunci non usciranno su Instagram finche\' non lo colleghi (Business Suite → Impostazioni → Account Instagram).');
      } catch (e) {
        fail(`Pagina non raggiungibile: ${e.message}`);
      }
    }

    // ── 4. Instagram actor id ───────────────────────────────────────────
    title('4. INSTAGRAM ACTOR ID');
    config.resolve.INSTAGRAM_ACTOR_ID = await chiedi(rl, 'ID Instagram business da usare negli annunci.', {
      attuale: config.resolve.INSTAGRAM_ACTOR_ID || igRilevato,
    });
    if (igRilevato && config.resolve.INSTAGRAM_ACTOR_ID && config.resolve.INSTAGRAM_ACTOR_ID !== igRilevato) {
      warn(`Diverso da quello rilevato sulla Pagina (${igRilevato}). Non e' un errore per forza, ma verifica quale sia quello giusto.`);
    }
    await salva(config);

    // ── 5. Privacy policy ────────────────────────────────────────────────
    title('5. PRIVACY POLICY');
    config.resolve.PRIVACY_URL = await chiedi(rl, 'URL della privacy policy (obbligatoria su ogni modulo lead).', {
      attuale: config.resolve.PRIVACY_URL || 'https://www.sheishair.com/privacy-policy/',
    });
    await salva(config);
    if (config.resolve.PRIVACY_URL) {
      try {
        const r = await fetch(config.resolve.PRIVACY_URL, { method: 'GET', redirect: 'follow' });
        if (r.ok) ok(`URL raggiungibile (${r.status}).`);
        else warn(`URL risponde ${r.status}: verificalo a mano prima di creare i moduli lead.`);
      } catch (e) {
        warn(`URL non raggiungibile da qui (${e.message}): verificalo a mano.`);
      }
    }

    // ── 6. Moduli lead ───────────────────────────────────────────────────
    title('6. MODULI LEAD');
    console.log('  Vanno creati a mano in Business Suite → Moduli per l\'acquisizione contatti,');
    console.log('  seguendo lead_form_spec dentro ogni blueprint. Incolla qui gli ID ottenuti.\n');

    for (const [key, label] of [
      ['LEAD_FORM_ID:ES', 'Modulo lead ESTERO (blueprint A, spagnolo)'],
      ['LEAD_FORM_ID:IT', 'Modulo lead ITALIA (blueprint B, italiano)'],
    ]) {
      config.resolve[key] = await chiedi(rl, `${label}.`, { attuale: config.resolve[key] });
      await salva(config);
      if (config.access_token && config.resolve[key]) {
        const api = makeApi(config);
        try {
          const form = await api.get(config.resolve[key], { fields: 'id,name,status' });
          ok(`Modulo trovato: ${form.name} (${form.status})`);
        } catch (e) {
          fail(`Modulo non raggiungibile: ${e.message}`);
        }
      }
    }

    config.resolve.LEAD_FORM_LINK = await chiedi(rl, 'Link di fallback dei moduli (di norma la home del sito).', {
      attuale: config.resolve.LEAD_FORM_LINK || 'https://www.sheishair.com/',
    });
    await salva(config);

    // ── 6b. Consegna lead — verifica ESEGUITA, non dichiarata ────────────
    title('6b. CONSEGNA LEAD — il modulo esiste, ma i lead dentro si leggono davvero?');
    console.log('  Un modulo che esiste non basta: leads_retrieval e\' un permesso granulare');
    console.log('  che puo\' mancare anche con token che sembrano completi. Si verifica ORA,');
    console.log('  eseguendo una lettura vera, non guardando solo gli scope dichiarati.\n');
    if (config.access_token) {
      try {
        const consegna = await verificaConsegnaLead(config, blueprints);
        if (!consegna.rilevante) {
          info('Nessun blueprint in gioco usa ancora un modulo nativo ON_AD: controllo non applicabile per ora.');
        } else if (consegna.leadsRetrievalOk === true) {
          ok(`Consegna lead verificata (${consegna.metodo}): i lead sono leggibili con questo token.`);
        } else {
          fail(`Consegna lead NON verificata per ${consegna.blueprintCoinvolti?.join(', ') || 'i blueprint ON_AD'}: ${consegna.dettaglio || consegna.motivo || 'lead non leggibili'}.`);
          console.log(`\n  ${C.bold}Due vie, entrambe pronte in questo repo:${C.reset}`);
          console.log('  (a) Chiedi leads_retrieval sul token — richiede revisione app Meta (giorni, non minuti).');
          console.log('  (b) Usa le varianti *-web (destination_type WEBSITE, blueprints/*-web.json): non dipendono');
          console.log('      da questo permesso. Compila anche i due LANDING_URL qui sotto, cosi\' sono pronte.');
        }
      } catch (e) {
        warn(`Controllo di consegna lead non eseguibile ora: ${e.message}.`);
      }
    } else {
      info('Nessun token ancora: il controllo di consegna lead si rifara\' automaticamente all\'ultimo passo di questo wizard.');
    }

    title('6c. LANDING PAGE — solo se usi le varianti *-web (facoltativo)');
    console.log(`  ${C.dim}Serve SOLO per lanciare A-estero-spagna-web / B-italia-distributori-web.${C.reset}`);
    console.log(`  ${C.dim}Deve essere il dominio VERO e pubblicato di ~/alkemia-sheis-web — oggi e' solo${C.reset}`);
    console.log(`  ${C.dim}un'anteprima Vercel (noindex): non spendere su un dominio non confermato.${C.reset}\n`);
    config.resolve['LANDING_URL:distributori-es'] = await chiedi(rl, 'URL pagina distributori in spagnolo (es. https://dominio/es/distributori).', {
      attuale: config.resolve['LANDING_URL:distributori-es'],
    });
    config.resolve['LANDING_URL:distributori-it'] = await chiedi(rl, 'URL pagina distributori in italiano (es. https://dominio/it/distributori).', {
      attuale: config.resolve['LANDING_URL:distributori-it'],
    });
    await salva(config);

    // ── 7. Immagini ──────────────────────────────────────────────────────
    title('7. VISUAL — hash delle immagini caricate');
    console.log('  Carica ogni visual con: curl -F "filename=@file.jpg" -F "access_token=$TOKEN" \\');
    console.log(`  "https://graph.facebook.com/${config.api_version || 'v21.0'}/${config.ad_account_id || 'act_XXX'}/adimages" — la risposta contiene l'hash.\n`);

    const refImmagini = ['A1', 'A2', 'A3', 'B1', 'B2', 'B3', 'C1', 'C2'];
    for (const ref of refImmagini) {
      const key = `IMAGE_HASH:${ref}`;
      config.resolve[key] = await chiedi(rl, `Hash immagine ${ref}.`, { attuale: config.resolve[key] });
    }
    await salva(config);

    if (config.access_token && config.ad_account_id) {
      const daVerificare = refImmagini.filter((r) => config.resolve[`IMAGE_HASH:${r}`]);
      if (daVerificare.length) {
        const api = makeApi(config);
        try {
          const hashes = daVerificare.map((r) => config.resolve[`IMAGE_HASH:${r}`]);
          const risposta = await api.get(`${config.ad_account_id}/adimages`, { hashes: JSON.stringify(hashes) });
          const trovati = new Set(Object.keys(risposta.data || risposta.images || {}));
          for (const r of daVerificare) {
            const h = config.resolve[`IMAGE_HASH:${r}`];
            if (trovati.has(h)) ok(`${r}: hash trovato sull'account.`);
            else warn(`${r}: hash non confermato sull'account (o formato di risposta diverso da quello atteso) — verifica a mano prima di --live.`);
          }
        } catch (e) {
          warn(`Verifica hash immagini non riuscita: ${e.message}. Non blocca: verificale a mano prima di --live.`);
        }
      }
    }

    // ── 8. Interessi (ricerca guidata, non incolla-e-spera) ─────────────
    title('8. INTERESSI DI TARGETING — ricerca guidata');
    console.log('  Per ognuno lancio una ricerca live su Meta col nome, cosi\' scegli l\'ID');
    console.log('  vero dai risultati invece di incollarne uno a occhio: "un ID sbagliato non');
    console.log('  da\' errore, spende sul pubblico sbagliato, in silenzio" (README).\n');

    const interessi = [
      'Davines', 'Kevin Murphy', 'Alfaparf Milano', 'Kemon', 'Framesi',
      'Peluqueria', 'Distribucion mayorista', 'Parrucchiere',
      'Cosmetica professionale', 'Salone di bellezza', 'Colorazione capelli',
    ];
    for (const nome of interessi) {
      const key = `INTEREST_ID:${nome}`;
      if (config.access_token) {
        try {
          const api = makeApi(config);
          const risultati = await api.get('search', { type: 'adinterest', q: nome, limit: 5 });
          const candidati = risultati.data || [];
          if (candidati.length) {
            console.log(`\n  ${C.bold}${nome}${C.reset} — risultati live:`);
            candidati.forEach((c, i) => console.log(`    ${i + 1}. ${c.name}  ${C.dim}(id ${c.id}${c.audience_size_lower_bound ? `, audience ~${c.audience_size_lower_bound}-${c.audience_size_upper_bound}` : ''})${C.reset}`));
          } else {
            info(`Nessun risultato live per "${nome}": incolla l'ID se lo conosci gia\', o salta.`);
          }
        } catch {
          info(`Ricerca live non riuscita per "${nome}": incolla l'ID se lo conosci gia\', o salta.`);
        }
      }
      config.resolve[key] = await chiedi(rl, `ID interesse per "${nome}" (incolla l'ID dalla lista sopra, o dal Business Manager).`, { attuale: config.resolve[key] });
    }
    await salva(config);

    title('8b. BEHAVIOR / WORK POSITION — solo blueprint B/C');
    console.log(`  ${C.dim}Nessuna ricerca automatica affidabile per questi due: verificali a mano in${C.reset}`);
    console.log(`  ${C.dim}Business Suite → Audience, o Gestione Inserzioni → crea un set di annunci di prova.${C.reset}\n`);
    config.resolve['BEHAVIOR_ID:Facebook Page admins'] = await chiedi(rl, 'ID comportamento "Amministratori di pagine Facebook" (blueprint B).', {
      attuale: config.resolve['BEHAVIOR_ID:Facebook Page admins'],
    });
    config.resolve['WORK_POSITION_ID:Parrucchiere'] = await chiedi(rl, 'ID posizione lavorativa "Parrucchiere" (blueprint C, opzionale — bassa copertura in Italia).', {
      attuale: config.resolve['WORK_POSITION_ID:Parrucchiere'],
    });
    await salva(config);

    // ── 9. Zona pilota (blueprint C) ─────────────────────────────────────
    title('9. ZONA PILOTA — blueprint C (saloni)');
    console.log('  Da decidere con Mauro: il territorio di UN distributore identificato.\n');
    config.resolve.GEO_ZONA_PILOTA = await chiedi(rl, 'Nome della zona pilota.', { attuale: config.resolve.GEO_ZONA_PILOTA });
    config.resolve.GEO_LAT = await chiedi(rl, 'Latitudine del centro zona.', { attuale: config.resolve.GEO_LAT });
    config.resolve.GEO_LNG = await chiedi(rl, 'Longitudine del centro zona.', { attuale: config.resolve.GEO_LNG });
    if (config.resolve.GEO_LAT && (Number(config.resolve.GEO_LAT) < -90 || Number(config.resolve.GEO_LAT) > 90)) warn('Latitudine fuori range (-90/90): controlla il valore.');
    if (config.resolve.GEO_LNG && (Number(config.resolve.GEO_LNG) < -180 || Number(config.resolve.GEO_LNG) > 180)) warn('Longitudine fuori range (-180/180): controlla il valore.');
    await salva(config);

    // ── 10. Custom audience ATECO (opzionale, probabilmente sotto-dimensionata) ──
    title('10. CUSTOM AUDIENCE ATECO 46.45 (opzionale)');
    console.log(`  ${C.dim}Il blueprint B la segna gia' come probabilmente sotto-dimensionata (~900 aziende).${C.reset}`);
    console.log(`  ${C.dim}Salta se non l'hai ancora costruita: il blueprint funziona anche senza.${C.reset}\n`);
    config.resolve['CUSTOM_AUDIENCE_ID:ateco-4645'] = await chiedi(rl, 'ID custom audience ATECO 46.45.', {
      attuale: config.resolve['CUSTOM_AUDIENCE_ID:ateco-4645'],
    });
    await salva(config);

    // ── 11. Supabase (opzionale) ──────────────────────────────────────────
    title('11. STUDIO SHEIS — sheis_campagne (opzionale)');
    console.log(`  ${C.dim}Serve solo a campagna_da_brief.mjs/stato_accessi.mjs per scrivere nel database${C.reset}`);
    console.log(`  ${C.dim}invece che nel registro locale .campagne/registro.json. Se preferisci, esporta${C.reset}`);
    console.log(`  ${C.dim}SUPABASE_URL/SUPABASE_SECRET_KEY come variabili d'ambiente e salta qui.${C.reset}\n`);
    config.supabase.url = await chiedi(rl, 'Supabase URL.', { attuale: config.supabase.url });
    config.supabase.secret_key = await chiedi(rl, 'Supabase secret key.', { attuale: config.supabase.secret_key, maschera: true });
    config.supabase.project_ref = await chiedi(rl, 'Supabase project ref.', { attuale: config.supabase.project_ref });
    await salva(config);

    if (config.supabase.url && config.supabase.secret_key) {
      try {
        const r = await fetch(`${config.supabase.url}/rest/v1/sheis_campagne?select=id&limit=1`, {
          headers: { apikey: config.supabase.secret_key, Authorization: `Bearer ${config.supabase.secret_key}` },
        });
        if (r.ok) ok('Tabella sheis_campagne raggiungibile: campagna_da_brief.mjs scrivera\' li\'.');
        else warn(`Tabella sheis_campagne non raggiungibile (${r.status}): normale se la migrazione 0002_studio.sql non e\' ancora stata applicata. Resta il fallback locale.`);
      } catch (e) {
        warn(`Supabase non raggiungibile da qui (${e.message}). Resta il fallback locale.`);
      }
    } else {
      info('Nessuna credenziale Supabase: resta il registro locale .campagne/registro.json. Nessun altro cambiamento richiesto quando arriveranno.');
    }

    // ── 12. verdetto finale — un solo motore, quello condiviso ───────────
    title('VERDETTO FINALE');

    let preflightOk = false;
    if (config.access_token && config.ad_account_id) {
      try {
        await preflight(config, blueprints);
        preflightOk = true;
      } catch (e) {
        if (e instanceof BloccoPreflight) {
          console.log(`\n  ${C.bold}Perche' non si puo' ancora lanciare:${C.reset} ${e.message}`);
          console.log(`  ${C.bold}Come si risolve:${C.reset} ${e.comeSiRisolve}`);
        } else throw e;
      }
    } else {
      warn('Token o account mancanti: preflight completo saltato. Rilancia node attiva.mjs quando li avrai.');
    }

    title('COSA MANCA ANCORA (non verificabile da qui)');
    const nonVerificabili = OBBLIGATORIE.filter((v) => !v.verificabile_via_preflight);
    for (const v of nonVerificabili) console.log(`  - ${v.richiesta}`);

    title('PROSSIMO PASSO');
    if (preflightOk) {
      console.log(`  ${C.green}${C.bold}Preflight superato.${C.reset} Ora:`);
      console.log('    1. node prova-a-secco.mjs         — verifica strutturale dei 3 blueprint (senza toccare Meta)');
      console.log('    2. node launch.mjs                — dry-run completo (default, non crea nulla)');
      console.log('    3. node launch.mjs --live --only A-estero-spagna   — crea davvero, sempre in PAUSA');
    } else {
      console.log('  Risolvi i punti sopra, poi rilancia:');
      console.log('    node attiva.mjs        — per completare i dati mancanti');
      console.log('    node stato_accessi.mjs — per il verdetto "possiamo lanciare?" aggiornato');
    }
    console.log('');
  } finally {
    rl.close();
  }
}

main().catch((e) => {
  console.error(`\n  ${C.red}${C.bold}ERRORE NON GESTITO${C.reset}\n  ${e.stack || e.message}\n`);
  process.exit(1);
});
