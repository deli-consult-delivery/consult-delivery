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
 *
 * Toda a aparência mora em chat-cv2.css (escopo .cv2-main .ccv-*).
 */

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

export default function ConvItem({ conv, ativo, onClick }) {
  const sv2 = conv.status_v2 || 'open';
  const tag = TAG_STATUS[sv2] || null;
  const previewVazio = conv.isGroup ? '(grupo)' : '(sem mensagem)';

  return (
    <div
      className={`ccv-conv${ativo ? ' on' : ''}${conv.unread > 0 ? ' unread' : ''}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick?.(); } }}
      title={conv.nome}
    >
      <div className="ccv-av" style={{ background: corAvatar(conv.nome) }}>
        {inicial(conv.nome)}
        <span className={`ccv-chan${conv.isChan ? ' internal' : ''}`} aria-hidden="true" />
      </div>

      <div className="ccv-cbody">
        <div className="ccv-row1">
          <span className="ccv-nm">{conv.nome}</span>
          <span className="ccv-time">{conv.hora}</span>
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
    </div>
  );
}
