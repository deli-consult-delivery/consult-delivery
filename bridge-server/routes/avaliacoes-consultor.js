'use strict';

// ════════════════════════════════════════════════════════════════════════════
// POST /api/avaliacoes/enviar-whatsapp — envio genérico ao WhatsApp (grupo/contato)
// para o painel "Resp. Avaliações" do Console (tabela legada `reviews`).
// Único caminho autorizado a chamar a Evolution API para esta tela — a key
// nunca deve existir no frontend.
// ════════════════════════════════════════════════════════════════════════════

const express = require('express');
const { z } = require('zod');
const { sendEvolutionText } = require('../lib/evolution-send');

const BodySchema = z.object({
  tenant_id: z.string().uuid(),
  chat_id:   z.string().min(1),
  texto:     z.string().min(1),
});

module.exports = function buildAvaliacoesConsultorRouter({ requireJwt, sbFetch, assertTenantMember }) {
  const router = express.Router();

  router.post('/avaliacoes/enviar-whatsapp', requireJwt, async (req, res) => {
    const parsed = BodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Dados inválidos', details: parsed.error.flatten() });
    }
    const { tenant_id, chat_id, texto } = parsed.data;

    try {
      if (!await assertTenantMember(req, res, tenant_id)) return;

      const result = await sendEvolutionText({ tenantId: tenant_id, number: chat_id, text: texto, sbFetch });
      if (!result.ok) {
        return res.status(502).json({ error: 'Falha ao enviar via Evolution', detail: result.detail });
      }
      res.json({ ok: true, message_id: result.message_id });
    } catch (err) {
      console.error('[avaliacoes-consultor POST /enviar-whatsapp]', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  return router;
};
