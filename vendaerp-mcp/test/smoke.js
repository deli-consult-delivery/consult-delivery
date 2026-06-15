// smoke.js — validação sem Bridge, sem banco e sem transporte (molde admin-mcp).
//
// Prova que: (1) o registry tem as tools de leitura esperadas; (2) as tools de
// escrita são EXATAMENTE o par propor/confirmar da Fase 2 (nenhuma mutação direta
// — escrita só via padrão propor→confirmar); (3) cada tool tem contrato completo;
// (4) o McpServer registra todas (zod inputShapes válidos, API do SDK correta)
// com um erp/auditor stub.
//
// Roda offline: `npm run smoke`. Sai !=0 se qualquer asserção falhar.
'use strict';

const assert = require('node:assert');
const { readTools, writeTools, allTools } = require('../src/registry');
const { buildServer } = require('../src/server');

const EXPECTED_READ = [
  'erp_status',
  'erp_contratos',
  'erp_financeiro',
  'erp_estoque',
  'erp_fiscal',
  'erp_crm',
];

const EXPECTED_WRITE = [
  'erp_propor_oportunidade',
  'erp_confirmar',
];

let failures = 0;
function check(label, fn) {
  try {
    fn();
    process.stdout.write(`  ok  ${label}\n`);
  } catch (e) {
    failures++;
    process.stdout.write(`  FAIL ${label}: ${e.message}\n`);
  }
}

process.stdout.write('cd-vendaerp-mcp smoke test\n');

check('read tools = esperadas', () => {
  assert.deepStrictEqual(readTools.map((t) => t.name).sort(), [...EXPECTED_READ].sort());
});

check('Fase 2 = write tools = par propor/confirmar', () => {
  assert.deepStrictEqual(writeTools.map((t) => t.name), EXPECTED_WRITE);
});

check('readTools não têm mutação direta (escrita só via propor→confirmar)', () => {
  const proibidas = readTools
    .map((t) => t.name)
    .filter((n) => /criar|emitir|aprovar|executar|enviar|send|create|approve|delete|update|baixar/i.test(n));
  assert.deepStrictEqual(proibidas, [], `tools de leitura com nome de mutação: ${proibidas.join(', ')}`);
});

check('cada tool tem contrato completo', () => {
  for (const t of allTools) {
    assert.ok(typeof t.name === 'string' && t.name, 'name');
    assert.ok(typeof t.title === 'string' && t.title, `title de ${t.name}`);
    assert.ok(typeof t.description === 'string' && t.description, `description de ${t.name}`);
    assert.ok(t.inputShape && typeof t.inputShape === 'object', `inputShape de ${t.name}`);
    assert.ok(typeof t.handler === 'function', `handler de ${t.name}`);
  }
});

check('McpServer registra todas as tools (SDK API + zod válidos)', () => {
  const cfg = { bridgeUrl: 'http://127.0.0.1:3001', principal: 'ceo_agent' };
  const erp = new Proxy({}, { get: () => async () => ({}) }); // qualquer método → {}
  const auditor = { record: async () => {} };
  const server = buildServer({ cfg, erp, auditor });
  assert.ok(server, 'buildServer retornou um servidor');
});

if (failures > 0) {
  process.stdout.write(`\n${failures} falha(s).\n`);
  process.exit(1);
}
process.stdout.write('\nTodas as asserções passaram.\n');
