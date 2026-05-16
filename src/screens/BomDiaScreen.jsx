import { useState, useRef, useEffect } from 'react';
import { supabase } from '../lib/supabase.js';

const BRIDGE_URL = import.meta.env.VITE_BRIDGE_URL || 'https://bridge.consultdelivery.com.br';
const BD_COLOR   = '#F59E0B';
const BD_BG      = 'rgba(245,158,11,0.08)';

const DAY_PT   = ['Domingo','Segunda-feira','Terça-feira','Quarta-feira','Quinta-feira','Sexta-feira','Sábado'];
const MONTH_PT = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];

function formatLong(dateStr) {
  if (!dateStr) return '—';
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return `${DAY_PT[dt.getDay()]}, ${d} de ${MONTH_PT[m - 1]} de ${y}`;
}

function formatShort(dateStr) {
  if (!dateStr) return '—';
  const [, m, d] = dateStr.split('-').map(Number);
  return `${String(d).padStart(2,'0')}/${String(m).padStart(2,'0')}`;
}

// ── Avatar sol ──────────────────────────────────────────────────────────────

function BomDiaAvatar({ size = 32 }) {
  const cx = size / 2, cy = size / 2;
  const coreR  = size * 0.27;
  const r1     = size * 0.34;
  const r2     = size * 0.48;
  const rays   = [0, 45, 90, 135, 180, 225, 270, 315];
  const sw     = Math.max(1.5, size * 0.07);
  return (
    <div style={{ width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <radialGradient id={`sg${size}`} cx="40%" cy="35%" r="65%">
            <stop offset="0%" stopColor="#FDE68A" />
            <stop offset="100%" stopColor="#F59E0B" />
          </radialGradient>
        </defs>
        {rays.map(a => {
          const rad = (a * Math.PI) / 180;
          return (
            <line
              key={a}
              x1={cx + r1 * Math.cos(rad)} y1={cy + r1 * Math.sin(rad)}
              x2={cx + r2 * Math.cos(rad)} y2={cy + r2 * Math.sin(rad)}
              stroke="#F59E0B" strokeWidth={sw} strokeLinecap="round"
            />
          );
        })}
        <circle cx={cx} cy={cy} r={coreR} fill={`url(#sg${size})`} />
      </svg>
    </div>
  );
}

// ── Download WebP → JPEG ────────────────────────────────────────────────────

async function downloadAsJpeg(url, filename) {
  try {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
    const canvas = document.createElement('canvas');
    canvas.width  = img.naturalWidth;
    canvas.height = img.naturalHeight;
    canvas.getContext('2d').drawImage(img, 0, 0);
    await new Promise(res => {
      canvas.toBlob(blob => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = filename;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
        res();
      }, 'image/jpeg', 0.93);
    });
  } catch {
    window.open(url, '_blank');
  }
}

// ── Estilos ─────────────────────────────────────────────────────────────────

const card = {
  background: 'rgba(255,255,255,0.03)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 12, padding: 20,
};

const btnYellow = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer',
  fontSize: 13, fontWeight: 600, background: BD_COLOR, color: '#1a1a1a',
};

const btnOutline = (disabled) => ({
  display: 'inline-flex', alignItems: 'center', gap: 6,
  padding: '8px 14px', borderRadius: 8, cursor: disabled ? 'default' : 'pointer',
  fontSize: 12, fontWeight: 600, background: 'transparent',
  color: disabled ? 'rgba(255,255,255,0.3)' : BD_COLOR,
  border: `1px solid ${disabled ? 'rgba(255,255,255,0.1)' : BD_COLOR + '66'}`,
  opacity: disabled ? 0.6 : 1,
});

const btnGhost = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  padding: '7px 13px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)',
  cursor: 'pointer', fontSize: 12, fontWeight: 500,
  background: 'transparent', color: 'rgba(255,255,255,0.55)',
};

// ── Formatos de imagem ───────────────────────────────────────────────────────

const FORMATS = [
  { key: 'group',    label: 'WhatsApp Grupo',    sub: '1080×1350 · 4:5 · Feed da conversa', ratio: '4/5',  field: 'img_group_url'    },
  { key: 'portrait', label: 'Stories Instagram', sub: '1080×1920 · 9:16 · Status / Reels',  ratio: '9/16', field: 'img_portrait_url' },
];

// ── Componente principal ─────────────────────────────────────────────────────

