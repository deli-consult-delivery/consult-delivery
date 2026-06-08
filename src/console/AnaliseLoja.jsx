import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase.js';

// ============================================================
// Console v2 — Agente Análise de Loja
// Pede análise (loja) → fila analise_loja → cron processa (lê
// radar_metricas) → diagnóstico com prioridades e plano.
// ============================================================

const inputStyle = { width: '100%', padding: '9px 11px', border: '1px solid var(--line)', borderRadius: 4, fontFamily: 'inherit', fontSize: 13, background: '#fff' };

export default function AnaliseLoja({ tenantDbId, userId }) {
  const [lojas, setLojas] = useState([]);
  const [lojaId, setLojaId] = useState('');
  const [analises, setAnalises] = useState(null);
  const [pedindo, setPedindo] = useState(false);
  const [erro, setErro] = useState(null);
  const [msg, setMsg] = useState(null);

  const carregar = useCallback(async () => {
    if (!tenantDbId) return;
    const [{ data: ls }, { data: as, error }] = await Promise.all([
      supabase.from('lojas').select('id, nome').eq('tenant_id', tenantDbId).order('nome'),
      supabase.from('analise_loja').select('id, loja_id, status, diagnostico, erro_detalhe, created_at, processado_em').eq('tenant_id', tenantDbId).order('created_at', { ascending: false }).limit(20),
    ]);
    if (error) { setErro(error.message); return; }
    setLojas(ls ?? []);
    setAnalises(as ?? []);
  }, [tenantDbId]);

  useEffect(() => { carregar(); }, [carregar]);
  useEffect(() => {
    const pend = (analises ?? []).some(a => a.status === 'pendente');
    if (!pend) return;
    const t = setInterval(carregar, 20000);
    return () => clearInterval(t);
  }, [analises, carregar]);

  async function pedir() {
    setErro(null); setMsg(null); setPedindo(true);
    try {
      const { error } = await supabase.from('analise_loja').insert({ tenant_id: tenantDbId, loja_id: lojaId || null, solicitado_por: userId ?? null });
      if (error) throw error;
      setMsg('Análise solicitada — fica pronta em até 5 minutos (usa os relatórios já importados).');
      await carregar();
    } catch (e) { setErro(e?.message || 'falha'); } finally { setPedindo(false); }
  }

  const lojaNome = id => lojas.find(l => l.id === id)?.nome || 'Geral do workspace';

  return (
    <div>
      <h1>Análise de Loja <span className="cv2-mock" style={{ background: 'var(--green-soft)', color: 'var(--green)' }}>AGENTE</span></h1>
      <div className="cv2-rule" />
      <div className="cv2-sub">O agente lê os relatórios importados (Dados › Importar relatórios) e entrega um diagnóstico com prioridades e plano de ação.{erro ? ` · erro: ${erro}` : ''}</div>
      {msg && <div className="cv2-card" style={{ borderLeft: '3px solid var(--green)', color: 'var(--green)', fontWeight: 600 }}>{msg}</div>}
      <div className="cv2-card" style={{ maxWidth: 520 }}>
        <h3>Pedir análise</h3>
        <select style={inputStyle} value={lojaId} onChange={e => setLojaId(e.target.value)}>
          <option value="">Geral do workspace (todas as métricas)</option>
          {lojas.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
        </select>
        <div style={{ marginTop: 14 }}><button className="cv2-btn" disabled={pedindo} onClick={pedir}>{pedindo ? 'Solicitando…' : 'Gerar análise'}</button></div>
      </div>

      {analises && analises.map(a => (
        <div key={a.id} className="cv2-card">
          <div className="cv2-spread">
            <h3 style={{ margin: 0 }}>{lojaNome(a.loja_id)}</h3>
            <span className={`cv2-bdg ${a.status === 'processado' ? 'ok' : a.status === 'erro' ? 'err' : 'warn'}`}>{a.status === 'pendente' ? 'processando…' : a.status}</span>
          </div>
          {a.status === 'erro' && <div style={{ color: 'var(--red)', fontSize: 12.5, marginTop: 8 }}>{a.erro_detalhe}</div>}
          {a.status === 'processado' && a.diagnostico && (
            <div style={{ marginTop: 10, fontSize: 13, lineHeight: 1.7 }}>
              <div style={{ color: 'var(--tx2)' }}>{a.diagnostico.resumo}</div>
              {Array.isArray(a.diagnostico.prioridades) && (
                <table style={{ marginTop: 12 }}>
                  <thead><tr><th>Prioridade</th><th>Por quê</th><th>Ação</th></tr></thead>
                  <tbody>{a.diagnostico.prioridades.map((p, i) => (
                    <tr key={i}><td><b>{p.titulo}</b></td><td style={{ color: 'var(--tx2)' }}>{p.porque}</td><td>{p.acao}</td></tr>
                  ))}</tbody>
                </table>
              )}
              {Array.isArray(a.diagnostico.plano) && a.diagnostico.plano.length > 0 && (
                <div style={{ marginTop: 10 }}><b>Plano:</b><ol style={{ margin: '6px 0 0 18px', color: 'var(--tx2)' }}>{a.diagnostico.plano.map((p, i) => <li key={i}>{p}</li>)}</ol></div>
              )}
              {Array.isArray(a.diagnostico.pontos_fortes) && a.diagnostico.pontos_fortes.length > 0 && (
                <div style={{ marginTop: 8, color: 'var(--green)', fontSize: 12.5 }}><b>Pontos fortes:</b> {a.diagnostico.pontos_fortes.join(' · ')}</div>
              )}
            </div>
          )}
        </div>
      ))}
      {analises && !analises.length && <div className="cv2-card" style={{ textAlign: 'center', color: 'var(--tx2)' }}>Nenhuma análise ainda. Importe relatórios e clique em Gerar análise.</div>}
    </div>
  );
}
