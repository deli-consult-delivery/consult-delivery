'use strict';

/**
 * routes/avaliacoes.js — Aba "Avaliações": agente IA p/ responder avaliações do iFood.
 *
 * Multi-loja, sem API do iFood (extração/colagem manual). Endpoints:
 *   POST /lojas/:id/avaliacoes/gerar         — gera respostas p/ um lote de avaliações
 *   POST /lojas/:id/avaliacoes/enviar-grupo  — envia sugestão ao grupo de WhatsApp (draft + Evolution)
 *   POST /lojas/:id/avaliacoes/sugerir-tom   — sugere o tom da loja (IA sugere, consultor edita)
 *
 * Regra de logística (decisiva): loja em logística do iFood NÃO responde avaliação
 * de entrega; loja com entrega própria responde loja E entrega.
 * Conteúdo: humano, <=300 chars, poucos emojis, tom da loja, às vezes nome do cliente.
 * Mensagens ao cliente sempre via draft + ação no dashboard (nunca auto-envio ao cliente).
 */

const express = require('express');
const { runViaOllama } = require('../services/claude-runner');
const {
  GerarAvaliacoesSchema,
  EnviarGrupoSchema,
  SugerirTomSchema,
} = require('../schemas/avaliacoes');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Garante resposta <= 300 chars com corte limpo (sem cortar palavra no meio).
function clamp300(text) {
  const t = (text || '').trim();
  if (t.length <= 300) return t;
  const cut = t.slice(0, 300);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > 60 ? cut.slice(0, lastSpace) : cut).trim();
}

// Desescapa um valor de string JSON cru (de regex), tolerante a truncamento.
function unescapeJsonStr(v) {
  // Remove uma barra invertida pendente no fim (escape cortado por truncamento).
  const trimmed = v.replace(/\\+$/, (m) => (m.length % 2 ? m.slice(0, -1) : m));
  try {
    return JSON.parse(`"${trimmed}"`);
  } catch {
    return trimmed.replace(/\\(["\\/])/g, '$1').trim();
  }
}

// Extrai { resposta, insights } de uma saída de IA tolerante a cercas/markdown.
// Em caso de JSON truncado (cap de num_predict), salva os campos via regex em vez
// de devolver o blob cru como resposta ao cliente. Não-JSON vira resposta texto puro.
function parseIaJson(raw) {
  if (!raw) return {};
  let s = String(raw).trim();
  if (!s) return {};
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(s.slice(start, end + 1));
    } catch {
      /* JSON malformado/truncado → cai pro salvamento abaixo */
    }
  }
  if (start >= 0) {
    // Parece JSON mas não parseou: salva "resposta"/"insights" (aspas final opcional).
    const salv = {};
    const r = s.match(/"resposta"\s*:\s*"((?:\\.|[^"\\])*)"?/);
    if (r && r[1]) salv.resposta = unescapeJsonStr(r[1]);
    const i = s.match(/"insights"\s*:\s*"((?:\\.|[^"\\])*)"?/);
    if (i && i[1]) salv.insights = unescapeJsonStr(i[1]);
    return salv; // pode ser {} se nada salvável — o chamador trata vazio
  }
  // Não parece JSON → trata o texto puro como resposta.
  return { resposta: s };
}

function validate(schema, data, res) {
  const result = schema.safeParse(data);
  if (!result.success) {
    res.status(400).json({ error: 'Dados inválidos', details: result.error.flatten() });
    return null;
  }
  return result.data;
}

