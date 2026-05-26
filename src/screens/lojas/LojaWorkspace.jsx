import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase.js';
import Icon from '../../components/Icon.jsx';
import AtribuirConsultorModal from './AtribuirConsultorModal.jsx';
import TabIaEspecialista from './TabIaEspecialista.jsx';
import TabAnalises from './TabAnalises.jsx';

const BRIDGE = import.meta.env.VITE_BRIDGE_URL || 'https://bridge.consultdelivery.com.br';

const STATUS_COLORS = {
  onboarding: '#f59e0b',
  ativo: '#10b981', ativa: '#10b981',
  pausado: '#6b7280', pausada: '#6b7280',
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
const PAPEL_LABEL = { principal: 'Principal', colaborador: 'Colaborador', observador: 'Observador' };
const TABS = ['Visão Geral', 'Métricas', 'Consultores', 'Campanhas', 'Histórico', 'Tarefas', 'IA Especialista', 'Análises'];

const STATUS_TAREFA_LABEL = {
  rascunho: 'Rascunho',
  aguardando_envio: 'Ag. Envio',
  aguardando_aprovacao: 'Ag. Aprovação',
  aprovada: 'Aprovada',
  rejeitada: 'Rejeitada',
  em_execucao: 'Em Execução',
  aguardando_validacao: 'Ag. Validação',
  concluida: 'Concluída',
  cancelada: 'Cancelada',
};

const STATUS_TAREFA_COLOR = {
  rascunho: '#6b7280',
  aguardando_envio: '#6b7280',
  aguardando_aprovacao: '#f59e0b',
  aprovada: '#3b82f6',
  rejeitada: '#ef4444',
  em_execucao: '#f97316',
  aguardando_validacao: '#8b5cf6',
  concluida: '#10b981',
  cancelada: '#374151',
};

const BLOCO_LABEL = {
  identidade: 'Identidade', cardapio: 'Cardápio', operacao: 'Operação',
  avaliacoes: 'Avaliações', marketing: 'Marketing', suporte: 'Suporte',
};

const PRIORIDADE_LABEL = {
  quick_win: 'Quick Win', estrutural: 'Estrutural', material_cliente: 'Material Cliente',
};

const PRIORIDADE_COLOR = {
  quick_win: '#10b981', estrutural: '#3b82f6', material_cliente: '#f59e0b',
};

const BLOCOS_OPCOES = ['identidade', 'cardapio', 'operacao', 'avaliacoes', 'marketing', 'suporte'];
const PRIORIDADES_OPCOES = ['quick_win', 'estrutural', 'material_cliente'];

const METRIC_EMPTY = { data: '', faturamento: '', pedidos: '', avaliacao_media: '', fonte: 'manual' };

export default function LojaWorkspace({ tenantDbId, userId, go, lojaId }) {
  const [tab, setTab] = useState(0);
  const [loja, setLoja] = useState(null);
  const [loading, setLoading] = useState(true);
  const [consultores, setConsultores] = useState([]);
  const [metricas, setMetricas] = useState([]);
  const [showAtribuir, setShowAtribuir] = useState(false);
  const [metricForm, setMetricForm] = useState(METRIC_EMPTY);
  const [savingMetric, setSavingMetric] = useState(false);

  useEffect(() => {
    if (!lojaId) return;
    (async () => {
      setLoading(true);
      const { data } = await supabase.from('lojas').select('*').eq('id', lojaId).maybeSingle();
      setLoja(data);
      setLoading(false);
    })();
  }, [lojaId]);

  useEffect(() => {
    if (!lojaId || tab !== 1) return;
    loadMetricas();
  }, [lojaId, tab]);

  useEffect(() => {
    if (!lojaId || tab !== 2) return;
    loadConsultores();
  }, [lojaId, tab]);

  async function loadMetricas() {
    const { data } = await supabase
      .from('loja_metricas_snapshot')
      .select('*')
      .eq('loja_id', lojaId)
      .order('data', { ascending: false })
      .limit(30);
    setMetricas(data || []);
  }

  async function loadConsultores() {
    const { data: lc } = await supabase
      .from('loja_consultores')
      .select('user_id, papel')
      .eq('loja_id', lojaId)
      .eq('ativo', true)
      .order('papel');

    if (!lc?.length) { setConsultores([]); return; }

    const ids = lc.map(c => c.user_id);
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name, email')
      .in('id', ids);

    const byId = Object.fromEntries((profiles || []).map(p => [p.id, p]));
    setConsultores(lc.map(c => ({ ...c, profile: byId[c.user_id] || null })));
  }

  async function handleAddMetric(e) {
    e.preventDefault();
    if (!metricForm.data) return;
    setSavingMetric(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const payload = {
        data: metricForm.data,
        fonte: metricForm.fonte,
        ...(metricForm.faturamento && { faturamento: parseFloat(metricForm.faturamento) }),
        ...(metricForm.pedidos && { pedidos: parseInt(metricForm.pedidos, 10) }),
        ...(metricForm.avaliacao_media && { avaliacao_media: parseFloat(metricForm.avaliacao_media) }),
      };
      const res = await fetch(`${BRIDGE}/api/lojas/${lojaId}/metricas`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await res.text());
      setMetricForm(METRIC_EMPTY);
      loadMetricas();
    } catch (err) {
      alert('Erro ao salvar métrica: ' + err.message);
    } finally {
      setSavingMetric(false);
    }
  }

  async function removeConsultor(uid) {
    if (!window.confirm('Remover este consultor da loja?')) return;
    const { data: { session } } = await supabase.auth.getSession();
    await fetch(`${BRIDGE}/api/lojas/${lojaId}/consultores/${uid}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${session?.access_token}` },
    });
    loadConsultores();
  }

  if (loading) return <div style={{ padding: 24, color: '#9ca3af', fontSize: 14 }}>Carregando…</div>;
  if (!loja) return <div style={{ padding: 24, color: '#ef4444', fontSize: 14 }}>Loja não encontrada.</div>;

  const statusColor = STATUS_COLORS[loja.status] || '#6b7280';

  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: '0 auto' }}>
      {/* Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, fontSize: 13, color: '#6b7280' }}>
        <button
          onClick={() => go('list')}
          style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: 4, fontSize: 13 }}
        >
          <Icon name="building" size={14} /> Lojas
        </button>
        <span style={{ opacity: 0.4 }}>/</span>
        <span style={{ color: '#fff' }}>{loja.nome}</span>
      </div>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 22 }}>
        {loja.logo_url
          ? <img src={loja.logo_url} alt="" style={{ width: 52, height: 52, borderRadius: 10, objectFit: 'cover', flexShrink: 0 }} />
          : <div style={{ width: 52, height: 52, borderRadius: 10, background: '#2a2a2a', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Icon name="building" size={22} />
            </div>
        }
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: '#fff', margin: 0 }}>{loja.nome}</h1>
            <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: statusColor + '20', color: statusColor }}>
              {STATUS_LABEL[loja.status] || loja.status}
            </span>
            {loja.super_restaurante && (
              <span style={{ fontSize: 11, background: '#f59e0b20', color: '#f59e0b', borderRadius: 20, padding: '2px 8px', fontWeight: 600 }}>
                ⭐ Super Restaurante
              </span>
            )}
          </div>
          <div style={{ fontSize: 12, color: '#6b7280', marginTop: 3 }}>
            {[loja.segmento ? SEG_LABEL[loja.segmento] : null, loja.cidade, loja.estado].filter(Boolean).join(' · ') || 'Sem detalhes cadastrados'}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 2, borderBottom: '1px solid #2a2a2a', marginBottom: 22 }}>
        {TABS.map((t, i) => (
          <button
            key={t}
            onClick={() => setTab(i)}
            style={{
              background: 'none', border: 'none', padding: '8px 16px', cursor: 'pointer',
              fontSize: 13, fontWeight: tab === i ? 600 : 400,
              color: tab === i ? '#fff' : '#6b7280',
              borderBottom: tab === i ? '2px solid #B70C00' : '2px solid transparent',
              marginBottom: -1, transition: 'color 0.15s',
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 0 && <TabVisaoGeral loja={loja} lojaId={lojaId} />}
      {tab === 1 && (
        <TabMetricas
          metricas={metricas}
          form={metricForm}
          setForm={setMetricForm}
          onSubmit={handleAddMetric}
          saving={savingMetric}
        />
      )}
      {tab === 2 && (
        <TabConsultores
          consultores={consultores}
          onAtribuir={() => setShowAtribuir(true)}
          onRemove={removeConsultor}
        />
      )}
      {(tab === 3 || tab === 4) && <TabEmConstrucao nome={TABS[tab]} />}
      {tab === 5 && <TabTarefas lojaId={lojaId} />}
      {tab === 6 && <TabIaEspecialista lojaId={lojaId} userId={userId} />}
      {tab === 7 && <TabAnalises lojaId={lojaId} userId={userId} onGoToTarefas={(analiseId) => setTab(5)} />}

      {showAtribuir && (
        <AtribuirConsultorModal
          tenantDbId={tenantDbId}
          lojaId={lojaId}
          onClose={() => setShowAtribuir(false)}
          onAtribuido={() => { setShowAtribuir(false); loadConsultores(); }}
        />
      )}
    </div>
  );
}

// ── Tab sub-components ────────────────────────────────────────────────────────

function TabVisaoGeral({ loja, lojaId }) {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const res = await fetch(`${BRIDGE}/api/tarefas/loja/${lojaId}/relatorio`, {
          headers: { Authorization: `Bearer ${session?.access_token}` },
        });
        if (res.ok) setStats(await res.json());
      } catch {}
    })();
  }, [lojaId]);

  const rows = [
    ['Nome', loja.nome],
    ['Segmento', loja.segmento ? SEG_LABEL[loja.segmento] : null],
    ['Posicionamento', loja.posicionamento],
    ['Ticket médio', loja.ticket_medio ? `R$ ${parseFloat(loja.ticket_medio).toFixed(2)}` : null],
    ['Cidade / UF', [loja.cidade, loja.estado].filter(Boolean).join(' / ') || null],
    ['WhatsApp', loja.whatsapp],
    ['Link iFood', loja.ifood_url],
    ['Início da consultoria', loja.data_inicio_consultoria],
    ['Fim da consultoria', loja.data_fim_consultoria],
    ['Observações', loja.observacoes],
  ].filter(([, v]) => v);

  return (
    <div>
      {stats != null && (stats.totais?.total ?? 0) > 0 && (
        <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
          {[
            { label: 'Total de tarefas', value: stats.totais?.total || 0, color: '#6b7280' },
            { label: 'Concluídas', value: stats.totais?.por_status?.concluida || 0, color: '#10b981' },
            { label: 'Em execução', value: (stats.totais?.por_status?.em_execucao || 0) + (stats.totais?.por_status?.aguardando_validacao || 0), color: '#f97316' },
            { label: 'Pendentes', value: (stats.totais?.total || 0) - (stats.totais?.por_status?.concluida || 0) - (stats.totais?.por_status?.cancelada || 0) - (stats.totais?.por_status?.em_execucao || 0) - (stats.totais?.por_status?.aguardando_validacao || 0), color: '#f59e0b' },
          ].map(s => (
            <div key={s.label} style={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 10, padding: '10px 16px', display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: 11, color: '#6b7280' }}>{s.label}</span>
              <span style={{ fontSize: 22, fontWeight: 700, color: s.color }}>{s.value}</span>
            </div>
          ))}
        </div>
      )}
      {!rows.length ? (
        <div style={{ color: '#6b7280', fontSize: 14 }}>Nenhuma informação cadastrada.</div>
      ) : (
        <div style={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 12, overflow: 'hidden' }}>
          {rows.map(([label, value], i) => (
            <div key={label} style={{ display: 'flex', gap: 16, padding: '12px 16px', borderTop: i > 0 ? '1px solid #1f1f1f' : undefined }}>
              <div style={{ width: 160, flexShrink: 0, fontSize: 12, color: '#6b7280', paddingTop: 1 }}>{label}</div>
              <div style={{ fontSize: 13, color: '#e5e7eb', wordBreak: 'break-word' }}>
                {label === 'Link iFood'
                  ? <a href={value} target="_blank" rel="noreferrer" style={{ color: '#B70C00' }}>{value}</a>
                  : value}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TabMetricas({ metricas, form, setForm, onSubmit, saving }) {
  function set(k, v) { setForm(p => ({ ...p, [k]: v })); }

  return (
    <div>
      <form onSubmit={onSubmit} style={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 12, padding: 16, marginBottom: 20 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#9ca3af', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Adicionar métrica
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <Field label="Data *" width={130}>
            <input type="date" value={form.data} onChange={e => set('data', e.target.value)} required style={{ ...mini, width: 130 }} />
          </Field>
          <Field label="Faturamento (R$)" width={120}>
            <input type="number" step="0.01" min="0" value={form.faturamento} onChange={e => set('faturamento', e.target.value)} placeholder="0.00" style={{ ...mini, width: 120 }} />
          </Field>
          <Field label="Pedidos" width={80}>
            <input type="number" min="0" value={form.pedidos} onChange={e => set('pedidos', e.target.value)} placeholder="0" style={{ ...mini, width: 80 }} />
          </Field>
          <Field label="Avaliação (0-5)" width={90}>
            <input type="number" step="0.1" min="0" max="5" value={form.avaliacao_media} onChange={e => set('avaliacao_media', e.target.value)} placeholder="4.5" style={{ ...mini, width: 90 }} />
          </Field>
          <Field label="Fonte" width={120}>
            <select value={form.fonte} onChange={e => set('fonte', e.target.value)} style={{ ...mini, width: 120 }}>
              <option value="manual">Manual</option>
              <option value="api_ifood">API iFood</option>
              <option value="print_ocr">Print OCR</option>
            </select>
          </Field>
          <button type="submit" disabled={saving} style={{ background: '#B70C00', border: 'none', color: '#fff', padding: '7px 14px', borderRadius: 7, cursor: saving ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600, opacity: saving ? 0.7 : 1, height: 34, alignSelf: 'flex-end' }}>
            {saving ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </form>

      {metricas.length === 0 ? (
        <div style={{ color: '#6b7280', fontSize: 13, textAlign: 'center', padding: '40px 0' }}>
          Nenhuma métrica registrada ainda.
        </div>
      ) : (
        <div style={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 12, overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 640 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #2a2a2a' }}>
                {['Data', 'Faturamento', 'Pedidos', 'Ticket Médio', 'Avaliação', 'Cancelamentos', 'Fonte'].map(h => (
                  <th key={h} style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 500, color: '#6b7280', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {metricas.map((m, i) => (
                <tr key={m.id} style={{ borderTop: i > 0 ? '1px solid #1f1f1f' : undefined }}>
                  <td style={tdStyle}>{m.data}</td>
                  <td style={tdStyle}>{m.faturamento != null ? `R$ ${parseFloat(m.faturamento).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '—'}</td>
                  <td style={tdStyle}>{m.pedidos ?? '—'}</td>
                  <td style={tdStyle}>{m.ticket_medio != null ? `R$ ${parseFloat(m.ticket_medio).toFixed(2)}` : '—'}</td>
                  <td style={tdStyle}>{m.avaliacao_media != null ? `${m.avaliacao_media} ★` : '—'}</td>
                  <td style={tdStyle}>{m.cancelamentos ?? '—'}</td>
                  <td style={{ ...tdStyle, color: '#6b7280', fontSize: 11 }}>{m.fonte}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function TabConsultores({ consultores, onAtribuir, onRemove }) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
        <button onClick={onAtribuir} style={{ background: '#B70C00', border: 'none', color: '#fff', padding: '8px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Icon name="plus" size={14} /> Atribuir consultor
        </button>
      </div>

      {consultores.length === 0 ? (
        <div style={{ color: '#6b7280', fontSize: 13, textAlign: 'center', padding: '40px 0' }}>
          Nenhum consultor atribuído a esta loja.
        </div>
      ) : (
        <div style={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 12, overflow: 'hidden' }}>
          {consultores.map((c, i) => (
            <div key={c.user_id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderTop: i > 0 ? '1px solid #1f1f1f' : undefined }}>
              <div style={{ width: 34, height: 34, borderRadius: '50%', background: '#2a2a2a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, color: '#9ca3af', flexShrink: 0 }}>
                {c.profile?.full_name?.[0]?.toUpperCase() || '?'}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {c.profile?.full_name || 'Sem nome'}
                </div>
                <div style={{ fontSize: 11, color: '#6b7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.profile?.email}</div>
              </div>
              <span style={{
                fontSize: 11, padding: '2px 8px', borderRadius: 20, fontWeight: 600,
                background: c.papel === 'principal' ? '#B70C0020' : '#2a2a2a',
                color: c.papel === 'principal' ? '#B70C00' : '#9ca3af',
              }}>
                {PAPEL_LABEL[c.papel] || c.papel}
              </span>
              <button onClick={() => onRemove(c.user_id)} style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', padding: 4 }} title="Remover">
                <Icon name="x" size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TabEmConstrucao({ nome }) {
  return (
    <div style={{ textAlign: 'center', padding: '60px 20px', color: '#6b7280' }}>
      <div style={{ fontSize: 34, marginBottom: 12 }}>🚧</div>
      <div style={{ fontSize: 15, fontWeight: 600, color: '#9ca3af' }}>{nome} — Em construção</div>
      <div style={{ marginTop: 6, fontSize: 13 }}>Implementado nas próximas fases do PILOTO.</div>
    </div>
  );
}

// ── TabTarefas ────────────────────────────────────────────────────────────────

function TabTarefas({ lojaId }) {
  const [tarefas, setTarefas]         = useState([]);
  const [loading, setLoading]         = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [expanded, setExpanded]       = useState(null);
  const [actionLoading, setActionLoading] = useState(null);
  const [showForm, setShowForm]           = useState(false);
  const [detailId, setDetailId]           = useState(null);
  const [showRelatorio, setShowRelatorio] = useState(false);
  const [relatorioData, setRelatorioData] = useState(null);
  const [loadingRelatorio, setLoadingRelatorio] = useState(false);
  const [marcarConcluidaId, setMarcarConcluidaId] = useState(null);

  useEffect(() => { loadTarefas(); }, [lojaId]);

  async function bridgeFetch(path, options = {}) {
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(`${BRIDGE}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session?.access_token}`,
        ...options.headers,
      },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(body.error || res.statusText);
    }
    return res.json();
  }

  async function loadTarefas() {
    setLoading(true);
    try {
      const data = await bridgeFetch(`/api/tarefas/loja/${lojaId}?limit=100`);
      setTarefas(data.tarefas || []);
    } catch (err) {
      console.error('[tarefas]', err.message);
    } finally {
      setLoading(false);
    }
  }

  async function takeAction(tarefaId, endpoint, body = {}) {
    setActionLoading(tarefaId + endpoint);
    try {
      await bridgeFetch(`/api/tarefas/${tarefaId}/${endpoint}`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      await loadTarefas();
      setExpanded(null);
    } catch (err) {
      alert('Erro: ' + err.message);
    } finally {
      setActionLoading(null);
    }
  }

  async function openRelatorio() {
    setLoadingRelatorio(true);
    try {
      const data = await bridgeFetch(`/api/tarefas/loja/${lojaId}/relatorio`);
      setRelatorioData(data);
      setShowRelatorio(true);
    } catch (err) {
      alert('Erro ao gerar relatório: ' + err.message);
    } finally {
      setLoadingRelatorio(false);
    }
  }

  const filtradas = statusFilter
    ? tarefas.filter(t => t.status === statusFilter)
    : tarefas;

  if (loading) {
    return <div style={{ color: '#6b7280', fontSize: 13, textAlign: 'center', padding: '40px 0' }}>Carregando tarefas…</div>;
  }

  return (
    <div>
      {/* Toolbar */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          style={{ ...mini, fontSize: 12, width: 170 }}
        >
          <option value="">Todos os status</option>
          {Object.entries(STATUS_TAREFA_LABEL).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
        <span style={{ fontSize: 12, color: '#6b7280' }}>
          {filtradas.length} tarefa{filtradas.length !== 1 ? 's' : ''}
        </span>
        <div style={{ flex: 1 }} />
        <button
          onClick={openRelatorio}
          disabled={loadingRelatorio}
          style={{ background: '#2a2a2a', border: '1px solid #3a3a3a', color: '#9ca3af', padding: '8px 14px', borderRadius: 8, cursor: loadingRelatorio ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600, opacity: loadingRelatorio ? 0.6 : 1 }}
        >
          {loadingRelatorio ? 'Gerando…' : 'Gerar relatório'}
        </button>
        <button
          onClick={() => setShowForm(true)}
          style={{ background: '#B70C00', border: 'none', color: '#fff', padding: '8px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <Icon name="plus" size={14} /> Nova tarefa
        </button>
      </div>

      {/* Lista */}
      {filtradas.length === 0 ? (
        <div style={{ color: '#6b7280', fontSize: 13, textAlign: 'center', padding: '40px 0' }}>
          {statusFilter ? 'Nenhuma tarefa com esse status.' : 'Nenhuma tarefa criada ainda.'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtradas.map(t => {
            const isOpen      = expanded === t.id;
            const statusColor = STATUS_TAREFA_COLOR[t.status] || '#6b7280';
            const priorColor  = PRIORIDADE_COLOR[t.prioridade] || '#6b7280';
            return (
              <div key={t.id} style={{ background: '#1a1a1a', border: `1px solid ${isOpen ? '#3a3a3a' : '#2a2a2a'}`, borderRadius: 10, overflow: 'hidden' }}>
                {/* Row header */}
                <button
                  onClick={() => setExpanded(isOpen ? null : t.id)}
                  style={{ width: '100%', background: 'none', border: 'none', padding: '12px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left' }}
                >
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: priorColor, flexShrink: 0 }} title={PRIORIDADE_LABEL[t.prioridade]} />
                  <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: '#e5e7eb', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {t.titulo}
                  </span>
                  <span style={{ fontSize: 11, color: '#6b7280', flexShrink: 0 }}>{BLOCO_LABEL[t.bloco] || t.bloco}</span>
                  <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: statusColor + '20', color: statusColor, flexShrink: 0 }}>
                    {STATUS_TAREFA_LABEL[t.status] || t.status}
                  </span>
                  <Icon name="chevdown" size={13} style={{ color: '#6b7280', transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s', flexShrink: 0 }} />
                </button>

                {/* Expanded detail */}
                {isOpen && (
                  <div style={{ borderTop: '1px solid #2a2a2a', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={{ fontSize: 12, color: '#9ca3af', lineHeight: 1.5 }}>
                      <strong style={{ color: '#6b7280', display: 'block', marginBottom: 2 }}>Situação</strong>
                      {t.situacao}
                    </div>
                    <div style={{ fontSize: 12, color: '#9ca3af', lineHeight: 1.5 }}>
                      <strong style={{ color: '#6b7280', display: 'block', marginBottom: 2 }}>O que será feito</strong>
                      {t.o_que_sera_feito}
                    </div>
                    {t.por_que_importa && (
                      <div style={{ fontSize: 12, color: '#9ca3af', lineHeight: 1.5 }}>
                        <strong style={{ color: '#6b7280', display: 'block', marginBottom: 2 }}>Por que importa</strong>
                        {t.por_que_importa}
                      </div>
                    )}
                    {t.prazo_estimado && (
                      <div style={{ fontSize: 12, color: '#6b7280' }}>
                        Prazo estimado: <span style={{ color: '#9ca3af' }}>{t.prazo_estimado}</span>
                      </div>
                    )}
                    {/* Lifecycle actions */}
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', paddingTop: 4, alignItems: 'center' }}>
                      {['rascunho', 'aguardando_envio', 'rejeitada'].includes(t.status) && (
                        <TarefaActionBtn
                          label="Enviar para aprovação"
                          color="#f59e0b"
                          loading={actionLoading === t.id + 'enviar-aprovacao'}
                          onClick={() => takeAction(t.id, 'enviar-aprovacao')}
                        />
                      )}
                      {t.status === 'aguardando_aprovacao' && (<>
                        <TarefaActionBtn
                          label="Aprovar"
                          color="#10b981"
                          loading={actionLoading === t.id + 'aprovar'}
                          onClick={() => takeAction(t.id, 'aprovar')}
                        />
                        <TarefaActionBtn
                          label="Rejeitar"
                          color="#ef4444"
                          loading={actionLoading === t.id + 'rejeitar'}
                          onClick={async () => {
                            const nota = window.prompt('Motivo da rejeição (obrigatório):');
                            if (!nota?.trim()) return;
                            await takeAction(t.id, 'rejeitar', { nota });
                          }}
                        />
                      </>)}
                      {t.status === 'aprovada' && (
                        <TarefaActionBtn
                          label="✅ Marcar concluída"
                          color="#10b981"
                          loading={actionLoading === t.id + 'marcar-concluida'}
                          onClick={() => setMarcarConcluidaId(t.id)}
                        />
                      )}
                      {t.status === 'concluida' && (<>
                        <TarefaActionBtn
                          label="↩ Reabrir tarefa"
                          color="#f59e0b"
                          loading={actionLoading === t.id + 'reabrir'}
                          onClick={async () => {
                            const motivo = window.prompt('Motivo da reabertura (obrigatório):');
                            if (!motivo || motivo.trim().length < 3) return;
                            await takeAction(t.id, 'reabrir', { motivo: motivo.trim(), status_alvo: 'aprovada' });
                          }}
                        />
                        {!t.revisao_status && (
                          <TarefaActionBtn
                            label="📋 Solicitar revisão"
                            color="#6366f1"
                            loading={actionLoading === t.id + 'solicitar-revisao-cliente'}
                            onClick={() => takeAction(t.id, 'solicitar-revisao-cliente')}
                          />
                        )}
                        {t.revisao_status === 'aguardando' && (
                          <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20, background: '#f59e0b20', color: '#d97706', border: '1px solid #f59e0b40', whiteSpace: 'nowrap' }}>
                            ⏳ Aguardando revisão
                          </span>
                        )}
                        {t.revisao_status === 'aprovada' && (
                          <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20, background: '#10b98120', color: '#059669', border: '1px solid #10b98140', whiteSpace: 'nowrap' }}>
                            ✅ Revisão aprovada
                          </span>
                        )}
                        {t.revisao_status === 'recusada' && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20, background: '#ef444420', color: '#dc2626', border: '1px solid #ef444440', whiteSpace: 'nowrap' }}>
                              ❌ Revisão recusada
                            </span>
                            {t.revisao_motivo && (
                              <span style={{ fontSize: 11, color: '#9ca3af', paddingLeft: 4 }}>
                                Motivo: {t.revisao_motivo}
                              </span>
                            )}
                          </div>
                        )}
                      </>)}
                      {(t.status === 'em_execucao' || t.status === 'aguardando_validacao') && (
                        <span style={{ fontSize: 11, color: '#94a3b8', fontStyle: 'italic' }}>
                          {t.status === 'em_execucao' ? 'Em execução…' : 'Aguardando validação…'}
                        </span>
                      )}
                      <div style={{ flex: 1 }} />
                      <button
                        onClick={() => setDetailId(t.id)}
                        style={{ background: 'none', border: 'none', color: '#B70C00', cursor: 'pointer', fontSize: 12, padding: 0, fontWeight: 600 }}
                      >
                        Ver detalhes →
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showForm && (
        <NovaTarefaOverlay
          lojaId={lojaId}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); loadTarefas(); }}
        />
      )}
      {detailId && (
        <TarefaDetailModal
          tarefaId={detailId}
          onClose={() => setDetailId(null)}
          onRefresh={loadTarefas}
        />
      )}
      {showRelatorio && relatorioData && (
        <RelatorioModal
          relatorio={relatorioData}
          onClose={() => { setShowRelatorio(false); setRelatorioData(null); }}
        />
      )}
      {marcarConcluidaId && (
        <MarcarConcluidaModal
          tarefaId={marcarConcluidaId}
          onClose={() => setMarcarConcluidaId(null)}
          onDone={() => { setMarcarConcluidaId(null); loadTarefas(); }}
        />
      )}
    </div>
  );
}

