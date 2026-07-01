-- Achado crítico da auditoria RBAC (QA go-live Karina, 2026-07-01): a policy
-- drafts_update_tenant permitia que QUALQUER membro do tenant (consultor,
-- operador, dev) aprovasse/rejeitasse drafts via UPDATE direto no Supabase
-- client, contornando o <RequireRole resource="approve_drafts"> da UI (que só
-- é enforced no frontend). Mantém edição livre de outros campos por qualquer
-- membro do tenant; restringe especificamente mudar status para
-- approved/rejected a admin/owner/deli_owner.
--
-- Já aplicada em produção via MCP Supabase em 2026-07-01. Este arquivo apenas
-- versiona o SQL para o histórico do repositório.

DROP POLICY IF EXISTS drafts_update_tenant ON public.agent_drafts;

CREATE POLICY drafts_update_tenant
  ON public.agent_drafts FOR UPDATE
  USING (
    tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid())
  )
  WITH CHECK (
    tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid())
    AND (
      status IS DISTINCT FROM 'approved' AND status IS DISTINCT FROM 'rejected'
      OR EXISTS (
        SELECT 1 FROM public.tenant_members
        WHERE user_id = auth.uid()
          AND tenant_id = agent_drafts.tenant_id
          AND role IN ('admin', 'owner', 'deli_owner')
      )
    )
  );
