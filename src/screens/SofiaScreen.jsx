import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase.js';

const SOFIA_COLOR = '#8B5CF6';
const SOFIA_BG = 'rgba(139,92,246,0.12)';
const BRIDGE = import.meta.env.VITE_BRIDGE_URL || 'http://localhost:3001';

// ── Shared styles ─────────────────────────────────────────────────────────────
const labelStyle = {
  fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.6)',
  display: 'block', marginBottom: 6,
};
const inputStyle = {
  width: '100%', boxSizing: 'border-box',
  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 8, padding: '9px 12px', color: 'rgba(255,255,255,0.85)',
  fontSize: 13, outline: 'none', fontFamily: 'inherit',
};
const cardStyle = {
  padding: 16, background: 'rgba(255,255,255,0.03)',
  border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10,
};
const btnBase = {
  border: 'none', borderRadius: 7, fontSize: 12, fontWeight: 600,
  cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4,
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function SofiaAvatar({ size = 32 }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: `linear-gradient(135deg, ${SOFIA_COLOR}, #6D28D9)`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.38, fontWeight: 700, color: '#fff', flexShrink: 0,
    }}>S</div>
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

// ── Toast ─────────────────────────────────────────────────────────────────────
function Toast({ message, type = 'info', onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 3500);
    return () => clearTimeout(t);
  }, [onClose]);
  const colors = { info: SOFIA_COLOR, success: '#16a34a', error: '#dc2626' };
  const color = colors[type] || SOFIA_COLOR;
  return (
    <div style={{
      position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
      padding: '12px 18px', background: '#1e1e2e', borderRadius: 10,
      border: `1px solid ${color}55`, color: 'rgba(255,255,255,0.9)',
      fontSize: 13, fontWeight: 500, boxShadow: `0 4px 24px rgba(0,0,0,0.4)`,
      display: 'flex', alignItems: 'center', gap: 10, maxWidth: 360,
    }}>
      <span style={{ color, fontSize: 16 }}>{type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ'}</span>
      <span>{message}</span>
      <button onClick={onClose} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>×</button>
    </div>
  );
}

// ── Status badge ──────────────────────────────────────────────────────────────
const STATUS_MAP = {
  novo:            { label: 'Novo',           color: '#6b7280' },
  pesquisando:     { label: 'Pesquisando',    color: '#60a5fa', spin: true },
  qualificado:     { label: 'Qualificado',    color: '#16a34a' },
  nao_qualificado: { label: 'Não qualif.',    color: '#dc2626' },
  abordado:        { label: 'Abordado',       color: SOFIA_COLOR },
  respondeu:       { label: 'Respondeu',      color: '#3b82f6' },
  convertido:      { label: 'Convertido',     color: '#15803d' },
  descartado:      { label: 'Descartado',     color: '#4b5563' },
};

function StatusBadge({ status }) {
  const m = STATUS_MAP[status] || { label: status, color: '#6b7280' };
  return (
    <span style={{
      background: `${m.color}22`, color: m.color,
      border: `1px solid ${m.color}44`, borderRadius: 6,
      padding: '2px 8px', fontSize: 11, fontWeight: 600,
      display: 'inline-flex', alignItems: 'center', gap: 4,
    }}>
      {m.spin && <Spinner size={10} />}
      {m.label}
    </span>
  );
}

const SEGMENTO_MAP = {
  restaurante:  '#f59e0b',
  hamburgueria: '#ef4444',
  pizzaria:     '#f97316',
  acai:         '#a855f7',
  lanches:      '#84cc16',
  saudavel:     '#22c55e',
  outro:        '#64748b',
};

function SegmentoBadge({ segmento }) {
  const color = SEGMENTO_MAP[segmento] || '#64748b';
  return (
    <span style={{
      background: `${color}22`, color, border: `1px solid ${color}44`,
      borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 600,
    }}>
      {segmento}
    </span>
  );
}

function ScoreChip({ score }) {
  if (score == null) return <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12 }}>—</span>;
  const color = score >= 70 ? '#16a34a' : score >= 40 ? '#D97706' : '#dc2626';
  return (
    <span style={{
      background: `${color}22`, color, border: `1px solid ${color}44`,
      borderRadius: 6, padding: '2px 8px', fontSize: 12, fontWeight: 700,
    }}>{score}</span>
  );
}

// ── Canal badge (abordagens) ──────────────────────────────────────────────────
const CANAL_MAP = {
  whatsapp:    { label: 'WhatsApp',    color: '#22c55e' },
  instagram:   { label: 'Instagram',  color: '#a855f7' },
  email:       { label: 'Email',      color: '#60a5fa' },
};
function CanalBadge({ canal }) {
  const m = CANAL_MAP[canal] || { label: canal, color: '#6b7280' };
  return (
    <span style={{ background: `${m.color}22`, color: m.color, border: `1px solid ${m.color}44`, borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 600 }}>
      {m.label}
    </span>
  );
}

