import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase.js';

const BRIDGE_BASE = import.meta.env.VITE_BRIDGE_URL || 'http://187.127.25.24:3001';

const TABS = [
  { id: 'pesquisar', label: 'Pesquisar loja' },
  { id: 'conteudo',  label: 'Gerar conteúdo' },
  { id: 'tendencia', label: 'Tendências' },
  { id: 'historico', label: 'Histórico' },
];

const TIPO_OPTIONS = [
  { value: 'mensagem_whatsapp',  label: 'Mensagem WhatsApp' },
  { value: 'post_instagram',     label: 'Post Instagram (feed)' },
  { value: 'stories_instagram',  label: 'Stories Instagram' },
  { value: 'email_marketing',    label: 'E-mail marketing' },
  { value: 'legenda_campanha',   label: 'Legenda campanha iFood' },
];

// ── helpers ──────────────────────────────────────────────────────────────────

function Field({ label, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label style={{ fontSize: 12, color: 'var(--text2)', fontWeight: 600 }}>{label}</label>
      {children}
    </div>
  );
}

const inputStyle = {
  padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)',
  background: 'var(--surface2)', color: 'var(--text1)', fontSize: 13,
  outline: 'none', width: '100%', boxSizing: 'border-box',
};

function RunBtn({ loading, disabled, onClick, children }) {
  const off = loading || disabled;
  return (
    <button
      onClick={onClick}
      disabled={off}
      style={{
        padding: '10px 20px', borderRadius: 8, border: 'none',
        background: off ? 'var(--surface3)' : 'var(--red)',
        color: off ? 'var(--text2)' : '#fff',
        fontWeight: 600, fontSize: 13,
        cursor: off ? 'not-allowed' : 'pointer',
        display: 'flex', alignItems: 'center', gap: 8,
      }}
    >
      {loading && (
        <svg width="14" height="14" viewBox="0 0 24 24" style={{ animation: 'spin 0.8s linear infinite', flexShrink: 0 }}>
          <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="3" strokeDasharray="60" strokeDashoffset="20" />
        </svg>
      )}
      {loading ? 'Processando...' : children}
    </button>
  );
}

function CopyBtn({ text }) {
  const [done, setDone] = useState(false);
  function copy() {
    navigator.clipboard.writeText(text).then(() => {
      setDone(true);
      setTimeout(() => setDone(false), 1500);
    });
  }
  return (
    <button onClick={copy} title="Copiar" style={{
      padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)',
      background: 'var(--surface2)', color: done ? 'var(--green, #22c55e)' : 'var(--text2)',
      fontSize: 11, cursor: 'pointer', flexShrink: 0,
    }}>
      {done ? '✓ copiado' : 'Copiar'}
    </button>
  );
}

function UrgBadge({ u }) {
  const map = { alta: '#ef4444', media: '#f59e0b', baixa: '#6b7280' };
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 10,
      background: map[u] || 'var(--surface3)', color: '#fff', textTransform: 'uppercase',
    }}>{u}</span>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>{title}</div>
      {children}
    </div>
  );
}

// ── result renderers ──────────────────────────────────────────────────────────

