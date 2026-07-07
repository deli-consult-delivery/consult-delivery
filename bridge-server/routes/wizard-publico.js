'use strict';

// ════════════════════════════════════════════════════════════════════════════
// Wizard Self-service — rotas públicas (sem JWT)
//
// Endpoints:
//   POST  /api/wizard                — cria sessão (passo 1)
//   PATCH /api/wizard/:id            — atualiza campos + passo
//   POST  /api/wizard/:id/finalizar  — marca concluído + notifica Wandson
//
// Rate limit: 30 req/min por IP
// ════════════════════════════════════════════════════════════════════════════

const express = require('express');

const rateLimitMap = new Map();
const RATE_LIMIT   = 30;
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
  if (entry.count > RATE_LIMIT) return res.status(429).json({ error: 'Muitas requisições. Aguarde 1 minuto.' });
  next();
}

setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimitMap) {
    if (now >= entry.resetAt) rateLimitMap.delete(ip);
  }
}, WINDOW_MS);

const CAMPOS_EDITAVEIS = new Set([
  'email','whatsapp','nome_contato','nome_negocio','cnpj',
  'faturamento_mensal_range','diagnostico','pacote_recomendado',
]);

module.exports = function buildWizardPublicoRouter({ sbFetch, supabaseInsert }) {
  const router = express.Router();

  // ── POST /api/wizard — cria sessão (passo 1) ─────────────────────────────
  router.post('/wizard', rateLimit, async (req, res) => {
    const { email, nome_contato, whatsapp } = req.body ?? {};
    if (!email?.trim()) return res.status(400).json({ error: 'email obrigatório' });

    try {
      const data = await supabaseInsert('onboarding_wizard_sessions', {
        email:           email.trim().toLowerCase(),
        nome_contato:    nome_contato?.trim() || null,
        whatsapp:        whatsapp?.trim()     || null,
        passos_concluidos: [1],
        status:          'em_andamento',
      });
      const session = Array.isArray(data) ? data[0] : data;
      console.log(`[wizard/create] id=${session?.id} email=${email}`);
      return res.status(201).json({ id: session?.id, ok: true });
    } catch (err) {
      console.error('[wizard/create]', err.message);
      return res.status(500).json({ error: err.message });
    }
  });

  // ── PATCH /api/wizard/:id — atualiza campos + registra passo ─────────────
  router.patch('/wizard/:id', rateLimit, async (req, res) => {
    const { id }          = req.params;
    const { passo, ...campos } = req.body ?? {};

    try {
      const rows = await sbFetch(
        `onboarding_wizard_sessions?id=eq.${encodeURIComponent(id)}&select=id,passos_concluidos&limit=1`
      );
      if (!rows?.length) return res.status(404).json({ error: 'Sessão não encontrada' });

      const existing   = rows[0];
      const passos     = Array.isArray(existing.passos_concluidos) ? existing.passos_concluidos : [];
      const newPassos  = (passo && !passos.includes(passo)) ? [...passos, passo] : passos;

      const updates = Object.fromEntries(
        Object.entries(campos).filter(([k]) => CAMPOS_EDITAVEIS.has(k))
      );

      await sbFetch(`onboarding_wizard_sessions?id=eq.${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: { ...updates, passos_concluidos: newPassos, updated_at: new Date().toISOString() },
      });

      console.log(`[wizard/patch] id=${id} passo=${passo}`);
      return res.json({ ok: true, passos_concluidos: newPassos });
    } catch (err) {
      console.error('[wizard/patch]', err.message);
      return res.status(500).json({ error: err.message });
    }
  });

  // ── POST /api/wizard/:id/finalizar — conclui + notifica Wandson ──────────
  router.post('/wizard/:id/finalizar', rateLimit, async (req, res) => {
    const { id } = req.params;

    try {
      const rows = await sbFetch(
        `onboarding_wizard_sessions?id=eq.${encodeURIComponent(id)}&select=*&limit=1`
      );
      if (!rows?.length) return res.status(404).json({ error: 'Sessão não encontrada' });
      const session = rows[0];

      await sbFetch(`onboarding_wizard_sessions?id=eq.${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: {
          status:       'concluido',
          completed_at: new Date().toISOString(),
          updated_at:   new Date().toISOString(),
          passos_concluidos: [1, 2, 3, 4, 5],
        },
      });

      // Notifica Wandson via internal_notifications (primeiro tenant ativo)
      try {
        const tenants = await sbFetch(`tenants?is_active=eq.true&select=id&order=created_at.asc&limit=1`);
        const tenantId = tenants?.[0]?.id;
        if (tenantId) {
          await supabaseInsert('internal_notifications', {
            tenant_id:         tenantId,
            recipient_user_id: null,
            kind:              'system',
            agent:             null,
            title:             `Novo lead Wizard — ${session.nome_negocio || session.nome_contato || session.email}`,
            body:              `Email: ${session.email} | WhatsApp: ${session.whatsapp || 'N/I'} | Pacote: ${session.pacote_recomendado || 'N/I'} | Faturamento: ${session.faturamento_mensal_range || 'N/I'}`,
            link:              `/crm`,
            metadata:          { wizard_session_id: id, via: 'wizard_publico' },
          });
        }
      } catch (notifErr) {
        console.warn('[wizard/finalizar] notificação falhou:', notifErr.message);
      }

      console.log(`[wizard/finalizar] id=${id} email=${session.email}`);
      return res.json({ ok: true });
    } catch (err) {
      console.error('[wizard/finalizar]', err.message);
      return res.status(500).json({ error: err.message });
    }
  });

  return router;
};
