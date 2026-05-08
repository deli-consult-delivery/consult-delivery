// Supabase Edge Function — Evolution API Webhook Receiver (v3)
// Eventos: MESSAGES_UPSERT, CONNECTION_UPDATE, MESSAGES_UPDATE, MESSAGES_DELETE,
//          CONTACTS_UPSERT/UPDATE, GROUPS_UPSERT, GROUP_UPDATE,
//          GROUP_PARTICIPANTS_UPDATE, SEND_MESSAGE, CHATS_UPDATE
//
// Deploy: supabase functions deploy evolution-webhook

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

const BRIDGE_URL    = Deno.env.get('BRIDGE_SERVER_URL') || 'http://45.39.210.183:3001';
const BRIDGE_SECRET = Deno.env.get('BRIDGE_SECRET')    || '';

const MENTION_REGEX = /@(analista|copiloto|co-piloto|deli|cora|lara|sofia|breno|max|vera)\b/i;

function extractMentionedAgent(text: string): string | null {
  const m = text.match(MENTION_REGEX);
  if (!m) return null;
  const raw = m[1].toLowerCase().replace(/-/g, '');
  if (raw === 'copiloto') return 'analista-ifood';
  return raw;
}

// Eventos que este handler processa — tudo fora desta lista retorna 'ignored' imediatamente
const HANDLED_EVENTS = new Set([
  'messagesupsert', 'connectionupdate', 'messagesupdate', 'messagesdelete',
  'contactsupsert', 'contactsupdate', 'groupsupsert', 'groupupdate',
  'groupparticipantsupdate', 'sendmessage', 'chatsupdate',
]);

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('ok', { status: 200 });

  try {
    const body = await req.json();
    const { event, instance, data } = body;

    const eventNorm = (event || '').toLowerCase().replace(/[._]/g, '');

    if (!HANDLED_EVENTS.has(eventNorm)) return new Response('ignored', { status: 200 });

    // ── Instance lookup compartilhado por todos os handlers ───────────────────

    const { data: inst, error: instErr } = await supabase
      .from('evolution_instances')
      .select('id, tenant_id, evolution_url, api_key')
      .eq('instance_name', instance)
      .single();

    if (instErr || !inst) {
      console.warn('[WEBHOOK] instância não encontrada:', instance);
      return new Response('instance_not_found', { status: 404 });
    }

    const tenantId = inst.tenant_id as string;

    // ── Dispatch ──────────────────────────────────────────────────────────────

    switch (eventNorm) {
      case 'messagesupsert':
        await handleMessagesUpsert({ inst, tenantId, instance, data });
        break;
      case 'connectionupdate':
        await handleConnectionUpdate({ tenantId, instance, data });
        break;
      case 'messagesupdate':
        await handleMessagesUpdate({ data });
        break;
      case 'messagesdelete':
        await handleMessagesDelete({ data });
        break;
      case 'contactsupsert':
      case 'contactsupdate':
        await handleContactsUpsert({ tenantId, data });
        break;
      case 'groupsupsert':
        await handleGroupsUpsert({ tenantId, data });
        break;
      case 'groupupdate':
        await handleGroupUpdate({ tenantId, data });
        break;
      case 'groupparticipantsupdate':
        await handleGroupParticipantsUpdate({ tenantId, data });
        break;
      case 'sendmessage':
        await handleSendMessage({ inst, tenantId, instance, data });
        break;
      case 'chatsupdate':
        await handleChatsUpdate({ inst, data });
        break;
    }

    return new Response('ok', { status: 200 });

  } catch (err) {
    console.error('[WEBHOOK] erro não tratado:', err);
    return new Response('error', { status: 500 });
  }
});

// ── Event Handlers ────────────────────────────────────────────────────────────

