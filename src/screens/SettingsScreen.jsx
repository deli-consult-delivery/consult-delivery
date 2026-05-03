import { useState, useEffect } from 'react';
import Icon from '../components/Icon.jsx';
import AgentAvatar from '../components/AgentAvatar.jsx';
import UserAvatar from '../components/UserAvatar.jsx';
import { SETTINGS_DATA, AGENTS } from '../data.js';
import { supabase } from '../lib/supabase.js';
import { setWebhook, getQRCode, getInstanceStatus } from '../lib/evolution.js';

/* ─── Helpers ───────────────────────────────────────────── */
// Sempre retorna o tenant_id real do usuário logado (fonte de verdade: Supabase)
async function resolveTenantId(fallbackTenantDbId) {
  if (fallbackTenantDbId) return fallbackTenantDbId;
  try {
    const { data: { user } } = await supabase.auth.getUser();
    const { data: m, error } = await supabase
      .from('tenant_members').select('tenant_id').eq('user_id', user?.id).maybeSingle();
    if (error) { console.error('[resolveTenantId] erro:', error); }
    if (m?.tenant_id) return m.tenant_id;
  } catch (err) { console.error('[resolveTenantId] catch:', err); }
  return null;
}
/* ─── Tabs ────────────────────────────────────────────── */
const TABS = [
  { id: 'workspace',    label: 'Workspace',    icon: 'building'  },
  { id: 'users',        label: 'Usuários',     icon: 'users'     },
  { id: 'integrations', label: 'Integrações',  icon: 'refresh'   },
  { id: 'whatsapp',     label: 'WhatsApp',     icon: 'whatsapp'  },
  { id: 'agents',       label: 'Agentes IA',   icon: 'bot'       },
  { id: 'billing',      label: 'Billing',      icon: 'dollar'    },
  { id: 'security',     label: 'Segurança',    icon: 'gear'      },
];

const ROLE_MAP = {
  admin:    { label: 'Admin',     cls: 'badge-red'   },
  consultor:{ label: 'Consultor', cls: 'badge-blue'  },
  operador: { label: 'Operador',  cls: 'badge-gray'  },
  dev:      { label: 'Dev',       cls: 'badge-yellow'},
};

const SEMAFORO = {
  vermelho: { label: 'Vermelho', color: 'var(--red)',     desc: 'Aprovação explícita obrigatória' },
  amarelo:  { label: 'Amarelo',  color: 'var(--warn)',    desc: 'Propõe, Wandson aprova' },
  verde:    { label: 'Verde',    color: 'var(--success)', desc: 'Executa e reporta' },
};

const INTEGRATION_STATUS = {
  connected: { label: 'Conectado', cls: 'badge-green' },
  pending:   { label: 'Pendente',  cls: 'badge-yellow'},
  sandbox:   { label: 'Sandbox',   cls: 'badge-blue'  },
  error:     { label: 'Erro',      cls: 'badge-red'   },
};

/* ─── Main ────────────────────────────────────────────── */
export default function SettingsScreen({ tenant, tenantDbId, onTenantChange }) {
  const [tab, setTab] = useState('workspace');

  return (
    <div className="route-enter" style={{ padding: 32, maxWidth: 1200, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 className="page-h1">Configurações</h1>
        <p className="page-sub">Workspace, usuários, integrações, agentes e billing</p>
      </div>

      {/* Layout: sidebar tabs + conteúdo */}
      <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 24, alignItems: 'start' }}>

        {/* Sidebar nav */}
        <div className="card" style={{ padding: 8, position: 'sticky', top: 16 }}>
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 12px', borderRadius: 'var(--r-sm)',
                fontWeight: tab === t.id ? 700 : 500,
                fontSize: 14,
                color: tab === t.id ? 'var(--red)' : 'var(--g-700)',
                background: tab === t.id ? 'var(--red-soft)' : 'transparent',
                textAlign: 'left',
                transition: 'all 150ms var(--ease-out)',
                marginBottom: 2,
              }}
            >
              <Icon name={t.icon} size={15} style={{ color: tab === t.id ? 'var(--red)' : 'var(--g-400)' }} />
              {t.label}
            </button>
          ))}

          {/* VPS info */}
          <div style={{
            marginTop: 16, padding: '12px', borderRadius: 'var(--r-sm)',
            background: '#1a1a1a', color: 'white',
          }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: 'rgba(255,255,255,0.5)', marginBottom: 6 }}>VPS</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.85)', lineHeight: 1.5 }}>
              193.202.85.82<br />
              8GB · 6 vCPUs · 60GB<br />
              <span style={{ color: 'var(--success)', fontWeight: 600 }}>● Online</span>
            </div>
          </div>
        </div>

        {/* Content area */}
        <div>
          {tab === 'workspace'    && <TabWorkspace tenantDbId={tenantDbId} onTenantChange={onTenantChange} />}
          {tab === 'users'        && <TabUsers tenantDbId={tenantDbId} tenant={tenant} />}
          {tab === 'integrations' && <TabIntegrations />}
          {tab === 'whatsapp'     && <TabWhatsApp />}
          {tab === 'agents'       && <TabAgents />}
          {tab === 'billing'      && <TabBilling />}
          {tab === 'security'     && <TabSecurity />}
        </div>
      </div>
    </div>
  );
}

