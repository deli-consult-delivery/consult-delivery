// bridge-server/routes/ifood.js
// Endpoints de LEITURA da API do iFood. Ponto único de contato:
//   Console v2 (JWT do usuário) e Hermes (x-internal-token) chamam aqui;
//   o Bridge injeta o Bearer (client_credentials) via lib/ifood.js.
//
// Auth: requireJwtOrInternal — aceita JWT do Console OU x-internal-token.
// Fase 1 = GET (leitura). Escrita (pausar item/loja, responder review) = Fase 2+.
'use strict';

module.exports = function ({ requireJwtOrInternal, ifood, supabaseSelect }) {
  const router = require('express').Router();

  // Wrapper: executa um método do iFood e devolve JSON padronizado.
  // Erros viram { ok:false, status, error, details } sem derrubar o Bridge.
  // `details` carrega o corpo de erro do próprio iFood (IfoodApiError.body) —
  // sem ele o cliente só veria "retornou 400", perdendo a regra de negócio real.
  function handle(fn) {
    return async (req, res) => {
      try {
        const data = await fn(req);
        res.json({ ok: true, data });
      } catch (err) {
        const status = err && typeof err.status === 'number' && err.status >= 400 ? err.status : 502;
        console.error(`[ifood] ${req.path} erro ${err.status ?? '?'}: ${err.message}`, err.body ?? '');
        res.status(status).json({
          ok: false,
          status: err.status ?? null,
          error: err.message,
          details: err.body ?? null,
        });
      }
    };
  }

  // Resolve o merchantId da chamada, na ordem:
  //   1. ?merchantId= direto na query;
  //   2. ?tenant_id= → ifood_merchants (service_role, bypassa RLS — isolamento
  //      é o filtro { tenant_id } em código de aplicação, ver §5.4 do plano);
  //   3. fallback IFOOD_MERCHANT_ID (loja piloto, env do Bridge).
  async function resolveMerchantId(req) {
    const direct = req.query.merchantId;
    if (direct) return String(direct);

    const tenantId = req.query.tenant_id;
    if (tenantId && supabaseSelect) {
      const row = await supabaseSelect('ifood_merchants', { tenant_id: tenantId });
      if (row?.merchant_id) return String(row.merchant_id);
    }

    const fallback = process.env.IFOOD_MERCHANT_ID;
    if (fallback) return fallback;

    const { IfoodApiError } = ifood;
    throw new IfoodApiError(
      'merchantId não resolvido: informe ?merchantId= ou ?tenant_id= (com ifood_merchants), ou configure IFOOD_MERCHANT_ID no env do Bridge.',
      0,
      null
    );
  }

  // tenantId para o lazy getter de credencial (Fase 1: 1 par CD; Fase 4 resolve).
  const tid = (req) => req.query.tenant_id || undefined;

  // ── Catálogo — lista catálogos (e itens vendáveis se ?groupId=) ──────────────
  router.get('/ifood/catalogo', requireJwtOrInternal, handle(async (req) => {
    const merchantId = await resolveMerchantId(req);
    const { groupId } = req.query;
    if (groupId) return ifood.listarSellableItems(merchantId, groupId, tid(req));
    return ifood.listarCatalogos(merchantId, tid(req));
  }));

  // ── Status da loja — aberta/fechada agora ────────────────────────────────────
  router.get('/ifood/status', requireJwtOrInternal, handle(async (req) => {
    const merchantId = await resolveMerchantId(req);
    return ifood.getStatusLoja(merchantId, tid(req));
  }));

  // ── Avaliações ───────────────────────────────────────────────────────────────
  router.get('/ifood/reviews', requireJwtOrInternal, handle(async (req) => {
    const merchantId = await resolveMerchantId(req);
    return ifood.listarReviews(merchantId, tid(req));
  }));

  // ── Vendas — por período (?dataInicio=&dataFim=) ─────────────────────────────
  router.get('/ifood/vendas', requireJwtOrInternal, handle(async (req) => {
    const merchantId = await resolveMerchantId(req);
    const { dataInicio, dataFim } = req.query;
    return ifood.listarVendas(merchantId, { dataInicio, dataFim }, tid(req));
  }));

  return router;
};
