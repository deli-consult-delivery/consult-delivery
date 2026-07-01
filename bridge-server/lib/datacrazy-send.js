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
 * Extrai o atendente e o início do atendimento (ticket) mais recente da conversa.
 *
 * A API de LISTA de conversas (`/api/v1/conversations`) não expõe `currentThread`
 * nem um `attendants` do ticket corrente — confirmado ao vivo (2026-07-01): o
 * campo `attendants` da conversa é a lista de CONTATOS/participantes (com
 * `isAgent`, mas observados sempre `false`), não o atendente que tratou o caso.
 *
 * O ticket atual começa na mensagem com `firstTicketMessage: true` — mas ela
 * costuma ser a mensagem de ABERTURA do CLIENTE (`attendant` vazio), não a do
 * atendente. Confirmado ao vivo (2026-07-01, conv 6a4299a106ef3c74c8430a90):
 * a mensagem `firstTicketMessage=true` tem `attendant: undefined`; o atendente
 * só aparece nas mensagens seguintes (respostas humanas). Por isso resolvemos
 * o atendente como o mais recente dentro da janela do ticket atual (da mais
 * nova até a `firstTicketMessage`), não da própria `firstTicketMessage`.
 *
 * A API não pagina (`limit`/`page`/`skip`/`offset` testados, sempre retornam
 * as mesmas 20 mensagens) — em tickets longos a `firstTicketMessage` pode
 * cair fora da janela. Nesse caso caímos para o atendente mais recente entre
 * as 20 mensagens disponíveis (melhor aproximação possível) e `inicioAt` fica
 * `null` (não dá pra saber o início real do ticket sem essa mensagem).
 *
 * O telefone real do cliente (para contato via WhatsApp) vem no campo
 * `contact.phoneNumber` das mensagens RECEBIDAS (do cliente) — confirmado ao
 * vivo. `contact_identifier`/`conv.id` é um ID interno do Datacrazy, não um
 * telefone, e não serve para contato.
 *
 * @returns {Promise<{atendenteNome: string|null, inicioAt: string|null, telefoneCliente: string|null}>}
 */
async function getDatacrazyAtendenteEInicio(apiKey, conversationId) {
  if (!apiKey || !conversationId) return { atendenteNome: null, inicioAt: null, telefoneCliente: null };
  try {
    const resp = await fetch(
      `${DATACRAZY_API_BASE}/api/v1/conversations/${conversationId}/messages`,
      { headers: { 'Authorization': `Bearer ${apiKey}` }, signal: AbortSignal.timeout(15000) }
    );
    if (!resp.ok) return { atendenteNome: null, inicioAt: null, telefoneCliente: null };
    const data = await resp.json().catch(() => null);
    const messages = (data && data.messages) || []; // ordenadas da mais recente p/ mais antiga

    const inicioIdx = messages.findIndex((m) => m && m.firstTicketMessage === true);
    const inicioMsg = inicioIdx >= 0 ? messages[inicioIdx] : null;
    const janelaTicket = inicioIdx >= 0 ? messages.slice(0, inicioIdx + 1) : messages;

    const msgComAtendente = janelaTicket.find((m) => m && m.attendant && m.attendant.name);
    const atendenteNome = msgComAtendente ? String(msgComAtendente.attendant.name).trim() : null;

    const msgComContato = messages.find((m) => m && m.contact && m.contact.phoneNumber);
    const telefoneCliente = msgComContato ? String(msgComContato.contact.phoneNumber).trim() : null;

    return { atendenteNome, inicioAt: (inicioMsg && inicioMsg.createdAt) || null, telefoneCliente };
  } catch (err) {
    console.error(`[datacrazy-send] getAtendente ${conversationId} erro:`, err.message);
    return { atendenteNome: null, inicioAt: null, telefoneCliente: null };
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
