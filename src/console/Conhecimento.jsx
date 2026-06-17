import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase.js';

const BRIDGE = import.meta.env.VITE_BRIDGE_URL || 'https://bridge.consultdelivery.com.br';

const AGENT_OPTIONS = [
  { value: '', label: 'Todos os agentes' },
  { value: 'deli',  label: 'DELI' },
  { value: 'lara',  label: 'LARA' },
  { value: 'cora',  label: 'CORA' },
  { value: 'vera',  label: 'VERA' },
  { value: 'breno', label: 'BRENO' },
  { value: 'max',   label: 'MAX' },
  { value: 'sofia', label: 'SOFIA' },
  { value: 'nova',  label: 'NOVA' },
];

const AGENT_COLORS = {
  deli:  '#B70C00',
  lara:  '#EC4899',
  cora:  '#10B981',
  vera:  '#06B6D4',
  breno: '#3B82F6',
  max:   '#F59E0B',
  sofia: '#8B5CF6',
  nova:  '#A78BFA',
};

function agentColor(slug) {
  return AGENT_COLORS[slug] || '#777';
}

const DEFAULT_FORM = { agent_slug: '', title: '', content: '', tags: '', source: 'manual' };

export default function Conhecimento({ tenantDbId, userId }) {
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [filterAgent, setFilterAgent] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);
  const [tagInput, setTagInput] = useState('');
  const [bridgeHeaders, setBridgeHeaders] = useState({});

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const token = data?.session?.access_token;
      if (token) setBridgeHeaders({ Authorization: `Bearer ${token}` });
    });
  }, []);

  const fetchArticles = useCallback(async () => {
    if (!tenantDbId) console.warn('[Conhecimento] tenantDbId não fornecido — o backend resolverá via JWT');
    setLoading(true);
    setError(null);
    try {
      let url = `${BRIDGE}/api/knowledge-base`;
      const params = [];
      if (filterAgent) params.push(`agent_slug=${encodeURIComponent(filterAgent)}`);
      if (params.length) url += '?' + params.join('&');
      const res = await fetch(url, { headers: bridgeHeaders });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setArticles(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [tenantDbId, filterAgent, bridgeHeaders]);

  useEffect(() => { fetchArticles(); }, [fetchArticles]);

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!searchInput.trim()) { setSearchQuery(''); fetchArticles(); return; }
    setLoading(true);
    setError(null);
    setSearchQuery(searchInput.trim());
    try {
      const res = await fetch(`${BRIDGE}/api/knowledge-base/search`, {
        method: 'POST',
        headers: { ...(bridgeHeaders), 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: searchInput.trim(), ...(filterAgent ? { agent_slug: filterAgent } : {}) }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setArticles(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const openCreate = () => {
    setEditing(null);
    setForm(DEFAULT_FORM);
    setTagInput('');
    setShowModal(true);
  };

  const openEdit = (article) => {
    setEditing(article);
    setForm({
      agent_slug: article.agent_slug || '',
      title: article.title,
      content: article.content,
      tags: '',
      source: article.source || 'manual',
    });
    setTagInput('');
    setShowModal(true);
  };

  const handleToggleActive = async (article) => {
    try {
      const res = await fetch(`${BRIDGE}/api/knowledge-base/${article.id}`, {
        method: 'PATCH',
        headers: { ...(bridgeHeaders), 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !article.is_active }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      fetchArticles();
    } catch (err) {
      alert('Erro ao atualizar artigo: ' + err.message);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Confirmar exclusão?')) return;
    try {
      const res = await fetch(`${BRIDGE}/api/knowledge-base/${id}`, {
        method: 'DELETE',
        headers: bridgeHeaders,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      fetchArticles();
    } catch (err) {
      alert('Erro ao excluir artigo: ' + err.message);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const tags = form._tags || (editing ? editing.tags : []);
      const body = {
        agent_slug: form.agent_slug || null,
        title: form.title,
        content: form.content,
        tags,
        source: form.source,
      };
      const url = editing
        ? `${BRIDGE}/api/knowledge-base/${editing.id}`
        : `${BRIDGE}/api/knowledge-base`;
      const res = await fetch(url, {
        method: editing ? 'PATCH' : 'POST',
        headers: { ...(bridgeHeaders), 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setShowModal(false);
      fetchArticles();
    } catch (err) {
      alert('Erro ao salvar artigo: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const currentTags = form._tags || (editing ? (editing.tags || []) : []);

  const addTag = () => {
    const t = tagInput.trim();
    if (!t || currentTags.includes(t)) { setTagInput(''); return; }
    setForm(f => ({ ...f, _tags: [...currentTags, t] }));
    setTagInput('');
  };

  const removeTag = (tag) => {
    setForm(f => ({ ...f, _tags: currentTags.filter(t => t !== tag) }));
  };

  return (
    <div className="cv2-ct">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 18, gap: 12 }}>
        <div>
          <h1>Base de Conhecimento</h1>
          <div className="cv2-rule" />
          <div className="cv2-sub">Artigos e contexto para os agentes</div>
        </div>
        <button className="cv2-btn" onClick={openCreate}>
          + Novo Artigo
        </button>
      </div>

      {/* Search + Filter bar */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <form onSubmit={handleSearch} style={{ display: 'flex', gap: 8, flex: 1, minWidth: 200 }}>
          <input
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            placeholder="Buscar por título ou conteúdo…"
            style={{ flex: 1, padding: '8px 12px', background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 4, color: 'var(--tx)', fontSize: 14, outline: 'none', fontFamily: 'inherit' }}
          />
          <button type="submit" className="cv2-btn sec">
            Buscar
          </button>
          {searchQuery && (
            <button type="button" onClick={() => { setSearchInput(''); setSearchQuery(''); fetchArticles(); }} className="cv2-btn sec" title="Limpar busca">
              ✕
            </button>
          )}
        </form>

        <select
          value={filterAgent}
          onChange={e => setFilterAgent(e.target.value)}
          style={{ padding: '8px 12px', background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 4, color: 'var(--tx)', fontSize: 14, cursor: 'pointer', outline: 'none', fontFamily: 'inherit' }}
        >
          {AGENT_OPTIONS.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      {/* Error */}
      {error && (
        <div style={{ padding: 12, background: 'var(--red-soft)', border: '1px solid var(--red)', borderRadius: 6, color: 'var(--red)', marginBottom: 16, fontSize: 13 }}>
          Erro: {error}
        </div>
      )}

      {/* Articles list */}
      {loading ? (
        <div style={{ textAlign: 'center', color: 'var(--tx2)', padding: 40 }}>Carregando…</div>
      ) : articles.length === 0 ? (
        <div className="cv2-card" style={{ textAlign: 'center', color: 'var(--tx2)', padding: 40, fontSize: 13 }}>
          {searchQuery ? `Nenhum artigo encontrado para "${searchQuery}".` : 'Nenhum artigo cadastrado ainda.'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {articles.map(article => (
            <div key={article.id} className="cv2-card" style={{
              borderColor: article.is_active ? 'var(--line)' : 'var(--red-soft)',
              opacity: article.is_active ? 1 : 0.6,
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--tx)' }}>{article.title}</span>
                    {article.agent_slug && (
                      <span style={{
                        fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
                        background: agentColor(article.agent_slug) + '1a',
                        color: agentColor(article.agent_slug),
                        border: `1px solid ${agentColor(article.agent_slug)}44`,
                      }}>
                        {article.agent_slug.toUpperCase()}
                      </span>
                    )}
                    {!article.agent_slug && (
                      <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--tx2)' }}>
                        Global
                      </span>
                    )}
                  </div>
                  <p style={{ fontSize: 13, color: 'var(--tx2)', margin: '0 0 8px', lineHeight: 1.5 }}>
                    {article.content.length > 150 ? article.content.slice(0, 150) + '…' : article.content}
                  </p>
                  {article.tags?.length > 0 && (
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
                      {article.tags.map(tag => (
                        <span key={tag} style={{ fontSize: 11, padding: '2px 8px', background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: 20, color: 'var(--tx2)' }}>
                          #{tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
                  <button
                    onClick={() => handleToggleActive(article)}
                    title={article.is_active ? 'Desativar' : 'Ativar'}
                    style={{
                      width: 36, height: 20, borderRadius: 10, border: 'none', cursor: 'pointer',
                      background: article.is_active ? 'var(--green)' : '#cbc9c5',
                      position: 'relative', transition: 'background 0.2s', flexShrink: 0,
                    }}
                  >
                    <span style={{
                      position: 'absolute', top: 2, left: article.is_active ? 18 : 2,
                      width: 16, height: 16, borderRadius: 8, background: '#fff',
                      transition: 'left 0.2s', boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
                    }} />
                  </button>
                  <button onClick={() => openEdit(article)} className="cv2-btn sec" style={{ padding: '5px 12px', fontSize: 12 }}>
                    Editar
                  </button>
                  <button onClick={() => handleDelete(article.id)} className="cv2-btn danger" style={{ padding: '5px 12px', fontSize: 12 }}>
                    Excluir
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(28,27,26,0.45)', zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
        }}>
          <div style={{ background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 8, padding: 28, width: '100%', maxWidth: 600, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 12px 40px rgba(0,0,0,0.18)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: 'var(--tx)' }}>
                {editing ? 'Editar Artigo' : 'Novo Artigo'}
              </h2>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', color: 'var(--tx2)', cursor: 'pointer', fontSize: 20, padding: '0 4px' }}>✕</button>
            </div>

            <form onSubmit={handleSave}>
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 13, color: 'var(--tx2)', marginBottom: 6 }}>Agente</label>
                <select
                  value={form.agent_slug}
                  onChange={e => setForm(f => ({ ...f, agent_slug: e.target.value }))}
                  style={{ width: '100%', padding: '8px 12px', background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 4, color: 'var(--tx)', fontSize: 14, outline: 'none', fontFamily: 'inherit' }}
                >
                  {AGENT_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>

              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 13, color: 'var(--tx2)', marginBottom: 6 }}>Título *</label>
                <input
                  required
                  value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="Título do artigo"
                  style={{ width: '100%', padding: '8px 12px', background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 4, color: 'var(--tx)', fontSize: 14, boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit' }}
                />
              </div>

              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 13, color: 'var(--tx2)', marginBottom: 6 }}>Conteúdo * (suporta Markdown)</label>
                <textarea
                  required
                  value={form.content}
                  onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
                  placeholder="Escreva o conteúdo do artigo…"
                  rows={10}
                  style={{ width: '100%', padding: '10px 12px', background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 4, color: 'var(--tx)', fontSize: 13, resize: 'vertical', lineHeight: 1.6, boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit' }}
                />
              </div>

              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 13, color: 'var(--tx2)', marginBottom: 6 }}>Tags</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    value={tagInput}
                    onChange={e => setTagInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
                    placeholder="Adicionar tag…"
                    style={{ flex: 1, padding: '7px 12px', background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 4, color: 'var(--tx)', fontSize: 13, outline: 'none', fontFamily: 'inherit' }}
                  />
                  <button type="button" onClick={addTag} className="cv2-btn sec">
                    Adicionar
                  </button>
                </div>
                {currentTags.length > 0 && (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                    {currentTags.map(tag => (
                      <span key={tag} style={{ fontSize: 12, padding: '3px 10px', background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: 20, color: 'var(--tx2)', cursor: 'pointer' }} onClick={() => removeTag(tag)}>
                        #{tag} ✕
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div style={{ marginBottom: 22 }}>
                <label style={{ display: 'block', fontSize: 13, color: 'var(--tx2)', marginBottom: 6 }}>Fonte</label>
                <select
                  value={form.source}
                  onChange={e => setForm(f => ({ ...f, source: e.target.value }))}
                  style={{ width: '100%', padding: '8px 12px', background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 4, color: 'var(--tx)', fontSize: 14, outline: 'none', fontFamily: 'inherit' }}
                >
                  <option value="manual">Manual</option>
                  <option value="imported">Importado</option>
                  <option value="auto-generated">Gerado automaticamente</option>
                </select>
              </div>

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setShowModal(false)} className="cv2-btn sec">
                  Cancelar
                </button>
                <button type="submit" disabled={saving} className="cv2-btn" style={{ opacity: saving ? 0.6 : 1 }}>
                  {saving ? 'Salvando…' : (editing ? 'Salvar alterações' : 'Criar artigo')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
