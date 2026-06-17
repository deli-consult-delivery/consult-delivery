import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import ReactDOM from 'react-dom';
import Icon from '../components/Icon.jsx';
import AgentAvatar from '../components/AgentAvatar.jsx';
import CustomSelect from '../components/CustomSelect.jsx';
import { useConversationStatus, STATUS_EMOJI } from '../lib/conversationStatus.js';
import { supabase } from '../lib/supabase.js';
import { sendTextMessage, sendMediaMessage, sendAudioMessage, fetchProfile, fetchGroups, fetchContacts, deleteWhatsAppMessage } from '../lib/evolution.js';
import ConversationFiltersBar from '../components/chat/ConversationFiltersBar.jsx';
import DepartmentSelector from '../components/chat/DepartmentSelector.jsx';
import ConversationStatusBadge from '../components/chat/ConversationStatusBadge.jsx';
import LeadPanel from '../components/chat/LeadPanel.jsx';
import ChatTasksPanel from '../components/chat/ChatTasksPanel.jsx';
import CustomerNotesSection from '../components/chat/CustomerNotesSection.jsx';
import ClienteFocoPanel from '../components/cliente-foco/ClienteFocoPanel.jsx';
import { useLojaPorRemoteJid } from '../hooks/useLojaPorRemoteJid.js';
import { getMuted, isMuted, toggleMute } from '../lib/mutedConvs.js';
import TarefasClientesScreen from './TarefasClientesScreen.jsx';

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
    users: <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></>,
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
function VideoPlayer({ src, text }) {
  const [blobUrl, setBlobUrl] = useState(null);

  useEffect(() => {
    if (!src) return;
    if (src.startsWith('data:')) {
      const [header, b64] = src.split(',');
      const mime = header.match(/:(.*?);/)?.[1] || 'video/mp4';
      const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: mime });
      const url = URL.createObjectURL(blob);
      setBlobUrl(url);
      return () => URL.revokeObjectURL(url);
    } else {
      setBlobUrl(src);
    }
  }, [src]);

  const handleDownload = () => {
    if (!blobUrl) return;
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = text || 'video.mp4';
    a.click();
  };

  return (
    <div style={{ marginBottom: text ? 6 : 0 }}>
      {blobUrl ? (
        <video src={blobUrl} controls style={{ maxWidth: 260, borderRadius: 8, display: 'block' }} />
      ) : (
        <div style={{ width: 260, height: 140, borderRadius: 8, background: 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>
          {src ? 'Carregando vídeo…' : 'Aguardando vídeo…'}
        </div>
      )}
      {blobUrl && (
        <button onClick={handleDownload} style={{ marginTop: 5, display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'rgba(255,255,255,0.55)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          Baixar vídeo
        </button>
      )}
    </div>
  );
}

// ─── SMART IMAGE (handles HEIC → JPEG conversion) ─────────────
function SmartImage({ src, alt, marginBottom, onViewImage, showDownload, downloadName }) {
  const [displaySrc, setDisplaySrc] = useState(null);
  const blobUrlRef = useRef(null);

  useEffect(() => {
    if (!src) return;
    const isHeic = /data:image\/(heic|heif)/i.test(src);
    if (!isHeic) { setDisplaySrc(src); return; }
    let cancelled = false;
    import('heic2any').then(async ({ default: h2a }) => {
      const [, b64] = src.split(',');
      const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: 'image/heic' });
      const out = await h2a({ blob, toType: 'image/jpeg', quality: 0.85 });
      const jpegBlob = Array.isArray(out) ? out[0] : out;
      const url = URL.createObjectURL(jpegBlob);
      blobUrlRef.current = url;
      if (!cancelled) setDisplaySrc(url);
    }).catch(() => { if (!cancelled) setDisplaySrc(src); });
    return () => {
      cancelled = true;
      if (blobUrlRef.current) { URL.revokeObjectURL(blobUrlRef.current); blobUrlRef.current = null; }
    };
  }, [src]);

  const handleDownload = (e) => {
    e.stopPropagation();
    if (!displaySrc) return;
    const a = document.createElement('a');
    a.href = displaySrc;
    a.download = (downloadName || 'imagem').replace(/\.(heic|heif)$/i, '.jpg');
    a.click();
  };

  return (
    <div style={{ position: 'relative', display: 'inline-block', marginBottom }} className="lc-media-wrap">
      {displaySrc
        ? <img src={displaySrc} alt={alt || 'imagem'} style={{ maxWidth: 260, maxHeight: 200, borderRadius: 8, cursor: 'pointer', display: 'block' }} onClick={() => onViewImage?.(displaySrc)} />
        : <div style={{ width: 200, height: 120, borderRadius: 8, background: 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{src ? 'Convertendo…' : 'Aguardando…'}</span>
          </div>}
      {showDownload && displaySrc && (
        <a onClick={handleDownload} title="Baixar imagem" className="lc-media-dl" style={{ cursor: 'pointer' }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
        </a>
      )}
    </div>
  );
}

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

const WA_REGEX = /(\*[^*\n]+\*|_[^_\n]+_|~[^~\n]+~|`[^`\n]+`|https?:\/\/[^\s<>"')\]]+|www\.[^\s<>"')\]]+)/g;

function formatWhatsApp(text) {
  if (!text) return null;
  const lines = text.split('\n');
  const result = [];
  lines.forEach((line, lineIdx) => {
    if (lineIdx > 0) result.push(<br key={`br-${lineIdx}`} />);
    if (!line) return;
    let last = 0;
    let match;
    WA_REGEX.lastIndex = 0;
    while ((match = WA_REGEX.exec(line)) !== null) {
      if (match.index > last) result.push(line.slice(last, match.index));
      const token = match[0];
      const key = `wa-${lineIdx}-${match.index}`;
      if (token.startsWith('*') && token.endsWith('*')) {
        result.push(<strong key={key} style={{ fontWeight: 700 }}>{token.slice(1, -1)}</strong>);
      } else if (token.startsWith('_') && token.endsWith('_')) {
        result.push(<em key={key}>{token.slice(1, -1)}</em>);
      } else if (token.startsWith('~') && token.endsWith('~')) {
        result.push(<del key={key}>{token.slice(1, -1)}</del>);
      } else if (token.startsWith('`') && token.endsWith('`')) {
        result.push(<code key={key} style={{ background: 'rgba(255,255,255,0.1)', borderRadius: 3, padding: '0 3px', fontFamily: 'monospace', fontSize: '0.9em' }}>{token.slice(1, -1)}</code>);
      } else {
        const href = token.startsWith('http') ? token : `https://${token}`;
        result.push(<a key={key} href={href} target="_blank" rel="noopener noreferrer" style={{ color: '#60A5FA', textDecoration: 'underline', wordBreak: 'break-all' }}>{token}</a>);
      }
      last = match.index + token.length;
    }
    if (last < line.length) result.push(line.slice(last));
  });
  return result.length ? result : null;
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
      <div style={{ background: '#1F1F1F', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, width: 'min(380px, 95vw)', padding: 24 }} onClick={e => e.stopPropagation()}>
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

const EXTRA_DAYS = [
  { key: 'mon', label: 'Seg' }, { key: 'tue', label: 'Ter' }, { key: 'wed', label: 'Qua' },
  { key: 'thu', label: 'Qui' }, { key: 'fri', label: 'Sex' }, { key: 'sat', label: 'Sáb' }, { key: 'sun', label: 'Dom' },
];

