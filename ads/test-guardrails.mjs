#!/usr/bin/env node
/**
 * Test di regressione del linter di brand — lib/guardrails.mjs.
 *
 * Zero dipendenze esterne (coerente col resto del kit): usa node:assert e
 * node:test, entrambi nativi da Node 18+. Copre due cose:
 *
 *   1. I casi che il linter perdeva prima dell'8 agosto 2026 (misurato):
 *      "carrito", "koszyka" (declinato), "carrinho", un claim numerico
 *      inventato — e il caso opposto: una frase brand-safe con una
 *      negazione ("non siamo un e-commerce") che NON deve essere bloccata.
 *   2. Che le tre creativita' statiche (A/B/C), gia' approvate, restino a
 *      ZERO violazioni: la fonte e' cambiata (ora legge la BRAND-IDENTITY),
 *      il verdetto su contenuti gia' in produzione non deve cambiare.
 *
 *   node test-guardrails.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { lintTesto, lintCopy, FONTE_TERMINI } from './lib/guardrails.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));

console.log(`Fonte termini vietati in uso per questa run: ${FONTE_TERMINI}\n`);

function bloccato(testo) {
  return lintTesto(testo).violazioni.length > 0;
}

// ── 1. i casi misurati che il linter perdeva ────────────────────────────────

test('blocca "carrito" (ES, carrello)', () => {
  const esito = lintTesto('Añade el producto a tu carrito ahora mismo.');
  assert.equal(esito.violazioni.length > 0, true, 'doveva bloccare "carrito"');
  assert.ok(esito.violazioni.some((v) => /carrito/i.test(v.trovato)));
});

test('blocca "koszyka" (PL, genitivo di koszyk — declinazione slava)', () => {
  const esito = lintTesto('Dodaj produkt do koszyka i zamów teraz.');
  assert.equal(esito.violazioni.length > 0, true, 'doveva bloccare "koszyka" per radice, non per parola esatta');
  assert.ok(esito.violazioni.some((v) => /koszyk/i.test(v.trovato)));
});

test('blocca "carrinho" (PT, carrello)', () => {
  const esito = lintTesto('Adicione ao carrinho e finalize a compra agora.');
  assert.equal(esito.violazioni.length > 0, true, 'doveva bloccare "carrinho"');
  assert.ok(esito.violazioni.some((v) => /carrinho/i.test(v.trovato)));
});

test('blocca un claim numerico non documentato', () => {
  const esito = lintTesto('Serviamo già 500 saloni in tutta Italia da 10 anni di esperienza.');
  assert.equal(esito.violazioni.length > 0, true, 'doveva bloccare un numero non nell\'elenco documentato');
  assert.ok(esito.violazioni.some((v) => v.categoria === 'numero_non_documentato'));
});

test('NON blocca la frase brand-safe con negazione ("non siamo un e-commerce")', () => {
  const esito = lintTesto('Non siamo in vendita online, né su Amazon né su un e-commerce nostro.');
  assert.equal(esito.violazioni.length, 0, `non doveva bloccare nulla, invece: ${JSON.stringify(esito.violazioni)}`);
  assert.ok(esito.esenzioni.length > 0, 'doveva registrare l\'esenzione per negazione, non ignorarla in silenzio');
  assert.ok(esito.esenzioni.some((e) => /e-?commerce/i.test(e.trovato)));
});

// Controllo di non regressione sulla eccezione: la negazione NON deve
// disinnescare prezzi o firewall, che restano assoluti.
test('la negazione NON esenta i prezzi', () => {
  assert.equal(bloccato('Non costa 49 euro, ne costa molto meno.'), true, 'i prezzi restano assoluti anche in negazione');
});

test('la negazione NON esenta il firewall M29', () => {
  assert.equal(bloccato('Non è collegato al Metodo 29, lo garantiamo.'), true, 'il firewall M29 resta assoluto anche in negazione');
});

// ── 2. termini gia' coperti prima, non devono regredire ─────────────────────

test('continua a bloccare i termini gia\' coperti (IT/EN/ES base)', () => {
  for (const frase of [
    'Visita il nostro shop online per l\'acquisto.',
    'Il prezzo di listino è di 49€.',
    'Add to cart and buy now.',
    'Metodo 29 è la nostra ispirazione.',
    'M29 ci guida ogni giorno.',
    'Compra ahora en nuestra tienda.',
  ]) {
    assert.equal(bloccato(frase), true, `doveva restare bloccata: "${frase}"`);
  }
});

test('variazioni per accordo italiano/spagnolo (o/i, a/e) restano coperte', () => {
  for (const frase of [
    'I nostri negozi sono ovunque.',       // negozio -> negozi
    'Guarda i prezzi speciali di oggi.',   // prezzo -> prezzi
    'Sconti fino al 50%.',                 // sconto -> sconti
    'Consulta i nostri listini aggiornati.', // listino -> listini
    'Offerte imperdibili questo mese.',    // offerta -> offerte
    'Saldi di fine stagione.',             // saldo -> saldi
    'Metti tutto nei carrelli.',           // carrello -> carrelli
  ]) {
    assert.equal(bloccato(frase), true, `doveva restare bloccata (variazione per accordo): "${frase}"`);
  }
});

test('non genera falsi positivi grossolani su parole innocue piu\' lunghe', () => {
  for (const frase of [
    'Metti tutto nella cartella giusta.',   // "cart" non deve prendere "cartella"
    'La consegna è compresa nel pacchetto.', // nessun termine vietato
    'Il salone dispone di ampi spazi.',
  ]) {
    assert.equal(bloccato(frase), false, `non doveva bloccare: "${frase}"`);
  }
});

// ── 3. le tre creativita' statiche approvate restano a zero violazioni ──────

test('i blueprint A/B/C approvati restano a ZERO violazioni dopo il cambio di fonte', async () => {
  const blueprintDir = join(ROOT, 'blueprints');
  const file = (await readdir(blueprintDir)).filter((f) => f.endsWith('.json')).sort();
  assert.ok(file.length >= 3, 'attesi almeno i 3 blueprint A/B/C');

  for (const f of file) {
    const bp = JSON.parse(await readFile(join(blueprintDir, f), 'utf8'));
    const violazioni = lintCopy(bp);
    assert.equal(
      violazioni.length, 0,
      `${f} non dovrebbe avere violazioni, trovate: ${JSON.stringify(violazioni, null, 2)}`
    );
  }
});
