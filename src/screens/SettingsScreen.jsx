import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase.js';
import Icon from '../components/Icon.jsx';
import UserAvatar from '../components/UserAvatar.jsx';
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
          {section === 'users'        && <UsersSettings tenantDbId={tenantDbId} />}
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

const ROLE_LABEL = { owner: 'Dono', admin: 'Admin', consultor: 'Consultor', operador: 'Operador', dev: 'Dev' };
const ROLE_BADGE = { owner: 'badge-red', admin: 'badge-red', dev: 'badge-purple', consultor: 'badge-gray', operador: 'badge-gray' };

// moduleKey = id equivalente em tenant_modules (ver src/console/moduleCatalog.js).
// Usado para esconder telas não habilitadas para o tenant (Console → Clientes → "Telas").
const ALL_SCREENS = [
  { id: 'dashboard',        label: 'Dashboard',       group: 'Início',      moduleKey: 'visao' },
  { id: 'deli',             label: 'DELI',            group: 'Início',      defaultRoles: ['admin','deli_owner'], moduleKey: 'deli' },
  { id: 'chat',             label: 'Chat Ao Vivo',    group: 'Operação',    defaultRoles: ['admin','atendimento','marketing'], moduleKey: 'chat' },
  { id: 'lojas',            label: 'Lojas',           group: 'Operação',    moduleKey: 'lojas' },
  { id: 'crm',              label: 'Clientes',        group: 'Operação',    defaultRoles: ['admin','marketing'], moduleKey: 'crm' },
  { id: 'contratos',        label: 'Contratos',       group: 'Operação',    defaultRoles: ['admin'], moduleKey: 'contratos' },
  { id: 'recontratacao',    label: 'Re-contratação',  group: 'Operação',    defaultRoles: ['admin'], moduleKey: 'recontratacao' },
  { id: 'tarefas',          label: 'Todas Tarefas',   group: 'Operação',    defaultRoles: ['admin'], moduleKey: 'tarefas' },
  { id: 'tarefas-clientes', label: 'Espaços',         group: 'Operação',    defaultRoles: ['admin','marketing'], moduleKey: 'espacos' },
  { id: 'onboarding',       label: 'Onboarding',      group: 'Operação',    defaultRoles: ['admin','atendimento','marketing'], moduleKey: 'onboarding' },
  { id: 'agents',           label: 'Painel Agentes',  group: 'Agentes IA',  defaultRoles: ['admin'], moduleKey: 'hub' },
  { id: 'campanhas',        label: 'Campanhas',       group: 'Marketing',   defaultRoles: ['admin','marketing'], moduleKey: 'campanhas' },
  { id: 'drafts-pendentes', label: 'Disparos',        group: 'Marketing',   defaultRoles: ['admin','marketing'], moduleKey: 'disparos' },
  { id: 'reports',          label: 'Relatórios',      group: 'Dados',       defaultRoles: ['admin','marketing'], moduleKey: 'relatorios' },
  { id: 'notificacoes',     label: 'Notificações',    group: 'Sistema',     moduleKey: 'notificacoes' },
  { id: 'grupos',           label: 'Grupos WhatsApp', group: 'Admin',       defaultRoles: ['admin','atendimento'], moduleKey: 'grupos' },
  { id: 'settings',         label: 'Configurações',   group: 'Admin',       defaultRoles: ['admin'], moduleKey: 'configsys' },
];

