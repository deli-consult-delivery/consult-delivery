import { useState } from 'react';
import Icon from '../components/Icon.jsx';
import UserAvatar from '../components/UserAvatar.jsx';
import { META_TEMPLATES, DEPARTMENTS } from '../data.js';
import CustomFieldsManager from './Settings/CustomFieldsManager.jsx';

const SettingsScreen = ({ tenant, tenantDbId, userId, onTenantChange }) => {
  const [section, setSection] = useState('workspace');

  const sections = [
    { id: 'workspace',    label: 'Espaço de trabalho',  icon: 'building' },
    { id: 'users',        label: 'Usuários e equipes',  icon: 'users' },
    { id: 'departments',  label: 'Departamentos',       icon: 'folder' },
    { id: 'integrations', label: 'Integrações',         icon: 'plug' },
    { id: 'templates',    label: 'Modelos de mensagem', icon: 'paper' },
    { id: 'rules',        label: 'Regras de roteamento',icon: 'route' },
    { id: 'billing',      label: 'Faturamento e IA',    icon: 'dollar' },
    { id: 'security',     label: 'Segurança',           icon: 'shield' },
    { id: 'custom_fields', label: 'Campos personalizados', icon: 'settings' },
  ];

  return (
    <div className="route-enter" style={{ padding: '28px 32px 56px', maxWidth: 1480, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 className="page-h1">Configurações</h1>
        <p className="page-sub">Tudo o que define como sua plataforma se comporta</p>
      </div>

      <div className="set-layout">
        <nav className="card set-nav">
          {sections.map(s => (
            <button
              key={s.id}
              className={`set-nav-btn ${section === s.id ? 'on' : ''}`}
              onClick={() => setSection(s.id)}
            >
              <Icon name={s.icon} size={15} />
              <span>{s.label}</span>
            </button>
          ))}
        </nav>

        <div style={{ minWidth: 0 }}>
          {section === 'workspace'    && <WorkspaceSettings />}
          {section === 'users'        && <UsersSettings />}
          {section === 'departments'  && <DepartmentsSettings />}
          {section === 'integrations' && <IntegrationsSettings />}
          {section === 'templates'    && <TemplatesSettings />}
          {section === 'rules'        && <RulesSettings />}
          {section === 'billing'      && <BillingSettings />}
          {section === 'security'     && <SecuritySettings />}
          {section === 'custom_fields' && (
            <SettingsCard title="Campos personalizados" sub="Adicione campos extras a lojas, clientes, leads, tarefas e contratos.">
              <CustomFieldsManager tenantDbId={tenantDbId} />
            </SettingsCard>
          )}
        </div>
      </div>
    </div>
  );
};

const WorkspaceSettings = () => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
    <SettingsCard title="Identidade do espaço">
      <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 24, alignItems: 'center' }}>
        <div style={{ width: 140, height: 140, borderRadius: 16, background: 'linear-gradient(135deg, #B70C00, #8A0900)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 40, fontWeight: 800 }}>D</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <button className="btn-secondary" style={{ alignSelf: 'flex-start' }}>
            <Icon name="upload" size={13} /> Substituir logo
          </button>
          <FormRow label="Nome do espaço">
            <input className="input" defaultValue="Pizzaria Delícia" />
          </FormRow>
          <FormRow label="Identificador (URL)">
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: 13, color: 'var(--g-500)' }}>consultdelivery.com.br/</span>
              <input className="input" defaultValue="pizzaria-delicia" style={{ flex: 1 }} />
            </div>
          </FormRow>
        </div>
      </div>
    </SettingsCard>

    <SettingsCard title="Cores da marca" sub="Personalizam botões, badges e elementos de destaque">
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        {[
          { label: 'Primária',   color: '#B70C00' },
          { label: 'Secundária', color: '#0D0D0D' },
          { label: 'Sucesso',    color: '#10B981' },
          { label: 'Atenção',    color: '#F59E0B' },
        ].map(c => (
          <div key={c.label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 8, background: c.color, border: '1px solid rgba(0,0,0,0.1)' }} />
            <div>
              <div style={{ fontSize: 11, color: 'var(--g-500)', textTransform: 'uppercase', fontWeight: 600 }}>{c.label}</div>
              <div style={{ fontSize: 13, color: 'var(--g-900)', fontWeight: 700 }}>{c.color}</div>
            </div>
          </div>
        ))}
      </div>
    </SettingsCard>

    <SettingsCard title="Horário de atendimento" sub="Define quando humanos respondem; fora disso, IA assume com aviso">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'].map((d, i) => (
          <div key={d} style={{ display: 'grid', gridTemplateColumns: '120px 1fr 100px 14px 100px', gap: 12, alignItems: 'center', padding: 8, borderRadius: 6, background: i % 2 === 0 ? '#F9FAFB' : 'transparent' }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>{d}</span>
            <Toggle defaultOn={i < 6} />
            <input className="input" defaultValue="09:00" style={{ fontSize: 13, padding: '6px 8px' }} />
            <span style={{ textAlign: 'center', color: 'var(--g-400)' }}>—</span>
            <input className="input" defaultValue={i === 5 ? '15:00' : '23:00'} style={{ fontSize: 13, padding: '6px 8px' }} />
          </div>
        ))}
      </div>
    </SettingsCard>

    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
      <button className="btn-secondary">Cancelar</button>
      <button className="btn-primary">Salvar alterações</button>
    </div>
  </div>
);

