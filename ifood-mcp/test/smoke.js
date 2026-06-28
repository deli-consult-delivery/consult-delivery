// smoke.js — validação sem Bridge, sem banco e sem transporte (molde vendaerp-mcp).
// Prova: (1) read tools = esperadas; (2) ZERO write tools (escrita iFood é fora deste MCP);
// (3) nenhuma tool com nome de mutação; (4) contrato completo; (5) McpServer registra todas.
'use strict';

const assert = require('node:assert');
const { readTools, writeTools, allTools } = require('../src/registry');
const { buildServer } = require('../src/server');

const EXPECTED_READ = ['ifood_status', 'ifood_catalogo', 'ifood_cardapio', 'ifood_reviews', 'ifood_vendas'];

let failures = 0;
function check(label, fn) {
  try { fn(); process.stdout.write(`  ok  ${label}\n`); }
  catch (e) { failures++; process.stdout.write(`  FAIL ${label}: ${e.message}\n`); }
}

process.stdout.write('cd-ifood-mcp smoke test\n');

check('read tools = esperadas', () => {
  assert.deepStrictEqual(readTools.map((t) => t.name).sort(), [...EXPECTED_READ].sort());
});

check('ZERO write tools (escrita iFood é fora deste MCP)', () => {
  assert.deepStrictEqual(writeTools, []);
});

check('nenhuma tool com nome de mutação', () => {
  const proibidas = allTools.map((t) => t.name)
    .filter((n) => /criar|emitir|aprovar|executar|enviar|send|create|approve|delete|update|responder/i.test(n));
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
  const ifood = new Proxy({}, { get: () => async () => ({}) });
  const auditor = { record: async () => {} };
  const server = buildServer({ cfg, ifood, auditor });
  assert.ok(server, 'buildServer retornou um servidor');
});

if (failures > 0) { process.stdout.write(`\n${failures} falha(s).\n`); process.exit(1); }
process.stdout.write('\nTodas as asserções passaram.\n');
