import { useState, useEffect, useRef, useCallback } from 'react';

const BRIDGE = import.meta.env.VITE_BRIDGE_URL || 'https://bridge.consultdelivery.com.br';

function statusCor(status, aguardando) {
  if (aguardando) return { bg: 'var(--amber-soft)', color: 'var(--amber)', label: 'AGUARDANDO APROVAÇÃO' };
  if (status === 'ativa')     return { bg: '#e8f3ec', color: '#1e7d43', label: 'ATIVA' };
  if (status === 'concluida') return { bg: '#f0f0f0', color: '#76716c', label: 'CONCLUÍDA' };
  if (status === 'falha')     return { bg: '#faeae8', color: '#B70C00', label: 'FALHA' };
  return { bg: '#f0f0f0', color: '#76716c', label: status?.toUpperCase() || '?' };
}

function BadgeStatus({ status, aguardando }) {
  const s = statusCor(status, aguardando);
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, letterSpacing: '.4px',
      textTransform: 'uppercase', padding: '2px 7px', borderRadius: 4,
      background: s.bg, color: s.color,
    }}>{s.label}</span>
  );
}

function SessionRow({ session, selected, onClick }) {
  const s = statusCor(session.status, session.aguardando_aprovacao);
  return (
    <div
      onClick={onClick}
      style={{
        padding: '11px 14px', borderRadius: 5, cursor: 'pointer',
        background: selected ? 'var(--red-soft)' : 'transparent',
        border: selected ? '1px solid #e5b8b5' : '1px solid transparent',
        marginBottom: 4,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <span style={{
          width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
          background: s.color,
          boxShadow: session.status === 'ativa' ? `0 0 0 3px ${s.bg}` : 'none',
        }} />
        <span style={{ fontWeight: 700, fontSize: 13, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {session.slug}
        </span>
        <BadgeStatus status={session.status} aguardando={session.aguardando_aprovacao} />
      </div>
      {session.prompt && (
        <div style={{ fontSize: 11.5, color: 'var(--tx2)', paddingLeft: 16, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {session.prompt}
        </div>
      )}
      {session.log_atualizado && (
        <div style={{ fontSize: 10.5, color: 'var(--tx2)', paddingLeft: 16, marginTop: 2 }}>
          {new Date(session.log_atualizado).toLocaleString('pt-BR')}
        </div>
      )}
    </div>
  );
}

export default function MonitorSessoes() {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState(null);
  const [selected, setSelected] = useState(null);
  const [logLines, setLogLines] = useState('');
  const [conectado, setConectado] = useState(false);
  const logRef = useRef(null);
  const esRef = useRef(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro(null);
    try {
      const { supabase } = await import('../lib/supabase.js');
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      const r = await fetch(`${BRIDGE}/api/monitor/sessions`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      setSessions(data);
    } catch (err) {
      setErro(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  useEffect(() => {
    if (!selected) { setLogLines(''); setConectado(false); return; }

    if (esRef.current) { esRef.current.close(); esRef.current = null; }
    setLogLines('');
    setConectado(false);

    let alive = true;
    (async () => {
      const { supabase } = await import('../lib/supabase.js');
      const { data: { session } } = await supabase.auth.getSession();
      if (!alive) return;
      const token = session?.access_token;

      // EventSource nativo não suporta headers customizados — token via query param.
      // O bridge aceita ?token= apenas no handler SSE (não globalmente).
      // Tokens Supabase têm TTL de 1h; não elevar esse TTL sem revisar este fluxo.
      const url = `${BRIDGE}/api/monitor/logs/${encodeURIComponent(selected)}${token ? `?token=${encodeURIComponent(token)}` : ''}`;

      const es = new EventSource(url);
      esRef.current = es;

      es.onopen = () => { if (alive) setConectado(true); };

      es.onmessage = (e) => {
        if (!alive) return;
        try {
          const payload = JSON.parse(e.data);
          if (payload.reset) {
            setLogLines(payload.lines);
          } else {
            setLogLines(prev => prev + payload.lines);
          }
        } catch { /* ignore */ }
      };

      es.onerror = () => { if (alive) setConectado(false); };
    })();

    return () => {
      alive = false;
      if (esRef.current) { esRef.current.close(); esRef.current = null; }
    };
  }, [selected]);

  // Auto-scroll para o final
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [logLines]);

  const aguardandoCount = sessions.filter(s => s.aguardando_aprovacao).length;
  const ativasCount = sessions.filter(s => s.status === 'ativa').length;

  return (
    <div style={{ padding: '28px 32px 56px', maxWidth: 1280, margin: '0 auto' }}>
      {/* Cabeçalho */}
      <div style={{ marginBottom: 20, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 className="anton" style={{ marginBottom: 4 }}>Monitor de Agentes</h1>
          <div className="cv2-rule" />
          <p style={{ marginTop: 8, color: 'var(--tx2)', fontSize: 13 }}>
            Sessões autônomas (cd-spawn) — logs em tempo real via SSE.
          </p>
        </div>
        <button className="cv2-btn sec" onClick={carregar} disabled={loading}>
          {loading ? 'Carregando…' : 'Atualizar'}
        </button>
      </div>

      {/* KPIs */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <div className="cv2-kpi" style={{ minWidth: 120 }}>
          <div style={{ fontSize: 24, fontWeight: 800, color: ativasCount > 0 ? 'var(--green)' : 'var(--ink)' }}>{ativasCount}</div>
          <div style={{ fontSize: 11, color: 'var(--tx2)', textTransform: 'uppercase', letterSpacing: '.4px' }}>Ativas</div>
        </div>
        <div className="cv2-kpi" style={{ minWidth: 120 }}>
          <div style={{ fontSize: 24, fontWeight: 800, color: aguardandoCount > 0 ? 'var(--amber)' : 'var(--ink)' }}>{aguardandoCount}</div>
          <div style={{ fontSize: 11, color: 'var(--tx2)', textTransform: 'uppercase', letterSpacing: '.4px' }}>Aguardando OK</div>
        </div>
        <div className="cv2-kpi" style={{ minWidth: 120 }}>
          <div style={{ fontSize: 24, fontWeight: 800 }}>{sessions.length}</div>
          <div style={{ fontSize: 11, color: 'var(--tx2)', textTransform: 'uppercase', letterSpacing: '.4px' }}>Total</div>
        </div>
      </div>

      {erro && (
        <div style={{ background: 'var(--red-soft)', color: 'var(--red)', padding: '10px 14px', borderRadius: 5, marginBottom: 16, fontSize: 13 }}>
          Erro ao carregar sessões: {erro}
        </div>
      )}

      {/* Layout split */}
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
        {/* Lista de sessões */}
        <div style={{
          width: 300, flexShrink: 0,
          background: '#fff', border: '1px solid var(--line)', borderRadius: 6, padding: 12,
          maxHeight: 600, overflowY: 'auto',
        }}>
          {loading && sessions.length === 0 && (
            <div style={{ color: 'var(--tx2)', fontSize: 13, padding: '20px 0', textAlign: 'center' }}>Carregando…</div>
          )}
          {!loading && sessions.length === 0 && (
            <div style={{ color: 'var(--tx2)', fontSize: 13, padding: '20px 0', textAlign: 'center' }}>
              Nenhuma sessão encontrada.<br />
              <span style={{ fontSize: 11.5 }}>Spawn alguma sessão com cd-spawn.</span>
            </div>
          )}
          {sessions.map(s => (
            <SessionRow
              key={s.slug}
              session={s}
              selected={selected === s.slug}
              onClick={() => setSelected(s.slug === selected ? null : s.slug)}
            />
          ))}
        </div>

        {/* Painel de log */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {!selected ? (
            <div style={{
              background: '#fff', border: '1px solid var(--line)', borderRadius: 6,
              padding: 40, textAlign: 'center', color: 'var(--tx2)', fontSize: 13,
            }}>
              Selecione uma sessão para ver o log em tempo real.
            </div>
          ) : (
            <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 6, overflow: 'hidden' }}>
              {/* Header do log */}
              <div style={{
                padding: '10px 16px', borderBottom: '1px solid var(--line)',
                display: 'flex', alignItems: 'center', gap: 10,
              }}>
                <span style={{ fontWeight: 700, fontSize: 13, flex: 1 }}>{selected}</span>
                <span style={{
                  fontSize: 10, fontWeight: 700, letterSpacing: '.4px', textTransform: 'uppercase',
                  padding: '2px 8px', borderRadius: 4,
                  background: conectado ? '#e8f3ec' : '#f0f0f0',
                  color: conectado ? '#1e7d43' : '#76716c',
                }}>
                  {conectado ? 'AO VIVO' : 'CONECTANDO…'}
                </span>
                <button
                  className="cv2-btn sec"
                  style={{ fontSize: 11, padding: '4px 10px' }}
                  onClick={() => setSelected(null)}
                >
                  Fechar
                </button>
              </div>
              {/* Conteúdo do log */}
              <pre
                ref={logRef}
                style={{
                  margin: 0, padding: 16,
                  background: '#0d0d0d', color: '#d4d4d4',
                  fontFamily: "'JetBrains Mono', 'Fira Code', 'Courier New', monospace",
                  fontSize: 11.5, lineHeight: 1.6,
                  maxHeight: 520, overflowY: 'auto',
                  whiteSpace: 'pre-wrap', wordBreak: 'break-all',
                }}
              >
                {logLines || '(aguardando dados…)'}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
