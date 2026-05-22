'use strict';

// ════════════════════════════════════════════════════════════════════════════
// PILOTO Onda 04 — Análises (Loom + IA)
//
// Endpoints:
//   GET  /api/lojas/:id/analises              — listar análises da loja
//   POST /api/lojas/:id/analises              — criar nova análise (rascunho)
//   POST /api/lojas/:id/analises/processar    — disparar task analise-gerar-relatorio
// ════════════════════════════════════════════════════════════════════════════

const express = require('express');

const {
  ListAnalisesQuerySchema,
  CreateAnaliseSchema,
  ProcessarAnaliseSchema,
} = require('../schemas/analises');

const TRIGGER_API_URL         = 'https://api.trigger.dev';
const TASK_ID                 = 'analise-gerar-relatorio';
const TRIGGER_POLL_TIMEOUT_MS = 60_000;
const TRIGGER_POLL_INTERVAL   = 2_000;

// ── Helper: valida schema Zod — retorna dados ou seta 400 ────────────────────
function validate(schema, data, res) {
  const result = schema.safeParse(data);
  if (!result.success) {
    res.status(400).json({ error: 'Dados inválidos', details: result.error.flatten() });
    return null;
  }
  return result.data;
}

// ── Helper: polling de run Trigger.dev ──────────────────────────────────────
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
    if (data.status === 'COMPLETED') return data.output ?? null;
    if (['FAILED', 'CRASHED', 'SYSTEM_FAILURE'].includes(data.status)) {
      throw new Error(`task ${TASK_ID} terminou com status ${data.status}`);
    }
    await new Promise((resolve) => setTimeout(resolve, TRIGGER_POLL_INTERVAL));
  }
  return null; // timeout — caller retorna 202
}

// ── Factory: recebe helpers do index.js ─────────────────────────────────────
module.exports = function buildAnalisesRouter({
  requireJwt,
  sbFetch,
  assertLojaAccess,
  TRIGGER_SECRET_KEY,
}) {
  const router = express.Router();

  // ══════════════════════════════════════════════════════════════════════════
  // 1. GET /api/lojas/:id/analises
  //    Lista análises da loja ordenadas por created_at desc
  // ══════════════════════════════════════════════════════════════════════════
  router.get('/lojas/:id/analises', requireJwt, async (req, res) => {
    const { id: lojaId } = req.params;

    const query = validate(ListAnalisesQuerySchema, req.query, res);
    if (!query) return;

    try {
      if (!await assertLojaAccess(req, res, lojaId)) return;

      const { limit, offset } = query;
      const rows = await sbFetch(
        `analises?loja_id=eq.${encodeURIComponent(lojaId)}&order=created_at.desc&limit=${limit}&offset=${offset}` +
        `&select=id,tipo,status,relatorio_markdown,resumo_executivo,total_tarefas_geradas,loom_url,criado_por,created_at`
      );

      res.json({ analises: rows ?? [] });
    } catch (err) {
      console.error('[api/lojas/:id/analises GET]', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ══════════════════════════════════════════════════════════════════════════
  // 2. POST /api/lojas/:id/analises
  //    Cria nova análise com status='rascunho' (sem disparar task)
  // ══════════════════════════════════════════════════════════════════════════
  router.post('/lojas/:id/analises', requireJwt, async (req, res) => {
    const { id: lojaId } = req.params;

    const body = validate(CreateAnaliseSchema, req.body, res);
    if (!body) return;

    try {
      const tenantId = await assertLojaAccess(req, res, lojaId);
      if (!tenantId) return;

      const row = {
        loja_id:      lojaId,
        criado_por:   req.user.id,
        status:       'rascunho',
        tipo:         body.tipo,
        ...(body.loom_url    ? { loom_url: body.loom_url }       : {}),
        ...(body.transcricao ? { transcricao: body.transcricao } : {}),
      };

      const data = await sbFetch('analises', { method: 'POST', body: row });
      const analise = Array.isArray(data) ? data[0] : data;

      console.log(`[api/lojas/analises POST] loja=${lojaId} analise_id=${analise?.id}`);
      res.status(201).json({ analise });
    } catch (err) {
      console.error('[api/lojas/:id/analises POST]', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ══════════════════════════════════════════════════════════════════════════
  // 3. POST /api/lojas/:id/analises/processar
  //    Dispara task analise-gerar-relatorio e faz polling síncrono 60s.
  //    Retorna 200 com output se concluir em tempo, 202 se timeout.
  // ══════════════════════════════════════════════════════════════════════════
  router.post('/lojas/:id/analises/processar', requireJwt, async (req, res) => {
    const { id: lojaId } = req.params;

    const body = validate(ProcessarAnaliseSchema, req.body, res);
    if (!body) return;

    if (!TRIGGER_SECRET_KEY)
      return res.status(503).json({ error: 'TRIGGER_SECRET_KEY não configurado no servidor' });

    try {
      if (!await assertLojaAccess(req, res, lojaId)) return;

      // Verificar que a análise pertence à loja informada
      const analises = await sbFetch(
        `analises?id=eq.${encodeURIComponent(body.analise_id)}&loja_id=eq.${encodeURIComponent(lojaId)}&select=id,status&limit=1`
      );
      if (!analises?.length) {
        return res.status(404).json({ error: 'Análise não encontrada nesta loja' });
      }

      // Disparar task Trigger.dev
      const tr = await fetch(`${TRIGGER_API_URL}/api/v1/tasks/${TASK_ID}/trigger`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${TRIGGER_SECRET_KEY}`,
        },
        body: JSON.stringify({
          payload: { analise_id: body.analise_id },
        }),
        signal: AbortSignal.timeout(15_000),
      });

      if (!tr.ok) {
        const detail = await tr.text();
        throw new Error(`Trigger.dev ${tr.status}: ${detail.slice(0, 300)}`);
      }

      const trData = await tr.json();
      const runId = trData.id ?? trData.run_id;
      if (!runId) {
        throw new Error(`Trigger.dev não retornou run ID. Resposta: ${JSON.stringify(trData).slice(0, 300)}`);
      }
      console.log(`[api/analises/processar] loja=${lojaId} analise=${body.analise_id} run_id=${runId}`);

      // Polling síncrono 60s
      const output = await pollRunUntilDone(runId, TRIGGER_SECRET_KEY);

      if (output === null) {
        // Timeout — task ainda rodando
        return res.status(202).json({
          ok: true,
          run_id: runId,
          status: 'processing',
          message: 'Processamento em andamento. Aguarde alguns minutos e atualize a página.',
        });
      }

      return res.json({ ok: true, run_id: runId, ...output });
    } catch (err) {
      console.error('[api/lojas/:id/analises/processar]', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  return router;
};
