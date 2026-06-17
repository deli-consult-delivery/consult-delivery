import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase.js';

const BRIDGE = import.meta.env.VITE_BRIDGE_URL || 'https://bridge.consultdelivery.com.br';

function fmtBRL(v) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
}

const STATUS_MAP = {
  aberto:     { label: 'Aberto',     cls: 'cv2-bdg' },
  negociando: { label: 'Negociando', cls: 'cv2-bdg' },
  escalonado: { label: 'Escalonado', cls: 'cv2-bdg' },
};

const DIAS_OPTIONS = [
  { value: '', label: 'Todos' },
  { value: '7',  label: '7+ dias' },
  { value: '14', label: '14+ dias' },
  { value: '30', label: '30+ dias' },
  { value: '60', label: '60+ dias' },
];

const STATUS_OPTIONS = [
  { value: '', label: 'Todos status' },
  { value: 'aberto',     label: 'Aberto' },
  { value: 'negociando', label: 'Negociando' },
  { value: 'escalonado', label: 'Escalonado' },
];

export default function Inadimplentes({ tenantDbId }) {
  const [rows, setRows] = useState([]);
  const [kpis, setKpis] = useState({ total_devido: 0, qtd: 0, negociando: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filterDias, setFilterDias] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterValorMin, setFilterValorMin] = useState('');
  const [notifLoading, setNotifLoading] = useState({});
  const [notifMsg, setNotifMsg] = useState({});

  const load = useCallback(async () => {
    if (!tenantDbId) return;
    setLoading(true);
    setError(null);
    try {
      let query = supabase
        .from('cora_cobrancas')
        .select('id,customer_name,customer_phone,customer_whatsapp,valor_atual,data_vencimento,status,created_at')
        .eq('tenant_id', tenantDbId)
        .order('data_vencimento', { ascending: true });

      query = filterStatus
        ? query.eq('status', filterStatus)
        : query.in('status', ['aberto', 'negociando', 'escalonado']);

      const { data, error: qErr } = await query;
      if (qErr) throw new Error(qErr.message);

      const now = Date.now();
      let result = (data || []).map(r => ({
        ...r,
        dias_atraso: r.data_vencimento
          ? Math.max(0, Math.floor((now - new Date(r.data_vencimento + 'T00:00:00').getTime()) / 86400000))
          : 0,
      }));
      if (filterDias)     result = result.filter(r => r.dias_atraso >= parseInt(filterDias, 10));
      if (filterValorMin) result = result.filter(r => (r.valor_atual || 0) >= parseFloat(filterValorMin));

      const total_devido = result.reduce((s, r) => s + (parseFloat(r.valor_atual) || 0), 0);
      const negociando = result.filter(r => r.status === 'negociando').length;
      setRows(result);
      setKpis({ total_devido, qtd: result.length, negociando });
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [tenantDbId, filterDias, filterStatus, filterValorMin]);

  useEffect(() => { load(); }, [load]);

  async function notificar(id, nome) {
    setNotifLoading(p => ({ ...p, [id]: true }));
    setNotifMsg(p => ({ ...p, [id]: null }));
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const resp = await fetch(`${BRIDGE}/api/inadimplentes/${id}/notificar`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token}`,
          'x-tenant-id': tenantDbId,
        },
        body: JSON.stringify({}),
      });
      const json = await resp.json();
      if (!resp.ok) throw new Error(json.error || 'Falha ao notificar');
      setNotifMsg(p => ({ ...p, [id]: { ok: true, text: `WhatsApp enviado para ${nome}` } }));
    } catch (e) {
      setNotifMsg(p => ({ ...p, [id]: { ok: false, text: e.message } }));
    } finally {
      setNotifLoading(p => ({ ...p, [id]: false }));
    }
  }

  const taxaCob = kpis.qtd > 0 ? Math.round((kpis.negociando / kpis.qtd) * 100) : 0;

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: 'var(--tx)' }}>Inadimplentes</h2>
        <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--tx2)' }}>Clientes com cobranças em aberto ou em negociação</p>
      </div>

      <div className="cv2-kpis" style={{ marginBottom: 20 }}>
        <div className="cv2-kpi" style={{ borderLeft: '3px solid var(--red)' }}>
          <span className="cv2-kpi-label">Total Devido</span>
          <span className="cv2-kpi-val" style={{ color: 'var(--red)' }}>{fmtBRL(kpis.total_devido)}</span>
        </div>
        <div className="cv2-kpi">
          <span className="cv2-kpi-label">Qtd Inadimplentes</span>
          <span className="cv2-kpi-val">{kpis.qtd}</span>
        </div>
        <div className="cv2-kpi">
          <span className="cv2-kpi-label">Em Negociação</span>
          <span className="cv2-kpi-val">{taxaCob}%</span>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16, alignItems: 'center' }}>
        <select
          className="cv2-input"
          value={filterDias}
          onChange={e => setFilterDias(e.target.value)}
          style={{ width: 130 }}
        >
          {DIAS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select
          className="cv2-input"
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          style={{ width: 150 }}
        >
          {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <input
          type="number"
          className="cv2-input"
          placeholder="Valor mínimo (R$)"
          value={filterValorMin}
          onChange={e => setFilterValorMin(e.target.value)}
          style={{ width: 160 }}
        />
        <button className="cv2-btn sec" onClick={load} disabled={loading}>
          {loading ? 'Carregando…' : 'Aplicar'}
        </button>
      </div>

      {error && (
        <div className="cv2-card" style={{ background: '#FEE2E2', color: '#991B1B', marginBottom: 16, fontSize: 13 }}>
          Erro: {error}
        </div>
      )}

      <div className="cv2-card" style={{ padding: 0, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--panel)', background: 'var(--panel)' }}>
              {['Cliente', 'Valor Devido', 'Dias Atraso', 'Vencimento', 'Status', 'Ações'].map(h => (
                <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--tx2)', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && rows.length === 0 && (
              <tr><td colSpan={6} style={{ textAlign: 'center', padding: 40, color: 'var(--tx2)' }}>Carregando…</td></tr>
            )}
            {!loading && rows.length === 0 && !error && (
              <tr><td colSpan={6} style={{ textAlign: 'center', padding: 40, color: 'var(--tx2)' }}>
                Nenhum inadimplente encontrado com os filtros atuais.
              </td></tr>
            )}
            {rows.map((row, i) => {
              const st = STATUS_MAP[row.status] || { label: row.status, cls: 'cv2-bdg' };
              const msg = notifMsg[row.id];
              return (
                <tr key={row.id} style={{ borderBottom: '1px solid var(--panel)', background: i % 2 === 1 ? 'var(--panel)' : 'transparent' }}>
                  <td style={{ padding: '12px 14px', verticalAlign: 'middle' }}>
                    <div style={{ fontWeight: 600, color: 'var(--tx)' }}>{row.customer_name}</div>
                    <div style={{ fontSize: 11, color: 'var(--tx2)' }}>{row.customer_whatsapp || row.customer_phone || '—'}</div>
                  </td>
                  <td style={{ padding: '12px 14px', verticalAlign: 'middle', fontWeight: 700, color: 'var(--red)' }}>
                    {fmtBRL(row.valor_atual)}
                  </td>
                  <td style={{ padding: '12px 14px', verticalAlign: 'middle' }}>
                    <span style={{
                      background: row.dias_atraso >= 60 ? '#FEE2E2' : row.dias_atraso >= 30 ? '#FEF3C7' : 'var(--panel)',
                      color: row.dias_atraso >= 60 ? '#991B1B' : row.dias_atraso >= 30 ? '#92400E' : 'var(--tx)',
                      borderRadius: 99, padding: '2px 8px', fontWeight: 600, fontSize: 12,
                    }}>
                      {row.dias_atraso}d
                    </span>
                  </td>
                  <td style={{ padding: '12px 14px', verticalAlign: 'middle', color: 'var(--tx2)' }}>
                    {row.data_vencimento ? new Date(row.data_vencimento + 'T00:00:00').toLocaleDateString('pt-BR') : '—'}
                  </td>
                  <td style={{ padding: '12px 14px', verticalAlign: 'middle' }}>
                    <span className={st.cls} style={{
                      background: row.status === 'negociando' ? '#DBEAFE' : row.status === 'escalonado' ? '#FCE7F3' : '#FEF3C7',
                      color: row.status === 'negociando' ? '#1E40AF' : row.status === 'escalonado' ? '#9D174D' : '#92400E',
                    }}>
                      {st.label}
                    </span>
                  </td>
                  <td style={{ padding: '12px 14px', verticalAlign: 'middle' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <button
                        className="cv2-btn"
                        onClick={() => notificar(row.id, row.customer_name)}
                        disabled={notifLoading[row.id]}
                        style={{ background: notifLoading[row.id] ? undefined : '#25D366', fontSize: 12, padding: '5px 12px', whiteSpace: 'nowrap' }}
                      >
                        {notifLoading[row.id] ? 'Enviando…' : '💬 Cobrar via WhatsApp'}
                      </button>
                      {msg && (
                        <span style={{ fontSize: 11, color: msg.ok ? '#059669' : '#DC2626' }}>{msg.text}</span>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 10, fontSize: 12, color: 'var(--tx2)' }}>
        {rows.length} registro{rows.length !== 1 ? 's' : ''} · Fonte: cora_cobrancas
      </div>
    </div>
  );
}
