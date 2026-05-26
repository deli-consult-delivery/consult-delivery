import { useState, useEffect, useRef } from 'react';
import Sidebar from './components/Sidebar.jsx';
import Topbar from './components/Topbar.jsx';
import { TweaksPanel, TweakSection, TweakColor, TweakRadio, TweakToggle, useTweaks } from './components/TweaksPanel.jsx';
import LoginScreen from './screens/LoginScreen.jsx';
import DashboardScreen from './screens/DashboardScreen.jsx';
import ChatScreen from './screens/ChatScreen.jsx';
import TasksScreen from './screens/TasksScreen.jsx';
import CoraScreen from './screens/CoraScreen.jsx';
import AnaliseiFoodScreen from './screens/AnaliseiFoodScreen.jsx';
import TarefasClientesScreen from './screens/TarefasClientesScreen.jsx';
import CRMScreen from './screens/CRMScreen.jsx';
import ReportsScreen from './screens/ReportsScreen.jsx';
import SettingsScreen from './screens/SettingsScreen.jsx';
import AgentsPage from './screens/AgentsPage.jsx';
import CampanhasScreen from './screens/campanhas/CampanhasScreen.jsx';
import LojasScreen from './screens/lojas/LojasScreen.jsx';
import LaraScreen from './screens/LaraScreen.jsx';
import LaraEditorialScreen from './screens/LaraEditorial/LaraEditorialScreen.jsx';
import DraftsPendentesScreen from './screens/DraftsPendentesScreen.jsx';
import GruposScreen from './screens/GruposScreen.jsx';
import DeliScreen from './screens/DeliScreen.jsx';
import DeliPainel from './screens/DeliPainel.jsx';
import MaxScreen from './screens/MaxScreen.jsx';
import NovaScreen from './screens/NovaScreen.jsx';
import BrenoScreen from './screens/BrenoScreen.jsx';
import SofiaScreen from './screens/Sofia/SofiaScreen.jsx';
import VeraScreen from './screens/VeraScreen.jsx';
import BomDiaScreen from './screens/BomDiaScreen.jsx';
import EncerramentoScreen from './screens/EncerramentoScreen.jsx';
import ContratosScreen from './screens/Contratos/ContratosScreen.jsx';
import RecontratacaoScreen from './screens/Recontratacao/RecontratacaoScreen.jsx';
import OnboardingScreen from './screens/OnboardingScreen.jsx';
import RequireRole from './components/auth/RequireRole.jsx';
import InadimplentesScreen from './screens/InadimplentesScreen.jsx';
import NotificacoesScreen from './screens/NotificacoesScreen.jsx';
import { CONVERSATIONS, INADIMPLENTES, TENANTS } from './data.js';
import { supabase } from './lib/supabase.js';
import { listTenants, countUnreadNotifications, subscribeToNotifications } from './lib/api.js';
import { registerPushSubscription } from './lib/pushNotifications.js';

const TWEAK_DEFAULTS = {
  primaryColor: '#B70C00',
  density: 'medium',
  showAgentsBanner: true,
  liveSim: true,
};

