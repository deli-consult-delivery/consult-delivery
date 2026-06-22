'use strict';

// ════════════════════════════════════════════════════════════════════════════
// NPS de Marca — Página Pública (sem JWT)
//
// Endpoints:
//   GET  /api/publico/nps/:token  — carrega dados p/ exibição (nome da loja, status)
//   POST /api/publico/nps/:token  — registra nota 0-10 + comentário
//
// Rate limit: 60 req/min por IP (in-memory)
// Privacidade: nunca retorna contact_identifier, telefone, tenant_id, UUIDs internos,
//              campos tratativa_*, conversation_id.
// ════════════════════════════════════════════════════════════════════════════

const express = require('express');
const { z }   = require('zod');

// ── Rate limiter in-memory ────────────────────────────────────────────────────
const rateLimitNps = new Map();
const RATE_LIMIT   = 60;
const WINDOW_MS    = 60_000;

function rateLimit(req, res, next) {
  const ip  = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress || 'unknown';
  const now = Date.now();

  let entry = rateLimitNps.get(ip);
  if (!entry || now >= entry.resetAt) {
    entry = { count: 0, resetAt: now + WINDOW_MS };
    rateLimitNps.set(ip, entry);
  }

  entry.count++;
  if (entry.count > RATE_LIMIT) {
    return res.status(429).json({ error: 'Muitas requisições. Aguarde 1 minuto.' });
  }
  next();
}

setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimitNps) {
    if (now >= entry.resetAt) rateLimitNps.delete(ip);
  }
}, WINDOW_MS);

// ── Validação POST ────────────────────────────────────────────────────────────
const PostNpsSchema = z.object({
  nota:       z.number().int().min(0).max(10),
  comentario: z.string().max(2000).optional(),
});

// ── Factory ──────────────────────────────────────────────────────────────────
module.exports = function buildPublicoNpsRouter({ sbFetch }) {
  const router = express.Router();

  async function getNpsByToken(token) {
    const rows = await sbFetch(
      `nps_avaliacoes?public_token=eq.${encodeURIComponent(token)}&select=id,tenant_id,status,nota,public_token_expires_at&limit=1`
    );
    return rows?.[0] ?? null;
  }

  async function getTenantName(tenantId) {
    const rows = await sbFetch(
      `tenants?id=eq.${encodeURIComponent(tenantId)}&select=name&limit=1`
    );
    return rows?.[0]?.name ?? null;
  }

  async function checkExpired(nps) {
    if (!nps.public_token_expires_at) return false;
    if (new Date(nps.public_token_expires_at) >= new Date()) return false;
    if (nps.status === 'pendente') {
      await sbFetch(
        `nps_avaliacoes?id=eq.${encodeURIComponent(nps.id)}`,
        { method: 'PATCH', body: { status: 'expirada' } }
      );
    }
    return true;
  }

  // ════════════════════════════════════════════════════════════════════════════
  // GET /nps/:token
  // ════════════════════════════════════════════════════════════════════════════
  router.get('/nps/:token', rateLimit, async (req, res) => {
    const { token } = req.params;

    try {
      const nps = await getNpsByToken(token);
      if (!nps) return res.status(404).json({ error: 'link_invalido' });

      const expirado = await checkExpired(nps);
      if (expirado || nps.status === 'expirada') {
        return res.status(410).json({ erro: 'link_expirado' });
      }

      if (nps.status === 'respondida') {
        return res.status(200).json({ ja_respondida: true, nota: nps.nota });
      }

      const nome_loja = await getTenantName(nps.tenant_id);

      return res.status(200).json({
        nome_loja: nome_loja ?? 'nossa loja',
        status:    nps.status,
      });
    } catch (err) {
      console.error('[publico/nps GET]', err.message);
      return res.status(500).json({ error: err.message });
    }
  });

  // ════════════════════════════════════════════════════════════════════════════
  // POST /nps/:token
  // Anti-dupla-submissão atômica via filtro status=eq.pendente no PATCH.
  // ════════════════════════════════════════════════════════════════════════════
  router.post('/nps/:token', rateLimit, async (req, res) => {
    const { token } = req.params;

    const parsed = PostNpsSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'dados_invalidos', detalhes: parsed.error.issues });
    }
    const { nota, comentario } = parsed.data;

    try {
      const nps = await getNpsByToken(token);
      if (!nps) return res.status(404).json({ error: 'link_invalido' });

      const expirado = await checkExpired(nps);
      if (expirado || nps.status === 'expirada') {
        return res.status(410).json({ erro: 'link_expirado' });
      }

      if (nps.status === 'respondida') {
        return res.status(409).json({ erro: 'ja_respondida' });
      }

      const patchBody = {
        nota,
        comentario:   comentario ?? null,
        status:       'respondida',
        responded_at: new Date().toISOString(),
      };

      // Detratores: nota <= 6 → fila de tratativa
      if (nota <= 6) {
        patchBody.tratativa_status = 'pendente';
      }

      // Atualização atômica: só faz PATCH se ainda estiver pendente
      const updated = await sbFetch(
        `nps_avaliacoes?public_token=eq.${encodeURIComponent(token)}&status=eq.pendente`,
        {
          method: 'PATCH',
          body:   patchBody,
          prefer: 'return=representation',
        }
      );

      if (!Array.isArray(updated) || updated.length === 0) {
        return res.status(409).json({ erro: 'ja_respondida' });
      }

      console.info(`[publico/nps POST] nps=${nps.id} nota=${nota}`);
      return res.status(200).json({ ok: true });
    } catch (err) {
      console.error('[publico/nps POST]', err.message);
      return res.status(500).json({ error: err.message });
    }
  });

  return router;
};
