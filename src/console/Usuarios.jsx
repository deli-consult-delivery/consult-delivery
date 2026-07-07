import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../lib/supabase.js';
import { mapErro } from '../lib/mapErro.js';
import Icon from '../components/Icon.jsx';

const BRIDGE = import.meta.env.VITE_BRIDGE_URL || 'https://bridge.consultdelivery.com.br';

// ============================================================
// Console v2 — Gerenciamento de Usuários do Tenant
// Tela dedicada: listar membros, convidar, editar role, remover,
// gerenciar permissões de tela por usuário.
// Props: tenantDbId, userId
// ============================================================

const ROLE_LABEL = {
  owner:     'Proprietário',
  admin:     'Administrador',
  consultor: 'Colaborador',
  operador:  'Operador',
  dev:       'Dev',
};

const ROLE_BADGE = {
  owner:     'badge-red',
  admin:     'badge-red',
  dev:       'badge-purple',
  consultor: 'badge-green',
  operador:  'badge-gray',
};

const ROLE_DESC = {
  owner:     'Acesso total e pode transferir propriedade',
  admin:     'Acesso total exceto transferir propriedade',
  consultor: 'Acesso às operações do dia a dia',
  operador:  'Acesso limitado às operações básicas',
  dev:       'Acesso técnico e de desenvolvimento',
};

const INVITABLE_ROLES = ['admin', 'consultor', 'operador', 'dev'];

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
  { id: 'grupos',           label: 'WhatsApp: Grupos', group: 'Admin',       defaultRoles: ['admin','atendimento'], moduleKey: 'grupos' },
  { id: 'settings',         label: 'Configurações',   group: 'Admin',       defaultRoles: ['admin'], moduleKey: 'configsys' },
  // Adicionado 2026-07-01 (QA go-live Karina): faltavam telas de Avaliações + Usuários,
  // então o modal de permissões ficava quase vazio pra tenants sem os módulos "clássicos".
  { id: 'csat',                  label: 'Satisfação do Atendimento (CSAT)', group: 'Avaliações', moduleKey: 'csat' },
  { id: 'nps',                   label: 'Lealdade da Marca (NPS)',          group: 'Avaliações', moduleKey: 'nps' },
  { id: 'controle-atendimentos', label: 'Controle de Atendimento',         group: 'Avaliações', moduleKey: 'controle-atendimentos' },
  { id: 'avaliacao-config',      label: 'Configurações de Avaliação',      group: 'Avaliações', moduleKey: 'avaliacao-config' },
  { id: 'usuarios',              label: 'Usuários e Equipe', group: 'Sistema', defaultRoles: ['admin'], moduleKey: 'usuarios' },
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
  if (!ts) return 'pending';
  const min = (Date.now() - new Date(ts).getTime()) / 60000;
  if (min < 10) return 'online';
  if (min < 120) return 'idle';
  return 'offline';
}

const STATUS_COLOR = { online: '#10B981', idle: '#F59E0B', offline: '#9CA3AF', pending: '#6366F1' };
const STATUS_LABEL = { online: 'Online', idle: 'Ausente', offline: 'Offline', pending: 'Convite pendente' };

const PALETTE = ['#B70C00', '#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899'];

// ─── Modal: Convidar usuário ─────────────────────────────────

