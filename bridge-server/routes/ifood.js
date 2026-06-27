// bridge-server/routes/ifood.js
// Endpoints de LEITURA da API do iFood. Ponto único de contato:
//   Console v2 (JWT do usuário) e Hermes (x-internal-token) chamam aqui;
//   o Bridge injeta o Bearer (client_credentials) via lib/ifood.js.
//
// Auth: requireJwtOrInternal — aceita JWT do Console OU x-internal-token.
// Fase 1 = GET (leitura). Escrita (pausar item/loja, responder review) = Fase 2+.
//
// ISOLAMENTO DE TENANT (anti-IDOR cross-tenant):
//   - Chamada de USUÁRIO (JWT): requireJwt populou req.user. O tenant_id da query
//     só é aceito após assertTenantMember() — mesma checagem de membership que
//     /api/lojas usa. Sem membership → 403. É isto que liga a credencial global do
//     iFood ao tenant a que o usuário realmente pertence.
//   - Chamada INTERNA (x-internal-token): requireJwtOrInternal deu next() SEM
//     popular req.user. É uma task Trigger.dev server-side (confiável) → o
//     tenant_id da query é confiável e o fallback IFOOD_MERCHANT_ID do env vale.
'use strict';

// merchant id do iFood = UUID (hex + hífens). Rejeita qualquer coisa fora disso
// ANTES de interpolar na URL (anti path traversal / injeção de path).
const MERCHANT_ID_RE = /^[0-9A-Za-z-]+$/;

