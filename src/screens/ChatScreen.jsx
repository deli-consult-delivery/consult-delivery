import { useState, useEffect, useRef } from 'react';
import Icon from '../components/Icon.jsx';
import AgentAvatar from '../components/AgentAvatar.jsx';
import { CONVERSATIONS } from '../data.js';
import { supabase } from '../lib/supabase.js';
import { sendTextMessage, fetchProfile, sendAudioMessage, sendMediaMessage } from '../lib/evolution.js';

const HAS_EVO = !!(
  import.meta.env.VITE_EVOLUTION_URL && import.meta.env.VITE_EVOLUTION_KEY
);

// ── Som de notificação via Web Audio API (sem arquivo externo) ──
function playNotificationSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.setValueAtTime(660, ctx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.35);
  } catch { /* ignore em browsers que bloqueiam AudioContext */ }
}

export default function ChatScreen({ tenant, tenantDbId, onNavigate }) {
  const mockConvs = CONVERSATIONS[tenant] || [];

  const [instances, setInstances]               = useState([]);
  const [selectedInstance, setSelectedInstance]  = useState(null);
  const [convs, setConvs]                        = useState(mockConvs);
  const [usingRealData, setUsingRealData]        = useState(false);
  const [tab, setTab]                            = useState('all');
  const [activeId, setActiveId]                  = useState(mockConvs[0]?.id);
  const [search, setSearch]                      = useState('');
  const [draft, setDraft]                        = useState('');
  const [messages, setMessages]                  = useState(() => {
    const m = {};
    mockConvs.forEach(c => { m[c.id] = [...c.messages]; });
    return m;
  });
  const [typing, setTyping]                      = useState(false);
  const [showInfo, setShowInfo]                  = useState(false);
  const [sending, setSending]                    = useState(false);
  const [showEmoji, setShowEmoji]                = useState(false);
  const [members, setMembers]                    = useState([]);
  const [showNewInternal, setShowNewInternal]    = useState(false);
  const [currentUser, setCurrentUser]            = useState(null);
  const [useSignature, setUseSignature]          = useState(true);

  // ── Gravação de áudio ──────────────────────────────────
  const [recState, setRecState]     = useState('idle'); // idle | recording | preview
  const [recSeconds, setRecSeconds] = useState(0);
  const [audioPreview, setAudioPreview] = useState(null); // { blob, url }
  const mediaRecorderRef = useRef(null);
  const audioChunksRef   = useRef([]);
  const recTimerRef      = useRef(null);

  // ── Canais Internos state ───────────────────────────────
  const [chanMsgs, setChanMsgs]                  = useState({});
  const [chanDraft, setChanDraft]                = useState('');
  const [showPinned, setShowPinned]              = useState(false);
  const [taskFromMsg, setTaskFromMsg]            = useState(null);
  const [taskFromMsgTitle, setTaskFromMsgTitle]  = useState('');
  const [savingTask, setSavingTask]              = useState(false);

  // ── Mensagens Rápidas ─────────────────────────────────
  const [quickReplies, setQuickReplies]   = useState([]);
  const [showQRPopup, setShowQRPopup]     = useState(false);
  const [qrFilter, setQrFilter]           = useState('');
  const [showQRManager, setShowQRManager] = useState(false);
  const [qrEditId, setQrEditId]           = useState(null);
  const [qrEditTitle, setQrEditTitle]     = useState('');
  const [qrEditContent, setQrEditContent] = useState('');
  const [qrTab, setQrTab]                 = useState('quick');
  const [qrExpandedId, setQrExpandedId]   = useState(null);
  const [qrCreating, setQrCreating]       = useState(false);

  const scrollRef     = useRef(null);
  const textareaRef   = useRef(null);
  const chanScrollRef = useRef(null);
  const activeIdRef   = useRef(activeId);
  const photoCacheRef = useRef({});
  useEffect(() => { activeIdRef.current = activeId; }, [activeId]);

  // Bug 2/3 — busca foto + nome do WhatsApp quando uma conversa é aberta
  useEffect(() => {
    if (!HAS_EVO || !selectedInstance || !activeId) return;
    const conv = convs.find(c => c.id === activeId);
    if (!conv || !conv.whatsapp_chat_id) return;
    if (conv.type !== 'whatsapp' && conv.type !== 'group') return;
    const phone = conv.whatsapp_chat_id.split('@')[0];
    if (!phone) return;

    const cached = photoCacheRef.current[phone];
    if (cached === false) return; // fetch anterior falhou, não tentar de novo

    function applyProfile({ photoUrl, waName }) {
      setConvs(prev => prev.map(c => {
        if (c.id !== activeId) return c;
        const upd = { ...c };
        if (photoUrl && !c.photoUrl) upd.photoUrl = photoUrl;
        if (waName && !c.waNameFetched) {
          upd.name = waName;
          upd.avatar = waName.slice(0, 2).toUpperCase();
          upd.waNameFetched = true;
        }
        return upd;
      }));
    }

    if (cached !== undefined) {
      applyProfile(cached);
      return;
    }

    fetchProfile(selectedInstance, phone)
      .then(data => {
        console.log('[fetchProfile] response:', JSON.stringify(data));
        const photoUrl = data?.picture || data?.profilePictureUrl || data?.imgUrl
          || data?.profilePic || data?.profilePicUrl || data?.image || null;
        const waName   = data?.name || data?.pushName || data?.verifiedName
          || data?.notify || data?.short_name || null;
        const profile  = { photoUrl, waName };
        photoCacheRef.current[phone] = profile;
        applyProfile(profile);
        // Persiste nome no banco para próximas cargas
        if (waName) {
          supabase.from('conversations')
            .update({ push_name: waName })
            .eq('id', activeId)
            .then(() => {})
            .catch(() => {});
        }
      })
      .catch(() => { photoCacheRef.current[phone] = false; });
  }, [activeId, selectedInstance]);

  useEffect(() => {
    loadInstances();
    loadMembers();
    loadCurrentUser();
    loadQuickReplies();
  }, []);

  useEffect(() => {
    loadWAGroups(null);
    loadInternalChannels();
    loadQuickReplies();
  }, [tenant, tenantDbId]);

  // ── Load channel messages when switching to a channel ──
  useEffect(() => {
    if (activeId?.startsWith('chan-')) {
      setShowInfo(false);
      const chanId = convs.find(c => c.id === activeId)?.chanId;
      if (chanId && !chanMsgs[chanId]?.length) {
        loadChanMsgs(chanId);
      }
    }
  }, [activeId]);

  // ── Auto-scroll channel messages ───────────────────────
  useEffect(() => {
    if (chanScrollRef.current) {
      chanScrollRef.current.scrollTop = chanScrollRef.current.scrollHeight;
    }
  }, [chanMsgs, activeId]);

  async function loadMembers() {
    try {
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name, email, avatar_url')
        .order('full_name');
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
      setCurrentUser({
        id:   user.id,
        email: user.email,
        name: member?.display_name || profile?.full_name || user.email?.split('@')[0] || 'Equipe',
      });
    } catch { /* ignore */ }
  }

  function insertEmoji(emoji) {
    const ta = textareaRef.current;
    if (!ta) { setDraft(d => d + emoji); return; }
    const start = ta.selectionStart;
    const end   = ta.selectionEnd;
    setDraft(draft.slice(0, start) + emoji + draft.slice(end));
    setTimeout(() => {
      ta.selectionStart = start + emoji.length;
      ta.selectionEnd   = start + emoji.length;
      ta.focus();
    }, 0);
  }

  async function createInternalConv(member) {
    const tempId  = 'int-' + member.id;
    const initials = (member.full_name || 'TM').split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
    const conv = {
      id: tempId, name: member.full_name || member.email || 'Membro',
      avatar: initials, type: 'internal', preview: '', time: '', unread: 0,
      online: false, messages: [], memberId: member.id,
    };
    setConvs(prev => {
      if (prev.find(c => c.id === tempId)) return prev;
      return [conv, ...prev];
    });
    setMessages(m => ({ ...m, [tempId]: [] }));
    setActiveId(tempId);
    setTab('all');
    setShowNewInternal(false);
  }

  useEffect(() => {
    const c = CONVERSATIONS[tenant] || [];
    setConvs(c);
    setActiveId(c[0]?.id);
    const m = {};
    c.forEach(cv => { m[cv.id] = [...cv.messages]; });
    setMessages(m);
    setDraft('');
    setShowInfo(false);
    setUsingRealData(false);
    setSelectedInstance(null);
  }, [tenant]);

  useEffect(() => {
    if (selectedInstance) {
      loadRealtimeConvs(selectedInstance);
      loadWAGroups(selectedInstance);
    } else {
      const c = CONVERSATIONS[tenant] || [];
      setConvs(prev => {
        const groups = prev.filter(c => c.id.startsWith('wag-') || c.id.startsWith('chan-'));
        return [...c, ...groups];
      });
      setUsingRealData(false);
    }
  }, [selectedInstance]);

  // ── Realtime global: todas as mensagens de todas as conversas ──
  useEffect(() => {
    if (!usingRealData) return;

    const channel = supabase
      .channel('global-messages-realtime')
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        payload => {
          const msg = payload.new;
          const text = msg.content || msg.body || '';
          if (!text && !msg.media_url) return;

          const convId    = msg.conversation_id;
          const isInbound = msg.direction !== 'outbound';
          const time      = new Date(msg.created_at || Date.now())
            .toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
          const isActive  = convId === activeIdRef.current;
          const mediaType = msg.media_type || null;
          const preview   = text
            || (mediaType === 'image'    ? '🖼 Imagem'
              : mediaType === 'video'    ? '🎬 Vídeo'
              : mediaType === 'document' ? '📄 Documento'
              : mediaType?.includes('audio') ? '🎵 Áudio' : '');

          // 1. Atualiza a thread da conversa
          setMessages(m => ({
            ...m,
            [convId]: [...(m[convId] || []), {
              id:        msg.id,
              from:      isInbound ? 'in' : 'out',
              text,
              time,
              mediaType,
              mediaUrl:  msg.media_url || null,
            }],
          }));

          // 2. Atualiza sidebar: preview + unread + sobe para o topo
          setConvs(prev => {
            const idx = prev.findIndex(c => c.id === convId);

            // Conversa nova (primeiro contato) — busca do DB e adiciona na sidebar
            if (idx === -1) {
              supabase.from('conversations').select('*').eq('id', convId).single()
                .then(({ data: conv }) => {
                  if (!conv) return;
                  const phone = conv.whatsapp_chat_id?.split('@')[0] || '';
                  const name  = conv.push_name || conv.contact_name || conv.group_name || phone || 'Desconhecido';
                  setConvs(p => {
                    if (p.find(c => c.id === conv.id)) return p;
                    return [{
                      id: conv.id, name, avatar: name.slice(0, 2).toUpperCase(),
                      type: conv.is_group ? 'group' : 'whatsapp',
                      whatsapp_chat_id: conv.whatsapp_chat_id,
                      preview, previewFrom: 'in', time, unread: 1, online: false, messages: [],
                    }, ...p];
                  });
                });
              return prev;
            }

            const conv    = prev[idx];
            const updated = {
              ...conv,
              preview,
              time,
              unread: isActive ? 0 : (conv.unread || 0) + (isInbound ? 1 : 0),
            };
            return [updated, ...prev.filter(c => c.id !== convId)];
          });

          // 3. Som + Badge apenas para mensagens recebidas em conversa não ativa
          if (isInbound && !isActive) {
            playNotificationSound();
          }
        })
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'messages' },
        payload => {
          const msg = payload.new;
          if (!msg.media_url) return;
          // Atualiza media_url quando webhook salva base64 após o INSERT
          setMessages(m => {
            const convMsgs = m[msg.conversation_id];
            if (!convMsgs) return m;
            return {
              ...m,
              [msg.conversation_id]: convMsgs.map(ex =>
                ex.id === msg.id ? { ...ex, mediaUrl: msg.media_url } : ex
              ),
            };
          });
        })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [usingRealData]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, activeId, typing]);

  async function loadWAGroups(instanceName) {
    try {
      let q = supabase.from('whatsapp_groups')
        .select('id, name, type, wa_group_id, participant_count, instance_name')
        .order('created_at', { ascending: false });
      if (instanceName) q = q.eq('instance_name', instanceName);
      const { data } = await q;
      if (!data?.length) return;
      const groupConvs = data.map(g => ({
        id: 'wag-' + g.id, name: g.name, avatar: g.name.slice(0, 2).toUpperCase(),
        type: 'group', whatsapp_chat_id: g.wa_group_id, waGroupId: g.id,
        groupType: g.type, preview: `${g.participant_count || 0} participantes`,
        time: '', unread: 0, online: false, messages: [],
      }));
      setConvs(prev => [...prev.filter(c => !c.id.startsWith('wag-')), ...groupConvs]);
    } catch { /* ignore */ }
  }

  async function loadInternalChannels() {
    try {
      let q = supabase.from('internal_channels')
        .select('id, name, color, description, is_global')
        .order('created_at', { ascending: false });
      if (tenantDbId) q = q.or(`tenant_id.eq.${tenantDbId},is_global.eq.true`);
      const { data } = await q;
      if (!data?.length) return;
      const chanConvs = data.map(c => ({
        id: 'chan-' + c.id, name: '#' + c.name, avatar: c.name.slice(0, 2).toUpperCase(),
        type: 'internal', chanId: c.id, color: c.color || '#2563EB',
        isGlobal: c.is_global, description: c.description || '',
        preview: c.description || 'Canal interno', time: '', unread: 0, online: false, messages: [],
      }));
      setConvs(prev => [...prev.filter(c => !c.id.startsWith('chan-')), ...chanConvs]);
    } catch { /* ignore */ }
  }

  async function loadChanMsgs(chanId) {
    try {
      const { data } = await supabase
        .from('channel_messages')
        .select('id, sender_id, sender_name, text, is_pinned, created_at')
        .eq('channel_id', chanId)
        .order('created_at');
      if (data) setChanMsgs(m => ({ ...m, [chanId]: data }));
    } catch { /* ignore */ }
  }

  async function sendChanMsg() {
    const text = chanDraft.trim();
    if (!text || !active) return;
    const chanId = active.chanId;
    const now = new Date();
    const tmpMsg = {
      id: 'tmp-' + Date.now(), sender_name: 'Você', text,
      is_pinned: false, created_at: now.toISOString(),
    };
    setChanMsgs(m => ({ ...m, [chanId]: [...(m[chanId] || []), tmpMsg] }));
    setChanDraft('');
    try {
      const { data } = await supabase.from('channel_messages').insert({
        channel_id: chanId, sender_name: 'Você', text,
      }).select().single();
      if (data) {
        setChanMsgs(m => ({
          ...m,
          [chanId]: (m[chanId] || []).map(msg => msg.id === tmpMsg.id ? data : msg),
        }));
      }
    } catch { /* ignore */ }
  }

  async function togglePin(chanId, msgId, current) {
    setChanMsgs(m => ({
      ...m,
      [chanId]: (m[chanId] || []).map(msg =>
        msg.id === msgId ? { ...msg, is_pinned: !current } : msg
      ),
    }));
    try {
      await supabase.from('channel_messages')
        .update({ is_pinned: !current, pinned_at: !current ? new Date().toISOString() : null })
        .eq('id', msgId);
    } catch { /* ignore */ }
  }

  async function createTaskFromMsg() {
    if (!taskFromMsg || !taskFromMsgTitle.trim()) return;
    setSavingTask(true);
    try {
      await supabase.from('tasks').insert({
        title: taskFromMsgTitle.trim(),
        description: taskFromMsg.text,
        tenant_id: tenantDbId,
        col: 'todo',
      });
    } catch { /* ignore */ }
    setSavingTask(false);
    setTaskFromMsg(null);
    setTaskFromMsgTitle('');
  }

  async function loadInstances() {
    try {
      const { data } = await supabase
        .from('evolution_instances')
        .select('id, instance_name, status, phone, profile_name')
        .order('created_at');
      if (data?.length) {
        setInstances(data);
        const connected = data.find(i => i.status === 'connected') || data[0];
        setSelectedInstance(connected.instance_name);
      }
    } catch { /* demo mode */ }
  }

  async function loadQuickReplies() {
    try {
      // RLS handles filtering — SELECT policy allows own agent_id OR tenant_id
      const { data, error } = await supabase
        .from('quick_replies')
        .select('id, title, content')
        .order('title');
      if (error) console.error('[QR] load error:', error.message);
      if (data) setQuickReplies(data);
    } catch (e) { console.error('[QR] load exception:', e); }
  }

  async function saveQuickReply() {
    if (!qrEditTitle.trim() || !qrEditContent.trim()) return;
    try {
      if (qrEditId) {
        const { error } = await supabase.from('quick_replies')
          .update({ title: qrEditTitle.trim(), content: qrEditContent.trim() })
          .eq('id', qrEditId);
        if (error) { console.error('[QR] update error:', error.message); return; }
      } else {
        const row = {
          title:    qrEditTitle.trim(),
          content:  qrEditContent.trim(),
          agent_id: currentUser?.id,
        };
        if (tenantDbId) row.tenant_id = tenantDbId;
        const { error } = await supabase.from('quick_replies').insert(row);
        if (error) { console.error('[QR] insert error:', error.message); return; }
      }
      await loadQuickReplies();
      setQrEditId(null); setQrEditTitle(''); setQrEditContent('');
      setQrCreating(false); setQrExpandedId(null);
    } catch (e) { console.error('[QR] save exception:', e); }
  }

  async function deleteQuickReply(id) {
    try {
      await supabase.from('quick_replies').delete().eq('id', id);
      setQuickReplies(prev => prev.filter(q => q.id !== id));
    } catch { /* ignore */ }
  }

  async function loadRealtimeConvs(instanceName) {
    try {
      const { data: inst } = await supabase.from('evolution_instances')
        .select('id').eq('instance_name', instanceName).single();
      if (!inst) { setConvs(CONVERSATIONS[tenant] || []); setUsingRealData(false); return; }

      const { data: rows } = await supabase.from('conversations')
        .select('*').eq('instance_id', inst.id)
        .order('updated_at', { ascending: false }).limit(50);

      if (rows?.length) {
        // Busca última mensagem de cada conversa individualmente — garante preview para todas
        const lastMsgResults = await Promise.all(
          rows.map(r =>
            supabase.from('messages')
              .select('conversation_id, content, body, direction, created_at, media_type')
              .eq('conversation_id', r.id)
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle()
          )
        );
        const lastMsgMap = {};
        lastMsgResults.forEach(({ data }) => {
          if (data) lastMsgMap[data.conversation_id] = data;
        });

        const mapped = rows.map(c => {
          const phone   = c.whatsapp_chat_id ? c.whatsapp_chat_id.split('@')[0] : '';
          const name    = c.push_name || c.contact_name || c.group_name || phone || 'Desconhecido';
          const lm      = lastMsgMap[c.id];
          const preview = lm
            ? (lm.media_type === 'image'    ? '🖼 Imagem'
              : lm.media_type === 'video'    ? '🎬 Vídeo'
              : lm.media_type === 'document' ? '📄 Documento'
              : lm.media_type?.includes('audio') ? '🎵 Áudio'
              : lm.content || lm.body || '')
            : '';
          const previewFrom = lm?.direction === 'inbound' ? 'in' : 'out';
          return {
            id: c.id, name, avatar: name.slice(0, 2).toUpperCase(),
            type: c.is_group ? 'group' : 'whatsapp', whatsapp_chat_id: c.whatsapp_chat_id,
            preview, previewFrom,
            time: c.updated_at
              ? new Date(c.updated_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '',
            unread: 0, online: false, messages: [],
          };
        });
        setConvs(mapped); setActiveId(mapped[0]?.id); setUsingRealData(true);
        if (mapped[0]) loadMsgs(mapped[0].id);
        return;
      }
    } catch { /* ignore */ }
    setConvs(CONVERSATIONS[tenant] || []);
    setUsingRealData(false);
  }

  async function loadMsgs(convId) {
    try {
      const { data } = await supabase.from('messages')
        .select('id, direction, content, body, created_at, sender_name, media_url, media_type')
        .eq('conversation_id', convId).order('created_at').limit(100);
      if (data) {
        setMessages(m => ({
          ...m,
          [convId]: data
            .filter(msg => msg.content || msg.body || msg.media_url)
            .map(msg => ({
              id:        msg.id,
              from:      msg.direction === 'outbound' ? 'out' : 'in',
              text:      msg.content || msg.body || '',
              time:      new Date(msg.created_at || Date.now())
                .toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
              mediaType: msg.media_type || null,
              mediaUrl:  msg.media_url  || null,
            })),
        }));
      }
    } catch { /* ignore */ }
  }

  // ── Gravação de áudio ──────────────────────────────────
  function fmtRecTime(s) {
    const m = Math.floor(s / 60);
    return `${m}:${String(s % 60).padStart(2, '0')}`;
  }

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '';
      const mr = new MediaRecorder(stream, mimeType ? { mimeType } : {});
      mr.ondataavailable = e => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      mr.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(audioChunksRef.current, { type: mr.mimeType || 'audio/webm' });
        const url  = URL.createObjectURL(blob);
        setAudioPreview({ blob, url, mimeType: mr.mimeType || 'audio/webm' });
        setRecState('preview');
      };
      mr.start();
      mediaRecorderRef.current = mr;
      setRecState('recording');
      setRecSeconds(0);
      recTimerRef.current = setInterval(() => setRecSeconds(s => s + 1), 1000);
    } catch {
      alert('Permissão de microfone negada ou não disponível.');
    }
  }

  function stopRecording() {
    clearInterval(recTimerRef.current);
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
  }

  function cancelRecording() {
    clearInterval(recTimerRef.current);
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    if (audioPreview?.url) URL.revokeObjectURL(audioPreview.url);
    setAudioPreview(null);
    setRecState('idle');
    setRecSeconds(0);
  }

  async function sendAudio() {
    if (!audioPreview?.blob || !active || sending) return;
    setSending(true);
    const time = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const localUrl = audioPreview.url;
    setMessages(m => ({
      ...m,
      [active.id]: [...(m[active.id] || []), {
        id: 'tmp-' + Date.now(), from: 'out', text: '', time,
        mediaType: 'audio', mediaUrl: localUrl,
      }],
    }));
    if (HAS_EVO && selectedInstance && active.whatsapp_chat_id) {
      try {
        const ab     = await audioPreview.blob.arrayBuffer();
        const bytes  = new Uint8Array(ab);
        let b64 = '';
        const chunk = 8192;
        for (let i = 0; i < bytes.length; i += chunk) {
          b64 += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunk, bytes.length)));
        }
        const base64 = btoa(b64);
        console.log('[Chat] Enviando áudio:', {
          instance: selectedInstance,
          to: active.whatsapp_chat_id,
          bytes: bytes.length,
          mimeType: audioPreview.mimeType,
        });
        await sendAudioMessage(selectedInstance, active.whatsapp_chat_id, base64);
      } catch (err) {
        console.error('[Chat] Falha ao enviar áudio:', err?.message || err);
      }
    }
    setRecState('idle');
    setRecSeconds(0);
    setAudioPreview(null);
    setSending(false);
  }

  async function sendFile(file) {
    if (!file || !active || sending) return;
    if (file.size > 10 * 1024 * 1024) { alert('Arquivo muito grande. Máximo: 10 MB'); return; }

    const mimeType  = file.type || 'application/octet-stream';
    const isImage   = mimeType.startsWith('image/');
    const isVideo   = mimeType.startsWith('video/');
    const mediaType = isImage ? 'image' : isVideo ? 'video' : 'document';

    // Converter para base64
    const base64 = await new Promise((res, rej) => {
      const reader = new FileReader();
      reader.onload  = e => res(e.target.result.split(',')[1]);
      reader.onerror = rej;
      reader.readAsDataURL(file);
    });
    const dataUrl = `data:${mimeType};base64,${base64}`;
    const time    = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    // UI otimista
    setMessages(m => ({
      ...m,
      [active.id]: [...(m[active.id] || []), {
        id: 'tmp-' + Date.now(), from: 'out', text: file.name, time,
        mediaType, mediaUrl: dataUrl,
      }],
    }));
    setSending(true);
    try {
      if (HAS_EVO && selectedInstance && active.whatsapp_chat_id) {
        await sendMediaMessage(selectedInstance, active.whatsapp_chat_id, base64, mediaType, mimeType, '', file.name);
      }
      await supabase.from('messages').insert({
        conversation_id: active.id,
        direction:   'outbound',
        content:     file.name,
        media_type:  mediaType,
        media_url:   dataUrl,
        created_at:  new Date().toISOString(),
      });
    } catch (err) {
      console.error('[Chat] Falha ao enviar arquivo:', err);
    }
    setSending(false);
  }

  const send = async () => {
    const text = (draft || '').trim();
    if (!text || !active || sending) return;

    const isWA = active.type === 'whatsapp' || active.type === 'group';
    const agentName = (useSignature && currentUser?.name && isWA) ? currentUser.name : null;

    const now  = new Date();
    const time = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    setMessages(m => ({
      ...m,
      [active.id]: [...(m[active.id] || []), { id: 'tmp-' + Date.now(), from: 'out', text, time, agentName }],
    }));
    setDraft('');
    if (HAS_EVO && selectedInstance && active.whatsapp_chat_id) {
      setSending(true);
      try {
        await sendTextMessage(selectedInstance, active.whatsapp_chat_id, text);
        await supabase.from('messages').insert({
          conversation_id: active.id, direction: 'outbound', content: text, created_at: now.toISOString(),
        });
      } catch (err) { console.error('Falha ao enviar via Evolution:', err); }
      finally { setSending(false); }
    } else if (active.type === 'whatsapp' || active.type === 'group') {
      setTyping(true);
      setTimeout(() => {
        setTyping(false);
        const replies = ['Ok, obrigado pela atenção!', 'Show, vou aguardar então.', 'Perfeito, muito obrigado 🙏', 'Beleza, faz sentido.'];
        const r  = replies[Math.floor(Math.random() * replies.length)];
        const t2 = new Date();
        const tm2 = t2.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        setMessages(m => ({
          ...m,
          [active.id]: [...(m[active.id] || []), { id: 'mock-' + t2.getTime(), from: 'in', text: r, time: tm2 }],
        }));
      }, 2400);
    }
  };

  const onKeyDown = e => {
    if (e.key === 'Tab' && showGhost) {
      e.preventDefault();
      setDraft(suggestion);
    } else if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  // ── Derivados ────────────────────────────────────────────
  const active       = convs.find(c => c.id === activeId) || convs[0];
  const activeMsgs   = messages[activeId] || [];
  const suggestion   = active?.deliSuggestion;
  const showGhost    = !draft && suggestion;
  const isChannel    = activeId?.startsWith('chan-');
  const activeChanMsgs = isChannel ? (chanMsgs[active?.chanId] || []) : [];
  const pinnedMsgs   = activeChanMsgs.filter(m => m.is_pinned);
  const showThirdCol = showInfo || (showPinned && isChannel);

  const filtered = convs.filter(c => {
    if (tab === 'wa'     && c.type !== 'whatsapp') return false;
    if (tab === 'groups' && c.type !== 'group')    return false;
    if (tab === 'int'    && !(c.type === 'internal' || c.type === 'agent')) return false;
    if (search && !c.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  // Dentro da tab "int", separar DMs de canais
  const intDireto  = filtered.filter(c => c.type === 'internal' && !c.id.startsWith('chan-'));
  const intCanais  = filtered.filter(c => c.type === 'internal' && c.id.startsWith('chan-'));

  const unreadCount = convs.reduce((s, c) => s + (c.unread || 0), 0);

  if (!active) {
    return <div style={{ padding: 40, color: 'var(--g-500)', fontSize: 14 }}>Nenhuma conversa</div>;
  }

  return (
    <div className="route-enter" style={{
      display: 'grid',
      gridTemplateColumns: showThirdCol
        ? 'minmax(220px, 270px) minmax(0, 1fr) 300px'
        : 'minmax(220px, 270px) minmax(0, 1fr)',
      height: 'calc(100vh - 64px)',
      background: 'var(--g-50)',
      overflow: 'hidden',
    }}>

      {/* ── Col 1: Sidebar ────────────────────────────────── */}
      <div style={{ background: 'var(--white)', borderRight: '1px solid var(--g-200)', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <div style={{ padding: '20px 20px 12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <h2 className="section-h2" style={{ fontSize: 18 }}>Conversas</h2>
            {unreadCount > 0 && <span className="badge badge-red">{unreadCount} novas</span>}
          </div>

          {instances.length > 0 && (
            <select
              value={selectedInstance || ''}
              onChange={e => setSelectedInstance(e.target.value || null)}
              className="input"
              style={{ fontSize: 12, padding: '6px 10px', marginBottom: 10 }}
            >
              <option value="">— Modo demonstração —</option>
              {instances.map(inst => (
                <option key={inst.id} value={inst.instance_name}>
                  {inst.status === 'connected' ? '🟢' : '🔴'} {inst.instance_name}
                  {inst.phone ? ` · ${inst.phone}` : ''}
                </option>
              ))}
            </select>
          )}

          {usingRealData && (
            <div style={{
              marginBottom: 10, padding: '6px 10px', borderRadius: 'var(--r-sm)',
              background: 'rgba(37,211,102,0.10)', border: '1px solid rgba(37,211,102,0.28)',
              fontSize: 11, color: '#1a9e50', display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <span style={{ width: 7, height: 7, background: '#25D366', borderRadius: '50%' }} />
              WhatsApp conectado — dados em tempo real
            </div>
          )}

          <div style={{ position: 'relative', marginBottom: 10 }}>
            <Icon name="search" size={14} style={{ position: 'absolute', top: 11, left: 12, color: 'var(--g-400)' }} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="input"
              placeholder="Buscar conversa…"
              style={{ paddingLeft: 34, background: 'var(--g-50)', borderColor: 'transparent', fontSize: 13 }}
            />
          </div>

          <div style={{ display: 'flex', gap: 3, padding: 3, background: 'var(--g-100)', borderRadius: 6 }}>
            {[
              { id: 'wa',     label: 'WhatsApp' },
              { id: 'groups', label: 'Grupos'   },
              { id: 'int',    label: 'Interno'  },
              { id: 'all',    label: 'Todas'    },
            ].map(t => (
              <button key={t.id} onClick={() => setTab(t.id)} style={{
                flex: 1, padding: '5px 2px', fontSize: 10.5, fontWeight: 600, borderRadius: 4,
                background: tab === t.id ? 'var(--white)' : 'transparent',
                color:      tab === t.id ? 'var(--g-900)' : 'var(--g-600)',
                boxShadow:  tab === t.id ? 'var(--sh-card)' : 'none',
              }}>{t.label}</button>
            ))}
          </div>
        </div>

        {/* Botão nova conversa interna (DM) — apenas na sub-seção Direto */}
        {tab === 'int' && (
          <div style={{ padding: '4px 16px 0' }}>
            <button
              className="btn-secondary"
              style={{ width: '100%', justifyContent: 'center', fontSize: 11 }}
              onClick={() => setShowNewInternal(true)}
            >
              <Icon name="plus" size={12} /> Nova mensagem direta
            </button>
          </div>
        )}

        {/* Lista de conversas */}
        <div className="scroll" style={{ flex: 1, overflowY: 'auto', paddingBottom: 16 }}>
          {tab === 'int' ? (
            <>
              {/* Seção: DIRETO */}
              <SidebarSection label="DIRETO" />
              {intDireto.length === 0 && (
                <div style={{ padding: '8px 16px', fontSize: 12, color: 'var(--g-400)' }}>
                  Nenhuma mensagem direta
                </div>
              )}
              {intDireto.map(c => {
                const lastMsg = messages[c.id]?.slice(-1)[0];
                return (
                  <ConvItem key={c.id} conv={c} active={c.id === activeId} lastMsg={lastMsg} onClick={() => {
                    setActiveId(c.id);
                    if (usingRealData && !messages[c.id]?.length) loadMsgs(c.id);
                  }} />
                );
              })}

              {/* Seção: CANAIS */}
              <SidebarSection
                label="CANAIS"
                action={
                  <button
                    className="btn-icon"
                    style={{ width: 22, height: 22 }}
                    title="Gerenciar canais"
                    onClick={() => onNavigate?.('grupos')}
                  >
                    <Icon name="plus" size={12} />
                  </button>
                }
              />
              {intCanais.length === 0 && (
                <div
                  onClick={() => onNavigate?.('grupos')}
                  style={{ padding: '8px 16px', fontSize: 12, color: 'var(--g-400)', cursor: 'pointer' }}
                >
                  + Criar canal interno
                </div>
              )}
              {intCanais.map(c => (
                <ConvItem key={c.id} conv={c} active={c.id === activeId} onClick={() => {
                  setActiveId(c.id);
                  setShowPinned(false);
                }} />
              ))}
            </>
          ) : (
            <>
              {filtered.map(c => {
                const lastMsg = messages[c.id]?.slice(-1)[0];
                return (
                  <ConvItem key={c.id} conv={c} active={c.id === activeId} lastMsg={lastMsg} onClick={() => {
                    setActiveId(c.id);
                    if (usingRealData && !messages[c.id]?.length) loadMsgs(c.id);
                    if (c.id.startsWith('chan-')) setShowPinned(false);
                  }} />
                );
              })}
              {filtered.length === 0 && (
                <div style={{ textAlign: 'center', padding: 32, color: 'var(--g-400)', fontSize: 13 }}>
                  Nenhuma conversa encontrada
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Col 2: Área de chat / canal ───────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, background: 'var(--g-50)', overflow: 'hidden' }}>

        {isChannel ? (
          /* ── Canal interno ──────────────────────────────── */
          <>
            {/* Header do canal */}
            <div style={{
              padding: '14px 20px', background: 'var(--white)', borderBottom: '1px solid var(--g-200)',
              display: 'flex', alignItems: 'center', gap: 12,
            }}>
              <ConvAvatar conv={active} size={40} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--g-900)' }}>{active.name}</div>
                <div style={{ fontSize: 12, color: 'var(--g-500)' }}>
                  {active.description || 'Canal interno'}
                  {active.isGlobal && (
                    <span style={{
                      marginLeft: 8, fontSize: 10, fontWeight: 700, padding: '1px 5px',
                      borderRadius: 9999, background: 'rgba(37,99,235,0.1)', color: '#2563EB',
                    }}>
                      Global
                    </span>
                  )}
                </div>
              </div>
              <button
                className="btn-secondary"
                style={{ fontSize: 12, padding: '5px 10px' }}
                onClick={() => onNavigate?.('grupos')}
              >
                <Icon name="users" size={13} /> Membros
              </button>
              <button
                className="btn-icon"
                onClick={() => { setShowPinned(v => !v); setShowInfo(false); }}
                style={{ background: showPinned ? 'var(--g-100)' : 'transparent' }}
                title="Mensagens fixadas"
              >
                <span style={{ fontSize: 14 }}>📌</span>
              </button>
            </div>

            {/* Banner de mensagens fixadas */}
            {pinnedMsgs.length > 0 && (
              <div
                onClick={() => setShowPinned(v => !v)}
                style={{
                  padding: '7px 20px', background: 'rgba(37,99,235,0.06)',
                  borderBottom: '1px solid rgba(37,99,235,0.14)',
                  display: 'flex', alignItems: 'center', gap: 8,
                  cursor: 'pointer', fontSize: 12, color: '#2563EB', fontWeight: 600,
                }}
              >
                <span>📌</span>
                {pinnedMsgs.length} mensagem{pinnedMsgs.length > 1 ? 'ns' : ''} fixada{pinnedMsgs.length > 1 ? 's' : ''}
                <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 400, color: 'var(--g-500)' }}>
                  {showPinned ? 'Fechar painel' : 'Ver painel'}
                </span>
              </div>
            )}

            {/* Mensagens do canal */}
            <div
              ref={chanScrollRef}
              className="scroll"
              style={{ flex: 1, overflowY: 'auto', padding: '24px 32px', display: 'flex', flexDirection: 'column', gap: 12 }}
            >
              {activeChanMsgs.length === 0 && (
                <div style={{ textAlign: 'center', padding: 40, color: 'var(--g-400)', fontSize: 13 }}>
                  Nenhuma mensagem ainda. Seja o primeiro a escrever! 👋
                </div>
              )}
              {activeChanMsgs.map(msg => (
                <ChannelMessage
                  key={msg.id}
                  msg={msg}
                  onPin={() => togglePin(active.chanId, msg.id, msg.is_pinned)}
                  onCreateTask={() => {
                    setTaskFromMsg({ text: msg.text });
                    setTaskFromMsgTitle(msg.text.length > 60 ? msg.text.slice(0, 60) + '…' : msg.text);
                  }}
                />
              ))}
            </div>

            {/* Input do canal */}
            <div style={{ padding: '12px 20px 20px', background: 'var(--white)', borderTop: '1px solid var(--g-200)', flexShrink: 0 }}>
              <div className="copilot-wrap">
                <textarea
                  value={chanDraft}
                  onChange={e => setChanDraft(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChanMsg(); }
                  }}
                  className="copilot-textarea"
                  placeholder={`Mensagem para ${active.name}…`}
                  rows={2}
                />
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', padding: '6px 10px 10px' }}>
                  <button
                    onClick={sendChanMsg}
                    className="btn-primary"
                    style={{ padding: '8px 14px', fontSize: 13, opacity: chanDraft.trim() ? 1 : 0.5 }}
                    disabled={!chanDraft.trim()}
                  >
                    Enviar <Icon name="send" size={13} />
                  </button>
                </div>
              </div>
            </div>
          </>
        ) : (
          /* ── WhatsApp / DM ─────────────────────────────── */
          <>
            {/* Header do chat */}
            <div style={{
              padding: '14px 20px', background: 'var(--white)', borderBottom: '1px solid var(--g-200)',
              display: 'flex', alignItems: 'center', gap: 12,
            }}>
              <ConvAvatar conv={active} size={40} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--g-900)' }}>{active.name}</div>
                <div style={{ fontSize: 12, color: 'var(--g-500)', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  {active.online && (
                    <><span style={{ width: 7, height: 7, background: 'var(--success)', borderRadius: '50%' }} />online agora</>
                  )}
                  {active.type === 'whatsapp' && <><span>·</span><Icon name="whatsapp" size={12} style={{ color: '#25D366' }} />WhatsApp</>}
                  {active.type === 'group'    && <><span>·</span><Icon name="users" size={12} />Grupo WhatsApp</>}
                  {active.type === 'internal' && <><span>·</span>Interno</>}
                  {active.type === 'agent'    && <><span>·</span>Agente IA</>}
                  {active.whatsapp_chat_id && (
                    <><span>·</span>
                    <code style={{ fontSize: 10, background: 'var(--g-100)', padding: '1px 5px', borderRadius: 3 }}>
                      {active.whatsapp_chat_id.split('@')[0]}
                    </code></>
                  )}
                </div>
              </div>
              <button className="btn-icon" title="Ligar"><Icon name="phone" size={16} /></button>
              <button
                className="btn-icon"
                onClick={() => setShowInfo(v => !v)}
                style={{ background: showInfo ? 'var(--red-soft)' : 'transparent', color: showInfo ? 'var(--red)' : 'var(--g-600)' }}
                title="Informações do contato"
              >
                <Icon name="info" size={16} />
              </button>
            </div>

            {/* Mensagens */}
            <div ref={scrollRef} className="scroll" style={{
              flex: 1, overflowY: 'auto', padding: '24px 32px',
              display: 'flex', flexDirection: 'column', gap: 10,
            }}>
              {activeMsgs.map((msg, i) => (
                <div key={msg.id || i} style={{ display: 'flex', flexDirection: 'column', alignItems: msg.from === 'out' ? 'flex-end' : 'flex-start' }} className="slide-up">
                  {msg.from === 'out' && msg.agentName && (
                    <div style={{ fontSize: 10, color: 'var(--red)', fontWeight: 600, marginBottom: 2, paddingRight: 2 }}>
                      {msg.agentName}
                    </div>
                  )}
                  <div className={`bubble ${msg.from === 'out' ? 'bubble-out' : 'bubble-in'}`}>
                    {msg.mediaType === 'image' && msg.mediaUrl ? (
                      <div>
                        <img
                          src={msg.mediaUrl}
                          alt={msg.text || 'imagem'}
                          style={{ maxWidth: 260, maxHeight: 260, borderRadius: 6, display: 'block', cursor: 'pointer' }}
                          onClick={() => window.open(msg.mediaUrl)}
                        />
                        {msg.text && msg.text !== '🖼 Imagem' && (
                          <div style={{ marginTop: 4, fontSize: 13 }}>{msg.text}</div>
                        )}
                      </div>
                    ) : msg.mediaType === 'document' && msg.mediaUrl ? (
                      <a
                        href={msg.mediaUrl}
                        download={msg.text || 'arquivo'}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 8,
                          color: msg.from === 'out' ? 'white' : 'var(--g-900)',
                          textDecoration: 'none',
                        }}
                      >
                        <span style={{ fontSize: 22, flexShrink: 0 }}>📄</span>
                        <span style={{ fontSize: 12, wordBreak: 'break-all' }}>{msg.text || 'Arquivo'}</span>
                      </a>
                    ) : msg.mediaType?.includes('audio') ? (
                      msg.mediaUrl
                        ? <AudioMessage url={msg.mediaUrl} isOut={msg.from === 'out'} />
                        : <div style={{ fontSize: 12, color: msg.from === 'out' ? 'rgba(255,255,255,0.7)' : 'var(--g-500)', fontStyle: 'italic' }}>🎵 Carregando áudio…</div>
                    ) : msg.from === 'out' && msg.agentName ? (
                      <>
                        <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.75)', marginBottom: 4 }}>{msg.agentName}:</div>
                        <div>{msg.text}</div>
                      </>
                    ) : msg.text}
                  </div>
                  <div className="bubble-meta" style={{ color: 'var(--g-500)' }}>{msg.time}</div>
                </div>
              ))}
              {typing && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingLeft: 6 }} className="fade-in">
                  <div className="bubble bubble-in" style={{ padding: '10px 14px', display: 'inline-flex', gap: 4 }}>
                    <span style={{ width: 6, height: 6, background: 'var(--g-500)', borderRadius: '50%', animation: 'typing 1.2s infinite 0s' }} />
                    <span style={{ width: 6, height: 6, background: 'var(--g-500)', borderRadius: '50%', animation: 'typing 1.2s infinite 0.2s' }} />
                    <span style={{ width: 6, height: 6, background: 'var(--g-500)', borderRadius: '50%', animation: 'typing 1.2s infinite 0.4s' }} />
                  </div>
                </div>
              )}
            </div>

            {/* Área de input */}
            <div style={{ padding: '12px 20px 20px', background: 'var(--white)', borderTop: '1px solid var(--g-200)', flexShrink: 0 }}>

              {/* ── Estado: gravando ───────────────────────── */}
              {recState === 'recording' && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '14px 16px', borderRadius: 'var(--r-sm)',
                  border: '1px solid rgba(183,12,0,0.25)', background: 'var(--red-soft)',
                }}>
                  <span className="rec-dot" style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--red)', flexShrink: 0 }} />
                  <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--red)' }}>Gravando…</span>
                  <span style={{ fontSize: 13, color: 'var(--g-600)', fontVariantNumeric: 'tabular-nums' }}>{fmtRecTime(recSeconds)}</span>
                  <button
                    className="btn-primary"
                    style={{ marginLeft: 'auto', padding: '7px 14px', fontSize: 12 }}
                    onClick={stopRecording}
                  >
                    <Icon name="squarestop" size={12} /> Parar
                  </button>
                  <button className="btn-secondary" style={{ fontSize: 12, padding: '7px 12px' }} onClick={cancelRecording}>
                    Cancelar
                  </button>
                </div>
              )}

              {/* ── Estado: preview do áudio ───────────────── */}
              {recState === 'preview' && audioPreview && (
                <div style={{
                  padding: '14px 16px', borderRadius: 'var(--r-sm)',
                  border: '1px solid var(--g-200)', background: 'var(--g-50)',
                  display: 'flex', flexDirection: 'column', gap: 12,
                }}>
                  <div style={{ fontSize: 12, color: 'var(--g-500)', fontWeight: 600 }}>Prévia do áudio</div>
                  <AudioMessage url={audioPreview.url} isOut={false} />
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      className="btn-primary"
                      style={{ fontSize: 13, padding: '8px 16px' }}
                      onClick={sendAudio}
                      disabled={sending}
                    >
                      {sending ? 'Enviando…' : <><Icon name="send" size={13} /> Enviar áudio</>}
                    </button>
                    <button className="btn-secondary" style={{ fontSize: 13 }} onClick={cancelRecording}>
                      Descartar
                    </button>
                  </div>
                </div>
              )}

              {/* ── Estado: normal (escrita) ───────────────── */}
              {recState === 'idle' && (
                <>
                  {suggestion && (
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10,
                      padding: '8px 12px',
                      background: 'linear-gradient(to right, rgba(183,12,0,0.06), rgba(183,12,0,0.01))',
                      border: '1px solid rgba(183,12,0,0.2)', borderRadius: 6, fontSize: 12,
                    }}>
                      <AgentAvatar id="deli" size={22} />
                      <span style={{ color: 'var(--g-700)' }}>
                        <strong style={{ color: 'var(--red)' }}>DELI sugeriu</strong> uma resposta baseada no histórico
                      </span>
                      <span className="copilot-hint" style={{ marginLeft: 'auto' }}>
                        Pressione <kbd>Tab</kbd> pra aceitar
                      </span>
                    </div>
                  )}
                  <div className="copilot-wrap" style={{ position: 'relative' }}>
                    {/* ── Popup de mensagens rápidas (trigger: "/") ── */}
                    {showQRPopup && (() => {
                      const filtered = quickReplies.filter(qr =>
                        !qrFilter ||
                        qr.title.toLowerCase().includes(qrFilter) ||
                        qr.content.toLowerCase().includes(qrFilter)
                      );
                      return filtered.length > 0 ? (
                        <div style={{
                          position: 'absolute', bottom: '100%', left: 0, right: 0, zIndex: 200,
                          background: 'var(--white)', border: '1px solid var(--g-200)',
                          borderRadius: 8, boxShadow: 'var(--sh-card)',
                          maxHeight: 220, overflowY: 'auto', marginBottom: 4,
                        }}>
                          <div style={{ padding: '6px 12px', fontSize: 10, fontWeight: 700, color: 'var(--g-500)', borderBottom: '1px solid var(--g-100)', display: 'flex', justifyContent: 'space-between' }}>
                            <span>MENSAGENS RÁPIDAS</span>
                            <button style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 10, color: 'var(--red)', fontWeight: 700 }} onClick={() => setShowQRManager(true)}>Gerenciar</button>
                          </div>
                          {filtered.map(qr => (
                            <div
                              key={qr.id}
                              onClick={() => { setDraft(qr.content); setShowQRPopup(false); setQrFilter(''); }}
                              style={{ padding: '8px 14px', cursor: 'pointer', borderBottom: '1px solid var(--g-100)' }}
                              onMouseEnter={e => e.currentTarget.style.background = 'var(--g-100)'}
                              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                            >
                              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--g-900)' }}>/{qr.title}</div>
                              <div style={{ fontSize: 11, color: 'var(--g-500)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{qr.content}</div>
                            </div>
                          ))}
                        </div>
                      ) : null;
                    })()}
                    <textarea
                      ref={textareaRef}
                      value={draft}
                      onChange={e => {
                        const val = e.target.value;
                        setDraft(val);
                        if (val.startsWith('/')) {
                          setQrFilter(val.slice(1).toLowerCase());
                          setShowQRPopup(true);
                        } else {
                          setShowQRPopup(false);
                          setQrFilter('');
                        }
                      }}
                      onKeyDown={e => {
                        if (e.key === 'Escape' && showQRPopup) { setShowQRPopup(false); setQrFilter(''); return; }
                        onKeyDown(e);
                      }}
                      className="copilot-textarea"
                      placeholder="Escreva uma mensagem… (Shift+Enter = nova linha)"
                      rows={2}
                    />
                    {showGhost && <div className="copilot-ghost">{suggestion}</div>}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px 10px' }}>
                      <div style={{ display: 'flex', gap: 2, position: 'relative' }}>
                        <button className="btn-icon" style={{ width: 30, height: 30 }} title="Anexar arquivo"
                          onClick={() => document.getElementById('chat-file-input').click()}>
                          <Icon name="paperclip" size={15} />
                        </button>
                        <input id="chat-file-input" type="file" style={{ display: 'none' }}
                          accept="image/*,video/*,.pdf,.doc,.docx"
                          onChange={async e => {
                            const file = e.target.files?.[0];
                            if (file) await sendFile(file);
                            e.target.value = '';
                          }} />
                        <button className="btn-icon" style={{ width: 30, height: 30, background: showEmoji ? 'var(--g-100)' : 'transparent' }}
                          title="Emoji" onClick={() => setShowEmoji(v => !v)}>
                          <Icon name="smile" size={15} />
                        </button>
                        {showEmoji && <EmojiPicker onSelect={insertEmoji} onClose={() => setShowEmoji(false)} />}
                        <button
                          className="btn-icon"
                          style={{ width: 30, height: 30 }}
                          title="Gravar áudio"
                          onClick={startRecording}
                        >
                          <Icon name="mic" size={15} />
                        </button>
                        <button className="btn-icon" style={{ width: 30, height: 30, color: 'var(--red)' }} title="Sugerir resposta com DELI">
                          <Icon name="sparkles" size={15} />
                        </button>
                        <button
                          className="btn-icon"
                          style={{ width: 30, height: 30, fontWeight: 700, fontSize: 14 }}
                          title="Mensagens rápidas (/atalho)"
                          onClick={() => setShowQRManager(true)}
                        >
                          /
                        </button>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        {currentUser && (active.type === 'whatsapp' || active.type === 'group') && (
                          <button
                            onClick={() => setUseSignature(v => !v)}
                            title={useSignature ? 'Assinar mensagens — clique para desativar' : 'Assinatura desativada — clique para ativar'}
                            style={{
                              fontSize: 11, padding: '3px 8px', borderRadius: 9999, cursor: 'pointer',
                              background: useSignature ? 'var(--red)' : 'var(--g-100)',
                              color:      useSignature ? 'white' : 'var(--g-500)',
                              border: `1px solid ${useSignature ? 'var(--red)' : 'var(--g-200)'}`,
                              fontWeight: 600, whiteSpace: 'nowrap',
                            }}
                          >
                            {useSignature ? '✍ ' : ''}{currentUser.name}
                          </button>
                        )}
                        <button
                          onClick={send}
                          className="btn-primary"
                          style={{ padding: '8px 14px', fontSize: 13, opacity: draft.trim() && !sending ? 1 : 0.5 }}
                          disabled={!draft.trim() || sending}
                        >
                          {sending ? 'Enviando…' : 'Enviar'} <Icon name="send" size={13} />
                        </button>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </div>

      {/* ── Col 3: Painel de info / mensagens fixadas ─────── */}
      {showInfo && !isChannel && (
        <div className="slide-right scroll" style={{
          background: 'var(--white)', borderLeft: '1px solid var(--g-200)', overflowY: 'auto',
          display: 'flex', flexDirection: 'column',
        }}>
          <div style={{
            padding: '12px 16px', borderBottom: '1px solid var(--g-200)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0,
          }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--g-900)' }}>
              {active.type === 'group' ? 'Informações do grupo' : 'Informações do contato'}
            </span>
            <button className="btn-icon" onClick={() => setShowInfo(false)}><Icon name="x" size={16} /></button>
          </div>
          <ContactPanel
            conv={active}
            onNavigate={onNavigate}
            members={members}
            tenantDbId={tenantDbId}
            onNameSaved={newName => {
              setConvs(prev => prev.map(c =>
                c.id === active.id
                  ? { ...c, name: newName, avatar: newName.slice(0, 2).toUpperCase() }
                  : c
              ));
            }}
          />
        </div>
      )}

      {showPinned && isChannel && (
        <div className="slide-right scroll" style={{
          background: 'var(--white)', borderLeft: '1px solid var(--g-200)', overflowY: 'auto',
          display: 'flex', flexDirection: 'column',
        }}>
          <div style={{
            padding: '12px 16px', borderBottom: '1px solid var(--g-200)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0,
          }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--g-900)' }}>
              📌 Mensagens fixadas ({pinnedMsgs.length})
            </span>
            <button className="btn-icon" onClick={() => setShowPinned(false)}><Icon name="x" size={16} /></button>
          </div>
          {pinnedMsgs.length === 0 ? (
            <div style={{ padding: 32, textAlign: 'center', color: 'var(--g-400)', fontSize: 13 }}>
              Nenhuma mensagem fixada
            </div>
          ) : (
            pinnedMsgs.map(msg => (
              <div key={msg.id} style={{
                padding: '12px 16px', borderBottom: '1px solid var(--g-100)',
                display: 'flex', flexDirection: 'column', gap: 4,
              }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--g-600)' }}>{msg.sender_name}</div>
                <div style={{ fontSize: 13, color: 'var(--g-900)', lineHeight: 1.4 }}>{msg.text}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                  <div style={{ fontSize: 10, color: 'var(--g-400)' }}>
                    {msg.created_at ? new Date(msg.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''}
                  </div>
                  <button
                    className="btn-icon"
                    style={{ width: 22, height: 22, fontSize: 10, marginLeft: 'auto', color: 'var(--g-500)' }}
                    title="Desafixar"
                    onClick={() => togglePin(active.chanId, msg.id, true)}
                  >
                    <Icon name="x" size={11} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* ── Modal: nova conversa interna ───────────────────── */}
      {showNewInternal && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(13,13,13,0.35)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setShowNewInternal(false)}
        >
          <NewInternalModal
            members={members}
            onSelect={createInternalConv}
            onClose={() => setShowNewInternal(false)}
          />
        </div>
      )}

      {/* ── Modal: criar tarefa a partir de mensagem ──────── */}
      {taskFromMsg && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setTaskFromMsg(null)}
        >
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(2px)' }} />
          <div
            onClick={e => e.stopPropagation()}
            style={{
              position: 'relative', zIndex: 1, background: 'var(--white)', borderRadius: 12,
              width: 420, boxShadow: '0 20px 60px rgba(0,0,0,0.25)', padding: 24,
            }}
          >
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4, color: 'var(--g-900)' }}>Criar tarefa</div>
            <div style={{ fontSize: 12, color: 'var(--g-500)', marginBottom: 18 }}>A partir de uma mensagem do canal</div>

            <label className="label" style={{ marginBottom: 6, display: 'block' }}>Título</label>
            <input
              className="input"
              value={taskFromMsgTitle}
              onChange={e => setTaskFromMsgTitle(e.target.value)}
              placeholder="Título da tarefa…"
              style={{ marginBottom: 14 }}
              autoFocus
            />

            <label className="label" style={{ marginBottom: 6, display: 'block' }}>Mensagem de origem</label>
            <div style={{
              padding: '10px 12px', background: 'var(--g-50)', borderRadius: 8,
              border: '1px solid var(--g-200)', fontSize: 12, color: 'var(--g-700)',
              marginBottom: 20, lineHeight: 1.5,
            }}>
              {taskFromMsg.text}
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn-secondary" onClick={() => setTaskFromMsg(null)}>Cancelar</button>
              <button
                className="btn-primary"
                onClick={createTaskFromMsg}
                disabled={savingTask || !taskFromMsgTitle.trim()}
              >
                {savingTask ? 'Salvando…' : '✅ Criar tarefa'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Templates (mensagens rápidas) ─────────── */}
      {showQRManager && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={e => { if (e.target === e.currentTarget) { setShowQRManager(false); setQrExpandedId(null); setQrCreating(false); setQrEditId(null); setQrEditTitle(''); setQrEditContent(''); } }}
        >
          <div
            style={{ background: 'var(--black-soft)', borderRadius: 14, width: 500, maxWidth: '95vw', maxHeight: '82vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 24px 60px rgba(0,0,0,0.5)' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{ padding: '18px 20px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
              <span style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>Templates</span>
              <button
                onClick={() => { setShowQRManager(false); setQrExpandedId(null); setQrCreating(false); setQrEditId(null); setQrEditTitle(''); setQrEditContent(''); }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.5)', fontSize: 20, lineHeight: 1, padding: 4 }}
              >✕</button>
            </div>

            {/* Tab label */}
            <div style={{ padding: '12px 20px 0', borderBottom: '1px solid rgba(255,255,255,0.1)', flexShrink: 0 }}>
              <div style={{ display: 'inline-block', padding: '8px 4px', fontSize: 13, fontWeight: 600, color: 'var(--red)', borderBottom: '2px solid var(--red)' }}>
                Mensagens rápidas
              </div>
            </div>

            {/* Content */}
            <div style={{ overflowY: 'auto', flex: 1 }}>
              <>
                {/* Form: new / edit */}
                {(qrCreating || qrEditId) && (
                  <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.2)' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.4)', marginBottom: 10, letterSpacing: '0.05em' }}>
                      {qrEditId ? 'EDITAR MENSAGEM' : 'NOVA MENSAGEM RÁPIDA'}
                    </div>
                    <input
                      style={{ display: 'block', width: '100%', boxSizing: 'border-box', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, color: '#fff', fontSize: 13, padding: '8px 12px', marginBottom: 8, outline: 'none' }}
                      placeholder="Atalho (ex: saudacao)"
                      value={qrEditTitle}
                      onChange={e => setQrEditTitle(e.target.value.replace(/\s/g, ''))}
                    />
                    <textarea
                      style={{ display: 'block', width: '100%', boxSizing: 'border-box', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, color: '#fff', fontSize: 13, padding: '8px 12px', resize: 'vertical', minHeight: 72, outline: 'none' }}
                      placeholder="Texto completo da mensagem…"
                      value={qrEditContent}
                      onChange={e => setQrEditContent(e.target.value)}
                    />
                    <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                      <button
                        onClick={saveQuickReply}
                        disabled={!qrEditTitle.trim() || !qrEditContent.trim()}
                        style={{ background: 'var(--red)', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: (!qrEditTitle.trim() || !qrEditContent.trim()) ? 0.4 : 1 }}
                      >
                        {qrEditId ? 'Atualizar' : 'Salvar'}
                      </button>
                      <button
                        onClick={() => { setQrCreating(false); setQrEditId(null); setQrEditTitle(''); setQrEditContent(''); }}
                        style={{ background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}

                {/* Cards list */}
                {quickReplies.length === 0 && !qrCreating ? (
                  <div style={{ padding: '40px 24px', textAlign: 'center', fontSize: 13 }}>
                    <div style={{ fontSize: 32, marginBottom: 12 }}>💬</div>
                    <div style={{ fontWeight: 600, color: 'rgba(255,255,255,0.5)', marginBottom: 6 }}>Nenhuma mensagem rápida</div>
                    <div style={{ color: 'rgba(255,255,255,0.3)' }}>Crie uma e use <strong style={{ color: 'var(--red)' }}>/atalho</strong> no chat.</div>
                  </div>
                ) : quickReplies.map(qr => {
                  const isExpanded = qrExpandedId === qr.id;
                  const isEditing  = qrEditId === qr.id;
                  return (
                    <div key={qr.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                      {/* Card header row */}
                      <div
                        style={{ display: 'flex', alignItems: 'center', padding: '14px 20px', cursor: 'pointer', gap: 12 }}
                        onClick={() => { setQrExpandedId(isExpanded ? null : qr.id); setQrEditId(null); setQrEditTitle(''); setQrEditContent(''); setQrCreating(false); }}
                      >
                        <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(183,12,0,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>💬</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', marginBottom: 3 }}>/{qr.title}</div>
                          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', lineHeight: 1.4 }}>
                            {qr.content}
                          </div>
                        </div>
                        <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12, flexShrink: 0, transition: 'transform 0.2s', transform: isExpanded ? 'rotate(180deg)' : 'none' }}>▼</div>
                      </div>

                      {/* Expanded: full text + actions */}
                      {isExpanded && (
                        <div style={{ padding: '0 20px 16px 68px' }}>
                          {isEditing ? (
                            <div>
                              <input
                                style={{ display: 'block', width: '100%', boxSizing: 'border-box', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, color: '#fff', fontSize: 13, padding: '8px 12px', marginBottom: 8, outline: 'none' }}
                                value={qrEditTitle}
                                onChange={e => setQrEditTitle(e.target.value.replace(/\s/g, ''))}
                              />
                              <textarea
                                style={{ display: 'block', width: '100%', boxSizing: 'border-box', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, color: '#fff', fontSize: 13, padding: '8px 12px', resize: 'vertical', minHeight: 72, outline: 'none' }}
                                value={qrEditContent}
                                onChange={e => setQrEditContent(e.target.value)}
                              />
                              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                                <button
                                  onClick={saveQuickReply}
                                  disabled={!qrEditTitle.trim() || !qrEditContent.trim()}
                                  style={{ background: 'var(--red)', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', opacity: (!qrEditTitle.trim() || !qrEditContent.trim()) ? 0.4 : 1 }}
                                >Atualizar</button>
                                <button
                                  onClick={() => { setQrEditId(null); setQrEditTitle(''); setQrEditContent(''); }}
                                  style={{ background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)', border: 'none', borderRadius: 8, padding: '7px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                                >Cancelar</button>
                              </div>
                            </div>
                          ) : (
                            <div>
                              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', marginBottom: 12, lineHeight: 1.5 }}>{qr.content}</div>
                              <div style={{ display: 'flex', gap: 8 }}>
                                <button
                                  onClick={() => { setQrEditId(qr.id); setQrEditTitle(qr.title); setQrEditContent(qr.content); setQrCreating(false); }}
                                  style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.7)', border: 'none', borderRadius: 8, padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}
                                >✏️ Editar</button>
                                <button
                                  onClick={() => deleteQuickReply(qr.id)}
                                  style={{ background: 'var(--red-soft)', color: 'var(--red)', border: 'none', borderRadius: 8, padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}
                                >🗑 Apagar</button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Footer: new message button */}
                {!qrCreating && !qrEditId && (
                  <div style={{ padding: '14px 20px' }}>
                    <button
                      onClick={() => { setQrCreating(true); setQrEditId(null); setQrEditTitle(''); setQrEditContent(''); setQrExpandedId(null); }}
                      style={{ background: 'var(--red)', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
                    >+ Nova mensagem rápida</button>
                  </div>
                )}
              </>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── AudioMessage ───────────────────────────────────────── */
function AudioMessage({ url, isOut }) {
  const [playing, setPlaying]   = useState(false);
  const [current, setCurrent]   = useState(0);
  const [duration, setDuration] = useState(0);
  const [srcUrl, setSrcUrl]     = useState(null);
  const audioRef = useRef(null);

  // Convert data URIs to blob URLs — <audio> handles blobs more reliably for large files
  useEffect(() => {
    if (!url) { setSrcUrl(null); return; }
    if (!url.startsWith('data:')) { setSrcUrl(url); return; }
    let blobUrl;
    fetch(url)
      .then(r => r.blob())
      .then(blob => { blobUrl = URL.createObjectURL(blob); setSrcUrl(blobUrl); })
      .catch(() => setSrcUrl(url)); // fallback: use data URI directly
    return () => { if (blobUrl) URL.revokeObjectURL(blobUrl); };
  }, [url]);

  function fmt(s) {
    if (!s || !isFinite(s)) return '0:00';
    const m = Math.floor(s / 60);
    return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  }

  function toggle() {
    const a = audioRef.current;
    if (!a) return;
    if (playing) { a.pause(); setPlaying(false); }
    else { a.play().then(() => setPlaying(true)).catch(() => {}); }
  }

  function seek(e) {
    const a = audioRef.current;
    if (!a || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    a.currentTime = ((e.clientX - rect.left) / rect.width) * duration;
  }

  const pct = duration > 0 ? (current / duration) * 100 : 0;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 200, maxWidth: 260 }}>
      <audio
        ref={audioRef}
        src={srcUrl}
        preload="metadata"
        onTimeUpdate={() => setCurrent(audioRef.current?.currentTime || 0)}
        onLoadedMetadata={() => setDuration(audioRef.current?.duration || 0)}
        onEnded={() => { setPlaying(false); setCurrent(0); }}
      />
      <button
        onClick={toggle}
        style={{
          width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
          background: isOut ? 'rgba(255,255,255,0.22)' : 'var(--g-200)',
          border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: isOut ? 'white' : 'var(--g-700)', fontSize: 13,
        }}
      >
        {playing ? '⏸' : '▶'}
      </button>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 5 }}>
        <div
          onClick={seek}
          style={{
            height: 4, borderRadius: 2, cursor: 'pointer', overflow: 'hidden',
            background: isOut ? 'rgba(255,255,255,0.3)' : 'var(--g-300)',
          }}
        >
          <div style={{
            height: '100%', width: `${pct}%`, borderRadius: 2,
            background: isOut ? 'white' : 'var(--red)',
            transition: 'width 100ms linear',
          }} />
        </div>
        <span style={{ fontSize: 10, color: isOut ? 'rgba(255,255,255,0.7)' : 'var(--g-500)' }}>
          {playing ? fmt(current) : fmt(duration)}
        </span>
      </div>
    </div>
  );
}

/* ── SidebarSection ─────────────────────────────────────── */
function SidebarSection({ label, action }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '12px 16px 4px',
    }}>
      <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--g-500)', letterSpacing: 0.8, textTransform: 'uppercase' }}>
        {label}
      </span>
      {action}
    </div>
  );
}

/* ── ChannelMessage ─────────────────────────────────────── */
function ChannelMessage({ msg, onPin, onCreateTask }) {
  const [hovered, setHovered] = useState(false);
  const isOwn = msg.sender_name === 'Você';
  const time  = msg.created_at
    ? new Date(msg.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : '';

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ display: 'flex', flexDirection: 'column', alignItems: isOwn ? 'flex-end' : 'flex-start' }}
      className="slide-up"
    >
      {!isOwn && (
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--g-700)', marginBottom: 2, paddingLeft: 4 }}>
          {msg.sender_name}
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexDirection: isOwn ? 'row-reverse' : 'row' }}>
        <div className={`bubble ${isOwn ? 'bubble-out' : 'bubble-in'}`}>
          {msg.is_pinned && <span style={{ marginRight: 4, fontSize: 10 }}>📌</span>}
          {msg.text}
        </div>
        {hovered && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <button
              className="btn-icon"
              onClick={onPin}
              title={msg.is_pinned ? 'Desafixar mensagem' : 'Fixar mensagem'}
              style={{
                width: 26, height: 26, fontSize: 13,
                background: msg.is_pinned ? 'rgba(37,99,235,0.1)' : 'transparent',
              }}
            >
              📌
            </button>
            <button
              className="btn-icon"
              onClick={onCreateTask}
              title="Criar tarefa a partir desta mensagem"
              style={{ width: 26, height: 26, fontSize: 13 }}
            >
              ✅
            </button>
          </div>
        )}
      </div>
      <div className="bubble-meta" style={{ color: 'var(--g-500)' }}>{time}</div>
    </div>
  );
}

/* ── ConvAvatar ─────────────────────────────────────────── */
function ConvAvatar({ conv, size = 36 }) {
  const [imgErr, setImgErr] = useState(false);

  if (conv.type === 'agent') return <AgentAvatar id={conv.name.toLowerCase()} size={size} />;

  const isGroup   = conv.type === 'group';
  const isChannel = conv.type === 'internal' && conv.id?.startsWith('chan-');
  const hasPhoto  = !!conv.photoUrl && !imgErr;

  const bg = hasPhoto       ? 'transparent'
    : isChannel             ? (conv.color || '#2563EB')
    : conv.type === 'internal' ? '#374151'
    : isGroup               ? '#0559A8'
    : '#1e293b'; // fundo fixo escuro para contatos WA — não depende de variável de tema

  return (
    <div style={{
      width: size, height: size, borderRadius: isChannel ? 10 : '50%',
      background: bg,
      color: conv.type === 'internal' && !isChannel ? '#d1d5db' : 'white',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      fontWeight: 700, fontSize: size * 0.36, flexShrink: 0, position: 'relative',
      overflow: 'hidden',
    }}>
      {hasPhoto ? (
        <img
          src={conv.photoUrl}
          alt={conv.name}
          style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: isChannel ? 10 : '50%' }}
          onError={() => setImgErr(true)}
        />
      ) : isChannel
        ? <span style={{ fontSize: size * 0.48, fontWeight: 800, lineHeight: 1 }}>#</span>
        : isGroup
        ? <Icon name="users" size={size * 0.42} />
        : conv.avatar}
      {(conv.type === 'whatsapp' || conv.type === 'group') && (
        <span style={{
          position: 'absolute', bottom: -1, right: -1,
          width: size * 0.38, height: size * 0.38, borderRadius: '50%',
          background: '#25D366', border: '2px solid white',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <svg width={size * 0.22} height={size * 0.22} viewBox="0 0 24 24" fill="white">
            <path d="M12 2a10 10 0 0 0-8.5 15.2L2 22l4.9-1.5A10 10 0 1 0 12 2Z" />
          </svg>
        </span>
      )}
    </div>
  );
}

/* ── ConvItem ───────────────────────────────────────────── */
function ConvItem({ conv, active, onClick, lastMsg }) {
  const isChannel = conv.type === 'internal' && conv.id?.startsWith('chan-');

  // Preview: usa a última mensagem real se disponível
  const previewText = lastMsg?.text || conv.preview || '';
  const truncated   = previewText.length > 38 ? previewText.slice(0, 38) + '…' : previewText;
  // 'in' = cliente → vermelho | 'out' = equipe → cinza
  const resolvedFrom = lastMsg?.from || conv.previewFrom || 'out';
  const previewColor = previewText
    ? (resolvedFrom === 'in' ? 'var(--red)' : 'var(--g-500)')
    : 'var(--g-500)';
  const previewWeight = resolvedFrom === 'in' && !active ? 600 : 400;

  return (
    <div
      onClick={onClick}
      style={{
        padding: isChannel ? '8px 16px' : '12px 16px',
        cursor: 'pointer', display: 'flex', gap: 10, alignItems: 'center',
        background: active ? 'var(--red-soft)' : 'transparent',
        borderLeft: active ? '3px solid var(--red)' : '3px solid transparent',
        transition: 'all 150ms',
      }}
      onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--g-200)'; }}
      onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent'; }}
    >
      {isChannel ? (
        /* Canal: avatar # colorido menor + nome inline */
        <>
          <ConvAvatar conv={conv} size={28} />
          <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: active ? 700 : 500, color: 'var(--g-900)' }} className="truncate">
              {conv.name}
            </span>
            {conv.isGlobal && (
              <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 9999, background: 'rgba(37,99,235,0.1)', color: '#2563EB', flexShrink: 0 }}>
                Global
              </span>
            )}
          </div>
          {conv.unread > 0 && (
            <span style={{ background: 'var(--red)', color: 'white', fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 9999, minWidth: 18, textAlign: 'center' }}>
              {conv.unread}
            </span>
          )}
        </>
      ) : (
        /* DM / WA / Grupo: layout padrão com preview */
        <>
          <ConvAvatar conv={conv} size={40} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <div style={{ fontSize: 13, fontWeight: active ? 700 : 600, color: 'var(--g-900)' }} className="truncate">
                {conv.name}
              </div>
              <div style={{ fontSize: 10, color: 'var(--g-500)', flexShrink: 0 }}>{conv.time}</div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0, flex: 1 }}>
                {conv.type === 'group' && conv.groupType && (
                  <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 9999, background: '#25D36622', color: '#166534', flexShrink: 0, textTransform: 'uppercase' }}>
                    {conv.groupType}
                  </span>
                )}
                {resolvedFrom === 'in' && previewText && (
                  <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--red)', flexShrink: 0 }}>●</span>
                )}
                <div style={{ fontSize: 12, color: previewColor, fontWeight: previewWeight }} className="truncate">
                  {truncated}
                </div>
              </div>
              {conv.unread > 0 && (
                <span style={{ background: 'var(--red)', color: 'white', fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 9999, minWidth: 18, textAlign: 'center', flexShrink: 0, marginLeft: 6 }}>
                  {conv.unread}
                </span>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ── ContactPanel ───────────────────────────────────────── */
const PIPELINES = ['Prospecção', 'Negociação', 'Fechamento', 'Pós-venda', 'Reativação'];

function ContactPanel({ conv, onNavigate, members = [], tenantDbId, onNameSaved }) {
  const isGroup = conv.type === 'group';

  // Edição de nome/telefone
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName]   = useState(conv.name);
  const phone = conv.whatsapp_chat_id ? `+${conv.whatsapp_chat_id.split('@')[0]}` : conv.phone || '';
  const [editPhone, setEditPhone] = useState(phone);
  const [editNote, setEditNote]   = useState(
    conv.type === 'whatsapp' ? 'Cliente sensível a atrasos — oferecer sempre alguma cortesia.' : ''
  );

  // Tags locais
  const [tags, setTags]           = useState(conv.tags || []);
  const [tagInput, setTagInput]   = useState('');
  const [showTagInput, setShowTagInput] = useState(false);

  // Pipeline
  const [showPipeline, setShowPipeline] = useState(false);
  const [pipeline, setPipeline]         = useState('');
  const [pipelineOk, setPipelineOk]     = useState(false);

  // Transferência
  const [showTransfer, setShowTransfer] = useState(false);
  const [transferTo, setTransferTo]     = useState('');
  const [transferOk, setTransferOk]     = useState(false);

  // Criar tarefa
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [taskTitle, setTaskTitle]       = useState('');
  const [taskDue, setTaskDue]           = useState('');
  const [taskAssignee, setTaskAssignee] = useState('');
  const [taskSaving, setTaskSaving]     = useState(false);
  const [taskOk, setTaskOk]             = useState(false);

  // Finalizar atendimento
  const [showFinishConfirm, setShowFinishConfirm] = useState(false);
  const [finished, setFinished]                   = useState(false);

  function addTag(e) {
    e.preventDefault();
    const t = tagInput.trim();
    if (t && !tags.includes(t)) setTags(prev => [...prev, t]);
    setTagInput('');
    setShowTagInput(false);
  }

  function removeTag(t) { setTags(prev => prev.filter(x => x !== t)); }

  function confirmPipeline() {
    if (!pipeline) return;
    setPipelineOk(true);
    setShowPipeline(false);
    setTimeout(() => setPipelineOk(false), 3000);
  }

  function confirmTransfer() {
    if (!transferTo) return;
    setTransferOk(true);
    setShowTransfer(false);
    setTimeout(() => setTransferOk(false), 3000);
  }

  async function saveTask() {
    if (!taskTitle.trim()) return;
    setTaskSaving(true);
    try {
      await supabase.from('tasks').insert({
        title: taskTitle.trim(),
        tenant_id: tenantDbId,
        col: 'todo',
        due_at: taskDue || null,
        assignee_id: taskAssignee || null,
      });
      setTaskOk(true);
      setShowTaskForm(false);
      setTaskTitle(''); setTaskDue(''); setTaskAssignee('');
      setTimeout(() => setTaskOk(false), 3000);
    } catch { /* ignore */ }
    setTaskSaving(false);
  }

  function finishAtendimento() {
    setFinished(true);
    setShowFinishConfirm(false);
  }

  if (finished) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>✅</div>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--g-900)', marginBottom: 6 }}>Atendimento finalizado</div>
        <div style={{ fontSize: 12, color: 'var(--g-500)' }}>Conversa arquivada e marcada como resolvida.</div>
      </div>
    );
  }

  return (
    <div style={{ padding: 24 }}>
      {/* Avatar e info */}
      <div style={{ textAlign: 'center', paddingBottom: 20, borderBottom: '1px solid var(--g-200)' }}>
        <div style={{ display: 'inline-block' }}><ConvAvatar conv={conv} size={80} /></div>
        {isEditing ? (
          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <input className="input" style={{ fontSize: 13, textAlign: 'center' }} value={editName} onChange={e => setEditName(e.target.value)} placeholder="Nome" />
            <input className="input" style={{ fontSize: 13, textAlign: 'center' }} value={editPhone} onChange={e => setEditPhone(e.target.value)} placeholder="Telefone" />
            <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginTop: 4 }}>
              <button
                className="btn-primary"
                style={{ padding: '6px 12px', fontSize: 12 }}
                onClick={async () => {
                  setIsEditing(false);
                  try {
                    await supabase.from('conversations')
                      .update({ push_name: editName, contact_name: editName })
                      .eq('id', conv.id);
                    if (onNameSaved) onNameSaved(editName);
                  } catch { /* ignore */ }
                }}
              >Salvar</button>
              <button className="btn-secondary" style={{ padding: '6px 12px', fontSize: 12 }} onClick={() => { setIsEditing(false); setEditName(conv.name); }}>Cancelar</button>
            </div>
          </div>
        ) : (
          <>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--g-900)', marginTop: 12 }}>{editName}</div>
            <div style={{ fontSize: 12, color: 'var(--g-500)', marginTop: 4 }}>
              {isGroup ? 'Grupo WhatsApp' : editPhone || conv.role || conv.type}
            </div>
            {/* Tags do contato */}
            {tags.length > 0 && (
              <div style={{ display: 'flex', gap: 5, justifyContent: 'center', flexWrap: 'wrap', marginTop: 10 }}>
                {tags.map(t => (
                  <span key={t} style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}
                    className={`badge ${t === 'VIP' ? 'badge-red' : 'badge-gray'}`}>
                    {t}
                    <button onClick={() => removeTag(t)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 1, opacity: 0.6, fontSize: 10 }}>×</button>
                  </span>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 16, flexWrap: 'wrap' }}>
              {!isGroup && <button className="btn-secondary" style={{ padding: '6px 12px', fontSize: 12 }}><Icon name="phone" size={12} /> Ligar</button>}
              {!isGroup && onNavigate && (
                <button className="btn-primary" style={{ padding: '6px 12px', fontSize: 12 }} onClick={() => onNavigate('crm')}>Ver no CRM</button>
              )}
              <button className="btn-secondary" style={{ padding: '6px 12px', fontSize: 12 }} onClick={() => setIsEditing(true)}><Icon name="edit" size={12} /> Editar</button>
            </div>
          </>
        )}
      </div>

      {/* Últimos pedidos */}
      {conv.orders && (
        <div style={{ marginTop: 20 }}>
          <div className="label" style={{ marginBottom: 10 }}>Últimos pedidos</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {conv.orders.map((o, i) => (
              <div key={i} style={{ padding: 10, background: 'var(--g-50)', borderRadius: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--g-900)' }}>{o.date}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--red)' }}>{o.total}</span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--g-500)', marginTop: 2 }}>{o.items}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Notas internas */}
      <div style={{ marginTop: 20 }}>
        <div className="label" style={{ marginBottom: 10 }}>Notas internas</div>
        <textarea
          className="input" placeholder="Adicione uma nota…"
          style={{ minHeight: 80, resize: 'vertical', fontSize: 12 }}
          value={editNote} onChange={e => setEditNote(e.target.value)}
        />
      </div>

      {/* Análise DELI */}
      {(conv.type === 'whatsapp' || conv.type === 'group') && (
        <div style={{
          marginTop: 20, padding: 14,
          background: 'linear-gradient(135deg, rgba(183,12,0,0.05), rgba(183,12,0,0.01))',
          border: '1px solid rgba(183,12,0,0.15)', borderRadius: 8,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <Icon name="sparkles" size={14} style={{ color: 'var(--red)' }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--red)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Análise DELI</span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--g-700)', lineHeight: 1.5 }}>
            {isGroup
              ? <>Grupo ativo com membros recorrentes. Nível de engajamento: <strong style={{ color: 'var(--success)' }}>bom</strong>.</>
              : <>Cliente <strong>frustrado</strong> por atraso repetido. Sentimento: <strong style={{ color: 'var(--warn)' }}>negativo</strong>.{' '}
                Risco de churn: <strong style={{ color: 'var(--red)' }}>alto</strong>. Recomendo reembolso parcial + cortesia dupla.</>}
          </div>
        </div>
      )}

      {/* ── AÇÕES RÁPIDAS ───────────────────────────────── */}
      <div style={{ marginTop: 24, paddingTop: 20, borderTop: '1px solid var(--g-200)' }}>
        <div className="label" style={{ marginBottom: 14 }}>Ações rápidas</div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>

          {/* 1 · Pipeline */}
          {pipelineOk ? (
            <div style={{ fontSize: 12, color: 'var(--success)', fontWeight: 600, padding: '6px 0' }}>✅ Adicionado ao pipeline "{pipeline}"</div>
          ) : showPipeline ? (
            <div style={{ display: 'flex', gap: 6 }}>
              <select className="input" style={{ flex: 1, fontSize: 12, padding: '6px 8px' }}
                value={pipeline} onChange={e => setPipeline(e.target.value)}>
                <option value="">Selecionar pipeline…</option>
                {PIPELINES.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
              <button className="btn-primary" style={{ padding: '6px 10px', fontSize: 12 }} onClick={confirmPipeline}>OK</button>
              <button className="btn-icon" onClick={() => setShowPipeline(false)}><Icon name="x" size={13} /></button>
            </div>
          ) : (
            <button className="btn-secondary" style={{ justifyContent: 'flex-start', fontSize: 12, gap: 8 }}
              onClick={() => setShowPipeline(true)}>
              <Icon name="chart" size={14} /> Adicionar ao Pipeline
            </button>
          )}

          {/* 2 · Tag */}
          <div>
            {showTagInput ? (
              <form onSubmit={addTag} style={{ display: 'flex', gap: 6 }}>
                <input
                  className="input" style={{ flex: 1, fontSize: 12, padding: '6px 8px' }}
                  placeholder="Nome da tag…" value={tagInput} onChange={e => setTagInput(e.target.value)}
                  autoFocus list="tag-suggestions"
                />
                <datalist id="tag-suggestions">
                  {['VIP', 'Recorrente', 'Inadimplente', 'Novo', 'Parceiro'].map(s => <option key={s} value={s} />)}
                </datalist>
                <button type="submit" className="btn-primary" style={{ padding: '6px 10px', fontSize: 12 }}>OK</button>
                <button type="button" className="btn-icon" onClick={() => setShowTagInput(false)}><Icon name="x" size={13} /></button>
              </form>
            ) : (
              <button className="btn-secondary" style={{ justifyContent: 'flex-start', fontSize: 12, gap: 8, width: '100%' }}
                onClick={() => setShowTagInput(true)}>
                <Icon name="plus" size={14} /> Adicionar Tag
              </button>
            )}
          </div>

          {/* 3 · Transferir */}
          {transferOk ? (
            <div style={{ fontSize: 12, color: 'var(--success)', fontWeight: 600, padding: '6px 0' }}>✅ Conversa transferida com sucesso</div>
          ) : showTransfer ? (
            <div style={{ display: 'flex', gap: 6 }}>
              <select className="input" style={{ flex: 1, fontSize: 12, padding: '6px 8px' }}
                value={transferTo} onChange={e => setTransferTo(e.target.value)}>
                <option value="">Selecionar agente…</option>
                {members.map(m => <option key={m.id} value={m.id}>{m.full_name || m.email}</option>)}
              </select>
              <button className="btn-primary" style={{ padding: '6px 10px', fontSize: 12 }} onClick={confirmTransfer}>OK</button>
              <button className="btn-icon" onClick={() => setShowTransfer(false)}><Icon name="x" size={13} /></button>
            </div>
          ) : (
            <button className="btn-secondary" style={{ justifyContent: 'flex-start', fontSize: 12, gap: 8 }}
              onClick={() => setShowTransfer(true)}>
              <Icon name="users" size={14} /> Transferir conversa
            </button>
          )}

          {/* 4 · Criar Tarefa */}
          {taskOk ? (
            <div style={{ fontSize: 12, color: 'var(--success)', fontWeight: 600, padding: '6px 0' }}>✅ Tarefa criada com sucesso</div>
          ) : showTaskForm ? (
            <div style={{ background: 'var(--g-50)', border: '1px solid var(--g-200)', borderRadius: 8, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <input className="input" style={{ fontSize: 12, padding: '6px 8px' }} placeholder="Título da tarefa *" value={taskTitle} onChange={e => setTaskTitle(e.target.value)} autoFocus />
              <input className="input" style={{ fontSize: 12, padding: '6px 8px' }} type="date" value={taskDue} onChange={e => setTaskDue(e.target.value)} />
              <select className="input" style={{ fontSize: 12, padding: '6px 8px' }} value={taskAssignee} onChange={e => setTaskAssignee(e.target.value)}>
                <option value="">Responsável (opcional)</option>
                {members.map(m => <option key={m.id} value={m.id}>{m.full_name || m.email}</option>)}
              </select>
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="btn-primary" style={{ flex: 1, fontSize: 12, padding: '6px 0', justifyContent: 'center' }}
                  onClick={saveTask} disabled={taskSaving || !taskTitle.trim()}>
                  {taskSaving ? 'Salvando…' : 'Criar tarefa'}
                </button>
                <button className="btn-icon" onClick={() => setShowTaskForm(false)}><Icon name="x" size={13} /></button>
              </div>
            </div>
          ) : (
            <button className="btn-secondary" style={{ justifyContent: 'flex-start', fontSize: 12, gap: 8 }}
              onClick={() => setShowTaskForm(true)}>
              <Icon name="check" size={14} /> Criar Tarefa
            </button>
          )}

          {/* 5 · Finalizar atendimento */}
          {showFinishConfirm ? (
            <div style={{ background: 'rgba(183,12,0,0.05)', border: '1px solid rgba(183,12,0,0.2)', borderRadius: 8, padding: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--g-900)', marginBottom: 10 }}>
                Deseja finalizar este atendimento?
              </div>
              <div style={{ fontSize: 11, color: 'var(--g-500)', marginBottom: 12 }}>
                A conversa será marcada como resolvida e arquivada.
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="btn-primary" style={{ flex: 1, fontSize: 12, padding: '6px 0', justifyContent: 'center', background: 'var(--red)' }}
                  onClick={finishAtendimento}>
                  Confirmar
                </button>
                <button className="btn-secondary" style={{ fontSize: 12, padding: '6px 12px' }}
                  onClick={() => setShowFinishConfirm(false)}>
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowFinishConfirm(true)}
              style={{
                width: '100%', padding: '9px 14px', fontSize: 12, fontWeight: 700,
                background: 'var(--red)', color: 'white', border: 'none', borderRadius: 'var(--r-sm)',
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                transition: 'opacity 150ms',
              }}
              onMouseEnter={e => e.currentTarget.style.opacity = '0.88'}
              onMouseLeave={e => e.currentTarget.style.opacity = '1'}
            >
              <Icon name="x" size={14} /> Finalizar atendimento
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── EmojiPicker ────────────────────────────────────────── */
const EMOJIS = [
  '😀','😂','😊','😍','🤔','😅','😎','😢','😡','🥳',
  '👍','👎','👋','🙌','🤝','❤️','🔥','✅','⭐','🎉',
  '🍕','🚀','💪','🎯','💬','🌟','⚡','💡','🎊','🏆',
  '😆','🤣','😇','🤩','😏','😬','🙄','😴','🤗','😤',
  '👀','💯','🙏','✨','🎶','📱','💰','🏅','🎁','🌹',
];

function EmojiPicker({ onSelect, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    function handleClick(e) { if (ref.current && !ref.current.contains(e.target)) onClose(); }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onClose]);

  return (
    <div ref={ref} style={{
      position: 'absolute', bottom: 'calc(100% + 4px)', left: 0,
      background: 'var(--white)', border: '1px solid var(--g-200)', borderRadius: 10, padding: 10, zIndex: 50,
      display: 'grid', gridTemplateColumns: 'repeat(10, 30px)', gap: 2,
      boxShadow: '0 8px 24px rgba(0,0,0,0.14)',
    }}>
      {EMOJIS.map(e => (
        <button key={e} onClick={() => { onSelect(e); onClose(); }} style={{
          fontSize: 18, background: 'transparent', borderRadius: 4,
          width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', transition: 'background 100ms',
        }}
        onMouseEnter={ev => ev.currentTarget.style.background = 'var(--g-100)'}
        onMouseLeave={ev => ev.currentTarget.style.background = 'transparent'}
        >{e}</button>
      ))}
    </div>
  );
}

/* ── NewInternalModal ───────────────────────────────────── */
function NewInternalModal({ members, onSelect, onClose }) {
  const [search, setSearch] = useState('');
  const filtered = members.filter(m =>
    !search || (m.full_name || m.email || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div onClick={e => e.stopPropagation()} style={{
      background: 'var(--white)', borderRadius: 12, width: 340,
      boxShadow: '0 16px 40px rgba(0,0,0,0.18)', display: 'flex', flexDirection: 'column', maxHeight: 440,
    }}>
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--g-200)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--g-900)' }}>Nova mensagem direta</span>
        <button className="btn-icon" onClick={onClose}><Icon name="x" size={15} /></button>
      </div>
      <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--g-100)' }}>
        <div style={{ position: 'relative' }}>
          <Icon name="search" size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--g-400)', pointerEvents: 'none' }} />
          <input className="input" style={{ paddingLeft: 32, fontSize: 13 }} placeholder="Buscar membro..." value={search} onChange={e => setSearch(e.target.value)} autoFocus />
        </div>
      </div>
      <div className="scroll" style={{ flex: 1, overflowY: 'auto' }}>
        {filtered.length === 0 && (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--g-400)', fontSize: 13 }}>
            {members.length === 0 ? 'Nenhum membro encontrado no banco.' : 'Nenhum resultado.'}
          </div>
        )}
        {filtered.map(m => {
          const initials = (m.full_name || 'TM').split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
          return (
            <div key={m.id} onClick={() => onSelect(m)} style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '10px 20px',
              cursor: 'pointer', transition: 'background 150ms',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--g-50)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--g-200)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13, color: 'var(--g-700)', flexShrink: 0 }}>
                {initials}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--g-900)' }}>{m.full_name || 'Sem nome'}</div>
                <div style={{ fontSize: 11, color: 'var(--g-500)' }}>{m.email}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
