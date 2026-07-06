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
import { useAcoesMsg } from './engine/useAcoesMsg.js';
import { useContato } from './engine/useContato.js';
import { useFavMute } from './engine/useFavMute.js';
import { useCanaisInternos } from './engine/useCanaisInternos.js';
import { useQuickReplies } from './engine/useQuickReplies.js';
import { useBreno } from './engine/useBreno.js';
import { useEvolutionHealth } from './engine/useEvolutionHealth.js';
import { useIA } from './engine/useIA.js';
import { useTranscricao } from './engine/useTranscricao.js';
import ListaConversas from './parts/ListaConversas.jsx';
import Thread from './parts/Thread.jsx';
import PainelContato from './parts/PainelContato.jsx';
import Lightbox from './parts/Lightbox.jsx';
import './chat-cv2.css';

// colunas reais da tabela customers (Padrão P1 — nunca selecionar coluna inexistente)
const CUSTOMER_COLS = 'id, name, phone, email, segment, whatsapp_name, is_vip, tags';

export default function ChatAoVivoV2({ tenant, tenantDbId, userId, onNavigate, deepLinkConvId }) {
  void tenant; void onNavigate; // reservados p/ próximas fases (deep-link de saída, etc.)

  // deepLinkConvId chega como { convId, ts } (ts muda a cada clique → reseleciona o mesmo id)
  const dlConvId = deepLinkConvId?.convId || null;

  // activeId precede useConversas: canais internos (useCanaisInternos) dependem dele
  // e entram como extraConvs na lista combinada.
  const [activeId, setActiveId] = useState(dlConvId);

  // FASE 5 — pane mobile ('list' | 'chat' | 'contato'). No desktop o CSS ignora
  // estas classes (as 3 colunas seguem visíveis); no mobile (<=720px) escolhe
  // qual coluna mostrar. Sem listener de resize / window.innerWidth: é só CSS.
  const [mobilePane, setMobilePane] = useState('list');

  // FASE 4 — favoritos/silenciados (localStorage) + canais internos da EQUIPE
  const favMute = useFavMute();
  const { canais, chanMsgs, enviarNoCanal } = useCanaisInternos(tenantDbId, activeId, userId);
  const { quickReplies, buscarPorShortcut } = useQuickReplies(tenantDbId);

  const {
    loading,
    contadores,
    filtro,
    setFiltro,
    busca,
    setBusca,
    buscandoServer,
    reload,
    convsFiltradas,
    convs,
    setActiveRef,
    zerarUnread,
    patchConv,
    FILTROS,
  } = useConversas(tenantDbId, { extraConvs: canais, favs: favMute.favs, mutes: favMute.mutes });

  const [customer, setCustomer] = useState(null);
  const [instance, setInstance] = useState(null);
  const [lightboxUrl, setLightboxUrl] = useState(null); // FASE 2 — overlay de imagem
  const [replyTo, setReplyTo] = useState(null);   // FASE 3 — mensagem em resposta
  const [forwardMsg, setForwardMsg] = useState(null); // FASE 3 — msg no modal de encaminhar

  // rastreia se já houve qualquer seleção (deep-link ou manual): a auto-seleção
  // da 1ª conversa só vale enquanto NUNCA houve seleção — evita flash de conversa
  // errada quando convsFiltradas troca de filtro com a seleção limpa.
  const jaSelecionouRef = useRef(!!dlConvId);

  // FASE 4 (IA) — camada de IA (modo/copiloto/híbrido/IA) + transcrição/tradução.
  // Instanciadas ANTES do useThread porque seu callback de inbound usa estes hooks.
  const ia = useIA({ instancia: instance, userId });
  const transcricao = useTranscricao(activeId);

  // conv atual via ref p/ o callback de inbound (estável; não recria o canal)
  const convRef = useRef(null);

  // callback de mensagem de ENTRADA na conversa ativa (useThread) — dispara:
  //  - híbrido: gera sugestão (não envia);
  //  - ia: gera e ENVIA resposta automática (nunca em canal interno);
  //  - auto-transcrição de áudio/vídeo (respeita a flag).
  // Deps = funções estáveis (useCallback nos hooks), NÃO os objetos ia/transcricao
  // (literais a cada render → recriariam onInbound → re-subscrição do realtime).
  const onInbound = useCallback((nm) => {
    const c = convRef.current;
    if (!c || c.isChan) return; // canal interno não tem IA/transcrição de WhatsApp
    transcricao.autoTranscrever(nm);
    const modo = ia.getModo(c.id);
    if (modo === 'hibrido') {
      setTimeout(() => ia.triggerHibridoSuggestion(c), 900);
    } else if (modo === 'ia') {
      setTimeout(() => ia.triggerIaAutoReply(c), 1000);
    }
  }, [ia.getModo, ia.triggerHibridoSuggestion, ia.triggerIaAutoReply, transcricao.autoTranscrever]);

  const { msgs, loadingMsgs, loadOlderMsgs, temMais, carregandoOlder } = useThread(activeId, tenantDbId, onInbound);
  const { finalizar, reabrir, atualizando } = useStatusAtend(tenantDbId, userId);
  const { deps, transferir, transferindo } = useContato(tenantDbId);
  const {
    enviarMidia,
    iniciarGravacao,
    pararGravacaoEEnviar,
    cancelarGravacao,
    gravando,
    segundos,
    enviandoMidia,
  } = useEnvio({ tenantDbId, userId, instancia: instance });
  const { reagir, apagar, encaminhar } = useAcoesMsg({ tenantDbId, instancia: instance });

  // FASE 4 — sugestão do BRENO da conversa ativa + saúde da Evolution
  const { brenoSugestao, usarSugestao, dispensar: dispensarBreno } = useBreno(activeId, tenantDbId);
  const { evolutionOffline } = useEvolutionHealth(tenantDbId, instance);

  const conv = (convs || []).find((c) => c.id === activeId) || null;
  const isCanalAtivo = !!conv?.isChan;

  // ── IA: mantém convRef e informa a conversa ativa ao hook (aiMode da UI) ────
  useEffect(() => { convRef.current = conv; }, [conv]);
  useEffect(() => { ia.setConvAtiva(activeId); }, [activeId, ia]);

  // ── mensagens exibidas: WhatsApp (useThread) ou canal interno (useCanaisInternos) ──
  // canal interno não tem linha em `messages`; mapeia chanMsgs → msgShape.
  const msgsExibidas = isCanalAtivo
    ? (chanMsgs || []).map((m) => ({
        id: m.id,
        out: !!m.sender_id && m.sender_id === userId,
        txt: m.text || '',
        mtype: m.media_type || null,
        murl: m.media_url || null,
        who: m.sender_name || null,
        tm: m.created_at ? new Date(m.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '',
        ts: m.created_at || null,
        reactions: [],
        quoted: null,
        ds: null,
        del: false,
        waId: null,
      }))
    : msgs;

  // ── registra a conversa ativa no engine (realtime inbox não bumpa a aberta) ──
  useEffect(() => { setActiveRef(activeId); }, [activeId, setActiveRef]);

  // ── deep-link CRM/busca global: convId que chega DEPOIS do mount (chat já aberto)
  // também seleciona a conversa. Sem isto, só o convId inicial era honrado.
  useEffect(() => {
    if (!dlConvId) return;
    jaSelecionouRef.current = true;
    setActiveId(dlConvId);
    setMobilePane('chat'); // FASE 5 — deep-link pós-mount precisa trocar p/ a thread no mobile
    // dep no objeto (não no id): clicar 2x na mesma conversa muda o ts e redispara.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deepLinkConvId]);

  // ── seleção automática da 1ª conversa apenas no 1º carregamento ─────────────
  // Usa jaSelecionouRef (não activeId) p/ não re-selecionar a 1ª do filtro novo
  // depois que o usuário já interagiu — o que causava flash de conversa errada.
  useEffect(() => {
    if (jaSelecionouRef.current) return;
    const primeira = (convsFiltradas || [])[0];
    if (primeira) { jaSelecionouRef.current = true; setActiveId(primeira.id); }
  }, [convsFiltradas]);

  // ── instância Evolution conectada do tenant (p/ envio de texto) ─────────────
  useEffect(() => {
    if (!tenantDbId) { setInstance(null); return; }
    let vivo = true;
    supabase
      .from('evolution_instances')
      .select('instance_name, status')
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
    setMobilePane('chat');  // FASE 5 — no mobile, abrir conversa troca p/ a thread
    setReplyTo(null);      // troca de conversa encerra resposta/encaminhamento pendentes
    setForwardMsg(null);
    zerarUnread(convId);
    // canais internos (chan-) não vivem em `conversations` (id é uuid) → pular o UPDATE
    if (!tenantDbId || (typeof convId === 'string' && convId.startsWith('chan-'))) return;
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

  // ── BRENO p/ o composer: onUsar retorna o texto (Composer preenche o draft) ──
  // usarSugestao() (do hook) chama onUsar(text)+dispensar; aqui montamos o objeto
  // que o Composer consome: onUsar retorna a sugestão e dispensa em seguida.
  const brenoComposer = brenoSugestao
    ? {
        sugestao: brenoSugestao,
        onUsar: () => { const t = brenoSugestao.breno_response || ''; dispensarBreno(); return t; },
        onDispensar: dispensarBreno,
      }
    : null;
  void usarSugestao; // exposto pelo hook; a UI usa o onUsar do brenoComposer

  // ── envio de texto (FASE 3: inclui quoted_content quando há replyTo) ────────
  // Canal interno: roteia p/ enviarNoCanal (sem Evolution/messages).
  const enviar = useCallback(async (texto) => {
    if (!conv || !texto || !tenantDbId) return;
    if (conv.isChan) { enviarNoCanal(texto); return; }
    const quoting = replyTo; // captura a resposta ativa antes de limpar
    const quotedContent = quoting
      ? { waMsgId: quoting.waId, from: quoting.out ? 'out' : 'in', text: quoting.txt || '', mediaType: quoting.mtype || undefined }
      : null;
    setReplyTo(null); // limpa a barra de resposta imediatamente
    const { error } = await supabase.from('messages').insert({
      tenant_id: tenantDbId,
      conversation_id: conv.id,
      direction: 'outbound',
      content: texto,
      sender_name: null,
      quoted_content: quotedContent,
      created_at: new Date().toISOString(),
    });
    if (error) return; // realtime não refletirá; insert falhou (RLS/coluna)
    if (instance && conv.chatId) {
      const evoQ = quoting?.waId
        ? { key: { id: quoting.waId, fromMe: quoting.out, remoteJid: conv.chatId }, message: { conversation: quoting.txt || '' } }
        : null;
      await sendTextMessage(
        instance.instance_name,
        conv.chatId,
        texto,
        evoQ,
      ).catch(() => { /* Evolution offline: msg já está no banco/realtime */ });
    }
  }, [conv, tenantDbId, instance, replyTo, enviarNoCanal]);

  // ── envio de mídia / áudio (FASE 2) — vinculam a conversa ativa ─────────────
  const onEnviarMidia = useCallback((file) => {
    if (!conv) return;
    setReplyTo(null); // mídia encerra a resposta ativa (sem quoted em mídia, como no legado)
    enviarMidia(file, conv); // erro tratado no hook (retorno { error }); realtime reflete
  }, [conv, enviarMidia]);

  const pararEnviarAudio = useCallback(() => {
    if (!conv) return;
    pararGravacaoEEnviar(conv);
  }, [conv, pararGravacaoEEnviar]);

  // referência estável p/ o Lightbox não re-vincular o listener de Escape a cada render
  const fecharLightbox = useCallback(() => setLightboxUrl(null), []);

  // ── ações de mensagem (FASE 3) — reply / reagir / apagar / encaminhar ───────
  const onReply = useCallback((msg) => setReplyTo(msg), []);
  const onCancelReply = useCallback(() => setReplyTo(null), []);

  const onReagir = useCallback((msg, emoji) => {
    if (!conv) return;
    reagir(msg, emoji, conv); // realtime de useThread reflete o UPDATE em reactions
  }, [conv, reagir]);

  const onApagar = useCallback((msg) => {
    if (!conv) return;
    // confirmação explícita: revoke apaga para todos (irreversível no WhatsApp)
    if (!window.confirm('Apagar esta mensagem para todos?')) return;
    apagar(msg, conv); // realtime reflete deleted_at
  }, [conv, apagar]);

  const onEncaminhar = useCallback((msg) => setForwardMsg(msg), []);
  const onFecharForward = useCallback(() => setForwardMsg(null), []);

  const onConfirmarForward = useCallback(async (convIds) => {
    const msg = forwardMsg;
    setForwardMsg(null); // fecha o modal imediatamente; o envio segue em background
    if (!msg) return;
    await encaminhar(msg, convIds, convs); // INSERT + Evolution por destino (best-effort)
  }, [forwardMsg, encaminhar, convs]);

  const envio = {
    onEnviarMidia,
    iniciarGravacao,
    pararEnviar: pararEnviarAudio,
    cancelar: cancelarGravacao,
    gravando,
    segundos,
    enviandoMidia,
  };

  const acoes = {
    onReply,
    onReagir,
    onApagar,
    onEncaminhar,
    replyTo,
    onCancelReply,
    forwardMsg,
    convs,
    onConfirmarForward,
    onFecharForward,
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

  // ── transferir para departamento (FASE 3) ───────────────────────────────────
  const onTransferir = useCallback(async (deptId) => {
    if (!conv) return;
    const { error } = await transferir(conv.id, deptId);
    if (error) return; // P1: 0-linhas/RLS já vem como error; UI mantém estado
    patchConv(conv.id, { deptId });
  }, [conv, transferir, patchConv]);

  const transfer = {
    deps,
    transferir: onTransferir,
    transferindo,
  };

  // canal interno: pode enviar sem instância Evolution (vai p/ channel_messages).
  // WhatsApp: exige instância conectada.
  const podeEnviar = !!conv && (conv.isChan || !!instance);

  const composer = {
    quickReplies,
    buscarPorShortcut,
    breno: brenoComposer,
  };

  // ── bundle de IA p/ a Thread (FASE 4 · IA) ──────────────────────────────────
  // A sugestão híbrida só aparece se for da conversa ativa (o hook guarda convId).
  const setModo = useCallback((modo) => {
    if (activeId) ia.setModoConversa(activeId, modo);
  }, [activeId, ia]);

  const sugestaoAtiva = ia.sugestao && ia.sugestao.convId === activeId ? ia.sugestao : null;

  const iaProp = {
    aiMode: ia.aiMode,
    setModo,
    copilot: ia.copilot,
    tenantId: tenantDbId,
    sugestao: sugestaoAtiva,
    descartarSugestao: ia.limparSugestao,
    transcrever: transcricao.transcrever,
    traduzir: transcricao.traduzir,
    transcriptions: transcricao.transcriptions,
    translations: transcricao.translations,
  };

  return (
    <div className={`ccv ccv-m-${mobilePane}`}>
      <ListaConversas
        convsFiltradas={convsFiltradas}
        loading={loading}
        contadores={contadores}
        filtro={filtro}
        setFiltro={setFiltro}
        FILTROS={FILTROS}
        busca={busca}
        setBusca={setBusca}
        buscandoServer={buscandoServer}
        activeId={activeId}
        onSelect={abrirConv}
        favMute={favMute}
      />

      <Thread
        conv={conv}
        msgs={msgsExibidas}
        loadingMsgs={isCanalAtivo ? false : loadingMsgs}
        onFinalizar={onFinalizar}
        onReabrir={onReabrir}
        onEnviar={enviar}
        atualizando={atualizando}
        podeEnviar={podeEnviar}
        onAbrirImagem={setLightboxUrl}
        envio={envio}
        acoes={acoes}
        loadOlderMsgs={loadOlderMsgs}
        temMais={isCanalAtivo ? false : temMais}
        carregandoOlder={isCanalAtivo ? false : carregandoOlder}
        transfer={transfer}
        composer={composer}
        evolutionOffline={evolutionOffline}
        ia={iaProp}
        onVoltarLista={() => setMobilePane('list')}
        onAbrirContato={() => setMobilePane('contato')}
      />

      <PainelContato
        conv={conv}
        customer={customer}
        transfer={transfer}
        onVoltarChat={() => setMobilePane('chat')}
      />

      {lightboxUrl && <Lightbox url={lightboxUrl} onClose={fecharLightbox} />}
    </div>
  );
}
