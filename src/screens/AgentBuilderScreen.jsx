import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase.js';

const API = import.meta.env.VITE_BRIDGE_URL || 'https://bridge.consultdelivery.com.br';

// ── Cores e helpers ───────────────────────────────────────────────────────────
const S = {
  bg:      'var(--bg)',
  surface: 'var(--panel)',
  border:  '1px solid var(--line)',
  accent:  'var(--red)',
  text:    'var(--tx)',
  muted:   'var(--tx2)',
  input: {
    background: '#faf9f8',
    border: '1px solid var(--line)',
    color: 'var(--tx)',
    borderRadius: 8,
    padding: '9px 12px',
    fontSize: 14,
    width: '100%',
    boxSizing: 'border-box',
    outline: 'none',
    fontFamily: 'inherit',
  },
  label: {
    fontSize: 12,
    color: 'var(--tx2)',
    marginBottom: 4,
    display: 'block',
  },
  btnPrimary: {
    background: 'var(--red)',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    padding: '9px 18px',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
  },
  btnGhost: {
    background: 'var(--panel)',
    color: 'var(--tx)',
    border: '1px solid var(--line)',
    borderRadius: 8,
    padding: '9px 18px',
    fontSize: 14,
    cursor: 'pointer',
  },
  btnDanger: {
    background: 'transparent',
    color: 'var(--red)',
    border: '1px solid #ecc7c2',
    borderRadius: 8,
    padding: '7px 14px',
    fontSize: 13,
    cursor: 'pointer',
  },
};

