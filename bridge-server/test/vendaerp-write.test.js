// vendaerp-write.test.js — a escrita do VendaERP NÃO pode retentar (POST não-idempotente).
// Substitui o global fetch por um stub que conta chamadas e sempre devolve 500.
'use strict';

const assert = require('node:assert');

// credencial fake p/ passar no getVendaErpConfig
process.env.VENDAERP_TOKEN = 'tok';
process.env.VENDAERP_USER = 'usr';
process.env.VENDAERP_APP = 'app';

const erp = require('../lib/vendaerp');

let failures = 0;
function check(label, fn) {
  try { fn(); process.stdout.write(`  ok  ${label}\n`); }
  catch (e) { failures++; process.stdout.write(`  FAIL ${label}: ${e.message}\n`); }
}

const realFetch = global.fetch;

(async () => {
  // 500 sempre — uma função read-only retentaria 3x; a de escrita deve falhar em 1.
  let calls = 0;
  global.fetch = async () => {
    calls++;
    return { ok: false, status: 500, statusText: 'Server Error', text: async () => '{"erro":"x"}' };
  };

  try {
    await erp.criarOportunidade({ titulo: 'X' });
    check('criarOportunidade deveria lançar em 500', () => assert.fail('não lançou'));
  } catch (e) {
    check('criarOportunidade lança VendaErpApiError', () => assert.strictEqual(e.name, 'VendaErpApiError'));
    check('criarOportunidade NÃO retenta (1 chamada só)', () => assert.strictEqual(calls, 1));
  }

  global.fetch = realFetch;
  if (failures > 0) { process.stdout.write(`\n${failures} falha(s).\n`); process.exit(1); }
  process.stdout.write('\nTodas as asserções passaram.\n');
})();
