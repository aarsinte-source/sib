#!/usr/bin/env node
/**
 * Test del gate valuta/fuso — lib/meta-api.mjs → verificaValutaEFuso().
 *
 * E' il controllo che intercetta i due errori "una tantum" (valuta ≠ EUR,
 * fuso ≠ Europe/Rome) sia in lib/preflight.mjs sia in attiva.mjs. Estratto in
 * una funzione pura proprio per poterlo testare senza un token Meta reale:
 * un oggetto account finto basta.
 *
 *   node test-meta-api.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verificaValutaEFuso, normalizzaAdAccountId } from './lib/meta-api.mjs';

test('account corretto (EUR + Europe/Rome) passa', () => {
  const esito = verificaValutaEFuso({ currency: 'EUR', timezone_name: 'Europe/Rome' });
  assert.equal(esito.ok, true);
  assert.deepEqual(esito.problemi, []);
});

test('valuta sbagliata blocca', () => {
  const esito = verificaValutaEFuso({ currency: 'USD', timezone_name: 'Europe/Rome' });
  assert.equal(esito.ok, false);
  assert.equal(esito.problemi.length, 1);
  assert.match(esito.problemi[0], /USD/);
});

test('fuso sbagliato blocca', () => {
  const esito = verificaValutaEFuso({ currency: 'EUR', timezone_name: 'America/New_York' });
  assert.equal(esito.ok, false);
  assert.equal(esito.problemi.length, 1);
  assert.match(esito.problemi[0], /America\/New_York/);
});

test('entrambi sbagliati: due problemi distinti, non uno solo', () => {
  const esito = verificaValutaEFuso({ currency: 'USD', timezone_name: 'America/New_York' });
  assert.equal(esito.ok, false);
  assert.equal(esito.problemi.length, 2);
});

test('campi assenti (account non ancora completo) blocca comunque, senza lanciare eccezioni', () => {
  const esito = verificaValutaEFuso({});
  assert.equal(esito.ok, false);
  assert.equal(esito.problemi.length, 2);
});

test('normalizzaAdAccountId aggiunge il prefisso solo se manca', () => {
  assert.equal(normalizzaAdAccountId('123456'), 'act_123456');
  assert.equal(normalizzaAdAccountId('act_123456'), 'act_123456');
});
