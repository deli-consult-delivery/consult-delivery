import { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar.jsx';
import Topbar from './components/Topbar.jsx';
import { TweaksPanel, TweakSection, TweakColor, TweakRadio, TweakToggle, useTweaks } from './components/TweaksPanel.jsx';
import LoginScreen from './screens/LoginScreen.jsx';
import DashboardScreen from './screens/DashboardScreen.jsx';
import ChatScreen from './screens/ChatScreen.jsx';
import KanbanScreen from './screens/KanbanScreen.jsx';
import CoraScreen from './screens/CoraScreen.jsx';
import CRMScreen from './screens/CRMScreen.jsx';
import ReportsScreen from './screens/ReportsScreen.jsx';
import SettingsScreen from './screens/SettingsScreen.jsx';
import AgentsPage from './screens/AgentsPage.jsx';
import GruposScreen from './screens/GruposScreen.jsx';
import { CONVERSATIONS, INADIMPLENTES, TENANTS } from './data.js';
import { supabase } from './lib/supabase.js';
import { listTenants } from './lib/api.js';

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
  const [route, setRoute] = useState('dashboard');
  const [tenant, setTenant] = useState(TENANTS[0].id);
  const [tenantDbId, setTenantDbId] = useState(null);
  const [tweaks, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [theme, setTheme] = useState(() => localStorage.getItem('cd-theme') || 'claro');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setAuthLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) return;
    listTenants().then(real => {
      if (real?.length) {
        const mapped = real.map(t => ({
          id: t.slug,
          dbId: t.id,
          name: t.name,
          emoji: t.emoji || '🏪',
          color: t.color || '#B70C00',
        }));
        setTenants(mapped);
        setTenant(mapped[0].id);
        setTenantDbId(mapped[0].dbId);
      }
    }).catch(() => {});
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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--white)' }}>
        <svg width="24" height="24" viewBox="0 0 24 24" style={{ animation: 'spin 0.8s linear infinite' }}>
          <circle cx="12" cy="12" r="10" fill="none" stroke="var(--red)" strokeWidth="3" strokeDasharray="60" strokeDashoffset="20" />
        </svg>
      </div>
    );
  }

  if (!session) {
    return <LoginScreen onLogin={setSession} />;
  }

  const convs = CONVERSATIONS[tenant] || [];
  const unread = convs.reduce((s, c) => s + (c.unread || 0), 0);
  const coraCount = INADIMPLENTES[tenant]?.rows?.length || 0;
  const counts = { chat: unread, cora: coraCount };

  return (
    <div className="app-shell">
      {sidebarOpen && <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />}
      <Sidebar
        route={route}
        setRoute={r => { setRoute(r); setSidebarOpen(false); }}
        counts={counts}
        isOpen={sidebarOpen}
      />
      <Topbar
        route={route}
        tenant={tenant}
        setTenant={setTenant}
        tenants={tenants}
        theme={theme}
        setTheme={setTheme}
        onMenuToggle={() => setSidebarOpen(v => !v)}
      />
      <main className="main scroll" key={route + tenant}>
        {route === 'dashboard' && <DashboardScreen tenant={tenant} tenantDbId={tenantDbId} />}
        {route === 'chat'      && <ChatScreen tenant={tenant} tenantDbId={tenantDbId} onNavigate={setRoute} />}
        {route === 'tasks'     && <KanbanScreen tenant={tenant} tenantDbId={tenantDbId} />}
        {route === 'cora'      && <CoraScreen tenant={tenant} tenantDbId={tenantDbId} />}
        {route === 'crm'       && <CRMScreen tenant={tenant} tenantDbId={tenantDbId} />}
        {route === 'reports'   && <ReportsScreen tenant={tenant} tenantDbId={tenantDbId} />}
        {route === 'agents'    && <AgentsPage />}
        {route === 'grupos'    && <GruposScreen tenant={tenant} tenantDbId={tenantDbId} />}
        {route === 'settings'  && <SettingsScreen tenant={tenant} tenantDbId={tenantDbId} />}
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
