'use strict';

// ════════════════════════════════════════════════════════════════════════════
// CSAT — Webhook inbound do CRM externo (atendimento finalizado)
//
// O CRM do cliente fecha o atendimento pelo chat ao vivo e dispara este webhook.
// Nós criamos a avaliação (origem='crm_externo', sem conversation_id nosso) e
// devolvemos o link público na resposta síncrona. O CRM envia esse link pelo
// WhatsApp OFICIAL dele — nós NÃO chamamos a Evolution.
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

const PUBLIC_BASE =
  process.env.VITE_PUBLIC_URL ||
  process.env.PUBLIC_BASE_URL ||
  'https://app.consultdelivery.com.br';

// ── Rate limiter in-memory: 120 req/min por IP ───────────────────────────────
const rateLimitMap = new Map(); // IP → { count, resetAt }
const RATE_LIMIT   = 120;
const WINDOW_MS    = 60_000;

function rateLimit(req, res, next) {
  const ip  = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress || 'unknown';
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

// ── Comparação de hash em tempo constante (evita timing attack) ──────────────
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

  // ── Auth: resolve tenant_id a partir do x-crm-token ────────────────────────
  async function resolveTenantByToken(plainToken) {
    const tokenHash = crypto.createHash('sha256').update(plainToken).digest('hex');
    const rows = await sbFetch(
      `crm_webhook_tokens?token_hash=eq.${encodeURIComponent(tokenHash)}&ativo=eq.true&select=id,tenant_id,token_hash&limit=1`
    );
    const row = rows?.[0];
    if (!row) return null;
    // Confirma o match em tempo constante (defesa extra além do filtro do banco)
    if (!hashesMatch(tokenHash, row.token_hash)) return null;
    return row;
  }

  // ════════════════════════════════════════════════════════════════════════════
  // POST /webhooks/crm/atendimento-finalizado
  // ════════════════════════════════════════════════════════════════════════════
  router.post('/crm/atendimento-finalizado', rateLimit, async (req, res) => {
    const plainToken = req.headers['x-crm-token'];
    // Cap de tamanho: tokens legítimos são curtos (UUID/hex ~36-64 chars).
    // Evita hashear payloads gigantes vindos de header malicioso.
    if (!plainToken || typeof plainToken !== 'string' || plainToken.length > 256) {
      return res.status(401).json({ error: 'token_ausente' });
    }

    // Validação Zod
    const parsed = WebhookSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'dados_invalidos', detalhes: parsed.error.issues });
    }
    const { external_ref, contact_identifier, nome_cliente, atendente_nome, agent_id } = parsed.data;

    try {
      // ── Autenticação por tenant ──────────────────────────────────────────────
      const tokenRow = await resolveTenantByToken(plainToken);
      if (!tokenRow) {
        return res.status(401).json({ error: 'token_invalido' });
      }
      const tenant_id = tokenRow.tenant_id;

      // ── Idempotência: já existe avaliação para (tenant_id, external_ref)? ─────
      const existing = await sbFetch(
        `atendimento_avaliacoes?tenant_id=eq.${encodeURIComponent(tenant_id)}` +
        `&external_ref=eq.${encodeURIComponent(external_ref)}` +
        `&select=public_token,public_token_expires_at,status&limit=1`
      );
      if (existing?.[0]) {
        const ex = existing[0];
        // last_used_at: marca uso mesmo em reenvio
        await touchToken(tokenRow.id, sbFetch);
        return res.status(200).json({
          url:          `${PUBLIC_BASE}/avaliacao/${ex.public_token}`,
          public_token: ex.public_token,
          expires_at:   ex.public_token_expires_at,
          status:       ex.status,
          idempotente:  true,
        });
      }

      // ── Cria a avaliação (origem CRM, sem conversation_id nosso) ──────────────
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
        // public_token + public_token_expires_at (7 dias) vêm dos defaults
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

      console.info(`[crm/atendimento-finalizado] tenant=${tenant_id} external_ref=${external_ref} avaliacao=${row.id}`);
      return res.status(201).json({
        url:          `${PUBLIC_BASE}/avaliacao/${row.public_token}`,
        public_token: row.public_token,
        expires_at:   row.public_token_expires_at,
        status:       row.status,
      });
    } catch (err) {
      console.error('[crm/atendimento-finalizado POST]', err.message);
      return res.status(500).json({ error: 'erro_interno' });
    }
  });

  return router;
};

// ── Atualiza last_used_at sem derrubar a resposta em caso de erro ────────────
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
