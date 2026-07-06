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

// reviewId do iFood = UUID (hex + hífens) — mesma regra anti path-traversal de routes/ifood.js.
const REVIEW_ID_RE = /^[0-9A-Za-z-]+$/;
const TEXTO_MIN = 10;
const TEXTO_MAX = 300;
const DATA_RE = /^\d{4}-\d{2}-\d{2}$/; // yyyy-MM-dd — mesmo formato de <input type="date">

function dataInvalida(valor) {
  return valor !== undefined && !DATA_RE.test(valor);
}

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
        res.status(status).json({
          ok: false,
          status: err?.status ?? null,
          error: err?.message,
          // 429: expõe o Retry-After (em segundos) do iFood pro chamador respeitar.
          retryAfterSeconds: status === 429 && typeof err?.retryAfterMs === 'number'
            ? Math.ceil(err.retryAfterMs / 1000)
            : null,
          details: err?.body && typeof err.body === 'object'
            ? { message: err.body.message ?? null, code: err.body.code ?? null }
            : null,
        });
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

  // ── GET /ifood-api/merchant-interruptions/:lojaId — pausas ativas/agendadas ──
  router.get('/ifood-api/merchant-interruptions/:lojaId', requireJwtOrInternal, handle(async (req, res) => {
    const ctx = await resolveLojaGated(req, res);
    if (!ctx) return;
    const interrupcoes = await ifood.listarInterrupcoes(ctx.merchantId, ctx.loja.tenant_id);
    return { loja_id: ctx.loja.id, merchant_id: ctx.merchantId, interrupcoes };
  }));

  // ── GET /ifood-api/merchant-opening-hours/:lojaId — turnos de funcionamento ──
  router.get('/ifood-api/merchant-opening-hours/:lojaId', requireJwtOrInternal, handle(async (req, res) => {
    const ctx = await resolveLojaGated(req, res);
    if (!ctx) return;
    const horarios = await ifood.listarHorarios(ctx.merchantId, ctx.loja.tenant_id);
    return { loja_id: ctx.loja.id, merchant_id: ctx.merchantId, horarios };
  }));

  // ── GET /ifood-api/reviews/:lojaId — reviews da API + dupla-checagem × `avaliacoes` ─
  // Paginação opcional ?page=&size= (size máx. 50 — o iFood responde 400 acima disso;
  // rejeitamos antes de gastar uma chamada à rede). Filtro opcional ?dataInicio=&dataFim=
  // (yyyy-MM-dd) — critério "Filtro por data" do checklist de homologação Review.
  router.get('/ifood-api/reviews/:lojaId', requireJwtOrInternal, handle(async (req, res) => {
    const ctx = await resolveLojaGated(req, res);
    if (!ctx) return;
    const { page, size, dataInicio, dataFim } = req.query;
    if (size !== undefined && (!Number.isFinite(Number(size)) || Number(size) < 1 || Number(size) > 50)) {
      res.status(400).json({
        ok: false,
        error: 'size deve ser um número entre 1 e 50',
        code: 'PAGE_SIZE_INVALIDO',
        message: 'O tamanho da página (size) deve ser no máximo 50.',
      });
      return;
    }
    if (dataInvalida(dataInicio) || dataInvalida(dataFim)) {
      res.status(400).json({
        ok: false,
        error: 'dataInicio/dataFim devem estar no formato yyyy-MM-dd',
        code: 'DATA_INVALIDA',
        message: 'Informe as datas do filtro no formato yyyy-MM-dd (ex.: 2026-07-01).',
      });
      return;
    }
    const raw = await ifood.listarReviews(ctx.merchantId, { page, size, dataInicio, dataFim }, ctx.loja.tenant_id);
    const apiReviews = Array.isArray(raw) ? raw : (raw?.reviews ?? raw?.items ?? []);
    const avaliacoesRows = await sbFetch(
      `avaliacoes?loja_id=eq.${encodeURIComponent(ctx.loja.id)}&select=id,nota,comentario,nome_cliente`
    );
    const diff = compararReviews(apiReviews, avaliacoesRows || []);
    return {
      loja_id: ctx.loja.id,
      merchant_id: ctx.merchantId,
      reviews: apiReviews,
      page: raw?.page ?? (page !== undefined ? Number(page) : null),
      size: raw?.size ?? (size !== undefined ? Number(size) : null),
      total: raw?.total ?? null,
      pageCount: raw?.pageCount ?? null,
      diff,
    };
  }));

  // ── GET /ifood-api/reviews/:lojaId/:reviewId — detalhe de UMA review ────────
  // Critério "Obter detalhes" do checklist Review: 200 com todos os campos V2
  // (replies[].from MERCHANT|CUSTOMER); reviewId inexistente → 404 (repassado
  // direto do iFood pelo handle() genérico — sem tratamento especial aqui).
  router.get('/ifood-api/reviews/:lojaId/:reviewId', requireJwtOrInternal, handle(async (req, res) => {
    const { reviewId } = req.params;
    if (!REVIEW_ID_RE.test(reviewId)) {
      res.status(400).json({ ok: false, error: 'reviewId em formato inválido', code: 'REVIEW_ID_INVALIDO', message: 'reviewId em formato inválido.' });
      return;
    }
    const ctx = await resolveLojaGated(req, res);
    if (!ctx) return;
    const review = await ifood.getReviewDetalhe(ctx.merchantId, reviewId, ctx.loja.tenant_id);
    return { loja_id: ctx.loja.id, merchant_id: ctx.merchantId, review };
  }));

  // ── POST /ifood-api/reviews/:lojaId/:reviewId/draft — cria o DRAFT amarelo ──
  // (NÃO chama a API de escrita — só valida e registra o pedido). A escrita real
  // só ocorre em POST /ifood/aprovar/:draftId (routes/ifood.js), mesma porta
  // única usada por pausar/reabrir item — dispatcher genérico por
  // metadata.operacao (ifood.responder_review → lib.responderReview).
  router.post('/ifood-api/reviews/:lojaId/:reviewId/draft', requireJwtOrInternal, handle(async (req, res) => {
    // ?dryrun=1 NÃO vale aqui: ao contrário das rotas GET (só leem), esta rota cria
    // um agent_drafts REAL e aprovável — "testar sem migrar" criaria um draft de
    // verdade pra uma loja ainda em fonte_dados='portal'. resolveLojaGated aceita
    // dryrun (é read-only-friendly); rejeitamos explicitamente antes de chamá-lo.
    if (req.query.dryrun === '1') {
      res.status(400).json({
        ok: false,
        error: 'dryrun não é suportado nesta rota de escrita',
        code: 'DRYRUN_NAO_SUPORTADO',
        message: 'Esta rota cria um draft real e aprovável — não há modo dryrun para escrita.',
      });
      return;
    }
    const { reviewId } = req.params;
    if (!REVIEW_ID_RE.test(reviewId)) {
      res.status(400).json({ ok: false, error: 'reviewId em formato inválido', code: 'REVIEW_ID_INVALIDO', message: 'reviewId em formato inválido.' });
      return;
    }
    const texto = typeof req.body?.texto === 'string' ? req.body.texto.trim() : '';
    if (texto.length < TEXTO_MIN || texto.length > TEXTO_MAX) {
      res.status(400).json({
        ok: false,
        error: `texto deve ter entre ${TEXTO_MIN} e ${TEXTO_MAX} caracteres`,
        code: 'TEXTO_INVALIDO',
        message: `A resposta precisa ter entre ${TEXTO_MIN} e ${TEXTO_MAX} caracteres (recebido: ${texto.length}).`,
      });
      return;
    }

    const ctx = await resolveLojaGated(req, res);
    if (!ctx) return;

    const draft = await sbFetch('agent_drafts', {
      method: 'POST',
      prefer: 'return=representation',
      body: {
        tenant_id: ctx.loja.tenant_id,
        agent_name: 'BRENO',
        channel: 'painel',
        autonomy_level: 'amarelo', // valor EXATO — CHECK constraint
        status: 'pending',
        content: `Responder avaliação ${reviewId} no iFood`,
        metadata: {
          operacao: 'ifood.responder_review',
          merchant_id: ctx.merchantId,
          review_id: reviewId,
          texto,
          loja_id: ctx.loja.id,
          tenant_id: ctx.loja.tenant_id,
        },
      },
    });
    const row = Array.isArray(draft) ? draft[0] : draft;
    if (!row?.id) {
      throw new ifood.IfoodApiError('falha ao criar draft (insert sem retorno)', 0, null);
    }
    sbFetch('internal_notifications', {
      method: 'POST',
      body: {
        tenant_id: ctx.loja.tenant_id,
        recipient_user_id: null,
        kind: 'draft_pending',
        title: `Resposta de avaliação iFood aguardando aprovação`,
        body: `Agente BRENO propôs responder a avaliação ${reviewId}: "${texto}"`,
        link: '/avaliacoes',
      },
      prefer: 'return=minimal',
    }).catch((notifErr) => console.error('[ifood-api/reviews/draft] erro ao notificar draft:', notifErr.message));

    return { draft_id: row.id, review_id: reviewId, texto };
  }));

  // ── GET /ifood-api/summary/:lojaId — resumo de notas (Review API /summary) ──
  router.get('/ifood-api/summary/:lojaId', requireJwtOrInternal, handle(async (req, res) => {
    const ctx = await resolveLojaGated(req, res);
    if (!ctx) return;
    const summary = await ifood.getSummaryReviews(ctx.merchantId, ctx.loja.tenant_id);
    return { loja_id: ctx.loja.id, merchant_id: ctx.merchantId, summary };
  }));

  // ── GET /ifood-api/repasses/:lojaId — Settlement API (liquidação/repasses) ──
  // Filtro opcional ?dataInicio=&dataFim= (yyyy-MM-dd) — default 7 dias (mesmo
  // comportamento de listarVendas). CONFIRMADO LIVE (smoke 2026-07-06).
  router.get('/ifood-api/repasses/:lojaId', requireJwtOrInternal, handle(async (req, res) => {
    const { dataInicio, dataFim } = req.query;
    if (dataInvalida(dataInicio) || dataInvalida(dataFim)) {
      res.status(400).json({
        ok: false,
        error: 'dataInicio/dataFim devem estar no formato yyyy-MM-dd',
        code: 'DATA_INVALIDA',
        message: 'Informe as datas do filtro no formato yyyy-MM-dd (ex.: 2026-07-01).',
      });
      return;
    }
    const ctx = await resolveLojaGated(req, res);
    if (!ctx) return;
    const repasses = await ifood.listarRepasses(ctx.merchantId, { dataInicio, dataFim }, ctx.loja.tenant_id);
    return { loja_id: ctx.loja.id, merchant_id: ctx.merchantId, repasses };
  }));

  // ── GET /ifood-api/antecipacoes/:lojaId — Anticipation API (D+1/D+7) ────────
  // Filtro opcional ?dataInicio=&dataFim= (yyyy-MM-dd) — default 7 dias, mesmo
  // padrão de repasses/vendas. CONFIRMADO LIVE (smoke 2026-07-06): o filtro é
  // um intervalo, não uma data única — a doc pública original sugeria
  // calculationDate/anticipatedPaymentDate como mutuamente exclusivos, mas o
  // sandbox real exige beginCalculationDate/endCalculationDate (par).
  router.get('/ifood-api/antecipacoes/:lojaId', requireJwtOrInternal, handle(async (req, res) => {
    const { dataInicio, dataFim } = req.query;
    if (dataInvalida(dataInicio) || dataInvalida(dataFim)) {
      res.status(400).json({
        ok: false,
        error: 'dataInicio/dataFim devem estar no formato yyyy-MM-dd',
        code: 'DATA_INVALIDA',
        message: 'Informe as datas do filtro no formato yyyy-MM-dd (ex.: 2026-07-01).',
      });
      return;
    }
    const ctx = await resolveLojaGated(req, res);
    if (!ctx) return;
    const antecipacoes = await ifood.listarAntecipacoes(ctx.merchantId, { dataInicio, dataFim }, ctx.loja.tenant_id);
    return { loja_id: ctx.loja.id, merchant_id: ctx.merchantId, antecipacoes };
  }));

  // ── GET /ifood-api/ocorrencias/:lojaId — ajustes/chargebacks (NÃO RESOLVIDO,
  // ver cabeçalho de lib.listarOcorrencias — path ainda não confirmado 200) ──
  // Filtro opcional ?dataInicio=&dataFim= (yyyy-MM-dd) — default 7 dias.
  router.get('/ifood-api/ocorrencias/:lojaId', requireJwtOrInternal, handle(async (req, res) => {
    const { dataInicio, dataFim } = req.query;
    if (dataInvalida(dataInicio) || dataInvalida(dataFim)) {
      res.status(400).json({
        ok: false,
        error: 'dataInicio/dataFim devem estar no formato yyyy-MM-dd',
        code: 'DATA_INVALIDA',
        message: 'Informe as datas do filtro no formato yyyy-MM-dd (ex.: 2026-07-01).',
      });
      return;
    }
    const ctx = await resolveLojaGated(req, res);
    if (!ctx) return;
    const ocorrencias = await ifood.listarOcorrencias(ctx.merchantId, { dataInicio, dataFim }, ctx.loja.tenant_id);
    return { loja_id: ctx.loja.id, merchant_id: ctx.merchantId, ocorrencias };
  }));

  // ── Events (módulo /events/v1.0) — ESQUELETO MÍNIMO, NÃO usado pela tela de
  // Finanças. Ver docs/integracoes/ifood/events-modulo-analise.md: este módulo é
  // o barramento de eventos de PEDIDOS (Order/PDV), não dado financeiro. Mantido
  // read-safe (poll + ack) só para não deixar código especulativo sem cobertura;
  // nenhuma tela/task chama estas rotas hoje.
  //
  // GET /ifood-api/events/:lojaId — polling de eventos novos (filtrado pelo
  // merchant da loja via header x-polling-merchants). ?groups=&types= opcionais
  // (passthrough, aceitam lista separada por vírgula).
  router.get('/ifood-api/events/:lojaId', requireJwtOrInternal, handle(async (req, res) => {
    const ctx = await resolveLojaGated(req, res);
    if (!ctx) return;
    const { groups, types } = req.query;
    const eventos = await ifood.listarEventos(
      { merchantIds: ctx.merchantId, groups, types },
      ctx.loja.tenant_id
    );
    return { loja_id: ctx.loja.id, merchant_id: ctx.merchantId, eventos };
  }));

  // ── POST /ifood-api/events/:lojaId/ack — acknowledgment de eventos recebidos
  // no polling. Body: { eventIds: string[] } (1-2000 ids). NÃO confirma pedido
  // (Order confirm/dispatch) — só o protocolo do módulo Events ("recebi").
  router.post('/ifood-api/events/:lojaId/ack', requireJwtOrInternal, handle(async (req, res) => {
    const eventIds = Array.isArray(req.body?.eventIds) ? req.body.eventIds : null;
    if (!eventIds || eventIds.length === 0) {
      res.status(400).json({
        ok: false,
        error: 'eventIds (array não-vazio) é obrigatório',
        code: 'EVENT_IDS_INVALIDO',
        message: 'Informe eventIds como um array não-vazio de IDs de evento.',
      });
      return;
    }
    const ctx = await resolveLojaGated(req, res);
    if (!ctx) return;
    const resultado = await ifood.confirmarEventos(eventIds, ctx.loja.tenant_id);
    return { loja_id: ctx.loja.id, merchant_id: ctx.merchantId, ack: resultado, total: eventIds.length };
  }));

  return router;
};
