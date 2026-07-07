import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Ico } from './CvIcons.jsx';
import { supabase } from '../lib/supabase.js';

const BRIDGE_URL = import.meta.env.VITE_BRIDGE_URL || 'https://bridge.consultdelivery.com.br';
const PACOTE_SUGERIDO_DEFAULT = 'performance';
const STATUS_FILTERS = ['todos', 'pendente', 'aceito', 'recusado', 'sem_resposta'];

const PACOTES = [
  { id: 'light',       label: 'Light',       desc: 'R$500/mês' },
  { id: 'performance', label: 'Performance',  desc: 'R$500 base + 12% crescimento' },
  { id: 'enterprise',  label: 'Enterprise',   desc: 'R$1.200/mês' },
  { id: 'growth',      label: 'Growth',       desc: 'R$2.500 setup + R$1.500/mês' },
];

const RECONTRATACAO_TEMPLATES = {
  light:       (nome) => `Olá ${nome}! Renovamos nossa parceria. Pacote Light R$500/mês - gestão iFood completa, relatórios semanais e suporte prioritário. Para confirmar ou saber mais, responda esta mensagem!`,
  performance: (nome) => `Olá ${nome}! Novo modelo de parceria: R$500 base + 12% do crescimento que geramos juntos. Você paga mais só quando cresce mais. Vamos conversar?`,
  enterprise:  (nome) => `Olá ${nome}! Proposta Enterprise: R$1.200/mês, mínimo 6 meses, com gestão completa e consultoria estratégica mensal. Responda para agendar uma apresentação!`,
  growth:      (nome) => `Olá ${nome}! Pacote Growth com IA no iFood: R$2.500 setup + R$1.500/mês. Automatização avançada e IA para maximizar seus resultados. Quer saber mais?`,
};

const STATUS_META = {
  pendente:     { label: 'Pendente',     color: 'var(--amber)', bg: 'var(--amber-soft)' },
  aceito:       { label: 'Aceito',       color: 'var(--green)', bg: 'var(--green-soft)' },
  recusado:     { label: 'Recusado',     color: 'var(--red)',   bg: 'var(--red-soft)'   },
  sem_resposta: { label: 'Sem resposta', color: 'var(--tx2)',   bg: 'var(--panel)'      },
};

function StatusBadge({ status }) {
  const s = STATUS_META[status];
  if (!s) return null;
  return (
    <span style={{
      display: 'inline-block', padding: '2px 9px', borderRadius: 99, fontSize: 11, fontWeight: 600,
      background: s.bg, color: s.color, border: `1px solid ${s.color}`,
    }}>{s.label}</span>
  );
}

