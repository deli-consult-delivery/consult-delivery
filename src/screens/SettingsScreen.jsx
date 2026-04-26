import { useState, useEffect } from 'react';
import Icon from '../components/Icon.jsx';
import AgentAvatar from '../components/AgentAvatar.jsx';
import UserAvatar from '../components/UserAvatar.jsx';
import { SETTINGS_DATA, AGENTS } from '../data.js';
import { supabase } from '../lib/supabase.js';
import { setWebhook, getQRCode, getInstanceStatus } from '../lib/evolution.js';

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
export default function SettingsScreen({ tenant }) {
  const [tab, setTab] = useState('workspace');
  const workspace = SETTINGS_DATA.workspace[tenant] || SETTINGS_DATA.workspace['pizza-joao'];

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
            background: 'var(--g-900)', color: 'white',
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
          {tab === 'workspace'    && <TabWorkspace workspace={workspace} />}
          {tab === 'users'        && <TabUsers />}
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
    if (!HAS_EVO) return;
    setQrLoading(true);
    try {
      const data = await getQRCode(instanceName);
      const b64  = data?.base64 || data?.qrcode?.base64 || null;
      if (b64) setQrData(b64);

      // Verificar se já conectou
      const status = await getInstanceStatus(instanceName);
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

  async function handleConfigureWebhook(instanceName) {
    if (!HAS_EVO || !WEBHOOK) {
      alert('Configure VITE_EVOLUTION_URL e VITE_SUPABASE_URL primeiro.');
      return;
    }
    try {
      await setWebhook(instanceName, WEBHOOK);
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
                      background: 'white',
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
                            onClick={() => handleConfigureWebhook(inst.instance_name)}
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
            background: 'white', borderRadius: 'var(--r-lg)',
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
function TabWorkspace({ workspace }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <SectionCard title="Informações do workspace">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <Field label="Nome do restaurante" value={workspace.name} />
          <Field label="Segmento" value={workspace.segment} />
          <Field label="Slug (URL)" value={workspace.slug} mono />
          <Field label="Telefone principal" value={workspace.phone} />
          <Field label="Cidade" value={workspace.city} />
          <Field label="Fuso horário" value="America/Sao_Paulo (GMT-3)" />
        </div>
        <div style={{ marginTop: 20, display: 'flex', gap: 8 }}>
          <button className="btn-primary"><Icon name="check" size={14} /> Salvar alterações</button>
          <button className="btn-secondary">Cancelar</button>
        </div>
      </SectionCard>

      <SectionCard title="Identidade visual">
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <div style={{
            width: 72, height: 72, borderRadius: 'var(--r-lg)',
            background: 'var(--g-100)', border: '2px dashed var(--g-300)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 36,
          }}>
            {workspace.emoji}
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--g-900)' }}>{workspace.name}</div>
            <div style={{ fontSize: 12, color: 'var(--g-500)', marginTop: 2 }}>{workspace.segment}</div>
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button className="btn-secondary" style={{ fontSize: 12, padding: '6px 12px' }}>Trocar emoji</button>
              <button className="btn-secondary" style={{ fontSize: 12, padding: '6px 12px' }}>Upload logo</button>
            </div>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Zona de perigo" danger>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--g-900)' }}>Excluir workspace</div>
            <div style={{ fontSize: 12, color: 'var(--g-500)', marginTop: 2 }}>Esta ação é irreversível e remove todos os dados.</div>
          </div>
          <button className="btn-secondary" style={{ color: 'var(--red)', borderColor: 'var(--red-soft)' }}>
            Excluir workspace
          </button>
        </div>
      </SectionCard>
    </div>
  );
}

/* ─── Tab: Usuários ───────────────────────────────────── */
function TabUsers() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <SectionCard title="Membros da equipe">
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
          <button className="btn-primary" style={{ fontSize: 13 }}>
            <Icon name="plus" size={13} /> Convidar membro
          </button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0, border: '1px solid var(--g-200)', borderRadius: 'var(--r-md)', overflow: 'hidden' }}>
          {SETTINGS_DATA.users.map((u, i) => {
            const role = ROLE_MAP[u.role] || ROLE_MAP.operador;
            const sem  = SEMAFORO[u.semaforo];
            return (
              <div key={u.id} style={{
                display: 'flex', alignItems: 'center', gap: 14,
                padding: '14px 16px',
                borderBottom: i < SETTINGS_DATA.users.length - 1 ? '1px solid var(--g-100)' : 'none',
                background: 'white',
                transition: 'background 120ms',
              }}>
                <div style={{ position: 'relative' }}>
                  <UserAvatar name={u.avatar} size={38} />
                  {u.online && (
                    <span style={{
                      position: 'absolute', bottom: 0, right: 0,
                      width: 10, height: 10, borderRadius: '50%',
                      background: 'var(--success)', border: '2px solid white',
                    }} />
                  )}
                </div>
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
                <button className="btn-ghost" style={{ fontSize: 12 }}>
                  <Icon name="gear" size={12} /> Editar
                </button>
              </div>
            );
          })}
        </div>
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
              background: 'white',
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
                {r.perms.map(p => (
                  <span key={p} className="badge badge-gray">{p}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
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
            desc="Recomendado para contas admin"
            status="Pendente"
            statusCls="badge-yellow"
            action="Ativar"
          />
        </div>
      </SectionCard>

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
        fontSize: 13, color: 'var(--g-900)', background: 'white',
        fontFamily: mono ? 'ui-monospace, monospace' : 'inherit',
      }}>
        {value}
      </div>
    </div>
  );
}

function SecurityRow({ title, desc, status, statusCls, action }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 14,
      padding: '12px 16px', border: '1px solid var(--g-200)',
      borderRadius: 'var(--r-md)', background: 'white',
    }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--g-900)' }}>{title}</div>
        <div style={{ fontSize: 12, color: 'var(--g-500)', marginTop: 2 }}>{desc}</div>
      </div>
      <span className={`badge ${statusCls}`}>{status}</span>
      {action && (
        <button className="btn-secondary" style={{ fontSize: 12, padding: '5px 10px' }}>{action}</button>
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
