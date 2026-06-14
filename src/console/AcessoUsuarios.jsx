import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase.js';

// ============================================================
// Console v2 — GAP-7: Acesso a agentes por usuário
// Grants de user_agent_access (can_invoke / can_view_history /
// can_approve_drafts) por membro e agente. RLS: admin do tenant.
// ============================================================

export default function AcessoUsuarios({ tenantDbId }) {
  const [membros, setMembros] = useState([]);
  const [agentes, setAgentes] = useState([]);
  const [grants, setGrants] = useState({});
  const [sel, setSel] = useState('');
  const [erro, setErro] = useState(null);
  const [agindo, setAgindo] = useState(false);

  const carregar = useCallback(async () => {
    if (!tenantDbId) return;
    const [{ data: ms }, { data: tas }] = await Promise.all([
      supabase.from('tenant_members').select('user_id, role').eq('tenant_id', tenantDbId),
      supabase.from('tenant_agents').select('agent_id, agents(id, name)').eq('tenant_id', tenantDbId),
    ]);
    setMembros(ms ?? []);
    setAgentes((tas ?? []).map(t => t.agents).filter(Boolean));
    if (!sel && ms?.length) setSel(ms[0].user_id);
  }, [tenantDbId, sel]);

  const carregarGrants = useCallback(async () => {
    if (!sel) return;
    const { data, error } = await supabase.from('user_agent_access')
      .select('agent_id, agent_name, can_invoke, can_view_history, can_approve_drafts').eq('user_id', sel);
    if (error) { setErro(error.message); return; }
    const map = {};
    (data ?? []).forEach(g => { map[g.agent_id || g.agent_name] = g; });
    setGrants(map);
  }, [sel]);

  useEffect(() => { carregar(); }, [carregar]);
  useEffect(() => { carregarGrants(); }, [carregarGrants]);

  async function toggle(agentId, campo) {
    setAgindo(true); setErro(null);
    const g = grants[agentId] || {};
    const novo = {
      user_id: sel, tenant_id: tenantDbId, agent_id: agentId, agent_name: agentId,
      can_invoke: g.can_invoke ?? false, can_view_history: g.can_view_history ?? false, can_approve_drafts: g.can_approve_drafts ?? false,
    };
    novo[campo] = !(g[campo] ?? false);
    const { error } = await supabase.from('user_agent_access').upsert(novo, { onConflict: 'user_id,agent_id' });
    setAgindo(false);
    if (error) { setErro(error.message); return; }
    await carregarGrants();
  }

  return (
    <div>
      <h1>Acesso por usuário <span className="cv2-mock" style={{ background: 'var(--green-soft)', color: 'var(--green)' }}>RBAC</span></h1>
      <div className="cv2-rule" />
      <div className="cv2-sub">Quem pode invocar, ver histórico e aprovar drafts de cada agente.{erro ? ` · erro: ${erro}` : ''}</div>
      <div className="cv2-card" style={{ maxWidth: 420 }}>
        <label style={{ display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--tx2)', marginBottom: 5 }}>Usuário</label>
        <select value={sel} onChange={e => setSel(e.target.value)} style={{ width: '100%', padding: '9px 11px', border: '1px solid var(--line)', borderRadius: 4, fontFamily: 'inherit', fontSize: 13 }}>
          {membros.map(m => <option key={m.user_id} value={m.user_id}>{m.user_id.slice(0, 8)} · {m.role}</option>)}
        </select>
      </div>
      {agentes.length > 0 && (
        <div className="cv2-card">
          <div className="cv2-tbl-wrap">
          <table>
            <thead><tr><th>Agente</th><th>Invocar</th><th>Histórico</th><th>Aprovar drafts</th></tr></thead>
            <tbody>
              {agentes.map(a => {
                const g = grants[a.id] || {};
                const Cell = ({ campo }) => (
                  <td><button className={g[campo] ? 'cv2-btn' : 'cv2-btn sec'} disabled={agindo} onClick={() => toggle(a.id, campo)} style={{ padding: '4px 10px', fontSize: 11 }}>{g[campo] ? 'sim' : 'não'}</button></td>
                );
                return (
                  <tr key={a.id}><td><b>{a.name}</b></td><Cell campo="can_invoke" /><Cell campo="can_view_history" /><Cell campo="can_approve_drafts" /></tr>
                );
              })}
            </tbody>
          </table>
          </div>
        </div>
      )}
    </div>
  );
}
