// routes/loop-erp-confirm-code.js — POST /loop/erp-confirm-code
//
// Canal OUT-OF-BAND do código de confirmação do ERP (GATE 0 / Blueprint v2 §5C).
// O vendaerp-mcp (proposals.create) gera um código, guarda só o HASH e chama ESTA
// rota com o código em claro para ENTREGAR ao CEO — pelo sino interno e pelo Telegram.
// O código NUNCA volta ao agente: ele só chega ao CEO, que o digita de volta para
// confirmar. Assim o agente que propôs não consegue auto-confirmar.
//
// Auth: requireInternalToken (x-internal-token). Soft-fail por canal: se um canal
// não está configurado, tenta o outro; responde 200 com o que foi entregue.
'use strict';

const TENANT_ID = '9079bd4d-4df7-4023-90fb-d79c8ba7e900';

module.exports = ({ requireInternalToken, supabaseInsert }) => {
  const express = require('express');
  const router = express.Router();
  const CHAT_ID = process.env.CEO_TELEGRAM_CHAT_ID || process.env.DELI_TELEGRAM_CHAT_ID || '8745522380';

  router.post('/erp-confirm-code', requireInternalToken, async (req, res) => {
    const { proposal_id, codigo, resumo } = req.body || {};
    if (typeof proposal_id !== 'string' || !proposal_id.trim()) {
      return res.status(400).json({ error: 'proposal_id obrigatório' });
    }
    if (typeof codigo !== 'string' || codigo.trim().length < 4) {
      return res.status(400).json({ error: 'codigo inválido' });
    }

    const texto =
      `🔐 Código de confirmação ERP\n` +
      `${resumo ? resumo + '\n' : ''}` +
      `Código: <b>${codigo}</b>\n` +
      `Para confirmar, responda: confirmar ${proposal_id} ${codigo}`;
    const channels = [];

    // Canal 1 — sino interno (CEO vê no Topbar). Soft-fail.
    try {
      await supabaseInsert('internal_notifications', {
        tenant_id: TENANT_ID,
        kind: 'erp_confirm_code',
        agent: 'deli',
        title: 'Confirmação ERP — código',
        body: texto,
        metadata: { proposal_id, resumo: resumo ?? null },
      });
      channels.push('sino');
    } catch (err) {
      console.error('[erp-confirm-code] internal_notifications falhou:', err.message);
    }

    // Canal 2 — Telegram direto ao CEO (out-of-band real). Soft-fail.
    const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    if (TELEGRAM_BOT_TOKEN) {
      try {
        const r = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: CHAT_ID, text: texto, parse_mode: 'HTML' }),
          signal: AbortSignal.timeout(10_000),
        });
        if (r.ok) channels.push('telegram');
        else console.warn('[erp-confirm-code] telegram', r.status);
      } catch (err) {
        console.warn('[erp-confirm-code] telegram soft-fail:', err.message);
      }
    }

    // delivered=false → o código ficou só como hash no banco; CEO sem canal configurado.
    return res.json({ delivered: channels.length > 0, channels });
  });

  return router;
};
