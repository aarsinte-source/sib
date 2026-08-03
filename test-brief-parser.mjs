#!/usr/bin/env node
/**
 * Test del parser brief — lib/brief-parser.mjs.
 *
 * Nato da un blocco reale trovato con prova-a-secco.mjs: un brief che chiede
 * di "farmi conoscere ai parrucchieri" non veniva riconosciuto come obiettivo
 * di awareness (il parser copriva solo "far/fare conoscere", forma piana, non
 * quella riflessiva) — il punteggio del blueprint C scendeva sotto soglia per
 * una lacuna di regex, non per un contenuto davvero ambiguo.
 *
 *   node test-brief-parser.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analizzaBrief } from './lib/brief-parser.mjs';

test('riconosce "farmi conoscere" come OUTCOME_AWARENESS (forma riflessiva)', () => {
  const s = analizzaBrief('Voglio far conoscere il brand ai parrucchieri della zona. Farmi conoscere è la priorità.');
  assert.equal(s.objective, 'OUTCOME_AWARENESS');
});

test('riconosce "farmi conoscere" da solo, senza la forma piana nello stesso brief', () => {
  const s = analizzaBrief('Voglio farmi conoscere dai saloni della mia zona.');
  assert.equal(s.objective, 'OUTCOME_AWARENESS');
});

test('continua a riconoscere le forme gia\' coperte prima (non regredisce)', () => {
  assert.equal(analizzaBrief('Voglio far conoscere BABILON.').objective, 'OUTCOME_AWARENESS');
  assert.equal(analizzaBrief('Voglio fare conoscere BABILON.').objective, 'OUTCOME_AWARENESS');
  assert.equal(analizzaBrief('Cerco più awareness sul brand.').objective, 'OUTCOME_AWARENESS');
  assert.equal(analizzaBrief('Voglio richieste di contatto dai distributori.').objective, 'OUTCOME_LEADS');
  assert.equal(analizzaBrief('Voglio più traffico sul sito.').objective, 'OUTCOME_TRAFFIC');
});

test('non prende per awareness un obiettivo di lead esplicito', () => {
  // "richieste di contatto" ha priorità implicita (primo controllo nella catena)
  const s = analizzaBrief('Fatemi arrivare richieste di contatto dai distributori spagnoli.');
  assert.equal(s.objective, 'OUTCOME_LEADS');
});
