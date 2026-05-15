import { useState, useEffect, useRef, useMemo } from 'react';
import Icon from '../components/Icon.jsx';
import AgentAvatar from '../components/AgentAvatar.jsx';
import CustomSelect from '../components/CustomSelect.jsx';
import { useConversationStatus, STATUS_EMOJI } from '../lib/conversationStatus.js';
import { supabase } from '../lib/supabase.js';
import { sendTextMessage, sendMediaMessage, sendAudioMessage, fetchProfile, fetchGroups, fetchContacts } from '../lib/evolution.js';
import ConversationFiltersBar from '../components/chat/ConversationFiltersBar.jsx';
import DepartmentSelector from '../components/chat/DepartmentSelector.jsx';
import ConversationStatusBadge from '../components/chat/ConversationStatusBadge.jsx';
import LeadPanel from '../components/chat/LeadPanel.jsx';

const HAS_EVO = !!(
  import.meta.env.VITE_EVOLUTION_URL && import.meta.env.VITE_EVOLUTION_KEY
);

// ─── CHAT META (fallback visual quando não há dados reais) ──────
const CHAT_META_DEFAULT = {
  protocol: '#00000', dept: 'Atendimento', deptColor: '#B70C00',
  tag: '', tagColor: '#6B7280', waitColor: 'green', wait: 'agora', stale: '0min',
  phone: '—', email: '—', empresa: '—', site: '—', doc: '—', nasc: '—',
  address: '—', dadosLead: {}, sentiment: 'neutro', sentimentScore: 0.5,
  channel: 'WhatsApp', aiHandled: 0.5, autoTags: [], lang: 'pt-BR',
};

const QUICK_REPLIES_DEFAULT = [
  { id: 'qr1', shortcut: '/ola',      label: 'Saudação inicial',       text: 'Olá! Aqui é da Consult Delivery. Como posso te ajudar hoje? 🚀' },
  { id: 'qr2', shortcut: '/horario',  label: 'Horário de atendimento', text: 'Nosso horário de atendimento é de seg a sex, 9h–18h.' },
  { id: 'qr3', shortcut: '/desculpa', label: 'Pedir desculpas',        text: 'Peço desculpas pelo transtorno. Vou resolver isso pra você agora mesmo!' },
];

const AI_SUPERAGENTS = [
  { id: 'deli', name: 'DELI', desc: 'Orquestrador IA',           color: '#B70C00' },
  { id: 'cora', name: 'CORA', desc: 'Cobrança & inadimplência',  color: '#10B981' },
  { id: 'max',  name: 'MAX',  desc: 'iFood & marketplaces',      color: '#EA580C' },
  { id: 'vera', name: 'VERA', desc: 'Relatórios & analytics',    color: '#3B82F6' },
  { id: 'lara', name: 'LARA', desc: 'CRM & régua de disparo',    color: '#8B5CF6' },
];

const AI_COMMANDS = [
  { cmd: '/resumir',     icon: 'sparkles',   label: 'Resumir conversa',   desc: 'DELI cria um resumo executivo' },
  { cmd: '/traduzir',    icon: 'globe',       label: 'Traduzir mensagem',  desc: 'Tradução automática com contexto' },
  { cmd: '/tom',         icon: 'smile',       label: 'Ajustar tom',        desc: 'Mais formal, amigável, etc.' },
  { cmd: '/proxima',     icon: 'arrowright',  label: 'Próxima ação',       desc: 'DELI sugere o próximo passo' },
  { cmd: '/tarefa',      icon: 'check',       label: 'Criar tarefa',       desc: 'Vira um item no Kanban' },
  { cmd: '/cobranca',    icon: 'dollar',      label: 'Acionar CORA',       desc: 'CORA inicia régua de cobrança' },
  { cmd: '/handoff',     icon: 'users',       label: 'Passar pra humano',  desc: 'Entrega ao próximo atendente livre' },
];

// ─── CONV AVATAR ───────────────────────────────────────────────
function ConvAvatar({ conv, size = 36 }) {
  if (!conv) return null;
  if (conv.type === 'agent') {
    return <AgentAvatar id={conv.name?.toLowerCase()} size={size} />;
  }
  if (conv.photoUrl) {
    return (
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <img src={conv.photoUrl} alt={conv.name} style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover' }} />
        {conv.type === 'whatsapp' && (
          <span style={{ position:'absolute', bottom: -1, right: -1, width: size*0.34, height: size*0.34, borderRadius:'50%', background:'#25D366', border:'2px solid #0E0E0E', display:'inline-flex', alignItems:'center', justifyContent:'center' }}>
            <svg width={size*0.18} height={size*0.18} viewBox="0 0 24 24" fill="white"><path d="M12 2a10 10 0 0 0-8.5 15.2L2 22l4.9-1.5A10 10 0 1 0 12 2Z"/></svg>
          </span>
        )}
      </div>
    );
  }
  const palette = ['#B70C00','#F59E0B','#10B981','#3B82F6','#8B5CF6','#EC4899','#06B6D4'];
  const seed = (conv.id || conv.name || '').split('').reduce((s, c) => s + c.charCodeAt(0), 0);
  const bg = conv.type === 'internal' ? '#374151' : palette[seed % palette.length];
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: `linear-gradient(135deg, ${bg}, ${bg}cc)`, color: 'white', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: size * 0.36, flexShrink: 0, position: 'relative', boxShadow: '0 2px 6px rgba(0,0,0,0.3)' }}>
      {conv.avatar}
      {conv.type === 'whatsapp' && (
        <span style={{ position:'absolute', bottom: -1, right: -1, width: size*0.34, height: size*0.34, borderRadius:'50%', background:'#25D366', border:'2px solid #0E0E0E', display:'inline-flex', alignItems:'center', justifyContent:'center' }}>
          <svg width={size*0.18} height={size*0.18} viewBox="0 0 24 24" fill="white"><path d="M12 2a10 10 0 0 0-8.5 15.2L2 22l4.9-1.5A10 10 0 1 0 12 2Z"/></svg>
        </span>
      )}
      {conv.type === 'group' && (
        <span style={{ position:'absolute', bottom: -1, right: -1, width: size*0.34, height: size*0.34, borderRadius:'50%', background:'#25D366', border:'2px solid #0E0E0E', display:'inline-flex', alignItems:'center', justifyContent:'center', fontSize: size*0.16 }}>👥</span>
      )}
    </div>
  );
}

// ─── SENTIMENT BADGE ───────────────────────────────────────────
function SentimentBadge({ sentiment, score }) {
  const map = {
    positivo:  { label: 'Positivo',  color: '#34D399', bg: 'rgba(16,185,129,0.16)',  icon: '😊' },
    neutro:    { label: 'Neutro',    color: '#9CA3AF', bg: 'rgba(156,163,175,0.16)', icon: '😐' },
    frustrado: { label: 'Frustrado', color: '#FBBF24', bg: 'rgba(245,158,11,0.18)',  icon: '😟' },
    raiva:     { label: 'Raiva',     color: '#FF8A80', bg: 'rgba(183,12,0,0.18)',    icon: '😡' },
  };
  const s = map[sentiment] || map.neutro;
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap: 4, background: s.bg, color: s.color, padding:'2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 600 }}>
      <span style={{ fontSize: 10 }}>{s.icon}</span>
      {s.label}
      {score !== undefined && <span style={{ opacity: 0.7 }}>{Math.round(score * 100)}%</span>}
    </span>
  );
}

// ─── STATUS ICON ───────────────────────────────────────────────
function StatusIcon({ name, size = 14 }) {
  const paths = {
    msg:   <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>,
    clock: <><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></>,
    paper: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></>,
    inbox: <><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></>,
    check: <><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></>,
    alert: <><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4M12 17h.01"/></>,
    arch:  <><path d="M21 8v13H3V8M1 3h22v5H1zM10 12h4"/></>,
    bot:   <><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M12 2v9"/><circle cx="12" cy="2" r="1"/><path d="M7 15h.01M17 15h.01M12 15h.01"/></>,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {paths[name] || null}
    </svg>
  );
}

// ─── COLLAPSE SECTION ──────────────────────────────────────────
function CollapseSection({ title, open, onToggle, right, accent, children }) {
  return (
    <div className={`lc-collapse${accent ? ' accent' : ''}`}>
      <div
        className="lc-collapse-head"
        role="button" tabIndex={0}
        onClick={onToggle}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(); } }}
      >
        <span className="lc-collapse-title" style={accent ? { color: 'var(--red-light)' } : null}>
          {accent && <Icon name="sparkles" size={12} style={{ marginRight: 6, verticalAlign: 'middle' }} />}
          {title}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }} onClick={e => e.stopPropagation()}>
          {right}
          <Icon name="chevdown" size={14} style={{ color: 'rgba(255,255,255,0.5)', transform: open ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 200ms' }} />
        </span>
      </div>
      {open && <div className="lc-collapse-body">{children}</div>}
    </div>
  );
}

// ─── FIELD ROW ────────────────────────────────────────────────
function FieldRow({ label, value, hint }) {
  return (
    <div className="lc-field">
      <div className="lc-field-label">{label}</div>
      <div className="lc-field-value">
        {value || <span style={{ color: 'rgba(255,255,255,0.3)' }}>{hint || '—'}</span>}
      </div>
    </div>
  );
}

