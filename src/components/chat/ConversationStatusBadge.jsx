/**
 * Badge de status da conversa (workflow Sprint 1).
 * Mapeia status_v2 para label pt-BR e cor usando as classes CSS do projeto.
 */

const STATUS_CONFIG = {
  open:        { emoji: '📂', label: 'Aberta',         cls: 'badge badge-gray'   },
  in_progress: { emoji: '💬', label: 'Em Atendimento', cls: 'badge badge-blue'   },
  waiting:     { emoji: '⏳', label: 'Aguardando',     cls: 'badge badge-yellow' },
  closed:      { emoji: '✅', label: 'Finalizada',     cls: 'badge badge-green'  },
  archived:    { emoji: '📦', label: 'Arquivada',      cls: 'badge',             style: { background: 'var(--info-soft)', color: '#6D28D9' } },
};

export default function ConversationStatusBadge({ status }) {
  const config = STATUS_CONFIG[status] ?? { emoji: '❓', label: status, cls: 'badge badge-gray' };
  return (
    <span className={config.cls} style={config.style ?? {}} title={config.label}>
      {config.emoji}
    </span>
  );
}
