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

const BRIDGE_URL    = Deno.env.get('BRIDGE_SERVER_URL') || 'http://187.127.25.24:3001';
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
  const isSticker  = !!msgData.message?.stickerMessage;
  const isMedia    = isAudio || isImage || isVideo || isDocument || isSticker;

  // ── Reação de emoji WhatsApp ──────────────────────────────────────────────
  const reactionMsg = (msgData.message as Record<string, unknown>)?.reactionMessage as Record<string, unknown> | undefined;
  if (reactionMsg) {
    const origMsgId    = (reactionMsg.key as Record<string, string>)?.id;
    const reactionText = (reactionMsg.text as string) ?? '';
    const reactorJid   = isGroup ? (senderJid ?? chatId) : chatId;
    if (origMsgId) {
      const { data: origMsg } = await supabase
        .from('messages')
        .select('id, reactions')
        .eq('whatsapp_msg_id', origMsgId)
        .maybeSingle();
      if (origMsg) {
        const existing = (origMsg.reactions as Array<{ jid: string; emoji: string; name: string }>) || [];
        const filtered = existing.filter((r: { jid: string }) => r.jid !== reactorJid);
        if (reactionText) filtered.push({ jid: reactorJid, emoji: reactionText, name: pushName });
        await supabase.from('messages').update({ reactions: filtered }).eq('id', origMsg.id);
        console.log('[WEBHOOK] reação atualizada:', reactionText || '(removida)', 'em', origMsgId);
      }
    }
    return; // não processa reação como mensagem normal
  }

  let detectedMediaType: string | null = null;
  if (isAudio)         detectedMediaType = 'audio';
  else if (isImage)    detectedMediaType = 'image';
  else if (isVideo)    detectedMediaType = 'video';
  else if (isDocument) detectedMediaType = 'document';
  else if (isSticker)  detectedMediaType = 'sticker';

  const messageText: string = isAudio    ? '🎵 Áudio'
    : isImage    ? (msgData.message?.imageMessage?.caption    || '🖼 Imagem')
    : isVideo    ? (msgData.message?.videoMessage?.caption    || '🎬 Vídeo')
    : isDocument ? (msgData.message?.documentMessage?.title   || '📄 Documento')
    : isSticker  ? '🔖 Figurinha'
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
      fetchMedia({ inst, instance, msgData, isPtt, isAudio, isImage, isVideo, isDocument, isSticker, savedMsgId: fmSavedMsg.id });
    }
    // Celular físico (DEDUP 1 e 2 não pegaram) → marca conversa como Automação
    // (inclui finalizado: se alguém respondeu pelo celular, conv não está mais finalizada)
    if (fmSavedMsg) {
      await supabase.from('conversations')
        .update({ status: 'automacao', status_v2: 'automacao' })
        .eq('id', fmConvId);
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

  // Dedup inbound: Evolution API pode disparar o webhook múltiplas vezes para a
  // mesma mensagem. Checa antes do upsertConversation para evitar processamento desnecessário.
  {
    const { data: alreadySaved } = await supabase.from('messages').select('id')
      .eq('whatsapp_msg_id', msgId).maybeSingle();
    if (alreadySaved) {
      console.log('[WEBHOOK][DEDUP] mensagem inbound já salva, ignorando', msgId);
      return;
    }
  }

  const convId = await upsertConversation({
    tenantId,
    instanceId: inst.id,
    chatId,
    isGroup,
    pushName,
  });

  let savedMsg: { id: string } | null = null;

  if (convId) {
    const inQuoted = await buildQuotedContent();
    const { data: upsertedMsg, error: saveErr } = await supabase
      .from('messages')
      .upsert({
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
      }, { onConflict: 'whatsapp_msg_id', ignoreDuplicates: true })
      .select('id')
      .single();
    if (saveErr) console.error('[WEBHOOK] falha ao salvar mensagem inbound em messages:', saveErr.message);
    savedMsg = upsertedMsg;

    if (isMedia && savedMsg) {
      fetchMedia({ inst, instance, msgData, isPtt, isAudio, isImage, isVideo, isDocument, isSticker, savedMsgId: savedMsg.id });
    }

    // Cliente respondeu enquanto equipe aguardava (em_atendimento) → Em aberto
    await supabase.from('conversations')
      .update({ status: 'atendimento_aberto', status_v2: 'in_progress' })
      .eq('id', convId)
      .eq('status', 'em_atendimento');
  }

  // ── F3 Onda07: Revisão cliente pós-conclusão ─────────────────────────────────
  if (!isGroup && messageText && !isMedia) {
    const senderNumF3    = chatId.replace(/@[^@]*$/, '');
    const okMatchF3      = messageText.match(/^(OK|✅)\s+(\d+)/i);
    const ajustarMatchF3 = messageText.match(/^(AJUSTAR|❌)\s+(\d+)[:\-]\s*(.+)/i);

    if (okMatchF3 || ajustarMatchF3) {
      const n = parseInt((okMatchF3 ?? ajustarMatchF3)![2], 10);
      try {
        const { data: clientAnalises } = await supabase
          .from('analises')
          .select('id')
          .eq('tenant_id', tenantId)
          .eq('numero_whatsapp_cliente', senderNumF3);

        const analiseIds = (clientAnalises ?? []).map((a: { id: string }) => a.id);

        if (analiseIds.length > 0) {
          const { data: pendentes } = await supabase
            .from('tarefas_loja')
            .select('id, titulo')
            .in('analise_id', analiseIds)
            .eq('revisao_status', 'aguardando')
            .order('aguarda_revisao_em', { ascending: true })
            .limit(50);

          const tarefa = ((pendentes ?? []) as { id: string; titulo: string }[])[n - 1];

          if (tarefa) {
            const tipo   = okMatchF3 ? 'aprovacao' : 'recusa';
            const motivo = ajustarMatchF3 ? ajustarMatchF3[3].trim() : null;

            await fetch(`${BRIDGE_URL}/api/tarefas/${tarefa.id}/revisar`, {
              method:  'POST',
              headers: { 'Content-Type': 'application/json', 'x-bridge-secret': BRIDGE_SECRET },
              body:    JSON.stringify({ tipo, motivo }),
              signal:  AbortSignal.timeout(10_000),
            }).catch(e => console.warn('[F3] revisar falhou:', (e as Error).message));

            const replyTxt = tipo === 'aprovacao'
              ? `✅ Revisão aprovada! Tarefa: ${tarefa.titulo}`
              : `📋 Ajuste solicitado para: ${tarefa.titulo}. O consultor foi notificado.`;

            if (inst) {
              await evoSendText(inst, instance, chatId, replyTxt).catch(e =>
                console.warn('[F3] reply WhatsApp falhou:', (e as Error).message)
              );
            }

            return;
          }
        }
      } catch (f3Err) {
        console.warn('[F3] parser erro (não crítico):', (f3Err as Error).message);
      }
    }
  }

  // ── T6: Respostas de clientes com sessão de aprovação WhatsApp ativa ─────────

  if (!isGroup && messageText && !isMedia) {
    const senderNum = chatId.replace(/@[^@]*$/, '');
    const { data: t6Sessao } = await supabase
      .from('whatsapp_aprovacao_sessions')
      .select('id, analise_id, loja_id')
      .eq('numero_destino', senderNum)
      .eq('status', 'ativa')
      .limit(1)
      .maybeSingle();

    if (t6Sessao) {
      await handleAprovacaoSession({
        inst, instance, tenantId, senderNum, messageText,
        sessao: t6Sessao as { id: string; analise_id: string; loja_id: string },
      }).catch(err => {
        console.error('[T6] handleAprovacaoSession falhou:', (err as Error).message);
      });
      return;
    }
  }

  // ── Bot: resposta automática fora do horário (somente PV, não grupos) ───────

  // AWAIT (não fire-and-forget) — Deno Edge Runtime cancela tasks pendentes
  // após Response retornar, e isso fazia o INSERT do bot nunca persistir,
  // causando o bot a responder de novo na próxima mensagem do cliente.
  if (!isGroup && convId) {
    await checkAndSendBotResponse({ inst, tenantId, instance, chatId, convId }).catch(err => {
      console.warn('[BOT] checkAndSendBotResponse falhou (não crítico):', err.message);
    });
  }

  // ── BRENO: atendimento automático em PV (somente inbound, sem menção) ────────

  if (!isGroup && convId && savedMsg && messageText && !isMentionToBot) {
    triggerBrenoIfNeeded({
      tenantId,
      conversationId: convId,
      messageId: savedMsg.id,
      messageText,
      senderName: pushName,
      senderJid:  senderJid ?? chatId,
      instanceName: instance,
    }).catch(err => {
      console.warn('[BRENO] triggerBrenoIfNeeded falhou (não crítico):', err.message);
    });
  }

  // ── Enfileirar invoke se há menção ────────────────────────────────────────

  if (isMentionToBot && mentionedAgent) {
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
  const isSticker  = !!msgData.message?.stickerMessage;
  const isMedia    = isAudio || isImage || isVideo || isDocument || isSticker;

  let detectedMediaType: string | null = null;
  if (isAudio)         detectedMediaType = 'audio';
  else if (isImage)    detectedMediaType = 'image';
  else if (isVideo)    detectedMediaType = 'video';
  else if (isDocument) detectedMediaType = 'document';
  else if (isSticker)  detectedMediaType = 'sticker';

  const messageText: string = isAudio    ? '🎵 Áudio'
    : isImage    ? (msgData.message?.imageMessage?.caption    || '🖼 Imagem')
    : isVideo    ? (msgData.message?.videoMessage?.caption    || '🎬 Vídeo')
    : isDocument ? (msgData.message?.documentMessage?.title   || '📄 Documento')
    : isSticker  ? '🔖 Figurinha'
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
    fetchMedia({ inst, instance, msgData, isPtt, isAudio, isImage, isVideo, isDocument, isSticker, savedMsgId: smSavedMsg.id });
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
    .maybeSingle();

  if (error || !data) {
    if (error) console.error('[WEBHOOK] upsertGroup upsert falhou | msg:', error?.message, '| code:', error?.code, '| details:', error?.details, '| hint:', error?.hint, '| tenantId:', tenantId, '| jid:', jid);
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
function fetchMedia({ inst, instance, msgData, isPtt, isAudio, isImage, isVideo, isDocument, isSticker, savedMsgId }: {
  inst: { evolution_url: string; api_key: string };
  instance: string;
  msgData: Record<string, unknown>;
  isPtt: boolean; isAudio: boolean; isImage: boolean; isVideo: boolean; isDocument: boolean; isSticker: boolean;
  savedMsgId: string;
}) {
  let messageType = '';
  if (isPtt)           messageType = 'pttMessage';
  else if (isAudio)    messageType = 'audioMessage';
  else if (isImage)    messageType = 'imageMessage';
  else if (isVideo)    messageType = 'videoMessage';
  else if (isDocument) messageType = 'documentMessage';
  else if (isSticker)  messageType = 'stickerMessage';

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
      const defaultMime = isImage ? 'image/jpeg' : isVideo ? 'video/mp4' : isDocument ? 'application/octet-stream' : isSticker ? 'image/webp' : 'audio/ogg';
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

// Dispara breno-processar-webhook via Bridge Server interno (sem JWT de usuário)
async function triggerBrenoIfNeeded({ tenantId, conversationId, messageId, messageText, senderName, senderJid, instanceName }: {
  tenantId: string; conversationId: string; messageId: string; messageText: string;
  senderName: string; senderJid: string; instanceName: string;
}) {
  if (!BRIDGE_URL || !BRIDGE_SECRET) return;
  if (!messageText.trim()) return;

  const { data: conv } = await supabase
    .from('conversations')
    .select('breno_paused')
    .eq('id', conversationId)
    .maybeSingle();

  if (conv?.breno_paused) {
    console.log('[BRENO] pausado para conversa', conversationId);
    return;
  }

  const r = await fetch(`${BRIDGE_URL}/internal/agents/breno-processar-webhook/run`, {
    method:  'POST',
    headers: {
      'Content-Type':    'application/json',
      'x-bridge-secret': BRIDGE_SECRET,
    },
    body: JSON.stringify({
      tenant_id:       tenantId,
      instance_name:   instanceName,
      sender_jid:      senderJid,
      message_body:    messageText,
      message_id:      messageId,
      conversation_id: conversationId,
    }),
  });

  if (!r.ok) console.warn('[BRENO] Bridge dispatch falhou:', r.status);
  else       console.log('[BRENO] processar-webhook dispatched para conversa', conversationId);
}

// Verifica se mensagem chegou fora do horário e envia resposta automática
async function checkAndSendBotResponse({ inst, tenantId, instance, chatId, convId }: {
  inst: { evolution_url: string; api_key: string };
  tenantId: string; instance: string; chatId: string; convId: string;
}) {
  const { data: config } = await supabase
    .from('bot_configs')
    .select('is_active, schedule, message, extra_messages, respond_only_first, timezone')
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (!config?.is_active) return;

  // Determina hora local do tenant
  const tz  = (config.timezone as string) || 'America/Sao_Paulo';
  const now  = new Date();
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(now);

  const weekday = parts.find(p => p.type === 'weekday')?.value || '';
  const hour    = parseInt(parts.find(p => p.type === 'hour')?.value   || '0');
  const minute  = parseInt(parts.find(p => p.type === 'minute')?.value || '0');

  const dayMap: Record<string, string> = {
    Mon: 'mon', Tue: 'tue', Wed: 'wed', Thu: 'thu', Fri: 'fri', Sat: 'sat', Sun: 'sun',
  };
  const dayKey = dayMap[weekday] || '';
  const currentMinutes = hour * 60 + minute;

  const sched = (config.schedule as Record<string, { on: boolean; start: string; end: string }>) || {};
  const dayCfg = sched[dayKey];

  let isInsideHours = false;
  if (dayCfg?.on) {
    const [sh, sm] = (dayCfg.start || '09:00').split(':').map(Number);
    const [eh, em] = (dayCfg.end   || '18:00').split(':').map(Number);
    isInsideHours = currentMinutes >= (sh * 60 + sm) && currentMinutes < (eh * 60 + em);
  }

  // Verifica se existe um slot extra (ex: almoço) que cobre o horário atual
  type ExtraSlot = { id: string; days: string[]; start: string; end: string; message: string };
  const extraMsgs = (config.extra_messages as ExtraSlot[]) || [];
  let matchedExtra: ExtraSlot | null = null;
  for (const slot of extraMsgs) {
    if (!(slot.days || []).includes(dayKey)) continue;
    const [sh, sm] = (slot.start || '00:00').split(':').map(Number);
    const [eh, em] = (slot.end   || '00:00').split(':').map(Number);
    if (currentMinutes >= sh * 60 + sm && currentMinutes < eh * 60 + em) { matchedExtra = slot; break; }
  }

  // Dentro do horário normal E sem slot extra → silêncio
  if (!matchedExtra && isInsideHours) return;

  // Guard atômico anti-race-condition (respond_only_first=true)
  //
  // Quando cliente envia 2+ msgs em < 1s, dois invokes paralelos passariam
  // pelo SELECT de "já respondi hoje?" antes de qualquer INSERT commitar.
  // PK (conversation_id, reply_date) garante que apenas UM ganha.
  // Insert acontece ANTES do fetch para Evolution → mesmo se o worker for
  // cancelado depois, o claim persistiu e bloqueia próximas tentativas.
  let claimedDate: string | null = null;
  if (config.respond_only_first) {
    const todayStr = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(now); // YYYY-MM-DD na TZ do tenant

    const { error: claimErr } = await supabase
      .from('bot_reply_log')
      .insert({ conversation_id: convId, reply_date: todayStr, tenant_id: tenantId });

    if (claimErr) {
      // 23505 = unique_violation → outra instância já respondeu hoje
      if (claimErr.code === '23505') {
        console.log('[BOT] já respondido hoje, skip:', convId, todayStr);
      } else {
        console.warn('[BOT] erro ao claim bot_reply_log:', claimErr.code, claimErr.message);
      }
      return;
    }
    claimedDate = todayStr;
  }

  const botMessage = matchedExtra?.message || (config.message as string) || 'Estamos fora do horário de atendimento. Retornaremos em breve!';

  // Envia via Evolution API
  const r = await fetch(`${inst.evolution_url}/message/sendText/${instance}`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', apikey: inst.api_key },
    body:    JSON.stringify({ number: chatId, text: botMessage }),
  });

  if (!r.ok) {
    console.warn('[BOT] falha ao enviar resposta automática:', r.status, await r.text());
    // Rollback do claim para permitir retry na próxima msg
    if (claimedDate) {
      await supabase.from('bot_reply_log')
        .delete()
        .eq('conversation_id', convId)
        .eq('reply_date', claimedDate);
    }
    return;
  }

  // Captura ID retornado pelo Evolution → usado para dedupe do echo via webhook
  // (onConflict='whatsapp_msg_id' impede duplicação quando a msg enviada volta
  // pelo evento messages.upsert)
  const sendData = await r.json().catch(() => null);
  const sentMsgId = (sendData?.key?.id as string | undefined) ?? null;

  // Registra no banco como mensagem outbound do bot
  await supabase.from('messages').insert({
    tenant_id:       tenantId,
    conversation_id: convId,
    direction:       'outbound',
    sender_name:     'Bot',
    content:         botMessage,
    whatsapp_msg_id: sentMsgId,
    created_at:      new Date().toISOString(),
  });

  console.log('[BOT] resposta automática enviada para', chatId, '| fora do horário (', weekday, hour + ':' + String(minute).padStart(2, '0'), ')');
}

// ── T6: Envia texto via Evolution API ────────────────────────────────────────
async function evoSendText(
  inst: { evolution_url: string; api_key: string },
  instance: string,
  number: string,
  text: string,
): Promise<void> {
  try {
    const r = await fetch(`${inst.evolution_url}/message/sendText/${instance}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', apikey: inst.api_key },
      body:    JSON.stringify({ number, text }),
      signal:  AbortSignal.timeout(15_000),
    });
    if (!r.ok) console.warn('[T6] evoSendText status:', r.status);
  } catch (err) {
    console.warn('[T6] evoSendText falhou:', (err as Error).message);
  }
}

// ── T6: Parser de respostas (inline — não pode importar de trigger/) ─────────
function parseRespostaClienteLocal(texto: string): {
  aprovacoes: number[];
  bloco_aprovacoes: string[];
  aprovar_tudo: boolean;
  rejeicoes: number[];
  duvidas: Array<{ tarefa: number; pergunta: string }>;
  ambiguo: boolean;
} {
  const base = {
    aprovacoes:       [] as number[],
    bloco_aprovacoes: [] as string[],
    aprovar_tudo:     false,
    rejeicoes:        [] as number[],
    duvidas:          [] as Array<{ tarefa: number; pergunta: string }>,
    ambiguo:          false,
  };
  const t = texto.trim();
  if (!t) return { ...base, ambiguo: true };

  const norm = t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  let matched = false;

  if (/\bok\s+tudo\b/.test(norm)) { base.aprovar_tudo = true; matched = true; }

  for (const m of norm.matchAll(/\bok\s+bloco\s+([^\s,;]+)/gi)) {
    const slug = m[1].normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
      .replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    base.bloco_aprovacoes.push(slug); matched = true;
  }

  for (const m of norm.matchAll(/\b(?:ok|aprovado)\s+([\d][\d\s,]*)/gi)) {
    const rest = m[1].trim();
    if (/^tudo$/.test(rest)) continue;
    const nums = rest.split(/[\s,]+/).map(n => parseInt(n, 10)).filter(n => !isNaN(n) && n > 0);
    if (nums.length) { base.aprovacoes.push(...nums); matched = true; }
  }

  for (const m of texto.matchAll(/\bok\s+([a-zA-ZÀ-ɏ][a-zA-ZÀ-ɏ\s]*?)(?:\s*$|[,;])/gi)) {
    const raw     = m[1].trim();
    const normRaw = raw.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    if (normRaw === 'tudo' || normRaw.startsWith('bloco')) continue;
    if (/^\d[\d\s,]*$/.test(normRaw)) continue;
    const slug = normRaw.replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    if (slug && !base.bloco_aprovacoes.includes(slug)) { base.bloco_aprovacoes.push(slug); matched = true; }
  }

  for (const m of norm.matchAll(/\b(?:nao|rejeito|rejeitado)\s+([\d][\d\s,]*)/gi)) {
    const nums = m[1].split(/[\s,]+/).map(n => parseInt(n, 10)).filter(n => !isNaN(n) && n > 0);
    if (nums.length) { base.rejeicoes.push(...nums); matched = true; }
  }

  for (const m of norm.matchAll(/\bduvida\s+(\d+)\s*[:—-]\s*(.+)/gi)) {
    const tarefa = parseInt(m[1], 10);
    if (!isNaN(tarefa)) { base.duvidas.push({ tarefa, pergunta: m[2].trim() }); matched = true; }
  }

  for (const m of norm.matchAll(/\bduvida\s+(?:na|no|em)?\s*(\d+)/gi)) {
    const tarefa = parseInt(m[1], 10);
    if (!isNaN(tarefa) && !base.duvidas.some(d => d.tarefa === tarefa)) {
      base.duvidas.push({ tarefa, pergunta: '' }); matched = true;
    }
  }

  if (!matched) base.ambiguo = true;
  return base;
}

// ── T6: Processa respostas de aprovação de tarefas via WhatsApp ───────────────
async function handleAprovacaoSession({
  inst,
  instance,
  tenantId,
  senderNum,
  messageText,
  sessao,
}: {
  inst:        { evolution_url: string; api_key: string };
  instance:    string;
  tenantId:    string;
  senderNum:   string;
  messageText: string;
  sessao:      { id: string; analise_id: string; loja_id: string };
}): Promise<void> {
  const parsed = parseRespostaClienteLocal(messageText);

  if (parsed.ambiguo) {
    await evoSendText(inst, instance, senderNum, "Não entendi sua resposta. Pode repetir como 'OK 5'?");
    return;
  }

  const { data: tarefas } = await supabase
    .from('tarefas_loja')
    .select('id, bloco, titulo, status')
    .eq('analise_id', sessao.analise_id)
    .order('bloco',          { ascending: true })
    .order('ordem_no_bloco', { ascending: true })
    .limit(200);

  if (!tarefas?.length) {
    await evoSendText(inst, instance, senderNum, 'Sessão ativa mas sem tarefas encontradas. Fale com seu consultor.');
    return;
  }

  // Mapa global: número 1-indexed → tarefa
  const tarefaByNum = new Map<number, { id: string; bloco: string; titulo: string; status: string }>();
  tarefas.forEach((t, i) => tarefaByNum.set(i + 1, t));

  // Mapa bloco → ids (ordem alfabética, igual à mensagem enviada)
  const blocoIds = new Map<string, string[]>();
  for (const t of tarefas) {
    if (!blocoIds.has(t.bloco)) blocoIds.set(t.bloco, []);
    blocoIds.get(t.bloco)!.push(t.id);
  }
  const blocoOrder = [...blocoIds.keys()];

  const approvedIds = new Set<string>();
  const rejectedIds = new Set<string>();
  const responseLines: string[] = [];

  if (parsed.aprovar_tudo) {
    for (const t of tarefas) {
      if (t.status === 'aguardando_aprovacao') approvedIds.add(t.id);
    }
    responseLines.push('Recebi! Todas as tarefas aprovadas. Vou iniciar execução.');
  }

  for (const blocoSlug of parsed.bloco_aprovacoes) {
    const asNum = parseInt(blocoSlug, 10);
    let ids: string[] | undefined;
    if (!isNaN(asNum) && asNum >= 1 && asNum <= blocoOrder.length) {
      ids = blocoIds.get(blocoOrder[asNum - 1]);
    } else {
      const key = blocoOrder.find(b =>
        b.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase() === blocoSlug
      );
      if (key) ids = blocoIds.get(key);
    }
    if (ids) {
      for (const id of ids) approvedIds.add(id);
      responseLines.push(`Recebi! Bloco ${blocoSlug} aprovado. Vou iniciar execução.`);
    }
  }

  for (const num of parsed.aprovacoes) {
    const t = tarefaByNum.get(num);
    if (t) {
      approvedIds.add(t.id);
      responseLines.push(`Recebi! Tarefa ${num} aprovada. Vou iniciar execução.`);
    }
  }

  for (const num of parsed.rejeicoes) {
    const t = tarefaByNum.get(num);
    if (t) {
      rejectedIds.add(t.id);
      approvedIds.delete(t.id);
      responseLines.push(`Recebi! Tarefa ${num} rejeitada. Vou avisar o consultor.`);
    }
  }

  for (const id of approvedIds) {
    await supabase.from('tarefas_loja').update({ status: 'aprovada' }).eq('id', id);
    await supabase.from('tarefa_aprovacoes').insert({
      tarefa_id: id,
      acao:      'aprovada',
      nota:      'via WhatsApp',
    });
  }

  for (const id of rejectedIds) {
    await supabase.from('tarefas_loja').update({ status: 'rejeitada' }).eq('id', id);
    await supabase.from('tarefa_aprovacoes').insert({
      tarefa_id: id,
      acao:      'rejeitada',
      nota:      'via WhatsApp',
    });
  }

  for (const d of parsed.duvidas) {
    const t = tarefaByNum.get(d.tarefa);
    if (t) {
      await supabase.from('tarefa_aprovacoes').insert({
        tarefa_id: t.id,
        acao:      'perguntou_duvida',
        nota:      d.pergunta || messageText,
      });
      responseLines.push(`Recebi! Dúvida sobre tarefa ${d.tarefa} registrada. O consultor vai responder.`);
    }
  }

  const reply = responseLines.length
    ? responseLines.join('\n')
    : 'Recebi! Processando suas respostas.';
  await evoSendText(inst, instance, senderNum, reply);

  const total = approvedIds.size + rejectedIds.size + parsed.duvidas.length;
  if (total > 0) {
    await supabase.from('internal_notifications').insert({
      tenant_id:         tenantId,
      recipient_user_id: null,
      kind:              'agent_completed',
      title:             'Cliente respondeu análise via WhatsApp',
      body:              `${total} ação(ões) processada(s). Verifique as tarefas da loja.`,
      link:              `/lojas/${sessao.loja_id}`,
    });
  }

  console.log(`[T6] sessao=${sessao.id} aprovadas=${approvedIds.size} rejeitadas=${rejectedIds.size} duvidas=${parsed.duvidas.length}`);

  // TD#20: encerra sessão quando não há mais tarefas aguardando aprovação
  if (approvedIds.size > 0 || rejectedIds.size > 0 || parsed.aprovar_tudo) {
    const { count: restantes } = await supabase
      .from('tarefas_loja')
      .select('id', { count: 'exact', head: true })
      .eq('analise_id', sessao.analise_id)
      .eq('status', 'aguardando_aprovacao');

    if ((restantes ?? 1) === 0) {
      await supabase
        .from('whatsapp_aprovacao_sessions')
        .update({ status: 'concluida', encerrada_em: new Date().toISOString() })
        .eq('id', sessao.id);

      await evoSendText(
        inst, instance, senderNum,
        'Todas as tarefas foram processadas! Sua análise está em execução. Você receberá atualizações em breve.',
      );

      console.log(`[T6] sessao=${sessao.id} ENCERRADA status=concluida`);
    }
  }
}
