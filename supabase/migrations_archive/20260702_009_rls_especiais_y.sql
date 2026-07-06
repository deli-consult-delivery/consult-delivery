-- 20260702_009_rls_especiais_y.sql
-- Rota B 4b-2: policies ESPECIAIS + grupo Y -> acesso HIERARQUICO. Atomico.
-- Substitui a subquery flat (tenant_members WHERE user_id = auth.uid()) pelos helpers:
--   public.accessible_tenant_ids()                        -> tenants acessiveis (hierarquico)
--   public.accessible_tenant_ids_with_role(text[])        -> filtrado por tenant_members.role
--   public.is_admin_of(uuid)                              -> owner/admin hierarquico do tenant
-- Atributos (permissive, roles=public, cmd, USING/WITH CHECK) preservados exatamente do pg_policies ao vivo.
-- 16 policies: 3 messages + 2 whatsapp + 1 profiles + 10 Y.

BEGIN;

-- ============================================================
-- ESPECIAIS
-- ============================================================

-- 1) messages / messages_select_tenant (USING; DUAS subqueries flat -> accessible_tenant_ids())
DROP POLICY IF EXISTS messages_select_tenant ON public.messages;
CREATE POLICY messages_select_tenant ON public.messages
  AS PERMISSIVE FOR SELECT TO public
  USING (
    (((tenant_id IS NOT NULL) AND (tenant_id IN ( SELECT public.accessible_tenant_ids() )))
     OR ((tenant_id IS NULL) AND (conversation_id IN ( SELECT conversations.id
        FROM conversations
       WHERE (conversations.tenant_id IN ( SELECT public.accessible_tenant_ids() ))))))
  );

-- messages / messages_update_tenant (USING; DUAS subqueries flat)
DROP POLICY IF EXISTS messages_update_tenant ON public.messages;
CREATE POLICY messages_update_tenant ON public.messages
  AS PERMISSIVE FOR UPDATE TO public
  USING (
    (((tenant_id IS NOT NULL) AND (tenant_id IN ( SELECT public.accessible_tenant_ids() )))
     OR ((tenant_id IS NULL) AND (conversation_id IN ( SELECT conversations.id
        FROM conversations
       WHERE (conversations.tenant_id IN ( SELECT public.accessible_tenant_ids() ))))))
  );

-- messages / messages_insert_tenant (WITH CHECK; DUAS subqueries flat)
DROP POLICY IF EXISTS messages_insert_tenant ON public.messages;
CREATE POLICY messages_insert_tenant ON public.messages
  AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (
    (((tenant_id IS NOT NULL) AND (tenant_id IN ( SELECT public.accessible_tenant_ids() )))
     OR ((tenant_id IS NULL) AND (conversation_id IN ( SELECT conversations.id
        FROM conversations
       WHERE (conversations.tenant_id IN ( SELECT public.accessible_tenant_ids() ))))))
  );

-- 2) whatsapp_aprovacao_sessions / "Sessoes do tenant" (USING; l.tenant_id IN flat -> accessible_tenant_ids())
DROP POLICY IF EXISTS "Sessoes do tenant" ON public.whatsapp_aprovacao_sessions;
CREATE POLICY "Sessoes do tenant" ON public.whatsapp_aprovacao_sessions
  AS PERMISSIVE FOR SELECT TO public
  USING (
    (EXISTS ( SELECT 1
       FROM lojas l
      WHERE ((l.id = whatsapp_aprovacao_sessions.loja_id)
             AND (l.tenant_id IN ( SELECT public.accessible_tenant_ids() )))))
  );

-- whatsapp_aprovacao_sessions / "Cancelar sessao do tenant" (USING + WITH CHECK literal preservado)
DROP POLICY IF EXISTS "Cancelar sessao do tenant" ON public.whatsapp_aprovacao_sessions;
CREATE POLICY "Cancelar sessao do tenant" ON public.whatsapp_aprovacao_sessions
  AS PERMISSIVE FOR UPDATE TO public
  USING (
    (EXISTS ( SELECT 1
       FROM lojas l
      WHERE ((l.id = whatsapp_aprovacao_sessions.loja_id)
             AND (l.tenant_id IN ( SELECT public.accessible_tenant_ids() )))))
  )
  WITH CHECK ((status = 'cancelada'::text));