function ResultPesquisa({ data }) {
  if (!data?.ok) return null;
  return (
    <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ padding: 16, background: 'var(--surface2)', borderRadius: 10, borderLeft: '3px solid var(--red)' }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>{data.loja_nome}</div>
        <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.6 }}>{data.resumo_executivo}</div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div style={{ padding: 12, background: 'var(--surface2)', borderRadius: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', marginBottom: 8 }}>IFOOD</div>
          {data.ifood.nota != null && <div style={{ fontSize: 13 }}>⭐ {data.ifood.nota} ({data.ifood.avaliacoes} avaliações)</div>}
          {data.ifood.ticket_medio && <div style={{ fontSize: 13, color: 'var(--text2)' }}>Ticket: {data.ifood.ticket_medio}</div>}
          {data.ifood.categorias?.map(c => <span key={c} style={{ display: 'inline-block', fontSize: 11, padding: '2px 8px', background: 'var(--surface3)', borderRadius: 10, margin: '2px 2px 0 0' }}>{c}</span>)}
        </div>
        <div style={{ padding: 12, background: 'var(--surface2)', borderRadius: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', marginBottom: 8 }}>INSTAGRAM</div>
          {data.instagram.handle ? <>
            <div style={{ fontSize: 13 }}>{data.instagram.handle}</div>
            {data.instagram.frequencia && <div style={{ fontSize: 12, color: 'var(--text2)' }}>{data.instagram.frequencia}</div>}
            {data.instagram.estilo && <div style={{ fontSize: 12, color: 'var(--text2)' }}>{data.instagram.estilo}</div>}
          </> : <div style={{ fontSize: 12, color: 'var(--text3)' }}>Não encontrado</div>}
        </div>
      </div>

      {data.oportunidades?.length > 0 && (
        <Section title="Oportunidades">
          {data.oportunidades.map((o, i) => (
            <div key={i} style={{ fontSize: 13, padding: '8px 12px', background: 'var(--surface2)', borderRadius: 8, marginBottom: 6, borderLeft: '3px solid #22c55e' }}>{o}</div>
          ))}
        </Section>
      )}

      {data.concorrentes?.length > 0 && (
        <Section title="Concorrentes">
          {data.concorrentes.map((c, i) => (
            <div key={i} style={{ fontSize: 13, padding: '8px 12px', background: 'var(--surface2)', borderRadius: 8, marginBottom: 6 }}>
              <span style={{ fontWeight: 600 }}>{c.nome}</span>
              <span style={{ color: 'var(--text2)' }}> — {c.diferencial}</span>
            </div>
          ))}
        </Section>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {data.cardapio?.destaques?.length > 0 && (
          <Section title="Destaques do cardápio">
            {data.cardapio.destaques.map((d, i) => <div key={i} style={{ fontSize: 13, color: 'var(--text2)' }}>• {d}</div>)}
          </Section>
        )}
        {data.ifood?.diferenciais?.length > 0 && (
          <Section title="Diferenciais">
            {data.ifood.diferenciais.map((d, i) => <div key={i} style={{ fontSize: 13, color: 'var(--text2)' }}>• {d}</div>)}
          </Section>
        )}
      </div>
    </div>
  );
}

function ResultConteudo({ data }) {
  if (!data?.ok) return null;
  return (
    <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
      {data.variacoes?.map((v, i) => (
        <div key={i} style={{ padding: 16, background: 'var(--surface2)', borderRadius: 10, border: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 700 }}>{v.titulo}</div>
            <CopyBtn text={v.conteudo + (v.cta ? `\n\n${v.cta}` : '')} />
          </div>
          <div style={{ fontSize: 13, whiteSpace: 'pre-wrap', lineHeight: 1.6, color: 'var(--text1)', marginBottom: 10 }}>{v.conteudo}</div>
          {v.cta && <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--red)' }}>👉 {v.cta}</div>}
          {v.observacoes && <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 8, fontStyle: 'italic' }}>💡 {v.observacoes}</div>}
        </div>
      ))}
      {data.dicas_uso?.length > 0 && (
        <div style={{ padding: 12, background: 'var(--surface2)', borderRadius: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', marginBottom: 8 }}>DICAS DE USO</div>
          {data.dicas_uso.map((d, i) => <div key={i} style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 4 }}>• {d}</div>)}
        </div>
      )}
    </div>
  );
}

function ResultTendencia({ data }) {
  if (!data?.ok) return null;
  return (
    <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ padding: 14, background: 'var(--surface2)', borderRadius: 10, borderLeft: '3px solid var(--red)' }}>
        <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.6 }}>{data.resumo}</div>
      </div>

      {data.tendencias?.map((t, i) => (
        <div key={i} style={{ padding: 14, background: 'var(--surface2)', borderRadius: 10, border: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <div style={{ fontSize: 13, fontWeight: 700 }}>{t.titulo}</div>
            <UrgBadge u={t.urgencia} />
          </div>
          <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 8 }}>{t.descricao}</div>
          <div style={{ fontSize: 12, color: 'var(--text1)', background: 'var(--surface3)', padding: '8px 10px', borderRadius: 6 }}>
            <span style={{ fontWeight: 600 }}>Como aplicar: </span>{t.como_aplicar}
          </div>
        </div>
      ))}

      {data.oportunidades_rapidas?.length > 0 && (
        <Section title="Oportunidades rápidas">
          {data.oportunidades_rapidas.map((o, i) => (
            <div key={i} style={{ fontSize: 13, padding: '8px 12px', background: 'var(--surface2)', borderRadius: 8, marginBottom: 6, borderLeft: '3px solid #22c55e' }}>{o}</div>
          ))}
        </Section>
      )}

      {data.alertas?.length > 0 && (
        <Section title="Alertas">
          {data.alertas.map((a, i) => (
            <div key={i} style={{ fontSize: 13, padding: '8px 12px', background: 'var(--surface2)', borderRadius: 8, marginBottom: 6, borderLeft: '3px solid #f59e0b' }}>{a}</div>
          ))}
        </Section>
      )}
    </div>
  );
}