async function handleMessagesUpsert({ inst, tenantId, instance, data }: {
  inst: { id: string; tenant_id: string; evolution_url: string; api_key: string };
  tenantId: string; instance: string; data: unknown;
}) {
  const msgData = Array.isArray(data) ? data[0] : data;
  if (!msgData?.key) return;

  // ── Dados básicos ─────────────────────────────────────────────────────────

  const chatId   = msgData.key.remoteJid as string;
  const isGroup  = chatId.endsWith('@g.us');
  const msgId    = msgData.key.id as string;
  const pushName = (msgData.pushName || 'Desconhecido') as string;

  // Em grupos o remetente real está em key.participant; ausente = mensagem de sistema
  const senderJid: string | null = isGroup
    ? (msgData.key.participant || msgData.participant || null)
    : chatId;

  // ── Tipo e conteúdo ───────────────────────────────────────────────────────

  const isPtt      = !!msgData.message?.pttMessage;
  const isAudio    = isPtt || !!msgData.message?.audioMessage;
  const isImage    = !!msgData.message?.imageMessage;
  const isVideo    = !!msgData.message?.videoMessage;
  const isDocument = !!msgData.message?.documentMessage;
  const isMedia    = isAudio || isImage || isVideo || isDocument;

  let detectedMediaType: string | null = null;
  if (isAudio)         detectedMediaType = 'audio';
  else if (isImage)    detectedMediaType = 'image';
  else if (isVideo)    detectedMediaType = 'video';
  else if (isDocument) detectedMediaType = 'document';

  const messageText: string = isAudio    ? '🎵 Áudio'
    : isImage    ? (msgData.message?.imageMessage?.caption    || '🖼 Imagem')
    : isVideo    ? (msgData.message?.videoMessage?.caption    || '🎬 Vídeo')
    : isDocument ? (msgData.message?.documentMessage?.title   || '📄 Documento')
    : msgData.message?.conversation ||
      msgData.message?.extendedTextMessage?.text ||
      '';

  // ── Mensagem citada (reply) ───────────────────────────────────────────────
  const contextInfo = msgData.message?.extendedTextMessage?.contextInfo
    || msgData.message?.imageMessage?.contextInfo
    || msgData.message?.videoMessage?.contextInfo
    || msgData.message?.audioMessage?.contextInfo
    || msgData.message?.pttMessage?.contextInfo
    || msgData.message?.documentMessage?.contextInfo
    || null;

  async function buildQuotedContent(): Promise<object | null> {
    if (!contextInfo?.stanzaId) return null;
    const stanzaId = contextInfo.stanzaId as string;

    // 1. Tenta encontrar no banco pelo whatsapp_msg_id
    const { data: qMsg } = await supabase.from('messages')
      .select('id, direction, content, media_type, media_url')
      .eq('whatsapp_msg_id', stanzaId)
      .maybeSingle();
    if (qMsg) {
      return { id: qMsg.id, waMsgId: stanzaId, from: qMsg.direction === 'outbound' ? 'out' : 'in', text: qMsg.content || '', mediaType: qMsg.media_type || null, mediaUrl: qMsg.media_url || null };
    }

    // 2. Não está no banco — infere direção pelo contextInfo.participant
    // Em PV: participant === chatId → cliente enviou (in); participant ausente/outro → nós enviamos (out)
    const participant = contextInfo.participant as string | undefined;
    const qFrom: string | null = !isGroup && participant
      ? (participant.split('@')[0] === chatId.split('@')[0] ? 'in' : 'out')
      : null;

    // 3. Tenta montar pelo quotedMessage (Evolution/Baileys às vezes omite este campo)
    const qm = contextInfo.quotedMessage as Record<string, unknown> | undefined;
    if (!qm) {
      // quotedMessage ausente mas stanzaId presente → sabemos que é uma resposta, exibe marcação mínima
      return { waMsgId: stanzaId, from: qFrom, text: '', mediaType: null };
    }

    const qIsImage    = !!qm.imageMessage;
    const qIsVideo    = !!qm.videoMessage;
    const qIsAudio    = !!qm.audioMessage || !!qm.pttMessage;
    const qIsDocument = !!qm.documentMessage;

    const qText = (qm.conversation as string)
      || ((qm.extendedTextMessage as Record<string, string>)?.text)
      || ((qm.imageMessage    as Record<string, string>)?.caption)
      || ((qm.videoMessage    as Record<string, string>)?.caption)
      || ((qm.documentMessage as Record<string, string>)?.title)
      || '';

    const qMediaType = qIsImage ? 'image' : qIsVideo ? 'video' : qIsAudio ? 'audio' : qIsDocument ? 'document' : null;

    // Extrai jpegThumbnail para imagens citadas (thumbnail inline em base64)
    const qJpegThumb = qIsImage ? ((qm.imageMessage as Record<string, string>)?.jpegThumbnail) : null;
    const qMediaUrl  = qJpegThumb ? `data:image/jpeg;base64,${qJpegThumb}` : null;

    return { waMsgId: stanzaId, from: qFrom, text: qText, mediaType: qMediaType, ...(qMediaUrl ? { mediaUrl: qMediaUrl } : {}) };
  }

  const msgTimestamp = msgData.messageTimestamp
    ? new Date(Number(msgData.messageTimestamp) * 1000).toISOString()
    : new Date().toISOString();

  // ── Mensagens enviadas pelo próprio número (plataforma ou celular físico) ──

  if (msgData.key.fromMe) {
    // Dedup 1: já salva pelo handleSendMessage ou iteração anterior
    const { data: alreadySaved } = await supabase.from('messages').select('id')
      .eq('whatsapp_msg_id', msgId).maybeSingle();
    if (alreadySaved) return;

    // Para mensagens enviadas do celular, pushName = nome da nossa conta (ex: "Consult Delivery"),
    // não o nome do cliente. Busca o nome real do destinatário pelo JID.
    const { data: recipientContact } = await supabase
      .from('whatsapp_contacts')
      .select('display_name')
      .eq('tenant_id', tenantId)
      .eq('evolution_jid', chatId)
      .maybeSingle();
    const recipientName = recipientContact?.display_name || 'Desconhecido';

    const fmConvId = await upsertConversation({ tenantId, instanceId: inst.id, chatId, isGroup, pushName: recipientName });
    if (!fmConvId) return;

    // Dedup 2: plataforma salvou sem whatsapp_msg_id — apenas vincula o ID
    // Só aplica dedup para texto (mídia do celular não tem equivalente na plataforma)
    if (messageText && !isMedia) {
      const rawText = messageText.replace(/^\*[^*]+:\*\n/, '');
      const thirtySecsAgo = new Date(Date.now() - 30000).toISOString();
      const { data: existingByContent } = await supabase.from('messages').select('id')
        .eq('conversation_id', fmConvId)
        .eq('direction', 'outbound')
        .eq('content', rawText)
        .is('whatsapp_msg_id', null)
        .gte('created_at', thirtySecsAgo)
        .maybeSingle();
      if (existingByContent) {
        await supabase.from('messages').update({ whatsapp_msg_id: msgId }).eq('id', existingByContent.id);
        console.log('[WEBHOOK][MESSAGES_UPSERT] fromMe dedup: vinculado whatsapp_msg_id', msgId);
        return;
      }
    }

    // Celular físico — salva como outbound (inclui tipo de mídia)
    const fmQuoted = await buildQuotedContent();
    const { data: fmSavedMsg } = await supabase.from('messages').insert({
      tenant_id:       tenantId,
      conversation_id: fmConvId,
      whatsapp_msg_id: msgId,
      direction:       'outbound',
      sender_name:     null,
      content:         messageText,
      media_type:      detectedMediaType,
      media_url:       null,
      created_at:      msgTimestamp,
      ...(fmQuoted ? { quoted_content: fmQuoted } : {}),
    }).select('id').single();
    console.log('[WEBHOOK][MESSAGES_UPSERT] fromMe: mensagem do celular físico salva', msgId, 'mediaType=', detectedMediaType);
    if (isMedia && fmSavedMsg) {
      fetchMedia({ inst, instance, msgData, isPtt, isAudio, isImage, isVideo, isDocument, savedMsgId: fmSavedMsg.id });
    }
    // Celular físico (DEDUP 1 e 2 não pegaram) → marca conversa como Automação
    if (fmSavedMsg) {
      await supabase.from('conversations')
        .update({ status: 'automacao', status_v2: 'automacao' })
        .eq('id', fmConvId)
        .neq('status', 'finalizado');
    }
    return;
  }

  // ── Detecção de menção a agente ───────────────────────────────────────────

  const mentionedAgent = extractMentionedAgent(messageText);
  const isMentionToBot = mentionedAgent !== null;

  // ── Contato remetente + whatsapp_messages ─────────────────────────────────

  let wMsg: { id: string } | null = null;
  let groupId: string | null      = null;

  if (senderJid) {
    let senderContactId: string;
    try {
      senderContactId = await upsertContact({ tenantId, jid: senderJid, displayName: pushName });
    } catch (err) {
      console.error('[WEBHOOK] falha ao criar contato, mensagem ignorada no novo schema:', (err as Error).message);
      senderContactId = '';
    }

    let pvContactId: string | null = null;

    if (isGroup) {
      groupId = await upsertGroup({ tenantId, jid: chatId, groupName: chatId, overwriteName: false });
    } else {
      pvContactId = senderContactId;
    }

    if (senderContactId) {
      const { data: inserted, error: wMsgErr } = await supabase
        .from('whatsapp_messages')
        .insert({
          tenant_id:            tenantId,
          evolution_message_id: msgId,
          group_id:             groupId,
          contact_id:           pvContactId,
          sender_contact_id:    senderContactId,
          direction:            'inbound',
          message_type:         detectedMediaType || 'text',
          content:              messageText || null,
          is_mention_to_bot:    isMentionToBot,
          mentioned_agent:      mentionedAgent,
          ts:                   msgTimestamp,
        })
        .select('id')
        .single();

      if (wMsgErr) {
        console.error('[WEBHOOK] falha whatsapp_messages:', wMsgErr.message);
      } else {
        wMsg = inserted;
        console.log('[WEBHOOK] whatsapp_messages id=', wMsg?.id, 'mencao=', mentionedAgent);
      }
    }
  } else {
    console.log('[WEBHOOK] mensagem de sistema de grupo, ignorando whatsapp_messages');
  }

  // ── Backward compat: conversations + messages ─────────────────────────────

  const convId = await upsertConversation({
    tenantId,
    instanceId: inst.id,
    chatId,
    isGroup,
    pushName,
  });

  if (convId) {
    const inQuoted = await buildQuotedContent();
    const { data: savedMsg } = await supabase
      .from('messages')
      .insert({
        tenant_id:       tenantId,
        conversation_id: convId,
        whatsapp_msg_id: msgId,
        direction:       'inbound',
        sender_name:     pushName,
        content:         messageText,
        media_type:      detectedMediaType,
        media_url:       null,
        created_at:      msgTimestamp,
        ...(inQuoted ? { quoted_content: inQuoted } : {}),
      })
      .select('id')
      .single();

    if (isMedia && savedMsg) {
      fetchMedia({ inst, instance, msgData, isPtt, isAudio, isImage, isVideo, isDocument, savedMsgId: savedMsg.id });
    }

    // Cliente respondeu enquanto equipe aguardava (em_atendimento) → Em aberto
    await supabase.from('conversations')
      .update({ status: 'atendimento_aberto', status_v2: 'in_progress' })
      .eq('id', convId)
      .eq('status', 'em_atendimento');
  }

  // ── Enfileirar invoke se há menção ────────────────────────────────────────

  if (isMentionToBot && mentionedAgent && mentionedAgent !== 'deli') {
    enqueueAgentInvoke({ mentionedAgent, tenantId, groupId, messageText, wMsgId: wMsg?.id }).catch(err => {
      console.warn('[WEBHOOK] enqueue falhou (não crítico):', err.message);
    });
  }
}

