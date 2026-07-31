// smoke.js — validação offline (molde asaas-mcp). Zero rede, zero mutação.
'use strict';

const assert = require('node:assert');
const { allTools } = require('../src/registry');
const { buildServer } = require('../src/server');

const EXPECTED = ['talk_to_deli', 'talk_to_ana'];

let failures = 0;
function check(label, fn) {
  try { fn(); process.stdout.write(`  ok  ${label}\n`); }
  catch (e) { failures++; process.stdout.write(`  FAIL ${label}: ${e.message}\n`); }
}

process.stdout.write('cd-hermes-chat-mcp smoke test\n');

check('tools = esperadas', () => {
  assert.deepStrictEqual(allTools.map((t) => t.name).sort(), [...EXPECTED].sort());
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
  const cfg = { bridgeUrl: 'http://127.0.0.1:3001', principal: 'hermes_chat_mcp' };
  const chatClient = { talkTo: async () => ({ content: 'stub', createdAt: new Date().toISOString() }), supabase: null };
  const auditor = { record: async () => {} };
  const server = buildServer({ cfg, chatClient, auditor });
  assert.ok(server, 'buildServer retornou um servidor');
});

if (failures > 0) { process.stdout.write(`\n${failures} falha(s).\n`); process.exit(1); }
process.stdout.write('\nTodas as asserções passaram.\n');
