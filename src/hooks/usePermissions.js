import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

// Cache de sessão — evita chamadas repetidas para o mesmo userId
const _cache = {};

export function usePermissions(userId) {
  const cached = _cache[userId];
  const [permissions, setPermissions] = useState(cached?.permissions ?? new Set());
  const [agentAccess, setAgentAccess]  = useState(cached?.agentAccess  ?? {});
  const [loading, setLoading]          = useState(!cached);

  useEffect(() => {
    if (!userId || _cache[userId]) return;

    (async () => {
      const [{ data: userRoles }, { data: agents }] = await Promise.all([
        supabase.from('user_roles')
          .select('role_id')
          .eq('user_id', userId),
        supabase.from('user_agent_access')
          .select('agent_name, can_invoke, can_view_history, can_approve_drafts')
          .eq('user_id', userId),
      ]);

      let permSet = new Set();
      if (userRoles?.length) {
        const { data: perms } = await supabase
          .from('role_permissions')
          .select('resource, action')
          .in('role_id', userRoles.map(r => r.role_id));
        permSet = new Set((perms ?? []).map(p => `${p.resource}:${p.action}`));
      }

      const agentMap = {};
      (agents ?? []).forEach(a => { agentMap[a.agent_name] = a; });

      _cache[userId] = { permissions: permSet, agentAccess: agentMap };
      setPermissions(permSet);
      setAgentAccess(agentMap);
      setLoading(false);
    })();
  }, [userId]);

  return {
    loading,
    agentAccess,
    can:             (resource, action) => permissions.has(`${resource}:${action}`),
    canInvokeAgent:  (name)             => agentAccess[name]?.can_invoke        ?? false,
    canViewHistory:  (name)             => agentAccess[name]?.can_view_history   ?? false,
    canApproveDraft: (name)             => agentAccess[name]?.can_approve_drafts ?? false,
  };
}
