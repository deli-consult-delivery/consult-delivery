import { useState, useRef, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase.js';

const BRIDGE_URL = import.meta.env.VITE_BRIDGE_URL || 'https://bridge.consultdelivery.com.br';

// ── Design tokens ─────────────────────────────────────────────────────────────
const R      = '#B70C00';
const RD     = '#8A0900';
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

function formatShort(dateStr) {
  if (!dateStr) return '—';
  const [, m, d] = dateStr.split('-').map(Number);
  return `${String(d).padStart(2,'0')}/${String(m).padStart(2,'0')}`;
}

function formatTime(isoStr) {
  if (!isoStr) return '';
  return new Date(isoStr).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

async function downloadFile(url, filename) {
  // Converte para PNG via canvas (independe do formato original WebP/JPG)
  try {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
    const canvas = document.createElement('canvas');
    canvas.width  = img.naturalWidth;
    canvas.height = img.naturalHeight;
    canvas.getContext('2d').drawImage(img, 0, 0);
    const blob = await new Promise(res => canvas.toBlob(res, 'image/png'));
    const base = filename.replace(/\.\w+$/, '');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = base + '.png';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(a.href), 3000);
  } catch {
    window.open(url, '_blank');
  }
}

// ── Image formats ─────────────────────────────────────────────────────────────
const FORMATS = [
  { key: 'group',    label: 'Feed',  sub: '4:5 · 1080×1350', ratio: '4/5',  field: 'img_group_url'    },
  { key: 'portrait', label: 'Story', sub: '9:16 · 1080×1920', ratio: '9/16', field: 'img_portrait_url' },
];

// ── Mock static data ──────────────────────────────────────────────────────────
const MOCK_AGENTS = [
  { id: 'bom-dia', name: 'Bom Dia', role: 'Superagente de Imagens', active: true  },
  { id: 'deli',    name: 'DELI',    role: 'COO Digital',            active: false },
  { id: 'lara',    name: 'LARA',    role: 'CRM & Régua',            active: false },
  { id: 'cora',    name: 'CORA',    role: 'Cobrança Inteligente',   active: false },
  { id: 'sofia',   name: 'SOFIA',   role: 'SDR Prospecção',         active: false },
  { id: 'max',     name: 'MAX',     role: 'Consultor Técnico',      active: false },
  { id: 'vera',    name: 'VERA',    role: 'BI & Relatórios',        active: false },
];

const MOCK_CALENDAR = [
  { day: 'Seg', theme: 'Motivação de início de semana' },
  { day: 'Ter', theme: 'Dica de gestão para delivery' },
  { day: 'Qua', theme: 'Cases de sucesso' },
  { day: 'Qui', theme: 'Inovação e tecnologia' },
  { day: 'Sex', theme: 'Celebração de resultados' },
  { day: 'Sáb', theme: 'Reflexão e descanso' },
];

const MOCK_PROMPT = {
  version: 'v1',
  size: '4.1 KB',
  paleta: ['#B70C00', '#8A0900', '#0D0D0D', '#FFFFFF', '#E9E6E0'],
  systemPrompt: `Você é o agente Bom Dia da Consult Delivery.
Sua função é criar artes motivacionais diárias para WhatsApp e Instagram.

IDENTIDADE VISUAL:
- Fundo: azul marinho profundo (#0a1628)
- Acentos: vermelho (#B70C00) apenas
- Fontes: Oswald (títulos) + Montserrat (corpo)
- Logo Consult Delivery sempre presente, canto inferior direito

REGRAS DE CONTEÚDO:
- Tom: inspirador, direto, profissional
- Evitar clichês e frases genéricas
- Mencionar contexto de delivery quando relevante
- Máximo 12 palavras no título da arte

FORMATO DE SAÍDA:
1. Arte Feed 1080×1350 (4:5) para WhatsApp
2. Arte Story 1080×1920 (9:16) para Instagram
3. Legenda em markdown com emojis moderados`,
  pode: [
    'Criar imagens em 2 formatos (Feed 4:5 e Story 9:16)',
    'Adaptar tom e tema ao dia da semana',
    'Usar referências do mercado de delivery',
    'Gerar legenda com até 300 caracteres',
    'Incluir hashtags relevantes do segmento',
    'Agendar geração automática seg–sex 08:55',
    'Reagendar e regerar sob demanda',
    'Salvar histórico das últimas 15 gerações',
  ],
  naoPode: [
    'Usar cores fora da identidade visual aprovada',
    'Incluir preços ou promoções específicas de cliente',
    'Mencionar concorrentes diretos da Consult Delivery',
    'Responder diretamente para clientes finais',
    'Enviar imagem sem aprovação humana prévia',
    'Gerar conteúdo político, controverso ou ofensivo',
    'Usar fontes fora do padrão (apenas Oswald/Montserrat)',
    'Criar mais de 2 formatos por execução',
  ],
};

// ── Avatar sol (monocromático vermelho) ───────────────────────────────────────
function BomDiaAvatar({ size = 32 }) {
  const cx = size / 2, cy = size / 2;
  const coreR = size * 0.27;
  const r1    = size * 0.34;
  const r2    = size * 0.48;
  const rays  = [0, 45, 90, 135, 180, 225, 270, 315];
  const sw    = Math.max(1.5, size * 0.07);
  const gId   = `bd-red-${size}`;
  return (
    <div style={{ width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} fill="none">
        <defs>
          <radialGradient id={gId} cx="40%" cy="35%" r="65%">
            <stop offset="0%" stopColor="#FF4444" />
            <stop offset="100%" stopColor={R} />
          </radialGradient>
        </defs>
        {rays.map(a => {
          const rad = (a * Math.PI) / 180;
          return (
            <line
              key={a}
              x1={cx + r1 * Math.cos(rad)} y1={cy + r1 * Math.sin(rad)}
              x2={cx + r2 * Math.cos(rad)} y2={cy + r2 * Math.sin(rad)}
              stroke={R} strokeWidth={sw} strokeLinecap="round"
            />
          );
        })}
        <circle cx={cx} cy={cy} r={coreR} fill={`url(#${gId})`} />
      </svg>
    </div>
  );
}

function AgentDot({ name, size = 28 }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: 'rgba(255,255,255,0.05)', border: `1px solid ${BORDER}`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.36, fontWeight: 700, color: 'rgba(255,255,255,0.35)',
      fontFamily: "'Oswald', sans-serif",
    }}>
      {name[0]}
    </div>
  );
}

