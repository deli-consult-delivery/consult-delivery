export default function AccessDenied({ message }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', padding: 64, gap: 12,
    }}>
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none"
        stroke="#e53e3e" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </svg>
      <span style={{ fontSize: 18, fontWeight: 600, color: '#e53e3e' }}>
        Acesso negado
      </span>
      <span style={{ fontSize: 14, color: '#718096', textAlign: 'center', maxWidth: 320 }}>
        {message ?? 'Você não tem permissão para acessar este recurso.'}
      </span>
    </div>
  );
}
