import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase.js';
import Icon from '../../components/Icon.jsx';
import NovaLojaModal from './NovaLojaModal.jsx';

const STATUS_COLORS = {
  onboarding: '#f59e0b',
  ativo: '#10b981', ativa: '#10b981',
  pausado: 'var(--tx2)', pausada: 'var(--tx2)',
  encerrado: '#ef4444', encerrada: '#ef4444',
  inativo: '#ef4444', inativa: '#ef4444',
};

const STATUS_LABEL = {
  onboarding: 'Onboarding',
  ativo: 'Ativo', ativa: 'Ativo',
  pausado: 'Pausado', pausada: 'Pausado',
  encerrado: 'Encerrado', encerrada: 'Encerrado',
  inativo: 'Inativo', inativa: 'Inativo',
};

const SEG_LABEL = {
  hamburgueria: 'Hamburgueria', pizzaria: 'Pizzaria', japonesa: 'Japonesa',
  brasileira: 'Brasileira', marmita: 'Marmita', saudavel: 'Saudável',
  acai: 'Açaí', sobremesa: 'Sobremesa', padaria: 'Padaria', outro: 'Outro',
};

const SEGMENTOS = Object.entries(SEG_LABEL);
const STATUSES = [
  ['onboarding', 'Onboarding'], ['ativo', 'Ativo'], ['pausado', 'Pausado'],
  ['encerrado', 'Encerrado'], ['inativo', 'Inativo'],
];

