// src/hooks/permissions-derive.js — funções PURAS de derivação usadas por
// usePermissions.js. Isoladas num arquivo sem import de react/supabase pra
// ficarem testáveis em Node puro (usePermissions.test.js) — importar o hook
// direto puxa src/lib/supabase.js, que lança se faltar VITE_SUPABASE_URL/
// VITE_SUPABASE_ANON_KEY no ambiente (o caso de um test runner sem .env.local).

// A fonte de verdade do papel do usuário NO TENANT ATUAL é tenant_members.role
// (mesma tabela que a RLS usa via accessible_tenant_ids_with_role — ver
// docs/seguranca/rbac-tenant-sync.md). Sem linha em tenant_members pra esse
// (user_id, tenant_id) → null, nunca "algum papel de qualquer tenant".
export function pickTenantRole(memberRows) {
  return memberRows?.[0]?.role ?? null;
}

export function buildPermissionSet(perms) {
  return new Set((perms ?? []).map(p => `${p.resource}:${p.action}`));
}

// P-3: indexa por agent_id (slug canônico) E por agent_name (legado).
// Callers existentes usando agent_name continuam funcionando.
// Novos callers devem usar agent_id (ex: 'analise-ifood' em vez de 'analista-ifood').
export function buildAgentAccessMap(agents) {
  const agentMap = {};
  (agents ?? []).forEach(a => {
    if (a.agent_id)   agentMap[a.agent_id]   = a;
    if (a.agent_name) agentMap[a.agent_name] = a;
  });
  return agentMap;
}

export function buildScreenPermsMap(screens) {
  const screenMap = new Map();
  (screens ?? []).forEach(s => screenMap.set(s.screen_id, s.allowed));
  return screenMap;
}

// Espelham 1:1 os one-liners que usePermissions.js expõe como hasRole/can/
// canInvokeAgent — extraídos pra cá pra não haver duas implementações (uma
// testada, outra rodando de verdade) que possam divergir com o tempo.
export function resolveHasRole(tenantRole, name) {
  return tenantRole === name;
}

export function resolveCan(permissionSet, resource, action) {
  return permissionSet.has(`${resource}:${action}`);
}

export function resolveCanInvokeAgent(agentAccessMap, name) {
  return agentAccessMap[name]?.can_invoke ?? false;
}

// Árvore de decisão do <RequireRole> (fora do componente pra testar sem
// jsdom/react-test-renderer — chamar o componente como função quebra por
// causa do hook usePermissions lá dentro, que exige um dispatcher de render).
// Prioridade: override manual de tela > roles (array, OR) > resource+action.
export function resolveRequireRoleAccess({ screenOverride, roles, resource, action, hasRole, can }) {
  if (screenOverride === true)  return true;
  if (screenOverride === false) return false;
  return roles ? roles.some(r => hasRole(r)) : can(resource, action);
}