function relativeTime(ts) {
  if (!ts) return '—';
  const diff = Date.now() - new Date(ts).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 2) return 'agora';
  if (min < 60) return `há ${min}m`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h}h`;
  return `há ${Math.floor(h / 24)}d`;
}

function statusFromLastSignIn(ts) {
  if (!ts) return 'offline';
  const min = (Date.now() - new Date(ts).getTime()) / 60000;
  if (min < 10) return 'online';
  if (min < 120) return 'idle';
  return 'offline';
}

const BRIDGE_URL = import.meta.env.VITE_BRIDGE_URL || 'http://187.127.25.24:3001';

function EditNameModal({ member, tenantDbId, onClose, onSuccess }) {
  const [name, setName] = useState(member.full_name || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSave() {
    if (!name.trim()) { setError('Informe o nome'); return; }
    setSaving(true); setError('');
    const { error: err } = await supabase.rpc('update_member_display_name', {
      p_tenant_id: tenantDbId,
      p_user_id: member.user_id,
      p_display_name: name.trim(),
    });
    setSaving(false);
    if (err) { setError(err.message); return; }
    onSuccess();
    onClose();
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(28,27,26,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 14, padding: 28, boxShadow: '0 12px 40px rgba(0,0,0,0.18)', width: 380, position: 'relative' }}>
        <button onClick={onClose} style={{ position: 'absolute', top: 16, right: 16, background: 'none', border: 'none', color: 'var(--tx2)', cursor: 'pointer', fontSize: 18 }}>✕</button>
        <h3 style={{ margin: '0 0 4px', fontSize: 16, color: 'var(--tx)' }}>Editar nome</h3>
        <p style={{ margin: '0 0 20px', fontSize: 13, color: 'var(--tx2)' }}>{member.email}</p>
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Nome completo"
          style={{ width: '100%', padding: '10px 12px', background: '#faf9f8', border: '1px solid var(--line)', borderRadius: 8, color: 'var(--tx)', fontSize: 14, marginBottom: 16, boxSizing: 'border-box' }}
        />
        {error && <div style={{ marginBottom: 12, fontSize: 12, color: 'var(--red)', background: 'var(--red-soft)', padding: '8px 12px', borderRadius: 6 }}>{error}</div>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</button>
        </div>
      </div>
    </div>
  );
}

function EditRoleModal({ member, tenantDbId, onClose, onSuccess }) {
  const [role, setRole] = useState(member.role);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const roles = ['owner', 'admin', 'consultor', 'operador', 'dev'];

  async function handleSave() {
    setSaving(true); setError('');
    const { error: err } = await supabase.rpc('update_member_role', {
      p_tenant_id: tenantDbId,
      p_user_id: member.user_id,
      p_new_role: role,
    });
    setSaving(false);
    if (err) { setError(err.message); return; }
    onSuccess();
    onClose();
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(28,27,26,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 14, padding: 28, boxShadow: '0 12px 40px rgba(0,0,0,0.18)', width: 380, position: 'relative' }}>
        <button onClick={onClose} style={{ position: 'absolute', top: 16, right: 16, background: 'none', border: 'none', color: 'var(--tx2)', cursor: 'pointer', fontSize: 18 }}>✕</button>
        <h3 style={{ margin: '0 0 4px', fontSize: 16, color: 'var(--tx)' }}>Editar permissão</h3>
        <p style={{ margin: '0 0 20px', fontSize: 13, color: 'var(--tx2)' }}>{member.full_name}</p>
        <select value={role} onChange={e => setRole(e.target.value)} style={{ width: '100%', padding: '10px 12px', background: '#faf9f8', border: '1px solid var(--line)', borderRadius: 8, color: 'var(--tx)', fontSize: 14, marginBottom: 16 }}>
          {roles.map(r => <option key={r} value={r}>{ROLE_LABEL[r] || r}</option>)}
        </select>
        {error && <div style={{ marginBottom: 12, fontSize: 12, color: 'var(--red)', background: 'var(--red-soft)', padding: '8px 12px', borderRadius: 6 }}>{error}</div>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</button>
        </div>
      </div>
    </div>
  );
}

function RemoveUserModal({ member, tenantDbId, onClose, onSuccess }) {
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState('');

  async function handleRemove() {
    setRemoving(true); setError('');
    const { error: err } = await supabase.rpc('remove_tenant_member', {
      p_tenant_id: tenantDbId,
      p_user_id: member.user_id,
    });
    setRemoving(false);
    if (err) { setError(err.message); return; }
    onSuccess();
    onClose();
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(28,27,26,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 14, padding: 28, boxShadow: '0 12px 40px rgba(0,0,0,0.18)', width: 380, position: 'relative' }}>
        <button onClick={onClose} style={{ position: 'absolute', top: 16, right: 16, background: 'none', border: 'none', color: 'var(--tx2)', cursor: 'pointer', fontSize: 18 }}>✕</button>
        <h3 style={{ margin: '0 0 4px', fontSize: 16, color: 'var(--tx)' }}>Remover usuário</h3>
        <p style={{ margin: '0 0 20px', fontSize: 13, color: 'var(--tx2)' }}>Tem certeza que deseja remover <strong style={{ color: 'var(--tx)' }}>{member.full_name}</strong> do tenant? Esta ação não pode ser desfeita.</p>
        {error && <div style={{ marginBottom: 12, fontSize: 12, color: 'var(--red)', background: 'var(--red-soft)', padding: '8px 12px', borderRadius: 6 }}>{error}</div>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn-ghost" onClick={onClose}>Cancelar</button>
          <button style={{ padding: '8px 16px', background: 'var(--red)', border: 'none', borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }} onClick={handleRemove} disabled={removing}>{removing ? 'Removendo...' : 'Remover'}</button>
        </div>
      </div>
    </div>
  );
}

function InviteUserModal({ tenantDbId, onClose, onSuccess }) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('consultor');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const invitableRoles = ['admin', 'consultor', 'operador', 'dev'];

  async function handleInvite() {
    if (!email.trim()) { setError('Informe o e-mail'); return; }
    setSaving(true); setError('');
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(`${BRIDGE_URL}/api/users/invite`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ email: email.trim(), role, tenant_id: tenantDbId }),
    });
    let json;
    try { json = await res.json(); } catch { json = {}; }
    setSaving(false);
    if (!res.ok) { setError(json.error || 'Erro ao enviar convite'); return; }
    onSuccess();
    onClose();
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(28,27,26,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 14, padding: 28, boxShadow: '0 12px 40px rgba(0,0,0,0.18)', width: 400, position: 'relative' }}>
        <button onClick={onClose} style={{ position: 'absolute', top: 16, right: 16, background: 'none', border: 'none', color: 'var(--tx2)', cursor: 'pointer', fontSize: 18 }}>✕</button>
        <h3 style={{ margin: '0 0 4px', fontSize: 16, color: 'var(--tx)' }}>Convidar usuário</h3>
        <p style={{ margin: '0 0 20px', fontSize: 13, color: 'var(--tx2)' }}>O convite será enviado por e-mail.</p>
        <input type="email" placeholder="email@empresa.com" value={email} onChange={e => setEmail(e.target.value)} style={{ width: '100%', padding: '10px 12px', background: '#faf9f8', border: '1px solid var(--line)', borderRadius: 8, color: 'var(--tx)', fontSize: 14, marginBottom: 12, boxSizing: 'border-box' }} />
        <select value={role} onChange={e => setRole(e.target.value)} style={{ width: '100%', padding: '10px 12px', background: '#faf9f8', border: '1px solid var(--line)', borderRadius: 8, color: 'var(--tx)', fontSize: 14, marginBottom: 16 }}>
          {invitableRoles.map(r => <option key={r} value={r}>{ROLE_LABEL[r] || r}</option>)}
        </select>
        {error && <div style={{ marginBottom: 12, fontSize: 12, color: 'var(--red)', background: 'var(--red-soft)', padding: '8px 12px', borderRadius: 6 }}>{error}</div>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" onClick={handleInvite} disabled={saving}>{saving ? 'Enviando...' : 'Enviar convite'}</button>
        </div>
      </div>
    </div>
  );
}

function ScreenPermissionsModal({ member, tenantDbId, onClose }) {
  const [perms, setPerms] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(null);
  const [allowedModules, setAllowedModules] = useState(null); // null = sem allowlist → tudo liberado

  useEffect(() => {
    supabase.rpc('get_user_screen_permissions', {
      p_tenant_id: tenantDbId,
      p_user_id: member.user_id,
    }).then(({ data }) => {
      const map = {};
      (data || []).forEach(row => { map[row.screen_id] = row.allowed; });
      setPerms(map);
      setLoading(false);
    });
    supabase.from('tenant_modules').select('module_key, enabled').eq('tenant_id', tenantDbId).then(({ data }) => {
      if (!data || data.length === 0) { setAllowedModules(null); return; }
      setAllowedModules(new Set(data.filter(r => r.enabled).map(r => r.module_key)));
    });
  }, [member.user_id, tenantDbId]);

  async function toggle(screenId, roleDefault) {
    const current = perms[screenId];
    const newValue = current !== undefined ? !current : !roleDefault;
    setSaving(screenId);
    await supabase.rpc('set_user_screen_permission', {
      p_tenant_id: tenantDbId,
      p_user_id: member.user_id,
      p_screen_id: screenId,
      p_allowed: newValue,
    });
    setPerms(prev => ({ ...prev, [screenId]: newValue }));
    setSaving(null);
  }

  const visibleScreens = ALL_SCREENS.filter(s => !allowedModules || !s.moduleKey || allowedModules.has(s.moduleKey));
  const groups = visibleScreens.reduce((acc, s) => {
    (acc[s.group] = acc[s.group] || []).push(s);
    return acc;
  }, {});

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(28,27,26,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 14, padding: 28, boxShadow: '0 12px 40px rgba(0,0,0,0.18)', width: 520, maxHeight: '80vh', overflow: 'auto', position: 'relative' }}>
        <button onClick={onClose} style={{ position: 'absolute', top: 16, right: 16, background: 'none', border: 'none', color: 'var(--tx2)', cursor: 'pointer', fontSize: 18 }}>✕</button>
        <h3 style={{ margin: '0 0 4px', fontSize: 16, color: 'var(--tx)' }}>Acesso às telas</h3>
        <p style={{ margin: '0 0 20px', fontSize: 13, color: 'var(--tx2)' }}>
          {member.full_name} · <span style={{ color: 'var(--tx2)' }}>{ROLE_LABEL[member.role] || member.role}</span>
        </p>
        {loading ? (
          <div style={{ color: 'var(--tx2)', fontSize: 13, textAlign: 'center', padding: 40 }}>Carregando...</div>
        ) : (
          Object.entries(groups).map(([group, screens]) => (
            <div key={group}>
              <div style={{ fontSize: 11, color: 'var(--g-500)', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 20, marginBottom: 8 }}>{group}</div>
              {screens.map(screen => {
                const roleDefault = !screen.defaultRoles || screen.defaultRoles.includes(member.role);
                const explicit = perms[screen.id];
                const effective = explicit !== undefined ? explicit : roleDefault;
                const hasOverride = explicit !== undefined;
                return (
                  <div key={screen.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--line)' }}>
                    <div>
                      <div style={{ fontSize: 13, color: effective ? 'var(--tx)' : 'var(--tx2)' }}>{screen.label}</div>
                      <div style={{ fontSize: 11, color: 'var(--g-600)', marginTop: 2 }}>
                        {hasOverride ? (explicit !== roleDefault ? '⚡ override manual' : '✓ explícito') : 'padrão do cargo'}
                      </div>
                    </div>
                    <button
                      onClick={() => toggle(screen.id, roleDefault)}
                      disabled={saving === screen.id}
                      style={{
                        width: 44, height: 24, borderRadius: 12, flexShrink: 0,
                        background: effective ? 'var(--green)' : '#d1d5db',
                        border: 'none', cursor: 'pointer', position: 'relative', transition: 'background 0.15s',
                        opacity: saving === screen.id ? 0.6 : 1,
                      }}
                    >
                      <div style={{
                        width: 16, height: 16, borderRadius: '50%', background: '#fff',
                        position: 'absolute', top: 4, left: effective ? 24 : 4, transition: 'left 0.15s',
                      }} />
                    </button>
                  </div>
                );
              })}
            </div>
          ))
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 24 }}>
          <button className="btn-ghost" onClick={onClose}>Fechar</button>
        </div>
      </div>
    </div>
  );
}

const UsersSettings = ({ tenantDbId }) => {
  const [team, setTeam] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeMenu, setActiveMenu] = useState(null);
  const [editingMember, setEditingMember] = useState(null);
  const [editingNameMember, setEditingNameMember] = useState(null);
  const [removingMember, setRemovingMember] = useState(null);
  const [inviting, setInviting] = useState(false);
  const [screenPermsMember, setScreenPermsMember] = useState(null);
  const palette = ['#B70C00', '#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899'];
  const dotColor = { online: '#10B981', idle: '#F59E0B', offline: '#9CA3AF' };
  const dotLabel = { online: 'online', idle: 'ausente', offline: 'offline' };

  function loadTeam() {
    if (!tenantDbId) return;
    supabase.rpc('get_tenant_members', { p_tenant_id: tenantDbId })
      .then(({ data, error }) => {
        if (!error && data) setTeam(data);
        setLoading(false);
      });
  }

  useEffect(() => { loadTeam(); }, [tenantDbId]);

  useEffect(() => {
    if (!activeMenu) return;
    const handler = () => setActiveMenu(null);
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [activeMenu]);

  return (
    <SettingsCard
      title="Usuários e equipes"
      sub={`${team.length} membro${team.length !== 1 ? 's' : ''} ativo${team.length !== 1 ? 's' : ''}`}
      extra={<button className="btn-primary" onClick={() => setInviting(true)}><Icon name="plus" size={13} /> Convidar usuário</button>}
    >
      {loading ? (
        <div style={{ padding: 24, textAlign: 'center', color: 'var(--g-400)', fontSize: 13 }}>Carregando...</div>
      ) : (
        <table className="crm-table">
          <thead><tr><th>Nome</th><th>E-mail</th><th>Permissão</th><th>Status</th><th>Última atividade</th><th></th></tr></thead>
          <tbody>
            {team.map((u, i) => {
              const name = u.full_name || u.email.split('@')[0];
              const initials = name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
              const status = statusFromLastSignIn(u.last_sign_in_at);
              return (
                <tr key={u.user_id}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 28, height: 28, borderRadius: '50%', background: palette[i % palette.length], color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 11 }}>
                        {initials}
                      </div>
                      <span style={{ fontWeight: 600 }}>{name}</span>
                    </div>
                  </td>
                  <td style={{ color: 'var(--g-500)' }}>{u.email}</td>
                  <td><span className={`badge ${ROLE_BADGE[u.role] || 'badge-gray'}`}>{ROLE_LABEL[u.role] || u.role}</span></td>
                  <td><span style={{ color: dotColor[status], fontSize: 12, fontWeight: 700 }}>● {dotLabel[status]}</span></td>
                  <td style={{ color: 'var(--g-500)', fontSize: 12 }}>{relativeTime(u.last_sign_in_at)}</td>
                  <td>
                    <div style={{ position: 'relative', display: 'inline-block' }}>
                    <button
                      onClick={e => { e.stopPropagation(); setActiveMenu(activeMenu === u.user_id ? null : u.user_id); }}
                      style={{ padding: '4px 10px', background: 'none', border: '1px solid var(--line)', borderRadius: 6, color: 'var(--tx2)', fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap' }}
                    >
                      Ações ▾
                    </button>
                    {activeMenu === u.user_id && (
                      <div style={{ position: 'absolute', right: 0, top: '100%', zIndex: 1000, background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 8, minWidth: 180, boxShadow: '0 8px 24px rgba(0,0,0,0.18)', overflow: 'hidden' }}>
                        <button
                          onClick={() => { setEditingNameMember(u); setActiveMenu(null); }}
                          style={{ display: 'block', width: '100%', padding: '10px 14px', background: 'none', border: 'none', color: 'var(--tx)', fontSize: 13, textAlign: 'left', cursor: 'pointer' }}
                        >Editar nome</button>
                        <button
                          onClick={() => { setEditingMember(u); setActiveMenu(null); }}
                          style={{ display: 'block', width: '100%', padding: '10px 14px', background: 'none', border: 'none', color: 'var(--tx)', fontSize: 13, textAlign: 'left', cursor: 'pointer' }}
                        >Editar permissão</button>
                        <button
                          onClick={() => { setScreenPermsMember(u); setActiveMenu(null); }}
                          style={{ display: 'block', width: '100%', padding: '10px 14px', background: 'none', border: 'none', color: 'var(--tx)', fontSize: 13, textAlign: 'left', cursor: 'pointer' }}
                        >Gerenciar acesso às telas</button>
                        <button
                          onClick={() => { setRemovingMember(u); setActiveMenu(null); }}
                          style={{ display: 'block', width: '100%', padding: '10px 14px', background: 'none', border: 'none', color: 'var(--red)', fontSize: 13, textAlign: 'left', cursor: 'pointer' }}
                        >Remover usuário</button>
                      </div>
                    )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {editingMember && <EditRoleModal member={editingMember} tenantDbId={tenantDbId} onClose={() => setEditingMember(null)} onSuccess={loadTeam} />}
      {editingNameMember && <EditNameModal member={editingNameMember} tenantDbId={tenantDbId} onClose={() => setEditingNameMember(null)} onSuccess={loadTeam} />}
      {removingMember && <RemoveUserModal member={removingMember} tenantDbId={tenantDbId} onClose={() => setRemovingMember(null)} onSuccess={loadTeam} />}
      {inviting && <InviteUserModal tenantDbId={tenantDbId} onClose={() => setInviting(false)} onSuccess={loadTeam} />}
      {screenPermsMember && <ScreenPermissionsModal member={screenPermsMember} tenantDbId={tenantDbId} onClose={() => setScreenPermsMember(null)} />}
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
