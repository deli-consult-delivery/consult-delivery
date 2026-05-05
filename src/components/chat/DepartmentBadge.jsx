export default function DepartmentBadge({ name, color, size = 'sm' }) {
  if (!name) return null;
  const pad  = size === 'sm' ? '2px 8px' : '4px 12px';
  const font = size === 'sm' ? 11 : 12;

  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
      padding: pad,
      borderRadius: 99,
      fontSize: font,
      fontWeight: 500,
      background: color ? `${color}22` : 'var(--g-100)',
      color: color ?? 'var(--g-600)',
      border: `1px solid ${color ? `${color}44` : 'var(--g-200)'}`,
      whiteSpace: 'nowrap',
    }}>
      {color && (
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0 }} />
      )}
      {name}
    </span>
  );
}
