import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export function usePermissions(userId) {
  const [permissions, setPermissions] = useState(new Set());
  const [roleNames, setRoleNames]     = useState(new Set());
  const [agentAccess, setAgentAccess] = useState({});
  const [screenPerms, setScreenPerms] = useState(new Map());
  const [loading, setLoading]         = useState(true);

  useEffect(() => {
    if (!userId) { setLoading(false); return; }

    setLoading(true);

    (async () => {
      const [{ data: userRoles }, { data: agents }, { data: screens }] = await Promise.all([
        supabase.from('user_roles')
          .select('role_id, roles(name)')
          .eq('user_id', userId),
        supabase.from('user_agent_access')
          // P-3 (onda 2): inclui agent_id para indexação canônica por slug do catálogo.
          // agent_name mantido para backward compat enquanto callers não migram.
          .select('agent_name, agent_id, can_invoke, can_view_history, can_approve_drafts')
          .eq('user_id', userId),
        supabase.from('user_screen_permissions')
          .select('screen_id, allowed')
          .eq('user_id', userId),
      ]);

      let permSet = new Set();
      const nameSet = new Set();
      if (userRoles?.length) {
        const roleIds = userRoles.map(r => r.role_id);
        userRoles.forEach(r => { if (r.roles?.name) nameSet.add(r.roles.name); });

        const { data: perms } = await supabase
          .from('role_permissions')
          .select('resource, action')
          .in('role_id', roleIds);
        permSet = new Set((perms ?? []).map(p => `${p.resource}:${p.action}`));
      }

      // P-3: indexa por agent_id (slug canônico) E por agent_name (legado).
      // Callers existentes usando agent_name continuam funcionando.
      // Novos callers devem usar agent_id (ex: 'analise-ifood' em vez de 'analista-ifood').
      const agentMap = {};
      (agents ?? []).forEach(a => {
        if (a.agent_id)   agentMap[a.agent_id]   = a;
        if (a.agent_name) agentMap[a.agent_name] = a;
      });

      const screenMap = new Map();
      (screens ?? []).forEach(s => screenMap.set(s.screen_id, s.allowed));

      setPermissions(permSet);
      setRoleNames(nameSet);
      setAgentAccess(agentMap);
      setScreenPerms(screenMap);
      setLoading(false);
    })();
  }, [userId]);

  return {
    loading,
    agentAccess,
    can:             (resource, action) => permissions.has(`${resource}:${action}`),
    hasRole:         (name)             => roleNames.has(name),
    canInvokeAgent:  (name)             => agentAccess[name]?.can_invoke        ?? false,
    canViewHistory:  (name)             => agentAccess[name]?.can_view_history   ?? false,
    canApproveDraft: (name)             => agentAccess[name]?.can_approve_drafts ?? false,
    canAccessScreen: (screenId)         => screenPerms.has(screenId) ? screenPerms.get(screenId) : null,
  };
}