// ─── EMOJI PICKER ──────────────────────────────────────────────
const EMOJI_GROUPS = [
  { label: 'Mais usados', emojis: ['😊','😂','❤️','👍','🙏','😍','😭','😅','🔥','✅','💯','🎉','👏','🤝','😎','💪','🚀','⭐','✨','💬'] },
  { label: 'Rostos', emojis: ['😀','😃','😄','😁','😆','😅','🤣','😂','🙂','🙃','😉','😊','😇','🥰','😍','🤩','😘','😗','😚','😙','😋','😛','😜','🤪','😝','🤑','🤗','🤭','🤫','🤔','😐','😑','😶','😏','😒','🙄','😬','🤥','😌','😔','😪','🤤','😴','😷','🤒','🤕','🤢','🤮','🥵','🥶','🥴','😵','🤯','🤠','🥳','😎','🤓','🧐','😕','😟','🙁','☹️','😮','😯','😲','😳','🥺','😦','😧','😨','😰','😥','😢','😭','😱','😖','😣','😞','😓','😩','😫','🥱','😤','😡','😠','🤬'] },
  { label: 'Gestos', emojis: ['👋','🤚','🖐️','✋','🖖','👌','🤌','✌️','🤞','🤟','🤘','🤙','👈','👉','👆','🖕','👇','☝️','👍','👎','✊','👊','🤛','🤜','👏','🙌','🫶','👐','🤲','🙏','✍️','💅','🤳','💪','🦾','🦵','🦶','👂','🦻','👃','🫀','🫁','🧠','🦷','🦴','👀','👁️','👅','👄'] },
  { label: 'Objetos', emojis: ['💌','💎','🔑','🗝️','🔒','🔓','🔔','🔕','📣','📢','📱','💻','⌨️','🖥️','🖨️','🖱️','📷','📸','📹','🎥','📞','☎️','📠','📺','📻','🎙️','🎚️','🎛️','🧭','⏱️','⏰','📡','🔋','💡','🔦','🕯️','🪔','📝','✏️','🖊️','🖋️','🖌️','📚','📖','📰','🗞️','📋','📁','📂','🗂️','📅','📆','🗒️','🗓️','📊','📈','📉','🗃️','🗳️','🗄️','📦','🛒','💰','💴','💵','💶','💷','💸','💳','🪙','💹','✉️','📧','📨','📩','📤','📥','📦','📫','📪','📬','📭','📮','🗳️'] },
  { label: 'Símbolos', emojis: ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❤️‍🔥','❤️‍🩹','💕','💞','💓','💗','💖','💘','💝','💟','☮️','✝️','☪️','🕉️','✡️','🔯','🛐','⛎','♈','♉','♊','♋','♌','♍','♎','♏','♐','♑','♒','♓','⁉️','❓','❔','❕','❗','‼️','⚠️','🚸','♻️','✅','❎','🆕','🆙','🆒','🆓','🆖','📵','🚫','❌','⭕','🛑','⛔','📛','🔞','💯','🔝','🔛','🔜','🔚'] },
];

function EmojiPicker({ onSelect, onClose }) {
  const ref = useRef(null);
  const [group, setGroup] = useState(0);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  return (
    <div ref={ref} className="lc-emoji-picker">
      <div className="lc-emoji-cats">
        {EMOJI_GROUPS.map((g, i) => (
          <button key={i} className={`lc-emoji-cat${group === i ? ' on' : ''}`} onClick={() => setGroup(i)} title={g.label}>
            {g.emojis[0]}
          </button>
        ))}
      </div>
      <div className="lc-emoji-label">{EMOJI_GROUPS[group].label}</div>
      <div className="lc-emoji-grid">
        {EMOJI_GROUPS[group].emojis.map((em, i) => (
          <button key={i} className="lc-emoji-btn" onClick={() => onSelect(em)}>{em}</button>
        ))}
      </div>
    </div>
  );
}

// ─── CONV ROW (sidebar item) ───────────────────────────────────
function ConvRow({ conv, active, onClick, statusFilter, fav, onFav, selectMode, selected, onSelect }) {
  const waitColors = {
    aguardando:         { bg: 'rgba(245,158,11,0.18)',  color: '#FBBF24' },
    em_atendimento:     { bg: 'rgba(59,130,246,0.18)',   color: '#93C5FD' },
    atendimento_aberto: { bg: 'rgba(16,185,129,0.18)',   color: '#34D399' },
    finalizado:         { bg: 'rgba(156,163,175,0.14)',  color: '#9CA3AF' },
    archived:           { bg: 'rgba(156,163,175,0.14)',  color: '#9CA3AF' },
    automacao:          { bg: 'rgba(168,85,247,0.18)',   color: '#D8B4FE' },
    falha:              { bg: 'rgba(183,12,0,0.18)',     color: '#FF8080' },
  };
  const realStatus = conv.status || 'aguardando';
  const displayStatus = (statusFilter === 'aguardando' && realStatus === 'atendimento_aberto' && conv.previewFrom === 'in')
    ? 'em_atendimento'
    : realStatus;
  const wColor = waitColors[displayStatus] || waitColors.aguardando;
  const statusLabels = {
    aguardando:         'Não iniciado',
    em_atendimento:     'Aguardando',
    atendimento_aberto: 'Em aberto',
    finalizado:         'Finalizado',
    archived:           'Oculto',
    automacao:          'Automação',
    falha:              'Falha',
  };
  return (
    <div onClick={selectMode ? onSelect : onClick} className={`lc-row${active && !selectMode ? ' on' : ''}${selected ? ' on' : ''}`} style={selected ? { background: 'rgba(183,12,0,0.12)' } : undefined}>
      <div style={{ position: 'relative', flexShrink: 0 }}>
        {selectMode ? (
          <div style={{ width: 42, height: 42, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ width: 20, height: 20, borderRadius: 6, border: `2px solid ${selected ? '#B70C00' : 'rgba(255,255,255,0.3)'}`, background: selected ? '#B70C00' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all .15s' }}>
              {selected && <svg width="11" height="9" viewBox="0 0 11 9" fill="none"><polyline points="1,4.5 4,7.5 10,1.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
            </div>
          </div>
        ) : (
          <ConvAvatar conv={conv} size={42} />
        )}
        {!selectMode && conv.unread > 0 && (
          <span style={{ position: 'absolute', top: -2, right: -2, width: 16, height: 16, background: 'var(--red)', borderRadius: '50%', border: '2px solid #181818', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 800, color: 'white' }}>
            {conv.unread > 9 ? '9+' : conv.unread}
          </span>
        )}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 6 }}>
          <div className="lc-row-name truncate">{conv.name}</div>
          <div style={{ display: 'flex', gap: 4, flexShrink: 0, alignItems: 'center' }}>
            {fav && (
              <svg width="10" height="10" viewBox="0 0 24 24" fill="#FBBF24" stroke="#FBBF24" strokeWidth="1.5" style={{ flexShrink: 0 }}>
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
              </svg>
            )}
            {conv.time && <span className="lc-row-pill" style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.55)' }}>{conv.time}</span>}
          </div>
        </div>
        <div style={{ marginTop: 3 }}>
          <div className="lc-row-preview truncate">
            {conv.preview && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                {conv.previewFrom === 'in' && <span style={{ width: 6, height: 6, background: '#34D399', borderRadius: '50%', display: 'inline-block', flexShrink: 0 }} />}
                {conv.preview}
              </span>
            )}
          </div>
        </div>
        <div style={{ marginTop: 5, display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
          <span className="lc-row-pill" style={{ background: wColor.bg, color: wColor.color }}>
            {statusLabels[displayStatus] || displayStatus}
          </span>
          {conv.last_breno_handled_at && (
            <span className="lc-row-pill" style={{ background: conv.breno_paused ? 'rgba(107,114,128,0.15)' : 'rgba(168,85,247,0.15)', color: conv.breno_paused ? '#6B7280' : '#C084FC', fontSize: 9 }}>
              {conv.breno_paused ? '⏸ BRENO' : '🤖 BRENO'}
            </span>
          )}
          {conv.type === 'internal' && <span className="lc-row-tag" style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.5)' }}>Interno</span>}
        </div>
      </div>
      {!selectMode && (
        <button
          className="lc-fav-btn"
          title={fav ? 'Remover dos favoritos' : 'Favoritar conversa'}
          onClick={onFav}
          style={{ color: fav ? '#FBBF24' : undefined }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill={fav ? '#FBBF24' : 'none'} stroke={fav ? '#FBBF24' : 'currentColor'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
          </svg>
        </button>
      )}
    </div>
  );
}

// ─── AUDIO PLAYER ─────────────────────────────────────────────
function AudioPlayer({ src, isOut }) {
  const [playing, setPlaying]       = useState(false);
  const [currentTime, setCurrent]   = useState(0);
  const [duration, setDuration]     = useState(0);
  const audioRef                    = useRef(null);

  const fmt = (s) => {
    if (!isFinite(s) || isNaN(s) || s < 0) return '--:--';
    return `${Math.floor(s / 60).toString().padStart(2, '0')}:${Math.floor(s % 60).toString().padStart(2, '0')}`;
  };

  const toggle = () => {
    const el = audioRef.current;
    if (!el) return;
    if (playing) { el.pause(); setPlaying(false); }
    else { el.play().catch(() => {}); setPlaying(true); }
  };

  const accent  = isOut ? 'rgba(255,255,255,0.85)' : '#FF7070';
  const trackBg = isOut ? 'rgba(255,255,255,0.25)' : 'rgba(183,12,0,0.25)';

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 200, maxWidth: 260 }}>
      <audio
        ref={audioRef}
        src={src}
        onLoadedMetadata={e => setDuration(e.target.duration || 0)}
        onTimeUpdate={e => setCurrent(e.target.currentTime)}
        onEnded={() => { setPlaying(false); setCurrent(0); if (audioRef.current) audioRef.current.currentTime = 0; }}
        preload="metadata"
      />
      {/* Play / Pause */}
      <button
        onClick={toggle}
        style={{ width: 32, height: 32, borderRadius: '50%', border: 'none', cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: isOut ? 'rgba(255,255,255,0.18)' : 'rgba(183,12,0,0.22)', color: accent, transition: 'background 150ms' }}
        title={playing ? 'Pausar' : 'Ouvir'}
      >
        {playing
          ? <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
          : <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
        }
      </button>
      {/* Seek + timer */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
        <input
          type="range" min={0} max={duration || 1} step={0.1} value={currentTime}
          onChange={e => { const t = Number(e.target.value); if (audioRef.current) audioRef.current.currentTime = t; setCurrent(t); }}
          style={{ width: '100%', height: 3, cursor: 'pointer', accentColor: accent, background: trackBg, borderRadius: 999, appearance: 'auto' }}
        />
        <span style={{ fontSize: 10, color: isOut ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.5)', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
          {fmt(playing ? currentTime : (duration || 0))}
        </span>
      </div>
      {/* Download */}
      {src && (
        <a
          href={src} download="audio.ogg"
          title="Baixar áudio"
          style={{ flexShrink: 0, width: 26, height: 26, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: accent, background: isOut ? 'rgba(255,255,255,0.1)' : 'rgba(183,12,0,0.15)', textDecoration: 'none', transition: 'background 150ms' }}
          onClick={e => e.stopPropagation()}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
        </a>
      )}
    </div>
  );
}

const URL_REGEX = /https?:\/\/[^\s<>"')\]]+|www\.[^\s<>"')\]]+/g;
function linkify(text) {
  if (!text) return null;
  const parts = [];
  let last = 0;
  let match;
  URL_REGEX.lastIndex = 0;
  while ((match = URL_REGEX.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    const url = match[0];
    const href = url.startsWith('http') ? url : `https://${url}`;
    parts.push(<a key={match.index} href={href} target="_blank" rel="noopener noreferrer" style={{ color: '#60A5FA', textDecoration: 'underline', wordBreak: 'break-all' }}>{url}</a>);
    last = match.index + url.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

// ─── QUOTED MESSAGE HELPERS ────────────────────────────────────
function extractQuotedText(q) {
  if (!q) return null;
  // Platform format (own reply state)
  if (typeof q.text === 'string') return q.text;
  // Evolution API formats
  const msg = q.message;
  if (!msg) return null;
  if (msg.conversation) return msg.conversation;
  if (msg.extendedTextMessage?.text) return msg.extendedTextMessage.text;
  if (msg.imageMessage) return msg.imageMessage.caption || '🖼 Imagem';
  if (msg.videoMessage) return msg.videoMessage.caption || '🎬 Vídeo';
  if (msg.audioMessage) return '🎵 Áudio';
  if (msg.documentMessage) return `📄 ${msg.documentMessage.fileName || 'Documento'}`;
  if (msg.stickerMessage) return '🔖 Sticker';
  return '📎 Mídia';
}
function extractQuotedSender(q, convName) {
  if (!q) return null;
  // Platform format
  if (q.agentName) return q.agentName;
  if (q.from === 'out') return 'Você';
  // Evolution API format
  if (q.key?.fromMe) return 'Você';
  return q.pushName || convName || 'Cliente';
}

// ─── DEPARTMENTS SCREEN ────────────────────────────────────────

const DEPT_COLORS = [
  '#B70C00','#EF4444','#F97316','#EAB308','#22C55E',
  '#14B8A6','#3B82F6','#8B5CF6','#EC4899','#6B7280',
];

function DepartmentsScreen({ tenantDbId, members }) {
  const [depts, setDepts]             = useState([]);
  const [loading, setLoading]         = useState(true);
  const [modal, setModal]             = useState(null);
  const [deptMembers, setDeptMembers] = useState({});
  const [expanded, setExpanded]       = useState(null);

  async function loadDepts() {
    if (!tenantDbId) return;
    const { data } = await supabase
      .from('departments')
      .select('id, name, color, is_active, created_at')
      .eq('tenant_id', tenantDbId)
      .order('name');
    setDepts(data ?? []);
    setLoading(false);
  }

  async function loadDeptMembers(deptId) {
    const { data } = await supabase
      .from('department_members')
      .select('user_id')
      .eq('department_id', deptId);
    setDeptMembers(prev => ({ ...prev, [deptId]: (data ?? []).map(r => r.user_id) }));
  }

  useEffect(() => { loadDepts(); }, [tenantDbId]);

  async function toggleActive(dept) {
    await supabase.from('departments').update({ is_active: !dept.is_active }).eq('id', dept.id);
    setDepts(prev => prev.map(d => d.id === dept.id ? { ...d, is_active: !d.is_active } : d));
  }

  async function deleteDept(dept) {
    if (!window.confirm(`Deletar "${dept.name}"? As conversas atribuídas perderão o departamento.`)) return;
    await supabase.from('departments').delete().eq('id', dept.id);
    setDepts(prev => prev.filter(d => d.id !== dept.id));
  }

  async function toggleMember(deptId, userId) {
    const current = deptMembers[deptId] ?? [];
    if (current.includes(userId)) {
      await supabase.from('department_members').delete().eq('department_id', deptId).eq('user_id', userId);
      setDeptMembers(prev => ({ ...prev, [deptId]: current.filter(id => id !== userId) }));
    } else {
      await supabase.from('department_members').insert({ department_id: deptId, user_id: userId });
      setDeptMembers(prev => ({ ...prev, [deptId]: [...current, userId] }));
    }
  }

  function openExpand(deptId) {
    if (expanded === deptId) { setExpanded(null); return; }
    setExpanded(deptId);
    if (!deptMembers[deptId]) loadDeptMembers(deptId);
  }

  const card = { background: '#1A1A1A', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, marginBottom: 10, overflow: 'hidden' };

  if (loading) return <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>Carregando…</div>;

  return (
    <div style={{ maxWidth: 700 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h2 style={{ color: 'white', fontSize: 18, fontWeight: 700, margin: 0 }}>Departamentos</h2>
          <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 12, marginTop: 4 }}>Organize conversas e defina quem atende cada fila.</p>
        </div>
        <button
          onClick={() => setModal({ mode: 'create' })}
          style={{ background: '#B70C00', color: 'white', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
        >+ Novo departamento</button>
      </div>

      {depts.length === 0 && (
        <div style={{ textAlign: 'center', padding: '48px 24px', color: 'rgba(255,255,255,0.3)', fontSize: 13 }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>🏢</div>
          Nenhum departamento criado ainda.<br/>Crie o primeiro para organizar seus atendimentos.
        </div>
      )}

      {depts.map(dept => (
        <div key={dept.id} style={card}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px' }}>
            <span style={{ width: 12, height: 12, borderRadius: '50%', background: dept.color, flexShrink: 0 }} />
            <span style={{ flex: 1, color: dept.is_active ? 'white' : 'rgba(255,255,255,0.35)', fontWeight: 600, fontSize: 14 }}>{dept.name}</span>
            {!dept.is_active && (
              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', background: 'rgba(255,255,255,0.06)', padding: '2px 8px', borderRadius: 99 }}>inativo</span>
            )}
            <button onClick={() => openExpand(dept.id)} style={{ background: expanded === dept.id ? 'rgba(255,255,255,0.08)' : 'none', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontSize: 11, padding: '4px 10px', borderRadius: 6 }}>
              👥 Membros {expanded === dept.id ? '▲' : '▼'}
            </button>
            <button onClick={() => setModal({ mode: 'edit', dept })} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: 11, padding: '4px 8px', borderRadius: 6 }}>Editar</button>
            <button onClick={() => toggleActive(dept)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.35)', cursor: 'pointer', fontSize: 11, padding: '4px 8px', borderRadius: 6 }}>{dept.is_active ? 'Desativar' : 'Ativar'}</button>
            <button onClick={() => deleteDept(dept)} style={{ background: 'none', border: 'none', color: 'rgba(183,12,0,0.7)', cursor: 'pointer', fontSize: 11, padding: '4px 8px', borderRadius: 6 }}>Deletar</button>
          </div>

          {expanded === dept.id && (
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', padding: '12px 18px 16px' }}>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 10 }}>
                Membros — clique para adicionar/remover
              </div>
              {(members ?? []).length === 0 && (
                <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12 }}>Nenhum membro encontrado.</div>
              )}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {(members ?? []).map(m => {
                  const inDept = (deptMembers[dept.id] ?? []).includes(m.id);
                  const label  = m.full_name || m.email || '?';
                  return (
                    <button
                      key={m.id}
                      onClick={() => toggleMember(dept.id, m.id)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        padding: '5px 10px', borderRadius: 20,
                        border: `1px solid ${inDept ? dept.color + '88' : 'rgba(255,255,255,0.1)'}`,
                        background: inDept ? dept.color + '22' : 'rgba(255,255,255,0.04)',
                        color: inDept ? 'white' : 'rgba(255,255,255,0.45)',
                        cursor: 'pointer', fontSize: 12, transition: 'all .15s',
                      }}
                    >
                      <span style={{ width: 20, height: 20, borderRadius: '50%', background: inDept ? dept.color : 'rgba(255,255,255,0.12)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, flexShrink: 0 }}>
                        {label[0].toUpperCase()}
                      </span>
                      {label}
                      {inDept && <span style={{ opacity: 0.6, fontSize: 10 }}>✓</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      ))}

      {modal && (
        <DeptModal
          mode={modal.mode}
          dept={modal.dept}
          tenantDbId={tenantDbId}
          onSave={() => { setModal(null); loadDepts(); }}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}

function DeptModal({ mode, dept, tenantDbId, onSave, onClose }) {
  const [name, setName]     = useState(dept?.name ?? '');
  const [color, setColor]   = useState(dept?.color ?? '#3B82F6');
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  async function save() {
    if (!name.trim()) { setError('Nome obrigatório'); return; }
    setSaving(true); setError('');
    try {
      if (mode === 'create') {
        const { error: err } = await supabase.from('departments').insert({ tenant_id: tenantDbId, name: name.trim(), color });
        if (err) { setError(err.message.includes('unique') ? 'Já existe um departamento com esse nome.' : err.message); setSaving(false); return; }
      } else {
        await supabase.from('departments').update({ name: name.trim(), color }).eq('id', dept.id);
      }
      onSave();
    } finally { setSaving(false); }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.72)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <div style={{ background: '#1F1F1F', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, width: 380, padding: 24 }} onClick={e => e.stopPropagation()}>
        <div style={{ color: 'white', fontWeight: 700, fontSize: 16, marginBottom: 20 }}>
          {mode === 'create' ? 'Novo departamento' : 'Editar departamento'}
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', display: 'block', marginBottom: 6, fontWeight: 600, textTransform: 'uppercase' }}>Nome</label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && save()}
            placeholder="ex: Suporte, Vendas, Financeiro…"
            autoFocus
            style={{ width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: 'white', padding: '9px 12px', fontSize: 13, boxSizing: 'border-box', outline: 'none' }}
          />
        </div>

        <div style={{ marginBottom: 20 }}>
          <label style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', display: 'block', marginBottom: 8, fontWeight: 600, textTransform: 'uppercase' }}>Cor</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {DEPT_COLORS.map(c => (
              <button key={c} onClick={() => setColor(c)} style={{ width: 28, height: 28, borderRadius: '50%', background: c, border: `3px solid ${color === c ? 'white' : 'transparent'}`, cursor: 'pointer', padding: 0, transition: 'border-color .12s' }} />
            ))}
          </div>
        </div>

        <div style={{ marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>Prévia:</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 99, fontSize: 12, fontWeight: 500, background: color + '22', color, border: `1px solid ${color}44` }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: color }} />
            {name || 'Nome do departamento'}
          </span>
        </div>

        {error && <div style={{ color: '#EF4444', fontSize: 12, marginBottom: 12 }}>{error}</div>}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.65)', border: 'none', borderRadius: 8, padding: '9px 18px', fontSize: 13, cursor: 'pointer' }}>Cancelar</button>
          <button onClick={save} disabled={saving} style={{ background: '#B70C00', color: 'white', border: 'none', borderRadius: 8, padding: '9px 18px', fontSize: 13, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
            {saving ? 'Salvando…' : mode === 'create' ? 'Criar' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── BOTS SCREEN ───────────────────────────────────────────────
const DAYS_CFG = [
  { key: 'mon', label: 'Segunda' },
  { key: 'tue', label: 'Terça'   },
  { key: 'wed', label: 'Quarta'  },
  { key: 'thu', label: 'Quinta'  },
  { key: 'fri', label: 'Sexta'   },
  { key: 'sat', label: 'Sábado'  },
  { key: 'sun', label: 'Domingo' },
];

const DEFAULT_SCHEDULE = {
  mon: { on: true,  start: '09:00', end: '18:00' },
  tue: { on: true,  start: '09:00', end: '18:00' },
  wed: { on: true,  start: '09:00', end: '18:00' },
  thu: { on: true,  start: '09:00', end: '18:00' },
  fri: { on: true,  start: '09:00', end: '18:00' },
  sat: { on: false, start: '09:00', end: '13:00' },
  sun: { on: false, start: '09:00', end: '13:00' },
};

function Toggle({ value, onChange, size = 'md' }) {
  const w = size === 'sm' ? 32 : 44;
  const h = size === 'sm' ? 18 : 24;
  const dot = size === 'sm' ? 14 : 18;
  const pad = size === 'sm' ? 2 : 3;
  return (
    <button
      onClick={() => onChange(!value)}
      style={{ width: w, height: h, borderRadius: h / 2, background: value ? '#B70C00' : 'rgba(255,255,255,0.12)', border: 'none', cursor: 'pointer', position: 'relative', transition: 'background .18s', flexShrink: 0 }}
    >
      <span style={{ position: 'absolute', top: pad, left: value ? w - dot - pad : pad, width: dot, height: dot, borderRadius: '50%', background: 'white', transition: 'left .18s', display: 'block' }} />
    </button>
  );
}

function BotsScreen({ tenantDbId }) {
  const [isActive, setIsActive]               = useState(false);
  const [schedule, setSchedule]               = useState(DEFAULT_SCHEDULE);
  const [message, setMessage]                 = useState('Olá! No momento estamos fora do horário de atendimento. Em breve um consultor irá te atender. 🚀');
  const [respondOnlyFirst, setRespondOnlyFirst] = useState(true);
  const [saving, setSaving]                   = useState(false);
  const [savedOk, setSavedOk]                 = useState(false);
  const [loading, setLoading]                 = useState(true);

  useEffect(() => {
    if (!tenantDbId) return;
    supabase.from('bot_configs').select('*').eq('tenant_id', tenantDbId).maybeSingle()
      .then(({ data }) => {
        setLoading(false);
        if (!data) return;
        setIsActive(data.is_active ?? false);
        setSchedule(data.schedule ?? DEFAULT_SCHEDULE);
        setMessage(data.message ?? '');
        setRespondOnlyFirst(data.respond_only_first ?? true);
      });
  }, [tenantDbId]);

  function setDay(key, field, value) {
    setSchedule(prev => ({ ...prev, [key]: { ...prev[key], [field]: value } }));
  }

  async function save() {
    if (!tenantDbId || saving) return;
    setSaving(true);
    try {
      await supabase.from('bot_configs').upsert({
        tenant_id:          tenantDbId,
        is_active:          isActive,
        schedule,
        message,
        respond_only_first: respondOnlyFirst,
        updated_at:         new Date().toISOString(),
      }, { onConflict: 'tenant_id' });
      setSavedOk(true);
      setTimeout(() => setSavedOk(false), 2500);
    } finally {
      setSaving(false);
    }
  }

  const card = { background: '#1A1A1A', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '16px 20px', marginBottom: 14 };

  if (loading) return <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>Carregando…</div>;

  return (
    <div style={{ maxWidth: 640 }}>
      <div style={{ marginBottom: 28 }}>
        <h2 style={{ color: 'white', fontSize: 18, fontWeight: 700, margin: 0 }}>Bots de Atendimento</h2>
        <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 12, marginTop: 4 }}>Resposta automática fora do horário de atendimento via WhatsApp.</p>
      </div>

      {/* Ativo/inativo */}
      <div style={{ ...card, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ color: 'white', fontWeight: 600, fontSize: 13 }}>Resposta automática</div>
          <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, marginTop: 3 }}>Quando ativo, responde automaticamente mensagens recebidas fora do horário</div>
        </div>
        <Toggle value={isActive} onChange={setIsActive} />
      </div>

      {/* Horários */}
      <div style={card}>
        <div style={{ color: 'white', fontWeight: 600, fontSize: 13, marginBottom: 14 }}>Horário de atendimento</div>
        {DAYS_CFG.map(d => (
          <div key={d.key} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <Toggle value={!!schedule[d.key]?.on} onChange={v => setDay(d.key, 'on', v)} size="sm" />
            <span style={{ width: 68, color: schedule[d.key]?.on ? 'white' : 'rgba(255,255,255,0.3)', fontSize: 12, fontWeight: 500 }}>{d.label}</span>
            {schedule[d.key]?.on ? (
              <>
                <input
                  type="time"
                  value={schedule[d.key]?.start || '09:00'}
                  onChange={e => setDay(d.key, 'start', e.target.value)}
                  style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: 'white', padding: '3px 8px', fontSize: 12, colorScheme: 'dark' }}
                />
                <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 11 }}>até</span>
                <input
                  type="time"
                  value={schedule[d.key]?.end || '18:00'}
                  onChange={e => setDay(d.key, 'end', e.target.value)}
                  style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: 'white', padding: '3px 8px', fontSize: 12, colorScheme: 'dark' }}
                />
              </>
            ) : (
              <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: 12 }}>Fechado</span>
            )}
          </div>
        ))}
      </div>

      {/* Mensagem */}
      <div style={card}>
        <div style={{ color: 'white', fontWeight: 600, fontSize: 13, marginBottom: 10 }}>Mensagem automática</div>
        <textarea
          value={message}
          onChange={e => setMessage(e.target.value)}
          rows={4}
          style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: 'white', padding: '10px 12px', fontSize: 13, resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box', outline: 'none' }}
          placeholder="Mensagem enviada ao cliente fora do horário de atendimento…"
        />
        <div style={{ marginTop: 6, fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>{message.length} caracteres</div>
      </div>

      {/* Opção: responder só uma vez */}
      <div style={{ ...card, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ color: 'white', fontWeight: 600, fontSize: 13 }}>Responder apenas uma vez por conversa/dia</div>
          <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, marginTop: 3 }}>Evita spam — envia apenas na primeira mensagem fora do horário</div>
        </div>
        <Toggle value={respondOnlyFirst} onChange={setRespondOnlyFirst} />
      </div>

      <button
        onClick={save}
        disabled={saving}
        style={{ background: savedOk ? '#25D366' : '#B70C00', color: 'white', border: 'none', borderRadius: 8, padding: '10px 28px', fontSize: 13, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.75 : 1, transition: 'background .2s' }}
      >
        {savedOk ? '✓ Salvo!' : saving ? 'Salvando…' : 'Salvar configurações'}
      </button>
    </div>
  );
}

// ─── AI SIDE PANEL ─────────────────────────────────────────────
const AI_QUICK = [
  { icon: '📋', label: 'Resumir conversa',    cmd: '/resumir' },
  { icon: '🌐', label: 'Traduzir mensagens',  cmd: '/traduzir' },
  { icon: '🎯', label: 'Sugerir próxima ação', cmd: '/proxima' },
  { icon: '💰', label: 'Analisar cobrança',   cmd: '/cobranca' },
  { icon: '🎭', label: 'Analisar tom',         cmd: '/tom' },
];

function AiSidePanel({ onClose, onRunCmd, convName, msgs }) {
  const [input, setInput]     = useState('');
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState([]);
  const bottomRef = useRef(null);
  const inputRef  = useRef(null);
  const BRIDGE_URL = import.meta.env.VITE_BRIDGE_URL || '';

  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [history]);

  async function send(text) {
    if (!text.trim() || loading) return;
    const userMsg = text.trim();
    setInput('');
    setHistory(h => [...h, { role: 'user', text: userMsg }]);
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const jwt = session?.access_token;
      const r = await fetch(`${BRIDGE_URL}/chat/ai`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
        body: JSON.stringify({ command: '/livre', prompt: userMsg, messages: (msgs || []).slice(-20) }),
      });
      const data = await r.json();
      const reply = data.ok
        ? (data.body || (data.bullets || []).join('\n') || data.title || 'Pronto.')
        : (data.error || 'Ocorreu um erro. Tente novamente.');
      setHistory(h => [...h, { role: 'ai', text: reply }]);
    } catch (err) {
      setHistory(h => [...h, { role: 'ai', text: `Erro de conexão: ${err.message}` }]);
    }
    setLoading(false);
  }

  function handleQuick(item) {
    if (loading) return;
    setHistory(h => [...h, { role: 'user', text: item.label }]);
    setLoading(true);
    onRunCmd(item.cmd, (title, body) => {
      setHistory(h => [...h, { role: 'ai', text: [title, ...(body || [])].filter(Boolean).join('\n\n') }]);
      setLoading(false);
    });
  }

  const isEmpty = history.length === 0;

  return (
    <div style={{
      position: 'absolute', top: 0, right: 0, bottom: 0, width: 340,
      background: '#141414', borderLeft: '1px solid rgba(255,255,255,0.08)',
      display: 'flex', flexDirection: 'column', zIndex: 40,
      animation: 'slideInRight .2s ease',
    }}>
      {/* Header */}
      <div style={{ padding: '14px 16px 12px', borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'linear-gradient(135deg,#B70C00,#FF4D3D)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>🚀</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'white' }}>DELI — IA Copiloto</div>
          <div style={{ fontSize: 11, color: loading ? '#FF4D3D' : 'rgba(255,255,255,0.4)', display: 'flex', alignItems: 'center', gap: 5, transition: 'color .2s' }}>
            {loading ? (
              <>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#FF4D3D', display: 'inline-block', animation: 'bounce .7s 0s ease-in-out infinite' }} />
                Gerando resposta…
              </>
            ) : 'Consult Delivery'}
          </div>
        </div>
        <button onClick={onClose} style={{ color: 'rgba(255,255,255,0.4)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: 4 }}>×</button>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 14px 8px' }} className="dark-scroll">
        {isEmpty && (
          <>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.75)', lineHeight: 1.55, marginBottom: 20 }}>
              Olá! Sou a DELI, sua IA copiloto da Consult Delivery.<br/>
              {convName ? <>Estou analisando a conversa com <strong style={{ color: 'white' }}>{convName}</strong>.</> : 'Como posso ajudar?'}
            </div>

            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 8 }}>Ações rápidas</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {AI_QUICK.map(item => (
                <button
                  key={item.cmd}
                  onClick={() => handleQuick(item)}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '9px 12px', cursor: 'pointer', color: 'white', fontSize: 12, textAlign: 'left', transition: 'background .15s' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(183,12,0,0.15)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                >
                  <span style={{ fontSize: 16 }}>{item.icon}</span>
                  <span>{item.label}</span>
                  <svg style={{ marginLeft: 'auto', opacity: .4 }} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
                </button>
              ))}
            </div>
          </>
        )}

        {history.map((m, i) => (
          <div key={i} style={{ marginBottom: 14, display: 'flex', flexDirection: 'column', alignItems: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
            {m.role === 'ai' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <div style={{ width: 18, height: 18, borderRadius: '50%', background: 'linear-gradient(135deg,#B70C00,#FF4D3D)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10 }}>🚀</div>
                <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', fontWeight: 600 }}>DELI</span>
              </div>
            )}
            <div style={{
              maxWidth: '88%', padding: '8px 12px', borderRadius: m.role === 'user' ? '12px 12px 2px 12px' : '2px 12px 12px 12px',
              background: m.role === 'user' ? 'rgba(183,12,0,0.25)' : 'rgba(255,255,255,0.07)',
              border: `1px solid ${m.role === 'user' ? 'rgba(183,12,0,0.4)' : 'rgba(255,255,255,0.08)'}`,
              fontSize: 12, color: 'rgba(255,255,255,0.88)', lineHeight: 1.6, whiteSpace: 'pre-wrap',
            }}>{m.text}</div>
          </div>
        ))}

        {loading && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0' }}>
            <div style={{ width: 18, height: 18, borderRadius: '50%', background: 'linear-gradient(135deg,#B70C00,#FF4D3D)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10 }}>🚀</div>
            <div style={{ display: 'flex', gap: 4 }}>
              {[0,1,2].map(i => <span key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: '#B70C00', opacity: .7, animation: `bounce .8s ${i*.15}s ease-in-out infinite` }} />)}
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{ padding: '10px 12px 12px', borderTop: '1px solid rgba(255,255,255,0.07)' }}>
        <div style={{ display: 'flex', gap: 8, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, padding: '8px 10px', alignItems: 'flex-end' }}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input); } }}
            placeholder="Pergunte qualquer coisa à DELI…"
            rows={1}
            style={{ flex: 1, background: 'none', border: 'none', outline: 'none', color: 'white', fontSize: 12, resize: 'none', fontFamily: 'inherit', lineHeight: 1.5, maxHeight: 80, overflowY: 'auto' }}
          />
          <button
            onClick={() => send(input)}
            disabled={!input.trim() || loading}
            style={{ width: 28, height: 28, borderRadius: 8, background: input.trim() ? '#B70C00' : 'rgba(255,255,255,0.08)', border: 'none', cursor: input.trim() ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'background .15s' }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
          </button>
        </div>
        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', marginTop: 6, textAlign: 'center' }}>
          Enter para enviar · Shift+Enter nova linha
        </div>
      </div>
    </div>
  );
}

// ─── FORWARD MODAL ─────────────────────────────────────────────
function ForwardModal({ msg, convs, currentConvId, onClose, onForward }) {
  const [search, setSearch] = useState('');
  const targets = convs.filter(c =>
    c.id !== currentConvId &&
    (c.type === 'whatsapp' || c.type === 'group') &&
    c.whatsapp_chat_id &&
    (!search || c.name.toLowerCase().includes(search.toLowerCase()))
  );
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <div style={{ background: '#1F1F1F', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, width: 360, maxHeight: 520, display: 'flex', flexDirection: 'column', overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: '14px 16px 10px', borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ color: 'white', fontWeight: 700, fontSize: 14 }}>Encaminhar para…</span>
          <button onClick={onClose} style={{ color: 'rgba(255,255,255,0.5)', fontSize: 18, lineHeight: 1 }}>×</button>
        </div>
        <div style={{ padding: '10px 14px 6px' }}>
          <input
            autoFocus value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar conversa…"
            style={{ width: '100%', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '7px 12px', color: 'white', fontSize: 13, outline: 'none' }}
          />
        </div>
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {targets.length === 0 && (
            <div style={{ textAlign: 'center', padding: 24, color: 'rgba(255,255,255,0.35)', fontSize: 12 }}>Nenhuma conversa encontrada</div>
          )}
          {targets.map(c => (
            <button key={c.id} onClick={() => onForward(c)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '9px 16px', background: 'none', borderBottom: '1px solid rgba(255,255,255,0.04)', cursor: 'pointer', textAlign: 'left' }}>
              <ConvAvatar conv={c} size={32} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: 'white', fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</div>
                <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>{c.preview || '—'}</div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── MESSAGE BUBBLE ────────────────────────────────────────────
function MsgBubble({ m, conv, onReply, onCreateTask, onViewImage, starred, onStar, onDelete, onResumirMsg, onTraduzirMsg, onForward }) {
  const isOut = m.from === 'out';
  const isSystem = m.from === 'system';

  if (isSystem) {
    return (
      <div className="lc-system">{m.text}</div>
    );
  }

  function renderMedia() {
    if (!m.mediaType) return null;
    const url = m.mediaUrl;
    if (m.mediaType === 'image') {
      return (
        <div style={{ position: 'relative', display: 'inline-block', marginBottom: m.text ? 6 : 0 }} className="lc-media-wrap">
          <img src={url} alt="imagem" style={{ maxWidth: 260, maxHeight: 200, borderRadius: 8, cursor: 'pointer', display: 'block' }} onClick={() => onViewImage?.(url)} />
          {url && (
            <a
              href={url} download
              title="Baixar imagem"
              onClick={e => e.stopPropagation()}
              className="lc-media-dl"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
            </a>
          )}
        </div>
      );
    }
    if (m.mediaType === 'video') {
      return (
        <div style={{ marginBottom: m.text ? 6 : 0 }}>
          <video src={url} controls style={{ maxWidth: 260, borderRadius: 8, display: 'block' }} />
          {url && (
            <a
              href={url} download
              title="Baixar vídeo"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 5, fontSize: 11, color: isOut ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.5)', textDecoration: 'none' }}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              Baixar vídeo
            </a>
          )}
        </div>
      );
    }
    if (m.mediaType?.includes('audio')) {
      return <AudioPlayer src={url} isOut={isOut} />;
    }
    if (m.mediaType === 'document') {
      return (
        <a href={url} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'white', textDecoration: 'none', padding: '8px 10px', background: 'rgba(255,255,255,0.08)', borderRadius: 8, fontSize: 12 }}>
          <span>📄</span> {m.text || 'Documento'}
        </a>
      );
    }
    return null;
  }

  return (
    <div className={`lc-msg-row ${isOut ? 'out' : 'in'} slide-up`}>
      {!isOut && <ConvAvatar conv={conv} size={28} />}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: isOut ? 'flex-end' : 'flex-start', maxWidth: '72%' }}>
        {m.agentName && (
          <div style={{ fontSize: 11, color: isOut ? 'rgba(255,255,255,0.55)' : '#B70C00', fontWeight: 700, marginBottom: 4, marginLeft: isOut ? 0 : 4, marginRight: isOut ? 4 : 0 }}>
            {m.agentName} <span style={{ color: 'rgba(255,255,255,0.4)', fontWeight: 500, marginLeft: 6 }}>· {m.time}</span>
          </div>
        )}
        {m.replyTo && (
          <div style={{ marginBottom: 4, padding: '5px 10px', borderLeft: '3px solid rgba(255,255,255,0.3)', background: 'rgba(255,255,255,0.05)', borderRadius: '0 6px 6px 0', fontSize: 11, maxWidth: 260, overflow: 'hidden' }}>
            <div style={{ color: 'rgba(255,255,255,0.75)', fontWeight: 600, marginBottom: 1, whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
              {extractQuotedSender(m.replyTo, conv?.name)}
            </div>
            <div style={{ color: 'rgba(255,255,255,0.55)', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
              {extractQuotedText(m.replyTo) || '📎 Mídia'}
            </div>
          </div>
        )}
        <div className={`lc-bubble ${isOut ? 'out' : 'in'}`}>
          {renderMedia()}
          {m.text && !m.mediaType?.includes('document') && (
            <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{linkify(m.text)}</div>
          )}
        </div>
        {!isOut && (
          <div className="lc-bubble-actions">
            <button title="Responder" onClick={() => onReply?.(m)}><Icon name="msg" size={11} /></button>
            <button title="Encaminhar" onClick={() => onForward?.(m)}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 17 20 12 15 7"/><path d="M4 18v-2a4 4 0 0 1 4-4h12"/></svg>
            </button>
            <button title="Traduzir" onClick={() => onTraduzirMsg?.(m)}><Icon name="globe" size={11} /></button>
            <button title="Virar tarefa" onClick={() => onCreateTask?.(m)}><Icon name="check" size={11} /></button>
            <button title="Resumir conversa" onClick={() => onResumirMsg?.(m)}><Icon name="sparkles" size={11} /></button>
            <button title="Apagar mensagem" onClick={() => onDelete?.(m)} style={{ color: 'rgba(239,68,68,0.7)' }}>
              <Icon name="trash" size={11} />
            </button>
            <button
              className={`lc-star-msg-btn${starred ? ' starred' : ''}`}
              title={starred ? 'Remover dos favoritos' : 'Favoritar mensagem'}
              onClick={() => onStar?.()}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill={starred ? '#FBBF24' : 'none'} stroke={starred ? '#FBBF24' : 'currentColor'} strokeWidth="2">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
              </svg>
            </button>
          </div>
        )}
        {isOut && (
          <>
            <div className="lc-bubble-actions out">
              <button title="Encaminhar" onClick={() => onForward?.(m)}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 17 20 12 15 7"/><path d="M4 18v-2a4 4 0 0 1 4-4h12"/></svg>
              </button>
              <button
                className={`lc-star-msg-btn${starred ? ' starred' : ''}`}
                title={starred ? 'Remover dos favoritos' : 'Favoritar mensagem'}
                onClick={() => onStar?.()}
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill={starred ? '#FBBF24' : 'none'} stroke={starred ? '#FBBF24' : 'currentColor'} strokeWidth="2">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                </svg>
              </button>
              <button title="Apagar mensagem" onClick={() => onDelete?.(m)} style={{ color: 'rgba(239,68,68,0.7)' }}>
                <Icon name="trash" size={11} />
              </button>
            </div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginTop: 3, marginRight: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
              {starred && (
                <svg width="10" height="10" viewBox="0 0 24 24" fill="#FBBF24" stroke="#FBBF24" strokeWidth="1.5">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                </svg>
              )}
              {m.time}
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#34D399" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── IMAGE LIGHTBOX ────────────────────────────────────────────
function ImageLightbox({ url, onClose }) {
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0, ox: 0, oy: 0 });

  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  function onWheel(e) { e.preventDefault(); setScale(s => Math.min(8, Math.max(1, s - e.deltaY * 0.001))); }
  function onMouseDown(e) { if (scale <= 1) return; dragging.current = true; dragStart.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y }; }
  function onMouseMove(e) { if (!dragging.current) return; setOffset({ x: dragStart.current.ox + (e.clientX - dragStart.current.x), y: dragStart.current.oy + (e.clientY - dragStart.current.y) }); }
  function onMouseUp() { dragging.current = false; }

  return (
    <div onClick={e => { if (e.target === e.currentTarget) onClose(); }} onWheel={onWheel} onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseUp} style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.88)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: scale > 1 ? 'grab' : 'zoom-in', userSelect: 'none' }}>
      <img src={url} alt="preview" draggable={false} style={{ maxWidth: '90vw', maxHeight: '90vh', transform: `scale(${scale}) translate(${offset.x / scale}px, ${offset.y / scale}px)`, transformOrigin: 'center', transition: dragging.current ? 'none' : 'transform 120ms ease', borderRadius: 4, boxShadow: '0 8px 40px rgba(0,0,0,0.6)', pointerEvents: 'none' }} />
      <button onClick={onClose} style={{ position: 'fixed', top: 16, right: 16, background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', borderRadius: '50%', width: 36, height: 36, fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// CHAT SCREEN — componente principal
// ═══════════════════════════════════════════════════════════════
export default function ChatScreen({ tenant, tenantDbId, onNavigate }) {
  // ── Dados e instâncias ────────────────────────────────────
  const [instances, setInstances]            = useState([]);
  const [selectedInstance, setSelectedInstance] = useState(null);
  const [convs, setConvs]                    = useState([]);
  const [usingRealData, setUsingRealData]    = useState(false);
  const [members, setMembers]                = useState([]);
  const [currentUser, setCurrentUser]        = useState(null);
  const [departments, setDepartments]        = useState([]);
  const [activeCustomer, setActiveCustomer]  = useState(null);

  // ── UI state ──────────────────────────────────────────────
  const [activeId, setActiveId]              = useState(null);
  const [headerTab, setHeaderTab]            = useState('inbox');
  const [search, setSearch]                  = useState('');
  const [statusFilter, setStatusFilter]      = useState(null);
  const [statusTab, setStatusTab]            = useState('aberto');
  const [tab, setTab]                        = useState('all');
  const [filters, setFilters]                = useState({ department: null, tag: null, status: null });
  const [taggedCustomerIds, setTaggedCustomerIds] = useState(null);
  const [refreshing, setRefreshing]          = useState(false);
  const [favConvs, setFavConvs]              = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem('cd-fav-convs') || '[]')); } catch { return new Set(); }
  });
  const [starredMsgs, setStarredMsgs]        = useState(() => {
    try { return JSON.parse(localStorage.getItem('cd-starred-msgs') || '{}'); } catch { return {}; }
  });
  const [showStarredPanel, setShowStarredPanel] = useState(false);
  const [mobilePane, setMobilePane]            = useState('list'); // 'list' | 'chat'
  const [selectMode, setSelectMode]            = useState(false);
  const [selectedConvIds, setSelectedConvIds]  = useState(new Set());
  const [bulkLoading, setBulkLoading]          = useState(false);
  const [showAiPanel, setShowAiPanel]          = useState(false);

  // ── BRENO ─────────────────────────────────────────────────
  const [brenoSuggestion, setBrenoSuggestion] = useState(null);

  // ── Mensagens ─────────────────────────────────────────────
  const [messages, setMessages]              = useState({});
  const [typing, setTyping]                  = useState(false);
  const [draft, setDraft]                    = useState('');
  const [sending, setSending]                = useState(false);
  const [replyTo, setReplyTo]                = useState(null);
  const [lightboxUrl, setLightboxUrl]        = useState(null);
  const [forwardMsg, setForwardMsg]          = useState(null);

  // ── AI / Composer ─────────────────────────────────────────
  const [aiMode, setAiMode]                  = useState('humano');
  const [showCopilot, setShowCopilot]        = useState(true);
  const [showInspector, setShowInspector]    = useState(false);
  const [showSlash, setShowSlash]            = useState(false);
  const [showMention, setShowMention]        = useState(false);
  const [showQR, setShowQR]                  = useState(false);
  const [showEmoji, setShowEmoji]            = useState(false);
  const [aiAction, setAiAction]              = useState(null);
  const [resolved, setResolved]              = useState({});

  // ── Canais internos ───────────────────────────────────────
  const [chanMsgs, setChanMsgs]              = useState({});
  const [chanDraft, setChanDraft]            = useState('');

  // ── Respostas rápidas ─────────────────────────────────────
  const [quickReplies, setQuickReplies]      = useState([]);

  // ── Paste de imagem ──────────────────────────────────────
  const [pasteImage, setPasteImage]          = useState(null); // { file, previewUrl }
  const [pasteCaption, setPasteCaption]      = useState('');
  const pasteCaptionRef                       = useRef(null);

  // ── Gravação de áudio ─────────────────────────────────────
  const [recState, setRecState]              = useState('idle'); // 'idle' | 'recording' | 'preview'
  const [recSeconds, setRecSeconds]          = useState(0);
  const [audioPreview, setAudioPreview]      = useState(null); // object URL para o player
  const [recPlaying, setRecPlaying]          = useState(false);
  const [recDuration, setRecDuration]        = useState(0);
  const [recCurrentTime, setRecCurrentTime]  = useState(0);
  const mediaRecorderRef                      = useRef(null);
  const audioChunksRef                        = useRef([]);
  const recTimerRef                           = useRef(null);
  const audioBlobRef                          = useRef(null);
  const audioElRef                            = useRef(null);

  // ── Painel direito collapse ────────────────────────────────
  const [openPerfil, setOpenPerfil]          = useState(true);
  const [openIA, setOpenIA]                  = useState(true);
  const [openNotas, setOpenNotas]            = useState(false);
  const [openEndereco, setOpenEndereco]      = useState(false);
  const [openDados, setOpenDados]            = useState(false);
  const [openIfood, setOpenIfood]            = useState(false);

  // ── Refs ──────────────────────────────────────────────────
  const scrollRef          = useRef(null);
  const lastScrolledConv   = useRef(null);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const textareaRef    = useRef(null);
  const chanScrollRef  = useRef(null);
  const activeIdRef            = useRef(activeId);
  const photoCacheRef          = useRef({});
  const convsRef               = useRef(convs);
  const persistingRef          = useRef(new Set());
  const aiModeRef              = useRef('humano');
  const selectedInstanceRef    = useRef(null);
  const iaPendingRef           = useRef(new Set());
  const hibridoPendingRef      = useRef(new Set());
  const fileInputRef   = useRef(null);
  const galleryInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  useEffect(() => { activeIdRef.current = activeId; }, [activeId]);
  useEffect(() => { convsRef.current = convs; }, [convs]);
  useEffect(() => { aiModeRef.current = aiMode; }, [aiMode]);
  useEffect(() => { selectedInstanceRef.current = selectedInstance; }, [selectedInstance]);

  // ── Status de atendimento ─────────────────────────────────
  const { status: convStatus, loading: statusLoading, refresh: refreshStatus, changeStatus, finish } = useConversationStatus(activeId, tenantDbId, currentUser?.id);

  // ── CONTAGENS para badges de status ────────────────────────
  const statusCounts = useMemo(() => ({
    nao_iniciado: convs.filter(c => (c.status || 'aguardando') === 'aguardando').length,
    aguardando:   convs.filter(c => c.status === 'em_atendimento' || (c.status === 'atendimento_aberto' && c.previewFrom === 'in')).length,
    aberto:       convs.filter(c => c.status === 'atendimento_aberto').length,
    automacao:    convs.filter(c => c.status === 'automacao').length,
    finalizado:   convs.filter(c => c.status === 'finalizado').length,
    falha:        convs.filter(c => c.status === 'falha').length,
    oculto:       convs.filter(c => c.status === 'archived').length,
  }), [convs]);

  const COUNTS = useMemo(() => [
    { id: 'nao_iniciado', icon: 'inbox', value: statusCounts.nao_iniciado, label: 'Não iniciados' },
    { id: 'aguardando',   icon: 'clock', value: statusCounts.aguardando,   label: 'Aguardando' },
    { id: 'aberto',       icon: 'msg',   value: statusCounts.aberto,       label: 'Em aberto' },
    { id: 'automacao',    icon: 'bot',   value: statusCounts.automacao,    label: 'Automações' },
    { id: 'finalizado',   icon: 'check', value: statusCounts.finalizado,   label: 'Finalizadas' },
    { id: 'falha',        icon: 'alert', value: statusCounts.falha,        label: 'Falha' },
    { id: 'oculto',       icon: 'arch',  value: statusCounts.oculto,       label: 'Ocultas' },
  ], [statusCounts]);

  // ── Document title badge ──────────────────────────────────
  useEffect(() => {
    const pending = statusCounts.nao_iniciado + statusCounts.falha;
    document.title = pending > 0 ? `(${pending}) Consult Delivery` : 'Consult Delivery';
    return () => { document.title = 'Consult Delivery'; };
  }, [statusCounts.nao_iniciado, statusCounts.falha]);

  // ── EFFECTS DE INICIALIZAÇÃO ───────────────────────────────
  useEffect(() => {
    loadInstances();
    loadMembers();
    loadCurrentUser();
    loadQuickReplies();
  }, []);

  useEffect(() => {
    loadWAGroups();
    loadInternalChannels();
    loadQuickReplies();
    if (tenantDbId) {
      supabase.from('departments').select('id, name, color').eq('tenant_id', tenantDbId).eq('is_active', true).order('name')
        .then(({ data }) => setDepartments(data ?? []));
    }
  }, [tenant, tenantDbId]);

  useEffect(() => {
    if (!filters?.tag) { setTaggedCustomerIds(null); return; }
    supabase.from('customer_tags').select('customer_id').eq('tag_id', filters.tag)
      .then(({ data }) => setTaggedCustomerIds(data ? new Set(data.map(r => r.customer_id)) : new Set()));
  }, [filters?.tag]);

  useEffect(() => {
    refreshStatus();
    setReplyTo(null);
    setBrenoSuggestion(null);
    if (!activeId || !tenantDbId) return;
    supabase
      .from('breno_interactions')
      .select('id, breno_response, action_taken, created_at')
      .eq('conversation_id', activeId)
      .eq('requires_review', true)
      .eq('action_taken', 'suggested')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => { if (data) setBrenoSuggestion(data); });
  }, [activeId, refreshStatus, tenantDbId]);

  useEffect(() => {
    const conv = convsRef.current.find(c => c.id === activeId);
    if (!conv?.customer_id) { setActiveCustomer(null); return; }
    supabase.from('customers').select('id, name, phone, email, document, created_at').eq('id', conv.customer_id).maybeSingle()
      .then(({ data }) => setActiveCustomer(data ?? null));
  }, [activeId]);

  // Fetch foto/nome WhatsApp
  useEffect(() => {
    if (!HAS_EVO || !selectedInstance || !activeId) return;
    const conv = convsRef.current.find(c => c.id === activeId);
    if (!conv?.whatsapp_chat_id) return;
    if (conv.type !== 'whatsapp' && conv.type !== 'group') return;
    const phone = conv.whatsapp_chat_id.split('@')[0];
    if (!phone) return;
    const cached = photoCacheRef.current[phone];
    if (cached === false) return;
    function applyProfile(waName, photoUrl) {
      setConvs(prev => prev.map(c => {
        if (c.id !== activeId) return c;
        const name = waName || c.name;
        return {
          ...c,
          name,
          avatar: name.slice(0, 2).toUpperCase(),
          photoUrl: photoUrl || c.photoUrl || null,
          waNameFetched: waName ? true : c.waNameFetched,
        };
      }));
    }
    if (cached !== undefined) { applyProfile(cached.waName, cached.photoUrl); return; }
    fetchProfile(selectedInstance, phone).then(data => {
      const photoUrl = data?.picture || data?.profilePictureUrl || data?.photo || null;
      const waName   = data?.name || data?.pushName || data?.verifiedName || null;
      photoCacheRef.current[phone] = { photoUrl, waName };
      applyProfile(waName, photoUrl);
      const dbUpdate = {};
      if (waName)   dbUpdate.push_name      = waName;
      if (photoUrl) dbUpdate.push_photo_url = photoUrl;
      if (Object.keys(dbUpdate).length) {
        supabase.from('conversations').update(dbUpdate).eq('id', activeId).catch(() => {});
      }
    }).catch(() => { photoCacheRef.current[phone] = false; });
  }, [activeId, selectedInstance]);

  // Reset ao trocar tenant
  useEffect(() => {
    setConvs([]); setActiveId(null); setMessages({}); setDraft('');
    setUsingRealData(false); setSelectedInstance(null);
  }, [tenant]);

  useEffect(() => {
    if (selectedInstance) {
      loadRealtimeConvs(selectedInstance)
        .then(() => loadWAGroups())
        .then(() => enrichConvsWithWAData(selectedInstance));
    } else {
      setConvs(prev => prev.filter(c => c.id.startsWith('wag-') || c.id.startsWith('chan-')));
      setUsingRealData(false);
    }
  }, [selectedInstance]);

  // Realtime global de mensagens
  useEffect(() => {
    if (!selectedInstance) return;
    const channel = supabase
      .channel('global-messages-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, payload => {
        const msg = payload.new;
        const text = msg.content || msg.body || '';
        if (!text && !msg.media_url && !msg.media_type) return;
        const convId    = msg.conversation_id;
        const isInbound = msg.direction !== 'outbound';
        const time      = new Date(msg.created_at || Date.now()).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        const isActive  = convId === activeIdRef.current;
        const mediaType = msg.media_type || null;
        const preview   = text || (mediaType === 'image' ? '🖼 Imagem' : mediaType === 'video' ? '🎬 Vídeo' : mediaType === 'document' ? '📄 Documento' : mediaType?.includes('audio') ? '🎵 Áudio' : '');
        setMessages(m => {
          const convMsgs = m[convId] || [];
          if (convMsgs.some(ex => ex.id === msg.id)) return m;
          if (!isInbound) {
            const tmpIdx = convMsgs.findIndex(ex =>
              ex.id?.startsWith('tmp-') &&
              ex.from === 'out' &&
              (mediaType ? ex.mediaType === mediaType : ex.text === text)
            );
            if (tmpIdx !== -1) return { ...m, [convId]: convMsgs.map((ex, i) => i === tmpIdx ? { ...ex, id: msg.id, _ts: msg.created_at || ex._ts } : ex) };
          }
          return { ...m, [convId]: [...convMsgs, { id: msg.id, from: isInbound ? 'in' : 'out', text, time, _ts: msg.created_at || new Date().toISOString(), mediaType, mediaUrl: msg.media_url || null, agentName: msg.sender_name || null, waMsgId: msg.whatsapp_msg_id || null, replyTo: msg.quoted_content || null }] };
        });
        setConvs(prev => {
          const idx = prev.findIndex(c => c.id === convId);
          if (idx === -1) {
            supabase.from('conversations').select('*').eq('id', convId).single().then(({ data: conv }) => {
              if (!conv) return;
              const phone = conv.whatsapp_chat_id?.split('@')[0] || '';
              const name  = conv.push_name || conv.contact_name || conv.group_name || phone || 'Desconhecido';
              setConvs(p => {
                if (p.find(c => c.whatsapp_chat_id === conv.whatsapp_chat_id)) return p;
                return [{ id: conv.id, name, avatar: name.slice(0, 2).toUpperCase(), photoUrl: conv.push_photo_url || null, type: conv.is_group ? 'group' : 'whatsapp', whatsapp_chat_id: conv.whatsapp_chat_id, preview, previewFrom: 'in', time, _sortTs: msg.created_at || new Date().toISOString(), unread: 1, online: false, messages: [], status: conv.status }, ...p];
              });
            });
            return prev;
          }
          const conv    = prev[idx];
          const statusUpdate = isInbound
            ? (conv.status === 'finalizado'    ? { status: 'aguardando'         }
             : conv.status === 'em_atendimento' ? { status: 'atendimento_aberto' }
             : {})
            : {};
          const updated = { ...conv, preview, time, _sortTs: msg.created_at || new Date().toISOString(), previewFrom: isInbound ? 'in' : 'out', unread: isActive ? 0 : (conv.unread || 0) + (isInbound ? 1 : 0), ...statusUpdate };
          // Only move to top for inbound — outbound sends should not reorder the list
          if (!isInbound) { const next = [...prev]; next[idx] = updated; return next; }
          return [updated, ...prev.filter(c => c.id !== convId)];
        });
        // som e notificação gerenciados globalmente pelo App.jsx

        // ── AI mode: auto-suggestion (Híbrido) / auto-send (IA) ──
        if (isInbound && msg.sender_name !== 'Bot') {
          const mode = aiModeRef.current;
          if (mode === 'hibrido' && convId === activeIdRef.current) {
            setTimeout(() => triggerHibridoSuggestion(convId), 900);
          } else if (mode === 'ia' && !convId?.startsWith('chan-')) {
            setTimeout(() => {
              const conv = convsRef.current.find(c => c.id === convId);
              if (conv?.whatsapp_chat_id) triggerIaAutoReply(convId, conv.whatsapp_chat_id);
            }, 1000);
          }
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages' }, payload => {
        const msg = payload.new;
        if (!msg.media_url) return;
        setMessages(m => {
          const convMsgs = m[msg.conversation_id];
          if (!convMsgs) return m;
          return { ...m, [msg.conversation_id]: convMsgs.map(ex => ex.id === msg.id ? { ...ex, mediaUrl: msg.media_url } : ex) };
        });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [selectedInstance]);

  // Canal interno — carrega mensagens ao selecionar
  useEffect(() => {
    if (activeId?.startsWith('chan-')) {
      const chanId = convs.find(c => c.id === activeId)?.chanId;
      if (chanId && !chanMsgs[chanId]?.length) loadChanMsgs(chanId);
    }
  }, [activeId]);

  // Auto-scroll
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const activeMsgsList = messages[activeId] || [];

    // Conversa nova sendo aberta: espera mensagens carregarem, depois vai pro fundo
    if (activeId !== lastScrolledConv.current) {
      if (activeMsgsList.length > 0) {
        el.scrollTop = el.scrollHeight;
        setShowScrollBtn(false);
        lastScrolledConv.current = activeId;
      }
      return;
    }

    // Mesma conversa, nova mensagem chegou: scroll inteligente
    const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (dist < 120) {
      el.scrollTop = el.scrollHeight;
      setShowScrollBtn(false);
    } else {
      setShowScrollBtn(true);
    }
  }, [messages, activeId, typing]);
  useEffect(() => {
    if (chanScrollRef.current) chanScrollRef.current.scrollTop = chanScrollRef.current.scrollHeight;
  }, [chanMsgs, activeId]);

  // ── FUNÇÕES DE CARREGAMENTO ────────────────────────────────
  async function loadInstances() {
    try {
      const { data } = await supabase.from('evolution_instances').select('id, instance_name, status, phone, profile_name').order('created_at');
      if (data?.length) {
        setInstances(data);
        const connected = data.find(i => i.status === 'connected') || data[0];
        setSelectedInstance(connected.instance_name);
      }
    } catch { /* demo mode */ }
  }

  async function loadMembers() {
    try {
      const { data } = await supabase.from('profiles').select('id, full_name, email, avatar_url').order('full_name');
      if (data?.length) setMembers(data);
    } catch { /* ignore */ }
  }

  async function loadCurrentUser() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const [{ data: profile }, { data: member }] = await Promise.all([
        supabase.from('profiles').select('full_name, avatar_url').eq('id', user.id).single(),
        supabase.from('tenant_members').select('display_name').eq('user_id', user.id).maybeSingle(),
      ]);
      setCurrentUser({ id: user.id, email: user.email, name: member?.display_name || profile?.full_name || user.email?.split('@')[0] || 'Equipe' });
    } catch { /* ignore */ }
  }

  async function handleBulkFinalize() {
    if (!selectedConvIds.size || bulkLoading) return;
    setBulkLoading(true);
    const ids = [...selectedConvIds];
    const payload = {
      status:    'finalizado',
      status_v2: 'closed',
      finished_by: currentUser?.id || null,
    };
    try {
      await supabase.from('conversations').update(payload).in('id', ids);
      setConvs(prev => prev.map(c => selectedConvIds.has(c.id) ? { ...c, status: 'finalizado' } : c));
    } catch { /* ignore */ }
    setSelectedConvIds(new Set());
    setSelectMode(false);
    setBulkLoading(false);
  }

  async function loadQuickReplies() {
    try {
      const { data } = await supabase.from('quick_replies').select('id, title, content').order('title');
      if (data) setQuickReplies(data);
    } catch { /* ignore */ }
  }

  async function loadWAGroups() {
    try {
      if (!tenantDbId) return;
      const { data } = await supabase.from('whatsapp_groups').select('id, group_name, evolution_jid, loja_id').eq('tenant_id', tenantDbId).order('created_at', { ascending: false });
      if (!data?.length) return;
      // Buscar conversation UUID real para cada grupo pelo JID
      const jids = data.map(g => g.evolution_jid).filter(Boolean);
      const { data: convRows } = jids.length
        ? await supabase.from('conversations').select('id, whatsapp_chat_id, status, updated_at, push_photo_url').in('whatsapp_chat_id', jids).order('updated_at', { ascending: false })
        : { data: [] };
      const jidToConv = {};
      (convRows || []).forEach(c => { if (!jidToConv[c.whatsapp_chat_id]) jidToConv[c.whatsapp_chat_id] = c; });
      const groupConvs = data.map(g => {
        const conv = jidToConv[g.evolution_jid];
        const name = g.group_name || g.evolution_jid;
        return {
          id: conv?.id || ('wag-' + g.id),
          name, avatar: name.slice(0, 2).toUpperCase(),
          type: 'group', whatsapp_chat_id: g.evolution_jid, waGroupId: g.id,
          photoUrl: conv?.push_photo_url || null,
          preview: 'Grupo WhatsApp',
          time: conv?.updated_at ? new Date(conv.updated_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '',
          _sortTs: conv?.updated_at || '',
          unread: 0, online: false, messages: [],
          status: conv?.status || 'finalizado',
        };
      });
      setConvs(prev => {
        const existingIds = new Set(prev.map(c => c.id));
        const toAdd = groupConvs.filter(g => !existingIds.has(g.id));
        return [...prev.filter(c => !c.id.startsWith('wag-')), ...toAdd];
      });
    } catch { /* ignore */ }
  }

  async function loadInternalChannels() {
    try {
      let q = supabase.from('internal_channels').select('id, name, color, description, is_global').order('created_at', { ascending: false });
      if (tenantDbId) q = q.or(`tenant_id.eq.${tenantDbId},is_global.eq.true`);
      const { data } = await q;
      if (!data?.length) return;
      const chanConvs = data.map(c => ({ id: 'chan-' + c.id, name: '#' + c.name, avatar: c.name.slice(0, 2).toUpperCase(), type: 'internal', chanId: c.id, color: c.color || '#2563EB', isGlobal: c.is_global, description: c.description || '', preview: c.description || 'Canal interno', time: '', unread: 0, online: false, messages: [] }));
      setConvs(prev => [...prev.filter(c => !c.id.startsWith('chan-')), ...chanConvs]);
    } catch { /* ignore */ }
  }

  async function loadChanMsgs(chanId) {
    try {
      const { data } = await supabase.from('channel_messages').select('id, sender_id, sender_name, text, is_pinned, created_at').eq('channel_id', chanId).order('created_at');
      if (data) setChanMsgs(m => ({ ...m, [chanId]: data }));
    } catch { /* ignore */ }
  }

  async function enrichConvsWithWAData(instanceName) {
    try {
      const [groupsRaw, contactsRaw] = await Promise.allSettled([
        fetchGroups(instanceName, false),
        fetchContacts(instanceName),
      ]);
      const nameMap = {};
      const photoMap = {};
      // Evolution API pode retornar array direto ou { groups: [...] }
      const normalizeArr = v => Array.isArray(v) ? v : (Array.isArray(v?.groups) ? v.groups : []);
      if (groupsRaw.status === 'fulfilled') {
        normalizeArr(groupsRaw.value).forEach(g => {
          const jid = g.id || g.jid || g.remoteJid;
          if (jid) { nameMap[jid] = g.subject || g.name || null; photoMap[jid] = g.pictureUrl || g.profilePictureUrl || null; }
        });
      }
      if (contactsRaw.status === 'fulfilled') {
        normalizeArr(contactsRaw.value).forEach(c => {
          const jid = c.id || c.jid || c.remoteJid;
          if (jid) {
            nameMap[jid]  = c.pushName || c.name || c.verifiedName || null;
            photoMap[jid] = c.profilePictureUrl || c.imgUrl || c.picture || c.photo || null;
          }
        });
      }
      if (!Object.keys(nameMap).length && !Object.keys(photoMap).length) return;
      setConvs(prev => prev.map(conv => {
        const jid = conv.whatsapp_chat_id;
        if (!jid) return conv;
        const newName  = nameMap[jid]  || null;
        const newPhoto = photoMap[jid] || null;
        if (!newName && !newPhoto) return conv;
        const finalName = (newName && !conv.waNameFetched) ? newName : conv.name;
        return {
          ...conv,
          name: finalName,
          avatar: finalName.slice(0, 2).toUpperCase(),
          photoUrl: newPhoto || conv.photoUrl || null,
          waNameFetched: newName ? true : conv.waNameFetched,
        };
      }));
    } catch { /* silencioso */ }
  }

  async function loadRealtimeConvs(instanceName) {
    // Ativa realtime independente de ter conversas — mensagens novas devem aparecer mesmo com 0 ativas
    setUsingRealData(true);
    try {
      const { data: inst } = await supabase.from('evolution_instances').select('id').eq('instance_name', instanceName).single();
      if (!inst) return;
      const ACTIVE_STATUSES = ['aguardando', 'em_atendimento', 'atendimento_aberto', 'automacao', 'falha'];
      const { data: rows } = await supabase.from('conversations').select('*').eq('instance_id', inst.id).in('status', ACTIVE_STATUSES).order('updated_at', { ascending: false }).limit(200);
      if (!rows?.length) return;
      const seen = new Set();
      const uniqueRows = rows.filter(r => { if (seen.has(r.whatsapp_chat_id)) return false; seen.add(r.whatsapp_chat_id); return true; });
      const lastMsgResults = await Promise.all(uniqueRows.map(r => supabase.from('messages').select('conversation_id, content, body, direction, created_at, media_type').eq('conversation_id', r.id).order('created_at', { ascending: false }).limit(1).maybeSingle()));
      const lastMsgMap = {};
      lastMsgResults.forEach(({ data }) => { if (data) lastMsgMap[data.conversation_id] = data; });
      const mapped = uniqueRows.map(c => {
        const phone = c.whatsapp_chat_id ? c.whatsapp_chat_id.split('@')[0] : '';
        const name  = c.push_name || c.contact_name || c.group_name || phone || 'Desconhecido';
        const lm    = lastMsgMap[c.id];
        const preview = lm ? (lm.media_type === 'image' ? '🖼 Imagem' : lm.media_type === 'video' ? '🎬 Vídeo' : lm.media_type === 'document' ? '📄 Documento' : lm.media_type?.includes('audio') ? '🎵 Áudio' : lm.content || lm.body || '') : '';
        const previewFrom = lm?.direction === 'inbound' ? 'in' : 'out';
        return { id: c.id, name, avatar: name.slice(0, 2).toUpperCase(), photoUrl: c.push_photo_url || null, type: c.is_group ? 'group' : 'whatsapp', whatsapp_chat_id: c.whatsapp_chat_id, preview, previewFrom, time: c.updated_at ? new Date(c.updated_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '', _sortTs: c.updated_at || '', unread: 0, online: false, messages: [], status: c.status, department_id: c.department_id || null, customer_id: c.customer_id || null, status_v2: c.status_v2 || 'open', tenant_id: c.tenant_id || null, breno_paused: c.breno_paused || false, last_breno_handled_at: c.last_breno_handled_at || null };
      });
      setConvs(prev => {
        const existingIds = new Set(prev.map(c => c.id));
        const toAdd = mapped.filter(c => !existingIds.has(c.id));
        return toAdd.length ? [...toAdd, ...prev] : prev;
      });
      setActiveId(prev => prev || mapped[0]?.id);
      if (!activeIdRef.current && mapped[0]) loadMsgs(mapped[0].id);
    } catch { /* ignore */ }
  }

  async function loadMsgs(convId) {
    try {
      const [{ data }, { data: evts }] = await Promise.all([
        supabase.from('messages').select('id, direction, content, body, created_at, sender_name, media_url, media_type, whatsapp_msg_id, quoted_content').eq('conversation_id', convId).order('created_at', { ascending: false }).limit(100),
        supabase.from('conversation_events').select('id, event_type, actor_name, metadata, ts').eq('conversation_id', convId).order('ts', { ascending: true }),
      ]);
      const dbMsgs = (data || []).reverse().filter(msg => msg.content || msg.body || msg.media_url).map(msg => ({
        id: msg.id, from: msg.direction === 'outbound' ? 'out' : 'in',
        text: msg.content || msg.body || '',
        time: new Date(msg.created_at || Date.now()).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
        _ts: msg.created_at || new Date(0).toISOString(),
        mediaType: msg.media_type || null, mediaUrl: msg.media_url || null,
        agentName: msg.sender_name || null, waMsgId: msg.whatsapp_msg_id || null,
        replyTo: msg.quoted_content || null,
      }));
      const SHOW_EVENT_TYPES = new Set(['created', 'assigned', 'closed', 'reopened']);
      const evtMsgs = (evts || []).filter(evt => SHOW_EVENT_TYPES.has(evt.event_type)).map(evt => ({
        id: `evt-${evt.id}`, from: 'system',
        text: fmtEventLabel(evt),
        _ts: evt.ts,
      }));
      const merged = [...dbMsgs, ...evtMsgs].sort((a, b) => new Date(a._ts) - new Date(b._ts));
      setMessages(m => {
        const tmpMsgs = (m[convId] || []).filter(ex => ex.id?.startsWith('tmp-') || ex.id?.startsWith('sys-'));
        return { ...m, [convId]: [...merged, ...tmpMsgs] };
      });
    } catch { /* ignore */ }
  }

  // ── REFRESH ACTIVE CONVS ──────────────────────────────────
  const REFRESH_STATUSES = ['aguardando', 'em_atendimento', 'atendimento_aberto', 'automacao'];

  // Carrega conversas finalizadas/ocultas sob demanda quando filtro é selecionado
  useEffect(() => {
    if (!statusFilter || !selectedInstance || !tenantDbId) return;
    const lazyStatuses = { finalizado: ['finalizado'], oculto: ['archived'] };
    const statuses = lazyStatuses[statusFilter];
    if (!statuses) return;
    const alreadyLoaded = convs.some(c => statuses.includes(c.status));
    if (alreadyLoaded) return;
    (async () => {
      try {
        const { data: inst } = await supabase.from('evolution_instances').select('id').eq('instance_name', selectedInstance).single();
        if (!inst) return;
        const { data: rows } = await supabase.from('conversations').select('*').eq('instance_id', inst.id).in('status', statuses).order('updated_at', { ascending: false }).limit(100);
        if (!rows?.length) return;
        const lastMsgResults = await Promise.all(rows.map(r => supabase.from('messages').select('conversation_id, content, body, direction, created_at, media_type').eq('conversation_id', r.id).order('created_at', { ascending: false }).limit(1).maybeSingle()));
        const lastMsgMap = {};
        lastMsgResults.forEach(({ data }) => { if (data) lastMsgMap[data.conversation_id] = data; });
        const mapped = rows.map(c => {
          const phone = c.whatsapp_chat_id ? c.whatsapp_chat_id.split('@')[0] : '';
          const name  = c.push_name || c.contact_name || c.group_name || phone || 'Desconhecido';
          const lm    = lastMsgMap[c.id];
          const preview = lm ? (lm.media_type === 'image' ? '🖼 Imagem' : lm.media_type === 'video' ? '🎬 Vídeo' : lm.media_type === 'document' ? '📄 Documento' : lm.media_type?.includes('audio') ? '🎵 Áudio' : lm.content || lm.body || '') : '';
          const previewFrom = lm?.direction === 'inbound' ? 'in' : 'out';
          return { id: c.id, name, avatar: name.slice(0, 2).toUpperCase(), photoUrl: c.push_photo_url || null, type: c.is_group ? 'group' : 'whatsapp', whatsapp_chat_id: c.whatsapp_chat_id, preview, previewFrom, time: c.updated_at ? new Date(c.updated_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '', _sortTs: c.updated_at || '', unread: 0, online: false, messages: [], status: c.status, department_id: c.department_id || null, customer_id: c.customer_id || null, status_v2: c.status_v2 || 'open', tenant_id: c.tenant_id || null, breno_paused: c.breno_paused || false, last_breno_handled_at: c.last_breno_handled_at || null };
        });
        setConvs(prev => [...prev.filter(c => !statuses.includes(c.status)), ...mapped]);
      } catch { /* silencioso */ }
    })();
  }, [statusFilter, selectedInstance, tenantDbId]);

  async function refreshPendingConvs() {
    if (!selectedInstance || refreshing) return;
    setRefreshing(true);
    try {
      const { data: inst } = await supabase.from('evolution_instances').select('id').eq('instance_name', selectedInstance).single();
      if (!inst) return;
      const { data: rows } = await supabase
        .from('conversations').select('*')
        .eq('instance_id', inst.id)
        .in('status', REFRESH_STATUSES)
        .order('updated_at', { ascending: false })
        .limit(100);

      const mapped = [];
      if (rows?.length) {
        const lastMsgResults = await Promise.all(
          rows.map(r => supabase.from('messages')
            .select('conversation_id, content, body, direction, created_at, media_type')
            .eq('conversation_id', r.id)
            .order('created_at', { ascending: false })
            .limit(1).maybeSingle()
          )
        );
        const lastMsgMap = {};
        lastMsgResults.forEach(({ data }) => { if (data) lastMsgMap[data.conversation_id] = data; });
        rows.forEach(c => {
          const phone = c.whatsapp_chat_id ? c.whatsapp_chat_id.split('@')[0] : '';
          const name  = c.push_name || c.contact_name || c.group_name || phone || 'Desconhecido';
          const lm    = lastMsgMap[c.id];
          const preview = lm ? (lm.media_type === 'image' ? '🖼 Imagem' : lm.media_type === 'video' ? '🎬 Vídeo' : lm.media_type === 'document' ? '📄 Documento' : lm.media_type?.includes('audio') ? '🎵 Áudio' : lm.content || lm.body || '') : '';
          const previewFrom = lm?.direction === 'inbound' ? 'in' : 'out';
          mapped.push({ id: c.id, name, avatar: name.slice(0, 2).toUpperCase(), photoUrl: c.push_photo_url || null, type: c.is_group ? 'group' : 'whatsapp', whatsapp_chat_id: c.whatsapp_chat_id, preview, previewFrom, time: c.updated_at ? new Date(c.updated_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '', _sortTs: c.updated_at || '', unread: 0, online: false, messages: [], status: c.status, department_id: c.department_id || null, customer_id: c.customer_id || null, status_v2: c.status_v2 || 'open', tenant_id: c.tenant_id || null });
        });
      }
      setConvs(prev => [
        ...prev.filter(c => !REFRESH_STATUSES.includes(c.status)),
        ...mapped,
      ]);
      refreshStatus();
    } finally {
      setRefreshing(false);
    }
  }

  // ── SEND MESSAGE ──────────────────────────────────────────
  const send = async () => {
    const text = (draft || '').trim();
    if (!text || !active || sending) return;
    const isWA = active.type === 'whatsapp' || active.type === 'group';
    const agentName = (currentUser?.name && isWA) ? currentUser.name : null;
    const now  = new Date();
    const time = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const currentReplyTo = replyTo;
    setMessages(m => ({ ...m, [active.id]: [...(m[active.id] || []), { id: 'tmp-' + Date.now(), from: 'out', text, time, _ts: now.toISOString(), agentName, replyTo: currentReplyTo }] }));
    setDraft(''); setReplyTo(null);
    if (HAS_EVO && selectedInstance && active.whatsapp_chat_id) {
      setSending(true);
      const textToSend = agentName ? `*${agentName}:*\n${text}` : text;
      const waQuoted = currentReplyTo?.waMsgId ? { key: { id: currentReplyTo.waMsgId, remoteJid: active.whatsapp_chat_id, fromMe: currentReplyTo.from === 'out' }, message: currentReplyTo.mediaType ? {} : { conversation: currentReplyTo.text || '' } } : null;
      try {
        // Salva no banco ANTES de chamar a Evolution para que o DEDUP do webhook
        // encontre a linha e não insira duplicata quando o evento fromMe chegar.
        const { error: insertErr } = await supabase.from('messages').insert({ tenant_id: active.tenant_id || null, conversation_id: active.id, direction: 'outbound', content: text, sender_name: agentName || null, created_at: now.toISOString(), ...(currentReplyTo ? { quoted_content: currentReplyTo } : {}) });
        if (insertErr) console.error('Falha ao salvar mensagem no banco:', insertErr);
        await sendTextMessage(selectedInstance, active.whatsapp_chat_id, textToSend, waQuoted);
        // Equipe enviou → conversa vai para "Em aberto" (atendimento_aberto)
        const canUpdateStatus = !['finalizado', 'falha', 'archived'].includes(convStatus);
        if (canUpdateStatus) {
          await changeStatus('atendimento_aberto');
          addSystemMsg(active.id, 'assumiu o atendimento');
          await insertEvent(active.id, 'assigned');
          setConvs(prev => prev.map(c => c.id === active.id ? { ...c, status: 'atendimento_aberto', previewFrom: 'out' } : c));
        } else {
          setConvs(prev => prev.map(c => c.id === active.id ? { ...c, previewFrom: 'out' } : c));
        }
      } catch (err) {
        console.error('Falha ao enviar via Evolution:', err);
        // Marca conversa como Falha no envio
        await supabase.from('conversations')
          .update({ status: 'falha', status_v2: 'falha' })
          .eq('id', active.id);
        setConvs(prev => prev.map(c => c.id === active.id ? { ...c, status: 'falha' } : c));
      }
      finally { setSending(false); }
    } else if (isWA) {
      setTyping(true);
      setTimeout(() => {
        setTyping(false);
        const replies = ['Ok, obrigado pela atenção!', 'Show, vou aguardar então.', 'Perfeito, muito obrigado 🙏', 'Beleza, faz sentido.'];
        const r  = replies[Math.floor(Math.random() * replies.length)];
        const t2 = new Date();
        const tm2 = t2.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        setMessages(m => ({ ...m, [active.id]: [...(m[active.id] || []), { id: 'mock-' + t2.getTime(), from: 'in', text: r, time: tm2 }] }));
      }, 2400);
    }
  };

  async function sendChanMsg() {
    const text = chanDraft.trim();
    if (!text || !active) return;
    const chanId = active.chanId;
    const now = new Date();
    const tmpMsg = { id: 'tmp-' + Date.now(), sender_name: currentUser?.name || 'Você', text, is_pinned: false, created_at: now.toISOString() };
    setChanMsgs(m => ({ ...m, [chanId]: [...(m[chanId] || []), tmpMsg] }));
    setChanDraft('');
    try {
      const { data } = await supabase.from('channel_messages').insert({ channel_id: chanId, sender_name: currentUser?.name || 'Você', text }).select().single();
      if (data) setChanMsgs(m => ({ ...m, [chanId]: (m[chanId] || []).map(msg => msg.id === tmpMsg.id ? data : msg) }));
    } catch { /* ignore */ }
  }

  // ── GRAVAÇÃO DE ÁUDIO ─────────────────────────────────────
  const formatRecTime = (s) => `${Math.floor(s/60).toString().padStart(2,'0')}:${(s%60).toString().padStart(2,'0')}`;

  const startRecording = async () => {
    if (recState !== 'idle') return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      mediaRecorderRef.current = mr;
      audioChunksRef.current = [];
      mr.ondataavailable = e => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      mr.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(audioChunksRef.current, { type: 'audio/ogg; codecs=opus' });
        audioBlobRef.current = blob;
        const url = URL.createObjectURL(blob);
        setAudioPreview(url);
        setRecPlaying(false);
        setRecCurrentTime(0);
        setRecState('preview');
      };
      mr.start(200);
      setRecState('recording');
      setRecSeconds(0);
      recTimerRef.current = setInterval(() => setRecSeconds(s => s + 1), 1000);
    } catch {
      alert('Permissão de microfone necessária para gravar áudio.');
    }
  };

  const stopRecording = () => {
    if (recState !== 'recording') return;
    clearInterval(recTimerRef.current);
    mediaRecorderRef.current?.stop();
    // recState será definido para 'preview' dentro de mr.onstop
  };

  const cancelRecording = () => {
    if (recState !== 'recording') return;
    clearInterval(recTimerRef.current);
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.ondataavailable = null;
      mediaRecorderRef.current.onstop = null;
      try { mediaRecorderRef.current.stream?.getTracks().forEach(t => t.stop()); } catch { /* ignore */ }
      try { mediaRecorderRef.current.stop(); } catch { /* ignore */ }
    }
    mediaRecorderRef.current = null;
    audioChunksRef.current = [];
    setRecState('idle');
    setRecSeconds(0);
  };

  const toggleStarMsg = (msg) => {
    if (!activeId || !msg?.id) return;
    const key = `${activeId}:${msg.id}`;
    setStarredMsgs(prev => {
      const next = { ...prev };
      if (next[key]) {
        delete next[key];
      } else {
        next[key] = {
          convId:    activeId,
          convName:  active?.name || '—',
          convPhoto: active?.photoUrl || null,
          convType:  active?.type || 'whatsapp',
          msgId:     msg.id,
          text:      msg.text || null,
          from:      msg.from,
          time:      msg.time || '',
          mediaType: msg.mediaType || null,
          starredAt: Date.now(),
        };
      }
      try { localStorage.setItem('cd-starred-msgs', JSON.stringify(next)); } catch {}
      return next;
    });
  };

  const deleteMsg = async (msg) => {
    if (!activeId || !msg?.id) return;
    // Remove do estado local imediatamente
    setMessages(prev => ({
      ...prev,
      [activeId]: (prev[activeId] || []).filter(m => m.id !== msg.id),
    }));
    // Remove do Supabase se for mensagem real (não temporária)
    if (!msg.id.startsWith('tmp-')) {
      await supabase.from('messages').delete().eq('id', msg.id);
    }
  };

  const toggleFav = (convId, e) => {
    e?.stopPropagation();
    setFavConvs(prev => {
      const next = new Set(prev);
      if (next.has(convId)) next.delete(convId); else next.add(convId);
      try { localStorage.setItem('cd-fav-convs', JSON.stringify([...next])); } catch {}
      return next;
    });
  };

  // ── HISTÓRICO / EVENTS ────────────────────────────────────
  function fmtEventDate(d) {
    const now   = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const day   = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const diff  = Math.round((today - day) / 86400000);
    if (diff === 0) return 'hoje';
    if (diff === 1) return 'ontem';
    if (diff < 7)   return d.toLocaleDateString('pt-BR', { weekday: 'long' });
    return d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' }).replace('.', '');
  }

  function eventVerb(evt) {
    const meta = evt.metadata || {};
    switch (evt.event_type) {
      case 'created':             return 'iniciou a conversa';
      case 'assigned':            return 'assumiu o atendimento';
      case 'unassigned':          return 'removeu a atribuição';
      case 'transferred':         return meta.dept_to
        ? `moveu para o departamento ${meta.dept_to}`
        : meta.dept_from
        ? `removeu o departamento ${meta.dept_from}`
        : 'transferiu a conversa';
      case 'tagged':              return `adicionou tag: ${meta.tag_name || ''}`;
      case 'untagged':            return `removeu tag: ${meta.tag_name || ''}`;
      case 'closed':              return 'finalizou o atendimento';
      case 'reopened':            return 'reabriu o atendimento';
      case 'note_added':          return 'adicionou uma nota interna';
      case 'automation_executed': return `executou automação${meta.name ? ': ' + meta.name : ''}`;
      default:                    return evt.event_type;
    }
  }

  function fmtEventLabel(evt) {
    const d       = new Date(evt.ts);
    const dateStr = fmtEventDate(d);
    const timeStr = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const actor   = evt.actor_name || '';
    const verb    = eventVerb(evt);
    return `${dateStr} ${timeStr} — ${actor ? actor + ' ' : ''}${verb}`;
  }

  const addSystemMsg = (convId, verbText) => {
    const d       = new Date();
    const dateStr = fmtEventDate(d);
    const timeStr = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const actor   = currentUser?.name || 'Equipe';
    const text    = `${dateStr} ${timeStr} — ${actor} ${verbText}`;
    setMessages(prev => ({
      ...prev,
      [convId]: [...(prev[convId] || []), { id: `sys-${Date.now()}`, from: 'system', text, _ts: new Date().toISOString() }],
    }));
  };

  const insertEvent = async (convId, eventType, meta = {}) => {
    if (!convId || !tenantDbId) return;
    try {
      await supabase.from('conversation_events').insert({
        tenant_id:       tenantDbId,
        conversation_id: convId,
        event_type:      eventType,
        actor_id:        currentUser?.id  || null,
        actor_name:      currentUser?.name || 'Sistema',
        actor_type:      'user',
        metadata:        meta,
      });
    } catch { /* silencioso */ }
  };

  const toggleBrenoPause = async () => {
    if (!activeId) return;
    const conv = convsRef.current.find(c => c.id === activeId);
    if (!conv) return;
    const newPaused = !conv.breno_paused;
    await supabase.from('conversations').update({ breno_paused: newPaused }).eq('id', activeId);
    setConvs(prev => prev.map(c => c.id === activeId ? { ...c, breno_paused: newPaused } : c));
  };

  const dismissBrenoSuggestion = async (interactionId) => {
    setBrenoSuggestion(null);
    if (interactionId) {
      await supabase.from('breno_interactions').update({ requires_review: false }).eq('id', interactionId).catch(() => {});
    }
  };

  const handleForward = async (targetConv) => {
    const msg = forwardMsg;
    setForwardMsg(null);
    if (!msg || !selectedInstance || !targetConv?.whatsapp_chat_id) return;
    try {
      if (msg.mediaType?.includes('audio')) {
        if (msg.mediaUrl) {
          const res = await fetch(msg.mediaUrl);
          const blob = await res.blob();
          const reader = new FileReader();
          reader.onloadend = async () => {
            const base64 = reader.result.split(',')[1];
            await sendAudioMessage(selectedInstance, targetConv.whatsapp_chat_id, base64);
          };
          reader.readAsDataURL(blob);
        }
      } else if (msg.mediaType && msg.mediaUrl) {
        const res = await fetch(msg.mediaUrl);
        const blob = await res.blob();
        const reader = new FileReader();
        reader.onloadend = async () => {
          const base64 = reader.result.split(',')[1];
          const mime = blob.type || 'application/octet-stream';
          await sendMediaMessage(selectedInstance, targetConv.whatsapp_chat_id, base64, msg.mediaType, mime, msg.text || '', '');
        };
        reader.readAsDataURL(blob);
      } else if (msg.text) {
        await sendTextMessage(selectedInstance, targetConv.whatsapp_chat_id, `↪️ ${msg.text}`);
      }
    } catch (err) {
      console.error('Falha ao encaminhar:', err);
    }
  };

  const discardAudio = () => {
    if (audioPreview) URL.revokeObjectURL(audioPreview);
    audioBlobRef.current = null;
    setAudioPreview(null);
    setRecPlaying(false);
    setRecDuration(0);
    setRecCurrentTime(0);
    setRecState('idle');
  };

  const confirmSendAudio = async () => {
    if (!audioBlobRef.current) return;
    const blob = audioBlobRef.current;
    discardAudio();
    await sendAudioBlob(blob);
  };

  const togglePlayPreview = () => {
    const el = audioElRef.current;
    if (!el) return;
    if (recPlaying) { el.pause(); setRecPlaying(false); }
    else { el.play(); setRecPlaying(true); }
  };

  const sendAudioBlob = async (blob) => {
    if (!active || !HAS_EVO || !selectedInstance || !active.whatsapp_chat_id) return;
    // URL local para o player funcionar imediatamente enquanto o upload acontece
    const localUrl = URL.createObjectURL(blob);
    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64 = reader.result.split(',')[1];
      const now = new Date();
      const time = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      const nowAudio = new Date();
      setMessages(m => ({ ...m, [active.id]: [...(m[active.id] || []), { id: 'tmp-' + Date.now(), from: 'out', text: '', time, _ts: nowAudio.toISOString(), mediaType: 'audio', mediaUrl: localUrl }] }));
      setSending(true);
      try { await sendAudioMessage(selectedInstance, active.whatsapp_chat_id, base64); }
      catch (err) { console.error('Falha ao enviar áudio:', err); }
      finally { setSending(false); }
    };
    reader.readAsDataURL(blob);
  };

  // ── ENVIO DE MÍDIA ────────────────────────────────────────
  const sendMediaFile = async (file) => {
    if (!active) return;
    const isWA = active.type === 'whatsapp' || active.type === 'group';
    const now = new Date();
    const time = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const isImage = file.type.startsWith('image/');
    const isVideo = file.type.startsWith('video/');
    const isAudio = file.type.startsWith('audio/');
    const mediaType = isImage ? 'image' : isVideo ? 'video' : isAudio ? 'audio' : 'document';
    const label = isImage ? `🖼️ ${file.name}` : isVideo ? `🎬 ${file.name}` : isAudio ? `🎤 ${file.name}` : `📎 ${file.name}`;
    const previewUrl = isImage ? URL.createObjectURL(file) : null;
    setMessages(m => ({ ...m, [active.id]: [...(m[active.id] || []), { id: 'tmp-' + Date.now(), from: 'out', text: label, time, _ts: now.toISOString(), mediaType, mediaUrl: previewUrl }] }));
    if (!HAS_EVO || !selectedInstance || !active.whatsapp_chat_id || !isWA) return;
    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64 = reader.result.split(',')[1];
      setSending(true);
      try { await sendMediaMessage(selectedInstance, active.whatsapp_chat_id, base64, mediaType, file.type, '', file.name); }
      catch (err) { console.error('Falha ao enviar mídia:', err); }
      finally { setSending(false); }
    };
    reader.readAsDataURL(file);
  };

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    if (file.type.startsWith('image/')) {
      setPasteImage({ file, previewUrl: URL.createObjectURL(file) });
      setPasteCaption('');
      setTimeout(() => pasteCaptionRef.current?.focus(), 80);
      return;
    }
    await sendMediaFile(file);
  };

  const handleComposerPaste = (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (!file) return;
        setPasteImage({ file, previewUrl: URL.createObjectURL(file) });
        setPasteCaption('');
        setTimeout(() => pasteCaptionRef.current?.focus(), 80);
        return;
      }
    }
    // texto: deixa colar normalmente
  };

  const sendPasteImage = async () => {
    if (!pasteImage) return;
    const { file } = pasteImage;
    const caption = pasteCaption.trim();
    const now = new Date();
    const time = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const label = caption || `🖼️ ${file.name || 'imagem'}`;
    setMessages(m => ({ ...m, [active.id]: [...(m[active.id] || []), { id: 'tmp-' + Date.now(), from: 'out', text: label, time, _ts: now.toISOString(), mediaType: 'image', mediaUrl: pasteImage.previewUrl }] }));
    const { file: f, previewUrl } = pasteImage;
    setPasteImage(null);
    setPasteCaption('');
    if (!HAS_EVO || !selectedInstance || !active?.whatsapp_chat_id || !(active.type === 'whatsapp' || active.type === 'group')) return;
    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64 = reader.result.split(',')[1];
      setSending(true);
      try { await sendMediaMessage(selectedInstance, active.whatsapp_chat_id, base64, 'image', f.type, caption, f.name || 'imagem.png'); }
      catch (err) { console.error('Falha ao enviar imagem colada:', err); }
      finally { setSending(false); URL.revokeObjectURL(previewUrl); }
    };
    reader.readAsDataURL(f);
  };

  // ── AI MODE — auto-suggestion (Híbrido) / auto-send (IA) ───
  async function triggerHibridoSuggestion(convId) {
    if (hibridoPendingRef.current.has(convId)) return;
    hibridoPendingRef.current.add(convId);
    try {
      const BRIDGE_URL = import.meta.env.VITE_BRIDGE_URL || '';
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const { data: recentMsgs } = await supabase.from('messages')
        .select('direction, content, sender_name')
        .eq('conversation_id', convId)
        .order('created_at', { ascending: false })
        .limit(20);
      const msgs = (recentMsgs ?? []).reverse();
      const r = await fetch(`${BRIDGE_URL}/chat/ai`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ command: '/resposta', messages: msgs, conversation_id: convId }),
      });
      const data = await r.json();
      if (data.ok && data.text) {
        setConvs(prev => prev.map(c => c.id === convId ? { ...c, deliSuggestion: data.text } : c));
      }
    } catch { /* silent */ } finally {
      hibridoPendingRef.current.delete(convId);
    }
  }

  async function triggerIaAutoReply(convId, chatId) {
    if (!chatId || iaPendingRef.current.has(convId)) return;
    iaPendingRef.current.add(convId);
    try {
      const BRIDGE_URL = import.meta.env.VITE_BRIDGE_URL || '';
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const { data: recentMsgs } = await supabase.from('messages')
        .select('direction, content, sender_name')
        .eq('conversation_id', convId)
        .order('created_at', { ascending: false })
        .limit(20);
      const msgs = (recentMsgs ?? []).reverse();
      const r = await fetch(`${BRIDGE_URL}/chat/ai`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ command: '/resposta', messages: msgs, conversation_id: convId }),
      });
      const data = await r.json();
      if (data.ok && data.text && selectedInstanceRef.current) {
        await sendTextMessage(selectedInstanceRef.current, chatId, data.text);
      }
    } catch { /* silent */ } finally {
      iaPendingRef.current.delete(convId);
    }
  }

  // ── AI COMMANDS ───────────────────────────────────────────
  const runCommand = async (cmd) => {
    setShowSlash(false);
    setDraft('');

    const BRIDGE_URL = import.meta.env.VITE_BRIDGE_URL || '';
    const AI_CMDS = ['/resumir', '/proxima', '/traduzir', '/tom', '/cobranca'];

    if (AI_CMDS.includes(cmd)) {
      setAiAction({ type: 'loading', title: 'DELI pensando…', body: ['Analisando a conversa…'] });
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const jwt = session?.access_token;
        const r = await fetch(`${BRIDGE_URL}/chat/ai`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
          body: JSON.stringify({
            command: cmd,
            messages: activeMsgs.slice(-30),
            conversation_id: active?.id,
            tenant_id: active?.tenant_id,
          }),
        });
        const data = await r.json();
        if (data.ok) {
          setAiAction({ type: cmd.replace('/', ''), title: data.title, body: data.bullets || [] });
        } else {
          setAiAction({ type: 'error', title: 'Erro DELI', body: [data.error || 'Tente novamente.'] });
        }
      } catch (err) {
        setAiAction({ type: 'error', title: 'Erro de conexão', body: [err.message] });
      }
      return;
    }

    if (cmd === '/tarefa') {
      setAiAction({ type: 'cmd', title: 'Criar tarefa', body: ['Use o painel de tarefas ao lado.'] });
    } else {
      setAiAction({ type: 'cmd', title: cmd, body: ['Comando executado pela DELI…'] });
    }
  };

  const insertEmoji = (em) => {
    const el = textareaRef.current;
    if (!el) { setDraft(d => d + em); return; }
    const start = el.selectionStart;
    const end   = el.selectionEnd;
    const next  = draft.slice(0, start) + em + draft.slice(end);
    setDraft(next);
    setTimeout(() => { el.focus(); el.setSelectionRange(start + em.length, start + em.length); }, 0);
  };

  const onDraftChange = (v) => {
    setDraft(v);
    if (v === '/' || (v.endsWith('/') && (v.length === 1 || v[v.length-2] === ' '))) setShowSlash(true);
    else if (!v.includes('/')) setShowSlash(false);
    if (v.endsWith('@') && (v.length === 1 || v[v.length-2] === ' ')) setShowMention(true);
    else if (!v.match(/@\w*$/)) setShowMention(false);
  };

  const onKeyDown = (e) => {
    if (e.key === 'Tab' && showGhost) {
      e.preventDefault();
      setDraft(suggestion);
      setConvs(prev => prev.map(c => c.id === activeId ? { ...c, deliSuggestion: null } : c));
    } else if (e.key === 'Enter' && !e.shiftKey && !showSlash && !showMention) {
      e.preventDefault();
      send();
      setConvs(prev => prev.map(c => c.id === activeId ? { ...c, deliSuggestion: null } : c));
    } else if (e.key === 'Escape') {
      setShowSlash(false); setShowMention(false); setShowQR(false);
      if (showGhost) setConvs(prev => prev.map(c => c.id === activeId ? { ...c, deliSuggestion: null } : c));
    }
  };

  const insertMention = (agentId) => {
    setShowMention(false);
    setDraft(d => d.replace(/@\w*$/, '') + `@${agentId.toUpperCase()} `);
  };

  const insertQR = (qr) => {
    setShowQR(false);
    setDraft(qr.content || qr.text || '');
  };

  // ── DERIVADOS ─────────────────────────────────────────────
  const active         = convs.find(c => c.id === activeId) || convs[0];
  const activeMsgs     = messages[activeId] || [];
  const isChannel      = !!activeId?.startsWith('chan-');
  const activeChanMsgs = isChannel ? (chanMsgs[active?.chanId] || []) : [];
  const suggestion     = active?.deliSuggestion;
  const showGhost      = !draft && suggestion && aiMode !== 'humano';

  const abertosCount    = statusCounts.nao_iniciado + statusCounts.aguardando + statusCounts.aberto;
  const finalizadoCount = statusCounts.finalizado;
  const unreadCount     = convs.reduce((s, c) => s + (c.unread || 0), 0);

  const filtered = convs.filter(c => {
    if (tab === 'fav'    && !favConvs.has(c.id))   return false;
    if (tab === 'wa'     && c.type !== 'whatsapp') return false;
    if (tab === 'groups' && c.type !== 'group')    return false;
    if (tab === 'int'    && !(c.type === 'internal' || c.type === 'agent')) return false;
    if (search && !c.name.toLowerCase().includes(search.toLowerCase())) return false;
    // Sem filtro ativo: oculta finalizadas e arquivadas por padrão
    if (!statusFilter && !c.id.startsWith('chan-') && (c.status === 'finalizado' || c.status === 'archived')) return false;
    if (!c.id.startsWith('chan-') && statusFilter) {
      const match = {
        nao_iniciado: (c.status || 'aguardando') === 'aguardando',
        aguardando:   c.status === 'em_atendimento' || (c.status === 'atendimento_aberto' && c.previewFrom === 'in'),
        aberto:       c.status === 'atendimento_aberto',
        automacao:    c.status === 'automacao',
        finalizado:   c.status === 'finalizado',
        falha:        c.status === 'falha',
        oculto:       c.status === 'archived',
      }[statusFilter] ?? false;
      if (!match) return false;
    }
    if (filters?.department && c.department_id !== filters.department) return false;
    if (filters?.status     && c.status_v2     !== filters.status)     return false;
    if (filters?.tag && taggedCustomerIds !== null && !taggedCustomerIds.has(c.customer_id)) return false;
    return true;
  }).sort((a, b) => (b._sortTs || '').localeCompare(a._sortTs || ''));

  // ── SUB-ABA (tabs que não são inbox) ──────────────────────
  if (headerTab !== 'inbox') {
    return (
      <div className="route-enter livechat lc-tabbed" style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
        <header className="lc-fullhead" style={{ flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
            <div className="lc-breadcrumb" style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>
              <span>Plataforma</span>
              <Icon name="chevright" size={12} />
              <span style={{ color: 'white', fontWeight: 600 }}>Chat ao Vivo</span>
            </div>
            <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.1)' }} />
            <div className="lc-tabs">
              {[
                { id: 'inbox', icon: 'chat',  label: 'Caixa de entrada' },
                { id: 'dept',  icon: 'users', label: 'Departamentos' },
                { id: 'bots',  icon: 'bot',   label: 'Bots' },
                { id: 'proto', icon: 'paper', label: 'Protocolos',   overflow: true },
                { id: 'viz',   icon: 'chart', label: 'Visualização', overflow: true },
              ].map(t => (
                <button key={t.id} className={`lc-tab${t.overflow ? ' lc-tabs-overflow' : ''}${headerTab === t.id ? ' on' : ''}`} onClick={() => setHeaderTab(t.id)}>
                  <Icon name={t.icon} size={13} /> <span className="lc-tab-label">{t.label}</span>
                </button>
              ))}
            </div>
          </div>
        </header>
        <div style={{ flex: 1, overflow: 'auto', padding: 32, color: 'rgba(255,255,255,0.6)', fontSize: 13 }}>
          {headerTab === 'dept'  && <DepartmentsScreen tenantDbId={tenantDbId} members={members} />}
          {headerTab === 'bots'  && <BotsScreen tenantDbId={tenantDbId} />}
          {headerTab === 'proto' && <div>Protocolos — em breve</div>}
          {headerTab === 'viz'   && <div>Visualização — em breve</div>}
        </div>
      </div>
    );
  }

  return (
    <>
    <div
      className={`route-enter livechat${mobilePane === 'chat' ? ' lc-mobile-chat' : ' lc-mobile-list'}`}
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(320px, 360px) minmax(0, 1fr) var(--insp-col, 336px)',
        '--insp-col': showInspector ? '336px' : '16px',
        gridTemplateRows: '36px 1fr',
        gridTemplateAreas: '"header header header" "list chat inspector"',
        height: '100%',
        background: '#0E0E0E',
        overflow: 'hidden',
      }}
    >

      {/* ─── HEADER full-width ────────────────────────────────── */}
      <header className="lc-fullhead" style={{ gridArea: 'header' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
          <div className="lc-breadcrumb" style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>
            <span>Plataforma</span>
            <Icon name="chevright" size={12} />
            <span style={{ color: 'white', fontWeight: 600 }}>Chat ao Vivo</span>
            {instances.length > 0 && (() => {
              const inst = instances.find(i => i.instance_name === selectedInstance) || instances[0];
              const connected = inst?.status === 'connected';
              return (
                <span title={connected ? 'WhatsApp conectado' : 'WhatsApp desconectado'} style={{ width: 8, height: 8, borderRadius: '50%', background: connected ? '#25D366' : '#6B7280', flexShrink: 0, boxShadow: connected ? '0 0 6px #25D366' : 'none', display: 'inline-block', marginLeft: 2 }} />
              );
            })()}
          </div>
          <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.1)' }} />
          <div className="lc-tabs">
            {[
              { id: 'inbox', icon: 'chat',  label: 'Caixa de entrada' },
              { id: 'dept',  icon: 'users', label: 'Departamentos' },
              { id: 'bots',  icon: 'bot',   label: 'Bots' },
              { id: 'proto', icon: 'paper', label: 'Protocolos',   overflow: true },
              { id: 'viz',   icon: 'chart', label: 'Visualização', overflow: true },
            ].map(t => (
              <button key={t.id} className={`lc-tab${t.overflow ? ' lc-tabs-overflow' : ''}${headerTab === t.id ? ' on' : ''}`} onClick={() => setHeaderTab(t.id)}>
                <Icon name={t.icon} size={13} /> <span className="lc-tab-label">{t.label}</span>
              </button>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button className="lc-ask-deli" onClick={() => setShowAiPanel(v => !v)}>
            <AgentAvatar id="deli" size={18} />
            <span className="lc-ask-deli-label">Faça uma pergunta</span>
            <kbd className="lc-kbd">⌘K</kbd>
          </button>
          <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.1)' }} />
          <div className="lc-mode-switch">
            {['humano', 'hibrido', 'ia'].map(m => (
              <button key={m} className={`lc-mode-btn${aiMode === m ? ' on' : ''}`} onClick={() => {
                if (m === 'ia' && !window.confirm('DELI vai responder automaticamente todas as mensagens de PV neste modo. Confirmar?')) return;
                setAiMode(m);
              }} title={m === 'humano' ? 'Humano' : m === 'hibrido' ? 'Híbrido' : 'IA total'}>
                {m === 'humano'  && <Icon name="users"    size={11} />}
                {m === 'hibrido' && <Icon name="sparkles" size={11} />}
                {m === 'ia'      && <Icon name="bot"      size={11} />}
                <span className="lc-mode-btn-label">{m === 'humano' ? 'Humano' : m === 'hibrido' ? 'Híbrido' : 'IA total'}</span>
              </button>
            ))}
          </div>
          <button className={`lc-head-btn${showCopilot ? ' on' : ''}`} onClick={() => setShowCopilot(v => !v)}>
            <AgentAvatar id="deli" size={14} /> <span className="lc-head-btn-label">Copiloto</span>
          </button>
        </div>
      </header>

      {/* ─── COL 1: Lista de conversas ────────────────────────── */}
      <aside className="lc-list" style={{ gridArea: 'list' }}>
        <div className="lc-list-head">
          {/* Busca */}
          <div style={{ position: 'relative', marginBottom: 5 }}>
            <Icon name="search" size={13} style={{ position: 'absolute', top: 9, left: 10, color: 'rgba(255,255,255,0.4)' }} />
            <input value={search} onChange={e => setSearch(e.target.value)} className="lc-search" placeholder="Pesquise seus contatos" style={{ paddingLeft: 30 }} />
          </div>

          {/* ── Stats bar ─────────────────────────────────────── */}
          <div className="lc-stats-bar">
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span className="lc-stats-label">
                {statusFilter
                  ? { nao_iniciado: 'Não iniciados', aguardando: 'Aguardando', aberto: 'Em aberto', automacao: 'Automações', finalizado: 'Finalizadas', falha: 'Falha', oculto: 'Ocultas' }[statusFilter]
                  : 'Todas'}
              </span>
              <button className="lc-stats-badge" onClick={refreshPendingConvs} title="Atualizar não iniciados, aguardando e automações" disabled={refreshing}>
                {filtered.length}
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.7, animation: refreshing ? 'spin 0.7s linear infinite' : 'none' }}>
                  <path d="M23 4v6h-6"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
                </svg>
              </button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <button className="lc-stats-filter-btn" onClick={() => setStatusFilter(null)} title="Limpar filtro">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
                </svg>
                Filtros
              </button>
              <button
                className={`lc-stats-more-btn${showStarredPanel ? ' active' : ''}`}
                title="Mensagens favoritas"
                onClick={() => setShowStarredPanel(v => !v)}
                style={{ color: showStarredPanel ? '#FBBF24' : undefined }}
              >⭐</button>
            </div>
          </div>
          <div className="lc-stats-pills">
            {COUNTS.map(c => (
              <button
                key={c.id}
                className={`lc-stat-pill${statusFilter === c.id ? ' active' : ''}`}
                onClick={() => setStatusFilter(statusFilter === c.id ? null : c.id)}
                title={c.label}
              >
                <StatusIcon name={c.icon} size={12} />
                {c.value > 0 && <span className="lc-stat-pill-count">{c.value}</span>}
              </button>
            ))}
          </div>

          {/* Tabs WhatsApp / Grupos / Interno / Todas */}
          <div style={{ display: 'flex', gap: 2, padding: 2, background: 'rgba(255,255,255,0.04)', borderRadius: 5, marginBottom: 5 }}>
            {[{ id: 'wa', label: 'WA' }, { id: 'groups', label: 'Grupos' }, { id: 'int', label: 'Interno' }, { id: 'all', label: 'Todas' }, { id: 'fav', label: '★' }].map(t => (
              <button key={t.id} onClick={() => setTab(t.id)} title={t.id === 'fav' ? 'Favoritas' : undefined} style={{ flex: t.id === 'fav' ? 'none' : 1, padding: '4px 6px', fontSize: 10, fontWeight: 600, borderRadius: 3, background: tab === t.id ? 'rgba(255,255,255,0.08)' : 'transparent', color: tab === t.id ? (t.id === 'fav' ? '#FBBF24' : 'white') : (t.id === 'fav' ? 'rgba(251,191,36,0.5)' : 'rgba(255,255,255,0.55)') }}>{t.label}</button>
            ))}
          </div>
        </div>

        {/* AI triage banner */}
        {unreadCount > 0 && (
          <div className="lc-ai-triage">
            <AgentAvatar id="deli" size={20} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, color: 'white', fontWeight: 600 }}>DELI — {unreadCount} conversa{unreadCount > 1 ? 's' : ''} não lida{unreadCount > 1 ? 's' : ''}</div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.55)' }}>Verificar prioridade de atendimento</div>
            </div>
            <button className="lc-ai-triage-btn" onClick={() => setStatusFilter('aguardando')}>Ver</button>
          </div>
        )}

        {/* Painel de mensagens favoritas */}
        {showStarredPanel && (() => {
          const entries = Object.values(starredMsgs).sort((a, b) => b.starredAt - a.starredAt);
          const grouped = entries.reduce((acc, e) => {
            if (!acc[e.convId]) acc[e.convId] = { convName: e.convName, convPhoto: e.convPhoto, convType: e.convType, msgs: [] };
            acc[e.convId].msgs.push(e);
            return acc;
          }, {});
          return (
            <div className="lc-list-body dark-scroll">
              <div style={{ padding: '10px 12px 6px', display: 'flex', alignItems: 'center', gap: 8 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="#FBBF24" stroke="#FBBF24" strokeWidth="1.5"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.7)' }}>Mensagens Favoritas</span>
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginLeft: 'auto' }}>{entries.length} msg{entries.length !== 1 ? 's' : ''}</span>
              </div>
              {entries.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 40, color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>
                  <div style={{ fontSize: 28, marginBottom: 8 }}>⭐</div>
                  Nenhuma mensagem favorita.<br/>Passe o mouse em uma mensagem e clique na estrela.
                </div>
              ) : Object.entries(grouped).map(([convId, group]) => (
                <div key={convId}>
                  <div style={{ padding: '6px 12px 3px', fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    {group.convName}
                  </div>
                  {group.msgs.map(entry => (
                    <div
                      key={entry.msgId}
                      className="lc-starred-msg-item"
                      onClick={() => {
                        setShowStarredPanel(false);
                        setActiveId(convId);
                        if (usingRealData && !convId.startsWith('chan-')) loadMsgs(convId);
                      }}
                    >
                      <div className={`lc-starred-msg-dir${entry.from === 'out' ? ' out' : ''}`}>
                        {entry.from === 'out' ? '↑' : '↓'}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.75)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {entry.text || (entry.mediaType === 'image' ? '🖼 Imagem' : entry.mediaType?.includes('audio') ? '🎵 Áudio' : entry.mediaType === 'video' ? '🎬 Vídeo' : '📄 Documento')}
                        </div>
                        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>{entry.time}</div>
                      </div>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="#FBBF24" stroke="#FBBF24" strokeWidth="1.5" style={{ flexShrink: 0 }}>
                        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                      </svg>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          );
        })()}

        {/* Barra de seleção em massa */}
        {selectMode ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'rgba(183,12,0,0.1)', borderBottom: '1px solid rgba(183,12,0,0.25)' }}>
            <button
              onClick={() => {
                if (selectedConvIds.size === filtered.length) setSelectedConvIds(new Set());
                else setSelectedConvIds(new Set(filtered.map(c => c.id)));
              }}
              style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, padding: '3px 8px', cursor: 'pointer', flexShrink: 0 }}
            >
              {selectedConvIds.size === filtered.length ? 'Desmarcar' : 'Todos'}
            </button>
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', flex: 1 }}>
              {selectedConvIds.size} selecionado{selectedConvIds.size !== 1 ? 's' : ''}
            </span>
            <button
              onClick={handleBulkFinalize}
              disabled={selectedConvIds.size === 0 || bulkLoading}
              style={{ fontSize: 11, fontWeight: 700, color: 'white', background: selectedConvIds.size > 0 ? '#B70C00' : 'rgba(255,255,255,0.1)', border: 'none', borderRadius: 6, padding: '4px 10px', cursor: selectedConvIds.size > 0 ? 'pointer' : 'default', opacity: bulkLoading ? 0.6 : 1, flexShrink: 0 }}
            >
              {bulkLoading ? 'Aguarde…' : 'Finalizar'}
            </button>
            <button
              onClick={() => { setSelectMode(false); setSelectedConvIds(new Set()); }}
              style={{ fontSize: 16, color: 'rgba(255,255,255,0.5)', background: 'none', border: 'none', cursor: 'pointer', lineHeight: 1, padding: 2 }}
            >×</button>
          </div>
        ) : (
          <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '4px 12px 0' }}>
            <button
              onClick={() => setSelectMode(true)}
              style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, padding: '2px 0' }}
              title="Selecionar conversas para ações em massa"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
              Selecionar
            </button>
          </div>
        )}

        {/* Lista de conversas */}
        {!showStarredPanel && <div className="lc-list-body dark-scroll">
          {tab === 'fav' && favConvs.size === 0 && (
            <div style={{ textAlign: 'center', padding: 40, color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>⭐</div>
              Nenhuma conversa favorita ainda.<br/>Clique na estrela de uma conversa para favoritar.
            </div>
          )}
          {filtered.map(c => (
            <ConvRow
              key={c.id}
              conv={c}
              active={c.id === activeId}
              statusFilter={statusFilter}
              fav={favConvs.has(c.id)}
              onFav={e => toggleFav(c.id, e)}
              selectMode={selectMode}
              selected={selectedConvIds.has(c.id)}
              onSelect={() => setSelectedConvIds(prev => {
                const next = new Set(prev);
                next.has(c.id) ? next.delete(c.id) : next.add(c.id);
                return next;
              })}
              onClick={() => {
                setActiveId(c.id);
                setMobilePane('chat');
                if (usingRealData && !c.id.startsWith('chan-')) loadMsgs(c.id);
              }}
            />
          ))}
          {filtered.length === 0 && (
            <div style={{ textAlign: 'center', padding: 36, color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>
              Sem conversas neste filtro
            </div>
          )}
        </div>}
      </aside>

      {/* ─── COL 2: Área de chat ──────────────────────────────── */}
      {active ? (
        <section className="lc-chat" style={{ gridArea: 'chat', position: 'relative' }}>

          {isChannel ? (
            /* ── Canal interno ──────────────────────────────── */
            <>
              <header className="lc-chat-head">
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                  <button className="lc-back-btn" onClick={() => setMobilePane('list')} title="Voltar">
                    <Icon name="chevleft" size={18} />
                  </button>
                  <ConvAvatar conv={active} size={40} />
                  <div style={{ minWidth: 0 }}>
                    <div className="lc-chat-name">{active.name}</div>
                    <div className="lc-chat-sub">
                      <span>{active.description || 'Canal interno'}</span>
                      {active.isGlobal && <span style={{ marginLeft: 4, fontSize: 10, fontWeight: 700, padding: '1px 5px', borderRadius: 9999, background: 'rgba(37,99,235,0.15)', color: '#93C5FD' }}>Global</span>}
                    </div>
                  </div>
                </div>
                <button className="lc-action-btn" onClick={() => onNavigate?.('grupos')}><Icon name="users" size={13} /> Membros</button>
              </header>

              <div ref={chanScrollRef} className="lc-msgs dark-scroll">
                {activeChanMsgs.length === 0 && (
                  <div style={{ textAlign: 'center', padding: 40, color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>
                    Nenhuma mensagem ainda. Seja o primeiro a escrever! 👋
                  </div>
                )}
                {activeChanMsgs.map(msg => (
                  <div key={msg.id} className="lc-msg-row in slide-up">
                    <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#374151', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 11, color: 'white', flexShrink: 0 }}>
                      {(msg.sender_name || '?').slice(0, 2).toUpperCase()}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', maxWidth: '72%' }}>
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', fontWeight: 600, marginBottom: 3 }}>
                        {msg.sender_name || 'Equipe'} <span style={{ marginLeft: 6, opacity: 0.6 }}>{new Date(msg.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                      <div className="lc-bubble in">{msg.text}</div>
                    </div>
                  </div>
                ))}
              </div>

              <footer className="lc-composer-bar">
                <div className="lc-composer">
                  <div className="lc-comp-input-wrap">
                    <textarea value={chanDraft} onChange={e => setChanDraft(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChanMsg(); } }} className="lc-comp-input" placeholder={`Mensagem para ${active.name}…`} rows={1} />
                  </div>
                  <button onClick={sendChanMsg} className={`lc-comp-send${chanDraft.trim() ? ' ready' : ''}`} disabled={!chanDraft.trim()}>
                    <Icon name="send" size={15} />
                  </button>
                </div>
              </footer>
            </>
          ) : (
            /* ── WhatsApp / DM ─────────────────────────────── */
            <>
              {/* Header do chat */}
              <header className="lc-chat-head">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0, overflow: 'hidden' }}>
                  <button className="lc-back-btn" onClick={() => setMobilePane('list')} title="Voltar">
                    <Icon name="chevleft" size={18} />
                  </button>
                  <ConvAvatar conv={active} size={28} style={{ flexShrink: 0 }} />
                  <div style={{ minWidth: 0, overflow: 'hidden' }}>
                    <div className="lc-chat-name">{active.name}</div>
                    <div className="lc-chat-sub">
                      {active.type === 'whatsapp' && <span className="lc-wa-mini" style={{ flexShrink: 0 }}><Icon name="whatsapp" size={10} /></span>}
                      {active.type === 'group'    && <Icon name="users" size={12} style={{ flexShrink: 0 }} />}
                      {active.whatsapp_chat_id && <code style={{ fontSize: 10, background: 'rgba(255,255,255,0.06)', padding: '1px 5px', borderRadius: 3 }}>{active.whatsapp_chat_id.split('@')[0]}</code>}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                  <button className="lc-icon-btn-dark" onClick={() => runCommand('/resumir')} title="Resumir conversa">
                    <Icon name="sparkles" size={15} />
                  </button>
                  <button className="lc-icon-btn-dark" onClick={() => runCommand('/proxima')} title="Próxima ação">
                    <Icon name="arrowright" size={15} />
                  </button>
                  <div style={{ width: 1, height: 18, background: 'rgba(255,255,255,0.1)', margin: '0 2px' }} />
                  {(active.type === 'whatsapp' || active.type === 'group') && (
                    <DepartmentSelector dark conversationId={active.id} tenantId={tenantDbId} currentDepartmentId={active.department_id ?? null} onChanged={async dept => {
                      const oldDept = departments.find(d => d.id === active.department_id);
                      setConvs(prev => prev.map(c => c.id === active.id ? { ...c, department_id: dept.id } : c));
                      await insertEvent(active.id, 'transferred', { dept_from: oldDept?.name || null, dept_to: dept.name || null });
                    }} />
                  )}
                  <span className="lc-protocol">#{active.id?.slice(-5) || '00000'}</span>
                  {convStatus === 'finalizado' ? (
                    <button className="lc-action-btn" onClick={async () => { const { error } = await changeStatus('atendimento_aberto'); if (!error) { addSystemMsg(activeId, 'reabriu o atendimento'); await insertEvent(activeId, 'reopened'); setConvs(prev => prev.map(c => c.id === activeId ? { ...c, status: 'atendimento_aberto', status_v2: 'in_progress' } : c)); } }} disabled={statusLoading}>
                      <Icon name="refresh" size={13} /> Reabrir
                    </button>
                  ) : (
                    <button className="lc-action-btn primary" onClick={async () => { const { error } = await finish(); if (!error) { addSystemMsg(activeId, 'finalizou o atendimento'); await insertEvent(activeId, 'closed'); setConvs(prev => prev.map(c => c.id === activeId ? { ...c, status: 'finalizado', status_v2: 'closed' } : c)); setResolved(r => ({ ...r, [activeId]: true })); } }} disabled={statusLoading}>
                      <Icon name="check" size={13} /> {resolved[activeId] ? 'Finalizado' : 'Finalizar'}
                    </button>
                  )}
                  {!active?.is_group && active?.last_breno_handled_at && (
                    <button
                      className="lc-action-btn"
                      onClick={toggleBrenoPause}
                      title={active.breno_paused ? 'Liberar BRENO para esta conversa' : 'Pausar BRENO nesta conversa'}
                      style={{ background: active.breno_paused ? 'rgba(107,114,128,0.15)' : 'rgba(168,85,247,0.12)', color: active.breno_paused ? '#9CA3AF' : '#C084FC', border: `1px solid ${active.breno_paused ? 'rgba(107,114,128,0.2)' : 'rgba(168,85,247,0.3)'}` }}
                    >
                      {active.breno_paused ? '▶ Liberar BRENO' : '⏸ Pausar BRENO'}
                    </button>
                  )}
                  <button className="lc-icon-btn-dark" title="Mais"><Icon name="chevdown" size={16} style={{ transform: 'rotate(90deg)' }} /></button>
                </div>
              </header>

              {/* AI action banner */}
              {aiAction && (
                <div className="lc-ai-result fade-in">
                  <button className="lc-ai-result-close" onClick={() => setAiAction(null)}><Icon name="x" size={12} /></button>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                    <AgentAvatar id="deli" size={28} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, color: 'var(--red-light)', fontWeight: 700, marginBottom: 4 }}>DELI · {aiAction.title}</div>
                      {aiAction.type === 'tone' ? (
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {['Mais formal', 'Mais amigável', 'Mais curto', 'Mais empático', 'Mais técnico'].map(t => (
                            <button key={t} className="lc-tone-btn">{t}</button>
                          ))}
                        </div>
                      ) : (
                        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: 'rgba(255,255,255,0.85)', lineHeight: 1.6 }}>
                          {aiAction.body.map((b, i) => <li key={i}>{b}</li>)}
                        </ul>
                      )}
                      {aiAction.type === 'next' && (
                        <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                          <button className="lc-ai-cta">Aplicar sugestão</button>
                          <button className="lc-ai-cta ghost">Editar</button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* BRENO suggestion banner */}
              {brenoSuggestion && (
                <div className="lc-ai-result fade-in" style={{ borderLeft: '3px solid #A855F7' }}>
                  <button className="lc-ai-result-close" onClick={() => dismissBrenoSuggestion(brenoSuggestion.id)}><Icon name="x" size={12} /></button>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                    <AgentAvatar id="breno" size={28} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, color: '#C084FC', fontWeight: 700, marginBottom: 4 }}>BRENO · Resposta sugerida</div>
                      <p style={{ margin: 0, fontSize: 13, color: 'rgba(255,255,255,0.85)', lineHeight: 1.6 }}>{brenoSuggestion.breno_response}</p>
                      <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                        <button className="lc-ai-cta" onClick={() => { setDraft(brenoSuggestion.breno_response); setBrenoSuggestion(null); }}>Usar resposta</button>
                        <button className="lc-ai-cta ghost" onClick={() => dismissBrenoSuggestion(brenoSuggestion.id)}>Dispensar</button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Mensagens */}
              <div style={{ position: 'relative', flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
              <div ref={scrollRef} className="lc-msgs dark-scroll"
                onScroll={() => {
                  const el = scrollRef.current;
                  if (!el) return;
                  const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
                  setShowScrollBtn(dist > 120);
                }}
              >
                {activeMsgs.length === 0 && (
                  <div style={{ textAlign: 'center', padding: 40, color: 'rgba(255,255,255,0.35)', fontSize: 13 }}>
                    Nenhuma mensagem ainda
                  </div>
                )}
                {activeMsgs.reduce((acc, m, i) => {
                  const rawTs = m._ts;
                  const msgDate = rawTs ? new Date(rawTs) : null;
                  const validMsgDate = msgDate && !isNaN(msgDate.getTime()) ? msgDate : null;
                  const prevRawTs = i > 0 ? activeMsgs[i - 1]._ts : null;
                  const prevDate = prevRawTs ? new Date(prevRawTs) : null;
                  const validPrevDate = prevDate && !isNaN(prevDate.getTime()) ? prevDate : null;
                  const isDifferentDay = validMsgDate && (!validPrevDate || validMsgDate.toDateString() !== validPrevDate.toDateString());
                  if (isDifferentDay) {
                    acc.push(
                      <div key={`sep-${i}`} className="lc-day-sep">
                        <span>{fmtEventDate(validMsgDate)}</span>
                      </div>
                    );
                  }
                  acc.push(
                    <MsgBubble
                      key={m.id || i}
                      m={m}
                      conv={active}
                      starred={!!starredMsgs[`${activeId}:${m.id}`]}
                      onStar={() => toggleStarMsg(m)}
                      onDelete={deleteMsg}
                      onReply={msg => { setReplyTo(msg); setTimeout(() => textareaRef.current?.focus(), 30); }}
                      onViewImage={url => setLightboxUrl(url)}
                      onCreateTask={msg => console.log('criar tarefa:', msg.text)}
                      onResumirMsg={() => runCommand('/resumir')}
                      onTraduzirMsg={() => runCommand('/traduzir')}
                      onForward={msg => setForwardMsg(msg)}
                    />
                  );
                  return acc;
                }, [])}
                {typing && (
                  <div className="lc-msg-row in fade-in">
                    <ConvAvatar conv={active} size={28} />
                    <div className="lc-bubble in" style={{ display: 'inline-flex', gap: 4, padding: '12px 14px' }}>
                      <span className="lc-typ-dot" style={{ animationDelay: '0s' }} />
                      <span className="lc-typ-dot" style={{ animationDelay: '0.15s' }} />
                      <span className="lc-typ-dot" style={{ animationDelay: '0.3s' }} />
                    </div>
                  </div>
                )}
              </div>

              {/* Botão ir para mensagem mais recente */}
              {showScrollBtn && (
                <button
                  onClick={() => {
                    const el = scrollRef.current;
                    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
                    setShowScrollBtn(false);
                  }}
                  style={{
                    position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)',
                    background: '#B70C00', color: 'white', border: 'none', borderRadius: 20,
                    padding: '6px 16px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: 6,
                    boxShadow: '0 4px 16px rgba(0,0,0,0.5)', zIndex: 10,
                    animation: 'fadeIn .15s ease',
                  }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9" transform="rotate(180,12,12)"/></svg>
                  Mensagem mais recente
                </button>
              )}
              </div>

              {/* Modo banner */}
              {aiMode !== 'humano' && active && !isChannel && (
                <div style={{ background: aiMode === 'ia' ? 'rgba(183,12,0,0.13)' : 'rgba(139,92,246,0.1)', borderTop: '1px solid rgba(255,255,255,0.05)', padding: '6px 16px', display: 'flex', alignItems: 'center', gap: 8, fontSize: 11 }}>
                  <span style={{ fontSize: 13 }}>{aiMode === 'ia' ? '🤖' : '✨'}</span>
                  <span style={{ color: aiMode === 'ia' ? '#FF8080' : '#C4B5FD', fontWeight: 600, flex: 1 }}>
                    {aiMode === 'ia'
                      ? 'Modo IA — DELI está respondendo automaticamente'
                      : 'Modo Híbrido — DELI vai sugerir resposta quando cliente escrever (Tab para aceitar)'}
                  </span>
                  <button onClick={() => setAiMode('humano')} style={{ color: 'rgba(255,255,255,0.35)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, padding: '2px 6px' }}>
                    Voltar ao Humano
                  </button>
                </div>
              )}

              {/* Composer */}
              <footer className="lc-composer-bar" style={{ position: 'relative' }}>
                {/* Popovers */}
                {showSlash && (
                  <div className="lc-popover lc-slash">
                    <div className="lc-pop-head">Comandos IA</div>
                    {AI_COMMANDS.map(c => (
                      <button key={c.cmd} className="lc-pop-item" onClick={() => runCommand(c.cmd)}>
                        <Icon name={c.icon} size={14} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, color: 'white', fontWeight: 600 }}>{c.label}</div>
                          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)' }}>{c.desc}</div>
                        </div>
                        <kbd className="lc-kbd">{c.cmd}</kbd>
                      </button>
                    ))}
                  </div>
                )}
                {showMention && (
                  <div className="lc-popover lc-mention">
                    <div className="lc-pop-head">Mencionar superagente</div>
                    {AI_SUPERAGENTS.map(a => (
                      <button key={a.id} className="lc-pop-item" onClick={() => insertMention(a.id)}>
                        <AgentAvatar id={a.id} size={22} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, color: 'white', fontWeight: 600 }}>@{a.name}</div>
                          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)' }}>{a.desc}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
                {showQR && (
                  <div className="lc-popover lc-qr">
                    <div className="lc-pop-head">Respostas rápidas</div>
                    {(quickReplies.length > 0 ? quickReplies : QUICK_REPLIES_DEFAULT).map(qr => (
                      <button key={qr.id} className="lc-pop-item" onClick={() => insertQR(qr)}>
                        <Icon name="star" size={14} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, color: 'white', fontWeight: 600 }}>{qr.title || qr.label}</div>
                          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{qr.content || qr.text}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {/* DELI suggestion tip */}
                {showGhost && (
                  <div className="lc-deli-tip">
                    <AgentAvatar id="deli" size={20} />
                    <span><strong style={{ color: 'var(--red-light)' }}>DELI sugeriu</strong> — pressione <kbd>Tab</kbd> para aceitar</span>
                  </div>
                )}

                {/* Inputs de arquivo ocultos */}
                <input ref={fileInputRef}    type="file" accept="image/*,video/*,application/pdf,.doc,.docx" style={{ display: 'none' }} onChange={handleFileSelect} />
                <input ref={galleryInputRef} type="file" accept="image/*,video/*"                            style={{ display: 'none' }} onChange={handleFileSelect} />
                <input ref={cameraInputRef}  type="file" accept="image/*" capture="camera"                  style={{ display: 'none' }} onChange={handleFileSelect} />

                {/* Reply preview — acima do compositor */}
                {replyTo && (
                  <div className="lc-reply-banner">
                    <div className="lc-reply-bar" />
                    <div className="lc-reply-content">
                      <div className="lc-reply-name">{replyTo.agentName || (replyTo.from === 'out' ? 'Você' : (active?.name || 'Cliente'))}</div>
                      <div className="lc-reply-text">{replyTo.text || (replyTo.mediaType ? '🖼 Mídia' : '…')}</div>
                    </div>
                    <button className="lc-reply-close" onClick={() => setReplyTo(null)} title="Cancelar resposta">
                      <Icon name="x" size={13} />
                    </button>
                  </div>
                )}

                {pasteImage ? (
                  <div className="lc-paste-preview">
                    <button
                      className="lc-paste-cancel"
                      title="Cancelar"
                      onClick={() => { URL.revokeObjectURL(pasteImage.previewUrl); setPasteImage(null); setPasteCaption(''); }}
                    >
                      <Icon name="x" size={14} />
                    </button>
                    <img src={pasteImage.previewUrl} alt="preview" className="lc-paste-thumb" />
                    <input
                      ref={pasteCaptionRef}
                      className="lc-paste-caption"
                      placeholder="Adicionar legenda (opcional)…"
                      value={pasteCaption}
                      onChange={e => setPasteCaption(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendPasteImage(); } if (e.key === 'Escape') { URL.revokeObjectURL(pasteImage.previewUrl); setPasteImage(null); setPasteCaption(''); } }}
                    />
                    <button
                      className="lc-comp-send ready"
                      title="Enviar imagem"
                      onClick={sendPasteImage}
                      disabled={sending}
                    >
                      <Icon name="send" size={15} />
                    </button>
                  </div>
                ) : recState === 'preview' ? (
                  <div className="lc-composer lc-composer-rec">
                    {/* hidden audio element para controle de playback */}
                    <audio
                      ref={audioElRef}
                      src={audioPreview}
                      onLoadedMetadata={e => setRecDuration(Math.round(e.target.duration))}
                      onTimeUpdate={e => setRecCurrentTime(Math.round(e.target.currentTime))}
                      onEnded={() => setRecPlaying(false)}
                      style={{ display: 'none' }}
                    />
                    <button onClick={discardAudio} className="lc-comp-icon lc-rec-cancel" title="Descartar áudio">
                      <Icon name="trash" size={16} />
                    </button>
                    <div className="lc-rec-indicator">
                      <button onClick={togglePlayPreview} className="lc-rec-play-btn" title={recPlaying ? 'Pausar' : 'Ouvir'}>
                        {recPlaying
                          ? <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
                          : <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                        }
                      </button>
                      <div className="lc-rec-seek-wrap">
                        <input
                          type="range" min={0} max={recDuration || 1} value={recCurrentTime}
                          className="lc-rec-seek"
                          onChange={e => {
                            const t = Number(e.target.value);
                            if (audioElRef.current) audioElRef.current.currentTime = t;
                            setRecCurrentTime(t);
                          }}
                        />
                      </div>
                      <span className="lc-rec-time">
                        {recPlaying ? formatRecTime(recCurrentTime) : formatRecTime(recDuration)}
                      </span>
                    </div>
                    <button onClick={confirmSendAudio} className="lc-comp-send ready" title="Enviar áudio" disabled={sending}>
                      <Icon name="send" size={15} />
                    </button>
                  </div>
                ) : recState === 'recording' ? (
                  <div className="lc-composer lc-composer-rec">
                    <button onClick={cancelRecording} className="lc-comp-icon lc-rec-cancel" title="Cancelar gravação">
                      <Icon name="x" size={16} />
                    </button>
                    <div className="lc-rec-indicator">
                      <span className="lc-rec-dot" />
                      <div className="lc-rec-waves">
                        {[...Array(6)].map((_, i) => <span key={i} className="lc-rec-wave" style={{ animationDelay: `${i * 0.12}s` }} />)}
                      </div>
                      <span className="lc-rec-time">{formatRecTime(recSeconds)}</span>
                    </div>
                    <button onClick={stopRecording} className="lc-comp-send ready" title="Parar gravação">
                      <Icon name="squarestop" size={15} />
                    </button>
                  </div>
                ) : (
                  <div className="lc-composer">
                    <button className="lc-comp-icon" title="Anexar arquivo" onClick={() => fileInputRef.current?.click()}>
                      <Icon name="paperclip" size={15} />
                    </button>
                    <button className="lc-comp-icon" title="Enviar foto da galeria" onClick={() => galleryInputRef.current?.click()}>
                      <Icon name="image" size={15} />
                    </button>
                    <button className="lc-comp-icon" title="Tirar foto com câmera" onClick={() => cameraInputRef.current?.click()}>
                      <Icon name="camera" size={15} />
                    </button>
                    <span className="lc-comp-sep" />
                    <button className="lc-comp-icon" title="Resposta rápida" onClick={() => setShowQR(v => !v)}><Icon name="star" size={15} /></button>
                    <button className="lc-comp-icon ai" title="Comandos IA (/)" onClick={() => setShowSlash(v => !v)}><Icon name="sparkles" size={15} /></button>
                    <div className="lc-comp-input-wrap">
                      <textarea
                        ref={textareaRef}
                        value={draft}
                        onChange={e => onDraftChange(e.target.value)}
                        onKeyDown={onKeyDown}
                        onPaste={handleComposerPaste}
                        className="lc-comp-input"
                        placeholder={aiMode === 'ia' ? 'IA respondendo automaticamente…' : 'Escreva uma mensagem…'}
                        rows={1}
                        disabled={aiMode === 'ia' || sending}
                      />
                      {showGhost && <div className="lc-comp-ghost">{suggestion}</div>}
                    </div>
                    <div style={{ position: 'relative' }}>
                      <button className="lc-comp-icon" title="Emoji" onClick={() => setShowEmoji(v => !v)}><Icon name="smile" size={15} /></button>
                      {showEmoji && <EmojiPicker onSelect={em => { insertEmoji(em); }} onClose={() => setShowEmoji(false)} />}
                    </div>
                    {draft.trim() ? (
                      <button onClick={send} className="lc-comp-send ready" disabled={sending} title="Enviar">
                        <Icon name="send" size={15} />
                      </button>
                    ) : (
                      <button onClick={startRecording} className="lc-comp-send lc-comp-mic" title="Gravar áudio">
                        <Icon name="mic" size={15} />
                      </button>
                    )}
                  </div>
                )}
              </footer>
            </>
          )}

          {/* ─── AI Side Panel ──────────────────────────────── */}
          {showAiPanel && (
            <AiSidePanel
              convName={active?.name}
              msgs={activeMsgs}
              onClose={() => setShowAiPanel(false)}
              onRunCmd={async (cmd, cb) => {
                const BRIDGE_URL = import.meta.env.VITE_BRIDGE_URL || '';
                try {
                  const { data: { session } } = await supabase.auth.getSession();
                  const jwt = session?.access_token;
                  const r = await fetch(`${BRIDGE_URL}/chat/ai`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
                    body: JSON.stringify({ command: cmd, messages: activeMsgs.slice(-30), conversation_id: active?.id, tenant_id: active?.tenant_id }),
                  });
                  const data = await r.json();
                  if (data.ok) cb(data.title, data.bullets || []);
                  else cb('Erro', [data.error || 'Tente novamente.']);
                } catch (err) { cb('Erro de conexão', [err.message]); }
              }}
            />
          )}
        </section>
      ) : (
        <section className="lc-chat" style={{ gridArea: 'chat', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.35)', fontSize: 14 }}>
            <AgentAvatar id="deli" size={48} />
            <div style={{ marginTop: 16, fontWeight: 600 }}>Selecione uma conversa</div>
            <div style={{ fontSize: 12, marginTop: 6, opacity: 0.7 }}>ou conecte uma instância Evolution</div>
          </div>
        </section>
      )}

      {/* ─── COL 3: Painel direito (inspector) ───────────────── */}
      <aside
        style={{
          gridArea: 'inspector',
          display: 'flex',
          overflow: 'hidden',
          borderLeft: '1px solid rgba(255,255,255,0.06)',
          background: '#181818',
        }}
      >
        {/* Aba de toggle — sempre visível */}
        <button
          onClick={() => setShowInspector(v => !v)}
          title={showInspector ? 'Fechar painel' : 'Abrir painel'}
          style={{
            width: 16, flexShrink: 0, alignSelf: 'stretch',
            background: 'transparent', border: 'none',
            borderRight: showInspector ? '1px solid rgba(255,255,255,0.06)' : 'none',
            color: 'rgba(255,255,255,0.35)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'color 150ms',
          }}
          onMouseEnter={e => { e.currentTarget.style.color = 'white'; }}
          onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.35)'; }}
        >
          <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            {showInspector
              ? <polyline points="9 18 15 12 9 6"/>
              : <polyline points="15 18 9 12 15 6"/>
            }
          </svg>
        </button>
        <div className="lc-inspector dark-scroll" style={{ width: 320, flexShrink: 0, overflowY: 'auto', transform: showInspector ? 'translateX(0)' : 'translateX(100%)', transition: 'transform 220ms ease' }}>
        {active && (
          <>
            <div className="lc-insp-head">
              <ConvAvatar conv={active} size={36} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="lc-insp-name">
                  {active.name}
                  <Icon name="arrowright" size={12} style={{ color: 'rgba(255,255,255,0.4)' }} />
                </div>
                <button className="lc-tag-btn"><Icon name="plus" size={11} /> Adicionar tags</button>
              </div>
            </div>

            {/* Copiloto DELI */}
            {showCopilot && (
              <CollapseSection title="Copiloto DELI" open={openIA} onToggle={() => setOpenIA(v => !v)} accent>
                <div className="lc-copilot-card">
                  {active.type === 'whatsapp' || active.type === 'group' ? (
                    <>
                      <div className="lc-copilot-row">
                        <span className="lc-copilot-k">Status</span>
                        <ConversationStatusBadge status={active.status_v2 || 'open'} />
                      </div>
                      <div className="lc-copilot-row">
                        <span className="lc-copilot-k">Atendente</span>
                        <span className="lc-copilot-v">{STATUS_EMOJI[convStatus] || '❓'} {convStatus || 'aguardando'}</span>
                      </div>
                    </>
                  ) : (
                    <div className="lc-copilot-row">
                      <span className="lc-copilot-k">Canal</span>
                      <span className="lc-copilot-v">{active.name}</span>
                    </div>
                  )}
                  <div className="lc-copilot-row">
                    <span className="lc-copilot-k">Mensagens</span>
                    <span className="lc-copilot-v">{activeMsgs.length}</span>
                  </div>
                </div>
                <div className="lc-copilot-actions">
                  <button className="lc-mini-action" onClick={() => runCommand('/resumir')}><Icon name="sparkles" size={12} /> Resumir agora</button>
                  <button className="lc-mini-action" onClick={() => runCommand('/proxima')}><Icon name="arrowright" size={12} /> Próxima ação</button>
                  <button className="lc-mini-action" onClick={() => runCommand('/tarefa')}><Icon name="check" size={12} /> Criar tarefa</button>
                  <button className="lc-mini-action" onClick={() => runCommand('/cobranca')}><Icon name="dollar" size={12} /> Acionar CORA</button>
                </div>
              </CollapseSection>
            )}

            {/* Ações rápidas */}
            <div className="lc-insp-section">
              <div className="lc-insp-title">Ações</div>
              <div className="lc-actions-grid">
                <button className="lc-mini-action"><Icon name="plus" size={12} /> Adicionar negócio</button>
                <button className="lc-mini-action"><Icon name="sparkles" size={12} /> Executar automação</button>
                <button className="lc-mini-action" onClick={() => onNavigate?.('tasks')}><Icon name="check" size={12} /> Ver tarefas</button>
              </div>
            </div>

            {/* Perfil do cliente */}
            {activeCustomer ? (
              <CollapseSection title="Perfil" open={openPerfil} onToggle={() => setOpenPerfil(v => !v)}>
                <FieldRow label="Nome"      value={activeCustomer.name} />
                <FieldRow label="Telefone"  value={activeCustomer.phone} hint="—" />
                <FieldRow label="E-mail"    value={activeCustomer.email} hint="—" />
                <FieldRow label="Documento" value={activeCustomer.document} hint="—" />
              </CollapseSection>
            ) : active.whatsapp_chat_id ? (
              <CollapseSection title="Perfil" open={openPerfil} onToggle={() => setOpenPerfil(v => !v)}>
                <FieldRow label="Nome"     value={active.name} />
                <FieldRow label="Telefone" value={active.whatsapp_chat_id?.split('@')[0]} hint="—" />
              </CollapseSection>
            ) : null}

            {/* Notas */}
            <CollapseSection title="Notas" open={openNotas} onToggle={() => setOpenNotas(v => !v)}>
              <textarea className="lc-notes" placeholder="Adicione uma nota interna…" />
            </CollapseSection>

            {/* iFood */}
            <CollapseSection title="iFood" open={openIfood} onToggle={() => setOpenIfood(v => !v)}>
              <FieldRow label="ID Loja"     value="—" />
              <FieldRow label="Pedidos 30d" value="—" />
            </CollapseSection>

            {/* Lead Panel (se disponível) */}
            {activeCustomer && active && (
              <LeadPanel conversation={active} customer={activeCustomer} tenantId={tenantDbId} members={members} />
            )}
          </>
        )}
        </div>
      </aside>
    </div>

    {/* Modal de encaminhar mensagem */}
    {forwardMsg && (
      <ForwardModal
        msg={forwardMsg}
        convs={convs}
        currentConvId={activeId}
        onClose={() => setForwardMsg(null)}
        onForward={handleForward}
      />
    )}
    {/* Lightbox de imagem */}
    {lightboxUrl && <ImageLightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />}
    </>
  );
}
