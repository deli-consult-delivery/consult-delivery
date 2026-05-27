'use strict';

const express = require('express');
const { runHeartbeatPrompt } = require('../services/claude-runner');

module.exports = function buildHeartbeatsRouter({ requireJwt, sbFetch, supabaseInsert, SUPABASE_URL, SUPABASE_SERVICE_KEY }) {
  const router = express.Router();

  // ── Helper: pegar tenant_id do usuário autenticado ────────────────────────
  async function getTenantId(userId) {
    if (!userId) throw new Error('Usuário não autenticado');
    const rows = await sbFetch(
      `tenant_members?user_id=eq.${encodeURIComponent(userId)}&select=tenant_id&limit=1`
    );
    return rows?.[0]?.tenant_id ?? null;
  }

  // ── Helper: atualizar heartbeat via service role ──────────────────────────
  async function updateHeartbeat(id, updates) {
    if (!SUPABASE_SERVICE_KEY) return;
    const r = await fetch(`${SUPABASE_URL}/rest/v1/heartbeats?id=eq.${id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        Prefer: 'return=representation',
      },
      body: JSON.stringify({ ...updates, updated_at: new Date().toISOString() }),
    });
    if (!r.ok) throw new Error(`heartbeat update ${r.status}: ${await r.text()}`);
    const data = await r.json();
    return Array.isArray(data) ? data[0] : data;
  }

  // ── Helper: atualizar heartbeat_run ────────────────────────────────────────
  async function updateRun(runId, updates) {
    if (!SUPABASE_SERVICE_KEY) return;
    const r = await fetch(`${SUPABASE_URL}/rest/v1/heartbeat_runs?id=eq.${runId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        Prefer: 'return=representation',
      },
      body: JSON.stringify(updates),
    });
    if (!r.ok) throw new Error(`heartbeat_run update ${r.status}: ${await r.text()}`);
  }

  // ── GET /api/heartbeats — lista todos do tenant ───────────────────────────
  router.get('/heartbeats', requireJwt, async (req, res) => {
    try {
      const tenantId = await getTenantId(req.user.id);
      if (!tenantId) return res.status(403).json({ error: 'tenant não encontrado' });

      const rows = await sbFetch(
        `heartbeats?tenant_id=eq.${tenantId}&order=created_at.desc&select=*`
      );
      res.json(rows || []);
    } catch (err) {
      console.error('[heartbeats GET]', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ── POST /api/heartbeats — criar novo ─────────────────────────────────────
  router.post('/heartbeats', requireJwt, async (req, res) => {
    try {
      const tenantId = await getTenantId(req.user.id);
      if (!tenantId) return res.status(403).json({ error: 'tenant não encontrado' });

      const { name, description, agent_slug, prompt, decision_prompt,
              interval_seconds, execution_mode, max_tokens, timeout_seconds } = req.body;

      if (!name?.trim())        return res.status(400).json({ error: 'name obrigatório' });
      if (!agent_slug?.trim())  return res.status(400).json({ error: 'agent_slug obrigatório' });
      if (!prompt?.trim())      return res.status(400).json({ error: 'prompt obrigatório' });

      const row = await supabaseInsert('heartbeats', {
        tenant_id:        tenantId,
        name:             name.trim(),
        description:      description?.trim() || null,
        agent_slug:       agent_slug.trim(),
        prompt:           prompt.trim(),
        decision_prompt:  decision_prompt?.trim() || null,
        interval_seconds: interval_seconds || 3600,
        execution_mode:   execution_mode || 'api',
        max_tokens:       max_tokens || 2048,
        timeout_seconds:  timeout_seconds || 120,
        enabled:          false,
        created_by:       req.user.id,
      });

      res.status(201).json(row);
    } catch (err) {
      console.error('[heartbeats POST]', err.message);
      if (err.message?.includes('duplicate')) {
        return res.status(409).json({ error: 'já existe um heartbeat com este nome' });
      }
      res.status(500).json({ error: err.message });
    }
  });

  // ── PATCH /api/heartbeats/:id — atualizar ─────────────────────────────────
  router.patch('/heartbeats/:id', requireJwt, async (req, res) => {
    try {
      const tenantId = await getTenantId(req.user.id);
      if (!tenantId) return res.status(403).json({ error: 'tenant não encontrado' });

      const allowed = ['name', 'description', 'agent_slug', 'prompt', 'decision_prompt',
                       'interval_seconds', 'execution_mode', 'max_tokens', 'timeout_seconds', 'enabled'];
      const updates = {};
      for (const k of allowed) {
        if (req.body[k] !== undefined) updates[k] = req.body[k];
      }

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ error: 'nenhum campo válido para atualizar' });
      }

      const row = await updateHeartbeat(req.params.id, updates);
      res.json(row);
    } catch (err) {
      console.error('[heartbeats PATCH]', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ── DELETE /api/heartbeats/:id ─────────────────────────────────────────────
  router.delete('/heartbeats/:id', requireJwt, async (req, res) => {
    try {
      const tenantId = await getTenantId(req.user.id);
      if (!tenantId) return res.status(403).json({ error: 'tenant não encontrado' });

      if (!SUPABASE_SERVICE_KEY) return res.status(500).json({ error: 'service key ausente' });

      const r = await fetch(`${SUPABASE_URL}/rest/v1/heartbeats?id=eq.${req.params.id}&tenant_id=eq.${tenantId}`, {
        method: 'DELETE',
        headers: {
          apikey: SUPABASE_SERVICE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        },
      });
      if (!r.ok) throw new Error(`delete ${r.status}: ${await r.text()}`);
      res.json({ deleted: true });
    } catch (err) {
      console.error('[heartbeats DELETE]', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ── POST /api/heartbeats/:id/trigger — disparo manual ────────────────────
  router.post('/heartbeats/:id/trigger', requireJwt, async (req, res) => {
    const startTime = Date.now();
    let runId = null;

    try {
      const tenantId = await getTenantId(req.user.id);
      if (!tenantId) return res.status(403).json({ error: 'tenant não encontrado' });

      // Carregar heartbeat
      const hbs = await sbFetch(
        `heartbeats?id=eq.${req.params.id}&tenant_id=eq.${tenantId}&select=*&limit=1`
      );
      const hb = hbs?.[0];
      if (!hb) return res.status(404).json({ error: 'heartbeat não encontrado' });

      // Criar registro de run
      const run = await supabaseInsert('heartbeat_runs', {
        heartbeat_id:   hb.id,
        tenant_id:      tenantId,
        status:         'running',
        trigger_type:   'manual',
        prompt_used:    hb.prompt,
        execution_mode: hb.execution_mode,
      });
      runId = run?.id;

      // Executar
      const result = await runHeartbeatPrompt(hb);
      const duration = Date.now() - startTime;

      // Detectar se foi skipped
      const skipped = hb.decision_prompt && result.output?.trimStart().toUpperCase().startsWith('SKIP');

      // Atualizar run
      if (runId) {
        await updateRun(runId, {
          status:        skipped ? 'skipped' : 'success',
          output:        result.output,
          action_taken:  !skipped && result.output?.length > 0,
          action_summary: result.output?.slice(0, 500),
          tokens_used:   result.tokens,
          cost_usd:      result.cost,
          duration_ms:   duration,
          finished_at:   new Date().toISOString(),
        });
      }

      // Atualizar heartbeat
      await updateHeartbeat(hb.id, {
        last_run_at: new Date().toISOString(),
        next_run_at: new Date(Date.now() + hb.interval_seconds * 1000).toISOString(),
        run_count:   (hb.run_count || 0) + 1,
      });

      res.json({
        run_id:      runId,
        status:      skipped ? 'skipped' : 'success',
        output:      result.output,
        duration_ms: duration,
        mode:        result.mode,
      });
    } catch (err) {
      console.error('[heartbeats TRIGGER]', err.message);
      if (runId) {
        await updateRun(runId, {
          status:        'failed',
          error_message: err.message,
          duration_ms:   Date.now() - startTime,
          finished_at:   new Date().toISOString(),
        }).catch(() => {});
      }
      res.status(500).json({ error: err.message });
    }
  });

  // ── GET /api/heartbeats/:id/runs — histórico de execuções ─────────────────
  router.get('/heartbeats/:id/runs', requireJwt, async (req, res) => {
    try {
      const tenantId = await getTenantId(req.user.id);
      if (!tenantId) return res.status(403).json({ error: 'tenant não encontrado' });

      const limit = Math.min(parseInt(req.query.limit || '20', 10), 100);

      const rows = await sbFetch(
        `heartbeat_runs?heartbeat_id=eq.${req.params.id}&tenant_id=eq.${tenantId}&order=started_at.desc&limit=${limit}&select=*`
      );
      res.json(rows || []);
    } catch (err) {
      console.error('[heartbeats RUNS]', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  return router;
};
