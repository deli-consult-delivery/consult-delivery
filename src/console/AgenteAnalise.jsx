import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase.js';

// ============================================================
// Console v2 — tela genérica de agente de análise (Cardápio, Multicanal).
// Fila agente_analises filtrada por `agente`. Resultado:
// { resumo, itens:[{titulo, detalhe, acao}], destaque }.
// ============================================================

export default function AgenteAnalise({ tenantDbId, userId, agente, titulo, descricao }) {
  const [lojas, setLojas] = useState([]);
  const [lojaId, setLojaId] = useState('');
  const [rows, setRows] = useState(null);
  const [pedindo, setPedindo] = useState(false);
  const [erro, setErro] = useState(null);
  const [msg, setMsg] = useState(null);

  const carregar = useCallback(async () => {
    if (!tenantDbId) return;
    const [{ data: ls }, { data: rs, error }] = await Promise.all([
      supabase.from('lojas').select('id, nome').eq('tenant_id', tenantDbId).order('nome'),
      supabase.from('agente_analises').select('id, loja_id, status, resultado, erro_detalhe, created_at').eq('tenant_id', tenantDbId).eq('agente', agente).order('created_at', { ascending: false }).limit(15),
    ]);
    if (error) { setErro(error.message); return; }
    setLojas(ls ?? []);
    setRows(rs ?? []);
  }, [tenantDbId, agente]);

  useEffect(() => { carregar(); }, [carregar]);
  useEffect(() => {
    if (!(rows ?? []).some(r => r.status === 'pendente')) return;
    const t = setInterval(carregar, 20000); return () => clearInterval(t);
  }, [rows, carregar]);

  async function pedir() {
    setErro(null); setMsg(null); setPedindo(true);
    try {
      const { error } = await supabase.from('agente_analises').insert({ tenant_id: tenantDbId, agente, loja_id: lojaId || null, solicitado_por: userId ?? null });
      if (error) throw error;
      setMsg('Solicitado — fica pronto em até 5 minutos (usa os relatórios importados).');
      await carregar();
    } catch (e) { setErro(e?.message || 'falha'); } finally { setPedindo(false); }
  }

  const lojaNome = id => lojas.find(l => l.id === id)?.nome || 'Geral do workspace';

  return (
    <div>
      <h1>{titulo} <span className="cv2-mock" style={{ background: 'var(--green-soft)', color: 'var(--green)' }}>AGENTE</span></h1>
      <div className="cv2-rule" />
      <div className="cv2-sub">{descricao}{erro ? ` · erro: ${erro}` : ''}</div>
      {msg && <div className="cv2-card" style={{ borderLeft: '3px solid var(--green)', color: 'var(--green)', fontWeight: 600 }}>{msg}</div>}
      <div className="cv2-card" style={{ maxWidth: 520 }}>
        <h3>Pedir análise</h3>
        <select style={{ width: '100%', padding: '9px 11px', border: '1px solid var(--line)', borderRadius: 4, fontFamily: 'inherit', fontSize: 13 }} value={lojaId} onChange={e => setLojaId(e.target.value)}>
          <option value="">Geral do workspace</option>
          {lojas.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
        </select>
        <div style={{ marginTop: 14 }}><button className="cv2-btn" disabled={pedindo} onClick={pedir}>{pedindo ? 'Solicitando…' : 'Gerar análise'}</button></div>
      </div>
      {rows && rows.map(r => (
        <div key={r.id} className="cv2-card">
          <div className="cv2-spread">
            <h3 style={{ margin: 0 }}>{lojaNome(r.loja_id)}</h3>
            <span className={`cv2-bdg ${r.status === 'processado' ? 'ok' : r.status === 'erro' ? 'err' : 'warn'}`}>{r.status === 'pendente' ? 'processando…' : r.status}</span>
          </div>
          {r.status === 'erro' && <div style={{ color: 'var(--red)', fontSize: 12.5, marginTop: 8 }}>{r.erro_detalhe}</div>}
          {r.status === 'processado' && r.resultado && (
            <div style={{ marginTop: 10, fontSize: 13, lineHeight: 1.7 }}>
              <div style={{ color: 'var(--tx2)' }}>{r.resultado.resumo}</div>
              {Array.isArray(r.resultado.itens) && r.resultado.itens.length > 0 && (
                <table style={{ marginTop: 12 }}>
                  <thead><tr><th>Item</th><th>Detalhe</th><th>Ação</th></tr></thead>
                  <tbody>{r.resultado.itens.map((it, i) => (
                    <tr key={i}><td><b>{it.titulo}</b></td><td style={{ color: 'var(--tx2)' }}>{it.detalhe}</td><td>{it.acao}</td></tr>
                  ))}</tbody>
                </table>
              )}
              {r.resultado.destaque && <div style={{ marginTop: 10, padding: '8px 11px', background: 'var(--red-soft)', color: 'var(--red)', borderRadius: 4, fontWeight: 600, fontSize: 12.5 }}>Prioridade: {r.resultado.destaque}</div>}
            </div>
          )}
        </div>
      ))}
      {rows && !rows.length && <div className="cv2-card" style={{ textAlign: 'center', color: 'var(--tx2)' }}>Nenhuma análise ainda. Importe relatórios e clique em Gerar análise.</div>}
    </div>
  );
}
