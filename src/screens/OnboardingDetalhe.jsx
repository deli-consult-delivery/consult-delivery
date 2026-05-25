import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase.js';
import Icon from '../components/Icon.jsx';

const MARCOS_INFO = {
  D1:  { label: 'Dia 1',   desc: 'Configuração inicial' },
  D7:  { label: 'Dia 7',   desc: 'Primeira semana' },
  D30: { label: 'Dia 30',  desc: 'Primeiro mês' },
  D60: { label: 'Dia 60',  desc: 'Dois meses' },
  D90: { label: 'Dia 90',  desc: 'Trimestre — renovação e upsell' },
};

const STATUS_META = {
  pendente:     { label: 'Pendente',     color: '#6B7280', bg: 'rgba(107,114,128,0.12)' },
  em_andamento: { label: 'Em andamento', color: '#2563EB', bg: 'rgba(37,99,235,0.12)'  },
  concluido:    { label: 'Concluído',    color: '#059669', bg: 'rgba(5,150,105,0.12)'  },
};

const ORDEM = ['D1', 'D7', 'D30', 'D60', 'D90'];

export default function OnboardingDetalhe({ tenantDbId, customerId, customerName, onBack }) {
  const [checklists, setChecklists] = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [saving,     setSaving]     = useState(null);
  const [notas,      setNotas]      = useState({});

  useEffect(() => {
    if (!tenantDbId || !customerId) return;
    load();
  }, [tenantDbId, customerId]);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from('onboarding_checklists')
      .select('id, marco, status, concluido_em, notas, agendado_para')
      .eq('tenant_id', tenantDbId)
      .eq('customer_id', customerId)
      .order('marco');

    setChecklists(data || []);
    const m = {};
    for (const r of data || []) m[r.marco] = r.notas || '';
    setNotas(m);
    setLoading(false);
  }

  async function concluir(item) {
    setSaving(item.marco);
    await supabase
      .from('onboarding_checklists')
      .update({ status: 'concluido', concluido_em: new Date().toISOString(), notas: notas[item.marco] || null })
      .eq('id', item.id);
    await load();
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
    <div style={{ padding: 24, maxWidth: 760, margin: '0 auto' }}>
      {/* Voltar */}
      <button
        onClick={onBack}
        style={{ background: 'none', border: 'none', color: '#6B7280', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, marginBottom: 20, padding: 0 }}
      >
        <Icon name="chevleft" size={16} /> Voltar
      </button>

      {/* Header do cliente */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 8 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#fff', margin: 0 }}>{customerName}</h1>
          <p style={{ fontSize: 13, color: '#9CA3AF', margin: '4px 0 0' }}>Playbook de onboarding</p>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: 26, fontWeight: 700, color: pct === 100 ? '#059669' : '#fff' }}>{pct}%</div>
          <div style={{ fontSize: 12, color: '#6B7280' }}>{done}/{total} marcos</div>
        </div>
      </div>

      {/* Barra de progresso geral */}
      <div style={{ height: 8, background: 'rgba(255,255,255,0.08)', borderRadius: 4, marginBottom: 12 }}>
        <div style={{ width: `${pct}%`, height: '100%', borderRadius: 4, background: pct === 100 ? '#059669' : '#B70C00', transition: 'width 0.4s' }} />
      </div>

      {/* Mini-pills rápidos */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 28 }}>
        {ORDEM.map(m => {
          const c  = checklists.find(x => x.marco === m);
          const st = c?.status || 'pendente';
          return (
            <div key={m} style={{
              flex: 1, textAlign: 'center', padding: '5px 4px', borderRadius: 8,
              background: st === 'concluido' ? 'rgba(5,150,105,0.15)' : st === 'em_andamento' ? 'rgba(37,99,235,0.12)' : 'rgba(255,255,255,0.05)',
              border: `1px solid ${st === 'concluido' ? 'rgba(5,150,105,0.3)' : st === 'em_andamento' ? 'rgba(37,99,235,0.3)' : 'rgba(255,255,255,0.08)'}`,
            }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: st === 'concluido' ? '#059669' : st === 'em_andamento' ? '#2563EB' : '#6B7280' }}>{m}</span>
            </div>
          );
        })}
      </div>

      {/* Timeline */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#6B7280' }}>Carregando...</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {ORDEM.map((marco, idx) => {
            const item = checklists.find(c => c.marco === marco);
            if (!item) return null;

            const st   = item.status;
            const meta = STATUS_META[st] || STATUS_META.pendente;
            const info = MARCOS_INFO[marco];
            const concluido = st === 'concluido';

            return (
              <div key={marco}>
                {/* Linha conectora */}
                {idx > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'flex-start', paddingLeft: 17, marginBottom: 0 }}>
                    <div style={{ width: 2, height: 12, background: 'rgba(255,255,255,0.08)' }} />
                  </div>
                )}
                <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 20 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                    {/* Ícone de status */}
                    <div style={{
                      width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                      background: concluido ? 'rgba(5,150,105,0.2)' : 'rgba(255,255,255,0.06)',
                      border: `2px solid ${concluido ? '#059669' : 'rgba(255,255,255,0.15)'}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {concluido
                        ? <Icon name="checkcircle" size={18} style={{ color: '#059669' }} />
                        : <span style={{ fontSize: 10, fontWeight: 700, color: '#9CA3AF' }}>{marco}</span>
                      }
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      {/* Título + badge */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                        <span style={{ fontSize: 15, fontWeight: 600, color: '#fff' }}>{info.label} — {info.desc}</span>
                        <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 4, color: meta.color, background: meta.bg }}>{meta.label}</span>
                      </div>

                      {/* Metadados */}
                      {item.agendado_para && (
                        <div style={{ fontSize: 12, color: '#9CA3AF', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                          <Icon name="calendar" size={12} />
                          Agendado para {new Date(item.agendado_para + 'T12:00:00').toLocaleDateString('pt-BR')}
                        </div>
                      )}
                      {item.concluido_em && (
                        <div style={{ fontSize: 12, color: '#059669', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                          <Icon name="check" size={12} />
                          Concluído em {new Date(item.concluido_em).toLocaleDateString('pt-BR')}
                        </div>
                      )}

                      {/* Notas */}
                      <textarea
                        value={notas[marco] || ''}
                        onChange={e => setNotas(n => ({ ...n, [marco]: e.target.value }))}
                        onBlur={() => salvarNotas(item)}
                        placeholder="Notas do marco..."
                        rows={2}
                        style={{
                          width: '100%', marginTop: 8, padding: '8px 10px', boxSizing: 'border-box',
                          background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                          borderRadius: 8, color: '#fff', fontSize: 13, resize: 'vertical',
                          fontFamily: 'inherit', outline: 'none',
                        }}
                      />

                      {/* Botão concluir */}
                      {!concluido && (
                        <button
                          onClick={() => concluir(item)}
                          disabled={saving === marco}
                          style={{
                            marginTop: 10, padding: '7px 14px', background: '#B70C00', border: 'none',
                            borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 600,
                            cursor: saving === marco ? 'not-allowed' : 'pointer', opacity: saving === marco ? 0.7 : 1,
                            display: 'flex', alignItems: 'center', gap: 6,
                          }}
                        >
                          <Icon name="check" size={14} />
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
