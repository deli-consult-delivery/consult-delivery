// ─────────────────────────────────────────────────────────────────────────────
// config.js — leitura + validação fail-closed das variáveis de ambiente.
//
// Nenhum segredo é hardcoded (anti-padrão #2 / regra Infisical). Tudo vem do
// ambiente que o Wandson injeta a partir do Infisical quando liga o gateway
// (claudedev). Se faltar uma var obrigatória, o processo PARA na subida — é de
// propósito: melhor não subir do que subir sem auditoria ou sem credencial.
// ─────────────────────────────────────────────────────────────────────────────

'use strict';

function req(name) {
  const v = process.env[name];
  if (!v || !v.trim()) {
    throw new Error(
      `[cd-admin-mcp] variável de ambiente obrigatória ausente: ${name}. ` +
      `Configure via Infisical antes de subir o admin MCP (admin-mcp-design.md §4).`
    );
  }
  return v.trim();
}

function opt(name, fallback) {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : fallback;
}

/**
 * Carrega a config. Lança se faltar obrigatória — chamado uma vez no boot.
 * @returns {{
 *   supabaseUrl: string,
 *   supabaseServiceKey: string,
 *   auditTenantId: string,
 *   bridgeUrl: string,
 *   principal: string,
 *   defaultLimit: number,
 *   maxLimit: number
 * }}
 */
function loadConfig() {
  return {
    // Acesso de leitura ampla via service_role (bypassa RLS — por isso TODA query
    // é auditada, §5 do design). O token mora no Infisical, nunca no git.
    supabaseUrl: req('SUPABASE_URL'),
    supabaseServiceKey: req('SUPABASE_SERVICE_KEY'),

    // audit_log.tenant_id é NOT NULL, mas o ceo_agent é cross-tenant. Chamadas
    // que não tocam um tenant específico (ex.: cd_status) são auditadas sob este
    // tenant "plataforma/CD". Obrigatório → garante que NENHUMA chamada fica sem
    // trilha de auditoria (§5 "não-negociável").
    auditTenantId: req('CD_AUDIT_TENANT_ID'),

    // Bridge de produção, só pra checagem de saúde (cd_status). Loopback por padrão.
    bridgeUrl: opt('BRIDGE_URL', 'http://127.0.0.1:3001'),

    // Identidade gravada no audit_log.agent_name e em agent_drafts.agent_name.
    principal: opt('CD_MCP_PRINCIPAL', 'ceo_agent'),

    defaultLimit: parseInt(opt('CD_MCP_DEFAULT_LIMIT', '20'), 10),
    maxLimit: parseInt(opt('CD_MCP_MAX_LIMIT', '100'), 10),
  };
}

module.exports = { loadConfig };
