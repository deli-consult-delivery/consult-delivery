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
const { getBrandByTenant, getAvaliacaoConfig } = require('../lib/branding');
const { sendEvolutionText, renderTemplate }    = require('../lib/evolution-send');

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

      const [brand, config] = await Promise.all([
        getBrandByTenant(sbFetch, nps.tenant_id),
        getAvaliacaoConfig(sbFetch, nps.tenant_id),
      ]);

      if (nps.status === 'respondida') {
        return res.status(200).json({ ja_respondida: true, nota: nps.nota, brand });
      }

      return res.status(200).json({
        nome_loja: brand?.name ?? 'nossa loja',
        status:    nps.status,
        brand,
        config: config ? {
          nps_titulo:        config.nps_titulo,
          nps_subtitulo:     config.nps_subtitulo,
          nps_agradecimento: config.nps_agradecimento,
        } : null,
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

      // F2: Alerta de detrator em background (não bloqueia resposta ao cliente)
      if (nota <= 6) {
        const npsId     = nps.id;
        const tenantId  = nps.tenant_id;
        const notaFinal = nota;

        setImmediate(async () => {
          try {
            const [configRows, detailRows] = await Promise.all([
              sbFetch(
                `avaliacao_config?tenant_id=eq.${encodeURIComponent(tenantId)}&select=detrator_notificar,detrator_wpp_jid,detrator_msg_template,nps_threshold_detrator&limit=1`
              ),
              sbFetch(
                `nps_avaliacoes?id=eq.${encodeURIComponent(npsId)}&select=atendente_nome,duracao_minutos,contact_nome&limit=1`
              ),
            ]);

            const cfg = Array.isArray(configRows) ? configRows[0] : null;
            if (!cfg?.detrator_notificar) return;

            const threshold = cfg.nps_threshold_detrator ?? 6;
            if (notaFinal > threshold) return;

            if (!cfg.detrator_wpp_jid) {
              console.warn('[publico/nps] detrator_notificar=true mas detrator_wpp_jid não configurado');
              return;
            }

            const av            = Array.isArray(detailRows) ? (detailRows[0] ?? {}) : {};
            const duracaoTexto  = av.duracao_minutos != null ? `${av.duracao_minutos} min` : 'não registrada';
            const template      = cfg.detrator_msg_template ||
              '⚠️ *Detrator detectado!*\n\nCliente: {contact_nome}\nAtendente: {atendente_nome}\nDuração: {duracao}\nNota NPS: *{nota}*\n\nAbra o caso e trate em até 48h.';

            const texto = renderTemplate(template, {
              contact_nome:   av.contact_nome   || 'desconhecido',
              atendente_nome: av.atendente_nome || 'não identificado',
              duracao:        duracaoTexto,
              nota:           String(notaFinal),
            });

            const result = await sendEvolutionText({
              tenantId,
              number: cfg.detrator_wpp_jid,
              text:   texto,
              sbFetch,
            });

            if (!result.ok) {
              console.error(`[publico/nps] falha no alerta detrator nps=${npsId}`, result.detail);
            } else {
              console.info(`[publico/nps] alerta detrator enviado nps=${npsId} nota=${notaFinal}`);
            }
          } catch (alertErr) {
            console.error('[publico/nps] erro no alerta de detrator:', alertErr.message);
          }
        });
      }

      return res.status(200).json({ ok: true });
    } catch (err) {
      console.error('[publico/nps POST]', err.message);
      return res.status(500).json({ error: err.message });
    }
  });

  return router;
};