const UsersSettings = () => {
  const team = [];
  const palette = ['#B70C00', '#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899'];
  const dotColor = { online: '#10B981', idle: '#F59E0B', offline: '#9CA3AF' };
  return (
    <SettingsCard title="Usuários e equipes" sub={`${team.length} membros ativos`} extra={<button className="btn-primary"><Icon name="plus" size={13} /> Convidar usuário</button>}>
      <table className="crm-table">
        <thead><tr><th>Nome</th><th>E-mail</th><th>Permissão</th><th>Status</th><th>Última atividade</th><th></th></tr></thead>
        <tbody>
          {team.map((u, i) => (
            <tr key={u.email}>
              <td>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 28, height: 28, borderRadius: '50%', background: palette[i % palette.length], color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 11 }}>
                    {u.avatar || u.name.split(' ').map(n => n[0]).slice(0, 2).join('')}
                  </div>
                  <span style={{ fontWeight: 600 }}>{u.name}</span>
                </div>
              </td>
              <td>{u.email}</td>
              <td><span className={`badge ${u.role === 'Owner' ? 'badge-red' : u.role === 'Dev' ? 'badge-purple' : 'badge-gray'}`}>{u.role}</span></td>
              <td><span style={{ color: dotColor[u.status], fontSize: 12, fontWeight: 700, textTransform: 'capitalize' }}>● {u.status}</span></td>
              <td style={{ color: 'var(--g-500)', fontSize: 12 }}>{u.last}</td>
              <td><button className="btn-ghost" style={{ padding: 6 }}><Icon name="more" size={14} /></button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </SettingsCard>
  );
};

const DepartmentsSettings = () => {
  const depts = [
    { name: 'Atendimento', color: '#3B82F6', members: 8,  agent: 'breno' },
    { name: 'Vendas',      color: '#10B981', members: 5,  agent: 'sofia' },
    { name: 'Cobrança',    color: '#F59E0B', members: 3,  agent: 'cora'  },
    { name: 'Operações',   color: '#8B5CF6', members: 4,  agent: 'max'   },
  ];
  return (
    <SettingsCard title="Departamentos" sub="Cada departamento tem fila própria, agentes e SLA" extra={<button className="btn-primary"><Icon name="plus" size={13} /> Novo departamento</button>}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {depts.map(d => (
          <div key={d.name} className="dept-card">
            <div style={{ width: 40, height: 40, borderRadius: 10, background: d.color + '22', color: d.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 }}>
              {d.name[0]}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, color: 'var(--g-900)' }}>{d.name}</div>
              <div style={{ fontSize: 12, color: 'var(--g-500)', marginTop: 2 }}>{d.members} agentes humanos</div>
            </div>
            <button className="btn-ghost"><Icon name="settings" size={14} /></button>
          </div>
        ))}
      </div>
    </SettingsCard>
  );
};

