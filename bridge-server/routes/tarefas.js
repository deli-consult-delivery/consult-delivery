'use strict';

const express = require('express');
const {
  ListTarefasQuerySchema,
  CreateTarefaSchema,
  CreateFromTemplateSchema,
  UpdateTarefaSchema,
  EnviarAprovacaoSchema,
  AprovarSchema,
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

  // ── Helper: buscar tarefa e verificar acesso — retorna { tarefa, tenant_id } ─
  async function fetchTarefaComAcesso(req, res, id) {
    const rows = await sbFetch(
      `tarefas_loja?id=eq.${encodeURIComponent(id)}&select=*&limit=1`
    );
    if (!rows?.length) {
      res.status(404).json({ error: 'Tarefa não encontrada' });
      return null;
    }
    const tarefa = rows[0];
    const tenant_id = await assertLojaAccess(req, res, tarefa.loja_id);
    if (!tenant_id) return null;
    return { tarefa, tenant_id };
  }

  // ── Helper: aplicar PATCH na tarefa e retornar row atualizado ─────────────
  async function patchTarefa(id, updates) {
    const rows = await sbFetch(
      `tarefas_loja?id=eq.${encodeURIComponent(id)}`,
      { method: 'PATCH', body: updates, prefer: 'return=representation' }
    );
    return Array.isArray(rows) ? rows[0] : rows;
  }

  // ════════════════════════════════════════════════════════════════════════
  // POST /api/tarefas/loja/:lojaId/from-template — criar tarefa de template
  // Acesso: admin, consultor_senior ou consultor atribuído à loja
  // ════════════════════════════════════════════════════════════════════════
  router.post('/tarefas/loja/:lojaId/from-template', requireJwt, async (req, res) => {
    const { lojaId } = req.params;

    const body = validate(CreateFromTemplateSchema, req.body, res);
    if (!body) return;

    const tenant_id = await assertLojaAccess(req, res, lojaId);
    if (!tenant_id) return;

    try {
      const tmpl = await sbFetch(
        `templates_tarefa?id=eq.${encodeURIComponent(body.template_id)}&select=*&limit=1`
      );
      if (!tmpl?.length) return res.status(404).json({ error: 'Template não encontrado' });

      const t = tmpl[0];
      if (t.tenant_id !== tenant_id) return res.status(403).json({ error: 'Template de outro tenant' });
      if (!t.ativo) return res.status(422).json({ error: 'Template inativo' });

      const row = {
        loja_id:          lojaId,
        titulo:           t.titulo,
        bloco:            t.bloco,
        situacao:         t.situacao_padrao,
        o_que_sera_feito: t.o_que_sera_feito,
        por_que_importa:  t.por_que_importa ?? null,
        prioridade:       t.prioridade ?? 'estrutural',
        ordem_no_bloco:   body.ordem_no_bloco ?? t.ordem ?? 0,
        prazo_estimado:   body.prazo_estimado ?? null,
        responsavel_id:   body.responsavel_id ?? null,
        metadata:         { template_id: t.id },
        tags:             [],
        status:           'rascunho',
        created_by:       req.user.id,
      };

      const tarefa = await supabaseInsert('tarefas_loja', row);

      await logAudit({
        tenant_id,
        user_id:  req.user.id,
        action:   'tarefa_criada_from_template',
        resource: `tarefas_loja:${tarefa.id}`,
        metadata: { template_id: t.id, titulo: tarefa.titulo, bloco: tarefa.bloco },
      });

      console.log(`[api/tarefas/from-template POST] loja=${lojaId} tarefa=${tarefa.id} tmpl=${t.id}`);
      res.status(201).json({ tarefa });
    } catch (err) {
      console.error('[api/tarefas/from-template POST]', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ════════════════════════════════════════════════════════════════════════
  // PATCH /api/tarefas/:id — atualizar campos da tarefa
  // Acesso: admin, consultor_senior ou consultor atribuído à loja
  // ════════════════════════════════════════════════════════════════════════
  router.patch('/tarefas/:id', requireJwt, async (req, res) => {
    const { id } = req.params;

    const body = validate(UpdateTarefaSchema, req.body, res);
    if (!body) return;

    try {
      const ctx = await fetchTarefaComAcesso(req, res, id);
      if (!ctx) return;
      const { tarefa: before, tenant_id } = ctx;

      const updated = await patchTarefa(id, body);

      await logAudit({
        tenant_id,
        user_id:  req.user.id,
        action:   'tarefa_atualizada',
        resource: `tarefas_loja:${id}`,
        metadata: {
          before: Object.fromEntries(Object.keys(body).map(k => [k, before[k]])),
          after:  body,
        },
      });

      console.log(`[api/tarefas PATCH] id=${id} campos=${Object.keys(body).join(',')}`);
      res.json({ tarefa: updated });
    } catch (err) {
      console.error('[api/tarefas PATCH]', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ════════════════════════════════════════════════════════════════════════
  // POST /api/tarefas/:id/enviar-aprovacao — rascunho → aguardando_aprovacao
  // ════════════════════════════════════════════════════════════════════════
  router.post('/tarefas/:id/enviar-aprovacao', requireJwt, async (req, res) => {
    const { id } = req.params;

    const body = validate(EnviarAprovacaoSchema, req.body, res);
    if (!body) return;

    try {
      const ctx = await fetchTarefaComAcesso(req, res, id);
      if (!ctx) return;
      const { tarefa, tenant_id } = ctx;

      const VALIDOS = ['rascunho', 'aguardando_envio', 'rejeitada'];
      if (!VALIDOS.includes(tarefa.status)) {
        return res.status(422).json({
          error: `Status '${tarefa.status}' não permite enviar para aprovação`,
        });
      }

      await patchTarefa(id, { status: 'aguardando_aprovacao' });

      await supabaseInsert('tarefa_aprovacoes', {
        tarefa_id: id,
        acao:      'enviada_aprovacao',
        autor_id:  req.user.id,
        nota:      body.nota ?? null,
      });

      await logAudit({
        tenant_id,
        user_id:  req.user.id,
        action:   'tarefa_enviada_aprovacao',
        resource: `tarefas_loja:${id}`,
        metadata: { status_anterior: tarefa.status },
      });

      console.log(`[api/tarefas/enviar-aprovacao POST] id=${id}`);
      res.json({ ok: true, status: 'aguardando_aprovacao' });
    } catch (err) {
      console.error('[api/tarefas/enviar-aprovacao POST]', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ════════════════════════════════════════════════════════════════════════
  // POST /api/tarefas/:id/aprovar — aguardando_aprovacao → aprovada
  // ════════════════════════════════════════════════════════════════════════
  router.post('/tarefas/:id/aprovar', requireJwt, async (req, res) => {
    const { id } = req.params;

    const body = validate(AprovarSchema, req.body, res);
    if (!body) return;

    try {
      const ctx = await fetchTarefaComAcesso(req, res, id);
      if (!ctx) return;
      const { tarefa, tenant_id } = ctx;

      if (tarefa.status !== 'aguardando_aprovacao') {
        return res.status(422).json({
          error: `Status '${tarefa.status}' não permite aprovação`,
        });
      }

      await patchTarefa(id, {
        status:      'aprovada',
        aprovada_em: new Date().toISOString(),
      });

      await supabaseInsert('tarefa_aprovacoes', {
        tarefa_id: id,
        acao:      'aprovada',
        autor_id:  req.user.id,
        nota:      body.nota ?? null,
      });

      await logAudit({
        tenant_id,
        user_id:  req.user.id,
        action:   'tarefa_aprovada',
        resource: `tarefas_loja:${id}`,
        metadata: { nota: body.nota ?? null },
      });

      console.log(`[api/tarefas/aprovar POST] id=${id}`);
      res.json({ ok: true, status: 'aprovada' });
    } catch (err) {
      console.error('[api/tarefas/aprovar POST]', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  return router;
};