async function handleConnectionUpdate({ tenantId, instance, data }: {
  tenantId: string; instance: string; data: Record<string, unknown>;
}) {
  const state = data?.state as string; // 'open' | 'close' | 'connecting'
  if (!state) return;

  const dbStatus = state === 'open'  ? 'connected'
                 : state === 'close' ? 'disconnected' : 'connecting';

  const upd: Record<string, unknown> = {
    status:     dbStatus,
    updated_at: new Date().toISOString(),
  };
  if (state === 'open') upd.last_seen = new Date().toISOString();

  await supabase.from('evolution_instances').update(upd).eq('instance_name', instance);

  if (state === 'close') {
    await supabase.from('internal_notifications').insert({
      tenant_id:         tenantId,
      recipient_user_id: null, // broadcast para todos do tenant
      kind:              'system',
      title:             'WhatsApp desconectado',
      body:              `Instância ${instance} perdeu conexão`,
      link:              '/configuracoes',
    });
    console.log('[WEBHOOK][CONNECTION_UPDATE] desconectado, notificação criada:', instance);
  } else {
    console.log('[WEBHOOK][CONNECTION_UPDATE] instance=', instance, 'state=', state);
  }
}

async function handleMessagesUpdate({ data }: { data: unknown }) {
  const updates = Array.isArray(data) ? data : [data];
  for (const upd of updates) {
    const msgId  = (upd as Record<string, Record<string, unknown>>)?.key?.id as string;
    const status = (upd as Record<string, Record<string, unknown>>)?.update?.status as number;
    if (!msgId || status === undefined) continue;
    await supabase.from('messages')
      .update({ delivery_status: status })
      .eq('whatsapp_msg_id', msgId);
  }
  console.log('[WEBHOOK][MESSAGES_UPDATE] atualizados:', updates.length);
}

