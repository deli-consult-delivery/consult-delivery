// smoke.js — validação sem banco e sem transporte.
//
// Prova que: (1) o registry tem as tools esperadas; (2) cada tool tem contrato
// completo; (3) o McpServer registra todas (zod inputShapes válidos, API do SDK
// correta) sem conectar stdio nem tocar o banco; (4) NÃO existe nenhuma tool de
// aprovação/execução direta (enforcement estrutural §3.2).
//
// Roda offline: `npm run smoke`. Sai com código !=0 se qualquer asserção falhar.
'use strict';

const assert = require('node:assert');
const { readTools, writeTools, allTools } = require('../src/registry');
const { buildServer } = require('../src/server');

const EXPECTED_READ = [
  'cd_status',
  'cd_lojas',
  'cd_agent_runs',
  'cd_drafts_pendentes',
  'cd_inadimplencia',
  'cd_audit',
];
const EXPECTED_WRITE = ['cd_propor_draft'];

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

process.stdout.write('cd-admin-mcp smoke test\n');

check('read tools = esperadas', () => {
  assert.deepStrictEqual(readTools.map((t) => t.name).sort(), [...EXPECTED_READ].sort());
});

check('write tools = só cd_propor_draft', () => {
  assert.deepStrictEqual(writeTools.map((t) => t.name).sort(), [...EXPECTED_WRITE].sort());
});

check('nenhuma tool de aprovar/executar/enviar direto (enforcement §3.2)', () => {
  const proibidas = allTools
    .map((t) => t.name)
    .filter((n) => /aprovar|executar|enviar|send|approve|delete|update/i.test(n));
  assert.deepStrictEqual(proibidas, [], `tools proibidas presentes: ${proibidas.join(', ')}`);
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
  const cfg = { defaultLimit: 20, maxLimit: 100, principal: 'ceo_agent', bridgeUrl: 'http://127.0.0.1:3001' };
  const sb = {
    sbGet: async () => [],
    sbInsert: async () => ({ id: 'stub' }),
  };
  const auditor = { record: async () => {} };
  const server = buildServer({ cfg, sb, auditor });
  assert.ok(server, 'buildServer retornou um servidor');
});

if (failures > 0) {
  process.stdout.write(`\n${failures} falha(s).\n`);
  process.exit(1);
}
process.stdout.write('\nTodas as asserções passaram.\n');
