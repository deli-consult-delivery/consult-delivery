// ─────────────────────────────────────────────────────────────────────────────
// server.js — bootstrap do admin MCP do Hermes (stdio).
//
// Junta config + supabase + auditor + registry e registra cada tool no McpServer.
// Cada handler é envolvido por um wrapper que:
//   1. executa a tool,
//   2. grava a trilha de auditoria (sempre — sucesso ou erro),
//   3. devolve o resultado no formato MCP (content[].text JSON).
//
// ⚠️ NÃO subir sem GATE 0 + claudedev + token service_role dedicado (Infisical).
//    Reservado ao Wandson. Ver README.md e docs/infra/admin-mcp-design.md §4/§6.
// ─────────────────────────────────────────────────────────────────────────────

'use strict';

const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');

const { loadConfig } = require('./config');
const { makeSupabase } = require('./supabase');
const { makeAuditor } = require('./audit');
const { allTools } = require('./registry');

/** Constrói o McpServer com todas as tools registradas (testável sem conectar transporte). */
function buildServer({ cfg, sb, auditor }) {
  const server = new McpServer({ name: 'cd-admin-mcp', version: '0.1.0' });
  const ctx = { sb, cfg };

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
          await auditor.record({
            tool: tool.name,
            args: safeArgs,
            tenantIds,
            ok: true,
            summary,
          });
          return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
        } catch (e) {
          await auditor.record({
            tool: tool.name,
            args: safeArgs,
            tenantIds: [],
            ok: false,
            error: e.message,
          });
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
  const sb = makeSupabase(cfg);
  const auditor = makeAuditor({ sbInsert: sb.sbInsert, auditTenantId: cfg.auditTenantId, principal: cfg.principal });
  const server = buildServer({ cfg, sb, auditor });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write(
    `[cd-admin-mcp] online (stdio) — ${allTools.length} tools, principal=${cfg.principal}\n`
  );
}

// Só sobe o transporte quando executado como entrypoint. Importado (testes) não conecta.
if (require.main === module) {
  main().catch((e) => {
    process.stderr.write(`[cd-admin-mcp] FALHA no boot: ${e.message}\n`);
    process.exit(1);
  });
}

module.exports = { buildServer };
