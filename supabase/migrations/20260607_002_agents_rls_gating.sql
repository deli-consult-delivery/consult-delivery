-- ============================================================
-- FASE 2 onda 1 · Migration 2/5 — RLS de agents: gating via tenant_agents
-- Corrige DUAS brechas confirmadas ao vivo (2026-06-06):
--   (a) agents_read_all: USING true — qualquer autenticado lê todos
--   (b) agents_tenant_isolation: FOR ALL sem WITH CHECK e com
--       "tenant_id IS NULL OR …" — qualquer membro pode INSERIR/ALTERAR
--       agentes GLOBAIS (vulnerabilidade de escrita!)
-- ⚠️ APLICAR DEPOIS da 001 (tenant_agents populado).
-- service_role (Trigger.dev/Bridge) bypassa RLS — não é afetado.
-- Catálogo global (tenant_id IS NULL) passa a ser gerido só por
-- migrations/service_role.
-- ============================================================

-- Helper SECURITY DEFINER (espelha is_member_of/is_admin_of já existentes;
-- evita recursão de RLS na subquery de tenant_agents)
CREATE OR REPLACE FUNCTION public.agent_enabled_for_user(_agent text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM tenant_agents ta
    JOIN tenant_members tm ON tm.tenant_id = ta.tenant_id
    WHERE ta.agent_id = _agent
      AND ta.enabled
      AND tm.user_id = auth.uid()
  );
$$;

DROP POLICY IF EXISTS agents_read_all ON public.agents;
DROP POLICY IF EXISTS agents_tenant_isolation ON public.agents;

-- Leitura: agente custom do meu tenant OU agente habilitado p/ meu tenant
CREATE POLICY agents_select_gated ON public.agents
FOR SELECT TO authenticated
USING (
  (is_custom AND tenant_id IS NOT NULL AND public.is_member_of(tenant_id))
  OR public.agent_enabled_for_user(id)
);

-- Escrita: só admin do tenant, só agentes custom do próprio tenant
CREATE POLICY agents_insert_admin_custom ON public.agents
FOR INSERT TO authenticated
WITH CHECK (is_custom AND tenant_id IS NOT NULL AND public.is_admin_of(tenant_id));

CREATE POLICY agents_update_admin_custom ON public.agents
FOR UPDATE TO authenticated
USING (is_custom AND tenant_id IS NOT NULL AND public.is_admin_of(tenant_id))
WITH CHECK (is_custom AND tenant_id IS NOT NULL AND public.is_admin_of(tenant_id));

CREATE POLICY agents_delete_admin_custom ON public.agents
FOR DELETE TO authenticated
USING (is_custom AND tenant_id IS NOT NULL AND public.is_admin_of(tenant_id));

-- Validação pós-aplicação (logado como Wandson, esperado: 15):
-- SELECT count(*) FROM agents;
-- E tentar UPDATE em agente global como authenticated → deve falhar.
