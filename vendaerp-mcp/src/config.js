// ─────────────────────────────────────────────────────────────────────────────
// config.js — leitura + validação fail-closed do ambiente (molde admin-mcp).
//
// IMPORTANTE (design Hermes): NENHUMA credencial do VendaERP aqui. O ERP é falado
// SÓ pelo Bridge. Este MCP só precisa saber:
//   • onde está o Bridge (BRIDGE_URL) e o token interno p/ chamá-lo,
//   • o Supabase (service_role) p/ gravar a trilha de auditoria.
// Falta de var obrigatória → o processo PARA na subida (melhor não subir do que
// subir sem auditoria ou sem como falar com o Bridge).
// ─────────────────────────────────────────────────────────────────────────────

'use strict';

function req(name) {
  const v = process.env[name];
  if (!v || !v.trim()) {
    throw new Error(
      `[cd-vendaerp-mcp] variável de ambiente obrigatória ausente: ${name}. ` +
      `Configure via Infisical antes de subir o MCP (ver README.md).`
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
 *   bridgeUrl: string,
 *   internalToken: string,
 *   supabaseUrl: string,
 *   supabaseServiceKey: string,
 *   auditTenantId: string,
 *   principal: string,
 *   timeoutMs: number
 * }}
 */
function loadConfig() {
  return {
    // Bridge = ponto único de contato com o ERP. A credencial do VendaERP (3
    // headers) vive SÓ no env do Bridge, nunca aqui.
    bridgeUrl: opt('BRIDGE_URL', 'http://127.0.0.1:3001'),
    internalToken: req('INTERNAL_BRIDGE_TOKEN'),

    // 2º fator p/ ESCRITA no ERP (GATE 0): o Bridge exige x-vendaerp-write-token
    // ALÉM do token interno nas rotas de escrita. Opcional: sem ele, leitura segue
    // funcionando e a escrita é recusada pelo Bridge (503/401, fail-closed).
    vendaerpWriteToken: opt('VENDAERP_WRITE_TOKEN', null),

    // Service_role só p/ gravar audit_log (bypassa RLS — por isso toda chamada é
    // auditada). O token mora no Infisical, nunca no git.
    supabaseUrl: req('SUPABASE_URL'),
    supabaseServiceKey: req('SUPABASE_SERVICE_KEY'),

    // audit_log.tenant_id é NOT NULL e o Hermes é cross-tenant. Chamadas ao ERP
    // (1 credencial na Fase 1) são auditadas sob este tenant "plataforma/CD".
    auditTenantId: req('CD_AUDIT_TENANT_ID'),

    // Identidade gravada em audit_log.agent_name.
    principal: opt('CD_MCP_PRINCIPAL', 'ceo_agent'),

    // Timeout das chamadas ao Bridge (o Bridge já tem o seu p/ o ERP).
    timeoutMs: parseInt(opt('CD_MCP_TIMEOUT_MS', '25000'), 10),
  };
}

module.exports = { loadConfig };
