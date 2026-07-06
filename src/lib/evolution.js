// src/lib/evolution.js
// Cliente WhatsApp (Evolution API) — via Bridge. A key da Evolution nunca
// chega ao navegador: o front autentica com o JWT da sessão e manda
// instance_name (identificador público, já usado pelo picker de instâncias);
// o Bridge resolve a credencial no servidor e chama a Evolution.

import { supabase } from './supabase';

const BRIDGE = import.meta.env.VITE_BRIDGE_URL || 'https://bridge.consultdelivery.com.br';

async function bridgeFetch(path, { method = 'GET', body } = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token || '';
  const res = await fetch(`${BRIDGE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => res.statusText);
    throw new Error(`Evolution (bridge) ${res.status}: ${errText.slice(0, 300)}`);
  }
  return res.json();
}

// Enviar mensagem de texto (quoted opcional para respostas). Serve também
// para grupo — Evolution aceita o JID do grupo no campo "number".
export async function sendTextMessage(instanceName, to, text, quoted = null) {
  return bridgeFetch('/api/evolution/send-text', {
    method: 'POST', body: { instance_name: instanceName, to, text, quoted },
  });
}

// Enviar mídia (imagem, vídeo, documento) — media pode ser URL ou base64 puro
export async function sendMediaMessage(instanceName, to, media, mediaType, mimeType = '', caption = '', fileName = '') {
  return bridgeFetch('/api/evolution/send-media', {
    method: 'POST',
    body: { instance_name: instanceName, to, media, media_type: mediaType, mime_type: mimeType, caption, file_name: fileName },
  });
}

// Enviar áudio como PTT (voice note)
export async function sendAudioMessage(instanceName, to, audioBase64) {
  return bridgeFetch('/api/evolution/send-audio', {
    method: 'POST', body: { instance_name: instanceName, to, audio_base64: audioBase64 },
  });
}

// Buscar contatos
export async function fetchContacts(instanceName) {
  return bridgeFetch(`/api/evolution/contacts?instance_name=${encodeURIComponent(instanceName)}`);
}

// Buscar grupos
export async function fetchGroups(instanceName, getParticipants = false) {
  return bridgeFetch(`/api/evolution/groups?instance_name=${encodeURIComponent(instanceName)}&get_participants=${getParticipants}`);
}

/* ─── Grupos WhatsApp ─────────────────────────────────── */

// Criar grupo (participants = array de JIDs: "5511999990001@s.whatsapp.net")
export async function createWAGroup(instanceName, subject, participants, description = '') {
  return bridgeFetch('/api/evolution/groups/create', {
    method: 'POST', body: { instance_name: instanceName, subject, participants, description },
  });
}

// Atualizar nome do grupo
export async function updateWAGroupSubject(instanceName, groupJid, subject) {
  return bridgeFetch('/api/evolution/groups/subject', {
    method: 'PUT', body: { instance_name: instanceName, group_jid: groupJid, subject },
  });
}

// Adicionar participantes
export async function addWAGroupParticipants(instanceName, groupJid, participants) {
  return bridgeFetch('/api/evolution/groups/participants', {
    method: 'PUT', body: { instance_name: instanceName, group_jid: groupJid, participants },
  });
}

// Remover participante
export async function removeWAGroupParticipant(instanceName, groupJid, participants) {
  return bridgeFetch('/api/evolution/groups/participants', {
    method: 'DELETE', body: { instance_name: instanceName, group_jid: groupJid, participants },
  });
}

// Participantes de um grupo
export async function fetchWAGroupParticipants(instanceName, groupJid) {
  return bridgeFetch(`/api/evolution/groups/participants?instance_name=${encodeURIComponent(instanceName)}&group_jid=${encodeURIComponent(groupJid)}`);
}

// Sair / deletar grupo (admin deixa o grupo)
export async function leaveWAGroup(instanceName, groupJid) {
  return bridgeFetch('/api/evolution/groups/leave', {
    method: 'DELETE', body: { instance_name: instanceName, group_jid: groupJid },
  });
}

// Enviar mensagem de texto para grupo
export async function sendGroupTextMessage(instanceName, groupJid, text) {
  return sendTextMessage(instanceName, groupJid, text);
}

// Buscar perfil de contato (foto, nome)
export async function fetchProfile(instanceName, phoneNumber) {
  return bridgeFetch(`/api/evolution/profile?instance_name=${encodeURIComponent(instanceName)}&phone=${encodeURIComponent(phoneNumber)}`);
}

// Apagar mensagem no WhatsApp (revoke — apaga para todos)
export async function deleteWhatsAppMessage(instanceName, remoteJid, whatsappMsgId, fromMe = true) {
  return bridgeFetch('/api/evolution/message', {
    method: 'DELETE', body: { instance_name: instanceName, remote_jid: remoteJid, whatsapp_msg_id: whatsappMsgId, from_me: fromMe },
  });
}

// Reagir a uma mensagem (emoji). reaction = '' remove a reação.
export async function sendReaction(instanceName, remoteJid, whatsappMsgId, reaction, fromMe = false) {
  return bridgeFetch('/api/evolution/reaction', {
    method: 'POST', body: { instance_name: instanceName, remote_jid: remoteJid, whatsapp_msg_id: whatsappMsgId, reaction, from_me: fromMe },
  });
}