/* ─── Tab: WhatsApp ───────────────────────────────────── */
function TabWhatsApp() {
  const EVO_URL   = import.meta.env.VITE_EVOLUTION_URL;
  const EVO_KEY   = import.meta.env.VITE_EVOLUTION_KEY;
  const SUPA_URL  = import.meta.env.VITE_SUPABASE_URL;
  const WEBHOOK   = SUPA_URL ? `${SUPA_URL}/functions/v1/evolution-webhook` : '';
  const HAS_EVO   = !!(EVO_URL && EVO_KEY);

  const [instances,    setInstances]    = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [showForm,     setShowForm]     = useState(false);
  const [savingForm,   setSavingForm]   = useState(false);
  const [showQR,       setShowQR]       = useState(null); // instance_name
  const [qrData,       setQrData]       = useState(null);
  const [qrLoading,    setQrLoading]    = useState(false);
  const [form, setForm] = useState({ name: '', url: EVO_URL || '', key: '' });

  useEffect(() => {
    loadInstances();
    const interval = setInterval(pollStatuses, 30000);
    return () => clearInterval(interval);
  }, []);

  // Polling do QR code quando modal aberto
  useEffect(() => {
    if (!showQR) { setQrData(null); return; }
    fetchQR(showQR);
    const interval = setInterval(() => fetchQR(showQR), 5000);
    return () => clearInterval(interval);
  }, [showQR]);

  async function loadInstances() {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('evolution_instances')
        .select('*')
        .order('created_at');
      if (data && data.length > 0) {
        setInstances(data);
        setLoading(false);
        return;
      }
    } catch { /* tabela ainda não existe */ }

    // Fallback: mostrar instância padrão das env vars
    if (HAS_EVO) {
      setInstances([{
        id:            'default',
        instance_name: 'suporte-consult-delivery',
        evolution_url: EVO_URL,
        status:        'disconnected',
        phone:         null,
        profile_name:  null,
      }]);
    }
    setLoading(false);
  }

  async function pollStatuses() {
    if (!HAS_EVO) return;
    setInstances(prev => prev.map(async inst => {
      try {
        const s = await getInstanceStatus(inst.instance_name);
        const st = s?.instance?.state === 'open' ? 'connected' : 'disconnected';
        return { ...inst, status: st };
      } catch { return inst; }
    }));
  }

  async function fetchQR(instanceName) {
    const inst   = instances.find(i => i.instance_name === instanceName);
    const evoUrl = inst?.evolution_url || EVO_URL;
    const evoKey = inst?.api_key || EVO_KEY;
    if (!evoUrl || !evoKey) return;
    setQrLoading(true);
    try {
      const data = await getQRCode(instanceName, evoUrl, evoKey);
      let b64 = data?.base64 || data?.qrcode?.base64 || null;
      if (b64) {
        // Strip data URI prefix se já estiver presente
        b64 = b64.replace(/^data:image\/[^;]+;base64,/, '');
        setQrData(b64);
      }

      // Verificar se já conectou
      const status = await getInstanceStatus(instanceName, evoUrl, evoKey);
      if (status?.instance?.state === 'open') {
        await supabase
          .from('evolution_instances')
          .update({ status: 'connected' })
          .eq('instance_name', instanceName);
        setInstances(prev => prev.map(i =>
          i.instance_name === instanceName ? { ...i, status: 'connected' } : i,
        ));
        setShowQR(null);
      }
    } catch { /* ignore */ }
    setQrLoading(false);
  }

  async function handleConfigureWebhook(inst) {
    if (!WEBHOOK) {
      alert('Configure VITE_SUPABASE_URL primeiro.');
      return;
    }
    const evoUrl = inst.evolution_url || EVO_URL;
    const evoKey = inst.api_key || EVO_KEY;
    if (!evoUrl || !evoKey) {
      alert('Instância sem URL ou API Key configurados.');
      return;
    }
    try {
      await setWebhook(inst.instance_name, WEBHOOK, evoUrl, evoKey);
      alert(`Webhook configurado com sucesso!\n\nURL: ${WEBHOOK}`);
    } catch (err) {
      alert('Erro ao configurar webhook: ' + (err?.message || err));
    }
  }

  async function handleSaveInstance() {
    if (!form.name || !form.url || !form.key) return;
    setSavingForm(true);
    try {
      const { data, error } = await supabase
        .from('evolution_instances')
        .insert({ instance_name: form.name, evolution_url: form.url, api_key: form.key, status: 'disconnected' })
        .select()
        .single();
      if (data) {
        setInstances(prev => [...prev.filter(i => i.id !== 'default'), data]);
        setShowForm(false);
        setForm({ name: '', url: EVO_URL || '', key: '' });
      } else {
        alert('Erro ao salvar: ' + error?.message);
      }
    } catch (err) {
      alert('Erro: ' + err?.message);
    }
    setSavingForm(false);
  }

  const statusBadge = status => ({
    connected:    { cls: 'badge-green',  label: '● Conectado'    },
    connecting:   { cls: 'badge-yellow', label: '◌ Conectando'   },
    disconnected: { cls: 'badge-gray',   label: '○ Desconectado' },
  }[status] || { cls: 'badge-gray', label: '○ Desconectado' });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Aviso se env vars ausentes */}
      {!HAS_EVO && (
        <div className="card" style={{ padding: 16, borderLeft: '3px solid var(--warn)', background: '#fffbeb' }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <Icon name="info" size={16} style={{ color: 'var(--warn)', flexShrink: 0, marginTop: 1 }} />
            <div>
              <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--g-900)' }}>
                Variáveis de ambiente não configuradas
              </div>
              <div style={{ fontSize: 12, color: 'var(--g-600)', marginTop: 4, lineHeight: 1.6 }}>
                Adicione <code>VITE_EVOLUTION_URL</code> e <code>VITE_EVOLUTION_KEY</code> no{' '}
                <code>.env.local</code> para ativar a integração WhatsApp.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Lista de instâncias */}
      <SectionCard title="Instâncias WhatsApp">
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
          <button className="btn-primary" style={{ fontSize: 13 }} onClick={() => setShowForm(v => !v)}>
            <Icon name="plus" size={13} /> Nova instância
          </button>
        </div>

        {/* Formulário de adição */}
        {showForm && (
          <div style={{ marginBottom: 16, padding: 16, background: 'var(--g-50)', borderRadius: 'var(--r-md)', border: '1px solid var(--g-200)' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--g-900)', marginBottom: 14 }}>
              Nova instância Evolution API
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div>
                <div className="label" style={{ marginBottom: 6 }}>Nome da instância</div>
                <input className="input" style={{ fontSize: 13 }} placeholder="ex: minha-loja"
                  value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div>
                <div className="label" style={{ marginBottom: 6 }}>URL da Evolution API</div>
                <input className="input" style={{ fontSize: 13 }} placeholder="https://evo.exemplo.com"
                  value={form.url} onChange={e => setForm(f => ({ ...f, url: e.target.value }))} />
              </div>
            </div>
            <div style={{ marginBottom: 14 }}>
              <div className="label" style={{ marginBottom: 6 }}>API Key</div>
              <input className="input" type="password" style={{ fontSize: 13 }} placeholder="Sua API key"
                value={form.key} onChange={e => setForm(f => ({ ...f, key: e.target.value }))} />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn-primary" style={{ fontSize: 13 }} onClick={handleSaveInstance} disabled={savingForm}>
                {savingForm ? 'Salvando…' : 'Salvar instância'}
              </button>
              <button className="btn-secondary" style={{ fontSize: 13 }} onClick={() => setShowForm(false)}>
                Cancelar
              </button>
            </div>
          </div>
        )}

        {/* Tabela de instâncias */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: 24, color: 'var(--g-400)', fontSize: 13 }}>
            Carregando instâncias…
          </div>
        ) : instances.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 24, color: 'var(--g-400)', fontSize: 13 }}>
            Nenhuma instância cadastrada. Clique em "Nova instância" para começar.
          </div>
        ) : (
          <div style={{ border: '1px solid var(--g-200)', borderRadius: 'var(--r-md)', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--g-50)', borderBottom: '1px solid var(--g-200)' }}>
                  {['Instância', 'Status', 'Telefone / Perfil', 'Ações'].map(h => (
                    <th key={h} style={{
                      padding: '10px 14px', fontSize: 11, fontWeight: 700,
                      color: 'var(--g-500)', textTransform: 'uppercase',
                      letterSpacing: 0.5, textAlign: 'left',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {instances.map((inst, i) => {
                  const sb = statusBadge(inst.status);
                  return (
                    <tr key={inst.id} style={{
                      borderBottom: i < instances.length - 1 ? '1px solid var(--g-100)' : 'none',
                      background: 'var(--white)',
                    }}>
                      <td style={{ padding: '14px 14px' }}>
                        <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--g-900)' }}>
                          {inst.instance_name}
                        </div>
                        <div style={{
                          fontSize: 11, color: 'var(--g-400)',
                          fontFamily: 'ui-monospace, monospace', marginTop: 2,
                        }}>
                          {(inst.evolution_url || EVO_URL || '').replace('https://', '').split('/')[0]}
                        </div>
                      </td>
                      <td style={{ padding: '14px 14px' }}>
                        <span className={`badge ${sb.cls}`}>{sb.label}</span>
                      </td>
                      <td style={{ padding: '14px 14px', fontSize: 12, color: 'var(--g-600)' }}>
                        {inst.phone || inst.profile_name || '—'}
                      </td>
                      <td style={{ padding: '14px 14px' }}>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {inst.status !== 'connected' && (
                            <button
                              className="btn-primary"
                              style={{ fontSize: 12, padding: '6px 12px' }}
                              onClick={() => setShowQR(inst.instance_name)}
                            >
                              Conectar
                            </button>
                          )}
                          <button
                            className="btn-secondary"
                            style={{ fontSize: 12, padding: '6px 12px' }}
                            onClick={() => handleConfigureWebhook(inst)}
                            title={`Webhook: ${WEBHOOK}`}
                          >
                            <Icon name="refresh" size={11} /> Webhook
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {/* Edge Function info */}
      <SectionCard title="Edge Function — Webhook receiver">
        <p style={{ fontSize: 13, color: 'var(--g-600)', marginBottom: 14, lineHeight: 1.6 }}>
          O webhook recebe mensagens da Evolution API e as persiste no Supabase.
          O frontend lê em tempo real via Supabase Realtime. O arquivo está em{' '}
          <code>supabase/functions/evolution-webhook/index.ts</code>.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '10px 14px', background: 'var(--g-900)', borderRadius: 'var(--r-sm)',
          }}>
            <code style={{ fontSize: 12, color: '#22D3EE', flex: 1, wordBreak: 'break-all' }}>
              {WEBHOOK || 'Configure VITE_SUPABASE_URL para ver a URL'}
            </code>
            {WEBHOOK && (
              <button
                className="btn-secondary"
                style={{ fontSize: 11, padding: '4px 8px', flexShrink: 0 }}
                onClick={() => navigator.clipboard.writeText(WEBHOOK)}
              >
                Copiar
              </button>
            )}
          </div>
          <div style={{ fontSize: 12, color: 'var(--g-500)' }}>
            Deploy: <code>supabase functions deploy evolution-webhook</code>
            {' · '}
            Migration: <code>supabase db push</code>
          </div>
        </div>
      </SectionCard>

      {/* Modal QR Code */}
      {showQR && (
        <>
          <div
            onClick={() => setShowQR(null)}
            style={{
              position: 'fixed', inset: 0,
              background: 'rgba(13,13,13,0.5)', zIndex: 100,
              animation: 'fadeIn 180ms ease',
            }}
          />
          <div style={{
            position: 'fixed', top: '50%', left: '50%',
            transform: 'translate(-50%,-50%)',
            background: 'var(--white)', borderRadius: 'var(--r-lg)',
            padding: 32, zIndex: 101, width: 360,
            boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--g-900)' }}>
                  Conectar {showQR}
                </div>
                <div style={{ fontSize: 12, color: 'var(--g-500)', marginTop: 2 }}>
                  Escaneie o QR Code com o WhatsApp
                </div>
              </div>
              <button className="btn-icon" onClick={() => setShowQR(null)}>
                <Icon name="x" size={16} />
              </button>
            </div>

            <div style={{
              width: '100%', aspectRatio: '1', background: 'var(--g-100)',
              borderRadius: 'var(--r-md)', display: 'flex',
              alignItems: 'center', justifyContent: 'center',
              marginBottom: 16, overflow: 'hidden',
            }}>
              {qrLoading && !qrData ? (
                <div style={{ textAlign: 'center', color: 'var(--g-400)', fontSize: 13 }}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>⏳</div>
                  Gerando QR Code…
                </div>
              ) : qrData ? (
                <img
                  src={`data:image/png;base64,${qrData}`}
                  alt="QR Code"
                  style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                />
              ) : (
                <div style={{ textAlign: 'center', color: 'var(--g-400)', fontSize: 13, padding: 20 }}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>📱</div>
                  {!HAS_EVO
                    ? 'Configure VITE_EVOLUTION_URL e VITE_EVOLUTION_KEY'
                    : 'Aguardando QR Code da Evolution API…'}
                </div>
              )}
            </div>

            <div style={{ fontSize: 12, color: 'var(--g-500)', textAlign: 'center', lineHeight: 1.5 }}>
              Verificando conexão a cada 5 segundos.
              A janela fecha automaticamente ao conectar.
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ─── Tab: Workspace ──────────────────────────────────── */
const WS_EMOJIS = ['🏪','🍕','🍔','🌮','🍜','🍱','🍣','🥗','🍰','🧁','🥩','🍗','🍟','🌯','🥙','🍛','🏢','🏬','🏭','🎯','🚀','⭐','💎','🔥','🎉'];

function TabWorkspace({ tenantDbId, onTenantChange }) {
  const [loading, setLoading]       = useState(true);
  const [saving, setSaving]         = useState(false);
  const [saved, setSaved]           = useState(false);
  const [uploading, setUploading]   = useState(false);
  const [showEmoji, setShowEmoji]   = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [deleteText, setDeleteText] = useState('');
  const [slugError, setSlugError]   = useState('');
  const [form, setForm] = useState({ name: '', segment: '', slug: '', phone: '', city: '', emoji: '🏪', logo_url: '' });
  const [workspaces, setWorkspaces] = useState([]);
  const [activeTenantId, setActiveTenantId] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ name: '', slug: '', segment: '', emoji: '🏪' });
  const [createError, setCreateError] = useState('');
  const [createSaving, setCreateSaving] = useState(false);

  async function loadWorkspaces() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) return [];
    // 1) Buscar memberships
    const { data: memberships, error: me } = await supabase
      .from('tenant_members')
      .select('tenant_id, role')
      .eq('user_id', user.id);
    if (me) { console.error('Erro ao buscar memberships:', me); return []; }
    if (!memberships?.length) { console.warn('Nenhum membership encontrado'); return []; }
    const tenantIds = memberships.map(m => m.tenant_id);
    // 2) Buscar dados dos tenants
    const { data: tenantsData, error: te } = await supabase
      .from('tenants')
      .select('id, name, slug, segment, emoji, logo_url, phone, city, color')
      .in('id', tenantIds);
    if (te) { console.error('Erro ao buscar tenants:', te); return []; }
    if (!tenantsData?.length) { console.warn('Nenhum tenant encontrado para os IDs:', tenantIds); return []; }
    const list = tenantsData.map(t => {
      const membership = memberships.find(m => m.tenant_id === t.id);
      return {
        id: t.id,
        name: t.name || 'Workspace',
        slug: t.slug || '',
        segment: t.segment || '',
        emoji: t.emoji || '🏪',
        logo_url: t.logo_url || '',
        phone: t.phone || '',
        city: t.city || '',
        color: t.color || '#B70C00',
        role: membership?.role || 'operador',
      };
    });
    setWorkspaces(list);
    return list;
  }

  async function loadCurrent(tid) {
    if (!tid) { setLoading(false); return; }
    const { data } = await supabase.from('tenants').select('*').eq('id', tid).maybeSingle();
    if (data) setForm({
      name:     data.name     || '',
      segment:  data.segment  || '',
      slug:     data.slug     || '',
      phone:    data.phone    || '',
      city:     data.city     || '',
      emoji:    data.emoji    || '🏪',
      logo_url: data.logo_url || '',
    });
    setLoading(false);
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const list = await loadWorkspaces();
      if (cancelled) return;
      // Determinar qual workspace é o ativo: tenantDbId prop, ou primeiro da lista
      const match = list.find(w => w.id === tenantDbId);
      const tid = match?.id || list[0]?.id || null;
      setActiveTenantId(tid);
      if (tid) await loadCurrent(tid);
      else setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [tenantDbId]);

  // Fallback: se activeTenantId ainda estiver null mas workspaces carregou, usa o primeiro
  useEffect(() => {
    if (activeTenantId || workspaces.length === 0) return;
    setActiveTenantId(workspaces[0].id);
    loadCurrent(workspaces[0].id);
  }, [workspaces]);

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }

  function validateSlug(v) {
    if (!v) return 'Campo obrigatório';
    if (!/^[a-z0-9-]+$/.test(v)) return 'Apenas letras minúsculas, números e hífens';
    if (v.length < 3) return 'Mínimo 3 caracteres';
    return '';
  }

  async function handleSave() {
    const err = validateSlug(form.slug);
    setSlugError(err);
    if (err) return;
    // Buscar o ID do tenant pelo slug do formulário — não depende de estado
    const { data: tenantRow } = await supabase
      .from('tenants')
      .select('id')
      .eq('slug', form.slug)
      .maybeSingle();
    if (!tenantRow?.id) { alert('Workspace não identificado. Recarregue a página e tente novamente.'); return; }
    setSaving(true);
    const { error } = await supabase.from('tenants').update({
      name: form.name, segment: form.segment, slug: form.slug,
      phone: form.phone, city: form.city,
    }).eq('id', tenantRow.id);
    setSaving(false);
    if (error) { alert('Erro ao salvar: ' + error.message); return; }
    setSaved(true);
    await loadWorkspaces();
    if (onTenantChange) onTenantChange();
    setTimeout(() => setSaved(false), 2500);
  }

  async function handlePickEmoji(emoji) {
    setShowEmoji(false);
    set('emoji', emoji);
    const { data: t } = await supabase.from('tenants').select('id').eq('slug', form.slug).maybeSingle();
    if (t?.id) await supabase.from('tenants').update({ emoji }).eq('id', t.id);
  }

  async function handleLogoUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { alert('Arquivo muito grande. Máximo: 2MB'); return; }
    const { data: t } = await supabase.from('tenants').select('id').eq('slug', form.slug).maybeSingle();
    if (!t?.id) { alert('Workspace não identificado.'); return; }
    setUploading(true);
    const ext  = file.name.split('.').pop().toLowerCase();
    const path = `logos/${t.id}.${ext}`;
    const { error } = await supabase.storage.from('logos').upload(path, file, { upsert: true });
    if (!error) {
      const { data: { publicUrl } } = supabase.storage.from('logos').getPublicUrl(path);
      set('logo_url', publicUrl);
      await supabase.from('tenants').update({ logo_url: publicUrl }).eq('id', t.id);
    } else {
      alert('Erro no upload: ' + error.message);
    }
    setUploading(false);
  }

  async function handleDelete() {
    if (deleteText !== form.name) return;
    const { data: t } = await supabase.from('tenants').select('id').eq('slug', form.slug).maybeSingle();
    if (!t?.id) { alert('Workspace não identificado.'); return; }
    await supabase.from('tenants').delete().eq('id', t.id);
    window.location.reload();
  }

  async function handleCreateWorkspace() {
    setCreateError('');
    const err = validateSlug(createForm.slug);
    if (err) { setCreateError(err); return; }
    if (!createForm.name.trim()) { setCreateError('Nome é obrigatório'); return; }
    setCreateSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.id) throw new Error('Usuário não autenticado');
      const { data: existing } = await supabase.from('tenants').select('id').eq('slug', createForm.slug).maybeSingle();
      if (existing) { setCreateError('Slug já existe. Escolha outro.'); setCreateSaving(false); return; }
      const { data: tenantId, error: rpcErr } = await supabase.rpc('create_workspace', {
        p_name: createForm.name.trim(),
        p_slug: createForm.slug.trim(),
        p_segment: createForm.segment.trim(),
        p_emoji: createForm.emoji,
        p_user_id: user.id,
      });
      if (rpcErr) throw rpcErr;
      setShowCreate(false);
      setCreateForm({ name: '', slug: '', segment: '', emoji: '🏪' });
      const list = await loadWorkspaces();
      const newWs = list.find(w => w.slug === createForm.slug.trim());
      if (newWs) {
        setActiveTenantId(newWs.id);
        await loadCurrent(newWs.id);
      }
      if (onTenantChange) onTenantChange();
    } catch (err) {
      setCreateError(err?.message || 'Erro ao criar workspace');
    }
    setCreateSaving(false);
  }

  async function selectWorkspace(ws) {
    setActiveTenantId(ws.id);
    await loadCurrent(ws.id);
    if (onTenantChange) await onTenantChange(ws.slug);
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--g-400)', fontSize: 13 }}>Carregando…</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Lista de workspaces */}
      <SectionCard title="Meus workspaces">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {workspaces.map(ws => (
            <div key={ws.id} style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '12px 14px', borderRadius: 'var(--r-md)',
              border: '1px solid var(--g-200)',
              background: ws.id === activeTenantId ? 'var(--red-soft)' : 'var(--white)',
              cursor: 'pointer',
            }} onClick={() => selectWorkspace(ws)}>
              <div style={{
                width: 40, height: 40, borderRadius: 'var(--r-md)',
                background: 'var(--g-100)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 20,
              }}>{ws.logo_url ? <img src={ws.logo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'var(--r-md)' }} /> : ws.emoji}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--g-900)' }}>{ws.name}</div>
                <div style={{ fontSize: 12, color: 'var(--g-500)' }}>{ws.segment || 'Sem segmento'} · {ws.slug}</div>
              </div>
              <div style={{ fontSize: 11, padding: '3px 8px', borderRadius: 'var(--r-sm)', background: 'var(--g-100)', color: 'var(--g-600)', fontWeight: 500 }}>{ws.role}</div>
              {ws.id === activeTenantId && <div style={{ fontSize: 11, color: 'var(--red)', fontWeight: 600 }}>Atual</div>}
            </div>
          ))}
          {workspaces.length === 0 && (
            <div style={{ padding: 16, textAlign: 'center', color: 'var(--g-400)', fontSize: 13 }}>Nenhum workspace encontrado.</div>
          )}
        </div>
        <div style={{ marginTop: 12 }}>
          <button className="btn-primary" style={{ fontSize: 13 }} onClick={() => setShowCreate(true)}>
            <Icon name="plus" size={13} /> Criar workspace
          </button>
        </div>
      </SectionCard>

      <SectionCard title="Informações do workspace">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <InputField label="Nome" value={form.name} onChange={v => set('name', v)} />
          <InputField label="Segmento" value={form.segment} onChange={v => set('segment', v)} placeholder="ex: Pizzaria, Hamburgueria" />
          <div>
            <InputField label="Slug (URL)" value={form.slug} onChange={v => { set('slug', v); setSlugError(validateSlug(v)); }} mono placeholder="ex: minha-loja" />
            {slugError && <div style={{ fontSize: 11, color: 'var(--red)', marginTop: 4 }}>{slugError}</div>}
          </div>
          <InputField label="Telefone principal" value={form.phone} onChange={v => set('phone', v)} placeholder="(11) 99999-9999" />
          <InputField label="Cidade" value={form.city} onChange={v => set('city', v)} placeholder="São Paulo, SP" />
          <div>
            <div className="label" style={{ marginBottom: 6 }}>Fuso horário</div>
            <div style={{ padding: '9px 12px', border: '1px solid var(--g-300)', borderRadius: 'var(--r-sm)', fontSize: 13, color: 'var(--g-500)', background: 'var(--g-50)' }}>
              America/Sao_Paulo (GMT-3)
            </div>
          </div>
        </div>
        <div style={{ marginTop: 20, display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className="btn-primary" onClick={handleSave} disabled={saving}>
            <Icon name="check" size={14} /> {saving ? 'Salvando…' : 'Salvar alterações'}
          </button>
          <button className="btn-secondary" onClick={() => { setSlugError(''); }}>Cancelar</button>
          {saved && <span style={{ fontSize: 12, color: 'var(--success)', fontWeight: 600 }}>Salvo!</span>}
        </div>
      </SectionCard>

      <SectionCard title="Identidade visual">
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <div style={{ position: 'relative' }}>
            <div style={{
              width: 72, height: 72, borderRadius: 'var(--r-lg)',
              background: 'var(--g-100)', border: '2px dashed var(--g-300)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 36, overflow: 'hidden',
            }}>
              {form.logo_url
                ? <img src={form.logo_url} alt="logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : form.emoji}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--g-900)' }}>{form.name || 'Workspace'}</div>
            <div style={{ fontSize: 12, color: 'var(--g-500)', marginTop: 2 }}>{form.segment}</div>
            <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
              <div style={{ position: 'relative' }}>
                <button className="btn-secondary" style={{ fontSize: 12, padding: '6px 12px' }} onClick={() => setShowEmoji(v => !v)}>
                  Trocar emoji
                </button>
                {showEmoji && (
                  <>
                    <div onClick={() => setShowEmoji(false)} style={{ position: 'fixed', inset: 0, zIndex: 49 }} />
                    <div style={{
                      position: 'absolute', top: '100%', left: 0, marginTop: 6,
                      background: 'var(--white)', border: '1px solid var(--g-200)',
                      borderRadius: 'var(--r-md)', padding: 12, zIndex: 50,
                      display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 4,
                      boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                    }}>
                      {WS_EMOJIS.map(e => (
                        <button key={e} onClick={() => handlePickEmoji(e)} style={{
                          fontSize: 22, padding: '4px 6px', borderRadius: 6,
                          background: form.emoji === e ? 'var(--red-soft)' : 'transparent',
                          cursor: 'pointer',
                        }}>{e}</button>
                      ))}
                    </div>
                  </>
                )}
              </div>
              <label style={{ cursor: 'pointer' }}>
                <input type="file" accept="image/png,image/jpeg,image/svg+xml" style={{ display: 'none' }} onChange={handleLogoUpload} />
                <span className="btn-secondary" style={{ fontSize: 12, padding: '6px 12px', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <Icon name="upload" size={11} /> {uploading ? 'Enviando…' : 'Upload logo'}
                </span>
              </label>
            </div>
          </div>
        </div>
        {form.logo_url && (
          <div style={{ marginTop: 12, fontSize: 12, color: 'var(--g-500)', wordBreak: 'break-all' }}>
            Logo: {form.logo_url}
          </div>
        )}
      </SectionCard>

      <SectionCard title="Zona de perigo" danger>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--g-900)' }}>Excluir workspace</div>
            <div style={{ fontSize: 12, color: 'var(--g-500)', marginTop: 2 }}>Esta ação é irreversível e remove todos os dados.</div>
          </div>
          <button className="btn-secondary" style={{ color: 'var(--red)', borderColor: 'var(--red-soft)' }} onClick={() => setShowDelete(true)}>
            <Icon name="trash" size={13} /> Excluir workspace
          </button>
        </div>
      </SectionCard>

      {/* Delete confirmation modal */}
      {showDelete && (
        <>
          <div onClick={() => setShowDelete(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(13,13,13,0.5)', zIndex: 100 }} />
          <div style={{
            position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
            background: 'var(--white)', borderRadius: 'var(--r-lg)', padding: 32, zIndex: 101,
            width: 400, boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
          }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--red)', marginBottom: 8 }}>Excluir workspace</div>
            <div style={{ fontSize: 13, color: 'var(--g-600)', marginBottom: 20, lineHeight: 1.6 }}>
              Esta ação é <strong>irreversível</strong>. Digite o nome do workspace para confirmar:
              <br /><strong>{form.name}</strong>
            </div>
            <input
              className="input"
              placeholder={form.name}
              value={deleteText}
              onChange={e => setDeleteText(e.target.value)}
              style={{ marginBottom: 16, fontSize: 13 }}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className="btn-primary"
                style={{ background: 'var(--red)', borderColor: 'var(--red)' }}
                disabled={deleteText !== form.name}
                onClick={handleDelete}
              >
                Excluir permanentemente
              </button>
              <button className="btn-secondary" onClick={() => { setShowDelete(false); setDeleteText(''); }}>Cancelar</button>
            </div>
          </div>
        </>
      )}

      {/* Create workspace modal */}
      {showCreate && (
        <>
          <div onClick={() => setShowCreate(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(13,13,13,0.5)', zIndex: 100 }} />
          <div className="modal-mobile" style={{
            position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
            background: 'var(--white)', borderRadius: 'var(--r-lg)', padding: 32, zIndex: 101,
            width: 420, boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
          }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--g-900)', marginBottom: 4 }}>Criar novo workspace</div>
            <div style={{ fontSize: 12, color: 'var(--g-500)', marginBottom: 20 }}>Cada cliente da sua empresa terá seu próprio workspace isolado.</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <InputField label="Nome do workspace" value={createForm.name} onChange={v => setCreateForm(f => ({ ...f, name: v }))} placeholder="ex: Pizzaria do João" />
              <div>
                <InputField label="Slug (URL única)" value={createForm.slug} onChange={v => setCreateForm(f => ({ ...f, slug: v }))} mono placeholder="ex: pizzaria-joao" />
                <div style={{ fontSize: 11, color: 'var(--g-400)', marginTop: 4 }}>Apenas letras minúsculas, números e hífens. Mínimo 3 caracteres.</div>
              </div>
              <InputField label="Segmento" value={createForm.segment} onChange={v => setCreateForm(f => ({ ...f, segment: v }))} placeholder="ex: Pizzaria" />
              <div>
                <div className="label" style={{ marginBottom: 6 }}>Emoji</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {WS_EMOJIS.map(e => (
                    <button key={e} onClick={() => setCreateForm(f => ({ ...f, emoji: e }))} style={{
                      fontSize: 20, padding: '4px 6px', borderRadius: 6,
                      background: createForm.emoji === e ? 'var(--red-soft)' : 'transparent',
                      border: createForm.emoji === e ? '1px solid var(--red)' : '1px solid transparent',
                      cursor: 'pointer',
                    }}>{e}</button>
                  ))}
                </div>
              </div>
              {createError && <div style={{ fontSize: 12, color: 'var(--red)', padding: '8px 12px', background: '#fff5f5', borderRadius: 'var(--r-sm)' }}>{createError}</div>}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
              <button className="btn-primary" onClick={handleCreateWorkspace} disabled={createSaving}>
                <Icon name="check" size={13} /> {createSaving ? 'Criando…' : 'Criar workspace'}
              </button>
              <button className="btn-secondary" onClick={() => { setShowCreate(false); setCreateError(''); }}>Cancelar</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ─── Tab: Usuários ───────────────────────────────────── */
function TabUsers({ tenantDbId, tenant }) {
  const [members, setMembers]       = useState([]);
  const [loading, setLoading]       = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [editUser, setEditUser]     = useState(null); // member object

  async function loadMembers() {
    setLoading(true);
    const resolved = await resolveTenantId(tenantDbId);
    console.log('[loadMembers] tenantDbId=', tenantDbId, 'resolved=', resolved);
    if (!resolved) {
      console.warn('[loadMembers] workspace não resolvido');
      setLoading(false); return;
    }
    const { data, error } = await supabase
      .from('tenant_members')
      .select('role, semaforo, display_name, created_at, profiles(id, full_name, email, avatar_url)')
      .eq('tenant_id', resolved);
    if (error) { console.error('[loadMembers] erro:', error); }
    if (data) {
      console.log('[loadMembers] membros carregados:', data.length);
      setMembers(data.map(m => ({
        userId:    m.profiles?.id,
        name:      m.display_name || m.profiles?.full_name || m.profiles?.email || 'Usuário',
        email:     m.profiles?.email || '',
        avatar:    m.display_name || m.profiles?.full_name || m.profiles?.email || 'U',
        role:      m.role     || 'operador',
        semaforo:  m.semaforo || 'verde',
        createdAt: m.created_at,
      })));
    }
    setLoading(false);
  }

  useEffect(() => { loadMembers(); }, [tenantDbId]);

  async function handleRemoveMember(userId) {
    if (!confirm('Remover este membro do workspace?')) return;
    const resolvedTenantId = await resolveTenantId(tenantDbId);
    console.log('[handleRemoveMember] tenantDbId=', tenantDbId, 'resolved=', resolvedTenantId);
    if (!resolvedTenantId) { alert('Workspace não identificado. Recarregue a página.'); return; }
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session?.access_token}`,
      },
      body: JSON.stringify({ action: 'delete', tenant_id: tenantDbId, user_id: userId }),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      alert(json.error || 'Erro ao remover membro');
      return;
    }
    await loadMembers();
  }

  const displayMembers = members;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <SectionCard title="Membros da equipe">
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
          <button className="btn-primary" style={{ fontSize: 13 }} onClick={() => setShowInvite(true)}>
            <Icon name="plus" size={13} /> Convidar membro
          </button>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 24, color: 'var(--g-400)', fontSize: 13 }}>Carregando membros…</div>
        ) : displayMembers.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 32, color: 'var(--g-500)', fontSize: 13 }}>
            Nenhum membro cadastrado neste workspace.<br />
            Clique em "Convidar membro" para adicionar alguém.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0, border: '1px solid var(--g-200)', borderRadius: 'var(--r-md)', overflow: 'hidden' }}>
            {displayMembers.map((u, i) => {
              const role = ROLE_MAP[u.role] || ROLE_MAP.operador;
              const sem  = SEMAFORO[u.semaforo] || SEMAFORO.verde;
              return (
                <div key={u.userId || i} style={{
                  display: 'flex', alignItems: 'center', gap: 14,
                  padding: '14px 16px',
                  borderBottom: i < displayMembers.length - 1 ? '1px solid var(--g-100)' : 'none',
                  background: 'var(--white)',
                }}>
                  <UserAvatar name={u.avatar} size={38} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--g-900)' }}>{u.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--g-500)', marginTop: 1 }}>{u.email}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className={`badge ${role.cls}`}>{role.label}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 8px', borderRadius: 'var(--r-xs)', background: 'var(--g-100)' }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: sem.color, display: 'inline-block', flexShrink: 0 }} />
                      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--g-700)' }}>{sem.label}</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn-ghost" style={{ fontSize: 12 }} onClick={() => setEditUser(u)}>
                      <Icon name="gear" size={12} /> Editar
                    </button>
                    <button className="btn-ghost" style={{ fontSize: 12, color: 'var(--red)' }} onClick={() => handleRemoveMember(u.userId)}>
                      <Icon name="trash" size={12} /> Excluir
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>

      <SectionCard title="Semáforo de autonomia (DELI)">
        <p style={{ fontSize: 13, color: 'var(--g-600)', marginBottom: 16, lineHeight: 1.6 }}>
          Define o nível de autorização que a DELI tem para agir em nome da equipe. Configurável por usuário.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {Object.entries(SEMAFORO).map(([key, s]) => (
            <div key={key} style={{
              display: 'flex', alignItems: 'flex-start', gap: 14,
              padding: '14px 16px',
              border: '1px solid var(--g-200)', borderRadius: 'var(--r-md)',
              background: 'var(--white)',
            }}>
              <span style={{
                width: 14, height: 14, borderRadius: '50%',
                background: s.color, flexShrink: 0, marginTop: 3,
                boxShadow: `0 0 0 4px ${s.color}22`,
              }} />
              <div>
                <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--g-900)' }}>Semáforo {s.label}</div>
                <div style={{ fontSize: 12, color: 'var(--g-500)', marginTop: 2 }}>{s.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Papéis e permissões">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0, border: '1px solid var(--g-200)', borderRadius: 'var(--r-md)', overflow: 'hidden' }}>
          {[
            { role: 'Admin',     perms: ['Dashboard', 'Chat', 'Tarefas', 'CORA', 'CRM', 'Relatórios', 'Configurações'] },
            { role: 'Consultor', perms: ['Dashboard', 'Chat', 'Tarefas', 'CORA', 'CRM', 'Relatórios'] },
            { role: 'Operador',  perms: ['Dashboard', 'Chat', 'Tarefas'] },
          ].map((r, i, arr) => (
            <div key={r.role} style={{
              display: 'flex', alignItems: 'center', gap: 16,
              padding: '12px 16px',
              borderBottom: i < arr.length - 1 ? '1px solid var(--g-100)' : 'none',
            }}>
              <div style={{ width: 90, fontWeight: 600, fontSize: 13, color: 'var(--g-900)' }}>{r.role}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {r.perms.map(p => (<span key={p} className="badge badge-gray">{p}</span>))}
              </div>
            </div>
          ))}
        </div>
      </SectionCard>

      {showInvite && (
        <InviteModal
          tenantDbId={tenantDbId}
          tenant={tenant}
          onClose={() => setShowInvite(false)}
          onDone={() => { setShowInvite(false); loadMembers(); }}
        />
      )}
      {editUser && (
        <EditMemberModal
          member={editUser}
          tenantDbId={tenantDbId}
          tenant={tenant}
          onClose={() => setEditUser(null)}
          onRemove={() => { setEditUser(null); handleRemoveMember(editUser.userId); }}
          onDone={() => { setEditUser(null); loadMembers(); }}
        />
      )}
    </div>
  );
}

/* Invite modal */
function InviteModal({ tenantDbId, tenant, onClose, onDone }) {
  const [form, setForm]     = useState({ email: '', password: '', name: '', role: 'operador', semaforo: 'verde' });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  async function handleSubmit() {
    if (!form.email)    { setError('E-mail obrigatório'); return; }
    if (!form.password || form.password.length < 6) { setError('Senha obrigatória (mínimo 6 caracteres)'); return; }
    setSaving(true);
    setError('');
    try {
      const { data: { session } } = await supabase.auth.getSession();

      const resolvedTenantId = await resolveTenantId(tenantDbId);
      console.log('[InviteModal] tenantDbId=', tenantDbId, 'resolved=', resolvedTenantId);
      if (!resolvedTenantId) {
        setError('Workspace não identificado. Verifique se o Supabase está conectado e se você pertence a um workspace.');
        setSaving(false); return;
      }

      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-users`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          action:    'create',
          tenant_id: tenantDbId,
          email:     form.email,
          password:  form.password,
          name:      form.name,
          role:      form.role,
          semaforo:  form.semaforo,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Erro ao criar usuário');
      onDone();
    } catch (err) {
      setError(err?.message || 'Erro ao criar usuário.');
    }
    setSaving(false);
  }

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(13,13,13,0.5)', zIndex: 100 }} />
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
        background: 'var(--white)', borderRadius: 'var(--r-lg)', padding: 32, zIndex: 101,
        width: 440, boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--g-900)' }}>Adicionar membro</div>
          <button className="btn-icon" onClick={onClose}><Icon name="x" size={16} /></button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <InputField label="E-mail" value={form.email} onChange={v => setForm(f => ({ ...f, email: v }))} placeholder="colaborador@empresa.com" type="email" />
          <InputField label="Senha" value={form.password} onChange={v => setForm(f => ({ ...f, password: v }))} placeholder="Mínimo 6 caracteres" type="password" />
          <InputField label="Nome" value={form.name} onChange={v => setForm(f => ({ ...f, name: v }))} placeholder="Nome completo" />
          <div>
            <div className="label" style={{ marginBottom: 6 }}>Papel</div>
            <select className="input" style={{ fontSize: 13 }} value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
              {Object.entries(ROLE_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
          <div>
            <div className="label" style={{ marginBottom: 6 }}>Semáforo DELI</div>
            <select className="input" style={{ fontSize: 13 }} value={form.semaforo} onChange={e => setForm(f => ({ ...f, semaforo: e.target.value }))}>
              {Object.entries(SEMAFORO).map(([k, v]) => <option key={k} value={k}>{v.label} — {v.desc}</option>)}
            </select>
          </div>
          {error && <div style={{ fontSize: 12, color: 'var(--red)', padding: '8px 12px', background: '#fff5f5', borderRadius: 'var(--r-sm)' }}>{error}</div>}
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
          <button className="btn-primary" onClick={handleSubmit} disabled={saving}>
            <Icon name="plus" size={13} /> {saving ? 'Criando…' : 'Criar usuário'}
          </button>
          <button className="btn-secondary" onClick={onClose}>Cancelar</button>
        </div>
      </div>
    </>
  );
}

/* Edit member modal */
function EditMemberModal({ member, tenantDbId, tenant, onClose, onRemove, onDone }) {
  const [role, setRole]         = useState(member.role     || 'operador');
  const [semaforo, setSemaforo] = useState(member.semaforo || 'verde');
  const [name, setName]         = useState(member.name     || '');
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState('');

  async function handleSave() {
    setSaving(true);
    setError('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-users`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          action:    'update',
          tenant_id: tenantDbId,
          user_id:   member.userId,
          role,
          semaforo,
          name,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Erro ao salvar');
      onDone();
    } catch (err) {
      setError(err?.message || 'Erro ao salvar');
    }
    setSaving(false);
  }

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(13,13,13,0.5)', zIndex: 100 }} />
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
        background: 'var(--white)', borderRadius: 'var(--r-lg)', padding: 32, zIndex: 101,
        width: 400, boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--g-900)' }}>Editar membro</div>
            <div style={{ fontSize: 12, color: 'var(--g-500)', marginTop: 2 }}>{member.email}</div>
          </div>
          <button className="btn-icon" onClick={onClose}><Icon name="x" size={16} /></button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <InputField label="Nome de exibição" value={name} onChange={setName} placeholder={member.email} />
          <div>
            <div className="label" style={{ marginBottom: 6 }}>Papel</div>
            <select className="input" style={{ fontSize: 13 }} value={role} onChange={e => setRole(e.target.value)}>
              {Object.entries(ROLE_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
          <div>
            <div className="label" style={{ marginBottom: 6 }}>Semáforo DELI</div>
            <select className="input" style={{ fontSize: 13 }} value={semaforo} onChange={e => setSemaforo(e.target.value)}>
              {Object.entries(SEMAFORO).map(([k, v]) => <option key={k} value={k}>{v.label} — {v.desc}</option>)}
            </select>
          </div>
          {error && <div style={{ fontSize: 12, color: 'var(--red)', padding: '8px 12px', background: '#fff5f5', borderRadius: 'var(--r-sm)' }}>{error}</div>}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 20 }}>
          <button className="btn-secondary" style={{ color: 'var(--red)', borderColor: 'var(--red-soft)', fontSize: 12 }} onClick={onRemove}>
            <Icon name="trash" size={12} /> Remover do workspace
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Salvando…' : 'Salvar'}</button>
            <button className="btn-secondary" onClick={onClose}>Cancelar</button>
          </div>
        </div>
      </div>
    </>
  );
}

/* ─── Tab: Integrações ────────────────────────────────── */
function TabIntegrations() {
  const connected = SETTINGS_DATA.integrations.filter(i => i.status === 'connected').length;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--g-900)' }}>Integrações validadas</div>
          <div style={{ fontSize: 12, color: 'var(--g-500)', marginTop: 2 }}>
            {connected} de {SETTINGS_DATA.integrations.length} conectadas
          </div>
        </div>
        <button className="btn-secondary"><Icon name="plus" size={14} /> Nova integração</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        {SETTINGS_DATA.integrations.map(intg => {
          const s = INTEGRATION_STATUS[intg.status];
          return (
            <div key={intg.id} className="card" style={{ padding: 16, display: 'flex', gap: 14, alignItems: 'flex-start' }}>
              <div style={{
                width: 40, height: 40, borderRadius: 'var(--r-md)',
                background: intg.color + '18',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>
                <Icon name={intg.icon} size={18} style={{ color: intg.color }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--g-900)' }}>{intg.name}</div>
                  <span className={`badge ${s.cls}`}>{s.label}</span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--g-500)', marginTop: 2 }}>{intg.desc}</div>
                <div style={{ fontSize: 11, color: 'var(--g-400)', marginTop: 4, fontFamily: 'ui-monospace, monospace' }}>
                  {intg.detail}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* iFood highlight */}
      <div className="card" style={{
        padding: 20,
        background: 'linear-gradient(to right, #fff5f5, white)',
        borderLeft: '3px solid var(--red)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <span className="badge badge-red">TASK-403</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--g-900)' }}>Asaas — migração Sandbox → Produção</span>
        </div>
        <div style={{ fontSize: 12, color: 'var(--g-600)', lineHeight: 1.5 }}>
          Asaas está em sandbox. Para ativar cobranças reais, Wandson precisa aprovar com <strong>APROVADO VERMELHO apr-403</strong>. Semáforo: Vermelho.
        </div>
        <button className="btn-primary" style={{ marginTop: 12, fontSize: 12, padding: '7px 14px' }}>
          Solicitar aprovação a Wandson
        </button>
      </div>
    </div>
  );
}

/* ─── Tab: Agentes IA ─────────────────────────────────── */
function TabAgents() {
  const [enabled, setEnabled] = useState(
    Object.fromEntries(AGENTS.map(a => [a.id, true]))
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <SectionCard title="Agentes ativos neste workspace">
        <p style={{ fontSize: 13, color: 'var(--g-600)', marginBottom: 16, lineHeight: 1.6 }}>
          Todos os agentes rodam na VPS <strong>193.202.85.82</strong> via OpenClaw (porta 18789) usando <strong>claude-sonnet-4-20250514</strong>.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {AGENTS.map(a => (
            <div key={a.id} className="card" style={{
              padding: '16px 18px',
              display: 'flex', alignItems: 'center', gap: 14,
              opacity: enabled[a.id] ? 1 : 0.5,
              transition: 'opacity 200ms',
            }}>
              <AgentAvatar id={a.id} size={42} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--g-900)' }}>{a.name}</span>
                  {a.id === 'cora' && <span className="badge badge-green">MVP v1</span>}
                  {a.id === 'deli' && <span className="badge badge-red">Orquestradora</span>}
                </div>
                <div style={{ fontSize: 12, color: 'var(--g-500)', marginTop: 2 }}>{a.role} · {a.desc}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <button className="btn-ghost" style={{ fontSize: 12 }}>
                  <Icon name="gear" size={12} /> Configurar
                </button>
                <Toggle
                  on={enabled[a.id]}
                  onChange={v => setEnabled(prev => ({ ...prev, [a.id]: v }))}
                />
              </div>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Configuração global dos agentes">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: 'var(--g-50)', borderRadius: 'var(--r-md)', border: '1px solid var(--g-200)' }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--g-900)' }}>Modelo de IA</div>
              <div style={{ fontSize: 12, color: 'var(--g-500)', marginTop: 2 }}>claude-sonnet-4-20250514 via Anthropic API</div>
            </div>
            <span className="badge badge-green">Ativo</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: 'var(--g-50)', borderRadius: 'var(--r-md)', border: '1px solid var(--g-200)' }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--g-900)' }}>Secrets (Infisical)</div>
              <div style={{ fontSize: 12, color: 'var(--g-500)', marginTop: 2 }}>ANTHROPIC_API_KEY, HEYGEN_API_KEY · 172.18.0.3:8080</div>
            </div>
            <span className="badge badge-green">Sincronizado</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: 'var(--g-50)', borderRadius: 'var(--r-md)', border: '1px solid var(--g-200)' }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--g-900)' }}>OpenClaw</div>
              <div style={{ fontSize: 12, color: 'var(--g-500)', marginTop: 2 }}>Porta 18789 · Node.js v22.22.2 · Docker v29.4</div>
            </div>
            <span className="badge badge-green">Online</span>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}

/* ─── Tab: Billing ────────────────────────────────────── */
function TabBilling() {
  const { budget, current, items, plan } = SETTINGS_DATA.billing;
  const pct     = Math.round((current / budget) * 100);
  const restante = budget - current;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Budget meter */}
      <div className="card" style={{ padding: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 16 }}>
          <div>
            <div className="label" style={{ marginBottom: 4 }}>Gasto mensal da stack</div>
            <div style={{ fontSize: 36, fontWeight: 800, color: 'var(--g-900)', letterSpacing: -1 }}>
              R$ {current.toLocaleString('pt-BR')},00
            </div>
            <div style={{ fontSize: 13, color: 'var(--g-500)', marginTop: 4 }}>
              de R$ {budget.toLocaleString('pt-BR')},00 de orçamento máximo · sobram{' '}
              <strong style={{ color: 'var(--success)' }}>R$ {restante.toLocaleString('pt-BR')},00</strong>
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 28, fontWeight: 800, color: pct > 85 ? 'var(--red)' : 'var(--success)' }}>{pct}%</div>
            <div style={{ fontSize: 11, color: 'var(--g-500)' }}>do budget</div>
          </div>
        </div>
        <div style={{ height: 12, background: 'var(--g-100)', borderRadius: 6, overflow: 'hidden' }}>
          <div style={{
            height: '100%', width: `${pct}%`,
            background: pct > 85 ? 'var(--red)' : pct > 70 ? 'var(--warn)' : 'var(--success)',
            borderRadius: 6, transition: 'width 600ms var(--ease-out)',
          }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
          <span style={{ fontSize: 11, color: 'var(--g-500)' }}>R$ 0</span>
          <span style={{ fontSize: 11, color: 'var(--g-500)' }}>Limite: R$ {budget}</span>
        </div>
      </div>

      {/* Breakdown */}
      <SectionCard title="Breakdown por serviço">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0, border: '1px solid var(--g-200)', borderRadius: 'var(--r-md)', overflow: 'hidden' }}>
          {items.map((item, i) => {
            const barPct = Math.round((item.cost / current) * 100);
            return (
              <div key={item.name} style={{
                padding: '14px 16px',
                borderBottom: i < items.length - 1 ? '1px solid var(--g-100)' : 'none',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--g-900)' }}>{item.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--g-500)' }}>{item.category} · {barPct}% do total</div>
                  </div>
                  <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--g-900)', fontVariantNumeric: 'tabular-nums' }}>
                    R$ {item.cost.toLocaleString('pt-BR')}
                    <span style={{ fontSize: 11, color: 'var(--g-500)', fontWeight: 400 }}>/mês</span>
                  </div>
                </div>
                <div style={{ height: 4, background: 'var(--g-100)', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', width: `${barPct}%`,
                    background: 'var(--red)', borderRadius: 2,
                  }} />
                </div>
              </div>
            );
          })}
          {/* Total */}
          <div style={{
            padding: '14px 16px', background: 'var(--g-50)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--g-900)' }}>Total estimado</span>
            <span style={{ fontWeight: 800, fontSize: 16, color: 'var(--g-900)' }}>R$ {current.toLocaleString('pt-BR')}/mês</span>
          </div>
        </div>
      </SectionCard>

      {/* Plan */}
      <SectionCard title="Plano atual">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--g-900)' }}>Plano {plan}</div>
            <div style={{ fontSize: 13, color: 'var(--g-500)', marginTop: 4 }}>
              SaaS multi-tenant · deploy na Vercel · repo consult-delivery-os/deli-os
            </div>
          </div>
          <span className="badge badge-green" style={{ fontSize: 12, padding: '4px 12px' }}>Ativo</span>
        </div>
      </SectionCard>
    </div>
  );
}

