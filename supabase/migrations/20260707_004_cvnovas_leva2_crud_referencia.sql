-- CvNovas leva 2: habilita CRUD real (INSERT/UPDATE/DELETE) para as telas de
-- referência (Provedores de IA, Integrações, Sistemas externos), que hoje só
-- têm SELECT. Aditivo e reversível — adiciona created_by (mesmo padrão das
-- demais tabelas tenant_* já com CRUD: tenant_gatilhos/topicos/tarefas/links/
-- files) e as policies de escrita faltantes, sem alterar dado existente.
--
-- NÃO aplicar aqui — a orquestradora aplica via MCP/CLI.

ALTER TABLE public.tenant_provedores ADD COLUMN IF NOT EXISTS created_by uuid;
ALTER TABLE public.tenant_integracoes ADD COLUMN IF NOT EXISTS created_by uuid;
ALTER TABLE public.tenant_sistemas ADD COLUMN IF NOT EXISTS created_by uuid;

CREATE POLICY "tenant_provedores_insert" ON public.tenant_provedores FOR INSERT WITH CHECK (public.is_member_of(tenant_id));
CREATE POLICY "tenant_provedores_update" ON public.tenant_provedores FOR UPDATE USING (public.is_member_of(tenant_id)) WITH CHECK (public.is_member_of(tenant_id));
CREATE POLICY "tenant_provedores_delete" ON public.tenant_provedores FOR DELETE USING (public.is_member_of(tenant_id));

CREATE POLICY "tenant_integracoes_insert" ON public.tenant_integracoes FOR INSERT WITH CHECK (public.is_member_of(tenant_id));
CREATE POLICY "tenant_integracoes_update" ON public.tenant_integracoes FOR UPDATE USING (public.is_member_of(tenant_id)) WITH CHECK (public.is_member_of(tenant_id));
CREATE POLICY "tenant_integracoes_delete" ON public.tenant_integracoes FOR DELETE USING (public.is_member_of(tenant_id));

CREATE POLICY "tenant_sistemas_insert" ON public.tenant_sistemas FOR INSERT WITH CHECK (public.is_member_of(tenant_id));
CREATE POLICY "tenant_sistemas_update" ON public.tenant_sistemas FOR UPDATE USING (public.is_member_of(tenant_id)) WITH CHECK (public.is_member_of(tenant_id));
CREATE POLICY "tenant_sistemas_delete" ON public.tenant_sistemas FOR DELETE USING (public.is_member_of(tenant_id));

-- ROLLBACK (reversível):
-- DROP POLICY IF EXISTS "tenant_provedores_insert" ON public.tenant_provedores;
-- DROP POLICY IF EXISTS "tenant_provedores_update" ON public.tenant_provedores;
-- DROP POLICY IF EXISTS "tenant_provedores_delete" ON public.tenant_provedores;
-- DROP POLICY IF EXISTS "tenant_integracoes_insert" ON public.tenant_integracoes;
-- DROP POLICY IF EXISTS "tenant_integracoes_update" ON public.tenant_integracoes;
-- DROP POLICY IF EXISTS "tenant_integracoes_delete" ON public.tenant_integracoes;
-- DROP POLICY IF EXISTS "tenant_sistemas_insert" ON public.tenant_sistemas;
-- DROP POLICY IF EXISTS "tenant_sistemas_update" ON public.tenant_sistemas;
-- DROP POLICY IF EXISTS "tenant_sistemas_delete" ON public.tenant_sistemas;
-- ALTER TABLE public.tenant_provedores DROP COLUMN IF EXISTS created_by;
-- ALTER TABLE public.tenant_integracoes DROP COLUMN IF EXISTS created_by;
-- ALTER TABLE public.tenant_sistemas DROP COLUMN IF EXISTS created_by;
