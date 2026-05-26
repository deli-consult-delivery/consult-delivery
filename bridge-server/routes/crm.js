// bridge-server/routes/crm.js — CRM pipeline de leads
const express = require('express');
const { z }   = require('zod');

const VALID_STAGES = ['novo', 'qualificado', 'proposta', 'negociacao', 'fechado', 'perdido'];

const LeadCreateSchema = z.object({
  tenant_id:       z.string().uuid(),
  nome:            z.string().min(1),
  email:           z.string().email().optional().nullable(),
  whatsapp:        z.string().optional().nullable(),
  origem:          z.string().optional().nullable(),
  stage:           z.enum(VALID_STAGES).default('novo'),
  valor_estimado:  z.number().nonnegative().optional().nullable(),
  score:           z.number().int().min(1).max(10).optional().nullable(),
  responsavel_id:  z.string().uuid().optional().nullable(),
  notas:           z.string().optional().nullable(),
  customer_id:     z.string().uuid().optional().nullable(),
});

const LeadPatchSchema = z.object({
  nome:            z.string().min(1).optional(),
  email:           z.string().email().optional().nullable(),
  whatsapp:        z.string().optional().nullable(),
  origem:          z.string().optional().nullable(),
  stage:           z.enum(VALID_STAGES).optional(),
  valor_estimado:  z.number().nonnegative().optional().nullable(),
  score:           z.number().int().min(1).max(10).optional().nullable(),
  responsavel_id:  z.string().uuid().optional().nullable(),
  notas:           z.string().optional().nullable(),
});

module.exports = function buildCrmRouter({ requireJwt, sbFetch, supabaseInsert }) {
  const router = express.Router();

  async function assertTenant(req, res, tenantId) {
    const rows = await sbFetch(
      `tenant_members?tenant_id=eq.${encodeURIComponent(tenantId)}&user_id=eq.${encodeURIComponent(req.user.id)}&select=tenant_id&limit=1`
    );
    if (!rows?.length) {
      res.status(403).json({ error: 'Acesso negado' });
      return false;
    }
    return true;
  }

  async function logAudit(userId, action, entityId, data) {
    await supabaseInsert('audit_log', {
      user_id:     userId,
      action,
      entity_type: 'lead',
      entity_id:   entityId,
      data,
      created_at:  new Date().toISOString(),
    }).catch(e => console.warn('[crm audit]', e.message));
  }

  // GET /api/crm/leads?tenant_id=...&stage=...&q=...
  router.get('/crm/leads', requireJwt, async (req, res) => {
    const { tenant_id, stage, q, responsavel_id, score_min, score_max } = req.query;
    if (!tenant_id) return res.status(400).json({ error: 'tenant_id obrigatório' });

    try {
      if (!await assertTenant(req, res, tenant_id)) return;

      let qs = `tenant_id=eq.${encodeURIComponent(tenant_id)}&order=created_at.desc&limit=500`;
      if (stage)          qs += `&stage=eq.${encodeURIComponent(stage)}`;
      if (responsavel_id) qs += `&responsavel_id=eq.${encodeURIComponent(responsavel_id)}`;
      if (score_min)      qs += `&score=gte.${parseInt(score_min)}`;
      if (score_max)      qs += `&score=lte.${parseInt(score_max)}`;

      let leads = await sbFetch(
        `leads?${qs}&select=id,nome,email,whatsapp,origem,stage,valor_estimado,score,responsavel_id,notas,customer_id,created_at,updated_at`
      ) || [];

      if (q) {
        const lq = q.toLowerCase();
        leads = leads.filter(l =>
          (l.nome  && l.nome.toLowerCase().includes(lq)) ||
          (l.email && l.email.toLowerCase().includes(lq)) ||
          (l.whatsapp && l.whatsapp.includes(lq))
        );
      }

      res.json({ leads });
    } catch (err) {
      console.error('[crm/leads GET]', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/crm/leads
  router.post('/crm/leads', requireJwt, async (req, res) => {
    try {
      const input = LeadCreateSchema.parse(req.body);
      if (!await assertTenant(req, res, input.tenant_id)) return;

      const row = { ...input, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
      const result = await sbFetch('leads', { method: 'POST', body: row, prefer: 'return=representation' });
      const lead = Array.isArray(result) ? result[0] : result;

      await logAudit(req.user.id, 'crm.lead.create', lead.id, { nome: lead.nome, stage: lead.stage });
      res.status(201).json({ lead });
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ error: 'validação', issues: err.issues });
      console.error('[crm/leads POST]', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // PATCH /api/crm/leads/:id
  router.patch('/crm/leads/:id', requireJwt, async (req, res) => {
    const { id } = req.params;
    try {
      const patch = LeadPatchSchema.parse(req.body);

      const existing = await sbFetch(`leads?id=eq.${encodeURIComponent(id)}&select=tenant_id,stage&limit=1`);
      if (!existing?.length) return res.status(404).json({ error: 'lead não encontrado' });
      if (!await assertTenant(req, res, existing[0].tenant_id)) return;

      const updates = { ...patch, updated_at: new Date().toISOString() };
      const result  = await sbFetch(`leads?id=eq.${encodeURIComponent(id)}`, {
        method: 'PATCH', body: updates, prefer: 'return=representation',
      });
      const lead = Array.isArray(result) ? result[0] : result;

      const action = patch.stage && patch.stage !== existing[0].stage
        ? 'crm.lead.stage'
        : 'crm.lead.update';
      await logAudit(req.user.id, action, id, patch);
      res.json({ lead });
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ error: 'validação', issues: err.issues });
      console.error('[crm/leads PATCH]', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // DELETE /api/crm/leads/:id
  router.delete('/crm/leads/:id', requireJwt, async (req, res) => {
    const { id } = req.params;
    try {
      const existing = await sbFetch(`leads?id=eq.${encodeURIComponent(id)}&select=tenant_id,nome&limit=1`);
      if (!existing?.length) return res.status(404).json({ error: 'lead não encontrado' });
      if (!await assertTenant(req, res, existing[0].tenant_id)) return;

      await sbFetch(`leads?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE', prefer: 'return=minimal' });
      await logAudit(req.user.id, 'crm.lead.delete', id, { nome: existing[0].nome });
      res.json({ ok: true });
    } catch (err) {
      console.error('[crm/leads DELETE]', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/crm/stats?tenant_id=...
  router.get('/crm/stats', requireJwt, async (req, res) => {
    const { tenant_id } = req.query;
    if (!tenant_id) return res.status(400).json({ error: 'tenant_id obrigatório' });

    try {
      if (!await assertTenant(req, res, tenant_id)) return;

      const leads = await sbFetch(
        `leads?tenant_id=eq.${encodeURIComponent(tenant_id)}&select=stage,valor_estimado,score`
      ) || [];

      const byStage = Object.fromEntries(
        VALID_STAGES.map(s => [s, { count: 0, valor: 0 }])
      );
      for (const l of leads) {
        const s = l.stage || 'novo';
        if (byStage[s]) {
          byStage[s].count++;
          byStage[s].valor += Number(l.valor_estimado || 0);
        }
      }

      const total      = leads.length;
      const valorTotal = Object.values(byStage).reduce((sum, s) => sum + s.valor, 0);
      const scorados   = leads.filter(l => l.score);
      const avgScore   = scorados.length
        ? scorados.reduce((s, l) => s + l.score, 0) / scorados.length
        : 0;

      res.json({ total, valorTotal, avgScore: Math.round(avgScore * 10) / 10, byStage });
    } catch (err) {
      console.error('[crm/stats GET]', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  return router;
};