export default function BomDiaScreen({ tenantDbId, userId }) {
  // run state
  const [runs,       setRuns]       = useState([]);
  const [selected,   setSelected]   = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [generating, setGenerating] = useState(false);
  const [genError,   setGenError]   = useState('');
  const [caption,    setCaption]    = useState('');
  const [copied,     setCopied]     = useState(false);
  const [dlState,    setDlState]    = useState({});
  const pendingRef = useRef(null);

  // send-groups state
  const [sendOpen,   setSendOpen]   = useState(false);
  const [groups,     setGroups]     = useState([]);
  const [selGroups,  setSelGroups]  = useState(new Set());
  const [sendFmt,    setSendFmt]    = useState('group');
  const [sending,    setSending]    = useState(false);
  const [sendResult, setSendResult] = useState(null);

  // agent config state
  const [configOpen, setConfigOpen] = useState(false);
  const [agentCfg,   setAgentCfg]  = useState({ memory: '', instructions: '' });
  const [savingCfg,  setSavingCfg] = useState(false);

  // ── Fetch runs ─────────────────────────────────────────────────────────────
  const fetchRuns = () => {
    supabase
      .from('agent_runs')
      .select('id, output, created_at, status')
      .eq('agent_id', 'bom-dia')
      .eq('status', 'success')
      .order('created_at', { ascending: false })
      .limit(10)
      .then(({ data }) => {
        const valid = (data || []).filter(r => r.output?.img_group_url || r.output?.img_landscape_url);
        setRuns(valid);
        if (valid.length && !selected) {
          setSelected(valid[0]);
          setCaption(valid[0].output?.caption ?? '');
        }
        setLoading(false);
      });
  };

  useEffect(() => { fetchRuns(); }, []);

  // ── Fetch WhatsApp groups ──────────────────────────────────────────────────
  const fetchGroups = () => {
    if (!tenantDbId) return;
    supabase
      .from('whatsapp_groups')
      .select('id, group_jid, nome')
      .eq('tenant_id', tenantDbId)
      .eq('ativo', true)
      .order('nome')
      .then(({ data }) => setGroups(data || []));
  };

  // ── Fetch agent config ─────────────────────────────────────────────────────
  const fetchConfig = () => {
    if (!tenantDbId) return;
    supabase
      .from('tenant_agent_config')
      .select('config')
      .eq('tenant_id', tenantDbId)
      .eq('agent_id', 'bom-dia')
      .maybeSingle()
      .then(({ data }) => {
        if (data?.config) setAgentCfg({
          memory:       data.config.memory       ?? '',
          instructions: data.config.instructions ?? '',
        });
      });
  };

  const selectRun = (r) => {
    setSelected(r);
    setCaption(r.output?.caption ?? '');
    setSendResult(null);
  };

  // ── Realtime: aguarda novo run após "Gerar agora" ──────────────────────────
  useEffect(() => {
    const channel = supabase
      .channel('bom-dia-screen-runs')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'agent_runs' }, (payload) => {
        const run = payload.new;
        if (run.agent_id !== 'bom-dia') return;
        if (!pendingRef.current || run.trigger_dev_run_id !== pendingRef.current) return;
        if (run.status === 'success' && run.output?.img_landscape_url) {
          setRuns(prev => [run, ...prev].slice(0, 10));
          setSelected(run);
          setCaption(run.output?.caption ?? '');
          setGenerating(false);
          pendingRef.current = null;
        }
      })
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, []);

  // ── Gerar agora ────────────────────────────────────────────────────────────
  const handleGenerate = async () => {
    setGenError('');
    setGenerating(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const r = await fetch(`${BRIDGE_URL}/agents/bom-dia/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ tenant_id: tenantDbId, payload: { triggered_by: userId } }),
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error || `Erro ${r.status}`);
      pendingRef.current = body.run_id ?? null;
      if (body.output?.img_landscape_url) {
        fetchRuns();
        setGenerating(false);
        pendingRef.current = null;
      }
    } catch (e) {
      setGenError(e.message);
      setGenerating(false);
    }
  };

  // ── Download JPEG ──────────────────────────────────────────────────────────
  const handleDownload = async (fmtKey) => {
    const out = selected?.output;
    if (!out) return;
    const fmt = FORMATS.find(f => f.key === fmtKey);
    const url = out[fmt.field];
    if (!url) return;
    const date = out.date ?? 'bom-dia';
    setDlState(s => ({ ...s, [fmtKey]: true }));
    await downloadAsJpeg(url, `bom-dia-${date}-${fmtKey}.jpg`);
    setDlState(s => ({ ...s, [fmtKey]: false }));
  };

  // ── Copy caption ───────────────────────────────────────────────────────────
  const handleCopy = () => {
    if (!caption) return;
    navigator.clipboard.writeText(caption).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  // ── Enviar nos grupos ──────────────────────────────────────────────────────
  const handleOpenSend = () => {
    fetchGroups();
    setSendResult(null);
    setSendOpen(true);
  };

  const toggleGroup = (jid) => {
    setSelGroups(prev => {
      const next = new Set(prev);
      next.has(jid) ? next.delete(jid) : next.add(jid);
      return next;
    });
  };

  const handleSend = async () => {
    if (!selGroups.size) return;
    const out = selected?.output;
    if (!out) return;
    const fmt = FORMATS.find(f => f.key === sendFmt);
    const imageUrl = out[fmt?.field] || out.img_landscape_url;
    setSending(true);
    setSendResult(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const r = await fetch(`${BRIDGE_URL}/agents/bom-dia/send-groups`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ tenant_id: tenantDbId, group_jids: [...selGroups], image_url: imageUrl, caption }),
      });
      const body = await r.json();
      setSendResult(body);
    } catch (e) {
      setSendResult({ error: e.message });
    } finally {
      setSending(false);
    }
  };

  // ── Salvar config ──────────────────────────────────────────────────────────
  const handleOpenConfig = () => {
    fetchConfig();
    setConfigOpen(true);
  };

  const handleSaveConfig = async () => {
    if (!tenantDbId) return;
    setSavingCfg(true);
    await supabase.from('tenant_agent_config').upsert(
      { tenant_id: tenantDbId, agent_id: 'bom-dia', config: agentCfg },
      { onConflict: 'tenant_id,agent_id' }
    );
    setSavingCfg(false);
    setConfigOpen(false);
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  const out = selected?.output ?? null;

  const availFmts = FORMATS.filter(f => out && out[f.field]);
  const colCount  = Math.max(1, availFmts.length);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 32 }}>
        <BomDiaAvatar size={36} />
        <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14 }}>Carregando artes…</span>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 940, margin: '0 auto', padding: '28px 20px', position: 'relative' }}>

      {/* Cabeçalho */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        paddingBottom: 20, borderBottom: '1px solid rgba(255,255,255,0.07)', marginBottom: 24,
      }}>
        <BomDiaAvatar size={42} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#fff' }}>Bom Dia</div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>
            Arte motivacional diária para WhatsApp · seg–sex 08:55 · sáb 07:55
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={btnGhost} onClick={handleOpenConfig} title="Configurar agente">
            ⚙ Configurar
          </button>
          <button
            style={generating ? { ...btnYellow, opacity: 0.65, cursor: 'default' } : btnYellow}
            onClick={generating ? undefined : handleGenerate}
            disabled={generating}
          >
            {generating ? '⏳ Gerando…' : '✦ Gerar agora'}
          </button>
        </div>
      </div>

      {genError && (
        <div style={{ ...card, background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.3)', marginBottom: 16, color: '#FCA5A5', fontSize: 13 }}>
          {genError}
        </div>
      )}

      {generating && (
        <div style={{ ...card, display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, background: BD_BG, border: `1px solid ${BD_COLOR}33` }}>
          <BomDiaAvatar size={28} />
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: BD_COLOR }}>Gerando imagens…</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>Claude cria o prompt · Recraft renderiza Grupo WA (4:5) + Stories (9:16) (~1–2 min)</div>
          </div>
        </div>
      )}

      {/* Estado vazio */}
      {!out && !generating && (
        <div style={{ ...card, textAlign: 'center', padding: 48 }}>
          <BomDiaAvatar size={48} />
          <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14, marginTop: 16 }}>Nenhuma arte gerada ainda.</div>
          <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12, marginTop: 6 }}>
            Clique em "Gerar agora" ou aguarde o agendamento automático.
          </div>
        </div>
      )}

      {out && (
        <>
          {/* Data e tema */}
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#fff' }}>{formatLong(out.date)}</div>
            <div style={{ fontSize: 13, color: BD_COLOR, marginTop: 4 }}>Tema: {out.theme}</div>
          </div>

          {/* Imagens — grid dinâmico */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${colCount}, 1fr)`,
            gap: 14, marginBottom: 20,
          }}>
            {availFmts.map(({ key, label, sub, ratio, field }) => (
              <div key={key} style={card}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.35)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  {label}
                  <span style={{ fontWeight: 400, marginLeft: 4 }}>· {sub}</span>
                </div>
                <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 8, overflow: 'hidden', marginBottom: 10 }}>
                  <img
                    src={out[field]}
                    alt={`Arte ${key}`}
                    style={{
                      width: '100%', display: 'block',
                      aspectRatio: ratio,
                      objectFit: 'cover', objectPosition: 'top',
                      maxHeight: key === 'portrait' ? 220 : key === 'group' ? 300 : undefined,
                    }}
                  />
                </div>
                <button
                  style={{ ...btnYellow, width: '100%', justifyContent: 'center', fontSize: 12, opacity: dlState[key] ? 0.65 : 1 }}
                  onClick={() => handleDownload(key)}
                  disabled={!!dlState[key]}
                >
                  {dlState[key] ? 'Baixando…' : '↓ Baixar JPEG'}
                </button>
              </div>
            ))}
          </div>

          {/* Legenda editável */}
          <div style={{ ...card, marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Legenda para WhatsApp
              </div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)' }}>Edite antes de copiar</div>
            </div>
            <textarea
              value={caption}
              onChange={e => setCaption(e.target.value)}
              rows={9}
              style={{
                width: '100%', boxSizing: 'border-box',
                background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 8, padding: '12px 14px',
                color: 'rgba(255,255,255,0.85)', fontSize: 13, lineHeight: 1.65,
                fontFamily: 'inherit', resize: 'vertical', outline: 'none',
              }}
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
              <button style={copied ? { ...btnYellow, opacity: 0.8 } : btnOutline(false)} onClick={handleCopy}>
                {copied ? '✓ Copiado!' : 'Copiar legenda'}
              </button>
              <button
                style={btnOutline(caption === (out?.caption ?? ''))}
                onClick={() => setCaption(out?.caption ?? '')}
                disabled={caption === (out?.caption ?? '')}
              >
                ↺ Restaurar original
              </button>
              <button
                style={{ ...btnOutline(false), marginLeft: 'auto' }}
                onClick={handleOpenSend}
              >
                📤 Enviar nos grupos
              </button>
            </div>
          </div>

          {/* Painel: Enviar nos grupos */}
          {sendOpen && (
            <div style={{ ...card, marginBottom: 16, border: `1px solid ${BD_COLOR}44`, background: BD_BG }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: BD_COLOR }}>Enviar nos grupos WhatsApp</div>
                <button style={{ ...btnGhost, padding: '4px 10px', fontSize: 11 }} onClick={() => { setSendOpen(false); setSendResult(null); }}>
                  Fechar
                </button>
              </div>

              {/* Seletor de formato */}
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 8, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>Formato a enviar</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {FORMATS.filter(f => out[f.field]).map(f => (
                    <button
                      key={f.key}
                      onClick={() => setSendFmt(f.key)}
                      style={{
                        padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                        border: `1px solid ${sendFmt === f.key ? BD_COLOR : 'rgba(255,255,255,0.15)'}`,
                        background: sendFmt === f.key ? `${BD_COLOR}22` : 'transparent',
                        color: sendFmt === f.key ? BD_COLOR : 'rgba(255,255,255,0.6)',
                      }}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Lista de grupos */}
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 8, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Grupos ({groups.length})
                </div>
                {groups.length === 0 ? (
                  <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)', padding: '12px 0' }}>
                    Nenhum grupo WhatsApp cadastrado para este tenant.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {groups.map(g => (
                      <label
                        key={g.group_jid}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
                          borderRadius: 6, cursor: 'pointer',
                          background: selGroups.has(g.group_jid) ? 'rgba(245,158,11,0.1)' : 'rgba(255,255,255,0.02)',
                          border: `1px solid ${selGroups.has(g.group_jid) ? BD_COLOR + '44' : 'rgba(255,255,255,0.07)'}`,
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={selGroups.has(g.group_jid)}
                          onChange={() => toggleGroup(g.group_jid)}
                          style={{ accentColor: BD_COLOR, width: 15, height: 15 }}
                        />
                        <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)', flex: 1 }}>
                          {g.nome || g.group_jid}
                        </span>
                        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', fontFamily: 'monospace' }}>
                          {g.group_jid.split('@')[0].slice(-6)}
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              {/* Resultado de envio */}
              {sendResult && (
                <div style={{
                  marginBottom: 14, padding: '10px 14px', borderRadius: 8, fontSize: 13,
                  background: sendResult.error ? 'rgba(220,38,38,0.1)' : 'rgba(34,197,94,0.08)',
                  border: `1px solid ${sendResult.error ? 'rgba(220,38,38,0.3)' : 'rgba(34,197,94,0.25)'}`,
                  color: sendResult.error ? '#FCA5A5' : 'rgba(255,255,255,0.8)',
                }}>
                  {sendResult.error
                    ? `Erro: ${sendResult.error}`
                    : `✓ Enviado para ${sendResult.sent?.length ?? 0} grupo(s)${sendResult.failed?.length ? ` · ${sendResult.failed.length} falha(s)` : ''}`
                  }
                </div>
              )}

              {/* Botão enviar */}
              <button
                style={{ ...btnYellow, opacity: (sending || !selGroups.size) ? 0.65 : 1, cursor: (!selGroups.size || sending) ? 'default' : 'pointer' }}
                onClick={handleSend}
                disabled={sending || !selGroups.size}
              >
                {sending ? '⏳ Enviando…' : `📤 Enviar para ${selGroups.size || '—'} grupo${selGroups.size !== 1 ? 's' : ''}`}
              </button>
            </div>
          )}
        </>
      )}

      {/* Histórico */}
      {runs.length > 0 && (
        <div style={card}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.4)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 1 }}>
            Histórico · últimos {runs.length} dias
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {runs.map(r => {
              const o = r.output ?? {};
              const isActive = r.id === selected?.id;
              const hasGroup = !!o.img_group_url;
              return (
                <div
                  key={r.id}
                  onClick={() => selectRun(r)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px',
                    borderRadius: 8, cursor: 'pointer',
                    background: isActive ? BD_BG : 'transparent',
                    border: isActive ? `1px solid ${BD_COLOR}44` : '1px solid transparent',
                  }}
                >
                  <span style={{ fontSize: 12, fontWeight: 700, color: BD_COLOR, minWidth: 36 }}>
                    {formatShort(o.date)}
                  </span>
                  <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.75)', flex: 1 }}>
                    {o.theme ?? 'sem tema'}
                  </span>
                  {hasGroup && (
                    <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', fontWeight: 500 }}>3 formatos</span>
                  )}
                  {isActive && <span style={{ fontSize: 11, color: BD_COLOR, fontWeight: 600 }}>exibindo</span>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Modal: Configurar agente */}
      {configOpen && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
          }}
          onClick={e => { if (e.target === e.currentTarget) setConfigOpen(false); }}
        >
          <div style={{
            background: '#181818', border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 14, padding: 28, width: '100%', maxWidth: 540,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 22 }}>
              <BomDiaAvatar size={32} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>Configurar Agente Bom Dia</div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>Salvo no perfil do tenant · aplicado nas próximas gerações</div>
              </div>
              <button style={{ ...btnGhost, padding: '4px 10px' }} onClick={() => setConfigOpen(false)}>✕</button>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 8 }}>
                Memória do agente
              </label>
              <textarea
                value={agentCfg.memory}
                onChange={e => setAgentCfg(c => ({ ...c, memory: e.target.value }))}
                rows={4}
                placeholder="Ex: Clientes preferem mensagens mais curtas. Sempre mencionar o Thiago no grupo da Padaria Bom Pão."
                style={{
                  width: '100%', boxSizing: 'border-box',
                  background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 8, padding: '10px 12px',
                  color: 'rgba(255,255,255,0.8)', fontSize: 13, lineHeight: 1.55,
                  fontFamily: 'inherit', resize: 'vertical', outline: 'none',
                }}
              />
            </div>

            <div style={{ marginBottom: 24 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 8 }}>
                Instruções personalizadas
              </label>
              <textarea
                value={agentCfg.instructions}
                onChange={e => setAgentCfg(c => ({ ...c, instructions: e.target.value }))}
                rows={5}
                placeholder="Ex: Sempre incluir emojis de foguete 🚀. Usar tom mais descontraído às sextas-feiras. Evitar frases genéricas como 'bom dia'."
                style={{
                  width: '100%', boxSizing: 'border-box',
                  background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 8, padding: '10px 12px',
                  color: 'rgba(255,255,255,0.8)', fontSize: 13, lineHeight: 1.55,
                  fontFamily: 'inherit', resize: 'vertical', outline: 'none',
                }}
              />
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button style={btnGhost} onClick={() => setConfigOpen(false)}>Cancelar</button>
              <button
                style={{ ...btnYellow, opacity: savingCfg ? 0.65 : 1 }}
                onClick={handleSaveConfig}
                disabled={savingCfg}
              >
                {savingCfg ? 'Salvando…' : 'Salvar configuração'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