-- 3) profiles / tenant_peers_see_profiles (USING; self-join flat -> accessible_tenant_ids())
DROP POLICY IF EXISTS tenant_peers_see_profiles ON public.profiles;
CREATE POLICY tenant_peers_see_profiles ON public.profiles
  AS PERMISSIVE FOR SELECT TO public
  USING (
    (id IN ( SELECT tm.user_id
       FROM public.tenant_members tm
      WHERE tm.tenant_id IN ( SELECT public.accessible_tenant_ids() )))
  );

-- ============================================================
-- Y (gate por role -> accessible_tenant_ids_with_role / is_admin_of)
-- ============================================================

-- 4) agent_drafts / drafts_update_tenant (USING + WITH CHECK; role gate ['admin','owner','deli_owner'])
DROP POLICY IF EXISTS drafts_update_tenant ON public.agent_drafts;
CREATE POLICY drafts_update_tenant ON public.agent_drafts
  AS PERMISSIVE FOR UPDATE TO public
  USING (
    (tenant_id IN ( SELECT public.accessible_tenant_ids() ))
  )
  WITH CHECK (
    ((tenant_id IN ( SELECT public.accessible_tenant_ids() ))
     AND (((status IS DISTINCT FROM 'approved'::text) AND (status IS DISTINCT FROM 'rejected'::text))
          OR (agent_drafts.tenant_id IN ( SELECT public.accessible_tenant_ids_with_role(ARRAY['admin'::text, 'owner'::text, 'deli_owner'::text]) ))))
  );

-- 5) loja_gpt_conversations / lgc_update (USING; role gate ['admin'])
DROP POLICY IF EXISTS lgc_update ON public.loja_gpt_conversations;
CREATE POLICY lgc_update ON public.loja_gpt_conversations
  AS PERMISSIVE FOR UPDATE TO public
  USING (
    ((iniciada_por = auth.uid())
     OR (EXISTS ( SELECT 1
        FROM lojas l
       WHERE ((l.id = loja_gpt_conversations.loja_id)
              AND (l.tenant_id IN ( SELECT public.accessible_tenant_ids_with_role(ARRAY['admin'::text]) ))))))
  );

-- 6) prospect_abordagens / prospect_abordagens_select (USING; role gate ['admin','marketing','dev','viewer'])
DROP POLICY IF EXISTS prospect_abordagens_select ON public.prospect_abordagens;
CREATE POLICY prospect_abordagens_select ON public.prospect_abordagens
  AS PERMISSIVE FOR SELECT TO public
  USING (
    (EXISTS ( SELECT 1
       FROM prospects p
      WHERE ((p.id = prospect_abordagens.prospect_id)
             AND (p.tenant_id IN ( SELECT public.accessible_tenant_ids_with_role(ARRAY['admin'::text, 'marketing'::text, 'dev'::text, 'viewer'::text]) )))))
  );

-- prospect_abordagens / prospect_abordagens_write (USING + WITH CHECK; role gate ['admin','marketing','dev'])
DROP POLICY IF EXISTS prospect_abordagens_write ON public.prospect_abordagens;
CREATE POLICY prospect_abordagens_write ON public.prospect_abordagens
  AS PERMISSIVE FOR ALL TO public
  USING (
    (EXISTS ( SELECT 1
       FROM prospects p
      WHERE ((p.id = prospect_abordagens.prospect_id)
             AND (p.tenant_id IN ( SELECT public.accessible_tenant_ids_with_role(ARRAY['admin'::text, 'marketing'::text, 'dev'::text]) )))))
  )
  WITH CHECK (
    (EXISTS ( SELECT 1
       FROM prospects p
      WHERE ((p.id = prospect_abordagens.prospect_id)
             AND (p.tenant_id IN ( SELECT public.accessible_tenant_ids_with_role(ARRAY['admin'::text, 'marketing'::text, 'dev'::text]) )))))
  );