async function handleMessagesDelete({ data }: { data: Record<string, Record<string, string>> }) {
  const msgId = data?.key?.id;
  if (!msgId) return;
  await supabase.from('messages').update({
    deleted_at: new Date().toISOString(),
    content:    '🚫 Mensagem apagada',
  }).eq('whatsapp_msg_id', msgId);
  console.log('[WEBHOOK][MESSAGES_DELETE] soft-deleted:', msgId);
}

async function handleContactsUpsert({ tenantId, data }: { tenantId: string; data: unknown }) {
  const list = (Array.isArray(data) ? data : [data]).slice(0, 50);
  let ok = 0;
  for (const c of list) {
    const jid  = (c as Record<string, string>)?.id;
    const name = (c as Record<string, string>)?.name
              || (c as Record<string, string>)?.notify
              || (c as Record<string, string>)?.verifiedName
              || jid;
    if (!jid) continue;
    try { await upsertContact({ tenantId, jid, displayName: name }); ok++; }
    catch (err) { console.warn('[WEBHOOK][CONTACTS]', jid, (err as Error).message); }
  }
  console.log('[WEBHOOK][CONTACTS_UPSERT] processados:', ok, '/', list.length);
}

async function handleGroupsUpsert({ tenantId, data }: { tenantId: string; data: unknown }) {
  const list = (Array.isArray(data) ? data : [data]).slice(0, 20);
  let ok = 0;
  for (const g of list) {
    const jid  = (g as Record<string, string>)?.id;
    const name = (g as Record<string, string>)?.subject || jid;
    if (!jid) continue;
    try { await upsertGroup({ tenantId, jid, groupName: name }); ok++; }
    catch (err) { console.warn('[WEBHOOK][GROUPS]', jid, (err as Error).message); }
  }
  console.log('[WEBHOOK][GROUPS_UPSERT] processados:', ok, '/', list.length);
}

