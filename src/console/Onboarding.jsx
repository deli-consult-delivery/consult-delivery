import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase.js';
import { Ico } from './CvIcons.jsx';

const PAGE_SIZE = 20;
const MARCOS = ['D1', 'D7', 'D30', 'D60', 'D90'];

const MARCOS_INFO = {
  D1:  { label: 'Dia 1',  desc: 'Configuração inicial' },
  D7:  { label: 'Dia 7',  desc: 'Primeira semana' },
  D30: { label: 'Dia 30', desc: 'Primeiro mês' },
  D60: { label: 'Dia 60', desc: 'Dois meses' },
  D90: { label: 'Dia 90', desc: 'Trimestre — renovação e upsell' },
};

const STATUS_META = {
  pendente:     { label: 'Pendente',     color: 'var(--tx2)',   bg: 'var(--panel)'      },
  em_andamento: { label: 'Em andamento', color: 'var(--tx)',    bg: 'var(--red-soft)'   },
  concluido:    { label: 'Concluído',    color: 'var(--green)', bg: 'var(--green-soft)' },
};

function StatusBadge({ status }) {
  const m = STATUS_META[status] || STATUS_META.pendente;
  return (
    <span className="cv2-bdg" style={{ color: m.color, background: m.bg, fontSize: 11, fontWeight: 600 }}>
      {m.label}
    </span>
  );
}

function ProgressBar({ done, total, style }) {
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, ...style }}>
      <div style={{ flex: 1, height: 6, background: 'var(--line)', borderRadius: 3 }}>
        <div style={{ width: `${pct}%`, height: '100%', borderRadius: 3, background: pct === 100 ? 'var(--green)' : 'var(--red)', transition: 'width 0.3s' }} />
      </div>
      <span style={{ fontSize: 11, color: 'var(--tx2)', minWidth: 30 }}>{pct}%</span>
    </div>
  );
}

function Toast({ msg, onDismiss }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 3000);
    return () => clearTimeout(t);
  }, [onDismiss]);
  return (
    <div style={{ position: 'fixed', bottom: 24, right: 24, background: 'var(--ink)', color: 'var(--bg)', padding: '10px 16px', borderRadius: 8, fontSize: 13, zIndex: 100, boxShadow: '0 4px 16px rgba(0,0,0,.18)' }}>
      {msg}
    </div>
  );
}

