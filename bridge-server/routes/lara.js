'use strict';

const express = require('express');

// S2-G01.5 — LARA editorial: GET drafts, PATCH revisão, POST publicar
module.exports = function buildLaraRouter({ requireJwt, sbFetch, supabaseInsert }) {
  const router = express.Router();

  // ── Helper: verifica membro do tenant ──────────────────────────────────────
  async function assertTenantMember(req, res, tenant_id) {
    const rows = await sbFetch(
      `tenant_members?tenant_id=eq.${encodeURIComponent(tenant_id)}&user_id=eq.${encodeURIComponent(req.user.id)}&select=tenant_id&limit=1`
    );
    if (!rows?.length) {
      res.status(403).json({ error: 'Acesso negado: usuário não é membro deste tenant' });
      return false;
    }
    return true;
  }

  // ── GET /api/lara/drafts?tenant_id=&status= ───────────────────────────────
  // Lista rascunhos editoriais com filtro opcional de status
  router.get('/lara/drafts', requireJwt, async (req, res) => {
    const { tenant_id, status, limit: lim = '50', page = '0' } = req.query;
    if (!tenant_id) return res.status(400).json({ error: 'tenant_id obrigatório' });

    try {
      if (!await assertTenantMember(req, res, tenant_id)) return;

      const pageNum  = Math.max(0, parseInt(page) || 0);
      const limitNum = Math.min(100, Math.max(1, parseInt(lim) || 50));
      const offset   = pageNum * limitNum;

      let filter = `tenant_id=eq.${encodeURIComponent(tenant_id)}`;
      if (status) filter += `&status=eq.${encodeURIComponent(status)}`;

      const drafts = await sbFetch(
        `content_drafts?${filter}&order=created_at.desc&limit=${limitNum}&offset=${offset}&select=id,titulo,corpo,hashtags,formato,status,feedback,created_at,updated_at,calendar_id`
      );

      res.json({ drafts: drafts || [] });
    } catch (err) {
      console.error('[lara/drafts] GET:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ── GET /api/lara/drafts/:id ──────────────────────────────────────────────
  // Retorna draft completo (inclui corpo para pré-visualização)
  router.get('/lara/drafts/:id', requireJwt, async (req, res) => {
    const { id } = req.params;

    try {
      const rows = await sbFetch(
        `content_drafts?id=eq.${encodeURIComponent(id)}&select=*&limit=1`
      );
      if (!rows?.length) return res.status(404).json({ error: 'Draft não encontrado' });

      const draft = rows[0];
      if (!await assertTenantMember(req, res, draft.tenant_id)) return;

      res.json({ draft });
    } catch (err) {
      console.error('[lara/drafts/:id] GET:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ── PATCH /api/lara/drafts/:id ────────────────────────────────────────────
  // Revisar draft: status (aprovado|rejeitado) + feedback opcional
  // Acesso: marketing ou admin (RBAC tratado no frontend — bridge só valida membro)
  router.patch('/lara/drafts/:id', requireJwt, async (req, res) => {
    const { id } = req.params;
    const { status, feedback } = req.body || {};

    const ALLOWED = ['aprovado', 'rejeitado'];
    if (!status || !ALLOWED.includes(status)) {
      return res.status(400).json({ error: `status deve ser um de: ${ALLOWED.join(', ')}` });
    }

    try {
      const rows = await sbFetch(
        `content_drafts?id=eq.${encodeURIComponent(id)}&select=tenant_id,status&limit=1`
      );
      if (!rows?.length) return res.status(404).json({ error: 'Draft não encontrado' });

      const draft = rows[0];
      if (!await assertTenantMember(req, res, draft.tenant_id)) return;
      if (draft.status === 'publicado') {
        return res.status(409).json({ error: 'Draft já publicado — não pode ser alterado' });
      }

      const updates = await sbFetch(
        `content_drafts?id=eq.${encodeURIComponent(id)}`,
        {
          method: 'PATCH',
          body: {
            status,
            feedback: feedback || null,
            revisado_por: req.user.id,
            revisado_em: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          prefer: 'return=representation',
        }
      );

      await supabaseInsert('audit_log', {
        tenant_id: draft.tenant_id,
        user_id: req.user.id,
        action: `lara.draft.${status}`,
        resource: `content_drafts/${id}`,
        metadata: { feedback: feedback || null },
      });

      res.json({ draft: updates?.[0] || { id, status } });
    } catch (err) {
      console.error('[lara/drafts/:id] PATCH:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ── POST /api/lara/publicar/:draft_id ─────────────────────────────────────
  // Publica draft aprovado: copia para content_published + marca draft como publicado
  router.post('/lara/publicar/:draft_id', requireJwt, async (req, res) => {
    const { draft_id } = req.params;
    const { canal = 'instagram' } = req.body || {};

    const CANAIS = ['instagram', 'linkedin', 'whatsapp', 'outro'];
    if (!CANAIS.includes(canal)) {
      return res.status(400).json({ error: `canal deve ser um de: ${CANAIS.join(', ')}` });
    }

    try {
      const rows = await sbFetch(
        `content_drafts?id=eq.${encodeURIComponent(draft_id)}&select=*&limit=1`
      );
      if (!rows?.length) return res.status(404).json({ error: 'Draft não encontrado' });

      const draft = rows[0];
      if (!await assertTenantMember(req, res, draft.tenant_id)) return;

      if (draft.status !== 'aprovado') {
        return res.status(409).json({
          error: `Draft deve estar com status 'aprovado' para publicar (atual: ${draft.status})`,
        });
      }

      // Inserir em content_published
      const published = await sbFetch('content_published', {
        method: 'POST',
        body: {
          tenant_id: draft.tenant_id,
          draft_id: draft.id,
          titulo: draft.titulo,
          corpo: draft.corpo,
          hashtags: draft.hashtags,
          formato: draft.formato,
          canal,
          publicado_por: req.user.id,
        },
        prefer: 'return=representation',
      });

      // Marcar draft como publicado
      await sbFetch(`content_drafts?id=eq.${encodeURIComponent(draft_id)}`, {
        method: 'PATCH',
        body: { status: 'publicado', updated_at: new Date().toISOString() },
      });

      await supabaseInsert('audit_log', {
        tenant_id: draft.tenant_id,
        user_id: req.user.id,
        action: 'lara.draft.publicado',
        resource: `content_drafts/${draft_id}`,
        metadata: { canal, published_id: published?.[0]?.id },
      });

      res.json({ published: published?.[0] || { draft_id, canal } });
    } catch (err) {
      console.error('[lara/publicar/:draft_id] POST:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  return router;
};
