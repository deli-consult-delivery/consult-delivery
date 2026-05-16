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

function BomDiaAvatar({ size = 32 }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: `linear-gradient(135deg, ${BD_COLOR}, #FCD34D)`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: Math.round(size * 0.38), fontWeight: 700, color: '#1a1a1a', flexShrink: 0,
    }}>BD</div>
  );
}

// Download WebP da Storage → converte para JPEG via canvas
async function downloadAsJpeg(url, filename) {
  try {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    await new Promise((res, rej) => {
      img.onload  = res;
      img.onerror = rej;
      img.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width  = img.naturalWidth;
    canvas.height = img.naturalHeight;
    canvas.getContext('2d').drawImage(img, 0, 0);
    await new Promise(res => {
      canvas.toBlob(blob => {
        const a = document.createElement('a');
        a.href     = URL.createObjectURL(blob);
        a.download = filename;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
        res();
      }, 'image/jpeg', 0.93);
    });
  } catch {
    // fallback: abre em nova aba se canvas falhar (CORS)
    window.open(url, '_blank');
  }
}

// ── Estilos compartilhados ──────────────────────────────────────────────────

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

// ── Componente principal ────────────────────────────────────────────────────

export default function BomDiaScreen({ tenantDbId, userId }) {
  const [runs,      setRuns]      = useState([]);
  const [selected,  setSelected]  = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [generating, setGenerating] = useState(false);
  const [genError,  setGenError]  = useState('');
  const [caption,   setCaption]   = useState('');  // editável localmente
  const [copied,    setCopied]    = useState(false);
  const [dlState,   setDlState]   = useState({});  // { landscape: bool, portrait: bool }
  const pendingRef = useRef(null);

  // ── Fetch inicial (sem filtro de tenant_id — imagens são globais) ───────────
  const fetchRuns = () => {
    supabase
      .from('agent_runs')
      .select('id, output, created_at, status')
      .eq('agent_id', 'bom-dia')
      .eq('status', 'success')
      .order('created_at', { ascending: false })
      .limit(10)
      .then(({ data }) => {
        const valid = (data || []).filter(r => r.output?.img_landscape_url);
        setRuns(valid);
        if (valid.length && !selected) {
          setSelected(valid[0]);
          setCaption(valid[0].output?.caption ?? '');
        }
        setLoading(false);
      });
  };

  useEffect(() => { fetchRuns(); }, []);

  // Quando usuário seleciona item do histórico, reseta caption para o do run
  const selectRun = (r) => {
    setSelected(r);
    setCaption(r.output?.caption ?? '');
  };

  // ── Real-time: aguarda novo run após "Gerar agora" ──────────────────────────
  useEffect(() => {
    const channel = supabase
      .channel('bom-dia-screen-runs')
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'agent_runs',
      }, (payload) => {
        const run = payload.new;
        if (run.agent_id !== 'bom-dia') return;
        if (!pendingRef.current && run.trigger_dev_run_id !== pendingRef.current) return;
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

  // ── Gerar agora ─────────────────────────────────────────────────────────────
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
      // Se retornou output direto (idempotência / run já existia hoje)
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

  // ── Download como JPEG ──────────────────────────────────────────────────────
  const handleDownload = async (type) => {
    const out = selected?.output;
    if (!out) return;
    const url  = type === 'landscape' ? out.img_landscape_url : out.img_portrait_url;
    const date = out.date ?? 'bom-dia';
    setDlState(s => ({ ...s, [type]: true }));
    await downloadAsJpeg(url, `bom-dia-${date}-${type}.jpg`);
    setDlState(s => ({ ...s, [type]: false }));
  };

  // ── Copy caption ────────────────────────────────────────────────────────────
  const handleCopy = () => {
    if (!caption) return;
    navigator.clipboard.writeText(caption).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  const out = selected?.output ?? null;

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 32 }}>
        <BomDiaAvatar size={36} />
        <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14 }}>Carregando artes…</span>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '28px 20px' }}>

      {/* Cabeçalho */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        paddingBottom: 20, borderBottom: '1px solid rgba(255,255,255,0.07)', marginBottom: 24,
      }}>
        <BomDiaAvatar size={40} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#fff' }}>Bom Dia</div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>
            Arte motivacional diária para WhatsApp · seg–sex 08:55 · sáb 07:55
          </div>
        </div>
        <button
          style={generating ? { ...btnYellow, opacity: 0.65, cursor: 'default' } : btnYellow}
          onClick={generating ? undefined : handleGenerate}
          disabled={generating}
        >
          {generating ? '⏳ Gerando…' : '✦ Gerar agora'}
        </button>
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
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>Claude está criando o prompt e a Recraft está renderizando (~1–2 min)</div>
          </div>
        </div>
      )}

      {/* Estado vazio */}
      {!out && !generating && (
        <div style={{ ...card, textAlign: 'center', padding: 48 }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>☀️</div>
          <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14 }}>Nenhuma arte gerada ainda.</div>
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

          {/* Imagens */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
            {[
              { type: 'landscape', url: out.img_landscape_url, label: 'Landscape · 16:9 · Stories/Feed' },
              { type: 'portrait',  url: out.img_portrait_url,  label: 'Portrait · 9:16 · Status/Reels' },
            ].map(({ type, url, label }) => (
              <div key={type} style={card}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.4)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  {label}
                </div>
                <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 8, overflow: 'hidden', marginBottom: 12 }}>
                  <img
                    src={url}
                    alt={`Arte ${type}`}
                    style={{
                      width: '100%', display: 'block',
                      aspectRatio: type === 'landscape' ? '16/9' : '9/16',
                      objectFit: 'cover', objectPosition: 'top',
                      maxHeight: type === 'portrait' ? 260 : undefined,
                    }}
                  />
                </div>
                <button
                  style={{ ...btnYellow, width: '100%', justifyContent: 'center', opacity: dlState[type] ? 0.65 : 1 }}
                  onClick={() => handleDownload(type)}
                  disabled={!!dlState[type]}
                >
                  {dlState[type] ? 'Baixando…' : `↓ Baixar JPEG (${type === 'landscape' ? '16:9' : '9:16'})`}
                </button>
              </div>
            ))}
          </div>

          {/* Legenda editável */}
          <div style={{ ...card, marginBottom: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Legenda para WhatsApp
              </div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)' }}>Edite antes de copiar</div>
            </div>
            <textarea
              value={caption}
              onChange={e => setCaption(e.target.value)}
              rows={10}
              style={{
                width: '100%', boxSizing: 'border-box',
                background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 8, padding: '12px 14px',
                color: 'rgba(255,255,255,0.85)', fontSize: 13, lineHeight: 1.65,
                fontFamily: 'inherit', resize: 'vertical', outline: 'none',
              }}
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button
                style={copied ? { ...btnYellow, opacity: 0.8 } : btnOutline(false)}
                onClick={handleCopy}
              >
                {copied ? '✓ Copiado!' : 'Copiar legenda'}
              </button>
              <button
                style={btnOutline(caption === (out?.caption ?? ''))}
                onClick={() => setCaption(out?.caption ?? '')}
                disabled={caption === (out?.caption ?? '')}
                title="Desfazer edições"
              >
                ↺ Restaurar original
              </button>
            </div>
          </div>
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
              const o       = r.output ?? {};
              const isActive = r.id === selected?.id;
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
                  {isActive && <span style={{ fontSize: 11, color: BD_COLOR, fontWeight: 600 }}>exibindo</span>}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