function OnboardingDetalheView({ tenantDbId, customerId, customerName, onBack }) {
  const [checklists, setChecklists] = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [saving,     setSaving]     = useState(null);
  const [notas,      setNotas]      = useState({});
  const [toast,      setToast]      = useState(null);

  const load = useCallback(() => {
    if (!tenantDbId || !customerId) return;
    let cancelled = false;
    setLoading(true);
    supabase
      .from('onboarding_checklists')
      .select('id, marco, status, concluido_em, notas, agendado_para')
      .eq('tenant_id', tenantDbId)
      .eq('customer_id', customerId)
      .order('marco')
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) { setToast('Erro ao carregar marcos.'); setLoading(false); return; }
        const rows = data || [];
        setChecklists(rows);
        const m = {};
        for (const r of rows) m[r.marco] = r.notas || '';
        setNotas(m);
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [tenantDbId, customerId]);

  useEffect(() => {
    const cleanup = load();
    return cleanup;
  }, [load]);

  async function concluir(item) {
    setSaving(item.marco);
    const { error } = await supabase
      .from('onboarding_checklists')
      .update({ status: 'concluido', concluido_em: new Date().toISOString(), notas: notas[item.marco] || null })
      .eq('id', item.id);
    if (error) {
      setToast('Erro ao concluir marco.');
      setSaving(null);
      return;
    }
    setToast('Marco marcado como concluído.');
    load();
    setSaving(null);
  }

  async function salvarNotas(item) {
    await supabase
      .from('onboarding_checklists')
      .update({ notas: notas[item.marco] || null })
      .eq('id', item.id);
  }

  const done  = checklists.filter(c => c.status === 'concluido').length;
  const total = checklists.length;
  const pct   = total === 0 ? 0 : Math.round((done / total) * 100);

  return (
    <div>
      {toast && <Toast msg={toast} onDismiss={() => setToast(null)} />}

      <button className="cv2-btn sec" onClick={onBack} style={{ marginBottom: 20, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        ← Voltar
      </button>

      <div className="cv2-spread" style={{ alignItems: 'flex-start', marginBottom: 8 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: 'var(--tx)' }}>{customerName}</h1>
          <div className="cv2-sub" style={{ marginTop: 4 }}>Playbook de onboarding</div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: 26, fontWeight: 700, color: pct === 100 ? 'var(--green)' : 'var(--tx)' }}>{pct}%</div>
          <div style={{ fontSize: 12, color: 'var(--tx2)' }}>{done}/{total} marcos</div>
        </div>
      </div>

      <div style={{ height: 8, background: 'var(--line)', borderRadius: 4, marginBottom: 12 }}>
        <div style={{ width: `${pct}%`, height: '100%', borderRadius: 4, background: pct === 100 ? 'var(--green)' : 'var(--red)', transition: 'width 0.4s' }} />
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 28 }}>
        {MARCOS.map(m => {
          const c  = checklists.find(x => x.marco === m);
          const st = c?.status || 'pendente';
          const meta = STATUS_META[st] || STATUS_META.pendente;
          return (
            <div key={m} style={{ flex: 1, textAlign: 'center', padding: '5px 4px', borderRadius: 8, background: meta.bg, border: `1px solid ${meta.color}33` }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: meta.color }}>{m}</span>
            </div>
          );
        })}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--tx2)' }}>Carregando...</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {MARCOS.map((marco, idx) => {
            const item = checklists.find(c => c.marco === marco);
            if (!item) return null;

            const st       = item.status;
            const meta     = STATUS_META[st] || STATUS_META.pendente;
            const info     = MARCOS_INFO[marco];
            const concluido = st === 'concluido';

            return (
              <div key={marco}>
                {idx > 0 && (
                  <div style={{ paddingLeft: 17, marginBottom: 0 }}>
                    <div style={{ width: 2, height: 12, background: 'var(--line)' }} />
                  </div>
                )}
                <div className="cv2-card" style={{ padding: 20 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                      background: concluido ? 'var(--green-soft)' : 'var(--panel)',
                      border: `2px solid ${concluido ? 'var(--green)' : 'var(--line)'}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {concluido
                        ? <Ico name="i-check" size={18} />
                        : <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--tx2)' }}>{marco}</span>
                      }
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                        <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--tx)' }}>{info.label} — {info.desc}</span>
                        <StatusBadge status={st} />
                      </div>

                      {item.agendado_para && (
                        <div style={{ fontSize: 12, color: 'var(--tx2)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                          <Ico name="i-clock" size={12} />
                          Agendado para {new Date(item.agendado_para + 'T12:00:00').toLocaleDateString('pt-BR')}
                        </div>
                      )}
                      {item.concluido_em && (
                        <div style={{ fontSize: 12, color: 'var(--green)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                          <Ico name="i-check" size={12} />
                          Concluído em {new Date(item.concluido_em).toLocaleDateString('pt-BR')}
                        </div>
                      )}

                      <textarea
                        value={notas[marco] || ''}
                        onChange={e => setNotas(n => ({ ...n, [marco]: e.target.value }))}
                        onBlur={() => salvarNotas(item)}
                        placeholder="Notas do marco..."
                        rows={2}
                        style={{
                          width: '100%', marginTop: 8, padding: '8px 10px', boxSizing: 'border-box',
                          background: 'var(--bg)', border: '1px solid var(--line)',
                          borderRadius: 8, color: 'var(--tx)', fontSize: 13, resize: 'vertical',
                          fontFamily: 'inherit', outline: 'none',
                        }}
                      />

                      {!concluido && (
                        <button
                          className="cv2-btn"
                          onClick={() => concluir(item)}
                          disabled={saving === marco}
                          style={{ marginTop: 10, display: 'inline-flex', alignItems: 'center', gap: 6, opacity: saving === marco ? 0.7 : 1 }}
                        >
                          <Ico name="i-check" size={14} />
                          {saving === marco ? 'Salvando...' : 'Marcar concluído'}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function Onboarding({ tenantDbId, userId }) {
  const [rows,         setRows]         = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [search,       setSearch]       = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterMarco,  setFilterMarco]  = useState('');
  const [page,         setPage]         = useState(0);
  const [selected,     setSelected]     = useState(null);
  const [toast,        setToast]        = useState(null);

  const load = useCallback(() => {
    if (!tenantDbId) return;
    let cancelled = false;
    setLoading(true);
    supabase
      .from('onboarding_checklists')
      .select('id, customer_id, marco, status, agendado_para, customers(id, name)')
      .eq('tenant_id', tenantDbId)
      .order('marco')
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) { setToast('Erro ao carregar: ' + error.message); setLoading(false); return; }
        const map = {};
        for (const row of data || []) {
          const cid = row.customer_id;
          if (!map[cid]) {
            map[cid] = {
              customer_id:   cid,
              customer_name: row.customers?.name || 'Cliente sem nome',
              marcos:        {},
            };
          }
          map[cid].marcos[row.marco] = row;
        }
        setRows(Object.values(map));
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [tenantDbId]);

  useEffect(() => {
    const cleanup = load();
    return cleanup;
  }, [load]);

  function currentMarco(marcos) {
    for (const m of MARCOS) {
      if (!marcos[m] || marcos[m].status !== 'concluido') return m;
    }
    return 'D90';
  }

  function progressOf(marcos) {
    const done = MARCOS.filter(m => marcos[m]?.status === 'concluido').length;
    return { done, total: MARCOS.length };
  }

  function overallStatus(marcos) {
    const statuses = MARCOS.map(m => marcos[m]?.status || 'pendente');
    if (statuses.every(s => s === 'concluido'))  return 'concluido';
    if (statuses.some(s => s !== 'pendente'))    return 'em_andamento';
    return 'pendente';
  }

  if (selected) {
    return (
      <OnboardingDetalheView
        tenantDbId={tenantDbId}
        customerId={selected.customer_id}
        customerName={selected.customer_name}
        onBack={() => { setSelected(null); load(); }}
      />
    );
  }

  const filtered = rows.filter(r => {
    if (search && !r.customer_name.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterStatus && overallStatus(r.marcos) !== filterStatus) return false;
    if (filterMarco  && currentMarco(r.marcos)  !== filterMarco)  return false;
    return true;
  });

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated  = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <div>
      {toast && <Toast msg={toast} onDismiss={() => setToast(null)} />}

      <div className="cv2-spread" style={{ marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: 'var(--tx)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Ico name="i-grid" size={20} /> Onboarding
          </h1>
          <div className="cv2-sub" style={{ marginTop: 4 }}>Playbook D1 / D7 / D30 / D60 / D90 por cliente</div>
        </div>
        <span style={{ fontSize: 13, color: 'var(--tx2)' }}>{filtered.length} cliente{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 18, flexWrap: 'wrap' }}>
        <input
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(0); }}
          placeholder="Buscar cliente..."
          style={{ flex: 1, minWidth: 180, padding: '8px 12px', background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: 8, color: 'var(--tx)', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
        />
        <select
          value={filterStatus}
          onChange={e => { setFilterStatus(e.target.value); setPage(0); }}
          style={{ padding: '8px 12px', background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: 8, color: 'var(--tx)', fontSize: 13, cursor: 'pointer' }}
        >
          <option value="">Todos os status</option>
          <option value="pendente">Pendente</option>
          <option value="em_andamento">Em andamento</option>
          <option value="concluido">Concluído</option>
        </select>
        <select
          value={filterMarco}
          onChange={e => { setFilterMarco(e.target.value); setPage(0); }}
          style={{ padding: '8px 12px', background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: 8, color: 'var(--tx)', fontSize: 13, cursor: 'pointer' }}
        >
          <option value="">Todos os marcos</option>
          {MARCOS.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--tx2)' }}>Carregando...</div>
      ) : filtered.length === 0 ? (
        <div className="cv2-card" style={{ textAlign: 'center', padding: 60, color: 'var(--tx2)' }}>
          <Ico name="i-users" size={32} />
          <p style={{ marginTop: 12 }}>Nenhum cliente em onboarding</p>
        </div>
      ) : (
        <div className="cv2-card" style={{ padding: 0, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--line)' }}>
                {['Cliente', 'Progresso', 'Marco atual', 'Status', ''].map(h => (
                  <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--tx2)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paginated.map((r, i) => {
                const { done, total } = progressOf(r.marcos);
                const curr = currentMarco(r.marcos);
                const st   = overallStatus(r.marcos);
                return (
                  <tr
                    key={r.customer_id}
                    style={{ borderBottom: i < paginated.length - 1 ? '1px solid var(--line)' : 'none', cursor: 'pointer' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--panel)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    onClick={() => setSelected(r)}
                    onKeyDown={e => e.key === 'Enter' && setSelected(r)}
                    tabIndex={0}
                  >
                    <td style={{ padding: '14px 16px', color: 'var(--tx)', fontWeight: 500, fontSize: 14 }}>{r.customer_name}</td>
                    <td style={{ padding: '14px 16px', minWidth: 150 }}>
                      <ProgressBar done={done} total={total} />
                      <span style={{ fontSize: 11, color: 'var(--tx2)', marginTop: 2, display: 'block' }}>{done}/{total} marcos</span>
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--red)' }}>{curr}</span>
                    </td>
                    <td style={{ padding: '14px 16px' }}><StatusBadge status={st} /></td>
                    <td style={{ padding: '14px 16px', color: 'var(--tx2)', fontSize: 16 }}>›</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, marginTop: 20 }}>
          <button
            className="cv2-btn sec"
            onClick={() => setPage(p => Math.max(0, p - 1))}
            disabled={page === 0}
          >
            ← Anterior
          </button>
          <span style={{ fontSize: 13, color: 'var(--tx2)' }}>Página {page + 1} de {totalPages}</span>
          <button
            className="cv2-btn sec"
            onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
          >
            Próxima →
          </button>
        </div>
      )}
    </div>
  );
}
