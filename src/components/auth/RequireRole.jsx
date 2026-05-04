import { usePermissions } from '../../hooks/usePermissions';
import AccessDenied from './AccessDenied';

/**
 * Renderiza children somente se o usuário tiver a permissão resource+action.
 *
 * Uso:
 *   <RequireRole resource="financeiro" action="view" userId={session.user.id}>
 *     <CoraScreen />
 *   </RequireRole>
 *
 * Props:
 *   resource  — recurso protegido (ex: financeiro, kanban, reports)
 *   action    — ação requerida (view, create, edit, delete, execute, approve)
 *   userId    — auth.users.id do usuário logado
 *   children  — conteúdo exibido se autorizado
 *   fallback  — elemento exibido se negado (padrão: <AccessDenied />)
 */
export default function RequireRole({ resource, action, userId, children, fallback }) {
  const { can, loading } = usePermissions(userId);

  if (loading) return null;
  if (!can(resource, action)) return fallback ?? <AccessDenied />;
  return children;
}
