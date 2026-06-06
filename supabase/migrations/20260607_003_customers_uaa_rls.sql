-- ============================================================
-- FASE 2 onda 1 · Migration 3/5 — customers + user_agent_access
-- Corrige as 2 policies permissivas restantes (DDL confirmado ao vivo):
--   (a) customers_auth_all: USING true / CHECK true — qualquer autenticado
--       lê/escreve TODOS os 1169 customers → remover; customers_member_all
--       (is_member_of) permanece como caminho único p/ authenticated.
--   (b) user_agent_access_manage_admin: admin de QUALQUER tenant gerencia
--       qualquer grant → escopar para "admin de um tenant do usuário-alvo".
-- service_role (webhooks Evolution etc.) bypassa RLS — inalterado.
-- ============================================================

-- (a) customers
DROP POLICY IF EXISTS customers_auth_all ON public.customers;

-- (b) user_agent_access — helper SECURITY DEFINER
CREATE OR REPLACE FUNCTION public.same_tenant_admin(_target uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM tenant_members alvo
    JOIN tenant_members adm ON adm.tenant_id = alvo.tenant_id
    WHERE alvo.user_id = _target
      AND adm.user_id = auth.uid()
      AND adm.role IN ('owner','admin')
  );
$$;

DROP POLICY IF EXISTS user_agent_access_manage_admin ON public.user_agent_access;

CREATE POLICY user_agent_access_manage_admin ON public.user_agent_access
FOR ALL TO authenticated
USING (public.same_tenant_admin(user_id))
WITH CHECK (public.same_tenant_admin(user_id));
-- (user_agent_access_self permanece — leitura dos próprios grants)

-- Validação pós-aplicação:
-- Como Wandson (admin consult): SELECT count(*) FROM customers; → 1169 (via member_all)
-- Como usuário sem tenant: → 0
