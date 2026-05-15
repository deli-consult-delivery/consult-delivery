import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase.js';

const BRENO_COLOR = '#0369A1';
const BRENO_BG = 'rgba(3,105,161,0.12)';
const BRIDGE = import.meta.env.VITE_BRIDGE_URL || 'http://localhost:3001';

function BrenoAvatar({ size = 32 }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: `linear-gradient(135deg, ${BRENO_COLOR}, #075985)`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.38, fontWeight: 700, color: '#fff', flexShrink: 0,
    }}>B</div>
  );
}

function SentimentoBadge({ sentimento }) {
  const map = {
    positivo: { label: 'Positivo', color: '#16a34a' },
    neutro:   { label: 'Neutro',   color: '#6b7280' },
    negativo: { label: 'Negativo', color: '#D97706' },
    critico:  { label: 'Crítico',  color: '#dc2626' },
  };
  const m = map[sentimento] || map.neutro;
  return (
    <span style={{ background: `${m.color}22`, color: m.color, border: `1px solid ${m.color}44`, borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 600 }}>
      {m.label}
    </span>
  );
}

function UrgenciaBadge({ urgencia }) {
  const map = {
    baixa: { label: 'Baixa', color: '#16a34a' },
    media: { label: 'Média', color: '#D97706' },
    alta:  { label: 'Alta',  color: '#dc2626' },
  };
  const m = map[urgencia] || map.baixa;
  return (
    <span style={{ background: `${m.color}22`, color: m.color, border: `1px solid ${m.color}44`, borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 600 }}>
      Urgência {m.label}
    </span>
  );
}

function Spinner() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" style={{ animation: 'spin 0.8s linear infinite', flexShrink: 0 }}>
      <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2.5" strokeDasharray="60" strokeDashoffset="20" />
    </svg>
  );
}

const labelStyle = { fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.6)', display: 'block', marginBottom: 6 };
const inputStyle = { width: '100%', boxSizing: 'border-box', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, padding: '9px 12px', color: 'rgba(255,255,255,0.85)', fontSize: 13, outline: 'none', fontFamily: 'inherit' };
const cardStyle = { padding: 16, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10 };

