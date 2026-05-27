'use strict';

const express = require('express');
const { randomUUID } = require('crypto');
const { runViaAPI } = require('../services/claude-runner');

module.exports = function buildAgentBuilderRouter({ requireJwt, sbFetch, supabaseInsert, SUPABASE_URL, SUPABASE_SERVICE_KEY }) {
  const router = express.Router();

  // ── Helper: pegar tenant_id do usuário autenticado ────────────────────────
  async function getTenantId(userId) {
    if (!userId) throw new Error('Usuário não autenticado');
    const rows = await sbFetch(
      `tenant_members?user_id=eq.${encodeURIComponent(userId)}&select=tenant_id&limit=1`
    );
    return rows?.[0]?.tenant_id ?? null;
  }

  // ── Helper: atualizar agent via service role ──────────────────────────────
  async function updateAgent(id, updates) {
    if (!SUPABASE_SERVICE_KEY) return;
    const r = await fetch(`${SUPABASE_URL}/rest/v1/agents?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        Prefer: 'return=representation',
      },
      body: JSON.stringify(updates),
    });
    if (!r.ok) throw new Error(`agent update ${r.status}: ${await r.text()}`);
    const data = await r.json();
    return Array.isArray(data) ? data[0] : data;
  }

  // ── Helper: validar que agente custom pertence ao tenant do usuário ────────
  async function assertCustomAgentOwner(agentId, tenantId, res) {
    const rows = await sbFetch(
      `agents?id=eq.${encodeURIComponent(agentId)}&select=id,tenant_id,is_custom&limit=1`
    );
    const agent = rows?.[0];
    if (!agent) {
      res.status(404).json({ error: 'agente não encontrado' });
      return false;
    }
    if (!agent.is_custom) {
      res.status(403).json({ error: 'agentes globais são somente leitura' });
      return false;
    }
    if (agent.tenant_id !== tenantId) {
      res.status(403).json({ error: 'acesso negado: agente pertence a outro tenant' });
      return false;
    }
    return true;
  }

  // ── GET /api/agent-builder/agents — listar globais + custom do tenant ─────
  router.get('/agent-builder/agents', requireJwt, async (req, res) => {
    try {
      if (!req.user?.id) return res.status(401).json({ error: 'Unauthenticated' });
      const tenantId = await getTenantId(req.user.id);
      if (!tenantId) return res.status(403).json({ error: 'tenant não encontrado' });

      // Globais (tenant_id IS NULL)
      const globals = await sbFetch(
        `agents?tenant_id=is.null&order=name.asc&select=*`
      );

      // Custom do tenant
      const custom = await sbFetch(
        `agents?tenant_id=eq.${tenantId}&is_custom=eq.true&order=name.asc&select=*`
      );

      res.json({ globals: globals || [], custom: custom || [] });
    } catch (err) {
      console.error('[agent-builder GET /agents]', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ── POST /api/agent-builder/agents — criar agente custom ─────────────────
  router.post('/agent-builder/agents', requireJwt, async (req, res) => {
    try {
      if (!req.user?.id) return res.status(401).json({ error: 'Unauthenticated' });
      const tenantId = await getTenantId(req.user.id);
      if (!tenantId) return res.status(403).json({ error: 'tenant não encontrado' });

      const {
        name, display_name, description,
        custom_prompt, custom_model, custom_max_tokens,
        letter, color,
      } = req.body;

      if (!name?.trim())         return res.status(400).json({ error: 'name obrigatório' });
      if (!display_name?.trim()) return res.status(400).json({ error: 'display_name obrigatório' });

      const row = await supabaseInsert('agents', {
        id:                randomUUID(),
        name:              name.trim(),
        display_name:      display_name.trim(),
        description:       description?.trim() || null,
        custom_prompt:     custom_prompt?.trim() || null,
        custom_model:      custom_model || 'claude-haiku-4-5-20251001',
        custom_max_tokens: custom_max_tokens || 4096,
        is_custom:         true,
        tenant_id:         tenantId,
        letter:            letter?.trim() || name.trim()[0].toUpperCase(),
        color:             color?.trim() || '#B70C00',
      });

      res.status(201).json(row);
    } catch (err) {
      console.error('[agent-builder POST /agents]', err.message);
      if (err.message?.includes('duplicate') || err.message?.includes('unique')) {
        return res.status(409).json({ error: 'já existe um agente com este nome' });
      }
      res.status(500).json({ error: err.message });
    }
  });

  // ── PATCH /api/agent-builder/agents/:id — editar agente custom ───────────
  router.patch('/agent-builder/agents/:id', requireJwt, async (req, res) => {
    try {
      const tenantId = await getTenantId(req.user.id);
      if (!tenantId) return res.status(403).json({ error: 'tenant não encontrado' });

      if (!await assertCustomAgentOwner(req.params.id, tenantId, res)) return;

      const allowed = ['display_name', 'description', 'custom_prompt', 'custom_model', 'custom_max_tokens', 'letter', 'color'];
      const updates = {};
      for (const k of allowed) {
        if (req.body[k] !== undefined) updates[k] = req.body[k];
      }

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ error: 'nenhum campo válido para atualizar' });
      }

      const row = await updateAgent(req.params.id, updates);
      res.json(row);
    } catch (err) {
      console.error('[agent-builder PATCH /agents/:id]', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ── DELETE /api/agent-builder/agents/:id — deletar agente custom ─────────
  router.delete('/agent-builder/agents/:id', requireJwt, async (req, res) => {
    try {
      const tenantId = await getTenantId(req.user.id);
      if (!tenantId) return res.status(403).json({ error: 'tenant não encontrado' });

      if (!await assertCustomAgentOwner(req.params.id, tenantId, res)) return;

      if (!SUPABASE_SERVICE_KEY) return res.status(500).json({ error: 'service key ausente' });

      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/agents?id=eq.${encodeURIComponent(req.params.id)}&tenant_id=eq.${tenantId}&is_custom=eq.true`,
        {
          method: 'DELETE',
          headers: {
            apikey: SUPABASE_SERVICE_KEY,
            Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
          },
        }
      );
      if (!r.ok) throw new Error(`delete ${r.status}: ${await r.text()}`);
      res.json({ deleted: true });
    } catch (err) {
      console.error('[agent-builder DELETE /agents/:id]', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ── GET /api/agent-builder/agents/:id/config — buscar tenant_agent_config ─
  router.get('/agent-builder/agents/:id/config', requireJwt, async (req, res) => {
    try {
      const tenantId = await getTenantId(req.user.id);
      if (!tenantId) return res.status(403).json({ error: 'tenant não encontrado' });

      const rows = await sbFetch(
        `tenant_agent_config?tenant_id=eq.${tenantId}&agent_id=eq.${encodeURIComponent(req.params.id)}&select=*&limit=1`
      );
      const config = rows?.[0] ?? null;
      res.json(config || { tenant_id: tenantId, agent_id: req.params.id, enabled: true, config: {} });
    } catch (err) {
      console.error('[agent-builder GET /agents/:id/config]', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ── PATCH /api/agent-builder/agents/:id/config — salvar tenant_agent_config
  router.patch('/agent-builder/agents/:id/config', requireJwt, async (req, res) => {
    try {
      const tenantId = await getTenantId(req.user.id);
      if (!tenantId) return res.status(403).json({ error: 'tenant não encontrado' });

      if (!SUPABASE_SERVICE_KEY) return res.status(500).json({ error: 'service key ausente' });

      const { enabled, custom_prompt, modo_override, config: extraConfig } = req.body;

      const upsertBody = {
        tenant_id:   tenantId,
        agent_id:    req.params.id,
        ...(enabled !== undefined  && { enabled }),
        ...(custom_prompt !== undefined && { config: { ...extraConfig, custom_prompt } }),
        ...(modo_override !== undefined && { modo_override }),
      };

      const r = await fetch(`${SUPABASE_URL}/rest/v1/tenant_agent_config`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey:         SUPABASE_SERVICE_KEY,
          Authorization:  `Bearer ${SUPABASE_SERVICE_KEY}`,
          Prefer:         'return=representation,resolution=merge-duplicates',
        },
        body: JSON.stringify(upsertBody),
      });
      if (!r.ok) throw new Error(`config upsert ${r.status}: ${await r.text()}`);
      const data = await r.json();
      const row  = Array.isArray(data) ? data[0] : data;
      res.json(row);
    } catch (err) {
      console.error('[agent-builder PATCH /agents/:id/config]', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ── POST /api/agent-builder/agents/:id/invoke — testar agente ─────────────
  router.post('/agent-builder/agents/:id/invoke', requireJwt, async (req, res) => {
    const startTime = Date.now();

    try {
      const tenantId = await getTenantId(req.user.id);
      if (!tenantId) return res.status(403).json({ error: 'tenant não encontrado' });

      const { prompt, max_tokens } = req.body;
      if (!prompt?.trim()) return res.status(400).json({ error: 'prompt obrigatório' });

      // Carregar agente
      const rows = await sbFetch(
        `agents?id=eq.${encodeURIComponent(req.params.id)}&select=*&limit=1`
      );
      const agent = rows?.[0];
      if (!agent) return res.status(404).json({ error: 'agente não encontrado' });

      // Verificar visibilidade: global ou pertence ao tenant
      if (agent.tenant_id && agent.tenant_id !== tenantId) {
        return res.status(403).json({ error: 'acesso negado a este agente' });
      }

      // Buscar config do tenant para override de prompt
      const cfgRows = await sbFetch(
        `tenant_agent_config?tenant_id=eq.${tenantId}&agent_id=eq.${encodeURIComponent(req.params.id)}&select=*&limit=1`
      ).catch(() => []);
      const tenantCfg = cfgRows?.[0] ?? null;

      // Montar system prompt: custom_prompt do agente ou do tenant_agent_config
      const systemPrompt = tenantCfg?.config?.custom_prompt
        || agent.custom_prompt
        || agent.role
        || null;

      const model     = agent.custom_model || 'claude-haiku-4-5-20251001';
      const maxTokens = max_tokens || agent.custom_max_tokens || 4096;

      const result = await runViaAPI(prompt.trim(), {
        model,
        max_tokens:  maxTokens,
        ...(systemPrompt && { system: systemPrompt }),
      });

      const duration_ms = Date.now() - startTime;

      // Salvar em agent_runs (best-effort)
      supabaseInsert('agent_runs', {
        agent_id:    agent.id,
        tenant_id:   tenantId,
        triggered_by: req.user.id,
        input:       { prompt: prompt.trim() },
        output:      { text: result.output },
        tokens_used: result.tokens ?? null,
        cost_usd:    result.cost ?? null,
        duration_ms,
        status:      'success',
        completed_at: new Date().toISOString(),
      }).catch(e => console.warn('[agent-builder/invoke] audit insert falhou:', e.message));

      res.json({
        output:       result.output,
        tokens_used:  result.tokens ?? null,
        duration_ms,
        status:       'success',
      });
    } catch (err) {
      console.error('[agent-builder POST /agents/:id/invoke]', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  return router;
};
