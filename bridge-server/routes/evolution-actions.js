'use strict';

// ════════════════════════════════════════════════════════════════════════════
// /api/evolution/* — proxy autenticado (requireJwt) para a Evolution API.
//
// Substitui as chamadas diretas que existiam em src/lib/evolution.js (chave
// da Evolution embutida no bundle via VITE_EVOLUTION_KEY). O front manda o
// instance_name (já público — é o que o picker de Chat/Grupos usa hoje) e o
// Bridge resolve evolution_url/api_key no Supabase (resolveInstance) antes de
// chamar a Evolution. A chave nunca sai do servidor.
//
// Mantém o mesmo modelo de autorização que já existia no front (qualquer
// usuário do Console autenticado + acesso à tabela evolution_instances via
// RLS) — não introduz nem afrouxa scoping por tenant; isso é um tema à parte.
// ════════════════════════════════════════════════════════════════════════════

const express = require('express');

module.exports = ({ requireJwt, sbFetch, assertTenantMember }) => {
  const router = express.Router();
  const { resolveInstance } = require('../lib/evolution-instance');

  async function proxy(req, res, { method = 'GET', evoPath, body, timeoutMs = 20_000 }) {
    const instanceName = req.body?.instance_name || req.query?.instance_name;
    try {
      const inst = await resolveInstance(instanceName, sbFetch);
      if (!inst) return res.status(404).json({ error: 'instância Evolution não encontrada' });
      // IDOR: sem isto, qualquer usuário autenticado com o instance_name de
      // outro tenant conseguiria enviar/gerenciar mensagens como esse tenant.
      if (!inst.tenant_id) return res.status(403).json({ error: 'instância sem tenant associado' });
      if (!await assertTenantMember(req, res, inst.tenant_id)) return;

      const r = await fetch(`${inst.evolution_url}${evoPath(inst.instance_name)}`, {
        method,
        headers: { 'Content-Type': 'application/json', apikey: inst.api_key },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(timeoutMs),
      });
      const text = await r.text();
      let data = null;
      if (text) {
        // Evolution/nginx pode devolver HTML (ex.: 502) — sem o try, isso
        // estoura no catch de baixo e vira 500 genérico, mascarando o status
        // real (r.status) que o front precisaria para diferenciar os erros.
        try { data = JSON.parse(text); } catch { data = text; }
      }
      if (!r.ok) return res.status(r.status).json({ error: `Evolution ${r.status}`, detail: data });
      return res.json(data);
    } catch (err) {
      console.error(`[evolution-actions ${evoPath('?')}]`, err.message);
      return res.status(500).json({ error: err.message });
    }
  }

  // ── Mensagens ────────────────────────────────────────────────────────────
  router.post('/evolution/send-text', requireJwt, (req, res) => {
    const { to, text, quoted } = req.body || {};
    if (!to || !text) return res.status(400).json({ error: 'to e text são obrigatórios' });
    return proxy(req, res, {
      method: 'POST',
      evoPath: (name) => `/message/sendText/${name}`,
      body: { number: to, text, ...(quoted ? { quoted } : {}) },
    });
  });

  router.post('/evolution/send-media', requireJwt, (req, res) => {
    const { to, media, media_type, mime_type, caption, file_name } = req.body || {};
    if (!to || !media || !media_type) return res.status(400).json({ error: 'to, media e media_type são obrigatórios' });
    return proxy(req, res, {
      method: 'POST',
      evoPath: (name) => `/message/sendMedia/${name}`,
      body: {
        number: String(to).split('@')[0], mediatype: media_type, media, caption: caption || '',
        ...(mime_type ? { mimetype: mime_type } : {}), ...(file_name ? { fileName: file_name } : {}),
      },
    });
  });

  router.post('/evolution/send-audio', requireJwt, (req, res) => {
    const { to, audio_base64 } = req.body || {};
    if (!to || !audio_base64) return res.status(400).json({ error: 'to e audio_base64 são obrigatórios' });
    return proxy(req, res, {
      method: 'POST',
      evoPath: (name) => `/message/sendWhatsAppAudio/${name}`,
      body: { number: String(to).split('@')[0], audio: audio_base64, encoding: true },
    });
  });

  router.delete('/evolution/message', requireJwt, (req, res) => {
    const { remote_jid, whatsapp_msg_id, from_me = true } = req.body || {};
    if (!remote_jid || !whatsapp_msg_id) return res.status(400).json({ error: 'remote_jid e whatsapp_msg_id são obrigatórios' });
    return proxy(req, res, {
      method: 'DELETE',
      evoPath: (name) => `/message/delete/${name}`,
      body: { id: whatsapp_msg_id, remoteJid: remote_jid, fromMe: from_me },
    });
  });

  router.post('/evolution/reaction', requireJwt, (req, res) => {
    const { remote_jid, whatsapp_msg_id, reaction, from_me = false } = req.body || {};
    if (!remote_jid || !whatsapp_msg_id || reaction === undefined) return res.status(400).json({ error: 'remote_jid, whatsapp_msg_id e reaction são obrigatórios' });
    return proxy(req, res, {
      method: 'POST',
      evoPath: (name) => `/message/sendReaction/${name}`,
      body: { key: { remoteJid: remote_jid, fromMe: from_me, id: whatsapp_msg_id }, reaction },
    });
  });

  // ── Contatos / perfil / grupos (leitura) ───────────────────────────────────
  router.get('/evolution/contacts', requireJwt, (req, res) => proxy(req, res, {
    method: 'POST',
    evoPath: (name) => `/chat/findContacts/${name}`,
    body: {},
  }));

  router.get('/evolution/profile', requireJwt, (req, res) => {
    const { phone } = req.query;
    if (!phone) return res.status(400).json({ error: 'phone é obrigatório' });
    return proxy(req, res, {
      method: 'POST',
      evoPath: (name) => `/chat/fetchProfile/${name}`,
      body: { number: phone },
    });
  });

  router.get('/evolution/groups', requireJwt, (req, res) => {
    const getParticipants = req.query.get_participants === 'true';
    return proxy(req, res, {
      method: 'GET',
      evoPath: (name) => `/group/fetchAllGroups/${name}?getParticipants=${getParticipants}`,
    });
  });

  // ── Administração de grupos ─────────────────────────────────────────────
  router.post('/evolution/groups/create', requireJwt, (req, res) => {
    const { subject, participants, description } = req.body || {};
    if (!subject || !Array.isArray(participants)) return res.status(400).json({ error: 'subject e participants[] são obrigatórios' });
    return proxy(req, res, {
      method: 'POST',
      evoPath: (name) => `/group/create/${name}`,
      body: { subject, participants, ...(description ? { description } : {}) },
    });
  });

  router.put('/evolution/groups/subject', requireJwt, (req, res) => {
    const { group_jid, subject } = req.body || {};
    if (!group_jid || !subject) return res.status(400).json({ error: 'group_jid e subject são obrigatórios' });
    return proxy(req, res, {
      method: 'PUT',
      evoPath: (name) => `/group/updateGroupSubject/${name}`,
      body: { groupJid: group_jid, subject },
    });
  });

  router.get('/evolution/groups/participants', requireJwt, (req, res) => {
    const { group_jid } = req.query;
    if (!group_jid) return res.status(400).json({ error: 'group_jid é obrigatório' });
    return proxy(req, res, {
      method: 'GET',
      evoPath: (name) => `/group/participants/${name}?groupJid=${encodeURIComponent(group_jid)}`,
    });
  });

  router.put('/evolution/groups/participants', requireJwt, (req, res) => {
    const { group_jid, participants } = req.body || {};
    if (!group_jid || !Array.isArray(participants)) return res.status(400).json({ error: 'group_jid e participants[] são obrigatórios' });
    return proxy(req, res, {
      method: 'PUT',
      evoPath: (name) => `/group/addParticipant/${name}`,
      body: { groupJid: group_jid, participants },
    });
  });

  router.delete('/evolution/groups/participants', requireJwt, (req, res) => {
    const { group_jid, participants } = req.body || {};
    if (!group_jid || !Array.isArray(participants)) return res.status(400).json({ error: 'group_jid e participants[] são obrigatórios' });
    return proxy(req, res, {
      method: 'DELETE',
      evoPath: (name) => `/group/removeParticipant/${name}`,
      body: { groupJid: group_jid, participants },
    });
  });

  router.delete('/evolution/groups/leave', requireJwt, (req, res) => {
    const { group_jid } = req.body || {};
    if (!group_jid) return res.status(400).json({ error: 'group_jid é obrigatório' });
    return proxy(req, res, {
      method: 'DELETE',
      evoPath: (name) => `/group/leaveGroup/${name}`,
      body: { groupJid: group_jid },
    });
  });

  return router;
};
