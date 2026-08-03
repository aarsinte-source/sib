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

// ── Negazione e accenti (difetti misurati il 2026-08-03) ────────────────────
// Un brief scritto da una persona dice anche cosa NON vuole. Il parser leggeva
// solo le parole, non la negazione: «voglio farmi conoscere, non raccogliere
// contatti» diventava una campagna di raccolta contatti — l'opposto esatto
// della richiesta, e con l'aria di aver capito benissimo.

test('la negazione ribalta il segnale, non lo conferma', () => {
  assert.equal(
    analizzaBrief('Voglio farmi conoscere, non raccogliere contatti. 15 euro al giorno.').objective,
    'OUTCOME_AWARENESS',
  );
  assert.equal(
    analizzaBrief('Voglio visibilità, senza raccogliere lead. 10 euro al giorno.').objective,
    'OUTCOME_AWARENESS',
  );
  assert.equal(
    analizzaBrief('Portami traffico al sito, niente lead. 12 euro al giorno.').objective,
    'OUTCOME_TRAFFIC',
  );
});

test('una negazione su un segnale non contamina quello dopo la virgola', () => {
  assert.equal(
    analizzaBrief('Non mi interessa la visibilità, voglio contatti. 30 euro al giorno.').objective,
    'OUTCOME_LEADS',
  );
});

test('le parole accentate vengono riconosciute (\\b non funziona dopo una vocale accentata)', () => {
  assert.equal(analizzaBrief('Voglio visibilità in Spagna.').objective, 'OUTCOME_AWARENESS');
  assert.equal(analizzaBrief('Voglio notorietà fra i saloni.').objective, 'OUTCOME_AWARENESS');
  // con la punteggiatura subito dopo l'accento: il caso che sfuggiva davvero
  assert.equal(analizzaBrief('Voglio visibilità, punto.').objective, 'OUTCOME_AWARENESS');
});
