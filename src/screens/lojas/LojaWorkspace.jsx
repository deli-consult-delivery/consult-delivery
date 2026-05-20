import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase.js';
import Icon from '../../components/Icon.jsx';
import AtribuirConsultorModal from './AtribuirConsultorModal.jsx';

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
const TABS = ['Visão Geral', 'Métricas', 'Consultores', 'Campanhas', 'Histórico'];

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

      {tab === 0 && <TabVisaoGeral loja={loja} />}
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

function TabVisaoGeral({ loja }) {
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

  if (!rows.length) {
    return <div style={{ color: '#6b7280', fontSize: 14 }}>Nenhuma informação cadastrada.</div>;
  }

  return (
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

// ── Helpers ───────────────────────────────────────────────────────────────────

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
