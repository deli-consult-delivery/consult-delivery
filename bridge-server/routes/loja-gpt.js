'use strict';

// ════════════════════════════════════════════════════════════════════════════
// PILOTO Onda 03 — Loja-GPT
// Doc autoritativo: docs/piloto/PILOTO-03-LOJA-GPT.md (Tarefa 6)
//
// Endpoints:
//   GET    /api/lojas/:id/loja-gpt/conversations          — listar conversas da loja
//   POST   /api/lojas/:id/loja-gpt/conversations          — criar nova conversa
//   GET    /api/loja-gpt/conversations/:id                — detalhe + messages
//   POST   /api/loja-gpt/conversations/:id/messages       — enviar pergunta (dispara task)
//   PATCH  /api/loja-gpt/conversations/:id                — arquivar/editar conversa
// ════════════════════════════════════════════════════════════════════════════

const express = require('express');

const {
  ListConversationsQuerySchema,
  CreateConversationSchema,
  GetConversationQuerySchema,
  CreateMessageSchema,
  UpdateConversationSchema,
} = require('../schemas/loja-gpt');

// Máximo de espera pelo resultado da task Trigger.dev (ms)
const TRIGGER_POLL_TIMEOUT_MS  = 60_000;
// Intervalo entre polls (ms)
const TRIGGER_POLL_INTERVAL_MS = 2_000;
// URL base Trigger.dev Management API
const TRIGGER_API_URL = 'https://api.trigger.dev';
// ID da task conforme declarado em trigger/loja-gpt/responder.ts
const TASK_ID = 'loja-gpt-responder';

// ── Helper: valida schema Zod — retorna dados ou seta 400 e retorna null ──────
function validate(schema, data, res) {
  const result = schema.safeParse(data);
  if (!result.success) {
    res.status(400).json({ error: 'Dados inválidos', details: result.error.flatten() });
    return null;
  }
  return result.data;
}

// ── Helper: polling de run Trigger.dev — resolve com output ou rejeita ────────
//
// Faz poll em GET /api/v3/runs/:runId a cada TRIGGER_POLL_INTERVAL_MS ms.
// Retorna o objeto `output` da task quando status === 'COMPLETED'.
// Lança erro com status quando status === 'FAILED' | 'CRASHED' | 'SYSTEM_FAILURE'.
// Retorna null quando TRIGGER_POLL_TIMEOUT_MS é atingido (caller retorna 202).
//
async function pollRunUntilDone(runId, triggerSecretKey) {
  const deadline = Date.now() + TRIGGER_POLL_TIMEOUT_MS;

  while (Date.now() < deadline) {
    const r = await fetch(`${TRIGGER_API_URL}/api/v3/runs/${encodeURIComponent(runId)}`, {
      headers: { Authorization: `Bearer ${triggerSecretKey}` },
      signal: AbortSignal.timeout(10_000),
    });

    if (!r.ok) {
      const detail = await r.text();
      throw new Error(`Trigger.dev poll ${r.status}: ${detail.slice(0, 300)}`);
    }

    const data = await r.json();
    const status = data.status;

    if (status === 'COMPLETED') {
      return data.output ?? null;
    }

    if (status === 'FAILED' || status === 'CRASHED' || status === 'SYSTEM_FAILURE') {
      throw new Error(`task ${TASK_ID} terminou com status ${status}`);
    }

    // status: QUEUED | EXECUTING | WAITING_FOR_DEPLOY | RESCHEDULED — continua polling
    await new Promise((resolve) => setTimeout(resolve, TRIGGER_POLL_INTERVAL_MS));
  }

  // Timeout esgotado — retorna null para o caller emitir 202
  return null;
}

