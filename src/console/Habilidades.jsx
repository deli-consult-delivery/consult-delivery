import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase.js';

// ============================================================
// Console v2 — GAP-5: Habilidades (skills, markdown-as-tool)
// Globais (read-only) + por-tenant (admin cria/edita).
// ============================================================

const inputStyle = { width: '100%', padding: '9px 11px', border: '1px solid var(--line)', borderRadius: 4, fontFamily: 'inherit', fontSize: 13, background: '#fff' };

export default function Habilidades({ tenantDbId, userId }) {
  const [skills, setSkills] = useState(null);
  const [nome, setNome] = useState('');
  const [descricao, setDescricao] = useState('');
  const [conteudo, setConteudo] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState(null);

  const carregar = useCallback(async () => {
    if (!tenantDbId) return;
    const { data, error } = await supabase.from('agent_skills')
      .select('id, tenant_id, nome, descricao, conteudo, ativo, created_at')
      .or(`tenant_id.is.null,tenant_id.eq.${tenantDbId}`).order('created_at', { ascending: false });
    if (error) { setErro(error.message); return; }
    setSkills(data ?? []);
  }, [tenantDbId]);

  useEffect(() => { carregar(); }, [carregar]);

  async function criar() {
    setErro(null);
    if (nome.trim().length < 2) { setErro('Informe o nome da habilidade.'); return; }
    setSalvando(true);
    const { error } = await supabase.from('agent_skills').insert({ tenant_id: tenantDbId, nome: nome.trim(), descricao: descricao.trim() || null, conteudo, created_by: userId ?? null });
    setSalvando(false);
    if (error) { setErro(error.message); return; }
    setNome(''); setDescricao(''); setConteudo('');
    await carregar();
  }

  return (
    <div>
      <h1>Habilidades <span className="cv2-mock" style={{ background: 'var(--green-soft)', color: 'var(--green)' }}>SKILLS</span></h1>
      <div className="cv2-rule" />
      <div className="cv2-sub">Instruções reutilizáveis (markdown) que os agentes usam como ferramenta. As globais são da Consult Delivery; você pode criar as suas.{erro ? ` · erro: ${erro}` : ''}</div>
      <div className="cv2-card" style={{ maxWidth: 620 }}>
        <h3>Nova habilidade</h3>
        <input style={inputStyle} placeholder="Nome (ex.: Resposta a avaliação 1 estrela)" value={nome} onChange={e => setNome(e.target.value)} />
        <input style={{ ...inputStyle, marginTop: 8 }} placeholder="Descrição curta" value={descricao} onChange={e => setDescricao(e.target.value)} />
        <textarea style={{ ...inputStyle, marginTop: 8, minHeight: 120, resize: 'vertical' }} placeholder="Conteúdo em markdown…" value={conteudo} onChange={e => setConteudo(e.target.value)} />
        <div style={{ marginTop: 12 }}><button className="cv2-btn" disabled={salvando} onClick={criar}>{salvando ? 'Salvando…' : 'Criar habilidade'}</button></div>
      </div>
      {skills && skills.map(s => (
        <div key={s.id} className="cv2-card">
          <div className="cv2-spread">
            <div><b style={{ fontSize: 14 }}>{s.nome}</b><div style={{ color: 'var(--tx2)', fontSize: 12 }}>{s.descricao}</div></div>
            <span className={`cv2-bdg ${s.tenant_id ? 'mut' : 'ok'}`}>{s.tenant_id ? 'sua' : 'global'}</span>
          </div>
          {s.conteudo && <div style={{ marginTop: 8, fontSize: 12, color: 'var(--tx2)', whiteSpace: 'pre-wrap', maxHeight: 120, overflow: 'auto' }}>{s.conteudo}</div>}
        </div>
      ))}
      {skills && !skills.length && <div className="cv2-card" style={{ textAlign: 'center', color: 'var(--tx2)' }}>Nenhuma habilidade ainda.</div>}
    </div>
  );
}
