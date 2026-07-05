-- Tenancy: automatizar a "cópia A1" de membros pela hierarquia (Rota A).
-- Problema: RLS é FLAT (is_member_of / subquery inline em tenant_members). Para a agência
-- enxergar os stores, a Fase 1b copiou manualmente os membros da agência em cada store.
-- Isso vira dívida de manutenção: todo store novo / membro novo exige recópia manual.
--
-- Solução (sem tocar nenhuma das 336 policies): 2 triggers que mantêm a cópia sozinhos.
--   1) ao criar um tenant com pai  -> herda os membros do pai
--   2) ao adicionar membro num tenant -> propaga aos filhos diretos
-- Regra simétrica "membro de T -> membro dos filhos diretos de T". Cascateia sozinha
-- (platform->agency->store) porque cada insert dispara o trigger de novo; para nas folhas.
-- Árvore acíclica garantida por validate_tenant_hierarchy => sem loop infinito.
--
-- Aditivo e reversível (rollback no fim). Idempotente.

BEGIN;

-- 1) novo tenant herda os membros do pai
CREATE OR REPLACE FUNCTION public.tenant_inherit_parent_members()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.parent_tenant_id IS NOT NULL THEN
    INSERT INTO public.tenant_members (tenant_id, user_id, role, display_name)
    SELECT NEW.id, m.user_id, m.role, m.display_name
    FROM public.tenant_members m
    WHERE m.tenant_id = NEW.parent_tenant_id
    ON CONFLICT (tenant_id, user_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tenant_inherit_parent_members ON public.tenants;
CREATE TRIGGER trg_tenant_inherit_parent_members
  AFTER INSERT ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.tenant_inherit_parent_members();

-- 2) membro novo num tenant propaga aos filhos diretos (cascateia até as folhas)
CREATE OR REPLACE FUNCTION public.tenant_member_propagate_to_children()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.tenant_members (tenant_id, user_id, role, display_name)
  SELECT c.id, NEW.user_id, NEW.role, NEW.display_name
  FROM public.tenants c
  WHERE c.parent_tenant_id = NEW.tenant_id
  ON CONFLICT (tenant_id, user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tenant_member_propagate ON public.tenant_members;
CREATE TRIGGER trg_tenant_member_propagate
  AFTER INSERT ON public.tenant_members
  FOR EACH ROW EXECUTE FUNCTION public.tenant_member_propagate_to_children();

COMMIT;

-- ROLLBACK (se preciso desfazer — não remove membros já copiados, só para de copiar):
-- DROP TRIGGER IF EXISTS trg_tenant_inherit_parent_members ON public.tenants;
-- DROP TRIGGER IF EXISTS trg_tenant_member_propagate ON public.tenant_members;
-- DROP FUNCTION IF EXISTS public.tenant_inherit_parent_members();
-- DROP FUNCTION IF EXISTS public.tenant_member_propagate_to_children();
