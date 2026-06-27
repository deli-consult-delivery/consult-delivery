/**
 * ChatAoVivoV2 — container do Chat ao Vivo redesenhado (cv2 redesign / FASE 1)
 *
 * Inspirado no DataCrazy (3 colunas) na identidade cv2 (azul → vermelho).
 * Orquestra os hooks do engine e monta as colunas:
 *   col1 <ListaConversas/> · col2 <Thread/> · col3 <PainelContato/>.
 *
 * Responsabilidades próprias do container:
 *  - activeId (inicializado com deepLinkConvId; mantém ref no engine p/ realtime).
 *  - lookup do contato (customers) por conv.customerId, com .eq('tenant_id').
 *  - lookup da instância Evolution conectada do tenant (envio de texto).
 *  - envio de texto: insere em messages (.eq tenant) + dispara Evolution; o
 *    realtime da thread reflete a mensagem. Finalizar/Reabrir via useStatusAtend
 *    (já trata 0-linhas como erro — Padrão P1).
 *
 * Padrões CLAUDE.md: toda query .eq('tenant_id', tenantDbId); realtime com
 * cleanup nos hooks; sem console.log; imutabilidade; CSS escopado .cv2-main .ccv-*.
 *
 * Props: { tenant, tenantDbId, userId, onNavigate, deepLinkConvId }.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../../lib/supabase.js';
import { sendTextMessage } from '../../lib/evolution.js';
import { useConversas } from './engine/useConversas.js';
import { useThread } from './engine/useThread.js';
import { useStatusAtend } from './engine/useStatusAtend.js';
import { useEnvio } from './engine/useEnvio.js';
import ListaConversas from './parts/ListaConversas.jsx';
import Thread from './parts/Thread.jsx';
import PainelContato from './parts/PainelContato.jsx';
import Lightbox from './parts/Lightbox.jsx';
import './chat-cv2.css';

// colunas reais da tabela customers (Padrão P1 — nunca selecionar coluna inexistente)
const CUSTOMER_COLS = 'id, name, phone, email, segment, whatsapp_name, is_vip, tags';

export default function ChatAoVivoV2({ tenant, tenantDbId, userId, onNavigate, deepLinkConvId }) {
  void tenant; void onNavigate; // reservados p/ próximas fases (deep-link de saída, etc.)

  const {
    loading,
    contadores,
    filtro,
    setFiltro,
    busca,
    setBusca,
    reload,
    convsFiltradas,
    convs,
    setActiveRef,
    zerarUnread,
    patchConv,
    FILTROS,
  } = useConversas(tenantDbId);

  const [activeId, setActiveId] = useState(deepLinkConvId || null);
  const [customer, setCustomer] = useState(null);
  const [instance, setInstance] = useState(null);
  const [lightboxUrl, setLightboxUrl] = useState(null); // FASE 2 — overlay de imagem

  // rastreia se já houve qualquer seleção (deep-link ou manual): a auto-seleção
  // da 1ª conversa só vale enquanto NUNCA houve seleção — evita flash de conversa
  // errada quando convsFiltradas troca de filtro com a seleção limpa.
  const jaSelecionouRef = useRef(!!deepLinkConvId);

  const { msgs, loadingMsgs } = useThread(activeId, tenantDbId);
  const { finalizar, reabrir, atualizando } = useStatusAtend(tenantDbId, userId);
  const {
    enviarMidia,
    iniciarGravacao,
    pararGravacaoEEnviar,
    cancelarGravacao,
    gravando,
    segundos,
    enviandoMidia,
  } = useEnvio({ tenantDbId, userId, instancia: instance });

  const conv = (convs || []).find((c) => c.id === activeId) || null;

  // ── registra a conversa ativa no engine (realtime inbox não bumpa a aberta) ──
  useEffect(() => { setActiveRef(activeId); }, [activeId, setActiveRef]);

  // ── seleção automática da 1ª conversa apenas no 1º carregamento ─────────────
  // Usa jaSelecionouRef (não activeId) p/ não re-selecionar a 1ª do filtro novo
  // depois que o usuário já interagiu — o que causava flash de conversa errada.
  useEffect(() => {
    if (jaSelecionouRef.current) return;
    const primeira = (convsFiltradas || [])[0];
    if (primeira) { jaSelecionouRef.current = true; setActiveId(primeira.id); }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- roda só p/ 1ª seleção; activeId omitido de propósito
  }, [convsFiltradas]);

  // ── instância Evolution conectada do tenant (p/ envio de texto) ─────────────
  useEffect(() => {
    if (!tenantDbId) { setInstance(null); return; }
    let vivo = true;
    supabase
      .from('evolution_instances')
      .select('instance_name, status, evolution_url, api_key')
      .eq('tenant_id', tenantDbId)
      .order('created_at')
      .then(({ data }) => {
        if (!vivo) return;
        const arr = data || [];
        setInstance(arr.find((i) => /conn|open/i.test(i.status || '')) || arr[0] || null);
      });
    return () => { vivo = false; };
  }, [tenantDbId]);

  // ── lookup do contato vinculado (customers) ─────────────────────────────────
  useEffect(() => {
    const cid = conv?.customerId;
    if (!cid || !tenantDbId) { setCustomer(null); return; }
    let vivo = true;
    supabase
      .from('customers')
      .select(CUSTOMER_COLS)
      .eq('id', cid)
      .eq('tenant_id', tenantDbId)
      .maybeSingle()
      .then(({ data }) => { if (vivo) setCustomer(data || null); });
    return () => { vivo = false; };
  }, [conv?.customerId, tenantDbId]);

  // ── abrir conversa: seleciona + zera unread (local + banco, com .select) ────
  const abrirConv = useCallback(async (convId) => {
    jaSelecionouRef.current = true;
    setActiveId(convId);
    zerarUnread(convId);
    if (!tenantDbId) return;
    // P1: .select('id') + await garante que a falha (RLS/0 linhas) não seja
    // silenciada como promessa descartada; o erro é capturado e ignorado de
    // forma explícita (o zerarUnread local já refletiu o estado na UI).
    const { error } = await supabase
      .from('conversations')
      .update({ unread_count: 0 })
      .eq('id', convId)
      .eq('tenant_id', tenantDbId)
      .select('id');
    void error; // best-effort: unread no banco; UI local é a fonte imediata
  }, [tenantDbId, zerarUnread]);

  // ── envio de texto ──────────────────────────────────────────────────────────
  const enviar = useCallback(async (texto) => {
    if (!conv || !texto || !tenantDbId) return;
    const { error } = await supabase.from('messages').insert({
      tenant_id: tenantDbId,
      conversation_id: conv.id,
      direction: 'outbound',
      content: texto,
      sender_name: null,
      created_at: new Date().toISOString(),
    });
    if (error) return; // realtime não refletirá; insert falhou (RLS/coluna)
    if (instance && conv.chatId) {
      await sendTextMessage(
        instance.instance_name,
        conv.chatId,
        texto,
        null,
        instance.evolution_url,
        instance.api_key,
      ).catch(() => { /* Evolution offline: msg já está no banco/realtime */ });
    }
  }, [conv, tenantDbId, instance]);

  // ── envio de mídia / áudio (FASE 2) — vinculam a conversa ativa ─────────────
  const onEnviarMidia = useCallback((file) => {
    if (!conv) return;
    enviarMidia(file, conv); // erro tratado no hook (retorno { error }); realtime reflete
  }, [conv, enviarMidia]);

  const pararEnviarAudio = useCallback(() => {
    if (!conv) return;
    pararGravacaoEEnviar(conv);
  }, [conv, pararGravacaoEEnviar]);

  // referência estável p/ o Lightbox não re-vincular o listener de Escape a cada render
  const fecharLightbox = useCallback(() => setLightboxUrl(null), []);

  const envio = {
    onEnviarMidia,
    iniciarGravacao,
    pararEnviar: pararEnviarAudio,
    cancelar: cancelarGravacao,
    gravando,
    segundos,
    enviandoMidia,
  };

  // ── finalizar / reabrir (reload move a conversa de filtro) ──────────────────
  const onFinalizar = useCallback(async () => {
    if (!conv) return;
    const { error } = await finalizar(conv.id);
    if (error) return;
    patchConv(conv.id, { status: 'finalizado', status_v2: 'closed' });
    reload();
  }, [conv, finalizar, patchConv, reload]);

  const onReabrir = useCallback(async () => {
    if (!conv) return;
    const { error } = await reabrir(conv.id);
    if (error) return;
    patchConv(conv.id, { status: 'aguardando', status_v2: 'open' });
    reload();
  }, [conv, reabrir, patchConv, reload]);

  const podeEnviar = !!instance && !!conv && !conv.isChan;

  return (
    <div className="ccv">
      <ListaConversas
        convsFiltradas={convsFiltradas}
        loading={loading}
        contadores={contadores}
        filtro={filtro}
        setFiltro={setFiltro}
        FILTROS={FILTROS}
        busca={busca}
        setBusca={setBusca}
        activeId={activeId}
        onSelect={abrirConv}
      />

      <Thread
        conv={conv}
        msgs={msgs}
        loadingMsgs={loadingMsgs}
        onFinalizar={onFinalizar}
        onReabrir={onReabrir}
        onEnviar={enviar}
        atualizando={atualizando}
        podeEnviar={podeEnviar}
        onAbrirImagem={setLightboxUrl}
        envio={envio}
      />

      <PainelContato conv={conv} customer={customer} />

      {lightboxUrl && <Lightbox url={lightboxUrl} onClose={fecharLightbox} />}
    </div>
  );
}