// System prompt iFood — todas as regras de conteúdo entram aqui.
function buildSystemPrompt(loja, config) {
  const tom = (config.tom || '').trim();
  const superSelo = loja.super_restaurante
    ? 'A loja JÁ tem o selo Super Restaurante — reforce a manutenção do padrão.'
    : 'A loja AINDA NÃO tem o selo Super Restaurante — as dicas devem mirar conquistá-lo.';
  return [
    'Você é um especialista em responder avaliações de clientes no iFood para restaurantes em consultoria.',
    `Loja: "${loja.nome || 'a loja'}"${loja.nicho ? `, nicho ${loja.nicho}` : ''}${loja.cidade ? `, em ${loja.cidade}` : ''}${loja.segmento ? ` (segmento ${loja.segmento})` : ''}.`,
    tom ? `Tom da loja (siga fielmente): ${tom}` : 'Tom: cordial, próximo e profissional.',
    '',
    'REGRAS DA RESPOSTA AO CLIENTE:',
    '- Pareça humano, nunca robótico. NO MÁXIMO 300 caracteres. Poucos emojis (no máx. 1).',
    '- Às vezes cite o nome do cliente (quando fornecido), mas NÃO sempre.',
    '- Se a nota for MENOR que 5: reconheça e ENDERECE o que o cliente apontou, mostre o que será melhorado e convide-o a reconsiderar/dar nova chance — objetivo é recuperar a nota.',
    '- Se a nota for 5: agradeça com calor e convide a CONTINUAR COMPRANDO conosco.',
    '- Não prometa o que a loja não controla; não invente dados.',
    '',
    'INSIGHTS DE CONSULTORIA (para a equipe, não para o cliente):',
    '- Aponte 1-2 melhorias operacionais sugeridas pela avaliação e/ou dicas para conseguir mais avaliações.',
    `- ${superSelo}`,
    '',
    'FORMATO DE SAÍDA: responda APENAS com um objeto JSON válido, sem markdown, no formato exato:',
    '{"resposta": "<resposta ao cliente, <=300 chars>", "insights": "<orientações de consultoria>"}',
  ].join('\n');
}

function buildUserPrompt(item) {
  return [
    `Avaliação do cliente (nota ${item.nota}/5, tipo: ${item.tipo === 'loja' ? 'loja/produto' : 'entrega'}):`,
    item.nome_cliente ? `Cliente: ${item.nome_cliente}` : 'Cliente: (não informado)',
    `Comentário: "${item.comentario}"`,
    item.prazo_label ? `Prazo de resposta: ${item.prazo_label}` : '',
    '',
    'Gere a resposta e os insights conforme as regras.',
  ].filter(Boolean).join('\n');
}

function buildGroupMessage(loja, av) {
  const tipoLabel = av.tipo === 'loja' ? 'Loja' : 'Entrega';
  const resposta = (av.resposta_final || av.resposta_sugerida || '').trim();
  const lines = [
    `🧾 Avaliação iFood — ${loja.nome || 'loja'}`,
    `⭐ Nota ${av.nota} · ${tipoLabel}${av.prazo_label ? ` · ⏳ ${av.prazo_label}` : ''}`,
  ];
  if (av.nome_cliente) lines.push(`Cliente: ${av.nome_cliente}`);
  lines.push(`💬 "${av.comentario}"`);
  lines.push('');
  lines.push('✍️ Resposta sugerida (copie no iFood):');
  lines.push(resposta || '(sem resposta gerada)');
  if ((av.insights_consultoria || '').trim()) {
    lines.push('');
    lines.push('💡 Consultoria:');
    lines.push(av.insights_consultoria.trim());
  }
  return lines.join('\n');
}

