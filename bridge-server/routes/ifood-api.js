// bridge-server/routes/ifood-api.js
// Frente A fase 2 (Plano Integração iFood §2 A2): rotas read-only da API oficial
// do iFood (lib/ifood.js) atrás da flag `lojas.fonte_dados`. Migração gradual,
// loja a loja — enquanto a flag estiver em 'portal', a fonte de verdade continua
// sendo o ifood-portal-worker (esta rota fica bloqueada, exceto com ?dryrun=1
// para testar sem migrar de verdade). Sem credencial no env → 503 limpo, nunca crash.
//
// Auth: requireJwtOrInternal (mesmo padrão de routes/ifood.js). Chamada de
// usuário exige membership do tenant da loja (anti-IDOR); chamada interna
// (x-internal-token) não popula req.user e pula esse gate.
'use strict';

const { compararReviews } = require('../lib/ifood-dupla-checagem');

module.exports = function ({ requireJwtOrInternal, ifood, sbFetch, assertTenantMember }) {
  const router = require('express').Router();

  function handle(fn) {
    return async (req, res) => {
      try {
        const data = await fn(req, res);
        if (res.headersSent) return; // gate já respondeu (404/409/403)
        res.json({ ok: true, data });
      } catch (err) {
        // credencial ausente (getIfoodConfig) → 503 explícito, nunca 502 genérico
        if (err?.name === 'IfoodApiError' && err.status === 0 && /credencial/i.test(err.message || '')) {
          res.status(503).json({ ok: false, error: 'credencial não configurada' });
          return;
        }
        const status = err && typeof err.status === 'number' && err.status >= 400 ? err.status : 502;
        console.error(`[ifood-api] ${req.path} erro ${err?.status ?? '?'}: ${err?.message}`);
        res.status(status).json({ ok: false, status: err?.status ?? null, error: err?.message });
      }
    };
  }

  // Resolve a loja, checa membership (anti-IDOR) e a flag fonte_dados. ?dryrun=1
  // libera o teste da rota mesmo com a flag em 'portal' (sem migrar de verdade).
  // Retorna { loja, merchantId } ou null (resposta já enviada pelo gate).
  async function resolveLojaGated(req, res) {
    const { lojaId } = req.params;
    const rows = await sbFetch(
      `lojas?id=eq.${encodeURIComponent(lojaId)}&select=id,tenant_id,fonte_dados&limit=1`
    );
    const loja = Array.isArray(rows) ? rows[0] : null;
    if (!loja) {
      res.status(404).json({ ok: false, error: 'loja não encontrada' });
      return null;
    }
    if (req.user && !(await assertTenantMember(req, res, loja.tenant_id))) return null;

    const dryrun = req.query.dryrun === '1';
    if (loja.fonte_dados !== 'api' && !dryrun) {
      res.status(409).json({
        ok: false,
        error: "loja não está em fonte_dados='api' — use ?dryrun=1 para testar sem migrar",
      });
      return null;
    }

    const merchRows = await sbFetch(
      `ifood_merchants?tenant_id=eq.${encodeURIComponent(loja.tenant_id)}&select=merchant_id&limit=1`
    );
    const merchantId = merchRows?.[0]?.merchant_id ? String(merchRows[0].merchant_id) : null;
    if (!merchantId) {
      res.status(404).json({ ok: false, error: 'loja sem ifood_merchants vinculado' });
      return null;
    }
    return { loja, merchantId };
  }

  // ── GET /ifood-api/merchant-status/:lojaId ──────────────────────────────────
  router.get('/ifood-api/merchant-status/:lojaId', requireJwtOrInternal, handle(async (req, res) => {
    const ctx = await resolveLojaGated(req, res);
    if (!ctx) return;
    const status = await ifood.getStatusLoja(ctx.merchantId, ctx.loja.tenant_id);
    return { loja_id: ctx.loja.id, merchant_id: ctx.merchantId, status };
  }));

  // ── GET /ifood-api/reviews/:lojaId — reviews da API + dupla-checagem × `avaliacoes` ─
  router.get('/ifood-api/reviews/:lojaId', requireJwtOrInternal, handle(async (req, res) => {
    const ctx = await resolveLojaGated(req, res);
    if (!ctx) return;
    const raw = await ifood.listarReviews(ctx.merchantId, ctx.loja.tenant_id);
    const apiReviews = Array.isArray(raw) ? raw : (raw?.reviews ?? raw?.items ?? []);
    const avaliacoesRows = await sbFetch(
      `avaliacoes?loja_id=eq.${encodeURIComponent(ctx.loja.id)}&select=id,nota,comentario,nome_cliente`
    );
    const diff = compararReviews(apiReviews, avaliacoesRows || []);
    return { loja_id: ctx.loja.id, merchant_id: ctx.merchantId, reviews: apiReviews, diff };
  }));

  return router;
};