function TarefaActionBtn({ label, color, loading, onClick }) {
  return (
    <button
      onClick={onClick}
      disabled={!!loading}
      style={{
        background: color + '20', border: `1px solid ${color}40`, color,
        padding: '5px 12px', borderRadius: 7,
        cursor: loading ? 'not-allowed' : 'pointer',
        fontSize: 12, fontWeight: 600, opacity: loading ? 0.6 : 1,
      }}
    >
      {loading ? 'Aguarde…' : label}
    </button>
  );
}

function MarcarConcluidaModal({ tarefaId, onClose, onDone }) {
  const [nota, setNota]     = useState('');
  const [files, setFiles]   = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  async function submit() {
    setSaving(true);
    setError('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

      // Upload anexos BEFORE marcar-concluida so _notificarConclusao sees the images
      if (files.length > 0) {
        const anexos = [];
        for (const file of files) {
          const ext  = file.name.split('.').pop().toLowerCase();
          const path = `${tarefaId}/${crypto.randomUUID()}.${ext}`;
          const { error: upErr } = await supabase.storage
            .from('task-attachments')
            .upload(path, file, { cacheControl: '3600', upsert: false });
          if (upErr) throw new Error(`Upload falhou: ${upErr.message}`);
          const { data: sd } = await supabase.storage
            .from('task-attachments')
            .createSignedUrl(path, 60 * 60 * 24 * 365 * 5);
          anexos.push({ url: sd.signedUrl, mime_type: file.type, size_bytes: file.size });
        }
        const r2 = await fetch(`${BRIDGE}/api/tarefas/${tarefaId}/anexos`, {
          method: 'POST', headers, body: JSON.stringify({ anexos }),
        });
        if (!r2.ok) {
          const b = await r2.json().catch(() => ({ error: r2.statusText }));
          throw new Error(b.error || r2.statusText);
        }
      }

      const r1 = await fetch(`${BRIDGE}/api/tarefas/${tarefaId}/marcar-concluida`, {
        method: 'POST', headers, body: JSON.stringify({ nota }),
      });
      if (!r1.ok) {
        const b = await r1.json().catch(() => ({ error: r1.statusText }));
        throw new Error(b.error || r1.statusText);
      }

      onDone();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  function handleFiles(e) {
    const valid = Array.from(e.target.files)
      .filter(f => ['image/jpeg','image/png','image/gif','image/webp','application/pdf'].includes(f.type) && f.size <= 5 * 1024 * 1024)
      .slice(0, 5);
    setFiles(valid);
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000b', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9200, padding: 20 }}>
      <div style={{ background: '#141414', border: '1px solid #2a2a2a', borderRadius: 14, width: '100%', maxWidth: 480, padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#fff' }}>Marcar como concluída</h3>

        <div>
          <label style={{ fontSize: 12, color: '#6b7280', display: 'block', marginBottom: 6 }}>Resultado / observação</label>
          <textarea
            value={nota}
            onChange={e => setNota(e.target.value)}
            placeholder="Descreva o que foi feito, resultado obtido…"
            rows={3}
            style={{ ...mini, width: '100%', resize: 'none', boxSizing: 'border-box' }}
          />
        </div>

        <div>
          <label style={{ fontSize: 12, color: '#6b7280', display: 'block', marginBottom: 6 }}>
            Prints / evidências <span style={{ color: '#4b5563' }}>(até 5 · jpg, png, pdf · 5 MB cada)</span>
          </label>
          <input type="file" multiple accept=".jpg,.jpeg,.png,.pdf" onChange={handleFiles}
            style={{ fontSize: 12, color: '#e5e7eb', width: '100%' }} />
          {files.length > 0 && (
            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 3 }}>
              {files.map((f, i) => (
                <div key={i} style={{ fontSize: 12, color: '#9ca3af' }}>
                  {f.name} <span style={{ color: '#4b5563' }}>({(f.size / 1024).toFixed(0)} KB)</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {error && <div style={{ fontSize: 12, color: '#ef4444' }}>{error}</div>}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onClose} disabled={saving}
            style={{ background: 'none', border: '1px solid #2a2a2a', color: '#9ca3af', padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontSize: 13 }}>
            Cancelar
          </button>
          <button onClick={submit} disabled={saving}
            style={{ background: '#10b981', border: 'none', color: '#fff', padding: '8px 20px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600, opacity: saving ? 0.7 : 1 }}>
            {saving ? 'Salvando…' : 'Confirmar conclusão'}
          </button>
        </div>
      </div>
    </div>
  );
}

function RelatorioModal({ relatorio, onClose }) {
  const { loja, gerado_em, totais, tarefas } = relatorio;
  const total     = totais?.total ?? 0;
  const concluidas = totais?.por_status?.concluida || 0;
  const quickWins  = totais?.por_prioridade?.quick_win || 0;
  const empty      = total === 0;

  const dataFormatada = new Date(gerado_em).toLocaleString('pt-BR', { dateStyle: 'long', timeStyle: 'short' });

  const BLOCOS_ORDER = ['identidade', 'cardapio', 'operacao', 'avaliacoes', 'marketing', 'suporte'];
  const byBloco = {};
  for (const t of (tarefas || [])) {
    (byBloco[t.bloco] = byBloco[t.bloco] || []).push(t);
  }

  function handleCopy() {
    const md = buildMarkdown(relatorio);
    navigator.clipboard.writeText(md)
      .then(() => alert('Markdown copiado para a área de transferência.'))
      .catch(() => alert('Não foi possível acessar a área de transferência.'));
  }

  function handlePDF() {
    const md = buildMarkdown(relatorio);
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>Relatório — ${loja.nome || loja.id}</title>
<style>
  body{font-family:Arial,sans-serif;max-width:820px;margin:40px auto;color:#111;line-height:1.65;font-size:13px}
  h1{font-size:20px;margin-bottom:4px}h2{font-size:15px;margin-top:26px;border-bottom:1px solid #ccc;padding-bottom:4px}
  p{margin:3px 0}strong{font-weight:600}
</style></head><body>${markdownToHtml(md)}</body></html>`;
    const w = window.open('', '_blank');
    if (!w) { alert('Permita pop-ups para gerar o PDF.'); return; }
    w.document.write(html);
    w.document.close();
    setTimeout(() => w.print(), 400);
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000b', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9200, padding: 20 }}>
      <div style={{ background: '#141414', border: '1px solid #2a2a2a', borderRadius: 14, width: '100%', maxWidth: 720, maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}>

        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #2a2a2a', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#fff' }}>
              Relatório — {loja.nome || loja.id}
            </h3>
            <div style={{ fontSize: 12, color: '#6b7280', marginTop: 3 }}>Gerado em {dataFormatada}</div>
            <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 6, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <span><strong style={{ color: '#fff' }}>{total}</strong> tarefas</span>
              <span style={{ color: '#4b5563' }}>·</span>
              <span><strong style={{ color: '#10b981' }}>{concluidas}</strong> concluídas</span>
              <span style={{ color: '#4b5563' }}>·</span>
              <span><strong style={{ color: '#10b981' }}>{quickWins}</strong> quick wins</span>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', padding: 4, flexShrink: 0 }}>
            <Icon name="x" size={16} />
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
          {empty ? (
            <div style={{ color: '#6b7280', fontSize: 13, textAlign: 'center', padding: '48px 0' }}>
              Sem tarefas cadastradas.
            </div>
          ) : (
            BLOCOS_ORDER.filter(b => byBloco[b]?.length).map(bloco => (
              <div key={bloco} style={{ marginBottom: 24 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10, paddingBottom: 6, borderBottom: '1px solid #2a2a2a' }}>
                  {BLOCO_LABEL[bloco]}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {byBloco[bloco].map((t, i) => {
                    const sc = STATUS_TAREFA_COLOR[t.status] || '#6b7280';
                    const pc = PRIORIDADE_COLOR[t.prioridade] || '#6b7280';
                    return (
                      <div key={t.id} style={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 8, padding: '12px 14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: '#6b7280' }}>{i + 1}.</span>
                          <span style={{ fontSize: 13, fontWeight: 600, color: '#fff', flex: 1, minWidth: 0 }}>{t.titulo}</span>
                          <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 20, background: sc + '20', color: sc, flexShrink: 0 }}>
                            {STATUS_TAREFA_LABEL[t.status] || t.status}
                          </span>
                          <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 20, background: pc + '20', color: pc, flexShrink: 0 }}>
                            {PRIORIDADE_LABEL[t.prioridade] || t.prioridade}
                          </span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                          <div style={{ fontSize: 12, color: '#9ca3af', lineHeight: 1.5 }}>
                            <strong style={{ color: '#6b7280' }}>Situação:</strong> {t.situacao}
                          </div>
                          <div style={{ fontSize: 12, color: '#9ca3af', lineHeight: 1.5 }}>
                            <strong style={{ color: '#6b7280' }}>O que será feito:</strong> {t.o_que_sera_feito}
                          </div>
                          {t.por_que_importa && (
                            <div style={{ fontSize: 12, color: '#9ca3af', lineHeight: 1.5 }}>
                              <strong style={{ color: '#6b7280' }}>Por que importa:</strong> {t.por_que_importa}
                            </div>
                          )}
                          {t.prazo_estimado && (
                            <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>Prazo: {t.prazo_estimado}</div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 20px', borderTop: '1px solid #2a2a2a', display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center' }}>
          <button
            onClick={handleCopy}
            disabled={empty}
            style={{ background: '#2a2a2a', border: 'none', color: empty ? '#4b5563' : '#9ca3af', padding: '8px 14px', borderRadius: 8, cursor: empty ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600 }}
          >
            Copiar markdown
          </button>
          <button
            onClick={handlePDF}
            disabled={empty}
            style={{ background: '#2a2a2a', border: 'none', color: empty ? '#4b5563' : '#9ca3af', padding: '8px 14px', borderRadius: 8, cursor: empty ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600 }}
          >
            Baixar PDF
          </button>
          <button
            disabled
            title="Disponível na Onda 04"
            style={{ background: '#1a1a1a', border: '1px solid #2a2a2a', color: '#374151', padding: '8px 14px', borderRadius: 8, cursor: 'not-allowed', fontSize: 13, fontWeight: 600 }}
          >
            Enviar via WhatsApp
          </button>
        </div>
      </div>
    </div>
  );
}

function NovaTarefaOverlay({ lojaId, onClose, onSaved }) {
  const [form, setForm] = useState({
    titulo: '', bloco: 'identidade', situacao: '', o_que_sera_feito: '',
    por_que_importa: '', prioridade: 'estrutural', prazo_estimado: '',
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr]       = useState('');

  function set(k, v) { setForm(p => ({ ...p, [k]: v })); }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.titulo.trim() || !form.situacao.trim() || !form.o_que_sera_feito.trim()) {
      setErr('Título, situação e o que será feito são obrigatórios.');
      return;
    }
    setSaving(true);
    setErr('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${BRIDGE}/api/tarefas/loja/${lojaId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({
          titulo:           form.titulo,
          bloco:            form.bloco,
          situacao:         form.situacao,
          o_que_sera_feito: form.o_que_sera_feito,
          por_que_importa:  form.por_que_importa || null,
          prioridade:       form.prioridade,
          prazo_estimado:   form.prazo_estimado || null,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(body.error || res.statusText);
      }
      onSaved();
    } catch (err) {
      setErr(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000a', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9000, padding: 20 }}>
      <div style={{ background: '#141414', border: '1px solid #2a2a2a', borderRadius: 14, padding: 24, width: '100%', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#fff' }}>Nova tarefa</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', padding: 4 }}>
            <Icon name="x" size={16} />
          </button>
        </div>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
          <Field label="Título *">
            <input value={form.titulo} onChange={e => set('titulo', e.target.value)} placeholder="Ex: Atualizar fotos dos produtos" style={{ ...mini, width: '100%', boxSizing: 'border-box' }} required />
          </Field>
          <div style={{ display: 'flex', gap: 10 }}>
            <Field label="Bloco *">
              <select value={form.bloco} onChange={e => set('bloco', e.target.value)} style={{ ...mini, width: 190 }}>
                {BLOCOS_OPCOES.map(b => <option key={b} value={b}>{BLOCO_LABEL[b]}</option>)}
              </select>
            </Field>
            <Field label="Prioridade *">
              <select value={form.prioridade} onChange={e => set('prioridade', e.target.value)} style={{ ...mini, width: 170 }}>
                {PRIORIDADES_OPCOES.map(p => <option key={p} value={p}>{PRIORIDADE_LABEL[p]}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Situação atual *">
            <textarea value={form.situacao} onChange={e => set('situacao', e.target.value)} placeholder="Descreva a situação atual da loja..." rows={2} style={{ ...mini, width: '100%', boxSizing: 'border-box', resize: 'vertical' }} required />
          </Field>
          <Field label="O que será feito *">
            <textarea value={form.o_que_sera_feito} onChange={e => set('o_que_sera_feito', e.target.value)} placeholder="Descreva a ação concreta..." rows={2} style={{ ...mini, width: '100%', boxSizing: 'border-box', resize: 'vertical' }} required />
          </Field>
          <Field label="Por que importa">
            <textarea value={form.por_que_importa} onChange={e => set('por_que_importa', e.target.value)} placeholder="Impacto esperado..." rows={2} style={{ ...mini, width: '100%', boxSizing: 'border-box', resize: 'vertical' }} />
          </Field>
          <Field label="Prazo estimado">
            <input type="date" value={form.prazo_estimado} onChange={e => set('prazo_estimado', e.target.value)} style={{ ...mini, width: 160 }} />
          </Field>
          {err && <div style={{ color: '#ef4444', fontSize: 12 }}>{err}</div>}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 4 }}>
            <button type="button" onClick={onClose} style={{ background: '#2a2a2a', border: 'none', color: '#9ca3af', padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontSize: 13 }}>
              Cancelar
            </button>
            <button type="submit" disabled={saving} style={{ background: '#B70C00', border: 'none', color: '#fff', padding: '8px 16px', borderRadius: 8, cursor: saving ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600, opacity: saving ? 0.7 : 1 }}>
              {saving ? 'Criando…' : 'Criar tarefa'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── TarefaDetailModal ─────────────────────────────────────────────────────────

function TarefaDetailModal({ tarefaId, onClose, onRefresh }) {
  const [data, setData]               = useState(null);
  const [loading, setLoading]         = useState(true);
  const [innerTab, setInnerTab]       = useState(0);
  const [comentario, setComentario]   = useState('');
  const [savingCmt, setSavingCmt]     = useState(false);
  const [anexos, setAnexos]           = useState([]);
  const [loadingAnexos, setLoadingAnexos] = useState(false);

  const INNER_TABS = ['Detalhes', 'Histórico', 'Comentários', 'Prints'];

  async function bridgeFetch(path, options = {}) {
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(`${BRIDGE}${path}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}`, ...options.headers },
    });
    if (!res.ok) { const b = await res.json().catch(() => ({ error: res.statusText })); throw new Error(b.error || res.statusText); }
    return res.json();
  }

  async function load() {
    setLoading(true);
    try { setData(await bridgeFetch(`/api/tarefas/${tarefaId}`)); }
    catch (err) { console.error('[detail]', err.message); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, [tarefaId]);

  useEffect(() => {
    if (innerTab !== 3) return;
    setLoadingAnexos(true);
    bridgeFetch(`/api/tarefas/${tarefaId}/anexos`)
      .then(d => setAnexos(d.anexos || []))
      .catch(() => setAnexos([]))
      .finally(() => setLoadingAnexos(false));
  }, [innerTab, tarefaId]);

  async function addComment() {
    if (!comentario.trim()) return;
    setSavingCmt(true);
    try {
      await bridgeFetch(`/api/tarefas/${tarefaId}/comentarios`, {
        method: 'POST',
        body: JSON.stringify({ conteudo: comentario.trim(), interno: true }),
      });
      setComentario('');
      load();
    } catch (err) { alert('Erro: ' + err.message); }
    finally { setSavingCmt(false); }
  }

  const t = data?.tarefa;

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000b', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9100, padding: 20 }}>
      <div style={{ background: '#141414', border: '1px solid #2a2a2a', borderRadius: 14, width: '100%', maxWidth: 640, maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #2a2a2a', display: 'flex', alignItems: 'center', gap: 10 }}>
          {t && (
            <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: (STATUS_TAREFA_COLOR[t.status] || '#6b7280') + '20', color: STATUS_TAREFA_COLOR[t.status] || '#6b7280', flexShrink: 0 }}>
              {STATUS_TAREFA_LABEL[t.status] || t.status}
            </span>
          )}
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#fff', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {t?.titulo || 'Carregando…'}
          </h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', padding: 4, flexShrink: 0 }}>
            <Icon name="x" size={16} />
          </button>
        </div>

        {/* Inner tabs */}
        <div style={{ display: 'flex', gap: 2, padding: '0 20px', borderBottom: '1px solid #2a2a2a' }}>
          {INNER_TABS.map((label, i) => (
            <button key={label} onClick={() => setInnerTab(i)} style={{
              background: 'none', border: 'none', padding: '8px 12px', cursor: 'pointer',
              fontSize: 12, fontWeight: innerTab === i ? 600 : 400,
              color: innerTab === i ? '#fff' : '#6b7280',
              borderBottom: innerTab === i ? '2px solid #B70C00' : '2px solid transparent',
              marginBottom: -1,
            }}>{label}</button>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
          {loading && (
            <div style={{ color: '#6b7280', fontSize: 13, textAlign: 'center', padding: '40px 0' }}>Carregando…</div>
          )}

          {/* Detalhes */}
          {!loading && t && innerTab === 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <InfoChip label="Bloco" value={BLOCO_LABEL[t.bloco] || t.bloco} />
                <InfoChip label="Prioridade" value={PRIORIDADE_LABEL[t.prioridade]} color={PRIORIDADE_COLOR[t.prioridade]} />
                {t.prazo_estimado && <InfoChip label="Prazo" value={t.prazo_estimado} />}
                {t.concluida_em && <InfoChip label="Concluída em" value={new Date(t.concluida_em).toLocaleDateString('pt-BR')} color="#10b981" />}
              </div>
              <DetailField label="Situação atual" value={t.situacao} />
              <DetailField label="O que será feito" value={t.o_que_sera_feito} />
              {t.por_que_importa && <DetailField label="Por que importa" value={t.por_que_importa} />}
              <div style={{ display: 'flex', gap: 10, paddingTop: 4 }}>
                <span style={{ fontSize: 11, color: '#6b7280' }}>
                  {t.comentarios_count} comentário{t.comentarios_count !== 1 ? 's' : ''} · {t.prints_count} print{t.prints_count !== 1 ? 's' : ''}
                </span>
              </div>
            </div>
          )}

          {/* Histórico */}
          {!loading && t && innerTab === 1 && (
            <div>
              {(!t.aprovacoes || t.aprovacoes.length === 0) ? (
                <div style={{ color: '#6b7280', fontSize: 13, textAlign: 'center', padding: '30px 0' }}>Nenhum registro no histórico.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                  {t.aprovacoes.map((a, i) => (
                    <div key={a.id} style={{ display: 'flex', gap: 12, paddingBottom: 16 }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#B70C00', flexShrink: 0, marginTop: 4 }} />
                        {i < t.aprovacoes.length - 1 && <div style={{ width: 2, flex: 1, background: '#2a2a2a', minHeight: 12, marginTop: 4 }} />}
                      </div>
                      <div style={{ flex: 1, paddingBottom: 4 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: '#e5e7eb', textTransform: 'capitalize' }}>{(a.acao || '').replace(/_/g, ' ')}</div>
                        {a.nota && <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 4, lineHeight: 1.5 }}>{a.nota}</div>}
                        <div style={{ fontSize: 11, color: '#4b5563', marginTop: 4 }}>{new Date(a.created_at).toLocaleString('pt-BR')}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Comentários */}
          {!loading && t && innerTab === 2 && (
            <div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                {(!t.comentarios || t.comentarios.length === 0) ? (
                  <div style={{ color: '#6b7280', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>Nenhum comentário ainda.</div>
                ) : t.comentarios.map(c => (
                  <div key={c.id} style={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 8, padding: '10px 12px' }}>
                    <div style={{ fontSize: 13, color: '#e5e7eb', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{c.conteudo}</div>
                    <div style={{ fontSize: 11, color: '#4b5563', marginTop: 6 }}>{new Date(c.created_at).toLocaleString('pt-BR')}</div>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <textarea
                  value={comentario}
                  onChange={e => setComentario(e.target.value)}
                  placeholder="Adicionar comentário interno…"
                  rows={2}
                  style={{ ...mini, flex: 1, resize: 'none' }}
                />
                <button
                  onClick={addComment}
                  disabled={savingCmt || !comentario.trim()}
                  style={{ background: '#B70C00', border: 'none', color: '#fff', padding: '8px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600, alignSelf: 'flex-end', opacity: savingCmt || !comentario.trim() ? 0.5 : 1, whiteSpace: 'nowrap' }}
                >
                  {savingCmt ? '…' : 'Enviar'}
                </button>
              </div>
            </div>
          )}

          {/* Prints */}
          {!loading && innerTab === 3 && (
            <div>
              {loadingAnexos ? (
                <div style={{ color: '#6b7280', fontSize: 13, textAlign: 'center', padding: '30px 0' }}>Carregando…</div>
              ) : anexos.length === 0 ? (
                <div style={{ color: '#6b7280', fontSize: 13, textAlign: 'center', padding: '30px 0' }}>Nenhum print anexado nesta tarefa.</div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
                  {anexos.map(a => (
                    <a key={a.id} href={a.url} target="_blank" rel="noreferrer"
                      style={{ display: 'block', background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 8, overflow: 'hidden', textDecoration: 'none' }}>
                      {a.mime_type.startsWith('image/') ? (
                        <img src={a.url} alt="" style={{ width: '100%', height: 120, objectFit: 'cover', display: 'block' }} />
                      ) : (
                        <div style={{ height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b7280', fontSize: 13 }}>PDF</div>
                      )}
                      <div style={{ padding: '6px 8px', fontSize: 11, color: '#9ca3af' }}>
                        {(a.size_bytes / 1024).toFixed(0)} KB · {new Date(a.created_at).toLocaleDateString('pt-BR')}
                      </div>
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function InfoChip({ label, value, color }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <span style={{ fontSize: 10, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 600, color: color || '#e5e7eb' }}>{value}</span>
    </div>
  );
}

function DetailField({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
      <div style={{ fontSize: 13, color: '#e5e7eb', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{value}</div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildMarkdown(relatorio) {
  const { loja, gerado_em, totais, tarefas } = relatorio;
  const dataFormatada = new Date(gerado_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  const linhas = [
    `# Relatório de Tarefas — ${loja.nome || loja.id}`,
    `**Gerado em:** ${dataFormatada}`,
    `**Total:** ${totais?.total ?? 0} · **Concluídas:** ${totais?.por_status?.concluida || 0} · **Quick Wins:** ${totais?.por_prioridade?.quick_win || 0}`,
    '',
  ];
  const BLOCOS_ORDER = ['identidade', 'cardapio', 'operacao', 'avaliacoes', 'marketing', 'suporte'];
  const byBloco = {};
  for (const t of (tarefas || [])) {
    (byBloco[t.bloco] = byBloco[t.bloco] || []).push(t);
  }
  for (const bloco of BLOCOS_ORDER) {
    if (!byBloco[bloco]?.length) continue;
    linhas.push(`## ${BLOCO_LABEL[bloco] || bloco}`);
    byBloco[bloco].forEach((t, i) => {
      linhas.push(`**${i + 1}. ${t.titulo}**`);
      linhas.push(`Status: ${STATUS_TAREFA_LABEL[t.status] || t.status} · Prioridade: ${PRIORIDADE_LABEL[t.prioridade] || t.prioridade}`);
      linhas.push(`**Situação:** ${t.situacao}`);
      linhas.push(`**O que será feito:** ${t.o_que_sera_feito}`);
      if (t.por_que_importa) linhas.push(`**Por que importa:** ${t.por_que_importa}`);
      if (t.prazo_estimado)  linhas.push(`Prazo: ${t.prazo_estimado}`);
      linhas.push('');
    });
  }
  return linhas.join('\n');
}

function markdownToHtml(md) {
  return md
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n{2,}/g, '</p><p>')
    .replace(/\n/g, '<br>')
    .replace(/^/, '<p>').replace(/$/, '</p>');
}

function Field({ label, width, children }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 11, color: '#6b7280' }}>{label}</span>
      {children}
    </label>
  );
}

const mini = {
  background: '#111', border: '1px solid #2a2a2a', borderRadius: 6,
  color: '#fff', padding: '6px 9px', fontSize: 13, boxSizing: 'border-box',
};
const tdStyle = { padding: '9px 12px', color: '#e5e7eb' };
