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
  EnviarWhatsappSchema,
} = require('../schemas/analises');

const { normalizeWhatsAppNumberBR } = require('../lib/normalize-whatsapp');

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

  // ══════════════════════════════════════════════════════════════════════════
  // 4. POST /api/lojas/:id/analises/:aid/enviar-whatsapp
  //    Envia análise formatada ao cliente via WhatsApp e abre sessão de aprovação.
  //    Pré-condição: analise.status === 'processada'
  // ══════════════════════════════════════════════════════════════════════════
  router.post('/lojas/:id/analises/:aid/enviar-whatsapp', requireJwt, async (req, res) => {
    const { id: lojaId, aid } = req.params;

    const body = validate(EnviarWhatsappSchema, req.body, res);
    if (!body) return;

    try {
      const tenantId = await assertLojaAccess(req, res, lojaId);
      if (!tenantId) return;

      // Busca analise — precisa estar processada
      const analises = await sbFetch(
        `analises?id=eq.${encodeURIComponent(aid)}&loja_id=eq.${encodeURIComponent(lojaId)}&select=id,status,total_tarefas_geradas,loom_url&limit=1`
      );
      if (!analises?.length)
        return res.status(404).json({ error: 'Análise não encontrada nesta loja' });
      const analise = analises[0];
      if (analise.status !== 'processada')
        return res.status(400).json({ error: `Análise precisa ter status 'processada' (atual: ${analise.status})` });

      // Busca loja (nome + whatsapp)
      const lojas = await sbFetch(
        `lojas?id=eq.${encodeURIComponent(lojaId)}&select=id,nome,whatsapp&limit=1`
      );
      const loja = lojas?.[0] ?? { nome: 'loja' };

      // Busca tarefas ordenadas por bloco + ordem_no_bloco
      const tarefas = await sbFetch(
        `tarefas_loja?analise_id=eq.${encodeURIComponent(aid)}&order=bloco.asc,ordem_no_bloco.asc&select=id,titulo,bloco,situacao&limit=200`
      );

      // Busca instância Evolution do tenant
      const instances = await sbFetch(
        `evolution_instances?tenant_id=eq.${encodeURIComponent(tenantId)}&select=evolution_url,api_key,instance_name&limit=1`
      );
      const inst = instances?.[0];
      if (!inst)
        return res.status(404).json({ error: 'Instância Evolution não configurada para este tenant' });

      // Monta mensagem formatada
      const BLOCO_LABEL = {
        identidade: 'IDENTIDADE',
        cardapio:   'CARDÁPIO',
        operacao:   'OPERAÇÃO',
        avaliacoes: 'AVALIAÇÕES',
        marketing:  'MARKETING',
        suporte:    'SUPORTE',
      };
      const tarefasList = tarefas ?? [];
      const lines = [];
      let numGlobal = 0;
      let currentBloco = null;
      let blocoNum = 0;

      if (analise.loom_url) {
        lines.push(`🎥 Vídeo da análise: ${analise.loom_url.trim()}`);
        lines.push('Assista antes de responder.');
        lines.push('');
      }
      lines.push(`Análise da ${loja.nome}`);
      lines.push('');
      lines.push('Olá! Conforme combinado, segue a relação completa de ajustes:');

      for (const tarefa of tarefasList) {
        numGlobal++;
        if (tarefa.bloco !== currentBloco) {
          currentBloco = tarefa.bloco;
          blocoNum++;
          lines.push('');
          lines.push(`📋 BLOCO ${blocoNum} — ${BLOCO_LABEL[tarefa.bloco] || tarefa.bloco.toUpperCase()}`);
        }
        lines.push('');
        lines.push(`Tarefa ${numGlobal}: ${tarefa.titulo}`);
        lines.push(`Situação: ${tarefa.situacao}`);
      }

      lines.push('');
      lines.push('Pra aprovar, responda:');
      lines.push("- 'OK 1' (aprova tarefa 1)");
      lines.push("- 'OK bloco 1' (aprova bloco inteiro)");
      lines.push("- 'OK tudo' (aprova todas)");
      lines.push("- 'NAO 3' (rejeita tarefa 3)");
      lines.push("- 'DUVIDA 4: [pergunta]' (envia pergunta)");
      lines.push("- 'OK 1, 3, 5' (aprova múltiplas)");
      lines.push('');
      lines.push('Aguardo retorno.');

      const messageText = lines.join('\n');
      const instanceName = body.evolution_instance || inst.instance_name;
      const numero = normalizeWhatsAppNumberBR(body.numero_destino);

      // TD#16: DB pronto ANTES do envio — evita race onde cliente responde
      // antes de sessão/tarefas existirem, causando mensagens perdidas ou
      // sessão fechando prematuramente (tarefas ainda rascunho → count 0).

      // 1. Marca tarefas como aguardando_aprovacao (antes do envio)
      await sbFetch(
        `tarefas_loja?analise_id=eq.${encodeURIComponent(aid)}&status=in.(rascunho,aguardando_envio)`,
        { method: 'PATCH', body: { status: 'aguardando_aprovacao' } }
      );

      // 2. Cria sessão de aprovação (antes do envio)
      const sessaoData = await sbFetch('whatsapp_aprovacao_sessions', {
        method: 'POST',
        body: { analise_id: aid, loja_id: lojaId, numero_destino: numero, evolution_instance: instanceName, status: 'ativa' },
      });
      const sessao = Array.isArray(sessaoData) ? sessaoData[0] : sessaoData;

      // 3. Envia via Evolution API (DB já pronto — cliente pode responder com segurança)
      const evoRes = await fetch(
        `${inst.evolution_url}/message/sendText/${instanceName}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', apikey: inst.api_key },
          body: JSON.stringify({ number: numero, text: messageText }),
          signal: AbortSignal.timeout(20_000),
        }
      );
      if (!evoRes.ok) {
        const evoErr = await evoRes.text();
        // Rollback melhor esforço: reverte tarefas e cancela sessão
        await sbFetch(
          `tarefas_loja?analise_id=eq.${encodeURIComponent(aid)}&status=eq.aguardando_aprovacao`,
          { method: 'PATCH', body: { status: 'rascunho' } }
        ).catch(() => {});
        if (sessao?.id) {
          await sbFetch(
            `whatsapp_aprovacao_sessions?id=eq.${encodeURIComponent(sessao.id)}`,
            { method: 'PATCH', body: { status: 'cancelada' } }
          ).catch(() => {});
        }
        throw new Error(`Evolution API ${evoRes.status}: ${evoErr.slice(0, 300)}`);
      }

      // 4. Extrai message_id da resposta Evolution para rastreio
      let evoJson = null;
      try { evoJson = await evoRes.json(); } catch {}
      const messageIdEvolution = evoJson?.key?.id ?? evoJson?.id ?? null;

      // 5. Marca análise como enviada_cliente com metadados do envio
      await sbFetch(
        `analises?id=eq.${encodeURIComponent(aid)}`,
        {
          method: 'PATCH',
          body: {
            status: 'enviada_cliente',
            numero_whatsapp_cliente: numero,
            enviada_em: new Date().toISOString(),
            enviada_via: 'whatsapp',
            ...(messageIdEvolution ? { message_id_evolution: messageIdEvolution } : {}),
          },
        }
      );

      console.log(`[api/analises/enviar-whatsapp] loja=${lojaId} analise=${aid} numero=${numero} sessao=${sessao?.id}`);
      return res.json({ ok: true, session_id: sessao?.id ?? null, numero_destino: numero, tarefas_count: tarefasList.length });
    } catch (err) {
      console.error('[api/lojas/:id/analises/:aid/enviar-whatsapp]', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  return router;
};
