'use strict';

const express = require('express');

module.exports = function buildKnowledgeBaseRouter({ requireJwt, sbFetch, supabaseInsert, SUPABASE_URL, SUPABASE_SERVICE_KEY }) {
  const router = express.Router();

  // Helper: pega tenant_id do usuário autenticado
  async function getTenantId(userId) {
    if (!userId) throw new Error('Usuário não autenticado');
    const rows = await sbFetch(
      `tenant_members?user_id=eq.${encodeURIComponent(userId)}&select=tenant_id&limit=1`
    );
    return rows?.[0]?.tenant_id ?? null;
  }

  // Helper: verifica se artigo pertence ao tenant do usuário
  async function assertArticleAccess(req, res, articleId) {
    const tenantId = await getTenantId(req.user.id);
    if (!tenantId) { res.status(403).json({ error: 'tenant não encontrado' }); return null; }
    const rows = await sbFetch(
      `agent_knowledge_base?id=eq.${encodeURIComponent(articleId)}&tenant_id=eq.${encodeURIComponent(tenantId)}&select=id,tenant_id&limit=1`
    );
    if (!rows?.length) { res.status(404).json({ error: 'artigo não encontrado' }); return null; }
    return tenantId;
  }

  // GET /api/knowledge-base — lista artigos (query: ?agent_slug=X, ?tags=tag1,tag2)
  router.get('/knowledge-base', requireJwt, async (req, res) => {
    try {
      const tenantId = await getTenantId(req.user.id);
      if (!tenantId) return res.status(403).json({ error: 'tenant não encontrado' });

      let qs = `agent_knowledge_base?tenant_id=eq.${encodeURIComponent(tenantId)}&order=created_at.desc&select=*`;

      if (req.query.agent_slug) {
        qs += `&agent_slug=eq.${encodeURIComponent(req.query.agent_slug)}`;
      }
      if (req.query.tags) {
        const tags = req.query.tags.split(',').map(t => t.trim()).filter(Boolean);
        if (tags.length) {
          qs += `&tags=ov.{${tags.map(t => encodeURIComponent(t)).join(',')}}`;
        }
      }

      const rows = await sbFetch(qs);
      res.json(rows || []);
    } catch (err) {
      console.error('[api/knowledge-base GET]', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/knowledge-base — criar artigo
  // Body: { agent_slug, title, content, tags, source }
  router.post('/knowledge-base', requireJwt, async (req, res) => {
    const { agent_slug, title, content, tags, source } = req.body;
    if (!title || !content) return res.status(400).json({ error: 'title e content são obrigatórios' });

    try {
      const tenantId = await getTenantId(req.user.id);
      if (!tenantId) return res.status(403).json({ error: 'tenant não encontrado' });

      const row = {
        tenant_id: tenantId,
        title,
        content,
        tags: tags || [],
        source: source || 'manual',
        is_active: true,
        created_by: req.user.id,
      };
      if (agent_slug !== undefined) row.agent_slug = agent_slug || null;

      const data = await supabaseInsert('agent_knowledge_base', row);
      const article = Array.isArray(data) ? data[0] : data;
      console.log(`[api/knowledge-base POST] id=${article?.id} title="${title}" tenant=${tenantId}`);
      res.status(201).json({ article });
    } catch (err) {
      console.error('[api/knowledge-base POST]', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // PATCH /api/knowledge-base/:id — editar artigo
  router.patch('/knowledge-base/:id', requireJwt, async (req, res) => {
    const { id } = req.params;
    const EDITABLE = new Set(['agent_slug', 'title', 'content', 'tags', 'source', 'is_active']);
    const updates = Object.fromEntries(
      Object.entries(req.body).filter(([k]) => EDITABLE.has(k))
    );
    if (!Object.keys(updates).length) return res.status(400).json({ error: 'nenhum campo válido para atualizar' });

    try {
      const tenantId = await assertArticleAccess(req, res, id);
      if (!tenantId) return;

      updates.updated_at = new Date().toISOString();
      const data = await sbFetch(
        `agent_knowledge_base?id=eq.${encodeURIComponent(id)}&tenant_id=eq.${encodeURIComponent(tenantId)}`,
        { method: 'PATCH', body: updates }
      );
      const article = Array.isArray(data) ? data[0] : data;
      console.log(`[api/knowledge-base PATCH] id=${id} campos=${Object.keys(updates).join(',')}`);
      res.json({ article });
    } catch (err) {
      console.error('[api/knowledge-base/:id PATCH]', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // DELETE /api/knowledge-base/:id — deletar artigo
  router.delete('/knowledge-base/:id', requireJwt, async (req, res) => {
    const { id } = req.params;
    try {
      const tenantId = await assertArticleAccess(req, res, id);
      if (!tenantId) return;

      if (!SUPABASE_SERVICE_KEY) return res.status(503).json({ error: 'SUPABASE_SERVICE_KEY não configurado' });
      const r = await fetch(`${SUPABASE_URL}/rest/v1/agent_knowledge_base?id=eq.${encodeURIComponent(id)}&tenant_id=eq.${encodeURIComponent(tenantId)}`, {
        method: 'DELETE',
        headers: {
          apikey: SUPABASE_SERVICE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        },
      });
      if (!r.ok) throw new Error(`supabase delete ${r.status}: ${await r.text()}`);
      console.log(`[api/knowledge-base DELETE] id=${id}`);
      res.json({ ok: true });
    } catch (err) {
      console.error('[api/knowledge-base/:id DELETE]', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/knowledge-base/search — busca full-text (ilike em content + title)
  // Body: { query, agent_slug? }
  router.post('/knowledge-base/search', requireJwt, async (req, res) => {
    const { query, agent_slug } = req.body;
    if (!query || !query.trim()) return res.status(400).json({ error: 'query obrigatória' });

    try {
      const tenantId = await getTenantId(req.user.id);
      if (!tenantId) return res.status(403).json({ error: 'tenant não encontrado' });

      const term = encodeURIComponent(`%${query.trim()}%`);
      let qs = `agent_knowledge_base?tenant_id=eq.${encodeURIComponent(tenantId)}&is_active=eq.true&or=(title.ilike.${term},content.ilike.${term})&order=created_at.desc&select=*`;

      if (agent_slug) {
        qs += `&agent_slug=eq.${encodeURIComponent(agent_slug)}`;
      }

      const rows = await sbFetch(qs);
      res.json(rows || []);
    } catch (err) {
      console.error('[api/knowledge-base/search POST]', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  return router;
};
