import { usePermissions } from '../../hooks/usePermissions';
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

  // Override manual por tela tem prioridade sobre roles
  if (screenId) {
    const override = canAccessScreen(screenId);
    if (override === true)  return children;
    if (override === false) return fallback ?? <AccessDenied />;
    // null → sem registro, continua para verificação por role
  }

  const allowed = roles
    ? roles.some(r => hasRole(r))
    : can(resource, action);

  if (!allowed) return fallback ?? <AccessDenied />;
  return children;
}
