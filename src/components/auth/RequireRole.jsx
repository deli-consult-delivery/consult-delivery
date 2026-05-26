import { usePermissions } from '../../hooks/usePermissions';
import AccessDenied from './AccessDenied';

/**
 * Renderiza children somente se o usuário tiver a permissão ou role necessária.
 *
 * Por role name (array):
 *   <RequireRole roles={['admin', 'marketing']} userId={id}>
 *
 * Por permissão resource+action:
 *   <RequireRole resource="financeiro" action="view" userId={id}>
 */
export default function RequireRole({ resource, action, roles, userId, children, fallback }) {
  const { can, hasRole, loading } = usePermissions(userId);

  if (loading) return null;

  const allowed = roles
    ? roles.some(r => hasRole(r))
    : can(resource, action);

  if (!allowed) return fallback ?? <AccessDenied />;
  return children;
}
