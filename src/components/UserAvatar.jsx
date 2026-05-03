export default function UserAvatar({ name = 'WS', size = 32, src }) {
  const initials = getInitials(name);

  if (src) {
    return <img src={src} className="u-avatar" style={{ width: size, height: size }} alt={name} />;
  }
  return (
    <div className="u-avatar" style={{ width: size, height: size, fontSize: size * 0.38, overflow: 'hidden' }}>
      {initials}
    </div>
  );
}

function getInitials(name) {
  if (!name || typeof name !== 'string') return 'U';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'U';
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
