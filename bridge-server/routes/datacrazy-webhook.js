'use strict';

/**
 * POST /webhooks/datacrazy/conversa-encerrada
 *
 * Chamado pelo Datacrazy (via "Conexão Universal") quando um atendimento é encerrado.
 * Fluxo:
 *  1. Valida x-crm-token do tenant
 *  2. Cria registro em atendimento_avaliacoes
 *  3. Envia mensagem de CSAT na própria conversa via API do Datacrazy
 *  4. Se configurado, agenda NPS (após cooldown)
 *
 * Payload esperado do Datacrazy:
 * {
 *   "conversation_id": "abc123",
 *   "lead_id": "lead456",
 *   "lead_name": "João Cliente",
 *   "tenant_id": "e9fdaa66-cbe7-4dff-905b-afc4b10219ff",
 *   "external_ref": "conv-abc123"  // opcional, fallback para conversation_id
 * }
 */

const { createHash, timingSafeEqual } = require('crypto');
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

    const tokenHash = createHash('sha256').update(tokenRaw).digest('hex');
    const { data: tokenRows, error: tokenErr } = await sbFetch
      .from('crm_webhook_tokens')
      .select('id, tenant_id, ativo')
      .eq('token_hash', tokenHash)
      .eq('ativo', true)
      .limit(1);

    if (tokenErr || !tokenRows?.length) {
      return res.status(401).json({ error: 'token_invalido' });
    }

    const tenantId = tokenRows[0].tenant_id;

    // Atualiza last_used_at de forma assíncrona (não bloqueia resposta)
    sbFetch
      .from('crm_webhook_tokens')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', tokenRows[0].id)
      .then(() => {})
      .catch(() => {});

    // ── 2. Validação do payload ─────────────────────────────────────────────
    const {
      conversation_id,
      lead_id,
      lead_name,
      external_ref,
    } = req.body || {};

    if (!conversation_id) {
      return res.status(400).json({ error: 'conversation_id_obrigatorio' });
    }

    const ref = external_ref || conversation_id;

    // ── 3. Idempotência por (tenant_id, external_ref) ──────────────────────
    const { data: existingRows } = await sbFetch
      .from('atendimento_avaliacoes')
      .select('id, public_token')
      .eq('tenant_id', tenantId)
      .eq('external_ref', ref)
      .limit(1);

    if (existingRows?.length) {
      const linkAvaliacao = `${PUBLIC_BASE}/avaliacao/${existingRows[0].public_token}`;
      return res.status(200).json({ ok: true, reenvio: true, link_avaliacao: linkAvaliacao });
    }

    // ── 4. Cria registro de avaliação CSAT ─────────────────────────────────
    const { data: novaAvaliacao, error: insertErr } = await sbFetch
      .from('atendimento_avaliacoes')
      .insert({
        tenant_id:          tenantId,
        external_ref:       ref,
        contact_identifier: conversation_id,
        nome_cliente:       lead_name || null,
        origem:             'datacrazy',
        status:             'pendente',
      })
      .select('id, public_token')
      .single();

    if (insertErr || !novaAvaliacao) {
      console.error('[datacrazy-webhook] Erro ao criar avaliação:', insertErr?.message);
      return res.status(500).json({ error: 'erro_interno' });
    }

    // Responde imediatamente com 201
    const linkAvaliacao = `${PUBLIC_BASE}/avaliacao/${novaAvaliacao.public_token}`;
    res.status(201).json({ ok: true, link_avaliacao: linkAvaliacao });

    // ── 5. Envio da mensagem CSAT via Datacrazy (background) ───────────────
    setImmediate(async () => {
      try {
        const { data: configRows } = await sbFetch
          .from('avaliacao_config')
          .select('csat_auto_envio, csat_mensagem_template, datacrazy_api_key, nome_empresa')
          .eq('tenant_id', tenantId)
          .limit(1);

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

        const { error: updErr } = await sbFetch
          .from('atendimento_avaliacoes')
          .update({
            msg_enviada_at:     new Date().toISOString(),
            msg_enviada_status: ok ? 'ok' : 'falhou',
          })
          .eq('id', novaAvaliacao.id);

        if (updErr) {
          console.error('[datacrazy-webhook] Erro ao atualizar msg_enviada:', updErr.message);
        }

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