// ── Factory: recebe helpers do index.js ───────────────────────────────────────
module.exports = function buildLojaGptRouter({
  requireJwt,
  sbFetch,
  assertLojaAccess,
  TRIGGER_SECRET_KEY,
}) {
  const router = express.Router();

  // ══════════════════════════════════════════════════════════════════════════
  // 1. GET /api/lojas/:id/loja-gpt/conversations
  //    Lista conversas de uma loja. Membros do tenant têm acesso.
  // ══════════════════════════════════════════════════════════════════════════
  router.get('/lojas/:id/loja-gpt/conversations', requireJwt, async (req, res) => {
    const { id: lojaId } = req.params;

    const query = validate(ListConversationsQuerySchema, req.query, res);
    if (!query) return;

    const tenant_id = await assertLojaAccess(req, res, lojaId);
    if (!tenant_id) return;

    try {
      const { arquivada, limit, offset } = query;
      const arquivadaBool = arquivada === 'true' ? 'true' : 'false';

      const qs =
        `loja_gpt_conversations` +
        `?loja_id=eq.${encodeURIComponent(lojaId)}` +
        `&arquivada=eq.${arquivadaBool}` +
        `&order=ultima_message_em.desc.nullsfirst,created_at.desc` +
        `&limit=${limit}` +
        `&offset=${offset}` +
        `&select=id,titulo,resumo_curto,total_messages,ultima_message_em,custo_total_usd,arquivada,iniciada_por,created_at`;

      const conversations = await sbFetch(qs);
      const arr = Array.isArray(conversations) ? conversations : [];

      console.log(`[bridge/loja-gpt] GET conversations loja=${lojaId} count=${arr.length} arquivada=${arquivadaBool}`);
      res.json({
        conversations: arr,
        limit,
        offset,
        has_more: arr.length === limit,
      });
    } catch (err) {
      console.error('[bridge/loja-gpt] GET conversations:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ══════════════════════════════════════════════════════════════════════════
  // 2. POST /api/lojas/:id/loja-gpt/conversations
  //    Cria nova conversa para a loja. Requer membership no tenant.
  // ══════════════════════════════════════════════════════════════════════════
  router.post('/lojas/:id/loja-gpt/conversations', requireJwt, async (req, res) => {
    const { id: lojaId } = req.params;

    const body = validate(CreateConversationSchema, req.body, res);
    if (!body) return;

    const tenant_id = await assertLojaAccess(req, res, lojaId);
    if (!tenant_id) return;

    try {
      const row = {
        loja_id:      lojaId,
        iniciada_por: req.user.id,
        ...(body.titulo != null && { titulo: body.titulo }),
      };

      const data = await sbFetch('loja_gpt_conversations', { method: 'POST', body: row });
      const conversation = Array.isArray(data) ? data[0] : data;

      if (!conversation) {
        return res.status(500).json({ error: 'falha ao criar conversa: sem dados retornados' });
      }

      console.log(`[bridge/loja-gpt] POST conversations conv=${conversation.id} loja=${lojaId} user=${req.user.id}`);
      res.status(201).json({ conversation });
    } catch (err) {
      console.error('[bridge/loja-gpt] POST conversations:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ══════════════════════════════════════════════════════════════════════════
  // 3. GET /api/loja-gpt/conversations/:id
  //    Detalhe da conversa + mensagens paginadas.
  // ══════════════════════════════════════════════════════════════════════════
  router.get('/loja-gpt/conversations/:id', requireJwt, async (req, res) => {
    const { id: convId } = req.params;

    const query = validate(GetConversationQuerySchema, req.query, res);
    if (!query) return;

    try {
      // 1. Buscar conversa
      const convRows = await sbFetch(
        `loja_gpt_conversations?id=eq.${encodeURIComponent(convId)}&select=*&limit=1`
      );
      if (!convRows?.length) {
        return res.status(404).json({ error: 'conversa não encontrada' });
      }
      const conversation = convRows[0];

      // 2. Verificar acesso via loja
      const tenant_id = await assertLojaAccess(req, res, conversation.loja_id);
      if (!tenant_id) return;

      // 3. Buscar mensagens paginadas
      const { messages_limit, messages_offset } = query;
      const messages = await sbFetch(
        `loja_gpt_messages` +
        `?conversation_id=eq.${encodeURIComponent(convId)}` +
        `&order=created_at.asc` +
        `&select=id,role,conteudo,fontes_consultadas,tokens_input,tokens_output,custo_usd,duracao_ms,modelo,autor_user_id,created_at` +
        `&limit=${messages_limit}` +
        `&offset=${messages_offset}`
      );
      const messagesArr = Array.isArray(messages) ? messages : [];

      console.log(`[bridge/loja-gpt] GET conversation/${convId} messages=${messagesArr.length}`);
      res.json({
        conversation: {
          ...conversation,
          messages:          messagesArr,
          messages_has_more: messagesArr.length === messages_limit,
        },
      });
    } catch (err) {
      console.error('[bridge/loja-gpt] GET conversation/:id:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ══════════════════════════════════════════════════════════════════════════
  // 4. POST /api/loja-gpt/conversations/:id/messages
  //    Recebe pergunta, dispara task loja-gpt-responder, aguarda até 60s.
  //    Retorna resposta síncrona (200) ou run_id para polling (202).
  //    D3: tenant_id buscado no bridge via lojas.tenant_id (não vem do body).
  // ══════════════════════════════════════════════════════════════════════════
  router.post('/loja-gpt/conversations/:id/messages', requireJwt, async (req, res) => {
    const { id: convId } = req.params;

    const body = validate(CreateMessageSchema, req.body, res);
    if (!body) return;

    if (!TRIGGER_SECRET_KEY) {
      return res.status(503).json({ error: 'TRIGGER_SECRET_KEY não configurado no servidor' });
    }

    try {
      // 1. Buscar conversa (loja_id, arquivada)
      const convRows = await sbFetch(
        `loja_gpt_conversations?id=eq.${encodeURIComponent(convId)}&select=loja_id,arquivada&limit=1`
      );
      if (!convRows?.length) {
        return res.status(404).json({ error: 'conversa não encontrada' });
      }
      const conv = convRows[0];

      // 2. Rejeitar se arquivada
      if (conv.arquivada === true) {
        return res.status(422).json({ error: 'conversa arquivada não aceita novas mensagens' });
      }

      // 3. Verificar acesso + obter tenant_id (D3: cross-check JWT via assertLojaAccess)
      const tenant_id = await assertLojaAccess(req, res, conv.loja_id);
      if (!tenant_id) return;

      // 4. Disparar task Trigger.dev
      const tr = await fetch(`${TRIGGER_API_URL}/api/v1/tasks/${TASK_ID}/trigger`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization:  `Bearer ${TRIGGER_SECRET_KEY}`,
        },
        body: JSON.stringify({
          payload: {
            conversation_id: convId,
            loja_id:         conv.loja_id,
            user_id:         req.user.id,
            tenant_id,
            pergunta:        body.pergunta,
          },
        }),
        signal: AbortSignal.timeout(15_000),
      });

      if (!tr.ok) {
        const detail = await tr.text();
        console.error(`[bridge/loja-gpt] trigger falhou ${tr.status}:`, detail.slice(0, 300));
        return res.status(tr.status >= 400 && tr.status < 500 ? tr.status : 500).json({
          error: 'falha ao disparar task loja-gpt-responder',
          detail: detail.slice(0, 300),
        });
      }

      const trData = await tr.json();
      const run_id = trData.id;

      console.log(`[bridge/loja-gpt] POST messages conv=${convId} run_id=${run_id} aguardando...`);

      // 5. Polling até conclusão (max 60s) — D2: síncrono
      let output;
      try {
        output = await pollRunUntilDone(run_id, TRIGGER_SECRET_KEY);
      } catch (pollErr) {
        console.error(`[bridge/loja-gpt] task falhou conv=${convId} run_id=${run_id}:`, pollErr.message);
        return res.status(500).json({
          error: 'task loja-gpt-responder falhou',
          detail: pollErr.message,
          run_id,
        });
      }

      // 6. Timeout esgotado — retorna 202 para o frontend fazer polling
      if (output === null) {
        console.log(`[bridge/loja-gpt] POST messages timeout conv=${convId} run_id=${run_id} → 202`);
        return res.status(202).json({
          status:  'processing',
          run_id,
          message: 'task ainda em execução — consulte GET /agents/loja-gpt-responder/runs/:run_id',
        });
      }

      // 7. Sucesso síncrono
      console.log(`[bridge/loja-gpt] POST messages concluido conv=${convId} msg=${output.message_id} custo=$${output.custo_usd}`);
      res.json({
        message_id:    output.message_id,
        resposta:      output.resposta,
        fontes:        output.fontes        ?? [],
        tokens_input:  output.tokens_input  ?? 0,
        tokens_output: output.tokens_output ?? 0,
        custo_usd:     output.custo_usd     ?? 0,
        duracao_ms:    output.duracao_ms    ?? 0,
        run_id,
      });
    } catch (err) {
      console.error('[bridge/loja-gpt] POST messages:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ══════════════════════════════════════════════════════════════════════════
  // 5. PATCH /api/loja-gpt/conversations/:id
  //    Arquiva ou edita titulo/resumo_curto.
  //    Acesso: dono da conversa (iniciada_por) OU admin do tenant — D4: service role + JS.
  // ══════════════════════════════════════════════════════════════════════════
  router.patch('/loja-gpt/conversations/:id', requireJwt, async (req, res) => {
    const { id: convId } = req.params;

    const body = validate(UpdateConversationSchema, req.body, res);
    if (!body) return;

    try {
      // 1. Buscar conversa
      const convRows = await sbFetch(
        `loja_gpt_conversations?id=eq.${encodeURIComponent(convId)}&select=loja_id,iniciada_por&limit=1`
      );
      if (!convRows?.length) {
        return res.status(404).json({ error: 'conversa não encontrada' });
      }
      const conv = convRows[0];

      // 2. Verificar acesso à loja (membership mínimo)
      const tenant_id = await assertLojaAccess(req, res, conv.loja_id);
      if (!tenant_id) return;

      // 3. Verificar autorização: dono OU admin do tenant (replica lógica da RLS lgc_update)
      const isDono = conv.iniciada_por === req.user.id;

      if (!isDono) {
        const memberRows = await sbFetch(
          `tenant_members?user_id=eq.${encodeURIComponent(req.user.id)}&tenant_id=eq.${encodeURIComponent(tenant_id)}&select=role&limit=1`
        );
        const role = memberRows?.[0]?.role;
        if (role !== 'admin') {
          return res.status(403).json({
            error: 'apenas o dono da conversa ou um admin do tenant pode editá-la',
          });
        }
      }

      // 4. Aplicar PATCH — apenas campos presentes no body
      const updates = {};
      if (body.arquivada    !== undefined) updates.arquivada    = body.arquivada;
      if (body.titulo       !== undefined) updates.titulo       = body.titulo;
      if (body.resumo_curto !== undefined) updates.resumo_curto = body.resumo_curto;

      const data = await sbFetch(
        `loja_gpt_conversations?id=eq.${encodeURIComponent(convId)}`,
        { method: 'PATCH', body: updates }
      );
      const conversation = Array.isArray(data) ? data[0] : data;

      if (!conversation) {
        return res.status(404).json({ error: 'conversa não encontrada após update' });
      }

      console.log(`[bridge/loja-gpt] PATCH conversation/${convId} campos=${Object.keys(updates).join(',')} user=${req.user.id}`);
      res.json({ conversation });
    } catch (err) {
      console.error('[bridge/loja-gpt] PATCH conversation/:id:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  return router;
};
