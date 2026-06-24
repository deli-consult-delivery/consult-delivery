'use strict';

// POST /agents/deli/notify
// Recebe semáforo do orchestrator-5min, deduplicando por janela de 30 min.
// Auth: INTERNAL_BRIDGE_TOKEN via Authorization: Bearer <token> ou x-internal-token.
// Sem auth → aceito (retrocompatível com tasks sem header, ex: onboarding).
// Canal primário: internal_notifications (sino do Topbar).
// Canal secundário: Hermes gateway (Telegram), se HERMES_GATEWAY_URL estiver configurado.

const express = require('express');

const TENANT_ID    = '9079bd4d-4df7-4023-90fb-d79c8ba7e900';
const DEDUP_MIN    = 30; // janela anti-spam: 1 notificação por semaforo a cada 30 min

module.exports = function buildDeliNotifyRouter({ sbFetch, supabaseInsert }) {
  const INTERNAL_TOKEN    = process.env.INTERNAL_BRIDGE_TOKEN;
  const HERMES_GATEWAY    = process.env.HERMES_GATEWAY_URL;
  const HERMES_TOKEN      = process.env.HERMES_TOKEN;
  const TELEGRAM_CHAT_ID  = process.env.DELI_TELEGRAM_CHAT_ID || '8745522380';

  const router = express.Router();

  router.post('/agents/deli/notify', async (req, res) => {
    // Validação de token: requerido quando INTERNAL_BRIDGE_TOKEN estiver configurado
    if (INTERNAL_TOKEN) {
      const bearer    = (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '').trim();
      const xInternal = req.headers['x-internal-token'];
      const provided  = bearer || xInternal;
      if (!provided || provided !== INTERNAL_TOKEN) {
        return res.status(401).json({ error: 'unauthorized' });
      }
    }

    const {
      semaforo, motivos = [], run_id, task_id, resultado,
      channel, message, urgente, metadata,
    } = req.body;

    const texto = message || buildMensagem({ semaforo, motivos, run_id, task_id, resultado, urgente });

    // Dedup: verifica notificação idêntica nos últimos DEDUP_MIN minutos
    const cutoff = new Date(Date.now() - DEDUP_MIN * 60_000).toISOString();
    let skipped  = false;
    try {
      const recent = await sbFetch(
        `internal_notifications?tenant_id=eq.${TENANT_ID}`
          + `&agent=eq.deli&kind=eq.deli_alert`
          + `&metadata->>semaforo=eq.${encodeURIComponent(semaforo || '')}`
          + `&created_at=gte.${encodeURIComponent(cutoff)}`
          + `&order=created_at.desc&limit=1`
      );
      if (recent?.length) {
        console.log(`[deli-notify] dedup: semaforo=${semaforo} já notificado em ${recent[0].created_at}`);
        skipped = true;
      }
    } catch (err) {
      console.warn('[deli-notify] dedup check falhou (soft):', err.message);
    }

    if (!skipped) {
      // Insere notificação interna (sino do Topbar)
      try {
        await supabaseInsert('internal_notifications', {
          tenant_id: TENANT_ID,
          kind:      'deli_alert',
          agent:     'deli',
          title:     semaforo ? `DELI · Semáforo ${semaforo}` : 'DELI · Notificação',
          body:      texto,
          metadata:  { semaforo, motivos, run_id, task_id, resultado, urgente, ...(metadata || {}) },
        });
      } catch (err) {
        console.error('[deli-notify] internal_notifications insert falhou:', err.message);
      }

      // Hermes gateway → Telegram (opcional, soft-fail)
      if (HERMES_GATEWAY && HERMES_TOKEN) {
        fetch(`${HERMES_GATEWAY}/api/send-telegram`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${HERMES_TOKEN}` },
          body:    JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: texto }),
          signal:  AbortSignal.timeout(10_000),
        }).then(r => {
          if (!r.ok) return r.text().then(t => console.warn(`[deli-notify] hermes ${r.status}: ${t.slice(0, 200)}`));
          console.log('[deli-notify] hermes: enviado ao Telegram');
        }).catch(err => console.warn('[deli-notify] hermes falhou (soft):', err.message));
      }

      console.log(`[deli-notify] notificado semaforo=${semaforo} run_id=${run_id} urgente=${urgente}`);
    }

    // Audit log (sempre, incluindo skips)
    supabaseInsert('audit_log', {
      tenant_id:  TENANT_ID,
      agent_name: 'deli-orchestrator',
      action:     'DELI_NOTIFY',
      resource:   `semaforo:${semaforo || 'internal'}`,
      metadata:   { semaforo, run_id, task_id, motivos_count: motivos.length, skipped, channel: channel || 'telegram_interno' },
    }).catch(err => console.warn('[deli-notify] audit_log falhou:', err.message));

    res.json({ ok: true, skipped });
  });

  return router;
};

function buildMensagem({ semaforo, motivos = [], run_id, task_id, resultado, urgente }) {
  const emoji  = semaforo === 'Vermelho' ? '🔴' : semaforo === 'Amarelo' ? '🟡' : '🟢';
  const linhas = [`${emoji} DELI · ${semaforo || 'Notificação'}${urgente ? ' ⚠️ URGENTE' : ''}`];
  if (resultado) linhas.push(`\n📋 ${resultado}`);
  if (motivos.length) {
    linhas.push('');
    motivos.slice(0, 5).forEach(m => linhas.push(`• ${m}`));
    if (motivos.length > 5) linhas.push(`  … +${motivos.length - 5} outros`);
  }
  if (task_id) linhas.push(`\n🔗 task: ${task_id}`);
  if (run_id)  linhas.push(`run: ${run_id.slice(0, 8)}`);
  return linhas.join('\n');
}
