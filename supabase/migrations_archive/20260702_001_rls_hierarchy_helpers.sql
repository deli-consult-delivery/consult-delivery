-- Rota B, Etapa 2: helpers de acesso hierárquico. Funções NOVAS, ainda não usadas
-- por nenhuma policy -> aditivo, risco zero. As policies passam a chamá-las nas etapas seguintes.
-- SPEC: docs/tenancy-rota-b-rls-hierarquica-spec.md
--
-- accessible_tenant_ids(): tenants do usuário + TODOS os descendentes (desce parent_tenant_id).
--   Agência enxerga stores; store não alcança agência/irmãos. Árvore acíclica (validate_tenant_hierarchy)
--   => recursão termina. STABLE => avaliada 1x por query.

BEGIN;

CREATE OR REPLACE FUNCTION public.accessible_tenant_ids()
RETURNS setof uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  WITH RECURSIVE mine AS (
    SELECT tenant_id AS id FROM public.tenant_members WHERE user_id = auth.uid()
  ),
  tree AS (
    SELECT id FROM mine
    UNION
    SELECT t.id FROM public.tenants t JOIN tree ON t.parent_tenant_id = tree.id
  )
  SELECT id FROM tree;
$$;

CREATE OR REPLACE FUNCTION public.has_tenant_access(_tenant uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT _tenant IN (SELECT public.accessible_tenant_ids()); $$;

COMMIT;

-- ROLLBACK:
-- DROP FUNCTION IF EXISTS public.has_tenant_access(uuid);
-- DROP FUNCTION IF EXISTS public.accessible_tenant_ids();
