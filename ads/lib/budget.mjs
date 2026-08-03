/**
 * Budget e tetto di spesa — unica fonte per il calcolo mensile e per il
 * doppio controllo (giornaliero + totale) che protegge il tetto dichiarato
 * dal cliente.
 */
import { title, C } from './ui.mjs';

export const GIORNI_MESE = 30.4; // Meta fattura il mensile come daily * 30.4

/** Tabella del piano di spesa dei blueprint statici (usata da launch.mjs). */
export function stampaPianoSpesa(voci, capMensile) {
  title('PIANO DI SPESA');

  const w = { id: 26, gg: 12, mese: 14, fase: 24 };
  console.log(
    `  ${C.bold}${'Campagna'.padEnd(w.id)}${'EUR/giorno'.padStart(w.gg)}${'EUR/mese'.padStart(w.mese)}   ${'Apprendimento'.padEnd(w.fase)}${C.reset}`
  );
  console.log(`  ${C.dim}${'─'.repeat(w.id + w.gg + w.mese + w.fase + 3)}${C.reset}`);

  let totGiorno = 0, totMese = 0;
  for (const v of voci) {
    totGiorno += v.giornaliero;
    totMese += v.mensile;
    const fase = v.blueprint.budget?.learning_phase_status || '—';
    const colore = fase === 'OK' ? C.green : fase.startsWith('SOTTO') ? C.red : C.yellow;
    console.log(
      `  ${v.id.padEnd(w.id)}${v.giornaliero.toFixed(2).padStart(w.gg)}${v.mensile.toFixed(2).padStart(w.mese)}   ${colore}${fase.padEnd(w.fase)}${C.reset}`
    );
  }
  console.log(`  ${C.dim}${'─'.repeat(w.id + w.gg + w.mese + w.fase + 3)}${C.reset}`);
  console.log(`  ${C.bold}${'TOTALE'.padEnd(w.id)}${totGiorno.toFixed(2).padStart(w.gg)}${totMese.toFixed(2).padStart(w.mese)}${C.reset}`);
  console.log(`\n  ${C.dim}Mensile = giornaliero × ${GIORNI_MESE} (il calcolo che usa Meta).${C.reset}`);
  console.log(`  ${C.dim}Tetto mensile dichiarato dal cliente: ${capMensile.toFixed(2)} EUR${C.reset}`);

  const margine = capMensile - totMese;
  if (margine < 0) {
    console.log(`\n  ${C.red}${C.bold}FUORI BUDGET di ${Math.abs(margine).toFixed(2)} EUR/mese.${C.reset}`);
    return { sforato: true, totGiorno, totMese };
  }
  console.log(`  ${C.green}Entro il tetto. Margine residuo: ${margine.toFixed(2)} EUR/mese.${C.reset}`);
  return { sforato: false, totGiorno, totMese };
}

/**
 * Doppio controllo del tetto di spesa per UNA campagna generata da brief.
 *
 * ⚠️ Il freno deve essere contato sull'insieme che intende proteggere — non
 * su un sottoinsieme comodo. Su un altro cliente un "max 1" ha contato un
 * insieme sbagliato (includeva un numero che non doveva contare) e ha tenuto
 * spento un sistema per giorni senza che nessuno se ne accorgesse (vedi
 * memoria feedback_safety_cap_counted_on_wrong_set). Qui l'insieme che il
 * tetto protegge e' dichiarato esplicitamente: LA SPESA MENSILE COMPLESSIVA
 * di TUTTO l'ad account SHEis, non la sola campagna che si sta creando ora.
 *
 * Controllo 1 — giornaliero: nessuna campagna SINGOLA puo' da sola avere un
 * budget/giorno che, proiettato su un mese, supererebbe l'intero tetto
 * mensile dell'account. E' la rete di sicurezza contro un errore di
 * battitura (200 invece di 20).
 *
 * Controllo 2 — totale mensile dell'INSIEME GIUSTO: spesa gia' pianificata
 * sull'intero account (blueprint statici A/B/C una volta accesi, piu' le
 * altre campagne gia' registrate in stato non-bozza/non-bloccata/non-conclusa)
 * PIU' questa nuova campagna. Mai questa campagna valutata da sola.
 */
export function controllaBudget({ dailyEur, totalEur, capMensileEur, spesaEsistenteMensileEur }) {
  const problemi = [];
  const capGiornalieroPerSingolaCampagna = capMensileEur / GIORNI_MESE;

  if (dailyEur > capGiornalieroPerSingolaCampagna) {
    problemi.push(
      `Budget giornaliero di questa campagna (${dailyEur.toFixed(2)} EUR) supera da solo il tetto giornaliero ` +
      `equivalente dell'intero account (${capGiornalieroPerSingolaCampagna.toFixed(2)} EUR = ${capMensileEur}/${GIORNI_MESE}). ` +
      `Nessuna campagna singola puo' avvicinarsi da sola al tetto mensile.`
    );
  }

  const mensileComplessivo = spesaEsistenteMensileEur + totalEurAMese(totalEur, dailyEur);
  if (mensileComplessivo > capMensileEur) {
    problemi.push(
      `Spesa mensile complessiva stimata dell'account SHEis (${mensileComplessivo.toFixed(2)} EUR = ` +
      `${spesaEsistenteMensileEur.toFixed(2)} EUR gia' pianificati su altre campagne + ${totalEurAMese(totalEur, dailyEur).toFixed(2)} EUR di questa) ` +
      `supera il tetto di ${capMensileEur.toFixed(2)} EUR/mese dichiarato dal cliente. ` +
      `Insieme sommato: blueprint statici A/B/C + campagne registrate in stato pronta/attiva/in_pausa + questa campagna.`
    );
  }

  return {
    ok: problemi.length === 0,
    problemi,
    capGiornalieroPerSingolaCampagna,
    mensileComplessivo,
  };
}

/** Normalizza il costo di una campagna a un equivalente mensile, per confrontarla col tetto. */
function totalEurAMese(totalEur, dailyEur) {
  // Se la campagna dura piu' o meno di un mese, il confronto giusto col tetto
  // MENSILE e' comunque il ritmo giornaliero * i giorni di un mese: una
  // campagna di 2 settimane a 20 EUR/giorno "pesa" come 20*30.4 sul tetto
  // mensile se restasse accesa un mese, che e' l'ipotesi prudente da usare
  // quando si somma a spesa gia' pianificata di durata diversa.
  if (Number.isFinite(dailyEur) && dailyEur > 0) return dailyEur * GIORNI_MESE;
  return totalEur;
}
