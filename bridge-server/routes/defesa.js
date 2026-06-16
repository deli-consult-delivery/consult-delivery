'use strict';

// ════════════════════════════════════════════════════════════════════════════
// Defesa — Contestação de pedidos (agente BRENO)
//
// Endpoints:
//   POST  /api/defesa/gerar              — dispara task breno-defesa-contestacao
//   GET   /api/defesa/casos              — lista casos do tenant
//   PATCH /api/defesa/casos/:id/aprovar  — aprova rascunho de defesa
//   PATCH /api/defesa/casos/:id/descartar — descarta caso
// ════════════════════════════════════════════════════════════════════════════

const express = require('express');

const TRIGGER_API_URL = 'https://api.trigger.dev';
const TASK_ID_DEFESA  = 'breno-defesa-contestacao';

const TIPOS_LOGISTICA_VALIDOS = ['ifood', 'propria'];

// ── Helper: resolve tenant_id a partir do user_id ────────────────────────────
async function getTenantId(userId, sbFetch) {
  if (!userId) throw new Error('Usuário não autenticado');
  const rows = await sbFetch(
    `tenant_members?user_id=eq.${encodeURIComponent(userId)}&select=tenant_id&limit=1`
  );
  return rows?.[0]?.tenant_id ?? null;
}

