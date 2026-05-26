const SOFIA_COLOR = '#8B5CF6';

const cardStyle = {
  padding: 16,
  background: 'rgba(255,255,255,0.03)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 10,
};

const CIDADES_DEFAULT = ['São Paulo', 'Campinas', 'Santos'];
const QUERIES_DEFAULT = [
  'restaurante delivery',
  'hamburgueria artesanal',
  'pizzaria delivery',
  'comida saudável delivery',
];

export default function SofiaConfig({ role }) {
  const isAdmin = ['admin', 'dev'].includes(role);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 640 }}>

      {/* Agendamento */}
      <div style={cardStyle}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.35)', marginBottom: 12, letterSpacing: 1 }}>AGENDAMENTO</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>Frequência</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.85)' }}>Dias úteis (seg–sex)</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>Horário</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.85)' }}>12h UTC (9h BRT)</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>Cron</span>
            <code style={{ fontSize: 12, color: SOFIA_COLOR, background: `${SOFIA_COLOR}18`, padding: '2px 8px', borderRadius: 4 }}>0 12 * * 1-5</code>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>Plataforma</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.85)' }}>Trigger.dev (sofia-prospect)</span>
          </div>
        </div>
      </div>

      {/* Cidades */}
      <div style={cardStyle}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.35)', marginBottom: 12, letterSpacing: 1 }}>CIDADES PROSPECTADAS</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {CIDADES_DEFAULT.map(c => (
            <span key={c} style={{
              background: `${SOFIA_COLOR}18`, color: SOFIA_COLOR,
              border: `1px solid ${SOFIA_COLOR}33`, borderRadius: 8,
              padding: '6px 14px', fontSize: 13, fontWeight: 600,
            }}>{c}</span>
          ))}
        </div>
        {isAdmin && (
          <p style={{ margin: '12px 0 0', fontSize: 12, color: 'rgba(255,255,255,0.35)' }}>
            Configuração via <code style={{ color: 'rgba(255,255,255,0.5)' }}>CIDADES_DEFAULT</code> em <code style={{ color: 'rgba(255,255,255,0.5)' }}>trigger/sofia/sofia-prospect.ts</code>.
            Configuração dinâmica por tenant será adicionada em G02 v2.
          </p>
        )}
      </div>

      {/* Queries */}
      <div style={cardStyle}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.35)', marginBottom: 12, letterSpacing: 1 }}>BUSCAS REALIZADAS</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {QUERIES_DEFAULT.map(q => (
            <div key={q} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ color: SOFIA_COLOR, fontSize: 14 }}>🔍</span>
              <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.75)' }}>{q}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ICP */}
      <div style={cardStyle}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.35)', marginBottom: 12, letterSpacing: 1 }}>PERFIL IDEAL DE CLIENTE (ICP)</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[
            ['GMV estimado', 'R$80.000+/mês'],
            ['Tecnologia', 'iFood Premium ou Pro'],
            ['Engajamento', 'Posts ativos no Instagram (últimos 30 dias)'],
            ['Segmento', 'Restaurante, hamburgueria, pizzaria, saudável'],
            ['Ticket médio', '>R$40'],
          ].map(([k, v]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', flexShrink: 0 }}>{k}</span>
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.78)', textAlign: 'right' }}>{v}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Score rubric */}
      <div style={cardStyle}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.35)', marginBottom: 12, letterSpacing: 1 }}>RUBRICA DE SCORE (1–10)</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[
            { range: '8–10', desc: 'Todos os critérios do ICP atendidos + indícios de escala', color: '#16a34a' },
            { range: '6–7',  desc: 'Maioria atendida, 1–2 gaps menores', color: '#D97706' },
            { range: '4–5',  desc: 'Potencial mas gaps significativos', color: '#f97316' },
            { range: '1–3',  desc: 'Não fit — lanchonete simples, sem presença digital', color: '#dc2626' },
          ].map(({ range, desc, color }) => (
            <div key={range} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <span style={{ background: `${color}22`, color, border: `1px solid ${color}44`, borderRadius: 6, padding: '2px 10px', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
                {range}
              </span>
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)', lineHeight: 1.4 }}>{desc}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Meta */}
      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', textAlign: 'center' }}>
        Meta D60: ≥100 leads com score ≥6 · ≥15 em status CRM
      </div>
    </div>
  );
}
