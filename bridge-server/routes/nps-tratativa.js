'use strict';

// ════════════════════════════════════════════════════════════════════════════
// NPS — Tratativa de detratores (endpoint autenticado JWT)
//
// Endpoints:
//   PATCH /api/nps-avaliacoes/:id/tratativa
//     Atualiza tratativa_status, tratativa_obs, tratativa_at, tratativa_by.
//     Body: { status: 'em_andamento'|'resolvido', obs?: string, tenant_id: string }
//     Requer JWT Supabase + membership no tenant.
// ════════════════════════════════════════════════════════════════════════════

const express = require('express');

module.exports = function buildNpsTratativaRouter({ requireJwt, sbFetch, assertTenantMember }) {
  const router = express.Router();

  router.patch('/nps-avaliacoes/:id/tratativa', requireJwt, async (req, res) => {
    const { id } = req.params;
    const { status, obs, tenant_id } = req.body;

    if (!tenant_id) {
      return res.status(400).json({ error: 'tenant_id obrigatório' });
    }
    if (!status || !['em_andamento', 'resolvido'].includes(status)) {
      return res.status(400).json({ error: "status deve ser 'em_andamento' ou 'resolvido'" });
    }
    if (!id) {
      return res.status(400).json({ error: 'id obrigatório' });
    }

    if (!await assertTenantMember(req, res, tenant_id)) return;

    try {
      const userId = req.user?.id || req.user?.sub || null;

      await sbFetch(
        `nps_avaliacoes?id=eq.${encodeURIComponent(id)}&tenant_id=eq.${encodeURIComponent(tenant_id)}`,
        {
          method: 'PATCH',
          body: {
            tratativa_status: status,
            tratativa_obs: obs || null,
            tratativa_at: new Date().toISOString(),
            tratativa_by: userId,
          },
          prefer: 'return=minimal',
        }
      );

      return res.json({ ok: true });
    } catch (err) {
      console.error('[nps-tratativa PATCH]', err.message);
      return res.status(500).json({ error: err.message });
    }
  });

  return router;
};
