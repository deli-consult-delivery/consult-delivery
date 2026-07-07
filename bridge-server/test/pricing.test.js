// bridge-server/test/pricing.test.js — testes UNITÁRIOS de lib/pricing.js
// (puro, sem I/O). Espelha trigger/_shared/pricing.test.ts.
//
// Rodar:  node bridge-server/test/pricing.test.js
'use strict';

const assert = require('node:assert');
const { calcularCustoUsd } = require('../lib/pricing');

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

check('claude-haiku-4-5-20251001: $1/MTok in, $5/MTok out', () => {
  const custo = calcularCustoUsd('claude-haiku-4-5-20251001', {
    input_tokens: 1_000_000,
    output_tokens: 1_000_000,
  });
  assert.strictEqual(custo, 6);
});

check('claude-sonnet-4-6: $3/MTok in, $15/MTok out', () => {
  const custo = calcularCustoUsd('claude-sonnet-4-6', {
    input_tokens: 1_000_000,
    output_tokens: 1_000_000,
  });
  assert.strictEqual(custo, 18);
});

check('modelo desconhecido retorna null (nunca 0 fake)', () => {
  assert.strictEqual(calcularCustoUsd('modelo-inventado', { input_tokens: 100, output_tokens: 100 }), null);
});

check('usage ausente retorna null', () => {
  assert.strictEqual(calcularCustoUsd('claude-haiku-4-5-20251001', undefined), null);
});

if (failures > 0) {
  process.stdout.write(`\n${failures} falha(s) de ${passes + failures}.\n`);
  process.exit(1);
}
process.stdout.write(`\npricing: todas as ${passes} asserções passaram.\n`);
