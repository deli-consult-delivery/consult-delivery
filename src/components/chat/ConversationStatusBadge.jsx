/**
 * Badge de status da conversa (workflow Sprint 1).
 * Mapeia status_v2 para label pt-BR e cor usando as classes CSS do projeto.
 */

const STATUS_CONFIG = {
  open:        { label: 'Aberta',        cls: 'badge badge-gray'   },
  in_progress: { label: 'Em Atendimento',cls: 'badge badge-blue'   },
  waiting:     { label: 'Aguardando',    cls: 'badge badge-yellow' },
  closed:      { label: 'Finalizada',    cls: 'badge badge-green'  },
  archived:    { label: 'Arquivada',     cls: 'badge',             style: { background: 'var(--info-soft)', color: '#6D28D9' } },
};

export default function ConversationStatusBadge({ status }) {
  const config = STATUS_CONFIG[status] ?? { label: status, cls: 'badge badge-gray' };
  return (
    <span className={config.cls} style={config.style ?? {}}>
      {config.label}
    </span>
  );
}
