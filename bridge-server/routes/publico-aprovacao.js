'use strict';

// ════════════════════════════════════════════════════════════════════════════
// F4 Onda 07 — Dashboard Público de Aprovação (sem JWT)
//
// Endpoints (autenticados via public_token na URL — sem JWT):
//   GET  /api/publico/aprovacao/:token                      — carrega analise + tarefas
//   POST /api/publico/aprovacao/:token/tarefa/:id/aceitar   — aprova tarefa
//   POST /api/publico/aprovacao/:token/tarefa/:id/recusar   — rejeita tarefa
//   POST /api/publico/aprovacao/:token/tarefa/:id/duvida    — envia dúvida ao consultor
//
// Rate limit: 60 req/min por IP (in-memory, basta para volume de clientes)
// ════════════════════════════════════════════════════════════════════════════

const express = require('express');

// ── Rate limiter in-memory: 60 req/min por IP ────────────────────────────────
const rateLimitMap = new Map(); // IP → { count, resetAt }
const RATE_LIMIT   = 60;
const WINDOW_MS    = 60_000;

function rateLimit(req, res, next) {
  // req.ip (Express, trust proxy=2 em index.js) — ver
  // docs/deli-memory/tech-debts/trust-proxy-bridge.md.
  const ip  = req.ip || 'unknown';
  const now = Date.now();

  let entry = rateLimitMap.get(ip);
  if (!entry || now >= entry.resetAt) {
    entry = { count: 0, resetAt: now + WINDOW_MS };
    rateLimitMap.set(ip, entry);
  }

  entry.count++;
  if (entry.count > RATE_LIMIT) {
    return res.status(429).json({ error: 'Muitas requisições. Aguarde 1 minuto.' });
  }
  next();
}

// Limpeza periódica do map (evita memory leak em uptime longo)
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimitMap) {
    if (now >= entry.resetAt) rateLimitMap.delete(ip);
  }
}, WINDOW_MS);

