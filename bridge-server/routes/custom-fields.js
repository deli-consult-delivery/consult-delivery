'use strict';

const express = require('express');

/**
 * GET  /api/custom-fields?tenant_id=&entidade=
 * POST /api/custom-fields
 * PATCH /api/custom-fields/:id
 * DELETE /api/custom-fields/:id
 *
 * GET  /api/entidades/:tipo/:entidadeId/custom-values?tenant_id=
 * POST /api/entidades/:tipo/:entidadeId/custom-values   { tenant_id, values: [{custom_field_id, valor}] }
 */
module.exports = function buildCustomFieldsRouter({ requireJwt, sbFetch, assertTenantMember }) {
  const router = express.Router();

  // ── List fields for tenant + entidade ─────────────────────────────────────
  router.get('/custom-fields', requireJwt, async (req, res) => {
    const { tenant_id, entidade } = req.query;
    if (!tenant_id) return res.status(400).json({ error: 'tenant_id required' });
    if (!await assertTenantMember(req, res, tenant_id)) return;

    let qs = `custom_fields?tenant_id=eq.${tenant_id}&order=ordem.asc,created_at.asc`;
    if (entidade) qs += `&entidade=eq.${encodeURIComponent(entidade)}`;

    const fields = await sbFetch(qs);
    return res.json({ fields: fields || [] });
  });

  // ── Create field ───────────────────────────────────────────────────────────
  router.post('/custom-fields', requireJwt, async (req, res) => {
    const { tenant_id, entidade, nome, tipo, opcoes, obrigatorio, ordem, ajuda } = req.body;
    if (!tenant_id || !entidade || !nome || !tipo) {
      return res.status(400).json({ error: 'tenant_id, entidade, nome e tipo são obrigatórios' });
    }
    if (!await assertTenantMember(req, res, tenant_id)) return;

    const rows = await sbFetch('custom_fields', {
      method: 'POST',
      body: { tenant_id, entidade, nome, tipo, opcoes: opcoes || null, obrigatorio: !!obrigatorio, ordem: ordem ?? 0, ajuda: ajuda || null },
    });
    const field = Array.isArray(rows) ? rows[0] : rows;
    return res.status(201).json({ field });
  });

  // ── Update field ───────────────────────────────────────────────────────────
  router.patch('/custom-fields/:id', requireJwt, async (req, res) => {
    const { id } = req.params;

    // Load field to verify tenant membership
    const existing = await sbFetch(`custom_fields?id=eq.${id}&select=id,tenant_id&limit=1`);
    if (!existing?.length) return res.status(404).json({ error: 'Campo não encontrado' });
    if (!await assertTenantMember(req, res, existing[0].tenant_id)) return;

    const allowed = ['nome', 'tipo', 'opcoes', 'obrigatorio', 'ordem', 'ajuda'];
    const patch = {};
    for (const k of allowed) {
      if (req.body[k] !== undefined) patch[k] = req.body[k];
    }
    if (!Object.keys(patch).length) return res.status(400).json({ error: 'Nenhum campo para atualizar' });

    const rows = await sbFetch(`custom_fields?id=eq.${id}`, { method: 'PATCH', body: patch });
    const field = Array.isArray(rows) ? rows[0] : rows;
    return res.json({ field });
  });

  // ── Delete field ───────────────────────────────────────────────────────────
  router.delete('/custom-fields/:id', requireJwt, async (req, res) => {
    const { id } = req.params;

    const existing = await sbFetch(`custom_fields?id=eq.${id}&select=id,tenant_id&limit=1`);
    if (!existing?.length) return res.status(404).json({ error: 'Campo não encontrado' });
    if (!await assertTenantMember(req, res, existing[0].tenant_id)) return;

    await sbFetch(`custom_fields?id=eq.${id}`, { method: 'DELETE' });
    return res.json({ ok: true });
  });

  // ── Get fields + values for an entity instance ────────────────────────────
  router.get('/entidades/:tipo/:entidadeId/custom-values', requireJwt, async (req, res) => {
    const { tipo, entidadeId } = req.params;
    const { tenant_id } = req.query;
    if (!tenant_id) return res.status(400).json({ error: 'tenant_id required' });
    if (!await assertTenantMember(req, res, tenant_id)) return;

    const fields = await sbFetch(
      `custom_fields?tenant_id=eq.${tenant_id}&entidade=eq.${encodeURIComponent(tipo)}&order=ordem.asc,created_at.asc`
    ) || [];

    const fieldIds = fields.map(f => f.id);
    let valuesMap = {};
    if (fieldIds.length) {
      const rows = await sbFetch(
        `custom_field_values?custom_field_id=in.(${fieldIds.join(',')})&entidade_id=eq.${entidadeId}`
      ) || [];
      for (const r of rows) {
        valuesMap[r.custom_field_id] = r.valor;
      }
    }

    return res.json({ fields, values: valuesMap });
  });

  // ── Upsert values for an entity instance ──────────────────────────────────
  router.post('/entidades/:tipo/:entidadeId/custom-values', requireJwt, async (req, res) => {
    const { tipo, entidadeId } = req.params;
    const { tenant_id, values } = req.body;
    if (!tenant_id) return res.status(400).json({ error: 'tenant_id required' });
    if (!Array.isArray(values) || !values.length) return res.json({ ok: true, upserted: 0 });
    if (!await assertTenantMember(req, res, tenant_id)) return;

    // Validate that all custom_field_ids belong to this tenant
    const fieldIds = [...new Set(values.map(v => v.custom_field_id))];
    const owned = await sbFetch(
      `custom_fields?id=in.(${fieldIds.join(',')})&tenant_id=eq.${tenant_id}&select=id`
    ) || [];
    const ownedSet = new Set(owned.map(f => f.id));
    const filtered = values.filter(v => ownedSet.has(v.custom_field_id));
    if (!filtered.length) return res.json({ ok: true, upserted: 0 });

    const payload = filtered.map(v => ({
      custom_field_id: v.custom_field_id,
      entidade_id: entidadeId,
      valor: v.valor ?? null,
      updated_at: new Date().toISOString(),
    }));

    await sbFetch('custom_field_values', {
      method: 'POST',
      prefer: 'return=representation,resolution=merge-duplicates',
      body: payload,
    });

    return res.json({ ok: true, upserted: payload.length });
  });

  return router;
};
