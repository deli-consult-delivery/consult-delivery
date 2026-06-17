import { Ico } from './CvIcons.jsx';

const ITEMS = [
  { id: 'heartbeats', ic: 'i-radio',  label: 'Heartbeats',           desc: 'Monitoramento proativo de saúde dos agentes' },
  { id: 'metas',      ic: 'i-target', label: 'Metas & OKR',          desc: 'Defina e acompanhe metas da operação' },
  { id: 'construtor', ic: 'i-bot',    label: 'Construtor de Agentes', desc: 'Crie e configure agentes de IA personalizados' },
  { id: 'memoria',    ic: 'i-brain',  label: 'Memórias',             desc: 'Memória de longo prazo dos agentes' },
  { id: 'atividade',  ic: 'i-list',   label: 'Execuções',            desc: 'Histórico de todas as execuções de agentes' },
  { id: 'conhecimento', ic: 'i-book', label: 'Base de Conhecimento', desc: 'Documentos e RAG para os agentes' },
  { id: 'inbox',      ic: 'i-reply',  label: 'Inbox dos Agentes',    desc: 'Mensagens e tarefas pendentes de agentes' },
  { id: 'aprovacoes', ic: 'i-check',  label: 'Aprovações',           desc: 'Drafts e ações aguardando sua aprovação' },
];

export default function Automacoes({ tenantDbId, userId, onNavigate }) {
  return (
    <div style={{ padding: '28px 32px 56px', maxWidth: 1080, margin: '0 auto' }}>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: 'var(--tx)' }} className="anton">Automações</h1>
        <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--tx2)' }}>Central de automações, agentes e monitoramento</p>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 14 }}>
        {ITEMS.map(item => (
          <div
            key={item.id}
            className="cv2-card"
            style={{ cursor: 'pointer', transition: 'opacity .15s' }}
            onClick={() => onNavigate?.(item.id)}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--red)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', flexShrink: 0 }}>
                <Ico name={item.ic} size={18} />
              </div>
              <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--tx)' }}>{item.label}</span>
            </div>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--tx2)', lineHeight: 1.5 }}>{item.desc}</p>
            <div style={{ marginTop: 14 }}>
              <button className="cv2-btn sec" style={{ fontSize: 12, padding: '6px 14px' }}>Abrir</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
