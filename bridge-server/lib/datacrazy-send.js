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
async function getDatacrazyConversation(apiKey, conversationId, lookbackMinutes = 15) {
  if (!apiKey || !conversationId) return null;
  // O GET unitário /conversations/{id} retorna erro nesta API. Usa-se a LISTA
  // (mesma do poller) com janela recente — o webhook dispara na finalização,
  // então a conversa está entre as mais recentes (ordenadas por updatedAt).
  try {
    const cutoff = new Date(Date.now() - lookbackMinutes * 60 * 1000).toISOString();
    const resp = await fetch(
      `${DATACRAZY_API_BASE}/api/v1/conversations?limit=100&updatedAtStart=${encodeURIComponent(cutoff)}`,
      { headers: { 'Authorization': `Bearer ${apiKey}` }, signal: AbortSignal.timeout(15000) }
    );
    if (!resp.ok) {
      console.warn(`[datacrazy-send] listConversations → ${resp.status}`);
      return null;
    }
    const data = await resp.json().catch(() => null);
    const c = (data?.data || []).find((x) => x.id === conversationId);
    if (!c) {
      console.warn(`[datacrazy-send] conv=${conversationId} não está na lista recente (${lookbackMinutes}min)`);
      return null;
    }
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
 * Extrai o atendente e o início do atendimento atual da conversa, usando o campo
 * `currentThread` (atendimento/ticket corrente): `startedAt` é o início confiável e
 * `attendants:[{id}]` são os atendentes do thread, resolvidos para nome via a lista
 * `attendants:[{id,name}]` da conversa. Busca via lista de conversas (o GET unitário
 * /conversations/{id} retorna erro). Mais robusto que varrer mensagens (limita a ~20).
 *
 * @returns {Promise<{atendenteNome: string|null, inicioAt: string|null}>}
 */
async function getDatacrazyAtendenteEInicio(apiKey, conversationId, lookbackMinutes = 20) {
  if (!apiKey || !conversationId) return { atendenteNome: null, inicioAt: null };
  try {
    const cutoff = new Date(Date.now() - lookbackMinutes * 60 * 1000).toISOString();
    const resp = await fetch(
      `${DATACRAZY_API_BASE}/api/v1/conversations?limit=100&updatedAtStart=${encodeURIComponent(cutoff)}`,
      { headers: { 'Authorization': `Bearer ${apiKey}` }, signal: AbortSignal.timeout(15000) }
    );
    if (!resp.ok) return { atendenteNome: null, inicioAt: null };
    const data = await resp.json().catch(() => null);
    const c = (data && data.data || []).find((x) => x.id === conversationId);
    if (!c) return { atendenteNome: null, inicioAt: null };

    const thread = c.currentThread || null;
    const inicioAt = (thread && (thread.startedAt || thread.createdAt)) || null;

    // Resolve nome do atendente: ids do thread → nome via c.attendants. Pega o último.
    const nomePorId = {};
    for (const a of (c.attendants || [])) {
      if (a && a.id && a.name && String(a.name).trim()) nomePorId[a.id] = String(a.name).trim();
    }
    let atendenteNome = null;
    const threadAtt = (thread && thread.attendants) || [];
    for (let i = threadAtt.length - 1; i >= 0; i--) {
      const nome = nomePorId[threadAtt[i] && threadAtt[i].id];
      if (nome) { atendenteNome = nome; break; }
    }
    // Fallback: último atendente registrado na conversa.
    if (!atendenteNome) {
      const arr = (c.attendants || []).filter((a) => a && a.name && String(a.name).trim());
      if (arr.length) atendenteNome = String(arr[arr.length - 1].name).trim();
    }

    return { atendenteNome, inicioAt };
  } catch (err) {
    console.error(`[datacrazy-send] getAtendente ${conversationId} erro:`, err.message);
    return { atendenteNome: null, inicioAt: null };
  }
}

/**
 * Substitui variáveis {nome_cliente}, {link_avaliacao}, {link_nps}, {nome_empresa}
 * no template de mensagem.
 */
function renderTemplate(template, vars) {
  return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? `{${key}}`);
}

module.exports = { sendDatacrazyMessage, getDatacrazyConversation, getDatacrazyAtendenteEInicio, renderTemplate };
