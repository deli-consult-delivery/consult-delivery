'use strict';

const express = require('express');
const { z }   = require('zod');

const AnexoSchema = z.object({
  url:        z.string().url(),
  mime_type:  z.string().regex(/^(image\/(jpeg|png|gif|webp)|application\/pdf)$/),
  size_bytes: z.number().int().positive().max(5 * 1024 * 1024),
  acao_id:    z.string().uuid().nullable().optional(),
});

const CreateAnexosSchema = z.object({
  anexos: z.array(AnexoSchema).min(1).max(5),
});

module.exports = function buildAnexosRouter({ requireJwt, sbFetch, assertLojaAccess, supabaseInsert }) {
  const router = express.Router();

  async function fetchTarefaCtx(req, res, tarefaId) {
    const rows = await sbFetch(
      `tarefas_loja?id=eq.${encodeURIComponent(tarefaId)}&select=id,loja_id&limit=1`
    );
    if (!rows?.length) {
      res.status(404).json({ error: 'Tarefa não encontrada' });
      return null;
    }
    const tenant_id = await assertLojaAccess(req, res, rows[0].loja_id);
    if (!tenant_id) return null;
    return { tarefa: rows[0], tenant_id };
  }

  // GET /api/tarefas/:id/anexos
  router.get('/tarefas/:id/anexos', requireJwt, async (req, res) => {
    const { id } = req.params;
    try {
      const ctx = await fetchTarefaCtx(req, res, id);
      if (!ctx) return;
      const anexos = await sbFetch(
        `tarefa_anexos?tarefa_id=eq.${encodeURIComponent(id)}&order=created_at.asc&select=*`
      );
      console.log(`[api/tarefas/:id/anexos GET] tarefa=${id} count=${(anexos || []).length}`);
      res.json({ anexos: Array.isArray(anexos) ? anexos : [] });
    } catch (err) {
      console.error('[api/tarefas/:id/anexos GET]', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/tarefas/:id/anexos — recebe JSON com metadados (frontend já fez upload ao Storage)
  router.post('/tarefas/:id/anexos', requireJwt, async (req, res) => {
    const { id } = req.params;
    const parsed = CreateAnexosSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Dados inválidos', details: parsed.error.flatten() });
    }
    try {
      const ctx = await fetchTarefaCtx(req, res, id);
      if (!ctx) return;
      const { tenant_id } = ctx;

      const rows = [];
      for (const a of parsed.data.anexos) {
        const row = await supabaseInsert('tarefa_anexos', {
          tarefa_id:   id,
          acao_id:     a.acao_id ?? null,
          tenant_id,
          url:         a.url,
          mime_type:   a.mime_type,
          size_bytes:  a.size_bytes,
          uploaded_by: req.user.id,
        });
        rows.push(row);
      }
      console.log(`[api/tarefas/:id/anexos POST] tarefa=${id} count=${rows.length}`);
      res.status(201).json({ anexos: rows });
    } catch (err) {
      console.error('[api/tarefas/:id/anexos POST]', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // DELETE /api/tarefas/:id/anexos/:anexoId
  router.delete('/tarefas/:id/anexos/:anexoId', requireJwt, async (req, res) => {
    const { id, anexoId } = req.params;
    try {
      const ctx = await fetchTarefaCtx(req, res, id);
      if (!ctx) return;
      await sbFetch(
        `tarefa_anexos?id=eq.${encodeURIComponent(anexoId)}&tarefa_id=eq.${encodeURIComponent(id)}`,
        { method: 'DELETE' }
      );
      console.log(`[api/tarefas/:id/anexos DELETE] tarefa=${id} anexo=${anexoId}`);
      res.json({ ok: true });
    } catch (err) {
      console.error('[api/tarefas/:id/anexos DELETE]', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  return router;
};