// ── Factory ──────────────────────────────────────────────────────────────────
module.exports = function buildPublicoAprovacaoRouter({ sbFetch, supabaseInsert }) {
  const router = express.Router();

  // ── Helper: busca analise pelo public_token e verifica expiração ────────────
  async function getAnaliseByToken(token) {
    const rows = await sbFetch(
      `analises?public_token=eq.${encodeURIComponent(token)}&select=id,loja_id,tenant_id,status,loom_url,resumo_executivo,public_token_expires_at&limit=1`
    );
    const analise = rows?.[0];
    if (!analise) return null;

    const expiresAt = analise.public_token_expires_at;
    if (expiresAt && new Date(expiresAt) < new Date()) return null; // expirado

    return analise;
  }

  // ════════════════════════════════════════════════════════════════════════════
  // GET /api/publico/aprovacao/:token
  //    Retorna análise + tarefas + loja para o dashboard público.
  // ════════════════════════════════════════════════════════════════════════════
  router.get('/publico/aprovacao/:token', rateLimit, async (req, res) => {
    const { token } = req.params;

    try {
      const analise = await getAnaliseByToken(token);
      if (!analise) return res.status(404).json({ error: 'Link inválido ou expirado' });

      const lojas = await sbFetch(
        `lojas?id=eq.${encodeURIComponent(analise.loja_id)}&select=id,nome&limit=1`
      );
      const loja = lojas?.[0] ?? { nome: 'Loja' };

      const tarefas = await sbFetch(
        `tarefas_loja?analise_id=eq.${encodeURIComponent(analise.id)}&order=bloco.asc,ordem_no_bloco.asc&select=id,titulo,bloco,status,situacao,o_que_sera_feito&limit=200`
      );

      return res.json({
        analise_id:        analise.id,
        loja_nome:         loja.nome,
        loom_url:          analise.loom_url ?? null,
        resumo_executivo:  analise.resumo_executivo ?? null,
        status:            analise.status,
        tarefas:           tarefas ?? [],
      });
    } catch (err) {
      console.error('[publico/aprovacao GET]', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ════════════════════════════════════════════════════════════════════════════
  // POST /api/publico/aprovacao/:token/tarefa/:id/aceitar
  //    Aprova a tarefa (mesmo fluxo do parser WhatsApp "OK <N>").
  // ════════════════════════════════════════════════════════════════════════════
  router.post('/publico/aprovacao/:token/tarefa/:id/aceitar', rateLimit, async (req, res) => {
    const { token, id: tarefaId } = req.params;
    const { observacao } = req.body ?? {};

    try {
      const analise = await getAnaliseByToken(token);
      if (!analise) return res.status(404).json({ error: 'Link inválido ou expirado' });

      // Verifica que a tarefa pertence à analise do token
      const tarefas = await sbFetch(
        `tarefas_loja?id=eq.${encodeURIComponent(tarefaId)}&analise_id=eq.${encodeURIComponent(analise.id)}&select=id,status&limit=1`
      );
      if (!tarefas?.length) return res.status(404).json({ error: 'Tarefa não encontrada' });

      // Atualiza status para aprovada
      await sbFetch(
        `tarefas_loja?id=eq.${encodeURIComponent(tarefaId)}`,
        { method: 'PATCH', body: { status: 'aprovada' } }
      );

      // Registra em tarefa_aprovacoes
      await supabaseInsert('tarefa_aprovacoes', {
        tarefa_id:  tarefaId,
        tenant_id:  analise.tenant_id,
        acao:       'aprovada',
        autor_id:   null,
        nota:       observacao ?? null,
        metadata:   { via: 'dashboard_publico' },
      });

      console.log(`[publico/aprovacao/aceitar] analise=${analise.id} tarefa=${tarefaId}`);
      return res.json({ ok: true });
    } catch (err) {
      console.error('[publico/aprovacao/aceitar]', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ════════════════════════════════════════════════════════════════════════════
  // POST /api/publico/aprovacao/:token/tarefa/:id/recusar
  //    Rejeita a tarefa (mesmo fluxo do parser "NAO <N>: <motivo>").
  // ════════════════════════════════════════════════════════════════════════════
  router.post('/publico/aprovacao/:token/tarefa/:id/recusar', rateLimit, async (req, res) => {
    const { token, id: tarefaId } = req.params;
    const { motivo } = req.body ?? {};

    if (!motivo?.trim()) {
      return res.status(400).json({ error: 'Motivo obrigatório para recusar' });
    }

    try {
      const analise = await getAnaliseByToken(token);
      if (!analise) return res.status(404).json({ error: 'Link inválido ou expirado' });

      const tarefas = await sbFetch(
        `tarefas_loja?id=eq.${encodeURIComponent(tarefaId)}&analise_id=eq.${encodeURIComponent(analise.id)}&select=id,status&limit=1`
      );
      if (!tarefas?.length) return res.status(404).json({ error: 'Tarefa não encontrada' });

      await sbFetch(
        `tarefas_loja?id=eq.${encodeURIComponent(tarefaId)}`,
        { method: 'PATCH', body: { status: 'rejeitada' } }
      );

      await supabaseInsert('tarefa_aprovacoes', {
        tarefa_id:  tarefaId,
        tenant_id:  analise.tenant_id,
        acao:       'rejeitada',
        autor_id:   null,
        nota:       motivo.trim(),
        metadata:   { via: 'dashboard_publico' },
      });

      console.log(`[publico/aprovacao/recusar] analise=${analise.id} tarefa=${tarefaId}`);
      return res.json({ ok: true });
    } catch (err) {
      console.error('[publico/aprovacao/recusar]', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ════════════════════════════════════════════════════════════════════════════
  // POST /api/publico/aprovacao/:token/tarefa/:id/duvida
  //    Envia dúvida ao consultor via internal_notifications (broadcast ao tenant).
  // ════════════════════════════════════════════════════════════════════════════
  router.post('/publico/aprovacao/:token/tarefa/:id/duvida', rateLimit, async (req, res) => {
    const { token, id: tarefaId } = req.params;
    const { pergunta } = req.body ?? {};

    if (!pergunta?.trim()) {
      return res.status(400).json({ error: 'Pergunta obrigatória para enviar dúvida' });
    }

    try {
      const analise = await getAnaliseByToken(token);
      if (!analise) return res.status(404).json({ error: 'Link inválido ou expirado' });

      const tarefas = await sbFetch(
        `tarefas_loja?id=eq.${encodeURIComponent(tarefaId)}&analise_id=eq.${encodeURIComponent(analise.id)}&select=id,titulo&limit=1`
      );
      if (!tarefas?.length) return res.status(404).json({ error: 'Tarefa não encontrada' });

      const tarefa = tarefas[0];

      // Cria notificação interna para o consultor (broadcast ao tenant)
      await supabaseInsert('internal_notifications', {
        tenant_id:         analise.tenant_id,
        recipient_user_id: null, // broadcast
        kind:              'system',
        agent:             null,
        title:             `Dúvida do cliente — ${tarefa.titulo}`,
        body:              pergunta.trim(),
        link:              `/analise-ifood`,
        metadata: {
          analise_id: analise.id,
          tarefa_id:  tarefaId,
          via:        'dashboard_publico',
        },
      });

      console.log(`[publico/aprovacao/duvida] analise=${analise.id} tarefa=${tarefaId}`);
      return res.json({ ok: true });
    } catch (err) {
      console.error('[publico/aprovacao/duvida]', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  return router;
};
