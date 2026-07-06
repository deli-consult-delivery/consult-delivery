-- 20260706_010_fix_user_agent_access_tenant_scope.sql
-- Fecha brecha de isolamento em `user_agent_access` (QA C2 parte B, achado
-- de isolamento #2). Read-only proof antes deste fix:
--
-- SELECT proname, prosrc FROM pg_proc WHERE proname = 'same_tenant_admin';
--   same_tenant_admin(_target) := EXISTS (
--     SELECT 1 FROM tenant_members alvo
--     JOIN tenant_members adm ON adm.tenant_id = alvo.tenant_id
--     WHERE alvo.user_id = _target AND adm.user_id = auth.uid()
--       AND adm.role IN ('owner','admin'));
--
-- Essa função checa só se o admin COMPARTILHA ALGUM tenant com o usuário-alvo
-- -- ela nunca correlaciona com o `tenant_id` da PRÓPRIA linha de
-- `user_agent_access` que a policy está protegendo. `user_agent_access` TEM
-- coluna `tenant_id` própria (confirmado via information_schema.columns).
--
-- Cenário de vazamento: usuário U é membro dos tenants A e B. Admin ADM é
-- admin só do tenant A. Existe uma linha `user_agent_access` de U com
-- `tenant_id = B` (grant do tenant B, sem relação com A). A policy atual
-- (`user_agent_access_manage_admin`, qual = `same_tenant_admin(user_id)`)
-- avalia `same_tenant_admin(U)` = TRUE (via tenant A, onde ADM É admin) e
-- deixa ADM ler/gerenciar essa linha do tenant B -- fora do escopo dele.
--
-- Contagem de exposição hoje (read-only, MCP Supabase):
--   SELECT count(*) FROM user_agent_access uaa
--   WHERE EXISTS (
--     SELECT 1 FROM tenant_members tm1 WHERE tm1.user_id = uaa.user_id
--   )
--   GROUP BY uaa.user_id HAVING count(DISTINCT ...) -- ver report para o
--   número real de usuários multi-tenant hoje (0 no momento da auditoria —
--   sem exploit ativo, mas a policy está incorreta e vira exploit assim que
--   um usuário existir em 2+ tenants).
--
-- Fix: reescreve a policy pra correlacionar EXPLICITAMENTE com
-- `user_agent_access.tenant_id` dos dois lados (admin precisa ser
-- owner/admin NESSE tenant_id específico da linha; e o usuário-alvo precisa
-- ser membro DESSE MESMO tenant_id) -- não reusa `same_tenant_admin()`
-- (função genérica usada em outros lugares, alterar o corpo dela teria raio
-- de impacto maior que o necessário aqui).

DROP POLICY IF EXISTS user_agent_access_manage_admin ON public.user_agent_access;

CREATE POLICY user_agent_access_manage_admin ON public.user_agent_access
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.tenant_members adm
    WHERE adm.user_id = auth.uid()
      AND adm.tenant_id = user_agent_access.tenant_id
      AND adm.role IN ('owner', 'admin')
  )
  AND EXISTS (
    SELECT 1 FROM public.tenant_members alvo
    WHERE alvo.user_id = user_agent_access.user_id
      AND alvo.tenant_id = user_agent_access.tenant_id
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.tenant_members adm
    WHERE adm.user_id = auth.uid()
      AND adm.tenant_id = user_agent_access.tenant_id
      AND adm.role IN ('owner', 'admin')
  )
  AND EXISTS (
    SELECT 1 FROM public.tenant_members alvo
    WHERE alvo.user_id = user_agent_access.user_id
      AND alvo.tenant_id = user_agent_access.tenant_id
  )
);

-- Nota sobre `notificacoes` (achado de isolamento #1, docs/qa/RESULTADO-QA-C2-parte-b.md):
-- Investigação mais profunda mostrou que a policy `internal_notifications_select`
-- JÁ fecha esse buraco corretamente a nível de RLS:
--   (recipient_user_id = auth.uid())
--   OR (recipient_user_id IS NULL AND tenant_id IN (SELECT accessible_tenant_ids()))
-- RLS está habilitado (relrowsecurity=true) na tabela. O gap que reportei
-- originalmente era só no app (`src/lib/api.js listNotifications` não filtra
-- por `recipient_user_id`) -- mas como o client Supabase usa a role
-- `authenticated` (sujeita a RLS, não bypassa), o Postgres já barra
-- notificações de outro usuário mesmo que o app não peça o filtro
-- explicitamente. NÃO há migration necessária aqui -- adicionar o filtro no
-- app seria só defesa em profundidade / eficiência de query (evita
-- buscar linhas que o RLS vai descartar de qualquer forma), não uma
-- correção de segurança ativa.
