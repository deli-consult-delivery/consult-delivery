'use strict';

/**
 * POST /webhooks/datacrazy/conversa-encerrada
 *
 * Chamado pelo Datacrazy quando um atendimento é encerrado. Caminho PRINCIPAL
 * (por evento → imediato, uma conversa por vez, sem risco de envio em massa).
 *
 * Fluxo:
 *  1. Valida x-crm-token do tenant.
 *  2. Responde 202 imediatamente.
 *  3. Em background:
 *     - busca config do tenant (gate por nps_auto_envio).
 *     - busca detalhes da conversa no Datacrazy (telefone, updatedAt, nome).
 *     - decide CSAT (1º atendimento / dentro do cooldown) ou NPS (decisao compartilhada).
 *     - envia via lib/datacrazy-send (reabre → envia → FINALIZA de volta).
 *
 * O alerta de detrator dispara em publico-nps.js quando o cliente responde nota ≤ 6
 * (independe deste gatilho).
 */

const { createHash } = require('crypto');
const { sendDatacrazyMessage, getDatacrazyAtendenteEInicio } = require('../lib/datacrazy-send');
const { decidirECriarRegistro } = require('../lib/avaliacao-decisao');

// Rate limit simples em memória: 60 req/min por IP
const rateLimitMap = new Map();
function isRateLimited(ip) {
  const now = Date.now();
  const entry = rateLimitMap.get(ip) || { count: 0, resetAt: now + 60_000 };
  if (now > entry.resetAt) { entry.count = 0; entry.resetAt = now + 60_000; }
  entry.count++;
  rateLimitMap.set(ip, entry);
  return entry.count > 60;
}

module.exports = function datacrazyWebhookRouter({ sbFetch }) {
  const express = require('express');
  const router  = express.Router();

  router.post('/datacrazy/conversa-encerrada', async (req, res) => {
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    if (isRateLimited(ip)) {
      return res.status(429).json({ error: 'limite_de_requisicoes_excedido' });
    }

    // ── 1. Autenticação via x-crm-token ────────────────────────────────────
    const tokenRaw = req.headers['x-crm-token'];
    if (!tokenRaw) return res.status(401).json({ error: 'token_ausente' });

    const tokenHash = createHash('sha256').update(tokenRaw.trim()).digest('hex');

    let tokenRows;
    try {
      tokenRows = await sbFetch(
        `crm_webhook_tokens?token_hash=eq.${tokenHash}&ativo=eq.true&select=id,tenant_id,ativo&limit=1`
      );
    } catch (e) {
      console.error('[datacrazy-webhook] Erro ao validar token:', e.message);
      return res.status(401).json({ error: 'token_invalido' });
    }

    if (!tokenRows?.length) {
      return res.status(401).json({ error: 'token_invalido' });
    }

    const tokenId  = tokenRows[0].id;
    const tenantId = tokenRows[0].tenant_id;

    // Atualiza last_used_at de forma assíncrona (não bloqueia resposta)
    sbFetch(`crm_webhook_tokens?id=eq.${encodeURIComponent(tokenId)}`, {
      method: 'PATCH',
      body: { last_used_at: new Date().toISOString() },
    }).catch(() => {});

    // ── 2. Payload ──────────────────────────────────────────────────────────
    const payload = req.body || {};
    const { conversation_id, lead_name } = payload;
    // Log do corpo bruto para confirmar os campos que o Datacrazy envia.
    console.log('[datacrazy-webhook] payload:', JSON.stringify(payload).slice(0, 500));

    if (!conversation_id) {
      return res.status(400).json({ error: 'conversation_id_obrigatorio' });
    }

    // Responde imediatamente — processamento em background.
    res.status(202).json({ ok: true, conversation_id });

    // ── 3. Processamento em background ─────────────────────────────────────
    setImmediate(async () => {
      try {
        // 3a. Config do tenant (gate por nps_auto_envio = chave-mestra de pausa)
        let config;
        try {
          const rows = await sbFetch(
            `avaliacao_config?tenant_id=eq.${encodeURIComponent(tenantId)}` +
            `&select=nps_auto_envio,csat_auto_envio,datacrazy_api_key,nome_empresa,nps_baseline_at,nps_cooldown_dias,nps_min_atendimentos,csat_mensagem_template,nps_mensagem_template,piloto_telefone_teste&limit=1`
          );
          config = rows?.[0];
        } catch (e) {
          console.error('[datacrazy-webhook] Erro ao buscar config:', e.message);
          return;
        }

        if (!config) { console.warn('[datacrazy-webhook] sem config p/ tenant', tenantId); return; }
        if (!config.nps_auto_envio) { console.log('[datacrazy-webhook] pausado (nps_auto_envio=false)', tenantId); return; }
        if (!config.datacrazy_api_key) { console.warn('[datacrazy-webhook] sem datacrazy_api_key', tenantId); return; }

        // 3b. Conversa: identificada pelo conv.id (não precisa buscar telefone).
        // updatedAt = agora (o webhook dispara no momento da finalização).
        const conv = {
          id:        conversation_id,
          updatedAt: new Date().toISOString(),
          name:      lead_name || null,
        };

        // 3c. Decisão + criação do registro (lib compartilhada)
        const r = await decidirECriarRegistro({ sbFetch, tenantId, config, conv });
        if (r.status !== 'criado') {
          console.log(`[datacrazy-webhook] conv=${conversation_id} ${r.status}${r.detalhe ? ' ('+r.detalhe+')' : ''}`);
          return;
        }

        // 3d. Captura atendente + início do atendimento ANTES do envio (o nosso
        // reopen/send pode iniciar um novo ticket e poluir a detecção).
        const finishedAt = conv.updatedAt; // momento da finalização
        const { atendenteNome, inicioAt, telefoneCliente, ticketCode } = await getDatacrazyAtendenteEInicio(
          config.datacrazy_api_key, conversation_id
        );
        const duracaoMin = inicioAt
          ? Math.max(0, Math.round((new Date(finishedAt).getTime() - new Date(inicioAt).getTime()) / 60000))
          : null;

        // 3e. Envio via Datacrazy (reabre → envia → finaliza de volta)
        const { ok, detail } = await sendDatacrazyMessage(
          { apiKey: config.datacrazy_api_key },
          conversation_id,
          r.text
        );

        // 3f. Atualiza envio + atendente/duração no registro
        const tabela = r.tipo === 'nps' ? 'nps_avaliacoes' : 'atendimento_avaliacoes';
        sbFetch(`${tabela}?id=eq.${encodeURIComponent(r.recordId)}`, {
          method: 'PATCH',
          body: {
            msg_enviada_at:        new Date().toISOString(),
            msg_enviada_status:    ok ? 'ok' : 'falhou',
            atendente_nome:        atendenteNome,
            atendimento_inicio_at: inicioAt,
            atendimento_fim_at:    finishedAt,
            duracao_minutos:       duracaoMin,
            contact_phone:         telefoneCliente,
            ticket_code:           ticketCode,
          },
        }).catch(e => console.error('[datacrazy-webhook] Erro ao atualizar registro:', e.message));

        console.log(`[datacrazy-webhook] conv=${conversation_id} tipo=${r.tipo} envio=${ok ? 'ok' : 'falhou'} atendente=${atendenteNome || '-'} ticket=${ticketCode ?? '-'} dur=${duracaoMin ?? '-'}min`);
        if (!ok) console.error('[datacrazy-webhook] Falha no envio:', detail);
      } catch (err) {
        console.error('[datacrazy-webhook] Erro no background:', err.message);
      }
    });
  });

  return router;
};
