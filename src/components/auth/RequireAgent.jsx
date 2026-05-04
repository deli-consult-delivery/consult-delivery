import { usePermissions } from '../../hooks/usePermissions';
import AccessDenied from './AccessDenied';

/**
 * Renderiza children somente se o usuário tiver can_invoke no agente.
 *
 * Uso:
 *   <RequireAgent agentName="analista-ifood" userId={session.user.id}>
 *     <InvokeButton />
 *   </RequireAgent>
 *
 * Props:
 *   agentName — nome do agente no OpenClaw (ex: analista-ifood, deli)
 *   userId    — auth.users.id do usuário logado
 *   children  — conteúdo exibido se autorizado
 *   fallback  — elemento exibido se negado (padrão: <AccessDenied />)
 */
export default function RequireAgent({ agentName, userId, children, fallback }) {
  const { canInvokeAgent, loading } = usePermissions(userId);

  if (loading) return null;
  if (!canInvokeAgent(agentName)) {
    return fallback ?? (
      <AccessDenied message={`Você não tem acesso ao agente ${agentName}.`} />
    );
  }
  return children;
}
