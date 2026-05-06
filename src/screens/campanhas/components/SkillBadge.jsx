export default function SkillBadge({ criada }) {
  const color = criada ? '#22c55e' : '#f59e0b';
  const label = criada ? 'Skill ativa' : 'Skill pendente';
  return (
    <span style={{
      display:'inline-flex', alignItems:'center', gap:6,
      padding:'3px 8px', borderRadius:999,
      background:`${color}15`, color,
      fontSize:11, fontWeight:600, border:`1px solid ${color}30`
    }}>
      <span style={{ width:6, height:6, borderRadius:'50%', background:color }} />
      {label}
    </span>
  );
}
