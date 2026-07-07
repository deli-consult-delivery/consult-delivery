-- 20260707_010_revoke_is_pending_tenant_member_from_public.sql
-- Achado da auditoria SECURITY DEFINER rodada 2 (docs/seguranca/security-definer-audit.md):
-- is_pending_tenant_member(uuid, text) (migration 20260707_007) foi criada
-- de proposito SEM checagem de auth.uid() -- o comentario original ja
-- explica que o gate de "quem pode chamar" seria feito na rota do bridge
-- (POST /users/resend-invite), que valida o CALLER antes de invocar esta
-- RPC via service key.
--
-- O problema: toda funcao SQL nova recebe GRANT EXECUTE TO PUBLIC por
-- default no Postgres/Supabase, a menos que seja revogado explicitamente.
-- Como esta funcao SO deveria ser chamada pelo bridge (service_role), o
-- GRANT default pra PUBLIC/anon/authenticated deixava qualquer chamada
-- anonima direta via PostgREST (/rest/v1/rpc/is_pending_tenant_member)
-- enumerar convites pendentes de qualquer tenant/e-mail, sem login --
-- CRITICO. JA CORRIGIDO EM PRODUCAO PELA ORQUESTRADORA (hotfix aplicado
-- antes desta migration versionada); esta migration formaliza o fix em git.
--
-- Aditivo/reversivel (REVOKE/GRANT sao idempotentes -- rodar de novo nao
-- muda nada). Rollback: GRANT EXECUTE ON FUNCTION
-- public.is_pending_tenant_member(uuid, text) TO PUBLIC;
--
-- APLICADA PELA ORQUESTRADORA (hotfix em prod, confirmado: so
-- postgres/service_role tem EXECUTE agora).

REVOKE ALL ON FUNCTION public.is_pending_tenant_member(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_pending_tenant_member(uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.is_pending_tenant_member(uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.is_pending_tenant_member(uuid, text) TO service_role;
