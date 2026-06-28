// authz.js — autorização por tenant ANTES de qualquer escrita (GATE 0 / Blueprint v2 §7).
//
// O admin-mcp escreve via service_role, que BYPASSA RLS. Sem isto, `tenant_id` é um
// arg livre: um tenant alucinado/injetado criaria escrita órfã ou cross-tenant. O
// ceo_agent é cross-tenant POR DESIGN (copiloto do CEO), então a autorização não é
// "um tenant só" — é "o tenant tem que EXISTIR" (e a loja tem que pertencer a ele).
// Falha = recusa a escrita (fail-closed), não silenciosa.
'use strict';

/** Garante que o tenant existe. Lança (recusa a escrita) se não. */
async function assertTenantExists(sb, tenantId) {
  const rows = await sb.sbGet('tenants', `id=eq.${encodeURIComponent(tenantId)}&select=id&limit=1`);
  if (!rows?.length) {
    throw new Error(`authz: tenant ${tenantId} não existe — escrita recusada.`);
  }
}

/** Garante que a loja pertence ao tenant (anti cross-tenant). Lança se não. */
async function assertLojaInTenant(sb, lojaId, tenantId) {
  const rows = await sb.sbGet(
    'lojas',
    `id=eq.${encodeURIComponent(lojaId)}&tenant_id=eq.${encodeURIComponent(tenantId)}&select=id&limit=1`
  );
  if (!rows?.length) {
    throw new Error(`authz: loja ${lojaId} não pertence ao tenant ${tenantId} — escrita recusada.`);
  }
}

module.exports = { assertTenantExists, assertLojaInTenant };
