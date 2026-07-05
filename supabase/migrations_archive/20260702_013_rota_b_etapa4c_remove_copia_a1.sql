-- Rota B — Etapa 4c: aposenta a cópia A1 (membros da agência replicados nos stores).
-- Pré-requisito cumprido: RLS 100% hierárquica (migration 20260702_002 a 012, PR #699) +
-- frontend (App.jsx/reloadTenants, ConsoleV2.jsx/useTenants) já usa listTenantsWithRole()
-- (lib/api.js) em vez de contar linhas de tenant_members.
--
-- O que é "cópia": uma linha tenant_members(tenant_id=S, user_id=U) é cópia SE existe também
-- uma linha tenant_members(tenant_id=parent(S), user_id=U) — ou seja, U chegou em S porque é
-- membro do pai de S (efeito dos triggers da migration 012), não porque foi adicionado
-- diretamente a S. Genérico para qualquer profundidade (platform→agency→store), sem
-- referenciar UUIDs específicos.
--
-- Validado nesta sessão (branch de teste, SQL ad-hoc, rollback): 33 de 37 linhas de
-- tenant_members batem nesse critério; as 4 remanescentes são membros genuínos (2 diretos
-- da agência "Consult Delivery", 2 diretos do store "Karina Doceria"). Ver status-report
-- consult-delivery-42.md para o output bruto completo (dry-run + matriz de isolamento).
--
-- Reversível: o DELETE é reversível reexecutando a propagação da migration 20260701_012
-- (ver bloco ROLLBACK no fim) — os triggers, se recriados, recopiam os membros da agência
-- para os stores na próxima vez que rodar o INSERT de propagação manual abaixo.

BEGIN;

DELETE FROM public.tenant_members tm
USING public.tenants t
WHERE tm.tenant_id = t.id
  AND t.parent_tenant_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.tenant_members tm2
    WHERE tm2.user_id = tm.user_id
      AND tm2.tenant_id = t.parent_tenant_id
  );

DROP TRIGGER IF EXISTS trg_tenant_inherit_parent_members ON public.tenants;
DROP TRIGGER IF EXISTS trg_tenant_member_propagate ON public.tenant_members;
DROP FUNCTION IF EXISTS public.tenant_inherit_parent_members();
DROP FUNCTION IF EXISTS public.tenant_member_propagate_to_children();

COMMIT;

-- ROLLBACK (recria a cópia A1 + os triggers automáticos da migration 012):
--
-- BEGIN;
-- CREATE OR REPLACE FUNCTION public.tenant_inherit_parent_members()
-- RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
-- BEGIN
--   IF NEW.parent_tenant_id IS NOT NULL THEN
--     INSERT INTO public.tenant_members (tenant_id, user_id, role, display_name)
--     SELECT NEW.id, m.user_id, m.role, m.display_name
--     FROM public.tenant_members m WHERE m.tenant_id = NEW.parent_tenant_id
--     ON CONFLICT (tenant_id, user_id) DO NOTHING;
--   END IF;
--   RETURN NEW;
-- END; $$;
-- CREATE TRIGGER trg_tenant_inherit_parent_members AFTER INSERT ON public.tenants
--   FOR EACH ROW EXECUTE FUNCTION public.tenant_inherit_parent_members();
--
-- CREATE OR REPLACE FUNCTION public.tenant_member_propagate_to_children()
-- RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
-- BEGIN
--   INSERT INTO public.tenant_members (tenant_id, user_id, role, display_name)
--   SELECT c.id, NEW.user_id, NEW.role, NEW.display_name
--   FROM public.tenants c WHERE c.parent_tenant_id = NEW.tenant_id
--   ON CONFLICT (tenant_id, user_id) DO NOTHING;
--   RETURN NEW;
-- END; $$;
-- CREATE TRIGGER trg_tenant_member_propagate AFTER INSERT ON public.tenant_members
--   FOR EACH ROW EXECUTE FUNCTION public.tenant_member_propagate_to_children();
--
-- -- Recopia retroativamente (reexecuta a propagação para o estado atual da árvore):
-- INSERT INTO public.tenant_members (tenant_id, user_id, role, display_name)
-- SELECT c.id, m.user_id, m.role, m.display_name
-- FROM public.tenant_members m
-- JOIN public.tenants c ON c.parent_tenant_id = m.tenant_id
-- ON CONFLICT (tenant_id, user_id) DO NOTHING;
-- COMMIT;