// ── Factory ──────────────────────────────────────────────────────────────────
module.exports = function buildDefesaRouter({ requireJwt, sbFetch, TRIGGER_SECRET_KEY }) {
  const router = express.Router();

  // ══════════════════════════════════════════════════════════════════════════
  // 1. POST /api/defesa/gerar
  //    Dispara task breno-defesa-contestacao para gerar defesa de pedido.
  // ══════════════════════════════════════════════════════════════════════════
  router.post('/defesa/gerar', requireJwt, async (req, res) => {
    const { loja_id, pedido_ref, valor_centavos, tipo_logistica, historico_ocorrido } = req.body;

    // Validação: todos os campos são obrigatórios
    if (!loja_id || !pedido_ref || valor_centavos == null || !tipo_logistica || !historico_ocorrido) {
      return res.status(400).json({
        ok: false,
        error: 'Campos obrigatórios: loja_id, pedido_ref, valor_centavos, tipo_logistica, historico_ocorrido',
      });
    }

    if (!TIPOS_LOGISTICA_VALIDOS.includes(tipo_logistica)) {
      return res.status(400).json({
        ok: false,
        error: `tipo_logistica inválido. Valores aceitos: ${TIPOS_LOGISTICA_VALIDOS.join(', ')}`,
      });
    }

    if (!TRIGGER_SECRET_KEY) {
      return res.status(503).json({ ok: false, error: 'TRIGGER_SECRET_KEY não configurado no servidor' });
    }

    try {
      const tenantId = await getTenantId(req.user.id, sbFetch);
      if (!tenantId) {
        return res.status(403).json({ ok: false, error: 'tenant não encontrado para este usuário' });
      }

      const tr = await fetch(`${TRIGGER_API_URL}/api/v1/tasks/${TASK_ID_DEFESA}/trigger`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${TRIGGER_SECRET_KEY}`,
        },
        body: JSON.stringify({
          payload: {
            tenant_id:          tenantId,
            loja_id,
            pedido_ref,
            valor_centavos:     parseInt(valor_centavos, 10),
            tipo_logistica,
            historico_ocorrido,
            triggered_by:       req.user.id,
          },
        }),
        signal: AbortSignal.timeout(15_000),
      });

      if (!tr.ok) {
        const detail = await tr.text();
        console.error(`[api/defesa/gerar] Trigger.dev ${tr.status}: ${detail.slice(0, 300)}`);
        return res.status(502).json({ ok: false, error: 'Falha ao acionar agente de defesa' });
      }

      const triggerData = await tr.json();
      console.log(`[api/defesa/gerar] tenant=${tenantId} loja=${loja_id} pedido=${pedido_ref} run_id=${triggerData.id}`);

      return res.status(202).json({
        ok:      true,
        run_id:  triggerData.id,
        message: 'Defesa sendo gerada pelo agente...',
      });
    } catch (err) {
      console.error('[api/defesa/gerar]', err.message);
      return res.status(500).json({ ok: false, error: err.message });
    }
  });

  // ══════════════════════════════════════════════════════════════════════════
  // 2. GET /api/defesa/casos
  //    Lista casos de defesa do tenant com filtros opcionais.
  //    Query params: ?loja_id= ?status= ?limit=20
  // ══════════════════════════════════════════════════════════════════════════
  router.get('/defesa/casos', requireJwt, async (req, res) => {
    const { loja_id, status, limit: limitParam } = req.query;
    const limit = Math.min(parseInt(limitParam, 10) || 20, 100);

    try {
      const tenantId = await getTenantId(req.user.id, sbFetch);
      if (!tenantId) {
        return res.status(403).json({ ok: false, error: 'tenant não encontrado para este usuário' });
      }

      let qs = `defesa_casos?select=*&tenant_id=eq.${encodeURIComponent(tenantId)}&order=created_at.desc&limit=${limit}`;
      if (loja_id) qs += `&loja_id=eq.${encodeURIComponent(loja_id)}`;
      if (status)  qs += `&status=eq.${encodeURIComponent(status)}`;

      const casos = await sbFetch(qs);

      return res.json({ ok: true, casos: casos ?? [] });
    } catch (err) {
      console.error('[api/defesa/casos GET]', err.message);
      return res.status(500).json({ ok: false, error: err.message });
    }
  });

  // ══════════════════════════════════════════════════════════════════════════
  // 3. PATCH /api/defesa/casos/:id/aprovar
  //    Aprova um rascunho de defesa. Aceita edição opcional do draft antes
  //    de aprovar.
  // ══════════════════════════════════════════════════════════════════════════
  router.patch('/defesa/casos/:id/aprovar', requireJwt, async (req, res) => {
    const { id } = req.params;
    const { draft_resposta } = req.body ?? {};

    try {
      const tenantId = await getTenantId(req.user.id, sbFetch);
      if (!tenantId) {
        return res.status(403).json({ ok: false, error: 'tenant não encontrado para este usuário' });
      }

      const updateBody = {
        status:       'aprovado',
        aprovado_por: req.user.id,
        aprovado_em:  new Date().toISOString(),
        ...(draft_resposta !== undefined && { draft_resposta }),
      };

      const result = await sbFetch(
        `defesa_casos?id=eq.${encodeURIComponent(id)}&tenant_id=eq.${encodeURIComponent(tenantId)}`,
        { method: 'PATCH', body: updateBody }
      );

      if (!result || (Array.isArray(result) && result.length === 0)) {
        return res.status(404).json({ ok: false, error: 'Caso não encontrado ou sem permissão' });
      }

      console.log(`[api/defesa/casos/${id}/aprovar] tenant=${tenantId} aprovado_por=${req.user.id}`);
      return res.json({ ok: true, message: 'Caso aprovado com sucesso' });
    } catch (err) {
      console.error(`[api/defesa/casos/:id/aprovar]`, err.message);
      return res.status(500).json({ ok: false, error: err.message });
    }
  });

  // ══════════════════════════════════════════════════════════════════════════
  // 4. PATCH /api/defesa/casos/:id/descartar
  //    Descarta um caso de defesa.
  // ══════════════════════════════════════════════════════════════════════════
  router.patch('/defesa/casos/:id/descartar', requireJwt, async (req, res) => {
    const { id } = req.params;

    try {
      const tenantId = await getTenantId(req.user.id, sbFetch);
      if (!tenantId) {
        return res.status(403).json({ ok: false, error: 'tenant não encontrado para este usuário' });
      }

      const result = await sbFetch(
        `defesa_casos?id=eq.${encodeURIComponent(id)}&tenant_id=eq.${encodeURIComponent(tenantId)}`,
        { method: 'PATCH', body: { status: 'descartado' } }
      );

      if (!result || (Array.isArray(result) && result.length === 0)) {
        return res.status(404).json({ ok: false, error: 'Caso não encontrado ou sem permissão' });
      }

      console.log(`[api/defesa/casos/${id}/descartar] tenant=${tenantId}`);
      return res.json({ ok: true, message: 'Caso descartado' });
    } catch (err) {
      console.error(`[api/defesa/casos/:id/descartar]`, err.message);
      return res.status(500).json({ ok: false, error: err.message });
    }
  });

  return router;
};
