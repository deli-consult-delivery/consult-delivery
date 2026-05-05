'use strict';
// bridge-server/agent.js
// Router Express para invocação de agentes via /agent/:name/invoke

const express            = require('express');
const { createClient }   = require('@supabase/supabase-js');
const requireAgentAccess = require('./middleware/requireAgentAccess');
const { createNotification } = require('./notifications');

const router = express.Router();

const SUPABASE_URL     = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Agentes ativos que podem ser invocados via este endpoint
const ACTIVE_AGENTS = new Set(['deli', 'analista-ifood', 'cora']);

let _sb = null;
function sb() {
  if (!_sb) {
    _sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return _sb;
}

// Middleware RBAC dinâmico — lê agent name do req.params
function dynamicAgentAccess(req, res, next) {
  return requireAgentAccess(req.params.name)(req, res, next);
}

// POST /agent/:name/invoke
router.post('/:name/invoke', dynamicAgentAccess, async (req, res) => {
  const { name } = req.params;
  const { tenant_id, payload, user_id } = req.body;

  // Validar agent name
  if (!ACTIVE_AGENTS.has(name)) {
    return res.status(400).json({
      error: `Agente '${name}' não está ativo ou não existe.`,
      code:  'agent_not_active',
    });
  }

  // Validar payload mínimo
  if (!tenant_id) {
    return res.status(400).json({ error: 'tenant_id é obrigatório.', code: 'invalid_payload' });
  }

  const prompt  = payload?.prompt  || '';
  const channel = payload?.channel || 'painel';

  const invocationId = require('crypto').randomUUID();
  const queuedAt     = new Date().toISOString();

  // Registrar em audit_log
  const logEntry = {
    tenant_id:  tenant_id,
    user_id:    user_id || null,
    agent_name: name,
    action:     'agent.invoke_queued',
    resource:   `agents/${name}`,
    metadata:   { invocation_id: invocationId, channel, prompt_length: prompt.length, queued_at: queuedAt },
  };

  sb().from('audit_log').insert(logEntry).then(({ error }) => {
    if (error) console.warn(`[agent] falha ao registrar audit_log para ${name}:`, error.message);
  });

  // Criar notificação interna (non-blocking)
  createNotification({
    tenantId:        tenant_id,
    recipientUserId: user_id || null,
    kind:            'agent_invoked',
    agent:           name,
    title:           `${name} invocado`,
    body:            prompt ? `"${prompt.slice(0, 80)}${prompt.length > 80 ? '…' : ''}"` : 'Invocação manual',
    link:            '/agents',
    metadata:        { invocation_id: invocationId, channel },
  }).catch(err => console.warn('[agent] notify falhou (não crítico):', err.message));

  // Resposta imediata — execução real do agente é gerenciada pelo realtime.js (DELI) ou /analise (analista-ifood)
  return res.status(202).json({
    ok:            true,
    invocation_id: invocationId,
    queued_at:     queuedAt,
    message:       `Agente ${name} enfileirado. Acompanhe em audit_log.`,
  });
});

module.exports = router;