const ABORD_STATUS_MAP = {
  rascunho:    { label: 'Rascunho',  color: '#D97706' },
  aprovada:    { label: 'Aprovada',  color: '#16a34a' },
  enviada:     { label: 'Enviada',   color: '#3b82f6' },
  sem_resposta:{ label: 'S/resposta',color: '#6b7280' },
  respondida:  { label: 'Respondida',color: '#22c55e' },
  descartado:  { label: 'Descartado',color: '#4b5563' },
};
function AbordStatusBadge({ status }) {
  const m = ABORD_STATUS_MAP[status] || { label: status, color: '#6b7280' };
  return (
    <span style={{ background: `${m.color}22`, color: m.color, border: `1px solid ${m.color}44`, borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 600 }}>
      {m.label}
    </span>
  );
}

// ── Bridge call helper ────────────────────────────────────────────────────────
async function bridgeCall(endpoint, body) {
  const token = (await supabase.auth.getSession()).data.session?.access_token;
  const res = await fetch(`${BRIDGE}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Erro ${res.status}`);
  return data;
}

// ── ProspectDrawer ────────────────────────────────────────────────────────────
function ProspectDrawer({ prospect, onClose, tenantDbId, userId, onRefresh, onToast }) {
  const [editText, setEditText] = useState('');
  const [editAbordId, setEditAbordId] = useState(null);
  const [abordagens, setAbordagens] = useState([]);
  const [loadingAbord, setLoadingAbord] = useState(false);

  useEffect(() => {
    if (!prospect) return;
    setLoadingAbord(true);
    supabase.from('prospect_abordagens').select('*')
      .eq('prospect_id', prospect.id)
      .order('created_at', { ascending: false })
      .limit(20)
      .then(({ data }) => { setAbordagens(data || []); setLoadingAbord(false); });
  }, [prospect]);

  if (!prospect) return null;

  const dados = prospect.dados_coletados;

  const dispatchAction = async (action, canal) => {
    const endpointMap = {
      pesquisar: '/agents/sofia-pesquisar-prospect/run',
      qualificar: '/agents/sofia-qualificar-prospect/run',
      abordagem_whatsapp: '/agents/sofia-gerar-abordagem/run',
      abordagem_instagram: '/agents/sofia-gerar-abordagem/run',
    };
    const ep = endpointMap[action];
    if (!ep) return;
    try {
      const body = { tenant_id: tenantDbId, prospect_id: prospect.id, triggered_by: userId };
      if (canal) body.canal = canal;
      await bridgeCall(ep, body);
      onToast(`Ação "${action}" disparada para ${prospect.nome}`, 'success');
      onRefresh();
    } catch (e) {
      onToast(e.message, 'error');
    }
  };

  const saveAbordEdit = async (id) => {
    await supabase.from('prospect_abordagens').update({ texto: editText }).eq('id', id);
    setEditAbordId(null);
    setAbordagens(prev => prev.map(a => a.id === id ? { ...a, texto: editText } : a));
    onToast('Abordagem salva', 'success');
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      display: 'flex', justifyContent: 'flex-end',
    }}>
      {/* overlay */}
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)' }} />

      {/* panel */}
      <div style={{
        position: 'relative', width: 480, maxWidth: '100vw',
        background: '#0f0f1a', borderLeft: `1px solid rgba(255,255,255,0.1)`,
        display: 'flex', flexDirection: 'column', overflowY: 'auto',
        zIndex: 1,
      }}>
        {/* header */}
        <div style={{ padding: '20px 20px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'rgba(255,255,255,0.92)' }}>{prospect.nome}</h2>
            <p style={{ margin: '2px 0 0', fontSize: 13, color: 'rgba(255,255,255,0.45)' }}>{prospect.cidade}{prospect.estado ? `, ${prospect.estado}` : ''}</p>
            <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
              {prospect.segmento && <SegmentoBadge segmento={prospect.segmento} />}
              <StatusBadge status={prospect.status} />
              <ScoreChip score={prospect.score} />
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontSize: 22, lineHeight: 1, flexShrink: 0 }}>×</button>
        </div>

        {/* body */}
        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 18, flex: 1 }}>

          {/* Info básica */}
          <div style={cardStyle}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.4)', marginBottom: 10, letterSpacing: 1 }}>INFORMAÇÕES</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {[
                ['Fonte', prospect.fonte],
                ['Segmento', prospect.segmento],
                ['Status', prospect.status],
                ['Score', prospect.score != null ? prospect.score : '—'],
              ].map(([k, v]) => (
                <div key={k}>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', fontWeight: 600 }}>{k}</div>
                  <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)', marginTop: 2 }}>{v || '—'}</div>
                </div>
              ))}
            </div>
            {prospect.score_razao && (
              <div style={{ marginTop: 10, padding: '8px 10px', background: `${SOFIA_COLOR}18`, borderRadius: 7, fontSize: 12, color: 'rgba(255,255,255,0.65)' }}>
                {prospect.score_razao}
              </div>
            )}
          </div>

          {/* iFood + contato */}
          <div style={cardStyle}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.4)', marginBottom: 10, letterSpacing: 1 }}>CONTATO & iFood</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {prospect.instagram && <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.75)' }}>📸 <a href={`https://instagram.com/${prospect.instagram.replace('@','')}`} target="_blank" rel="noreferrer" style={{ color: SOFIA_COLOR }}>@{prospect.instagram.replace('@','')}</a></div>}
              {prospect.whatsapp && <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.75)' }}>📱 {prospect.whatsapp}</div>}
              {prospect.avaliacao_ifood != null && <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.75)' }}>⭐ {prospect.avaliacao_ifood} iFood</div>}
            </div>
          </div>

          {/* Dados coletados */}
          {dados && (
            <div style={cardStyle}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.4)', marginBottom: 10, letterSpacing: 1 }}>ÚLTIMA PESQUISA</div>
              <pre style={{ margin: 0, fontSize: 11, color: 'rgba(255,255,255,0.6)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'monospace' }}>
                {typeof dados === 'string' ? dados : JSON.stringify(dados, null, 2)}
              </pre>
            </div>
          )}

          {/* Abordagens */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.4)', marginBottom: 10, letterSpacing: 1 }}>ABORDAGENS GERADAS</div>
            {loadingAbord ? (
              <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12 }}>Carregando…</div>
            ) : abordagens.length === 0 ? (
              <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12 }}>Nenhuma abordagem gerada ainda.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {abordagens.map(a => (
                  <div key={a.id} style={{ ...cardStyle, padding: 12 }}>
                    <div style={{ display: 'flex', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
                      <CanalBadge canal={a.canal} />
                      <AbordStatusBadge status={a.status} />
                      <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginLeft: 'auto' }}>
                        {new Date(a.created_at).toLocaleDateString('pt-BR')}
                      </span>
                    </div>
                    {editAbordId === a.id ? (
                      <>
                        <textarea
                          style={{ ...inputStyle, minHeight: 80, resize: 'vertical', marginBottom: 6 }}
                          value={editText} onChange={e => setEditText(e.target.value)} />
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button onClick={() => saveAbordEdit(a.id)} style={{ ...btnBase, padding: '5px 12px', background: 'rgba(22,163,74,0.15)', border: '1px solid rgba(22,163,74,0.3)', color: '#16a34a' }}>Salvar</button>
                          <button onClick={() => setEditAbordId(null)} style={{ ...btnBase, padding: '5px 12px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.5)' }}>Cancelar</button>
                        </div>
                      </>
                    ) : (
                      <>
                        <p style={{ margin: 0, fontSize: 12, color: 'rgba(255,255,255,0.75)', lineHeight: 1.5 }}>
                          {a.texto || '—'}
                        </p>
                        <button onClick={() => { setEditAbordId(a.id); setEditText(a.texto || ''); }} style={{ ...btnBase, marginTop: 8, padding: '4px 10px', background: `${SOFIA_COLOR}18`, border: `1px solid ${SOFIA_COLOR}33`, color: SOFIA_COLOR }}>Editar</button>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* footer actions */}
        <div style={{ padding: 16, borderTop: '1px solid rgba(255,255,255,0.08)', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <button onClick={() => dispatchAction('pesquisar')} style={{ ...btnBase, padding: '8px 14px', background: 'rgba(96,165,250,0.15)', border: '1px solid rgba(96,165,250,0.3)', color: '#60a5fa' }}>
            🔍 Pesquisar
          </button>
          <button onClick={() => dispatchAction('qualificar')} style={{ ...btnBase, padding: '8px 14px', background: 'rgba(22,163,74,0.15)', border: '1px solid rgba(22,163,74,0.3)', color: '#16a34a' }}>
            ✓ Qualificar
          </button>
          <button onClick={() => dispatchAction('abordagem_whatsapp', 'whatsapp')} style={{ ...btnBase, padding: '8px 14px', background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)', color: '#22c55e' }}>
            📱 Abordagem WhatsApp
          </button>
          <button onClick={() => dispatchAction('abordagem_instagram', 'instagram')} style={{ ...btnBase, padding: '8px 14px', background: 'rgba(168,85,247,0.15)', border: '1px solid rgba(168,85,247,0.3)', color: '#a855f7' }}>
            📸 Abordagem Instagram
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Tab 1: Prospects ──────────────────────────────────────────────────────────
function ProspectsTab({ tenantDbId, userId, onToast }) {
  const [prospects, setProspects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterSegmento, setFilterSegmento] = useState('');
  const [selected, setSelected] = useState(new Set());
  const [drawerProspect, setDrawerProspect] = useState(null);
  const [batchLoading, setBatchLoading] = useState(false);

  const load = useCallback(async () => {
    if (!tenantDbId) return;
    setLoading(true);
    let q = supabase.from('prospects')
      .select('id, nome, cidade, estado, segmento, fonte, status, score, avaliacao_ifood, instagram, whatsapp, created_at, dados_coletados, score_razao')
      .eq('tenant_id', tenantDbId)
      .order('created_at', { ascending: false })
      .limit(100);
    if (filterStatus) q = q.eq('status', filterStatus);
    if (filterSegmento) q = q.eq('segmento', filterSegmento);
    const { data } = await q;
    setProspects(data || []);
    setLoading(false);
  }, [tenantDbId, filterStatus, filterSegmento]);

  useEffect(() => { load(); }, [load]);

  const dispatchOne = async (endpoint, prospectId, prospectNome) => {
    try {
      await bridgeCall(endpoint, { tenant_id: tenantDbId, prospect_id: prospectId, triggered_by: userId });
      onToast(`Ação disparada para ${prospectNome}`, 'success');
      load();
    } catch (e) {
      onToast(e.message, 'error');
    }
  };

  const batchAction = async (action) => {
    if (selected.size === 0) return;
    setBatchLoading(true);
    const endpoint = action === 'pesquisar'
      ? '/agents/sofia-batch-pesquisar/run'
      : '/agents/sofia-batch-qualificar/run';
    try {
      await bridgeCall(endpoint, {
        tenant_id: tenantDbId,
        prospect_ids: Array.from(selected),
        triggered_by: userId,
      });
      onToast(`${action} disparado para ${selected.size} prospects`, 'success');
      setSelected(new Set());
      load();
    } catch (e) {
      onToast(e.message, 'error');
    } finally {
      setBatchLoading(false);
    }
  };

  const toggleSelect = (id) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };
  const toggleAll = () => {
    if (selected.size === prospects.length) setSelected(new Set());
    else setSelected(new Set(prospects.map(p => p.id)));
  };

  return (
    <>
      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <select style={{ ...inputStyle, width: 'auto', flex: '1 1 160px' }}
          value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="">Todos os status</option>
          {Object.keys(STATUS_MAP).map(s => <option key={s} value={s}>{STATUS_MAP[s].label}</option>)}
        </select>
        <select style={{ ...inputStyle, width: 'auto', flex: '1 1 160px' }}
          value={filterSegmento} onChange={e => setFilterSegmento(e.target.value)}>
          <option value="">Todos os segmentos</option>
          {Object.keys(SEGMENTO_MAP).map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {/* Loading */}
      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 24, color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>
          <Spinner /> Carregando prospects…
        </div>
      ) : prospects.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 24px', color: 'rgba(255,255,255,0.4)' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🔭</div>
          <p style={{ fontSize: 14 }}>Nenhum prospect encontrado.</p>
          <p style={{ fontSize: 12 }}>Use a aba "Importar" para adicionar prospects.</p>
        </div>
      ) : (
        <>
          {/* Table header */}
          <div style={{ display: 'grid', gridTemplateColumns: '32px 1fr 120px 130px 60px 200px', gap: 8, padding: '6px 12px', fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.35)', letterSpacing: 0.5, borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
            <div>
              <input type="checkbox" checked={selected.size === prospects.length && prospects.length > 0}
                onChange={toggleAll} style={{ cursor: 'pointer', accentColor: SOFIA_COLOR }} />
            </div>
            <div>NOME / LOCAL</div>
            <div>SEGMENTO</div>
            <div>STATUS</div>
            <div>SCORE</div>
            <div>AÇÕES</div>
          </div>

          {/* Rows */}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {prospects.map(p => (
              <div key={p.id}
                style={{
                  display: 'grid', gridTemplateColumns: '32px 1fr 120px 130px 60px 200px',
                  gap: 8, padding: '10px 12px', cursor: 'pointer',
                  borderBottom: '1px solid rgba(255,255,255,0.05)',
                  alignItems: 'center',
                  background: selected.has(p.id) ? `${SOFIA_COLOR}10` : 'transparent',
                  transition: 'background 0.1s',
                }}
                onMouseEnter={e => { if (!selected.has(p.id)) e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; }}
                onMouseLeave={e => { if (!selected.has(p.id)) e.currentTarget.style.background = 'transparent'; }}
              >
                {/* checkbox */}
                <div onClick={e => { e.stopPropagation(); toggleSelect(p.id); }}>
                  <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggleSelect(p.id)}
                    style={{ cursor: 'pointer', accentColor: SOFIA_COLOR }} />
                </div>

                {/* nome/local */}
                <div onClick={() => setDrawerProspect(p)}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.88)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.nome}</div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{p.cidade}{p.estado ? `, ${p.estado}` : ''}</div>
                </div>

                {/* segmento */}
                <div onClick={() => setDrawerProspect(p)}>
                  {p.segmento ? <SegmentoBadge segmento={p.segmento} /> : <span style={{ color: 'rgba(255,255,255,0.25)', fontSize: 12 }}>—</span>}
                </div>

                {/* status */}
                <div onClick={() => setDrawerProspect(p)}>
                  <StatusBadge status={p.status} />
                </div>

                {/* score */}
                <div onClick={() => setDrawerProspect(p)}>
                  <ScoreChip score={p.score} />
                </div>

                {/* ações inline */}
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }} onClick={e => e.stopPropagation()}>
                  <button onClick={() => dispatchOne('/agents/sofia-pesquisar-prospect/run', p.id, p.nome)}
                    style={{ ...btnBase, padding: '4px 8px', background: 'rgba(96,165,250,0.12)', border: '1px solid rgba(96,165,250,0.25)', color: '#60a5fa', fontSize: 11 }}>
                    🔍
                  </button>
                  <button onClick={() => dispatchOne('/agents/sofia-qualificar-prospect/run', p.id, p.nome)}
                    style={{ ...btnBase, padding: '4px 8px', background: 'rgba(22,163,74,0.12)', border: '1px solid rgba(22,163,74,0.25)', color: '#16a34a', fontSize: 11 }}>
                    ✓
                  </button>
                  <button onClick={() => setDrawerProspect(p)}
                    style={{ ...btnBase, padding: '4px 8px', background: `${SOFIA_COLOR}18`, border: `1px solid ${SOFIA_COLOR}33`, color: SOFIA_COLOR, fontSize: 11 }}>
                    ✉
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Batch bar */}
      {selected.size >= 2 && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          background: '#1a1a2e', border: `1px solid ${SOFIA_COLOR}55`,
          borderRadius: 12, padding: '12px 20px', zIndex: 500,
          display: 'flex', alignItems: 'center', gap: 16,
          boxShadow: `0 4px 32px rgba(0,0,0,0.5)`,
        }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.85)' }}>
            {selected.size} selecionados
          </span>
          <button disabled={batchLoading} onClick={() => batchAction('pesquisar')}
            style={{ ...btnBase, padding: '8px 16px', background: 'rgba(96,165,250,0.15)', border: '1px solid rgba(96,165,250,0.3)', color: '#60a5fa', opacity: batchLoading ? 0.5 : 1, cursor: batchLoading ? 'not-allowed' : 'pointer' }}>
            {batchLoading ? <Spinner /> : '🔍'} Pesquisar todos
          </button>
          <button disabled={batchLoading} onClick={() => batchAction('qualificar')}
            style={{ ...btnBase, padding: '8px 16px', background: 'rgba(22,163,74,0.15)', border: '1px solid rgba(22,163,74,0.3)', color: '#16a34a', opacity: batchLoading ? 0.5 : 1, cursor: batchLoading ? 'not-allowed' : 'pointer' }}>
            {batchLoading ? <Spinner /> : '✓'} Qualificar todos
          </button>
          <button onClick={() => setSelected(new Set())}
            style={{ ...btnBase, padding: '6px 10px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.4)' }}>
            ✕
          </button>
        </div>
      )}

      {/* Drawer */}
      {drawerProspect && (
        <ProspectDrawer
          prospect={drawerProspect}
          onClose={() => setDrawerProspect(null)}
          tenantDbId={tenantDbId}
          userId={userId}
          onRefresh={load}
          onToast={onToast}
        />
      )}
    </>
  );
}

// ── Tab 2: Importar ───────────────────────────────────────────────────────────
const ESTADOS_BR = ['AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT','PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO'];
const SEGMENTOS = ['restaurante','hamburgueria','pizzaria','acai','lanches','saudavel','outro'];

function ImportarTab({ tenantDbId, onToast }) {
  // CSV state
  const [csvFile, setCsvFile] = useState(null);
  const [csvRows, setCsvRows] = useState([]);
  const [csvHeaders, setCsvHeaders] = useState([]);
  const [csvImporting, setCsvImporting] = useState(false);
  const [csvResult, setCsvResult] = useState(null);

  // Manual form state
  const [form, setForm] = useState({
    nome: '', cidade: '', estado: '', segmento: '',
    instagram: '', whatsapp: '', site: '', ifood_link: '',
    avaliacao_ifood: '', num_avaliacoes: '', cnpj: '',
  });
  const [formLoading, setFormLoading] = useState(false);

  // CSV parser
  const parseCSV = (text) => {
    const lines = text.trim().split('\n');
    if (lines.length < 2) return { headers: [], rows: [] };
    const sep = lines[0].includes(';') ? ';' : ',';
    const headers = lines[0].split(sep).map(h => h.trim().replace(/^"|"$/g, ''));
    const rows = lines.slice(1).map(l =>
      l.split(sep).map(c => c.trim().replace(/^"|"$/g, ''))
    );
    return { headers, rows };
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvFile(file);
    setCsvResult(null);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const { headers, rows } = parseCSV(ev.target.result || '');
      setCsvHeaders(headers);
      setCsvRows(rows);
    };
    reader.readAsText(file, 'UTF-8');
  };

  const importCSV = async () => {
    if (!csvRows.length) return;
    setCsvImporting(true);
    let ok = 0; let err = 0;
    const required = ['nome', 'cidade', 'estado', 'segmento'];
    const optional = ['instagram', 'whatsapp', 'site', 'ifood_link', 'avaliacao_ifood', 'cnpj'];
    const idx = {};
    csvHeaders.forEach((h, i) => { idx[h.toLowerCase()] = i; });
    const records = csvRows.map(row => {
      const rec = { tenant_id: tenantDbId, fonte: 'csv' };
      required.forEach(f => { if (idx[f] !== undefined) rec[f] = row[idx[f]] || null; });
      optional.forEach(f => { if (idx[f] !== undefined) rec[f] = row[idx[f]] || null; });
      if (rec.avaliacao_ifood) rec.avaliacao_ifood = parseFloat(rec.avaliacao_ifood) || null;
      return rec;
    }).filter(r => r.nome && r.cidade && r.estado && r.segmento);

    // batch in groups of 50
    for (let i = 0; i < records.length; i += 50) {
      const chunk = records.slice(i, i + 50);
      const { error } = await supabase.from('prospects').insert(chunk);
      if (error) err += chunk.length;
      else ok += chunk.length;
    }
    const skipped = csvRows.length - records.length;
    setCsvResult({ ok, err, skipped });
    setCsvImporting(false);
    if (ok > 0) onToast(`${ok} prospects importados com sucesso`, 'success');
    if (err > 0) onToast(`${err} com erro`, 'error');
  };

  const handleFormChange = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  const submitForm = async () => {
    if (!form.nome || !form.cidade || !form.estado || !form.segmento) {
      onToast('Preencha os campos obrigatórios: nome, cidade, estado, segmento', 'error');
      return;
    }
    setFormLoading(true);
    const rec = {
      tenant_id: tenantDbId, fonte: 'manual',
      nome: form.nome, cidade: form.cidade, estado: form.estado, segmento: form.segmento,
      instagram: form.instagram || null, whatsapp: form.whatsapp || null,
      site: form.site || null, ifood_link: form.ifood_link || null,
      avaliacao_ifood: form.avaliacao_ifood ? parseFloat(form.avaliacao_ifood) : null,
      cnpj: form.cnpj || null,
    };
    const { error } = await supabase.from('prospects').insert(rec);
    setFormLoading(false);
    if (error) { onToast(error.message, 'error'); return; }
    onToast(`${form.nome} adicionado com sucesso`, 'success');
    setForm({ nome: '', cidade: '', estado: '', segmento: '', instagram: '', whatsapp: '', site: '', ifood_link: '', avaliacao_ifood: '', num_avaliacoes: '', cnpj: '' });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>

      {/* CSV */}
      <div>
        <h3 style={{ margin: '0 0 14px', fontSize: 15, fontWeight: 700, color: 'rgba(255,255,255,0.8)' }}>Importar via CSV</h3>
        <div style={{ padding: 16, border: '2px dashed rgba(255,255,255,0.12)', borderRadius: 10, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p style={{ margin: 0, fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>
            Colunas obrigatórias: <strong style={{ color: 'rgba(255,255,255,0.7)' }}>nome, cidade, estado, segmento</strong>
            {' '} · opcionais: instagram, whatsapp, site, ifood_link, avaliacao_ifood, cnpj
          </p>
          <input type="file" accept=".csv" onChange={handleFileChange}
            style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)' }} />

          {/* Preview */}
          {csvHeaders.length > 0 && (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', fontSize: 12, width: '100%', minWidth: 400 }}>
                <thead>
                  <tr>
                    {csvHeaders.map(h => (
                      <th key={h} style={{ padding: '5px 10px', background: 'rgba(255,255,255,0.06)', borderBottom: '1px solid rgba(255,255,255,0.08)', textAlign: 'left', color: 'rgba(255,255,255,0.6)', fontWeight: 700 }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {csvRows.slice(0, 5).map((row, ri) => (
                    <tr key={ri}>
                      {row.map((cell, ci) => (
                        <td key={ci} style={{ padding: '5px 10px', borderBottom: '1px solid rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.7)', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {csvRows.length > 5 && (
                <p style={{ margin: '6px 0 0', fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>…e mais {csvRows.length - 5} linhas</p>
              )}
            </div>
          )}

          {csvRows.length > 0 && (
            <button disabled={csvImporting} onClick={importCSV}
              style={{ ...btnBase, padding: '10px 20px', background: csvImporting ? 'rgba(255,255,255,0.06)' : SOFIA_COLOR, color: csvImporting ? 'rgba(255,255,255,0.3)' : '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: csvImporting ? 'not-allowed' : 'pointer', alignSelf: 'flex-start' }}>
              {csvImporting ? <><Spinner /> Importando…</> : `Importar ${csvRows.length} prospects`}
            </button>
          )}

          {csvResult && (
            <div style={{ padding: '10px 14px', background: 'rgba(255,255,255,0.04)', borderRadius: 8, fontSize: 13 }}>
              <span style={{ color: '#16a34a', fontWeight: 600 }}>✓ {csvResult.ok} importados</span>
              {csvResult.err > 0 && <span style={{ color: '#dc2626', marginLeft: 12, fontWeight: 600 }}>✕ {csvResult.err} com erro</span>}
              {csvResult.skipped > 0 && <span style={{ color: '#D97706', marginLeft: 12 }}>{csvResult.skipped} ignorados (campos obrigatórios ausentes)</span>}
            </div>
          )}
        </div>
      </div>

      {/* Formulário manual */}
      <div>
        <h3 style={{ margin: '0 0 14px', fontSize: 15, fontWeight: 700, color: 'rgba(255,255,255,0.8)' }}>Adicionar manualmente</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {/* obrigatórios */}
          <div>
            <label style={labelStyle}>Nome *</label>
            <input style={inputStyle} value={form.nome} onChange={e => handleFormChange('nome', e.target.value)} placeholder="Ex: Hamburgão do Zé" />
          </div>
          <div>
            <label style={labelStyle}>Cidade *</label>
            <input style={inputStyle} value={form.cidade} onChange={e => handleFormChange('cidade', e.target.value)} placeholder="São Paulo" />
          </div>
          <div>
            <label style={labelStyle}>Estado *</label>
            <select style={inputStyle} value={form.estado} onChange={e => handleFormChange('estado', e.target.value)}>
              <option value="">Selecionar…</option>
              {ESTADOS_BR.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Segmento *</label>
            <select style={inputStyle} value={form.segmento} onChange={e => handleFormChange('segmento', e.target.value)}>
              <option value="">Selecionar…</option>
              {SEGMENTOS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          {/* opcionais */}
          <div>
            <label style={labelStyle}>Instagram</label>
            <input style={inputStyle} value={form.instagram} onChange={e => handleFormChange('instagram', e.target.value)} placeholder="@usuario" />
          </div>
          <div>
            <label style={labelStyle}>WhatsApp</label>
            <input style={inputStyle} value={form.whatsapp} onChange={e => handleFormChange('whatsapp', e.target.value)} placeholder="11999999999" />
          </div>
          <div>
            <label style={labelStyle}>Site</label>
            <input style={inputStyle} value={form.site} onChange={e => handleFormChange('site', e.target.value)} placeholder="https://..." />
          </div>
          <div>
            <label style={labelStyle}>Link iFood</label>
            <input style={inputStyle} value={form.ifood_link} onChange={e => handleFormChange('ifood_link', e.target.value)} placeholder="https://ifood.com.br/..." />
          </div>
          <div>
            <label style={labelStyle}>Nota iFood</label>
            <input style={inputStyle} type="number" step="0.1" min="0" max="5" value={form.avaliacao_ifood} onChange={e => handleFormChange('avaliacao_ifood', e.target.value)} placeholder="4.5" />
          </div>
          <div>
            <label style={labelStyle}>CNPJ</label>
            <input style={inputStyle} value={form.cnpj} onChange={e => handleFormChange('cnpj', e.target.value)} placeholder="00.000.000/0001-00" />
          </div>
        </div>

        <button disabled={formLoading} onClick={submitForm}
          style={{ marginTop: 16, ...btnBase, padding: '10px 24px', background: formLoading ? 'rgba(255,255,255,0.06)' : SOFIA_COLOR, color: formLoading ? 'rgba(255,255,255,0.3)' : '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: formLoading ? 'not-allowed' : 'pointer' }}>
          {formLoading ? <><Spinner /> Salvando…</> : 'Adicionar prospect'}
        </button>
      </div>
    </div>
  );
}

// ── Tab 3: Abordagens ─────────────────────────────────────────────────────────
function AbordagensTab({ tenantDbId, onToast }) {
  const [abordagens, setAbordagens] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalId, setModalId] = useState(null);
  const [modalText, setModalText] = useState('');
  const [modalEditing, setModalEditing] = useState(false);

  const load = useCallback(async () => {
    if (!tenantDbId) return;
    setLoading(true);
    // RLS via prospect_id filtra por tenant automaticamente; passamos tenant_id como fallback
    const { data } = await supabase.from('prospect_abordagens')
      .select('*, prospects(nome, cidade, estado)')
      .order('created_at', { ascending: false })
      .limit(50);
    setAbordagens(data || []);
    setLoading(false);
  }, [tenantDbId]);

  useEffect(() => { load(); }, [load]);

  const openModal = (a) => {
    setModalId(a.id);
    setModalText(a.texto || '');
    setModalEditing(false);
  };

  const modalAbord = abordagens.find(a => a.id === modalId);

  const updateStatus = async (id, newStatus) => {
    const { error } = await supabase.from('prospect_abordagens').update({ status: newStatus }).eq('id', id);
    if (error) { onToast(error.message, 'error'); return; }
    setAbordagens(prev => prev.map(a => a.id === id ? { ...a, status: newStatus } : a));
    if (modalId === id) setModalId(null);
    onToast(newStatus === 'aprovada' ? 'Abordagem aprovada' : 'Abordagem descartada', 'success');
  };

  const saveModal = async () => {
    const { error } = await supabase.from('prospect_abordagens').update({ texto: modalText }).eq('id', modalId);
    if (error) { onToast(error.message, 'error'); return; }
    setAbordagens(prev => prev.map(a => a.id === modalId ? { ...a, texto: modalText } : a));
    setModalEditing(false);
    onToast('Salvo', 'success');
  };

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 24, color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>
      <Spinner /> Carregando abordagens…
    </div>
  );
  if (!abordagens.length) return (
    <div style={{ textAlign: 'center', padding: '48px 24px', color: 'rgba(255,255,255,0.4)' }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>✉️</div>
      <p style={{ fontSize: 14 }}>Nenhuma abordagem gerada ainda.</p>
    </div>
  );

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {abordagens.map(a => {
          const nome = a.prospects?.nome || '—';
          const local = [a.prospects?.cidade, a.prospects?.estado].filter(Boolean).join(', ');
          const isRascunho = a.status === 'rascunho';
          return (
            <div key={a.id} style={{ ...cardStyle, borderLeft: `3px solid ${isRascunho ? '#D97706' : 'rgba(255,255,255,0.07)'}` }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,0.88)' }}>{nome}</div>
                  {local && <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 1 }}>{local}</div>}
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  <CanalBadge canal={a.canal} />
                  <AbordStatusBadge status={a.status} />
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', alignSelf: 'center' }}>
                    {new Date(a.created_at).toLocaleDateString('pt-BR')}
                  </span>
                </div>
              </div>

              {/* Preview */}
              {a.texto && (
                <p style={{ margin: '0 0 10px', fontSize: 12, color: 'rgba(255,255,255,0.6)', lineHeight: 1.5 }}>
                  {a.texto.slice(0, 120)}{a.texto.length > 120 ? '…' : ''}
                </p>
              )}

              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button onClick={() => openModal(a)}
                  style={{ ...btnBase, padding: '5px 12px', background: `${SOFIA_COLOR}18`, border: `1px solid ${SOFIA_COLOR}33`, color: SOFIA_COLOR }}>
                  Ver completo
                </button>
                {isRascunho && (
                  <>
                    <button onClick={() => updateStatus(a.id, 'aprovada')}
                      style={{ ...btnBase, padding: '5px 12px', background: 'rgba(22,163,74,0.15)', border: '1px solid rgba(22,163,74,0.3)', color: '#16a34a' }}>
                      ✓ Aprovar
                    </button>
                    <button onClick={() => updateStatus(a.id, 'sem_resposta')}
                      style={{ ...btnBase, padding: '5px 12px', background: 'rgba(220,38,38,0.1)', border: '1px solid rgba(220,38,38,0.25)', color: '#dc2626' }}>
                      ✕ Rejeitar
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal */}
      {modalId && modalAbord && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div onClick={() => setModalId(null)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.65)' }} />
          <div style={{
            position: 'relative', width: 520, maxWidth: '95vw', maxHeight: '80vh',
            background: '#12121f', border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 14, display: 'flex', flexDirection: 'column', overflow: 'hidden',
          }}>
            <div style={{ padding: '18px 20px 14px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'rgba(255,255,255,0.9)' }}>{modalAbord.prospects?.nome || '—'}</div>
                <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                  <CanalBadge canal={modalAbord.canal} />
                  <AbordStatusBadge status={modalAbord.status} />
                </div>
              </div>
              <button onClick={() => setModalId(null)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: 22 }}>×</button>
            </div>
            <div style={{ padding: 20, overflowY: 'auto', flex: 1 }}>
              {modalEditing ? (
                <textarea
                  style={{ ...inputStyle, minHeight: 200, resize: 'vertical' }}
                  value={modalText} onChange={e => setModalText(e.target.value)} />
              ) : (
                <p style={{ margin: 0, fontSize: 13, color: 'rgba(255,255,255,0.82)', lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>
                  {modalAbord.texto || '(sem texto)'}
                </p>
              )}
            </div>
            <div style={{ padding: '14px 20px', borderTop: '1px solid rgba(255,255,255,0.08)', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {modalEditing ? (
                <>
                  <button onClick={saveModal} style={{ ...btnBase, padding: '8px 16px', background: 'rgba(22,163,74,0.15)', border: '1px solid rgba(22,163,74,0.3)', color: '#16a34a' }}>Salvar</button>
                  <button onClick={() => { setModalEditing(false); setModalText(modalAbord.texto || ''); }} style={{ ...btnBase, padding: '8px 16px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.5)' }}>Cancelar</button>
                </>
              ) : (
                <>
                  <button onClick={() => setModalEditing(true)} style={{ ...btnBase, padding: '8px 16px', background: `${SOFIA_COLOR}18`, border: `1px solid ${SOFIA_COLOR}33`, color: SOFIA_COLOR }}>Editar</button>
                  {modalAbord.status === 'rascunho' && (
                    <>
                      <button onClick={() => updateStatus(modalId, 'aprovada')} style={{ ...btnBase, padding: '8px 16px', background: 'rgba(22,163,74,0.15)', border: '1px solid rgba(22,163,74,0.3)', color: '#16a34a' }}>✓ Aprovar</button>
                      <button onClick={() => updateStatus(modalId, 'sem_resposta')} style={{ ...btnBase, padding: '8px 16px', background: 'rgba(220,38,38,0.1)', border: '1px solid rgba(220,38,38,0.25)', color: '#dc2626' }}>✕ Rejeitar</button>
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
const TABS = ['Prospects', 'Importar', 'Abordagens'];

export default function SofiaScreen({ tenantDbId, userId }) {
  const [activeTab, setActiveTab] = useState(0);
  const [toast, setToast] = useState(null);

  const showToast = useCallback((message, type = 'info') => {
    setToast({ message, type, key: Date.now() });
  }, []);

  return (
    <div style={{ padding: '24px', maxWidth: 960, margin: '0 auto' }}>
      {/* header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <SofiaAvatar size={42} />
        <div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: 'rgba(255,255,255,0.9)' }}>SOFIA · SDR & Prospecção</h1>
          <p style={{ margin: 0, fontSize: 13, color: 'rgba(255,255,255,0.45)' }}>Pesquisa, qualifica e gera abordagens para novos clientes de delivery</p>
        </div>
      </div>

      {/* tab bar */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 24, background: 'rgba(255,255,255,0.04)', padding: 4, borderRadius: 10 }}>
        {TABS.map((t, i) => (
          <button key={t} onClick={() => setActiveTab(i)} style={{
            flex: 1, padding: '8px 4px', borderRadius: 7, border: 'none', cursor: 'pointer',
            fontSize: 13, fontWeight: 600,
            background: activeTab === i ? SOFIA_COLOR : 'transparent',
            color: activeTab === i ? '#fff' : 'rgba(255,255,255,0.5)',
            transition: 'all 0.15s',
          }}>
            {t}
          </button>
        ))}
      </div>

      {/* tab content */}
      {activeTab === 0 && <ProspectsTab tenantDbId={tenantDbId} userId={userId} onToast={showToast} />}
      {activeTab === 1 && <ImportarTab tenantDbId={tenantDbId} onToast={showToast} />}
      {activeTab === 2 && <AbordagensTab tenantDbId={tenantDbId} onToast={showToast} />}

      {/* toast */}
      {toast && (
        <Toast key={toast.key} message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}

      {/* spin keyframe */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
