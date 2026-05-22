import { useState, useRef, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase.js';

const BRIDGE_URL = import.meta.env.VITE_BRIDGE_URL || 'https://bridge.consultdelivery.com.br';

// ── Design tokens ─────────────────────────────────────────────────────────────
const O      = '#f97316';
const OD     = '#c2550f';
const BG     = '#0E0E0E';
const BG2    = '#131313';
const BORDER = 'rgba(255,255,255,0.07)';

// ── Helpers ───────────────────────────────────────────────────────────────────
const DAY_PT   = ['Domingo','Segunda-feira','Terça-feira','Quarta-feira','Quinta-feira','Sexta-feira','Sábado'];
const MONTH_PT = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];

function formatLong(dateStr) {
  if (!dateStr) return '—';
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return `${DAY_PT[dt.getDay()]}, ${d} de ${MONTH_PT[m - 1]} de ${y}`;
}

function formatTime(isoStr) {
  if (!isoStr) return '';
  return new Date(isoStr).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

async function downloadFile(url, filename) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const href = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = href;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(href), 5000);
  } catch {
    window.open(url, '_blank');
  }
}

// ── Image formats ─────────────────────────────────────────────────────────────
const FORMATS = [
  { key: 'group',    label: 'Feed',  sub: '16:9 · 1820×1024', ratio: '16/9', field: 'img_group_url'    },
  { key: 'portrait', label: 'Story', sub: '9:16 · 1024×1820', ratio: '9/16', field: 'img_portrait_url' },
];

