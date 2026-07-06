-- Permite que usuários autenticados vejam runs de agentes globais (tenant_id IS NULL)
-- Necessário para agentes como bom-dia que não são por-tenant

CREATE POLICY "authenticated_view_global_runs"
  ON agent_runs FOR SELECT
  USING (auth.uid() IS NOT NULL AND tenant_id IS NULL);