// ── Aba Estatísticas ──────────────────────────────────────────────────────────
function StatsTab({ tenantDbId }) {
  const [stats, setStats] = useState(null);
  const [interactions, setInteractions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tenantDbId) return;
    (async () => {
      const [{ data: ints }, { data: pending }] = await Promise.all([
        supabase.from('breno_interactions').select('id, mode, action_taken, requires_review, created_at, breno_response').eq('tenant_id', tenantDbId).order('created_at', { ascending: false }).limit(50),
        supabase.from('breno_interactions').select('id', { count: 'exact' }).eq('tenant_id', tenantDbId).eq('requires_review', true).eq('action_taken', 'suggested'),
      ]);
      const rows = ints || [];
      const total = rows.length;
      const byMode = rows.reduce((acc, r) => { acc[r.mode] = (acc[r.mode] || 0) + 1; return acc; }, {});
      const byAction = rows.reduce((acc, r) => { acc[r.action_taken] = (acc[r.action_taken] || 0) + 1; return acc; }, {});
      setStats({ total, byMode, byAction, pendingReview: pending?.length ?? 0 });
      setInteractions(rows.slice(0, 20));
      setLoading(false);
    })();
  }, [tenantDbId]);

  if (loading) return <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>Carregando estatísticas…</div>;

  const statCard = (label, value, color = BRENO_COLOR) => (
    <div style={{ flex: 1, minWidth: 100, padding: '16px 20px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, textAlign: 'center' }}>
      <div style={{ fontSize: 28, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 4 }}>{label}</div>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {statCard('Total de interações', stats?.total ?? 0)}
        {statCard('Enviadas diretamente', stats?.byAction?.sent ?? 0, '#16a34a')}
        {statCard('Sugestões pendentes', stats?.pendingReview ?? 0, '#D97706')}
        {statCard('Ignoradas (modo humano)', stats?.byAction?.skipped ?? 0, 'rgba(255,255,255,0.4)')}
      </div>

      <div>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.08em', marginBottom: 12 }}>ÚLTIMAS INTERAÇÕES</div>
        {!interactions.length ? (
          <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13, textAlign: 'center', padding: '32px 0' }}>Nenhuma interação registrada ainda.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {interactions.map(i => {
              const modeColor = i.mode === 'ia' ? '#16a34a' : i.mode === 'hibrido' ? BRENO_COLOR : 'rgba(255,255,255,0.3)';
              const actionColor = i.action_taken === 'sent' ? '#16a34a' : i.action_taken === 'suggested' ? '#D97706' : 'rgba(255,255,255,0.3)';
              return (
                <div key={i.id} style={{ padding: '10px 14px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 8, display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.75)', lineHeight: 1.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {i.breno_response || <em style={{ color: 'rgba(255,255,255,0.3)' }}>sem resposta gerada</em>}
                    </div>
                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginTop: 4 }}>
                      {new Date(i.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <span style={{ fontSize: 10, fontWeight: 600, color: modeColor, background: `${modeColor}22`, padding: '2px 7px', borderRadius: 5 }}>{i.mode}</span>
                    <span style={{ fontSize: 10, fontWeight: 600, color: actionColor, background: `${actionColor}22`, padding: '2px 7px', borderRadius: 5 }}>{i.action_taken}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Aba Responder ─────────────────────────────────────────────────────────────
function ResponderTab({ tenantDbId, userId }) {
  const [conversationId, setConversationId] = useState('');
  const [message, setMessage] = useState('');
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const pendingRef = useRef(null);

  useEffect(() => {
    if (!tenantDbId) return;
    supabase.from('conversations').select('id, contact_name, phone_number').eq('tenant_id', tenantDbId).order('updated_at', { ascending: false }).limit(30)
      .then(({ data }) => setConversations(data || []));
  }, [tenantDbId]);

  useEffect(() => {
    if (!tenantDbId) return;
    const ch = supabase.channel('breno-responder-runs')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'agent_runs', filter: `tenant_id=eq.${tenantDbId}` }, (p) => {
        const run = p.new;
        if (run.agent_id !== 'breno' || !pendingRef.current || run.trigger_dev_run_id !== pendingRef.current) return;
        if (run.status === 'completed') { setResult(run.output); setLoading(false); pendingRef.current = null; }
      })
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [tenantDbId]);

  const submit = async () => {
    if (!message.trim()) { setError('Digite a mensagem do cliente.'); return; }
    setError(''); setLoading(true); setResult(null);
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token;
      const body = { tenant_id: tenantDbId, user_id: userId, message: message.trim(), triggered_by: userId };
      if (conversationId) body.conversation_id = conversationId;
      else body.conversation_id = '00000000-0000-0000-0000-000000000000';
      const res = await fetch(`${BRIDGE}/agents/breno-responder/run`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao chamar BRENO');
      pendingRef.current = data.trigger_run_id || data.run_id;
    } catch (e) { setError(e.message); setLoading(false); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ padding: 14, background: BRENO_BG, borderRadius: 10, border: `1px solid ${BRENO_COLOR}44` }}>
        <p style={{ margin: 0, fontSize: 13, color: 'rgba(255,255,255,0.7)' }}>
          Cole a mensagem do cliente e BRENO sugere uma resposta. A sugestão vai para aprovação antes de enviar.
        </p>
      </div>

      {conversations.length > 0 && (
        <div>
          <label style={labelStyle}>Conversa (opcional)</label>
          <select style={inputStyle} value={conversationId} onChange={e => setConversationId(e.target.value)}>
            <option value="">Sem conversa associada</option>
            {conversations.map(c => <option key={c.id} value={c.id}>{c.contact_name || c.phone_number}</option>)}
          </select>
        </div>
      )}

      <div>
        <label style={labelStyle}>Mensagem do cliente *</label>
        <textarea style={{ ...inputStyle, minHeight: 100, resize: 'vertical' }}
          placeholder="Ex: Oi, quero saber o horário de funcionamento de vocês"
          value={message} onChange={e => setMessage(e.target.value)} />
      </div>

      {error && <p style={{ color: '#f87171', fontSize: 13, margin: 0 }}>{error}</p>}

      <button onClick={submit} disabled={loading} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 24px', background: loading ? 'rgba(255,255,255,0.06)' : BRENO_COLOR, color: loading ? 'rgba(255,255,255,0.4)' : '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', alignSelf: 'flex-start' }}>
        {loading ? <><Spinner /> Gerando resposta…</> : '💬 Gerar Resposta'}
      </button>

      {loading && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', background: BRENO_BG, border: `1px solid ${BRENO_COLOR}44`, borderRadius: 10 }}>
          <BrenoAvatar size={28} />
          <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>BRENO está redigindo a resposta…</span>
        </div>
      )}

      {result && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ ...cardStyle, borderLeft: `3px solid ${BRENO_COLOR}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.6)' }}>Resposta sugerida</span>
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>tom: {result.tom}</span>
            </div>
            <p style={{ margin: 0, fontSize: 14, color: 'rgba(255,255,255,0.9)', lineHeight: 1.6 }}>{result.resposta}</p>
          </div>
          {result.precisa_humano && (
            <div style={{ ...cardStyle, borderLeft: '3px solid #dc2626', background: 'rgba(220,38,38,0.08)' }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#dc2626' }}>⚠️ Atenção humana necessária</span>
              <p style={{ margin: '6px 0 0', fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>{result.motivo_humano}</p>
            </div>
          )}
          {result.draft_id && (
            <p style={{ margin: 0, fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>✓ Draft criado em Disparos para aprovação — ID: {result.draft_id.slice(0, 8)}…</p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Aba Resumir ───────────────────────────────────────────────────────────────
function ResumirTab({ tenantDbId, userId }) {
  const [conversationId, setConversationId] = useState('');
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const pendingRef = useRef(null);

  useEffect(() => {
    if (!tenantDbId) return;
    supabase.from('conversations').select('id, contact_name, phone_number').eq('tenant_id', tenantDbId).order('updated_at', { ascending: false }).limit(50)
      .then(({ data }) => setConversations(data || []));
  }, [tenantDbId]);

  useEffect(() => {
    if (!tenantDbId) return;
    const ch = supabase.channel('breno-resumir-runs')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'agent_runs', filter: `tenant_id=eq.${tenantDbId}` }, (p) => {
        const run = p.new;
        if (run.agent_id !== 'breno' || !pendingRef.current || run.trigger_dev_run_id !== pendingRef.current) return;
        if (run.status === 'completed') { setResult(run.output); setLoading(false); pendingRef.current = null; }
      })
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [tenantDbId]);

  const submit = async () => {
    if (!conversationId) { setError('Selecione uma conversa.'); return; }
    setError(''); setLoading(true); setResult(null);
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token;
      const res = await fetch(`${BRIDGE}/agents/breno-resumir-conversa/run`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ conversation_id: conversationId, tenant_id: tenantDbId, user_id: userId, triggered_by: userId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao chamar BRENO');
      pendingRef.current = data.trigger_run_id || data.run_id;
    } catch (e) { setError(e.message); setLoading(false); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <label style={labelStyle}>Selecionar conversa *</label>
        <select style={inputStyle} value={conversationId} onChange={e => setConversationId(e.target.value)}>
          <option value="">Escolher conversa…</option>
          {conversations.map(c => <option key={c.id} value={c.id}>{c.contact_name || c.phone_number}</option>)}
        </select>
      </div>

      {error && <p style={{ color: '#f87171', fontSize: 13, margin: 0 }}>{error}</p>}

      <button onClick={submit} disabled={loading || !conversationId} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 24px', background: (loading || !conversationId) ? 'rgba(255,255,255,0.06)' : BRENO_COLOR, color: (loading || !conversationId) ? 'rgba(255,255,255,0.4)' : '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: (loading || !conversationId) ? 'not-allowed' : 'pointer', alignSelf: 'flex-start' }}>
        {loading ? <><Spinner /> Resumindo…</> : '📋 Resumir Conversa'}
      </button>

      {loading && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', background: BRENO_BG, border: `1px solid ${BRENO_COLOR}44`, borderRadius: 10 }}>
          <BrenoAvatar size={28} />
          <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>BRENO está analisando a conversa…</span>
        </div>
      )}

      {result?.resumo && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
              <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>{result.resumo.assunto_principal}</h4>
              <div style={{ display: 'flex', gap: 6 }}>
                <SentimentoBadge sentimento={result.resumo.sentimento_cliente} />
                <UrgenciaBadge urgencia={result.resumo.urgencia} />
              </div>
            </div>
            {result.resumo.pontos_chave?.length > 0 && (
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginBottom: 6 }}>PONTOS-CHAVE</div>
                <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {result.resumo.pontos_chave.map((p, i) => <li key={i} style={{ fontSize: 13, color: 'rgba(255,255,255,0.75)' }}>{p}</li>)}
                </ul>
              </div>
            )}
            {result.resumo.pendencias?.length > 0 && (
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginBottom: 6 }}>PENDÊNCIAS</div>
                <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {result.resumo.pendencias.map((p, i) => <li key={i} style={{ fontSize: 13, color: '#D97706' }}>{p}</li>)}
                </ul>
              </div>
            )}
            <div style={{ padding: '8px 12px', background: `${BRENO_COLOR}22`, borderRadius: 7, fontSize: 12, color: 'rgba(255,255,255,0.85)', fontWeight: 500 }}>
              ▶ {result.resumo.proxima_acao}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Aba Drafts BRENO ──────────────────────────────────────────────────────────
function DraftsTab({ tenantDbId }) {
  const [drafts, setDrafts] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!tenantDbId) return;
    const { data } = await supabase.from('agent_drafts').select('*').eq('tenant_id', tenantDbId).eq('agent_name', 'breno').order('created_at', { ascending: false }).limit(30);
    setDrafts(data || []);
    setLoading(false);
  }, [tenantDbId]);

  useEffect(() => { load(); }, [load]);

  const approve = async (id) => {
    await supabase.from('agent_drafts').update({ status: 'approved' }).eq('id', id);
    load();
  };
  const reject = async (id) => {
    await supabase.from('agent_drafts').update({ status: 'rejected' }).eq('id', id);
    load();
  };

  if (loading) return <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>Carregando…</div>;
  if (!drafts.length) return (
    <div style={{ textAlign: 'center', padding: '48px 24px', color: 'rgba(255,255,255,0.4)' }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
      <p style={{ fontSize: 14 }}>Nenhum draft pendente de BRENO.</p>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {drafts.map(d => {
        const isFlagged = d.status === 'flagged';
        const isPending = d.status === 'pending';
        return (
          <div key={d.id} style={{ ...cardStyle, borderLeft: `3px solid ${isFlagged ? '#dc2626' : isPending ? BRENO_COLOR : 'rgba(255,255,255,0.1)'}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 8 }}>
              <div>
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{new Date(d.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                {d.metadata?.sender_name && <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginLeft: 8 }}>• {d.metadata.sender_name}</span>}
                {isFlagged && <span style={{ fontSize: 11, color: '#dc2626', marginLeft: 8, fontWeight: 700 }}>⚠️ Atenção necessária</span>}
              </div>
              <span style={{ fontSize: 11, fontWeight: 600, color: isPending || isFlagged ? BRENO_COLOR : d.status === 'approved' ? '#16a34a' : 'rgba(255,255,255,0.3)', flexShrink: 0 }}>
                {d.status === 'pending' ? 'Pendente' : d.status === 'flagged' ? 'Sinalizado' : d.status === 'approved' ? 'Aprovado' : 'Rejeitado'}
              </span>
            </div>
            {d.metadata?.mensagem_original && (
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 8, fontStyle: 'italic' }}>
                Cliente: "{d.metadata.mensagem_original.slice(0, 80)}…"
              </div>
            )}
            <p style={{ margin: '0 0 10px', fontSize: 13, color: 'rgba(255,255,255,0.85)', lineHeight: 1.5 }}>{d.content}</p>
            {(isPending || isFlagged) && (
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => approve(d.id)} style={{ flex: 1, padding: '6px 12px', background: 'rgba(22,163,74,0.15)', border: '1px solid rgba(22,163,74,0.3)', borderRadius: 6, color: '#16a34a', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>✓ Aprovar</button>
                <button onClick={() => reject(d.id)} style={{ flex: 1, padding: '6px 12px', background: 'rgba(220,38,38,0.1)', border: '1px solid rgba(220,38,38,0.25)', borderRadius: 6, color: '#dc2626', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>✕ Rejeitar</button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
const TABS = ['Estatísticas', 'Responder', 'Resumir', 'Drafts'];

export default function BrenoScreen({ tenantDbId, userId }) {
  const [activeTab, setActiveTab] = useState(0);

  return (
    <div style={{ padding: '24px', maxWidth: 760, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <BrenoAvatar size={42} />
        <div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: 'rgba(255,255,255,0.9)' }}>BRENO · Atendimento</h1>
          <p style={{ margin: 0, fontSize: 13, color: 'rgba(255,255,255,0.45)' }}>Assistente do Eduardo — respostas e resumos de conversas WhatsApp</p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 4, marginBottom: 24, background: 'rgba(255,255,255,0.04)', padding: 4, borderRadius: 10 }}>
        {TABS.map((t, i) => (
          <button key={t} onClick={() => setActiveTab(i)} style={{ flex: 1, padding: '8px 4px', borderRadius: 7, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, background: activeTab === i ? BRENO_COLOR : 'transparent', color: activeTab === i ? '#fff' : 'rgba(255,255,255,0.5)', transition: 'all 0.15s' }}>
            {t}
          </button>
        ))}
      </div>

      {activeTab === 0 && <StatsTab tenantDbId={tenantDbId} />}
      {activeTab === 1 && <ResponderTab tenantDbId={tenantDbId} userId={userId} />}
      {activeTab === 2 && <ResumirTab tenantDbId={tenantDbId} userId={userId} />}
      {activeTab === 3 && <DraftsTab tenantDbId={tenantDbId} />}
    </div>
  );
}
