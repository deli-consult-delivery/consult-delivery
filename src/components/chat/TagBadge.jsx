export default function TagBadge({ name, color, onRemove }) {
  if (!name) return null;
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 3,
      padding: '2px 7px',
      borderRadius: 99,
      fontSize: 10,
      fontWeight: 500,
      background: color ? `${color}22` : 'var(--g-100)',
      color: color ?? 'var(--g-600)',
      border: `1px solid ${color ? `${color}44` : 'var(--g-200)'}`,
      whiteSpace: 'nowrap',
    }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: color ?? 'var(--g-400)', flexShrink: 0 }} />
      {name}
      {onRemove && (
        <button
          onClick={e => { e.stopPropagation(); onRemove(); }}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: '0 0 0 2px',
            color: color ?? 'var(--g-500)',
            fontSize: 11,
            lineHeight: 1,
            opacity: 0.7,
          }}
          title="Remover tag"
        >
          ×
        </button>
      )}
    </span>
  );
}
