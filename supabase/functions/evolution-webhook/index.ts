// Supabase Edge Function — Evolution API Webhook Receiver (v2)
// Etapa 14 — grupo/PV, contatos, menção a agente, whatsapp_messages
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

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('ok', { status: 200 });

  try {
    const body = await req.json();
    const { event, instance, data } = body;

    const eventNorm = (event || '').toLowerCase().replace(/[._]/g, '');
    if (eventNorm !== 'messagesupsert') return new Response('ignored', { status: 200 });

    const msgData = Array.isArray(data) ? data[0] : data;
    if (!msgData?.key) return new Response('no_key', { status: 200 });
    if (msgData.key.fromMe) return new Response('fromMe', { status: 200 });

    // ── Dados básicos da mensagem ──────────────────────────────────────────────

    const chatId   = msgData.key.remoteJid as string;
    const isGroup  = chatId.endsWith('@g.us');
    const msgId    = msgData.key.id as string;
    const pushName = (msgData.pushName || 'Desconhecido') as string;

    // Em grupos, o remetente real fica em key.participant.
    // Se ausente (mensagem de sistema do grupo), ignora para não criar contato com JID do grupo.
    const senderJid: string | null = isGroup
      ? (msgData.key.participant || msgData.participant || null)
      : chatId;

    // ── Instância ──────────────────────────────────────────────────────────────

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

    // ── Tipo e conteúdo da mensagem ───────────────────────────────────────────

    const isPtt      = !!msgData.message?.pttMessage;
    const isAudio    = isPtt || !!msgData.message?.audioMessage;
    const isImage    = !!msgData.message?.imageMessage;
    const isVideo    = !!msgData.message?.videoMessage;
    const isDocument = !!msgData.message?.documentMessage;
    const isMedia    = isAudio || isImage || isVideo || isDocument;

    let detectedMediaType: string | null = null;
    if (isAudio)    detectedMediaType = 'audio';
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

    const msgTimestamp = msgData.messageTimestamp
      ? new Date(Number(msgData.messageTimestamp) * 1000).toISOString()
      : new Date().toISOString();

    // ── Detecção de menção a agente ───────────────────────────────────────────

    const mentionedAgent  = extractMentionedAgent(messageText);
    const isMentionToBot  = mentionedAgent !== null;

    // ── Contato remetente (whatsapp_contacts) ─────────────────────────────────
    // senderJid é null para mensagens de sistema de grupo — ignoramos whatsapp_messages

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

      // ── Grupo ou PV ────────────────────────────────────────────────────────

      let pvContactId: string | null = null;

      if (isGroup) {
        groupId = await upsertGroup({ tenantId, jid: chatId, groupName: pushName || chatId });
      } else {
        pvContactId = senderContactId;
      }

      // ── Salvar em whatsapp_messages (novo schema) ──────────────────────────

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

    // ── Salvar em conversations + messages (backward compat com UI) ───────────

    const convId = await upsertConversation({
      tenantId,
      instanceId: inst.id,
      chatId,
      isGroup,
      pushName,
    });

    if (convId) {
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
        })
        .select('id')
        .single();

      // Tenta buscar mídia (timeout 10s, não bloqueia)
      if (isMedia && savedMsg) {
        fetchMedia({ inst, instance, msgData, isPtt, isAudio, isImage, isVideo, isDocument, savedMsgId: savedMsg.id });
      }
    }

    // ── Se há menção, enfileira invocação no Bridge Server ────────────────────
    // Grupos de cliente: DELI não responde. Outros agentes são invocados normalmente.

    if (isMentionToBot && mentionedAgent && mentionedAgent !== 'deli') {
      enqueueAgentInvoke({ mentionedAgent, tenantId, groupId, messageText, wMsgId: wMsg?.id }).catch(err => {
        console.warn('[WEBHOOK] enqueue falhou (não crítico):', err.message);
      });
    }

    return new Response('ok', { status: 200 });

  } catch (err) {
    console.error('[WEBHOOK] erro não tratado:', err);
    return new Response('error', { status: 500 });
  }
});

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
    // Fallback: buscar registro existente (conflito de unicidade no upsert)
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

async function upsertGroup({ tenantId, jid, groupName }: {
  tenantId: string; jid: string; groupName: string;
}): Promise<string> {
  const { data, error } = await supabase
    .from('whatsapp_groups')
    .upsert(
      { tenant_id: tenantId, evolution_jid: jid, group_name: groupName },
      { onConflict: 'tenant_id,evolution_jid', ignoreDuplicates: false }
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
  return data.id;
}

async function upsertConversation({ tenantId, instanceId, chatId, isGroup, pushName }: {
  tenantId: string; instanceId: string; chatId: string; isGroup: boolean; pushName: string;
}): Promise<string | null> {
  const { data: existing } = await supabase
    .from('conversations')
    .select('id')
    .eq('whatsapp_chat_id', chatId)
    .eq('instance_id', instanceId)
    .maybeSingle();

  if (existing) {
    const upd: Record<string, string | null> = { updated_at: new Date().toISOString(), tenant_id: tenantId };
    if (!isGroup && pushName && pushName !== 'Desconhecido') upd.push_name = pushName;
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
      group_name:       isGroup ? (validPushName || chatId) : null,
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
      const msgObj = (msgData as Record<string, Record<string, unknown>>).message || {};
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
      job_id:        `wh-${wMsgId || crypto.randomUUID()}`,
      cliente_nome:  '',
      drive_link:    '',
      periodo:       'on_demand',
      tenant_id:     tenantId,
      trigger_source: 'whatsapp_mention',
      mentioned_agent: mentionedAgent,
      group_id:       groupId,
      message_text:   messageText,
    }),
  });

  if (!res.ok) console.warn('[WEBHOOK] enqueueAgentInvoke status:', res.status);
  else         console.log('[WEBHOOK] agente enfileirado:', mentionedAgent);
}