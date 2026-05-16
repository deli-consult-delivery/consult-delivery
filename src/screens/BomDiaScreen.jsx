import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase.js';

const BD_COLOR = '#F59E0B';
const BD_BG    = 'rgba(245,158,11,0.08)';

const DAY_NAMES_PT = ['Domingo','Segunda-feira','Terça-feira','Quarta-feira','Quinta-feira','Sexta-feira','Sábado'];
const MONTHS_PT    = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];

function formatDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt  = new Date(y, m - 1, d);
  const day = DAY_NAMES_PT[dt.getDay()];
  return `${day}, ${d} de ${MONTHS_PT[m - 1]} de ${y}`;
}

function formatShort(dateStr) {
  const [, m, d] = dateStr.split('-').map(Number);
  return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`;
}

function BomDiaAvatar({ size = 32 }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: `linear-gradient(135deg, ${BD_COLOR}, #FCD34D)`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.38, fontWeight: 700, color: '#1a1a1a', flexShrink: 0,
    }}>
      BD
    </div>
  );
}

async function downloadImage(url, filename) {
  try {
    const res  = await fetch(url);
    const blob = await res.blob();
    const link = document.createElement('a');
    link.href     = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    URL.revokeObjectURL(link.href);
  } catch {
    window.open(url, '_blank');
  }
}

export default function BomDiaScreen({ tenantDbId }) {
  const [runs,    setRuns]    = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [copied,  setCopied]  = useState(false);

  useEffect(() => {
    if (!tenantDbId) { setLoading(false); return; }
    supabase
      .from('agent_runs')
      .select('id, output, created_at, status')
      .eq('agent_id', 'bom-dia')
      .eq('status', 'success')
      .order('created_at', { ascending: false })
      .limit(7)
      .then(({ data }) => {
        const valid = (data || []).filter(r => r.output?.img_landscape_url);
        setRuns(valid);
        setSelected(valid[0] ?? null);
        setLoading(false);
      });
  }, [tenantDbId]);

  const out = selected?.output ?? null;

  const handleCopy = () => {
    if (!out?.caption) return;
    navigator.clipboard.writeText(out.caption).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleDownload = (type) => {
    if (!out) return;
    const url      = type === 'landscape' ? out.img_landscape_url : out.img_portrait_url;
    const date     = out.date ?? 'bom-dia';
    const filename = `bom-dia-${date}-${type}.webp`;
    downloadImage(url, filename);
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  const headerStyle = {
    display: 'flex', alignItems: 'center', gap: 12,
    padding: '0 0 20px', borderBottom: '1px solid rgba(255,255,255,0.07)',
    marginBottom: 24,
  };

  const cardStyle = {
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 12, padding: 20,
  };

  const imgWrapStyle = {
    background: 'rgba(0,0,0,0.3)', borderRadius: 10,
    overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: 0,
  };

  const btnPrimary = {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer',
    fontSize: 13, fontWeight: 600,
    background: BD_COLOR, color: '#1a1a1a',
  };

  const btnOutline = {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '8px 14px', borderRadius: 8, cursor: 'pointer',
    fontSize: 12, fontWeight: 600,
    background: 'transparent', color: BD_COLOR,
    border: `1px solid ${BD_COLOR}66`,
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 32 }}>
        <BomDiaAvatar size={36} />
        <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14 }}>Carregando artes…</span>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', padding: '28px 20px' }}>

      {/* Cabeçalho */}
      <div style={headerStyle}>
        <BomDiaAvatar size={40} />
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#fff' }}>Bom Dia</div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', marginTop: 2 }}>
            Arte motivacional diária para WhatsApp
          </div>
        </div>
      </div>

      {/* Estado vazio */}
      {!out && (
        <div style={{ ...cardStyle, textAlign: 'center', padding: 48 }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>☀️</div>
          <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14 }}>
            Nenhuma arte gerada ainda.
          </div>
          <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12, marginTop: 6 }}>
            O agente roda automaticamente seg–sex às 08:55 e sáb às 07:55.
          </div>
        </div>
      )}

      {out && (
        <>
          {/* Data e tema */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#fff' }}>
              {out.date ? formatDate(out.date) : '—'}
            </div>
            <div style={{ fontSize: 13, color: BD_COLOR, marginTop: 4 }}>
              Tema: {out.theme}
            </div>
          </div>

          {/* Imagens */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
            {/* Landscape */}
            <div style={cardStyle}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.5)', marginBottom: 10 }}>
                Landscape · 16:9
              </div>
              <div style={imgWrapStyle}>
                <img
                  src={out.img_landscape_url}
                  alt="Arte landscape"
                  style={{ width: '100%', display: 'block', aspectRatio: '16/9', objectFit: 'cover' }}
                />
              </div>
              <button style={{ ...btnPrimary, marginTop: 12, width: '100%', justifyContent: 'center' }}
                onClick={() => handleDownload('landscape')}>
                ↓ Baixar Landscape
              </button>
            </div>

            {/* Portrait */}
            <div style={cardStyle}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.5)', marginBottom: 10 }}>
                Portrait · 9:16
              </div>
              <div style={{ ...imgWrapStyle, maxHeight: 260, overflow: 'hidden' }}>
                <img
                  src={out.img_portrait_url}
                  alt="Arte portrait"
                  style={{ width: '100%', display: 'block', objectFit: 'cover', objectPosition: 'top' }}
                />
              </div>
              <button style={{ ...btnPrimary, marginTop: 12, width: '100%', justifyContent: 'center' }}
                onClick={() => handleDownload('portrait')}>
                ↓ Baixar Portrait
              </button>
            </div>
          </div>

          {/* Legenda */}
          <div style={{ ...cardStyle, marginBottom: 24 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.5)', marginBottom: 10 }}>
              Legenda para WhatsApp
            </div>
            <pre style={{
              margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              fontSize: 13, lineHeight: 1.65, color: 'rgba(255,255,255,0.85)',
              fontFamily: 'inherit',
            }}>
              {out.caption}
            </pre>
            <div style={{ marginTop: 14 }}>
              <button style={copied ? { ...btnPrimary, opacity: 0.8 } : btnOutline} onClick={handleCopy}>
                {copied ? '✓ Copiado!' : 'Copiar legenda'}
              </button>
            </div>
          </div>
        </>
      )}

      {/* Histórico */}
      {runs.length > 1 && (
        <div style={cardStyle}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.4)', marginBottom: 14, textTransform: 'uppercase', letterSpacing: 1 }}>
            Histórico
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {runs.map((r) => {
              const o       = r.output ?? {};
              const isActive = r.id === selected?.id;
              return (
                <div
                  key={r.id}
                  onClick={() => setSelected(r)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px',
                    borderRadius: 8, cursor: 'pointer',
                    background: isActive ? BD_BG : 'transparent',
                    border: isActive ? `1px solid ${BD_COLOR}44` : '1px solid transparent',
                    transition: 'background 0.15s',
                  }}
                >
                  <span style={{ fontSize: 12, fontWeight: 600, color: BD_COLOR, minWidth: 38 }}>
                    {o.date ? formatShort(o.date) : '—'}
                  </span>
                  <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.75)', flex: 1 }}>
                    {o.theme ?? 'sem tema'}
                  </span>
                  {isActive && (
                    <span style={{ fontSize: 11, color: BD_COLOR }}>atual</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
