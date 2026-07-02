-- Rota B, Etapa 4b-2 (helper): versão role-filtrada de accessible_tenant_ids.
-- Descendentes dos tenants onde o usuário tem UM dos roles dados. Usada pelas policies
-- de GESTÃO role-filtradas (mantém o gate de role, mas descendo a hierarquia).
-- Aditivo. Teste: agência (admin) desce a 19; role ausente -> 0.

BEGIN;
CREATE OR REPLACE FUNCTION public.accessible_tenant_ids_with_role(_roles text[])
RETURNS setof uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  WITH RECURSIVE seed AS (
    SELECT tenant_id AS id FROM public.tenant_members
     WHERE user_id = auth.uid() AND role = ANY(_roles)
  ),
  tree AS (
    SELECT id FROM seed
    UNION
    SELECT t.id FROM public.tenants t JOIN tree ON t.parent_tenant_id = tree.id
  )
  SELECT id FROM tree;
$$;
COMMIT;

-- ROLLBACK: DROP FUNCTION IF EXISTS public.accessible_tenant_ids_with_role(text[]);