async function handleGroupUpdate({ tenantId, data }: {
  tenantId: string; data: Record<string, string>;
}) {
  const jid     = data?.id;
  const subject = data?.subject;
  if (!jid || !subject) return;
  await supabase.from('whatsapp_groups')
    .update({ group_name: subject })
    .eq('tenant_id', tenantId)
    .eq('evolution_jid', jid);
  console.log('[WEBHOOK][GROUP_UPDATE] renomeado:', jid, '->', subject);
}

async function handleGroupParticipantsUpdate({ tenantId, data }: {
  tenantId: string; data: Record<string, unknown>;
}) {
  const groupJid     = data?.id as string;
  const participants = (data?.participants as string[]) || [];
  const action       = (data?.action as string) || ''; // 'add'|'remove'|'promote'|'demote'

  if (!groupJid || !participants.length) return;

  const { data: group } = await supabase
    .from('whatsapp_groups').select('id')
    .eq('tenant_id', tenantId).eq('evolution_jid', groupJid).maybeSingle();

  if (!group) {
    console.warn('[WEBHOOK][GROUP_PARTICIPANTS] grupo não encontrado:', groupJid);
    return;
  }

  for (const pJid of participants) {
    try {
      if (action === 'add') {
        const cId = await upsertContact({ tenantId, jid: pJid, displayName: pJid.split('@')[0] });
        await supabase.from('whatsapp_group_members').upsert(
          { group_id: group.id, contact_id: cId, role_in_group: 'member', is_admin: false },
          { onConflict: 'group_id,contact_id', ignoreDuplicates: true }
        );
      } else if (action === 'remove') {
        const { data: c } = await supabase.from('whatsapp_contacts').select('id')
          .eq('tenant_id', tenantId).eq('evolution_jid', pJid).maybeSingle();
        if (c) {
          await supabase.from('whatsapp_group_members').delete()
            .eq('group_id', group.id).eq('contact_id', c.id);
        }
      } else if (action === 'promote' || action === 'demote') {
        const cId = await upsertContact({ tenantId, jid: pJid, displayName: pJid.split('@')[0] });
        await supabase.from('whatsapp_group_members')
          .update({
            role_in_group: action === 'promote' ? 'admin' : 'member',
            is_admin:      action === 'promote',
          })
          .eq('group_id', group.id).eq('contact_id', cId);
      }
    } catch (err) {
      console.warn('[WEBHOOK][GROUP_PARTICIPANTS]', action, pJid, (err as Error).message);
    }
  }
  console.log('[WEBHOOK][GROUP_PARTICIPANTS]', action, participants.length, 'membros em', groupJid);
}

