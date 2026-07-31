// config.js — leitura + validação fail-closed do ambiente (molde asaas-mcp/vendaerp-mcp).
//
// Este MCP autentica no Supabase como USUÁRIO (conta de serviço dedicada), não como
// service_role — precisa ler deli_messages via RLS igual ao Console (Deli.jsx). A senha
// da conta de serviço vive só no Infisical/cofre da VPS, nunca em texto puro aqui.
'use strict';

function req(name) {
  const v = process.env[name];
  if (!v || !v.trim()) {
    throw new Error(
      `[cd-hermes-chat-mcp] variável de ambiente obrigatória ausente: ${name}. ` +
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
 * @returns {{bridgeUrl:string, supabaseUrl:string, supabaseAnonKey:string,
 *   serviceEmail:string, servicePassword:string, tenantId:string,
 *   auditTenantId:string, principal:string, timeoutMs:number, realtimeTimeoutMs:number}}
 */
function loadConfig() {
  return {
    bridgeUrl: opt('BRIDGE_URL', 'http://127.0.0.1:3001'),
    supabaseUrl: req('SUPABASE_URL'),
    supabaseAnonKey: req('SUPABASE_ANON_KEY'),
    serviceEmail: req('HERMES_CHAT_SERVICE_EMAIL'),
    servicePassword: req('HERMES_CHAT_SERVICE_PASSWORD'),
    tenantId: req('CD_TENANT_ID'),
    auditTenantId: opt('CD_AUDIT_TENANT_ID', ''),
    principal: opt('CD_MCP_PRINCIPAL', 'hermes_chat_mcp'),
    timeoutMs: parseInt(opt('CD_MCP_TIMEOUT_MS', '25000'), 10),
    realtimeTimeoutMs: parseInt(opt('CD_MCP_REALTIME_TIMEOUT_MS', '60000'), 10),
  };
}

module.exports = { loadConfig };
