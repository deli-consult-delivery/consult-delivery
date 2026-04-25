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
import Placeholder from './screens/Placeholder.jsx';
import AgentsPage from './screens/AgentsPage.jsx';
import { CONVERSATIONS, INADIMPLENTES } from './data.js';

const TWEAK_DEFAULTS = {
  primaryColor: '#B70C00',
  density: 'medium',
  showAgentsBanner: true,
  liveSim: true,
};

export default function App() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [route, setRoute] = useState('dashboard');
  const [tenant, setTenant] = useState('pizza-joao');
  const [tweaks, setTweak] = useTweaks(TWEAK_DEFAULTS);

  useEffect(() => {
    document.documentElement.style.setProperty('--red', tweaks.primaryColor);
  }, [tweaks.primaryColor]);

  if (!loggedIn) {
    return <LoginScreen onLogin={() => setLoggedIn(true)} />;
  }

  const convs = CONVERSATIONS[tenant] || [];
  const unread = convs.reduce((s, c) => s + (c.unread || 0), 0);
  const coraCount = INADIMPLENTES[tenant]?.rows?.length || 0;
  const counts = { chat: unread, cora: coraCount };

  return (
    <div className="app-shell">
      <Sidebar route={route} setRoute={setRoute} counts={counts} />
      <Topbar route={route} tenant={tenant} setTenant={setTenant} />
      <main className="main scroll" key={route + tenant}>
        {route === 'dashboard' && <DashboardScreen tenant={tenant} />}
        {route === 'chat'      && <ChatScreen tenant={tenant} />}
        {route === 'tasks'     && <KanbanScreen tenant={tenant} />}
        {route === 'cora'      && <CoraScreen tenant={tenant} />}
        {route === 'crm'       && <CRMScreen tenant={tenant} />}
        {route === 'reports'   && <ReportsScreen tenant={tenant} />}
        {route === 'agents'    && <AgentsPage />}
        {route === 'settings'  && <SettingsScreen tenant={tenant} />}
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
