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

// Operações de ESCRITA suportadas no MVP gated (F2 onda 1 + Merchant/Review homologação).
// Cada uma mapeia para um método SEM retry do lib/ifood.js, despachado SÓ no
// /aprovar. `argKeys` lista os campos de metadata (na ordem) passados ao método
// APÓS merchantId e ANTES de tenantId — pausar/reabrir usam só item_id;
// responder_review precisa de review_id + texto; Merchant usa interrupcao
// (objeto {start,end,description}), interruption_id ou shifts (array).
const OPERACOES_ESCRITA = {
  'ifood.pausar_item': { metodo: 'pausarItem', verbo: 'Pausar', agent: 'BRENO', argKeys: ['item_id'] },
  'ifood.reabrir_item': { metodo: 'reabrirItem', verbo: 'Reabrir', agent: 'BRENO', argKeys: ['item_id'] },
  'ifood.responder_review': { metodo: 'responderReview', verbo: 'Responder avaliação', agent: 'BRENO', argKeys: ['review_id', 'texto'] },
  'ifood.pausar_loja': { metodo: 'criarInterrupcao', verbo: 'Pausar loja', agent: 'BRENO', argKeys: ['interrupcao'] },
  'ifood.despausar_loja': { metodo: 'removerInterrupcao', verbo: 'Despausar loja', agent: 'BRENO', argKeys: ['interruption_id'] },
  'ifood.atualizar_horarios': { metodo: 'atualizarHorarios', verbo: 'Atualizar horários', agent: 'BRENO', argKeys: ['shifts'] },
};

