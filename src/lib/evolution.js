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
export async function getInstanceStatus(instanceName, evolutionUrl, apiKey) {
  const url = evolutionUrl || EVO_URL;
  const key = apiKey || EVO_KEY;
  const res = await fetch(`${url}/instance/connectionState/${instanceName}`, {
    headers: { 'Content-Type': 'application/json', apikey: key },
  });
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

// Enviar mídia (imagem, vídeo, documento) — media pode ser URL ou base64 puro
export async function sendMediaMessage(instanceName, to, media, mediaType, mimeType = '', caption = '', fileName = '') {
  const body = { number: to, mediatype: mediaType, media, caption };
  if (mimeType)  body.mimetype  = mimeType;
  if (fileName)  body.fileName  = fileName;
  const res = await fetch(`${EVO_URL}/message/sendMedia/${instanceName}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  return res.json();
}

// Configurar webhook da instância para apontar para a Supabase Edge Function
export async function setWebhook(instanceName, webhookUrl, evolutionUrl, apiKey) {
  const url = evolutionUrl || EVO_URL;
  const key = apiKey || EVO_KEY;
  const res = await fetch(`${url}/webhook/set/${instanceName}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: key },
    body: JSON.stringify({
      webhook: {
        enabled:           true,
        url:               webhookUrl,
        webhook_by_events: false,
        events:            ['MESSAGES_UPSERT'],
      },
    }),
  });
  return res.json();
}

// Buscar QR Code para conectar instância
export async function getQRCode(instanceName, evolutionUrl, apiKey) {
  const url = evolutionUrl || EVO_URL;
  const key = apiKey || EVO_KEY;
  const res = await fetch(`${url}/instance/connect/${instanceName}`, {
    headers: { 'Content-Type': 'application/json', apikey: key },
  });
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
export async function fetchGroups(instanceName, getParticipants = false) {
  const res = await fetch(
    `${EVO_URL}/group/fetchAllGroups/${instanceName}?getParticipants=${getParticipants}`,
    { headers },
  );
  return res.json();
}

/* ─── Grupos WhatsApp ─────────────────────────────────── */

// Criar grupo (participants = array de JIDs: "5511999990001@s.whatsapp.net")
export async function createWAGroup(instanceName, subject, participants, description = '') {
  const body = { subject, participants };
  if (description) body.description = description;
  const res = await fetch(`${EVO_URL}/group/create/${instanceName}`, {
    method: 'POST', headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => res.statusText);
    throw new Error(`Evolution API ${res.status}: ${errText}`);
  }
  return res.json();
}

// Atualizar nome do grupo
export async function updateWAGroupSubject(instanceName, groupJid, subject) {
  const res = await fetch(`${EVO_URL}/group/updateGroupSubject/${instanceName}`, {
    method: 'PUT', headers,
    body: JSON.stringify({ groupJid, subject }),
  });
  return res.json();
}

// Adicionar participantes
export async function addWAGroupParticipants(instanceName, groupJid, participants) {
  const res = await fetch(`${EVO_URL}/group/addParticipant/${instanceName}`, {
    method: 'PUT', headers,
    body: JSON.stringify({ groupJid, participants }),
  });
  return res.json();
}

// Remover participante
export async function removeWAGroupParticipant(instanceName, groupJid, participants) {
  const res = await fetch(`${EVO_URL}/group/removeParticipant/${instanceName}`, {
    method: 'DELETE', headers,
    body: JSON.stringify({ groupJid, participants }),
  });
  return res.json();
}

// Info detalhada de um grupo
export async function fetchWAGroupInfo(instanceName, groupJid) {
  const res = await fetch(
    `${EVO_URL}/group/findGroupInfos/${instanceName}?groupJid=${encodeURIComponent(groupJid)}`,
    { headers },
  );
  return res.json();
}

// Participantes de um grupo
export async function fetchWAGroupParticipants(instanceName, groupJid) {
  const res = await fetch(
    `${EVO_URL}/group/participants/${instanceName}?groupJid=${encodeURIComponent(groupJid)}`,
    { headers },
  );
  return res.json();
}

// Sair / deletar grupo (admin deixa o grupo)
export async function leaveWAGroup(instanceName, groupJid) {
  const res = await fetch(`${EVO_URL}/group/leaveGroup/${instanceName}`, {
    method: 'DELETE', headers,
    body: JSON.stringify({ groupJid }),
  });
  return res.json();
}

// Enviar mensagem de texto para grupo
export async function sendGroupTextMessage(instanceName, groupJid, text) {
  const res = await fetch(`${EVO_URL}/message/sendText/${instanceName}`, {
    method: 'POST', headers,
    body: JSON.stringify({ number: groupJid, text }),
  });
  return res.json();
}

// Enviar áudio como PTT (voice note) via sendWhatsAppAudio
export async function sendAudioMessage(instanceName, to, audioBase64) {
  // sendWhatsAppAudio espera só os dígitos do número, sem sufixo @s.whatsapp.net
  const number  = to.split('@')[0];
  const payload = { number, audio: audioBase64, encoding: true };
  console.log('[EVO] sendWhatsAppAudio →', instanceName, number, `${audioBase64.length} chars base64`);
  const res = await fetch(`${EVO_URL}/message/sendWhatsAppAudio/${instanceName}`, {
    method: 'POST', headers,
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => res.statusText);
    console.error('[EVO] sendWhatsAppAudio falhou:', res.status, errText);
    throw new Error(`Evolution API ${res.status}: ${errText}`);
  }
  return res.json();
}

// Buscar perfil de contato (foto, nome)
export async function fetchProfile(instanceName, phoneNumber) {
  const res = await fetch(`${EVO_URL}/chat/fetchProfile/${instanceName}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ number: phoneNumber }),
  });
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
