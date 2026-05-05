import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase.js';
import { listAuditLog } from '../lib/api.js';
import { AGENTS_META } from './agents/AGENTS_META.js';
import AgentCard from './agents/AgentCard.jsx';
import AgentDetailPanel from './agents/AgentDetailPanel.jsx';
import InvokeModal from './agents/InvokeModal.jsx';

export default function AgentsPage({ tenantId, userId }) {
  const [logsByAgent, setLogsByAgent]   = useState({});
  const [selected, setSelected]         = useState(null);
  const [fullLogs, setFullLogs]         = useState([]);
  const [invokingAgent, setInvokingAgent] = useState(null);

  function fetchLogs() {
    if (!tenantId) return;
    listAuditLog(tenantId, { limit: 100 })
      .then(rows => {
        const byAgent = {};
        rows.forEach(r => {
          if (!r.agent_name) return;
          if (!byAgent[r.agent_name]) byAgent[r.agent_name] = [];
          byAgent[r.agent_name].push(r);
        });
        setLogsByAgent(byAgent);
      })
      .catch(err => console.error('[AgentsPage] audit_log', err));
  }

  // Carga inicial
  useEffect(() => {
    fetchLogs();
  }, [tenantId]);

  // Realtime: audit_log INSERT filtrado por tenant
  useEffect(() => {
    if (!tenantId) return;
    const channel = supabase
      .channel(`audit-log-${tenantId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'audit_log',
          filter: `tenant_id=eq.${tenantId}`,
        },
        () => {
          listAuditLog(tenantId, { limit: 100 })
            .then(rows => {
              const byAgent = {};
              rows.forEach(r => {
                if (!r.agent_name) return;
                if (!byAgent[r.agent_name]) byAgent[r.agent_name] = [];
                byAgent[r.agent_name].push(r);
              });
              setLogsByAgent(byAgent);
            })
            .catch(err => console.error('[AgentsPage] realtime refetch', err));
        }
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [tenantId]);

  function openDetail(agent) {
    setSelected(agent);
    setFullLogs(logsByAgent[agent.id] ?? []);
  }

  function handleInvokeSuccess() {
    setInvokingAgent(null);
    fetchLogs();
  }

  const activeAgents  = AGENTS_META.filter(a => a.status === 'ativo');
  const plannedAgents = AGENTS_META.filter(a => a.status === 'planejado');

  return (
    <div className="route-enter page-container" style={{ padding: 32, maxWidth: 1200, margin: '0 auto' }}>
      <h1 className="page-h1">Agentes IA</h1>
      <p className="page-sub">Sua equipe digital — agentes trabalhando 24/7 pela plataforma.</p>

      <div style={{ marginTop: 28 }}>
        <div className="label" style={{ marginBottom: 14 }}>Ativos agora</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
          {activeAgents.map(a => (
            <AgentCard
              key={a.id}
              agent={a}
              lastAction={(logsByAgent[a.id] ?? [])[0] ?? null}
              onClick={() => openDetail(a)}
              onInvoke={agent => setInvokingAgent(agent)}
              userId={userId}
            />
          ))}
        </div>
      </div>

      <div style={{ marginTop: 36 }}>
        <div className="label" style={{ marginBottom: 14 }}>Planejados — Milestone v2+</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
          {plannedAgents.map(a => (
            <AgentCard
              key={a.id}
              agent={a}
              lastAction={null}
              onClick={() => openDetail(a)}
              onInvoke={agent => setInvokingAgent(agent)}
              userId={userId}
            />
          ))}
        </div>
      </div>

      {selected && (
        <AgentDetailPanel
          agent={selected}
          logs={fullLogs}
          onClose={() => setSelected(null)}
          onInvoke={agent => setInvokingAgent(agent)}
          userId={userId}
        />
      )}

      {invokingAgent && (
        <InvokeModal
          agent={invokingAgent}
          tenantId={tenantId}
          onClose={() => setInvokingAgent(null)}
          onSuccess={handleInvokeSuccess}
        />
      )}
    </div>
  );
}
