/**
 * Badge de status da conversa.
 * Suporta tanto status_v2 (ENUM EN) quanto status (campo PT-BR legado).
 */

const STATUS_CONFIG = {
  // Valores status_v2 (ENUM en-US) — existentes
  open:        { emoji: '📂', label: 'Aberta',         cls: 'badge badge-gray'   },
  in_progress: { emoji: '💬', label: 'Em Atendimento', cls: 'badge badge-blue'   },
  waiting:     { emoji: '⏳', label: 'Aguardando',     cls: 'badge badge-yellow' },
  closed:      { emoji: '✅', label: 'Finalizada',     cls: 'badge badge-green'  },
  archived:    { emoji: '📦', label: 'Arquivada',      cls: 'badge', style: { background: 'var(--info-soft)', color: '#6D28D9' } },
  // Valores status_v2 novos
  automacao:   { emoji: '🤖', label: 'Automação',      cls: 'badge', style: { background: 'rgba(168,85,247,0.15)', color: '#D8B4FE' } },
  falha:       { emoji: '⚠️', label: 'Falha',          cls: 'badge', style: { background: 'rgba(183,12,0,0.15)',   color: '#FF8080' } },
  // Aliases para campo status (PT-BR legado) — mapeia para o mesmo visual
  aguardando:         { emoji: '⏳', label: 'Não iniciado',    cls: 'badge badge-yellow' },
  em_atendimento:     { emoji: '💬', label: 'Aguardando',      cls: 'badge badge-blue'   },
  atendimento_aberto: { emoji: '📂', label: 'Em aberto',       cls: 'badge badge-green'  },
  finalizado:         { emoji: '✅', label: 'Finalizado',      cls: 'badge badge-gray'   },
};

export default function ConversationStatusBadge({ status }) {
  const config = STATUS_CONFIG[status] ?? { emoji: '❓', label: status || '—', cls: 'badge badge-gray' };
  return (
    <span className={config.cls} style={config.style ?? {}} title={config.label}>
      {config.emoji} {config.label}
    </span>
  );
}
