import { useState, useEffect, useRef } from 'react';
import Icon from '../components/Icon.jsx';
import AgentAvatar from '../components/AgentAvatar.jsx';
import UserAvatar from '../components/UserAvatar.jsx';
import { CRM_DATA, AGENTS } from '../data.js';
import { supabase } from '../lib/supabase.js';

const STATUS_MAP = {
  vip:       { label: 'VIP',        cls: 'badge-yellow' },
  recurrent: { label: 'Recorrente', cls: 'badge-blue'   },
  new:       { label: 'Novo',       cls: 'badge-green'  },
  inactive:  { label: 'Inativo',    cls: 'badge-gray'   },
};

const TABS = [
  { id: 'all',       label: 'Todos'      },
  { id: 'vip',       label: 'VIP'        },
  { id: 'recurrent', label: 'Recorrentes'},
  { id: 'new',       label: 'Novos'      },
  { id: 'inactive',  label: 'Inativos'   },
  { id: 'grupos',    label: 'Grupos'     },
];

const initials = name =>
  (name || '??').split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();

function mapCustomers(rows) {
  return rows.map(c => {
    const orders = c.orders || [];
    const totalOrders = orders.length;
    const totalSpentCents = orders.reduce((s, o) => s + (o.total_cents || 0), 0);
    const sorted = [...orders].sort((a, b) => new Date(b.placed_at) - new Date(a.placed_at));
    const lastOrderDate = sorted[0]?.placed_at
      ? new Date(sorted[0].placed_at).toLocaleDateString('pt-BR')
      : '—';
    const status = c.metadata?.status
      || (c.is_vip ? 'vip' : totalOrders > 5 ? 'recurrent' : 'new');
    return {
      id: c.id,
      name: c.name || '',
      avatar: initials(c.name),
      phone: c.phone || '',
      email: c.email || '',
      status,
      is_vip: c.is_vip || false,
      tags: c.tags || [],
      totalOrders,
      totalSpent: `R$ ${(totalSpentCents / 100).toFixed(2).replace('.', ',')}`,
      lastOrder: lastOrderDate,
      since: new Date(c.created_at).toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' }),
      agent: null,
      metadata: c.metadata || {},
      _raw: c,
    };
  });
}

