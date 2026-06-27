/**
 * ConvItem — item da lista de conversas (cv2 redesign / FASE 1)
 *
 * Avatar circular (cor por hash do nome) + badge de canal sobreposto
 * (WhatsApp = bolinha verde; canal interno = cinza), nome em negrito, tempo
 * relativo, bolinha de status colorida + preview truncado, tags multi-label.
 * Item ativo recebe .on (fundo --red-soft); com unread recebe .unread.
 *
 * Props:
 *  - conv: convShape { id, nome, telefone, isGroup, isChan, prev, hora,
 *          status, status_v2, unread, ... }
 *  - ativo: boolean
 *  - onClick: () => void
 *  - fav: boolean            (FASE 4: conversa favoritada)
 *  - muted: boolean          (FASE 4: notificações silenciadas)
 *  - onToggleFav: () => void (FASE 4)
 *  - onToggleMute: () => void(FASE 4)
 *
 * Toda a aparência mora em chat-cv2.css (escopo .cv2-main .ccv-*).
 */

import { Ico } from '../../CvIcons.jsx';
import { corAvatar, inicial } from './avatar.js';

// status_v2 → label curto exibido como tag (e tom da tag)
const TAG_STATUS = {
  open:        { label: 'Aguardando', cls: 'warn' },
  waiting:     { label: 'Em atend.',  cls: '' },
  in_progress: { label: 'Em atend.',  cls: '' },
  automacao:   { label: 'Automação',  cls: '' },
  closed:      { label: 'Resolvido',  cls: 'ok' },
  falha:       { label: 'Falha',      cls: 'err' },
  archived:    { label: 'Arquivado',  cls: '' },
};

export default function ConvItem({ conv, ativo, onClick, fav = false, muted = false, onToggleFav, onToggleMute }) {
  const sv2 = conv.status_v2 || 'open';
  const tag = TAG_STATUS[sv2] || null;
  const previewVazio = conv.isGroup ? '(grupo)' : '(sem mensagem)';

  // ações de hover não devem selecionar a conversa
  const onFav = (e) => { e.stopPropagation(); onToggleFav?.(); };
  const onMute = (e) => { e.stopPropagation(); onToggleMute?.(); };
  // Enter/Espaço aciona o span (HTML inválido aninhar <button> em <button>,
  // por isso as ações são <span role="button"> e precisam do handler de teclado).
  const onKey = (fn) => (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(e); } };

  return (
    <button
      type="button"
      className={`ccv-conv${ativo ? ' on' : ''}${conv.unread > 0 ? ' unread' : ''}${fav ? ' fav' : ''}${muted ? ' muted' : ''}`}
      onClick={onClick}
      title={conv.nome}
    >
      <div className="ccv-av" style={{ background: corAvatar(conv.nome) }}>
        {conv.foto
          ? <img className="ccv-av-img" src={conv.foto} alt="" loading="lazy" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
          : inicial(conv.nome)}
        <span className={`ccv-chan${conv.isChan ? ' internal' : ''}`} aria-hidden="true" />
      </div>

      <div className="ccv-cbody">
        <div className="ccv-row1">
          <span className="ccv-nm">{conv.nome}</span>
          {muted && <span className="ccv-mute-ic" title="Silenciada" aria-hidden="true"><Ico name="i-bell" size={11} /></span>}
          <span className="ccv-time">{conv.hora}</span>
          {/* ações (favoritar / silenciar) — só p/ conversas reais, não canais internos */}
          {!conv.isChan && (
            <span className="ccv-conv-acts">
              <span
                role="button"
                tabIndex={0}
                className={`ccv-fav${fav ? ' on' : ''}`}
                onClick={onFav}
                onKeyDown={onKey(onFav)}
                title={fav ? 'Remover dos favoritos' : 'Favoritar'}
                aria-label={fav ? 'Remover dos favoritos' : 'Favoritar'}
              >★</span>
              <span
                role="button"
                tabIndex={0}
                className={`ccv-muted${muted ? ' on' : ''}`}
                onClick={onMute}
                onKeyDown={onKey(onMute)}
                title={muted ? 'Reativar notificações' : 'Silenciar'}
                aria-label={muted ? 'Reativar notificações' : 'Silenciar'}
              >
                <Ico name="i-bell" size={13} />
              </span>
            </span>
          )}
        </div>

        <div className="ccv-row2">
          <span className={`ccv-dot s-${sv2}`} aria-hidden="true" />
          <span className="ccv-pv">{conv.prev || previewVazio}</span>
          {conv.unread > 0 && (
            <span className="ccv-unread">{conv.unread > 99 ? '99+' : conv.unread}</span>
          )}
        </div>

        {tag && (
          <div className="ccv-tags">
            <span className={`ccv-tag ${tag.cls}`}>{tag.label}</span>
          </div>
        )}
      </div>
    </button>
  );
}
