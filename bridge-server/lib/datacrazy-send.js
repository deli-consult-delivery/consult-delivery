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

    // Aguarda 2s (deixa a mensagem ser entregue) e finaliza a conversa de volta.
    // AWAIT (não setTimeout solto): garante que a conversa é re-finalizada antes
    // de retornar, mesmo que o processo reinicie logo depois.
    await new Promise((r) => setTimeout(r, 2000));
    await _conversationAction(config.apiKey, conversationId, 'finish');

    return { ok: resp.ok, messageId: data.id, detail: resp.ok ? undefined : data };
  } catch (err) {
    await _conversationAction(config.apiKey, conversationId, 'finish');
    return { ok: false, detail: err.message };
  }
}

/**
 * Busca os detalhes de uma conversa no DataCrazy (telefone, updatedAt, nome).
 * Usado pelo webhook de finalização, cujo payload pode não trazer esses campos.
 *
 * @returns {Promise<{id:string, updatedAt:string|null, finished:boolean|null,
 *                    phoneNumber:string|null, name:string|null} | null>}
 */
async function getDatacrazyConversation(apiKey, conversationId) {
  if (!apiKey || !conversationId) return null;
  try {
    const resp = await fetch(
      `${DATACRAZY_API_BASE}/api/v1/conversations/${conversationId}`,
      { headers: { 'Authorization': `Bearer ${apiKey}` }, signal: AbortSignal.timeout(5000) }
    );
    if (!resp.ok) {
      console.warn(`[datacrazy-send] getConversation ${conversationId} → ${resp.status}`);
      return null;
    }
    const c = await resp.json().catch(() => null);
    if (!c) return null;
    return {
      id:          c.id || conversationId,
      updatedAt:   c.updatedAt || null,
      finished:    typeof c.finished === 'boolean' ? c.finished : null,
      phoneNumber: c.contact?.phoneNumber || null,
      name:        c.contact?.name || c.name || null,
    };
  } catch (err) {
    console.error(`[datacrazy-send] getConversation ${conversationId} erro:`, err.message);
    return null;
  }
}

/**
 * Substitui variáveis {nome_cliente}, {link_avaliacao}, {link_nps}, {nome_empresa}
 * no template de mensagem.
 */
function renderTemplate(template, vars) {
  return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? `{${key}}`);
}

module.exports = { sendDatacrazyMessage, getDatacrazyConversation, renderTemplate };
