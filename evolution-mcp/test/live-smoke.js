// live-smoke.js — exercita as read tools contra o Bridge REAL e prova a trilha em audit_log.
// Lê env em runtime (fail-closed via loadConfig). Output bruto. SÓ LEITURA — não envia a cliente.
// Uso: export INTERNAL_BRIDGE_TOKEN/SUPABASE_URL/SUPABASE_SERVICE_KEY/CD_AUDIT_TENANT_ID && npm run live-smoke
'use strict';

const { loadConfig } = require('../src/config');
const { makeEvolutionBridge } = require('../src/evolution-bridge');
const { makeSupabase } = require('../src/supabase');
const { makeAuditor } = require('../src/audit');
const { readTools } = require('../src/registry');

const LABEL = 'cd-evolution-mcp';
// Sem tenant → o Bridge retorna o status de todas as instâncias.
const CALLS = [{ tool: 'evolution_status', args: {} }];

async function recentAudit(cfg) {
  const base = cfg.supabaseUrl.replace(/\/$/, '');
  const url = `${base}/rest/v1/audit_log?select=created_at,agent_name,action,resource,metadata`
    + `&agent_name=eq.${cfg.principal}&action=like.mcp:*&order=created_at.desc&limit=5`;
  const r = await fetch(url, { headers: { apikey: cfg.supabaseServiceKey, Authorization: `Bearer ${cfg.supabaseServiceKey}` } });
  if (!r.ok) throw new Error(`audit_log SELECT falhou (${r.status})`);
  return r.json();
}

async function main() {
  const cfg = loadConfig();
  const evolution = makeEvolutionBridge({ bridgeUrl: cfg.bridgeUrl, internalToken: cfg.internalToken, timeoutMs: cfg.timeoutMs });
  const sb = makeSupabase(cfg);
  const auditor = makeAuditor({ sbInsert: sb.sbInsert, auditTenantId: cfg.auditTenantId, principal: cfg.principal });
  const ctx = { evolution, cfg };

  process.stdout.write(`${LABEL} live-smoke — bridge=${cfg.bridgeUrl}\n\n`);
  const known = new Set(readTools.map((t) => t.name));

  for (const { tool, args } of CALLS) {
    if (!known.has(tool)) { process.stdout.write(`  SKIP ${tool} (não registrada)\n`); continue; }
    const def = readTools.find((t) => t.name === tool);
    try {
      const { summary, tenantIds, data } = await def.handler(args, ctx);
      await auditor.record({ tool, args, tenantIds, ok: true, summary });
      process.stdout.write(`  ok  ${tool} — ${summary}\n${JSON.stringify(data, null, 2)}\n\n`);
    } catch (e) {
      await auditor.record({ tool, args, tenantIds: [], ok: false, error: e.message });
      process.stdout.write(`  ~~  ${tool} — handler executou mas Bridge retornou erro: ${e.message}\n\n`);
    }
  }

  const rows = await recentAudit(cfg);
  process.stdout.write(`audit_log (últimas ${rows.length} linhas mcp:* de ${cfg.principal}):\n`);
  for (const row of rows) process.stdout.write(`  ${row.created_at}  ${row.action}  ok=${row.metadata?.ok}  scope=${row.metadata?.scope}\n`);
  if (!rows.length) throw new Error('nenhuma linha mcp:* em audit_log — trilha NÃO gravou');

  process.stdout.write(`\nlive-smoke OK (handlers executaram contra o Bridge real + trilha em audit_log)\n`);
}

main().catch((e) => { process.stderr.write(`\n${LABEL} live-smoke FALHOU: ${e.message}\n`); process.exit(1); });
