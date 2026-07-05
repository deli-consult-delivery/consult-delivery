// bridge-server/test/ifood-dupla-checagem.test.js — testes UNITÁRIOS de
// lib/ifood-dupla-checagem.js (puro, sem I/O).
//
// Rodar:  node bridge-server/test/ifood-dupla-checagem.test.js
'use strict';

const assert = require('node:assert');
const { compararReviews } = require('../lib/ifood-dupla-checagem');

let failures = 0;
let passes = 0;

function check(label, fn) {
  try {
    fn();
    passes++;
    process.stdout.write(`  ok  ${label}\n`);
  } catch (e) {
    failures++;
    process.stdout.write(`  FAIL ${label}: ${e.message}\n`);
  }
}

check('review igual em ambos lados → nem faltante nem excedente', () => {
  const api = [{ id: 'r1', score: 5, comment: 'Muito bom!', customer: { name: 'Ana' } }];
  const browser = [{ id: 'a1', nota: 5, comentario: 'Muito bom!', nome_cliente: 'Ana' }];
  const diff = compararReviews(api, browser);
  assert.strictEqual(diff.faltantes.length, 0);
  assert.strictEqual(diff.excedentes.length, 0);
  assert.strictEqual(diff.divergencias.length, 0);
  assert.strictEqual(diff.totalApi, 1);
  assert.strictEqual(diff.totalBrowser, 1);
});

check('review só na API → faltante', () => {
  const api = [{ id: 'r1', score: 4, comment: 'Chegou rápido', customer: { name: 'Bia' } }];
  const diff = compararReviews(api, []);
  assert.strictEqual(diff.faltantes.length, 1);
  assert.strictEqual(diff.faltantes[0].comentario, 'Chegou rápido');
  assert.strictEqual(diff.excedentes.length, 0);
});

check('review só em avaliacoes → excedente', () => {
  const browser = [{ id: 'a1', nota: 3, comentario: 'Demorou', nome_cliente: 'Caio' }];
  const diff = compararReviews([], browser);
  assert.strictEqual(diff.excedentes.length, 1);
  assert.strictEqual(diff.excedentes[0].comentario, 'Demorou');
  assert.strictEqual(diff.faltantes.length, 0);
});

check('mesma nota+cliente mas texto diferente → divergência (não conta como falt./exced.)', () => {
  const api = [{ id: 'r1', score: 2, comment: 'Comida fria', customer: { name: 'Duda' } }];
  const browser = [{ id: 'a1', nota: 2, comentario: 'Comida chegou fria e atrasada', nome_cliente: 'Duda' }];
  const diff = compararReviews(api, browser);
  assert.strictEqual(diff.divergencias.length, 1);
  assert.strictEqual(diff.divergencias[0].api.comentario, 'Comida fria');
  assert.strictEqual(diff.divergencias[0].browser.comentario, 'Comida chegou fria e atrasada');
  assert.strictEqual(diff.faltantes.length, 0);
  assert.strictEqual(diff.excedentes.length, 0);
});

check('normalização de espaço/caixa não gera falso positivo', () => {
  const api = [{ id: 'r1', score: 5, comment: '  Excelente  Atendimento ', customer: { name: 'Eva' } }];
  const browser = [{ id: 'a1', nota: 5, comentario: 'excelente atendimento', nome_cliente: 'Eva' }];
  const diff = compararReviews(api, browser);
  assert.strictEqual(diff.faltantes.length, 0);
  assert.strictEqual(diff.excedentes.length, 0);
});

check('clientes diferentes com nota+texto genérico idênticos NÃO se cancelam (falso negativo)', () => {
  const api = [{ id: 'r1', score: 5, comment: 'Muito bom', customer: { name: 'Hugo' } }];
  const browser = [{ id: 'a1', nota: 5, comentario: 'Muito bom', nome_cliente: 'Ivo' }];
  const diff = compararReviews(api, browser);
  assert.strictEqual(diff.faltantes.length, 1, 'review do Hugo (API) deveria aparecer como faltante');
  assert.strictEqual(diff.excedentes.length, 1, 'review do Ivo (browser) deveria aparecer como excedente');
  assert.strictEqual(diff.divergencias.length, 0, 'nomes diferentes não formam par de divergência');
});

check('entradas não-array não crasham (defensivo)', () => {
  const diff = compararReviews(null, undefined);
  assert.strictEqual(diff.totalApi, 0);
  assert.strictEqual(diff.totalBrowser, 0);
  assert.strictEqual(diff.faltantes.length, 0);
  assert.strictEqual(diff.excedentes.length, 0);
});

if (failures > 0) {
  process.stdout.write(`\n${failures} falha(s) de ${passes + failures}.\n`);
  process.exit(1);
}
process.stdout.write(`\nifood-dupla-checagem: todas as ${passes} asserções passaram.\n`);