function InviteModal({ tenantDbId, onClose, onSuccess }) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('consultor');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleInvite() {
    if (!email.trim()) { setError('Informe o e-mail'); return; }
    setSaving(true); setError('');
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setSaving(false); setError('Sessão expirada. Recarregue a página.'); return; }
    const res = await fetch(`${BRIDGE}/api/users/invite`, {
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
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(28,27,26,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 16, padding: 32, boxShadow: '0 16px 48px rgba(0,0,0,0.2)', width: 440, position: 'relative' }}>
        <button onClick={onClose} style={{ position: 'absolute', top: 16, right: 16, background: 'none', border: 'none', color: 'var(--tx2)', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>✕</button>
        <h3 style={{ margin: '0 0 4px', fontSize: 17, color: 'var(--tx)', fontWeight: 700 }}>Convidar colaborador</h3>
        <p style={{ margin: '0 0 24px', fontSize: 13, color: 'var(--tx2)' }}>Um link de acesso será enviado por e-mail.</p>

        <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--tx2)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 6 }}>E-mail</label>
        <input
          type="email"
          placeholder="nome@empresa.com"
          value={email}
          onChange={e => setEmail(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleInvite()}
          autoFocus
          style={{ width: '100%', padding: '10px 12px', background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: 8, color: 'var(--tx)', fontSize: 14, marginBottom: 16, boxSizing: 'border-box' }}
        />

        <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--tx2)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 6 }}>Nível de acesso</label>
        <select
          value={role}
          onChange={e => setRole(e.target.value)}
          style={{ width: '100%', padding: '10px 12px', background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: 8, color: 'var(--tx)', fontSize: 14, marginBottom: 8 }}
        >
          {INVITABLE_ROLES.map(r => (
            <option key={r} value={r}>{ROLE_LABEL[r] || r}</option>
          ))}
        </select>
        <p style={{ margin: '0 0 20px', fontSize: 12, color: 'var(--tx2)' }}>{ROLE_DESC[role]}</p>

        {error && (
          <div style={{ marginBottom: 16, fontSize: 12, color: 'var(--red)', background: 'var(--red-soft)', padding: '10px 12px', borderRadius: 8 }}>{error}</div>
        )}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="cv2-btn sec" onClick={onClose}>Cancelar</button>
          <button className="cv2-btn" onClick={handleInvite} disabled={saving}>
            {saving ? 'Enviando...' : 'Enviar convite'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Modal: Editar role ──────────────────────────────────────

function EditRoleModal({ member, tenantDbId, onClose, onSuccess }) {
  const [role, setRole] = useState(member.role);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSave() {
    setSaving(true); setError('');
    const { error: err } = await supabase.rpc('update_member_role', {
      p_tenant_id: tenantDbId,
      p_user_id: member.user_id,
      p_new_role: role,
    });
    setSaving(false);
    if (err) { setError(mapErro(err.message)); return; }
    onSuccess();
    onClose();
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(28,27,26,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 16, padding: 32, boxShadow: '0 16px 48px rgba(0,0,0,0.2)', width: 400, position: 'relative' }}>
        <button onClick={onClose} style={{ position: 'absolute', top: 16, right: 16, background: 'none', border: 'none', color: 'var(--tx2)', cursor: 'pointer', fontSize: 18 }}>✕</button>
        <h3 style={{ margin: '0 0 4px', fontSize: 17, color: 'var(--tx)', fontWeight: 700 }}>Alterar nível de acesso</h3>
        <p style={{ margin: '0 0 20px', fontSize: 13, color: 'var(--tx2)' }}>{member.full_name || member.email}</p>
        <select
          value={role}
          onChange={e => setRole(e.target.value)}
          style={{ width: '100%', padding: '10px 12px', background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: 8, color: 'var(--tx)', fontSize: 14, marginBottom: 8 }}
        >
          {['owner', 'admin', 'consultor', 'operador', 'dev'].map(r => (
            <option key={r} value={r}>{ROLE_LABEL[r] || r}</option>
          ))}
        </select>
        <p style={{ margin: '0 0 20px', fontSize: 12, color: 'var(--tx2)' }}>{ROLE_DESC[role]}</p>
        {error && <div style={{ marginBottom: 12, fontSize: 12, color: 'var(--red)', background: 'var(--red-soft)', padding: '8px 12px', borderRadius: 6 }}>{error}</div>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="cv2-btn sec" onClick={onClose}>Cancelar</button>
          <button className="cv2-btn" onClick={handleSave} disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</button>
        </div>
      </div>
    </div>
  );
}

// ─── Modal: Editar nome ──────────────────────────────────────

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
    if (err) { setError(mapErro(err.message)); return; }
    onSuccess();
    onClose();
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(28,27,26,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 16, padding: 32, boxShadow: '0 16px 48px rgba(0,0,0,0.2)', width: 380, position: 'relative' }}>
        <button onClick={onClose} style={{ position: 'absolute', top: 16, right: 16, background: 'none', border: 'none', color: 'var(--tx2)', cursor: 'pointer', fontSize: 18 }}>✕</button>
        <h3 style={{ margin: '0 0 4px', fontSize: 17, color: 'var(--tx)', fontWeight: 700 }}>Editar nome</h3>
        <p style={{ margin: '0 0 20px', fontSize: 13, color: 'var(--tx2)' }}>{member.email}</p>
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSave()}
          placeholder="Nome completo"
          autoFocus
          style={{ width: '100%', padding: '10px 12px', background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: 8, color: 'var(--tx)', fontSize: 14, marginBottom: 16, boxSizing: 'border-box' }}
        />
        {error && <div style={{ marginBottom: 12, fontSize: 12, color: 'var(--red)', background: 'var(--red-soft)', padding: '8px 12px', borderRadius: 6 }}>{error}</div>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="cv2-btn sec" onClick={onClose}>Cancelar</button>
          <button className="cv2-btn" onClick={handleSave} disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</button>
        </div>
      </div>
    </div>
  );
}

