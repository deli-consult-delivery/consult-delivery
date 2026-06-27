/**
 * useAcoesMsg — engine de AÇÕES sobre a mensagem (cv2 redesign / FASE 3)
 *
 * Estende as fases 1-2 (texto / mídia / áudio) com as interações da mensagem:
 *  - reagir(msg, emoji, conv): grava a reação do operador em messages.reactions
 *    (imutável) e dispara sendReaction na Evolution;
 *  - apagar(msg, conv): marca deleted_at=now() e dispara deleteWhatsAppMessage
 *    (revoke — apaga para todos);
 *  - encaminhar(msg, convDestinoIds, convs): para cada conversa destino, insere
 *    uma nova mensagem outbound com o conteúdo/mídia original e dispara a Evolution.
 *
 * Toda a lógica é portada de ChatAoVivo.jsx (legado, já testado), adaptada aos
 * padrões do redesign: retorno { error } em vez de console.error/flash; o
 * realtime de useThread reflete os UPDATE/INSERT na UI (sem setState aqui).
 *
 * Padrões CLAUDE.md:
 *  - Toda query .eq('tenant_id', tenantDbId) + .select('id') (Padrão P1: detecta
 *    silent-fail de RLS / 0 linhas);
 *  - Evolution best-effort com .catch (offline → a mudança já está no banco);
 *  - sem console.log; imutabilidade (novo array de reações sempre).
 *
 * Assinatura:
 *   useAcoesMsg({ tenantDbId, instancia }) → {
 *     reagir(msg, emoji, conv), apagar(msg, conv), encaminhar(msg, convDestinoIds, convs)
 *   }
 */

import { useCallback } from 'react';
import { supabase } from '../../../lib/supabase.js';
import { sendReaction, deleteWhatsAppMessage, sendTextMessage, sendMediaMessage } from '../../../lib/evolution.js';

// base64 puro a partir de um data-URI (mídia salva como data:...;base64,...)
const base64Puro = (dataUri) => String(dataUri || '').split(',')[1] || '';

// file.type (MIME) embutido no data-URI → tipo de mídia da Evolution
const mimeDoDataUri = (dataUri) => {
  const m = String(dataUri || '').match(/^data:([^;]+);/);
  return m ? m[1] : '';
};

// mídia outbound (data-URI) → base64; inbound da Evolution → URL remota (https://…).
// A Evolution sendMedia aceita tanto base64 quanto URL no campo `media`, então
// para URL remota passamos a própria URL (mimetype fica vazio, deixando a Evolution inferir).
const isDataUri = (murl) => String(murl || '').startsWith('data:');
const midiaEvolution = (murl) =>
  isDataUri(murl)
    ? { media: base64Puro(murl), mime: mimeDoDataUri(murl) }
    : { media: String(murl || ''), mime: '' };

export function useAcoesMsg({ tenantDbId, instancia }) {
  // ── reagir ──────────────────────────────────────────────────────────────────
  const reagir = useCallback(async (msg, emoji, conv) => {
    if (!msg || !emoji || !conv || !tenantDbId) return { error: 'parâmetros inválidos' };
    // substitui a reação "me" anterior (imutável): remove a antiga e adiciona a nova
    const nova = [...(msg.reactions || []).filter((r) => r.jid !== 'me'), { jid: 'me', emoji, name: 'Você' }];

    const { data, error } = await supabase
      .from('messages')
      .update({ reactions: nova })
      .eq('id', msg.id)
      .eq('tenant_id', tenantDbId)
      .select('id');
    if (error) return { error: error.message };
    if (!data?.length) return { error: '0 linhas afetadas — RLS ou tenant incorreto.' };

    if (instancia && conv.chatId && msg.waId) {
      await sendReaction(instancia.instance_name, conv.chatId, msg.waId, emoji, msg.out)
        .catch(() => { /* Evolution offline: reação já gravada no banco/realtime */ });
    }
    return {};
  }, [tenantDbId, instancia]);

  // ── apagar (revoke — apaga para todos) ──────────────────────────────────────
  const apagar = useCallback(async (msg, conv) => {
    if (!msg || !conv || !tenantDbId) return { error: 'parâmetros inválidos' };

    const { data, error } = await supabase
      .from('messages')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', msg.id)
      .eq('tenant_id', tenantDbId)
      .select('id');
    if (error) return { error: error.message };
    if (!data?.length) return { error: '0 linhas afetadas — RLS ou tenant incorreto.' };

    if (instancia && conv.chatId && msg.waId) {
      await deleteWhatsAppMessage(instancia.instance_name, conv.chatId, msg.waId, msg.out)
        .catch(() => { /* Evolution offline: já marcada deleted_at no banco */ });
    }
    return {};
  }, [tenantDbId, instancia]);

  // ── encaminhar para 1+ conversas de destino ─────────────────────────────────
  const encaminhar = useCallback(async (msg, convDestinoIds, convs) => {
    if (!msg || !tenantDbId) return { error: 'parâmetros inválidos' };
    const ids = (convDestinoIds || []).filter(Boolean);
    if (!ids.length) return { error: 'Selecione ao menos uma conversa.' };

    const mapaConvs = convs || [];
    let falhas = 0;

    for (const destinoId of ids) {
      const destino = mapaConvs.find((c) => c.id === destinoId) || null;
      // INSERT da mensagem encaminhada (conteúdo/mídia original, outbound)
      const { data, error } = await supabase
        .from('messages')
        .insert({
          tenant_id: tenantDbId,
          conversation_id: destinoId,
          direction: 'outbound',
          content: msg.txt || null,
          media_type: msg.mtype || null,
          media_url: msg.murl || null,
          sender_name: null,
          created_at: new Date().toISOString(),
        })
        .select('id');
      if (error || !data?.length) { falhas += 1; continue; }

      // dispara Evolution best-effort no destino (texto ou mídia)
      if (instancia && destino?.chatId) {
        if (msg.mtype && msg.murl) {
          // data-URI → base64; URL remota (inbound) → passa a própria URL
          const { media, mime } = midiaEvolution(msg.murl);
          await sendMediaMessage(
            instancia.instance_name,
            destino.chatId,
            media,
            msg.mtype,
            mime,
            msg.txt || '',
            msg.txt || '',
          ).catch(() => { /* offline: já no banco/realtime do destino */ });
        } else if (msg.txt) {
          await sendTextMessage(
            instancia.instance_name,
            destino.chatId,
            msg.txt,
            null,
            instancia.evolution_url,
            instancia.api_key,
          ).catch(() => { /* offline: já no banco/realtime do destino */ });
        }
      }
    }

    if (falhas === ids.length) return { error: 'Falha ao encaminhar para os destinos selecionados.' };
    if (falhas > 0) return { error: `Encaminhada para ${ids.length - falhas} de ${ids.length} conversa(s).` };
    return {};
  }, [tenantDbId, instancia]);

  return { reagir, apagar, encaminhar };
}
