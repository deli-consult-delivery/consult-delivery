// ─────────────────────────────────────────────────────────────────────────────
// server.js — bootstrap do vendaerp-mcp do Hermes (stdio). Molde admin-mcp.
//
// Junta config + erp-bridge + supabase(audit) + auditor + registry e registra cada
// tool no McpServer. Cada handler é envolvido por um wrapper que:
//   1. executa a tool (que chama o Bridge, nunca o ERP direto),
//   2. grava a trilha de auditoria (sempre — sucesso ou erro),
//   3. devolve o resultado no formato MCP (content[].text JSON).
//
// ⚠️ NÃO subir sem GATE 0: precisa do INTERNAL_BRIDGE_TOKEN, do service_role e dos
//    4 secrets VENDAERP_* no env do BRIDGE (não aqui). Reservado ao Wandson.
// ─────────────────────────────────────────────────────────────────────────────

'use strict';

const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');

const { loadConfig } = require('./config');
const { makeErpBridge } = require('./vendaerp-bridge');
const { makeSupabase } = require('./supabase');
const { makeAuditor } = require('./audit');
const { allTools } = require('./registry');
const { makeProposals } = require('./proposals');

/** Constrói o McpServer com todas as tools registradas (testável sem transporte). */
function buildServer({ cfg, erp, auditor, sb }) {
  const server = new McpServer({ name: 'cd-vendaerp-mcp', version: '0.1.0' });
  const proposals = sb ? makeProposals({ sb, cfg }) : null;
  const ctx = { erp, cfg, sb, proposals };

  for (const tool of allTools) {
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: tool.inputShape,
      },
      async (args) => {
        const safeArgs = args || {};
        try {
          const { summary, tenantIds, data } = await tool.handler(safeArgs, ctx);
          await auditor.record({ tool: tool.name, args: safeArgs, tenantIds, ok: true, summary });
          return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
        } catch (e) {
          await auditor.record({ tool: tool.name, args: safeArgs, tenantIds: [], ok: false, error: e.message });
          return {
            isError: true,
            content: [{ type: 'text', text: `Erro em ${tool.name}: ${e.message}` }],
          };
        }
      }
    );
  }

  return server;
}

async function main() {
  const cfg = loadConfig(); // lança se faltar env obrigatória (fail-closed)
  const erp = makeErpBridge({ bridgeUrl: cfg.bridgeUrl, internalToken: cfg.internalToken, writeToken: cfg.vendaerpWriteToken, timeoutMs: cfg.timeoutMs });
  const sb = makeSupabase(cfg);
  const auditor = makeAuditor({ sbInsert: sb.sbInsert, auditTenantId: cfg.auditTenantId, principal: cfg.principal });
  const server = buildServer({ cfg, erp, auditor, sb });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write(
    `[cd-vendaerp-mcp] online (stdio) — ${allTools.length} tools (leitura+escrita), bridge=${cfg.bridgeUrl}\n`
  );
}

// Só sobe o transporte quando executado como entrypoint. Importado (testes) não conecta.
if (require.main === module) {
  main().catch((e) => {
    process.stderr.write(`[cd-vendaerp-mcp] FALHA no boot: ${e.message}\n`);
    process.exit(1);
  });
}

module.exports = { buildServer };
