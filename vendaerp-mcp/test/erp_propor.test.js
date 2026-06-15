// erp_propor.test.js — a tool de proposta grava pending e NÃO executa.
'use strict';

const assert = require('node:assert');
const tool = require('../src/tools/erp_propor_oportunidade');

let failures = 0;
function check(label, fn) {
  try { fn(); process.stdout.write(`  ok  ${label}\n`); }
  catch (e) { failures++; process.stdout.write(`  FAIL ${label}: ${e.message}\n`); }
}

// proposals falso que captura o create.
function fakeProposals() {
  return {
    created: null,
    async create(p) { this.created = p; return { proposal_id: 'p-1', resumo: p.resumo, expires_at: 'T+10' }; },
  };
}

(async () => {
  const proposals = fakeProposals();
  const erp = { post: async () => { throw new Error('PROPOR NÃO EXECUTA'); } };
  const res = await tool.handler({ titulo: 'Lead Padaria', cliente: 'Padaria X' }, { erp, proposals });

  check('devolve proposal_id', () => assert.strictEqual(res.data.proposal_id, 'p-1'));
  check('NÃO executa (não chama erp.post)', () => assert.ok(res.data.proposal_id));
  check('grava tipo oportunidade + endpoint /oportunidade', () => {
    assert.strictEqual(proposals.created.tipo, 'oportunidade');
    assert.strictEqual(proposals.created.endpoint, '/oportunidade');
  });
  check('resumo é legível e cita o título', () => assert.match(proposals.created.resumo, /Lead Padaria/));
  check('payload carrega os campos do args', () => assert.strictEqual(proposals.created.payload.titulo, 'Lead Padaria'));

  check('inputShape exige titulo', () => {
    const z = require('zod');
    const shape = z.object(tool.inputShape);
    assert.throws(() => shape.parse({}), /titulo/i);
  });

  if (failures > 0) { process.stdout.write(`\n${failures} falha(s).\n`); process.exit(1); }
  process.stdout.write('\nTodas as asserções passaram.\n');
})();
