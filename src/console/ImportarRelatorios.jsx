import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase.js';

// ============================================================
// Console v2 — PR12a: Importar relatórios do iFood (Radar real)
// Upload de planilha (.xlsx do portal) ou print (.png/.jpg) →
// bucket 'radar' → radar_fontes 'pendente' → task processa em
// até 5 min e normaliza em radar_metricas.
// ============================================================

const inputStyle = { width: '100%', padding: '9px 11px', border: '1px solid var(--line)', borderRadius: 4, fontFamily: 'inherit', fontSize: 13, background: '#fff' };
const labelStyle = { display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.4px', color: 'var(--tx2)', margin: '12px 0 5px' };

function Badge({ s }) {
  const m = { pendente: ['warn', 'processando…'], processado: ['ok', 'processado'], erro: ['err', 'erro'] };
  const [cls, txt] = m[s] || ['mut', s];
  return <span className={`cv2-bdg ${cls}`}>{txt}</span>;
}

export default function ImportarRelatorios({ tenantDbId, userId }) {
  const [lojas, setLojas] = useState([]);
  const [lojaId, setLojaId] = useState('');
  const [fontes, setFontes] = useState(null);
  const [metricas, setMetricas] = useState([]);
  const [enviando, setEnviando] = useState(false);
  const [msg, setMsg] = useState(null);
  const [erro, setErro] = useState(null);

  const carregar = useCallback(async () => {
    if (!tenantDbId) return;
    const [{ data: ls }, { data: fs, error: e1 }, { data: ms }] = await Promise.all([
      supabase.from('lojas').select('id, nome').eq('tenant_id', tenantDbId).order('nome'),
      supabase.from('radar_fontes').select('id, tipo_relatorio, origem, arquivo_nome, status, erro_detalhe, periodo_inicio, periodo_fim, created_at').eq('tenant_id', tenantDbId).order('created_at', { ascending: false }).limit(30),
      supabase.from('radar_metricas').select('metrica, valor, valor_texto, periodo_inicio, periodo_fim, created_at').eq('tenant_id', tenantDbId).order('created_at', { ascending: false }).limit(20),
    ]);
    if (e1) { setErro(e1.message); return; }
    setLojas(ls ?? []);
    setFontes(fs ?? []);
    setMetricas(ms ?? []);
  }, [tenantDbId]);

  useEffect(() => { carregar(); }, [carregar]);
  useEffect(() => {
    const temPendente = (fontes ?? []).some(f => f.status === 'pendente');
    if (!temPendente) return;
    const t = setInterval(carregar, 30000);
    return () => clearInterval(t);
  }, [fontes, carregar]);

  async function enviarArquivos(files) {
    setErro(null); setMsg(null);
    if (!files?.length) return;
    setEnviando(true);
    try {
      let enviados = 0;
      for (const file of files) {
        const ext = file.name.split('.').pop().toLowerCase();
        const origem = ['png', 'jpg', 'jpeg'].includes(ext) ? 'print' : 'planilha';
        if (origem === 'planilha' && !['xlsx', 'xls', 'csv'].includes(ext)) { setErro(`formato não suportado: .${ext}`); continue; }
        const path = `${tenantDbId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
        const { error: upErr } = await supabase.storage.from('radar').upload(path, file, { upsert: false });
        if (upErr) throw upErr;
        const { error: insErr } = await supabase.from('radar_fontes').insert({
          tenant_id: tenantDbId,
          loja_id: lojaId || null,
          origem,
          arquivo_path: path,
          arquivo_nome: file.name,
          enviado_por: userId ?? null,
        });
        if (insErr) throw insErr;
        enviados++;
      }
      setMsg(`${enviados} arquivo(s) na fila — processamento em até 5 minutos.`);
      await carregar();
    } catch (err) {
      setErro(err?.message || 'falha no envio');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div>
      <h1>Importar relatórios <span className="cv2-mock" style={{ background: 'var(--green-soft)', color: 'var(--green)' }}>FONTE DO DASHBOARD</span></h1>
      <div className="cv2-rule" />
      <div className="cv2-sub">Baixe os relatórios no Portal do Parceiro iFood (aba Relatórios) e solte aqui — vendas, cancelamentos, negociações, cardápio, logística e conciliação. Prints de telas também valem (a IA lê a imagem).{erro ? ` · erro: ${erro}` : ''}</div>

      {msg && <div className="cv2-card" style={{ borderLeft: '3px solid var(--green)', color: 'var(--green)', fontWeight: 600 }}>{msg}</div>}

      <div className="cv2-card" style={{ maxWidth: 560 }}>
        <h3>Enviar arquivos</h3>
        <label style={labelStyle}>Loja (opcional — vincula as métricas)</label>
        <select style={inputStyle} value={lojaId} onChange={e => setLojaId(e.target.value)}>
          <option value="">— sem vínculo —</option>
          {lojas.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
        </select>
        <label style={labelStyle}>Planilhas (.xlsx) ou prints (.png/.jpg) — pode selecionar vários</label>
        <input type="file" multiple accept=".xlsx,.xls,.csv,.png,.jpg,.jpeg" disabled={enviando}
          onChange={e => enviarArquivos([...e.target.files])} style={{ fontSize: 13 }} />
        {enviando && <div style={{ marginTop: 8, color: 'var(--tx2)', fontSize: 12.5 }}>Enviando…</div>}
      </div>

      <h1 style={{ fontSize: 15, marginTop: 22 }}>Arquivos enviados</h1>
      <div className="cv2-rule" />
      {fontes && fontes.length > 0 && (
        <div className="cv2-card">
          <div className="cv2-tbl-wrap">
          <table>
            <thead><tr><th>Arquivo</th><th>Tipo</th><th>Período</th><th>Status</th></tr></thead>
            <tbody>
              {fontes.map(f => (
                <tr key={f.id}>
                  <td style={{ maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.arquivo_nome || f.id}</td>
                  <td>{f.tipo_relatorio || (f.origem === 'print' ? 'print' : '—')}</td>
                  <td style={{ fontSize: 12, color: 'var(--tx2)' }}>{f.periodo_inicio ? `${f.periodo_inicio} → ${f.periodo_fim}` : '—'}</td>
                  <td><Badge s={f.status} />{f.status === 'erro' && <div style={{ fontSize: 11, color: 'var(--red)', marginTop: 3 }}>{f.erro_detalhe}</div>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}
      {fontes && !fontes.length && <div className="cv2-card" style={{ textAlign: 'center', color: 'var(--tx2)' }}>Nenhum arquivo enviado ainda.</div>}

      <h1 style={{ fontSize: 15, marginTop: 22 }}>Métricas extraídas (recentes)</h1>
      <div className="cv2-rule" />
      {metricas.length > 0 ? (
        <div className="cv2-card">
          <div className="cv2-tbl-wrap">
          <table>
            <thead><tr><th>Métrica</th><th>Valor</th><th>Período</th></tr></thead>
            <tbody>
              {metricas.map((m, i) => (
                <tr key={i}>
                  <td>{m.metrica}</td>
                  <td><b>{m.valor != null ? Number(m.valor).toLocaleString('pt-BR') : ''}</b>{m.valor_texto ? ` ${m.valor_texto}` : ''}</td>
                  <td style={{ fontSize: 12, color: 'var(--tx2)' }}>{m.periodo_inicio ? `${m.periodo_inicio} → ${m.periodo_fim}` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      ) : <div className="cv2-card" style={{ textAlign: 'center', color: 'var(--tx2)' }}>As métricas aparecem aqui depois do processamento.</div>}
    </div>
  );
}
