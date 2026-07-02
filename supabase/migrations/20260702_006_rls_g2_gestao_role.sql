-- Rota B 4b-2 G2: gestão role-simples -> accessible_tenant_ids_with_role. Atômico.
-- Converte 22 policies cujo gate de acesso é EXATAMENTE
--   <COL> IN ( SELECT tenant_id FROM tenant_membership WHERE user_id=auth.uid() AND role <op> <roleset> )   [gate original]
-- (com wrappers/condições extras preservados) para o helper hierárquico
--   ( SELECT public.accessible_tenant_ids_with_role(ARRAY[<roles>]::text[]) )
-- que retorna os descendentes dos tenants onde o user tem um dos roles.
-- G3 (complexas: EXISTS correlacionado/global, composto com status) NÃO entram aqui.
BEGIN;

-- 1. audit_log.audit_log_select_admin
DROP POLICY IF EXISTS "audit_log_select_admin" ON public.audit_log;
CREATE POLICY "audit_log_select_admin" ON public.audit_log
  AS PERMISSIVE FOR SELECT TO public
  USING (tenant_id IN ( SELECT public.accessible_tenant_ids_with_role(ARRAY['admin']::text[]) ));

-- 2. bom_dia_config.bom_dia_config_insert_admin_marketing
DROP POLICY IF EXISTS "bom_dia_config_insert_admin_marketing" ON public.bom_dia_config;
CREATE POLICY "bom_dia_config_insert_admin_marketing" ON public.bom_dia_config
  AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (tenant_id IN ( SELECT public.accessible_tenant_ids_with_role(ARRAY['admin','marketing']::text[]) ));

-- 3. bom_dia_config.bom_dia_config_update_admin_marketing
DROP POLICY IF EXISTS "bom_dia_config_update_admin_marketing" ON public.bom_dia_config;
CREATE POLICY "bom_dia_config_update_admin_marketing" ON public.bom_dia_config
  AS PERMISSIVE FOR UPDATE TO public
  USING (tenant_id IN ( SELECT public.accessible_tenant_ids_with_role(ARRAY['admin','marketing']::text[]) ));

-- 4. bot_configs."admin and dev can write bot_config"
DROP POLICY IF EXISTS "admin and dev can write bot_config" ON public.bot_configs;
CREATE POLICY "admin and dev can write bot_config" ON public.bot_configs
  AS PERMISSIVE FOR ALL TO public
  USING (tenant_id IN ( SELECT public.accessible_tenant_ids_with_role(ARRAY['admin','dev']::text[]) ))
  WITH CHECK (tenant_id IN ( SELECT public.accessible_tenant_ids_with_role(ARRAY['admin','dev']::text[]) ));

-- 5. client_facts.client_facts_delete_admin
DROP POLICY IF EXISTS "client_facts_delete_admin" ON public.client_facts;
CREATE POLICY "client_facts_delete_admin" ON public.client_facts
  AS PERMISSIVE FOR DELETE TO public
  USING (tenant_id IN ( SELECT public.accessible_tenant_ids_with_role(ARRAY['admin']::text[]) ));

-- 6. conversations.conversations_delete_admin
DROP POLICY IF EXISTS "conversations_delete_admin" ON public.conversations;
CREATE POLICY "conversations_delete_admin" ON public.conversations
  AS PERMISSIVE FOR DELETE TO public
  USING (tenant_id IN ( SELECT public.accessible_tenant_ids_with_role(ARRAY['admin']::text[]) ));

-- 7. deli_pending_approvals.deli_approvals_update_deli_owner
DROP POLICY IF EXISTS "deli_approvals_update_deli_owner" ON public.deli_pending_approvals;
CREATE POLICY "deli_approvals_update_deli_owner" ON public.deli_pending_approvals
  AS PERMISSIVE FOR UPDATE TO public
  USING (tenant_id IN ( SELECT public.accessible_tenant_ids_with_role(ARRAY['admin','deli_owner']::text[]) ));

-- 8. deli_triggers.deli_triggers_manage_admin
DROP POLICY IF EXISTS "deli_triggers_manage_admin" ON public.deli_triggers;
CREATE POLICY "deli_triggers_manage_admin" ON public.deli_triggers
  AS PERMISSIVE FOR ALL TO public
  USING (tenant_id IN ( SELECT public.accessible_tenant_ids_with_role(ARRAY['admin']::text[]) ));

-- 9. encerramento_config.encerramento_config_insert_admin_marketing
DROP POLICY IF EXISTS "encerramento_config_insert_admin_marketing" ON public.encerramento_config;
CREATE POLICY "encerramento_config_insert_admin_marketing" ON public.encerramento_config
  AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (tenant_id IN ( SELECT public.accessible_tenant_ids_with_role(ARRAY['admin','marketing']::text[]) ));

-- 10. encerramento_config.encerramento_config_update_admin_marketing
DROP POLICY IF EXISTS "encerramento_config_update_admin_marketing" ON public.encerramento_config;
CREATE POLICY "encerramento_config_update_admin_marketing" ON public.encerramento_config
  AS PERMISSIVE FOR UPDATE TO public
  USING (tenant_id IN ( SELECT public.accessible_tenant_ids_with_role(ARRAY['admin','marketing']::text[]) ));

