'use strict';

const DATACRAZY_BASE = process.env.DATACRAZY_API_URL || 'https://api.g1.datacrazy.io';

/**
 * Envia uma mensagem de texto numa conversa existente do Datacrazy.
 * Docs: POST /api/v1/conversations/{id}/messages
 *
 * @param {{ apiKey: string }} config  — API key Bearer JWT do tenant
 * @param {string} conversationId     — ID da conversa no Datacrazy
 * @param {string} body               — Texto da mensagem a enviar
 * @param {string|null} scheduledDate — ISO 8601 opcional (null = enviar agora)
 * @returns {Promise<{ ok: boolean, messageId?: string, detail?: unknown }>}
 */
async function sendDatacrazyMessage(config, conversationId, body, scheduledDate = null) {
  if (!config?.apiKey) return { ok: false, detail: 'sem_api_key' };
  if (!conversationId)  return { ok: false, detail: 'sem_conversation_id' };

  const payload = { body, isInternal: false };
  if (scheduledDate) payload.scheduledDate = scheduledDate;

  try {
    const resp = await fetch(
      `${DATACRAZY_BASE}/api/v1/conversations/${conversationId}/messages`,
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
    return { ok: resp.ok, messageId: data.id, detail: resp.ok ? undefined : data };
  } catch (err) {
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
