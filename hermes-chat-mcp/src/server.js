// server.js — bootstrap do hermes-chat-mcp (stdio). Molde asaas-mcp/server.js.
'use strict';

const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');

const { loadConfig } = require('./config');
const { makeChatClient } = require('./chat-client');
const { makeAuditor } = require('./audit');
const { allTools } = require('./registry');

function buildServer({ cfg, chatClient, auditor }) {
  const server = new McpServer({ name: 'cd-hermes-chat-mcp', version: '0.1.0' });
  const ctx = { chatClient, cfg };

  for (const tool of allTools) {
    server.registerTool(
      tool.name,
      { title: tool.title, description: tool.description, inputSchema: tool.inputShape },
      async (args) => {
        const safeArgs = args || {};
        try {
          const { summary, data } = await tool.handler(safeArgs, ctx);
          await auditor.record({ tool: tool.name, args: safeArgs, ok: true, summary });
          return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
        } catch (e) {
          await auditor.record({ tool: tool.name, args: safeArgs, ok: false, error: e.message });
          return { isError: true, content: [{ type: 'text', text: `Erro em ${tool.name}: ${e.message}` }] };
        }
      }
    );
  }

  return server;
}

async function main() {
  const cfg = loadConfig();
  const chatClient = makeChatClient(cfg);
  const auditor = makeAuditor({ supabase: chatClient.supabase, tenantId: cfg.tenantId, principal: cfg.principal });
  const server = buildServer({ cfg, chatClient, auditor });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write(`[cd-hermes-chat-mcp] online (stdio) — ${allTools.length} tools, bridge=${cfg.bridgeUrl}\n`);
}

if (require.main === module) {
  main().catch((e) => {
    process.stderr.write(`[cd-hermes-chat-mcp] FALHA no boot: ${e.message}\n`);
    process.exit(1);
  });
}

module.exports = { buildServer };
