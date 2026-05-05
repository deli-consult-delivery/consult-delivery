import ConversationStatusBadge from './ConversationStatusBadge.jsx';

export default function LeadPanelHeader({ conversation, onClose }) {
  if (!conversation) return null;

  const channel = conversation.channel ?? 'whatsapp';
  const channelLabel = { whatsapp: 'WhatsApp', internal: 'Interno' }[channel] ?? channel;

  return (
    <div style={{
      padding: '14px 16px 12px',
      borderBottom: '1px solid var(--g-200)',
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <span style={{ fontSize: 11, color: 'var(--g-400)', fontWeight: 500 }}>
          {channelLabel}
        </span>
        {onClose && (
          <button
            onClick={onClose}
            title="Fechar painel"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--g-400)',
              padding: 0,
              fontSize: 16,
              lineHeight: 1,
            }}
          >
            ×
          </button>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <ConversationStatusBadge status={conversation.status_v2 ?? 'open'} />
        {conversation.assigned_to_name && (
          <span style={{ fontSize: 11, color: 'var(--g-500)' }}>
            {conversation.assigned_to_name}
          </span>
        )}
      </div>

      {conversation.subject && (
        <p style={{ margin: 0, fontSize: 12, color: 'var(--g-700)', fontWeight: 500 }}>
          {conversation.subject}
        </p>
      )}
    </div>
  );
}
