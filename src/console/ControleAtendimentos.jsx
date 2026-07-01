import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase.js';

// ============================================================
// ControleAtendimentos — F4 Dashboard NPS (PRD nps-maia-tratativa-detratores)
// KPIs · Fila de detratores · Desempenho por atendente · Últimas avaliações
// ============================================================

const BRIDGE = import.meta.env.VITE_BRIDGE_URL || 'https://bridge.consultdelivery.com.br';

// ── helpers ──────────────────────────────────────────────────────────────────

function diasAtras(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function calcKpis(rows) {
  const enviadas = rows.filter(r => r.msg_enviada_status != null);
  const respondidas = rows.filter(r => r.nota != null);
  const totalEnv = enviadas.length;
  const totalResp = respondidas.length;
  const taxaResposta = totalEnv > 0 ? Math.round((totalResp / totalEnv) * 100) : 0;
  const taxaSilencio = totalEnv > 0 ? Math.round(((totalEnv - totalResp) / totalEnv) * 100) : 0;

  const promotores = respondidas.filter(r => r.nota >= 9).length;
  const detratores = respondidas.filter(r => r.nota <= 6).length;
  const n = respondidas.length;
  let nps = null;
  if (n >= 30) {
    nps = Math.round((promotores / n) * 100 - (detratores / n) * 100);
  }

  const detratoresTotal = detratores;
  const detratoresTratadosSLA = respondidas.filter(r => {
    if (r.nota > 6) return false;
    if (r.tratativa_status !== 'resolvido') return false;
    if (!r.tratativa_at) return false;
    const diff = new Date(r.tratativa_at) - new Date(r.created_at);
    return diff < 48 * 60 * 60 * 1000;
  }).length;

  return { totalEnviadas: totalEnv, respondidas: totalResp, taxaResposta, taxaSilencio, nps, n, detratoresTotal, detratoresTratadosSLA };
}

function calcAtendentes(rows) {
  const respondidas = rows.filter(r => r.nota != null);
  const mapa = {};
  respondidas.forEach(r => {
    const nome = r.atendente_nome || 'Sem atendente';
    if (!mapa[nome]) mapa[nome] = { nome, notas: [], duracoes: [] };
    mapa[nome].notas.push(r.nota);
    if (r.duracao_minutos != null) mapa[nome].duracoes.push(r.duracao_minutos);
  });
  return Object.values(mapa)
    .map(a => {
      const det = a.notas.filter(n => n <= 6).length;
      const prom = a.notas.filter(n => n >= 9).length;
      const npsVal = a.notas.length >= 3
        ? Math.round((prom / a.notas.length) * 100 - (det / a.notas.length) * 100)
        : null;
      const mediaMin = a.duracoes.length
        ? Math.round(a.duracoes.reduce((s, d) => s + d, 0) / a.duracoes.length)
        : null;
      return { nome: a.nome, qtd: a.notas.length, tempoMedio: mediaMin, nps: npsVal, detratores: det };
    })
    .sort((a, b) => b.qtd - a.qtd);
}

function calcNpsBreakdown(rows) {
  const resp = rows.filter(r => r.nota != null);
  const n = resp.length;
  const prom = resp.filter(r => r.nota >= 9).length;
  const pass = resp.filter(r => r.nota >= 7 && r.nota <= 8).length;
  const det = resp.filter(r => r.nota <= 6).length;
  const dist = Array.from({ length: 11 }, (_, i) => resp.filter(r => r.nota === i).length);
  const pct = x => (n > 0 ? Math.round((x / n) * 100) : 0);
  return { n, prom, pass, det, pctProm: pct(prom), pctPass: pct(pass), pctDet: pct(det), dist };
}

function calcCsat(rows) {
  const resp = rows.filter(r => r.nota != null);
  const enviadas = rows.filter(r => r.msg_enviada_status != null).length;
  const n = resp.length;
  const media = n > 0 ? resp.reduce((s, r) => s + r.nota, 0) / n : null;
  const dist = Array.from({ length: 5 }, (_, i) => resp.filter(r => r.nota === i + 1).length);
  const taxaResposta = enviadas > 0 ? Math.round((n / enviadas) * 100) : 0;
  return { n, enviadas, media, dist, taxaResposta };
}

function calcTempo(npsRows, csatRows) {
  const all = [...npsRows, ...csatRows];
  const durs = all.filter(r => r.duracao_minutos != null).map(r => r.duracao_minutos);
  const duracaoMedia = durs.length ? Math.round(durs.reduce((s, d) => s + d, 0) / durs.length) : null;
  const respTimes = all
    .filter(r => r.responded_at && r.created_at)
    .map(r => (new Date(r.responded_at) - new Date(r.created_at)) / 60000)
    .filter(m => m >= 0);
  const tempoResposta = respTimes.length ? Math.round(respTimes.reduce((s, m) => s + m, 0) / respTimes.length) : null;
  return { duracaoMedia, tempoResposta };
}

function calcSaudeEnvio(npsRows, csatRows) {
  const all = [...npsRows, ...csatRows];
  return {
    enviados:  all.filter(r => r.msg_enviada_status === 'ok').length,
    falhas:    all.filter(r => r.msg_enviada_status === 'falhou').length,
    pendentes: all.filter(r => r.msg_enviada_status == null).length,
  };
}

function DistBar({ label, valor, max, cor }) {
  const pct = max > 0 ? Math.round((valor / max) * 100) : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
      <span style={{ width: 24, fontSize: 11, color: 'var(--tx2)', textAlign: 'right' }}>{label}</span>
      <div style={{ flex: 1, background: '#f1f5f9', borderRadius: 4, height: 14, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: cor || 'var(--accent,#2563eb)' }} />
      </div>
      <span style={{ width: 28, fontSize: 11, color: 'var(--tx2)' }}>{valor}</span>
    </div>
  );
}