export default function App() {
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [tenants, setTenants] = useState(TENANTS);
  const [route, setRoute] = useState(() => localStorage.getItem('cd-route') || 'dashboard');
  const [tenant, setTenant] = useState(TENANTS[0].id);
  const [tenantDbId, setTenantDbId] = useState(null);
  const [tweaks, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [theme, setTheme] = useState(() => localStorage.getItem('cd-theme') || 'claro');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notifUnread, setNotifUnread] = useState(0);

  useEffect(() => { localStorage.setItem('cd-route', route); }, [route]);

  // Carrega tenants do banco (usado no mount e quando um workspace novo é criado)
  async function reloadTenants(preferSlug) {
    try {
      const real = await listTenants();
      if (real?.length) {
        const mapped = real.map(t => ({
          id: t.slug,
          dbId: t.id,
          name: t.name,
          emoji: t.emoji || '🏪',
          color: t.color || '#B70C00',
        }));
        setTenants(mapped);
        const slugToUse = preferSlug || mapped[0].id;
        setTenant(slugToUse);
        const selected = mapped.find(t => t.id === slugToUse);
        setTenantDbId(selected?.dbId ?? mapped[0].dbId);
        return;
      }
    } catch (_) { /* silencioso */ }
    // fallback se listTenants falhar ou retornar vazio
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: m } = await supabase
        .from('tenant_members').select('tenant_id').eq('user_id', user?.id).maybeSingle();
      if (!m?.tenant_id) return;
      const { data: t } = await supabase
        .from('tenants').select('id, slug, name, emoji, color').eq('id', m.tenant_id).maybeSingle();
      if (!t) return;
      const mapped = { id: t.slug, dbId: t.id, name: t.name, emoji: t.emoji || '🏪', color: t.color || '#B70C00' };
      setTenants([mapped]);
      setTenant(t.slug);
      setTenantDbId(t.id);
    } catch (_) { /* silencioso */ }
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

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => { subscription.unsubscribe(); clearTimeout(timer); };
  }, []);

  useEffect(() => {
    if (!session) return;
    reloadTenants();
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
    const channel = subscribeToNotifications(tenantDbId, session.user.id, load);
    return () => { alive = false; supabase.removeChannel(channel); };
  }, [tenantDbId, session?.user?.id]);

  // ── Notificações globais de chat ─────────────────────────────────────────────
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
        playSound();
        showNotif(msg.sender_name || 'Chat interno', msg.text || '📎 Arquivo', 'chan-' + msg.channel_id);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [session]);

  useEffect(() => {
    const cur = tenants.find(t => t.id === tenant);
    setTenantDbId(cur?.dbId ?? null);
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

  if (!session) {
    return <LoginScreen onLogin={setSession} />;
  }

  const convs = CONVERSATIONS[tenant] || [];
  const unread = convs.reduce((s, c) => s + (c.unread || 0), 0);
  const coraCount = INADIMPLENTES[tenant]?.rows?.length || 0;
  const counts = { chat: unread, cora: coraCount, notificacoes: notifUnread || undefined };

  return (
    <div className={`app-shell${route === 'chat' ? ' app-shell--notopbar' : ''}`}>
      {sidebarOpen && <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />}
      <Sidebar
        route={route}
        setRoute={r => { setRoute(r); setSidebarOpen(false); }}
        counts={counts}
        isOpen={sidebarOpen}
        userId={session?.user?.id}
      />
      <Topbar
        route={route}
        tenant={tenant}
        setTenant={setTenant}
        tenants={tenants}
        theme={theme}
        setTheme={setTheme}
        onMenuToggle={() => setSidebarOpen(v => !v)}
        tenantId={tenantDbId}
        userId={session?.user?.id}
        onNavigate={setRoute}
      />
      <main className="main scroll" key={route + tenant}>
        {/* Rotas públicas (sem RequireRole) */}
        {route === 'dashboard' && <DashboardScreen tenant={tenant} tenantDbId={tenantDbId} onNavigate={setRoute} />}
        {route === 'lojas'        && <LojasScreen tenantDbId={tenantDbId} userId={session?.user?.id} />}
        {route === 'notificacoes' && <NotificacoesScreen tenantDbId={tenantDbId} userId={session?.user?.id} onNavigate={setRoute} />}

        {/* admin + atendimento + marketing */}
        {route === 'chat' && (
          <RequireRole roles={['admin', 'atendimento', 'marketing']} userId={session?.user?.id}>
            <ChatScreen tenant={tenant} tenantDbId={tenantDbId} onNavigate={setRoute} />
          </RequireRole>
        )}
        {route === 'onboarding' && (
          <RequireRole roles={['admin', 'atendimento', 'marketing']} userId={session?.user?.id}>
            <OnboardingScreen tenantDbId={tenantDbId} />
          </RequireRole>
        )}

        {/* admin + marketing */}
        {route === 'crm' && (
          <RequireRole roles={['admin', 'marketing']} userId={session?.user?.id}>
            <CRMScreen tenant={tenant} tenantDbId={tenantDbId} onNavigate={nav => setRoute(nav)} />
          </RequireRole>
        )}
        {route === 'reports' && (
          <RequireRole roles={['admin', 'marketing']} userId={session?.user?.id}>
            <ReportsScreen tenant={tenant} tenantDbId={tenantDbId} userId={session?.user?.id} />
          </RequireRole>
        )}
        {route === 'lara' && (
          <RequireRole roles={['admin', 'marketing']} userId={session?.user?.id}>
            <LaraScreen tenantDbId={tenantDbId} userId={session?.user?.id} />
          </RequireRole>
        )}
        {route === 'lara-editorial' && (
          <RequireRole roles={['admin', 'marketing']} userId={session?.user?.id}>
            <LaraEditorialScreen tenantDbId={tenantDbId} userId={session?.user?.id} />
          </RequireRole>
        )}
        {route === 'sofia' && (
          <RequireRole roles={['admin', 'marketing']} userId={session?.user?.id}>
            <SofiaScreen tenantDbId={tenantDbId} userId={session?.user?.id} />
          </RequireRole>
        )}
        {route === 'tarefas-clientes' && (
          <RequireRole roles={['admin', 'marketing']} userId={session?.user?.id}>
            <TarefasClientesScreen tenant={tenant} tenantDbId={tenantDbId} userId={session?.user?.id} />
          </RequireRole>
        )}
        {route === 'campanhas' && (
          <RequireRole roles={['admin', 'marketing']} userId={session?.user?.id}>
            <CampanhasScreen tenantDbId={tenantDbId} userId={session?.user?.id} />
          </RequireRole>
        )}
        {route === 'drafts-pendentes' && (
          <RequireRole roles={['admin', 'marketing']} userId={session?.user?.id}>
            <DraftsPendentesScreen tenantId={tenantDbId} userId={session?.user?.id} />
          </RequireRole>
        )}

        {/* admin only */}
        {route === 'tarefas' && (
          <RequireRole roles={['admin']} userId={session?.user?.id}>
            <TasksScreen tenant={tenant} tenantDbId={tenantDbId} userId={session?.user?.id} />
          </RequireRole>
        )}
        {route === 'contratos' && (
          <RequireRole roles={['admin']} userId={session?.user?.id}>
            <ContratosScreen tenantDbId={tenantDbId} userId={session?.user?.id} />
          </RequireRole>
        )}
        {route === 'recontratacao' && (
          <RequireRole roles={['admin']} userId={session?.user?.id}>
            <RecontratacaoScreen tenantDbId={tenantDbId} />
          </RequireRole>
        )}
        {route === 'agents' && (
          <RequireRole roles={['admin']} userId={session?.user?.id}>
            <AgentsPage tenant={tenant} tenantDbId={tenantDbId} userId={session?.user?.id} />
          </RequireRole>
        )}
        {route === 'settings' && (
          <RequireRole roles={['admin']} userId={session?.user?.id}>
            <SettingsScreen tenant={tenant} tenantDbId={tenantDbId} userId={session?.user?.id} onTenantChange={async (newSlug) => {
              if (newSlug) {
                setTenant(newSlug);
              } else {
                await reloadTenants();
              }
            }} />
          </RequireRole>
        )}
        {route === 'max' && (
          <RequireRole roles={['admin']} userId={session?.user?.id}>
            <MaxScreen tenantDbId={tenantDbId} userId={session?.user?.id} />
          </RequireRole>
        )}
        {route === 'nova' && (
          <RequireRole roles={['admin']} userId={session?.user?.id}>
            <NovaScreen tenantDbId={tenantDbId} userId={session?.user?.id} />
          </RequireRole>
        )}
        {route === 'breno' && (
          <RequireRole roles={['admin']} userId={session?.user?.id}>
            <BrenoScreen tenantDbId={tenantDbId} userId={session?.user?.id} />
          </RequireRole>
        )}
        {route === 'vera' && (
          <RequireRole roles={['admin']} userId={session?.user?.id}>
            <VeraScreen tenantDbId={tenantDbId} userId={session?.user?.id} />
          </RequireRole>
        )}

        {/* admin + deli_owner */}
        {route === 'deli' && (
          <RequireRole roles={['admin', 'deli_owner']} userId={session?.user?.id}>
            <DeliScreen tenantDbId={tenantDbId} userId={session?.user?.id} />
          </RequireRole>
        )}
        {route === 'deli-painel' && (
          <RequireRole roles={['admin', 'deli_owner']} userId={session?.user?.id}>
            <DeliPainel tenantDbId={tenantDbId} userId={session?.user?.id} />
          </RequireRole>
        )}

        {/* admin + atendimento */}
        {route === 'analise-ifood' && (
          <RequireRole roles={['admin', 'atendimento']} userId={session?.user?.id}>
            <AnaliseiFoodScreen tenant={tenant} tenantDbId={tenantDbId} />
          </RequireRole>
        )}
        {route === 'grupos' && (
          <RequireRole roles={['admin', 'atendimento']} userId={session?.user?.id}>
            <GruposScreen tenant={tenant} tenantDbId={tenantDbId} />
          </RequireRole>
        )}
        {route === 'bom-dia' && (
          <RequireRole roles={['admin', 'atendimento']} userId={session?.user?.id}>
            <BomDiaScreen tenantDbId={tenantDbId} userId={session?.user?.id} />
          </RequireRole>
        )}
        {route === 'encerramento' && (
          <RequireRole roles={['admin', 'atendimento']} userId={session?.user?.id}>
            <EncerramentoScreen tenantDbId={tenantDbId} userId={session?.user?.id} />
          </RequireRole>
        )}

        {/* admin + financeiro */}
        {route === 'cora' && (
          <RequireRole roles={['admin', 'financeiro']} userId={session?.user?.id}>
            <CoraScreen tenant={tenant} tenantDbId={tenantDbId} userId={session?.user?.id} />
          </RequireRole>
        )}
        {route === 'inadimplentes' && (
          <RequireRole roles={['admin', 'financeiro']} userId={session?.user?.id}>
            <InadimplentesScreen tenantDbId={tenantDbId} userId={session?.user?.id} />
          </RequireRole>
        )}
      </main>
      <TweaksPanel title="Tweaks">
        <TweakSection title="Marca">
          <TweakColor
            label="Cor primária"
            value={tweaks.primaryColor}
            onChange={v => setTweak('primaryColor', v)}
            presets={['#B70C00', '#EA580C', '#2563EB', '#059669', '#7C3AED', '#0D0D0D']}
          />
        </TweakSection>
        <TweakSection title="Layout">
          <TweakRadio
            label="Densidade"
            value={tweaks.density}
            onChange={v => setTweak('density', v)}
            options={[
              { value: 'compact', label: 'Compacta' },
              { value: 'medium', label: 'Média' },
              { value: 'comfy', label: 'Conforto' },
            ]}
          />
        </TweakSection>
        <TweakSection title="Recursos">
          <TweakToggle label="Banner de agentes IA" value={tweaks.showAgentsBanner} onChange={v => setTweak('showAgentsBanner', v)} />
          <TweakToggle label="Simulação em tempo real" value={tweaks.liveSim} onChange={v => setTweak('liveSim', v)} />
        </TweakSection>
      </TweaksPanel>
    </div>
  );
}