// ── SubSidebar ────────────────────────────────────────────────────────────────
function SubSidebar() {
  return (
    <div style={{
      width: 260, flexShrink: 0, background: BG2,
      borderRight: `1px solid ${BORDER}`,
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
    }}>
      <div style={{ padding: '18px 16px 10px', borderBottom: `1px solid ${BORDER}` }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase' }}>
          Superagentes
        </div>
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: '8px 8px' }}>
        {MOCK_AGENTS.map(agent => (
          <div
            key={agent.id}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '9px 10px', borderRadius: 8, marginBottom: 2,
              cursor: agent.active ? 'default' : 'not-allowed',
              background: agent.active ? `${R}12` : 'transparent',
              border: `1px solid ${agent.active ? R + '33' : 'transparent'}`,
              opacity: agent.active ? 1 : 0.4,
            }}
          >
            {agent.active ? <BomDiaAvatar size={28} /> : <AgentDot name={agent.name} size={28} />}
            <div style={{ minWidth: 0 }}>
              <div style={{
                fontSize: 12, fontWeight: 700,
                color: agent.active ? '#fff' : 'rgba(255,255,255,0.45)',
                fontFamily: "'Oswald', sans-serif",
                textTransform: 'uppercase', letterSpacing: 0.5,
              }}>
                {agent.name}
              </div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.28)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {agent.role}
              </div>
            </div>
            {agent.active && (
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: R, marginLeft: 'auto', flexShrink: 0 }} />
            )}
          </div>
        ))}
      </div>
      <div style={{ padding: '10px 16px', borderTop: `1px solid ${BORDER}` }}>
        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.22)' }}>7 agentes · 1 ativo</div>
      </div>
    </div>
  );
}

// ── Status badge ──────────────────────────────────────────────────────────────
const STATUS_CFG = {
  success:   { bg: 'rgba(16,185,129,0.12)', border: 'rgba(16,185,129,0.3)', color: '#6ee7b7', label: 'Publicado' },
  published: { bg: 'rgba(16,185,129,0.12)', border: 'rgba(16,185,129,0.3)', color: '#6ee7b7', label: 'Publicado' },
  draft:     { bg: `${R}12`,               border: `${R}44`,               color: R,          label: 'Rascunho'  },
  scheduled: { bg: 'rgba(139,92,246,0.12)', border: 'rgba(139,92,246,0.3)', color: '#c4b5fd', label: 'Agendado'  },
  failed:    { bg: 'rgba(220,38,38,0.1)',   border: 'rgba(220,38,38,0.3)',  color: '#fca5a5', label: 'Falhou'    },
};

function StatusBadge({ status }) {
  const s = STATUS_CFG[status] || STATUS_CFG.draft;
  return (
    <span style={{
      fontSize: 10, fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase',
      padding: '2px 7px', borderRadius: 4,
      background: s.bg, border: `1px solid ${s.border}`, color: s.color,
    }}>
      {s.label}
    </span>
  );
}

// ── Group helpers ─────────────────────────────────────────────────────────────
const GROUP_COLORS = ['#B70C00', '#7C3AED', '#2563EB', '#0F766E', '#B45309'];

function groupInitials(name) {
  if (!name) return '?';
  return name.replace(/[^a-zA-ZÀ-ÿ0-9\s]/g, '').trim()
    .split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';
}

function formatGroupName(g) {
  if (g.group_name) return g.group_name;
  const jid = g.evolution_jid || '';
  const raw = jid.replace(/@.*$/, '');
  if (!raw) return 'Grupo';
  if (raw.length >= 10) {
    return `+${raw.slice(0, 2)} (${raw.slice(2, 4)}) ${raw.slice(4, 9)}-${raw.slice(9)}`;
  }
  return raw;
}

function GroupAvatar({ g, size = 28 }) {
  const name = formatGroupName(g);
  const hash = name.split('').reduce((h, c) => h + c.charCodeAt(0), 0);
  const bg   = GROUP_COLORS[hash % GROUP_COLORS.length];
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.38, fontWeight: 700, color: '#fff',
      fontFamily: "'Oswald', sans-serif",
    }}>
      {groupInitials(g.group_name)}
    </div>
  );
}

