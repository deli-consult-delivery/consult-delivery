// live-smoke.js — exercita talk_to_deli contra o Bridge/Supabase REAIS. Output bruto.
// Uso: export SUPABASE_URL/SUPABASE_ANON_KEY/HERMES_CHAT_SERVICE_EMAIL/
//        HERMES_CHAT_SERVICE_PASSWORD/CD_TENANT_ID/BRIDGE_URL && npm run live-smoke
'use strict';

const { loadConfig } = require('../src/config');
const { makeChatClient } = require('../src/chat-client');
const { makeAuditor } = require('../src/audit');

const LABEL = 'cd-hermes-chat-mcp';

async function main() {
  const cfg = loadConfig();
  const chatClient = makeChatClient(cfg);
  const auditor = makeAuditor({ supabase: chatClient.supabase, tenantId: cfg.tenantId, principal: cfg.principal });

  process.stdout.write(`${LABEL} live-smoke — bridge=${cfg.bridgeUrl} tenant=${cfg.tenantId}\n\n`);

  const mensagem = 'ping de live-smoke do hermes-chat-mcp — pode responder qualquer coisa curta';
  process.stdout.write(`enviando para deli: "${mensagem}"\n`);
  const t0 = Date.now();
  try {
    const { content, createdAt } = await chatClient.talkTo('deli', mensagem);
    const ms = Date.now() - t0;
    await auditor.record({ tool: 'talk_to_deli', args: { mensagem }, ok: true, summary: `resposta em ${ms}ms` });
    process.stdout.write(`\nresposta (${ms}ms, created_at=${createdAt}):\n${content}\n`);
    process.stdout.write(`\nlive-smoke OK — talk_to_deli funcionou contra produção.\n`);
  } catch (e) {
    await auditor.record({ tool: 'talk_to_deli', args: { mensagem }, ok: false, error: e.message });
    throw e;
  }
}

main().catch((e) => { process.stderr.write(`\n${LABEL} live-smoke FALHOU: ${e.message}\n`); process.exit(1); });
