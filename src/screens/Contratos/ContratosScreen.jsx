import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase.js';
import NovoContratoModal from './NovoContratoModal.jsx';

const COLOR = '#10b981';

const STATUS_MAP = {
  rascunho: { label: 'Rascunho',  bg: 'rgba(107,114,128,0.18)', color: '#9ca3af' },
  enviado:  { label: 'Enviado',   bg: 'rgba(59,130,246,0.18)',  color: '#60a5fa' },
  assinado: { label: 'Assinado',  bg: 'rgba(16,185,129,0.18)',  color: '#10b981' },
  encerrado:{ label: 'Encerrado', bg: 'rgba(220,38,38,0.18)',   color: '#f87171' },
};

const PGTO_STATUS_MAP = {
  em_dia:    { label: 'Em dia',    bg: 'rgba(16,185,129,0.18)',  color: '#10b981' },
  atrasado:  { label: 'Atrasado',  bg: 'rgba(220,38,38,0.18)',   color: '#f87171' },
  cancelado: { label: 'Cancelado', bg: 'rgba(107,114,128,0.18)', color: '#9ca3af' },
};

const PACOTE_LABELS = {
  light:       'Light',
  performance: 'Performance',
  enterprise:  'Enterprise',
  growth:      'Growth',
};

function StatusBadge({ status }) {
  const s = STATUS_MAP[status] || STATUS_MAP.rascunho;
  return (
    <span style={{
      background: s.bg, color: s.color, border: `1px solid ${s.color}44`,
      borderRadius: 6, padding: '2px 9px', fontSize: 11, fontWeight: 600,
    }}>{s.label}</span>
  );
}

function PagtoStatusBadge({ status }) {
  if (!status) return <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)' }}>—</span>;
  const s = PGTO_STATUS_MAP[status] || { label: status, bg: 'rgba(107,114,128,0.18)', color: '#9ca3af' };
  return (
    <span style={{
      background: s.bg, color: s.color, border: `1px solid ${s.color}44`,
      borderRadius: 6, padding: '2px 9px', fontSize: 11, fontWeight: 600,
    }}>{s.label}</span>
  );
}

function Spinner({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24"
      style={{ animation: 'spin 0.8s linear infinite', flexShrink: 0 }}>
      <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor"
        strokeWidth="2.5" strokeDasharray="60" strokeDashoffset="20" />
    </svg>
  );
}

function fmtBRL(v) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
}

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('pt-BR');
}

export default function ContratosScreen({ tenantDbId }) {
  const [contratos, setContratos] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [toast, setToast]         = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('contratos')
      .select('id, pacote, valor_mensal, valor_setup, status, pagamento_status, vigencia_inicio, vigencia_fim, created_at, customers(name)')
      .eq('tenant_id', tenantDbId)
      .order('created_at', { ascending: false });
    if (!error) setContratos(data || []);
    setLoading(false);
  }, [tenantDbId]);

  useEffect(() => { load(); }, [load]);

  function showToast(message, type = 'success') {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  }

  return (
    <div style={{ padding: '24px 28px', maxWidth: 960, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: 'rgba(255,255,255,0.9)' }}>
            Contratos
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'rgba(255,255,255,0.45)' }}>
            Contratos digitais com assinatura e cobrança automática
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          style={{
            background: COLOR, color: '#fff', border: 'none',
            borderRadius: 8, padding: '9px 18px', fontSize: 13,
            fontWeight: 600, cursor: 'pointer', display: 'flex',
            alignItems: 'center', gap: 7,
          }}
        >
          <span style={{ fontSize: 16, lineHeight: 1 }}>+</span>
          Novo Contrato
        </button>
      </div>

      {/* Content */}
      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'rgba(255,255,255,0.4)', padding: 40, justifyContent: 'center' }}>
          <Spinner size={18} /> Carregando contratos…
        </div>
      ) : contratos.length === 0 ? (
        <div style={{
          background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 12, padding: '56px 24px', textAlign: 'center',
        }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>📄</div>
          <p style={{ margin: 0, color: 'rgba(255,255,255,0.45)', fontSize: 14 }}>
            Nenhum contrato ainda. Crie o primeiro!
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {contratos.map(c => (
            <div key={c.id} style={{
              background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 10, padding: '14px 18px',
              display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
            }}>
              <div style={{ flex: 1, minWidth: 160 }}>
                <div style={{ fontWeight: 600, fontSize: 14, color: 'rgba(255,255,255,0.85)' }}>
                  {c.customers?.name || 'Cliente não vinculado'}
                </div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>
                  {PACOTE_LABELS[c.pacote]} · criado {fmtDate(c.created_at)}
                </div>
              </div>
              <div style={{ textAlign: 'right', minWidth: 100 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: COLOR }}>
                  {fmtBRL(c.valor_mensal)}<span style={{ fontSize: 10, fontWeight: 400, color: 'rgba(255,255,255,0.4)' }}>/mês</span>
                </div>
                {c.valor_setup > 0 && (
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>
                    Setup {fmtBRL(c.valor_setup)}
                  </div>
                )}
              </div>
              <div style={{ minWidth: 80, textAlign: 'right' }}>
                {c.vigencia_inicio && (
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>
                    Início {fmtDate(c.vigencia_inicio)}
                  </div>
                )}
              </div>
              <StatusBadge status={c.status} />
              <PagtoStatusBadge status={c.pagamento_status} />
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <NovoContratoModal
          tenantDbId={tenantDbId}
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); load(); showToast('Contrato criado com sucesso!'); }}
        />
      )}

      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
          padding: '12px 18px', background: '#1e1e2e', borderRadius: 10,
          border: `1px solid ${toast.type === 'error' ? '#dc262655' : '#10b98155'}`,
          color: 'rgba(255,255,255,0.9)', fontSize: 13, fontWeight: 500,
          boxShadow: '0 4px 24px rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <span style={{ color: toast.type === 'error' ? '#f87171' : COLOR, fontSize: 16 }}>
            {toast.type === 'error' ? '✕' : '✓'}
          </span>
          {toast.message}
        </div>
      )}
    </div>
  );
}