// ── Avatar (meia-lua / pôr do sol) ────────────────────────────────────────────
function EncerramentoAvatar({ size = 32 }) {
  const cx = size / 2, cy = size / 2;
  const gId = `enc-orange-${size}`;
  const moonR = size * 0.30;
  return (
    <div style={{ width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} fill="none">
        <defs>
          <radialGradient id={gId} cx="35%" cy="30%" r="70%">
            <stop offset="0%" stopColor="#FFB347" />
            <stop offset="100%" stopColor={O} />
          </radialGradient>
        </defs>
        {/* Horizon line */}
        <line x1={size * 0.1} y1={cy + moonR * 0.55} x2={size * 0.9} y2={cy + moonR * 0.55} stroke={O} strokeWidth={Math.max(1, size * 0.045)} strokeLinecap="round" opacity="0.45" />
        {/* Sun half setting */}
        <path
          d={`M ${cx - moonR} ${cy + moonR * 0.55} A ${moonR} ${moonR} 0 0 1 ${cx + moonR} ${cy + moonR * 0.55}`}
          fill={`url(#${gId})`}
        />
        {/* Small rays above */}
        {[-60, -30, 0, 30, 60].map(a => {
          const rad = ((a - 90) * Math.PI) / 180;
          const r1 = moonR * 1.22, r2 = moonR * 1.52;
          return (
            <line key={a}
              x1={cx + r1 * Math.cos(rad)} y1={cy + r1 * Math.sin(rad)}
              x2={cx + r2 * Math.cos(rad)} y2={cy + r2 * Math.sin(rad)}
              stroke={O} strokeWidth={Math.max(1, size * 0.055)} strokeLinecap="round"
            />
          );
        })}
      </svg>
    </div>
  );
}

// ── ImageLightbox ─────────────────────────────────────────────────────────────
function ImageLightbox({ src, alt, onClose }) {
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const handleWheel = (e) => {
    e.preventDefault();
    setScale(s => Math.min(5, Math.max(0.5, s * (e.deltaY < 0 ? 1.1 : 0.9))));
  };

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(0,0,0,0.94)', backdropFilter: 'blur(10px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      onWheel={handleWheel}
    >
      <img
        src={src} alt={alt} draggable={false}
        style={{ maxWidth: '90vw', maxHeight: '90vh', transform: `scale(${scale})`, transition: 'transform 0.15s', objectFit: 'contain', borderRadius: 8, userSelect: 'none' }}
      />
      <div style={{ position: 'absolute', top: 16, right: 16, display: 'flex', gap: 6 }}>
        {[
          { label: '+', title: 'Ampliar',   onClick: () => setScale(s => Math.min(5, s + 0.3)) },
          { label: `${Math.round(scale * 100)}%`, title: 'Resetar', onClick: () => setScale(1) },
          { label: '−', title: 'Reduzir',   onClick: () => setScale(s => Math.max(0.5, s - 0.3)) },
          { label: '✕', title: 'Fechar',    onClick: onClose },
        ].map(btn => (
          <button key={btn.label} onClick={btn.onClick} title={btn.title}
            style={{ minWidth: 36, height: 36, padding: '0 8px', borderRadius: 8, border: `1px solid ${BORDER}`, background: 'rgba(0,0,0,0.7)', color: btn.label === '✕' ? 'rgba(255,255,255,0.5)' : '#fff', cursor: 'pointer', fontSize: btn.label === '✕' ? 14 : 18, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            {btn.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Status badge ──────────────────────────────────────────────────────────────
const STATUS_CFG = {
  success:   { bg: 'rgba(16,185,129,0.12)', border: 'rgba(16,185,129,0.3)', color: '#6ee7b7', label: 'Publicado' },
  published: { bg: 'rgba(16,185,129,0.12)', border: 'rgba(16,185,129,0.3)', color: '#6ee7b7', label: 'Publicado' },
  draft:     { bg: `${O}12`,               border: `${O}44`,               color: O,          label: 'Rascunho'  },
  scheduled: { bg: 'rgba(139,92,246,0.12)', border: 'rgba(139,92,246,0.3)', color: '#c4b5fd', label: 'Agendado'  },
  failed:    { bg: 'rgba(220,38,38,0.1)',   border: 'rgba(220,38,38,0.3)',  color: '#fca5a5', label: 'Falhou'    },
};

function StatusBadge({ status }) {
  const s = STATUS_CFG[status] || STATUS_CFG.draft;
  return (
    <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase', padding: '2px 7px', borderRadius: 4, background: s.bg, border: `1px solid ${s.border}`, color: s.color }}>
      {s.label}
    </span>
  );
}

// ── Group helpers ─────────────────────────────────────────────────────────────
const GROUP_COLORS = [O, '#7C3AED', '#2563EB', '#0F766E', '#B45309'];

function groupInitials(name) {
  if (!name) return '?';
  return name.replace(/[^a-zA-ZÀ-ÿ0-9\s]/g, '').trim()
    .split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';
}

function formatGroupName(g) {
  return g.group_name || 'Grupo';
}

function GroupAvatar({ g, size = 28 }) {
  const name = formatGroupName(g);
  const hash = name.split('').reduce((h, c) => h + c.charCodeAt(0), 0);
  const bg   = GROUP_COLORS[hash % GROUP_COLORS.length];
  if (g.picture_url) {
    return (
      <img src={g.picture_url} alt={name}
        style={{ width: size, height: size, borderRadius: '50%', flexShrink: 0, objectFit: 'cover' }}
        onError={e => { e.currentTarget.style.display = 'none'; }}
      />
    );
  }
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', flexShrink: 0, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.38, fontWeight: 700, color: '#fff', fontFamily: "'Oswald', sans-serif" }}>
      {groupInitials(name)}
    </div>
  );
}

// ── AgentMessage ──────────────────────────────────────────────────────────────
function AgentMessage({ run, tenantDbId, isLast }) {
  const out = run.output ?? {};
  const groupUrl    = out.img_group_url;
  const portraitUrl = out.img_portrait_url;
  const [artTab,        setArtTab]        = useState(() => groupUrl && portraitUrl ? 'both' : portraitUrl ? 'story' : 'feed');
  const [caption,       setCaption]       = useState(out.caption ?? '');
  const [copied,        setCopied]        = useState(false);
  const [dlState,       setDlState]       = useState({});
  const [previewImg,    setPreviewImg]    = useState(null);
  const [sendOpen,      setSendOpen]      = useState(false);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [groups,        setGroups]        = useState([]);
  const [allGroups,     setAllGroups]     = useState([]);
  const [manageMode,    setManageMode]    = useState(false);
  const [togglingJid,   setTogglingJid]   = useState(null);
  const [selGroups,     setSelGroups]     = useState(new Set());
  const [sendFmt,       setSendFmt]       = useState('group');
  const [sending,       setSending]       = useState(false);
  const [sendResult,    setSendResult]    = useState(null);

  const hasFeed  = !!groupUrl;
  const hasStory = !!portraitUrl;

  const TEAM_SIGNATURE = '\n\nEquipe Consult Delivery 🚀';

  const handleCopy = () => {
    navigator.clipboard.writeText(caption + TEAM_SIGNATURE).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleDownload = async (key) => {
    const url = key === 'group' ? groupUrl : portraitUrl;
    if (!url) return;
    setDlState(s => ({ ...s, [key]: true }));
    await downloadFile(url, `encerramento-${out.date ?? 'arte'}-${key}.png`);
    setDlState(s => ({ ...s, [key]: false }));
  };

  const handleOpenSend = async () => {
    if (!tenantDbId) return;
    if (sendOpen) { setSendOpen(false); setManageMode(false); return; }
    setSendOpen(true);
    setSendResult(null);
    setManageMode(false);
    setGroupsLoading(true);
    try {
      const { data: dbGroups, error } = await supabase
        .from('whatsapp_groups').select('id,evolution_jid,group_name,encerramento_ativo')
        .eq('tenant_id', tenantDbId).eq('ativo', true).order('group_name');
      if (error) console.error('[Encerramento] groups query error:', error);
      const all = dbGroups || [];
      setAllGroups(all);
      const active = all.filter(g => g.encerramento_ativo);
      setGroups(active);
      setSelGroups(new Set(active.map(g => g.evolution_jid)));
    } catch (e) {
      console.error('[Encerramento] groups fetch error:', e);
    } finally {
      setGroupsLoading(false);
    }
  };

  const handleToggleEncerramento = async (group) => {
    if (togglingJid) return;
    setTogglingJid(group.evolution_jid);
    const newVal = !group.encerramento_ativo;
    try {
      const { error } = await supabase
        .from('whatsapp_groups').update({ encerramento_ativo: newVal }).eq('id', group.id);
      if (error) throw error;
      setAllGroups(prev => prev.map(g => g.evolution_jid === group.evolution_jid ? { ...g, encerramento_ativo: newVal } : g));
      if (newVal) {
        setGroups(prev => [...prev, { ...group, encerramento_ativo: true }].sort((a, b) => a.group_name.localeCompare(b.group_name)));
        setSelGroups(prev => new Set([...prev, group.evolution_jid]));
      } else {
        setGroups(prev => prev.filter(g => g.evolution_jid !== group.evolution_jid));
        setSelGroups(prev => { const s = new Set(prev); s.delete(group.evolution_jid); return s; });
      }
    } catch (e) {
      console.error('[Encerramento] toggle encerramento_ativo error:', e);
    } finally {
      setTogglingJid(null);
    }
  };

  const toggleGroup = (jid) => setSelGroups(prev => {
    const n = new Set(prev); n.has(jid) ? n.delete(jid) : n.add(jid); return n;
  });

  const handleSend = async () => {
    if (!selGroups.size) return;
    const fmt      = FORMATS.find(f => f.key === sendFmt);
    const imageUrl = out[fmt?.field] || groupUrl;
    setSending(true); setSendResult(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const signedCaption = caption ? `${caption}${TEAM_SIGNATURE}` : TEAM_SIGNATURE;
      const r = await fetch(`${BRIDGE_URL}/agents/encerramento/send-groups`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ tenant_id: tenantDbId, group_jids: [...selGroups], image_url: imageUrl, caption: signedCaption }),
      });
      setSendResult(await r.json());
    } catch (e) { setSendResult({ error: e.message }); }
    finally { setSending(false); }
  };

  const chips = [
    { label: copied ? '✓ Copiado' : 'Copiar',        onClick: handleCopy,                                  disabled: false              },
    { label: dlState.group    ? '…' : '↓ Feed 16:9',  onClick: () => handleDownload('group'),               disabled: !hasFeed           },
    { label: dlState.portrait ? '…' : '↓ Story 9:16', onClick: () => handleDownload('portrait'),            disabled: !hasStory          },
    { label: '↺ Restaurar',                            onClick: () => setCaption(out.caption ?? ''),         disabled: caption === (out.caption ?? '') },
    { label: '📤 Enviar nos grupos',                   onClick: handleOpenSend,                              disabled: false              },
  ];

  return (
    <div style={{ borderBottom: isLast ? 'none' : `1px solid ${BORDER}`, padding: '24px 0' }}>

      {/* Date + theme heading */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: O, textTransform: 'uppercase', letterSpacing: 0.8 }}>
          {formatLong(out.date)}
          {out.theme && <span style={{ fontWeight: 400, marginLeft: 8, opacity: 0.8 }}>· {out.theme}</span>}
        </div>
      </div>

      {/* Agent row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <EncerramentoAvatar size={36} />
        <div style={{ flex: 1, minWidth: 0 }}>

          {/* Name + time + status */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#fff', fontFamily: "'Oswald', sans-serif", textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Encerramento
            </span>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.28)' }}>{formatTime(run.created_at)}</span>
            <StatusBadge status={run.status} />
          </div>

          {/* Art tabs */}
          {(hasFeed || hasStory) && (
            <div style={{ marginBottom: 14 }}>
              <div role="tablist" style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
                {hasFeed && (
                  <button role="tab" aria-selected={artTab === 'feed'} onClick={() => setArtTab('feed')} style={{ padding: '4px 11px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer', border: `1px solid ${artTab === 'feed' ? O : BORDER}`, background: artTab === 'feed' ? `${O}18` : 'transparent', color: artTab === 'feed' ? O : 'rgba(255,255,255,0.38)' }}>
                    Feed <span style={{ opacity: 0.6, fontWeight: 400 }}>16:9</span>
                  </button>
                )}
                {hasStory && (
                  <button role="tab" aria-selected={artTab === 'story'} onClick={() => setArtTab('story')} style={{ padding: '4px 11px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer', border: `1px solid ${artTab === 'story' ? O : BORDER}`, background: artTab === 'story' ? `${O}18` : 'transparent', color: artTab === 'story' ? O : 'rgba(255,255,255,0.38)' }}>
                    Story <span style={{ opacity: 0.6, fontWeight: 400 }}>9:16</span>
                  </button>
                )}
                {hasFeed && hasStory && (
                  <button role="tab" aria-selected={artTab === 'both'} onClick={() => setArtTab('both')} style={{ padding: '4px 11px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer', border: `1px solid ${artTab === 'both' ? O : BORDER}`, background: artTab === 'both' ? `${O}18` : 'transparent', color: artTab === 'both' ? O : 'rgba(255,255,255,0.38)' }}>
                    Ambos
                  </button>
                )}
              </div>

              {artTab !== 'both' ? (
                <div
                  onClick={() => setPreviewImg({ src: artTab === 'story' ? portraitUrl : groupUrl, alt: artTab === 'story' ? 'Story 9:16' : 'Feed 16:9' })}
                  title="Clique para ampliar"
                  style={{ background: 'rgba(0,0,0,0.4)', borderRadius: 10, overflow: 'hidden', display: 'inline-block', maxWidth: artTab === 'story' ? 160 : 320, cursor: 'zoom-in', position: 'relative' }}
                >
                  <img
                    src={artTab === 'story' ? portraitUrl : groupUrl}
                    alt={artTab === 'story' ? 'Story 9:16' : 'Feed 16:9'}
                    style={{ width: '100%', display: 'block', aspectRatio: artTab === 'story' ? '9/16' : '16/9', objectFit: 'cover' }}
                  />
                  <div style={{ position: 'absolute', bottom: 6, right: 6, background: 'rgba(0,0,0,0.55)', borderRadius: 5, padding: '2px 6px', fontSize: 10, color: 'rgba(255,255,255,0.7)', backdropFilter: 'blur(4px)', pointerEvents: 'none' }}>
                    🔍 Ampliar
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <div
                    onClick={() => setPreviewImg({ src: groupUrl, alt: 'Feed 16:9' })}
                    title="Clique para ampliar"
                    style={{ background: 'rgba(0,0,0,0.4)', borderRadius: 10, overflow: 'hidden', width: 250, cursor: 'zoom-in', position: 'relative' }}
                  >
                    <img src={groupUrl} alt="Feed 16:9" style={{ width: '100%', display: 'block', aspectRatio: '16/9', objectFit: 'cover' }} />
                    <div style={{ position: 'absolute', bottom: 6, right: 6, background: 'rgba(0,0,0,0.55)', borderRadius: 5, padding: '2px 6px', fontSize: 10, color: 'rgba(255,255,255,0.7)', backdropFilter: 'blur(4px)', pointerEvents: 'none' }}>🔍</div>
                  </div>
                  <div
                    onClick={() => setPreviewImg({ src: portraitUrl, alt: 'Story 9:16' })}
                    title="Clique para ampliar"
                    style={{ background: 'rgba(0,0,0,0.4)', borderRadius: 10, overflow: 'hidden', width: 80, cursor: 'zoom-in', position: 'relative' }}
                  >
                    <img src={portraitUrl} alt="Story 9:16" style={{ width: '100%', display: 'block', aspectRatio: '9/16', objectFit: 'cover' }} />
                    <div style={{ position: 'absolute', bottom: 4, right: 4, background: 'rgba(0,0,0,0.55)', borderRadius: 4, padding: '2px 4px', fontSize: 9, color: 'rgba(255,255,255,0.7)', backdropFilter: 'blur(4px)', pointerEvents: 'none' }}>🔍</div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Caption */}
          <textarea
            value={caption}
            onChange={e => setCaption(e.target.value)}
            rows={5}
            style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical', background: 'rgba(0,0,0,0.25)', border: `1px solid ${BORDER}`, borderRadius: 8, padding: '10px 12px', color: 'rgba(255,255,255,0.85)', fontSize: 13, lineHeight: 1.65, fontFamily: 'inherit', outline: 'none', marginBottom: 12 }}
          />

          {/* Action chips */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {chips.map(({ label, onClick, disabled }) => (
              <button key={label} onClick={disabled ? undefined : onClick} disabled={disabled}
                style={{ padding: '5px 11px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: disabled ? 'default' : 'pointer', border: `1px solid ${BORDER}`, background: 'rgba(255,255,255,0.04)', color: disabled ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.65)', opacity: disabled ? 0.5 : 1 }}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Image lightbox */}
          {previewImg && (
            <ImageLightbox src={previewImg.src} alt={previewImg.alt} onClose={() => setPreviewImg(null)} />
          )}

          {/* Send panel */}
          {sendOpen && (
            <div style={{ marginTop: 14, background: `${O}07`, border: `1px solid ${O}2a`, borderRadius: 10, padding: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: O }}>
                  {manageMode ? 'Gerenciar grupos Encerramento' : 'Enviar nos grupos WhatsApp'}
                </div>
                <button onClick={() => setManageMode(m => !m)}
                  style={{ fontSize: 11, padding: '2px 8px', borderRadius: 5, cursor: 'pointer', border: `1px solid ${manageMode ? O : BORDER}`, background: manageMode ? `${O}22` : 'transparent', color: manageMode ? O : 'rgba(255,255,255,0.4)' }}
                >
                  {manageMode ? '← Voltar' : 'Gerenciar'}
                </button>
              </div>

              {manageMode ? (
                <div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginBottom: 10, lineHeight: 1.5 }}>
                    Grupos marcados recebem o Encerramento automático e ficam pré-selecionados no envio manual.
                  </div>
                  {groupsLoading
                    ? <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>Carregando…</div>
                    : allGroups.length === 0
                    ? <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>Nenhum grupo cadastrado.</div>
                    : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, maxHeight: 280, overflowY: 'auto' }}>
                        {allGroups.map(g => {
                          const on = g.encerramento_ativo;
                          const busy = togglingJid === g.evolution_jid;
                          return (
                            <div key={g.evolution_jid} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px', borderRadius: 6, background: on ? `${O}10` : 'rgba(255,255,255,0.02)', border: `1px solid ${on ? O + '33' : BORDER}` }}>
                              <GroupAvatar g={g} size={26} />
                              <span style={{ fontSize: 12, color: on ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.5)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{formatGroupName(g)}</span>
                              <button onClick={() => handleToggleEncerramento(g)} disabled={busy}
                                style={{ flexShrink: 0, width: 36, height: 20, borderRadius: 10, border: 'none', cursor: busy ? 'default' : 'pointer', background: on ? O : 'rgba(255,255,255,0.12)', position: 'relative', transition: 'background 0.2s', opacity: busy ? 0.5 : 1 }}
                              >
                                <div style={{ position: 'absolute', top: 2, left: on ? 18 : 2, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left 0.2s' }} />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )
                  }
                </div>
              ) : (
                <>
                  {/* Format selector */}
                  <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
                    {FORMATS.filter(f => f.key === 'group' ? hasFeed : hasStory).map(f => (
                      <button key={f.key} onClick={() => setSendFmt(f.key)}
                        style={{ padding: '4px 10px', borderRadius: 5, fontSize: 11, fontWeight: 600, cursor: 'pointer', border: `1px solid ${sendFmt === f.key ? O : BORDER}`, background: sendFmt === f.key ? `${O}22` : 'transparent', color: sendFmt === f.key ? O : 'rgba(255,255,255,0.45)' }}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>

                  {groupsLoading
                    ? <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 12 }}>Carregando grupos…</div>
                    : groups.length === 0
                    ? <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 12, lineHeight: 1.6 }}>
                        Nenhum grupo ativo para Encerramento.<br />
                        <span style={{ color: 'rgba(255,255,255,0.28)' }}>Clique em </span>
                        <strong style={{ color: O, cursor: 'pointer' }} onClick={() => setManageMode(true)}>Gerenciar</strong>
                        <span style={{ color: 'rgba(255,255,255,0.28)' }}> para ativar grupos.</span>
                      </div>
                    : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginBottom: 12, maxHeight: 280, overflowY: 'auto' }}>
                        {groups.map(g => (
                          <label key={g.evolution_jid} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px', borderRadius: 6, cursor: 'pointer', background: selGroups.has(g.evolution_jid) ? `${O}10` : 'rgba(255,255,255,0.02)', border: `1px solid ${selGroups.has(g.evolution_jid) ? O + '33' : BORDER}` }}>
                            <input type="checkbox" checked={selGroups.has(g.evolution_jid)} onChange={() => toggleGroup(g.evolution_jid)} style={{ accentColor: O, width: 14, height: 14 }} />
                            <GroupAvatar g={g} size={28} />
                            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{formatGroupName(g)}</span>
                          </label>
                        ))}
                      </div>
                    )
                  }

                  {sendResult && (
                    <div style={{ marginBottom: 10, padding: '8px 12px', borderRadius: 6, fontSize: 12, background: sendResult.error ? 'rgba(220,38,38,0.1)' : 'rgba(16,185,129,0.08)', color: sendResult.error ? '#fca5a5' : '#6ee7b7' }}>
                      {sendResult.error ? `Erro: ${sendResult.error}` : `✓ Enviado para ${sendResult.sent?.length ?? 0} grupo(s)${sendResult.failed?.length ? ` · ${sendResult.failed.length} falha(s)` : ''}`}
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={handleSend} disabled={sending || !selGroups.size}
                      style={{ padding: '7px 14px', borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: (!selGroups.size || sending) ? 'default' : 'pointer', background: O, color: '#fff', border: 'none', opacity: (sending || !selGroups.size) ? 0.5 : 1 }}
                    >
                      {sending ? 'Enviando…' : `Enviar (${selGroups.size})`}
                    </button>
                    <button onClick={() => setSendOpen(false)}
                      style={{ padding: '7px 12px', borderRadius: 7, fontSize: 12, cursor: 'pointer', background: 'transparent', border: `1px solid ${BORDER}`, color: 'rgba(255,255,255,0.45)' }}
                    >
                      Fechar
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Toggle ────────────────────────────────────────────────────────────────────
function Toggle({ checked, onChange, label }) {
  return (
    <button role="switch" aria-checked={checked} aria-label={label} onClick={onChange}
      style={{ width: 34, height: 18, borderRadius: 9, border: 'none', cursor: 'pointer', background: checked ? O : 'rgba(255,255,255,0.1)', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}
    >
      <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#fff', position: 'absolute', top: 3, left: checked ? 19 : 3, transition: 'left 0.2s' }} />
    </button>
  );
}

// ── ProfilePanel ──────────────────────────────────────────────────────────────
function ProfilePanel({ tenantDbId, autoSendCfg, setAutoSendCfg }) {
  const [tab,         setTab]         = useState('agendamento');
  const [savingSched, setSavingSched] = useState(false);

  const handleSaveSchedule = async () => {
    if (!tenantDbId) return;
    setSavingSched(true);
    await supabase.from('encerramento_config').upsert(
      { tenant_id: tenantDbId, auto_send: autoSendCfg?.auto_send ?? false, updated_at: new Date().toISOString() },
      { onConflict: 'tenant_id' }
    );
    setSavingSched(false);
  };

  const TABS = [
    { id: 'agendamento', label: 'Agendamento' },
    { id: 'habilidades', label: 'Habilidades' },
    { id: 'infos',       label: 'Informações' },
  ];

  const sectionTitle = (t) => (
    <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>{t}</div>
  );
  const card = (children, extra = {}) => (
    <div style={{ background: 'rgba(0,0,0,0.3)', border: `1px solid ${BORDER}`, borderRadius: 10, padding: 14, ...extra }}>
      {children}
    </div>
  );
  const dot = (color = O) => <div style={{ width: 5, height: 5, borderRadius: '50%', background: color, flexShrink: 0 }} />;

  return (
    <div style={{ width: 360, flexShrink: 0, background: BG2, borderLeft: `1px solid ${BORDER}`, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Tab pills */}
      <div style={{ flexShrink: 0, padding: '0 14px', borderBottom: `1px solid ${BORDER}`, display: 'flex', gap: 2, overflowX: 'auto' }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{ padding: '12px 10px', fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap', cursor: 'pointer', background: 'transparent', border: 'none', borderBottom: `2px solid ${tab === t.id ? O : 'transparent'}`, color: tab === t.id ? O : 'rgba(255,255,255,0.38)', transition: 'all 0.15s' }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 12, minHeight: 0 }}>

        {/* AGENDAMENTO */}
        {tab === 'agendamento' && (<>
          {card(<>
            {sectionTitle('Envio Automático')}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>Auto-envio</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>
                  Envia nos horários fixos abaixo
                </div>
              </div>
              <Toggle
                checked={autoSendCfg?.auto_send ?? false}
                onChange={() => setAutoSendCfg(c => ({ ...c, auto_send: !c.auto_send }))}
                label="Auto-envio Encerramento"
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16, padding: '10px 12px', background: 'rgba(255,255,255,0.02)', borderRadius: 8, border: `1px solid ${BORDER}` }}>
              {[
                { label: 'Seg–Sex', time: '18:00 (BRT)', active: true  },
                { label: 'Sábado',  time: '12:00 (BRT)', active: true  },
                { label: 'Domingo', time: 'Sem envio',   active: false },
                { label: 'Feriados nacionais', time: 'Sem envio', active: false },
              ].map(({ label, time, active }) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>{label}</span>
                  <span style={{ fontSize: 12, fontWeight: active ? 700 : 400, color: active ? O : 'rgba(255,255,255,0.22)' }}>{time}</span>
                </div>
              ))}
            </div>
            <button onClick={handleSaveSchedule} disabled={savingSched}
              style={{ padding: '6px 14px', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: savingSched ? 'default' : 'pointer', background: O, color: '#fff', border: 'none', opacity: savingSched ? 0.6 : 1 }}
            >
              {savingSched ? 'Salvando…' : 'Salvar configuração'}
            </button>
          </>)}
        </>)}

        {/* HABILIDADES */}
        {tab === 'habilidades' && [
          { group: 'Consult Delivery',   tools: ['Supabase (leitura/escrita)', 'Bridge Server (envio WA)', 'agent_runs (histórico)']  },
          { group: 'Geração de Imagem',  tools: ['Recraft V4.1 · Feed 16:9', 'Recraft V4.1 · Story 9:16', 'Overlay logo laranja']    },
          { group: 'Pesquisa Externa',   tools: ['Busca na web (Anthropic)', 'Tema por dia da semana', 'Estilo visual rotativo']     },
        ].map(({ group, tools }) => (
          <div key={group} style={{ background: 'rgba(0,0,0,0.3)', border: `1px solid ${BORDER}`, borderRadius: 10, padding: 14 }}>
            {sectionTitle(group)}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {tools.map(t => (
                <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {dot('rgba(255,255,255,0.2)')} <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.58)' }}>{t}</span>
                </div>
              ))}
            </div>
          </div>
        ))}

        {/* INFORMAÇÕES */}
        {tab === 'infos' && (<>
          {card(<>
            {sectionTitle('Workspace')}
            <div style={{ fontSize: 13, color: '#fff', fontWeight: 600 }}>Consult Delivery</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 3 }}>1 tenant ativo · Supabase prod</div>
          </>)}
          {card(<>
            {sectionTitle('Próximas Execuções')}
            {[{ label: 'Seg–Sex', time: '18:00', type: 'Diário' }, { label: 'Sábado', time: '12:00', type: 'Especial' }].map(e => (
              <div key={e.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, padding: '7px 10px', background: 'rgba(255,255,255,0.02)', borderRadius: 7 }}>
                <div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.75)' }}>{e.label}</div>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.28)', marginTop: 1 }}>{e.type}</div>
                </div>
                <div style={{ fontSize: 12, fontWeight: 700, color: O, fontFamily: 'monospace' }}>{e.time}</div>
              </div>
            ))}
          </>)}
          {card(<>
            {sectionTitle('Modelo & Stack')}
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', lineHeight: 1.85 }}>
              claude-sonnet-4-6<br />
              Recraft V4.1 · Trigger.dev cloud<br />
              Supabase Storage (webp)<br />
              Bridge Server 3001 (VPS)
            </div>
          </>)}
        </>)}
      </div>
    </div>
  );
}

// ── Main EncerramentoScreen ───────────────────────────────────────────────────
export default function EncerramentoScreen({ tenantDbId, userId }) {
  const [runs,        setRuns]        = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [generating,  setGenerating]  = useState(false);
  const [genError,    setGenError]    = useState('');
  const [showProfile, setShowProfile] = useState(() => window.innerWidth > 768);
  const [autoSendCfg, setAutoSendCfg] = useState({ auto_send: false });
  const pendingRef = useRef(null);
  const listEndRef = useRef(null);

  // ── Fetch runs ──────────────────────────────────────────────────────────────
  const fetchRuns = useCallback(() => {
    supabase
      .from('agent_runs')
      .select('id, output, created_at, status')
      .eq('agent_id', 'encerramento')
      .eq('status', 'success')
      .order('created_at', { ascending: false })
      .limit(15)
      .then(({ data }) => {
        const valid = (data || []).filter(r => r.output?.img_group_url || r.output?.img_portrait_url);
        setRuns(valid);
        setLoading(false);
      });
  }, []);

  useEffect(() => { fetchRuns(); }, [fetchRuns]);

  // ── Fetch encerramento_config ───────────────────────────────────────────────
  useEffect(() => {
    if (!tenantDbId) return;
    supabase.from('encerramento_config').select('auto_send').eq('tenant_id', tenantDbId).maybeSingle()
      .then(({ data }) => {
        if (data) setAutoSendCfg({ auto_send: data.auto_send ?? false });
      });
  }, [tenantDbId]);

  // ── Realtime ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const ch = supabase.channel('encerramento-runs')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'agent_runs' }, (payload) => {
        const run = payload.new;
        if (run.agent_id !== 'encerramento') return;
        if (pendingRef.current && run.trigger_dev_run_id !== pendingRef.current) return;
        if (run.status === 'success' && (run.output?.img_group_url || run.output?.img_portrait_url)) {
          setRuns(prev => [run, ...prev].slice(0, 15));
          setGenerating(false);
          pendingRef.current = null;
        } else if (run.status === 'failed' && pendingRef.current) {
          setGenerating(false);
          setGenError('Falha ao gerar imagem. Tente novamente.');
          pendingRef.current = null;
        }
      })
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, []);

  // ── Generate ────────────────────────────────────────────────────────────────
  const handleGenerate = async () => {
    setGenError('');
    setGenerating(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const r = await fetch(`${BRIDGE_URL}/agents/encerramento-gerar-imagem/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({
          tenant_id: tenantDbId,
          payload: { triggered_by: userId, force_new: true },
        }),
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error || `Erro ${r.status}`);
      pendingRef.current = body.run_id ?? null;
      if (body.output?.img_group_url) {
        fetchRuns();
        setGenerating(false);
        pendingRef.current = null;
      }
    } catch (e) {
      setGenError(e.message);
      setGenerating(false);
    }
  };

  return (
    <div className="livechat" style={{ display: 'flex', height: '100%', background: BG, overflow: 'hidden' }}>
      {/* Center */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Topbar */}
        <div style={{ height: 52, flexShrink: 0, display: 'flex', alignItems: 'center', padding: '0 18px', gap: 10, borderBottom: `1px solid ${BORDER}`, background: BG }}>
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.28)' }}>
            Agentes IA <span style={{ margin: '0 5px' }}>›</span>
            <span style={{ color: 'rgba(255,255,255,0.72)', fontWeight: 600 }}>Encerramento</span>
          </span>

          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
            {generating && (
              <span style={{ fontSize: 11, color: O, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}>
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: O }} />
                Gerando…
              </span>
            )}
            <button onClick={() => setShowProfile(v => !v)}
              style={{ padding: '4px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer', border: `1px solid ${showProfile ? O + '44' : BORDER}`, background: showProfile ? `${O}18` : 'transparent', color: showProfile ? O : 'rgba(255,255,255,0.38)' }}
            >
              Perfil
            </button>
            <button onClick={handleGenerate} disabled={generating}
              style={{ padding: '7px 13px', borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: generating ? 'default' : 'pointer', background: generating ? OD : O, color: '#fff', border: 'none', fontFamily: "'Oswald', sans-serif", textTransform: 'uppercase', letterSpacing: 0.3, opacity: generating ? 0.7 : 1 }}
            >
              {generating ? 'Gerando…' : '+ Gerar agora'}
            </button>
          </div>
        </div>

        {/* Messages */}
        <div style={{ flex: 1, overflow: 'auto', padding: '0 24px' }}>
          {genError && (
            <div style={{ margin: '16px 0', padding: '10px 14px', borderRadius: 8, background: 'rgba(220,38,38,0.1)', border: '1px solid rgba(220,38,38,0.3)', color: '#fca5a5', fontSize: 13 }}>
              {genError}
            </div>
          )}

          {generating && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '22px 0', borderBottom: `1px solid ${BORDER}` }}>
              <EncerramentoAvatar size={36} />
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: O }}>Gerando arte de encerramento…</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 2 }}>Claude + Recraft · ~1–2 min</div>
              </div>
            </div>
          )}

          {loading && (
            <div style={{ padding: '32px 0', color: 'rgba(255,255,255,0.35)', fontSize: 13 }}>Carregando histórico…</div>
          )}

          {!loading && runs.length === 0 && !generating && (
            <div style={{ padding: '52px 0', textAlign: 'center' }}>
              <EncerramentoAvatar size={48} />
              <div style={{ marginTop: 16, fontSize: 14, color: 'rgba(255,255,255,0.4)' }}>Nenhuma arte gerada ainda.</div>
              <div style={{ marginTop: 6, fontSize: 12, color: 'rgba(255,255,255,0.22)' }}>
                Clique em "Gerar agora" ou aguarde o agendamento automático (18h BRT).
              </div>
              <button onClick={handleGenerate} style={{ marginTop: 20, padding: '9px 18px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', background: O, color: '#fff', border: 'none' }}>
                Gerar agora
              </button>
            </div>
          )}

          {runs.map((run, i, arr) => (
            <AgentMessage
              key={run.id}
              run={run}
              tenantDbId={tenantDbId}
              isLast={i === arr.length - 1}
            />
          ))}

          <div ref={listEndRef} style={{ height: 80 }} />
        </div>

        {/* Composer (info only) */}
        <div style={{ height: 52, flexShrink: 0, display: 'flex', alignItems: 'center', padding: '0 18px', borderTop: `1px solid ${BORDER}`, background: BG }}>
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.22)' }}>
            🌅 Encerramento automático — Seg–Sex 18h · Sáb 12h (BRT)
          </span>
          {autoSendCfg.auto_send && (
            <span style={{ marginLeft: 12, fontSize: 11, padding: '2px 8px', borderRadius: 10, background: `${O}15`, border: `1px solid ${O}44`, color: O, fontWeight: 600 }}>
              Auto-envio ativo
            </span>
          )}
        </div>
      </div>

      {/* Right: profile panel */}
      {showProfile && (
        <ProfilePanel
          tenantDbId={tenantDbId}
          autoSendCfg={autoSendCfg}
          setAutoSendCfg={setAutoSendCfg}
        />
      )}
    </div>
  );
}
