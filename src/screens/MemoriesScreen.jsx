import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase.js';

const BRIDGE_URL = import.meta.env.VITE_BRIDGE_URL || 'https://bridge.consultdelivery.com.br';

const AGENT_OPTIONS = [
  { value: '',               label: 'Todos os agentes' },
  { value: 'deli',           label: 'DELI — COO Digital' },
  { value: 'lara',           label: 'LARA — Marketing' },
  { value: 'vera',           label: 'VERA — BI e Relatórios' },
  { value: 'breno',          label: 'BRENO — Atendimento' },
  { value: 'cora',           label: 'CORA — Cobrança' },
  { value: 'sofia',          label: 'SOFIA — Prospecção' },
  { value: 'max',            label: 'MAX — Suporte Técnico' },
  { value: 'nova',           label: 'NOVA — Automação' },
  { value: 'analise-ifood',  label: 'Analista iFood' },
  { value: 'chat-ai',        label: 'Chat AI' },
];

const AGENT_OPTIONS_NO_ALL = AGENT_OPTIONS.filter(a => a.value !== '');

const KIND_OPTIONS = [
  { value: '',           label: 'Todos os tipos' },
  { value: 'fact',       label: 'Fato' },
  { value: 'preference', label: 'Preferência' },
  { value: 'history',    label: 'Histórico' },
  { value: 'decision',   label: 'Decisão' },
];

const KIND_ICONS = {
  fact:       '📌',
  preference: '⭐',
  history:    '📜',
  decision:   '⚖️',
};

const KIND_LABELS = {
  fact:       'Fato',
  preference: 'Preferência',
  history:    'Histórico',
  decision:   'Decisão',
};

function importanceBadgeStyle(imp) {
  if (imp <= 3) return { background: '#333', color: '#aaa' };
  if (imp <= 6) return { background: '#5a4500', color: '#fbbf24' };
  return { background: '#5a0000', color: '#f87171' };
}

