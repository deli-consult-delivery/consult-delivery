import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase.js';

const BRIDGE = import.meta.env.VITE_BRIDGE_URL || 'http://localhost:3001';

function fmtBRL(v) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
}

function badgeStatus(status) {
  const map = {
    aberto:      { bg: '#FEF3C7', color: '#92400E', label: 'Aberto' },
    negociando:  { bg: '#DBEAFE', color: '#1E40AF', label: 'Negociando' },
    escalonado:  { bg: '#FCE7F3', color: '#9D174D', label: 'Escalonado' },
  };
  return map[status] || { bg: '#F3F4F6', color: '#374151', label: status };
}

const DIAS_OPTIONS = [
  { value: '', label: 'Todos' },
  { value: '7', label: '7+ dias' },
  { value: '14', label: '14+ dias' },
  { value: '30', label: '30+ dias' },
  { value: '60', label: '60+ dias' },
];

const STATUS_OPTIONS = [
  { value: '', label: 'Todos status' },
  { value: 'aberto', label: 'Aberto' },
  { value: 'negociando', label: 'Negociando' },
  { value: 'escalonado', label: 'Escalonado' },
];

export default function InadimplentesScreen({ tenantDbId, userId }) {
  const [rows, setRows] = useState([]);
  const [kpis, setKpis] = useState({ total_devido: 0, qtd: 0 });
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
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      const params = new URLSearchParams();
      if (filterDias) params.set('dias_atraso', filterDias);
      if (filterStatus) params.set('status', filterStatus);
      if (filterValorMin) params.set('valor_min', filterValorMin);

      const url = `${BRIDGE}/api/inadimplentes${params.toString() ? '?' + params : ''}`;
      const resp = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          'x-tenant-id': tenantDbId,
        },
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Erro ao carregar inadimplentes');
      setRows(data.rows || []);
      setKpis(data.kpis || { total_devido: 0, qtd: 0 });
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
      const token = session?.access_token;
      const resp = await fetch(`${BRIDGE}/api/inadimplentes/${id}/notificar`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'x-tenant-id': tenantDbId,
        },
        body: JSON.stringify({}),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Falha ao notificar');
      setNotifMsg(p => ({ ...p, [id]: { ok: true, text: `WhatsApp enviado para ${nome}` } }));
    } catch (e) {
      setNotifMsg(p => ({ ...p, [id]: { ok: false, text: e.message } }));
    } finally {
      setNotifLoading(p => ({ ...p, [id]: false }));
    }
  }

  const taxaCob = kpis.qtd > 0
    ? Math.round(((rows.filter(r => r.status === 'negociando').length) / kpis.qtd) * 100)
    : 0;

  return (
    <div style={{ padding: '24px', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Inadimplentes</h1>
        <p style={{ fontSize: 13, color: 'var(--text-muted, #6B7280)', margin: '4px 0 0' }}>
          Clientes com cobranças em aberto ou em negociação
        </p>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 24 }}>
        <KpiCard label="Total Devido" value={fmtBRL(kpis.total_devido)} accent="#B70C00" />
        <KpiCard label="Qtd Inadimplentes" value={kpis.qtd} accent="#D97706" />
        <KpiCard label="Em Negociação" value={`${taxaCob}%`} accent="#2563EB" />
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16, alignItems: 'center' }}>
        <select
          value={filterDias}
          onChange={e => setFilterDias(e.target.value)}
          style={selectStyle}
        >
          {DIAS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>

        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          style={selectStyle}
        >
          {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>

        <input
          type="number"
          placeholder="Valor mínimo (R$)"
          value={filterValorMin}
          onChange={e => setFilterValorMin(e.target.value)}
          style={{ ...selectStyle, width: 160 }}
        />

        <button onClick={load} style={btnSecondaryStyle} disabled={loading}>
          {loading ? 'Carregando…' : 'Aplicar'}
        </button>
      </div>

      {error && (
        <div style={{ background: '#FEE2E2', color: '#991B1B', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13 }}>
          Erro: {error}
        </div>
      )}

      {/* Table */}
      <div style={{ background: 'var(--card-bg, #fff)', borderRadius: 12, border: '1px solid var(--border, #E5E7EB)', overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border, #E5E7EB)', background: 'var(--surface, #F9FAFB)' }}>
              <Th>Cliente</Th>
              <Th>Valor Devido</Th>
              <Th>Dias em Atraso</Th>
              <Th>Vencimento</Th>
              <Th>Status</Th>
              <Th>Ações</Th>
            </tr>
          </thead>
          <tbody>
            {loading && rows.length === 0 && (
              <tr><td colSpan={6} style={{ textAlign: 'center', padding: 40, color: '#9CA3AF' }}>Carregando…</td></tr>
            )}
            {!loading && rows.length === 0 && !error && (
              <tr><td colSpan={6} style={{ textAlign: 'center', padding: 40, color: '#9CA3AF' }}>
                Nenhum inadimplente encontrado com os filtros atuais.
              </td></tr>
            )}
            {rows.map((row, i) => {
              const badge = badgeStatus(row.status);
              const msg = notifMsg[row.id];
              return (
                <tr key={row.id} style={{ borderBottom: '1px solid var(--border, #F3F4F6)', background: i % 2 === 0 ? 'transparent' : 'var(--surface, #F9FAFB)' }}>
                  <td style={tdStyle}>
                    <div style={{ fontWeight: 600 }}>{row.customer_name}</div>
                    <div style={{ fontSize: 11, color: '#9CA3AF' }}>{row.customer_whatsapp || row.customer_phone || '—'}</div>
                  </td>
                  <td style={{ ...tdStyle, fontWeight: 700, color: '#B70C00' }}>
                    {fmtBRL(row.valor_atual)}
                  </td>
                  <td style={tdStyle}>
                    <span style={{
                      background: row.dias_atraso >= 60 ? '#FEE2E2' : row.dias_atraso >= 30 ? '#FEF3C7' : '#F3F4F6',
                      color: row.dias_atraso >= 60 ? '#991B1B' : row.dias_atraso >= 30 ? '#92400E' : '#374151',
                      borderRadius: 99, padding: '2px 8px', fontWeight: 600,
                    }}>
                      {row.dias_atraso}d
                    </span>
                  </td>
                  <td style={{ ...tdStyle, color: '#6B7280' }}>
                    {row.data_vencimento ? new Date(row.data_vencimento + 'T00:00:00').toLocaleDateString('pt-BR') : '—'}
                  </td>
                  <td style={tdStyle}>
                    <span style={{ background: badge.bg, color: badge.color, borderRadius: 99, padding: '2px 8px', fontSize: 11, fontWeight: 600 }}>
                      {badge.label}
                    </span>
                  </td>
                  <td style={tdStyle}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' }}>
                      <button
                        onClick={() => notificar(row.id, row.customer_name)}
                        disabled={notifLoading[row.id]}
                        style={{
                          background: notifLoading[row.id] ? '#9CA3AF' : '#25D366',
                          color: '#fff', border: 'none', borderRadius: 6,
                          padding: '5px 12px', fontSize: 12, cursor: notifLoading[row.id] ? 'not-allowed' : 'pointer',
                          fontWeight: 600, whiteSpace: 'nowrap',
                        }}
                      >
                        {notifLoading[row.id] ? 'Enviando…' : '💬 Cobrar via WhatsApp'}
                      </button>
                      {msg && (
                        <span style={{ fontSize: 11, color: msg.ok ? '#059669' : '#DC2626' }}>
                          {msg.text}
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 12, fontSize: 12, color: '#9CA3AF' }}>
        {rows.length} registro{rows.length !== 1 ? 's' : ''} · Fonte: cora_cobrancas
      </div>
    </div>
  );
}

function KpiCard({ label, value, accent }) {
  return (
    <div style={{ background: 'var(--card-bg, #fff)', border: `1px solid var(--border, #E5E7EB)`, borderRadius: 10, padding: '14px 16px', borderLeft: `4px solid ${accent}` }}>
      <div style={{ fontSize: 11, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text, #111827)' }}>{value}</div>
    </div>
  );
}

function Th({ children }) {
  return (
    <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>
      {children}
    </th>
  );
}

const tdStyle = { padding: '12px 14px', verticalAlign: 'middle' };

const selectStyle = {
  padding: '7px 10px', borderRadius: 7, border: '1px solid var(--border, #D1D5DB)',
  fontSize: 13, background: 'var(--card-bg, #fff)', color: 'var(--text, #111827)', cursor: 'pointer',
};

const btnSecondaryStyle = {
  padding: '7px 14px', borderRadius: 7, border: '1px solid var(--border, #D1D5DB)',
  fontSize: 13, background: 'var(--card-bg, #fff)', color: 'var(--text, #374151)',
  cursor: 'pointer', fontWeight: 500,
};
