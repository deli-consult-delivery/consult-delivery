import { usePermissions } from '../../hooks/usePermissions';
import { resolveRequireRoleAccess } from '../../hooks/permissions-derive.js';
import AccessDenied from './AccessDenied';

/**
 * Renderiza children somente se o usuário tiver a permissão ou role necessária.
 *
 * Ordem de avaliação:
 *   1. Se screenId for fornecido, consulta user_screen_permissions (override manual):
 *      - true  → libera (independente de role)
 *      - false → nega (independente de role)
 *      - null  → sem registro, cai na verificação de role/resource abaixo
 *   2. Por role name (array):  <RequireRole roles={['admin']} screenId="agents" ...>
 *   3. Por permissão resource+action: <RequireRole resource="financeiro" action="view" ...>
 */
export default function RequireRole({ resource, action, roles, userId, tenantId, screenId, children, fallback }) {
  const { can, hasRole, canAccessScreen, loading } = usePermissions(userId, tenantId);

  if (loading) return null;

  const screenOverride = screenId ? canAccessScreen(screenId) : null;
  const allowed = resolveRequireRoleAccess({ screenOverride, roles, resource, action, hasRole, can });

  if (!allowed) return fallback ?? <AccessDenied />;
  return children;
}
