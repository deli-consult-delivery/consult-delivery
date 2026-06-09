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
  if (imp <= 3) return { background: 'var(--bg)', color: 'var(--tx2)', border: '1px solid var(--line)' };
  if (imp <= 6) return { background: 'var(--amber-soft)', color: 'var(--amber)' };
  return { background: 'var(--red-soft)', color: 'var(--red)' };
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
    position: 'fixed', inset: 0, background: 'rgba(28,27,26,0.45)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
  };
  const box = {
    background: 'var(--panel)', border: '1px solid var(--line)',
    borderRadius: 8, padding: 28, width: '100%', maxWidth: 520,
    boxShadow: '0 12px 40px rgba(0,0,0,0.18)',
  };
  const label = { display: 'block', fontSize: 12, color: 'var(--tx2)', marginBottom: 5 };
  const input  = {
    width: '100%', background: '#faf9f8', border: '1px solid var(--line)',
    borderRadius: 4, padding: '8px 10px', color: 'var(--tx)', fontSize: 14, boxSizing: 'border-box',
    outline: 'none', fontFamily: 'inherit',
  };
  const select = { ...input, cursor: 'pointer' };

  return (
    <div style={overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={box}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: 18, color: 'var(--tx)' }}>
            {isEdit ? 'Editar memória' : 'Nova memória'}
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--tx2)', fontSize: 20, cursor: 'pointer' }}>×</button>
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
              style={{ width: '100%', accentColor: 'var(--red)' }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--tx2)', marginTop: 2 }}>
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

          {error && <p style={{ color: 'var(--red)', fontSize: 13, marginBottom: 12 }}>{error}</p>}

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button type="button" className="cv2-btn sec" onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className="cv2-btn" disabled={saving}>
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
    filters: { display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' },
    sel:     { background: '#faf9f8', border: '1px solid var(--line)', borderRadius: 4,
               padding: '7px 10px', color: 'var(--tx)', fontSize: 13, cursor: 'pointer', outline: 'none', fontFamily: 'inherit' },
    card:    { background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 6,
               padding: 16, marginBottom: 10 },
    tag:     { display: 'inline-block', padding: '2px 8px', borderRadius: 4,
               background: 'var(--bg)', border: '1px solid var(--line)', fontSize: 11, color: 'var(--tx2)', marginRight: 6 },
    badge:   { display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600 },
  };

  return (
    <div className="cv2-ct">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
        <div>
          <h1>Memória dos Agentes</h1>
          <div className="cv2-rule" />
          <div className="cv2-sub">Fatos, preferências, histórico e decisões que cada agente guarda na memória central.</div>
        </div>
        <button className="cv2-btn" onClick={() => setModal('new')}>+ Nova Memória</button>
      </div>

      {/* Filtros */}
      <div style={s.filters}>
        <select style={s.sel} value={filterAgent} onChange={e => setFilterAgent(e.target.value)}>
          {AGENT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select style={s.sel} value={filterKind} onChange={e => setFilterKind(e.target.value)}>
          {KIND_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <label style={{ fontSize: 13, color: 'var(--tx2)' }}>
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
            <button key={slug} className="cv2-btn danger" style={{ fontSize: 12, padding: '4px 12px' }} onClick={() => setConfirmWipe(slug)}>
              Limpar memória {slug.toUpperCase()}
            </button>
          ))}
        </div>
      )}

      {/* Confirm wipe dialog */}
      {confirmWipe && (
        <div style={{
          background: 'var(--red-soft)', border: '1px solid var(--red)', borderRadius: 6,
          padding: 16, marginBottom: 16,
        }}>
          <p style={{ margin: '0 0 12px', fontSize: 14, color: 'var(--tx)' }}>
            Excluir <strong>todas</strong> as memórias do agente <strong>{confirmWipe.toUpperCase()}</strong>? Esta ação é irreversível.
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="cv2-btn" onClick={() => handleWipe(confirmWipe)}>
              Confirmar exclusão
            </button>
            <button className="cv2-btn sec" onClick={() => setConfirmWipe(null)}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {loading && <p style={{ color: 'var(--tx2)' }}>Carregando...</p>}
      {error   && <p style={{ color: 'var(--red)' }}>Erro: {error}</p>}

      {!loading && !error && filtered.length === 0 && (
        <p style={{ color: 'var(--tx2)', marginTop: 40, textAlign: 'center' }}>Nenhuma memória encontrada.</p>
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
                  <span style={{ ...s.badge, background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--tx2)' }}>
                    {KIND_LABELS[m.kind] || m.kind}
                  </span>
                  {m.expires_at && (
                    <span style={{ fontSize: 11, color: 'var(--tx2)' }}>
                      expira {fmtDate(m.expires_at)}
                    </span>
                  )}
                </div>

                {/* Conteúdo */}
                <p style={{ margin: '0 0 8px', fontSize: 14, lineHeight: 1.5, color: 'var(--tx)', wordBreak: 'break-word' }}>
                  {truncated ? content.slice(0, 200) + '…' : content}
                </p>
                {content.length > 200 && (
                  <button onClick={() => setExpanded(prev => ({ ...prev, [m.id]: !isExpanded }))}
                    style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', fontSize: 12, padding: 0 }}>
                    {isExpanded ? 'Ver menos' : 'Ver mais'}
                  </button>
                )}

                <div style={{ fontSize: 11, color: 'var(--tx2)', marginTop: 6 }}>
                  {fmtDate(m.created_at)}
                </div>
              </div>

              {/* Ações */}
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                <button className="cv2-btn sec" style={{ fontSize: 12, padding: '5px 12px' }} onClick={() => setModal(m)}>
                  Editar
                </button>
                <button className="cv2-btn danger" style={{ fontSize: 12, padding: '5px 12px' }} onClick={() => handleDelete(m.id)}>
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
