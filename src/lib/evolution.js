// src/lib/evolution.js
// Cliente da Evolution API para WhatsApp
// TASK-205 — Enviar mensagem WhatsApp pela plataforma

const EVO_URL = import.meta.env.VITE_EVOLUTION_URL;
const EVO_KEY = import.meta.env.VITE_EVOLUTION_KEY;

const headers = {
  'Content-Type': 'application/json',
  apikey: EVO_KEY,
};

// Listar todas as instâncias
export async function listInstances() {
  const res = await fetch(`${EVO_URL}/instance/fetchInstances`, { headers });
  return res.json();
}

// Status de conexão de uma instância
export async function getInstanceStatus(instanceName) {
  const res = await fetch(`${EVO_URL}/instance/connectionState/${instanceName}`, { headers });
  return res.json();
}

// Enviar mensagem de texto
export async function sendTextMessage(instanceName, to, text) {
  const res = await fetch(`${EVO_URL}/message/sendText/${instanceName}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ number: to, text }),
  });
  return res.json();
}

// Enviar mídia (imagem, vídeo, documento)
export async function sendMediaMessage(instanceName, to, mediaUrl, mediaType, caption = '') {
  const res = await fetch(`${EVO_URL}/message/sendMedia/${instanceName}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      number:    to,
      mediatype: mediaType,
      media:     mediaUrl,
      caption,
    }),
  });
  return res.json();
}

// Configurar webhook da instância para apontar para a Supabase Edge Function
export async function setWebhook(instanceName, webhookUrl) {
  const res = await fetch(`${EVO_URL}/webhook/set/${instanceName}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      url:               webhookUrl,
      webhook_by_events: false,
      webhook_base64:    false,
      events: [
        'MESSAGES_UPSERT',
        'MESSAGES_UPDATE',
        'CONNECTION_UPDATE',
        'QRCODE_UPDATED',
      ],
    }),
  });
  return res.json();
}

// Buscar QR Code para conectar instância
export async function getQRCode(instanceName) {
  const res = await fetch(`${EVO_URL}/instance/connect/${instanceName}`, { headers });
  return res.json();
}

// Buscar mensagens de um chat
export async function fetchMessages(instanceName, remoteJid, limit = 50) {
  const res = await fetch(`${EVO_URL}/chat/findMessages/${instanceName}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ where: { key: { remoteJid } }, limit }),
  });
  return res.json();
}

// Buscar contatos
export async function fetchContacts(instanceName) {
  const res = await fetch(`${EVO_URL}/chat/findContacts/${instanceName}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({}),
  });
  return res.json();
}

// Buscar grupos
export async function fetchGroups(instanceName) {
  const res = await fetch(
    `${EVO_URL}/group/fetchAllGroups/${instanceName}?getParticipants=false`,
    { headers },
  );
  return res.json();
}

// Marcar mensagens como lidas
export async function markAsRead(instanceName, remoteJid, msgIds) {
  const res = await fetch(`${EVO_URL}/chat/markMessageAsRead/${instanceName}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      read_messages: msgIds.map(id => ({ remoteJid, fromMe: false, id })),
    }),
  });
  return res.json();
}