-- prospect_pesquisas / prospect_pesquisas_select (USING; role gate ['admin','marketing','dev','viewer'])
DROP POLICY IF EXISTS prospect_pesquisas_select ON public.prospect_pesquisas;
CREATE POLICY prospect_pesquisas_select ON public.prospect_pesquisas
  AS PERMISSIVE FOR SELECT TO public
  USING (
    (EXISTS ( SELECT 1
       FROM prospects p
      WHERE ((p.id = prospect_pesquisas.prospect_id)
             AND (p.tenant_id IN ( SELECT public.accessible_tenant_ids_with_role(ARRAY['admin'::text, 'marketing'::text, 'dev'::text, 'viewer'::text]) )))))
  );

-- prospect_pesquisas / prospect_pesquisas_write (USING + WITH CHECK; role gate ['admin','marketing','dev'])
DROP POLICY IF EXISTS prospect_pesquisas_write ON public.prospect_pesquisas;
CREATE POLICY prospect_pesquisas_write ON public.prospect_pesquisas
  AS PERMISSIVE FOR ALL TO public
  USING (
    (EXISTS ( SELECT 1
       FROM prospects p
      WHERE ((p.id = prospect_pesquisas.prospect_id)
             AND (p.tenant_id IN ( SELECT public.accessible_tenant_ids_with_role(ARRAY['admin'::text, 'marketing'::text, 'dev'::text]) )))))
  )
  WITH CHECK (
    (EXISTS ( SELECT 1
       FROM prospects p
      WHERE ((p.id = prospect_pesquisas.prospect_id)
             AND (p.tenant_id IN ( SELECT public.accessible_tenant_ids_with_role(ARRAY['admin'::text, 'marketing'::text, 'dev'::text]) )))))
  );

-- 7) role_permissions / role_permissions_manage_admin (USING; role gate ['admin'] via roles r)
DROP POLICY IF EXISTS role_permissions_manage_admin ON public.role_permissions;
CREATE POLICY role_permissions_manage_admin ON public.role_permissions
  AS PERMISSIVE FOR ALL TO public
  USING (
    (EXISTS ( SELECT 1
       FROM roles r
      WHERE ((r.id = role_permissions.role_id)
             AND (r.tenant_id IN ( SELECT public.accessible_tenant_ids_with_role(ARRAY['admin'::text]) )))))
  );

-- 8) user_roles / user_roles_manage_admin (USING; role gate ['admin'] via roles r)
DROP POLICY IF EXISTS user_roles_manage_admin ON public.user_roles;
CREATE POLICY user_roles_manage_admin ON public.user_roles
  AS PERMISSIVE FOR ALL TO public
  USING (
    (EXISTS ( SELECT 1
       FROM roles r
      WHERE ((r.id = user_roles.role_id)
             AND (r.tenant_id IN ( SELECT public.accessible_tenant_ids_with_role(ARRAY['admin'::text]) )))))
  );

-- 9) tenant_agent_config / tenant_admin_manage_agent_config (USING; ['admin','owner'] -> is_admin_of)
DROP POLICY IF EXISTS tenant_admin_manage_agent_config ON public.tenant_agent_config;
CREATE POLICY tenant_admin_manage_agent_config ON public.tenant_agent_config
  AS PERMISSIVE FOR ALL TO public
  USING ( public.is_admin_of(tenant_id) );

-- 10) user_screen_permissions / admin_read_screen_perms (USING; ['admin','owner'] -> is_admin_of)
DROP POLICY IF EXISTS admin_read_screen_perms ON public.user_screen_permissions;
CREATE POLICY admin_read_screen_perms ON public.user_screen_permissions
  AS PERMISSIVE FOR SELECT TO public
  USING ( public.is_admin_of(tenant_id) );

-- 11) evolution_instances / evolution_instances_manage_admin (USING; GLOBAL admin -> is_admin_of correlaciona tenant_id)
DROP POLICY IF EXISTS evolution_instances_manage_admin ON public.evolution_instances;
CREATE POLICY evolution_instances_manage_admin ON public.evolution_instances
  AS PERMISSIVE FOR ALL TO public
  USING ( public.is_admin_of(tenant_id) );

COMMIT;
