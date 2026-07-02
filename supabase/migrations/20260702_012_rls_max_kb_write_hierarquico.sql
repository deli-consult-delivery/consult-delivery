-- Rota B 4b-2 — FECHAMENTO: max_knowledge_base.max_kb_write.
-- Última policy que ainda usava gate NÃO-correlacionado por tenant:
--   EXISTS(tenant_members role IN admin/owner/deli_owner LIMIT 1)  -> qualquer admin de QUALQUER tenant
--   podia escrever em QUALQUER linha (inclusive de outro tenant). Hoje só há 7 linhas globais
--   (tenant_id NULL), mas a policy deixava o ramo por-tenant aberto (buraco latente cross-tenant).
--
-- Reconciliação com a decisão documentada ("KB global é intencional", migration 011 linha 3):
--   * ramo GLOBAL (tenant_id NULL) = PRESERVADO IDÊNTICO — qualquer admin/owner/deli_owner mantém
--     escrita nas linhas globais compartilhadas (as 7 atuais não mudam de comportamento);
--   * ramo POR-TENANT (tenant_id NOT NULL) = agora correlacionado e hierárquico via
--     accessible_tenant_ids_with_role(): só admin/owner/deli_owner do próprio tenant ou de um
--     ancestral (agência sobre store) pode escrever. Fecha o vazamento de escrita cross-tenant.
--
-- Aditivo/reversível: substituição de policy; rollback = recriar a policy antiga (abaixo em comentário).
-- Nenhuma das 7 linhas globais tem acesso revogado.
BEGIN;

DROP POLICY IF EXISTS max_kb_write ON public.max_knowledge_base;

CREATE POLICY max_kb_write ON public.max_knowledge_base FOR ALL TO public
  USING (
    (tenant_id IS NULL AND EXISTS (
        SELECT 1 FROM public.tenant_members
         WHERE tenant_members.user_id = auth.uid()
           AND tenant_members.role = ANY (ARRAY['admin','owner','deli_owner'])))
    OR (tenant_id IS NOT NULL AND tenant_id IN (
        SELECT public.accessible_tenant_ids_with_role(ARRAY['admin','owner','deli_owner'])))
  )
  WITH CHECK (
    (tenant_id IS NULL AND EXISTS (
        SELECT 1 FROM public.tenant_members
         WHERE tenant_members.user_id = auth.uid()
           AND tenant_members.role = ANY (ARRAY['admin','owner','deli_owner'])))
    OR (tenant_id IS NOT NULL AND tenant_id IN (
        SELECT public.accessible_tenant_ids_with_role(ARRAY['admin','owner','deli_owner'])))
  );

COMMIT;

-- ROLLBACK (policy original global, não-correlacionada):
-- BEGIN;
-- DROP POLICY IF EXISTS max_kb_write ON public.max_knowledge_base;
-- CREATE POLICY max_kb_write ON public.max_knowledge_base FOR ALL TO public
--   USING (EXISTS ( SELECT 1 FROM tenant_members
--     WHERE tenant_members.user_id = auth.uid()
--       AND tenant_members.role = ANY (ARRAY['admin','owner','deli_owner']) LIMIT 1));
-- COMMIT;
