'use strict';

// ════════════════════════════════════════════════════════════════════════════
// CSAT — Webhook inbound do CRM externo (atendimento finalizado)
//
// O CRM do cliente fecha o atendimento e dispara este webhook.
// Nós criamos a avaliação e, se o tenant tiver Evolution Instance configurada,
// enviamos automaticamente a mensagem WhatsApp com o link de avaliação.
//
// Endpoint:
//   POST /webhooks/crm/atendimento-finalizado
//     Auth: header x-crm-token (plaintext) → SHA-256 → comparado com
//           crm_webhook_tokens.token_hash (timingSafeEqual), ativo=true.
//     Body (Zod): { external_ref, contact_identifier, nome_cliente?,
//                   atendente_nome?, agent_id? }
//     Idempotência: (tenant_id, external_ref) — reenvio devolve o mesmo link.
//
// Rate limit: 120 req/min por IP (in-memory).
// ════════════════════════════════════════════════════════════════════════════

const express = require('express');
const crypto  = require('crypto');
const { z }   = require('zod');

const { sendEvolutionText, renderTemplate } = require('../lib/evolution-send');

const PUBLIC_BASE =
  process.env.VITE_PUBLIC_URL ||
  process.env.PUBLIC_BASE_URL ||
  'https://app.consultdelivery.com.br';

// ── Rate limiter in-memory: 120 req/min por IP ───────────────────────────────
const rateLimitMap = new Map();
const RATE_LIMIT   = 120;
const WINDOW_MS    = 60_000;

function rateLimit(req, res, next) {
  // req.ip (Express, trust proxy=2 em index.js) — ver
  // docs/deli-memory/tech-debts/trust-proxy-bridge.md.
  const ip  = req.ip || 'unknown';
  const now = Date.now();

  let entry = rateLimitMap.get(ip);
  if (!entry || now >= entry.resetAt) {
    entry = { count: 0, resetAt: now + WINDOW_MS };
    rateLimitMap.set(ip, entry);
  }

  entry.count++;
  if (entry.count > RATE_LIMIT) {
    return res.status(429).json({ error: 'Muitas requisições. Aguarde 1 minuto.' });
  }
  next();
}

setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimitMap) {
    if (now >= entry.resetAt) rateLimitMap.delete(ip);
  }
}, WINDOW_MS);

