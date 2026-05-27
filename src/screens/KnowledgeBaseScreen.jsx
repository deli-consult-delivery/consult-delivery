import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase.js';

const BRIDGE_URL = import.meta.env.VITE_BRIDGE_URL || 'https://bridge.consultdelivery.com.br';

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

export default function KnowledgeBaseScreen({ tenantDbId }) {
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [filterAgent, setFilterAgent] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null); // article being edited
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
    if (!tenantDbId) console.warn('[KnowledgeBaseScreen] tenantDbId não fornecido — o backend resolverá via JWT');
    setLoading(true);
    setError(null);
    try {
      let url = `${BRIDGE_URL}/api/knowledge-base`;
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
      const res = await fetch(`${BRIDGE_URL}/api/knowledge-base/search`, {
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
      const res = await fetch(`${BRIDGE_URL}/api/knowledge-base/${article.id}`, {
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
      const res = await fetch(`${BRIDGE_URL}/api/knowledge-base/${id}`, {
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
        ? `${BRIDGE_URL}/api/knowledge-base/${editing.id}`
        : `${BRIDGE_URL}/api/knowledge-base`;
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
    <div style={{ padding: 24, minHeight: '100%', background: '#111', color: '#fff' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Base de Conhecimento</h1>
          <p style={{ fontSize: 13, color: '#888', margin: '4px 0 0' }}>Artigos e contexto para os agentes</p>
        </div>
        <button
          onClick={openCreate}
          style={{ padding: '8px 18px', background: '#B70C00', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 14 }}
        >
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
            style={{ flex: 1, padding: '8px 12px', background: '#1a1a1a', border: '1px solid #333', borderRadius: 8, color: '#fff', fontSize: 14 }}
          />
          <button type="submit" style={{ padding: '8px 14px', background: '#222', border: '1px solid #444', borderRadius: 8, color: '#ccc', cursor: 'pointer', fontSize: 13 }}>
            Buscar
          </button>
          {searchQuery && (
            <button type="button" onClick={() => { setSearchInput(''); setSearchQuery(''); fetchArticles(); }} style={{ padding: '8px 10px', background: 'none', border: '1px solid #444', borderRadius: 8, color: '#aaa', cursor: 'pointer', fontSize: 12 }}>
              ✕
            </button>
          )}
        </form>

        <select
          value={filterAgent}
          onChange={e => setFilterAgent(e.target.value)}
          style={{ padding: '8px 12px', background: '#1a1a1a', border: '1px solid #333', borderRadius: 8, color: '#fff', fontSize: 14, cursor: 'pointer' }}
        >
          {AGENT_OPTIONS.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      {/* Error */}
      {error && (
        <div style={{ padding: 12, background: '#2a0a0a', border: '1px solid #B70C00', borderRadius: 8, color: '#f87171', marginBottom: 16, fontSize: 13 }}>
          Erro: {error}
        </div>
      )}

      {/* Articles list */}
      {loading ? (
        <div style={{ textAlign: 'center', color: '#888', padding: 40 }}>Carregando…</div>
      ) : articles.length === 0 ? (
        <div style={{ textAlign: 'center', color: '#888', padding: 60 }}>
          {searchQuery ? `Nenhum artigo encontrado para "${searchQuery}".` : 'Nenhum artigo cadastrado ainda.'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {articles.map(article => (
            <div key={article.id} style={{
              background: '#1a1a1a',
              border: `1px solid ${article.is_active ? '#2a2a2a' : '#1a1010'}`,
              borderRadius: 10,
              padding: 16,
              opacity: article.is_active ? 1 : 0.55,
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <span style={{ fontWeight: 600, fontSize: 15 }}>{article.title}</span>
                    {article.agent_slug && (
                      <span style={{
                        fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
                        background: agentColor(article.agent_slug) + '22',
                        color: agentColor(article.agent_slug),
                        border: `1px solid ${agentColor(article.agent_slug)}55`,
                      }}>
                        {article.agent_slug.toUpperCase()}
                      </span>
                    )}
                    {!article.agent_slug && (
                      <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: '#333', color: '#aaa' }}>
                        Global
                      </span>
                    )}
                  </div>
                  <p style={{ fontSize: 13, color: '#aaa', margin: '0 0 8px', lineHeight: 1.5 }}>
                    {article.content.length > 150 ? article.content.slice(0, 150) + '…' : article.content}
                  </p>
                  {article.tags?.length > 0 && (
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
                      {article.tags.map(tag => (
                        <span key={tag} style={{ fontSize: 11, padding: '2px 8px', background: '#2a2a2a', border: '1px solid #444', borderRadius: 20, color: '#ccc' }}>
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
                      background: article.is_active ? '#B70C00' : '#333',
                      position: 'relative', transition: 'background 0.2s',
                    }}
                  >
                    <span style={{
                      position: 'absolute', top: 2, left: article.is_active ? 18 : 2,
                      width: 16, height: 16, borderRadius: 8, background: '#fff',
                      transition: 'left 0.2s',
                    }} />
                  </button>
                  <button
                    onClick={() => openEdit(article)}
                    style={{ padding: '5px 12px', background: '#222', border: '1px solid #444', borderRadius: 6, color: '#ccc', cursor: 'pointer', fontSize: 12 }}
                  >
                    Editar
                  </button>
                  <button
                    onClick={() => handleDelete(article.id)}
                    style={{ padding: '5px 12px', background: '#1a0808', border: '1px solid #B70C0055', borderRadius: 6, color: '#f87171', cursor: 'pointer', fontSize: 12 }}
                  >
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
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
        }}>
          <div style={{ background: '#1a1a1a', border: '1px solid #333', borderRadius: 12, padding: 28, width: '100%', maxWidth: 600, maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>
                {editing ? 'Editar Artigo' : 'Novo Artigo'}
              </h2>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', color: '#aaa', cursor: 'pointer', fontSize: 20, padding: '0 4px' }}>✕</button>
            </div>

            <form onSubmit={handleSave}>
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 13, color: '#aaa', marginBottom: 6 }}>Agente</label>
                <select
                  value={form.agent_slug}
                  onChange={e => setForm(f => ({ ...f, agent_slug: e.target.value }))}
                  style={{ width: '100%', padding: '8px 12px', background: '#111', border: '1px solid #333', borderRadius: 8, color: '#fff', fontSize: 14 }}
                >
                  {AGENT_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>

              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 13, color: '#aaa', marginBottom: 6 }}>Título *</label>
                <input
                  required
                  value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="Título do artigo"
                  style={{ width: '100%', padding: '8px 12px', background: '#111', border: '1px solid #333', borderRadius: 8, color: '#fff', fontSize: 14, boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 13, color: '#aaa', marginBottom: 6 }}>Conteúdo * (suporta Markdown)</label>
                <textarea
                  required
                  value={form.content}
                  onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
                  placeholder="Escreva o conteúdo do artigo…"
                  rows={10}
                  style={{ width: '100%', padding: '10px 12px', background: '#111', border: '1px solid #333', borderRadius: 8, color: '#fff', fontSize: 13, resize: 'vertical', lineHeight: 1.6, boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 13, color: '#aaa', marginBottom: 6 }}>Tags</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    value={tagInput}
                    onChange={e => setTagInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
                    placeholder="Adicionar tag…"
                    style={{ flex: 1, padding: '7px 12px', background: '#111', border: '1px solid #333', borderRadius: 8, color: '#fff', fontSize: 13 }}
                  />
                  <button type="button" onClick={addTag} style={{ padding: '7px 14px', background: '#222', border: '1px solid #444', borderRadius: 8, color: '#ccc', cursor: 'pointer', fontSize: 13 }}>
                    Adicionar
                  </button>
                </div>
                {currentTags.length > 0 && (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                    {currentTags.map(tag => (
                      <span key={tag} style={{ fontSize: 12, padding: '3px 10px', background: '#2a2a2a', border: '1px solid #444', borderRadius: 20, color: '#ccc', cursor: 'pointer' }} onClick={() => removeTag(tag)}>
                        #{tag} ✕
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div style={{ marginBottom: 22 }}>
                <label style={{ display: 'block', fontSize: 13, color: '#aaa', marginBottom: 6 }}>Fonte</label>
                <select
                  value={form.source}
                  onChange={e => setForm(f => ({ ...f, source: e.target.value }))}
                  style={{ width: '100%', padding: '8px 12px', background: '#111', border: '1px solid #333', borderRadius: 8, color: '#fff', fontSize: 14 }}
                >
                  <option value="manual">Manual</option>
                  <option value="imported">Importado</option>
                  <option value="auto-generated">Gerado automaticamente</option>
                </select>
              </div>

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setShowModal(false)} style={{ padding: '9px 20px', background: '#222', border: '1px solid #444', borderRadius: 8, color: '#ccc', cursor: 'pointer', fontSize: 14 }}>
                  Cancelar
                </button>
                <button type="submit" disabled={saving} style={{ padding: '9px 24px', background: '#B70C00', border: 'none', borderRadius: 8, color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 14, opacity: saving ? 0.6 : 1 }}>
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
