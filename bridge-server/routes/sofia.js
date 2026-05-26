'use strict';

// ════════════════════════════════════════════════════════════════════════════
// S2-G02.5 — SOFIA: Bridge endpoints para leads qualificados
//
// Endpoints:
//   GET   /api/sofia/leads              → lista leads (score_min, status, cidade, limit, offset)
//   GET   /api/sofia/leads/:id          → detalhe do lead
//   PATCH /api/sofia/leads/:id/status   → atualizar status
//   POST  /api/sofia/leads/:id/promote  → promover lead → CRM (status='crm')
// ════════════════════════════════════════════════════════════════════════════

const express = require('express');

module.exports = function buildSofiaRouter({ requireJwt, sbFetch }) {
  const router = express.Router();

  // ── Helper: resolve tenant_id a partir de query/body e valida membership ─
  async function resolveTenant(req, res) {
    const tenant_id = req.query.tenant_id || req.body?.tenant_id;
    if (!tenant_id) {
      res.status(400).json({ error: 'tenant_id obrigatório' });
      return null;
    }
    const members = await sbFetch(
      `tenant_members?tenant_id=eq.${encodeURIComponent(tenant_id)}&user_id=eq.${encodeURIComponent(req.user.id)}&select=role&limit=1`
    );
    if (!members?.length) {
      res.status(403).json({ error: 'Acesso negado' });
      return null;
    }
    return { tenant_id, role: members[0].role };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // GET /api/sofia/leads
  // Acesso: admin, dev, marketing
  // ══════════════════════════════════════════════════════════════════════════
  router.get('/sofia/leads', requireJwt, async (req, res) => {
    const ctx = await resolveTenant(req, res);
    if (!ctx) return;
    const { tenant_id } = ctx;

    const {
      score_min = '1',
      status,
      cidade,
      limit: lim = '50',
      offset: off = '0',
    } = req.query;

    try {
      let qs = `leads?tenant_id=eq.${encodeURIComponent(tenant_id)}`;
      qs += `&score=gte.${parseInt(score_min, 10)}`;
      if (status) qs += `&status=eq.${encodeURIComponent(status)}`;
      if (cidade) qs += `&cidade=eq.${encodeURIComponent(cidade)}`;
      qs += `&order=score.desc,created_at.desc`;
      qs += `&limit=${parseInt(lim, 10)}&offset=${parseInt(off, 10)}`;
      qs += `&select=id,nome,fonte,cidade,bairro,telefone,instagram,ifood_url,gmaps_url,score,justificativa,status,crm_id,created_at`;

      const leads = await sbFetch(qs);
      res.json({ leads: leads || [], total: (leads || []).length });
    } catch (err) {
      console.error('[api/sofia/leads GET]', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ══════════════════════════════════════════════════════════════════════════
  // GET /api/sofia/leads/:id
  // ══════════════════════════════════════════════════════════════════════════
  router.get('/sofia/leads/:id', requireJwt, async (req, res) => {
    const ctx = await resolveTenant(req, res);
    if (!ctx) return;
    const { tenant_id } = ctx;
    const { id } = req.params;

    try {
      const rows = await sbFetch(
        `leads?id=eq.${encodeURIComponent(id)}&tenant_id=eq.${encodeURIComponent(tenant_id)}&select=*&limit=1`
      );
      if (!rows?.length) return res.status(404).json({ error: 'lead não encontrado' });
      res.json({ lead: rows[0] });
    } catch (err) {
      console.error('[api/sofia/leads/:id GET]', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ══════════════════════════════════════════════════════════════════════════
  // PATCH /api/sofia/leads/:id/status
  // Acesso: admin (alterar status)
  // ══════════════════════════════════════════════════════════════════════════
  router.patch('/sofia/leads/:id/status', requireJwt, async (req, res) => {
    const ctx = await resolveTenant(req, res);
    if (!ctx) return;
    const { tenant_id, role } = ctx;

    if (!['admin', 'dev'].includes(role)) {
      return res.status(403).json({ error: 'Apenas admin pode alterar status de leads' });
    }

    const { id } = req.params;
    const { status } = req.body;
    const VALID = ['prospectado', 'contactado', 'sem_resposta', 'interessado', 'nao_fit', 'crm', 'perdido'];
    if (!status || !VALID.includes(status)) {
      return res.status(400).json({ error: `status inválido. Valores: ${VALID.join(', ')}` });
    }

    try {
      const rows = await sbFetch(
        `leads?id=eq.${encodeURIComponent(id)}&tenant_id=eq.${encodeURIComponent(tenant_id)}&select=id&limit=1`
      );
      if (!rows?.length) return res.status(404).json({ error: 'lead não encontrado' });

      await sbFetch(`leads?id=eq.${encodeURIComponent(id)}&tenant_id=eq.${encodeURIComponent(tenant_id)}`, {
        method: 'PATCH',
        body: { status, updated_at: new Date().toISOString() },
      });

      res.json({ ok: true, id, status });
    } catch (err) {
      console.error('[api/sofia/leads/:id/status PATCH]', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ══════════════════════════════════════════════════════════════════════════
  // POST /api/sofia/leads/:id/promote
  // Promove lead para CRM (status='crm')
  // ══════════════════════════════════════════════════════════════════════════
  router.post('/sofia/leads/:id/promote', requireJwt, async (req, res) => {
    const ctx = await resolveTenant(req, res);
    if (!ctx) return;
    const { tenant_id, role } = ctx;

    if (!['admin', 'dev'].includes(role)) {
      return res.status(403).json({ error: 'Apenas admin pode promover leads ao CRM' });
    }

    const { id } = req.params;

    try {
      const rows = await sbFetch(
        `leads?id=eq.${encodeURIComponent(id)}&tenant_id=eq.${encodeURIComponent(tenant_id)}&select=id,nome,status&limit=1`
      );
      if (!rows?.length) return res.status(404).json({ error: 'lead não encontrado' });

      if (rows[0].status === 'crm') {
        return res.json({ ok: true, id, status: 'crm', message: 'lead já está no CRM' });
      }

      await sbFetch(`leads?id=eq.${encodeURIComponent(id)}&tenant_id=eq.${encodeURIComponent(tenant_id)}`, {
        method: 'PATCH',
        body: { status: 'crm', updated_at: new Date().toISOString() },
      });

      res.json({ ok: true, id, status: 'crm', nome: rows[0].nome });
    } catch (err) {
      console.error('[api/sofia/leads/:id/promote POST]', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  return router;
};
