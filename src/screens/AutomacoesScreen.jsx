import { useState } from 'react';
import HeartbeatsScreen from './HeartbeatsScreen.jsx';
import GoalsScreen from './GoalsScreen.jsx';
import AgentBuilderScreen from './AgentBuilderScreen.jsx';
import MemoriesScreen from './MemoriesScreen.jsx';
import AgentRunsScreen from './AgentRunsScreen.jsx';
import KnowledgeBaseScreen from './KnowledgeBaseScreen.jsx';
import AgentInboxScreen from './AgentInboxScreen.jsx';
import ApprovalsScreen from './ApprovalsScreen.jsx';

const TABS = [
  { id: 'heartbeats',   label: 'Heartbeats',          component: HeartbeatsScreen },
  { id: 'metas',        label: 'Metas & OKR',         component: GoalsScreen },
  { id: 'agentes',      label: 'Agentes',              component: AgentBuilderScreen },
  { id: 'memorias',     label: 'Memórias',             component: MemoriesScreen },
  { id: 'runs',         label: 'Execuções',            component: AgentRunsScreen },
  { id: 'conhecimento', label: 'Base de Conhecimento', component: KnowledgeBaseScreen },
  { id: 'inbox',        label: 'Inbox dos Agentes',    component: AgentInboxScreen },
  { id: 'aprovacoes',   label: 'Aprovações',           component: ApprovalsScreen },
];

export default function AutomacoesScreen({ tenantDbId, onNavigate }) {
  const [activeTab, setActiveTab] = useState('heartbeats');

  const ActiveComponent = TABS.find(t => t.id === activeTab)?.component || HeartbeatsScreen;

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Tab bar */}
      <div style={{
        display: 'flex', gap: 4, padding: '0 20px',
        borderBottom: '1px solid var(--line)',
        background: 'var(--panel)',
      }}>
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '12px 18px',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === tab.id ? '2px solid var(--red)' : '2px solid transparent',
              color: activeTab === tab.id ? 'var(--ink)' : 'var(--tx2)',
              cursor: 'pointer',
              fontSize: 14,
              fontWeight: activeTab === tab.id ? 600 : 400,
              transition: 'color 0.15s, border-color 0.15s',
              marginBottom: -1,
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Active screen */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <ActiveComponent tenantDbId={tenantDbId} onNavigate={onNavigate} />
      </div>
    </div>
  );
}
