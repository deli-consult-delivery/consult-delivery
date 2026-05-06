const STATUS_MAP = {
  gerando:        { label: 'Gerando',       color: '#f59e0b' },
  pendente_revisao:{ label: 'Pendente revisão', color: '#3b82f6' },
  aprovada:       { label: 'Aprovada',      color: '#22c55e' },
  erro_geracao:   { label: 'Erro',          color: '#ef4444' },
};

export default function StatusBadge({ status }) {
  const s = STATUS_MAP[status] || { label: status, color: '#9ca3af' };
  return (
    <span style={{
      display:'inline-flex', alignItems:'center', gap:6,
      padding:'4px 10px', borderRadius:999,
      background:`${s.color}15`, color:s.color,
      fontSize:12, fontWeight:600, border:`1px solid ${s.color}30`
    }}>
      <span style={{ width:6, height:6, borderRadius:'50%', background:s.color }} />
      {s.label}
    </span>
  );
}