const IntegrationsSettings = () => {
  const integrations = [
    { name: 'WhatsApp Business', icon: '💬', status: 'connected', desc: 'Meta Business · 3 números conectados',  stat: '8.4k mensagens/mês' },
    { name: 'iFood Restaurante', icon: '🍔', status: 'connected', desc: 'Loja #4827319 · sincronizando pedidos', stat: '412 pedidos/semana' },
    { name: 'Instagram Direct',  icon: '📷', status: 'connected', desc: '@pizzariadelicia',                      stat: '120 conversas/mês' },
    { name: 'Stripe',            icon: '💳', status: 'connected', desc: 'Pagamentos online',                    stat: 'R$ 18k/mês' },
    { name: 'Google Agenda',     icon: '📅', status: 'pending',   desc: 'Sincronizar reuniões e tarefas',        stat: null },
    { name: 'Zapier',            icon: '⚡', status: 'available', desc: 'Automações com 5.000+ apps',            stat: null },
    { name: 'Mercado Pago',      icon: '💵', status: 'available', desc: 'Pix e boletos',                        stat: null },
    { name: 'Telegram',          icon: '✈️',  status: 'available', desc: 'Canal alternativo',                   stat: null },
  ];
  return (
    <SettingsCard title="Integrações" sub="Conecte todos os canais e ferramentas que sua operação usa">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
        {integrations.map(i => (
          <div key={i.name} className="integration-card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: '#F3F4F6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>{i.icon}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, color: 'var(--g-900)' }}>{i.name}</div>
                <div style={{ fontSize: 11, color: 'var(--g-500)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{i.desc}</div>
              </div>
              <span className={`badge ${i.status === 'connected' ? 'badge-green' : i.status === 'pending' ? 'badge-amber' : 'badge-gray'}`} style={{ fontSize: 10 }}>
                {i.status === 'connected' ? '✓ ativo' : i.status === 'pending' ? 'pendente' : 'disponível'}
              </span>
            </div>
            {i.stat && (
              <div style={{ fontSize: 12, color: 'var(--g-700)', padding: 8, background: '#F9FAFB', borderRadius: 6, marginBottom: 8 }}>{i.stat}</div>
            )}
            <button className={i.status === 'available' ? 'btn-primary' : 'btn-secondary'} style={{ width: '100%', fontSize: 13 }}>
              {i.status === 'connected' ? 'Configurar' : i.status === 'pending' ? 'Concluir conexão' : 'Conectar'}
            </button>
          </div>
        ))}
      </div>
    </SettingsCard>
  );
};

const TemplatesSettings = () => {
  const templates = [
    { name: 'boas_vindas',         status: 'aprovado',   cat: 'utility',   uses: '1.4k', sample: 'Olá! Sou {{1}} da {{2}} 👋. Como posso ajudar?' },
    { name: 'cardapio_envio',      status: 'aprovado',   cat: 'marketing', uses: '820',  sample: 'Aqui está nosso cardápio digital: {{1}}. Posso te ajudar a montar o pedido?' },
    { name: 'pedido_confirmacao',  status: 'aprovado',   cat: 'utility',   uses: '412',  sample: 'Pedido #{{1}} confirmado! Previsão de entrega: {{2}}.' },
    { name: 'cobranca_amistosa',   status: 'aprovado',   cat: 'utility',   uses: '87',   sample: 'Olá {{1}}, identificamos que sua fatura #{{2}} venceu. Deseja regularizar?' },
    { name: 'promocao_segunda',    status: 'em_revisao', cat: 'marketing', uses: '—',    sample: 'É segunda? É segunda do PIZZÃO! Pizza grande por R$ {{1}}.' },
    { name: 'aniversario_cliente', status: 'rejeitado',  cat: 'marketing', uses: '—',    sample: 'Feliz aniversário, {{1}}! Te demos um cupom: {{2}}.' },
  ];
  return (
    <SettingsCard
      title="Modelos de mensagem (templates)"
      sub="Templates aprovados pela Meta para uso no WhatsApp Business"
      extra={<button className="btn-primary"><Icon name="plus" size={13} /> Novo template</button>}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {templates.map(t => (
          <div key={t.name} className="template-row">
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                <span style={{ fontFamily: 'var(--font-mono, monospace)', fontWeight: 700, color: 'var(--g-900)' }}>{t.name}</span>
                <span className={`badge ${t.status === 'aprovado' ? 'badge-green' : t.status === 'em_revisao' ? 'badge-amber' : 'badge-red'}`} style={{ fontSize: 10 }}>{t.status}</span>
                <span style={{ fontSize: 10, color: 'var(--g-500)', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }}>{t.cat}</span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--g-600)', fontStyle: 'italic' }}>"{t.sample}"</div>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ fontSize: 11, color: 'var(--g-500)' }}>usos</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--g-900)' }}>{t.uses}</div>
            </div>
          </div>
        ))}
      </div>
    </SettingsCard>
  );
};

