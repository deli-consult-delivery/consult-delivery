export default function UserAvatar({ name = 'WS', size = 32, src }) {
  if (src) {
    return <img src={src} className="u-avatar" style={{ width: size, height: size }} alt={name} />;
  }
  return (
    <div className="u-avatar" style={{ width: size, height: size, fontSize: size * 0.38 }}>
      {name}
    </div>
  );
}
