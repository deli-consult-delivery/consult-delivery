'use strict';

// ════════════════════════════════════════════════════════════════════════════
// NPS de Marca — Link para o CRM (endpoint autenticado JWT)
//
// Endpoints:
//   GET /api/nps/link?contact_identifier=<whatsapp_chat_id>
//     Retorna o token NPS ativo/pendente do contato.
//     Se em cooldown (nenhum token pendente recente) → 204 { disponivel: false }.
//     Requer JWT Supabase + membership no tenant.
// ════════════════════════════════════════════════════════════════════════════

const express = require('express');

const PUBLIC_BASE =
  process.env.VITE_PUBLIC_URL ||
  process.env.PUBLIC_BASE_URL ||
  'https://app.consultdelivery.com.br';

module.exports = function buildNpsLinkRouter({ requireJwt, sbFetch, assertTenantMember }) {
  const router = express.Router();

  // ════════════════════════════════════════════════════════════════════════════
  // GET /api/nps/link?contact_identifier=<id>&tenant_id=<uuid>
  //   tenant_id obrigatório para validar membership.
  //   contact_identifier = whatsapp_chat_id do contato.
  //   200 → { public_token, url, expires_at, status } (token pendente disponível)
  //   204 → { disponivel: false } (em cooldown — CRM não deve enviar NPS agora)
  //   400 → parâmetros faltando
  //   401 → sem JWT
  //   403 → não é membro do tenant
  // ════════════════════════════════════════════════════════════════════════════
  router.get('/nps/link', requireJwt, async (req, res) => {
    const { contact_identifier, tenant_id } = req.query;

    if (!contact_identifier || !tenant_id) {
      return res.status(400).json({ error: 'contact_identifier e tenant_id obrigatórios' });
    }

    if (!await assertTenantMember(req, res, tenant_id)) return;

    try {
      // Buscar NPS mais recente do contato neste tenant (qualquer status)
      const rows = await sbFetch(
        `nps_avaliacoes?tenant_id=eq.${encodeURIComponent(tenant_id)}&contact_identifier=eq.${encodeURIComponent(contact_identifier)}&select=public_token,public_token_expires_at,status,created_at&order=created_at.desc&limit=1`
      );
      const nps = rows?.[0];

      if (!nps) {
        // Nunca teve NPS → cooldown não aplica, mas também não há token (trigger ainda não rodou)
        return res.status(204).json({ disponivel: false });
      }

      // Se o mais recente está pendente → disponível para envio
      if (nps.status === 'pendente') {
        const url = `${PUBLIC_BASE}/nps/${nps.public_token}`;
        return res.status(200).json({
          public_token: nps.public_token,
          url,
          expires_at:   nps.public_token_expires_at,
          status:       nps.status,
        });
      }

      // Verificar cooldown: se o mais recente foi criado há menos de 30 dias → em cooldown
      const criadoEm  = new Date(nps.created_at);
      const trintaDias = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      if (criadoEm > trintaDias) {
        return res.status(200).json({ disponivel: false });
      }

      // Passou dos 30 dias — trigger deveria ter gerado novo token no próximo fechamento
      return res.status(200).json({ disponivel: false });
    } catch (err) {
      console.error('[nps/link GET]', err.message);
      return res.status(500).json({ error: err.message });
    }
  });

  return router;
};