// ── Comparação de hash em tempo constante ───────────────────────────────────
function hashesMatch(a, b) {
  const ba = Buffer.from(a, 'hex');
  const bb = Buffer.from(b, 'hex');
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

// ── Schema de validação do body ──────────────────────────────────────────────
const WebhookSchema = z.object({
  external_ref:       z.string().min(1).max(200),
  contact_identifier: z.string().min(1).max(200),
  nome_cliente:       z.string().max(200).optional(),
  atendente_nome:     z.string().max(200).optional(),
  agent_id:           z.string().max(200).optional(),
});

// ── Factory ──────────────────────────────────────────────────────────────────
module.exports = function buildCrmAtendimentoWebhookRouter({ sbFetch }) {
  const router = express.Router();

  async function resolveTenantByToken(plainToken) {
    const tokenHash = crypto.createHash('sha256').update(plainToken).digest('hex');
    const rows = await sbFetch(
      `crm_webhook_tokens?token_hash=eq.${encodeURIComponent(tokenHash)}&ativo=eq.true&select=id,tenant_id,token_hash&limit=1`
    );
    const row = rows?.[0];
    if (!row) return null;
    if (!hashesMatch(tokenHash, row.token_hash)) return null;
    return row;
  }

  // Busca configuração de avaliação do tenant (template de mensagem)
  async function getAvaliacaoConfig(tenantId) {
    const rows = await sbFetch(
      `avaliacao_config?tenant_id=eq.${encodeURIComponent(tenantId)}&select=csat_auto_envio,csat_mensagem_template&limit=1`
    );
    return rows?.[0] ?? null;
  }

  // Envia WhatsApp e registra resultado na avaliação
  async function dispararMensagemCsat(avaliacaoId, tenantId, contactIdentifier, nomeCliente, linkAvaliacao, config, sbFetch) {
    if (!config?.csat_auto_envio) return;

    const template = config.csat_mensagem_template ||
      'Olá {nome_cliente}! 😊 Seu atendimento foi encerrado. Avalie como foi: {link_avaliacao}';

    const text = renderTemplate(template, {
      nome_cliente:    nomeCliente || 'cliente',
      link_avaliacao:  linkAvaliacao,
    });

    const result = await sendEvolutionText({
      tenantId,
      number: contactIdentifier,
      text,
      sbFetch,
    });

    const statusStr = result.ok ? 'ok' : 'falhou';
    await sbFetch(
      `atendimento_avaliacoes?id=eq.${encodeURIComponent(avaliacaoId)}`,
      {
        method: 'PATCH',
        body:   {
          msg_enviada_at:     new Date().toISOString(),
          msg_enviada_status: statusStr,
        },
      }
    ).catch(err => console.error('[crm-webhook] falha ao registrar msg_enviada:', err.message));

    console.info(`[crm/atendimento-finalizado] msg_whatsapp tenant=${tenantId} avaliacao=${avaliacaoId} status=${statusStr}`);
  }

  // ════════════════════════════════════════════════════════════════════════════
  // POST /webhooks/crm/atendimento-finalizado
  // ════════════════════════════════════════════════════════════════════════════
  router.post('/crm/atendimento-finalizado', rateLimit, async (req, res) => {
    const plainToken = req.headers['x-crm-token'];
    if (!plainToken || typeof plainToken !== 'string' || plainToken.length > 256) {
      return res.status(401).json({ error: 'token_ausente' });
    }

    const parsed = WebhookSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'dados_invalidos', detalhes: parsed.error.issues });
    }
    const { external_ref, contact_identifier, nome_cliente, atendente_nome, agent_id } = parsed.data;

    try {
      const tokenRow = await resolveTenantByToken(plainToken);
      if (!tokenRow) {
        return res.status(401).json({ error: 'token_invalido' });
      }
      const tenant_id = tokenRow.tenant_id;

      // Idempotência: já existe avaliação para (tenant_id, external_ref)?
      const existing = await sbFetch(
        `atendimento_avaliacoes?tenant_id=eq.${encodeURIComponent(tenant_id)}` +
        `&external_ref=eq.${encodeURIComponent(external_ref)}` +
        `&select=id,public_token,public_token_expires_at,status,msg_enviada_status&limit=1`
      );
      if (existing?.[0]) {
        const ex = existing[0];
        await touchToken(tokenRow.id, sbFetch);

        // Se ainda não enviou a mensagem, tenta enviar agora (retry seguro)
        if (!ex.msg_enviada_status) {
          const config = await getAvaliacaoConfig(tenant_id);
          const linkUrl = `${PUBLIC_BASE}/avaliacao/${ex.public_token}`;
          dispararMensagemCsat(ex.id, tenant_id, contact_identifier, nome_cliente, linkUrl, config, sbFetch)
            .catch(err => console.error('[crm-webhook] retry msg:', err.message));
        }

        return res.status(200).json({
          url:          `${PUBLIC_BASE}/avaliacao/${ex.public_token}`,
          public_token: ex.public_token,
          expires_at:   ex.public_token_expires_at,
          status:       ex.status,
          idempotente:  true,
        });
      }

      // Cria a avaliação
      const insertBody = {
        tenant_id,
        origem:             'crm_externo',
        external_ref,
        contact_identifier,
        conversation_id:    null,
        status:             'pendente',
        nome_cliente:       nome_cliente   ?? null,
        atendente_nome:     atendente_nome ?? null,
        agent_id:           agent_id       ?? null,
      };

      const created = await sbFetch('atendimento_avaliacoes', {
        method: 'POST',
        body:   insertBody,
        prefer: 'return=representation',
      });

      const row = Array.isArray(created) ? created[0] : created;
      if (!row?.public_token) {
        throw new Error('falha ao criar avaliacao: sem public_token no retorno');
      }

      await touchToken(tokenRow.id, sbFetch);

      const linkUrl = `${PUBLIC_BASE}/avaliacao/${row.public_token}`;
      console.info(`[crm/atendimento-finalizado] tenant=${tenant_id} external_ref=${external_ref} avaliacao=${row.id}`);

      // Responde imediatamente e envia WhatsApp em background (sem bloquear)
      res.status(201).json({
        url:          linkUrl,
        public_token: row.public_token,
        expires_at:   row.public_token_expires_at,
        status:       row.status,
      });

      // Envio WhatsApp em background após resposta
      const config = await getAvaliacaoConfig(tenant_id);
      dispararMensagemCsat(row.id, tenant_id, contact_identifier, nome_cliente, linkUrl, config, sbFetch)
        .catch(err => console.error('[crm-webhook] msg background:', err.message));

    } catch (err) {
      console.error('[crm/atendimento-finalizado POST]', err.message);
      return res.status(500).json({ error: 'erro_interno' });
    }
  });

  return router;
};

// Atualiza last_used_at sem bloquear a resposta
async function touchToken(tokenId, sbFetch) {
  try {
    await sbFetch(
      `crm_webhook_tokens?id=eq.${encodeURIComponent(tokenId)}`,
      { method: 'PATCH', body: { last_used_at: new Date().toISOString() } }
    );
  } catch (err) {
    console.error('[crm/atendimento-finalizado] falha ao tocar last_used_at:', err.message);
  }
}