async function handleSendMessage({ inst, tenantId, instance, data }: {
  inst: { id: string; evolution_url: string; api_key: string }; tenantId: string; instance: string; data: unknown;
}) {
  const msgData = Array.isArray(data) ? data[0] : data;
  if (!msgData?.key) return;

  const msgId  = msgData.key.id as string;
  const chatId = msgData.key.remoteJid as string;
  const ts = msgData.messageTimestamp
    ? new Date(Number(msgData.messageTimestamp) * 1000).toISOString()
    : new Date().toISOString();

  // Detecta tipo de mídia
  const isPtt      = !!msgData.message?.pttMessage;
  const isAudio    = isPtt || !!msgData.message?.audioMessage;
  const isImage    = !!msgData.message?.imageMessage;
  const isVideo    = !!msgData.message?.videoMessage;
  const isDocument = !!msgData.message?.documentMessage;
  const isMedia    = isAudio || isImage || isVideo || isDocument;

  let detectedMediaType: string | null = null;
  if (isAudio)         detectedMediaType = 'audio';
  else if (isImage)    detectedMediaType = 'image';
  else if (isVideo)    detectedMediaType = 'video';
  else if (isDocument) detectedMediaType = 'document';

  const messageText: string = isAudio    ? '🎵 Áudio'
    : isImage    ? (msgData.message?.imageMessage?.caption    || '🖼 Imagem')
    : isVideo    ? (msgData.message?.videoMessage?.caption    || '🎬 Vídeo')
    : isDocument ? (msgData.message?.documentMessage?.title   || '📄 Documento')
    : (msgData.message?.conversation || msgData.message?.extendedTextMessage?.text || '') as string;

  // Idempotência 1: dedup por whatsapp_msg_id
  const { data: existingById } = await supabase.from('messages').select('id')
    .eq('whatsapp_msg_id', msgId).maybeSingle();
  if (existingById) return;

  const { data: conv } = await supabase.from('conversations').select('id')
    .eq('whatsapp_chat_id', chatId).eq('instance_id', inst.id).maybeSingle();
  if (!conv) return;

  // Idempotência 2: mensagem enviada pela plataforma já salva sem whatsapp_msg_id.
  if (messageText && !isMedia) {
    const rawText = messageText.replace(/^\*[^*]+:\*\n/, '');
    const thirtySecsAgo = new Date(Date.now() - 30000).toISOString();
    const { data: existingByContent } = await supabase.from('messages').select('id')
      .eq('conversation_id', conv.id)
      .eq('direction', 'outbound')
      .eq('content', rawText)
      .is('whatsapp_msg_id', null)
      .gte('created_at', thirtySecsAgo)
      .maybeSingle();
    if (existingByContent) {
      await supabase.from('messages').update({ whatsapp_msg_id: msgId }).eq('id', existingByContent.id);
      console.log('[WEBHOOK][SEND_MESSAGE] dedup: whatsapp_msg_id atualizado em msg existente', msgId);
      return;
    }
  }

  // Mensagem enviada pelo celular físico — salva com media_type
  const { data: smSavedMsg } = await supabase.from('messages').insert({
    tenant_id:       tenantId,
    conversation_id: conv.id,
    whatsapp_msg_id: msgId,
    direction:       'outbound',
    sender_name:     null,
    content:         messageText,
    media_type:      detectedMediaType,
    media_url:       null,
    created_at:      ts,
  }).select('id').single();
  console.log('[WEBHOOK][SEND_MESSAGE] outbound salvo:', msgId, 'mediaType=', detectedMediaType);
  if (isMedia && smSavedMsg && instance) {
    fetchMedia({ inst, instance, msgData, isPtt, isAudio, isImage, isVideo, isDocument, savedMsgId: smSavedMsg.id });
  }
}

