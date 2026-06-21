'use strict';

// ════════════════════════════════════════════════════════════════════════════
// CSAT — Link público de avaliação por conversa (endpoint autenticado JWT)
//
// Endpoints:
//   GET /api/avaliacao/link?conversation_id=<uuid>
//     Retorna o public_token e a URL pública para o cliente avaliar.
//     Requer JWT Supabase + membership no tenant da conversa.
// ════════════════════════════════════════════════════════════════════════════

const express = require('express');

const PUBLIC_BASE =
  process.env.VITE_PUBLIC_URL ||
  process.env.PUBLIC_BASE_URL ||
  'https://app.consultdelivery.com.br';

// ── Factory ──────────────────────────────────────────────────────────────────
module.exports = function buildAvaliacaoLinkRouter({ requireJwt, sbFetch, assertTenantMember }) {
  const router = express.Router();

  // ════════════════════════════════════════════════════════════════════════════
  // GET /api/avaliacao/link?conversation_id=<uuid>
  //    Retorna public_token + URL pública da avaliação.
  //    401 sem JWT, 400 sem conversation_id, 403 sem membership, 404 não encontrado.
  // ════════════════════════════════════════════════════════════════════════════
  router.get('/avaliacao/link', requireJwt, async (req, res) => {
    const { conversation_id } = req.query;

    if (!conversation_id) {
      return res.status(400).json({ error: 'conversation_id obrigatório' });
    }

    try {
      // Busca a avaliação pelo conversation_id (sem filtro de tenant ainda)
      const rows = await sbFetch(
        `atendimento_avaliacoes?conversation_id=eq.${encodeURIComponent(conversation_id)}&select=id,tenant_id,public_token,public_token_expires_at,status&limit=1`
      );
      const avaliacao = rows?.[0];

      if (!avaliacao) {
        return res.status(404).json({ error: 'avaliacao_nao_encontrada' });
      }

      // Checagem de tenant: usuário autenticado deve ser membro do tenant da avaliação
      if (!await assertTenantMember(req, res, avaliacao.tenant_id)) return;

      const token   = avaliacao.public_token;
      const url     = `${PUBLIC_BASE}/avaliacao/${token}`;

      return res.status(200).json({
        public_token: token,
        url,
        expires_at:   avaliacao.public_token_expires_at,
        status:       avaliacao.status,
      });
    } catch (err) {
      console.error('[avaliacao/link GET]', err.message);
      return res.status(500).json({ error: err.message });
    }
  });

  return router;
};