module.exports = function ({ requireJwtOrInternal, ifood, supabaseSelect, assertTenantMember, sbFetch, supabaseInsert }) {
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
          // 429: expõe o Retry-After (em segundos) do iFood pro chamador respeitar.
          retryAfterSeconds: status === 429 && typeof err?.retryAfterMs === 'number'
            ? Math.ceil(err.retryAfterMs / 1000)
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

  // ── Cardápio AGREGADO — catálogos→categorias→itens com disponibilidade efetiva ─
  // Alimenta a tela de Cardápio iFood. Read-only, sem draft.
  router.get('/ifood/cardapio', requireJwtOrInternal, handle(async (req, res) => {
    const ctx = await resolveContext(req, res);
    if (!ctx) return;
    return ifood.getCardapio(ctx.merchantId, ctx.tenantId);
  }));

  // ── Status da loja — aberta/fechada agora ────────────────────────────────────
  router.get('/ifood/status', requireJwtOrInternal, handle(async (req, res) => {
    const ctx = await resolveContext(req, res);
    if (!ctx) return;
    return ifood.getStatusLoja(ctx.merchantId, ctx.tenantId);
  }));

  // ── Avaliações — paginação opcional (?page=&size=) ──────────────────────────
  router.get('/ifood/reviews', requireJwtOrInternal, handle(async (req, res) => {
    const ctx = await resolveContext(req, res);
    if (!ctx) return;
    const { page, size } = req.query;
    return ifood.listarReviews(ctx.merchantId, { page, size }, ctx.tenantId);
  }));

  // ── Vendas — por período (?dataInicio=&dataFim=) ─────────────────────────────
  router.get('/ifood/vendas', requireJwtOrInternal, handle(async (req, res) => {
    const ctx = await resolveContext(req, res);
    if (!ctx) return;
    const { dataInicio, dataFim } = req.query;
    return ifood.listarVendas(ctx.merchantId, { dataInicio, dataFim }, ctx.tenantId);
  }));

  // ── Resolve item_nome|externalCode → itemId varrendo as categorias do merchant ─
  // O cardápio não é sincronizado ainda (F1 read-only), então resolvemos ao vivo:
  // catálogos → categorias → buscarItemPorNomeOuExternalCode. NUNCA chuta: agrega
  // candidatos de TODAS as categorias e exige match único (regra §5.5).
  async function resolverItem(merchantId, tenantId, { item_nome, external_code }) {
    const catalogos = await ifood.listarCatalogos(merchantId, tenantId);
    const cats = Array.isArray(catalogos) ? catalogos : (catalogos?.catalogs ?? catalogos?.items ?? []);
    const catalogIds = cats
      .map((c) => (c?.catalogId ?? c?.groupId ?? c?.id))
      .filter(Boolean)
      .map(String);

    const candidatosGlobais = [];
    for (const catalogId of catalogIds) {
      let categorias;
      try {
        categorias = await ifood.listarCategorias(merchantId, catalogId, tenantId);
      } catch (_) {
        continue; // catálogo sem categorias legíveis não derruba a busca
      }
      const lista = Array.isArray(categorias) ? categorias : (categorias?.categories ?? categorias?.items ?? []);
      for (const cat of lista) {
        const categoryId = cat?.id ?? cat?.categoryId;
        if (!categoryId) continue;
        const r = await ifood.buscarItemPorNomeOuExternalCode(merchantId, String(categoryId), {
          nome: item_nome,
          externalCode: external_code,
        });
        if (r.ok) candidatosGlobais.push({ match: r.item, categoryId: String(categoryId) });
        else if (r.motivo === 'ambiguo') {
          // ambiguidade dentro de uma categoria já é desambiguação obrigatória
          return { ok: false, motivo: 'ambiguo', candidatos: r.candidatos };
        }
      }
    }

    if (candidatosGlobais.length === 1) return { ok: true, item: candidatosGlobais[0].match };
    if (candidatosGlobais.length === 0) return { ok: false, motivo: 'nao_encontrado', candidatos: [] };
    return {
      ok: false,
      motivo: 'ambiguo',
      candidatos: candidatosGlobais.map((c) => ({ itemId: c.match.itemId, nome: c.match.nome })),
    };
  }

  // ════════════════════════════════════════════════════════════════════════════
  // POST /ifood/acao — cria o DRAFT amarelo (NÃO executa a escrita).
  //   body { operacao, parametros:{ item_nome?|external_code? } }
  //   operacao ∈ ifood.pausar_item | ifood.reabrir_item.
  //   Resolve merchant pelo tenant, resolve o item ao vivo. Ambíguo/não-encontrado
  //   → 422 com candidatos (sem criar draft). Resolvido → INSERT agent_drafts
  //   (autonomy_level='amarelo', status='pending'). A escrita real só ocorre no
  //   /aprovar — aqui nada toca a API de escrita do iFood.
  // ════════════════════════════════════════════════════════════════════════════
  // Monta { content, metadata } por operação. Item (pausar/reabrir) resolve o
  // cardápio ao vivo (nunca chuta — ambíguo/não-encontrado é reportado ANTES de
  // chegar aqui, ver chamador). Loja/horários usam os parâmetros direto (o
  // humano no front escolhe start/end/turnos — não há o que desambiguar).
  // Retorna null e já responde (400/422) se a validação falhar.
  async function prepararDraftIfood(res, operacao, spec, parametros, ctx) {
    if (operacao === 'ifood.pausar_item' || operacao === 'ifood.reabrir_item') {
      const item_nome = parametros?.item_nome ? String(parametros.item_nome) : null;
      const external_code = parametros?.external_code ? String(parametros.external_code) : null;
      if (!item_nome && !external_code) {
        res.status(400).json({ ok: false, error: 'parametros.item_nome ou parametros.external_code obrigatório' });
        return null;
      }
      const resolved = await resolverItem(ctx.merchantId, ctx.tenantId, { item_nome, external_code });
      if (!resolved.ok) {
        // NÃO cria draft: devolve candidatos p/ o humano desambiguar (nunca chuta)
        res.status(422).json({
          ok: false,
          error: resolved.motivo === 'ambiguo'
            ? 'Mais de um item casou — desambigue.'
            : 'Nenhum item casou com o nome/externalCode informado.',
          motivo: resolved.motivo,
          candidatos: resolved.candidatos,
        });
        return null;
      }
      const alvo = item_nome || external_code;
      return {
        content: `${spec.verbo} ${resolved.item.nome || alvo} no iFood`,
        metadata: {
          operacao,
          merchant_id: ctx.merchantId,
          item_id: resolved.item.itemId,
          product_id: resolved.item.productId ?? null,
          item_nome: resolved.item.nome ?? null,
          tenant_id: ctx.tenantId,
        },
      };
    }

    if (operacao === 'ifood.pausar_loja') {
      const { start, end, description } = parametros || {};
      if (!start || !end) {
        res.status(400).json({ ok: false, error: 'parametros.start e parametros.end (ISO 8601) são obrigatórios' });
        return null;
      }
      return {
        content: `Pausar loja no iFood (${start} → ${end})`,
        metadata: {
          operacao,
          merchant_id: ctx.merchantId,
          interrupcao: { start: String(start), end: String(end), description: description ? String(description) : null },
          tenant_id: ctx.tenantId,
        },
      };
    }

    if (operacao === 'ifood.despausar_loja') {
      const interruption_id = parametros?.interruption_id ? String(parametros.interruption_id) : null;
      if (!interruption_id) {
        res.status(400).json({ ok: false, error: 'parametros.interruption_id é obrigatório' });
        return null;
      }
      return {
        content: `Remover pausa da loja no iFood (${interruption_id})`,
        metadata: { operacao, merchant_id: ctx.merchantId, interruption_id, tenant_id: ctx.tenantId },
      };
    }

    // ifood.atualizar_horarios
    const shifts = Array.isArray(parametros?.shifts) ? parametros.shifts : null;
    if (!shifts || shifts.length === 0) {
      res.status(400).json({ ok: false, error: 'parametros.shifts (array) é obrigatório' });
      return null;
    }
    return {
      content: 'Atualizar horários de funcionamento no iFood',
      metadata: { operacao, merchant_id: ctx.merchantId, shifts, tenant_id: ctx.tenantId },
    };
  }

  router.post('/ifood/acao', requireJwtOrInternal, handle(async (req, res) => {
    const { operacao, parametros } = req.body || {};
    const spec = OPERACOES_ESCRITA[operacao];
    if (!spec) {
      res.status(400).json({ ok: false, error: `operacao inválida: ${operacao ?? '(ausente)'}` });
      return;
    }

    const ctx = await resolveContext(req, res);
    if (!ctx) return; // resposta (400/403) já enviada pelo gate de tenant
    if (!ctx.tenantId) {
      res.status(400).json({ ok: false, error: 'tenant_id obrigatório para criar draft' });
      return;
    }

    const prep = await prepararDraftIfood(res, operacao, spec, parametros, ctx);
    if (!prep) return; // validação falhou — resposta já enviada
    const { content, metadata } = prep;

    const draft = await sbFetch('agent_drafts', {
      method: 'POST',
      prefer: 'return=representation',
      body: {
        tenant_id: ctx.tenantId,
        agent_name: spec.agent,
        channel: 'painel',
        autonomy_level: 'amarelo', // valor EXATO — CHECK constraint
        status: 'pending',
        content,
        metadata,
      },
    });
    const row = Array.isArray(draft) ? draft[0] : draft;
    if (!row?.id) {
      throw new ifood.IfoodApiError('falha ao criar draft (insert sem retorno)', 0, null);
    }
    sbFetch('internal_notifications', {
      method: 'POST',
      body: {
        tenant_id:         ctx.tenantId,
        recipient_user_id: null,
        kind:              'draft_pending',
        title:             `Ação iFood aguardando aprovação: ${content}`,
        body:              `Agente ${spec.agent} propôs: ${content}.`,
        link:              '/ifood',
      },
      prefer: 'return=minimal',
    }).catch(notifErr => console.error('[ifood/acao] erro ao notificar draft:', notifErr.message));
    return { draft_id: row.id, operacao, content };
  }));

  // ════════════════════════════════════════════════════════════════════════════
  // POST /ifood/aprovar/:draftId — COMMIT: a ÚNICA porta de escrita real no iFood.
  //   assertTenantMember (anti-IDOR), lê o draft (amarelo/pending), despacha por
  //   metadata.operacao → lib.pausarItem/reabrirItem (SEM retry), marca o draft
  //   sent/failed e grava audit_log.
  // ════════════════════════════════════════════════════════════════════════════
  router.post('/ifood/aprovar/:draftId', requireJwtOrInternal, handle(async (req, res) => {
    const { draftId } = req.params;
    const tenantId = req.body?.tenant_id ? String(req.body.tenant_id) : null;
    if (!tenantId) {
      res.status(400).json({ ok: false, error: 'tenant_id obrigatório no body' });
      return;
    }
    // anti-IDOR cross-tenant: usuário tem que pertencer ao tenant (interno = req.user ausente, pula)
    if (req.user && !(await assertTenantMember(req, res, tenantId))) return;

    const drafts = await sbFetch(
      `agent_drafts?id=eq.${encodeURIComponent(draftId)}&tenant_id=eq.${encodeURIComponent(tenantId)}&select=id,content,metadata,status,autonomy_level&limit=1`
    );
    const draft = Array.isArray(drafts) ? drafts[0] : null;
    if (!draft) {
      res.status(404).json({ ok: false, error: 'Draft não encontrado' });
      return;
    }
    if (draft.autonomy_level !== 'amarelo' || draft.status !== 'pending') {
      res.status(409).json({ ok: false, error: 'Draft não está pendente de aprovação (amarelo/pending)' });
      return;
    }

    const meta = draft.metadata || {};
    const spec = OPERACOES_ESCRITA[meta.operacao];
    if (!spec) {
      res.status(400).json({ ok: false, error: `operacao do draft inválida: ${meta.operacao ?? '(ausente)'}` });
      return;
    }
    const merchantId = meta.merchant_id ? String(meta.merchant_id) : null;
    const argKeys = spec.argKeys || ['item_id'];
    const args = argKeys.map((k) => meta[k]);
    // Valida ANTES do try: metadata corrompido/incompleto é bug de programação
    // (nunca ocorreria num draft criado normalmente por /acao), não uma falha do
    // iFood — responde 400 sem marcar o draft 'failed' permanentemente.
    if (!merchantId || args.some((v) => v === undefined || v === null || v === '')) {
      res.status(400).json({ ok: false, error: `metadata incompleto: merchant_id/${argKeys.join('/')} ausente` });
      return;
    }
    // usado no resource do audit_log abaixo (item_id/review_id/interruption_id
    // quando escalar; cai pro merchantId quando o 1º arg é objeto/array — ex.
    // interrupcao/shifts, que não têm um id de alvo legível antes da chamada real).
    const primeiroArg = args[0];
    const alvoId = (typeof primeiroArg === 'object' && primeiroArg !== null) ? merchantId : String(primeiroArg);

    let resultado;
    try {
      resultado = await ifood[spec.metodo](merchantId, ...args, tenantId); // escrita SEM retry
    } catch (err) {
      // marca failed + grava o erro (só campos seguros — não o body cru do iFood)
      const lastError = String(err?.message || 'erro desconhecido').slice(0, 400);
      await sbFetch(
        `agent_drafts?id=eq.${encodeURIComponent(draftId)}&tenant_id=eq.${encodeURIComponent(tenantId)}`,
        {
          method: 'PATCH',
          body: {
            status: 'failed',
            metadata: {
              ...meta,
              last_error: lastError,
              last_error_code: err?.body && typeof err.body === 'object' ? (err.body.code ?? null) : null,
              last_error_at: new Date().toISOString(),
            },
          },
        }
      );
      if (supabaseInsert) {
        await supabaseInsert('audit_log', {
          tenant_id: tenantId,
          user_id: req.user?.id ?? null,
          agent_name: spec.agent,
          action: `${meta.operacao}.falhou`,
          resource: `ifood:${argKeys[0]}:${alvoId}`,
          metadata: { draft_id: draftId, merchant_id: merchantId, error: lastError },
        }).catch((e) => console.error('[ifood/aprovar] audit_log falhou:', e.message));
      }
      throw err; // handle() devolve {ok:false,...} sem vazar err.body cru
    }

    await sbFetch(
      `agent_drafts?id=eq.${encodeURIComponent(draftId)}&tenant_id=eq.${encodeURIComponent(tenantId)}`,
      { method: 'PATCH', body: { status: 'sent', sent_at: new Date().toISOString() } }
    );
    if (supabaseInsert) {
      await supabaseInsert('audit_log', {
        tenant_id: tenantId,
        user_id: req.user?.id ?? null,
        agent_name: spec.agent,
        action: meta.operacao,
        resource: `ifood:${argKeys[0]}:${alvoId}`,
        // resultado persiste o retorno da API (createdAt/reviewId/text no caso de
        // responder_review) — a única cópia duradoura além da resposta HTTP transiente.
        metadata: { draft_id: draftId, merchant_id: merchantId, content: draft.content, resultado },
      }).catch((e) => console.error('[ifood/aprovar] audit_log falhou:', e.message));
    }
    return { draft_id: draftId, operacao: meta.operacao, resultado };
  }));

  return router;
};
