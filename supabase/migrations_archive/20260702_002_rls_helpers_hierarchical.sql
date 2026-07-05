-- Rota B, Etapa 4a (Opção 2): tornar is_member_of e is_admin_of HIERÁRQUICOS.
-- Converte as 92 policies que já os usam (70 is_member_of + 22 is_admin_of) sem tocar policy.
-- Confirmado: nenhuma outra FUNÇÃO os chama (só policies) -> mudança contida.
-- SPEC: docs/tenancy-rota-b-rls-hierarquica-spec.md · auditoria: docs/tenancy-rota-b-etapa3-auditoria.md
--
-- is_member_of: membro do tenant OU de um ancestral (desce pela árvore) -> agência vê stores.
-- is_admin_of : owner/admin do tenant OU de um ancestral -> agência gerencia stores.
-- Reversível: corpo antigo era pertencimento direto (ver rollback).

BEGIN;

CREATE OR REPLACE FUNCTION public.is_member_of(_tenant uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT _tenant IN (SELECT public.accessible_tenant_ids()); $$;

CREATE OR REPLACE FUNCTION public.is_admin_of(_tenant uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  WITH RECURSIVE adm AS (
    SELECT tenant_id AS id FROM public.tenant_members
     WHERE user_id = auth.uid() AND role IN ('owner','admin')
  ),
  tree AS (
    SELECT id FROM adm
    UNION
    SELECT t.id FROM public.tenants t JOIN tree ON t.parent_tenant_id = tree.id
  )
  SELECT _tenant IN (SELECT id FROM tree);
$$;

COMMIT;

-- ROLLBACK (restaura pertencimento direto):
-- CREATE OR REPLACE FUNCTION public.is_member_of(_tenant uuid) RETURNS boolean
--   LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
--   AS $$ select exists (select 1 from public.tenant_members tm where tm.tenant_id=_tenant and tm.user_id=auth.uid()); $$;
-- CREATE OR REPLACE FUNCTION public.is_admin_of(_tenant uuid) RETURNS boolean
--   LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
--   AS $$ select exists (select 1 from public.tenant_members tm where tm.tenant_id=_tenant and tm.user_id=auth.uid() and tm.role in ('owner','admin')); $$;
