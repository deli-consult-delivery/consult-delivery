import { useState, useEffect, useRef } from 'react';
import { isMuted } from './lib/mutedConvs.js';
// Console clássico aposentado (D1): só LoginScreen/ResetPasswordScreen e o Console v2 sobrevivem.
import { useTweaks } from './components/TweaksPanel.jsx';
import LoginScreen from './screens/LoginScreen.jsx';
import ResetPasswordScreen from './screens/ResetPasswordScreen.jsx';
import ConsoleV2 from './console/ConsoleV2.jsx';
import { TENANTS } from './data.js';
import { supabase } from './lib/supabase.js';
import { listTenants, countUnreadNotifications, subscribeToNotifications } from './lib/api.js';
import { registerPushSubscription } from './lib/pushNotifications.js';

const TWEAK_DEFAULTS = {
  primaryColor: '#B70C00',
  density: 'medium',
  showAgentsBanner: true,
  liveSim: true,
};

// Carregamento de tenant resiliente a banco saturado (503/timeout do PostgREST).
// Tenta até 3× com backoff exponencial (1s, 2s, 4s) antes de desistir; só então
// mostra "reconectando". Distingue erro/timeout de "usuário realmente sem tenant".
const MAX_TENANT_RETRIES = 3;
// Se nada resolver nesse tempo, para o spinner e cai no estado de erro/reconectando.
const TENANT_SAFETY_TIMEOUT_MS = 15000;

