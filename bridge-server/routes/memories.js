'use strict';

const express = require('express');

const VALID_KINDS = ['fact', 'preference', 'history', 'decision'];

function isValidAgentSlug(slug) {
  return typeof slug === 'string' && slug.length > 0 && /^[a-z0-9-]+$/.test(slug);
}

module.exports = function buildMemoriesRouter({ requireJwt, sbFetch, supabaseInsert, SUPABASE_URL, SUPABASE_SERVICE_KEY }) {
  const router = express.Router();

  // ── Helper: pegar tenant_id do usuário autenticado ────────────────────────
  async function getTenantId(userId) {
    if (!userId) throw new Error('Usuário não autenticado');
    const rows = await sbFetch(
      `tenant_members?user_id=eq.${encodeURIComponent(userId)}&select=tenant_id&limit=1`
    );
    return rows?.[0]?.tenant_id ?? null;
  }

  // ── Helper: patch via service role ────────────────────────────────────────
  async function patchMemory(id, updates) {
    if (!SUPABASE_SERVICE_KEY) return;
    const r = await fetch(`${SUPABASE_URL}/rest/v1/agent_memories?id=eq.${id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        Prefer: 'return=representation',
      },
      body: JSON.stringify(updates),
    });
    if (!r.ok) throw new Error(`memory patch ${r.status}: ${await r.text()}`);
    const data = await r.json();
    return Array.isArray(data) ? data[0] : data;
  }

  // ── GET /api/memories — listar memórias do tenant ────────────────────────
  router.get('/memories', requireJwt, async (req, res) => {
    try {
      const tenantId = await getTenantId(req.user.id);
      if (!tenantId) return res.status(403).json({ error: 'tenant não encontrado' });

      let qs = `agent_memories?tenant_id=eq.${tenantId}&order=created_at.desc&select=*`;

      if (req.query.agent_slug) {
        qs += `&agent_id=eq.${encodeURIComponent(req.query.agent_slug)}`;
      }
      if (req.query.kind) {
        if (!VALID_KINDS.includes(req.query.kind)) {
          return res.status(400).json({ error: `kind inválido. Use: ${VALID_KINDS.join(', ')}` });
        }
        qs += `&kind=eq.${encodeURIComponent(req.query.kind)}`;
      }

      const rows = await sbFetch(qs);
      res.json(rows || []);
    } catch (err) {
      console.error('[memories GET]', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ── POST /api/memories — criar memória manual ─────────────────────────────
  router.post('/memories', requireJwt, async (req, res) => {
    try {
      const tenantId = await getTenantId(req.user.id);
      if (!tenantId) return res.status(403).json({ error: 'tenant não encontrado' });

      const { agent_slug, kind, content, importance, expires_at } = req.body;

      if (!agent_slug?.trim()) return res.status(400).json({ error: 'agent_slug obrigatório' });
      if (!isValidAgentSlug(agent_slug.trim())) {
        return res.status(400).json({ error: 'agent_slug inválido: use apenas letras minúsculas, números e hífens' });
      }

      // Verificar se o slug existe na tabela agents para o tenant (globais ou do tenant)
      const slugCheck = await sbFetch(
        `agents?select=slug&or=(tenant_id.is.null,tenant_id.eq.${tenantId})&slug=eq.${encodeURIComponent(agent_slug.trim())}`
      );
      if (!slugCheck || slugCheck.length === 0) {
        return res.status(400).json({ error: `Agent slug '${agent_slug.trim()}' não encontrado` });
      }

      if (!kind) return res.status(400).json({ error: 'kind obrigatório' });
      if (!VALID_KINDS.includes(kind)) {
        return res.status(400).json({ error: `kind inválido. Use: ${VALID_KINDS.join(', ')}` });
      }
      if (!content?.trim()) return res.status(400).json({ error: 'content obrigatório' });

      const importanceNum = importance != null ? parseInt(importance, 10) : 5;
      if (isNaN(importanceNum) || importanceNum < 1 || importanceNum > 10) {
        return res.status(400).json({ error: 'importance deve ser entre 1 e 10' });
      }

      const row = await supabaseInsert('agent_memories', {
        tenant_id:  tenantId,
        agent_id:   agent_slug.trim(),
        user_id:    req.user.id,
        kind,
        content:    content.trim(),
        importance: importanceNum,
        expires_at: expires_at || null,
      });

      res.status(201).json(row);
    } catch (err) {
      console.error('[memories POST]', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ── PATCH /api/memories/:id — editar memória ──────────────────────────────
  router.patch('/memories/:id', requireJwt, async (req, res) => {
    try {
      const tenantId = await getTenantId(req.user.id);
      if (!tenantId) return res.status(403).json({ error: 'tenant não encontrado' });

      const updates = {};
      if (req.body.content    !== undefined) updates.content    = req.body.content;
      if (req.body.importance !== undefined) {
        const imp = parseInt(req.body.importance, 10);
        if (isNaN(imp) || imp < 1 || imp > 10) {
          return res.status(400).json({ error: 'importance deve ser entre 1 e 10' });
        }
        updates.importance = imp;
      }
      if (req.body.expires_at !== undefined) updates.expires_at = req.body.expires_at || null;

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ error: 'nenhum campo válido para atualizar' });
      }

      // Verifica que a memória pertence ao tenant
      const existing = await sbFetch(
        `agent_memories?id=eq.${req.params.id}&tenant_id=eq.${tenantId}&select=id&limit=1`
      );
      if (!existing?.length) return res.status(404).json({ error: 'memória não encontrada' });

      const row = await patchMemory(req.params.id, updates);
      res.json(row);
    } catch (err) {
      console.error('[memories PATCH]', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ── DELETE /api/memories/:id — deletar memória ────────────────────────────
  router.delete('/memories/:id', requireJwt, async (req, res) => {
    try {
      const tenantId = await getTenantId(req.user.id);
      if (!tenantId) return res.status(403).json({ error: 'tenant não encontrado' });

      if (!SUPABASE_SERVICE_KEY) return res.status(500).json({ error: 'service key ausente' });

      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/agent_memories?id=eq.${req.params.id}&tenant_id=eq.${tenantId}`,
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
      console.error('[memories DELETE]', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ── DELETE /api/memories/agent/:slug — wipe de todas as memórias do agente ─
  router.delete('/memories/agent/:slug', requireJwt, async (req, res) => {
    try {
      const tenantId = await getTenantId(req.user.id);
      if (!tenantId) return res.status(403).json({ error: 'tenant não encontrado' });

      const { slug } = req.params;
      if (!isValidAgentSlug(slug)) {
        return res.status(400).json({ error: 'agent_slug inválido: use apenas letras minúsculas, números e hífens' });
      }

      if (!SUPABASE_SERVICE_KEY) return res.status(500).json({ error: 'service key ausente' });

      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/agent_memories?agent_id=eq.${encodeURIComponent(slug)}&tenant_id=eq.${tenantId}`,
        {
          method: 'DELETE',
          headers: {
            apikey: SUPABASE_SERVICE_KEY,
            Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
          },
        }
      );
      if (!r.ok) throw new Error(`wipe ${r.status}: ${await r.text()}`);
      console.log(`[memories DELETE agent] slug=${slug} tenant=${tenantId}`);
      res.json({ deleted: true, agent_slug: slug });
    } catch (err) {
      console.error('[memories DELETE agent]', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  return router;
};