function corNota(nota) {
  if (nota == null) return 'var(--tx2)';
  if (nota >= 9) return 'var(--green)';
  if (nota >= 7) return 'var(--warn, #f59e0b)';
  return 'var(--red)';
}

function fmtData(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function fmtMin(min) {
  if (min == null) return '—';
  if (min < 60) return `${min}min`;
  return `${Math.floor(min / 60)}h${min % 60 > 0 ? String(min % 60).padStart(2, '0') + 'min' : ''}`;
}

// ── subcomponentes ────────────────────────────────────────────────────────────

function KpiCard({ label, valor, detalhe, cor }) {
  return (
    <div className="cv2-kpi">
      <div className="l">{label}</div>
      <div className="v" style={cor ? { color: cor } : {}}>{valor ?? '—'}</div>
      {detalhe && <div className="d mut">{detalhe}</div>}
    </div>
  );
}

function StatusBadge({ status }) {
  const MAP = {
    pendente: { label: 'Pendente', bg: '#fef3c7', color: '#92400e' },
    em_andamento: { label: 'Em andamento', bg: '#dbeafe', color: '#1e40af' },
    resolvido: { label: 'Resolvido', bg: '#d1fae5', color: '#065f46' },
  };
  const s = MAP[status] || MAP.pendente;
  return (
    <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 7px', borderRadius: 4, background: s.bg, color: s.color }}>
      {s.label}
    </span>
  );
}

function ModalTratativa({ item, onSalvar, onFechar, salvando, erroModal }) {
  const [status, setStatus] = useState(item.tratativa_status || 'em_andamento');
  const [obs, setObs] = useState(item.tratativa_obs || '');

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#fff', borderRadius: 10, padding: 24, width: 420, maxWidth: '95vw', boxShadow: '0 8px 32px rgba(0,0,0,.18)' }}>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>Tratar detrator</div>
        <div style={{ fontSize: 12, color: 'var(--tx2)', marginBottom: 16 }}>
          {item.contact_nome || item.contact_identifier || '—'} · Nota {item.nota}
        </div>

        <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Status</label>
        <select
          value={status}
          onChange={e => setStatus(e.target.value)}
          style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid var(--line)', fontSize: 13, marginBottom: 12 }}
        >
          <option value="em_andamento">Em andamento</option>
          <option value="resolvido">Resolvido</option>
        </select>

        <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Observação (opcional)</label>
        <textarea
          value={obs}
          onChange={e => setObs(e.target.value)}
          rows={3}
          placeholder="O que foi feito, próximo passo…"
          style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid var(--line)', fontSize: 13, resize: 'vertical', marginBottom: 16 }}
        />

        {erroModal && (
          <div style={{ background: '#fee2e2', color: '#991b1b', borderRadius: 6, padding: '7px 10px', fontSize: 12, marginBottom: 12 }}>{erroModal}</div>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onFechar} disabled={salvando}
            style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid var(--line)', background: '#f9fafb', cursor: 'pointer', fontSize: 13 }}>
            Cancelar
          </button>
          <button onClick={() => onSalvar(item.id, status, obs)} disabled={salvando}
            style={{ padding: '6px 14px', borderRadius: 6, border: 'none', background: 'var(--accent, #2563eb)', color: '#fff', fontWeight: 600, cursor: salvando ? 'not-allowed' : 'pointer', fontSize: 13 }}>
            {salvando ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── período ───────────────────────────────────────────────────────────────────

const PERIODOS = [
  { label: '7 dias', value: '7d' },
  { label: '30 dias', value: '30d' },
  { label: 'Personalizado', value: 'custom' },
];

// ── componente principal ──────────────────────────────────────────────────────

export default function ControleAtendimentos({ tenantDbId }) {
  const [periodo, setPeriodo] = useState('30d');
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  const [rows, setRows] = useState([]);
  const [csatRows, setCsatRows] = useState([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState(null);
  const [modalItem, setModalItem] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [erroModal, setErroModal] = useState(null);

  const buscarDados = useCallback(async () => {
    if (!tenantDbId) return;

    let desde;
    if (periodo === 'custom') {
      if (!dataInicio) return;
      desde = new Date(dataInicio).toISOString();
    } else {
      desde = diasAtras(periodo === '7d' ? 7 : 30);
    }

    let fimISO = null;
    if (periodo === 'custom' && dataFim) {
      const fim = new Date(dataFim);
      fim.setHours(23, 59, 59, 999);
      fimISO = fim.toISOString();
    }

    let qNps = supabase
      .from('nps_avaliacoes')
      .select('id, contact_identifier, contact_nome, nota, comentario, status, tratativa_status, tratativa_obs, tratativa_at, created_at, responded_at, msg_enviada_status, atendente_nome, duracao_minutos, assigned_to')
      .eq('tenant_id', tenantDbId)
      .gte('created_at', desde)
      .order('created_at', { ascending: false })
      .limit(500);
    let qCsat = supabase
      .from('atendimento_avaliacoes')
      .select('id, nome_cliente, nota, status, created_at, responded_at, msg_enviada_status, atendente_nome, duracao_minutos')
      .eq('tenant_id', tenantDbId)
      .gte('created_at', desde)
      .order('created_at', { ascending: false })
      .limit(500);
    if (fimISO) { qNps = qNps.lte('created_at', fimISO); qCsat = qCsat.lte('created_at', fimISO); }

    setCarregando(true);
    setErro(null);
    try {
      const [resNps, resCsat] = await Promise.all([qNps, qCsat]);
      if (resNps.error) throw resNps.error;
      setRows(resNps.data || []);
      setCsatRows(resCsat.error ? [] : (resCsat.data || []));
    } catch (e) {
      setErro(e.message);
    } finally {
      setCarregando(false);
    }
  }, [tenantDbId, periodo, dataInicio, dataFim]);

  useEffect(() => { buscarDados(); }, [buscarDados]);

  async function salvarTratativa(id, status, obs) {
    setSalvando(true);
    setErroModal(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setErroModal('Sessão expirada. Faça login novamente.');
        return;
      }
      const resp = await fetch(`${BRIDGE}/api/nps-avaliacoes/${id}/tratativa`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ status, obs, tenant_id: tenantDbId }),
      });
      if (!resp.ok) {
        const e = await resp.json().catch(() => ({}));
        throw new Error(e.error || 'Erro ao salvar');
      }
      setModalItem(null);
      setErroModal(null);
      setRows(prev => prev.map(r => r.id === id
        ? { ...r, tratativa_status: status, tratativa_obs: obs, tratativa_at: new Date().toISOString() }
        : r
      ));
    } catch (e) {
      setErroModal('Erro ao salvar: ' + e.message);
    } finally {
      setSalvando(false);
    }
  }

  const kpis = calcKpis(rows);
  const atendentes = calcAtendentes(rows);
  const npsBd = calcNpsBreakdown(rows);
  const csat = calcCsat(csatRows);
  const tempo = calcTempo(rows, csatRows);
  const saude = calcSaudeEnvio(rows, csatRows);
  const maxNpsDist = Math.max(1, ...npsBd.dist);
  const maxCsatDist = Math.max(1, ...csat.dist);
  const detratoresFila = rows
    .filter(r => r.nota != null && r.nota <= 6 && r.tratativa_status !== 'resolvido')
    .concat(rows.filter(r => r.nota != null && r.nota <= 6 && r.tratativa_status === 'resolvido'));
  const ultimasAvaliacoes = rows.filter(r => r.nota != null).slice(0, 50);

  return (
    <div className="cv2-page" style={{ padding: '20px 24px', maxWidth: 1100 }}>
      {/* cabeçalho */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 18 }}>Controle de Atendimentos NPS</div>
          <div style={{ fontSize: 12, color: 'var(--tx2)', marginTop: 2 }}>KPIs · Fila de detratores · Desempenho por atendente</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {PERIODOS.map(p => (
            <button key={p.value}
              onClick={() => setPeriodo(p.value)}
              style={{
                padding: '5px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                border: periodo === p.value ? 'none' : '1px solid var(--line)',
                background: periodo === p.value ? 'var(--accent, #2563eb)' : '#f9fafb',
                color: periodo === p.value ? '#fff' : 'var(--tx)',
              }}>
              {p.label}
            </button>
          ))}
          {periodo === 'custom' && (
            <>
              <input type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)}
                style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid var(--line)', fontSize: 12 }} />
              <span style={{ fontSize: 12 }}>até</span>
              <input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)}
                style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid var(--line)', fontSize: 12 }} />
              <button onClick={buscarDados} style={{ padding: '5px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: 'none', background: 'var(--accent, #2563eb)', color: '#fff' }}>
                Buscar
              </button>
            </>
          )}
        </div>
      </div>

      {erro && <div style={{ background: '#fee2e2', color: '#991b1b', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13 }}>{erro}</div>}

      {/* ── Seção 1: KPIs ── */}
      <section style={{ marginBottom: 28 }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--tx2)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '.4px' }}>Métricas do período</div>
        {carregando ? (
          <div style={{ color: 'var(--tx2)', fontSize: 13 }}>Carregando…</div>
        ) : (
          <div className="cv2-kpi-row" style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <KpiCard label="Total enviadas" valor={kpis.totalEnviadas} detalhe="msg_enviada_status preenchido" />
            <KpiCard label="Respondidas" valor={kpis.respondidas} />
            <KpiCard label="Taxa de resposta" valor={`${kpis.taxaResposta}%`} detalhe={`${kpis.taxaSilencio}% silêncio`} />
            <KpiCard
              label="NPS (score)"
              valor={kpis.nps !== null ? (kpis.nps > 0 ? `+${kpis.nps}` : String(kpis.nps)) : `Amostra insuf. (N=${kpis.n})`}
              cor={kpis.nps !== null ? (kpis.nps >= 50 ? 'var(--green)' : kpis.nps >= 0 ? 'var(--warn,#f59e0b)' : 'var(--red)') : 'var(--tx2)'}
              detalhe={kpis.n >= 30 ? `N=${kpis.n} respondidas` : 'Mínimo 30 respostas'}
            />
            <KpiCard label="Detratores (nota ≤6)" valor={kpis.detratoresTotal} cor={kpis.detratoresTotal > 0 ? 'var(--red)' : undefined} />
            <KpiCard label="Tratados em SLA" valor={kpis.detratoresTratadosSLA} detalhe="resolvido em < 48h" cor={kpis.detratoresTratadosSLA > 0 ? 'var(--green)' : undefined} />
          </div>
        )}
      </section>

      {/* ── NPS detalhado ── */}
      {!carregando && (
      <section style={{ marginBottom: 28 }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--tx2)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '.4px' }}>NPS detalhado</div>
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div className="cv2-kpi-row" style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <KpiCard label="Promotores (9–10)" valor={`${npsBd.pctProm}%`} detalhe={`${npsBd.prom} respostas`} cor="var(--green)" />
            <KpiCard label="Passivos (7–8)" valor={`${npsBd.pctPass}%`} detalhe={`${npsBd.pass} respostas`} cor="var(--warn,#f59e0b)" />
            <KpiCard label="Detratores (0–6)" valor={`${npsBd.pctDet}%`} detalhe={`${npsBd.det} respostas`} cor="var(--red)" />
          </div>
          <div style={{ flex: 1, minWidth: 260 }}>
            <div style={{ fontSize: 11, color: 'var(--tx2)', marginBottom: 6 }}>Distribuição das notas (0–10)</div>
            {npsBd.dist.map((v, i) => (
              <DistBar key={i} label={String(i)} valor={v} max={maxNpsDist} cor={i >= 9 ? 'var(--green)' : i >= 7 ? 'var(--warn,#f59e0b)' : 'var(--red)'} />
            ))}
          </div>
        </div>
      </section>
      )}

      {/* ── CSAT detalhado ── */}
      {!carregando && (
      <section style={{ marginBottom: 28 }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--tx2)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '.4px' }}>CSAT — Avaliação de atendimento</div>
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div className="cv2-kpi-row" style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <KpiCard label="Média (1–5)" valor={csat.media != null ? csat.media.toFixed(1) : '—'} cor={csat.media != null ? (csat.media >= 4 ? 'var(--green)' : csat.media >= 3 ? 'var(--warn,#f59e0b)' : 'var(--red)') : undefined} />
            <KpiCard label="Respondidas" valor={csat.n} detalhe={`${csat.enviadas} enviadas`} />
            <KpiCard label="Taxa de resposta" valor={`${csat.taxaResposta}%`} />
          </div>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ fontSize: 11, color: 'var(--tx2)', marginBottom: 6 }}>Distribuição das notas (1–5)</div>
            {csat.dist.map((v, i) => (
              <DistBar key={i} label={`${i + 1}★`} valor={v} max={maxCsatDist} cor={i + 1 >= 4 ? 'var(--green)' : i + 1 >= 3 ? 'var(--warn,#f59e0b)' : 'var(--red)'} />
            ))}
          </div>
        </div>
      </section>
      )}

      {/* ── Tempo de atendimento & saúde de envio ── */}
      {!carregando && (
      <section style={{ marginBottom: 28 }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--tx2)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '.4px' }}>Tempo de atendimento & envio</div>
        <div className="cv2-kpi-row" style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <KpiCard label="Duração média" valor={fmtMin(tempo.duracaoMedia)} detalhe="abertura → finalização" />
          <KpiCard label="Tempo médio p/ responder" valor={fmtMin(tempo.tempoResposta)} detalhe="envio → resposta" />
          <KpiCard label="Enviados (NPS+CSAT)" valor={saude.enviados} />
          <KpiCard label="Falhas de envio" valor={saude.falhas} cor={saude.falhas > 0 ? 'var(--red)' : undefined} />
          <KpiCard label="Pendentes" valor={saude.pendentes} />
        </div>
      </section>
      )}

      {/* ── Seção 2: Fila de detratores ── */}
      <section style={{ marginBottom: 28 }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--tx2)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '.4px' }}>
          Fila de detratores ({detratoresFila.length})
        </div>
        {carregando ? (
          <div style={{ color: 'var(--tx2)', fontSize: 13 }}>Carregando…</div>
        ) : detratoresFila.length === 0 ? (
          <div style={{ color: 'var(--tx2)', fontSize: 13, padding: '12px 0' }}>Nenhum detrator no período.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--line)', textAlign: 'left' }}>
                  <th style={{ padding: '6px 10px', fontWeight: 600, color: 'var(--tx2)', fontSize: 11 }}>Contato</th>
                  <th style={{ padding: '6px 10px', fontWeight: 600, color: 'var(--tx2)', fontSize: 11 }}>Atendente</th>
                  <th style={{ padding: '6px 10px', fontWeight: 600, color: 'var(--tx2)', fontSize: 11 }}>Duração</th>
                  <th style={{ padding: '6px 10px', fontWeight: 600, color: 'var(--tx2)', fontSize: 11 }}>Nota</th>
                  <th style={{ padding: '6px 10px', fontWeight: 600, color: 'var(--tx2)', fontSize: 11 }}>Comentário</th>
                  <th style={{ padding: '6px 10px', fontWeight: 600, color: 'var(--tx2)', fontSize: 11 }}>Status tratativa</th>
                  <th style={{ padding: '6px 10px', fontWeight: 600, color: 'var(--tx2)', fontSize: 11 }}>Ação</th>
                </tr>
              </thead>
              <tbody>
                {detratoresFila.map(r => (
                  <tr key={r.id} style={{ borderBottom: '1px solid var(--line)', background: r.tratativa_status === 'resolvido' ? 'transparent' : '#fff7ed' }}>
                    <td style={{ padding: '8px 10px', fontWeight: 500 }}>{r.contact_nome || r.contact_identifier || '—'}</td>
                    <td style={{ padding: '8px 10px', color: 'var(--tx2)' }}>{r.atendente_nome || 'Sem atendente'}</td>
                    <td style={{ padding: '8px 10px', color: 'var(--tx2)' }}>{fmtMin(r.duracao_minutos)}</td>
                    <td style={{ padding: '8px 10px', fontWeight: 700, color: corNota(r.nota) }}>{r.nota ?? '—'}</td>
                    <td style={{ padding: '8px 10px', color: 'var(--tx2)', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.comentario || '—'}</td>
                    <td style={{ padding: '8px 10px' }}><StatusBadge status={r.tratativa_status || 'pendente'} /></td>
                    <td style={{ padding: '8px 10px' }}>
                      {r.tratativa_status !== 'resolvido' && (
                        <button onClick={() => setModalItem(r)}
                          style={{ padding: '4px 10px', borderRadius: 5, border: '1px solid var(--line)', background: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                          Tratar
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Seção 3: Desempenho por atendente ── */}
      <section style={{ marginBottom: 28 }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--tx2)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '.4px' }}>Desempenho por atendente</div>
        {carregando ? (
          <div style={{ color: 'var(--tx2)', fontSize: 13 }}>Carregando…</div>
        ) : atendentes.length === 0 ? (
          <div style={{ color: 'var(--tx2)', fontSize: 13, padding: '12px 0' }}>Sem dados de atendente no período.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--line)', textAlign: 'left' }}>
                  <th style={{ padding: '6px 10px', fontWeight: 600, color: 'var(--tx2)', fontSize: 11 }}>Atendente</th>
                  <th style={{ padding: '6px 10px', fontWeight: 600, color: 'var(--tx2)', fontSize: 11 }}>Avaliações</th>
                  <th style={{ padding: '6px 10px', fontWeight: 600, color: 'var(--tx2)', fontSize: 11 }}>Tempo médio</th>
                  <th style={{ padding: '6px 10px', fontWeight: 600, color: 'var(--tx2)', fontSize: 11 }}>NPS médio</th>
                  <th style={{ padding: '6px 10px', fontWeight: 600, color: 'var(--tx2)', fontSize: 11 }}>Detratores</th>
                </tr>
              </thead>
              <tbody>
                {atendentes.map(a => (
                  <tr key={a.nome} style={{ borderBottom: '1px solid var(--line)' }}>
                    <td style={{ padding: '8px 10px', fontWeight: 500 }}>{a.nome}</td>
                    <td style={{ padding: '8px 10px' }}>{a.qtd}</td>
                    <td style={{ padding: '8px 10px', color: 'var(--tx2)' }}>{fmtMin(a.tempoMedio)}</td>
                    <td style={{ padding: '8px 10px', fontWeight: 600 }}>
                      {a.nps !== null
                        ? <span style={{ color: a.nps >= 50 ? 'var(--green)' : a.nps >= 0 ? 'var(--warn,#f59e0b)' : 'var(--red)' }}>{a.nps > 0 ? `+${a.nps}` : a.nps}</span>
                        : <span style={{ color: 'var(--tx2)', fontWeight: 400, fontSize: 11 }}>N insuf.</span>}
                    </td>
                    <td style={{ padding: '8px 10px', color: a.detratores > 0 ? 'var(--red)' : 'var(--tx2)' }}>{a.detratores}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Seção 4: Últimas avaliações ── */}
      <section style={{ marginBottom: 28 }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--tx2)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '.4px' }}>
          Últimas respostas de NPS ({ultimasAvaliacoes.length})
        </div>
        {carregando ? (
          <div style={{ color: 'var(--tx2)', fontSize: 13 }}>Carregando…</div>
        ) : ultimasAvaliacoes.length === 0 ? (
          <div style={{ color: 'var(--tx2)', fontSize: 13, padding: '12px 0' }}>Nenhuma avaliação respondida no período.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--line)', textAlign: 'left' }}>
                  <th style={{ padding: '6px 10px', fontWeight: 600, color: 'var(--tx2)', fontSize: 11 }}>Data</th>
                  <th style={{ padding: '6px 10px', fontWeight: 600, color: 'var(--tx2)', fontSize: 11 }}>Contato</th>
                  <th style={{ padding: '6px 10px', fontWeight: 600, color: 'var(--tx2)', fontSize: 11 }}>Atendente</th>
                  <th style={{ padding: '6px 10px', fontWeight: 600, color: 'var(--tx2)', fontSize: 11 }}>Duração</th>
                  <th style={{ padding: '6px 10px', fontWeight: 600, color: 'var(--tx2)', fontSize: 11 }}>Nota</th>
                  <th style={{ padding: '6px 10px', fontWeight: 600, color: 'var(--tx2)', fontSize: 11 }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {ultimasAvaliacoes.map(r => (
                  <tr key={r.id} style={{ borderBottom: '1px solid var(--line)' }}>
                    <td style={{ padding: '8px 10px', color: 'var(--tx2)', whiteSpace: 'nowrap' }}>{fmtData(r.created_at)}</td>
                    <td style={{ padding: '8px 10px', fontWeight: 500 }}>{r.contact_nome || r.contact_identifier || '—'}</td>
                    <td style={{ padding: '8px 10px', color: 'var(--tx2)' }}>{r.atendente_nome || '—'}</td>
                    <td style={{ padding: '8px 10px', color: 'var(--tx2)' }}>{fmtMin(r.duracao_minutos)}</td>
                    <td style={{ padding: '8px 10px', fontWeight: 700, color: corNota(r.nota) }}>{r.nota ?? '—'}</td>
                    <td style={{ padding: '8px 10px' }}><StatusBadge status={r.tratativa_status || 'pendente'} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Modal de tratativa */}
      {modalItem && (
        <ModalTratativa
          item={modalItem}
          onSalvar={salvarTratativa}
          onFechar={() => { setModalItem(null); setErroModal(null); }}
          salvando={salvando}
          erroModal={erroModal}
        />
      )}
    </div>
  );
}
