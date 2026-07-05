-- Rota B 4b-2 final: contact_optout usava `tenant_id = (SELECT ... tenant_members ... LIMIT 1)`
-- (mesmo padrão do bug LIMIT 1) -> hierárquico. Última policy de dados a converter.
-- max_knowledge_base.max_kb_write fica como gate GLOBAL (KB global, tenant_id NULL) — intencional, documentado.
BEGIN;
DROP POLICY IF EXISTS contact_optout_tenant_isolation ON public.contact_optout;
CREATE POLICY contact_optout_tenant_isolation ON public.contact_optout FOR ALL TO public
  USING (tenant_id IN ( SELECT public.accessible_tenant_ids() ));
COMMIT;
