'use strict';

const express = require('express');

module.exports = function buildAgentTicketsRouter({ requireJwt, sbFetch, supabaseInsert, SUPABASE_URL, SUPABASE_SERVICE_KEY }) {
  const router = express.Router();

  // ── Helper: pegar tenant_id do usuário autenticado ────────────────────────
  async function getTenantId(userId) {
    if (!userId) throw new Error('Usuário não autenticado');
    const rows = await sbFetch(
      `tenant_members?user_id=eq.${encodeURIComponent(userId)}&select=tenant_id&limit=1`
    );
    return rows?.[0]?.tenant_id ?? null;
  }

  // ── Helper: registrar atividade ────────────────────────────────────────────
  async function logActivity(ticketId, tenantId, eventType, actor, oldValue, newValue) {
    await supabaseInsert('agent_ticket_activity', {
      ticket_id:  ticketId,
      tenant_id:  tenantId,
      event_type: eventType,
      actor,
      old_value:  oldValue ?? null,
      new_value:  newValue ?? null,
    }).catch(e => console.warn('[agent-tickets] logActivity falhou:', e.message));
  }

  // ══════════════════════════════════════════════════════════════════════════
  // AGENT TICKETS
  // ══════════════════════════════════════════════════════════════════════════

  // GET /api/agent-tickets — listar tickets do tenant com filtros opcionais
  router.get('/agent-tickets', requireJwt, async (req, res) => {
    try {
      const tenantId = await getTenantId(req.user.id);
      if (!tenantId) return res.status(403).json({ error: 'tenant não encontrado' });

      const { status, assignee_agent, priority } = req.query;

      let qs = `agent_tickets?tenant_id=eq.${tenantId}&order=created_at.desc&select=*`;
      if (status)         qs += `&status=eq.${encodeURIComponent(status)}`;
      if (assignee_agent) qs += `&assignee_agent=eq.${encodeURIComponent(assignee_agent)}`;
      if (priority)       qs += `&priority=eq.${encodeURIComponent(priority)}`;

      const rows = await sbFetch(qs);
      res.json(rows || []);
    } catch (err) {
      console.error('[agent-tickets GET]', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/agent-tickets — criar ticket
  router.post('/agent-tickets', requireJwt, async (req, res) => {
    try {
      const tenantId = await getTenantId(req.user.id);
      if (!tenantId) return res.status(403).json({ error: 'tenant não encontrado' });

      const { title, description, assignee_agent, priority, goal_id } = req.body;
      if (!title?.trim()) return res.status(400).json({ error: 'title obrigatório' });

      const row = await supabaseInsert('agent_tickets', {
        tenant_id:      tenantId,
        title:          title.trim(),
        description:    description?.trim() || null,
        assignee_agent: assignee_agent || null,
        priority:       priority || 'medium',
        goal_id:        goal_id || null,
        created_by:     req.user.id,
      });

      if (row?.id) {
        await logActivity(row.id, tenantId, 'created', `human:${req.user.id}`, null, 'open');
      }

      res.status(201).json(row);
    } catch (err) {
      console.error('[agent-tickets POST]', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // PATCH /api/agent-tickets/:id — atualizar campos do ticket
  router.patch('/agent-tickets/:id', requireJwt, async (req, res) => {
    try {
      const tenantId = await getTenantId(req.user.id);
      if (!tenantId) return res.status(403).json({ error: 'tenant não encontrado' });

      const ALLOWED = ['title', 'description', 'status', 'priority', 'assignee_agent'];
      const updates = {};
      for (const k of ALLOWED) {
        if (req.body[k] !== undefined) updates[k] = req.body[k];
      }
      if (!Object.keys(updates).length)
        return res.status(400).json({ error: 'nenhum campo válido para atualizar' });

      updates.updated_at = new Date().toISOString();

      const data = await sbFetch(
        `agent_tickets?id=eq.${req.params.id}&tenant_id=eq.${tenantId}`,
        { method: 'PATCH', body: updates }
      );
      const ticket = Array.isArray(data) ? data[0] : data;
      if (!ticket) return res.status(404).json({ error: 'ticket não encontrado' });

      if (req.body.status) {
        await logActivity(req.params.id, tenantId, 'status_changed', `human:${req.user.id}`, null, req.body.status);
      }
      if (req.body.assignee_agent !== undefined) {
        await logActivity(req.params.id, tenantId, 'assigned', `human:${req.user.id}`, null, req.body.assignee_agent);
      }

      res.json(ticket);
    } catch (err) {
      console.error('[agent-tickets PATCH]', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // DELETE /api/agent-tickets/:id
  router.delete('/agent-tickets/:id', requireJwt, async (req, res) => {
    try {
      const tenantId = await getTenantId(req.user.id);
      if (!tenantId) return res.status(403).json({ error: 'tenant não encontrado' });

      if (!SUPABASE_SERVICE_KEY) return res.status(500).json({ error: 'service key ausente' });

      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/agent_tickets?id=eq.${req.params.id}&tenant_id=eq.${tenantId}`,
        {
          method: 'DELETE',
          headers: {
            apikey: SUPABASE_SERVICE_KEY,
            Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
          },
        }
      );
      if (!r.ok) throw new Error(`delete ${r.status}: ${await r.text()}`);
      res.json({ deleted: true });
    } catch (err) {
      console.error('[agent-tickets DELETE]', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/agent-tickets/:id/checkout — atomic checkout
  router.post('/agent-tickets/:id/checkout', requireJwt, async (req, res) => {
    try {
      const tenantId = await getTenantId(req.user.id);
      if (!tenantId) return res.status(403).json({ error: 'tenant não encontrado' });

      const { agent_slug } = req.body;
      if (!agent_slug?.trim()) return res.status(400).json({ error: 'agent_slug obrigatório' });

      if (!SUPABASE_SERVICE_KEY) return res.status(500).json({ error: 'service key ausente' });

      // Atomic UPDATE WHERE locked_at IS NULL
      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/agent_tickets?id=eq.${req.params.id}&tenant_id=eq.${tenantId}&locked_at=is.null`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            apikey: SUPABASE_SERVICE_KEY,
            Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
            Prefer: 'return=representation',
          },
          body: JSON.stringify({
            locked_at:  new Date().toISOString(),
            locked_by:  agent_slug.trim(),
            updated_at: new Date().toISOString(),
          }),
        }
      );

      if (!r.ok) throw new Error(`checkout update ${r.status}: ${await r.text()}`);
      const data = await r.json();

      // Se nenhuma row foi atualizada: já está locked por outro
      if (!Array.isArray(data) || data.length === 0) {
        return res.status(409).json({ error: 'ticket já em checkout por outro agente' });
      }

      const ticket = data[0];
      await logActivity(req.params.id, tenantId, 'checkout', agent_slug.trim(), null, agent_slug.trim());
      res.json(ticket);
    } catch (err) {
      console.error('[agent-tickets checkout]', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/agent-tickets/:id/release — liberar checkout
  router.post('/agent-tickets/:id/release', requireJwt, async (req, res) => {
    try {
      const tenantId = await getTenantId(req.user.id);
      if (!tenantId) return res.status(403).json({ error: 'tenant não encontrado' });

      const { agent_slug } = req.body;
      if (!agent_slug?.trim()) return res.status(400).json({ error: 'agent_slug obrigatório' });

      // Buscar ticket para verificar locked_by
      const rows = await sbFetch(
        `agent_tickets?id=eq.${req.params.id}&tenant_id=eq.${tenantId}&select=locked_by&limit=1`
      );
      const ticket = rows?.[0];
      if (!ticket) return res.status(404).json({ error: 'ticket não encontrado' });
      if (ticket.locked_by && ticket.locked_by !== agent_slug.trim()) {
        return res.status(403).json({ error: 'sem permissão: ticket locked por outro agente' });
      }

      const data = await sbFetch(
        `agent_tickets?id=eq.${req.params.id}&tenant_id=eq.${tenantId}`,
        {
          method: 'PATCH',
          body: { locked_at: null, locked_by: null, updated_at: new Date().toISOString() },
        }
      );
      const updated = Array.isArray(data) ? data[0] : data;

      await logActivity(req.params.id, tenantId, 'released', agent_slug.trim(), agent_slug.trim(), null);
      res.json(updated || { released: true });
    } catch (err) {
      console.error('[agent-tickets release]', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/agent-tickets/:id/comments — adicionar comentário
  router.post('/agent-tickets/:id/comments', requireJwt, async (req, res) => {
    try {
      const tenantId = await getTenantId(req.user.id);
      if (!tenantId) return res.status(403).json({ error: 'tenant não encontrado' });

      const { body, author } = req.body;
      if (!body?.trim()) return res.status(400).json({ error: 'body obrigatório' });

      const comment = await supabaseInsert('agent_ticket_comments', {
        ticket_id: req.params.id,
        tenant_id: tenantId,
        author:    author?.trim() || `human:${req.user.id}`,
        body:      body.trim(),
      });

      await logActivity(req.params.id, tenantId, 'comment_added', author?.trim() || `human:${req.user.id}`, null, body.trim().slice(0, 100));

      res.status(201).json(comment);
    } catch (err) {
      console.error('[agent-tickets comments]', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/agent-tickets/:id/timeline — merged events (comments + activity)
  router.get('/agent-tickets/:id/timeline', requireJwt, async (req, res) => {
    try {
      const tenantId = await getTenantId(req.user.id);
      if (!tenantId) return res.status(403).json({ error: 'tenant não encontrado' });

      const [comments, activity] = await Promise.all([
        sbFetch(`agent_ticket_comments?ticket_id=eq.${req.params.id}&tenant_id=eq.${tenantId}&order=created_at.asc&select=*`),
        sbFetch(`agent_ticket_activity?ticket_id=eq.${req.params.id}&tenant_id=eq.${tenantId}&order=created_at.asc&select=*`),
      ]);

      const timeline = [
        ...(comments || []).map(c => ({ ...c, _type: 'comment' })),
        ...(activity || []).map(a => ({ ...a, _type: 'activity' })),
      ].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

      res.json(timeline);
    } catch (err) {
      console.error('[agent-tickets timeline]', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ══════════════════════════════════════════════════════════════════════════
  // AGENT ACTION APPROVALS
  // ══════════════════════════════════════════════════════════════════════════

  // GET /api/approvals — listar pendentes (status=pending, mais urgentes primeiro)
  router.get('/approvals', requireJwt, async (req, res) => {
    try {
      const tenantId = await getTenantId(req.user.id);
      if (!tenantId) return res.status(403).json({ error: 'tenant não encontrado' });

      const { status = 'pending' } = req.query;

      // Ordem: vermelho > amarelo > verde, depois por created_at asc
      const rows = await sbFetch(
        `agent_action_approvals?tenant_id=eq.${tenantId}&status=eq.${encodeURIComponent(status)}&order=created_at.asc&select=*`
      );
      res.json(rows || []);
    } catch (err) {
      console.error('[approvals GET]', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/approvals — criar approval request (usado pelos agentes)
  router.post('/approvals', requireJwt, async (req, res) => {
    try {
      const tenantId = await getTenantId(req.user.id);
      if (!tenantId) return res.status(403).json({ error: 'tenant não encontrado' });

      const { agent_slug, action_type, action_label, action_payload, severity, heartbeat_run_id } = req.body;
      if (!agent_slug?.trim())  return res.status(400).json({ error: 'agent_slug obrigatório' });
      if (!action_type?.trim()) return res.status(400).json({ error: 'action_type obrigatório' });
      if (!action_label?.trim()) return res.status(400).json({ error: 'action_label obrigatório' });

      // Ações verde são auto-aprovadas
      const finalStatus = severity === 'verde' ? 'approved' : 'pending';

      const row = await supabaseInsert('agent_action_approvals', {
        tenant_id:        tenantId,
        agent_slug:       agent_slug.trim(),
        action_type:      action_type.trim(),
        action_label:     action_label.trim(),
        action_payload:   action_payload || null,
        severity:         severity || 'amarelo',
        status:           finalStatus,
        heartbeat_run_id: heartbeat_run_id || null,
      });

      res.status(201).json(row);
    } catch (err) {
      console.error('[approvals POST]', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // PATCH /api/approvals/:id — aprovar/rejeitar
  router.patch('/approvals/:id', requireJwt, async (req, res) => {
    try {
      const tenantId = await getTenantId(req.user.id);
      if (!tenantId) return res.status(403).json({ error: 'tenant não encontrado' });

      const { status, review_note } = req.body;
      if (!['approved', 'rejected'].includes(status))
        return res.status(400).json({ error: 'status deve ser approved ou rejected' });

      const data = await sbFetch(
        `agent_action_approvals?id=eq.${req.params.id}&tenant_id=eq.${tenantId}`,
        {
          method: 'PATCH',
          body: {
            status,
            review_note: review_note?.trim() || null,
            reviewed_by: req.user.id,
            reviewed_at: new Date().toISOString(),
          },
        }
      );
      const approval = Array.isArray(data) ? data[0] : data;
      if (!approval) return res.status(404).json({ error: 'approval não encontrado' });
      res.json(approval);
    } catch (err) {
      console.error('[approvals PATCH]', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  return router;
};