-- 11. loja_metricas.loja_metricas_delete_admin
DROP POLICY IF EXISTS "loja_metricas_delete_admin" ON public.loja_metricas;
CREATE POLICY "loja_metricas_delete_admin" ON public.loja_metricas
  AS PERMISSIVE FOR DELETE TO public
  USING (tenant_id IN ( SELECT public.accessible_tenant_ids_with_role(ARRAY['admin']::text[]) ));

-- 12. lojas.lojas_delete_admin
DROP POLICY IF EXISTS "lojas_delete_admin" ON public.lojas;
CREATE POLICY "lojas_delete_admin" ON public.lojas
  AS PERMISSIVE FOR DELETE TO public
  USING (tenant_id IN ( SELECT public.accessible_tenant_ids_with_role(ARRAY['admin']::text[]) ));

-- 13. prospects.prospects_select_tenant_roles
DROP POLICY IF EXISTS "prospects_select_tenant_roles" ON public.prospects;
CREATE POLICY "prospects_select_tenant_roles" ON public.prospects
  AS PERMISSIVE FOR SELECT TO public
  USING (tenant_id IN ( SELECT public.accessible_tenant_ids_with_role(ARRAY['admin','marketing','dev','viewer']::text[]) ));

-- 14. prospects.prospects_write_tenant_roles
DROP POLICY IF EXISTS "prospects_write_tenant_roles" ON public.prospects;
CREATE POLICY "prospects_write_tenant_roles" ON public.prospects
  AS PERMISSIVE FOR ALL TO public
  USING (tenant_id IN ( SELECT public.accessible_tenant_ids_with_role(ARRAY['admin','marketing','dev']::text[]) ))
  WITH CHECK (tenant_id IN ( SELECT public.accessible_tenant_ids_with_role(ARRAY['admin','marketing','dev']::text[]) ));

-- 15. roles.roles_delete_admin  (wrapper: is_system = false AND ...)
DROP POLICY IF EXISTS "roles_delete_admin" ON public.roles;
CREATE POLICY "roles_delete_admin" ON public.roles
  AS PERMISSIVE FOR DELETE TO public
  USING ((is_system = false) AND (tenant_id IN ( SELECT public.accessible_tenant_ids_with_role(ARRAY['admin']::text[]) )));

-- 16. roles.roles_insert_admin
DROP POLICY IF EXISTS "roles_insert_admin" ON public.roles;
CREATE POLICY "roles_insert_admin" ON public.roles
  AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (tenant_id IN ( SELECT public.accessible_tenant_ids_with_role(ARRAY['admin']::text[]) ));

-- 17. roles.roles_update_admin
DROP POLICY IF EXISTS "roles_update_admin" ON public.roles;
CREATE POLICY "roles_update_admin" ON public.roles
  AS PERMISSIVE FOR UPDATE TO public
  USING (tenant_id IN ( SELECT public.accessible_tenant_ids_with_role(ARRAY['admin']::text[]) ));

-- 18. tarefa_anexos.deletar_anexos_tenant  (wrapper: uploaded_by = auth.uid() OR ...)
DROP POLICY IF EXISTS "deletar_anexos_tenant" ON public.tarefa_anexos;
CREATE POLICY "deletar_anexos_tenant" ON public.tarefa_anexos
  AS PERMISSIVE FOR DELETE TO public
  USING ((uploaded_by = auth.uid()) OR (tenant_id IN ( SELECT public.accessible_tenant_ids_with_role(ARRAY['admin','dev']::text[]) )));

-- 19. tenant_modules.tenant_modules_delete_admin
DROP POLICY IF EXISTS "tenant_modules_delete_admin" ON public.tenant_modules;
CREATE POLICY "tenant_modules_delete_admin" ON public.tenant_modules
  AS PERMISSIVE FOR DELETE TO public
  USING (tenant_id IN ( SELECT public.accessible_tenant_ids_with_role(ARRAY['owner','admin']::text[]) ));

-- 20. tenant_modules.tenant_modules_insert_admin
DROP POLICY IF EXISTS "tenant_modules_insert_admin" ON public.tenant_modules;
CREATE POLICY "tenant_modules_insert_admin" ON public.tenant_modules
  AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (tenant_id IN ( SELECT public.accessible_tenant_ids_with_role(ARRAY['owner','admin']::text[]) ));

-- 21. tenant_modules.tenant_modules_update_admin
DROP POLICY IF EXISTS "tenant_modules_update_admin" ON public.tenant_modules;
CREATE POLICY "tenant_modules_update_admin" ON public.tenant_modules
  AS PERMISSIVE FOR UPDATE TO public
  USING (tenant_id IN ( SELECT public.accessible_tenant_ids_with_role(ARRAY['owner','admin']::text[]) ));

-- 22. whatsapp_groups.wa_groups_update_admin_marketing
DROP POLICY IF EXISTS "wa_groups_update_admin_marketing" ON public.whatsapp_groups;
CREATE POLICY "wa_groups_update_admin_marketing" ON public.whatsapp_groups
  AS PERMISSIVE FOR UPDATE TO public
  USING (tenant_id IN ( SELECT public.accessible_tenant_ids_with_role(ARRAY['admin','marketing']::text[]) ));

COMMIT;
