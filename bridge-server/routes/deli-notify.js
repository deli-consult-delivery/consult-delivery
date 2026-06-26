'use strict';

// POST /agents/deli/notify
// Recebe semáforo do orchestrator-5min, deduplicando por janela de 30 min.
// Auth: INTERNAL_BRIDGE_TOKEN obrigatório via Authorization: Bearer <token> ou x-internal-token.
// Canal primário: internal_notifications (sino do Topbar).
// Canal secundário: Hermes gateway (Telegram), se HERMES_GATEWAY_URL estiver configurado.

const express = require('express');

const TENANT_ID    = '9079bd4d-4df7-4023-90fb-d79c8ba7e900';
const DEDUP_MIN    = 30; // janela anti-spam: 1 notificação por semaforo a cada 30 min
const SEMAFOROS_VALIDOS = ['Verde', 'Amarelo', 'Vermelho'];

module.exports = function buildDeliNotifyRouter({ sbFetch, supabaseInsert }) {
  const INTERNAL_TOKEN    = process.env.INTERNAL_BRIDGE_TOKEN;
  const HERMES_GATEWAY    = process.env.HERMES_GATEWAY_URL;
  const HERMES_TOKEN      = process.env.HERMES_TOKEN;
  const TELEGRAM_CHAT_ID  = process.env.DELI_TELEGRAM_CHAT_ID || '8745522380';

  const router = express.Router();

  router.post('/agents/deli/notify', async (req, res) => {
    // Auth obrigatória — rejeita se token não configurado ou inválido
    if (!INTERNAL_TOKEN) {
      return res.status(503).json({ error: 'INTERNAL_BRIDGE_TOKEN não configurado' });
    }
    const bearer    = (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '').trim();
    const xInternal = req.headers['x-internal-token'];
    const provided  = bearer || xInternal;
    if (!provided || provided !== INTERNAL_TOKEN) {
      return res.status(401).json({ error: 'unauthorized' });
    }

    const {
      semaforo, motivos = [], run_id, task_id, resultado,
      channel, message, urgente, metadata,
    } = req.body;

    // Validar semaforo
    if (semaforo && !SEMAFOROS_VALIDOS.includes(semaforo)) {
      return res.status(400).json({ error: `semaforo inválido: ${semaforo}` });
    }

    const texto = message || buildMensagem({ semaforo, motivos, run_id, task_id, resultado, urgente });

    // Dedup: verifica notificação idêntica nos últimos DEDUP_MIN minutos
    const cutoff = new Date(Date.now() - DEDUP_MIN * 60_000).toISOString();
    let skipped  = false;
    try {
      const recent = await sbFetch(
        `internal_notifications?tenant_id=eq.${TENANT_ID}`
          + `&agent=eq.deli&kind=eq.deli_alert`
          + `&metadata->>semaforo=eq.${encodeURIComponent(String(semaforo || ''))}`
          + `&created_at=gte.${encodeURIComponent(cutoff)}`
          + `&order=created_at.desc&limit=1`
      );
      if (recent?.length) {
        console.warn(`[deli-notify] dedup: semaforo=${semaforo} já notificado em ${recent[0].created_at}`);
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

      // Telegram Bot API direto (primário, soft-fail)
      const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
      if (TELEGRAM_BOT_TOKEN) {
        fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: texto, parse_mode: 'HTML' }),
          signal:  AbortSignal.timeout(10_000),
        }).then(r => {
          if (!r.ok) return r.json().then(j => console.warn(`[deli-notify] telegram ${r.status}:`, j.description));
          console.log('[deli-notify] telegram: enviado chat_id=' + TELEGRAM_CHAT_ID);
        }).catch(err => console.warn('[deli-notify] telegram falhou (soft):', err.message));
      } else if (HERMES_GATEWAY && HERMES_TOKEN) {
        // fallback legado — requer HERMES_GATEWAY_URL configurado
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