function fmtDate(iso) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// ── Modal criar/editar ──────────────────────────────────────────────────────
function MemoryModal({ memory, onClose, onSaved, bridgeHeaders }) {
  const isEdit = !!memory?.id;
  const [form, setForm] = useState({
    agent_slug: memory?.agent_id   || 'deli',
    kind:       memory?.kind       || 'fact',
    content:    memory?.content    || '',
    importance: memory?.importance ?? 5,
    expires_at: memory?.expires_at ? memory.expires_at.slice(0, 10) : '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!form.content.trim()) { setError('Conteúdo obrigatório'); return; }
    setSaving(true);
    try {
      const body = {
        agent_slug: form.agent_slug,
        kind:       form.kind,
        content:    form.content.trim(),
        importance: parseInt(form.importance, 10),
        expires_at: form.expires_at || null,
      };
      const url    = isEdit ? `${BRIDGE_URL}/api/memories/${memory.id}` : `${BRIDGE_URL}/api/memories`;
      const method = isEdit ? 'PATCH' : 'POST';
      const r      = await fetch(url, { method, headers: { ...bridgeHeaders, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!r.ok) { const d = await r.json(); throw new Error(d.error || r.statusText); }
      onSaved();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const overlay = {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
  };
  const box = {
    background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 12, padding: 28, width: '100%', maxWidth: 520,
  };
  const label = { display: 'block', fontSize: 12, color: '#888', marginBottom: 5 };
  const input  = {
    width: '100%', background: '#111', border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 6, padding: '8px 10px', color: '#fff', fontSize: 14, boxSizing: 'border-box',
  };
  const select = { ...input, cursor: 'pointer' };

  return (
    <div style={overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={box}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: 18, color: '#fff' }}>
            {isEdit ? 'Editar memória' : 'Nova memória'}
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#888', fontSize: 20, cursor: 'pointer' }}>×</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label style={label}>Agente</label>
            <select style={select} value={form.agent_slug} onChange={e => set('agent_slug', e.target.value)} disabled={isEdit}>
              {AGENT_OPTIONS_NO_ALL.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={label}>Tipo</label>
            <select style={select} value={form.kind} onChange={e => set('kind', e.target.value)}>
              {KIND_OPTIONS.filter(o => o.value).map(o => (
                <option key={o.value} value={o.value}>{KIND_ICONS[o.value]} {o.label}</option>
              ))}
            </select>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={label}>Conteúdo</label>
            <textarea
              style={{ ...input, minHeight: 100, resize: 'vertical', fontFamily: 'inherit' }}
              value={form.content}
              onChange={e => set('content', e.target.value)}
              placeholder="Descreva a memória do agente..."
              required
            />
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={label}>Importância: {form.importance}/10</label>
            <input
              type="range" min={1} max={10} step={1}
              value={form.importance}
              onChange={e => set('importance', e.target.value)}
              style={{ width: '100%', accentColor: '#B70C00' }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#555', marginTop: 2 }}>
              <span>Trivial (1)</span><span>Crítico (10)</span>
            </div>
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={label}>Expira em (opcional)</label>
            <input
              type="date" style={input}
              value={form.expires_at}
              onChange={e => set('expires_at', e.target.value)}
            />
          </div>

          {error && <p style={{ color: '#f87171', fontSize: 13, marginBottom: 12 }}>{error}</p>}

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose}
              style={{ padding: '8px 18px', borderRadius: 6, background: '#2a2a2a', border: '1px solid rgba(255,255,255,0.1)', color: '#ccc', cursor: 'pointer', fontSize: 14 }}>
              Cancelar
            </button>
            <button type="submit" disabled={saving}
              style={{ padding: '8px 18px', borderRadius: 6, background: '#B70C00', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>
              {saving ? 'Salvando...' : isEdit ? 'Salvar' : 'Criar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Tela principal ──────────────────────────────────────────────────────────
export default function MemoriesScreen({ tenantDbId }) {
  const [memories,    setMemories]    = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState('');
  const [filterAgent, setFilterAgent] = useState('');
  const [filterKind,  setFilterKind]  = useState('');
  const [filterImp,   setFilterImp]   = useState(1);
  const [modal,       setModal]       = useState(null); // null | 'new' | memoryObj
  const [expanded,    setExpanded]    = useState({}); // id → bool
  const [confirmWipe, setConfirmWipe] = useState(null); // agent slug or null
  const [bridgeHeaders, setBridgeHeaders] = useState({});

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const token = data?.session?.access_token;
      if (token) setBridgeHeaders({ Authorization: `Bearer ${token}` });
    });
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      let url = `${BRIDGE_URL}/api/memories`;
      const params = [];
      if (filterAgent) params.push(`agent_slug=${encodeURIComponent(filterAgent)}`);
      if (filterKind)  params.push(`kind=${encodeURIComponent(filterKind)}`);
      if (params.length) url += '?' + params.join('&');

      const r = await fetch(url, { headers: bridgeHeaders });
      if (!r.ok) { const d = await r.json(); throw new Error(d.error || r.statusText); }
      const data = await r.json();
      setMemories(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [filterAgent, filterKind, bridgeHeaders]);

  useEffect(() => { if (Object.keys(bridgeHeaders).length) load(); }, [load, bridgeHeaders]);

  async function handleDelete(id) {
    if (!confirm('Excluir esta memória?')) return;
    try {
      const r = await fetch(`${BRIDGE_URL}/api/memories/${id}`, {
        method: 'DELETE', headers: bridgeHeaders,
      });
      if (!r.ok) { const d = await r.json(); throw new Error(d.error || r.statusText); }
      load();
    } catch (err) {
      alert('Erro: ' + err.message);
    }
  }

  async function handleWipe(slug) {
    try {
      const r = await fetch(`${BRIDGE_URL}/api/memories/agent/${slug}`, {
        method: 'DELETE', headers: bridgeHeaders,
      });
      if (!r.ok) { const d = await r.json(); throw new Error(d.error || r.statusText); }
      setConfirmWipe(null);
      load();
    } catch (err) {
      alert('Erro: ' + err.message);
    }
  }

  const filtered = memories.filter(m => m.importance >= filterImp);

  // Agrupar por agente para mostrar botão de wipe
  const agentGroups = [...new Set(filtered.map(m => m.agent_id))];

  const s = {
    screen:  { padding: '24px 20px', color: '#fff', fontFamily: 'inherit' },
    header:  { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
    title:   { margin: 0, fontSize: 22, fontWeight: 700 },
    filters: { display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' },
    sel:     { background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6,
               padding: '7px 10px', color: '#fff', fontSize: 13, cursor: 'pointer' },
    btn:     { padding: '8px 16px', borderRadius: 6, background: '#B70C00', border: 'none',
               color: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 600 },
    card:    { background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10,
               padding: 16, marginBottom: 10 },
    tag:     { display: 'inline-block', padding: '2px 8px', borderRadius: 4,
               background: '#2a2a2a', fontSize: 11, color: '#aaa', marginRight: 6 },
    badge:   { display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600 },
  };

  return (
    <div style={s.screen}>
      <div style={s.header}>
        <h1 style={s.title}>Memória dos Agentes</h1>
        <button style={s.btn} onClick={() => setModal('new')}>+ Nova Memória</button>
      </div>

      {/* Filtros */}
      <div style={s.filters}>
        <select style={s.sel} value={filterAgent} onChange={e => setFilterAgent(e.target.value)}>
          {AGENT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select style={s.sel} value={filterKind} onChange={e => setFilterKind(e.target.value)}>
          {KIND_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <label style={{ fontSize: 13, color: '#888' }}>
          Importância mínima:&nbsp;
          <input
            type="number" min={1} max={10} value={filterImp}
            onChange={e => setFilterImp(Math.max(1, Math.min(10, parseInt(e.target.value) || 1)))}
            style={{ ...s.sel, width: 56, textAlign: 'center' }}
          />
        </label>
      </div>

      {/* Botões de wipe por agente */}
      {agentGroups.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
          {agentGroups.map(slug => (
            <button key={slug} onClick={() => setConfirmWipe(slug)}
              style={{ padding: '4px 12px', borderRadius: 6, background: '#2a0000', border: '1px solid #5a0000', color: '#f87171', fontSize: 12, cursor: 'pointer' }}>
              Limpar memória {slug.toUpperCase()}
            </button>
          ))}
        </div>
      )}

      {/* Confirm wipe dialog */}
      {confirmWipe && (
        <div style={{
          background: '#1a1a1a', border: '1px solid #B70C00', borderRadius: 8,
          padding: 16, marginBottom: 16,
        }}>
          <p style={{ margin: '0 0 12px', fontSize: 14 }}>
            Excluir <strong>todas</strong> as memórias do agente <strong>{confirmWipe.toUpperCase()}</strong>? Esta ação é irreversível.
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => handleWipe(confirmWipe)}
              style={{ padding: '6px 14px', borderRadius: 6, background: '#B70C00', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 13 }}>
              Confirmar exclusão
            </button>
            <button onClick={() => setConfirmWipe(null)}
              style={{ padding: '6px 14px', borderRadius: 6, background: '#2a2a2a', border: '1px solid rgba(255,255,255,0.1)', color: '#ccc', cursor: 'pointer', fontSize: 13 }}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {loading && <p style={{ color: '#777' }}>Carregando...</p>}
      {error   && <p style={{ color: '#f87171' }}>Erro: {error}</p>}

      {!loading && !error && filtered.length === 0 && (
        <p style={{ color: '#555', marginTop: 40, textAlign: 'center' }}>Nenhuma memória encontrada.</p>
      )}

      {filtered.map(m => {
        const isExpanded = expanded[m.id];
        const content    = m.content || '';
        const truncated  = content.length > 200 && !isExpanded;

        return (
          <div key={m.id} style={s.card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                {/* Tipo + agente + importância */}
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
                  <span style={{ fontSize: 16 }}>{KIND_ICONS[m.kind] || '📌'}</span>
                  <span style={s.tag}>{m.agent_id}</span>
                  <span style={{ ...s.badge, ...importanceBadgeStyle(m.importance) }}>
                    imp {m.importance}
                  </span>
                  <span style={{ ...s.badge, background: '#1e3a5f', color: '#93c5fd' }}>
                    {KIND_LABELS[m.kind] || m.kind}
                  </span>
                  {m.expires_at && (
                    <span style={{ fontSize: 11, color: '#888' }}>
                      expira {fmtDate(m.expires_at)}
                    </span>
                  )}
                </div>

                {/* Conteúdo */}
                <p style={{ margin: '0 0 8px', fontSize: 14, lineHeight: 1.5, color: '#ddd', wordBreak: 'break-word' }}>
                  {truncated ? content.slice(0, 200) + '…' : content}
                </p>
                {content.length > 200 && (
                  <button onClick={() => setExpanded(prev => ({ ...prev, [m.id]: !isExpanded }))}
                    style={{ background: 'none', border: 'none', color: '#B70C00', cursor: 'pointer', fontSize: 12, padding: 0 }}>
                    {isExpanded ? 'Ver menos' : 'Ver mais'}
                  </button>
                )}

                <div style={{ fontSize: 11, color: '#555', marginTop: 6 }}>
                  {fmtDate(m.created_at)}
                </div>
              </div>

              {/* Ações */}
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                <button onClick={() => setModal(m)}
                  style={{ padding: '5px 12px', borderRadius: 6, background: '#2a2a2a', border: '1px solid rgba(255,255,255,0.1)', color: '#ccc', cursor: 'pointer', fontSize: 12 }}>
                  Editar
                </button>
                <button onClick={() => handleDelete(m.id)}
                  style={{ padding: '5px 12px', borderRadius: 6, background: '#2a0000', border: '1px solid #5a0000', color: '#f87171', cursor: 'pointer', fontSize: 12 }}>
                  Excluir
                </button>
              </div>
            </div>
          </div>
        );
      })}

      {/* Modal */}
      {modal && (
        <MemoryModal
          memory={modal === 'new' ? null : modal}
          onClose={() => setModal(null)}
          onSaved={load}
          bridgeHeaders={bridgeHeaders}
        />
      )}
    </div>
  );
}