// ─── Modal: Remover usuário ──────────────────────────────────

function RemoveModal({ member, tenantDbId, onClose, onSuccess }) {
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState('');

  async function handleRemove() {
    setRemoving(true); setError('');
    const { error: err } = await supabase.rpc('remove_tenant_member', {
      p_tenant_id: tenantDbId,
      p_user_id: member.user_id,
    });
    setRemoving(false);
    if (err) { setError(mapErro(err.message)); return; }
    onSuccess();
    onClose();
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(28,27,26,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 16, padding: 32, boxShadow: '0 16px 48px rgba(0,0,0,0.2)', width: 400, position: 'relative' }}>
        <button onClick={onClose} style={{ position: 'absolute', top: 16, right: 16, background: 'none', border: 'none', color: 'var(--tx2)', cursor: 'pointer', fontSize: 18 }}>✕</button>
        <h3 style={{ margin: '0 0 4px', fontSize: 17, color: 'var(--tx)', fontWeight: 700 }}>Remover usuário</h3>
        <p style={{ margin: '0 0 20px', fontSize: 13, color: 'var(--tx2)' }}>
          Tem certeza que deseja remover <strong style={{ color: 'var(--tx)' }}>{member.full_name || member.email}</strong>?
          Esta ação não pode ser desfeita — o usuário perderá acesso imediatamente.
        </p>
        {error && <div style={{ marginBottom: 12, fontSize: 12, color: 'var(--red)', background: 'var(--red-soft)', padding: '8px 12px', borderRadius: 6 }}>{error}</div>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="cv2-btn sec" onClick={onClose}>Cancelar</button>
          <button
            onClick={handleRemove}
            disabled={removing}
            style={{ padding: '8px 18px', background: '#DC2626', border: 'none', borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: removing ? 0.7 : 1 }}
          >
            {removing ? 'Removendo...' : 'Remover'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Modal: Permissões de tela ───────────────────────────────

function ScreenPermsModal({ member, tenantDbId, onClose }) {
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
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(28,27,26,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 16, padding: 32, boxShadow: '0 16px 48px rgba(0,0,0,0.2)', width: 540, maxHeight: '82vh', display: 'flex', flexDirection: 'column', position: 'relative' }}>
        <button onClick={onClose} style={{ position: 'absolute', top: 16, right: 16, background: 'none', border: 'none', color: 'var(--tx2)', cursor: 'pointer', fontSize: 18 }}>✕</button>
        <h3 style={{ margin: '0 0 4px', fontSize: 17, color: 'var(--tx)', fontWeight: 700 }}>Acesso às telas</h3>
        <p style={{ margin: '0 0 20px', fontSize: 13, color: 'var(--tx2)' }}>
          {member.full_name || member.email} ·{' '}
          <span className={`cv2-bdg ${ROLE_BADGE[member.role] || 'badge-gray'}`} style={{ fontSize: 11 }}>
            {ROLE_LABEL[member.role] || member.role}
          </span>
        </p>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loading ? (
            <div style={{ color: 'var(--tx2)', fontSize: 13, textAlign: 'center', padding: 40 }}>Carregando...</div>
          ) : (
            Object.entries(groups).map(([group, screens]) => (
              <div key={group}>
                <div style={{ fontSize: 11, color: 'var(--tx2)', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 20, marginBottom: 8, fontWeight: 600 }}>{group}</div>
                {screens.map(screen => {
                  const roleDefault = !screen.defaultRoles || screen.defaultRoles.includes(member.role);
                  const explicit = perms[screen.id];
                  const effective = explicit !== undefined ? explicit : roleDefault;
                  const hasOverride = explicit !== undefined;
                  return (
                    <div key={screen.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--line)' }}>
                      <div>
                        <div style={{ fontSize: 13, color: effective ? 'var(--tx)' : 'var(--tx2)' }}>{screen.label}</div>
                        <div style={{ fontSize: 11, color: 'var(--tx2)', marginTop: 2 }}>
                          {hasOverride ? (explicit !== roleDefault ? 'override manual' : 'explícito') : 'padrão do cargo'}
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
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--line)' }}>
          <button className="cv2-btn sec" onClick={onClose}>Fechar</button>
        </div>
      </div>
    </div>
  );
}

// ─── Tela principal ──────────────────────────────────────────

// ─── Onboarding self-service: agência cria loja (tenant_type='store') filha ───
// Só aparece quando o tenant atual é uma agência (fetch de tenant_type abaixo).
// Backend: POST /tenants/create-store (cria + semeia RBAC) seguido do convite
// já existente (POST /users/invite) — reaproveita 100% do fluxo de convite.
function CriarLojaCard({ tenantDbId, onCreated }) {
  const [aberto, setAberto] = useState(false);
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);
  const [erro, setErro] = useState(null);

  async function criar() {
    setErro(null); setMsg(null);
    if (nome.trim().length < 2) { setErro('Informe o nome da loja.'); return; }
    if (!email.trim().includes('@')) { setErro('Informe um e-mail válido para o admin da loja.'); return; }
    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` };

      const resCriar = await fetch(`${BRIDGE}/api/tenants/create-store`, {
        method: 'POST', headers,
        body: JSON.stringify({ nome: nome.trim(), parent_tenant_id: tenantDbId }),
      });
      const jCriar = await resCriar.json().catch(() => ({}));
      if (!resCriar.ok) throw new Error(jCriar.error || `falha ao criar loja (${resCriar.status})`);

      const resConvite = await fetch(`${BRIDGE}/api/users/invite`, {
        method: 'POST', headers,
        body: JSON.stringify({ email: email.trim(), role: 'admin', tenant_id: jCriar.tenant_id }),
      });
      const jConvite = await resConvite.json().catch(() => ({}));
      const conviteMsg = resConvite.ok
        ? `convite enviado para ${email.trim()}`
        : `loja criada, mas o convite falhou: ${jConvite.error || resConvite.status} (reenvie pela tela "Usuários e equipe" da nova loja)`;

      setMsg(`Loja "${nome.trim()}" criada (slug "${jCriar.slug}") — ${conviteMsg}.`);
      setNome(''); setEmail(''); setAberto(false);
      onCreated?.();
    } catch (err) {
      setErro(err?.message || 'falha ao criar loja');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="cv2-card" style={{ marginBottom: 20 }}>
      {!aberto ? (
        <button className="cv2-btn sec" onClick={() => { setAberto(true); setMsg(null); setErro(null); }}>
          + Nova loja (self-service)
        </button>
      ) : (
        <>
          <div style={{ fontWeight: 700, marginBottom: 10 }}>Criar loja + convidar admin</div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11, color: 'var(--tx2)' }}>
              Nome da loja
              <input value={nome} onChange={e => setNome(e.target.value)} placeholder="Pizzaria do Zé" style={{ minWidth: 220 }} />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11, color: 'var(--tx2)' }}>
              E-mail do admin da loja
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="dono@loja.com" style={{ minWidth: 240 }} />
            </label>
            <button className="cv2-btn" onClick={criar} disabled={saving}>{saving ? 'Criando…' : 'Criar e convidar'}</button>
            <button className="cv2-btn sec" onClick={() => setAberto(false)} disabled={saving}>Cancelar</button>
          </div>
        </>
      )}
      {msg && <div style={{ marginTop: 10, color: 'var(--green)', fontSize: 13 }}>✓ {msg}</div>}
      {erro && <div style={{ marginTop: 10, color: 'var(--red)', fontSize: 13 }}>⚠ {erro}</div>}
    </div>
  );
}

export default function Usuarios({ tenantDbId, userId }) {
  const [members, setMembers] = useState([]);
  const [tenantType, setTenantType] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeMenu, setActiveMenu] = useState(null);
  const [menuPos, setMenuPos] = useState(null);
  const [inviting, setInviting] = useState(false);
  const [editingRole, setEditingRole] = useState(null);
  const [editingName, setEditingName] = useState(null);
  const [removing, setRemoving] = useState(null);
  const [screenPerms, setScreenPerms] = useState(null);
  const [resendingId, setResendingId] = useState(null);
  const [resendMsg, setResendMsg] = useState(null);
  const [search, setSearch] = useState('');

  function loadMembers() {
    if (!tenantDbId) return;
    supabase.rpc('get_tenant_members', { p_tenant_id: tenantDbId })
      .then(({ data, error }) => {
        if (!error && data) setMembers(data);
        setLoading(false);
      });
  }

  useEffect(() => { loadMembers(); }, [tenantDbId]);

  async function reenviarConvite(member) {
    setResendingId(member.user_id); setResendMsg(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${BRIDGE}/api/users/resend-invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ email: member.email, tenant_id: tenantDbId }),
      });
      const json = await res.json().catch(() => ({}));
      setResendMsg(res.ok
        ? { type: 'ok', text: `Convite reenviado para ${member.email}.` }
        : { type: 'erro', text: json.error || `Falha ao reenviar (${res.status})` });
    } catch (err) {
      setResendMsg({ type: 'erro', text: err?.message || 'Falha ao reenviar convite' });
    } finally {
      setResendingId(null);
    }
  }

  useEffect(() => {
    if (!tenantDbId) return;
    supabase.from('tenants').select('tenant_type').eq('id', tenantDbId).single()
      .then(({ data }) => setTenantType(data?.tenant_type ?? null));
  }, [tenantDbId]);

  useEffect(() => {
    if (!activeMenu) return;
    const handler = () => setActiveMenu(null);
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [activeMenu]);

  const filtered = members.filter(m => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (m.full_name || '').toLowerCase().includes(q) ||
      (m.email || '').toLowerCase().includes(q) ||
      (ROLE_LABEL[m.role] || m.role || '').toLowerCase().includes(q)
    );
  });

  const counts = members.reduce((acc, m) => {
    const s = statusFromLastSignIn(m.last_sign_in_at);
    acc[s] = (acc[s] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="route-enter" style={{ padding: '28px 32px 56px', maxWidth: 1200, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 28, gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 className="page-h1">Usuários e equipe</h1>
          <p className="page-sub">Convide colaboradores, defina cargos e controle o acesso a cada tela</p>
        </div>
        <button className="cv2-btn" onClick={() => setInviting(true)}>
          <Icon name="plus" size={14} /> Convidar colaborador
        </button>
      </div>

      {tenantType === 'agency' && <CriarLojaCard tenantDbId={tenantDbId} onCreated={loadMembers} />}

      {resendMsg && (
        <div className="cv2-card" style={{ marginBottom: 16, color: resendMsg.type === 'ok' ? 'var(--green)' : 'var(--red)', fontSize: 13 }}>
          {resendMsg.type === 'ok' ? '✓' : '⚠'} {resendMsg.text}
        </div>
      )}

      {/* Métricas rápidas */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12, marginBottom: 28 }}>
        {[
          { label: 'Total', value: members.length, color: 'var(--tx)' },
          { label: 'Online agora', value: counts.online || 0, color: '#10B981' },
          { label: 'Ausente', value: counts.idle || 0, color: '#F59E0B' },
          { label: 'Convite pendente', value: counts.pending || 0, color: '#6366F1' },
        ].map(stat => (
          <div key={stat.label} className="cv2-card" style={{ padding: '14px 18px' }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: stat.color }}>{stat.value}</div>
            <div style={{ fontSize: 12, color: 'var(--tx2)', marginTop: 2 }}>{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Barra de busca */}
      <div style={{ marginBottom: 16 }}>
        <input
          type="text"
          placeholder="Buscar por nome, e-mail ou cargo..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ width: '100%', maxWidth: 360, padding: '9px 14px', background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 8, color: 'var(--tx)', fontSize: 13, boxSizing: 'border-box' }}
        />
      </div>

      {/* Tabela */}
      <div className="cv2-card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--tx2)', fontSize: 13 }}>Carregando membros...</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>👥</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--tx)', marginBottom: 6 }}>
              {search ? 'Nenhum resultado' : 'Nenhum membro ainda'}
            </div>
            <div style={{ fontSize: 13, color: 'var(--tx2)', marginBottom: 20 }}>
              {search ? 'Tente outro termo de busca' : 'Convide colaboradores para começar a trabalhar em equipe.'}
            </div>
            {!search && (
              <button className="cv2-btn" onClick={() => setInviting(true)}>
                <Icon name="plus" size={14} /> Convidar colaborador
              </button>
            )}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
          <table className="crm-table" style={{ width: '100%', minWidth: 640 }}>
            <thead>
              <tr>
                <th>Usuário</th>
                <th>E-mail</th>
                <th>Cargo</th>
                <th>Status</th>
                <th>Última atividade</th>
                <th style={{ width: 40 }}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((m, i) => {
                const name = m.full_name || m.email.split('@')[0];
                const initials = name.split(' ').filter(Boolean).map(n => n[0]).slice(0, 2).join('').toUpperCase();
                const status = statusFromLastSignIn(m.last_sign_in_at);
                const isMe = m.user_id === userId;
                return (
                  <tr key={m.user_id} style={{ background: isMe ? 'var(--panel)' : undefined }}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{
                          width: 32, height: 32, borderRadius: '50%',
                          background: PALETTE[i % PALETTE.length],
                          color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontWeight: 700, fontSize: 12, flexShrink: 0,
                        }}>
                          {initials}
                        </div>
                        <div>
                          <div style={{ fontWeight: 600, color: 'var(--tx)', fontSize: 13 }}>
                            {name}
                            {isMe && <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--tx2)', fontWeight: 400 }}>você</span>}
                          </div>
                          {m.display_name && m.display_name !== name && (
                            <div style={{ fontSize: 11, color: 'var(--tx2)' }}>{m.display_name}</div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td style={{ color: 'var(--tx2)', fontSize: 13 }}>{m.email}</td>
                    <td>
                      <span className={`cv2-bdg ${ROLE_BADGE[m.role] || 'badge-gray'}`}>
                        {ROLE_LABEL[m.role] || m.role}
                      </span>
                    </td>
                    <td>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                        <span style={{ width: 7, height: 7, borderRadius: '50%', background: STATUS_COLOR[status], flexShrink: 0 }} />
                        <span style={{ color: STATUS_COLOR[status], fontWeight: 600 }}>{STATUS_LABEL[status]}</span>
                      </span>
                    </td>
                    <td style={{ color: 'var(--tx2)', fontSize: 12 }}>{relativeTime(m.last_sign_in_at)}</td>
                    <td>
                      <div style={{ position: 'relative', display: 'inline-block' }}>
                        <button
                          onClick={e => {
                            e.stopPropagation();
                            if (activeMenu === m.user_id) { setActiveMenu(null); setMenuPos(null); return; }
                            const r = e.currentTarget.getBoundingClientRect();
                            setMenuPos({ top: r.bottom + 4, right: window.innerWidth - r.right });
                            setActiveMenu(m.user_id);
                          }}
                          style={{ padding: '5px 10px', background: 'none', border: '1px solid var(--line)', borderRadius: 6, color: 'var(--tx2)', fontSize: 18, cursor: 'pointer', lineHeight: 1 }}
                          title="Ações"
                        >
                          ⋯
                        </button>
                        {activeMenu === m.user_id && menuPos && createPortal(
                          <div style={{ position: 'fixed', top: menuPos.top, right: menuPos.right, zIndex: 1000, background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 10, minWidth: 200, boxShadow: '0 8px 28px rgba(0,0,0,0.18)', overflow: 'hidden' }}>
                            <button onClick={() => { setEditingName(m); setActiveMenu(null); }} style={menuBtnStyle}>
                              <Icon name="edit" size={13} /> Editar nome
                            </button>
                            <button onClick={() => { setEditingRole(m); setActiveMenu(null); }} style={menuBtnStyle}>
                              <Icon name="shield" size={13} /> Alterar cargo
                            </button>
                            <button onClick={() => { setScreenPerms(m); setActiveMenu(null); }} style={menuBtnStyle}>
                              <Icon name="settings" size={13} /> Permissões de tela
                            </button>
                            {status === 'pending' && (
                              <button
                                onClick={() => { reenviarConvite(m); setActiveMenu(null); }}
                                disabled={resendingId === m.user_id}
                                style={menuBtnStyle}
                              >
                                <Icon name="mail" size={13} /> {resendingId === m.user_id ? 'Reenviando…' : 'Reenviar convite'}
                              </button>
                            )}
                            {!isMe && (
                              <button onClick={() => { setRemoving(m); setActiveMenu(null); }} style={{ ...menuBtnStyle, color: 'var(--red)' }}>
                                <Icon name="trash" size={13} /> Remover usuário
                              </button>
                            )}
                          </div>,
                          document.body
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        )}
      </div>

      {/* Legenda de cargos */}
      <div className="cv2-card" style={{ marginTop: 16, padding: '16px 20px' }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--tx2)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Cargos disponíveis</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8 }}>
          {INVITABLE_ROLES.map(r => (
            <div key={r} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              <span className={`cv2-bdg ${ROLE_BADGE[r] || 'badge-gray'}`} style={{ marginTop: 1, flexShrink: 0 }}>{ROLE_LABEL[r]}</span>
              <span style={{ fontSize: 12, color: 'var(--tx2)' }}>{ROLE_DESC[r]}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Modais */}
      {inviting    && <InviteModal    tenantDbId={tenantDbId} onClose={() => setInviting(false)}    onSuccess={loadMembers} />}
      {editingRole && <EditRoleModal  member={editingRole}  tenantDbId={tenantDbId} onClose={() => setEditingRole(null)}  onSuccess={loadMembers} />}
      {editingName && <EditNameModal  member={editingName}  tenantDbId={tenantDbId} onClose={() => setEditingName(null)}  onSuccess={loadMembers} />}
      {removing    && <RemoveModal    member={removing}     tenantDbId={tenantDbId} onClose={() => setRemoving(null)}    onSuccess={loadMembers} />}
      {screenPerms && <ScreenPermsModal member={screenPerms} tenantDbId={tenantDbId} onClose={() => setScreenPerms(null)} />}
    </div>
  );
}

// ─── Estilos inline reutilizados ─────────────────────────────

const menuBtnStyle = {
  display: 'flex', alignItems: 'center', gap: 8,
  width: '100%', padding: '10px 14px',
  background: 'none', border: 'none',
  color: 'var(--tx)', fontSize: 13, textAlign: 'left', cursor: 'pointer',
};