const RulesSettings = () => {
  const rules = [
    { name: 'WhatsApp → DELI',     when: 'mensagem chega no WhatsApp',       then: 'roteia para DELI · triagem inicial',          on: true  },
    { name: 'iFood → CORA',        when: 'pedido marcado como reclamação',   then: 'cria protocolo + aciona CORA',                on: true  },
    { name: 'Vendas qualificadas', when: 'DELI detecta intenção de compra',  then: 'transfere para departamento Vendas (humano)', on: true  },
    { name: 'Cobrança automática', when: 'fatura vence + 1 dia',             then: 'CORA envia cobrança amistosa',                on: true  },
    { name: 'SLA de pico',         when: 'horário entre 19h–21h',            then: 'aumenta prioridade e notifica supervisor',    on: false },
  ];
  return (
    <SettingsCard
      title="Regras de roteamento"
      sub="Automações: o que acontece quando determinados eventos ocorrem"
      extra={<button className="btn-primary"><Icon name="plus" size={13} /> Nova regra</button>}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {rules.map(r => (
          <div key={r.name} className="rule-row">
            <Toggle defaultOn={r.on} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, color: 'var(--g-900)', marginBottom: 4 }}>{r.name}</div>
              <div style={{ fontSize: 12, color: 'var(--g-500)' }}>
                <strong style={{ color: '#B70C00' }}>SE</strong> {r.when} <strong style={{ color: 'var(--g-700)' }}>→</strong> <strong style={{ color: '#B70C00' }}>ENTÃO</strong> {r.then}
              </div>
            </div>
            <button className="btn-ghost"><Icon name="settings" size={14} /></button>
          </div>
        ))}
      </div>
    </SettingsCard>
  );
};