const MODELS = [
  { value: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5 (rápido, econômico)' },
  { value: 'claude-sonnet-4-6',         label: 'Sonnet 4.6 (balanceado)' },
  { value: 'claude-opus-4-7',           label: 'Opus 4.7 (mais capaz)' },
];

async function getBridgeHeaders() {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token || '';
  return {
    'Content-Type': 'application/json',
    ...(token && { Authorization: `Bearer ${token}` }),
  };
}

async function apiFetch(path, opts = {}) {
  const res = await fetch(`${API}${path}`, {
    ...opts,
    headers: {
      ...(await getBridgeHeaders()),
      ...(opts.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
  return data;
}

// ── Avatar simples ─────────────────────────────────────────────────────────────
function AgentAvatar({ letter, color, size = 36 }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: size / 4,
      background: color || '#B70C00',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontWeight: 700, fontSize: size * 0.44, color: '#fff', flexShrink: 0,
    }}>
      {(letter || '?').toUpperCase()}
    </div>
  );
}

// ── Modal base ─────────────────────────────────────────────────────────────────
function Modal({ open, onClose, title, children, width = 520 }) {
  if (!open) return null;
  return (
    <div
      onClick={e => e.target === e.currentTarget && onClose()}
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: 'rgba(28,27,26,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
    >
      <div style={{
        background: 'var(--panel)',
        border: S.border,
        borderRadius: 14,
        width: '100%', maxWidth: width,
        maxHeight: '90vh', overflowY: 'auto',
        padding: 24,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: S.text }}>{title}</div>
          <button onClick={onClose} style={{ ...S.btnGhost, padding: '4px 10px', fontSize: 18 }}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ── AgentFormModal — criar / editar agente custom ─────────────────────────────
function AgentFormModal({ open, onClose, agent, onSaved }) {
  const isEdit = !!agent;
  const [form, setForm] = useState({
    name: '', display_name: '', description: '',
    custom_prompt: '', custom_model: 'claude-haiku-4-5-20251001', custom_max_tokens: 4096,
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (agent) {
      setForm({
        name:              agent.name || '',
        display_name:      agent.display_name || agent.name || '',
        description:       agent.description || '',
        custom_prompt:     agent.custom_prompt || '',
        custom_model:      agent.custom_model || 'claude-haiku-4-5-20251001',
        custom_max_tokens: agent.custom_max_tokens || 4096,
      });
    } else {
      setForm({ name: '', display_name: '', description: '', custom_prompt: '', custom_model: 'claude-haiku-4-5-20251001', custom_max_tokens: 4096 });
    }
    setErr('');
  }, [agent, open]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = async () => {
    setErr('');
    setSaving(true);
    try {
      let result;
      if (isEdit) {
        result = await apiFetch(`/api/agent-builder/agents/${agent.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            display_name:      form.display_name,
            description:       form.description,
            custom_prompt:     form.custom_prompt,
            custom_model:      form.custom_model,
            custom_max_tokens: Number(form.custom_max_tokens),
          }),
        });
      } else {
        result = await apiFetch('/api/agent-builder/agents', {
          method: 'POST',
          body: JSON.stringify({
            name:              form.name,
            display_name:      form.display_name,
            description:       form.description,
            custom_prompt:     form.custom_prompt,
            custom_model:      form.custom_model,
            custom_max_tokens: Number(form.custom_max_tokens),
          }),
        });
      }
      onSaved(result);
      onClose();
    } catch (e) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Editar Agente' : 'Criar Agente Personalizado'}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {!isEdit && (
          <div>
            <label style={S.label}>Nome (slug, sem espaços) *</label>
            <input
              style={S.input}
              value={form.name}
              onChange={e => set('name', e.target.value.toLowerCase().replace(/\s+/g, '-'))}
              placeholder="meu-agente"
            />
          </div>
        )}
        <div>
          <label style={S.label}>Nome amigável *</label>
          <input
            style={S.input}
            value={form.display_name}
            onChange={e => set('display_name', e.target.value)}
            placeholder="Meu Agente"
          />
        </div>
        <div>
          <label style={S.label}>Descrição</label>
          <textarea
            style={{ ...S.input, minHeight: 72, resize: 'vertical' }}
            value={form.description}
            onChange={e => set('description', e.target.value)}
            placeholder="O que este agente faz…"
          />
        </div>
        <div>
          <label style={S.label}>System prompt</label>
          <textarea
            style={{ ...S.input, minHeight: 120, resize: 'vertical', fontFamily: 'monospace', fontSize: 13 }}
            value={form.custom_prompt}
            onChange={e => set('custom_prompt', e.target.value)}
            placeholder="Você é um assistente especializado em…"
          />
        </div>
        <div>
          <label style={S.label}>Modelo</label>
          <select
            style={{ ...S.input }}
            value={form.custom_model}
            onChange={e => set('custom_model', e.target.value)}
          >
            {MODELS.map(m => (
              <option key={m.value} value={m.value} style={{ background: 'var(--panel)' }}>{m.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label style={S.label}>Máximo de tokens</label>
          <input
            style={S.input}
            type="number"
            min={256}
            max={8192}
            value={form.custom_max_tokens}
            onChange={e => set('custom_max_tokens', e.target.value)}
          />
        </div>
        {err && <div style={{ color: 'var(--red)', fontSize: 13 }}>{err}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 4 }}>
          <button style={S.btnGhost} onClick={onClose} disabled={saving}>Cancelar</button>
          <button style={S.btnPrimary} onClick={handleSave} disabled={saving}>
            {saving ? 'Salvando…' : isEdit ? 'Salvar' : 'Criar Agente'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ── AgentConfigModal — configurar agente global por tenant ────────────────────
function AgentConfigModal({ open, onClose, agent }) {
  const [enabled, setEnabled] = useState(true);
  const [customPrompt, setCustomPrompt] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState(false);

  useEffect(() => {
    if (!agent || !open) return;
    setErr(''); setOk(false);
    apiFetch(`/api/agent-builder/agents/${agent.id}/config`)
      .then(cfg => {
        setEnabled(cfg.enabled !== false);
        setCustomPrompt(cfg.config?.custom_prompt || '');
      })
      .catch(() => {});
  }, [agent, open]);

  const handleSave = async () => {
    setSaving(true); setErr(''); setOk(false);
    try {
      await apiFetch(`/api/agent-builder/agents/${agent.id}/config`, {
        method: 'PATCH',
        body: JSON.stringify({ enabled, custom_prompt: customPrompt }),
      });
      setOk(true);
    } catch (e) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={`Configurar: ${agent?.display_name || agent?.name || ''}`}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <label style={{ ...S.label, marginBottom: 0 }}>Habilitado para este tenant</label>
          <button
            onClick={() => setEnabled(v => !v)}
            style={{
              width: 44, height: 24, borderRadius: 12,
              background: enabled ? 'var(--red)' : 'var(--line)',
              border: 'none', cursor: 'pointer', position: 'relative', transition: 'background 0.2s',
            }}
          >
            <span style={{
              position: 'absolute', top: 3, left: enabled ? 23 : 3,
              width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'left 0.2s',
            }}/>
          </button>
        </div>
        <div>
          <label style={S.label}>Override de prompt (opcional)</label>
          <textarea
            style={{ ...S.input, minHeight: 120, resize: 'vertical', fontFamily: 'monospace', fontSize: 13 }}
            value={customPrompt}
            onChange={e => setCustomPrompt(e.target.value)}
            placeholder="Deixe vazio para usar o prompt padrão do agente…"
          />
        </div>
        {err && <div style={{ color: 'var(--red)', fontSize: 13 }}>{err}</div>}
        {ok  && <div style={{ color: 'var(--green)', fontSize: 13 }}>Configuração salva.</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button style={S.btnGhost} onClick={onClose} disabled={saving}>Fechar</button>
          <button style={S.btnPrimary} onClick={handleSave} disabled={saving}>
            {saving ? 'Salvando…' : 'Salvar configuração'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ── AgentTestModal — testar agente ────────────────────────────────────────────
function AgentTestModal({ open, onClose, agent }) {
  const [prompt, setPrompt] = useState('');
  const [running, setRunning] = useState(false);
  const [history, setHistory] = useState([]);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (open) { setErr(''); }
  }, [open]);

  const handleRun = async () => {
    if (!prompt.trim()) return;
    setRunning(true); setErr('');
    try {
      const result = await apiFetch(`/api/agent-builder/agents/${agent.id}/invoke`, {
        method: 'POST',
        body: JSON.stringify({ prompt: prompt.trim() }),
      });
      setHistory(prev => [{
        prompt: prompt.trim(),
        output: result.output,
        tokens: result.tokens_used,
        duration: result.duration_ms,
        ts: new Date().toLocaleTimeString('pt-BR'),
      }, ...prev].slice(0, 5));
      setPrompt('');
    } catch (e) {
      setErr(e.message);
    } finally {
      setRunning(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={`Testar: ${agent?.display_name || agent?.name || ''}`} width={600}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <label style={S.label}>Prompt de teste</label>
          <textarea
            style={{ ...S.input, minHeight: 90, resize: 'vertical' }}
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            placeholder="Digite uma mensagem para testar o agente…"
            onKeyDown={e => { if (e.key === 'Enter' && e.ctrlKey && !running) handleRun(); }}
          />
          <div style={{ fontSize: 11, color: S.muted, marginTop: 4 }}>Ctrl+Enter para executar</div>
        </div>
        {err && <div style={{ color: 'var(--red)', fontSize: 13 }}>{err}</div>}
        <button style={{ ...S.btnPrimary, opacity: running || !prompt.trim() ? 0.6 : 1 }} onClick={handleRun} disabled={running || !prompt.trim()}>
          {running ? 'Executando…' : 'Executar'}
        </button>

        {history.length > 0 && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: S.muted, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 }}>
              Histórico de testes
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {history.map((h, i) => (
                <div key={i} style={{ background: S.surface, borderRadius: 10, border: S.border, padding: 14 }}>
                  <div style={{ fontSize: 12, color: S.muted, marginBottom: 6 }}>
                    {h.ts}
                    {h.tokens && <span style={{ marginLeft: 8 }}>{h.tokens} tokens</span>}
                    {h.duration && <span style={{ marginLeft: 8 }}>{h.duration}ms</span>}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--tx2)', marginBottom: 6 }}>
                    <b style={{ color: S.text }}>Prompt:</b> {h.prompt.slice(0, 120)}{h.prompt.length > 120 ? '…' : ''}
                  </div>
                  <div style={{ fontSize: 13, color: S.text, lineHeight: 1.55, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                    {h.output}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

// ── Card de agente ─────────────────────────────────────────────────────────────
function AgentCard({ agent, isCustom, onEdit, onDelete, onConfig, onTest }) {
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!window.confirm(`Excluir o agente "${agent.display_name || agent.name}"? Esta ação não pode ser desfeita.`)) return;
    setDeleting(true);
    try {
      await apiFetch(`/api/agent-builder/agents/${agent.id}`, { method: 'DELETE' });
      onDelete(agent.id);
    } catch (e) {
      alert(`Erro ao excluir: ${e.message}`);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div style={{
      background: S.surface,
      border: S.border,
      borderRadius: 12,
      padding: 18,
      display: 'flex', flexDirection: 'column', gap: 12,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <AgentAvatar letter={agent.letter || (agent.name || '?')[0]} color={agent.color} size={40} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: S.text }}>
            {agent.display_name || agent.name}
          </div>
          <div style={{ fontSize: 12, color: S.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {agent.description || agent.role || '—'}
          </div>
        </div>
        {!isCustom && (
          <span style={{ fontSize: 10, background: 'var(--bg)', borderRadius: 6, padding: '3px 8px', color: S.muted }}>
            Global
          </span>
        )}
        {isCustom && (
          <span style={{ fontSize: 10, background: 'var(--red-soft)', borderRadius: 6, padding: '3px 8px', color: 'var(--red)' }}>
            Custom
          </span>
        )}
      </div>
      {agent.custom_model && (
        <div style={{ fontSize: 11, color: S.muted }}>
          {MODELS.find(m => m.value === agent.custom_model)?.label || agent.custom_model}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {!isCustom && (
          <button style={{ ...S.btnGhost, padding: '6px 12px', fontSize: 12 }} onClick={() => onConfig(agent)}>
            Configurar
          </button>
        )}
        {isCustom && (
          <button style={{ ...S.btnGhost, padding: '6px 12px', fontSize: 12 }} onClick={() => onEdit(agent)}>
            Editar
          </button>
        )}
        <button style={{ ...S.btnGhost, padding: '6px 12px', fontSize: 12 }} onClick={() => onTest(agent)}>
          Testar
        </button>
        {isCustom && (
          <button style={S.btnDanger} onClick={handleDelete} disabled={deleting}>
            {deleting ? '…' : 'Excluir'}
          </button>
        )}
      </div>
    </div>
  );
}

// ── Tela principal ─────────────────────────────────────────────────────────────
export default function AgentBuilderScreen({ tenantDbId }) {
  const [globals, setGlobals] = useState([]);
  const [custom, setCustom] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  const [formModal, setFormModal]   = useState({ open: false, agent: null });
  const [configModal, setConfigModal] = useState({ open: false, agent: null });
  const [testModal, setTestModal]   = useState({ open: false, agent: null });

  const loadAgents = useCallback(async () => {
    setLoading(true); setErr('');
    try {
      const data = await apiFetch('/api/agent-builder/agents');
      setGlobals(data.globals || []);
      setCustom(data.custom || []);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAgents(); }, [loadAgents]);

  const handleSaved = (agent) => {
    if (agent?.is_custom) {
      setCustom(prev => {
        const idx = prev.findIndex(a => a.id === agent.id);
        if (idx >= 0) { const next = [...prev]; next[idx] = agent; return next; }
        return [...prev, agent];
      });
    }
  };

  const handleDeleted = (id) => {
    setCustom(prev => prev.filter(a => a.id !== id));
  };

  return (
    <div style={{ background: S.bg, minHeight: '100%', padding: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700, color: S.text }}>Agentes</div>
          <div style={{ fontSize: 13, color: S.muted, marginTop: 2 }}>
            Gerencie e personalize seus agentes de IA
          </div>
        </div>
        <button
          style={S.btnPrimary}
          onClick={() => setFormModal({ open: true, agent: null })}
        >
          + Novo Agente
        </button>
      </div>

      {err && (
        <div style={{ background: 'var(--red-soft)', border: '1px solid #ecc7c2', borderRadius: 8, padding: 12, color: 'var(--red)', marginBottom: 20, fontSize: 14 }}>
          {err}
        </div>
      )}

      {loading ? (
        <div style={{ color: S.muted, fontSize: 14, textAlign: 'center', padding: 40 }}>Carregando agentes…</div>
      ) : (
        <>
          {/* Agentes da Plataforma */}
          <section style={{ marginBottom: 36 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: S.muted, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 14 }}>
              Agentes da Plataforma
            </div>
            {globals.length === 0 && (
              <div style={{ color: S.muted, fontSize: 13 }}>Nenhum agente global encontrado.</div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
              {globals.map(a => (
                <AgentCard
                  key={a.id}
                  agent={a}
                  isCustom={false}
                  onConfig={agent => setConfigModal({ open: true, agent })}
                  onTest={agent => setTestModal({ open: true, agent })}
                  onEdit={() => {}}
                  onDelete={() => {}}
                />
              ))}
            </div>
          </section>

          {/* Seus Agentes Personalizados */}
          <section>
            <div style={{ fontSize: 11, fontWeight: 700, color: S.muted, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 14 }}>
              Seus Agentes Personalizados
            </div>
            {custom.length === 0 && (
              <div style={{
                background: S.surface, border: S.border, borderRadius: 12,
                padding: 32, textAlign: 'center', color: S.muted, fontSize: 14,
              }}>
                Nenhum agente personalizado ainda.{' '}
                <button
                  style={{ ...S.btnPrimary, padding: '6px 14px', fontSize: 13, marginLeft: 8 }}
                  onClick={() => setFormModal({ open: true, agent: null })}
                >
                  + Criar primeiro agente
                </button>
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
              {custom.map(a => (
                <AgentCard
                  key={a.id}
                  agent={a}
                  isCustom={true}
                  onEdit={agent => setFormModal({ open: true, agent })}
                  onDelete={handleDeleted}
                  onConfig={agent => setConfigModal({ open: true, agent })}
                  onTest={agent => setTestModal({ open: true, agent })}
                />
              ))}
            </div>
          </section>
        </>
      )}

      {/* Modals */}
      <AgentFormModal
        open={formModal.open}
        onClose={() => setFormModal({ open: false, agent: null })}
        agent={formModal.agent}
        onSaved={handleSaved}
      />

      <AgentConfigModal
        open={configModal.open}
        onClose={() => setConfigModal({ open: false, agent: null })}
        agent={configModal.agent}
      />

      <AgentTestModal
        open={testModal.open}
        onClose={() => setTestModal({ open: false, agent: null })}
        agent={testModal.agent}
      />
    </div>
  );
}
