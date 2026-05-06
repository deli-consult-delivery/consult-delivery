import Icon from '../../../components/Icon.jsx';

export default function EmptyState({ icon, title, description, action }) {
  return (
    <div style={{
      display:'flex', flexDirection:'column', alignItems:'center',
      justifyContent:'center', gap:12, padding:'48px 24px',
      color:'#9ca3af', textAlign:'center',
    }}>
      {icon ? <Icon name={icon} size={40} /> : null}
      <h3 style={{ margin:0, color:'#fff', fontSize:16, fontWeight:600 }}>{title}</h3>
      {description ? <p style={{ margin:0, fontSize:14, maxWidth:400 }}>{description}</p> : null}
      {action ? <div style={{ marginTop:8 }}>{action}</div> : null}
    </div>
  );
}