const BillingSettings = () => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
    <SettingsCard title="Plano atual">
      <div style={{ display: 'flex', alignItems: 'center', gap: 24, padding: 16, background: 'linear-gradient(135deg, #0D0D0D, #1A1A1A)', borderRadius: 12, color: 'white' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--red-light, #FF8A82)', letterSpacing: 1, textTransform: 'uppercase' }}>Plano Pro IA</div>
          <div style={{ fontSize: 28, fontWeight: 800, marginTop: 4 }}>R$ 489 <span style={{ fontSize: 14, opacity: 0.7, fontWeight: 400 }}>/mês</span></div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 6 }}>5 superagentes · 10 humanos · 50k mensagens/mês</div>
        </div>
        <button className="btn-primary" style={{ background: 'white', color: '#0D0D0D' }}>Alterar plano</button>
      </div>
    </SettingsCard>
    <SettingsCard title="Uso de créditos IA neste ciclo" sub="Renovação em 14 dias">
      {[
        { label: 'Mensagens DELI',    used: 18420, max: 30000, color: '#B70C00' },
        { label: 'Recuperações CORA', used: 87,    max: 200,   color: '#F59E0B' },
        { label: 'Análises MAX',      used: 142,   max: 500,   color: '#3B82F6' },
        { label: 'Posts LARA',        used: 22,    max: 50,    color: '#10B981' },
      ].map(u => {
        const pct = (u.used / u.max) * 100;
        return (
          <div key={u.label} style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
              <span style={{ color: 'var(--g-700)' }}>{u.label}</span>
              <span style={{ fontWeight: 700 }}>{u.used.toLocaleString('pt-BR')} / {u.max.toLocaleString('pt-BR')}</span>
            </div>
            <div style={{ height: 8, background: '#F3F4F6', borderRadius: 99 }}>
              <div style={{ height: '100%', width: `${pct}%`, background: u.color, borderRadius: 99 }} />
            </div>
          </div>
        );
      })}
    </SettingsCard>
    <SettingsCard title="Histórico de faturas">
      <table className="crm-table">
        <thead><tr><th>Mês</th><th>Valor</th><th>Status</th><th></th></tr></thead>
        <tbody>
          {['Abril 2026', 'Março 2026', 'Fevereiro 2026', 'Janeiro 2026'].map(m => (
            <tr key={m}>
              <td style={{ fontWeight: 600 }}>{m}</td>
              <td><strong>R$ 489,00</strong></td>
              <td><span className="badge badge-green">pago</span></td>
              <td><button className="btn-ghost" style={{ fontSize: 12 }}>Baixar PDF</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </SettingsCard>
  </div>
);

const SecuritySettings = () => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
    <SettingsCard title="Autenticação">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <ToggleRow label="Autenticação em dois fatores (2FA)" sub="Exige código por SMS ou app autenticador" on />
        <ToggleRow label="Login com Google"   sub="Permitir que membros entrem usando conta Google" on />
        <ToggleRow label="Sessão única"       sub="Um membro só pode estar logado em um dispositivo por vez" />
      </div>
    </SettingsCard>
    <SettingsCard title="Privacidade & dados">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <ToggleRow label="Mascarar dados sensíveis" sub="Esconde CPF, cartão e endereço nas conversas" on />
        <ToggleRow label="Auditoria de ações" sub="Registra todas as ações de admin (ver no log)" on />
        <ToggleRow label="Exportar tudo (LGPD)" sub="Permite exportar todos os dados de um cliente sob demanda" on />
      </div>
    </SettingsCard>
    <SettingsCard title="Zona de perigo">
      <div className="danger-row">
        <div>
          <div style={{ fontWeight: 700, color: 'var(--g-900)' }}>Excluir espaço de trabalho</div>
          <div style={{ fontSize: 12, color: 'var(--g-500)', marginTop: 4 }}>Esta ação é permanente e remove todos os dados, conversas e clientes.</div>
        </div>
        <button className="btn-secondary" style={{ borderColor: '#EF4444', color: '#EF4444' }}>Excluir espaço</button>
      </div>
    </SettingsCard>
  </div>
);

const SettingsCard = ({ title, sub, extra, children }) => (
  <div className="card" style={{ padding: 20 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, gap: 16 }}>
      <div>
        <h3 style={{ fontSize: 15, fontWeight: 800, color: 'var(--g-900)', margin: 0 }}>{title}</h3>
        {sub && <div style={{ fontSize: 12, color: 'var(--g-500)', marginTop: 4 }}>{sub}</div>}
      </div>
      {extra}
    </div>
    {children}
  </div>
);

const FormRow = ({ label, children }) => (
  <div>
    <div style={{ fontSize: 11, color: 'var(--g-500)', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600, marginBottom: 6 }}>{label}</div>
    {children}
  </div>
);

const Toggle = ({ defaultOn = false }) => {
  const [on, setOn] = useState(defaultOn);
  return (
    <button
      onClick={() => setOn(!on)}
      style={{
        width: 38, height: 22, borderRadius: 99, border: 'none', padding: 0,
        background: on ? '#10B981' : '#D1D5DB',
        position: 'relative', cursor: 'pointer', transition: 'background 200ms',
        flexShrink: 0,
      }}
    >
      <span style={{
        position: 'absolute', top: 2, left: on ? 18 : 2,
        width: 18, height: 18, borderRadius: '50%', background: 'white',
        transition: 'left 200ms', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
      }} />
    </button>
  );
};

const ToggleRow = ({ label, sub, on }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
    <Toggle defaultOn={on} />
    <div>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--g-900)' }}>{label}</div>
      <div style={{ fontSize: 11, color: 'var(--g-500)', marginTop: 2 }}>{sub}</div>
    </div>
  </div>
);

export default SettingsScreen;