function EnviarOfertaModal({ customer, tenantDbId, onClose, onSent }) {
  const [pacote, setPacote] = useState('light');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const nome = customer.name || 'cliente';
  const preview = RECONTRATACAO_TEMPLATES[pacote]?.(nome) ?? '';

  async function handleEnviar() {
    setLoading(true);
    setError('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Sessão expirada. Faça login novamente.');

      const res = await fetch(`${BRIDGE_URL}/agents/recontratacao/${customer.id}/enviar`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ tenant_id: tenantDbId, pacote }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      onSent(customer.id, pacote, json.aceite_id);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return createPortal(
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: 'var(--bg)', borderRadius: 16, width: '100%', maxWidth: 540, border: '1px solid var(--line)' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px 16px', borderBottom: '1px solid var(--line)' }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)' }}>Enviar Oferta</div>
            <div style={{ fontSize: 13, color: 'var(--tx2)', marginTop: 2 }}>{nome}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tx2)', padding: 4, fontSize: 20, lineHeight: 1 }}>×</button>
        </div>

        <div style={{ padding: 24 }}>
          {/* Seleção de pacote */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--tx2)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Pacote</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {PACOTES.map(p => (
                <button
                  key={p.id}
                  onClick={() => setPacote(p.id)}
                  style={{
                    padding: '10px 14px',
                    borderRadius: 10,
                    border: `2px solid ${pacote === p.id ? 'var(--red)' : 'var(--line)'}`,
                    background: pacote === p.id ? 'var(--red-soft)' : 'var(--bg)',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all .15s',
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{p.label}</div>
                  <div style={{ fontSize: 11, color: 'var(--tx2)', marginTop: 2 }}>{p.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Preview da mensagem */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--tx2)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Preview</div>
            <div style={{
              background: 'var(--panel)',
              border: '1px solid var(--line)',
              borderRadius: 10,
              padding: '12px 14px',
              fontSize: 13,
              color: 'var(--tx)',
              lineHeight: 1.55,
            }}>
              {preview}
            </div>
          </div>

          {/* Erro */}
          {error && (
            <div style={{ marginBottom: 16, padding: '10px 14px', background: 'var(--red-soft)', border: '1px solid var(--red)', borderRadius: 8, fontSize: 13, color: 'var(--red)' }}>
              {error}
            </div>
          )}

          {/* Botões */}
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="cv2-btn sec" onClick={onClose} style={{ flex: 1 }}>Cancelar</button>
            <button
              className="cv2-btn"
              onClick={handleEnviar}
              disabled={loading}
              style={{ flex: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
            >
              {loading ? (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" style={{ animation: 'spin 0.8s linear infinite' }}>
                    <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2.5" strokeDasharray="60" strokeDashoffset="20" />
                  </svg>
                  Enviando…
                </>
              ) : (
                <>
                  <Ico name="i-reply" size={15} />
                  Enviar via WhatsApp
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default function Recontratacao({ tenantDbId, userId }) {
  const [customers, setCustomers] = useState([]);
  const [aceites, setAceites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('todos');
  const [search, setSearch] = useState('');
  const [modalCustomer, setModalCustomer] = useState(null);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkErr, setBulkErr] = useState('');
  const [confirmBulk, setConfirmBulk] = useState(false);
  const [toast, setToast] = useState('');
  // Count real de customers (não capado em 500) — mesmo padrão de ConsoleV2.jsx:251
  // (count exact, head true). Sem isso, o KPI "Total clientes" e o "{X} de {Y} clientes"
  // sub-contam (ex.: 1172 customers reais, KPI mostrava no max 500).
  const [totalCustomers, setTotalCustomers] = useState(0);

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(''), 3500);
  }

  const loadData = useCallback(() => {
    if (!tenantDbId) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([
      supabase.from('customers').select('id,name,phone_normalized,phone,status').eq('tenant_id', tenantDbId).limit(500),
      supabase.from('aceite_recontratacao').select('id,customer_id,pacote_ofertado,status,mensagem_enviada_em,respondido_em').eq('tenant_id', tenantDbId),
      // Count real de customers do tenant (sem o cap de 500). PostgREST count é
      // exato. Falha → mantém o último valor (não zera KPI por erro transitório).
      supabase.from('customers').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantDbId),
    ]).then(([{ data: custs, error: e1 }, { data: ac, error: e2 }, { count: nC, error: e3 }]) => {
      if (cancelled) return;
      if (e1 || e2) { showToast((e1 || e2).message || 'Erro ao carregar dados.'); setLoading(false); return; }
      setCustomers(custs || []);
      setAceites(ac || []);
      if (!e3) setTotalCustomers(nC ?? 0);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [tenantDbId]);

  useEffect(() => {
    const cleanup = loadData();
    return cleanup;
  }, [loadData]);

  // Mapa customer_id → aceite
  const aceiteMap = Object.fromEntries((aceites || []).map(a => [a.customer_id, a]));

  // Clientes sem oferta (para envio em massa)
  const semOferta = customers.filter(c => !aceiteMap[c.id]);

  // Totals — `total` (customers) vem do count real (count: 'exact', head: true),
  // não do length do array capado em 500. `aceitos`/`enviados` vêm de `aceites`
  // (segunda query, sem cap explícito). `pct` = aceitos/total real.
  const total    = totalCustomers;
  const aceitos  = aceites.filter(a => a.status === 'aceito').length;
  const enviados = aceites.filter(a => a.mensagem_enviada_em).length;
  const pct      = total > 0 ? Math.round((aceitos / total) * 100) : 0;

  // Filtro
  const filtered = customers.filter(c => {
    const aceite = aceiteMap[c.id];
    if (statusFilter !== 'todos') {
      if (!aceite || aceite.status !== statusFilter) return false;
    }
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

  async function executarBulkEnviar() {
    setConfirmBulk(false);
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

  const filterLabel = (s) => {
    if (s === 'todos') return 'Todos';
    return STATUS_META[s]?.label ?? s;
  };

  return (
    <div>
      {/* Toast */}
      {toast && (
        <div style={{ position: 'fixed', top: 16, right: 16, zIndex: 10000, background: 'var(--red-soft)', border: '1px solid var(--red)', borderRadius: 8, padding: '10px 16px', fontSize: 13, color: 'var(--red)', boxShadow: '0 4px 12px rgba(0,0,0,.1)' }}>
          {toast}
        </div>
      )}

      <h1>Re-contratação</h1>
      <div className="cv2-rule" />
      <div className="cv2-sub">Campanha para renovar contratos dos clientes ativos</div>

      {/* KPIs */}
      <div className="cv2-kpis">
        <div className="cv2-kpi">
          <div className="l">Total clientes</div>
          <div className="v">{total}</div>
          <div className="d"> </div>
        </div>
        <div className="cv2-kpi">
          <div className="l">Ofertas enviadas</div>
          <div className="v">{enviados}</div>
          <div className="d"> </div>
        </div>
        <div className="cv2-kpi">
          <div className="l">Aceitos</div>
          <div className="v">{aceitos}</div>
          <div className="d"> </div>
        </div>
        <div className="cv2-kpi">
          <div className="l">Taxa de aceite</div>
          <div className="v">{pct}%</div>
          <div className="d"> </div>
        </div>
      </div>

      {/* Barra de progresso */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 12, color: 'var(--tx2)' }}>
          <span>Progresso de aceite</span>
          <span>{aceitos}/{total}</span>
        </div>
        <div style={{ height: 6, background: 'var(--panel)', borderRadius: 99, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${pct}%`, background: pct >= 100 ? 'var(--green)' : 'var(--red)', borderRadius: 99, transition: 'width .4s ease' }} />
        </div>
      </div>

      {/* Filtros + ações */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        {/* Busca */}
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar cliente…"
          style={{ flex: 1, minWidth: 180, height: 36, padding: '0 12px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--bg)', color: 'var(--tx)', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
        />

        {/* Filtro status — pills */}
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {STATUS_FILTERS.map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              style={{
                padding: '5px 13px', borderRadius: 99, border: `1px solid ${statusFilter === s ? 'var(--red)' : 'var(--line)'}`,
                background: statusFilter === s ? 'var(--red-soft)' : 'var(--bg)',
                color: statusFilter === s ? 'var(--red)' : 'var(--tx2)',
                cursor: 'pointer', fontSize: 12, fontWeight: 600,
              }}
            >
              {filterLabel(s)}
            </button>
          ))}
        </div>

        {/* Botão bulk */}
        <button
          className="cv2-btn"
          onClick={() => { if (semOferta.length > 0) setConfirmBulk(true); }}
          disabled={bulkLoading || semOferta.length === 0}
          title={`Enviar para ${semOferta.length} sem oferta`}
        >
          <Ico name="i-reply" size={14} />
          {bulkLoading ? 'Enviando…' : `Enviar p/ ${semOferta.length} pendentes`}
        </button>

        {/* Refresh */}
        <button className="cv2-btn sec" onClick={loadData} title="Atualizar" aria-label="Atualizar lista">
          <Ico name="i-reply" size={14} />
        </button>
      </div>

      {/* Confirmação bulk inline */}
      {confirmBulk && (
        <div className="cv2-card" style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, color: 'var(--tx)', flex: 1 }}>
            Enviar oferta "{PACOTE_SUGERIDO_DEFAULT}" para <b>{semOferta.length}</b> clientes sem oferta?
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="cv2-btn" onClick={executarBulkEnviar}>Confirmar</button>
            <button className="cv2-btn sec" onClick={() => setConfirmBulk(false)}>Cancelar</button>
          </div>
        </div>
      )}

      {bulkErr && (
        <div style={{ marginBottom: 16, padding: '10px 14px', background: 'var(--red-soft)', border: '1px solid var(--red)', borderRadius: 8, fontSize: 13, color: 'var(--red)' }}>
          {bulkErr}
        </div>
      )}

      {/* Tabela */}
      {loading ? (
        <div className="cv2-card" style={{ textAlign: 'center', padding: 60, color: 'var(--tx2)', fontSize: 13 }}>
          Carregando…
        </div>
      ) : (
        <div className="cv2-card" style={{ padding: 0, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--line)' }}>
                {['Cliente', 'WhatsApp', 'Pacote ofertado', 'Status', 'Enviado em', 'Ação'].map(h => (
                  <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--tx2)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: 40, fontSize: 13, color: 'var(--tx2)' }}>
                    Nenhum cliente encontrado
                  </td>
                </tr>
              ) : filtered.map((c, i) => {
                const aceite = aceiteMap[c.id];
                const jid = c.phone_normalized || c.phone || '—';
                return (
                  <tr key={c.id} style={{ borderBottom: i < filtered.length - 1 ? '1px solid var(--line)' : 'none' }}>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{c.name || '—'}</div>
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--tx2)', fontFamily: 'monospace' }}>
                      {jid}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--tx)', textTransform: 'capitalize' }}>
                      {aceite?.pacote_ofertado ?? '—'}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      {aceite
                        ? <StatusBadge status={aceite.status} />
                        : <span style={{ fontSize: 11, color: 'var(--tx2)' }}>Sem oferta</span>
                      }
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--tx2)' }}>
                      {fmtDate(aceite?.mensagem_enviada_em)}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <button
                        className={aceite?.mensagem_enviada_em ? 'cv2-btn sec' : 'cv2-btn'}
                        onClick={() => setModalCustomer(c)}
                        disabled={!!aceite?.mensagem_enviada_em}
                        style={{ fontSize: 12, padding: '5px 12px' }}
                      >
                        <Ico name="i-reply" size={12} />
                        {aceite?.mensagem_enviada_em ? 'Enviado' : 'Enviar'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div style={{ padding: '10px 16px', borderTop: '1px solid var(--line)', fontSize: 12, color: 'var(--tx2)' }}>
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
