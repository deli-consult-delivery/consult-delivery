import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase.js';

// ============================================================
// Console v2 — GESTOR: Dashboard por loja (v1)
// Clone estrutural do RadarReal.jsx: seletor de loja no topo,
// dados sempre isolados por loja_id. 4 blocos: KPIs de operação
// (loja_metricas), reputação, diário do agente (client_timeline)
// e sugestões pendentes (agent_drafts, agent_name='gestor').
// ============================================================

const fmtBRL = n => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtNum = n => Number(n || 0).toLocaleString('pt-BR');

const fmtData = s => {
  if (!s) return '';
  const [y, mo, d] = String(s).slice(0, 10).split('-');
  return `${d}/${mo}/${y}`;
};

const fmtDataHora = s => {
  if (!s) return '';
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
};

const PERIODOS = [
  { key: 7, label: '7 dias' },
  { key: 28, label: '28 dias' },
];

const ymd = d => {
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mo}-${da}`;
};

function Kpi({ l, v, d, neg, mut }) {
  return (
    <div className="cv2-kpi">
      <div className="l">{l}</div>
      <div className="v">{v}</div>
      <div className={`d${neg ? ' neg' : ''}${mut ? ' mut' : ''}`}>{d || ' '}</div>
    </div>
  );
}

function Vazio({ children }) {
  return (
    <div style={{ fontSize: 13, color: 'var(--tx2)', padding: '18px 4px', textAlign: 'center' }}>{children}</div>
  );
}

export default function GestorDashboard({ tenantDbId, userId, onNavigate }) {
  const [lojas, setLojas] = useState(null);      // [{id, nome}]
  const [lojaId, setLojaId] = useState('');
  const [periodo, setPeriodo] = useState(7);       // 7 | 28 dias
  const [metricas, setMetricas] = useState([]);    // linhas loja_metricas, desc por data
  const [avaliadas, setAvaliadas] = useState([]);  // linhas com avaliacao não-nula
  const [diario, setDiario] = useState([]);        // client_timeline
  const [sugestoes, setSugestoes] = useState([]);  // agent_drafts pendentes
  const [erro, setErro] = useState(null);

  // 1) Lojas ativas do tenant.
  useEffect(() => {
    if (!tenantDbId) return;
    let vivo = true;
    (async () => {
      const { data, error } = await supabase
        .from('lojas')
        .select('id, nome')
        .eq('tenant_id', tenantDbId)
        .eq('is_consultoria_ativa', true)
        .order('nome');
      if (!vivo) return;
      if (error) { setErro(error.message); setLojas([]); return; }
      const lista = data ?? [];
      setLojas(lista);
      setLojaId(prev => (lista.some(l => l.id === prev) ? prev : (lista[0]?.id ?? '')));
    })();
    return () => { vivo = false; };
  }, [tenantDbId]);

  // 2) Dados da loja selecionada — isolados por loja_id, resilientes por bloco.
  const carregar = useCallback(async () => {
    if (!tenantDbId || !lojaId) return;
    const desde = ymd((() => { const d = new Date(); d.setDate(d.getDate() - periodo); return d; })());

    const [metricasRes, diarioRes, sugestoesRes] = await Promise.all([
      supabase.from('loja_metricas')
        .select('data, faturamento, pedidos, ticket_medio, avaliacao, cancelamentos')
        .eq('loja_id', lojaId).eq('tenant_id', tenantDbId)
        .gte('data', desde).order('data', { ascending: false }),
      supabase.from('client_timeline')
        .select('id, event_type, title, payload, ts, agent_name')
        .eq('loja_id', lojaId).eq('tenant_id', tenantDbId)
        .order('ts', { ascending: false }).limit(30),
      supabase.from('agent_drafts')
        .select('id, channel, content, subject, created_at')
        .eq('loja_id', lojaId).eq('tenant_id', tenantDbId)
        .eq('agent_name', 'gestor').eq('status', 'pending')
        .order('created_at', { ascending: false }),
    ]);

    if (metricasRes.error) setErro(metricasRes.error.message);
    else if (diarioRes.error) setErro(diarioRes.error.message);
    else if (sugestoesRes.error) setErro(sugestoesRes.error.message);
    const linhasMetricas = metricasRes.data ?? [];
    setMetricas(linhasMetricas);
    setAvaliadas(linhasMetricas.filter(r => r.avaliacao != null));

    // diário: prioriza agent_name='gestor'; se vazio, cai para todos os agentes
    let linhasDiario = diarioRes.data ?? [];
    const soGestor = linhasDiario.filter(r => r.agent_name === 'gestor');
    if (soGestor.length > 0) linhasDiario = soGestor;
    setDiario(linhasDiario);

    setSugestoes(sugestoesRes.data ?? []);
  }, [tenantDbId, lojaId, periodo]);

  useEffect(() => { carregar(); }, [carregar]);

  if (lojas === null) return null;

  if (lojas.length === 0) {
    return (
      <div>
        <h1>GESTOR: Dashboard</h1>
        <div className="cv2-rule" />
        <div className="cv2-card" style={{ maxWidth: 620 }}>
          <h3>Nenhuma loja ativa</h3>
          <div style={{ fontSize: 13, color: 'var(--tx2)', lineHeight: 1.8 }}>
            Ative uma loja para acompanhar aqui os KPIs, reputação e sugestões do GESTOR.
          </div>
        </div>
      </div>
    );
  }

  const lojaNome = lojas.find(l => l.id === lojaId)?.nome ?? '';

  // KPIs de operação: soma/média das linhas do período (guardas null-safe: nunca zera, some).
  const totalFaturamento = metricas.some(r => r.faturamento != null)
    ? metricas.reduce((s, r) => s + (Number(r.faturamento) || 0), 0) : null;
  const totalPedidos = metricas.some(r => r.pedidos != null)
    ? metricas.reduce((s, r) => s + (Number(r.pedidos) || 0), 0) : null;
  const totalCancelamentos = metricas.some(r => r.cancelamentos != null)
    ? metricas.reduce((s, r) => s + (Number(r.cancelamentos) || 0), 0) : null;
  const ticketsValidos = metricas.filter(r => r.ticket_medio != null).map(r => Number(r.ticket_medio));
  const ticketMedio = ticketsValidos.length > 0
    ? ticketsValidos.reduce((s, v) => s + v, 0) / ticketsValidos.length : null;

  const avaliacaoMedia = avaliadas.length > 0
    ? avaliadas.reduce((s, r) => s + Number(r.avaliacao), 0) / avaliadas.length : null;

  return (
    <div>
      <h1>GESTOR: Dashboard</h1>
      <div className="cv2-rule" />

      <div className="cv2-card" style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <label htmlFor="gestor-dash-loja" style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.4px', color: 'var(--tx2)' }}>Loja</label>
          <select
            id="gestor-dash-loja"
            value={lojaId}
            onChange={e => setLojaId(e.target.value)}
            style={{ padding: '8px 11px', border: '1px solid var(--line)', borderRadius: 4, fontFamily: 'inherit', fontSize: 13, background: '#fff', minWidth: 240 }}
          >
            {lojas.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
          </select>

          <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.4px', color: 'var(--tx2)', marginLeft: 8 }}>Período</span>
          <div style={{ display: 'flex', gap: 4 }}>
            {PERIODOS.map(p => (
              <button
                key={p.key}
                type="button"
                className={`cv2-btn${periodo === p.key ? '' : ' sec'}`}
                style={{ padding: '6px 11px' }}
                onClick={() => setPeriodo(p.key)}
              >{p.label}</button>
            ))}
          </div>
        </div>
      </div>

      {erro && <div className="cv2-sub" style={{ color: 'var(--red)' }}>erro: {erro}</div>}

      <div className="cv2-sub">KPIs de operação de {lojaNome} — últimos {periodo} dias</div>
      <div className="cv2-kpis">
        <Kpi l="Faturamento" v={totalFaturamento != null ? fmtBRL(totalFaturamento) : '—'} d={totalPedidos != null ? `${fmtNum(totalPedidos)} pedidos` : ''} />
        <Kpi l="Pedidos" v={totalPedidos != null ? fmtNum(totalPedidos) : '—'} mut />
        <Kpi l="Ticket médio" v={ticketMedio != null ? fmtBRL(ticketMedio) : '—'} mut />
        <Kpi l="Cancelamentos" v={totalCancelamentos != null ? fmtNum(totalCancelamentos) : '—'} neg={totalCancelamentos != null && totalCancelamentos > 0} />
      </div>
      {metricas.length === 0 && <Vazio>Coleta diária ainda não ativa — nenhuma métrica registrada nesse período.</Vazio>}

      <div className="cv2-card">
        <h3>Reputação</h3>
        {avaliadas.length === 0 ? (
          <Vazio>Coleta diária ainda não ativa — nenhuma avaliação registrada nesse período.</Vazio>
        ) : (
          <>
            <div className="cv2-kpis">
              <Kpi l="Avaliação média" v={avaliacaoMedia.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} d={`${avaliadas.length} snapshots avaliados`} mut />
            </div>
            <div className="cv2-tbl-wrap" style={{ marginTop: 10 }}>
              <table>
                <thead><tr><th>Data</th><th>Avaliação</th></tr></thead>
                <tbody>
                  {avaliadas.slice(0, 10).map(r => (
                    <tr key={r.data}><td>{fmtData(r.data)}</td><td>{Number(r.avaliacao).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      <div className="cv2-card">
        <h3>Diário do agente</h3>
        {diario.length === 0 ? (
          <Vazio>Nenhum evento registrado ainda para esta loja.</Vazio>
        ) : (
          diario.map(ev => (
            <div key={ev.id} style={{ borderBottom: '1px solid var(--line)', padding: '10px 0' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                <span className="cv2-bdg mut">{ev.event_type}</span>
                <span style={{ fontSize: 11.5, color: 'var(--tx2)' }}>{fmtDataHora(ev.ts)}</span>
              </div>
              <div style={{ fontSize: 13, marginTop: 4 }}>{ev.title}</div>
            </div>
          ))
        )}
      </div>

      <div className="cv2-card">
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <h3 style={{ margin: 0 }}>Sugestões pendentes</h3>
          {sugestoes.length > 0 && (
            <button type="button" className="cv2-btn sec" style={{ padding: '6px 14px' }} onClick={() => onNavigate?.('aprovacoes')}>Ver em Aprovações</button>
          )}
        </div>
        {sugestoes.length === 0 ? (
          <Vazio>Nenhuma sugestão pendente.</Vazio>
        ) : (
          sugestoes.map(s => (
            <div key={s.id} style={{ border: '1px solid var(--line)', borderRadius: 6, padding: '10px 14px', marginTop: 10 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                <span className="cv2-bdg warn">{s.channel}</span>
                <span style={{ fontSize: 11.5, color: 'var(--tx2)' }}>{fmtDataHora(s.created_at)}</span>
              </div>
              {s.subject && <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>{s.subject}</div>}
              <div style={{ fontSize: 12.5, color: 'var(--tx2)' }}>{String(s.content || '').slice(0, 180)}{(s.content || '').length > 180 ? '…' : ''}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
