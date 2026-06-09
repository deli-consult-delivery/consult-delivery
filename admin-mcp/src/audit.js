// ─────────────────────────────────────────────────────────────────────────────
// audit.js — trilha de auditoria não-negociável (admin-mcp-design.md §5).
//
// TODA chamada de tool (read e write) grava em audit_log: quem (principal,
// default 'ceo_agent'), qual tool, qual tenant_id tocado, timestamp, resultado.
//
// Modelagem do tenant_id (audit_log.tenant_id é NOT NULL, mas o ceo_agent é
// cross-tenant):
//   • tool tocou tenants específicos  → uma linha de audit POR tenant tocado.
//   • tool de infra (ex.: cd_status)  → uma linha sob CD_AUDIT_TENANT_ID
//                                        (tenant "plataforma/CD"), metadata.scope.
// Assim nenhuma chamada fica sem trilha e nunca inventamos um tenant_id falso.
//
// O audit é best-effort em relação à RESPOSTA da tool (uma falha de auditoria não
// engole o resultado já produzido), mas a falha é LOGADA em stderr — visível.
// ─────────────────────────────────────────────────────────────────────────────

'use strict';

function makeAuditor({ sbInsert, auditTenantId, principal }) {
  /**
   * Grava a trilha de uma chamada de tool.
   * @param {object} p
   * @param {string} p.tool        nome da tool (ex.: 'cd_lojas')
   * @param {object} p.args        argumentos recebidos (sem segredos — tools não recebem segredo)
   * @param {string[]} p.tenantIds tenants tocados; [] = chamada de plataforma/infra
   * @param {boolean} p.ok         resultado deu certo?
   * @param {string} [p.summary]   resumo legível do que foi feito/retornado
   * @param {string} [p.error]     mensagem de erro, se ok=false
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
      // PostgREST aceita array → insere todas as linhas numa chamada.
      await sbInsert('audit_log', rows);
    } catch (e) {
      // Nunca derruba a resposta da tool por causa do audit, mas grita no log.
      process.stderr.write(
        `[cd-admin-mcp][AUDIT-FAIL] tool=${tool} err=${e.message}\n`
      );
    }
  }

  return { record };
}

module.exports = { makeAuditor };
