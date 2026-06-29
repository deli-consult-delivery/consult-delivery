// config.js — leitura + validação fail-closed do ambiente (molde vendaerp-mcp).
//
// NENHUMA credencial do iFood aqui — a API do iFood é falada SÓ pelo Bridge. Este MCP
// só precisa do Bridge (BRIDGE_URL + token interno) e do Supabase (service_role) p/
// a trilha de auditoria. Falta de var obrigatória → o processo PARA na subida.
'use strict';

function req(name) {
  const v = process.env[name];
  if (!v || !v.trim()) {
    throw new Error(
      `[cd-asaas-mcp] variável de ambiente obrigatória ausente: ${name}. ` +
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
 * @returns {{bridgeUrl:string, internalToken:string, supabaseUrl:string,
 *   supabaseServiceKey:string, auditTenantId:string, principal:string, timeoutMs:number}}
 */
function loadConfig() {
  return {
    bridgeUrl: opt('BRIDGE_URL', 'http://127.0.0.1:3001'),
    internalToken: req('INTERNAL_BRIDGE_TOKEN'),
    supabaseUrl: req('SUPABASE_URL'),
    supabaseServiceKey: req('SUPABASE_SERVICE_KEY'),
    auditTenantId: req('CD_AUDIT_TENANT_ID'),
    principal: opt('CD_MCP_PRINCIPAL', 'ceo_agent'),
    timeoutMs: parseInt(opt('CD_MCP_TIMEOUT_MS', '25000'), 10),
  };
}

module.exports = { loadConfig };