module.exports = function ({ requireJwtOrInternal, ifood, supabaseSelect, assertTenantMember }) {
  const router = require('express').Router();

  // Wrapper: executa um método do iFood e devolve JSON padronizado.
  // Erros viram { ok:false, status, error } sem derrubar o Bridge. NÃO ecoamos
  // err.body cru ao cliente (pode vazar detalhe interno do iFood) — só os campos
  // seguros message/code; o corpo completo fica no log do servidor.
  function handle(fn) {
    return async (req, res) => {
      try {
        const data = await fn(req, res);
        // se o handler já respondeu (ex.: 403/400 do gate de tenant), não duplica
        if (res.headersSent) return;
        res.json({ ok: true, data });
      } catch (err) {
        const status = err && typeof err.status === 'number' && err.status >= 400 ? err.status : 502;
        const bodyStr = String(JSON.stringify(err?.body ?? '')).slice(0, 200);
        console.error(`[ifood] ${req.path} erro ${err?.status ?? '?'}: ${err?.message}`, bodyStr);
        res.status(status).json({
          ok: false,
          status: err?.status ?? null,
          error: err?.message,
          // só campos seguros do erro de negócio do iFood; nunca o body cru
          details: err?.body && typeof err.body === 'object'
            ? { message: err.body.message ?? null, code: err.body.code ?? null }
            : null,
        });
      }
    };
  }

  // Resolve o tenant_id da chamada conforme a origem:
  //   - USUÁRIO (req.user presente): tenant_id da query SÓ vale após membership.
  //     Sem ?tenant_id= ou sem membership → null (handler retorna erro).
  //   - INTERNO (req.user ausente): tenant_id da query é confiável (task server-side).
  // Retorna { tenantId, internal } ou null (com resposta já enviada em caso 403).
  async function resolveTenant(req, res) {
    const internal = !req.user; // requireJwtOrInternal não popula req.user no caso interno
    const tenantId = req.query.tenant_id ? String(req.query.tenant_id) : null;

    if (internal) return { tenantId, internal: true };

    // Usuário: exige tenant_id e membership comprovada (mesmo gate de /api/lojas).
    if (!tenantId) {
      res.status(400).json({ ok: false, error: 'tenant_id obrigatório' });
      return null;
    }
    if (!(await assertTenantMember(req, res, tenantId))) return null; // já respondeu 403
    return { tenantId, internal: false };
  }

  // Resolve o merchantId SEMPRE por tenant_id → ifood_merchants (isolamento por
  // ownership). ?merchantId= direto, se vier, tem que pertencer ao tenant resolvido.
  // Fallback IFOOD_MERCHANT_ID (loja piloto) só para chamada interna.
  // Valida formato antes de devolver (anti path traversal).
  async function resolveMerchantId(req, tenantId, internal) {
    const { IfoodApiError } = ifood;
    const requested = req.query.merchantId ? String(req.query.merchantId) : null;

    let merchantId = null;
    if (tenantId && supabaseSelect) {
      const row = await supabaseSelect('ifood_merchants', { tenant_id: tenantId });
      const owned = row?.merchant_id ? String(row.merchant_id) : null;
      if (requested) {
        // atalho ?merchantId= só vale se for o merchant do próprio tenant
        if (owned && owned === requested) merchantId = owned;
        else throw new IfoodApiError('merchantId não pertence ao tenant', 0, null);
      } else {
        merchantId = owned;
      }
    } else if (requested && internal) {
      // sem tenant resolvível e chamada interna: aceita o merchantId pedido
      merchantId = requested;
    }

    if (!merchantId && internal) {
      const fallback = process.env.IFOOD_MERCHANT_ID;
      if (fallback) merchantId = String(fallback);
    }

    if (!merchantId) {
      throw new IfoodApiError(
        'merchantId não resolvido: nenhum ifood_merchants para o tenant (e sem fallback aplicável).',
        0,
        null
      );
    }
    if (!MERCHANT_ID_RE.test(merchantId)) {
      throw new IfoodApiError('merchantId em formato inválido', 400, null);
    }
    return merchantId;
  }

  // Pipeline comum: resolve tenant (com gate de membership) → resolve merchant.
  // Retorna { tenantId, merchantId } ou null (resposta já enviada).
  async function resolveContext(req, res) {
    const ctx = await resolveTenant(req, res);
    if (!ctx) return null;
    const merchantId = await resolveMerchantId(req, ctx.tenantId, ctx.internal);
    return { tenantId: ctx.tenantId, merchantId };
  }

  // ── Catálogo — lista catálogos (e itens vendáveis se ?groupId=) ──────────────
  router.get('/ifood/catalogo', requireJwtOrInternal, handle(async (req, res) => {
    const ctx = await resolveContext(req, res);
    if (!ctx) return;
    const { groupId } = req.query;
    if (groupId) {
      if (!MERCHANT_ID_RE.test(String(groupId))) {
        throw new ifood.IfoodApiError('groupId em formato inválido', 400, null);
      }
      return ifood.listarSellableItems(ctx.merchantId, String(groupId), ctx.tenantId);
    }
    return ifood.listarCatalogos(ctx.merchantId, ctx.tenantId);
  }));

  // ── Status da loja — aberta/fechada agora ────────────────────────────────────
  router.get('/ifood/status', requireJwtOrInternal, handle(async (req, res) => {
    const ctx = await resolveContext(req, res);
    if (!ctx) return;
    return ifood.getStatusLoja(ctx.merchantId, ctx.tenantId);
  }));

  // ── Avaliações ───────────────────────────────────────────────────────────────
  router.get('/ifood/reviews', requireJwtOrInternal, handle(async (req, res) => {
    const ctx = await resolveContext(req, res);
    if (!ctx) return;
    return ifood.listarReviews(ctx.merchantId, ctx.tenantId);
  }));

  // ── Vendas — por período (?dataInicio=&dataFim=) ─────────────────────────────
  router.get('/ifood/vendas', requireJwtOrInternal, handle(async (req, res) => {
    const ctx = await resolveContext(req, res);
    if (!ctx) return;
    const { dataInicio, dataFim } = req.query;
    return ifood.listarVendas(ctx.merchantId, { dataInicio, dataFim }, ctx.tenantId);
  }));

  return router;
};