// ── AgentMessage ──────────────────────────────────────────────────────────────
function AgentMessage({ run, tenantDbId, isLast }) {
  const out = run.output ?? {};
  const groupUrl    = out.img_group_url;
  const portraitUrl = out.img_portrait_url;
  const [artTab,     setArtTab]    = useState(() =>
    groupUrl && portraitUrl ? 'both' : portraitUrl ? 'story' : 'feed'
  );
  const [caption,    setCaption]   = useState(out.caption ?? '');
  const [copied,     setCopied]    = useState(false);
  const [dlState,    setDlState]   = useState({});
  const [sendOpen,   setSendOpen]  = useState(false);
  const [groups,     setGroups]    = useState([]);
  const [selGroups,  setSelGroups] = useState(new Set());
  const [sendFmt,    setSendFmt]   = useState('group');
  const [sending,    setSending]   = useState(false);
  const [sendResult, setSendResult] = useState(null);

  const hasFeed  = !!groupUrl;
  const hasStory = !!portraitUrl;

  const handleCopy = () => {
    navigator.clipboard.writeText(caption).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleDownload = async (key) => {
    const url = key === 'group' ? groupUrl : portraitUrl;
    if (!url) return;
    setDlState(s => ({ ...s, [key]: true }));
    await downloadFile(url, `bom-dia-${out.date ?? 'arte'}-${key}.jpg`);
    setDlState(s => ({ ...s, [key]: false }));
  };

  const handleOpenSend = () => {
    if (!tenantDbId) return;
    supabase.from('whatsapp_groups').select('id,evolution_jid,group_name')
      .eq('tenant_id', tenantDbId).eq('ativo', true).order('group_name')
      .then(({ data }) => setGroups(data || []));
    setSendResult(null);
    setSendOpen(v => !v);
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
      const r = await fetch(`${BRIDGE_URL}/agents/bom-dia/send-groups`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ tenant_id: tenantDbId, group_jids: [...selGroups], image_url: imageUrl, caption }),
      });
      setSendResult(await r.json());
    } catch (e) { setSendResult({ error: e.message }); }
    finally { setSending(false); }
  };

  const chips = [
    { label: copied ? '✓ Copiado' : 'Copiar',   onClick: handleCopy,                                  disabled: false              },
    { label: dlState.group   ? '…' : '↓ Feed PNG (16:9)',  onClick: () => handleDownload('group'),    disabled: !hasFeed  },
    { label: dlState.portrait? '…' : '↓ Story PNG (9:16)', onClick: () => handleDownload('portrait'), disabled: !hasStory },
    { label: '↺ Restaurar',                       onClick: () => setCaption(out.caption ?? ''),         disabled: caption === (out.caption ?? '') },
    { label: '📤 Enviar nos grupos',               onClick: handleOpenSend,                              disabled: false              },
  ];

  return (
    <div style={{ borderBottom: isLast ? 'none' : `1px solid ${BORDER}`, padding: '24px 0' }}>

      {/* Date + theme heading */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: R, textTransform: 'uppercase', letterSpacing: 0.8 }}>
          {formatLong(out.date)}
          {out.theme && <span style={{ fontWeight: 400, marginLeft: 8, opacity: 0.8 }}>· {out.theme}</span>}
        </div>
      </div>

      {/* Agent row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <BomDiaAvatar size={36} />
        <div style={{ flex: 1, minWidth: 0 }}>

          {/* Name + time + status */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#fff', fontFamily: "'Oswald', sans-serif", textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Bom Dia
            </span>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.28)' }}>{formatTime(run.created_at)}</span>
            <StatusBadge status={run.status} />
          </div>

          {/* Art tabs */}
          {(hasFeed || hasStory) && (
            <div style={{ marginBottom: 14 }}>
              <div role="tablist" style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
                {hasFeed && (
                  <button role="tab" aria-selected={artTab === 'feed'} onClick={() => setArtTab('feed')} style={{ padding: '4px 11px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer', border: `1px solid ${artTab === 'feed' ? R : BORDER}`, background: artTab === 'feed' ? `${R}18` : 'transparent', color: artTab === 'feed' ? R : 'rgba(255,255,255,0.38)' }}>
                    Feed <span style={{ opacity: 0.6, fontWeight: 400 }}>16:9</span>
                  </button>
                )}
                {hasStory && (
                  <button role="tab" aria-selected={artTab === 'story'} onClick={() => setArtTab('story')} style={{ padding: '4px 11px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer', border: `1px solid ${artTab === 'story' ? R : BORDER}`, background: artTab === 'story' ? `${R}18` : 'transparent', color: artTab === 'story' ? R : 'rgba(255,255,255,0.38)' }}>
                    Story <span style={{ opacity: 0.6, fontWeight: 400 }}>9:16</span>
                  </button>
                )}
                {hasFeed && hasStory && (
                  <button role="tab" aria-selected={artTab === 'both'} onClick={() => setArtTab('both')} style={{ padding: '4px 11px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer', border: `1px solid ${artTab === 'both' ? R : BORDER}`, background: artTab === 'both' ? `${R}18` : 'transparent', color: artTab === 'both' ? R : 'rgba(255,255,255,0.38)' }}>
                    Ambos
                  </button>
                )}
              </div>

              {artTab !== 'both' ? (
                <div style={{ background: 'rgba(0,0,0,0.4)', borderRadius: 10, overflow: 'hidden', display: 'inline-block', maxWidth: artTab === 'story' ? 160 : 320 }}>
                  <img
                    src={artTab === 'story' ? portraitUrl : groupUrl}
                    alt={artTab === 'story' ? 'Story 9:16' : 'Feed 16:9'}
                    style={{ width: '100%', display: 'block', aspectRatio: artTab === 'story' ? '9/16' : '16/9', objectFit: 'cover' }}
                  />
                </div>
              ) : (
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <div style={{ background: 'rgba(0,0,0,0.4)', borderRadius: 10, overflow: 'hidden', width: 250 }}>
                    <img src={groupUrl} alt="Feed 16:9" style={{ width: '100%', display: 'block', aspectRatio: '16/9', objectFit: 'cover' }} />
                  </div>
                  <div style={{ background: 'rgba(0,0,0,0.4)', borderRadius: 10, overflow: 'hidden', width: 80 }}>
                    <img src={portraitUrl} alt="Story 9:16" style={{ width: '100%', display: 'block', aspectRatio: '9/16', objectFit: 'cover' }} />
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
            style={{
              width: '100%', boxSizing: 'border-box', resize: 'vertical',
              background: 'rgba(0,0,0,0.25)', border: `1px solid ${BORDER}`,
              borderRadius: 8, padding: '10px 12px',
              color: 'rgba(255,255,255,0.85)', fontSize: 13, lineHeight: 1.65,
              fontFamily: 'inherit', outline: 'none', marginBottom: 12,
            }}
          />

          {/* Action chips */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {chips.map(({ label, onClick, disabled }) => (
              <button
                key={label}
                onClick={disabled ? undefined : onClick}
                disabled={disabled}
                style={{
                  padding: '5px 11px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                  cursor: disabled ? 'default' : 'pointer',
                  border: `1px solid ${BORDER}`,
                  background: 'rgba(255,255,255,0.04)',
                  color: disabled ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.65)',
                  opacity: disabled ? 0.5 : 1,
                }}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Send panel */}
          {sendOpen && (
            <div style={{ marginTop: 14, background: `${R}07`, border: `1px solid ${R}2a`, borderRadius: 10, padding: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: R, marginBottom: 12 }}>Enviar nos grupos WhatsApp</div>

              <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
                {FORMATS.filter(f => f.key === 'group' ? hasFeed : hasStory).map(f => (
                  <button key={f.key} onClick={() => setSendFmt(f.key)} style={{ padding: '4px 10px', borderRadius: 5, fontSize: 11, fontWeight: 600, cursor: 'pointer', border: `1px solid ${sendFmt === f.key ? R : BORDER}`, background: sendFmt === f.key ? `${R}22` : 'transparent', color: sendFmt === f.key ? R : 'rgba(255,255,255,0.45)' }}>
                    {f.label}
                  </button>
                ))}
              </div>

              {groups.length === 0
                ? <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 12, lineHeight: 1.6 }}>
                    Nenhum grupo cadastrado.<br />
                    <span style={{ color: 'rgba(255,255,255,0.28)' }}>Cadastre grupos em </span>
                    <strong style={{ color: R }}>Grupos WhatsApp</strong>
                    <span style={{ color: 'rgba(255,255,255,0.28)' }}> no menu lateral e sincronize via Evolution API.</span>
                  </div>
                : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginBottom: 12 }}>
                    {groups.map(g => (
                      <label key={g.evolution_jid} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px', borderRadius: 6, cursor: 'pointer', background: selGroups.has(g.evolution_jid) ? `${R}10` : 'rgba(255,255,255,0.02)', border: `1px solid ${selGroups.has(g.evolution_jid) ? R + '33' : BORDER}` }}>
                        <input type="checkbox" checked={selGroups.has(g.evolution_jid)} onChange={() => toggleGroup(g.evolution_jid)} style={{ accentColor: R, width: 14, height: 14 }} />
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
                <button onClick={handleSend} disabled={sending || !selGroups.size} style={{ padding: '7px 14px', borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: (!selGroups.size || sending) ? 'default' : 'pointer', background: R, color: '#fff', border: 'none', opacity: (sending || !selGroups.size) ? 0.5 : 1 }}>
                  {sending ? 'Enviando…' : `Enviar (${selGroups.size})`}
                </button>
                <button onClick={() => setSendOpen(false)} style={{ padding: '7px 12px', borderRadius: 7, fontSize: 12, cursor: 'pointer', background: 'transparent', border: `1px solid ${BORDER}`, color: 'rgba(255,255,255,0.45)' }}>
                  Fechar
                </button>
              </div>
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
    <button
      role="switch" aria-checked={checked} aria-label={label}
      onClick={onChange}
      style={{ width: 34, height: 18, borderRadius: 9, border: 'none', cursor: 'pointer', background: checked ? R : 'rgba(255,255,255,0.1)', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}
    >
      <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#fff', position: 'absolute', top: 3, left: checked ? 19 : 3, transition: 'left 0.2s' }} />
    </button>
  );
}

// ── ProfilePanel ──────────────────────────────────────────────────────────────
function ProfilePanel({ onOpenPromptModal, agentCfg, setAgentCfg, tenantDbId }) {
  const [tab,       setTab]       = useState('instrucoes');
  const [toggles,   setToggles]   = useState({ recente: true, preferencias: true, inteligencia: false });
  const [memories,  setMemories]  = useState([
    { id: 1, text: 'Tom mais descontraído às sextas-feiras', enabled: true  },
    { id: 2, text: 'Clientes da padaria preferem mensagens curtas', enabled: true  },
    { id: 3, text: 'Evitar frases com "bom dia" no início', enabled: false },
  ]);
  const [savingCfg, setSavingCfg] = useState(false);

  const handleSaveCfg = async () => {
    if (!tenantDbId) return;
    setSavingCfg(true);
    await supabase.from('tenant_agent_config').upsert(
      { tenant_id: tenantDbId, agent_id: 'bom-dia', config: agentCfg },
      { onConflict: 'tenant_id,agent_id' }
    );
    setSavingCfg(false);
  };

  const TABS = [
    { id: 'instrucoes', label: 'Instruções'  },
    { id: 'empregos',   label: 'Empregos'    },
    { id: 'habilidades',label: 'Habilidades' },
    { id: 'infos',      label: 'Informações' },
    { id: 'memoria',    label: 'Memória'     },
  ];

  const sectionTitle = (t) => (
    <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>{t}</div>
  );
  const card = (children, extra = {}) => (
    <div style={{ background: 'rgba(0,0,0,0.3)', border: `1px solid ${BORDER}`, borderRadius: 10, padding: 14, ...extra }}>
      {children}
    </div>
  );
  const dot = (color = R) => <div style={{ width: 5, height: 5, borderRadius: '50%', background: color, flexShrink: 0 }} />;

  return (
    <div style={{ width: 380, flexShrink: 0, background: BG2, borderLeft: `1px solid ${BORDER}`, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Tab pills */}
      <div style={{ padding: '14px 12px 0', borderBottom: `1px solid ${BORDER}` }}>
        <div role="tablist" style={{ display: 'flex', gap: 4, flexWrap: 'wrap', paddingBottom: 12 }}>
          {TABS.map(t => (
            <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)} style={{ padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: 'pointer', border: `1px solid ${tab === t.id ? R : BORDER}`, background: tab === t.id ? `${R}18` : 'transparent', color: tab === t.id ? R : 'rgba(255,255,255,0.4)' }}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* INSTRUÇÕES */}
        {tab === 'instrucoes' && (<>
          {card(<>
            {sectionTitle('Master Prompt')}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', fontFamily: "'Oswald', sans-serif", textTransform: 'uppercase' }}>
                  Versão {MOCK_PROMPT.version}
                </div>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.28)', marginTop: 2 }}>{MOCK_PROMPT.size}</div>
              </div>
              <button onClick={onOpenPromptModal} style={{ padding: '5px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer', background: `${R}18`, border: `1px solid ${R}44`, color: R }}>
                Ver prompt
              </button>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              {MOCK_PROMPT.paleta.map(c => (
                <div key={c} title={c} style={{ width: 18, height: 18, borderRadius: 3, background: c, border: '1px solid rgba(255,255,255,0.1)', flexShrink: 0 }} />
              ))}
            </div>
          </>)}

          {card(<>
            {sectionTitle('Papel & Objetivo')}
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)', lineHeight: 1.65 }}>
              Gerar artes motivacionais diárias para WhatsApp e Instagram da Consult Delivery, mantendo identidade visual e tom inspirador.
            </div>
          </>)}

          {card(<>
            {sectionTitle('Calendário de Temas')}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {MOCK_CALENDAR.map(c => (
                <div key={c.day} style={{ display: 'flex', gap: 10, alignItems: 'baseline' }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: R, width: 22, flexShrink: 0, textTransform: 'uppercase' }}>{c.day}</span>
                  <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>{c.theme}</span>
                </div>
              ))}
            </div>
          </>)}

          {card(<>
            {sectionTitle('Instruções Personalizadas')}
            <textarea
              value={agentCfg.instructions}
              onChange={e => setAgentCfg(c => ({ ...c, instructions: e.target.value }))}
              rows={4}
              placeholder="Ex: Sempre usar emojis de foguete 🚀…"
              style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical', background: 'rgba(0,0,0,0.2)', border: `1px solid ${BORDER}`, borderRadius: 6, padding: '8px 10px', color: 'rgba(255,255,255,0.8)', fontSize: 12, fontFamily: 'inherit', outline: 'none' }}
            />
            <button onClick={handleSaveCfg} disabled={savingCfg} style={{ marginTop: 8, padding: '6px 12px', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer', background: R, color: '#fff', border: 'none', opacity: savingCfg ? 0.6 : 1 }}>
              {savingCfg ? 'Salvando…' : 'Salvar'}
            </button>
          </>)}
        </>)}

        {/* EMPREGOS */}
        {tab === 'empregos' && [
          { label: 'Manual',       items: ['Menção no grupo (@bom-dia)', 'Mensagem direta (DM)', 'Task criada no sistema']      },
          { label: 'Agendado',     items: ['Seg–Sex · 08:55 (diário)', 'Sábado · 07:55']                                      },
          { label: 'Automatizado', items: ['Quando tema do calendário muda', 'Re-run automático se imagem falhar']              },
        ].map(({ label, items }) => (
          <div key={label} style={{ background: 'rgba(0,0,0,0.3)', border: `1px solid ${BORDER}`, borderRadius: 10, padding: 14 }}>
            {sectionTitle(label)}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {items.map(item => (
                <div key={item} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {dot()} <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>{item}</span>
                </div>
              ))}
            </div>
          </div>
        ))}

        {/* HABILIDADES */}
        {tab === 'habilidades' && [
          { group: 'Consult Delivery', tools: ['Supabase (leitura/escrita)', 'Bridge Server (envio WA)', 'agent_runs (histórico)']       },
          { group: 'Geração de Imagem', tools: ['Recraft v3 · Feed 4:5', 'Recraft v3 · Story 9:16', 'Overlay de logo PNG']              },
          { group: 'Pesquisa Externa',  tools: ['Busca na web (Anthropic)', 'Calendário de temas (Drive)', 'GitHub (changelog)']         },
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
            {[{ label: 'Seg–Sex', time: '08:55', type: 'Diário' }, { label: 'Sábado', time: '07:55', type: 'Especial' }].map(e => (
              <div key={e.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, padding: '7px 10px', background: 'rgba(255,255,255,0.02)', borderRadius: 7 }}>
                <div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.75)' }}>{e.label}</div>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.28)', marginTop: 1 }}>{e.type}</div>
                </div>
                <div style={{ fontSize: 12, fontWeight: 700, color: R, fontFamily: 'monospace' }}>{e.time}</div>
              </div>
            ))}
          </>)}
          {card(<>
            {sectionTitle('Modelo & Stack')}
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', lineHeight: 1.85 }}>
              claude-sonnet-4-6<br />
              Recraft v3 · Trigger.dev cloud<br />
              Supabase Storage (webp → jpeg)<br />
              Bridge Server 3001 (VPS)
            </div>
          </>)}
        </>)}

        {/* MEMÓRIA */}
        {tab === 'memoria' && (<>
          {card(<>
            {sectionTitle('Tipos de Memória')}
            {[
              { key: 'recente',       label: 'Recente',      desc: 'Últimas gerações e temas usados' },
              { key: 'preferencias',  label: 'Preferências', desc: 'Tom, estilo e regras salvas'     },
              { key: 'inteligencia',  label: 'Inteligência', desc: null, beta: true                  },
            ].map(({ key, label, desc, beta }) => (
              <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, padding: '7px 10px', borderRadius: 7, background: 'rgba(255,255,255,0.02)' }}>
                <Toggle checked={toggles[key]} onChange={() => setToggles(t => ({ ...t, [key]: !t[key] }))} label={label} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: toggles[key] ? '#fff' : 'rgba(255,255,255,0.38)', display: 'flex', alignItems: 'center', gap: 6 }}>
                    {label}
                    {beta && <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 4, background: 'rgba(168,85,247,0.15)', border: '1px solid rgba(168,85,247,0.3)', color: '#c4b5fd', fontWeight: 700 }}>Beta</span>}
                  </div>
                  {desc && <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.28)', marginTop: 1 }}>{desc}</div>}
                  {!desc && <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.28)', marginTop: 1 }}>Aprendizado contínuo (em breve)</div>}
                </div>
              </div>
            ))}
          </>)}

          {card(<>
            {sectionTitle('Memória do Agente')}
            <textarea
              value={agentCfg.memory}
              onChange={e => setAgentCfg(c => ({ ...c, memory: e.target.value }))}
              rows={5}
              placeholder="Ex: Clientes preferem tom direto. Mencionar Thiago no grupo da padaria…"
              style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical', background: 'rgba(0,0,0,0.2)', border: `1px solid ${BORDER}`, borderRadius: 6, padding: '8px 10px', color: 'rgba(255,255,255,0.8)', fontSize: 12, fontFamily: 'inherit', outline: 'none' }}
            />
            <button onClick={handleSaveCfg} disabled={savingCfg} style={{ marginTop: 8, padding: '6px 12px', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer', background: R, color: '#fff', border: 'none', opacity: savingCfg ? 0.6 : 1 }}>
              {savingCfg ? 'Salvando…' : 'Salvar memória'}
            </button>
          </>)}

          {card(<>
            {sectionTitle('Memórias Salvas')}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {memories.map(m => (
                <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px', borderRadius: 7, background: 'rgba(255,255,255,0.02)', border: `1px solid ${BORDER}` }}>
                  <Toggle checked={m.enabled} onChange={() => setMemories(ms => ms.map(x => x.id === m.id ? { ...x, enabled: !x.enabled } : x))} label={m.text} />
                  <span style={{ fontSize: 12, color: m.enabled ? 'rgba(255,255,255,0.72)' : 'rgba(255,255,255,0.28)', flex: 1 }}>{m.text}</span>
                </div>
              ))}
            </div>
          </>)}
        </>)}
      </div>
    </div>
  );
}

