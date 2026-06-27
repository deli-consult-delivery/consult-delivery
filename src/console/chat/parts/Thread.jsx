/**
 * Thread — coluna 2 do Chat ao Vivo (cv2 redesign / FASE 1)
 *
 * Cabeçalho rico (avatar + nome + badge canal/instância + protocolo #NNNNNN +
 * Finalizar/Reabrir + menu) · lista de <MsgBubble/> com auto-scroll ao fim ·
 * <Composer/>. Estado de carregamento e vazio tratados explicitamente.
 *
 * Props:
 *  - conv: convShape|null   (conversa ativa)
 *  - msgs: msgShape[]
 *  - loadingMsgs: boolean
 *  - onFinalizar: () => void
 *  - onReabrir: () => void
 *  - onEnviar: (texto) => void
 *  - atualizando: boolean   (finalizar/reabrir em curso)
 *  - podeEnviar: boolean     (instância conectada + conversa não-canal)
 *  - onAbrirImagem: (url) => void  (abre o lightbox — FASE 2)
 *  - envio: handlers/estado do useEnvio (mídia + áudio — FASE 2):
 *      { onEnviarMidia, gravando, segundos, iniciarGravacao, pararEnviar,
 *        cancelar, enviandoMidia }
 *  - acoes: handlers de interação da mensagem (FASE 3):
 *      { onReply, onReagir, onApagar, onEncaminhar, convs, replyTo, onCancelReply,
 *        forwardMsg, onConfirmarForward, onFecharForward }
 *
 * Toda a aparência mora em chat-cv2.css (escopo .cv2-main .ccv-*).
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { Ico } from '../../CvIcons.jsx';
import { corAvatar, inicial } from './avatar.js';
import MsgBubble from './MsgBubble.jsx';
import Composer from './Composer.jsx';
import ForwardModal from './ForwardModal.jsx';
import AiCopilot from './AiCopilot.jsx';

// protocolo = últimos 6 da UUID, maiúsculo
const protocolo = (id) => (id ? String(id).slice(-6).toUpperCase() : '');

// modos de IA do atendimento (seletor no header)
const MODOS_IA = [
  { id: 'humano',  ico: 'i-users', label: 'Humano' },
  { id: 'hibrido', ico: 'i-zap',   label: 'Híbrido' },
  { id: 'ia',      ico: 'i-bot',   label: 'IA total' },
];

export default function Thread({
  conv,
  msgs,
  loadingMsgs,
  onFinalizar,
  onReabrir,
  onEnviar,
  atualizando,
  podeEnviar,
  onAbrirImagem,
  envio,
  acoes,
  loadOlderMsgs,
  temMais,
  carregandoOlder,
  transfer,
  composer,
  evolutionOffline = false,
  ia = null,
}) {
  const env = envio || {};
  const act = acoes || {};
  const tr = transfer || {};
  const cmp = composer || {}; // FASE 4: quickReplies / buscarPorShortcut / breno
  const iaP = ia || {};       // FASE 4 (IA): modo/seletor/copiloto/sugestão/transcrição
  const [copilotAberto, setCopilotAberto] = useState(false);
  const msgsRef = useRef(null);
  const lista = msgs || [];

  // qtd anterior p/ distinguir "prepend de histórico" (preserva posição) de
  // "append de msg nova" (auto-scroll ao fim).
  const prevLenRef = useRef(0);
  // scrollHeight salvo antes do prepend, p/ restaurar a posição visual depois.
  const anchorRef = useRef(null);

  // salva âncora ANTES do paint quando o topo dispara loadOlderMsgs
  const onScroll = useCallback(() => {
    const el = msgsRef.current;
    if (!el || carregandoOlder || !temMais) return;
    if (el.scrollTop <= 24) {
      anchorRef.current = el.scrollHeight; // referência p/ restaurar posição após prepend
      loadOlderMsgs?.();
    }
  }, [carregandoOlder, temMais, loadOlderMsgs]);

  // auto-scroll ao fim em msg nova / troca de conversa; ao carregar histórico
  // (prepend), preserva a posição em vez de pular pro fim.
  useEffect(() => {
    const el = msgsRef.current;
    if (!el) return;
    const cresceuNoTopo = anchorRef.current != null && msgs.length > prevLenRef.current;
    if (cresceuNoTopo) {
      // restaura posição: novo scrollHeight - altura salva = deslocamento dos itens prepended
      el.scrollTop = el.scrollHeight - anchorRef.current;
      anchorRef.current = null;
      // sincroniza o comprimento APÓS a restauração — prepends rápidos sucessivos não
      // herdam um prevLen defasado que faria o próximo ciclo cair no auto-scroll ao fundo.
      prevLenRef.current = msgs.length;
    } else {
      el.scrollTop = el.scrollHeight;
      prevLenRef.current = msgs.length;
    }
  }, [msgs, conv?.id]);

  if (!conv) {
    return (
      <div className="ccv-col2">
        <div className="ccv-msgs" style={{ alignItems: 'center', justifyContent: 'center' }}>
          <div className="ccv-empty">Selecione uma conversa para começar.</div>
        </div>
      </div>
    );
  }

  const isCanal = !!conv.isChan;
  const isFinalizado = conv.status_v2 === 'closed';
  const canalLabel = isCanal ? 'Interno' : (conv.isGroup ? 'Grupo' : 'WhatsApp');

  return (
    <div className="ccv-col2">
      {/* ─── header ─────────────────────────────────────────────────────── */}
      <div className="ccv-thread-head">
        <div className="ccv-av sm" style={{ background: corAvatar(conv.nome) }}>
          {conv.foto
            ? <img className="ccv-av-img" src={conv.foto} alt="" loading="lazy" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
            : inicial(conv.nome)}
          <span className={`ccv-chan${isCanal ? ' internal' : ''}`} aria-hidden="true" />
        </div>

        <div className="ccv-th-info">
          <div className="ccv-th-name">{conv.nome}</div>
          <div className="ccv-th-meta">
            <span className="ccv-th-badge">
              <Ico name={isCanal ? 'i-users' : 'i-chat'} size={11} />
              {canalLabel}
            </span>
            <span className="ccv-th-proto">#{protocolo(conv.id)}</span>
          </div>
        </div>

        <div className="ccv-th-actions">
          {/* ─── seletor de modo IA (humano / híbrido / IA) — só em WhatsApp ─── */}
          {!isCanal && iaP.setModo && (
            <div className="ccv-aimode" role="group" aria-label="Modo de atendimento IA">
              {MODOS_IA.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className={`ccv-aimode-btn${iaP.aiMode === m.id ? ' on' : ''}`}
                  title={m.label}
                  aria-pressed={iaP.aiMode === m.id}
                  onClick={() => {
                    if (m.id === 'ia' && !window.confirm('A DELI vai responder automaticamente todas as mensagens desta conversa neste modo. Confirmar?')) return;
                    iaP.setModo(m.id);
                  }}
                >
                  <Ico name={m.ico} size={12} />
                  <span className="ccv-aimode-lbl">{m.label}</span>
                </button>
              ))}
            </div>
          )}
          {/* ─── abrir copiloto DELI ─────────────────────────────────────── */}
          {!isCanal && iaP.copilot && (
            <button
              type="button"
              className={`ccv-cbtn${copilotAberto ? ' on' : ''}`}
              title="Copiloto DELI"
              aria-label="Abrir copiloto DELI"
              onClick={() => setCopilotAberto((v) => !v)}
            >
              <Ico name="i-bot" size={16} />
            </button>
          )}
          {!isCanal && Array.isArray(tr.deps) && tr.deps.length > 0 && (
            <select
              className="ccv-transfer"
              value=""
              disabled={tr.transferindo}
              title="Transferir para departamento"
              aria-label="Transferir para departamento"
              onChange={(e) => { const v = e.target.value; e.target.value = ''; if (v) tr.transferir?.(v); }}
            >
              <option value="">Transferir…</option>
              {tr.deps.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          )}
          {!isCanal && !isFinalizado && (
            <button
              type="button"
              className="cv2-btn sec"
              style={{ padding: '5px 12px', fontSize: 11.5 }}
              onClick={onFinalizar}
              disabled={atualizando}
            >
              Finalizar
            </button>
          )}
          {!isCanal && isFinalizado && (
            <button
              type="button"
              className="cv2-btn sec"
              style={{ padding: '5px 12px', fontSize: 11.5 }}
              onClick={onReabrir}
              disabled={atualizando}
            >
              Reabrir
            </button>
          )}
          <button type="button" className="ccv-cbtn" title="Mais opções (em breve)" disabled aria-label="Mais opções">
            <Ico name="i-list" size={16} />
          </button>
        </div>
      </div>

      {/* ─── aviso discreto: Evolution offline (FASE 4) ──────────────────── */}
      {!isCanal && evolutionOffline && (
        <div className="ccv-offline" role="status">
          <Ico name="i-radio" size={13} />
          <span>WhatsApp pode estar offline — sem mensagens recebidas recentemente. As respostas ficam salvas e são enviadas ao reconectar.</span>
        </div>
      )}

      {/* ─── sugestão híbrida da DELI (FASE 4 · IA) — enviar / descartar ──── */}
      {!isCanal && iaP.sugestao && (
        <div className="ccv-ia-suggest" role="status">
          <span className="ccv-ia-suggest-ic" aria-hidden="true"><Ico name="i-zap" size={14} /></span>
          <div className="ccv-ia-suggest-body">
            <div className="ccv-ia-suggest-tit">Sugestão da DELI</div>
            <div className="ccv-ia-suggest-txt">{iaP.sugestao.texto}</div>
          </div>
          <div className="ccv-ia-suggest-acts">
            <button
              type="button"
              className="ccv-ia-suggest-use"
              disabled={!podeEnviar}
              onClick={() => { onEnviar(iaP.sugestao.texto); iaP.descartarSugestao?.(); }}
            >
              Enviar
            </button>
            <button
              type="button"
              className="ccv-ia-suggest-dis"
              title="Descartar"
              aria-label="Descartar sugestão"
              onClick={() => iaP.descartarSugestao?.()}
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* ─── mensagens ──────────────────────────────────────────────────── */}
      <div className="ccv-msgs" ref={msgsRef} onScroll={onScroll}>
        {carregandoOlder && <div className="ccv-hist">Carregando histórico…</div>}
        {loadingMsgs && <div className="ccv-empty">Carregando mensagens…</div>}
        {!loadingMsgs && lista.length === 0 && (
          <div className="ccv-empty">Sem mensagens nesta conversa.</div>
        )}
        {!loadingMsgs && lista.map((m, i) => (
          <MsgBubble
            key={m.id}
            msg={m}
            prevMsg={i > 0 ? lista[i - 1] : null}
            onAbrirImagem={onAbrirImagem}
            onReply={act.onReply}
            onReagir={act.onReagir}
            onApagar={act.onApagar}
            onEncaminhar={act.onEncaminhar}
            transcription={iaP.transcriptions?.[m.id]}
            translation={iaP.translations?.[m.id]}
            onTranscrever={isCanal ? null : iaP.transcrever}
            onTraduzir={isCanal ? null : iaP.traduzir}
          />
        ))}
      </div>

      {/* ─── composer ───────────────────────────────────────────────────── */}
      <Composer
        onEnviar={onEnviar}
        onEnviarMidia={env.onEnviarMidia}
        disabled={!podeEnviar}
        mediaDisabled={isCanal}
        gravando={env.gravando}
        segundos={env.segundos}
        iniciarGravacao={env.iniciarGravacao}
        pararEnviar={env.pararEnviar}
        cancelar={env.cancelar}
        enviandoMidia={env.enviandoMidia}
        replyTo={act.replyTo}
        onCancelReply={act.onCancelReply}
        quickReplies={cmp.quickReplies}
        buscarPorShortcut={cmp.buscarPorShortcut}
        breno={cmp.breno}
      />

      {/* ─── modal de encaminhamento (FASE 3) ───────────────────────────── */}
      {act.forwardMsg && (
        <ForwardModal
          msg={act.forwardMsg}
          convs={act.convs}
          onConfirmar={act.onConfirmarForward}
          onClose={act.onFecharForward}
        />
      )}

      {/* ─── drawer do copiloto DELI (FASE 4 · IA) ──────────────────────── */}
      {!isCanal && copilotAberto && iaP.copilot && (
        <AiCopilot
          conv={conv}
          msgs={lista}
          tenantId={iaP.tenantId}
          copilot={iaP.copilot}
          onClose={() => setCopilotAberto(false)}
        />
      )}
    </div>
  );
}