export default function LojasListView({ tenantDbId, userId, go }) {
  const [lojas, setLojas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterSegmento, setFilterSegmento] = useState('');
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    if (!tenantDbId) return;
    load();
  }, [tenantDbId]);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from('lojas')
      .select('id, nome, cidade, estado, segmento, status, logo_url, super_restaurante')
      .eq('tenant_id', tenantDbId)
      .eq('is_active', true)
      .eq('is_contato', false)
      .order('nome')
      .limit(2000);
    setLojas(data || []);
    setLoading(false);
  }

  const filtered = lojas.filter(l => {
    if (search) {
      const q = search.toLowerCase();
      if (!l.nome?.toLowerCase().includes(q) && !l.cidade?.toLowerCase().includes(q)) return false;
    }
    if (filterStatus && l.status !== filterStatus) return false;
    if (filterSegmento && l.segmento !== filterSegmento) return false;
    return true;
  });

  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, gap: 12 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--ink)', margin: 0 }}>Lojas</h1>
        <button
          onClick={() => setShowModal(true)}
          style={{ background: '#B70C00', border: 'none', color: '#fff', padding: '8px 14px', borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, fontSize: 13 }}
        >
          <Icon name="plus" size={14} /> Nova loja
        </button>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: '1 1 200px', minWidth: 180 }}>
          <Icon name="search" size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--tx2)', pointerEvents: 'none' }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nome ou cidade…"
            style={{ width: '100%', background: 'var(--panel,#fff)', border: '1px solid var(--line)', borderRadius: 8, color: 'var(--ink)', padding: '8px 10px 8px 32px', fontSize: 13, boxSizing: 'border-box' }}
          />
        </div>
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          style={{ background: 'var(--panel,#fff)', border: '1px solid var(--line)', borderRadius: 8, color: filterStatus ? 'var(--ink)' : 'var(--tx2)', padding: '8px 10px', fontSize: 13, cursor: 'pointer' }}
        >
          <option value="">Todos os status</option>
          {STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <select
          value={filterSegmento}
          onChange={e => setFilterSegmento(e.target.value)}
          style={{ background: 'var(--panel,#fff)', border: '1px solid var(--line)', borderRadius: 8, color: filterSegmento ? 'var(--ink)' : 'var(--tx2)', padding: '8px 10px', fontSize: 13, cursor: 'pointer' }}
        >
          <option value="">Todos os segmentos</option>
          {SEGMENTOS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--tx2)', alignSelf: 'center' }}>
          {filtered.length} {filtered.length === 1 ? 'loja' : 'lojas'}
        </span>
      </div>

      {/* Content */}
      {loading ? (
        <div style={{ display: 'grid', gap: 8 }}>
          {[1, 2, 3, 4].map(i => (
            <div key={i} style={{ height: 56, background: 'var(--panel,#fff)', borderRadius: 10, animation: 'pulse 1.5s infinite' }} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--tx2)' }}>
          <div style={{ marginBottom: 12, opacity: 0.4 }}><Icon name="building" size={44} /></div>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--tx2)' }}>
            {lojas.length === 0 ? 'Nenhuma loja cadastrada' : 'Nenhuma loja encontrada'}
          </div>
          <div style={{ marginTop: 4, fontSize: 13 }}>
            {lojas.length === 0
              ? 'Crie a primeira loja para começar.'
              : 'Ajuste os filtros para encontrar o que procura.'}
          </div>
          {lojas.length === 0 && (
            <button
              onClick={() => setShowModal(true)}
              style={{ marginTop: 16, background: '#B70C00', border: 'none', color: '#fff', padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}
            >
              Cadastrar loja
            </button>
          )}
        </div>
      ) : (
        <div style={{ background: 'var(--panel,#fff)', border: '1px solid var(--line)', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          <table style={{ width: '100%', minWidth: 540, borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--line)' }}>
                <th style={thStyle}>Logo</th>
                <th style={thStyle}>Nome</th>
                <th style={thStyle}>Cidade / UF</th>
                <th style={thStyle}>Segmento</th>
                <th style={thStyle}>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((l, i) => (
                <tr
                  key={l.id}
                  style={{ borderTop: i > 0 ? '1px solid var(--line)' : undefined, cursor: 'pointer', transition: 'background 0.15s' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#f5f4f2'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  onClick={() => go('workspace', { lojaId: l.id })}
                >
                  <td style={{ padding: '10px 14px', width: 44 }}>
                    {l.logo_url
                      ? <img src={l.logo_url} alt="" style={{ width: 32, height: 32, borderRadius: 6, objectFit: 'cover' }} />
                      : <div style={{ width: 32, height: 32, borderRadius: 6, background: 'var(--bg2,#f5f4f2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <Icon name="building" size={14} />
                        </div>
                    }
                  </td>
                  <td style={{ padding: '10px 14px', color: 'var(--ink)', fontWeight: 500 }}>
                    {l.nome}
                    {l.super_restaurante && (
                      <span style={{ marginLeft: 6, fontSize: 10, background: '#f59e0b20', color: '#f59e0b', borderRadius: 4, padding: '1px 5px' }}>
                        Super
                      </span>
                    )}
                  </td>
                  <td style={{ padding: '10px 14px', color: 'var(--tx2)' }}>
                    {[l.cidade, l.estado].filter(Boolean).join(' / ') || '—'}
                  </td>
                  <td style={{ padding: '10px 14px', color: 'var(--tx2)' }}>
                    {l.segmento ? (SEG_LABEL[l.segmento] || l.segmento) : '—'}
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <span style={{
                      fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20,
                      background: (STATUS_COLORS[l.status] || 'var(--tx2)') + '20',
                      color: STATUS_COLORS[l.status] || 'var(--tx2)',
                    }}>
                      {STATUS_LABEL[l.status] || l.status || '—'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {showModal && (
        <NovaLojaModal
          tenantDbId={tenantDbId}
          userId={userId}
          onClose={() => setShowModal(false)}
          onCreated={loja => {
            setShowModal(false);
            load();
            go('workspace', { lojaId: loja.id });
          }}
        />
      )}
    </div>
  );
}

const thStyle = {
  padding: '10px 14px',
  textAlign: 'left',
  fontWeight: 500,
  color: 'var(--tx2)',
  fontSize: 11,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
};
