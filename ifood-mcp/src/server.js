// server.js — bootstrap do ifood-mcp do Hermes (stdio). Molde vendaerp-mcp.
//
// Junta config + ifood-bridge + supabase(audit) + auditor + registry e registra cada
// tool no McpServer. Cada handler é auditado (sucesso ou erro). SÓ LEITURA.
'use strict';

const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');

const { loadConfig } = require('./config');
const { makeIfoodBridge } = require('./ifood-bridge');
const { makeSupabase } = require('./supabase');
const { makeAuditor } = require('./audit');
const { allTools } = require('./registry');

/** Constrói o McpServer com todas as tools registradas (testável sem transporte). */
function buildServer({ cfg, ifood, auditor }) {
  const server = new McpServer({ name: 'cd-ifood-mcp', version: '0.1.0' });
  const ctx = { ifood, cfg };

  for (const tool of allTools) {
    server.registerTool(
      tool.name,
      { title: tool.title, description: tool.description, inputSchema: tool.inputShape },
      async (args) => {
        const safeArgs = args || {};
        try {
          const { summary, tenantIds, data } = await tool.handler(safeArgs, ctx);
          await auditor.record({ tool: tool.name, args: safeArgs, tenantIds, ok: true, summary });
          return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
        } catch (e) {
          await auditor.record({ tool: tool.name, args: safeArgs, tenantIds: [], ok: false, error: e.message });
          return { isError: true, content: [{ type: 'text', text: `Erro em ${tool.name}: ${e.message}` }] };
        }
      }
    );
  }

  return server;
}

async function main() {
  const cfg = loadConfig(); // lança se faltar env (fail-closed)
  const ifood = makeIfoodBridge({ bridgeUrl: cfg.bridgeUrl, internalToken: cfg.internalToken, timeoutMs: cfg.timeoutMs });
  const sb = makeSupabase(cfg);
  const auditor = makeAuditor({ sbInsert: sb.sbInsert, auditTenantId: cfg.auditTenantId, principal: cfg.principal });
  const server = buildServer({ cfg, ifood, auditor });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write(`[cd-ifood-mcp] online (stdio) — ${allTools.length} tools (leitura), bridge=${cfg.bridgeUrl}\n`);
}

if (require.main === module) {
  main().catch((e) => {
    process.stderr.write(`[cd-ifood-mcp] FALHA no boot: ${e.message}\n`);
    process.exit(1);
  });
}

module.exports = { buildServer };