function RunCard({ run }) {
  const [expanded, setExpanded] = useState(false);
  const out = run.output || {};
  const taskHint = out.loja_nome
    ? `Pesquisa — ${out.loja_nome}`
    : out.variacoes
    ? `Conteúdo — ${out.loja_nome || ''}`.trim()
    : out.tendencias
    ? `Tendências — ${out.segmento || ''}`.trim()
    : 'Run LARA';

  return (
    <div style={{ padding: 12, background: 'var(--surface2)', borderRadius: 8, border: '1px solid var(--border)', marginBottom: 8 }}>
      <div
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
        onClick={() => setExpanded(p => !p)}
      >
        <div>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{taskHint}</div>
          <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
            {new Date(run.created_at).toLocaleString('pt-BR')}
            {run.duration_ms != null && ` · ${(run.duration_ms / 1000).toFixed(1)}s`}
          </div>
        </div>
        <span style={{ fontSize: 12, color: 'var(--text2)' }}>{expanded ? '▲' : '▼'}</span>
      </div>
      {expanded && (
        <div style={{ marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
          {out.resumo_executivo && <p style={{ fontSize: 13, color: 'var(--text2)', margin: 0 }}>{out.resumo_executivo}</p>}
          {out.resumo && <p style={{ fontSize: 13, color: 'var(--text2)', margin: 0 }}>{out.resumo}</p>}
          {out.variacoes?.map((v, i) => (
            <div key={i} style={{ marginTop: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 700 }}>{v.titulo}</div>
              <div style={{ fontSize: 12, color: 'var(--text2)', whiteSpace: 'pre-wrap', marginTop: 4 }}>{v.conteudo}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── main component ────────────────────────────────────────────────────────────

export default function LaraScreen({ tenantDbId, userId }) {
  const [tab, setTab]               = useState('pesquisar');
  const [laraAgentId, setLaraAgentId] = useState(null);
  const [lojas, setLojas]           = useState([]);

  // pesquisar form
  const [fLojaId, setFLojaId]       = useState('');
  const [fLojaNome, setFLojaNome]   = useState('');
  const [fCidade, setFCidade]       = useState('');
  const [fIfoodLink, setFIfoodLink] = useState('');
  const [fInstagram, setFInstagram] = useState('');

  // conteudo form
  const [cLojaNome, setCLojaNome]   = useState('');
  const [cTipo, setCTipo]           = useState('mensagem_whatsapp');
  const [cObjetivo, setCObjetivo]   = useState('');
  const [cContexto, setCContexto]   = useState('');
  const [cTom, setCTom]             = useState('');
  const [cCupom, setCCupom]         = useState('');

  // tendencia form
  const [tSegmento, setTSegmento]   = useState('');
  const [tCidade, setTCidade]       = useState('');
  const [tFoco, setTFoco]           = useState('');

  // results
  const [resPesq, setResPesq]       = useState(null);
  const [resCont, setResCont]       = useState(null);
  const [resTend, setResTend]       = useState(null);
  const [histRuns, setHistRuns]     = useState([]);

  // loading per tab
  const [loading, setLoading]       = useState({ pesquisar: false, conteudo: false, tendencia: false });

  const pendingRunIdRef = useRef(null);
  const pendingTabRef   = useRef(null);

  // load agent id + lojas
  useEffect(() => {
    if (!tenantDbId) return;
    supabase.from('agents').select('id').eq('slug', 'lara').single()
      .then(({ data }) => setLaraAgentId(data?.id));
    supabase.from('lojas').select('id, nome').eq('tenant_id', tenantDbId).order('nome')
      .then(({ data }) => { if (data?.length) setLojas(data); });
  }, [tenantDbId]);

  // sync loja selection → nome fields
  useEffect(() => {
    const loja = lojas.find(l => l.id === fLojaId);
    if (loja) { setFLojaNome(loja.nome); setCLojaNome(loja.nome); }
  }, [fLojaId, lojas]);

  // load histórico
  useEffect(() => {
    if (!tenantDbId || !laraAgentId) return;
    supabase.from('agent_runs')
      .select('*').eq('tenant_id', tenantDbId).eq('agent_id', laraAgentId)
      .order('created_at', { ascending: false }).limit(30)
      .then(({ data }) => setHistRuns(data || []));
  }, [tenantDbId, laraAgentId]);

  // realtime: new runs
  useEffect(() => {
    if (!tenantDbId || !laraAgentId) return;
    const ch = supabase.channel('lara-runs')
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'agent_runs',
        filter: `tenant_id=eq.${tenantDbId}`,
      }, ({ new: run }) => {
        if (run.agent_id !== laraAgentId) return;
        setHistRuns(prev => [run, ...prev]);

        const targetTab = pendingTabRef.current;
        const runIdMatch = pendingRunIdRef.current && run.trigger_dev_run_id === pendingRunIdRef.current;
        // fallback: no run id → first incoming run wins
        const fallback = !pendingRunIdRef.current && targetTab != null;

        if (runIdMatch || fallback) {
          const out = run.output;
          if (targetTab === 'pesquisar') setResPesq(out);
          else if (targetTab === 'conteudo') setResCont(out);
          else if (targetTab === 'tendencia') setResTend(out);
          pendingRunIdRef.current = null;
          pendingTabRef.current   = null;
          setLoading(prev => ({ ...prev, [targetTab]: false }));
        }
      })
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [tenantDbId, laraAgentId]);

  async function runTask(taskId, payload, tabId) {
    const { data: { session } } = await supabase.auth.getSession();
    const jwt = session?.access_token;
    setLoading(prev => ({ ...prev, [tabId]: true }));
    pendingTabRef.current   = tabId;
    pendingRunIdRef.current = null;

    try {
      const res = await fetch(`${BRIDGE_BASE}/agents/${taskId}/run`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
        },
        body: JSON.stringify({ tenant_id: tenantDbId, payload }),
      });
      if (!res.ok) {
        const err = await res.text();
        throw new Error(`${res.status}: ${err}`);
      }
      const body = await res.json();
      pendingRunIdRef.current = body.run_id ?? body.id ?? body.runId ?? null;
    } catch (err) {
      setLoading(prev => ({ ...prev, [tabId]: false }));
      pendingTabRef.current   = null;
      pendingRunIdRef.current = null;
      alert(`Erro: ${err.message}`);
    }
  }

  function submitPesquisar() {
    if (!fLojaNome.trim()) return;
    setResPesq(null);
    runTask('lara-pesquisar-loja', {
      loja_id:    fLojaId || undefined,
      loja_nome:  fLojaNome,
      cidade:     fCidade    || undefined,
      ifood_link: fIfoodLink || undefined,
      instagram:  fInstagram || undefined,
    }, 'pesquisar');
  }

  function submitConteudo() {
    if (!cLojaNome.trim() || !cObjetivo.trim()) return;
    setResCont(null);
    runTask('lara-gerar-conteudo', {
      loja_nome: cLojaNome,
      tipo:      cTipo,
      objetivo:  cObjetivo,
      contexto:  cContexto || undefined,
      tom:       cTom      || undefined,
      cupom:     cCupom    || undefined,
    }, 'conteudo');
  }

  function submitTendencia() {
    if (!tSegmento.trim()) return;
    setResTend(null);
    runTask('lara-analisar-tendencia', {
      segmento: tSegmento,
      cidade:   tCidade || undefined,
      foco:     tFoco   || undefined,
    }, 'tendencia');
  }

  // ── render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', maxWidth: 840, margin: '0 auto', padding: '24px 16px 0' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--red)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 18 }}>L</div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 16 }}>LARA</div>
          <div style={{ fontSize: 12, color: 'var(--text2)' }}>CRM &amp; Marketing — food service</div>
        </div>

        {lojas.length > 0 && (
          <select
            value={fLojaId}
            onChange={e => setFLojaId(e.target.value)}
            style={{ marginLeft: 'auto', padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text1)', fontSize: 13 }}
          >
            <option value="">— selecionar loja —</option>
            {lojas.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
          </select>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 2, marginBottom: 24, borderBottom: '1px solid var(--border)', paddingBottom: 0 }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: '8px 16px', border: 'none', background: 'transparent',
            color: tab === t.id ? 'var(--red)' : 'var(--text2)',
            fontWeight: tab === t.id ? 700 : 400, fontSize: 13, cursor: 'pointer',
            borderBottom: tab === t.id ? '2px solid var(--red)' : '2px solid transparent',
            marginBottom: -1,
          }}>
            {t.label}
            {t.id !== 'historico' && loading[t.id] && (
              <svg width="10" height="10" viewBox="0 0 24 24" style={{ marginLeft: 6, animation: 'spin 0.8s linear infinite', display: 'inline' }}>
                <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="3" strokeDasharray="60" strokeDashoffset="20" />
              </svg>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto' }} className="dark-scroll">

        {/* ── Pesquisar loja ── */}
        {tab === 'pesquisar' && (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <Field label="Nome da loja *">
                <input style={inputStyle} value={fLojaNome} onChange={e => setFLojaNome(e.target.value)} placeholder="Ex: Pizza do Zé" />
              </Field>
              <Field label="Cidade">
                <input style={inputStyle} value={fCidade} onChange={e => setFCidade(e.target.value)} placeholder="Ex: São Paulo" />
              </Field>
              <Field label="Link iFood">
                <input style={inputStyle} value={fIfoodLink} onChange={e => setFIfoodLink(e.target.value)} placeholder="https://ifood.com.br/..." />
              </Field>
              <Field label="Instagram">
                <input style={inputStyle} value={fInstagram} onChange={e => setFInstagram(e.target.value)} placeholder="@nomedoperfil" />
              </Field>
            </div>
            <RunBtn loading={loading.pesquisar} disabled={!fLojaNome.trim()} onClick={submitPesquisar}>
              Pesquisar loja
            </RunBtn>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 8 }}>
              LARA busca iFood, Google, Instagram e Google Maps. Pode levar 1-2 min.
            </div>
            <ResultPesquisa data={resPesq} />
          </div>
        )}

        {/* ── Gerar conteúdo ── */}
        {tab === 'conteudo' && (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <Field label="Nome da loja *">
                <input style={inputStyle} value={cLojaNome} onChange={e => setCLojaNome(e.target.value)} placeholder="Ex: Pizza do Zé" />
              </Field>
              <Field label="Tipo de conteúdo *">
                <select style={inputStyle} value={cTipo} onChange={e => setCTipo(e.target.value)}>
                  {TIPO_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </Field>
            </div>
            <div style={{ marginBottom: 12 }}>
              <Field label="Objetivo *">
                <input style={inputStyle} value={cObjetivo} onChange={e => setCObjetivo(e.target.value)} placeholder="Ex: reativar clientes inativos, promover novo produto, black friday" />
              </Field>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
              <Field label="Tom de voz">
                <input style={inputStyle} value={cTom} onChange={e => setCTom(e.target.value)} placeholder="Ex: informal, premium" />
              </Field>
              <Field label="Cupom">
                <input style={inputStyle} value={cCupom} onChange={e => setCCupom(e.target.value)} placeholder="Ex: VOLTA10" />
              </Field>
              <Field label="Contexto adicional">
                <input style={inputStyle} value={cContexto} onChange={e => setCContexto(e.target.value)} placeholder="Produto destaque, promoção ativa..." />
              </Field>
            </div>
            <RunBtn loading={loading.conteudo} disabled={!cLojaNome.trim() || !cObjetivo.trim()} onClick={submitConteudo}>
              Gerar 3 variações
            </RunBtn>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 8 }}>
              LARA gera 3 variações (produto / benefício / urgência) prontas para usar.
            </div>
            <ResultConteudo data={resCont} />
          </div>
        )}

        {/* ── Tendências ── */}
        {tab === 'tendencia' && (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
              <Field label="Segmento *">
                <input style={inputStyle} value={tSegmento} onChange={e => setTSegmento(e.target.value)} placeholder="Ex: pizza, açaí, japonesa" />
              </Field>
              <Field label="Cidade">
                <input style={inputStyle} value={tCidade} onChange={e => setTCidade(e.target.value)} placeholder="Ex: São Paulo" />
              </Field>
              <Field label="Foco específico">
                <input style={inputStyle} value={tFoco} onChange={e => setTFoco(e.target.value)} placeholder="Ex: cardápio, marketing, preços" />
              </Field>
            </div>
            <RunBtn loading={loading.tendencia} disabled={!tSegmento.trim()} onClick={submitTendencia}>
              Analisar tendências
            </RunBtn>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 8 }}>
              LARA pesquisa iFood, Google Trends e notícias recentes do setor. Pode levar 1-2 min.
            </div>
            <ResultTendencia data={resTend} />
          </div>
        )}

        {/* ── Histórico ── */}
        {tab === 'historico' && (
          <div>
            {histRuns.length === 0 ? (
              <div style={{ textAlign: 'center', color: 'var(--text3)', fontSize: 13, padding: '40px 0' }}>
                Nenhuma execução registrada ainda.
              </div>
            ) : (
              histRuns.map(r => <RunCard key={r.id} run={r} />)
            )}
          </div>
        )}

        <div style={{ height: 32 }} />
      </div>
    </div>
  );
}
