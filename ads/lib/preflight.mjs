/**
 * Verifica preventiva degli accessi Meta — interroga davvero l'API, non
 * assume niente. Condivisa da launch.mjs (prima di creare) e da
 * stato_accessi.mjs (per rispondere "possiamo lanciare?" senza creare nulla).
 */
import { title, ok, warn, fail, info, C } from './ui.mjs';
import { makeApi, STATI_ACCOUNT, normalizzaAdAccountId, verificaValutaEFuso } from './meta-api.mjs';
import { trovaPlaceholder } from './placeholders.mjs';
import { verificaConsegnaLead } from './leads-check.mjs';

export class BloccoPreflight extends Error {
  constructor(messaggio, comeSiRisolve) {
    super(messaggio);
    this.comeSiRisolve = comeSiRisolve;
  }
}

/**
 * @param {object} config - config.local.json gia' parsato.
 * @param {object[]} blueprints - blueprint da cui derivare i moduli lead richiesti.
 * @param {{silenzioso?: boolean}} opts - silenzioso: non stampa, ritorna solo i risultati.
 */
export async function preflight(config, blueprints, opts = {}) {
  const stampa = !opts.silenzioso;
  if (stampa) title('PREFLIGHT — verifica accessi');
  const api = makeApi(config);
  const problemi = [];
  const passi = []; // registro strutturato di ogni check, per chi non vuole solo il testo colorato
  const raccolta = { pixel: null, ig: null, forms: [] };

  const segna = (esito, messaggio, extra = {}) => {
    passi.push({ esito, messaggio, ...extra });
    if (!stampa) return;
    if (esito === 'ok') ok(messaggio);
    else if (esito === 'warn') warn(messaggio);
    else if (esito === 'fail') fail(messaggio);
    else info(messaggio);
  };

  // 1 — token vivo
  let me;
  try {
    me = await api.get('me', { fields: 'id,name' });
    segna('ok', `Token valido — utente: ${me.name} (${me.id})`);
  } catch (e) {
    throw new BloccoPreflight(
      `Token non valido: ${e.message}`,
      'Rigenera un token con permessi ads_management, pages_show_list, leads_retrieval, business_management ' +
      'da developers.facebook.com → Esplora API Graph, e riscrivilo in config.local.json.'
    );
  }

  // 2 — permessi
  try {
    const dbg = await api.get('debug_token', { input_token: config.access_token });
    const d = dbg.data || {};
    const scopes = d.scopes || [];
    const richiesti = ['ads_management', 'pages_show_list', 'leads_retrieval'];
    const mancanti = richiesti.filter((s) => !scopes.includes(s));

    if (mancanti.length) {
      problemi.push(`Permessi mancanti sul token: ${mancanti.join(', ')}`);
      segna('fail', `Permessi mancanti: ${mancanti.join(', ')}`);
      if (mancanti.includes('leads_retrieval') && stampa) {
        info('Senza leads_retrieval i lead dei moduli istantanei NON sono leggibili via API.');
        info('E\' un muro gia\' incontrato su un altro cliente: il token di Pagina non eredita questo permesso, va concesso esplicitamente.');
      }
    } else {
      segna('ok', `Permessi presenti: ${richiesti.join(', ')}`);
    }

    if (d.expires_at && d.expires_at !== 0) {
      const quando = new Date(d.expires_at * 1000);
      const giorni = Math.round((quando - Date.now()) / 86400000);
      if (giorni < 14) segna('warn', `Il token scade tra ${giorni} giorni (${quando.toLocaleDateString('it-IT')}). Chiedi un token da Utente di Sistema, che non scade.`);
      else segna('info', `Token in scadenza il ${quando.toLocaleDateString('it-IT')} (${giorni} giorni).`);
    } else {
      segna('ok', 'Token senza scadenza (Utente di Sistema).');
    }
  } catch {
    segna('warn', 'debug_token non interrogabile: i permessi non sono verificabili in anticipo. Si prosegue, ma un errore in creazione e\' possibile.');
  }

  // 3 — ad account
  const actId = normalizzaAdAccountId(config.ad_account_id);
  let account;
  try {
    account = await api.get(actId, {
      fields: 'name,account_status,disable_reason,currency,timezone_name,funding_source_details,spend_cap,amount_spent',
    });
  } catch (e) {
    throw new BloccoPreflight(
      `Ad account ${actId} non raggiungibile: ${e.message}`,
      'Verifica che l\'ID sia giusto e che l\'utente del token abbia un ruolo su quell\'account nel Business Manager di SHEis.'
    );
  }

  const stato = STATI_ACCOUNT[account.account_status] || `sconosciuto (${account.account_status})`;
  if (account.account_status === 1) {
    segna('ok', `Ad account: ${account.name || actId} — ${stato}`);
  } else {
    problemi.push(`Ad account in stato ${stato}, non ACTIVE`);
    segna('fail', `Ad account in stato ${stato}. Nessuna campagna puo' partire.`);
    if (account.disable_reason && stampa) info(`Motivo dichiarato da Meta: ${account.disable_reason}`);
  }

  // 4 — valuta e fuso: si scelgono UNA VOLTA SOLA alla creazione dell'account
  // e non si possono piu' cambiare — se sono sbagliati, l'account va buttato
  // e rifatto. Per questo qui sono entrambi BLOCCANTI, non solo informativi.
  // Stessa funzione usata da attiva.mjs: un solo posto per questo gate.
  const valutaEFuso = verificaValutaEFuso(account);
  if (!valutaEFuso.ok) {
    for (const p of valutaEFuso.problemi) problemi.push(`Account: ${p}`);
    segna('fail', `Account non idoneo, in modo non correggibile in seguito: ${valutaEFuso.problemi.join(' e ')}.`);
    if (stampa) info('Valuta e fuso si scelgono alla creazione e non si cambiano piu\': l\'unica strada e\' buttare l\'account e riaprirne uno nuovo in EUR e Europe/Rome.');
  } else {
    segna('ok', 'Valuta EUR e fuso Europe/Rome — corretti, non si torna piu\' su questo punto.');
  }

  // 5 — metodo di pagamento
  if (account.funding_source_details?.id) {
    segna('ok', `Metodo di pagamento collegato (${account.funding_source_details.type || 'tipo non dichiarato'}).`);
  } else {
    problemi.push('Nessun metodo di pagamento sull\'ad account');
    segna('fail', 'Nessun metodo di pagamento collegato: le campagne verrebbero create ma non consegnerebbero.');
  }

  // 6 — pagina Facebook
  const pageId = config.resolve?.PAGE_ID;
  if (!pageId) {
    problemi.push('PAGE_ID non presente in config.resolve');
    segna('fail', 'PAGE_ID mancante in config.local.json → resolve.PAGE_ID');
  } else {
    try {
      const page = await api.get(pageId, { fields: 'id,name,category,instagram_business_account,connected_instagram_account' });
      segna('ok', `Pagina Facebook: ${page.name} (${page.id})`);

      const ig = page.instagram_business_account || page.connected_instagram_account;
      if (ig?.id) {
        raccolta.ig = ig.id;
        segna('ok', `Account Instagram business collegato: ${ig.id}`);
        const igConfig = config.resolve?.INSTAGRAM_ACTOR_ID;
        if (igConfig && igConfig !== ig.id) {
          segna('warn', `INSTAGRAM_ACTOR_ID in config (${igConfig}) diverso da quello collegato alla Pagina (${ig.id}). Verifica quale sia quello giusto.`);
        }
      } else {
        problemi.push('Nessun account Instagram business collegato alla Pagina');
        segna('fail', 'Nessun Instagram business collegato alla Pagina: gli annunci non usciranno su Instagram.');
        if (stampa) info('Si risolve in Meta Business Suite → Impostazioni → Account Instagram.');
      }

      // La Pagina e' utilizzabile da questo ad account?
      try {
        const promuovibili = await api.get(`${actId}/promote_pages`, { fields: 'id,name', limit: 200 });
        const trovata = (promuovibili.data || []).some((p) => String(p.id) === String(pageId));
        if (trovata) segna('ok', 'La Pagina risulta associata a questo ad account.');
        else segna('warn', 'La Pagina non compare tra quelle promuovibili da questo ad account. Spesso funziona lo stesso, ma se la creazione fallisce, la causa e\' questa.');
      } catch {
        segna('info', 'Associazione Pagina/account non verificabile con questo token: si prosegue.');
      }
    } catch (e) {
      problemi.push(`Pagina ${pageId} non raggiungibile`);
      segna('fail', `Pagina non raggiungibile: ${e.message}`);
    }
  }

  // 7 — pixel (non bloccante: le campagne di questo kit non ne dipendono)
  try {
    const pixels = await api.get(`${actId}/adspixels`, { fields: 'id,name,last_fired_time' });
    if (pixels.data?.length) {
      raccolta.pixel = pixels.data[0].id;
      const ultimo = pixels.data[0].last_fired_time;
      segna('ok', `Pixel presente: ${pixels.data[0].name} (${pixels.data[0].id})`);
      if (ultimo && stampa) info(`Ultimo evento ricevuto: ${new Date(ultimo).toLocaleString('it-IT')}`);
      else if (!ultimo) segna('warn', 'Il pixel non ha mai ricevuto eventi: e\' installato ma non funzionante, oppure non e\' sul sito.');
    } else {
      segna('warn', 'Nessun pixel sull\'account. Non blocca questo kit (A e B usano moduli istantanei, C non ha destinazione), ma serve per qualunque campagna futura verso il sito.');
    }
  } catch {
    segna('info', 'Pixel non verificabili con questo token.');
  }

  // 8 — moduli lead referenziati dai blueprint
  const formRichiesti = new Set();
  for (const bp of blueprints) {
    for (const [key] of trovaPlaceholder(bp)) {
      if (key.startsWith('LEAD_FORM_ID')) {
        const risolto = config.resolve?.[key];
        if (risolto) formRichiesti.add(risolto);
      }
    }
  }
  if (formRichiesti.size && pageId) {
    try {
      const forms = await api.get(`${pageId}/leadgen_forms`, { fields: 'id,name,status', limit: 200 });
      const esistenti = new Set((forms.data || []).map((f) => String(f.id)));
      for (const f of formRichiesti) {
        if (esistenti.has(String(f))) { segna('ok', `Modulo lead ${f} trovato sulla Pagina.`); raccolta.forms.push(f); }
        else { problemi.push(`Modulo lead ${f} inesistente`); segna('fail', `Modulo lead ${f} non trovato sulla Pagina: gli annunci di quella campagna fallirebbero.`); }
      }
    } catch {
      segna('warn', 'Moduli lead non elencabili (serve leads_retrieval o pages_manage_ads). Verificali a mano prima del --live.');
    }
  } else if (formRichiesti.size === 0 && stampa) {
    info('Nessun modulo lead ancora risolto in config: normale finche\' non li hai creati.');
  }

  // 9 — consegna lead: verifica ESEGUITA, non dichiarata. Che un modulo esista
  // (step 8) non dice se i lead dentro sono leggibili: leads_retrieval è un
  // permesso granulare che debug_token non riflette in modo affidabile, e un
  // modulo può esistere ed essere comunque irraggiungibile (misurato il
  // 2026-08-03 su tre pagine reali). Rilevante SOLO per blueprint OUTCOME_LEADS
  // con destinazione ON_AD (modulo nativo): una campagna WEBSITE o AWARENESS
  // non dipende da questo permesso e non viene toccata da questo controllo.
  try {
    const consegna = await verificaConsegnaLead(config, blueprints);
    if (!consegna.rilevante) {
      segna('info', `Consegna lead: ${consegna.motivo}`);
    } else if (consegna.leadsRetrievalOk === true) {
      segna('ok', `Consegna lead: verificata DAVVERO (${consegna.metodo}) — i lead sono leggibili con questo token.`);
    } else if (consegna.leadsRetrievalOk === false) {
      const blueprintCoinvolti = consegna.blueprintCoinvolti.join(', ');
      problemi.push(`Lead non leggibili (leads_retrieval) per: ${blueprintCoinvolti}`);
      segna('fail', `Consegna lead per ${blueprintCoinvolti}: NON verificata. ${consegna.dettaglio || ''} (${consegna.metodo || 'verifica diretta sui moduli SHEis'})`);
      if (stampa) {
        info('Un lancio che raccoglie lead irraggiungibili e\' peggio di un lancio non fatto: spende e non consegna, e nessuno se ne accorge da solo.');
        info('Due vie: (a) chiedere leads_retrieval sul token — richiede revisione app Meta, vedi PRONTI-AL-LANCIO.md; (b) usare la variante *-web dei blueprint (destination_type WEBSITE), che non dipende da questo permesso.');
      }
    } else {
      // non verificabile (nessun modulo trovato entro i limiti di ricerca): non si può escludere il problema, quindi si blocca per prudenza
      problemi.push(`Consegna lead non verificabile per: ${consegna.blueprintCoinvolti.join(', ')}`);
      segna('fail', `Consegna lead per ${consegna.blueprintCoinvolti.join(', ')}: non verificabile (${consegna.motivo}). Non si lancia su un'ipotesi.`);
    }
  } catch (e) {
    segna('warn', `Controllo di consegna lead non eseguibile: ${e.message}. Verificalo a mano prima di --live su un blueprint OUTCOME_LEADS/ON_AD.`);
  }

  if (problemi.length) {
    throw new BloccoPreflight(
      `${problemi.length} ${problemi.length === 1 ? 'problema bloccante' : 'problemi bloccanti'}:\n     - ${problemi.join('\n     - ')}`,
      'Risolvi i punti qui sopra e rilancia. Finche\' sono aperti, --live resta disabilitato.'
    );
  }

  if (stampa) console.log(`\n  ${C.green}${C.bold}Preflight superato.${C.reset}`);
  return { ...raccolta, passi };
}
