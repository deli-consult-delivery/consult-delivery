// ─────────────────────────────────────────────────────────────────────────────
// audit.js — trilha de auditoria não-negociável (molde admin-mcp §5).
//
// TODA chamada de tool grava em audit_log: quem (principal), qual tool, resultado,
// timestamp. Na Fase 1 há 1 só credencial de ERP (a da CD), então toda chamada é
// auditada sob CD_AUDIT_TENANT_ID (tenant "plataforma/CD"). Quando a Fase 3 trouxer
// ERP por tenant, basta a tool devolver tenantIds e cada tenant vira uma linha.
//
// Best-effort em relação à RESPOSTA (uma falha de audit não engole o resultado),
// mas a falha é LOGADA em stderr — visível.
// ─────────────────────────────────────────────────────────────────────────────

'use strict';

function makeAuditor({ sbInsert, auditTenantId, principal }) {
  /**
   * @param {object} p
   * @param {string} p.tool        nome da tool (ex.: 'erp_status')
   * @param {object} p.args        argumentos recebidos (sem segredos)
   * @param {string[]} p.tenantIds tenants tocados; [] = chamada de plataforma/CD
   * @param {boolean} p.ok
   * @param {string} [p.summary]
   * @param {string} [p.error]
   */
  async function record({ tool, args, tenantIds, ok, summary, error }) {
    const now = new Date().toISOString();
    const action = `mcp:${tool}`;
    const baseMeta = {
      args: args || {},
      ok: ok !== false,
      summary: summary || null,
      error: error || null,
    };

    const targets =
      Array.isArray(tenantIds) && tenantIds.length > 0
        ? [...new Set(tenantIds)].map((tid) => ({ tenant_id: tid, scope: 'tenant' }))
        : [{ tenant_id: auditTenantId, scope: 'platform' }];

    const rows = targets.map((t) => ({
      tenant_id: t.tenant_id,
      agent_name: principal,
      action,
      resource: tool,
      metadata: { ...baseMeta, scope: t.scope },
      created_at: now,
    }));

    try {
      await sbInsert('audit_log', rows);
    } catch (e) {
      process.stderr.write(`[cd-asaas-mcp][AUDIT-FAIL] tool=${tool} err=${e.message}\n`);
    }
  }

  return { record };
}

module.exports = { makeAuditor };
