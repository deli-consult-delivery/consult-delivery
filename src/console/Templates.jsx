import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase.js';

// ============================================================
// Console v2 — GAP-8: Templates (mensagens e ofertas)
// Brand Guard: usar "oferta", nunca "promoção".
// ============================================================

const inputStyle = { width: '100%', padding: '9px 11px', border: '1px solid var(--line)', borderRadius: 4, fontFamily: 'inherit', fontSize: 13, background: '#fff' };

export default function Templates({ tenantDbId, userId }) {
  const [rows, setRows] = useState(null);
  const [tipo, setTipo] = useState('mensagem');
  const [nome, setNome] = useState('');
  const [conteudo, setConteudo] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState(null);
  const [editingId, setEditingId] = useState(null);

  const carregar = useCallback(async () => {
    if (!tenantDbId) return;
    const { data, error } = await supabase.from('templates')
      .select('id, tipo, nome, conteudo, ativo, created_at').eq('tenant_id', tenantDbId).order('created_at', { ascending: false });
    if (error) { setErro(error.message); return; }
    setRows(data ?? []);
  }, [tenantDbId]);

  useEffect(() => { carregar(); }, [carregar]);

  async function salvar() {
    setErro(null);
    if (nome.trim().length < 2) { setErro('Informe o nome do template.'); return; }
    setSalvando(true);
    const payload = { tipo, nome: nome.trim(), conteudo };
    const { error } = editingId
      ? await supabase.from('templates').update(payload).eq('id', editingId)
      : await supabase.from('templates').insert({ tenant_id: tenantDbId, ...payload, created_by: userId ?? null });
    setSalvando(false);
    if (error) { setErro(error.message); return; }
    cancelarEdicao();
    await carregar();
  }

  function editar(r) {
    setEditingId(r.id); setTipo(r.tipo); setNome(r.nome); setConteudo(r.conteudo ?? '');
  }

  function cancelarEdicao() {
    setEditingId(null); setTipo('mensagem'); setNome(''); setConteudo('');
  }

  async function apagar(id) {
    if (!window.confirm('Apagar este template? Essa ação não pode ser desfeita.')) return;
    setErro(null);
    const { error } = await supabase.from('templates').delete().eq('id', id);
    if (error) { setErro(error.message); return; }
    await carregar();
  }

  return (
    <div>
      <h1>Templates <span className="cv2-mock" style={{ background: 'var(--green-soft)', color: 'var(--green)' }}>MENSAGENS E OFERTAS</span></h1>
      <div className="cv2-rule" />
      <div className="cv2-sub">Modelos reutilizáveis para mensagens e ofertas — a LARA e os agentes consomem.{erro ? ` · erro: ${erro}` : ''}</div>
      <div className="cv2-card" style={{ maxWidth: 620 }}>
        <h3>{editingId ? 'Editar template' : 'Novo template'}</h3>
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <button className={tipo === 'mensagem' ? 'cv2-btn' : 'cv2-btn sec'} onClick={() => setTipo('mensagem')}>Mensagem</button>
          <button className={tipo === 'oferta' ? 'cv2-btn' : 'cv2-btn sec'} onClick={() => setTipo('oferta')}>Oferta</button>
        </div>
        <input style={inputStyle} placeholder="Nome do template" value={nome} onChange={e => setNome(e.target.value)} />
        <textarea style={{ ...inputStyle, marginTop: 8, minHeight: 110, resize: 'vertical' }} placeholder="Conteúdo… use chaves para variáveis, ex.: Olá {{cliente}}" value={conteudo} onChange={e => setConteudo(e.target.value)} />
        <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
          <button className="cv2-btn" disabled={salvando} onClick={salvar}>{salvando ? 'Salvando…' : editingId ? 'Salvar edição' : 'Criar template'}</button>
          {editingId && <button className="cv2-btn sec" disabled={salvando} onClick={cancelarEdicao}>Cancelar</button>}
        </div>
      </div>
      {rows && rows.map(r => (
        <div key={r.id} className="cv2-card">
          <div className="cv2-spread">
            <div><b style={{ fontSize: 14 }}>{r.nome}</b></div>
            <span className={`cv2-bdg ${r.tipo === 'oferta' ? 'warn' : 'mut'}`}>{r.tipo}</span>
          </div>
          {r.conteudo && <div style={{ marginTop: 8, fontSize: 12.5, color: 'var(--tx2)', whiteSpace: 'pre-wrap' }}>{r.conteudo}</div>}
          <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
            <button className="cv2-btn sec" onClick={() => editar(r)}>Editar</button>
            <button className="cv2-btn sec" onClick={() => apagar(r.id)}>Apagar</button>
          </div>
        </div>
      ))}
      {rows && !rows.length && <div className="cv2-card" style={{ textAlign: 'center', color: 'var(--tx2)' }}>Nenhum template ainda.</div>}
    </div>
  );
}