/* ─── Tab: Segurança ──────────────────────────────────── */
function TabSecurity() {
  const [mfaActive,    setMfaActive]    = useState(false);
  const [showMFA,      setShowMFA]      = useState(false);
  const [factorId,     setFactorId]     = useState('');
  const [qrSvg,        setQrSvg]        = useState('');
  const [secret,       setSecret]       = useState('');
  const [verifyCode,   setVerifyCode]   = useState('');
  const [verifying,    setVerifying]    = useState(false);
  const [verifyError,  setVerifyError]  = useState('');
  const [enrolling,    setEnrolling]    = useState(false);

  async function handleEnroll2FA() {
    setEnrolling(true);
    setVerifyError('');
    try {
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp' });
      if (error) { alert(error.message); setEnrolling(false); return; }
      setFactorId(data.id);
      setQrSvg(data.totp.qr_code);    // SVG data URI
      setSecret(data.totp.secret);
      setShowMFA(true);
    } catch (err) {
      alert(err?.message || 'Erro ao iniciar 2FA');
    }
    setEnrolling(false);
  }

  async function handleVerify() {
    if (!verifyCode || verifyCode.length !== 6) { setVerifyError('Digite o código de 6 dígitos'); return; }
    setVerifying(true);
    setVerifyError('');
    try {
      const { data: chal, error: cErr } = await supabase.auth.mfa.challenge({ factorId });
      if (cErr) { setVerifyError(cErr.message); setVerifying(false); return; }
      const { error: vErr } = await supabase.auth.mfa.verify({ factorId, challengeId: chal.id, code: verifyCode });
      if (vErr) { setVerifyError('Código inválido. Tente novamente.'); setVerifying(false); return; }
      setMfaActive(true);
      setShowMFA(false);
    } catch (err) {
      setVerifyError(err?.message || 'Erro na verificação');
    }
    setVerifying(false);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <SectionCard title="Autenticação">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <SecurityRow
            title="Supabase Auth"
            desc="Login com e-mail e senha · JWT · sessão de 7 dias"
            status="Ativo"
            statusCls="badge-green"
          />
          <SecurityRow
            title="Row Level Security (RLS)"
            desc="Isolamento de dados multi-tenant ativo em todas as tabelas"
            status="Ativo"
            statusCls="badge-green"
          />
          <SecurityRow
            title="2FA (autenticação em dois fatores)"
            desc="Recomendado para contas admin · TOTP via app autenticador"
            status={mfaActive ? 'Ativo' : 'Pendente'}
            statusCls={mfaActive ? 'badge-green' : 'badge-yellow'}
            action={mfaActive ? null : enrolling ? 'Ativando…' : 'Ativar'}
            onAction={handleEnroll2FA}
          />
        </div>
      </SectionCard>

      {/* 2FA Modal */}
      {showMFA && (
        <>
          <div onClick={() => setShowMFA(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(13,13,13,0.5)', zIndex: 100 }} />
          <div style={{
            position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
            background: 'var(--white)', borderRadius: 'var(--r-lg)', padding: 32, zIndex: 101,
            width: 400, boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--g-900)' }}>Ativar autenticação 2FA</div>
                <div style={{ fontSize: 12, color: 'var(--g-500)', marginTop: 2 }}>Escaneie com Google Authenticator ou Authy</div>
              </div>
              <button className="btn-icon" onClick={() => setShowMFA(false)}><Icon name="x" size={16} /></button>
            </div>

            {/* QR Code */}
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
              {qrSvg
                ? <img src={qrSvg} alt="QR 2FA" style={{ width: 200, height: 200, borderRadius: 8 }} />
                : <div style={{ width: 200, height: 200, background: 'var(--g-100)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, color: 'var(--g-400)' }}>Gerando QR…</div>
              }
            </div>

            {/* Manual secret */}
            {secret && (
              <div style={{ marginBottom: 16, padding: '10px 12px', background: 'var(--g-50)', borderRadius: 'var(--r-sm)', border: '1px solid var(--g-200)' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--g-500)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Chave manual</div>
                <code style={{ fontSize: 12, color: 'var(--g-900)', wordBreak: 'break-all', fontFamily: 'ui-monospace, monospace' }}>{secret}</code>
              </div>
            )}

            {/* Verify code */}
            <div style={{ marginBottom: 16 }}>
              <div className="label" style={{ marginBottom: 6 }}>Código de verificação (6 dígitos)</div>
              <input
                className="input"
                placeholder="000000"
                maxLength={6}
                value={verifyCode}
                onChange={e => { setVerifyCode(e.target.value.replace(/\D/g, '')); setVerifyError(''); }}
                style={{ fontSize: 20, letterSpacing: 4, textAlign: 'center', fontFamily: 'ui-monospace, monospace' }}
              />
              {verifyError && <div style={{ fontSize: 12, color: 'var(--red)', marginTop: 6 }}>{verifyError}</div>}
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn-primary" onClick={handleVerify} disabled={verifying || verifyCode.length !== 6}>
                {verifying ? 'Verificando…' : 'Confirmar e ativar'}
              </button>
              <button className="btn-secondary" onClick={() => setShowMFA(false)}>Cancelar</button>
            </div>
          </div>
        </>
      )}


      <SectionCard title="Secrets e API Keys">
        <p style={{ fontSize: 13, color: 'var(--g-600)', marginBottom: 14, lineHeight: 1.6 }}>
          Secrets gerenciados via <strong>Infisical self-hosted</strong> (172.18.0.3:8080). Nunca expostos no frontend.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[
            { key: 'ANTHROPIC_API_KEY', source: 'Infisical',   status: 'Ativa'    },
            { key: 'HEYGEN_API_KEY',    source: 'Infisical',   status: 'Ativa'    },
            { key: 'SUPABASE_ANON_KEY', source: 'Vercel env',  status: 'Ativa'    },
            { key: 'EVOLUTION_API_KEY', source: 'Infisical',   status: 'Ativa'    },
            { key: 'ASAAS_API_KEY',     source: 'Infisical',   status: 'Sandbox'  },
          ].map(item => (
            <div key={item.key} style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '10px 14px', background: 'var(--g-900)',
              borderRadius: 'var(--r-sm)',
            }}>
              <code style={{ fontSize: 12, color: '#22D3EE', flex: 1, fontFamily: 'ui-monospace, monospace' }}>
                {item.key}
              </code>
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{item.source}</span>
              <span className={item.status === 'Ativa' ? 'badge badge-green' : 'badge badge-yellow'} style={{ fontSize: 10 }}>
                {item.status}
              </span>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Deploy e repositório">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <SecurityRow title="GitHub"  desc="consult-delivery-os/deli-os · 146 objetos" status="Conectado" statusCls="badge-green" />
          <SecurityRow title="Vercel"  desc="Branch main → deploy automático" status="Ativo" statusCls="badge-green" />
          <SecurityRow title="Domínio" desc="deli-os.vercel.app" status="Ativo" statusCls="badge-green" />
        </div>
      </SectionCard>
    </div>
  );
}

/* ─── Componentes auxiliares ──────────────────────────── */
function SectionCard({ title, children, danger }) {
  return (
    <div className="card" style={{
      padding: 24,
      borderColor: danger ? 'var(--red-soft)' : undefined,
    }}>
      <div style={{
        fontSize: 15, fontWeight: 700, color: danger ? 'var(--red)' : 'var(--g-900)',
        marginBottom: 16,
      }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function Field({ label, value, mono }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--g-500)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
        {label}
      </div>
      <div style={{
        padding: '9px 12px',
        border: '1px solid var(--g-300)', borderRadius: 'var(--r-sm)',
        fontSize: 13, color: 'var(--g-900)', background: 'var(--white)',
        fontFamily: mono ? 'ui-monospace, monospace' : 'inherit',
      }}>
        {value}
      </div>
    </div>
  );
}

function InputField({ label, value, onChange, placeholder, mono, type = 'text' }) {
  return (
    <div>
      <div className="label" style={{ marginBottom: 6 }}>{label}</div>
      <input
        className="input"
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder || ''}
        style={{ fontSize: 13, fontFamily: mono ? 'ui-monospace, monospace' : 'inherit' }}
      />
    </div>
  );
}

function SecurityRow({ title, desc, status, statusCls, action, onAction }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 14,
      padding: '12px 16px', border: '1px solid var(--g-200)',
      borderRadius: 'var(--r-md)', background: 'var(--white)',
    }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--g-900)' }}>{title}</div>
        <div style={{ fontSize: 12, color: 'var(--g-500)', marginTop: 2 }}>{desc}</div>
      </div>
      <span className={`badge ${statusCls}`}>{status}</span>
      {action && (
        <button className="btn-secondary" style={{ fontSize: 12, padding: '5px 10px' }} onClick={onAction}>{action}</button>
      )}
    </div>
  );
}

function Toggle({ on, onChange }) {
  return (
    <button
      onClick={() => onChange(!on)}
      data-on={on ? '1' : '0'}
      className="twk-toggle"
      style={{ width: 36, height: 20 }}
    >
      <i />
    </button>
  );
}
