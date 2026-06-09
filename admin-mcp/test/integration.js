// integration.js — handshake MCP real sobre stdio, sem banco.
//
// Sobe o server.js como subprocesso (com env DUMMY — `tools/list` não toca o
// banco) e, via cliente MCP do SDK, faz o handshake e lista as tools. Prova que o
// protocolo ponta-a-ponta funciona: initialize + tools/list devolvem as 7 tools
// com seus inputSchemas. NÃO chama nenhuma tool (não há banco real).
//
// Roda offline: `npm run test:integration`. Sai !=0 se o handshake falhar.
'use strict';

const assert = require('node:assert');
const path = require('node:path');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');

const EXPECTED = [
  'cd_status',
  'cd_lojas',
  'cd_agent_runs',
  'cd_drafts_pendentes',
  'cd_inadimplencia',
  'cd_audit',
  'cd_propor_draft',
];

async function main() {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [path.join(__dirname, '..', 'src', 'server.js')],
    // env dummy só pra passar a validação fail-closed do config.js — tools/list não usa.
    env: {
      ...process.env,
      SUPABASE_URL: 'http://localhost:0',
      SUPABASE_SERVICE_KEY: 'dummy-key-not-used-by-tools-list',
      CD_AUDIT_TENANT_ID: '00000000-0000-0000-0000-000000000000',
    },
  });

  const client = new Client({ name: 'cd-admin-mcp-itest', version: '0.1.0' });
  await client.connect(transport);

  const { tools } = await client.listTools();
  const names = tools.map((t) => t.name).sort();
  process.stdout.write(`handshake ok — tools: ${names.join(', ')}\n`);
  assert.deepStrictEqual(names, [...EXPECTED].sort(), 'lista de tools diverge do esperado');

  // toda tool precisa expor um inputSchema (JSON Schema) no protocolo
  for (const t of tools) {
    assert.ok(t.inputSchema && t.inputSchema.type === 'object', `inputSchema de ${t.name}`);
  }

  await client.close();
  process.stdout.write(`\nOK — ${tools.length} tools anunciadas via MCP.\n`);
}

main().catch((e) => {
  process.stderr.write(`integration FAIL: ${e.message}\n`);
  process.exit(1);
});
