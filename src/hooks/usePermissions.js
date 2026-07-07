import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { pickTenantRole, buildPermissionSet, buildAgentAccessMap, buildScreenPermsMap, resolveHasRole, resolveCan, resolveCanInvokeAgent } from './permissions-derive.js';

// tenantId é obrigatório: sem ele não há como saber o papel do usuário NESTE
// tenant. ANTES (usePermissions(userId) só) lia user_roles sem filtro de
// tenant — tabela órfã sem nenhum caminho de escrita no app (nada grava em
// user_roles/roles), então divergia da RLS pra qualquer usuário onboardado
// depois do seed inicial da migration de RBAC.
export function usePermissions(userId, tenantId) {
  const [permissions, setPermissions] = useState(new Set());
  const [tenantRole, setTenantRole]   = useState(null);
  const [agentAccess, setAgentAccess] = useState({});
  const [screenPerms, setScreenPerms] = useState(new Map());
  const [loading, setLoading]         = useState(true);

  useEffect(() => {
    if (!userId || !tenantId) { setLoading(false); return; }

    setLoading(true);

    (async () => {
      const [{ data: memberRows }, { data: agents }, { data: screens }] = await Promise.all([
        supabase.from('tenant_members')
          .select('role')
          .eq('user_id', userId)
          .eq('tenant_id', tenantId)
          .limit(1),
        supabase.from('user_agent_access')
          // P-3 (onda 2): inclui agent_id para indexação canônica por slug do catálogo.
          // agent_name mantido para backward compat enquanto callers não migram.
          .select('agent_name, agent_id, can_invoke, can_view_history, can_approve_drafts')
          .eq('user_id', userId)
          .eq('tenant_id', tenantId),
        supabase.from('user_screen_permissions')
          .select('screen_id, allowed')
          .eq('user_id', userId)
          .eq('tenant_id', tenantId),
      ]);

      const role = pickTenantRole(memberRows);

      // Permissões finas (resource:action) continuam vindo de roles/
      // role_permissions — só a resolução do role_id mudou: em vez de
      // user_roles (órfã), busca pelo NOME do papel de tenant_members
      // dentro do MESMO tenant (roles.tenant_id + roles.name).
      let permSet = new Set();
      if (role) {
        const { data: roleRow } = await supabase
          .from('roles')
          .select('id')
          .eq('tenant_id', tenantId)
          .eq('name', role)
          .maybeSingle();
        if (roleRow?.id) {
          const { data: perms } = await supabase
            .from('role_permissions')
            .select('resource, action')
            .eq('role_id', roleRow.id);
          permSet = buildPermissionSet(perms);
        }
      }

      setPermissions(permSet);
      setTenantRole(role);
      setAgentAccess(buildAgentAccessMap(agents));
      setScreenPerms(buildScreenPermsMap(screens));
      setLoading(false);
    })();
  }, [userId, tenantId]);

  return {
    loading,
    agentAccess,
    can:             (resource, action) => resolveCan(permissions, resource, action),
    hasRole:         (name)             => resolveHasRole(tenantRole, name),
    canInvokeAgent:  (name)             => resolveCanInvokeAgent(agentAccess, name),
    canViewHistory:  (name)             => agentAccess[name]?.can_view_history   ?? false,
    canApproveDraft: (name)             => agentAccess[name]?.can_approve_drafts ?? false,
    canAccessScreen: (screenId)         => screenPerms.has(screenId) ? screenPerms.get(screenId) : null,
  };
}
