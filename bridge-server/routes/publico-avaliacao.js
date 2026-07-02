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
const { sendEvolutionText, renderTemplate }                = require('../lib/evolution-send');
const { pushNotifyTenant }                                  = require('../lib/push-notify');

// Formata "5594984367456" → "+55 (94) 98436-7456". Se não bater no padrão BR, retorna cru.
function formatTelefoneBR(raw) {
  const d = String(raw).replace(/\D/g, '');
  const semDDI = d.startsWith('55') && d.length >= 12 ? d.slice(2) : d;
  if (semDDI.length === 11) return `+55 (${semDDI.slice(0, 2)}) ${semDDI.slice(2, 7)}-${semDDI.slice(7)}`;
  if (semDDI.length === 10) return `+55 (${semDDI.slice(0, 2)}) ${semDDI.slice(2, 6)}-${semDDI.slice(6)}`;
  return raw;
}

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
      `atendimento_avaliacoes?public_token=eq.${encodeURIComponent(token)}&select=id,tenant_id,status,nota,atendente_nome,nome_cliente,public_token_expires_at,contact_identifier,contact_phone,external_ref,ticket_code&limit=1`
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

      const [brand, config] = await Promise.all([
        getBrandByTenant(sbFetch, avaliacao.tenant_id),
        getAvaliacaoConfig(sbFetch, avaliacao.tenant_id),
      ]);

      if (avaliacao.status === 'respondida') {
        return res.status(200).json({ ja_respondida: true, nota: avaliacao.nota, brand });
      }
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

      // F2: Alerta de detrator CSAT em background (não bloqueia resposta ao cliente)
      if (nota <= 2) {
        const avaliacaoId     = avaliacao.id;
        const tenantId        = avaliacao.tenant_id;
        const notaFinal       = nota;
        const comentarioFinal = comentario ?? null;
        const respondedAtTs   = patchBody.responded_at;

        setImmediate(async () => {
          try {
            const configRows = await sbFetch(
              `avaliacao_config?tenant_id=eq.${encodeURIComponent(tenantId)}&select=detrator_notificar,detrator_wpp_jid,detrator_msg_template&limit=1`
            );
            const cfg = Array.isArray(configRows) ? configRows[0] : null;
            if (!cfg?.detrator_notificar) return;

            if (!cfg.detrator_wpp_jid) {
              console.warn('[publico/avaliacao] detrator_notificar=true mas detrator_wpp_jid não configurado');
              return;
            }

            const dataHora = new Date(respondedAtTs).toLocaleString('pt-BR', {
              timeZone: 'America/Sao_Paulo',
              day: '2-digit', month: '2-digit', year: 'numeric',
              hour: '2-digit', minute: '2-digit',
            });

            const APP_BASE = process.env.APP_BASE_URL || 'https://app.consultdelivery.com.br';
            const linkPlataforma = `${APP_BASE}/#csat`;

            // contact_phone (Datacrazy) é o telefone real; contact_identifier pode ser
            // um ID interno do CRM (não-telefone) quando a origem é crm_externo/Datacrazy.
            const contatoCliente = avaliacao.contact_phone
              ? formatTelefoneBR(avaliacao.contact_phone)
              : avaliacao.contact_identifier
                ? avaliacao.contact_identifier.replace(/@s\.whatsapp\.net$/i, '')
                : 'não informado';

            // Nº do ticket do atendimento no Datacrazy (busca por código no painel).
            const ticketTexto = avaliacao.ticket_code ? `#${avaliacao.ticket_code}` : 'não informado';

            // Testado ao vivo (2026-07-01): o CRM Datacrazy (crm2.datacrazy.io/multiservice)
            // não suporta deep-link para uma conversa específica via URL (query params
            // tipo conversationId/search não filtram a lista). messaging.g1.datacrazy.io
            // é host de API (retorna JSON 404 em rota de navegador), nunca deveria estar
            // aqui. Link aponta para a lista de finalizadas — o atendente busca pelo nome.
            const buscaTicket = avaliacao.ticket_code ? ` (busque pelo ticket ${ticketTexto})` : '';
            const datacrazyLine = avaliacao.external_ref
              ? `\n🔗 Ver no Datacrazy (Chat ao vivo → Finalizadas): https://crm2.datacrazy.io/multiservice?status=finished${buscaTicket}`
              : '';

            const template = cfg.detrator_msg_template ||
              '⚠️ *Detrator CSAT detectado!*\n\nCliente: {contact_nome}\nAtendimento (ticket): {ticket}\nContato: {contato_cliente}\nAtendente: {atendente_nome}\nNota CSAT: *{nota}*/5\nData/Hora: {data_hora}\nComentário: {comentario}\n\n🔗 Ver na plataforma: {link_plataforma}\n\nAbra o caso e trate em até 48h.';

            const texto = renderTemplate(template, {
              contact_nome:    avaliacao.nome_cliente        || 'desconhecido',
              contato_cliente: contatoCliente,
              ticket:          ticketTexto,
              atendente_nome:  avaliacao.atendente_nome      || 'não identificado',
              duracao:         'não disponível',
              nota:            String(notaFinal),
              data_hora:       dataHora,
              comentario:      comentarioFinal               || '—',
              link_plataforma: linkPlataforma,
            }) + datacrazyLine;

            const CD_TENANT_ID = process.env.CD_TENANT_ID || '9079bd4d-4df7-4023-90fb-d79c8ba7e900';
            const result = await sendEvolutionText({
              tenantId,
              number:           cfg.detrator_wpp_jid,
              text:             texto,
              sbFetch,
              fallbackTenantId: CD_TENANT_ID,
            });

            if (!result.ok) {
              console.error(`[publico/avaliacao] falha no alerta detrator avaliacao=${avaliacaoId}`, result.detail);
            } else {
              console.info(`[publico/avaliacao] alerta detrator enviado avaliacao=${avaliacaoId} nota=${notaFinal}`);
            }

            // Notificação interna (sino do Console) — broadcast ao tenant.
            try {
              await sbFetch('internal_notifications', {
                method: 'POST',
                body: {
                  tenant_id:         tenantId,
                  recipient_user_id: null,
                  kind:              'system',
                  title:             `Detrator CSAT — nota ${notaFinal}/5`,
                  body:              `${avaliacao.nome_cliente || 'Cliente'} deu nota ${notaFinal}. Atendente: ${avaliacao.atendente_nome || 'não identificado'}. Ticket ${ticketTexto}. Trate em até 48h.`,
                  link:              '/controle-atendimentos',
                },
                prefer: 'return=minimal',
              });
            } catch (notifErr) {
              console.error('[publico/avaliacao] erro ao criar notificação de detrator:', notifErr.message);
            }

            await pushNotifyTenant({
              sbFetch,
              tenantId,
              title: `Detrator CSAT — nota ${notaFinal}/5`,
              body:  `${avaliacao.nome_cliente || 'Cliente'} deu nota ${notaFinal}. Atendente: ${avaliacao.atendente_nome || 'não identificado'}.`,
              route: 'controle-atendimentos',
            });
          } catch (alertErr) {
            console.error('[publico/avaliacao] erro no alerta de detrator:', alertErr.message);
          }
        });
      }

      return res.status(200).json({ ok: true });
    } catch (err) {
      console.error('[publico/avaliacao POST]', err.message);
      return res.status(500).json({ error: 'erro_interno' });
    }
  });

  return router;
};
