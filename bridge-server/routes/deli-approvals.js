'use strict';

const express = require('express');

module.exports = function buildDeliApprovalsRouter({ requireJwt, sbFetch, supabaseInsert }) {
  const router = express.Router();

  // GET /api/deli/pending — lista aprovações pendentes
  router.get('/deli/pending', requireJwt, async (req, res) => {
    const { tenant_id, limit: lim = '50' } = req.query;
    if (!tenant_id) return res.status(400).json({ error: 'tenant_id obrigatório' });

    try {
      const limitNum = Math.min(100, Math.max(1, parseInt(lim) || 50));
      const rows = await sbFetch(
        `deli_pending_approvals?tenant_id=eq.${encodeURIComponent(tenant_id)}&status=eq.waiting&order=created_at.desc&limit=${limitNum}&select=id,trigger_id,autonomy_level,summary,context_jsonb,proposed_action_jsonb,reasoning,expires_at,created_at`
      );
      res.json({ pending: rows || [] });
    } catch (err) {
      console.error('[deli/pending GET]', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/deli/approve/:id — aprova uma pendência
  router.post('/deli/approve/:id', requireJwt, async (req, res) => {
    const { id } = req.params;
    const { tenant_id } = req.body;
    if (!tenant_id) return res.status(400).json({ error: 'tenant_id obrigatório' });

    try {
      const rows = await sbFetch(
        `deli_pending_approvals?id=eq.${encodeURIComponent(id)}&tenant_id=eq.${encodeURIComponent(tenant_id)}&select=id,status&limit=1`
      );
      if (!rows?.length) return res.status(404).json({ error: 'aprovação não encontrada' });
      if (rows[0].status !== 'waiting') return res.status(409).json({ error: `já ${rows[0].status}` });

      const updated = await sbFetch(
        `deli_pending_approvals?id=eq.${encodeURIComponent(id)}&tenant_id=eq.${encodeURIComponent(tenant_id)}`,
        {
          method: 'PATCH',
          body: {
            status: 'approved',
            approver_id: req.user.id,
            approved_at: new Date().toISOString(),
          },
        }
      );

      await supabaseInsert('audit_log', {
        tenant_id,
        user_id: req.user.id,
        action: 'APPROVE',
        resource: `deli_pending_approvals:${id}`,
        metadata: { approval_id: id },
      }).catch(() => {});

      console.log(`[deli/approve] id=${id} user=${req.user.id}`);
      res.json({ ok: true, approval: Array.isArray(updated) ? updated[0] : updated });
    } catch (err) {
      console.error('[deli/approve POST]', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/deli/reject/:id — rejeita uma pendência
  router.post('/deli/reject/:id', requireJwt, async (req, res) => {
    const { id } = req.params;
    const { tenant_id, reason } = req.body;
    if (!tenant_id) return res.status(400).json({ error: 'tenant_id obrigatório' });

    try {
      const rows = await sbFetch(
        `deli_pending_approvals?id=eq.${encodeURIComponent(id)}&tenant_id=eq.${encodeURIComponent(tenant_id)}&select=id,status&limit=1`
      );
      if (!rows?.length) return res.status(404).json({ error: 'aprovação não encontrada' });
      if (rows[0].status !== 'waiting') return res.status(409).json({ error: `já ${rows[0].status}` });

      const updated = await sbFetch(
        `deli_pending_approvals?id=eq.${encodeURIComponent(id)}&tenant_id=eq.${encodeURIComponent(tenant_id)}`,
        {
          method: 'PATCH',
          body: {
            status: 'rejected',
            approver_id: req.user.id,
            approved_at: new Date().toISOString(),
            reasoning: reason ? `REJEITADO: ${reason}` : 'REJEITADO pelo usuário',
          },
        }
      );

      await supabaseInsert('audit_log', {
        tenant_id,
        user_id: req.user.id,
        action: 'REJECT',
        resource: `deli_pending_approvals:${id}`,
        metadata: { approval_id: id, reason: reason || null },
      }).catch(() => {});

      console.log(`[deli/reject] id=${id} user=${req.user.id}`);
      res.json({ ok: true, approval: Array.isArray(updated) ? updated[0] : updated });
    } catch (err) {
      console.error('[deli/reject POST]', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  return router;
};
