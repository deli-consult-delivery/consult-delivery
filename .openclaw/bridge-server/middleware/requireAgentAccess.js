'use strict';
// Middleware RBAC: valida JWT + user_agent_access antes de invocar qualquer agente.
// Aceita também x-bridge-secret para chamadas internas de serviço (n8n, webhooks, DELI).

const { createClient } = require('@supabase/supabase-js');

let _supabase = null;
function supabaseAdmin() {
  if (!_supabase) {
    _supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );
  }
  return _supabase;
}

// Registra chamada em audit_log de forma assíncrona (não bloqueia a resposta)
function logAudit({ tenantId, userId, agentName, action, req }) {
  if (!tenantId) return;
  supabaseAdmin()
    .from('audit_log')
    .insert({
      tenant_id:  tenantId,
      user_id:    userId ?? null,
      agent_name: agentName,
      action,
      resource:   agentName,
      metadata:   { endpoint: req.path, method: req.method },
      ip_address: req.ip,
      user_agent: req.headers['user-agent'] ?? null,
    })
    .then(({ error }) => {
      if (error) console.warn('[bridge:rbac] audit_log error:', error.message);
    });
}

/**
 * Retorna um middleware Express que protege a rota para o agente informado.
 *
 * Fluxo:
 *   1. x-bridge-secret presente e válido → acesso de serviço (sem RLS de usuário)
 *   2. Authorization: Bearer <jwt> → valida JWT e verifica user_agent_access
 *   3. Nenhum → 401
 */
function requireAgentAccess(agentName) {
  return async function (req, res, next) {
    const bridgeSecret  = req.headers['x-bridge-secret'];
    const authorization = req.headers['authorization'];
    const tenantId      = req.body?.tenant_id ?? null;

    // ── Caminho 1: chamada interna via BRIDGE_SECRET ──────────────────────────
    if (process.env.BRIDGE_SECRET && bridgeSecret === process.env.BRIDGE_SECRET) {
      logAudit({ tenantId, userId: null, agentName, action: 'agent_invoke_service', req });
      return next();
    }

    // ── Caminho 2: chamada do browser via JWT ──────────────────────────────────
    if (!authorization?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token de autenticação ausente.' });
    }

    const jwt = authorization.split(' ')[1];
    const { data: { user }, error: authErr } = await supabaseAdmin().auth.getUser(jwt);
    if (authErr || !user) {
      return res.status(401).json({ error: 'Token inválido ou expirado.' });
    }

    const { data: access, error: accessErr } = await supabaseAdmin()
      .from('user_agent_access')
      .select('can_invoke')
      .eq('user_id', user.id)
      .eq('agent_name', agentName)
      .single();

    if (accessErr || !access?.can_invoke) {
      logAudit({ tenantId, userId: user.id, agentName, action: 'agent_invoke_denied', req });
      return res.status(403).json({ error: `Acesso negado ao agente ${agentName}.` });
    }

    logAudit({ tenantId, userId: user.id, agentName, action: 'agent_invoke', req });
    req.supabaseUser = user;
    next();
  };
}

module.exports = requireAgentAccess;