module.exports = function buildAvaliacoesRouter({ requireJwt, sbFetch, assertLojaAccess }) {
  const router = express.Router();

  // ── POST /lojas/:id/avaliacoes/gerar ───────────────────────────────────────
  router.post('/lojas/:id/avaliacoes/gerar', requireJwt, async (req, res) => {
    const { id: lojaId } = req.params;
    const body = validate(GerarAvaliacoesSchema, req.body, res);
    if (!body) return;

    const started = Date.now();
    try {
      const tenantId = await assertLojaAccess(req, res, lojaId);
      if (!tenantId) return;

      const lojaRows = await sbFetch(
        `lojas?id=eq.${encodeURIComponent(lojaId)}&select=nome,nicho,cidade,segmento,super_restaurante&limit=1`,
      );
      const loja = lojaRows?.[0];
      if (!loja) return res.status(404).json({ error: 'loja não encontrada' });

      const cfgRows = await sbFetch(
        `avaliacoes_loja_config?loja_id=eq.${encodeURIComponent(lojaId)}&select=logistica_tipo,tom&limit=1`,
      );
      const config = cfgRows?.[0];
      if (!config) {
        return res.status(400).json({
          error: 'Configure a logística da loja (iFood logística ou entrega própria) antes de gerar respostas.',
        });
      }

      const systemPrompt = buildSystemPrompt(loja, config);
      const runId = `avaliacoes-${Date.now()}`;
      const rows = [];

      for (const item of body.avaliacoes) {
        // Regra de logística: loja em logística do iFood não responde entrega.
        const naoResponder = config.logistica_tipo === 'ifood_logistica' && item.tipo === 'entrega';

        const base = {
          tenant_id:    tenantId,
          loja_id:      lojaId,
          nota:         item.nota,
          comentario:   item.comentario,
          nome_cliente: item.nome_cliente ?? null,
          tipo:         item.tipo,
          prazo_label:  item.prazo_label ?? null,
          run_id:       runId,
        };

        if (naoResponder) {
          rows.push({
            ...base,
            resposta_sugerida:    null,
            insights_consultoria: 'Avaliação de entrega em loja na logística do iFood — a logística é responsabilidade do iFood, não responder por aqui.',
            status:               'nao_responder',
          });
          continue;
        }

        let resposta = '';
        let insights = '';
        try {
          const result = await runViaOllama(buildUserPrompt(item), {
            system:     systemPrompt,
            format:     'json',
            max_tokens: 700,
          });
          const parsed = parseIaJson(result.output);
          resposta = clamp300((parsed.resposta || '').trim());
          if (!resposta) throw new Error('modelo retornou resposta vazia ou inválida');
          insights = (parsed.insights || '').trim() || null;
        } catch (iaErr) {
          console.error('[avaliacoes/gerar] IA falhou:', iaErr.message);
          rows.push({
            ...base,
            resposta_sugerida:    null,
            insights_consultoria: `Falha ao gerar resposta: ${iaErr.message}`.slice(0, 500),
            status:               'gerada',
          });
          continue;
        }

        rows.push({
          ...base,
          resposta_sugerida:    resposta,
          insights_consultoria: insights,
          status:               'gerada',
        });
      }

      const inserted = await sbFetch('avaliacoes', { method: 'POST', body: rows });

      // Logging best-effort (nunca derruba o endpoint).
      const duration_ms = Date.now() - started;
      sbFetch('agent_runs', {
        method: 'POST',
        body: {
          agent_id:    'avaliacoes',
          tenant_id:   tenantId,
          triggered_by: req.user.id,
          input:       { loja_id: lojaId, count: body.avaliacoes.length },
          output:      { geradas: rows.filter(r => r.status === 'gerada').length, nao_responder: rows.filter(r => r.status === 'nao_responder').length },
          status:      'success',
          duration_ms,
          completed_at: new Date().toISOString(),
        },
      }).catch((e) => console.warn('[avaliacoes/gerar] agent_runs insert falhou:', e.message));

      sbFetch('audit_log', {
        method: 'POST',
        body: {
          tenant_id:  tenantId,
          user_id:    req.user.id,
          agent_name: 'avaliacoes',
          action:     'gerar',
          resource:   `loja:${lojaId}`,
          metadata:   { count: body.avaliacoes.length, run_id: runId },
        },
      }).catch((e) => console.warn('[avaliacoes/gerar] audit_log insert falhou:', e.message));

      res.json({ avaliacoes: Array.isArray(inserted) ? inserted : [inserted] });
    } catch (err) {
      console.error('[avaliacoes POST /gerar]', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ── POST /lojas/:id/avaliacoes/enviar-grupo ────────────────────────────────
  router.post('/lojas/:id/avaliacoes/enviar-grupo', requireJwt, async (req, res) => {
    const { id: lojaId } = req.params;
    const body = validate(EnviarGrupoSchema, req.body, res);
    if (!body) return;

    const intervalo = body.intervalo_ms ?? 3500; // anti-spam: 1 de cada vez
    try {
      const tenantId = await assertLojaAccess(req, res, lojaId);
      if (!tenantId) return;

      const lojaRows = await sbFetch(
        `lojas?id=eq.${encodeURIComponent(lojaId)}&select=nome&limit=1`,
      );
      const loja = lojaRows?.[0] ?? { nome: 'loja' };

      // Carrega só avaliações desta loja (defesa: evita enviar de outra loja/tenant).
      const idList = body.avaliacaoIds.map(encodeURIComponent).join(',');
      const avals = await sbFetch(
        `avaliacoes?id=in.(${idList})&loja_id=eq.${encodeURIComponent(lojaId)}` +
        `&select=id,nota,tipo,nome_cliente,comentario,prazo_label,resposta_sugerida,resposta_final,insights_consultoria,status`,
      );
      if (!avals?.length) {
        return res.status(404).json({ error: 'nenhuma avaliação encontrada para esta loja' });
      }

      // Resolve grupo da consultoria (por loja) + instância Evolution (por tenant).
      const grpRows = await sbFetch(
        `whatsapp_groups?loja_id=eq.${encodeURIComponent(lojaId)}&ativo=eq.true&select=evolution_jid,group_name&limit=1`,
      );
      const grupo = grpRows?.[0];
      if (!grupo?.evolution_jid) {
        return res.status(404).json({ error: 'grupo de WhatsApp da loja não configurado (whatsapp_groups)' });
      }

      const instRows = await sbFetch(
        `evolution_instances?tenant_id=eq.${encodeURIComponent(tenantId)}&select=evolution_url,api_key,instance_name&limit=1`,
      );
      const inst = instRows?.[0];
      if (!inst) {
        return res.status(404).json({ error: 'instância Evolution não configurada para este tenant' });
      }

      const resultados = [];
      let enviados = 0;
      for (let i = 0; i < avals.length; i++) {
        const av = avals[i];

        if (av.status === 'nao_responder') {
          resultados.push({ id: av.id, ok: false, skipped: 'nao_responder' });
          continue;
        }
        if (!(av.resposta_final || av.resposta_sugerida)) {
          resultados.push({ id: av.id, ok: false, skipped: 'sem_resposta' });
          continue;
        }

        const messageText = buildGroupMessage(loja, av);

        // 1. Cria draft (rastro de aprovação) ANTES do envio.
        let draftId = null;
        try {
          const draftData = await sbFetch('agent_drafts', {
            method: 'POST',
            body: {
              tenant_id:  tenantId,
              agent_name: 'avaliacoes',
              channel:    'whatsapp_group',
              loja_id:    lojaId,
              content:    messageText,
              metadata:   { avaliacao_id: av.id, evolution_jid: grupo.evolution_jid, group_name: grupo.group_name },
            },
          });
          const draft = Array.isArray(draftData) ? draftData[0] : draftData;
          draftId = draft?.id ?? null;
        } catch (draftErr) {
          console.warn('[avaliacoes/enviar-grupo] draft insert falhou:', draftErr.message);
        }

        // 2. Envia ao grupo (evolution_jid @g.us vai no campo number).
        let ok = false;
        let evoStatus = null;
        let messageId = null;
        let raw = null;
        try {
          const evoRes = await fetch(
            `${inst.evolution_url}/message/sendText/${inst.instance_name}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', apikey: inst.api_key },
              body: JSON.stringify({ number: grupo.evolution_jid, text: messageText }),
              signal: AbortSignal.timeout(20_000),
            },
          );
          evoStatus = evoRes.status;
          raw = await evoRes.text();
          ok = evoRes.ok;
          if (ok) {
            try { const j = JSON.parse(raw); messageId = j?.key?.id ?? j?.id ?? null; } catch {}
          }
        } catch (sendErr) {
          raw = sendErr.message;
        }

        // 3. Atualiza status da avaliação (sem coluna sent_at — só status/draft_id/updated_at).
        if (ok) {
          enviados++;
          await sbFetch(`avaliacoes?id=eq.${encodeURIComponent(av.id)}`, {
            method: 'PATCH',
            body: { status: 'enviada_grupo', draft_id: draftId, updated_at: new Date().toISOString() },
          }).catch((e) => console.warn('[avaliacoes/enviar-grupo] update status falhou:', e.message));
        }

        resultados.push({ id: av.id, ok, evolution_status: evoStatus, message_id: messageId, draft_id: draftId, raw: (raw || '').slice(0, 300) });

        // Anti-spam: intervalo entre envios (não dorme após o último).
        if (i < avals.length - 1 && intervalo > 0) await sleep(intervalo);
      }

      sbFetch('audit_log', {
        method: 'POST',
        body: {
          tenant_id:  tenantId,
          user_id:    req.user.id,
          agent_name: 'avaliacoes',
          action:     'enviar-grupo',
          resource:   `loja:${lojaId}`,
          metadata:   { total: avals.length, enviados, intervalo_ms: intervalo },
        },
      }).catch((e) => console.warn('[avaliacoes/enviar-grupo] audit_log insert falhou:', e.message));

      res.json({ enviados, total: avals.length, resultados });
    } catch (err) {
      console.error('[avaliacoes POST /enviar-grupo]', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ── POST /lojas/:id/avaliacoes/sugerir-tom ─────────────────────────────────
  router.post('/lojas/:id/avaliacoes/sugerir-tom', requireJwt, async (req, res) => {
    const { id: lojaId } = req.params;
    const body = validate(SugerirTomSchema, req.body, res);
    if (!body) return;

    try {
      const tenantId = await assertLojaAccess(req, res, lojaId);
      if (!tenantId) return;

      const lojaRows = await sbFetch(
        `lojas?id=eq.${encodeURIComponent(lojaId)}&select=nome,nicho,cidade,segmento&limit=1`,
      );
      const loja = lojaRows?.[0];
      if (!loja) return res.status(404).json({ error: 'loja não encontrada' });

      const exemplos = (body.exemplos || []).filter(Boolean);
      const prompt = [
        'Sugira, em 1 a 2 frases, o TOM DE VOZ ideal para esta loja responder avaliações no iFood.',
        `Loja: "${loja.nome || 'loja'}"${loja.nicho ? `, nicho ${loja.nicho}` : ''}${loja.cidade ? `, em ${loja.cidade}` : ''}${loja.segmento ? ` (segmento ${loja.segmento})` : ''}.`,
        exemplos.length ? `Exemplos de avaliações recebidas:\n- ${exemplos.slice(0, 20).join('\n- ')}` : '',
        '',
        'Descreva o tom (ex.: caloroso e regional, direto e objetivo, jovem e descontraído). Responda só com a descrição do tom, sem aspas nem rótulos.',
      ].filter(Boolean).join('\n');

      const result = await runViaOllama(prompt, { max_tokens: 200 });
      const tomSugerido = (result.output || '').trim();

      // Persiste em tom_sugerido_ia se já existir config (não cria linha sem logistica_tipo NOT NULL).
      const cfgRows = await sbFetch(
        `avaliacoes_loja_config?loja_id=eq.${encodeURIComponent(lojaId)}&select=id&limit=1`,
      );
      if (tomSugerido && cfgRows?.[0]?.id) {
        await sbFetch(`avaliacoes_loja_config?id=eq.${encodeURIComponent(cfgRows[0].id)}`, {
          method: 'PATCH',
          body: { tom_sugerido_ia: tomSugerido, updated_at: new Date().toISOString() },
        }).catch((e) => console.warn('[avaliacoes/sugerir-tom] update falhou:', e.message));
      }

      res.json({ tom_sugerido: tomSugerido });
    } catch (err) {
      console.error('[avaliacoes POST /sugerir-tom]', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  return router;
};