function BotsScreen({ tenantDbId }) {
  const [isActive, setIsActive]               = useState(false);
  const [schedule, setSchedule]               = useState(DEFAULT_SCHEDULE);
  const [message, setMessage]                 = useState('Olá! No momento estamos fora do horário de atendimento. Em breve um consultor irá te atender. 🚀');
  const [respondOnlyFirst, setRespondOnlyFirst] = useState(true);
  const [extraMessages, setExtraMessages]     = useState([]);
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
        setExtraMessages(data.extra_messages ?? []);
      });
  }, [tenantDbId]);

  function setDay(key, field, value) {
    setSchedule(prev => ({ ...prev, [key]: { ...prev[key], [field]: value } }));
  }

  function addExtra() {
    setExtraMessages(prev => [...prev, {
      id: crypto.randomUUID(),
      label: 'Novo horário',
      days: ['mon', 'tue', 'wed', 'thu', 'fri'],
      start: '12:00',
      end: '13:00',
      message: '',
      alwaysOn: false,
    }]);
  }

  function updateExtra(id, field, value) {
    setExtraMessages(prev => prev.map(e => e.id === id ? { ...e, [field]: value } : e));
  }

  function toggleExtraDay(id, dayKey) {
    setExtraMessages(prev => prev.map(e => {
      if (e.id !== id) return e;
      const days = e.days.includes(dayKey) ? e.days.filter(d => d !== dayKey) : [...e.days, dayKey];
      return { ...e, days };
    }));
  }

  function removeExtra(id) {
    setExtraMessages(prev => prev.filter(e => e.id !== id));
  }

  async function save() {
    if (!tenantDbId || saving) return;
    setSaving(true);
    try {
      const { error: saveErr } = await supabase.from('bot_configs').upsert({
        tenant_id:          tenantDbId,
        is_active:          isActive,
        schedule,
        message,
        respond_only_first: respondOnlyFirst,
        extra_messages:     extraMessages,
        updated_at:         new Date().toISOString(),
      }, { onConflict: 'tenant_id' });
      if (saveErr) { alert('Erro ao salvar: ' + saveErr.message); return; }
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
          style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: 'white', padding: '10px 12px', fontSize: 13, resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box', outline: 'none', whiteSpace: 'pre-wrap' }}
          placeholder="Mensagem enviada ao cliente fora do horário de atendimento…"
        />
        <div style={{ marginTop: 6, fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>{message.length} caracteres</div>
      </div>

      {/* Outros horários */}
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div>
            <div style={{ color: 'white', fontWeight: 600, fontSize: 13 }}>Outros horários</div>
            <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, marginTop: 3 }}>Ex: horário de almoço, feriado específico — cada período com sua própria mensagem</div>
          </div>
          <button onClick={addExtra} style={{ background: 'rgba(255,255,255,0.08)', color: 'white', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6, padding: '5px 12px', fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap' }}>+ Adicionar</button>
        </div>
        {extraMessages.length === 0 && (
          <div style={{ color: 'rgba(255,255,255,0.25)', fontSize: 12, textAlign: 'center', padding: '12px 0' }}>Nenhum horário extra configurado</div>
        )}
        {extraMessages.map((ex, idx) => (
          <div key={ex.id} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 8, padding: '12px 14px', marginBottom: idx < extraMessages.length - 1 ? 10 : 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <input
                value={ex.label}
                onChange={e => updateExtra(ex.id, 'label', e.target.value)}
                placeholder="Nome do horário (ex: Almoço)"
                style={{ flex: 1, background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: 'white', padding: '5px 10px', fontSize: 12, outline: 'none' }}
              />
              <button onClick={() => removeExtra(ex.id)} style={{ background: 'rgba(183,12,0,0.2)', color: '#ff6b6b', border: '1px solid rgba(183,12,0,0.3)', borderRadius: 6, padding: '4px 10px', fontSize: 11, cursor: 'pointer' }}>Remover</button>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
              {EXTRA_DAYS.map(d => (
                <label key={d.key} style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={ex.days.includes(d.key)}
                    onChange={() => toggleExtraDay(ex.id, d.key)}
                    style={{ accentColor: '#B70C00', cursor: 'pointer' }}
                  />
                  <span style={{ color: ex.days.includes(d.key) ? 'white' : 'rgba(255,255,255,0.35)', fontSize: 11 }}>{d.label}</span>
                </label>
              ))}
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', marginBottom: 10 }}>
              <input
                type="checkbox"
                checked={!!ex.alwaysOn}
                onChange={e => updateExtra(ex.id, 'alwaysOn', e.target.checked)}
                style={{ accentColor: '#B70C00', cursor: 'pointer' }}
              />
              <span style={{ color: ex.alwaysOn ? 'white' : 'rgba(255,255,255,0.4)', fontSize: 11 }}>
                Sempre ativo nestes dias (dia todo)
              </span>
            </label>
            {!ex.alwaysOn && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <input
                  type="time"
                  value={ex.start}
                  onChange={e => updateExtra(ex.id, 'start', e.target.value)}
                  style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: 'white', padding: '3px 8px', fontSize: 12, colorScheme: 'dark' }}
                />
                <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 11 }}>até</span>
                <input
                  type="time"
                  value={ex.end}
                  onChange={e => updateExtra(ex.id, 'end', e.target.value)}
                  style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: 'white', padding: '3px 8px', fontSize: 12, colorScheme: 'dark' }}
                />
              </div>
            )}
            <textarea
              value={ex.message}
              onChange={e => updateExtra(ex.id, 'message', e.target.value)}
              rows={3}
              placeholder="Mensagem enviada neste período…"
              style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: 'white', padding: '8px 10px', fontSize: 12, resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box', outline: 'none', whiteSpace: 'pre-wrap' }}
            />
          </div>
        ))}
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
      position: 'absolute', top: 0, right: 0, bottom: 0, width: 'min(340px, 95vw)',
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
  const [selected, setSelected] = useState(new Set());

  const allTargets = convs.filter(c =>
    c.id !== currentConvId &&
    (c.type === 'whatsapp' || c.type === 'group') &&
    c.whatsapp_chat_id
  );
  const visible = allTargets.filter(c =>
    !search || c.name.toLowerCase().includes(search.toLowerCase())
  );
  const pvs    = visible.filter(c => c.type === 'whatsapp');
  const grupos = visible.filter(c => c.type === 'group');

  const toggle = id => setSelected(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const handleSend = () => {
    const targets = allTargets.filter(c => selected.has(c.id));
    if (targets.length) onForward(targets);
  };

  const renderItem = c => (
    <button
      key={c.id}
      onClick={() => toggle(c.id)}
      style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '9px 16px', background: selected.has(c.id) ? 'rgba(255,255,255,0.06)' : 'none', borderBottom: '1px solid rgba(255,255,255,0.04)', cursor: 'pointer', textAlign: 'left' }}
    >
      <ConvAvatar conv={c} size={32} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: 'white', fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</div>
        <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>{c.preview || '—'}</div>
      </div>
      <div style={{ width: 18, height: 18, borderRadius: 4, border: `2px solid ${selected.has(c.id) ? '#E53E3E' : 'rgba(255,255,255,0.25)'}`, background: selected.has(c.id) ? '#E53E3E' : 'transparent', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {selected.has(c.id) && (
          <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
            <path d="M1 4l3 3 5-6" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        )}
      </div>
    </button>
  );

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <div style={{ background: '#1F1F1F', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, width: 'min(380px, 95vw)', maxHeight: 560, display: 'flex', flexDirection: 'column', overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: '14px 16px 10px', borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: 'white', fontWeight: 700, fontSize: 14 }}>Encaminhar mensagem</span>
            {selected.size > 0 && (
              <span style={{ fontSize: 11, color: '#E53E3E', fontWeight: 600 }}>{selected.size} selecionado{selected.size > 1 ? 's' : ''}</span>
            )}
          </div>
          <button onClick={onClose} style={{ color: 'rgba(255,255,255,0.5)', fontSize: 18, lineHeight: 1 }}>×</button>
        </div>
        <div style={{ padding: '10px 14px 6px' }}>
          <input
            autoFocus value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar contato ou grupo…"
            style={{ width: '100%', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '7px 12px', color: 'white', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
          />
        </div>
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {pvs.length > 0 && (
            <>
              <div style={{ padding: '6px 16px 3px', fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Conversas</div>
              {pvs.map(renderItem)}
            </>
          )}
          {grupos.length > 0 && (
            <>
              <div style={{ padding: '6px 16px 3px', fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Grupos</div>
              {grupos.map(renderItem)}
            </>
          )}
          {visible.length === 0 && (
            <div style={{ textAlign: 'center', padding: 24, color: 'rgba(255,255,255,0.35)', fontSize: 12 }}>Nenhuma conversa encontrada</div>
          )}
        </div>
        <div style={{ padding: '10px 14px', borderTop: '1px solid rgba(255,255,255,0.07)' }}>
          <button
            onClick={handleSend}
            disabled={selected.size === 0}
            style={{ width: '100%', padding: '9px 0', borderRadius: 8, background: selected.size > 0 ? '#E53E3E' : 'rgba(255,255,255,0.07)', color: selected.size > 0 ? 'white' : 'rgba(255,255,255,0.3)', fontWeight: 700, fontSize: 13, cursor: selected.size > 0 ? 'pointer' : 'not-allowed', transition: 'background 0.15s' }}
          >
            {selected.size > 0 ? `Encaminhar (${selected.size})` : 'Selecione os destinatários'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── DELIVERY TICK (WhatsApp-style) ───────────────────────────
// Evolution API status: 0=erro, 1=pendente, 2=servidor (✓), 3=entregue (✓✓), 4=lido (✓✓ azul), 5=played
function DeliveryTick({ status }) {
  if (status === 0) {
    return (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-label="erro ao enviar">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
    );
  }
  if (status === null || status === undefined || status === 1) {
    return (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-label="pendente">
        <circle cx="12" cy="12" r="9" />
        <polyline points="12 7 12 12 15 14" />
      </svg>
    );
  }
  const color = (status >= 4) ? '#53BDEB' : 'rgba(255,255,255,0.6)';
  if (status === 2) {
    return (
      <svg width="14" height="12" viewBox="0 0 20 16" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-label="enviado">
        <polyline points="4 8 8 12 16 4" />
      </svg>
    );
  }
  // 3 (entregue) ou 4/5 (lido)
  return (
    <svg width="16" height="12" viewBox="0 0 24 16" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-label={status >= 4 ? 'lido' : 'entregue'}>
      <polyline points="3 8 7 12 15 4" />
      <polyline points="9 12 13 16 21 8" />
    </svg>
  );
}

// ─── MESSAGE BUBBLE ────────────────────────────────────────────
function MsgBubble({ m, conv, onReply, onCreateTask, onViewImage, starred, onStar, onDelete, onResumirMsg, onTraduzirMsg, onTranscribeMsg, onForward, translation, transcription }) {
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
    if (m.mediaType === 'sticker') {
      return url
        ? <img src={url} alt="Figurinha" style={{ width: 120, height: 120, objectFit: 'contain', borderRadius: 8 }} />
        : <span style={{ fontSize: 28 }}>🔖</span>;
    }
    if (m.mediaType === 'image') {
      return <SmartImage src={url} marginBottom={m.text ? 6 : 0} onViewImage={onViewImage} showDownload={!!url} downloadName={m.text} />;
    }
    if (m.mediaType === 'video') {
      return <VideoPlayer src={url} text={m.text} />;
    }
    if (m.mediaType?.includes('audio')) {
      return <AudioPlayer src={url} isOut={isOut} />;
    }
    if (m.mediaType === 'document') {
      // Detecta se o documento é na verdade uma imagem (enviada como arquivo)
      const isImageDoc = url?.startsWith('data:image/');
      const handleDocClick = () => {
        if (!url) return;
        if (url.startsWith('data:')) {
          // Browsers bloqueiam data: URLs com target=_blank — converte para Blob URL
          const [header, b64] = url.split(',');
          const mime = header.match(/:(.*?);/)?.[1] || 'application/octet-stream';
          const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
          const blob = new Blob([bytes], { type: mime });
          const blobUrl = URL.createObjectURL(blob);
          if (mime.startsWith('image/') || mime === 'application/pdf') {
            window.open(blobUrl, '_blank');
          } else {
            const a = document.createElement('a');
            a.href = blobUrl;
            a.download = m.text || 'arquivo';
            a.click();
          }
          setTimeout(() => URL.revokeObjectURL(blobUrl), 2000);
        } else {
          window.open(url, '_blank');
        }
      };
      if (isImageDoc) {
        return <SmartImage src={url} alt={m.text || 'imagem'} marginBottom={m.text ? 6 : 0} onViewImage={onViewImage} showDownload={!!url} downloadName={m.text} />;
      }
      return (
        <div onClick={handleDocClick} style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'white', cursor: url ? 'pointer' : 'default', padding: '8px 10px', background: 'rgba(255,255,255,0.08)', borderRadius: 8, fontSize: 12 }}>
          <span>📄</span>
          <span style={{ flex: 1 }}>{m.text || 'Documento'}</span>
          {!url && <span style={{ fontSize: 10, opacity: 0.45 }}>carregando…</span>}
          {url && (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.6, flexShrink: 0 }}>
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
          )}
        </div>
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
            <div style={{ wordBreak: 'break-word' }}>{formatWhatsApp(m.text)}</div>
          )}
        </div>
        {!isOut && translation && (
          <div style={{ marginTop: 4, marginLeft: 4, maxWidth: 340 }}>
            {translation.loading && (
              <div style={{ display: 'flex', gap: 4, alignItems: 'center', padding: '3px 0' }}>
                <span className="lc-typ-dot" style={{ animationDelay: '0s', width: 5, height: 5 }} />
                <span className="lc-typ-dot" style={{ animationDelay: '0.15s', width: 5, height: 5 }} />
                <span className="lc-typ-dot" style={{ animationDelay: '0.3s', width: 5, height: 5 }} />
              </div>
            )}
            {!translation.loading && translation.error && (
              <div style={{ fontSize: 11, color: 'rgba(239,68,68,0.6)', fontStyle: 'italic' }}>
                Tradução indisponível
              </div>
            )}
            {!translation.loading && translation.text && (
              <div style={{ fontSize: 12, color: 'var(--g-400, rgba(255,255,255,0.5))', fontStyle: 'italic', lineHeight: 1.4 }}>
                {translation.text}
                {translation.lang && (
                  <sub style={{ marginLeft: 6, fontSize: 10, opacity: 0.7, fontStyle: 'normal' }}>{translation.lang}</sub>
                )}
              </div>
            )}
          </div>
        )}
        {!isOut && transcription && (m.mediaType?.includes('audio') || m.mediaType === 'video') && (
          <div style={{ marginTop: 4, marginLeft: 4, maxWidth: 340 }}>
            {transcription.loading && (
              <div style={{ display: 'flex', gap: 4, alignItems: 'center', padding: '3px 0' }}>
                <span className="lc-typ-dot" style={{ animationDelay: '0s', width: 5, height: 5 }} />
                <span className="lc-typ-dot" style={{ animationDelay: '0.15s', width: 5, height: 5 }} />
                <span className="lc-typ-dot" style={{ animationDelay: '0.3s', width: 5, height: 5 }} />
              </div>
            )}
            {!transcription.loading && transcription.error && (
              <div style={{ fontSize: 11, color: 'rgba(239,68,68,0.6)', fontStyle: 'italic' }}>
                Transcrição indisponível
              </div>
            )}
            {!transcription.loading && transcription.text && (
              <div style={{ fontSize: 12, color: 'var(--g-400, rgba(255,255,255,0.5))', fontStyle: 'italic', lineHeight: 1.4 }}>
                {transcription.text}
              </div>
            )}
          </div>
        )}
        {m.reactions?.length > 0 && (() => {
          const grouped = {};
          (m.reactions || []).forEach(r => { if (r.emoji) grouped[r.emoji] = (grouped[r.emoji] || 0) + 1; });
          const entries = Object.entries(grouped);
          if (!entries.length) return null;
          return (
            <div style={{ display: 'flex', gap: 4, marginTop: 3, flexWrap: 'wrap', justifyContent: isOut ? 'flex-end' : 'flex-start' }}>
              {entries.map(([emoji, count]) => (
                <span key={emoji} title={`${count} reação${count > 1 ? 'ões' : ''}`} style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 12, padding: '1px 7px', fontSize: 14, display: 'inline-flex', alignItems: 'center', gap: 3, cursor: 'default', userSelect: 'none' }}>
                  {emoji}{count > 1 && <span style={{ fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.65)', marginLeft: 1 }}>{count}</span>}
                </span>
              ))}
            </div>
          );
        })()}
        {!isOut && (
          <div className="lc-bubble-actions">
            <button title="Responder" onClick={() => onReply?.(m)}><Icon name="msg" size={11} /></button>
            <button title="Encaminhar" onClick={() => onForward?.(m)}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 17 20 12 15 7"/><path d="M4 18v-2a4 4 0 0 1 4-4h12"/></svg>
            </button>
            <button title="Traduzir" onClick={() => onTraduzirMsg?.(m)}><Icon name="globe" size={11} /></button>
            {(m.mediaType?.includes('audio') || m.mediaType === 'video') && (
              <button title="Transcrever" onClick={() => onTranscribeMsg?.(m)}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
              </button>
            )}
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
              <DeliveryTick status={m.deliveryStatus} />
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


// ─── Protocolos ──────────────────────────────────────────────────
function ProtocolosScreen({ tenantDbId, onOpenConv }) {
  const [convs, setConvs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('todos');
  const [hasMore, setHasMore] = useState(false);
  const [loadOffset, setLoadOffset] = useState(0);
  const [depts, setDepts] = useState({});
  const PAGE = 50;

  useEffect(() => {
    const t = setTimeout(() => setSearchQuery(search), 400);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    if (!tenantDbId) return;
    supabase.from('departments').select('id,name,color').eq('tenant_id', tenantDbId)
      .then(({ data }) => {
        if (data) setDepts(Object.fromEntries(data.map(d => [d.id, d])));
      });
  }, [tenantDbId]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(0, true); }, [tenantDbId, statusFilter, searchQuery]);

  async function load(off = 0, reset = false) {
    if (!tenantDbId) return;
    if (reset) setLoading(true);
    let q = supabase.from('conversations')
      .select('id,push_name,contact_name,group_name,whatsapp_chat_id,status,department_id,created_at')
      .eq('tenant_id', tenantDbId)
      .order('updated_at', { ascending: false })
      .range(off, off + PAGE - 1);
    if (statusFilter !== 'todos') q = q.eq('status', statusFilter);
    const s = searchQuery.trim();
    if (s.length >= 2) q = q.or(`push_name.ilike.%${s}%,contact_name.ilike.%${s}%,whatsapp_chat_id.ilike.%${s}%`);
    const { data } = await q;
    const rows = data || [];
    if (reset) setConvs(rows); else setConvs(prev => [...prev, ...rows]);
    setHasMore(rows.length === PAGE);
    setLoadOffset(off + PAGE);
    setLoading(false);
  }

  const STATUS_LABELS = {
    nao_iniciado: 'Não iniciado', aguardando: 'Aguardando',
    em_atendimento: 'Em atendimento', atendimento_aberto: 'Aberto',
    automacao: 'Automação', finalizado: 'Finalizado',
  };
  const STATUS_DOT = {
    aguardando: '#F59E0B', em_atendimento: '#3B82F6',
    atendimento_aberto: '#10B981', finalizado: '#6B7280',
    automacao: '#8B5CF6', nao_iniciado: '#9CA3AF',
  };

  function protocolId(id) { return '#' + id.replace(/-/g, '').slice(-6).toUpperCase(); }
  function fmtDate(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
  }

  const card = { background: '#1A1A1A', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, marginBottom: 14 };
  const gridCols = '96px 1fr 140px 130px 120px 130px 68px';

  return (
    <div style={{ maxWidth: 960 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
        <div style={{ flex: 1 }}>
          <h2 style={{ color: 'white', fontSize: 18, fontWeight: 700, margin: 0 }}>Protocolos</h2>
          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, marginTop: 4 }}>Histórico completo de atendimentos.</p>
        </div>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar contato ou telefone..."
          style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: 'white', padding: '8px 14px', fontSize: 13, width: 240, outline: 'none' }}
        />
      </div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 20, flexWrap: 'wrap' }}>
        {['todos', 'aguardando', 'em_atendimento', 'atendimento_aberto', 'finalizado'].map(s => (
          <button key={s} onClick={() => setStatusFilter(s)} style={{ background: statusFilter === s ? '#B70C00' : 'rgba(255,255,255,0.06)', border: 'none', borderRadius: 99, color: statusFilter === s ? 'white' : 'rgba(255,255,255,0.5)', padding: '5px 14px', fontSize: 12, cursor: 'pointer', fontWeight: statusFilter === s ? 600 : 400 }}>
            {s === 'todos' ? 'Todos' : STATUS_LABELS[s]}
          </button>
        ))}
      </div>
      {loading && <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>Carregando…</div>}
      {!loading && convs.length === 0 && (
        <div style={{ textAlign: 'center', padding: '48px 24px', color: 'rgba(255,255,255,0.3)', fontSize: 13 }}>Nenhum protocolo encontrado.</div>
      )}
      {!loading && convs.length > 0 && (
        <div style={card}>
          <div style={{ display: 'grid', gridTemplateColumns: gridCols, gap: 8, padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', fontSize: 11, color: 'rgba(255,255,255,0.35)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.05em' }}>
            <span>Protocolo</span><span>Contato</span><span>Telefone</span><span>Status</span><span>Depto</span><span>Iniciado</span><span></span>
          </div>
          {convs.map(c => {
            const name = c.is_group
              ? ((c.group_name && !/^\d{10,}$/.test(c.group_name) ? c.group_name : null) || 'Grupo')
              : (c.contact_name || c.push_name || c.whatsapp_chat_id?.split('@')[0] || '—');
            const phone = (c.whatsapp_chat_id || '').replace(/@[^@]+$/, '') || '—';
            const dept = c.department_id ? depts[c.department_id] : null;
            return (
              <div key={c.id} style={{ display: 'grid', gridTemplateColumns: gridCols, gap: 8, padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.04)', alignItems: 'center' }}>
                <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'rgba(255,255,255,0.45)' }}>{protocolId(c.id)}</span>
                <span style={{ color: 'white', fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
                <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: 11 }}>{phone}</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: STATUS_DOT[c.status] || '#6B7280', flexShrink: 0 }} />
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)' }}>{STATUS_LABELS[c.status] || c.status}</span>
                </span>
                <span style={{ fontSize: 11, color: dept ? dept.color : 'rgba(255,255,255,0.3)' }}>{dept ? dept.name : '—'}</span>
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{fmtDate(c.created_at)}</span>
                <button onClick={() => onOpenConv && onOpenConv(c.id)} style={{ background: 'rgba(255,255,255,0.07)', border: 'none', borderRadius: 6, color: 'rgba(255,255,255,0.6)', fontSize: 11, padding: '5px 8px', cursor: 'pointer' }}>Abrir</button>
              </div>
            );
          })}
        </div>
      )}
      {hasMore && (
        <button onClick={() => load(loadOffset)} style={{ width: '100%', background: 'rgba(255,255,255,0.06)', border: 'none', borderRadius: 8, color: 'rgba(255,255,255,0.5)', padding: '10px', fontSize: 13, cursor: 'pointer', marginTop: 4 }}>Carregar mais</button>
      )}
    </div>
  );
}

// ─── Visualização ─────────────────────────────────────────────────
function VisualizacaoScreen({ tenantDbId }) {
  const [stats, setStats] = useState(null);
  const [daily, setDaily] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tenantDbId) return;
    (async () => {
      const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
      const { data } = await supabase.from('conversations')
        .select('id,status,created_at')
        .eq('tenant_id', tenantDbId)
        .gte('created_at', since);
      const rows = data || [];
      const counts = { total: rows.length };
      ['nao_iniciado','aguardando','em_atendimento','atendimento_aberto','automacao','finalizado'].forEach(s => {
        counts[s] = rows.filter(r => r.status === s).length;
      });
      const days = [];
      for (let i = 13; i >= 0; i--) {
        const d = new Date(Date.now() - i * 24 * 3600 * 1000);
        const dateStr = d.toISOString().split('T')[0];
        const label = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
        days.push({ label, count: rows.filter(r => r.created_at && r.created_at.startsWith(dateStr)).length });
      }
      setStats(counts);
      setDaily(days);
      setLoading(false);
    })();
  }, [tenantDbId]);

  const card = { background: '#1A1A1A', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10 };

  if (loading) return <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>Carregando…</div>;

  const metricCards = [
    { label: 'Total (30 dias)',  value: stats.total,                                                            color: 'white' },
    { label: 'Aguardando',       value: stats.aguardando || 0,                                                  color: '#F59E0B' },
    { label: 'Em atendimento',   value: (stats.em_atendimento || 0) + (stats.atendimento_aberto || 0),         color: '#3B82F6' },
    { label: 'Finalizados',      value: stats.finalizado || 0,                                                  color: '#10B981' },
  ];

  const maxDay = Math.max(...daily.map(d => d.count), 1);

  const statusBars = [
    { key: 'aguardando',         label: 'Aguardando',     color: '#F59E0B' },
    { key: 'em_atendimento',     label: 'Em atendimento', color: '#3B82F6' },
    { key: 'atendimento_aberto', label: 'Aberto',         color: '#60A5FA' },
    { key: 'automacao',          label: 'Automação',      color: '#8B5CF6' },
    { key: 'finalizado',         label: 'Finalizado',     color: '#10B981' },
    { key: 'nao_iniciado',       label: 'Não iniciado',   color: '#6B7280' },
  ];

  return (
    <div style={{ maxWidth: 820 }}>
      <div style={{ marginBottom: 28 }}>
        <h2 style={{ color: 'white', fontSize: 18, fontWeight: 700, margin: 0 }}>Visualização</h2>
        <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, marginTop: 4 }}>Métricas dos últimos 30 dias.</p>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 24 }}>
        {metricCards.map(m => (
          <div key={m.label} style={{ ...card, padding: '20px 18px' }}>
            <div style={{ fontSize: 30, fontWeight: 700, color: m.color, marginBottom: 4 }}>{m.value}</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>{m.label}</div>
          </div>
        ))}
      </div>
      <div style={{ ...card, padding: '20px 20px 16px', marginBottom: 14 }}>
        <div style={{ color: 'white', fontWeight: 600, fontSize: 13, marginBottom: 16 }}>Conversas por dia (últimos 14 dias)</div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 5, height: 100 }}>
          {daily.map(d => (
            <div key={d.label} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              {d.count > 0 && <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', marginBottom: 2 }}>{d.count}</div>}
              <div style={{ width: '100%', height: d.count ? `${Math.round((d.count / maxDay) * 72)}px` : '3px', background: d.count ? '#B70C00' : 'rgba(255,255,255,0.06)', borderRadius: '3px 3px 0 0', minHeight: 3 }} />
              <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', marginTop: 4, whiteSpace: 'nowrap' }}>{d.label}</div>
            </div>
          ))}
        </div>
      </div>
      <div style={{ ...card, padding: '20px' }}>
        <div style={{ color: 'white', fontWeight: 600, fontSize: 13, marginBottom: 14 }}>Distribuição por status</div>
        {statusBars.map(s => {
          const pct = stats.total ? Math.round((stats[s.key] || 0) / stats.total * 100) : 0;
          return (
            <div key={s.key} style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>{s.label}</span>
                <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>{stats[s.key] || 0} ({pct}%)</span>
              </div>
              <div style={{ height: 6, borderRadius: 99, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${pct}%`, background: s.color, borderRadius: 99 }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// CHAT SCREEN — componente principal
// ═══════════════════════════════════════════════════════════════
export default function ChatScreen({ tenant, tenantDbId, userId, onNavigate, deepLinkConvId }) {
  // ── Dados e instâncias ────────────────────────────────────
  const [instances, setInstances]            = useState([]);
  const [selectedInstance, setSelectedInstance] = useState(null);
  const [convs, setConvs]                    = useState([]);
  const [usingRealData, setUsingRealData]    = useState(false);
  const [members, setMembers]                = useState([]);
  const [lojas, setLojas]                    = useState([]);
  const [currentUser, setCurrentUser]        = useState(null);
  const [departments, setDepartments]        = useState([]);
  const [activeCustomer, setActiveCustomer]  = useState(null);

  // ── Drawer Demandas ───────────────────────────────────────
  const [demandasDrawer, setDemandasDrawer]  = useState({ open: false, customerId: null });
  const [espacosClientId, setEspacosClientId] = useState(null);
  const [espacosHasFolder, setEspacosHasFolder] = useState(false);

  // ── UI state ──────────────────────────────────────────────
  const [activeId, setActiveId]              = useState(() => deepLinkConvId ?? null);
  const [headerTab, setHeaderTab]            = useState('inbox');
  const [search, setSearch]                  = useState('');
  const isSearching                          = search.length >= 3;
  const [searchConvs, setSearchConvs]        = useState([]);
  const searchTimerRef                       = useRef(null);
  const [statusFilter, setStatusFilter]      = useState('nao_iniciado');
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

  // ── Tradução por mensagem ─────────────────────────────────
  const [translations, setTranslations]      = useState({}); // { msgId: { loading, text, lang, error } }
  // ── Transcrição Whisper por mensagem ──────────────────────
  const [transcriptions, setTranscriptions]  = useState({}); // { msgId: { loading, text, error } }

  // ── AI / Composer ─────────────────────────────────────────
  const [aiMode, setAiMode]                  = useState('humano');
  const [showCopilot, setShowCopilot]        = useState(true);
  const [showTasksPanel, setShowTasksPanel]  = useState(false);
  const [showInspector, setShowInspector]    = useState(false);
  const [showSlash, setShowSlash]            = useState(false);
  const [showMention, setShowMention]        = useState(false);
  const [showQR, setShowQR]                  = useState(false);
  const [qrConfirm, setQrConfirm]            = useState(null); // { qr, publicUrl, mimeType }
  const [showEmoji, setShowEmoji]            = useState(false);
  const [aiAction, setAiAction]              = useState(null);
  const [resolved, setResolved]              = useState({});
  const [mutedConvs, setMutedConvs]          = useState(() => getMuted());

  // ── Canais internos ───────────────────────────────────────
  const [chanMsgs, setChanMsgs]              = useState({});
  const [chanDraft, setChanDraft]            = useState('');
  const [editingChanMsgId, setEditingChanMsgId]   = useState(null);
  const [editingChanMsgText, setEditingChanMsgText] = useState('');
  const [hoveredChanMsgId, setHoveredChanMsgId]    = useState(null);
  const [showNewChan, setShowNewChan]        = useState(false);
  const [newChanName, setNewChanName]        = useState('');
  const [newChanDesc, setNewChanDesc]        = useState('');
  const [newChanColor, setNewChanColor]      = useState('#B70C00');
  const [savingChan, setSavingChan]          = useState(false);
  const [chanShowEmoji, setChanShowEmoji]    = useState(false);
  const chanTextareaRef                      = useRef(null);
  const chanFileInputRef                     = useRef(null);
  const chanEmojiButtonRef                   = useRef(null);

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

  // ── Voz para texto ────────────────────────────────────────
  const [voiceActive, setVoiceActive]         = useState(false);
  const voiceRecRef                           = useRef(null);
  const voiceFinalRef                         = useRef('');

  // ── Edição inline de nome de contato/grupo ────────────────
  const [editingConvName, setEditingConvName]         = useState(false);
  const [editingConvNameDraft, setEditingConvNameDraft] = useState('');

  // ── Painel direito collapse ────────────────────────────────
  const [openPerfil, setOpenPerfil]          = useState(true);
  const [openIA, setOpenIA]                  = useState(true);
  const [openNotas, setOpenNotas]            = useState(false);
  const [openEndereco, setOpenEndereco]      = useState(false);
  const [openDados, setOpenDados]            = useState(false);
  const [openIfood, setOpenIfood]            = useState(false);

  // ── Paginação de mensagens ────────────────────────────────
  const [msgHasMore, setMsgHasMore]         = useState({});
  const [loadingOlderMsgs, setLoadingOlderMsgs] = useState(false);
  const loadingOlderRef                     = useRef(false); // guard síncrono
  const scrollAnchorRef                     = useRef(null);  // altura antes do prepend


  // ── Refs ──────────────────────────────────────────────────
  const scrollRef          = useRef(null);
  const lastScrolledConv   = useRef(null);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [realtimeStatus, setRealtimeStatus]    = useState('SUBSCRIBED');
  const [waLastInbound, setWaLastInbound]      = useState(null); // null=checking, ''=>nenhuma, ISO=timestamp
  const [waAlertDismissed, setWaAlertDismissed] = useState(false);
  const textareaRef    = useRef(null);
  const typingTimerRef = useRef(null);
  const chanScrollRef  = useRef(null);
  const chatTargetRef  = useRef(sessionStorage.getItem('cd-chat-target'));
  const activeIdRef            = useRef(activeId);
  const deepLinkApplied        = useRef(false);
  const photoCacheRef          = useRef({});
  const convsRef               = useRef(convs);
  const persistingRef          = useRef(new Set());
  const aiModeRef              = useRef('humano');
  const selectedInstanceRef    = useRef(null);
  const selectedInstanceObjRef = useRef(null);
  const iaPendingRef           = useRef(new Set());
  const hibridoPendingRef      = useRef(new Set());
  const fileInputRef   = useRef(null);
  const galleryInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  useEffect(() => { activeIdRef.current = activeId; }, [activeId]);
  useEffect(() => { convsRef.current = convs; }, [convs]);

  // Auto-seleciona conversa vinda do "Abrir Chat" no CRM
  const openChatByPhone = useCallback(async (digits, name, customerId) => {
    if (!digits) return;
    const variants = [digits];
    if (digits.startsWith('55') && digits.length === 13) variants.push(digits.slice(0, 4) + digits.slice(5));
    else if (digits.startsWith('55') && digits.length === 12) variants.push(digits.slice(0, 4) + '9' + digits.slice(4));
    let conv = convsRef.current.find(c => variants.includes(c.whatsapp_chat_id?.split('@')[0]));
    if (!conv) {
      // Conversa não existe: cria uma nova para poder enviar a primeira mensagem
      if (!tenantDbId) return; // sem tenant, aguarda retry automático via convs/instances
      const instanceName = selectedInstanceRef.current; // é uma string (instance_name)
      const instanceObj = instances.find(i => i.instance_name === instanceName);
      if (!instanceObj) return; // sem instância carregada, aguarda retry
      const jid = `${digits}@s.whatsapp.net`;
      const { data: newConv } = await supabase
        .from('conversations')
        .insert({
          tenant_id: tenantDbId,
          instance_id: instanceObj.id,
          whatsapp_chat_id: jid,
          type: 'whatsapp',
          status: 'aguardando',
          title: name || digits,
          ...(customerId ? { customer_id: customerId } : {}),
        })
        .select()
        .single();
      if (!newConv) return;
      setConvs(prev => [newConv, ...prev]);
      conv = newConv;
    }
    // Só limpa o sessionStorage quando a operação foi bem-sucedida
    sessionStorage.removeItem('cd-chat-target');
    sessionStorage.removeItem('cd-chat-target-name');
    sessionStorage.removeItem('cd-chat-target-cid');
    setActiveId(conv.id);
  }, [tenantDbId, instances]);

  useEffect(() => {
    const target = sessionStorage.getItem('cd-chat-target');
    if (!target || !convs.length) return;
    const name = sessionStorage.getItem('cd-chat-target-name') || '';
    const cid = sessionStorage.getItem('cd-chat-target-cid') || null;
    openChatByPhone(target, name, cid);
  }, [convs, openChatByPhone]);

  useEffect(() => {
    const handle = (e) => openChatByPhone(e.detail?.phone, e.detail?.name, e.detail?.customerId);
    window.addEventListener('cd-open-chat', handle);
    return () => window.removeEventListener('cd-open-chat', handle);
  }, [openChatByPhone]);
  useEffect(() => { aiModeRef.current = aiMode; }, [aiMode]);
  useEffect(() => {
    selectedInstanceRef.current = selectedInstance;
    selectedInstanceObjRef.current = instances.find(i => i.instance_name === selectedInstance) || null;
  }, [selectedInstance, instances]);

  // ── Status de atendimento ─────────────────────────────────
  const { status: convStatus, loading: statusLoading, refresh: refreshStatus, changeStatus, finish } = useConversationStatus(activeId, tenantDbId, currentUser?.id);

  // ── CONTAGENS para badges de status ────────────────────────
  const statusCounts = useMemo(() => {
    const src = isSearching ? searchConvs : convs;
    return {
      nao_iniciado: src.filter(c => (c.status || 'aguardando') === 'aguardando').length,
      aguardando:   src.filter(c => c.status === 'em_atendimento' || (c.status === 'atendimento_aberto' && c.previewFrom === 'in')).length,
      aberto:       src.filter(c => c.status === 'atendimento_aberto').length,
      automacao:    src.filter(c => c.status === 'automacao').length,
      finalizado:   src.filter(c => c.status === 'finalizado').length,
      falha:        src.filter(c => c.status === 'falha').length,
      oculto:       src.filter(c => c.status === 'archived').length,
      interno:      src.filter(c => c.id.startsWith('chan-')).reduce((sum, c) => sum + (c.unread || 0), 0),
    };
  }, [isSearching, searchConvs, convs]);

  const COUNTS = useMemo(() => [
    { id: 'nao_iniciado', icon: 'inbox', value: statusCounts.nao_iniciado, label: 'Não iniciados' },
    { id: 'aguardando',   icon: 'clock', value: statusCounts.aguardando,   label: 'Aguardando' },
    { id: 'aberto',       icon: 'msg',   value: statusCounts.aberto,       label: 'Em aberto' },
    { id: 'automacao',    icon: 'bot',   value: statusCounts.automacao,    label: 'Automações' },
    { id: 'interno',      icon: 'users', value: statusCounts.interno,      label: 'Chat Interno' },
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
    loadLojas();
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
    // Clear typing indicator when switching conversations
    if (typingTimerRef.current) { clearTimeout(typingTimerRef.current); typingTimerRef.current = null; }
    setTyping(false);
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
    if (!conv) return;

    if (conv.customer_id) {
      supabase.from('customers').select('id, name, phone, email, document, created_at').eq('id', conv.customer_id).maybeSingle()
        .then(({ data }) => setActiveCustomer(data ?? null));
      return;
    }

    setActiveCustomer(null);

    // Auto-lookup: se é PV (não grupo), tenta vincular pelo telefone
    const isGroup = conv.whatsapp_chat_id?.endsWith('@g.us');
    if (!isGroup && conv.whatsapp_chat_id && tenantDbId) {
      const phoneDigits = conv.whatsapp_chat_id.split('@')[0];
      // Inclui variante com/sem 9º dígito para números brasileiros (celular 8 vs 9 dígitos)
      const phoneVariants = [phoneDigits];
      if (phoneDigits.startsWith('55') && phoneDigits.length === 13) {
        phoneVariants.push(phoneDigits.slice(0, 4) + phoneDigits.slice(5));
      } else if (phoneDigits.startsWith('55') && phoneDigits.length === 12) {
        phoneVariants.push(phoneDigits.slice(0, 4) + '9' + phoneDigits.slice(4));
      }
      supabase.from('customers')
        .select('id, name, phone, email, document, created_at')
        .eq('tenant_id', tenantDbId)
        .in('phone_normalized', phoneVariants)
        .limit(1)
        .then(({ data }) => {
          const customer = Array.isArray(data) ? data[0] : data;
          if (!customer) return;
          supabase.from('conversations').update({ customer_id: customer.id }).eq('id', conv.id);
          setActiveCustomer(customer);
          setConvs(prev => prev.map(c => c.id === conv.id ? { ...c, customer_id: customer.id } : c));
        });
    }
  }, [activeId, tenantDbId]);

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
        const name = c.contact_name || c.group_name || waName || c.name;
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

  // Background profile picture loader — runs once per instance selection
  useEffect(() => {
    if (!HAS_EVO || !selectedInstance) return;
    let cancelled = false;

    (async () => {
      await new Promise(r => setTimeout(r, 1500));
      if (cancelled) return;

      const targets = convsRef.current.filter(
        c => !c.photoUrl && !c.is_group && c.whatsapp_chat_id
      );

      for (let i = 0; i < Math.min(targets.length, 40); i++) {
        if (cancelled) break;
        const conv = targets[i];
        const phone = conv.whatsapp_chat_id.split('@')[0].split(':')[0];
        if (!phone || photoCacheRef.current[phone] !== undefined) continue;

        try {
          const data = await fetchProfile(selectedInstance, phone);
          if (cancelled) break;
          const photoUrl = data?.picture || data?.profilePictureUrl || data?.photo || null;
          const waName   = data?.name || data?.pushName || null;
          photoCacheRef.current[phone] = { photoUrl, waName };

          if (photoUrl) {
            setConvs(prev => prev.map(c => c.id === conv.id ? { ...c, photoUrl } : c));
            supabase.from('conversations')
              .update({ push_photo_url: photoUrl, updated_at: new Date().toISOString() })
              .eq('id', conv.id).catch(() => {});
          }
        } catch { photoCacheRef.current[phone] = false; }

        await new Promise(r => setTimeout(r, 350));
      }
    })();

    return () => { cancelled = true; };
  }, [selectedInstance]);

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
        const preview   = text || (mediaType === 'image' ? '🖼 Imagem' : mediaType === 'video' ? '🎬 Vídeo' : mediaType === 'document' ? '📄 Documento' : mediaType?.includes('audio') ? '🎵 Áudio' : mediaType === 'sticker' ? '🔖 Figurinha' : '');
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
          return { ...m, [convId]: [...convMsgs, { id: msg.id, from: isInbound ? 'in' : 'out', text, time, _ts: msg.created_at || new Date().toISOString(), mediaType, mediaUrl: msg.media_url || null, agentName: msg.sender_name || null, waMsgId: msg.whatsapp_msg_id || null, replyTo: msg.quoted_content || null, deliveryStatus: msg.delivery_status ?? null }] };
        });
        if (isInbound) {
          setWaLastInbound(msg.created_at || new Date().toISOString());
          // Clear any pending typing indicator when the actual message arrives
          if (typingTimerRef.current) { clearTimeout(typingTimerRef.current); typingTimerRef.current = null; }
          setTyping(false);
        }
        setConvs(prev => {
          const idx = prev.findIndex(c => c.id === convId);
          if (idx === -1) {
            supabase.from('conversations').select('*').eq('id', convId).single().then(({ data: conv }) => {
              if (!conv) return;
              const phone = conv.whatsapp_chat_id?.split('@')[0] || '';
              const name  = conv.contact_name || conv.group_name || conv.push_name || phone || 'Desconhecido';
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
          const updated = { ...conv, preview, time, _sortTs: msg.created_at || new Date().toISOString(), previewFrom: isInbound ? 'in' : 'out', unread: isActive ? 0 : isMuted(convId) ? (conv.unread || 0) : (conv.unread || 0) + (isInbound ? 1 : 0), ...statusUpdate };
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
        const convMsgs2 = (m2) => {
          const convMsgs = m2[msg.conversation_id];
          if (!convMsgs) return m2;
          const updated = convMsgs.map(ex => {
            if (ex.id !== msg.id) return ex;
            const patch = {};
            if (msg.media_url)  patch.mediaUrl  = msg.media_url;
            if (msg.reactions !== undefined) patch.reactions = msg.reactions || [];
            if (msg.delivery_status !== undefined && msg.delivery_status !== null) patch.deliveryStatus = msg.delivery_status;
            return Object.keys(patch).length ? { ...ex, ...patch } : ex;
          });
          return { ...m2, [msg.conversation_id]: updated };
        };
        if (msg.media_url || msg.reactions !== undefined || msg.delivery_status !== undefined) setMessages(convMsgs2);
        // Show typing indicator for 2s when client reads our message (delivery_status ≥ 4)
        if (msg.delivery_status >= 4 && msg.conversation_id === activeIdRef.current) {
          if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
          setTyping(true);
          typingTimerRef.current = setTimeout(() => { setTyping(false); typingTimerRef.current = null; }, 2000);
        }
      })
      .subscribe((status) => { setRealtimeStatus(status); });
    return () => { supabase.removeChannel(channel); };
  }, [selectedInstance]);

  // Realtime: status e campos de conversa (status changes from other tabs/agents)
  useEffect(() => {
    if (!selectedInstance) return;
    const convSub = supabase
      .channel('conversations-status-rt')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'conversations' }, payload => {
        const c = payload.new;
        setConvs(prev => {
          const idx = prev.findIndex(e => e.id === c.id);
          if (idx !== -1) {
            return prev.map(existing => {
            if (existing.id !== c.id) return existing;
            const updName = c.contact_name || c.group_name || c.push_name || existing.name;
            return {
              ...existing,
              status: c.status || existing.status,
              department_id: c.department_id ?? existing.department_id,
              breno_paused: c.breno_paused ?? existing.breno_paused,
              last_breno_handled_at: c.last_breno_handled_at || existing.last_breno_handled_at,
              assigned_to: c.assigned_to ?? existing.assigned_to,
              contact_name: c.contact_name ?? existing.contact_name,
              group_name: c.group_name ?? existing.group_name,
              name: updName,
              avatar: updName.slice(0, 2).toUpperCase(),
              ...(c.push_photo_url ? { photoUrl: c.push_photo_url } : {}),
            };
          });
          }
          if (!['aguardando', 'em_atendimento', 'atendimento_aberto', 'automacao', 'falha'].includes(c.status)) return prev;
          const phone  = c.whatsapp_chat_id?.split('@')[0] || '';
          const gname  = c.group_name && !/^\d{10,}$/.test(c.group_name) ? c.group_name : null;
          const name   = c.contact_name || gname || c.push_name || (c.is_group ? 'Grupo' : phone) || 'Desconhecido';
          return [{ id: c.id, name, avatar: name.slice(0, 2).toUpperCase(), photoUrl: c.push_photo_url || null,
            type: c.is_group ? 'group' : 'whatsapp', whatsapp_chat_id: c.whatsapp_chat_id,
            preview: '', previewFrom: 'in', time: '', _sortTs: c.updated_at || '',
            unread: 1, online: false, messages: [], status: c.status, department_id: c.department_id || null,
          }, ...prev];
        });
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'conversations' }, payload => {
        const c = payload.new;
        if (!['aguardando', 'em_atendimento', 'atendimento_aberto', 'automacao', 'falha'].includes(c.status)) return;
        const phone  = c.whatsapp_chat_id?.split('@')[0] || '';
        const gname  = c.group_name && !/^\d{10,}$/.test(c.group_name) ? c.group_name : null;
        const name   = c.contact_name || gname || c.push_name || (c.is_group ? 'Grupo' : phone) || 'Desconhecido';
        setConvs(prev => {
          if (prev.find(e => e.id === c.id)) return prev;
          return [{ id: c.id, name, avatar: name.slice(0, 2).toUpperCase(), photoUrl: c.push_photo_url || null,
            type: c.is_group ? 'group' : 'whatsapp', whatsapp_chat_id: c.whatsapp_chat_id,
            preview: '', previewFrom: 'in', time: '', _sortTs: c.updated_at || '',
            unread: 1, online: false, messages: [], status: c.status, department_id: c.department_id || null,
          }, ...prev];
        });
      })
      .subscribe();
    return () => { supabase.removeChannel(convSub); };
  }, [selectedInstance]);

  // Health check: detecta ausência de mensagens inbound (Evolution API desconectada)
  useEffect(() => {
    if (!selectedInstance) { setWaLastInbound(null); setWaAlertDismissed(false); return; }
    setWaAlertDismissed(false);
    const timer = setTimeout(async () => {
      try {
        const { data: inst } = await supabase.from('evolution_instances').select('id').eq('instance_name', selectedInstance).single();
        if (!inst) return;
        const { data: convRows } = await supabase.from('conversations').select('id').eq('instance_id', inst.id).limit(300);
        const cids = (convRows || []).map(r => r.id);
        if (!cids.length) { setWaLastInbound(''); return; }
        const { data } = await supabase.from('messages').select('created_at').eq('direction', 'inbound')
          .in('conversation_id', cids.slice(0, 200)).order('created_at', { ascending: false }).limit(1).maybeSingle();
        setWaLastInbound(data?.created_at ?? '');
      } catch { /* silencioso */ }
    }, 2500);
    return () => clearTimeout(timer);
  }, [selectedInstance]);

  // Realtime para mensagens de canal interno
  useEffect(() => {
    const sub = supabase
      .channel('channel-messages-rt')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'channel_messages' }, payload => {
        const msg = payload.new;
        setChanMsgs(m => {
          const existing = m[msg.channel_id] || [];
          if (existing.some(e => e.id === msg.id)) return m; // já adicionado por sendChanMsg
          return { ...m, [msg.channel_id]: [...existing, msg] };
        });
        // Atualiza preview e badge de não lidas se o canal não está ativo agora
        const chanConvId = 'chan-' + msg.channel_id;
        if (activeIdRef.current !== chanConvId) {
          const timeStr = new Date(msg.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
          setConvs(prev => prev.map(c =>
            c.chanId === msg.channel_id
              ? { ...c, unread: (c.unread || 0) + 1, preview: msg.text || '', time: timeStr }
              : c
          ));
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(sub); };
  }, []);

  // Canal interno — carrega mensagens ao selecionar
  useEffect(() => {
    if (activeId?.startsWith('chan-')) {
      const chanId = convs.find(c => c.id === activeId)?.chanId;
      if (chanId) loadChanMsgs(chanId);
    }
  }, [activeId]);

  useEffect(() => {
    lastScrolledConv.current = null;
  }, [activeId]);

  // Auto-scroll
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    // Restaura posição após prepend de mensagens antigas (evita salto para o topo)
    if (scrollAnchorRef.current !== null) {
      el.scrollTop = el.scrollHeight - scrollAnchorRef.current;
      scrollAnchorRef.current = null;
      return;
    }

    const activeMsgsList = messages[activeId] || [];

    // Conversa nova sendo aberta: espera mensagens carregarem, depois vai pro fundo
    if (activeId !== lastScrolledConv.current) {
      if (activeMsgsList.length > 0) {
        lastScrolledConv.current = activeId;
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            if (scrollRef.current) {
              scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
              setShowScrollBtn(false);
            }
          });
        });
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
      const { data } = await supabase.from('evolution_instances').select('id, instance_name, status, phone, profile_name, evolution_url, api_key').order('created_at');
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

  async function loadLojas() {
    try {
      const { data } = await supabase
        .from('lojas')
        .select('id, nome')
        .eq('is_active', true)
        .order('nome');
      if (data?.length) setLojas(data);
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
    const ids = [...selectedConvIds];
    const n = ids.length;
    if (!window.confirm(`Finalizar ${n} conversa${n === 1 ? '' : 's'}?`)) return;
    setBulkLoading(true);
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
    if (!tenantDbId) return;
    const { data, error } = await supabase
      .from('quick_replies')
      .select('id, title, shortcut, content, media_type, media_url, file_path, group_name')
      .eq('tenant_id', tenantDbId)
      .order('title');
    if (error) { console.warn('[QR] loadQuickReplies:', error.message); return; }
    if (data) setQuickReplies(data);
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
      const { data } = await supabase.from('channel_messages').select('id, sender_id, sender_name, text, media_url, media_type, is_pinned, created_at').eq('channel_id', chanId).order('created_at');
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
      const { data: activeRows } = await supabase.from('conversations').select('*').eq('instance_id', inst.id).in('status', ACTIVE_STATUSES).order('updated_at', { ascending: false }).limit(200);

      // Finalizadas com mensagem do cliente nas últimas 48h → também devem aparecer
      // (caso o time finalize manualmente uma conv que depois recebe resposta do cliente,
      //  ou que foi finalizada com inbound recente sem o webhook reabrir a tempo)
      const cutoff48h = new Date(Date.now() - 48 * 3600 * 1000).toISOString();
      const { data: recentInboundMsgs } = await supabase
        .from('messages').select('conversation_id')
        .eq('direction', 'inbound').gte('created_at', cutoff48h).limit(2000);
      const recentInboundConvIds = [...new Set((recentInboundMsgs || []).map(m => m.conversation_id).filter(Boolean))];
      let finalizadosRecentes = [];
      if (recentInboundConvIds.length) {
        const { data } = await supabase.from('conversations').select('*')
          .eq('instance_id', inst.id)
          .in('status', ['finalizado', 'archived'])
          .in('id', recentInboundConvIds)
          .order('updated_at', { ascending: false });
        finalizadosRecentes = (data || []).map(r => ({ ...r, _recentInbound: true }));
      }

      const rows = [...(activeRows || []), ...finalizadosRecentes];
      if (!rows.length) return;
      const seen = new Set();
      const uniqueRows = rows.filter(r => { if (seen.has(r.whatsapp_chat_id)) return false; seen.add(r.whatsapp_chat_id); return true; });
      const lastMsgResults = await Promise.all(uniqueRows.map(r => supabase.from('messages').select('conversation_id, content, body, direction, created_at, media_type').eq('conversation_id', r.id).order('created_at', { ascending: false }).limit(1).maybeSingle()));
      const lastMsgMap = {};
      lastMsgResults.forEach(({ data }) => { if (data) lastMsgMap[data.conversation_id] = data; });
      const mapped = uniqueRows.map(c => {
        const phone  = c.whatsapp_chat_id ? c.whatsapp_chat_id.split('@')[0] : '';
        const gname  = c.group_name && !/^\d{10,}$/.test(c.group_name) ? c.group_name : null;
        const name   = c.contact_name || gname || c.push_name || (c.is_group ? 'Grupo' : phone) || 'Desconhecido';
        const lm    = lastMsgMap[c.id];
        const preview = lm ? (lm.media_type === 'image' ? '🖼 Imagem' : lm.media_type === 'video' ? '🎬 Vídeo' : lm.media_type === 'document' ? '📄 Documento' : lm.media_type?.includes('audio') ? '🎵 Áudio' : lm.media_type === 'sticker' ? '🔖 Figurinha' : lm.content || lm.body || '') : '';
        const previewFrom = lm?.direction === 'inbound' ? 'in' : 'out';
        return { id: c.id, name, avatar: name.slice(0, 2).toUpperCase(), photoUrl: c.push_photo_url || null, type: c.is_group ? 'group' : 'whatsapp', whatsapp_chat_id: c.whatsapp_chat_id, preview, previewFrom, time: c.updated_at ? new Date(c.updated_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '', _sortTs: c.updated_at || '', unread: 0, online: false, messages: [], status: c.status, department_id: c.department_id || null, customer_id: c.customer_id || null, status_v2: c.status_v2 || 'open', tenant_id: c.tenant_id || null, breno_paused: c.breno_paused || false, last_breno_handled_at: c.last_breno_handled_at || null, _recentInbound: c._recentInbound || false };
      });
      setConvs(prev => {
        const mappedById = new Map(mapped.map(c => [c.id, c]));
        const existingIds = new Set(prev.map(c => c.id));
        let changed = false;
        const updated = prev.map(c => {
          const fresh = mappedById.get(c.id);
          if (!fresh) return c;
          const keys = Object.keys(fresh).filter(k => k !== 'messages');
          if (keys.every(k => c[k] === fresh[k])) return c;
          changed = true;
          return { ...c, ...fresh };
        });
        const toAdd = mapped.filter(c => !existingIds.has(c.id));
        if (!toAdd.length && !changed) return prev;
        return toAdd.length ? [...toAdd, ...updated] : updated;
      });
      setActiveId(prev => prev || mapped[0]?.id);
      if (deepLinkConvId && !deepLinkApplied.current) {
        deepLinkApplied.current = true;
        loadMsgs(deepLinkConvId);
        window.history.replaceState({}, '', window.location.pathname);
      } else if (!activeIdRef.current && mapped[0]) {
        loadMsgs(mapped[0].id);
      }
    } catch { /* ignore */ }
  }

  const MSG_PAGE = 30;

  async function loadMsgs(convId) {
    try {
      const [{ data }, { data: evts }] = await Promise.all([
        supabase.from('messages').select('id, direction, content, body, created_at, sender_name, media_url, media_type, whatsapp_msg_id, quoted_content, reactions, delivery_status').eq('conversation_id', convId).order('created_at', { ascending: false }).limit(MSG_PAGE),
        supabase.from('conversation_events').select('id, event_type, actor_name, metadata, ts').eq('conversation_id', convId).order('ts', { ascending: true }),
      ]);
      const rows = data || [];
      const dbMsgs = rows.reverse().filter(msg => msg.content || msg.body || msg.media_url || msg.media_type).map(msg => ({
        id: msg.id, from: msg.direction === 'outbound' ? 'out' : 'in',
        text: msg.content || msg.body || '',
        time: new Date(msg.created_at || Date.now()).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
        _ts: msg.created_at || new Date(0).toISOString(),
        mediaType: msg.media_type || null, mediaUrl: msg.media_url || null,
        agentName: msg.sender_name || null, waMsgId: msg.whatsapp_msg_id || null,
        replyTo: msg.quoted_content || null, reactions: msg.reactions || [],
        deliveryStatus: msg.delivery_status ?? null,
      }));
      const SHOW_EVENT_TYPES = new Set(['closed', 'reopened']);
      // Dedup: trigger SQL + frontend podem inserir o mesmo evento; manter o com actor_name
      const filteredEvts = (evts || []).filter(evt => SHOW_EVENT_TYPES.has(evt.event_type));
      const dedupedEvts = filteredEvts.reduce((acc, evt) => {
        const dup = acc.find(e =>
          e.event_type === evt.event_type &&
          Math.abs(new Date(e.ts) - new Date(evt.ts)) < 2000
        );
        if (!dup) return [...acc, evt];
        if (evt.actor_name && !dup.actor_name) return [...acc.filter(e => e !== dup), evt];
        return acc;
      }, []);
      const evtMsgs = dedupedEvts.map(evt => ({
        id: `evt-${evt.id}`, from: 'system',
        text: fmtEventLabel(evt),
        _ts: evt.ts,
      }));
      const merged = [...dbMsgs, ...evtMsgs].sort((a, b) => new Date(a._ts) - new Date(b._ts));
      setMessages(m => {
        const tmpMsgs = (m[convId] || []).filter(ex => {
          if (ex.id?.startsWith('sys-')) return true;
          if (ex.id?.startsWith('tmp-')) return !merged.some(db => db.from === 'out' && db.text === ex.text);
          return false;
        });
        return { ...m, [convId]: [...merged, ...tmpMsgs] };
      });
      setMsgHasMore(prev => ({ ...prev, [convId]: rows.length === MSG_PAGE }));
      if (convId === activeIdRef.current) {
        requestAnimationFrame(() => requestAnimationFrame(() => {
          if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
            setShowScrollBtn(false);
          }
        }));
      }
    } catch { /* ignore */ }
  }

  async function loadOlderMsgs(convId) {
    if (loadingOlderRef.current) return;
    const currentMsgs = messages[convId] || [];
    const realMsgs = currentMsgs.filter(m => !m.id?.startsWith('tmp-') && !m.id?.startsWith('sys-') && !m.id?.startsWith('evt-'));
    if (!realMsgs.length) return;
    const oldestTs = realMsgs[0]._ts;
    loadingOlderRef.current = true;
    setLoadingOlderMsgs(true);
    try {
      const { data } = await supabase
        .from('messages')
        .select('id, direction, content, body, created_at, sender_name, media_url, media_type, whatsapp_msg_id, quoted_content, reactions, delivery_status')
        .eq('conversation_id', convId)
        .lt('created_at', oldestTs)
        .order('created_at', { ascending: false })
        .limit(MSG_PAGE);
      const rows = data || [];
      const olderMsgs = rows.reverse().filter(msg => msg.content || msg.body || msg.media_url || msg.media_type).map(msg => ({
        id: msg.id, from: msg.direction === 'outbound' ? 'out' : 'in',
        text: msg.content || msg.body || '',
        time: new Date(msg.created_at || Date.now()).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
        _ts: msg.created_at || new Date(0).toISOString(),
        mediaType: msg.media_type || null, mediaUrl: msg.media_url || null,
        agentName: msg.sender_name || null, waMsgId: msg.whatsapp_msg_id || null,
        replyTo: msg.quoted_content || null, reactions: msg.reactions || [],
        deliveryStatus: msg.delivery_status ?? null,
      }));
      if (olderMsgs.length > 0) {
        scrollAnchorRef.current = scrollRef.current?.scrollHeight || 0;
        setMessages(m => {
          const existing = m[convId] || [];
          const existingIds = new Set(existing.map(x => x.id));
          const toAdd = olderMsgs.filter(x => !existingIds.has(x.id));
          return { ...m, [convId]: [...toAdd, ...existing] };
        });
      }
      setMsgHasMore(prev => ({ ...prev, [convId]: rows.length === MSG_PAGE }));
    } catch { /* ignore */ }
    loadingOlderRef.current = false;
    setLoadingOlderMsgs(false);
  }

  // ── REFRESH ACTIVE CONVS ──────────────────────────────────
  const REFRESH_STATUSES = ['aguardando', 'em_atendimento', 'atendimento_aberto', 'automacao', 'falha'];

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
          const phone  = c.whatsapp_chat_id ? c.whatsapp_chat_id.split('@')[0] : '';
          const gname  = c.group_name && !/^\d{10,}$/.test(c.group_name) ? c.group_name : null;
          const name   = c.contact_name || gname || c.push_name || (c.is_group ? 'Grupo' : phone) || 'Desconhecido';
          const lm    = lastMsgMap[c.id];
          const preview = lm ? (lm.media_type === 'image' ? '🖼 Imagem' : lm.media_type === 'video' ? '🎬 Vídeo' : lm.media_type === 'document' ? '📄 Documento' : lm.media_type?.includes('audio') ? '🎵 Áudio' : lm.media_type === 'sticker' ? '🔖 Figurinha' : lm.content || lm.body || '') : '';
          const previewFrom = lm?.direction === 'inbound' ? 'in' : 'out';
          return { id: c.id, name, avatar: name.slice(0, 2).toUpperCase(), photoUrl: c.push_photo_url || null, type: c.is_group ? 'group' : 'whatsapp', whatsapp_chat_id: c.whatsapp_chat_id, preview, previewFrom, time: c.updated_at ? new Date(c.updated_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '', _sortTs: c.updated_at || '', unread: 0, online: false, messages: [], status: c.status, department_id: c.department_id || null, customer_id: c.customer_id || null, status_v2: c.status_v2 || 'open', tenant_id: c.tenant_id || null, breno_paused: c.breno_paused || false, last_breno_handled_at: c.last_breno_handled_at || null };
        });
        setConvs(prev => [...prev.filter(c => !statuses.includes(c.status)), ...mapped]);
      } catch { /* silencioso */ }
    })();
  }, [statusFilter, selectedInstance, tenantDbId]);

  // ── BUSCA SERVER-SIDE: consulta o banco quando 3+ chars ────
  useEffect(() => {
    clearTimeout(searchTimerRef.current);
    if (!isSearching || !tenantDbId) { setSearchConvs([]); return; }
    searchTimerRef.current = setTimeout(async () => {
      try {
        const q = search.replace(/%/g, '').replace(/_/g, '');
        const { data } = await supabase
          .from('conversations')
          .select('id, push_name, contact_name, group_name, whatsapp_chat_id, is_group, push_photo_url, status, updated_at, department_id, customer_id, status_v2, tenant_id, breno_paused, last_breno_handled_at')
          .eq('tenant_id', tenantDbId)
          .or(`push_name.ilike.%${q}%,contact_name.ilike.%${q}%,group_name.ilike.%${q}%,whatsapp_chat_id.ilike.%${q}%`)
          .order('updated_at', { ascending: false })
          .limit(100);
        if (!data) return;
        const mapped = data.map(c => {
          const phone = c.whatsapp_chat_id ? c.whatsapp_chat_id.split('@')[0] : '';
          const name  = c.contact_name || c.group_name || c.push_name || phone || 'Desconhecido';
          return {
            id: c.id, name, avatar: name.slice(0, 2).toUpperCase(), photoUrl: c.push_photo_url || null,
            type: c.is_group ? 'group' : 'whatsapp', whatsapp_chat_id: c.whatsapp_chat_id,
            preview: '', previewFrom: 'out',
            time: c.updated_at ? new Date(c.updated_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '',
            _sortTs: c.updated_at || '', unread: 0, online: false, messages: [],
            status: c.status, department_id: c.department_id || null, customer_id: c.customer_id || null,
            status_v2: c.status_v2 || 'open', tenant_id: c.tenant_id || null,
            breno_paused: c.breno_paused || false, last_breno_handled_at: c.last_breno_handled_at || null,
          };
        });
        setSearchConvs(mapped);
      } catch { /* silencioso */ }
    }, 300);
    return () => clearTimeout(searchTimerRef.current);
  }, [isSearching, search, tenantDbId]);

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
          const name  = c.contact_name || c.group_name || c.push_name || phone || 'Desconhecido';
          const lm    = lastMsgMap[c.id];
          const preview = lm ? (lm.media_type === 'image' ? '🖼 Imagem' : lm.media_type === 'video' ? '🎬 Vídeo' : lm.media_type === 'document' ? '📄 Documento' : lm.media_type?.includes('audio') ? '🎵 Áudio' : lm.media_type === 'sticker' ? '🔖 Figurinha' : lm.content || lm.body || '') : '';
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
    setDraft(''); setReplyTo(null); voiceFinalRef.current = '';
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    if (HAS_EVO && selectedInstance && active.whatsapp_chat_id) {
      setSending(true);
      const textToSend = agentName ? `*${agentName}:*\n${text}` : text;
      const waQuoted = currentReplyTo?.waMsgId ? { key: { id: currentReplyTo.waMsgId, remoteJid: active.whatsapp_chat_id, fromMe: currentReplyTo.from === 'out' }, message: currentReplyTo.mediaType ? {} : { conversation: currentReplyTo.text || '' } } : null;
      try {
        // Salva no banco ANTES de chamar a Evolution para que o DEDUP do webhook
        // encontre a linha e não insira duplicata quando o evento fromMe chegar.
        const { error: insertErr } = await supabase.from('messages').insert({ tenant_id: active.tenant_id || null, conversation_id: active.id, direction: 'outbound', content: text, sender_name: agentName || null, created_at: now.toISOString(), ...(currentReplyTo ? { quoted_content: currentReplyTo } : {}) });
        if (insertErr) console.error('Falha ao salvar mensagem no banco:', insertErr);
        const instObj = instances.find(i => i.instance_name === selectedInstance);
        await sendTextMessage(selectedInstance, active.whatsapp_chat_id, textToSend, waQuoted, instObj?.evolution_url, instObj?.api_key);
        // Equipe enviou → conversa vai para "Em aberto" (atendimento_aberto)
        // Inclui 'finalizado': se time está respondendo, conv não está mais finalizada
        const canUpdateStatus = !['falha', 'archived'].includes(convStatus);
        if (canUpdateStatus) {
          const isFirstAssign = convStatus !== 'atendimento_aberto';
          await changeStatus('atendimento_aberto');
          if (isFirstAssign) {
            // Evento com ts 1s antes da mensagem para aparecer acima dela na timeline
            const eventTs = new Date(now.getTime() - 1000).toISOString();
            await insertEvent(active.id, 'assigned', {}, eventTs);
            // Recarrega do banco para renderizar o evento na posição correta (antes da msg)
            loadMsgs(active.id);
          }
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

  function insertChanEmoji(em) {
    const el = chanTextareaRef.current;
    if (!el) { setChanDraft(d => d + em); return; }
    const start = el.selectionStart;
    const end   = el.selectionEnd;
    const next  = chanDraft.slice(0, start) + em + chanDraft.slice(end);
    setChanDraft(next);
    setTimeout(() => { el.focus(); el.setSelectionRange(start + em.length, start + em.length); }, 0);
  }

  async function sendChanFile(file) {
    if (!file || !active?.chanId) return;
    const ext = file.name.split('.').pop();
    const path = `channels/${active.chanId}/${Date.now()}-${file.name}`;
    const { data: up } = await supabase.storage.from('public').upload(path, file, { upsert: true });
    if (!up?.path) return;
    const { data: { publicUrl } } = supabase.storage.from('public').getPublicUrl(up.path);
    const isImage = file.type.startsWith('image/');
    const { data } = await supabase.from('channel_messages').insert({
      channel_id: active.chanId, sender_id: currentUser?.id || null, sender_name: currentUser?.name || 'Você',
      text: isImage ? `🖼 ${file.name}` : `📎 ${file.name}`,
      media_url: publicUrl, media_type: file.type,
    }).select().single();
    if (data) setChanMsgs(m => ({ ...m, [active.chanId]: [...(m[active.chanId] || []), data] }));
  }

  async function sendChanAudio(blob) {
    if (!blob || !active?.chanId) return;
    const path = `channels/${active.chanId}/${Date.now()}.ogg`;
    const { data: up, error: upErr } = await supabase.storage.from('public').upload(path, blob, { upsert: true, contentType: 'audio/ogg' });
    if (upErr) { console.error('sendChanAudio upload:', upErr); return; }
    if (!up?.path) return;
    const { data: { publicUrl } } = supabase.storage.from('public').getPublicUrl(up.path);
    const { data } = await supabase.from('channel_messages').insert({
      channel_id: active.chanId, sender_id: currentUser?.id || null, sender_name: currentUser?.name || 'Você',
      text: '🎵 Áudio', media_url: publicUrl, media_type: 'audio/ogg',
    }).select().single();
    if (data) setChanMsgs(m => ({ ...m, [active.chanId]: [...(m[active.chanId] || []), data] }));
  }

  async function createChannel() {
    const name = newChanName.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    if (!name || !tenantDbId) return;
    setSavingChan(true);
    try {
      const { data } = await supabase.from('internal_channels').insert({
        tenant_id: tenantDbId, name, description: newChanDesc.trim() || null,
        color: newChanColor, is_global: false,
      }).select().single();
      if (data) {
        setConvs(prev => [...prev, {
          id: 'chan-' + data.id, name: '#' + data.name, avatar: data.name.slice(0, 2).toUpperCase(),
          type: 'internal', chanId: data.id, color: data.color || '#B70C00',
          isGlobal: false, description: data.description || '', preview: data.description || 'Canal interno',
          time: '', unread: 0, online: false, messages: [],
        }]);
      }
      setShowNewChan(false); setNewChanName(''); setNewChanDesc(''); setNewChanColor('#B70C00');
    } catch { /* ignore */ }
    setSavingChan(false);
  }

  async function sendChanMsg() {
    const text = chanDraft.trim();
    if (!text || !active) return;
    const chanId = active.chanId;
    const now = new Date();
    const tmpMsg = { id: 'tmp-' + Date.now(), sender_name: currentUser?.name || 'Você', text, is_pinned: false, created_at: now.toISOString() };
    setChanMsgs(m => ({ ...m, [chanId]: [...(m[chanId] || []), tmpMsg] }));
    setChanDraft('');
    if (chanTextareaRef.current) { chanTextareaRef.current.style.height = 'auto'; }
    try {
      const { data } = await supabase.from('channel_messages').insert({ channel_id: chanId, sender_id: currentUser?.id || null, sender_name: currentUser?.name || 'Você', text }).select().single();
      if (data) setChanMsgs(m => ({ ...m, [chanId]: (m[chanId] || []).map(msg => msg.id === tmpMsg.id ? data : msg) }));
    } catch { /* ignore */ }
  }

  async function saveEditChanMsg(msgId, newText) {
    const t = newText.trim();
    if (!t || !active?.chanId) return;
    const chanId = active.chanId;
    const { error } = await supabase.from('channel_messages').update({ text: t }).eq('id', msgId);
    if (!error) {
      setChanMsgs(m => ({ ...m, [chanId]: (m[chanId] || []).map(msg => msg.id === msgId ? { ...msg, text: t } : msg) }));
      setEditingChanMsgId(null);
      setEditingChanMsgText('');
    }
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

  function startVoiceInput() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { alert('Seu navegador não suporta reconhecimento de voz.\nUse Chrome ou Edge.'); return; }

    const rec = new SR();
    rec.lang = 'pt-BR';
    rec.continuous = true;
    rec.interimResults = true;

    voiceFinalRef.current = draft;

    rec.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const seg = e.results[i][0].transcript;
        if (e.results[i].isFinal) {
          voiceFinalRef.current += (voiceFinalRef.current && !voiceFinalRef.current.endsWith(' ') ? ' ' : '') + seg;
        } else {
          interim += seg;
        }
      }
      const full = voiceFinalRef.current + (interim ? (voiceFinalRef.current ? ' ' : '') + interim : '');
      onDraftChange(full.trimStart());
    };

    rec.onerror = () => stopVoiceInput();
    rec.onend   = () => setVoiceActive(false);

    voiceRecRef.current = rec;
    rec.start();
    setVoiceActive(true);
  }

  function stopVoiceInput() {
    voiceRecRef.current?.stop();
    voiceRecRef.current = null;
    setVoiceActive(false);
  }

  async function saveConvName() {
    const newName = editingConvNameDraft.trim();
    if (!newName || !activeId) { setEditingConvName(false); return; }
    const field = active.is_group ? 'group_name' : 'contact_name';
    await supabase.from('conversations').update({ [field]: newName }).eq('id', activeId);
    setConvs(prev => prev.map(c => c.id === activeId ? { ...c, [field]: newName, name: newName } : c));
    setEditingConvName(false);
  }

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
    // Apaga no WhatsApp (revoke para todos) — apenas mensagens enviadas por nós com ID do WA
    if (msg.waMsgId && msg.from === 'out' && selectedInstanceRef.current) {
      const conv = convsRef.current.find(c => c.id === activeId);
      const remoteJid = conv?.whatsapp_chat_id;
      if (remoteJid) {
        deleteWhatsAppMessage(selectedInstanceRef.current, remoteJid, msg.waMsgId).catch(() => {});
      }
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

  const insertEvent = async (convId, eventType, meta = {}, ts = null) => {
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
        ...(ts ? { ts } : {}),
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

  const handleForward = async (targetConvs) => {
    const msg = forwardMsg;
    setForwardMsg(null);
    if (!msg || !selectedInstance || !targetConvs?.length) return;
    const validTargets = targetConvs.filter(tc => tc.whatsapp_chat_id);
    if (!validTargets.length) return;

    // Persiste a mensagem encaminhada na conversa do destinatário com o
    // whatsapp_msg_id retornado pela Evolution. A unique constraint em
    // messages.whatsapp_msg_id (migration 20260516) dedup contra o echo do
    // SEND_MESSAGE webhook — quem chegar primeiro vence, o outro vira no-op.
    const persistForwarded = async (target, content, mediaType, mediaUrl, whatsappMsgId) => {
      const row = {
        tenant_id:       target.tenant_id || tenantDbId || null,
        conversation_id: target.id,
        direction:       'outbound',
        content:         content || null,
        sender_name:     currentUser?.name || null,
        media_type:      mediaType || null,
        media_url:       mediaUrl || null,
        whatsapp_msg_id: whatsappMsgId || null,
        created_at:      new Date().toISOString(),
      };
      // Se temos whatsappMsgId usa upsert (idempotente vs webhook echo);
      // senão insert direto (sem onConflict porque NULLs não conflitam).
      const q = whatsappMsgId
        ? supabase.from('messages').upsert(row, { onConflict: 'whatsapp_msg_id', ignoreDuplicates: true })
        : supabase.from('messages').insert(row);
      const { error } = await q;
      if (error) console.error('[FORWARD] persist falhou:', error, row);
    };

    try {
      if (msg.mediaType?.includes('audio') && msg.mediaUrl) {
        const res = await fetch(msg.mediaUrl);
        const blob = await res.blob();
        const base64 = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result.split(',')[1]);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
        await Promise.all(validTargets.map(async (target) => {
          const r = await sendAudioMessage(selectedInstance, target.whatsapp_chat_id, base64);
          await persistForwarded(target, null, 'audio', msg.mediaUrl, r?.key?.id ?? null);
        }));
      } else if (msg.mediaType && msg.mediaUrl) {
        const res = await fetch(msg.mediaUrl);
        const blob = await res.blob();
        const mime = blob.type || 'application/octet-stream';
        const base64 = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result.split(',')[1]);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
        const caption = msg.text || '';
        await Promise.all(validTargets.map(async (target) => {
          const r = await sendMediaMessage(selectedInstance, target.whatsapp_chat_id, base64, msg.mediaType, mime, caption, '');
          await persistForwarded(target, caption || null, msg.mediaType, msg.mediaUrl, r?.key?.id ?? null);
        }));
      } else if (msg.text) {
        const forwardedText = `↪️ ${msg.text}`;
        await Promise.all(validTargets.map(async (target) => {
          const instFwd = instances.find(i => i.instance_name === selectedInstance);
          const r = await sendTextMessage(selectedInstance, target.whatsapp_chat_id, forwardedText, null, instFwd?.evolution_url, instFwd?.api_key);
          await persistForwarded(target, forwardedText, null, null, r?.key?.id ?? null);
        }));
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
      try {
        const r = await sendMediaMessage(selectedInstance, active.whatsapp_chat_id, base64, mediaType, file.type, '', file.name);
        console.log('[MEDIA-FILE] Evolution OK:', r);
      } catch (err) {
        console.error('[MEDIA-FILE] Falha ao enviar mídia:', err);
        alert(`Falha ao enviar mídia para ${active.name || active.whatsapp_chat_id}:\n${err.message}`);
      } finally { setSending(false); }
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

    // Imagem colada
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

    // Texto: garante que quebras de linha sejam preservadas independente da fonte
    e.preventDefault();
    let text = e.clipboardData.getData('text/plain') || '';

    // Quando copiado de editores ricos (Notion, Google Docs, WhatsApp Web, etc.)
    // o text/plain pode não ter \n, mas o text/html tem <br> e <div> — extraímos dali
    if (!text.includes('\n') && e.clipboardData.types.includes('text/html')) {
      const html = e.clipboardData.getData('text/html');
      text = html
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>/gi, '\n')
        .replace(/<\/div>/gi, '\n')
        .replace(/<\/li>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&nbsp;/g, ' ').replace(/&#39;/g, "'").replace(/&quot;/g, '"');
    }

    // Normaliza \r\n e \r → \n (Windows)
    const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    const el = textareaRef.current;
    if (!el) { onDraftChange(draft + normalized); return; }
    const start  = el.selectionStart;
    const end    = el.selectionEnd;
    const newVal = el.value.slice(0, start) + normalized + el.value.slice(end);
    onDraftChange(newVal);
    setTimeout(() => el.setSelectionRange(start + normalized.length, start + normalized.length), 0);
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
      try {
        const r = await sendMediaMessage(selectedInstance, active.whatsapp_chat_id, base64, 'image', f.type, caption, f.name || 'imagem.png');
        console.log('[PASTE-IMG] Evolution OK:', r, 'caption enviado:', JSON.stringify(caption));
      } catch (err) {
        console.error('[PASTE-IMG] Falha ao enviar imagem:', err);
        alert(`Falha ao enviar imagem para ${active.name || active.whatsapp_chat_id}:\n${err.message}`);
      } finally { setSending(false); URL.revokeObjectURL(previewUrl); }
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

  // ── Tradução por mensagem ─────────────────────────────────
  async function translateMessage(msgId, msgText) {
    if (!msgText) return;
    setTranslations(t => ({ ...t, [msgId]: { loading: true } }));
    try {
      const BRIDGE_URL = import.meta.env.VITE_BRIDGE_URL || '';
      const { data: { session } } = await supabase.auth.getSession();
      const r = await fetch(`${BRIDGE_URL}/chat/ai`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ command: '/traduzir', messages: [{ direction: 'inbound', content: msgText }] }),
      });
      const data = await r.json();
      if (data.ok && data.bullets?.length) {
        const tradLine = data.bullets[0] || '';
        const langLine = data.bullets[1] || '';
        const text = tradLine.replace(/^Tradu[çc][ãa]o:\s*/i, '');
        const lang = langLine.replace(/^Idioma detectado:\s*/i, '');
        setTranslations(t => ({ ...t, [msgId]: { loading: false, text, lang } }));
      } else {
        setTranslations(t => ({ ...t, [msgId]: { loading: false, error: true } }));
      }
    } catch {
      setTranslations(t => ({ ...t, [msgId]: { loading: false, error: true } }));
    }
  }

  // ── Transcrição Whisper ───────────────────────────────────
  async function transcribeMessage(msgId, mediaUrl) {
    if (!mediaUrl) return;
    setTranscriptions(t => ({ ...t, [msgId]: { loading: true } }));
    try {
      const BRIDGE_URL = import.meta.env.VITE_BRIDGE_URL || '';
      const { data: { session } } = await supabase.auth.getSession();
      const authHeader = session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
      let r;
      if (mediaUrl.startsWith('data:')) {
        // data: URI (base64 inline no banco) — browser converte em blob sem CORS
        const blobRes = await fetch(mediaUrl);
        const blob = await blobRes.blob();
        const form = new FormData();
        form.append('audio', blob, 'audio.ogg');
        r = await fetch(`${BRIDGE_URL}/api/whisper/transcribe`, { method: 'POST', headers: authHeader, body: form });
      } else {
        // HTTP URL — bridge busca server-side (evita CORS do browser)
        r = await fetch(`${BRIDGE_URL}/api/whisper/transcribe`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeader },
          body: JSON.stringify({ mediaUrl }),
        });
      }
      if (!r.ok) throw new Error(`Transcrição falhou: ${r.status}`);
      const data = await r.json();
      setTranscriptions(t => ({ ...t, [msgId]: { loading: false, text: data.text || '' } }));
    } catch {
      setTranscriptions(t => ({ ...t, [msgId]: { loading: false, error: true } }));
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
        const instAi = selectedInstanceObjRef.current;
        await sendTextMessage(selectedInstanceRef.current, chatId, data.text, null, instAi?.evolution_url, instAi?.api_key);
      }
    } catch { /* silent */ } finally {
      iaPendingRef.current.delete(convId);
    }
  }

  // ── AI COMMANDS ───────────────────────────────────────────
  const runCommand = async (cmd) => {
    // Captura o texto livre do draft ANTES de limpar (usado por /tarefa e /handoff).
    // Ex.: "/tarefa ligar pro cliente" → freeText = "ligar pro cliente".
    const rawDraft = (draft || '').trim();
    const freeText = rawDraft.startsWith(cmd)
      ? rawDraft.slice(cmd.length).trim()
      : rawDraft;

    setShowSlash(false);
    setDraft('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';

    const BRIDGE_URL = import.meta.env.VITE_BRIDGE_URL || '';
    const AI_CMDS = ['/resumir', '/proxima', '/traduzir', '/tom', '/cobranca'];

    // ── /tarefa e /handoff: ações internas (não chamam Anthropic) ──────────
    // Mesmo POST /chat/ai dos demais comandos; o Bridge resolve loja_id pela conversa.
    if (cmd === '/tarefa' || cmd === '/handoff') {
      if (!freeText) {
        setAiAction({
          type: 'error',
          title: cmd === '/tarefa' ? 'Criar tarefa' : 'Passar pra humano',
          body: cmd === '/tarefa'
            ? ['Descreva a tarefa após o comando. Ex.: /tarefa ligar pro cliente amanhã']
            : ['Informe o agente/atendente após o comando. Ex.: /handoff João'],
        });
        return;
      }
      setAiAction({
        type: 'loading',
        title: cmd === '/tarefa' ? 'Criando tarefa…' : 'Registrando handoff…',
        body: ['Processando…'],
      });
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const jwt = session?.access_token;
        const r = await fetch(`${BRIDGE_URL}/chat/ai`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
          body: JSON.stringify({
            command: cmd,
            prompt: freeText,
            messages: activeMsgs.slice(-30),
            conversation_id: active?.id,
            tenant_id: active?.tenant_id,
          }),
        });
        const data = await r.json();
        if (data.ok) {
          setAiAction({ type: 'cmd', title: data.title, body: data.bullets || [] });
        } else {
          setAiAction({ type: 'error', title: 'Erro DELI', body: [data.error || 'Tente novamente.'] });
        }
      } catch (err) {
        setAiAction({ type: 'error', title: 'Erro de conexão', body: [err.message] });
      }
      return;
    }

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

    setAiAction({ type: 'cmd', title: cmd, body: ['Comando executado pela DELI…'] });
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
    const el = textareaRef.current;
    if (el) { el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 160) + 'px'; }
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
    if (qr.file_path) {
      const { data } = supabase.storage.from('public').getPublicUrl(qr.file_path);
      const mimeType = qr.media_type === 'audio'
        ? (qr.file_path.endsWith('.ogg') ? 'audio/ogg' : 'audio/webm')
        : 'image/jpeg';
      setQrConfirm({ qr, publicUrl: data.publicUrl, mimeType });
      return;
    }
    if (qr.media_url && qr.media_type !== 'text') {
      const mimeType = qr.media_type === 'audio' ? 'audio/ogg' : 'image/jpeg';
      setQrConfirm({ qr, publicUrl: qr.media_url, mimeType });
      return;
    }
    setDraft(qr.content || qr.text || '');
  };

  const enviarQrMidia = async ({ qr, publicUrl, mimeType }) => {
    setQrConfirm(null);
    const instance = selectedInstance;
    const chatId   = active?.whatsapp_chat_id;
    if (!instance || !chatId) return;
    try {
      const resp = await fetch(publicUrl);
      const blob = await resp.blob();
      const base64 = await new Promise(res => {
        const reader = new FileReader();
        reader.onloadend = () => res(reader.result.split(',')[1]);
        reader.readAsDataURL(blob);
      });
      if (qr.media_type === 'audio') {
        await sendAudioMessage(instance, chatId, base64);
      } else {
        const fileName = qr.file_path.split('/').pop();
        await sendMediaMessage(instance, chatId, base64, 'image', mimeType, qr.content || '', fileName);
      }
    } catch (err) {
      console.error('[QR] enviarQrMidia:', err);
    }
  };

  const qrIconByType = (t) =>
    t === 'image' ? 'image' : t === 'audio' ? 'mic' : t === 'video_link' ? 'play' : 'star';

  // ── DERIVADOS ─────────────────────────────────────────────
  const active         = convs.find(c => c.id === activeId) || searchConvs.find(c => c.id === activeId) || null;

  // ── ESPAÇOS: resolve client_id da conversa + checa se tem pasta ──
  // (declarado após `active` para evitar TDZ no dep array — ver bug "Cannot access ... before initialization")
  useEffect(() => {
    if (!active?.whatsapp_chat_id || !tenantDbId) { setEspacosClientId(null); setEspacosHasFolder(false); return; }
    let cancelled = false;
    const jid = active.whatsapp_chat_id;
    const isGroup = jid.endsWith('@g.us');

    const checkFolder = async (cid) => {
      try {
        if (cid && tenantDbId) {
          const { count } = await supabase.from('espacos_folders')
            .select('id', { count: 'exact', head: true })
            .eq('tenant_id', tenantDbId).eq('customer_id', cid);
          if (!cancelled) setEspacosHasFolder((count ?? 0) > 0);
        } else if (!cancelled) {
          setEspacosHasFolder(false);
        }
      } catch { if (!cancelled) setEspacosHasFolder(false); }
    };

    const resolve = (cid) => {
      if (cancelled) return;
      setEspacosClientId(cid ?? null);
      checkFolder(cid ?? null);
    };

    if (isGroup) {
      supabase.from('whatsapp_groups').select('loja_id').eq('tenant_id', tenantDbId).eq('evolution_jid', jid).maybeSingle()
        .then(async ({ data: wg }) => {
          if (cancelled) return;
          if (!wg?.loja_id) { resolve(null); return; }
          const { data: loja } = await supabase.from('lojas').select('client_id').eq('id', wg.loja_id).eq('is_consultoria_ativa', true).not('client_id', 'is', null).maybeSingle();
          resolve(loja?.client_id ?? null);
        })
        .catch(() => { resolve(null); });
    } else if (active.customer_id) {
      supabase.from('lojas').select('client_id').eq('tenant_id', tenantDbId).eq('client_id', active.customer_id).eq('is_consultoria_ativa', true).not('client_id', 'is', null).maybeSingle()
        .then(({ data }) => { resolve(data?.client_id ?? null); })
        .catch(() => { resolve(null); });
    } else {
      resolve(null);
    }
    return () => { cancelled = true; };
  }, [active?.id, tenantDbId]);
  const activeMsgs     = messages[activeId] || [];
  const isChannel      = !!activeId?.startsWith('chan-');
  const activeChanMsgs = isChannel ? (chanMsgs[active?.chanId] || []) : [];
  const suggestion     = active?.deliSuggestion;
  const showGhost      = !draft && suggestion && aiMode !== 'humano';

  // ── MIA: loja vinculada à conversa ativa ─────────────────
  const lojaVinculada  = useLojaPorRemoteJid(active?.whatsapp_chat_id);

  const abertosCount    = statusCounts.nao_iniciado + statusCounts.aguardando + statusCounts.aberto;
  const finalizadoCount = statusCounts.finalizado;
  const unreadCount     = convs.reduce((s, c) => s + (c.unread || 0), 0);

  const baseList = isSearching ? searchConvs : convs;
  const filtered = baseList.filter(c => {
    // Canais internos aparecem em todas as abas (exceto favoritas, onde exige fav)
    if (c.id.startsWith('chan-')) {
      if (tab === 'fav') return favConvs.has(c.id);
      if (statusFilter === 'interno') return true;
      if (c.status === 'finalizado') return false;
      return true;
    }
    if (tab === 'fav'    && !favConvs.has(c.id))   return false;
    if (tab === 'wa'     && c.type !== 'whatsapp') return false;
    if (tab === 'groups' && c.type !== 'group')    return false;
    if (tab === 'int'    && !(c.type === 'internal' || c.type === 'agent')) return false;
    if (isSearching) return true; // DB já filtrou por nome/telefone, só aplica tab
    // Sem filtro ativo: oculta finalizadas e arquivadas por padrão,
    // EXCETO quando há mensagem inbound recente (cliente respondeu depois do finalize)
    if (!statusFilter && !c.id.startsWith('chan-') && (c.status === 'finalizado' || c.status === 'archived') && !c._recentInbound) return false;
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
                { id: 'espacos', icon: 'folder', label: 'Espaços', overflow: true, action: () => onNavigate?.('espacos', espacosClientId ? { customerId: espacosClientId } : {}) },
              ].map(t => (
                <button key={t.id} className={`lc-tab${t.overflow ? ' lc-tabs-overflow' : ''}${headerTab === t.id ? ' on' : ''}`} onClick={() => t.action ? t.action() : setHeaderTab(t.id)}>
                  <Icon name={t.icon} size={13} /> <span className="lc-tab-label">{t.label}</span>
                </button>
              ))}
            </div>
          </div>
        </header>
        <div style={{ flex: 1, overflow: 'auto', padding: 32, color: 'rgba(255,255,255,0.6)', fontSize: 13 }}>
          {headerTab === 'dept'  && <DepartmentsScreen tenantDbId={tenantDbId} members={members} />}
          {headerTab === 'bots'  && <BotsScreen tenantDbId={tenantDbId} />}
              {headerTab === 'proto' && <ProtocolosScreen tenantDbId={tenantDbId} onOpenConv={id => { setActiveId(id); setHeaderTab('inbox'); loadMsgs(id); }} />}
              {headerTab === 'viz'   && <VisualizacaoScreen tenantDbId={tenantDbId} />}
        </div>
      </div>
    );
  }

  return (
    <>
    <div
      className={`route-enter livechat chat-shell-grid${mobilePane === 'chat' ? ' lc-mobile-chat' : ' lc-mobile-list'}`}
      style={{
        display: 'grid',
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
              { id: 'espacos', icon: 'folder', label: 'Espaços', overflow: true, action: () => onNavigate?.('espacos', espacosClientId ? { customerId: espacosClientId } : {}) },
            ].map(t => (
              <button key={t.id} className={`lc-tab${t.overflow ? ' lc-tabs-overflow' : ''}${headerTab === t.id ? ' on' : ''}`} onClick={() => t.action ? t.action() : setHeaderTab(t.id)}>
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
          <button className={`lc-head-btn${showTasksPanel ? ' on' : ''}`} onClick={() => setShowTasksPanel(v => !v)}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>
            <span className="lc-head-btn-label">Tarefas</span>
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
                className={`lc-stats-more-btn${selectMode ? ' active' : ''}`}
                title="Selecionar conversas"
                onClick={() => { setSelectMode(v => !v); if (selectMode) setSelectedConvIds(new Set()); }}
                style={{ color: selectMode ? '#93C5FD' : undefined }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
                </svg>
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
                onClick={() => { if (statusFilter === c.id) return; setStatusFilter(c.id); if (!['finalizado', 'oculto'].includes(c.id)) refreshPendingConvs(); }}
                title={c.label}
              >
                <StatusIcon name={c.icon} size={12} />
                {c.value > 0 && <span className="lc-stat-pill-count">{c.value}</span>}
              </button>
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
                          {entry.text || (entry.mediaType === 'image' ? '🖼 Imagem' : entry.mediaType?.includes('audio') ? '🎵 Áudio' : entry.mediaType === 'video' ? '🎬 Vídeo' : entry.mediaType === 'sticker' ? '🔖 Figurinha' : '📄 Documento')}
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
        ) : null}

        {/* Lista de conversas */}
        {!showStarredPanel && <div className="lc-list-body dark-scroll">

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
                setEditingConvName(false);
                setMobilePane('chat');
                if (usingRealData && !c.id.startsWith('chan-')) loadMsgs(c.id);
                // Zera badge de não lidas ao abrir canal
                if (c.id.startsWith('chan-') && c.unread) {
                  setConvs(prev => prev.map(x => x.id === c.id ? { ...x, unread: 0 } : x));
                }
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
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: active.color || '#B70C00', flexShrink: 0 }} />
                      {(active.type === 'whatsapp' || active.type === 'group') ? (
                        editingConvName ? (
                          <input
                            autoFocus
                            value={editingConvNameDraft}
                            onChange={e => setEditingConvNameDraft(e.target.value)}
                            onBlur={saveConvName}
                            onKeyDown={e => { if (e.key === 'Enter') saveConvName(); if (e.key === 'Escape') setEditingConvName(false); }}
                            className="lc-chat-name"
                            style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.25)', borderRadius: 4, color: 'white', padding: '1px 6px', outline: 'none', width: 180 }}
                          />
                        ) : (
                          <span
                            className="lc-chat-name"
                            title="Clique para renomear"
                            style={{ cursor: 'pointer' }}
                            onClick={() => { setEditingConvNameDraft(active.is_group ? (active.group_name || active.name) : (active.contact_name || active.name)); setEditingConvName(true); }}
                          >
                            {active.is_group ? (active.group_name || active.name) : (active.contact_name || active.name)}
                          </span>
                        )
                      ) : (
                        <span className="lc-chat-name">{active.name}</span>
                      )}
                    </div>
                    <div className="lc-chat-sub" style={{ marginTop: 1 }}>
                      <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>{active.description || 'Canal interno'}</span>
                      {active.isGlobal && <span style={{ marginLeft: 6, fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 9999, background: 'rgba(183,12,0,0.18)', color: '#FF6B6B', textTransform: 'uppercase', letterSpacing: 0.5 }}>Global</span>}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {active?.status === 'finalizado' ? (
                    <button className="lc-action-btn" onClick={() => setConvs(prev => prev.map(c => c.id === activeId ? { ...c, status: null } : c))}>
                      <Icon name="refresh" size={13} /> Reabrir
                    </button>
                  ) : (
                    <button className="lc-action-btn primary" onClick={() => setConvs(prev => prev.map(c => c.id === activeId ? { ...c, status: 'finalizado' } : c))}>
                      <Icon name="check" size={13} /> Finalizar
                    </button>
                  )}
                  <button className="lc-action-btn" onClick={() => onNavigate?.('grupos')} style={{ fontSize: 11 }}><Icon name="users" size={12} /> Membros</button>
                </div>
              </header>

              {/* Divider com nome do canal */}
              <div style={{ padding: '16px 20px 8px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: active.color || '#B70C00', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800, color: 'white', flexShrink: 0 }}>
                    #
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15, color: 'white' }}>{active.name}</div>
                    {active.description && <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 1 }}>{active.description}</div>}
                  </div>
                </div>
              </div>

              <div ref={chanScrollRef} className="lc-msgs dark-scroll" style={{ padding: '8px 0' }}>
                {activeChanMsgs.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '40px 20px', color: 'rgba(255,255,255,0.35)', fontSize: 13 }}>
                    <div style={{ fontSize: 32, marginBottom: 10 }}>👋</div>
                    Este é o início de <strong style={{ color: 'white' }}>{active.name}</strong>.<br/>Seja o primeiro a escrever!
                  </div>
                )}
                {activeChanMsgs.map((msg, i) => {
                  const prevMsg = i > 0 ? activeChanMsgs[i - 1] : null;
                  const sameAuthor = prevMsg?.sender_name === msg.sender_name && (new Date(msg.created_at) - new Date(prevMsg.created_at)) < 5 * 60 * 1000;
                  return (
                    <div key={msg.id} style={{ display: 'flex', gap: 10, padding: sameAuthor ? '1px 20px' : '8px 20px 2px', alignItems: 'flex-start', position: 'relative' }} onMouseEnter={() => setHoveredChanMsgId(msg.id)} onMouseLeave={() => setHoveredChanMsgId(null)}>
                      {sameAuthor ? (
                        <div style={{ width: 32, flexShrink: 0 }} />
                      ) : (
                        <div style={{ width: 32, height: 32, borderRadius: '50%', background: active.color || '#B70C00', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 12, color: 'white', flexShrink: 0 }}>
                          {(msg.sender_name || '?').slice(0, 2).toUpperCase()}
                        </div>
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        {!sameAuthor && (
                          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 2 }}>
                            <span style={{ fontWeight: 700, fontSize: 13, color: 'white' }}>{msg.sender_name || 'Equipe'}</span>
                            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>{new Date(msg.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                          </div>
                        )}
                        {msg.media_url ? (
                          msg.media_type?.startsWith('image/') ? (
                            <div>
                              <img src={msg.media_url} alt={msg.text} style={{ maxWidth: 320, maxHeight: 240, borderRadius: 8, marginTop: 4, display: 'block', cursor: 'pointer' }} onClick={() => setLightboxUrl(msg.media_url)} />
                              {msg.text && !msg.text.startsWith('🖼') && (
                                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.85)', lineHeight: 1.45, wordBreak: 'break-word', marginTop: 4 }}>{formatWhatsApp(msg.text)}</div>
                              )}
                            </div>
                          ) : msg.media_type?.includes('audio') ? (
                            <audio controls src={msg.media_url} style={{ marginTop: 4, height: 36, maxWidth: 280 }} />
                          ) : (
                            <a href={msg.media_url} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 4, padding: '6px 10px', background: 'rgba(255,255,255,0.08)', borderRadius: 7, color: 'rgba(255,255,255,0.8)', fontSize: 12, textDecoration: 'none' }}>
                              📎 {msg.text.replace('📎 ', '')}
                            </a>
                          )
                        ) : editingChanMsgId === msg.id ? (
                          <div style={{ marginTop: 2 }}>
                            <textarea autoFocus value={editingChanMsgText}
                              onChange={e => { setEditingChanMsgText(e.target.value); const el = e.target; el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 160) + 'px'; }}
                              onKeyDown={e => { if (e.key === 'Escape') { setEditingChanMsgId(null); setEditingChanMsgText(''); } else if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveEditChanMsg(msg.id, editingChanMsgText); } }}
                              style={{ width: '100%', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(183,12,0,0.5)', borderRadius: 6, padding: '6px 8px', fontSize: 14, color: 'rgba(255,255,255,0.9)', outline: 'none', resize: 'none', maxHeight: 160, overflowY: 'auto' }}
                            />
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>Enter salva · Esc cancela</span>
                              <button onClick={() => saveEditChanMsg(msg.id, editingChanMsgText)} style={{ background: '#B70C00', color: 'white', border: 'none', borderRadius: 4, padding: '2px 8px', fontSize: 11, cursor: 'pointer' }}>Salvar</button>
                              <button onClick={() => { setEditingChanMsgId(null); setEditingChanMsgText(''); }} style={{ background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)', border: 'none', borderRadius: 4, padding: '2px 8px', fontSize: 11, cursor: 'pointer' }}>Cancelar</button>
                            </div>
                          </div>
                        ) : (
                          <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.85)', lineHeight: 1.45, wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>{formatWhatsApp(msg.text)}</div>
                        )}
                      </div>
                      {hoveredChanMsgId === msg.id && !editingChanMsgId && (msg.sender_id ? msg.sender_id === currentUser?.id : msg.sender_name === currentUser?.name) && (
                        <button onClick={() => { setEditingChanMsgId(msg.id); setEditingChanMsgText(msg.text); }} style={{ position: 'absolute', top: 4, right: 20, background: 'rgba(30,30,30,0.92)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, padding: '3px 8px', cursor: 'pointer', color: 'rgba(255,255,255,0.65)', fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }} title="Editar mensagem">✏️ Editar</button>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Input oculto para arquivos do canal */}
              <input ref={chanFileInputRef} type="file" accept="image/*,video/*,application/pdf,.doc,.docx,.xlsx,.csv" style={{ display: 'none' }}
                onChange={e => { const f = e.target.files?.[0]; if (f) sendChanFile(f); e.target.value = ''; }} />

              <footer className="lc-composer-bar" style={{ padding: '8px 12px 12px' }}>
                {/* Estado de gravação de áudio no canal */}
                {recState === 'recording' ? (
                  <div className="lc-composer lc-composer-rec">
                    <button onClick={cancelRecording} className="lc-comp-icon lc-rec-cancel" title="Cancelar"><Icon name="x" size={16} /></button>
                    <div className="lc-rec-indicator">
                      <span className="lc-rec-dot" />
                      <div className="lc-rec-waves">{[...Array(6)].map((_, i) => <span key={i} className="lc-rec-wave" style={{ animationDelay: `${i * 0.12}s` }} />)}</div>
                      <span className="lc-rec-time">{formatRecTime(recSeconds)}</span>
                    </div>
                    <button onClick={stopRecording} className="lc-comp-send ready" title="Parar"><Icon name="squarestop" size={15} /></button>
                  </div>
                ) : recState === 'preview' ? (
                  <div className="lc-composer lc-composer-rec">
                    <audio ref={audioElRef} src={audioPreview} onLoadedMetadata={e => setRecDuration(Math.round(e.target.duration))} onTimeUpdate={e => setRecCurrentTime(Math.round(e.target.currentTime))} onEnded={() => setRecPlaying(false)} style={{ display: 'none' }} />
                    <button onClick={discardAudio} className="lc-comp-icon lc-rec-cancel" title="Descartar"><Icon name="trash" size={16} /></button>
                    <div className="lc-rec-indicator">
                      <button onClick={togglePlayPreview} className="lc-rec-play-btn" title={recPlaying ? 'Pausar' : 'Ouvir'}>
                        {recPlaying ? <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
                          : <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>}
                      </button>
                      <div className="lc-rec-seek-wrap">
                        <input type="range" min={0} max={recDuration || 1} value={recCurrentTime} className="lc-rec-seek"
                          onChange={e => { const t = Number(e.target.value); if (audioElRef.current) audioElRef.current.currentTime = t; setRecCurrentTime(t); }} />
                      </div>
                      <span className="lc-rec-time">{recPlaying ? formatRecTime(recCurrentTime) : formatRecTime(recDuration)}</span>
                    </div>
                    <button onClick={async () => { if (audioBlobRef.current) { await sendChanAudio(audioBlobRef.current); discardAudio(); } }} className="lc-comp-send ready" title="Enviar áudio"><Icon name="send" size={15} /></button>
                  </div>
                ) : (
                  <div style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, overflow: 'visible', display: 'flex', flexDirection: 'column' }}>
                    {/* Área de texto */}
                    <div style={{ padding: '10px 12px 6px', position: 'relative' }}>
                      <textarea
                        ref={chanTextareaRef}
                        value={chanDraft}
                        onChange={e => { setChanDraft(e.target.value); const el = e.target; el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 160) + 'px'; }}
                        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChanMsg(); } }}
                        className="lc-comp-input"
                        placeholder={`Escreva para ${active.name}…`}
                        rows={1}
                        style={{ width: '100%', background: 'transparent', border: 'none', outline: 'none', resize: 'none', padding: 0, fontSize: 14, maxHeight: 160, overflowY: 'auto' }}
                      />
                    </div>
                    {/* Toolbar inferior estilo ClickUp */}
                    <div style={{ display: 'flex', alignItems: 'center', padding: '4px 8px 8px', gap: 2, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                      {/* Emoji */}
                      <>
                        <button ref={chanEmojiButtonRef} className="lc-comp-icon" title="Emoji" onClick={() => setChanShowEmoji(v => !v)} style={{ padding: '5px 7px' }}>
                          <Icon name="smile" size={15} />
                        </button>
                        {chanShowEmoji && ReactDOM.createPortal(
                          (() => {
                            const rect = chanEmojiButtonRef.current?.getBoundingClientRect();
                            const bottom = rect ? window.innerHeight - rect.top + 8 : 80;
                            const right  = rect ? window.innerWidth  - rect.right  : 16;
                            return (
                              <div style={{ position: 'fixed', bottom, right, zIndex: 9999 }}>
                                <EmojiPicker
                                  onSelect={em => { insertChanEmoji(em); setChanShowEmoji(false); }}
                                  onClose={() => setChanShowEmoji(false)}
                                />
                              </div>
                            );
                          })(),
                          document.body
                        )}
                      </>
                      {/* Arquivo */}
                      <button className="lc-comp-icon" title="Anexar arquivo" onClick={() => chanFileInputRef.current?.click()} style={{ padding: '5px 7px' }}>
                        <Icon name="paperclip" size={15} />
                      </button>
                      {/* Imagem */}
                      <button className="lc-comp-icon" title="Enviar imagem" onClick={() => { const i = document.createElement('input'); i.type='file'; i.accept='image/*'; i.onchange=e=>{const f=e.target.files?.[0];if(f)sendChanFile(f);}; i.click(); }} style={{ padding: '5px 7px' }}>
                        <Icon name="image" size={15} />
                      </button>

                      {/* Spacer */}
                      <div style={{ flex: 1 }} />

                      {/* Mic ou Enviar */}
                      {chanDraft.trim() ? (
                        <button onClick={sendChanMsg} className="lc-comp-send ready" title="Enviar (Enter)" style={{ borderRadius: 7, padding: '6px 10px' }}>
                          <Icon name="send" size={15} />
                        </button>
                      ) : (
                        <button onClick={startRecording} className="lc-comp-send lc-comp-mic" title="Gravar áudio" style={{ borderRadius: 7, padding: '6px 10px' }}>
                          <Icon name="mic" size={15} />
                        </button>
                      )}
                    </div>
                  </div>
                )}
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
                    <div className="lc-chat-name">
                      {(active.type === 'whatsapp' || active.type === 'group') ? (
                        editingConvName ? (
                          <input
                            autoFocus
                            value={editingConvNameDraft}
                            onChange={e => setEditingConvNameDraft(e.target.value)}
                            onBlur={saveConvName}
                            onKeyDown={e => { if (e.key === 'Enter') saveConvName(); if (e.key === 'Escape') setEditingConvName(false); }}
                            style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.25)', borderRadius: 4, color: 'white', fontSize: 13, fontWeight: 600, padding: '1px 6px', outline: 'none', width: 200 }}
                          />
                        ) : (
                          <span
                            title="Clique para renomear"
                            style={{ cursor: 'pointer' }}
                            onClick={() => { setEditingConvNameDraft(active.is_group ? (active.group_name || active.name) : (active.contact_name || active.name)); setEditingConvName(true); }}
                          >
                            {active.is_group ? (active.group_name || active.name) : (active.contact_name || active.name)}
                          </span>
                        )
                      ) : active.name}
                    </div>
                    <div className="lc-chat-sub">
                      {active.type === 'whatsapp' && <span className="lc-wa-mini" style={{ flexShrink: 0 }}><Icon name="whatsapp" size={10} /></span>}
                      {active.type === 'group'    && <Icon name="users" size={12} style={{ flexShrink: 0 }} />}
                      {active.whatsapp_chat_id && <code style={{ fontSize: 10, background: 'rgba(255,255,255,0.06)', padding: '1px 5px', borderRadius: 3 }}>{active.whatsapp_chat_id.split('@')[0]}</code>}
                    </div>
                  </div>
                  {espacosClientId && espacosHasFolder && (
                    <button
                      className="lc-action-btn"
                      style={{ fontSize: 11, flexShrink: 0 }}
                      onClick={() => setDemandasDrawer({ open: true, customerId: espacosClientId })}
                      title="Abrir demandas deste cliente"
                    >
                      Demandas
                    </button>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                  <button className="lc-icon-btn-dark" onClick={() => runCommand('/resumir')} title="Resumir conversa">
                    <Icon name="sparkles" size={15} />
                  </button>
                  <button className="lc-icon-btn-dark" onClick={() => runCommand('/proxima')} title="Próxima ação">
                    <Icon name="arrowright" size={15} />
                  </button>
                  <div style={{ width: 1, height: 18, background: 'rgba(255,255,255,0.1)', margin: '0 2px' }} />
                  {espacosClientId && espacosHasFolder && (
                    <button
                      className="lc-action-btn"
                      style={{ fontSize: 11 }}
                      onClick={() => onNavigate?.('espacos', { customerId: espacosClientId })}
                      title="Abrir Espaços deste cliente"
                    >
                      <Icon name="folder" size={12} /> Espaços
                    </button>
                  )}
                  {(active.type === 'whatsapp' || active.type === 'group') && (
                    <DepartmentSelector dark conversationId={active.id} tenantId={tenantDbId} currentDepartmentId={active.department_id ?? null} onChanged={async dept => {
                      const oldDept = departments.find(d => d.id === active.department_id);
                      setConvs(prev => prev.map(c => c.id === active.id ? { ...c, department_id: dept.id } : c));
                      await insertEvent(active.id, 'transferred', { dept_from: oldDept?.name || null, dept_to: dept.name || null });
                    }} />
                  )}
                  <span className="lc-protocol">#{active.id?.slice(-5) || '00000'}</span>
                  <span title={realtimeStatus === 'SUBSCRIBED' ? 'Realtime conectado' : 'Realtime desconectado — atualize a página'} style={{ width: 7, height: 7, borderRadius: '50%', background: realtimeStatus === 'SUBSCRIBED' ? '#22C55E' : '#EF4444', flexShrink: 0, display: 'inline-block' }} />
                  {isChannel ? (
                    active?.status === 'finalizado' ? (
                      <button className="lc-action-btn" onClick={() => setConvs(prev => prev.map(c => c.id === activeId ? { ...c, status: null } : c))}>
                        <Icon name="refresh" size={13} /> Reabrir
                      </button>
                    ) : (
                      <button className="lc-action-btn primary" onClick={() => setConvs(prev => prev.map(c => c.id === activeId ? { ...c, status: 'finalizado' } : c))}>
                        <Icon name="check" size={13} /> Finalizar
                      </button>
                    )
                  ) : convStatus === 'finalizado' ? (
                    <button className="lc-action-btn" onClick={async () => { const { error } = await changeStatus('atendimento_aberto'); if (!error) { await insertEvent(activeId, 'reopened'); loadMsgs(activeId); setConvs(prev => prev.map(c => c.id === activeId ? { ...c, status: 'atendimento_aberto', status_v2: 'in_progress' } : c)); } }} disabled={statusLoading}>
                      <Icon name="refresh" size={13} /> Reabrir
                    </button>
                  ) : (
                    <button className="lc-action-btn primary" onClick={async () => { const { error } = await finish(); if (!error) { await insertEvent(activeId, 'closed'); loadMsgs(activeId); setConvs(prev => prev.map(c => c.id === activeId ? { ...c, status: 'finalizado', status_v2: 'closed' } : c)); setResolved(r => ({ ...r, [activeId]: true })); } }} disabled={statusLoading}>
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
                  <button
                    className="lc-icon-btn-dark"
                    title={mutedConvs.has(active?.id) ? 'Ativar notificações desta conversa' : 'Silenciar notificações desta conversa'}
                    onClick={() => { toggleMute(active.id); setMutedConvs(getMuted()); }}
                    style={mutedConvs.has(active?.id) ? { color: '#FBBF24' } : {}}
                  >
                    <Icon name={mutedConvs.has(active?.id) ? 'belloff' : 'bell'} size={15} />
                  </button>
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

              {/* Banner: Evolution API sem mensagens inbound */}
              {(() => {
                if (waAlertDismissed || waLastInbound === null || !usingRealData) return null;
                const horasAtraso = waLastInbound
                  ? Math.floor((Date.now() - new Date(waLastInbound).getTime()) / 3600000)
                  : null;
                if (waLastInbound !== '' && horasAtraso < 3) return null;
                const msg = waLastInbound === ''
                  ? 'Sem mensagens de clientes registradas — verifique a conexão WhatsApp'
                  : `Sem mensagens de clientes há ${horasAtraso}h — verifique a conexão WhatsApp`;
                return (
                  <div style={{ padding: '7px 12px', background: 'rgba(234,179,8,0.1)', borderLeft: '3px solid #EAB308', display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#FDE68A', flexShrink: 0 }}>
                    <span>⚠️</span>
                    <span style={{ flex: 1 }}>{msg}</span>
                    <button onClick={() => setWaAlertDismissed(true)} style={{ background: 'none', border: 'none', color: '#FDE68A', cursor: 'pointer', padding: '0 4px', fontSize: 16, lineHeight: 1 }}>×</button>
                  </div>
                );
              })()}

              {/* Mensagens */}
              <div style={{ position: 'relative', flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
              <div ref={scrollRef} className="lc-msgs dark-scroll"
                onScroll={() => {
                  const el = scrollRef.current;
                  if (!el) return;
                  const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
                  setShowScrollBtn(dist > 120);
                  if (el.scrollTop < 80 && msgHasMore[activeId] && !loadingOlderRef.current) {
                    loadOlderMsgs(activeId);
                  }
                }}
              >
                {loadingOlderMsgs && (
                  <div style={{ textAlign: 'center', padding: '8px 0 4px', color: 'rgba(255,255,255,0.35)', fontSize: 12 }}>
                    Carregando mensagens anteriores…
                  </div>
                )}
                {!loadingOlderMsgs && msgHasMore[activeId] && activeMsgs.length > 0 && (
                  <div style={{ textAlign: 'center', padding: '6px 0 2px' }}>
                    <button onClick={() => loadOlderMsgs(activeId)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.35)', fontSize: 12, cursor: 'pointer' }}>
                      ↑ Ver mensagens anteriores
                    </button>
                  </div>
                )}
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
                      onTraduzirMsg={msg => translateMessage(msg.id, msg.text)}
                      onTranscribeMsg={msg => transcribeMessage(msg.id, msg.mediaUrl)}
                      onForward={msg => setForwardMsg(msg)}
                      translation={translations[m.id]}
                      transcription={transcriptions[m.id]}
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

              {/* Composer */}
              <footer className="lc-composer-bar" style={{ position: 'relative' }}>
                {convStatus === 'finalizado' && (
                  <div style={{ background: 'rgba(251,191,36,0.12)', borderTop: '2px solid rgba(251,191,36,0.5)', padding: '6px 14px', fontSize: 11, color: '#FCD34D', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span>⚠️</span>
                    <span>Conversa <strong>finalizada</strong> — ao enviar, ela será reaberta automaticamente.</span>
                  </div>
                )}
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
                {/* Modal confirmação de mídia QR */}
                {qrConfirm && (
                  <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    onClick={() => setQrConfirm(null)}>
                    <div style={{ background: '#fff', borderRadius: 10, padding: 24, maxWidth: 420, width: '92%', boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}
                      onClick={e => e.stopPropagation()}>
                      <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12 }}>{qrConfirm.qr.title}</div>
                      {qrConfirm.qr.media_type === 'image' && (
                        <img src={qrConfirm.publicUrl} alt="" style={{ maxWidth: '100%', maxHeight: 220, borderRadius: 6, marginBottom: 12, display: 'block' }} />
                      )}
                      {qrConfirm.qr.media_type === 'audio' && (
                        <audio controls src={qrConfirm.publicUrl} style={{ width: '100%', marginBottom: 12 }} />
                      )}
                      {qrConfirm.qr.content && (
                        <div style={{ fontSize: 13, color: '#555', marginBottom: 16, whiteSpace: 'pre-wrap' }}>{qrConfirm.qr.content}</div>
                      )}
                      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                        <button
                          style={{ padding: '7px 16px', borderRadius: 5, border: '1px solid var(--line)', background: '#f5f5f5', cursor: 'pointer', fontSize: 13 }}
                          onClick={() => setQrConfirm(null)}
                        >Cancelar</button>
                        <button
                          style={{ padding: '7px 18px', borderRadius: 5, border: 'none', background: 'var(--red)', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
                          onClick={() => enviarQrMidia(qrConfirm)}
                        >Enviar</button>
                      </div>
                    </div>
                  </div>
                )}

                {showQR && (
                  <div className="lc-popover lc-qr">
                    <div className="lc-pop-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>Respostas rápidas</span>
                      <button
                        style={{ fontSize: 10, color: 'var(--red-light)', background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px' }}
                        onClick={() => { setShowQR(false); onNavigate?.('respostas-rapidas'); }}
                      >
                        + Gerenciar
                      </button>
                    </div>
                    {(quickReplies.length > 0 ? quickReplies : QUICK_REPLIES_DEFAULT).map(qr => (
                      <button key={qr.id} className="lc-pop-item" onClick={() => insertQR(qr)}>
                        <Icon name={qrIconByType(qr.media_type)} size={14} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, color: 'white', fontWeight: 600 }}>
                            {qr.title || qr.label}
                            {qr.shortcut && (
                              <span style={{ marginLeft: 6, fontSize: 10, opacity: 0.4, fontWeight: 400 }}>{qr.shortcut}</span>
                            )}
                          </div>
                          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {qr.media_type === 'image'      ? '🖼 Imagem'
                            : qr.media_type === 'audio'     ? '🎵 Áudio'
                            : qr.media_type === 'video_link'? '🎬 Vídeo'
                            : (qr.content || qr.text)}
                          </div>
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
                    <textarea
                      ref={pasteCaptionRef}
                      className="lc-paste-caption"
                      placeholder="Adicionar legenda (opcional)… Shift+Enter = nova linha"
                      value={pasteCaption}
                      rows={2}
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
                    <button
                      className="lc-comp-icon"
                      onClick={() => voiceActive ? stopVoiceInput() : startVoiceInput()}
                      title={voiceActive ? 'Parar transcrição' : 'Voz para texto (pt-BR)'}
                      style={{ color: voiceActive ? '#ef4444' : undefined, position: 'relative' }}
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                        <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                        <line x1="12" y1="19" x2="12" y2="23"/>
                        <line x1="8" y1="23" x2="16" y2="23"/>
                      </svg>
                      {voiceActive && (
                        <span style={{
                          position: 'absolute', top: -3, right: -3,
                          width: 7, height: 7, borderRadius: '50%',
                          background: '#ef4444', animation: 'pulse-dot 1s infinite',
                        }}/>
                      )}
                    </button>
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

            {/* Sem lead vinculado — mostra bloco de criação/vinculação imediatamente */}
            {!activeCustomer && active.whatsapp_chat_id ? (
              <LeadPanel
                conversation={active}
                customer={null}
                tenantId={tenantDbId}
                members={members}
                onCustomerLinked={cust => {
                  setActiveCustomer(cust);
                  setConvs(prev => prev.map(c => c.id === active.id ? { ...c, customer_id: cust.id } : c));
                }}
              />
            ) : (
              <>
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
                    <button className="lc-mini-action" onClick={() => onNavigate?.('tarefas')}><Icon name="check" size={12} /> Ver tarefas</button>
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
                  <CustomerNotesSection
                    customerId={activeCustomer?.id}
                    customerName={activeCustomer?.name}
                    conversationId={active?.id}
                    tenantId={tenantDbId}
                    conversationMsgs={activeMsgs}
                    currentUserId={currentUser?.id}
                  />
                </CollapseSection>

                {/* iFood */}
                <CollapseSection title="iFood" open={openIfood} onToggle={() => setOpenIfood(v => !v)}>
                  <FieldRow label="ID Loja"     value="—" />
                  <FieldRow label="Pedidos 30d" value="—" />
                </CollapseSection>

                {/* Lead Panel com dados completos (tags, listas, notas, etc.) */}
                {activeCustomer && (
                  <LeadPanel
                    conversation={active}
                    customer={activeCustomer}
                    tenantId={tenantDbId}
                    members={members}
                    onCustomerLinked={cust => {
                      setActiveCustomer(cust);
                      setConvs(prev => prev.map(c => c.id === active.id ? { ...c, customer_id: cust.id } : c));
                    }}
                  />
                )}
              </>
            )}
          </>
        )}

        {/* ─── MIA: tab "Cliente em Foco" — aparece se houver loja vinculada ── */}
        {lojaVinculada && active && (
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', padding: 12 }}>
            <ClienteFocoPanel
              lojaId={lojaVinculada.loja_id}
              conversaId={active.id}
              tenantId={tenantDbId}
            />
          </div>
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

    {/* Modal — Criar novo canal interno */}
    {showNewChan && (
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}
        onClick={e => { if (e.target === e.currentTarget) setShowNewChan(false); }}>
        <div style={{ background: 'var(--lc-bg, #111827)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, padding: 24, width: 360, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: newChanColor, flexShrink: 0 }} />
            <span style={{ fontWeight: 700, fontSize: 15, color: 'white' }}>Novo Canal Interno</span>
            <button onClick={() => setShowNewChan(false)} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', fontSize: 18, cursor: 'pointer', lineHeight: 1 }}>×</button>
          </div>

          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.45)', marginBottom: 5, textTransform: 'uppercase', letterSpacing: 0.5 }}>Nome do canal *</div>
            <input
              className="input"
              value={newChanName}
              onChange={e => setNewChanName(e.target.value)}
              placeholder="ex: equipe-vendas"
              autoFocus
              style={{ width: '100%', background: 'rgba(255,255,255,0.06)', color: 'white', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 7, padding: '8px 10px', fontSize: 13 }}
            />
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 3 }}>
              Será exibido como #{newChanName.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') || 'nome-do-canal'}
            </div>
          </div>

          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.45)', marginBottom: 5, textTransform: 'uppercase', letterSpacing: 0.5 }}>Descrição</div>
            <input
              className="input"
              value={newChanDesc}
              onChange={e => setNewChanDesc(e.target.value)}
              placeholder="Para que serve este canal?"
              style={{ width: '100%', background: 'rgba(255,255,255,0.06)', color: 'white', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 7, padding: '8px 10px', fontSize: 13 }}
            />
          </div>

          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.45)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>Cor</div>
            <div style={{ display: 'flex', gap: 8 }}>
              {['#B70C00','#7C3AED','#0369A1','#047857','#B45309','#374151'].map(c => (
                <button key={c} onClick={() => setNewChanColor(c)} style={{ width: 24, height: 24, borderRadius: '50%', background: c, border: newChanColor === c ? '2px solid white' : '2px solid transparent', cursor: 'pointer' }} />
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <button onClick={() => setShowNewChan(false)} style={{ flex: 1, padding: '8px 0', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 7, color: 'rgba(255,255,255,0.7)', fontSize: 13, cursor: 'pointer' }}>Cancelar</button>
            <button
              onClick={createChannel}
              disabled={savingChan || !newChanName.trim()}
              style={{ flex: 2, padding: '8px 0', background: savingChan || !newChanName.trim() ? 'rgba(183,12,0,0.35)' : '#B70C00', border: 'none', borderRadius: 7, color: 'white', fontSize: 13, fontWeight: 700, cursor: savingChan || !newChanName.trim() ? 'default' : 'pointer' }}
            >
              {savingChan ? 'Criando…' : 'Criar Canal'}
            </button>
          </div>
        </div>
      </div>
    )}
    {showTasksPanel && (
      <ChatTasksPanel
        tenantDbId={tenantDbId}
        members={members}
        currentUserId={currentUser?.id}
        onClose={() => setShowTasksPanel(false)}
        lojas={lojas}
        activeLoja={lojaVinculada}
      />
    )}
    {demandasDrawer.open && (
      <div
        style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          display: 'flex', alignItems: 'stretch',
        }}
      >
        <div style={{ flex: 1, background: 'rgba(0,0,0,0.35)' }} onClick={() => setDemandasDrawer({ open: false, customerId: null })} />
        <div style={{
          width: 'min(780px, 100vw)', height: '100%',
          background: 'var(--panel, #fff)', display: 'flex', flexDirection: 'column',
          boxShadow: '-4px 0 32px rgba(0,0,0,0.18)',
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '12px 16px', borderBottom: '1px solid var(--line, #e6e4e1)',
            background: 'var(--panel, #fff)', flexShrink: 0,
          }}>
            <span style={{ color: 'var(--tx, #1c1b1a)', fontWeight: 700, fontSize: 15 }}>Demandas do cliente</span>
            <button
              onClick={() => setDemandasDrawer({ open: false, customerId: null })}
              style={{
                background: 'none', border: 'none', color: 'var(--tx2, #76716c)',
                cursor: 'pointer', fontSize: 20, lineHeight: 1, padding: '2px 6px',
              }}
              title="Fechar"
            >×</button>
          </div>
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <TarefasClientesScreen
              tenantDbId={tenantDbId}
              userId={userId ?? currentUser?.id}
              deepLinkCustomerId={demandasDrawer.customerId}
            />
          </div>
        </div>
      </div>
    )}
    </>
  );
}
