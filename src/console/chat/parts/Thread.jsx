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
 *
 * Toda a aparência mora em chat-cv2.css (escopo .cv2-main .ccv-*).
 */

import { useEffect, useRef } from 'react';
import { Ico } from '../../CvIcons.jsx';
import { corAvatar, inicial } from './avatar.js';
import MsgBubble from './MsgBubble.jsx';
import Composer from './Composer.jsx';

// protocolo = últimos 6 da UUID, maiúsculo
const protocolo = (id) => (id ? String(id).slice(-6).toUpperCase() : '');

export default function Thread({
  conv,
  msgs,
  loadingMsgs,
  onFinalizar,
  onReabrir,
  onEnviar,
  atualizando,
  podeEnviar,
}) {
  const msgsRef = useRef(null);
  const lista = msgs || [];

  // auto-scroll ao fim a cada nova mensagem / troca de conversa
  useEffect(() => {
    const el = msgsRef.current;
    if (el) el.scrollTop = el.scrollHeight;
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
          {inicial(conv.nome)}
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

      {/* ─── mensagens ──────────────────────────────────────────────────── */}
      <div className="ccv-msgs" ref={msgsRef}>
        {loadingMsgs && <div className="ccv-empty">Carregando mensagens…</div>}
        {!loadingMsgs && lista.length === 0 && (
          <div className="ccv-empty">Sem mensagens nesta conversa.</div>
        )}
        {!loadingMsgs && lista.map((m, i) => (
          <MsgBubble key={m.id} msg={m} prevMsg={i > 0 ? lista[i - 1] : null} />
        ))}
      </div>

      {/* ─── composer ───────────────────────────────────────────────────── */}
      <Composer onEnviar={onEnviar} disabled={isCanal || !podeEnviar} />
    </div>
  );
}