export default function CRMScreen({ tenant, tenantDbId }) {
  const mockData = CRM_DATA[tenant] || { kpis: { total: 0, ativos: 0, ticket: 'R$ 0', nps: 0 }, clients: [] };

  const [clients, setClients]           = useState(mockData.clients);
  const [usingReal, setUsingReal]       = useState(false);
  const [loading, setLoading]           = useState(false);
  const [tab, setTab]                   = useState('all');
  const [search, setSearch]             = useState('');
  const [selectedId, setSelectedId]     = useState(null);
  const [view, setView]                 = useState('list');
  const [showNovo, setShowNovo]         = useState(false);
  const [showImportar, setShowImportar] = useState(false);

  // ── Carregar clientes reais ─────────────────────────────────
  useEffect(() => {
    if (!tenantDbId) return;
    loadCustomers();
  }, [tenantDbId]);

  async function loadCustomers() {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('customers')
        .select('*, orders(id, total_cents, placed_at, items_summary, status)')
        .eq('tenant_id', tenantDbId)
        .order('updated_at', { ascending: false });
      if (data?.length) {
        setClients(mapCustomers(data));
        setUsingReal(true);
      }
    } catch { /* usar mock */ }
    setLoading(false);
  }

  async function handleClientCreated(newClient) {
    setClients(prev => [newClient, ...prev]);
    setShowNovo(false);
  }

  async function handleClientsImported(newClients) {
    setClients(prev => [...newClients, ...prev]);
    setShowImportar(false);
  }

  const data = { kpis: mockData.kpis };
  const total = clients.length;
  const ativos = clients.filter(c => c.status !== 'inactive').length;
  const npsColor = data.kpis.nps >= 80 ? 'var(--success)' : data.kpis.nps >= 60 ? 'var(--warn)' : 'var(--red)';

  const filtered = tab === 'grupos' ? [] : clients.filter(c => {
    const matchesTab = tab === 'all' || c.status === tab;
    const matchesSearch = !search
      || c.name.toLowerCase().includes(search.toLowerCase())
      || c.phone.includes(search);
    return matchesTab && matchesSearch;
  });

  const selectedClient = clients.find(c => c.id === selectedId);

  return (
    <div className="route-enter" style={{ padding: 32, maxWidth: 1400, margin: '0 auto', position: 'relative' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 24 }}>
        <div>
          <h1 className="page-h1">Clientes / CRM</h1>
          <p className="page-sub">
            {usingReal ? `${total} clientes cadastrados · ${ativos} ativos` : `${data.kpis.total} clientes cadastrados · ${data.kpis.ativos} ativos este mes`}
            {usingReal && <span style={{ marginLeft: 8, color: 'var(--success)', fontSize: 11 }}>● dados reais</span>}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ display: 'flex', background: 'var(--g-100)', borderRadius: 6, padding: 3, gap: 2 }}>
            {['list','kanban'].map(v => (
              <button
                key={v}
                onClick={() => setView(v)}
                style={{
                  padding: '5px 10px', borderRadius: 4, fontSize: 12, fontWeight: 600,
                  background: view === v ? 'white' : 'transparent',
                  color: view === v ? 'var(--g-900)' : 'var(--g-500)',
                  boxShadow: view === v ? 'var(--sh-card)' : 'none',
                }}
              >
                <Icon name={v === 'list' ? 'list' : 'columns'} size={13} /> {v === 'list' ? 'Lista' : 'Kanban'}
              </button>
            ))}
          </div>
          <button className="btn-secondary" onClick={() => setShowImportar(true)}>
            <Icon name="upload" size={14} /> Importar
          </button>
          <button className="btn-primary" onClick={() => setShowNovo(true)}>
            <Icon name="plus" size={14} /> Novo cliente
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
        <div className="kpi">
          <div className="kpi-label">Total de clientes</div>
          <div className="kpi-value" style={{ marginTop: 8 }}>{usingReal ? total : data.kpis.total}</div>
          <div className="kpi-delta up" style={{ marginTop: 10 }}><Icon name="arrowup" size={11} />{usingReal ? ativos : data.kpis.ativos} ativos</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Clientes ativos</div>
          <div className="kpi-value" style={{ marginTop: 8, color: 'var(--success)' }}>{usingReal ? ativos : data.kpis.ativos}</div>
          <div className="kpi-delta up" style={{ marginTop: 10 }}><Icon name="arrowup" size={11} />Ultimo mes</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Ticket medio</div>
          <div className="kpi-value" style={{ marginTop: 8 }}>{data.kpis.ticket}</div>
          <div className="kpi-delta up" style={{ marginTop: 10 }}><Icon name="arrowup" size={11} />+5% vs mes passado</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">NPS</div>
          <div className="kpi-value" style={{ marginTop: 8, color: npsColor }}>{data.kpis.nps}</div>
          <div className="kpi-delta neutral" style={{ marginTop: 10 }}>
            <Icon name="info" size={11} />
            {data.kpis.nps >= 80 ? 'Excelente' : data.kpis.nps >= 60 ? 'Bom' : 'Atencao'}
          </div>
        </div>
      </div>

      {/* Tabs + Search */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 0 }}>
        <div style={{ display: 'flex', gap: 2, borderBottom: '1px solid var(--g-200)' }}>
          {TABS.map(t => {
            const count = t.id === 'all' ? clients.length
              : t.id === 'grupos' ? null
              : clients.filter(c => c.status === t.id).length;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                style={{
                  padding: '12px 16px', fontSize: 13,
                  fontWeight: tab === t.id ? 700 : 500,
                  color: tab === t.id ? 'var(--red)' : 'var(--g-600)',
                  borderBottom: tab === t.id ? '2px solid var(--red)' : '2px solid transparent',
                  marginBottom: -1, transition: 'all 150ms', whiteSpace: 'nowrap',
                }}
              >
                {t.label}
                {count !== null && (
                  <span style={{ marginLeft: 6, color: 'var(--g-500)', fontSize: 12 }}>{count}</span>
                )}
              </button>
            );
          })}
        </div>
        {tab !== 'grupos' && (
          <div style={{ position: 'relative', marginBottom: -1 }}>
            <Icon name="search" size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--g-400)', pointerEvents: 'none' }} />
            <input
              className="input"
              style={{ paddingLeft: 34, width: 240, fontSize: 13 }}
              placeholder="Buscar cliente ou telefone..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        )}
      </div>

      {/* Conteudo */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--g-400)', fontSize: 13 }}>
          Carregando clientes...
        </div>
      ) : tab === 'grupos' ? (
        <GruposView tenantDbId={tenantDbId} clients={clients} />
      ) : view === 'list' ? (
        <div className="card" style={{ overflow: 'hidden', marginTop: 16 }}>
          <table className="tbl">
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Telefone</th>
                <th>Status</th>
                <th>Pedidos</th>
                <th>Total gasto</th>
                <th>Ultimo pedido</th>
                <th>Cliente desde</th>
                <th>Agente</th>
                <th style={{ textAlign: 'right' }}>Acoes</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(c => {
                const s = STATUS_MAP[c.status] || STATUS_MAP.new;
                const agent = c.agent ? AGENTS.find(a => a.id === c.agent) : null;
                return (
                  <tr key={c.id} style={{ cursor: 'pointer' }} onClick={() => setSelectedId(c.id)}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <UserAvatar name={c.avatar} size={34} />
                        <div>
                          <div style={{ fontWeight: 600, color: 'var(--g-900)' }}>{c.name}</div>
                          {c.email && <div style={{ fontSize: 11, color: 'var(--g-400)' }}>{c.email}</div>}
                        </div>
                      </div>
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--g-600)', fontVariantNumeric: 'tabular-nums' }}>{c.phone}</td>
                    <td><span className={`badge ${s.cls}`}>{s.label}</span></td>
                    <td style={{ fontWeight: 600, color: 'var(--g-900)', textAlign: 'center' }}>{c.totalOrders}</td>
                    <td style={{ fontWeight: 700, color: 'var(--g-900)', fontVariantNumeric: 'tabular-nums' }}>{c.totalSpent}</td>
                    <td style={{ fontSize: 12, color: 'var(--g-600)' }}>{c.lastOrder}</td>
                    <td style={{ fontSize: 12, color: 'var(--g-600)' }}>{c.since}</td>
                    <td>
                      {agent
                        ? <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <AgentAvatar id={agent.id} size={22} />
                            <span style={{ fontSize: 12, color: 'var(--g-600)' }}>{agent.name}</span>
                          </div>
                        : <span style={{ fontSize: 12, color: 'var(--g-400)' }}>—</span>
                      }
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        className="btn-ghost"
                        style={{ fontSize: 12 }}
                        onClick={e => { e.stopPropagation(); setSelectedId(c.id); }}
                      >
                        <Icon name="eye" size={12} /> Ver perfil
                      </button>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', padding: 48, color: 'var(--g-500)' }}>
                    Nenhum cliente encontrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <KanbanView clients={filtered} onSelect={setSelectedId} />
      )}

      {/* Modais */}
      {showNovo && (
        <NovoClienteModal
          tenantDbId={tenantDbId}
          onClose={() => setShowNovo(false)}
          onCreated={handleClientCreated}
        />
      )}
      {showImportar && (
        <ImportarModal
          tenantDbId={tenantDbId}
          onClose={() => setShowImportar(false)}
          onImported={handleClientsImported}
        />
      )}
      {selectedClient && (
        <ClientDrawer
          client={selectedClient}
          tenantDbId={tenantDbId}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}

/* ── KanbanView ───────────────────────────────────────────── */
const KANBAN_COLS = [
  { id: 'new',       label: 'Novo',       cls: 'badge-green'  },
  { id: 'recurrent', label: 'Recorrente', cls: 'badge-blue'   },
  { id: 'vip',       label: 'VIP',        cls: 'badge-yellow' },
  { id: 'inactive',  label: 'Inativo',    cls: 'badge-gray'   },
];

function KanbanView({ clients, onSelect }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginTop: 16, alignItems: 'start' }}>
      {KANBAN_COLS.map(col => {
        const colClients = clients.filter(c => c.status === col.id);
        return (
          <div key={col.id} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'white', border: '1px solid var(--g-200)', borderRadius: 'var(--r-md)' }}>
              <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--g-800)' }}>{col.label}</span>
              <span className={`badge ${col.cls}`}>{colClients.length}</span>
            </div>
            {colClients.map(c => (
              <div
                key={c.id}
                onClick={() => onSelect(c.id)}
                className="card"
                style={{ padding: '14px 16px', cursor: 'pointer', transition: 'box-shadow 150ms', display: 'flex', flexDirection: 'column', gap: 10 }}
                onMouseEnter={e => e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.12)'}
                onMouseLeave={e => e.currentTarget.style.boxShadow = ''}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <UserAvatar name={c.avatar} size={34} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--g-900)' }} className="truncate">{c.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--g-500)' }}>{c.phone}</div>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div style={{ background: 'var(--g-50)', borderRadius: 6, padding: '6px 10px' }}>
                    <div style={{ fontSize: 10, color: 'var(--g-500)', marginBottom: 2 }}>Ultimo pedido</div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--g-800)' }}>{c.lastOrder}</div>
                  </div>
                  <div style={{ background: 'var(--g-50)', borderRadius: 6, padding: '6px 10px' }}>
                    <div style={{ fontSize: 10, color: 'var(--g-500)', marginBottom: 2 }}>Total gasto</div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--red)' }}>{c.totalSpent}</div>
                  </div>
                </div>
              </div>
            ))}
            {colClients.length === 0 && (
              <div style={{ padding: '20px 14px', textAlign: 'center', border: '1px dashed var(--g-200)', borderRadius: 'var(--r-md)', fontSize: 12, color: 'var(--g-400)' }}>
                Nenhum cliente
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ── NovoClienteModal ─────────────────────────────────────── */
function NovoClienteModal({ tenantDbId, onClose, onCreated }) {
  const [form, setForm] = useState({ name: '', phone: '', email: '', status: 'new', notes: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  async function handleSave() {
    if (!form.name.trim()) { setError('Nome obrigatório'); return; }
    if (!tenantDbId) { setError('Workspace não identificado. Recarregue a página.'); return; }
    setSaving(true);
    setError('');
    try {
      const payload = {
        name:      form.name.trim(),
        phone:     form.phone.trim(),
        email:     form.email.trim(),
        is_vip:    form.status === 'vip',
        metadata:  { status: form.status, notes: form.notes },
        tenant_id: tenantDbId,
      };

      const { data, error: err } = await supabase
        .from('customers')
        .insert(payload)
        .select('*, orders(id, total_cents, placed_at)')
        .single();

      if (err) {
        console.error('[CRM] Erro ao criar cliente:', err);
        throw err;
      }
      onCreated(mapCustomers([data])[0]);
    } catch (e) {
      setError(e.message || 'Erro ao salvar. Verifique o console.');
    }
    setSaving(false);
  }

  return (
    <ModalOverlay onClose={onClose}>
      <div style={{ width: 440 }}>
        <ModalHeader title="Novo cliente" onClose={onClose} />
        <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Field label="Nome *">
            <input className="input" value={form.name} onChange={e => set('name', e.target.value)} placeholder="Nome completo" autoFocus />
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Telefone">
              <input className="input" value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="(11) 99999-9999" />
            </Field>
            <Field label="Status">
              <select className="input" value={form.status} onChange={e => set('status', e.target.value)}>
                <option value="new">Novo</option>
                <option value="recurrent">Recorrente</option>
                <option value="vip">VIP</option>
                <option value="inactive">Inativo</option>
              </select>
            </Field>
          </div>
          <Field label="Email">
            <input className="input" value={form.email} onChange={e => set('email', e.target.value)} placeholder="email@exemplo.com" />
          </Field>
          <Field label="Notas internas">
            <textarea className="input" value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Observacoes sobre o cliente..." style={{ minHeight: 80, resize: 'vertical' }} />
          </Field>
          {error && <div style={{ fontSize: 12, color: 'var(--red)', padding: '8px 12px', background: 'var(--red-soft)', borderRadius: 6 }}>{error}</div>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="btn-secondary" onClick={onClose}>Cancelar</button>
            <button className="btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? 'Salvando...' : 'Criar cliente'}
            </button>
          </div>
        </div>
      </div>
    </ModalOverlay>
  );
}

/* ── ImportarModal ────────────────────────────────────────── */
function ImportarModal({ tenantDbId, onClose, onImported }) {
  const [file, setFile]         = useState(null);
  const [preview, setPreview]   = useState([]);
  const [progress, setProgress] = useState(null);
  const [result, setResult]     = useState(null);
  const [error, setError]       = useState('');
  const inputRef = useRef();

  function parseCSV(text) {
    const lines = text.trim().split('\n').filter(Boolean);
    if (lines.length < 2) return [];
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/[^a-z]/g, ''));
    return lines.slice(1).map(line => {
      const vals = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''));
      const obj = {};
      headers.forEach((h, i) => { obj[h] = vals[i] || ''; });
      return obj;
    }).filter(r => r.nome || r.name);
  }

  function handleFile(f) {
    setFile(f);
    setResult(null);
    setError('');
    const reader = new FileReader();
    reader.onload = e => {
      const rows = parseCSV(e.target.result);
      setPreview(rows.slice(0, 5));
    };
    reader.readAsText(f);
  }

  async function handleImport() {
    if (!file) return;
    setError('');
    const reader = new FileReader();
    reader.onload = async e => {
      const rows = parseCSV(e.target.result);
      setProgress({ done: 0, total: rows.length });

      const batch = rows.map(r => ({
        name:      r.nome || r.name || '',
        phone:     r.telefone || r.phone || '',
        email:     r.email || '',
        is_vip:    (r.status || '').toLowerCase() === 'vip',
        metadata:  { status: (r.status || 'new').toLowerCase() },
        ...(tenantDbId ? { tenant_id: tenantDbId } : {}),
      })).filter(r => r.name);

      try {
        const { data, error: err } = await supabase
          .from('customers')
          .insert(batch)
          .select('*, orders(id, total_cents, placed_at)');

        if (err) throw err;
        const mapped = mapCustomers(data || []);
        setProgress({ done: batch.length, total: batch.length });
        setResult({ ok: mapped.length, fail: batch.length - mapped.length });
        onImported(mapped);
      } catch (err) {
        setError(err.message || 'Erro ao importar');
        setProgress(null);
      }
    };
    reader.readAsText(file);
  }

  return (
    <ModalOverlay onClose={onClose}>
      <div style={{ width: 480 }}>
        <ModalHeader title="Importar clientes (CSV)" onClose={onClose} />
        <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ padding: 12, background: 'var(--g-50)', borderRadius: 8, fontSize: 12, color: 'var(--g-600)' }}>
            <strong>Formato esperado (cabecalho na 1a linha):</strong><br />
            <code style={{ fontSize: 11 }}>nome,telefone,email,status</code><br />
            Status: novo, recorrente, vip, inativo
          </div>

          {/* Drop area */}
          <div
            style={{
              border: '2px dashed var(--g-300)', borderRadius: 10,
              padding: '32px 20px', textAlign: 'center', cursor: 'pointer',
              background: file ? 'rgba(183,12,0,0.03)' : 'var(--g-50)',
              borderColor: file ? 'var(--red)' : 'var(--g-300)',
            }}
            onClick={() => inputRef.current?.click()}
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
          >
            <Icon name="upload" size={24} style={{ color: 'var(--g-400)', marginBottom: 8 }} />
            <div style={{ fontSize: 13, color: 'var(--g-700)', fontWeight: 600 }}>
              {file ? file.name : 'Clique ou arraste o arquivo CSV'}
            </div>
            <div style={{ fontSize: 11, color: 'var(--g-400)', marginTop: 4 }}>Apenas arquivos .csv</div>
            <input ref={inputRef} type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={e => e.target.files[0] && handleFile(e.target.files[0])} />
          </div>

          {/* Preview */}
          {preview.length > 0 && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--g-500)', textTransform: 'uppercase', marginBottom: 8 }}>
                Pre-visualizacao ({preview.length} primeiras linhas)
              </div>
              <div style={{ border: '1px solid var(--g-200)', borderRadius: 8, overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <tbody>
                    {preview.map((r, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid var(--g-100)' }}>
                        <td style={{ padding: '6px 10px', fontWeight: 600 }}>{r.nome || r.name}</td>
                        <td style={{ padding: '6px 10px', color: 'var(--g-500)' }}>{r.telefone || r.phone}</td>
                        <td style={{ padding: '6px 10px', color: 'var(--g-500)' }}>{r.email}</td>
                        <td style={{ padding: '6px 10px' }}><span className="badge badge-gray">{r.status || 'novo'}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Progress */}
          {progress && (
            <div style={{ padding: '10px 14px', background: 'var(--g-50)', borderRadius: 8 }}>
              <div style={{ fontSize: 12, color: 'var(--g-700)', marginBottom: 6 }}>
                Importando... {progress.done}/{progress.total}
              </div>
              <div style={{ height: 6, background: 'var(--g-200)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${(progress.done / progress.total) * 100}%`, background: 'var(--red)', borderRadius: 3, transition: 'width 300ms' }} />
              </div>
            </div>
          )}

          {/* Result */}
          {result && (
            <div style={{ padding: '10px 14px', background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--success)' }}>
                {result.ok} cliente{result.ok !== 1 ? 's' : ''} importado{result.ok !== 1 ? 's' : ''} com sucesso!
              </div>
              {result.fail > 0 && <div style={{ fontSize: 12, color: 'var(--warn)', marginTop: 4 }}>{result.fail} linha(s) ignoradas</div>}
            </div>
          )}

          {error && <div style={{ fontSize: 12, color: 'var(--red)', padding: '8px 12px', background: 'var(--red-soft)', borderRadius: 6 }}>{error}</div>}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="btn-secondary" onClick={onClose}>
              {result ? 'Fechar' : 'Cancelar'}
            </button>
            {!result && (
              <button className="btn-primary" onClick={handleImport} disabled={!file || !!progress}>
                <Icon name="upload" size={13} /> Importar
              </button>
            )}
          </div>
        </div>
      </div>
    </ModalOverlay>
  );
}

/* ── GruposView ───────────────────────────────────────────── */
function GruposView({ tenantDbId, clients }) {
  const [grupos, setGrupos]       = useState([]);
  const [loading, setLoading]     = useState(true);
  const [editGrupo, setEditGrupo] = useState(null); // null | 'new' | group object
  const [membersOf, setMembersOf] = useState(null); // group to manage members

  useEffect(() => {
    loadGrupos();
  }, [tenantDbId]);

  async function loadGrupos() {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('customer_groups')
        .select('*, customer_group_members(customer_id)')
        .order('created_at', { ascending: false });
      setGrupos(data || []);
    } catch { setGrupos([]); }
    setLoading(false);
  }

  async function handleSaveGrupo(form) {
    if (form.id) {
      await supabase.from('customer_groups').update({ name: form.name, description: form.description, color: form.color }).eq('id', form.id);
    } else {
      await supabase.from('customer_groups').insert({ name: form.name, description: form.description, color: form.color });
    }
    setEditGrupo(null);
    loadGrupos();
  }

  async function handleDeleteGrupo(id) {
    if (!confirm('Excluir este grupo?')) return;
    await supabase.from('customer_groups').delete().eq('id', id);
    loadGrupos();
  }

  if (loading) return <div style={{ textAlign: 'center', padding: 60, color: 'var(--g-400)', fontSize: 13 }}>Carregando grupos...</div>;

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <button className="btn-primary" onClick={() => setEditGrupo('new')}>
          <Icon name="plus" size={14} /> Novo grupo
        </button>
      </div>

      {grupos.length === 0 && (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--g-400)', fontSize: 14 }}>
          Nenhum grupo criado ainda.
          <br />
          <button className="btn-secondary" style={{ marginTop: 16 }} onClick={() => setEditGrupo('new')}>Criar primeiro grupo</button>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
        {grupos.map(g => (
          <div key={g.id} className="card" style={{ padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
              <div style={{
                width: 40, height: 40, borderRadius: 10,
                background: g.color || '#DC2626',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 18, flexShrink: 0,
              }}>
                <Icon name="users" size={20} style={{ color: 'white' }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--g-900)' }}>{g.name}</div>
                {g.description && <div style={{ fontSize: 12, color: 'var(--g-500)', marginTop: 2 }} className="truncate">{g.description}</div>}
              </div>
            </div>
            <div style={{ fontSize: 12, color: 'var(--g-600)', marginBottom: 16 }}>
              {(g.customer_group_members || []).length} membros
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn-secondary" style={{ flex: 1, fontSize: 12 }} onClick={() => setMembersOf(g)}>
                <Icon name="users" size={12} /> Membros
              </button>
              <button className="btn-ghost" style={{ fontSize: 12 }} onClick={() => setEditGrupo(g)}>
                <Icon name="edit" size={12} />
              </button>
              <button
                className="btn-ghost"
                style={{ fontSize: 12, color: 'var(--red)' }}
                onClick={() => handleDeleteGrupo(g.id)}
              >
                <Icon name="trash" size={12} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {editGrupo && (
        <GrupoFormModal
          grupo={editGrupo === 'new' ? null : editGrupo}
          onClose={() => setEditGrupo(null)}
          onSave={handleSaveGrupo}
        />
      )}
      {membersOf && (
        <GrupoMembrosModal
          grupo={membersOf}
          clients={clients}
          onClose={() => { setMembersOf(null); loadGrupos(); }}
        />
      )}
    </div>
  );
}

function GrupoFormModal({ grupo, onClose, onSave }) {
  const [form, setForm] = useState({
    id: grupo?.id || null,
    name: grupo?.name || '',
    description: grupo?.description || '',
    color: grupo?.color || '#DC2626',
  });
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!form.name.trim()) return;
    setSaving(true);
    await onSave(form);
    setSaving(false);
  }

  const COLORS = ['#DC2626','#2563EB','#059669','#D97706','#7C3AED','#0D0D0D','#EC4899','#06B6D4'];

  return (
    <ModalOverlay onClose={onClose}>
      <div style={{ width: 400 }}>
        <ModalHeader title={grupo ? 'Editar grupo' : 'Novo grupo'} onClose={onClose} />
        <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Field label="Nome *">
            <input className="input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Ex: Clientes VIP SP" autoFocus />
          </Field>
          <Field label="Descricao">
            <input className="input" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Descricao opcional" />
          </Field>
          <Field label="Cor">
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {COLORS.map(c => (
                <button
                  key={c}
                  onClick={() => setForm(f => ({ ...f, color: c }))}
                  style={{
                    width: 28, height: 28, borderRadius: '50%', background: c,
                    border: form.color === c ? '3px solid var(--g-900)' : '2px solid transparent',
                    boxShadow: form.color === c ? '0 0 0 2px white' : 'none',
                  }}
                />
              ))}
            </div>
          </Field>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="btn-secondary" onClick={onClose}>Cancelar</button>
            <button className="btn-primary" onClick={handleSave} disabled={saving || !form.name.trim()}>
              {saving ? 'Salvando...' : 'Salvar grupo'}
            </button>
          </div>
        </div>
      </div>
    </ModalOverlay>
  );
}

function GrupoMembrosModal({ grupo, clients, onClose }) {
  const [members, setMembers]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState('');
  const [saving, setSaving]     = useState(false);

  useEffect(() => {
    loadMembers();
  }, []);

  async function loadMembers() {
    const { data } = await supabase
      .from('customer_group_members')
      .select('customer_id')
      .eq('group_id', grupo.id);
    setMembers((data || []).map(m => m.customer_id));
    setLoading(false);
  }

  async function toggle(customerId) {
    setSaving(true);
    if (members.includes(customerId)) {
      await supabase.from('customer_group_members').delete()
        .eq('group_id', grupo.id).eq('customer_id', customerId);
      setMembers(prev => prev.filter(id => id !== customerId));
    } else {
      await supabase.from('customer_group_members').insert({ group_id: grupo.id, customer_id: customerId });
      setMembers(prev => [...prev, customerId]);
    }
    setSaving(false);
  }

  async function addAllByStatus(status) {
    const toAdd = clients.filter(c => c.status === status && !members.includes(c.id));
    if (!toAdd.length) return;
    setSaving(true);
    await supabase.from('customer_group_members').insert(
      toAdd.map(c => ({ group_id: grupo.id, customer_id: c.id }))
    );
    setMembers(prev => [...prev, ...toAdd.map(c => c.id)]);
    setSaving(false);
  }

  const filtered = clients.filter(c =>
    !search || c.name.toLowerCase().includes(search.toLowerCase()) || c.phone.includes(search)
  );

  return (
    <ModalOverlay onClose={onClose}>
      <div style={{ width: 480, maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
        <ModalHeader title={`Membros: ${grupo.name}`} onClose={onClose} />
        <div style={{ padding: '12px 24px', borderBottom: '1px solid var(--g-200)' }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <span style={{ fontSize: 12, color: 'var(--g-600)' }}>Adicionar por status:</span>
            {['vip','recurrent','new'].map(s => (
              <button key={s} className="btn-ghost" style={{ fontSize: 11, padding: '3px 8px' }} onClick={() => addAllByStatus(s)}>
                + {STATUS_MAP[s].label}
              </button>
            ))}
          </div>
          <div style={{ position: 'relative' }}>
            <Icon name="search" size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--g-400)', pointerEvents: 'none' }} />
            <input className="input" style={{ paddingLeft: 32, fontSize: 13 }} placeholder="Buscar cliente..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </div>
        <div className="scroll" style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
          {loading ? (
            <div style={{ padding: 32, textAlign: 'center', color: 'var(--g-400)', fontSize: 13 }}>Carregando...</div>
          ) : filtered.map(c => {
            const isMember = members.includes(c.id);
            return (
              <div
                key={c.id}
                onClick={() => !saving && toggle(c.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '10px 24px', cursor: 'pointer',
                  background: isMember ? 'rgba(183,12,0,0.04)' : 'transparent',
                  transition: 'background 150ms',
                }}
                onMouseEnter={e => { if (!isMember) e.currentTarget.style.background = 'var(--g-50)'; }}
                onMouseLeave={e => { if (!isMember) e.currentTarget.style.background = 'transparent'; }}
              >
                <div style={{
                  width: 18, height: 18, borderRadius: 4,
                  border: `2px solid ${isMember ? 'var(--red)' : 'var(--g-300)'}`,
                  background: isMember ? 'var(--red)' : 'white',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  {isMember && <Icon name="check" size={11} style={{ color: 'white' }} />}
                </div>
                <UserAvatar name={c.avatar} size={28} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--g-900)' }}>{c.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--g-500)' }}>{c.phone}</div>
                </div>
                <span className={`badge ${STATUS_MAP[c.status]?.cls || 'badge-gray'}`}>{STATUS_MAP[c.status]?.label || c.status}</span>
              </div>
            );
          })}
        </div>
        <div style={{ padding: '12px 24px', borderTop: '1px solid var(--g-200)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: 'var(--g-500)' }}>{members.length} membro{members.length !== 1 ? 's' : ''}</span>
          <button className="btn-primary" onClick={onClose}>Concluir</button>
        </div>
      </div>
    </ModalOverlay>
  );
}

/* ── ClientDrawer ─────────────────────────────────────────── */
function ClientDrawer({ client, tenantDbId, onClose }) {
  const s = STATUS_MAP[client.status] || STATUS_MAP.new;
  const agent = client.agent ? AGENTS.find(a => a.id === client.agent) : null;
  const [orders, setOrders] = useState([]);
  const [convs, setConvs]   = useState([]);
  const [ordersLoaded, setOrdersLoaded] = useState(false);

  useEffect(() => {
    if (tenantDbId && client._raw?.id) {
      supabase.from('orders')
        .select('id, status, total_cents, items_summary, placed_at')
        .eq('customer_id', client._raw.id)
        .order('placed_at', { ascending: false })
        .limit(5)
        .then(({ data }) => { setOrders(data || []); setOrdersLoaded(true); });

      supabase.from('conversations')
        .select('id, channel, updated_at, messages(content, direction, created_at)')
        .eq('customer_id', client._raw.id)
        .order('updated_at', { ascending: false })
        .limit(3)
        .then(({ data }) => setConvs(data || []));
    } else {
      setOrdersLoaded(true);
    }
  }, [client._raw?.id, tenantDbId]);

  const ORDERS_MOCK = [
    { placed_at: '2026-04-22', total_cents: 8900, items_summary: '2 pizzas + refri', status: 'delivered' },
    { placed_at: '2026-04-15', total_cents: 5200, items_summary: '1 pizza + borda',  status: 'delivered' },
    { placed_at: '2026-04-08', total_cents: 6700, items_summary: '1 pizza + suco',   status: 'delivered' },
  ];
  const displayOrders = ordersLoaded && orders.length ? orders : ORDERS_MOCK;

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(13,13,13,0.4)', zIndex: 200, display: 'flex', justifyContent: 'flex-end', animation: 'fadeIn 200ms ease' }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="slide-right scroll"
        style={{ width: 440, background: 'white', height: '100vh', display: 'flex', flexDirection: 'column', boxShadow: '-20px 0 40px rgba(0,0,0,0.15)', overflowY: 'auto' }}
      >
        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--g-200)', display: 'flex', alignItems: 'center', gap: 16, background: 'var(--g-50)' }}>
          <button className="btn-icon" onClick={onClose}><Icon name="x" size={16} /></button>
          <UserAvatar name={client.avatar} size={48} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--g-900)' }}>{client.name}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
              <span className={`badge ${s.cls}`}>{s.label}</span>
              <span style={{ fontSize: 12, color: 'var(--g-500)' }}>desde {client.since}</span>
            </div>
          </div>
        </div>

        <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* Contato */}
          <div>
            <div className="label" style={{ marginBottom: 12 }}>Contato</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {client.phone && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Icon name="phone" size={14} style={{ color: 'var(--g-400)' }} />
                  <span style={{ fontSize: 13, color: 'var(--g-700)' }}>{client.phone}</span>
                  <button className="btn-ghost" style={{ fontSize: 11, padding: '4px 8px', marginLeft: 'auto' }}>
                    <Icon name="whatsapp" size={12} /> WhatsApp
                  </button>
                </div>
              )}
              {client.email && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Icon name="mail" size={14} style={{ color: 'var(--g-400)' }} />
                  <span style={{ fontSize: 13, color: 'var(--g-700)' }}>{client.email}</span>
                </div>
              )}
            </div>
          </div>

          {/* Stats */}
          <div>
            <div className="label" style={{ marginBottom: 12 }}>Resumo</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
              {[
                { label: 'Pedidos', value: client.totalOrders },
                { label: 'Total gasto', value: client.totalSpent },
                { label: 'Ticket medio', value: calcTicket(client) },
              ].map(item => (
                <div key={item.label} style={{ background: 'var(--g-50)', border: '1px solid var(--g-200)', borderRadius: 'var(--r-md)', padding: '12px 14px' }}>
                  <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--g-500)', marginBottom: 6 }}>{item.label}</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--g-900)' }}>{item.value}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Agente */}
          <div>
            <div className="label" style={{ marginBottom: 12 }}>Agente responsavel</div>
            {agent
              ? <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', background: 'var(--g-50)', border: '1px solid var(--g-200)', borderRadius: 'var(--r-md)' }}>
                  <AgentAvatar id={agent.id} size={36} />
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--g-900)' }}>{agent.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--g-500)' }}>{agent.role}</div>
                  </div>
                </div>
              : <div style={{ padding: '12px 14px', background: 'var(--g-50)', border: '1px solid var(--g-200)', borderRadius: 'var(--r-md)', fontSize: 13, color: 'var(--g-500)' }}>
                  Nenhum agente atribuido
                  <button className="btn-ghost" style={{ fontSize: 12, marginLeft: 8, padding: '2px 8px' }}>Atribuir</button>
                </div>
            }
          </div>

          {/* Pedidos */}
          <div>
            <div className="label" style={{ marginBottom: 12 }}>Ultimos pedidos</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {displayOrders.map((o, i) => {
                const valor = o.total_cents
                  ? `R$ ${(o.total_cents / 100).toFixed(2).replace('.', ',')}`
                  : o.value || '—';
                const data = o.placed_at
                  ? new Date(o.placed_at).toLocaleDateString('pt-BR')
                  : o.date || '—';
                const statusLabel = o.status === 'delivered' || o.status === 'Entregue' ? 'Entregue' : o.status || 'Entregue';
                return (
                  <div key={i} style={{ padding: '12px 14px', background: 'var(--white)', border: '1px solid var(--g-200)', borderRadius: 'var(--r-md)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: 12, color: 'var(--g-900)', fontWeight: 600 }}>{o.items_summary || o.items}</div>
                      <div style={{ fontSize: 11, color: 'var(--g-500)', marginTop: 2 }}>{data}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--g-900)' }}>{valor}</div>
                      <span className="badge badge-green" style={{ marginTop: 4 }}>{statusLabel}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Conversas */}
          {convs.length > 0 && (
            <div>
              <div className="label" style={{ marginBottom: 12 }}>Historico de conversas</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {convs.map(c => {
                  const msgs = (c.messages || []).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
                  const last = msgs[0];
                  return (
                    <div key={c.id} style={{ padding: '10px 14px', background: 'var(--g-50)', border: '1px solid var(--g-200)', borderRadius: 'var(--r-md)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--g-600)', textTransform: 'uppercase' }}>{c.channel || 'WhatsApp'}</span>
                        <span style={{ fontSize: 10, color: 'var(--g-400)' }}>
                          {c.updated_at ? new Date(c.updated_at).toLocaleDateString('pt-BR') : ''}
                        </span>
                      </div>
                      {last && <div style={{ fontSize: 12, color: 'var(--g-700)' }} className="truncate">{last.content}</div>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Notas */}
          {client.metadata?.notes && (
            <div>
              <div className="label" style={{ marginBottom: 12 }}>Notas internas</div>
              <div style={{ padding: '12px 14px', background: 'var(--g-50)', border: '1px solid var(--g-200)', borderRadius: 'var(--r-md)', fontSize: 13, color: 'var(--g-700)', lineHeight: 1.5 }}>
                {client.metadata.notes}
              </div>
            </div>
          )}

          {/* Acoes */}
          <div>
            <div className="label" style={{ marginBottom: 12 }}>Acoes rapidas</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button className="btn-secondary" style={{ justifyContent: 'flex-start' }}>
                <Icon name="chat" size={14} /> Abrir conversa no chat
              </button>
              <button className="btn-secondary" style={{ justifyContent: 'flex-start' }}>
                <Icon name="sparkles" size={14} /> Pedir analise a VERA
              </button>
              <button className="btn-secondary" style={{ justifyContent: 'flex-start', color: 'var(--red)', borderColor: 'var(--red-soft)' }}>
                <Icon name="bell" size={14} /> Enviar para CORA (cobranca)
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Helpers ─────────────────────────────────────────────── */
function ModalOverlay({ children, onClose }) {
  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(13,13,13,0.5)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'fadeIn 150ms ease' }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="slide-up"
        style={{ background: 'white', borderRadius: 'var(--r-lg)', boxShadow: '0 24px 64px rgba(0,0,0,0.2)', maxHeight: '90vh', overflowY: 'auto' }}
      >
        {children}
      </div>
    </div>
  );
}

function ModalHeader({ title, onClose }) {
  return (
    <div style={{ padding: '20px 24px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
      <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--g-900)' }}>{title}</h2>
      <button className="btn-icon" onClick={onClose}><Icon name="x" size={16} /></button>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--g-600)', display: 'block', marginBottom: 6 }}>{label}</label>
      {children}
    </div>
  );
}

function calcTicket(client) {
  try {
    const raw = (client.totalSpent || 'R$ 0').replace('R$ ', '').replace('.', '').replace(',', '.');
    const total = parseFloat(raw) || 0;
    const ticket = client.totalOrders > 0 ? total / client.totalOrders : 0;
    return 'R$ ' + ticket.toFixed(2).replace('.', ',');
  } catch { return 'R$ 0,00'; }
}