async function handleChatsUpdate({ inst, data }: {
  inst: { id: string }; data: unknown;
}) {
  const chats = Array.isArray(data) ? data : [data];
  let archived = 0;
  for (const chat of chats) {
    const jid = (chat as Record<string, unknown>)?.id as string;
    if (!jid || (chat as Record<string, unknown>)?.archived !== true) continue;
    await supabase.from('conversations')
      .update({ status_v2: 'archived' })
      .eq('whatsapp_chat_id', jid)
      .eq('instance_id', inst.id);
    archived++;
  }
  if (archived > 0) console.log('[WEBHOOK][CHATS_UPDATE] arquivados:', archived);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function upsertContact({ tenantId, jid, displayName }: {
  tenantId: string; jid: string; displayName: string;
}): Promise<string> {
  const { data, error } = await supabase
    .from('whatsapp_contacts')
    .upsert(
      { tenant_id: tenantId, evolution_jid: jid, display_name: displayName },
      { onConflict: 'tenant_id,evolution_jid', ignoreDuplicates: false }
    )
    .select('id')
    .single();

  if (error || !data) {
    console.error('[WEBHOOK] upsertContact upsert falhou | msg:', error?.message, '| code:', error?.code, '| details:', error?.details, '| hint:', error?.hint, '| tenantId:', tenantId, '| jid:', jid);
    const { data: existing, error: fetchErr } = await supabase
      .from('whatsapp_contacts')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('evolution_jid', jid)
      .single();
    if (fetchErr) console.error('[WEBHOOK] upsertContact fallback também falhou:', fetchErr?.message, '| code:', fetchErr?.code);
    if (!existing?.id) throw new Error(`upsertContact falhou para JID: ${jid}`);
    return existing.id;
  }
  return data.id;
}

async function upsertGroup({ tenantId, jid, groupName, overwriteName = true }: {
  tenantId: string; jid: string; groupName: string; overwriteName?: boolean;
}): Promise<string> {
  const { data, error } = await supabase
    .from('whatsapp_groups')
    .upsert(
      { tenant_id: tenantId, evolution_jid: jid, group_name: groupName },
      { onConflict: 'tenant_id,evolution_jid', ignoreDuplicates: !overwriteName }
    )
    .select('id')
    .single();

  if (error || !data) {
    console.error('[WEBHOOK] upsertGroup upsert falhou | msg:', error?.message, '| code:', error?.code, '| details:', error?.details, '| hint:', error?.hint, '| tenantId:', tenantId, '| jid:', jid);
    const { data: existing, error: fetchErr } = await supabase
      .from('whatsapp_groups')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('evolution_jid', jid)
      .single();
    if (fetchErr) console.error('[WEBHOOK] upsertGroup fallback também falhou:', fetchErr?.message, '| code:', fetchErr?.code);
    if (!existing?.id) throw new Error(`upsertGroup falhou para JID: ${jid}`);
    return existing.id;
  }

  // Quando temos o nome real, sincroniza com conversations.group_name
  if (overwriteName) {
    await supabase.from('conversations')
      .update({ group_name: groupName, is_group: true })
      .eq('tenant_id', tenantId)
      .eq('whatsapp_chat_id', jid);
  }

  return data.id;
}

async function upsertConversation({ tenantId, instanceId, chatId, isGroup, pushName }: {
  tenantId: string; instanceId: string; chatId: string; isGroup: boolean; pushName: string;
}): Promise<string | null> {
  const { data: existing } = await supabase
    .from('conversations')
    .select('id, status, status_v2, is_group')
    .eq('whatsapp_chat_id', chatId)
    .eq('instance_id', instanceId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) {
    const upd: Record<string, string | boolean | null> = { updated_at: new Date().toISOString(), tenant_id: tenantId };
    if (!isGroup && pushName && pushName !== 'Desconhecido') upd.push_name = pushName;
    if (isGroup && !existing.is_group) upd.is_group = true;
    // Reabrir conversa finalizada quando nova mensagem inbound chega (Regra A)
    // Limpa assigned_to para que qualquer atendente possa assumir (sem dono automático)
    if (existing.status === 'finalizado' || existing.status_v2 === 'closed') {
      upd.status      = 'aguardando';
      upd.status_v2   = 'open';
      upd.reopened_at = new Date().toISOString();
      upd.assigned_to = null;
    }
    await supabase.from('conversations').update(upd).eq('id', existing.id);
    return existing.id;
  }

  const validPushName = pushName && pushName !== 'Desconhecido' ? pushName : null;
  const { data: newConv, error } = await supabase
    .from('conversations')
    .insert({
      tenant_id:        tenantId,
      instance_id:      instanceId,
      whatsapp_chat_id: chatId,
      is_group:         isGroup,
      group_name:       isGroup ? chatId.split('@')[0] : null,
      push_name:        isGroup ? null : validPushName,
      status:           'aguardando',
    })
    .select('id')
    .single();

  if (error) {
    console.error('[WEBHOOK] upsertConversation erro:', error.message);
    return null;
  }
  return newConv?.id ?? null;
}

// Fire-and-forget: busca mídia sem bloquear a resposta principal
function fetchMedia({ inst, instance, msgData, isPtt, isAudio, isImage, isVideo, isDocument, savedMsgId }: {
  inst: { evolution_url: string; api_key: string };
  instance: string;
  msgData: Record<string, unknown>;
  isPtt: boolean; isAudio: boolean; isImage: boolean; isVideo: boolean; isDocument: boolean;
  savedMsgId: string;
}) {
  let messageType = '';
  if (isPtt)           messageType = 'pttMessage';
  else if (isAudio)    messageType = 'audioMessage';
  else if (isImage)    messageType = 'imageMessage';
  else if (isVideo)    messageType = 'videoMessage';
  else if (isDocument) messageType = 'documentMessage';

  const controller = new AbortController();
  const timer      = setTimeout(() => controller.abort(), 10_000);

  fetch(`${inst.evolution_url}/chat/getBase64FromMediaMessage/${instance}`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', apikey: inst.api_key },
    body:    JSON.stringify({ message: { key: (msgData as Record<string, unknown>).key, messageType }, convertToMp4: false }),
    signal:  controller.signal,
  })
    .then(r => r.ok ? r.json() : null)
    .then(async (mediaJson) => {
      clearTimeout(timer);
      if (!mediaJson) return;
      const base64 = mediaJson.base64 || mediaJson.data;
      if (!base64) return;
      const msgObj   = (msgData as Record<string, Record<string, unknown>>).message || {};
      const mediaMsg = msgObj.pttMessage || msgObj.audioMessage || msgObj.imageMessage || msgObj.videoMessage || msgObj.documentMessage || {};
      const defaultMime = isImage ? 'image/jpeg' : isVideo ? 'video/mp4' : isDocument ? 'application/octet-stream' : 'audio/ogg';
      const mime = ((mediaMsg as Record<string, string>).mimetype || defaultMime).split(';')[0].trim();
      await supabase.from('messages').update({ media_url: `data:${mime};base64,${base64}` }).eq('id', savedMsgId);
    })
    .catch(() => { clearTimeout(timer); });
}

// Fire-and-forget: enfileira invoke do agente mencionado no Bridge Server
async function enqueueAgentInvoke({ mentionedAgent, tenantId, groupId, messageText, wMsgId }: {
  mentionedAgent: string; tenantId: string; groupId: string | null;
  messageText: string; wMsgId: string | undefined;
}) {
  if (!BRIDGE_URL || !BRIDGE_SECRET) return;

  const res = await fetch(`${BRIDGE_URL}/analise`, {
    method:  'POST',
    headers: {
      'Content-Type':    'application/json',
      'x-bridge-secret': BRIDGE_SECRET,
    },
    body: JSON.stringify({
      job_id:          `wh-${wMsgId || crypto.randomUUID()}`,
      cliente_nome:    '',
      drive_link:      '',
      periodo:         'on_demand',
      tenant_id:       tenantId,
      trigger_source:  'whatsapp_mention',
      mentioned_agent: mentionedAgent,
      group_id:        groupId,
      message_text:    messageText,
    }),
  });

  if (!res.ok) console.warn('[WEBHOOK] enqueueAgentInvoke status:', res.status);
  else         console.log('[WEBHOOK] agente enfileirado:', mentionedAgent);
}
