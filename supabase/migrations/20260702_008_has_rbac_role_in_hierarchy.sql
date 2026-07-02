-- Rota B 4b-2 (grupo Z, helper): RBAC hierárquico. Decisão Wandson 2026-07-02: RBAC DESCE.
-- Retorna true se o usuário tem um dos papéis RBAC (user_roles/roles.name) em _tenant OU num ancestral.
-- Usado pelas policies Z (tarefa_*, prospect_*, avaliacao_config, tarefas_loja, templates_tarefa...),
-- preservando a branch loja_consultores (atribuição direta) intacta.
-- Aditivo. Teste: agência admin desce ao store (true); role ausente false; lojista não sobe (false).

BEGIN;
CREATE OR REPLACE FUNCTION public.has_rbac_role_in_hierarchy(_tenant uuid, _role_names text[])
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  WITH RECURSIVE anc AS (
    SELECT _tenant AS id
    UNION
    SELECT t.parent_tenant_id FROM public.tenants t JOIN anc ON t.id = anc.id
      WHERE t.parent_tenant_id IS NOT NULL
  )
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.user_id = auth.uid()
      AND r.name = ANY(_role_names)
      AND r.tenant_id IN (SELECT id FROM anc)
  );
$$;
COMMIT;

-- ROLLBACK: DROP FUNCTION IF EXISTS public.has_rbac_role_in_hierarchy(uuid, text[]);