export default function App() {
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [passwordRecovery, setPasswordRecovery] = useState(false);
  const [isInvite, setIsInvite] = useState(false);
  const [tenantLoading, setTenantLoading] = useState(false);
  const [tenantLoadAttempted, setTenantLoadAttempted] = useState(false);
  const [tenantLoadError, setTenantLoadError] = useState(false);
  const [tenants, setTenants] = useState(TENANTS);
  const [_deepLinkConvId] = useState(() => new URLSearchParams(window.location.search).get('chat'));
  const [_confirmedAcao]  = useState(() => new URLSearchParams(window.location.search).get('breno_confirmado'));
  // Console clássico aposentado (D1): rota só serve a deep-links/notif internos; v2 é o único shell.
  const [route, setRoute] = useState(() => _deepLinkConvId ? 'chat' : 'console-v2');
  const [confirmToast, setConfirmToast] = useState(_confirmedAcao);
  const [tenant, setTenant] = useState(null);
  const [tenantDbId, setTenantDbId] = useState(null);
  const [tweaks, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [theme, setTheme] = useState(() => localStorage.getItem('cd-theme') || 'claro');
  const [notifUnread, setNotifUnread] = useState(0);
  const hasLoadedTenantsOnce = useRef(false);
  // Geração monotônica: invalida invocações obsoletas de reloadTenants (após troca
  // de sessão ou unmount) para que um safetyTimer ou await antigo não chame setState
  // por cima de um load novo que está dando certo.
  const reloadGenRef = useRef(0);

  // Carrega tenants do banco (usado no mount e quando um workspace novo é criado).
  // Resiliente a banco saturado: tenta até MAX_TENANT_RETRIES com backoff antes de
  // desistir. Distingue erro/timeout (→ "reconectando" + retry) de zero-tenant real.
  async function reloadTenants(preferSlug) {
    // Marca esta invocação como a corrente; qualquer reload anterior fica obsoleto e
    // seus callbacks atrasados (safetyTimer, retornos de await) viram no-op.
    const myGen = ++reloadGenRef.current;
    const isCurrent = () => reloadGenRef.current === myGen;

    if (!hasLoadedTenantsOnce.current) setTenantLoading(true);
    setTenantLoadError(false);
    // Rede de segurança: se nada resolver no prazo, para o spinner e mostra o estado
    // honesto de erro (em vez de cair em "Nenhum workspace").
    const safetyTimer = setTimeout(() => {
      if (!isCurrent()) return;
      setTenantLoading(false);
      setTenantLoadAttempted(true);
      if (!hasLoadedTenantsOnce.current) setTenantLoadError(true);
    }, TENANT_SAFETY_TIMEOUT_MS);

    // B4: usa a session já em memória (de getSession) em vez de chamar getUser() de
    // novo — remove uma ida de rede no caminho que está saturado.
    const userId = session?.user?.id;

    const finish = () => {
      clearTimeout(safetyTimer);
      if (!isCurrent()) return;
      setTenantLoading(false);
      setTenantLoadError(false);
      setTenantLoadAttempted(true);
      hasLoadedTenantsOnce.current = true;
    };

    for (let attempt = 0; attempt < MAX_TENANT_RETRIES; attempt++) {
      let memberErr = null;

      // 1) Caminho principal: tenant_members do usuário logado.
      // Sem userId numa session presente é anomalia (não zero-tenant): trata como erro
      // para entrar em retry/"reconectando" em vez de mentir "Nenhum workspace".
      if (!userId) {
        memberErr = new Error('session sem userId');
      } else {
        const { data: memberData, error } = await supabase
          .from('tenant_members')
          .select('tenant_id, role, tenants(id, name, slug, emoji, color)')
          .eq('user_id', userId)
          .maybeSingle();
        memberErr = error;

        if (!memberErr && memberData?.tenant_id) {
          const t = memberData.tenants;
          setTenants([{
            id: t.slug,
            dbId: t.id,
            name: t.name,
            emoji: t.emoji || '🏪',
            color: t.color || '#B70C00',
            role: memberData.role,
          }]);
          setTenant(preferSlug || t.slug);
          setTenantDbId(t.id);
          finish();
          return;
        }
      }

      // 2) Fallback: listTenants via api.js (lança em erro → fallbackErr).
      // Usuário multi-tenant (>1 linha em tenant_members) cai aqui pois o caminho 1
      // usa .maybeSingle() sem filtrar tenant_id. Busca o role junto para não perder
      // adminOnly/permissões nas telas (ex.: "Usuários e equipe").
      let fallbackErr = null;
      try {
        const [real, { data: memberRows }] = await Promise.all([
          listTenants(),
          userId
            ? supabase.from('tenant_members').select('tenant_id, role').eq('user_id', userId)
            : Promise.resolve({ data: [] }),
        ]);
        if (real?.length) {
          const roleByTenant = new Map((memberRows || []).map(m => [m.tenant_id, m.role]));
          const mapped = real.map(t => ({
            id: t.slug,
            dbId: t.id,
            name: t.name,
            emoji: t.emoji || '🏪',
            color: t.color || '#B70C00',
            role: roleByTenant.get(t.id),
          }));
          setTenants(mapped);
          const slugToUse = preferSlug || mapped[0].id;
          setTenant(slugToUse);
          const selected = mapped.find(t => t.id === slugToUse);
          setTenantDbId(selected?.dbId ?? mapped[0].dbId);
          finish();
          return;
        }
      } catch (e) {
        fallbackErr = e;
      }

      // Distingue erro real (vale retry) de resposta limpa e vazia (zero-tenant).
      const hadError = !!memberErr || !!fallbackErr;
      if (!hadError) {
        // Banco respondeu e o usuário realmente não tem tenant.
        clearTimeout(safetyTimer);
        if (!isCurrent()) return;
        setTenantLoading(false);
        setTenantLoadError(false);
        setTenantLoadAttempted(true);
        return;
      }

      if (memberErr) console.warn(`[reloadTenants] tentativa ${attempt + 1} falhou (tenant_members):`, memberErr.message);
      if (fallbackErr) console.warn(`[reloadTenants] tentativa ${attempt + 1} falhou (listTenants):`, fallbackErr.message);

      // Backoff exponencial antes da próxima tentativa: 1s, 2s, 4s.
      if (attempt < MAX_TENANT_RETRIES - 1) {
        await new Promise(r => setTimeout(r, 1000 * 2 ** attempt));
        // Sessão trocou/unmount durante o backoff → aborta sem mais queries.
        if (!isCurrent()) { clearTimeout(safetyTimer); return; }
      }
    }

    // Todas as tentativas falharam por erro/timeout → estado honesto de reconexão.
    clearTimeout(safetyTimer);
    if (!isCurrent()) return;
    setTenantLoading(false);
    setTenantLoadAttempted(true);
    if (!hasLoadedTenantsOnce.current) setTenantLoadError(true);
  }

  useEffect(() => {
    const timer = setTimeout(() => setAuthLoading(false), 8000);

    supabase.auth.getSession().then(({ data: { session } }) => {
      clearTimeout(timer);
      setSession(session);
      setAuthLoading(false);
    }).catch(() => {
      clearTimeout(timer);
      setAuthLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (event === 'PASSWORD_RECOVERY') {
        setSession(newSession);
        setPasswordRecovery(true);
        setIsInvite(false);
        return;
      }
      if (event === 'SIGNED_IN' && newSession?.user?.app_metadata?.provider === 'email' && !newSession?.user?.last_sign_in_at) {
        setSession(newSession);
        setPasswordRecovery(true);
        setIsInvite(true);
        return;
      }
      setSession(prev => {
        if (prev?.user?.id === newSession?.user?.id && prev?.access_token === newSession?.access_token) return prev;
        return newSession;
      });
    });

    return () => { subscription.unsubscribe(); clearTimeout(timer); };
  }, []);

  useEffect(() => {
    if (!session) return;
    reloadTenants();
    // Ao trocar de sessão ou desmontar, invalida o reload em voo: o guard de geração
    // faz o safetyTimer e os retornos de await pendentes virarem no-op.
    return () => { reloadGenRef.current++; };
  }, [session]);

  // Registra Service Worker + Web Push subscription após ter session + tenantDbId
  useEffect(() => {
    if (!session?.user?.id || !tenantDbId) return;
    registerPushSubscription(tenantDbId, session.user.id);
  }, [session?.user?.id, tenantDbId]);

  // Badge de notificações não lidas para a Sidebar
  useEffect(() => {
    if (!tenantDbId || !session?.user?.id) return;
    let alive = true;
    const load = () =>
      countUnreadNotifications(tenantDbId, session.user.id)
        .then(c => { if (alive) setNotifUnread(c); })
        .catch(() => {});
    load();
    const channel = subscribeToNotifications(tenantDbId, session.user.id, load, 'badge');
    return () => { alive = false; supabase.removeChannel(channel); };
  }, [tenantDbId, session?.user?.id]);

  // ── Notificações globais de chat ─────────────────────────────────────────
  const routeRef    = useRef(route);
  const lastSoundRef = useRef(0);
  useEffect(() => { routeRef.current = route; }, [route]);

  useEffect(() => {
    if (!session) return;

    // Pede permissão de notificação do browser (só aparece uma vez para o usuário)
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }

    const notifAudio = new Audio('/assets/soundreality-ding-411634.mp3');
    notifAudio.volume = 1.0;

    const playSound = () => {
      const now = Date.now();
      if (now - lastSoundRef.current > 3000) {
        lastSoundRef.current = now;
        notifAudio.currentTime = 0;
        notifAudio.play().catch(() => {});
      }
    };

    const showNotif = (sender, body, tag) => {
      if ('Notification' in window && Notification.permission === 'granted') {
        const truncated = body.length > 80 ? body.slice(0, 77) + '…' : body;
        const notif = new Notification(sender, {
          body: truncated,
          icon:     '/assets/logo.svg',
          badge:    '/assets/icon-rocket.svg',
          tag,
          renotify: true,
        });
        notif.onclick = () => { window.focus(); setRoute('chat'); notif.close(); };
      }
    };

    const channel = supabase
      .channel('app-global-notif')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, payload => {
        const msg = payload.new;
        if (msg.direction !== 'inbound') return;
        if (isMuted(msg.conversation_id)) return;
        playSound();
        const rawBody = msg.content || (
          msg.media_type === 'image'    ? '🖼 Imagem'    :
          msg.media_type === 'video'    ? '🎬 Vídeo'     :
          msg.media_type === 'document' ? '📄 Documento' :
          msg.media_type?.includes('audio') ? '🎵 Áudio' : '...'
        );
        showNotif(msg.sender_name || 'Nova mensagem', rawBody, msg.conversation_id);
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'channel_messages' }, payload => {
        const msg = payload.new;
        if (msg.sender_id === session.user.id) return;
        if (isMuted('chan-' + msg.channel_id)) return;
        playSound();
        showNotif(msg.sender_name || 'Chat interno', msg.text || '📎 Arquivo', 'chan-' + msg.channel_id);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [session]);

  useEffect(() => {
    if (!tenant) return;
    const cur = tenants.find(t => t.id === tenant);
    if (cur?.dbId) setTenantDbId(cur.dbId);
  }, [tenant, tenants]);

  useEffect(() => {
    document.documentElement.style.setProperty('--red', tweaks.primaryColor);
  }, [tweaks.primaryColor]);

  useEffect(() => {
    const el = document.documentElement;
    if (theme === 'claro') el.removeAttribute('data-theme');
    else el.setAttribute('data-theme', theme);
    localStorage.setItem('cd-theme', theme);
  }, [theme]);

  useEffect(() => {
    if (!_confirmedAcao) return;
    window.history.replaceState({}, '', window.location.pathname);
    const t = setTimeout(() => setConfirmToast(null), 4000);
    return () => clearTimeout(t);
  }, [_confirmedAcao]);

  if (authLoading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, height: '100vh', background: '#0D0D0D' }}>
        <svg width="48" height="48" viewBox="0 0 24 24" style={{ animation: 'spin 0.8s linear infinite' }}>
          <circle cx="12" cy="12" r="10" fill="none" stroke="#B70C00" strokeWidth="2.5" strokeDasharray="60" strokeDashoffset="20" />
        </svg>
        <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', fontFamily: 'sans-serif' }}>Carregando…</span>
      </div>
    );
  }

  if (passwordRecovery && session) {
    return (
      <ResetPasswordScreen
        isInvite={isInvite}
        onDone={() => setPasswordRecovery(false)}
      />
    );
  }

  if (!session) {
    return <LoginScreen onLogin={setSession} />;
  }

  if (tenantLoading || !tenantLoadAttempted) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, height: '100vh', background: '#0D0D0D' }}>
        <svg width="48" height="48" viewBox="0 0 24 24" style={{ animation: 'spin 0.8s linear infinite' }}>
          <circle cx="12" cy="12" r="10" fill="none" stroke="#B70C00" strokeWidth="2.5" strokeDasharray="60" strokeDashoffset="20" />
        </svg>
        <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', fontFamily: 'sans-serif' }}>Carregando workspace…</span>
      </div>
    );
  }

  // Ramo de ERRO primeiro: banco saturado/timeout. Nunca mente "Nenhum workspace"
  // quando o problema é o servidor — mostra reconexão + retry manual.
  if (tenantLoadError) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, height: '100vh', background: '#0D0D0D' }}>
        <svg width="48" height="48" viewBox="0 0 24 24" style={{ animation: 'spin 0.8s linear infinite' }}>
          <circle cx="12" cy="12" r="10" fill="none" stroke="#B70C00" strokeWidth="2.5" strokeDasharray="60" strokeDashoffset="20" />
        </svg>
        <span style={{ fontSize: 15, color: 'rgba(255,255,255,0.7)', fontFamily: 'sans-serif', textAlign: 'center', maxWidth: 320 }}>
          Servidor temporariamente indisponível, reconectando…
        </span>
        <button onClick={() => reloadTenants()} style={{ padding: '8px 20px', background: '#444', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 14 }}>
          Tentar novamente
        </button>
      </div>
    );
  }

  if (!tenantDbId) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, height: '100vh', background: '#0D0D0D' }}>
        <span style={{ fontSize: 15, color: 'rgba(255,255,255,0.7)', fontFamily: 'sans-serif' }}>Nenhum workspace encontrado para este usuário.</span>
        <button onClick={() => reloadTenants()} style={{ padding: '8px 20px', background: '#444', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 14, marginBottom: 4 }}>
          Tentar novamente
        </button>
        <button onClick={() => supabase.auth.signOut()} style={{ padding: '8px 20px', background: '#B70C00', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 14 }}>
          Sair
        </button>
      </div>
    );
  }

  // Console v2 — único console (D1): todo usuário autenticado com tenant cai aqui.
  // Console clássico aposentado nesta sessão (Sidebar/Topbar/rotas legadas removidos).
  return (
    <ConsoleV2
      tenantInfo={tenants.find(t => t.id === tenant)}
      tenantDbId={tenantDbId}
      userId={session?.user?.id}
    />
  );
}
