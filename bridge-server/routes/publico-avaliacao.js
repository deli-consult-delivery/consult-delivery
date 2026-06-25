'use strict';

// ════════════════════════════════════════════════════════════════════════════
// CSAT — Dashboard Público de Avaliação de Atendimento (sem JWT)
//
// Endpoints (autenticados via public_token na URL — sem JWT):
//   GET  /api/publico/avaliacao/:token   — carrega dados p/ exibição
//   POST /api/publico/avaliacao/:token   — registra nota + comentário
//
// Rate limit: 60 req/min por IP (in-memory)
// ════════════════════════════════════════════════════════════════════════════

const express = require('express');
const { z }   = require('zod');
const { getBrandByTenant, safeLogoUrl, getAvaliacaoConfig } = require('../lib/branding');

// ── Rate limiter in-memory: 60 req/min por IP ────────────────────────────────
const rateLimitAvaliacao = new Map(); // IP → { count, resetAt }
const RATE_LIMIT         = 60;
const WINDOW_MS          = 60_000;

function rateLimit(req, res, next) {
  const ip  = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress || 'unknown';
  const now = Date.now();

  let entry = rateLimitAvaliacao.get(ip);
  if (!entry || now >= entry.resetAt) {
    entry = { count: 0, resetAt: now + WINDOW_MS };
    rateLimitAvaliacao.set(ip, entry);
  }

  entry.count++;
  if (entry.count > RATE_LIMIT) {
    return res.status(429).json({ error: 'Muitas requisições. Aguarde 1 minuto.' });
  }
  next();
}

// Limpeza periódica do map (evita memory leak em uptime longo)
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimitAvaliacao) {
    if (now >= entry.resetAt) rateLimitAvaliacao.delete(ip);
  }
}, WINDOW_MS);

// ── Schema de validação do POST ──────────────────────────────────────────────
const PostAvaliacaoSchema = z.object({
  nota:       z.number().int().min(1).max(5),
  comentario: z.string().max(2000).optional(),
});

// ── Factory ──────────────────────────────────────────────────────────────────
module.exports = function buildPublicoAvaliacaoRouter({ sbFetch }) {
  const router = express.Router();

  // ── Helper: busca avaliação pelo public_token ────────────────────────────────
  // Valida UUID antes de consultar — Supabase retorna 400/22P02 com strings inválidas
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  async function getAvaliacaoByToken(token) {
    if (!UUID_RE.test(token)) return null;
    const rows = await sbFetch(
      `atendimento_avaliacoes?public_token=eq.${encodeURIComponent(token)}&select=id,tenant_id,status,nota,atendente_nome,nome_cliente,public_token_expires_at&limit=1`
    );
    return rows?.[0] ?? null;
  }


  // ── Helper: verifica e marca expiração ───────────────────────────────────────
  async function checkExpired(avaliacao, sbFetch) {
    const expiresAt = avaliacao.public_token_expires_at;
    if (!expiresAt) return false;
    if (new Date(expiresAt) >= new Date()) return false;

    // Só atualiza para 'expirada' se ainda estava pendente
    if (avaliacao.status === 'pendente') {
      await sbFetch(
        `atendimento_avaliacoes?id=eq.${encodeURIComponent(avaliacao.id)}`,
        { method: 'PATCH', body: { status: 'expirada' } }
      );
    }
    return true;
  }

  // ════════════════════════════════════════════════════════════════════════════
  // GET /api/publico/avaliacao/:token
  //    Retorna dados mínimos para exibição da tela de avaliação.
  //    NUNCA retorna: telefone, conversation_id, tenant_id, UUID do atendente,
  //    campos tratativa_*.
  // ════════════════════════════════════════════════════════════════════════════
  router.get('/avaliacao/:token', rateLimit, async (req, res) => {
    const { token } = req.params;

    try {
      const avaliacao = await getAvaliacaoByToken(token);
      if (!avaliacao) return res.status(404).json({ error: 'link_invalido' });

      const expirado = await checkExpired(avaliacao, sbFetch);
      if (expirado || avaliacao.status === 'expirada') {
        return res.status(410).json({ erro: 'link_expirado' });
      }

      if (avaliacao.status === 'respondida') {
        return res.status(200).json({ ja_respondida: true, nota: avaliacao.nota });
      }

      // status === 'pendente'
      const [brand, config] = await Promise.all([
        getBrandByTenant(sbFetch, avaliacao.tenant_id),
        getAvaliacaoConfig(sbFetch, avaliacao.tenant_id),
      ]);
      return res.status(200).json({
        atendente_nome: avaliacao.atendente_nome,
        status:         avaliacao.status,
        nome_cliente:   avaliacao.nome_cliente,
        brand,
        config: config ? {
          csat_titulo:         config.csat_titulo,
          csat_subtitulo:      config.csat_subtitulo,
          csat_agradecimento:  config.csat_agradecimento,
        } : null,
      });
    } catch (err) {
      console.error('[publico/avaliacao GET]', err.message);
      return res.status(500).json({ error: 'erro_interno' });
    }
  });

  // ════════════════════════════════════════════════════════════════════════════
  // POST /api/publico/avaliacao/:token
  //    Registra nota + comentário.
  //    Anti-dupla-submissão atômica via filtro status=eq.pendente no PATCH.
  // ════════════════════════════════════════════════════════════════════════════
  router.post('/avaliacao/:token', rateLimit, async (req, res) => {
    const { token } = req.params;

    // Validação Zod
    const parsed = PostAvaliacaoSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'dados_invalidos', detalhes: parsed.error.issues });
    }
    const { nota, comentario } = parsed.data;

    try {
      const avaliacao = await getAvaliacaoByToken(token);
      if (!avaliacao) return res.status(404).json({ error: 'link_invalido' });

      const expirado = await checkExpired(avaliacao, sbFetch);
      if (expirado || avaliacao.status === 'expirada') {
        return res.status(410).json({ erro: 'link_expirado' });
      }

      if (avaliacao.status === 'respondida') {
        return res.status(409).json({ erro: 'ja_respondida' });
      }

      // ── Payload do PATCH ──────────────────────────────────────────────────────
      const patchBody = {
        nota,
        comentario:   comentario ?? null,
        status:       'respondida',
        responded_at: new Date().toISOString(),
      };

      // Marcação de detrator: nota <= 2 → tratativa pendente
      if (nota <= 2) {
        patchBody.tratativa_status = 'pendente';
      }

      // ── Anti-dupla-submissão atômica ─────────────────────────────────────────
      // Filtro duplo: token + status=pendente. Se outra requisição já respondeu,
      // o array retornado estará vazio.
      const updated = await sbFetch(
        `atendimento_avaliacoes?public_token=eq.${encodeURIComponent(token)}&status=eq.pendente`,
        {
          method: 'PATCH',
          body:   patchBody,
          prefer: 'return=representation',
        }
      );

      if (!Array.isArray(updated) || updated.length === 0) {
        return res.status(409).json({ erro: 'ja_respondida' });
      }

      console.info(`[publico/avaliacao POST] avaliacao=${avaliacao.id} nota=${nota}`);
      return res.status(200).json({ ok: true });
    } catch (err) {
      console.error('[publico/avaliacao POST]', err.message);
      return res.status(500).json({ error: 'erro_interno' });
    }
  });

  return router;
};
