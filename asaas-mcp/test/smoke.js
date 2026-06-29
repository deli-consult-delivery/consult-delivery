// smoke.js — validação offline (molde ifood-mcp). SÓ LEITURA, zero mutação.
'use strict';

const assert = require('node:assert');
const { readTools, writeTools, allTools } = require('../src/registry');
const { buildServer } = require('../src/server');

const EXPECTED_READ = ['asaas_saldo', 'asaas_situacao_mes'];

let failures = 0;
function check(label, fn) {
  try { fn(); process.stdout.write(`  ok  ${label}\n`); }
  catch (e) { failures++; process.stdout.write(`  FAIL ${label}: ${e.message}\n`); }
}

process.stdout.write('cd-asaas-mcp smoke test\n');

check('read tools = esperadas', () => {
  assert.deepStrictEqual(readTools.map((t) => t.name).sort(), [...EXPECTED_READ].sort());
});
check('ZERO write tools (cobrança = draft/aprovação, fora deste MCP)', () => {
  assert.deepStrictEqual(writeTools, []);
});
check('nenhuma tool com nome de mutação', () => {
  const proibidas = allTools.map((t) => t.name)
    .filter((n) => /criar|cobrar|emitir|aprovar|executar|enviar|send|create|charge|delete|update/i.test(n));
  assert.deepStrictEqual(proibidas, []);
});
check('cada tool tem contrato completo', () => {
  for (const t of allTools) {
    assert.ok(t.name && typeof t.name === 'string', 'name');
    assert.ok(t.title && typeof t.title === 'string', `title de ${t.name}`);
    assert.ok(t.description && typeof t.description === 'string', `description de ${t.name}`);
    assert.ok(t.inputShape && typeof t.inputShape === 'object', `inputShape de ${t.name}`);
    assert.ok(typeof t.handler === 'function', `handler de ${t.name}`);
  }
});
check('McpServer registra todas as tools (SDK API + zod válidos)', () => {
  const cfg = { bridgeUrl: 'http://127.0.0.1:3001', principal: 'ceo_agent', auditTenantId: 't' };
  const asaas = new Proxy({}, { get: () => async () => ({}) });
  const auditor = { record: async () => {} };
  const server = buildServer({ cfg, asaas, auditor });
  assert.ok(server, 'buildServer retornou um servidor');
});

if (failures > 0) { process.stdout.write(`\n${failures} falha(s).\n`); process.exit(1); }
process.stdout.write('\nTodas as asserções passaram.\n');