// ── NewPostModal ──────────────────────────────────────────────────────────────
function NewPostModal({ onClose, onGenerate, onSuccess, generating, genError }) {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({ dayChips: [], theme: '', brief: '', formats: { feed: true, story: true } });
  const submittedRef = useRef(false);

  const DAYS = ['Seg','Ter','Qua','Qui','Sex','Sáb'];

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape' && step === 1) onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose, step]);

  // Avança para "Pronto!" quando a geração real terminar com sucesso
  useEffect(() => {
    if (!submittedRef.current) return;
    if (step === 2 && !generating && !genError) {
      setStep(3);
    }
  }, [generating, genError, step]);

  const handleSubmit = () => {
    submittedRef.current = true;
    setStep(2);
    onGenerate(form);
  };

  const pill = (label) => ({
    padding: '4px 11px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer',
    border: `1px solid ${BORDER}`, background: 'transparent', color: 'rgba(255,255,255,0.45)',
  });

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.78)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
      role="dialog" aria-modal="true" aria-label="Nova postagem"
      onClick={e => { if (e.target === e.currentTarget && step !== 2) onClose(); }}
    >
      <div style={{ background: '#181818', border: `1px solid ${BORDER}`, borderRadius: 16, padding: 32, width: '100%', maxWidth: 500, boxShadow: '0 24px 60px rgba(0,0,0,0.6)' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#fff', fontFamily: "'Oswald', sans-serif", textTransform: 'uppercase', letterSpacing: 0.8 }}>
              {step === 1 ? 'Nova Postagem' : step === 2 ? 'Gerando…' : 'Pronto!'}
            </div>
            <div style={{ display: 'flex', gap: 5, marginTop: 6 }}>
              {[1,2,3].map(s => (
                <div key={s} style={{ height: 4, borderRadius: 2, background: s === step ? R : s < step ? `${R}66` : BORDER, width: s === step ? 20 : 6, transition: 'width 0.2s, background 0.2s' }} />
              ))}
            </div>
          </div>
          {step !== 2 && (
            <button onClick={onClose} style={{ background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 6, padding: '4px 10px', color: 'rgba(255,255,255,0.38)', cursor: 'pointer', fontSize: 12 }}>✕</button>
          )}
        </div>

        {/* Step 1 */}
        {step === 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Dia da semana</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {DAYS.map(d => (
                  <button key={d} onClick={() => setForm(f => ({ ...f, dayChips: f.dayChips.includes(d) ? f.dayChips.filter(x => x !== d) : [...f.dayChips, d] }))} style={{ ...pill(d), border: `1px solid ${form.dayChips.includes(d) ? R : BORDER}`, background: form.dayChips.includes(d) ? `${R}18` : 'transparent', color: form.dayChips.includes(d) ? R : 'rgba(255,255,255,0.45)' }}>
                    {d}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Tema / Tom</div>
              <input value={form.theme} onChange={e => setForm(f => ({ ...f, theme: e.target.value }))} placeholder="Ex: motivação de segunda-feira, dica de gestão…" style={{ width: '100%', boxSizing: 'border-box', background: 'rgba(0,0,0,0.3)', border: `1px solid ${BORDER}`, borderRadius: 8, padding: '10px 12px', color: '#fff', fontSize: 13, outline: 'none', fontFamily: 'inherit' }} />
            </div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Brief (opcional)</div>
              <textarea value={form.brief} onChange={e => setForm(f => ({ ...f, brief: e.target.value }))} rows={3} placeholder="Contexto adicional para o agente…" style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical', background: 'rgba(0,0,0,0.3)', border: `1px solid ${BORDER}`, borderRadius: 8, padding: '10px 12px', color: 'rgba(255,255,255,0.8)', fontSize: 13, outline: 'none', fontFamily: 'inherit' }} />
            </div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Formatos</div>
              <div style={{ display: 'flex', gap: 14 }}>
                {[{ key: 'feed', label: 'Feed 4:5' }, { key: 'story', label: 'Story 9:16' }].map(({ key, label }) => (
                  <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: 'rgba(255,255,255,0.7)' }}>
                    <input type="checkbox" checked={form.formats[key]} onChange={() => setForm(f => ({ ...f, formats: { ...f.formats, [key]: !f.formats[key] } }))} style={{ accentColor: R, width: 15, height: 15 }} />
                    {label}
                  </label>
                ))}
              </div>
            </div>
            <button onClick={handleSubmit} style={{ padding: '12px 20px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', background: R, color: '#fff', border: 'none', fontFamily: "'Oswald', sans-serif", textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Gerar postagem
            </button>
          </div>
        )}

        {/* Step 2 — loading real */}
        {step === 2 && (
          <div style={{ textAlign: 'center', padding: '24px 0 16px' }}>
            {genError ? (
              <>
                <div style={{ fontSize: 32, marginBottom: 14 }}>⚠️</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#fca5a5', marginBottom: 8 }}>Erro na geração</div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', marginBottom: 20, maxWidth: 320, margin: '0 auto 20px' }}>{genError}</div>
                <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                  <button onClick={onClose} style={{ padding: '9px 16px', borderRadius: 7, fontSize: 13, cursor: 'pointer', background: 'transparent', border: `1px solid ${BORDER}`, color: 'rgba(255,255,255,0.55)' }}>
                    Fechar
                  </button>
                  <button onClick={() => { submittedRef.current = true; onGenerate(form); }} style={{ padding: '9px 16px', borderRadius: 7, fontSize: 13, fontWeight: 700, cursor: 'pointer', background: R, color: '#fff', border: 'none' }}>
                    Tentar novamente
                  </button>
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize: 44, marginBottom: 20, lineHeight: 1 }}>🚀</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#fff', marginBottom: 8 }}>Gerando arte…</div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.38)', marginBottom: 20 }}>
                  Claude cria o tema · Recraft renderiza Feed + Story · ~1–2 min
                </div>
                <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                  {[0,1,2].map(i => (
                    <div key={i} style={{ width: 8, height: 8, borderRadius: '50%', background: R, opacity: 0.9, animation: `pulse${i} 1.2s ${i * 0.4}s ease-in-out infinite` }} />
                  ))}
                </div>
                <style>{`
                  @keyframes pulse0 { 0%,100%{opacity:.25;transform:scale(.8)} 50%{opacity:1;transform:scale(1.1)} }
                  @keyframes pulse1 { 0%,100%{opacity:.25;transform:scale(.8)} 50%{opacity:1;transform:scale(1.1)} }
                  @keyframes pulse2 { 0%,100%{opacity:.25;transform:scale(.8)} 50%{opacity:1;transform:scale(1.1)} }
                `}</style>
                <div style={{ marginTop: 20 }}>
                  <button onClick={onClose} style={{ padding: '7px 14px', borderRadius: 7, fontSize: 12, cursor: 'pointer', background: 'transparent', border: `1px solid ${BORDER}`, color: 'rgba(255,255,255,0.38)' }}>
                    Fechar e aguardar em segundo plano
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* Step 3 */}
        {step === 3 && (
          <div style={{ textAlign: 'center', padding: '8px 0 16px' }}>
            <div style={{ width: 52, height: 52, borderRadius: '50%', background: `${R}18`, border: `2px solid ${R}`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', fontSize: 22, color: R }}>
              ✓
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#fff', marginBottom: 6 }}>Arte gerada com sucesso!</div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', marginBottom: 24 }}>A postagem está disponível no histórico.</div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button onClick={() => { onSuccess?.(); onClose(); }} style={{ padding: '9px 16px', borderRadius: 7, fontSize: 13, cursor: 'pointer', background: 'transparent', border: `1px solid ${BORDER}`, color: 'rgba(255,255,255,0.55)' }}>
                Ver depois
              </button>
              <button onClick={() => { onSuccess?.(); onClose(); }} style={{ padding: '9px 16px', borderRadius: 7, fontSize: 13, fontWeight: 700, cursor: 'pointer', background: R, color: '#fff', border: 'none' }}>
                Abrir nova postagem
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── PromptMestreModal ─────────────────────────────────────────────────────────
function PromptMestreModal({ onClose }) {
  const [tab, setTab] = useState('overview');

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const TABS = [
    { id: 'overview', label: 'Visão Geral'   },
    { id: 'prompt',   label: 'System Prompt' },
    { id: 'rules',    label: 'Pode / Não pode' },
  ];

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 1001, background: 'rgba(0,0,0,0.82)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
      role="dialog" aria-modal="true" aria-label="Master Prompt"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: '#181818', border: `1px solid ${BORDER}`, borderRadius: 16, width: '100%', maxWidth: 640, maxHeight: '82vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '20px 24px 0', borderBottom: `1px solid ${BORDER}` }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', fontFamily: "'Oswald', sans-serif", textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Master Prompt · Bom Dia
              </div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.28)', marginTop: 2 }}>
                Versão {MOCK_PROMPT.version} · {MOCK_PROMPT.size}
              </div>
            </div>
            <button onClick={onClose} style={{ background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 6, padding: '4px 10px', color: 'rgba(255,255,255,0.38)', cursor: 'pointer' }}>✕</button>
          </div>
          <div role="tablist" style={{ display: 'flex', gap: 4, paddingBottom: 12 }}>
            {TABS.map(t => (
              <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)} style={{ padding: '4px 11px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer', border: `1px solid ${tab === t.id ? R : BORDER}`, background: tab === t.id ? `${R}18` : 'transparent', color: tab === t.id ? R : 'rgba(255,255,255,0.4)' }}>
                {t.label}
              </button>
            ))}
          </div>
        </div>
        <div style={{ flex: 1, overflow: 'auto', padding: 24 }}>
          {tab === 'overview' && (
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
                {[['Versão', MOCK_PROMPT.version], ['Tamanho', MOCK_PROMPT.size], ['Feed', '1080×1350 · 4:5'], ['Story', '1080×1920 · 9:16']].map(([l, v]) => (
                  <div key={l} style={{ background: 'rgba(0,0,0,0.35)', border: `1px solid ${BORDER}`, borderRadius: 8, padding: '10px 12px' }}>
                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>{l}</div>
                    <div style={{ fontSize: 14, color: '#fff', fontWeight: 700 }}>{v}</div>
                  </div>
                ))}
              </div>
              <div style={{ marginBottom: 6, fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: 1 }}>Paleta de Cores</div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {MOCK_PROMPT.paleta.map(c => (
                  <div key={c} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                    <div style={{ width: 38, height: 38, borderRadius: 8, background: c, border: '1px solid rgba(255,255,255,0.08)' }} />
                    <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)', fontFamily: 'monospace' }}>{c}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {tab === 'prompt' && (
            <pre style={{ background: 'rgba(0,0,0,0.5)', border: `1px solid ${BORDER}`, borderRadius: 10, padding: 16, margin: 0, overflow: 'auto', color: 'rgba(255,255,255,0.8)', fontSize: 12, lineHeight: 1.7, fontFamily: "'JetBrains Mono','Fira Code','Courier New',monospace", whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {MOCK_PROMPT.systemPrompt}
            </pre>
          )}
          {tab === 'rules' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(16,185,129,0.8)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>Pode</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {MOCK_PROMPT.pode.map(item => (
                    <div key={item} style={{ padding: '8px 10px', borderRadius: 7, background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.14)', fontSize: 12, color: 'rgba(255,255,255,0.7)', lineHeight: 1.55 }}>{item}</div>
                  ))}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: `${R}cc`, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>Não pode</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {MOCK_PROMPT.naoPode.map(item => (
                    <div key={item} style={{ padding: '8px 10px', borderRadius: 7, background: `${R}08`, border: `1px solid ${R}1e`, fontSize: 12, color: 'rgba(255,255,255,0.7)', lineHeight: 1.55 }}>{item}</div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main BomDiaScreen ─────────────────────────────────────────────────────────
export default function BomDiaScreen({ tenantDbId, userId }) {
  const [runs,        setRuns]        = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [generating,  setGenerating]  = useState(false);
  const [genError,    setGenError]    = useState('');
  const [centerTab,   setCenterTab]   = useState('editar');
  const [showNewPost, setShowNewPost] = useState(false);
  const [showPrompt,  setShowPrompt]  = useState(false);
  const [showProfile, setShowProfile] = useState(true);
  const [composer,    setComposer]    = useState('');
  const [agentCfg,    setAgentCfg]    = useState({ memory: '', instructions: '' });
  const pendingRef = useRef(null);
  const listEndRef = useRef(null);

  // ── Fetch runs ──────────────────────────────────────────────────────────────
  const fetchRuns = useCallback(() => {
    supabase
      .from('agent_runs')
      .select('id, output, created_at, status')
      .eq('agent_id', 'bom-dia')
      .eq('status', 'success')
      .order('created_at', { ascending: false })
      .limit(15)
      .then(({ data }) => {
        const valid = (data || []).filter(r => r.output?.img_group_url || r.output?.img_landscape_url);
        setRuns(valid);
        setLoading(false);
      });
  }, []);

  useEffect(() => { fetchRuns(); }, [fetchRuns]);

  // ── Fetch agent config ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!tenantDbId) return;
    supabase.from('tenant_agent_config').select('config').eq('tenant_id', tenantDbId).eq('agent_id', 'bom-dia').maybeSingle()
      .then(({ data }) => {
        if (data?.config) setAgentCfg({ memory: data.config.memory ?? '', instructions: data.config.instructions ?? '' });
      });
  }, [tenantDbId]);

  // ── Realtime ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const ch = supabase.channel('bom-dia-v2-runs')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'agent_runs' }, (payload) => {
        const run = payload.new;
        if (run.agent_id !== 'bom-dia') return;
        if (pendingRef.current && run.trigger_dev_run_id !== pendingRef.current) return;
        if (run.status === 'success' && (run.output?.img_group_url || run.output?.img_landscape_url)) {
          setRuns(prev => [run, ...prev].slice(0, 15));
          setGenerating(false);
          pendingRef.current = null;
        }
      })
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, []);

  // ── Generate ────────────────────────────────────────────────────────────────
  const handleGenerate = async (form) => {
    setGenError('');
    setGenerating(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const r = await fetch(`${BRIDGE_URL}/agents/bom-dia-gerar-imagem/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ tenant_id: tenantDbId, payload: { triggered_by: userId, theme: form?.theme, brief: form?.brief } }),
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error || `Erro ${r.status}`);
      pendingRef.current = body.run_id ?? null;
      if (body.output?.img_group_url || body.output?.img_landscape_url) {
        fetchRuns();
        setGenerating(false);
        pendingRef.current = null;
      }
    } catch (e) {
      setGenError(e.message);
      setGenerating(false);
    }
  };

  const TABS_CENTER = [
    { id: 'editar',   label: 'Editar'   },
    { id: 'chat',     label: 'Chat'     },
    { id: 'memorias', label: 'Memórias' },
  ];

  return (
    <div
      className="livechat"
      style={{ display: 'flex', height: '100%', background: BG, overflow: 'hidden' }}
    >
      {/* Left: sub-sidebar */}
      <SubSidebar />

      {/* Center: chat area */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Topbar */}
        <div style={{ height: 52, flexShrink: 0, display: 'flex', alignItems: 'center', padding: '0 18px', gap: 10, borderBottom: `1px solid ${BORDER}`, background: BG }}>
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.28)' }}>
            Agentes IA <span style={{ margin: '0 5px' }}>›</span>
            <span style={{ color: 'rgba(255,255,255,0.72)', fontWeight: 600 }}>Bom Dia</span>
          </span>

          <div role="tablist" style={{ display: 'flex', gap: 2, marginLeft: 16 }}>
            {TABS_CENTER.map(t => (
              <button key={t.id} role="tab" aria-selected={centerTab === t.id} onClick={() => setCenterTab(t.id)} style={{ padding: '5px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: 'none', background: centerTab === t.id ? `${R}18` : 'transparent', color: centerTab === t.id ? R : 'rgba(255,255,255,0.38)' }}>
                {t.label}
              </button>
            ))}
          </div>

          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
            {generating && (
              <span style={{ fontSize: 11, color: R, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}>
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: R }} />
                Gerando…
              </span>
            )}
            <button
              onClick={() => setShowProfile(v => !v)}
              style={{ padding: '4px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer', border: `1px solid ${showProfile ? R + '44' : BORDER}`, background: showProfile ? `${R}18` : 'transparent', color: showProfile ? R : 'rgba(255,255,255,0.38)' }}
            >
              Perfil
            </button>
            <button
              onClick={() => setShowNewPost(true)}
              style={{ padding: '7px 13px', borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: 'pointer', background: R, color: '#fff', border: 'none', fontFamily: "'Oswald', sans-serif", textTransform: 'uppercase', letterSpacing: 0.3 }}
            >
              + Nova postagem
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
              <BomDiaAvatar size={36} />
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: R }}>Gerando arte…</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 2 }}>Claude + Recraft · ~1–2 min</div>
              </div>
            </div>
          )}

          {loading && (
            <div style={{ padding: '32px 0', color: 'rgba(255,255,255,0.35)', fontSize: 13 }}>Carregando histórico…</div>
          )}

          {!loading && runs.length === 0 && !generating && (
            <div style={{ padding: '52px 0', textAlign: 'center' }}>
              <BomDiaAvatar size={48} />
              <div style={{ marginTop: 16, fontSize: 14, color: 'rgba(255,255,255,0.4)' }}>Nenhuma arte gerada ainda.</div>
              <div style={{ marginTop: 6, fontSize: 12, color: 'rgba(255,255,255,0.22)' }}>
                Clique em "Nova postagem" ou aguarde o agendamento automático.
              </div>
              <button onClick={() => setShowNewPost(true)} style={{ marginTop: 20, padding: '9px 18px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', background: R, color: '#fff', border: 'none' }}>
                Gerar agora
              </button>
            </div>
          )}

          {[...runs].reverse().map((run, i, arr) => (
            <AgentMessage
              key={run.id}
              run={run}
              tenantDbId={tenantDbId}
              isLast={i === arr.length - 1}
            />
          ))}
          <div ref={listEndRef} style={{ height: 80 }} />
        </div>

        {/* Composer */}
        <div style={{ height: 62, flexShrink: 0, display: 'flex', alignItems: 'center', padding: '0 16px', gap: 10, borderTop: `1px solid ${BORDER}`, background: BG }}>
          <input
            value={composer}
            onChange={e => setComposer(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && composer.trim()) setComposer(''); }}
            placeholder="Digite uma instrução ou / para comandos…"
            style={{ flex: 1, background: 'rgba(255,255,255,0.04)', border: `1px solid ${BORDER}`, borderRadius: 8, padding: '9px 14px', color: 'rgba(255,255,255,0.8)', fontSize: 13, outline: 'none', fontFamily: 'inherit' }}
          />
          <button
            onClick={() => { if (composer.trim()) setComposer(''); }}
            style={{ width: 36, height: 36, borderRadius: 7, border: 'none', cursor: 'pointer', background: composer.trim() ? R : 'rgba(255,255,255,0.06)', color: composer.trim() ? '#fff' : 'rgba(255,255,255,0.2)', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
          >
            ↑
          </button>
        </div>
      </div>

      {/* Right: profile panel */}
      {showProfile && (
        <ProfilePanel
          onOpenPromptModal={() => setShowPrompt(true)}
          agentCfg={agentCfg}
          setAgentCfg={setAgentCfg}
          tenantDbId={tenantDbId}
        />
      )}

      {/* Modals */}
      {showNewPost && (
        <NewPostModal
          onClose={() => setShowNewPost(false)}
          onGenerate={handleGenerate}
          onSuccess={fetchRuns}
          generating={generating}
          genError={genError}
        />
      )}
      {showPrompt && (
        <PromptMestreModal onClose={() => setShowPrompt(false)} />
      )}
    </div>
  );
}
