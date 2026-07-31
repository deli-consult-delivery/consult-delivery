// audit.js — trilha de auditoria (molde asaas-mcp/audit.js).
//
// Diferença dos outros MCPs do Hermes: aqui NÃO existe service_role — a conta de
// serviço é um usuário autenticado normal (auth.uid() IS NOT NULL), e a policy
// audit_log_insert_authenticated permite INSERT para qualquer usuário logado.
// Best-effort: falha de auditoria não derruba a resposta da tool, mas é logada em stderr.
'use strict';

function makeAuditor({ supabase, tenantId, principal }) {
  /**
   * @param {object} p
   * @param {string} p.tool
   * @param {object} p.args
   * @param {boolean} p.ok
   * @param {string} [p.summary]
   * @param {string} [p.error]
   */
  async function record({ tool, args, ok, summary, error }) {
    const row = {
      tenant_id: tenantId,
      agent_name: principal,
      action: `mcp:${tool}`,
      resource: tool,
      metadata: { args: args || {}, ok: ok !== false, summary: summary || null, error: error || null },
      created_at: new Date().toISOString(),
    };
    try {
      const { error: sbError } = await supabase.from('audit_log').insert(row);
      if (sbError) throw new Error(sbError.message);
    } catch (e) {
      process.stderr.write(`[cd-hermes-chat-mcp][AUDIT-FAIL] tool=${tool} err=${e.message}\n`);
    }
  }

  return { record };
}

module.exports = { makeAuditor };
