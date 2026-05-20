'use strict';

const express = require('express');
const {
  ListTarefasQuerySchema,
  CreateTarefaSchema,
} = require('../schemas/tarefas');

// Factory: recebe helpers do index.js para evitar acoplamento circular
module.exports = function buildTarefasRouter({ requireJwt, sbFetch, assertLojaAccess, supabaseInsert }) {
  const router = express.Router();

  // ── Helper: registrar no audit_log ────────────────────────────────────────
  async function logAudit({ tenant_id, user_id, action, resource, metadata }) {
    try {
      await supabaseInsert('audit_log', {
        tenant_id,
        user_id,
        action,
        resource,
        metadata,
      });
    } catch (err) {
      console.error('[audit_log] falha:', err.message);
    }
  }

  // ── Helper: validar schema Zod — retorna dados ou seta 400 e retorna null ─
  function validate(schema, data, res) {
    const result = schema.safeParse(data);
    if (!result.success) {
      res.status(400).json({ error: 'Dados inválidos', details: result.error.flatten() });
      return null;
    }
    return result.data;
  }

  // ════════════════════════════════════════════════════════════════════════
  // GET /api/tarefas/loja/:lojaId — listar tarefas de uma loja com filtros
  // Acesso: qualquer membro do tenant com acesso à loja
  // ════════════════════════════════════════════════════════════════════════
  router.get('/tarefas/loja/:lojaId', requireJwt, async (req, res) => {
    const { lojaId } = req.params;

    const query = validate(ListTarefasQuerySchema, req.query, res);
    if (!query) return;

    const tenant_id = await assertLojaAccess(req, res, lojaId);
    if (!tenant_id) return;

    try {
      const { status, bloco, responsavel_id, prioridade, limit, offset } = query;

      let qs = `loja_id=eq.${encodeURIComponent(lojaId)}&select=*`;
      if (status)         qs += `&status=eq.${encodeURIComponent(status)}`;
      if (bloco)          qs += `&bloco=eq.${encodeURIComponent(bloco)}`;
      if (responsavel_id) qs += `&responsavel_id=eq.${encodeURIComponent(responsavel_id)}`;
      if (prioridade)     qs += `&prioridade=eq.${encodeURIComponent(prioridade)}`;
      qs += `&order=bloco.asc,ordem_no_bloco.asc,created_at.asc`;
      qs += `&limit=${limit}&offset=${offset}`;

      const tarefas = await sbFetch(`tarefas_loja?${qs}`);
      const arr = Array.isArray(tarefas) ? tarefas : [];

      console.log(`[api/tarefas/loja GET] loja=${lojaId} count=${arr.length} offset=${offset}`);
      res.json({
        tarefas: arr,
        limit,
        offset,
        has_more: arr.length === limit,
      });
    } catch (err) {
      console.error('[api/tarefas/loja GET]', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ════════════════════════════════════════════════════════════════════════
  // GET /api/tarefas/:id — detalhe completo com histórico, prints e comentários
  // Acesso: qualquer membro do tenant com acesso à loja da tarefa
  // ════════════════════════════════════════════════════════════════════════
  router.get('/tarefas/:id', requireJwt, async (req, res) => {
    const { id } = req.params;

    try {
      const rows = await sbFetch(
        `tarefas_loja?id=eq.${encodeURIComponent(id)}&select=*&limit=1`
      );
      if (!rows?.length) return res.status(404).json({ error: 'Tarefa não encontrada' });

      const tarefa = rows[0];
      const tenant_id = await assertLojaAccess(req, res, tarefa.loja_id);
      if (!tenant_id) return;

      const [aprovacoes, prints, comentarios] = await Promise.all([
        sbFetch(
          `tarefa_aprovacoes?tarefa_id=eq.${encodeURIComponent(id)}&order=created_at.desc&select=*`
        ),
        sbFetch(
          `tarefa_prints?tarefa_id=eq.${encodeURIComponent(id)}&select=id,tipo,storage_path,url_publica,nome_arquivo,legenda,created_at`
        ),
        sbFetch(
          `tarefa_comentarios?tarefa_id=eq.${encodeURIComponent(id)}&parent_id=is.null&order=created_at.asc&select=id,conteudo,interno,autor_id,editado_em,created_at`
        ),
      ]);

      console.log(`[api/tarefas/:id GET] id=${id}`);
      res.json({
        tarefa: {
          ...tarefa,
          aprovacoes:      Array.isArray(aprovacoes)  ? aprovacoes  : [],
          prints:          Array.isArray(prints)       ? prints      : [],
          prints_count:    Array.isArray(prints)       ? prints.length  : 0,
          comentarios:     Array.isArray(comentarios)  ? comentarios : [],
          comentarios_count: Array.isArray(comentarios) ? comentarios.length : 0,
        },
      });
    } catch (err) {
      console.error('[api/tarefas/:id GET]', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ════════════════════════════════════════════════════════════════════════
  // POST /api/tarefas/loja/:lojaId — criar tarefa manual
  // Acesso: admin, consultor_senior ou consultor atribuído à loja
  // ════════════════════════════════════════════════════════════════════════
  router.post('/tarefas/loja/:lojaId', requireJwt, async (req, res) => {
    const { lojaId } = req.params;

    const body = validate(CreateTarefaSchema, req.body, res);
    if (!body) return;

    const tenant_id = await assertLojaAccess(req, res, lojaId);
    if (!tenant_id) return;

    try {
      const row = {
        loja_id:         lojaId,
        titulo:          body.titulo,
        bloco:           body.bloco,
        situacao:        body.situacao,
        o_que_sera_feito: body.o_que_sera_feito,
        por_que_importa: body.por_que_importa ?? null,
        prioridade:      body.prioridade,
        ordem_no_bloco:  body.ordem_no_bloco,
        prazo_estimado:  body.prazo_estimado ?? null,
        responsavel_id:  body.responsavel_id ?? null,
        metadata:        body.metadata,
        tags:            body.tags,
        status:          'rascunho',
        created_by:      req.user.id,
      };

      const tarefa = await supabaseInsert('tarefas_loja', row);

      await logAudit({
        tenant_id,
        user_id:  req.user.id,
        action:   'tarefa_criada',
        resource: `tarefas_loja:${tarefa.id}`,
        metadata: { after: { titulo: tarefa.titulo, bloco: tarefa.bloco, status: tarefa.status } },
      });

      console.log(`[api/tarefas POST] loja=${lojaId} tarefa=${tarefa.id} bloco=${tarefa.bloco}`);
      res.status(201).json({ tarefa });
    } catch (err) {
      console.error('[api/tarefas POST]', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  return router;
};
