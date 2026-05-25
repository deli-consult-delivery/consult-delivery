import { useState, useEffect, useCallback } from 'react';
import Icon from '../../components/Icon.jsx';
import { supabase } from '../../lib/supabase.js';
import EnviarOfertaModal from './EnviarOfertaModal.jsx';
import { STATUS_LABELS } from './templates.js';

const BRIDGE_URL = import.meta.env.VITE_BRIDGE_URL || 'https://bridge.consultdelivery.com.br';
const PACOTE_SUGERIDO_DEFAULT = 'performance';
const STATUS_FILTERS = ['todos', 'pendente', 'aceito', 'recusado', 'sem_resposta'];

function StatusBadge({ status }) {
  const s = STATUS_LABELS[status];
  if (!s) return null;
  return (
    <span style={{
      display: 'inline-block', padding: '2px 9px', borderRadius: 99, fontSize: 11, fontWeight: 600,
      background: s.color + '22', color: s.color, border: `1px solid ${s.color}44`,
    }}>{s.label}</span>
  );
}

export default function RecontratacaoScreen({ tenantDbId }) {
  const [customers, setCustomers] = useState([]);
  const [aceites, setAceites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('todos');
  const [search, setSearch] = useState('');
  const [modalCustomer, setModalCustomer] = useState(null);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkErr, setBulkErr] = useState('');

  const loadData = useCallback(async () => {
    if (!tenantDbId) return;
    setLoading(true);
    try {
      const [{ data: custs }, { data: ac }] = await Promise.all([
        supabase.from('customers').select('id,name,phone_normalized,phone,status').eq('tenant_id', tenantDbId).limit(500),
        supabase.from('aceite_recontratacao').select('id,customer_id,pacote_ofertado,status,mensagem_enviada_em,respondido_em').eq('tenant_id', tenantDbId),
      ]);
      setCustomers(custs || []);
      setAceites(ac || []);
    } finally {
      setLoading(false);
    }
  }, [tenantDbId]);

  useEffect(() => { loadData(); }, [loadData]);

  // Mapa customer_id → aceite
  const aceiteMap = Object.fromEntries((aceites || []).map(a => [a.customer_id, a]));

  // Clientes com aceite pendente (para envio em massa)
  const semOferta = customers.filter(c => !aceiteMap[c.id]);

  // Totals
  const total  = customers.length;
  const aceitos = aceites.filter(a => a.status === 'aceito').length;
  const enviados = aceites.filter(a => a.mensagem_enviada_em).length;
  const pct = total > 0 ? Math.round((aceitos / total) * 100) : 0;

  // Filtro
  const filtered = customers.filter(c => {
    const aceite = aceiteMap[c.id];
    const statusAtual = aceite?.status ?? (aceite ? 'pendente' : null);
    if (statusFilter === 'todos') { /* sem filtro */ }
    else if (statusFilter === 'pendente') { if (aceite && statusAtual !== 'pendente') return false; }
    else { if (statusAtual !== statusFilter) return false; }
    if (search) {
      const q = search.toLowerCase();
      if (!c.name?.toLowerCase().includes(q) && !c.phone?.includes(q) && !c.phone_normalized?.includes(q)) return false;
    }
    return true;
  });

  function handleSent(customerId, pacote, aceiteId) {
    setAceites(prev => {
      const existing = prev.findIndex(a => a.customer_id === customerId);
      const novo = { id: aceiteId, customer_id: customerId, pacote_ofertado: pacote, status: 'pendente', mensagem_enviada_em: new Date().toISOString(), respondido_em: null };
      if (existing >= 0) { const arr = [...prev]; arr[existing] = novo; return arr; }
      return [...prev, novo];
    });
  }

  async function handleBulkEnviar() {
    if (semOferta.length === 0) return;
    const confirmado = window.confirm(`Enviar oferta "${PACOTE_SUGERIDO_DEFAULT}" para ${semOferta.length} clientes sem oferta?`);
    if (!confirmado) return;
    setBulkLoading(true);
    setBulkErr('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Sessão expirada');
      let ok = 0, err = 0;
      for (const c of semOferta) {
        try {
          const res = await fetch(`${BRIDGE_URL}/agents/recontratacao/${c.id}/enviar`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
            body: JSON.stringify({ tenant_id: tenantDbId, pacote: PACOTE_SUGERIDO_DEFAULT }),
          });
          if (res.ok) { ok++; const j = await res.json(); handleSent(c.id, PACOTE_SUGERIDO_DEFAULT, j.aceite_id); }
          else err++;
        } catch { err++; }
      }
      if (err > 0) setBulkErr(`${ok} enviados, ${err} erros`);
    } catch (e) {
      setBulkErr(e.message);
    } finally {
      setBulkLoading(false);
    }
  }

  function fmtDate(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ' ' +
      d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }

  return (
    <div className="route-enter" style={{ padding: '28px 32px 56px', maxWidth: 1200, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: 'white', margin: 0 }}>Re-contratação</h1>
        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', marginTop: 4 }}>
          Campanha para renovar contratos dos 49 clientes ativos
        </p>
      </div>

      {/* Progresso */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16, marginBottom: 28 }}>
        {[
          { label: 'Total clientes', value: total },
          { label: 'Ofertas enviadas', value: enviados },
          { label: 'Aceitos', value: aceitos },
          { label: 'Taxa de aceite', value: `${pct}%` },
        ].map(m => (
          <div key={m.label} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: '16px 20px' }}>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>{m.label}</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: 'white' }}>{m.value}</div>
          </div>
        ))}
      </div>

      {/* Barra de progresso */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>
          <span>Progresso de aceite</span><span>{aceitos}/{total}</span>
        </div>
        <div style={{ height: 6, background: 'rgba(255,255,255,0.08)', borderRadius: 99, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${pct}%`, background: '#10B981', borderRadius: 99, transition: 'width .4s ease' }} />
        </div>
      </div>

      {/* Filtros + ações */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        {/* Busca */}
        <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
          <Icon name="search" size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.3)' }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar cliente…"
            style={{ width: '100%', paddingLeft: 36, paddingRight: 12, height: 38, borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: 'white', fontSize: 13, boxSizing: 'border-box', outline: 'none' }}
          />
        </div>

        {/* Filtro status */}
        <div style={{ display: 'flex', gap: 4, background: '#1A1A1A', borderRadius: 10, padding: 4 }}>
          {STATUS_FILTERS.map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              style={{
                padding: '5px 14px', borderRadius: 7, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600,
                background: statusFilter === s ? '#2A2A2A' : 'transparent',
                color: statusFilter === s ? 'white' : 'rgba(255,255,255,0.4)',
              }}
            >
              {s === 'todos' ? 'Todos' : STATUS_LABELS[s]?.label ?? s}
            </button>
          ))}
        </div>

        {/* Botão bulk */}
        <button
          onClick={handleBulkEnviar}
          disabled={bulkLoading || semOferta.length === 0}
          title={`Enviar para ${semOferta.length} sem oferta`}
          style={{
            display: 'flex', alignItems: 'center', gap: 7, padding: '8px 16px', borderRadius: 10, border: 'none',
            background: semOferta.length === 0 || bulkLoading ? 'rgba(255,255,255,0.08)' : 'var(--red,#B70C00)',
            color: semOferta.length === 0 || bulkLoading ? 'rgba(255,255,255,0.3)' : 'white',
            cursor: semOferta.length === 0 || bulkLoading ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap',
          }}
        >
          <Icon name="send" size={14} />
          {bulkLoading ? 'Enviando…' : `Enviar p/ ${semOferta.length} pendentes`}
        </button>

        {/* Refresh */}
        <button onClick={loadData} title="Atualizar" style={{ padding: 8, borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: 'rgba(255,255,255,0.5)', cursor: 'pointer' }}>
          <Icon name="refresh" size={16} />
        </button>
      </div>

      {bulkErr && (
        <div style={{ marginBottom: 16, padding: '10px 14px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, fontSize: 13, color: '#F87171' }}>
          {bulkErr}
        </div>
      )}

      {/* Tabela */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'rgba(255,255,255,0.3)', fontSize: 13 }}>
          Carregando…
        </div>
      ) : (
        <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                {['Cliente', 'WhatsApp', 'Pacote ofertado', 'Status', 'Enviado em', 'Ação'].map(h => (
                  <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={6} style={{ textAlign: 'center', padding: 40, fontSize: 13, color: 'rgba(255,255,255,0.3)' }}>Nenhum cliente encontrado</td></tr>
              ) : filtered.map((c, i) => {
                const aceite = aceiteMap[c.id];
                const jid = c.phone_normalized || c.phone || '—';
                return (
                  <tr key={c.id} style={{ borderBottom: i < filtered.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'white' }}>{c.name || '—'}</div>
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: 12, color: 'rgba(255,255,255,0.5)', fontFamily: 'monospace' }}>
                      {jid}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: 12, color: 'rgba(255,255,255,0.7)', textTransform: 'capitalize' }}>
                      {aceite?.pacote_ofertado ?? '—'}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      {aceite ? <StatusBadge status={aceite.status} /> : <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>Sem oferta</span>}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>
                      {fmtDate(aceite?.mensagem_enviada_em)}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <button
                        onClick={() => setModalCustomer(c)}
                        disabled={!!aceite?.mensagem_enviada_em}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 8, border: 'none',
                          background: aceite?.mensagem_enviada_em ? 'rgba(255,255,255,0.05)' : 'rgba(183,12,0,0.15)',
                          color: aceite?.mensagem_enviada_em ? 'rgba(255,255,255,0.25)' : 'var(--red,#B70C00)',
                          cursor: aceite?.mensagem_enviada_em ? 'default' : 'pointer', fontSize: 12, fontWeight: 600,
                        }}
                      >
                        <Icon name="send" size={12} />
                        {aceite?.mensagem_enviada_em ? 'Enviado' : 'Enviar'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div style={{ padding: '10px 16px', borderTop: '1px solid rgba(255,255,255,0.05)', fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>
            {filtered.length} de {total} clientes
          </div>
        </div>
      )}

      {modalCustomer && (
        <EnviarOfertaModal
          customer={modalCustomer}
          tenantDbId={tenantDbId}
          onClose={() => setModalCustomer(null)}
          onSent={handleSent}
        />
      )}
    </div>
  );
}
