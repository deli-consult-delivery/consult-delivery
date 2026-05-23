'use strict';

const express = require('express');
const {
  ListTarefasQuerySchema,
  CreateTarefaSchema,
  CreateFromTemplateSchema,
  UpdateTarefaSchema,
  EnviarAprovacaoSchema,
  AprovarSchema,
  RejeitarSchema,
  IniciarExecucaoSchema,
  SubmeterValidacaoSchema,
  ConcluirSchema,
  MarcarConcluidaSchema,
  ListComentariosQuerySchema,
  CreateComentarioSchema,
  RelatorioQuerySchema,
  CreatePrintSchema,
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

  // ════════════════════════════════════════════════════════════════════════
  // POST /api/tarefas/:id/rejeitar — aguardando_aprovacao → rejeitada
  // ════════════════════════════════════════════════════════════════════════
  router.post('/tarefas/:id/rejeitar', requireJwt, async (req, res) => {
    const { id } = req.params;

    const body = validate(RejeitarSchema, req.body, res);
    if (!body) return;

    try {
      const ctx = await fetchTarefaComAcesso(req, res, id);
      if (!ctx) return;
      const { tarefa, tenant_id } = ctx;

      if (tarefa.status !== 'aguardando_aprovacao') {
        return res.status(422).json({
          error: `Status '${tarefa.status}' não permite rejeição`,
        });
      }

      await patchTarefa(id, { status: 'rejeitada' });

      await supabaseInsert('tarefa_aprovacoes', {
        tarefa_id: id,
        acao:      'rejeitada',
        autor_id:  req.user.id,
        nota:      body.nota,
      });

      await logAudit({
        tenant_id,
        user_id:  req.user.id,
        action:   'tarefa_rejeitada',
        resource: `tarefas_loja:${id}`,
        metadata: { nota: body.nota },
      });

      console.log(`[api/tarefas/rejeitar POST] id=${id}`);
      res.json({ ok: true, status: 'rejeitada' });
    } catch (err) {
      console.error('[api/tarefas/rejeitar POST]', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ════════════════════════════════════════════════════════════════════════
  // POST /api/tarefas/:id/iniciar-execucao — aprovada → em_execucao
  // ════════════════════════════════════════════════════════════════════════
  router.post('/tarefas/:id/iniciar-execucao', requireJwt, async (req, res) => {
    const { id } = req.params;

    const body = validate(IniciarExecucaoSchema, req.body, res);
    if (!body) return;

    try {
      const ctx = await fetchTarefaComAcesso(req, res, id);
      if (!ctx) return;
      const { tarefa, tenant_id } = ctx;

      if (tarefa.status !== 'aprovada') {
        return res.status(422).json({
          error: `Status '${tarefa.status}' não permite iniciar execução`,
        });
      }

      await patchTarefa(id, {
        status:       'em_execucao',
        executada_em: new Date().toISOString(),
      });

      await supabaseInsert('tarefa_aprovacoes', {
        tarefa_id: id,
        acao:      'iniciou_execucao',
        autor_id:  req.user.id,
        nota:      body.nota ?? null,
      });

      await logAudit({
        tenant_id,
        user_id:  req.user.id,
        action:   'tarefa_execucao_iniciada',
        resource: `tarefas_loja:${id}`,
        metadata: {},
      });

      console.log(`[api/tarefas/iniciar-execucao POST] id=${id}`);
      res.json({ ok: true, status: 'em_execucao' });
    } catch (err) {
      console.error('[api/tarefas/iniciar-execucao POST]', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ════════════════════════════════════════════════════════════════════════
  // POST /api/tarefas/:id/submeter-validacao — em_execucao → aguardando_validacao
  // ════════════════════════════════════════════════════════════════════════
  router.post('/tarefas/:id/submeter-validacao', requireJwt, async (req, res) => {
    const { id } = req.params;

    const body = validate(SubmeterValidacaoSchema, req.body, res);
    if (!body) return;

    try {
      const ctx = await fetchTarefaComAcesso(req, res, id);
      if (!ctx) return;
      const { tarefa, tenant_id } = ctx;

      if (tarefa.status !== 'em_execucao') {
        return res.status(422).json({
          error: `Status '${tarefa.status}' não permite submeter para validação`,
        });
      }

      await patchTarefa(id, { status: 'aguardando_validacao' });

      await supabaseInsert('tarefa_aprovacoes', {
        tarefa_id: id,
        acao:      'submeteu_validacao',
        autor_id:  req.user.id,
        nota:      body.nota ?? null,
      });

      await logAudit({
        tenant_id,
        user_id:  req.user.id,
        action:   'tarefa_submetida_validacao',
        resource: `tarefas_loja:${id}`,
        metadata: {},
      });

      console.log(`[api/tarefas/submeter-validacao POST] id=${id}`);
      res.json({ ok: true, status: 'aguardando_validacao' });
    } catch (err) {
      console.error('[api/tarefas/submeter-validacao POST]', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ── Helper G5+G6: notificar cliente + fechar análise se completa ─────────
  // Non-fatal: nunca propaga exceção para o chamador
  async function _notificarConclusao(tarefa, tenant_id) {
    if (!tarefa.analise_id) return;
    try {
      const analises = await sbFetch(
        `analises?id=eq.${encodeURIComponent(tarefa.analise_id)}&select=id,numero_whatsapp_cliente,total_tarefas_geradas&limit=1`
      );
      const analise = analises?.[0];
      if (!analise?.numero_whatsapp_cliente) return;

      const [lojas, instances] = await Promise.all([
        sbFetch(`lojas?id=eq.${encodeURIComponent(tarefa.loja_id)}&select=nome&limit=1`),
        sbFetch(`evolution_instances?tenant_id=eq.${encodeURIComponent(tenant_id)}&select=evolution_url,api_key,instance_name&limit=1`),
      ]);
      const loja = lojas?.[0];
      const inst = instances?.[0];

      if (inst) {
        // G5 — tarefa concluída
        const msgLines = [
          `✅ Tarefa concluída: ${tarefa.titulo}`,
          '',
          `Loja: ${loja?.nome ?? ''}`,
        ];
        if (tarefa.resultado_resumo) msgLines.push(tarefa.resultado_resumo);
        await fetch(
          `${inst.evolution_url}/message/sendText/${inst.instance_name}`,
          {
            method:  'POST',
            headers: { 'Content-Type': 'application/json', apikey: inst.api_key },
            body:    JSON.stringify({ number: analise.numero_whatsapp_cliente, text: msgLines.join('\n') }),
            signal:  AbortSignal.timeout(15_000),
          }
        );
        console.log(`[_notificarConclusao] G5 sent tarefa=${tarefa.id} numero=${analise.numero_whatsapp_cliente}`);
      }

      // G6 — encerrar análise se todas as tarefas estão concluídas ou rejeitadas
      // TD#28: rejeitada é terminal — não vira concluída; contar ambas
      const [concluidas, rejeitadasG6] = await Promise.all([
        sbFetch(`tarefas_loja?analise_id=eq.${encodeURIComponent(tarefa.analise_id)}&status=eq.concluida&select=id&limit=500`),
        sbFetch(`tarefas_loja?analise_id=eq.${encodeURIComponent(tarefa.analise_id)}&status=eq.rejeitada&select=id&limit=500`),
      ]);
      const countConcluidas   = concluidas?.length   ?? 0;
      const countRejeitadasG6 = rejeitadasG6?.length ?? 0;
      if (analise.total_tarefas_geradas && (countConcluidas + countRejeitadasG6) >= analise.total_tarefas_geradas) {
        await sbFetch(
          `analises?id=eq.${encodeURIComponent(analise.id)}`,
          { method: 'PATCH', body: { status: 'concluida', concluida_em: new Date().toISOString() } }
        );
        if (inst) {
          await fetch(
            `${inst.evolution_url}/message/sendText/${inst.instance_name}`,
            {
              method:  'POST',
              headers: { 'Content-Type': 'application/json', apikey: inst.api_key },
              body:    JSON.stringify({
                number: analise.numero_whatsapp_cliente,
                text:   `🎉 Parabéns! Todas as ${analise.total_tarefas_geradas} tarefas da análise da sua loja ${loja?.nome ?? ''} foram executadas.\n\nVocê pode acompanhar resultados nos próximos dias.\n\nObrigado pela parceria — Consult Delivery.`,
              }),
              signal: AbortSignal.timeout(15_000),
            }
          );
        }
        console.log(`[_notificarConclusao] G6 análise=${analise.id} CONCLUÍDA`);
      }
    } catch (wapErr) {
      console.error('[_notificarConclusao] G5+G6 falhou (non-fatal):', wapErr.message);
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  // POST /api/tarefas/:id/concluir — aguardando_validacao → concluida
  // ════════════════════════════════════════════════════════════════════════
  router.post('/tarefas/:id/concluir', requireJwt, async (req, res) => {
    const { id } = req.params;

    const body = validate(ConcluirSchema, req.body, res);
    if (!body) return;

    try {
      const ctx = await fetchTarefaComAcesso(req, res, id);
      if (!ctx) return;
      const { tarefa, tenant_id } = ctx;

      if (tarefa.status !== 'aguardando_validacao') {
        return res.status(422).json({
          error: `Status '${tarefa.status}' não permite concluir`,
        });
      }

      await patchTarefa(id, {
        status:       'concluida',
        concluida_em: new Date().toISOString(),
      });

      await supabaseInsert('tarefa_aprovacoes', {
        tarefa_id: id,
        acao:      'concluiu',
        autor_id:  req.user.id,
        nota:      body.nota ?? null,
      });

      await logAudit({
        tenant_id,
        user_id:  req.user.id,
        action:   'tarefa_concluida',
        resource: `tarefas_loja:${id}`,
        metadata: {},
      });

      await _notificarConclusao(tarefa, tenant_id);

      console.log(`[api/tarefas/concluir POST] id=${id}`);
      res.json({ ok: true, status: 'concluida' });
    } catch (err) {
      console.error('[api/tarefas/concluir POST]', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ════════════════════════════════════════════════════════════════════════
  // POST /api/tarefas/:id/marcar-concluida — aprovada → concluida (compound)
  // TD#31: colapsa iniciar-execucao + submeter-validacao + concluir em 1 clique
  // ════════════════════════════════════════════════════════════════════════
  router.post('/tarefas/:id/marcar-concluida', requireJwt, async (req, res) => {
    const { id } = req.params;

    const body = validate(MarcarConcluidaSchema, req.body, res);
    if (!body) return;

    try {
      const ctx = await fetchTarefaComAcesso(req, res, id);
      if (!ctx) return;
      const { tarefa, tenant_id } = ctx;

      if (tarefa.status !== 'aprovada') {
        return res.status(409).json({
          error: `Status '${tarefa.status}' não permite marcar-concluida (esperado: aprovada)`,
        });
      }

      try {
        // 1. aprovada → em_execucao
        await patchTarefa(id, { status: 'em_execucao', executada_em: new Date().toISOString() });
        await supabaseInsert('tarefa_aprovacoes', {
          tarefa_id: id,
          acao:      'iniciou_execucao',
          autor_id:  req.user.id,
          nota:      null,
        });

        // 2. em_execucao → aguardando_validacao
        await patchTarefa(id, { status: 'aguardando_validacao' });
        await supabaseInsert('tarefa_aprovacoes', {
          tarefa_id: id,
          acao:      'submeteu_validacao',
          autor_id:  req.user.id,
          nota:      null,
        });

        // 3. aguardando_validacao → concluida
        await patchTarefa(id, { status: 'concluida', concluida_em: new Date().toISOString() });
        await supabaseInsert('tarefa_aprovacoes', {
          tarefa_id: id,
          acao:      'concluiu',
          autor_id:  req.user.id,
          nota:      body.nota ?? null,
        });
      } catch (seqErr) {
        console.error('[api/tarefas/marcar-concluida] erro na sequência — revertendo pra aprovada:', seqErr.message);
        try {
          await patchTarefa(id, { status: 'aprovada', executada_em: null, concluida_em: null });
        } catch (rbErr) {
          console.error('[api/tarefas/marcar-concluida] rollback falhou:', rbErr.message);
        }
        return res.status(500).json({ error: seqErr.message });
      }

      await logAudit({
        tenant_id,
        user_id:  req.user.id,
        action:   'tarefa_marcada_concluida',
        resource: `tarefas_loja:${id}`,
        metadata: {},
      });

      // passar tarefa com status atualizado para G5+G6
      await _notificarConclusao({ ...tarefa, status: 'concluida' }, tenant_id);

      console.log(`[api/tarefas/marcar-concluida POST] id=${id}`);
      res.json({ ok: true, status: 'concluida', tarefa_id: id });
    } catch (err) {
      console.error('[api/tarefas/marcar-concluida POST]', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ════════════════════════════════════════════════════════════════════════
  // GET /api/tarefas/loja/:lojaId/relatorio — relatório completo por loja
  // Acesso: qualquer membro do tenant com acesso à loja
  // ════════════════════════════════════════════════════════════════════════
  router.get('/tarefas/loja/:lojaId/relatorio', requireJwt, async (req, res) => {
    const { lojaId } = req.params;

    const query = validate(RelatorioQuerySchema, req.query, res);
    if (!query) return;

    const tenant_id = await assertLojaAccess(req, res, lojaId);
    if (!tenant_id) return;

    try {
      const { data_inicio, data_fim } = query;

      const lojas = await sbFetch(
        `lojas?id=eq.${encodeURIComponent(lojaId)}&select=id,nome,cidade,segmento&limit=1`
      );
      const loja = lojas?.[0] ?? { id: lojaId, nome: null, cidade: null, segmento: null };

      let qs = `tarefas_loja?loja_id=eq.${encodeURIComponent(lojaId)}`
             + `&select=id,bloco,ordem_no_bloco,titulo,situacao,o_que_sera_feito,por_que_importa,status,prioridade,prazo_estimado,concluida_em`
             + `&order=bloco.asc,ordem_no_bloco.asc`;
      if (data_inicio) qs += `&created_at=gte.${data_inicio}`;
      if (data_fim)    qs += `&created_at=lte.${data_fim}T23:59:59`;

      const tarefas = await sbFetch(qs);
      const arr = Array.isArray(tarefas) ? tarefas : [];

      const por_status = {};
      const por_bloco = {};
      const por_prioridade = {};

      for (const t of arr) {
        por_status[t.status]         = (por_status[t.status]         || 0) + 1;
        por_bloco[t.bloco]           = (por_bloco[t.bloco]           || 0) + 1;
        por_prioridade[t.prioridade] = (por_prioridade[t.prioridade] || 0) + 1;
      }

      console.log(`[api/tarefas/loja/relatorio GET] loja=${lojaId} total=${arr.length}`);
      res.json({
        loja:      { id: loja.id, nome: loja.nome, cidade: loja.cidade, segmento: loja.segmento },
        gerado_em: new Date().toISOString(),
        totais: { total: arr.length, por_status, por_bloco, por_prioridade },
        periodo:   { data_inicio: data_inicio ?? null, data_fim: data_fim ?? null },
        tarefas:   arr.map(t => ({
          id:               t.id,
          bloco:            t.bloco,
          ordem_no_bloco:   t.ordem_no_bloco,
          titulo:           t.titulo,
          situacao:         t.situacao,
          o_que_sera_feito: t.o_que_sera_feito,
          por_que_importa:  t.por_que_importa,
          status:           t.status,
          prioridade:       t.prioridade,
          prazo_estimado:   t.prazo_estimado,
          concluida_em:     t.concluida_em,
        })),
      });
    } catch (err) {
      console.error('[api/tarefas/loja/relatorio GET]', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ════════════════════════════════════════════════════════════════════════
  // GET /api/tarefas/:id/comentarios — listar comentários de uma tarefa
  // Acesso: qualquer membro do tenant com acesso à loja da tarefa
  // ════════════════════════════════════════════════════════════════════════
  router.get('/tarefas/:id/comentarios', requireJwt, async (req, res) => {
    const { id } = req.params;

    const query = validate(ListComentariosQuerySchema, req.query, res);
    if (!query) return;

    try {
      const ctx = await fetchTarefaComAcesso(req, res, id);
      if (!ctx) return;

      const { limit, offset } = query;
      const comentarios = await sbFetch(
        `tarefa_comentarios?tarefa_id=eq.${encodeURIComponent(id)}&order=created_at.asc&select=*&limit=${limit}&offset=${offset}`
      );
      const arr = Array.isArray(comentarios) ? comentarios : [];

      console.log(`[api/tarefas/:id/comentarios GET] tarefa=${id} count=${arr.length}`);
      res.json({ comentarios: arr, limit, offset, has_more: arr.length === limit });
    } catch (err) {
      console.error('[api/tarefas/:id/comentarios GET]', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ════════════════════════════════════════════════════════════════════════
  // POST /api/tarefas/:id/comentarios — criar comentário em tarefa
  // Acesso: qualquer membro do tenant com acesso à loja da tarefa
  // ════════════════════════════════════════════════════════════════════════
  router.post('/tarefas/:id/comentarios', requireJwt, async (req, res) => {
    const { id } = req.params;

    const body = validate(CreateComentarioSchema, req.body, res);
    if (!body) return;

    try {
      const ctx = await fetchTarefaComAcesso(req, res, id);
      if (!ctx) return;
      const { tenant_id } = ctx;

      const comentario = await supabaseInsert('tarefa_comentarios', {
        tarefa_id: id,
        conteudo:  body.conteudo,
        interno:   body.interno,
        parent_id: body.parent_id ?? null,
        print_id:  body.print_id  ?? null,
        autor_id:  req.user.id,
      });

      await logAudit({
        tenant_id,
        user_id:  req.user.id,
        action:   'comentario_criado',
        resource: `tarefa_comentarios:${comentario.id}`,
        metadata: { tarefa_id: id, interno: body.interno },
      });

      console.log(`[api/tarefas/:id/comentarios POST] tarefa=${id} comentario=${comentario.id}`);
      res.status(201).json({ comentario });
    } catch (err) {
      console.error('[api/tarefas/:id/comentarios POST]', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ════════════════════════════════════════════════════════════════════════
  // GET /api/tarefas/:id/prints — listar prints de uma tarefa
  // Acesso: qualquer membro do tenant com acesso à loja da tarefa
  // ════════════════════════════════════════════════════════════════════════
  router.get('/tarefas/:id/prints', requireJwt, async (req, res) => {
    const { id } = req.params;

    try {
      const ctx = await fetchTarefaComAcesso(req, res, id);
      if (!ctx) return;

      const prints = await sbFetch(
        `tarefa_prints?tarefa_id=eq.${encodeURIComponent(id)}&order=created_at.asc&select=*`
      );
      const arr = Array.isArray(prints) ? prints : [];

      console.log(`[api/tarefas/:id/prints GET] tarefa=${id} count=${arr.length}`);
      res.json({ prints: arr });
    } catch (err) {
      console.error('[api/tarefas/:id/prints GET]', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ════════════════════════════════════════════════════════════════════════
  // POST /api/tarefas/:id/prints — registrar metadados de print (upload feito no Storage pelo frontend)
  // Acesso: qualquer membro do tenant com acesso à loja da tarefa
  // ════════════════════════════════════════════════════════════════════════
  router.post('/tarefas/:id/prints', requireJwt, async (req, res) => {
    const { id } = req.params;

    const body = validate(CreatePrintSchema, req.body, res);
    if (!body) return;

    try {
      const ctx = await fetchTarefaComAcesso(req, res, id);
      if (!ctx) return;
      const { tenant_id } = ctx;

      const print = await supabaseInsert('tarefa_prints', {
        tarefa_id:     id,
        tipo:          body.tipo,
        storage_path:  body.storage_path,
        url_publica:   body.url_publica   ?? null,
        nome_arquivo:  body.nome_arquivo,
        tamanho_bytes: body.tamanho_bytes ?? null,
        mime_type:     body.mime_type     ?? null,
        legenda:       body.legenda       ?? null,
        enviado_por:   req.user.id,
      });

      await logAudit({
        tenant_id,
        user_id:  req.user.id,
        action:   'print_registrado',
        resource: `tarefa_prints:${print.id}`,
        metadata: { tarefa_id: id, tipo: body.tipo, nome_arquivo: body.nome_arquivo },
      });

      console.log(`[api/tarefas/:id/prints POST] tarefa=${id} print=${print.id} tipo=${body.tipo}`);
      res.status(201).json({ print });
    } catch (err) {
      console.error('[api/tarefas/:id/prints POST]', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  return router;
};
