'use strict';

const DATACRAZY_MESSAGING_BASE = process.env.DATACRAZY_MESSAGING_URL || 'https://messaging.g1.datacrazy.io';
const DATACRAZY_API_BASE = process.env.DATACRAZY_API_URL || 'https://api.g1.datacrazy.io';

async function _conversationAction(apiKey, conversationId, action) {
  try {
    const resp = await fetch(
      `${DATACRAZY_MESSAGING_BASE}/api/messaging/conversations/${conversationId}/${action}`,
      {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}` },
      }
    );
    console.log(`[datacrazy-send] ${action} conv=${conversationId} → ${resp.status}`);
    return resp.ok;
  } catch (err) {
    console.error(`[datacrazy-send] ${action} conv=${conversationId} erro:`, err.message);
    return false;
  }
}

async function sendDatacrazyMessage(config, conversationId, body, scheduledDate = null) {
  if (!config?.apiKey) return { ok: false, detail: 'sem_api_key' };
  if (!conversationId)  return { ok: false, detail: 'sem_conversation_id' };

  const payload = { body, isInternal: false };
  if (scheduledDate) payload.scheduledDate = scheduledDate;

  // Reabre a conversa antes de enviar para garantir entrega ao WhatsApp
  await _conversationAction(config.apiKey, conversationId, 'reopen');

  try {
    const resp = await fetch(
      `${DATACRAZY_API_BASE}/api/v1/conversations/${conversationId}/messages`,
      {
        method:  'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify(payload),
      }
    );
    const data = await resp.json().catch(() => ({}));

    // Aguarda 2s e finaliza a conversa de volta
    setTimeout(() => {
      _conversationAction(config.apiKey, conversationId, 'finish').catch(() => {});
    }, 2000);

    return { ok: resp.ok, messageId: data.id, detail: resp.ok ? undefined : data };
  } catch (err) {
    _conversationAction(config.apiKey, conversationId, 'finish').catch(() => {});
    return { ok: false, detail: err.message };
  }
}

/**
 * Substitui variáveis {nome_cliente}, {link_avaliacao}, {link_nps}, {nome_empresa}
 * no template de mensagem.
 */
function renderTemplate(template, vars) {
  return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? `{${key}}`);
}

module.exports = { sendDatacrazyMessage, renderTemplate };
