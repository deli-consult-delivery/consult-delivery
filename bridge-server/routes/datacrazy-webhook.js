'use strict';

/**
 * POST /webhooks/datacrazy/conversa-encerrada
 *
 * Chamado pelo Datacrazy quando um atendimento é encerrado.
 * Fluxo:
 *  1. Valida x-crm-token do tenant
 *  2. Cria registro em atendimento_avaliacoes (idempotente)
 *  3. Responde 201 imediatamente
 *  4. Em background: envia mensagem CSAT via Datacrazy API
 */

const { createHash } = require('crypto');
const { sendDatacrazyMessage, renderTemplate } = require('../lib/datacrazy-send');

const PUBLIC_BASE = process.env.VITE_PUBLIC_URL || 'https://app.consultdelivery.com.br';

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

    const tokenId = tokenRows[0].id;
    const tenantId = tokenRows[0].tenant_id;

    // Atualiza last_used_at de forma assíncrona (não bloqueia resposta)
    sbFetch(`crm_webhook_tokens?id=eq.${encodeURIComponent(tokenId)}`, {
      method: 'PATCH',
      body: { last_used_at: new Date().toISOString() },
    }).catch(() => {});

    // ── 2. Validação do payload ─────────────────────────────────────────────
    const { conversation_id, lead_id, lead_name, external_ref } = req.body || {};
    console.log(`[datacrazy-webhook] entrada: conv=${conversation_id} lead=${lead_name}`);

    if (!conversation_id) {
      return res.status(400).json({ error: 'conversation_id_obrigatorio' });
    }

    const ref = external_ref || conversation_id;

    // ── 3. Idempotência por (tenant_id, external_ref) ──────────────────────
    let existingRows;
    try {
      existingRows = await sbFetch(
        `atendimento_avaliacoes?tenant_id=eq.${encodeURIComponent(tenantId)}&external_ref=eq.${encodeURIComponent(ref)}&select=id,public_token&limit=1`
      );
    } catch (e) {
      console.error('[datacrazy-webhook] Erro ao verificar idempotência:', e.message);
      return res.status(500).json({ error: 'erro_interno' });
    }

    if (existingRows?.length) {
      const linkAvaliacao = `${PUBLIC_BASE}/avaliacao/${existingRows[0].public_token}`;
      console.log(`[datacrazy-webhook] reenvio ignorado: ref=${ref}`);
      return res.status(200).json({ ok: true, reenvio: true, link_avaliacao: linkAvaliacao });
    }

    // ── 4. Cria registro de avaliação CSAT ─────────────────────────────────
    let novaAvaliacaoArr;
    try {
      novaAvaliacaoArr = await sbFetch('atendimento_avaliacoes?select=id,public_token', {
        method: 'POST',
        body: {
          tenant_id:          tenantId,
          external_ref:       ref,
          contact_identifier: conversation_id,
          nome_cliente:       lead_name || null,
          origem:             'crm_externo',
          status:             'pendente',
        },
        prefer: 'return=representation',
      });
    } catch (e) {
      console.error('[datacrazy-webhook] Erro ao criar avaliação:', e.message);
      return res.status(500).json({ error: 'erro_interno' });
    }

    const novaAvaliacao = novaAvaliacaoArr?.[0];
    if (!novaAvaliacao?.public_token) {
      console.error('[datacrazy-webhook] Avaliação criada sem public_token');
      return res.status(500).json({ error: 'erro_interno' });
    }

    // Responde imediatamente com 201
    const linkAvaliacao = `${PUBLIC_BASE}/avaliacao/${novaAvaliacao.public_token}`;
    res.status(201).json({ ok: true, link_avaliacao: linkAvaliacao });

    // ── 5. Envio da mensagem CSAT via Datacrazy (background) ───────────────
    setImmediate(async () => {
      try {
        let configRows;
        try {
          configRows = await sbFetch(
            `avaliacao_config?tenant_id=eq.${encodeURIComponent(tenantId)}&select=csat_auto_envio,csat_mensagem_template,datacrazy_api_key,nome_empresa&limit=1`
          );
        } catch (e) {
          console.error('[datacrazy-webhook] Erro ao buscar config:', e.message);
          return;
        }

        const config = configRows?.[0];
        if (!config?.csat_auto_envio || !config?.datacrazy_api_key) return;

        const template = config.csat_mensagem_template ||
          'Olá {nome_cliente}! 😊 Seu atendimento foi encerrado. Como foi? Avalie aqui: {link_avaliacao}';

        const text = renderTemplate(template, {
          nome_cliente:   lead_name || 'cliente',
          link_avaliacao: linkAvaliacao,
          nome_empresa:   config.nome_empresa || 'nossa empresa',
        });

        const { ok, detail } = await sendDatacrazyMessage(
          { apiKey: config.datacrazy_api_key },
          conversation_id,
          text
        );

        const updateBody = {
          msg_enviada_at:     new Date().toISOString(),
          msg_enviada_status: ok ? 'ok' : 'falhou',
        };

        sbFetch(`atendimento_avaliacoes?id=eq.${encodeURIComponent(novaAvaliacao.id)}`, {
          method: 'PATCH',
          body: updateBody,
        }).catch(e => console.error('[datacrazy-webhook] Erro ao atualizar msg_enviada:', e.message));

        if (!ok) {
          console.error('[datacrazy-webhook] Falha ao enviar mensagem CSAT:', detail);
        }
      } catch (err) {
        console.error('[datacrazy-webhook] Erro no background CSAT:', err.message);
      }
    });
  });

  return router;
};
