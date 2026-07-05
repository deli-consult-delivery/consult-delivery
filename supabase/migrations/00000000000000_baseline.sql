


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "unaccent" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE TYPE "public"."conversation_status_v2" AS ENUM (
    'open',
    'in_progress',
    'waiting',
    'closed',
    'archived',
    'automacao',
    'falha'
);


ALTER TYPE "public"."conversation_status_v2" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_slugify"("txt" "text") RETURNS "text"
    LANGUAGE "sql" STABLE
    AS $$
  SELECT trim(both '-' from regexp_replace(
           lower(extensions.unaccent(coalesce(txt,''))), '[^a-z0-9]+', '-', 'g'));
$$;


ALTER FUNCTION "public"."_slugify"("txt" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."accessible_tenant_ids"() RETURNS SETOF "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  WITH RECURSIVE mine AS (
    SELECT tenant_id AS id FROM public.tenant_members WHERE user_id = auth.uid()
  ),
  tree AS (
    SELECT id FROM mine
    UNION
    SELECT t.id FROM public.tenants t JOIN tree ON t.parent_tenant_id = tree.id
  )
  SELECT id FROM tree;
$$;


ALTER FUNCTION "public"."accessible_tenant_ids"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."accessible_tenant_ids_with_role"("_roles" "text"[]) RETURNS SETOF "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  WITH RECURSIVE seed AS (
    SELECT tenant_id AS id FROM public.tenant_members
     WHERE user_id = auth.uid() AND role = ANY(_roles)
  ),
  tree AS (
    SELECT id FROM seed
    UNION
    SELECT t.id FROM public.tenants t JOIN tree ON t.parent_tenant_id = tree.id
  )
  SELECT id FROM tree;
$$;


ALTER FUNCTION "public"."accessible_tenant_ids_with_role"("_roles" "text"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_get_tenant_modules"("p_tenant_id" "uuid") RETURNS TABLE("module_key" "text", "enabled" boolean)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NOT public.admin_is_platform_operator() THEN
    RAISE EXCEPTION 'not authorized: platform operator only';
  END IF;
  RETURN QUERY
    SELECT tm.module_key, tm.enabled
    FROM public.tenant_modules tm
    WHERE tm.tenant_id = p_tenant_id
    ORDER BY tm.module_key;
END;
$$;


ALTER FUNCTION "public"."admin_get_tenant_modules"("p_tenant_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_is_platform_operator"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tenant_members
    WHERE user_id = auth.uid()
      AND tenant_id = '9079bd4d-4df7-4023-90fb-d79c8ba7e900'
      AND role IN ('owner', 'admin')
  );
$$;


ALTER FUNCTION "public"."admin_is_platform_operator"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_set_tenant_modules"("p_tenant_id" "uuid", "p_modules" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NOT public.admin_is_platform_operator() THEN
    RAISE EXCEPTION 'not authorized: platform operator only';
  END IF;
  IF jsonb_typeof(p_modules) <> 'array' THEN
    RAISE EXCEPTION 'p_modules must be a jsonb array';
  END IF;

  INSERT INTO public.tenant_modules (tenant_id, module_key, enabled)
  SELECT p_tenant_id, (m->>'module_key')::text, (m->>'enabled')::boolean
  FROM jsonb_array_elements(p_modules) m
  WHERE m->>'module_key' IS NOT NULL
  ON CONFLICT (tenant_id, module_key) DO UPDATE SET enabled = EXCLUDED.enabled;
END;
$$;


ALTER FUNCTION "public"."admin_set_tenant_modules"("p_tenant_id" "uuid", "p_modules" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."agent_enabled_for_user"("_agent" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM tenant_agents ta
    JOIN tenant_members tm ON tm.tenant_id = ta.tenant_id
    WHERE ta.agent_id = _agent AND ta.enabled AND tm.user_id = auth.uid());
$$;


ALTER FUNCTION "public"."agent_enabled_for_user"("_agent" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_workspace"("p_name" "text", "p_slug" "text", "p_segment" "text", "p_emoji" "text", "p_user_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_tenant_id uuid;
BEGIN
  INSERT INTO public.tenants (name, slug, segment, emoji, plan, status, color)
  VALUES (p_name, p_slug, p_segment, p_emoji, 'starter', 'active', '#B70C00')
  RETURNING id INTO v_tenant_id;

  INSERT INTO public.tenant_members (tenant_id, user_id, role, semaforo)
  VALUES (v_tenant_id, p_user_id, 'admin', 'verde');

  RETURN v_tenant_id;
END;
$$;


ALTER FUNCTION "public"."create_workspace"("p_name" "text", "p_slug" "text", "p_segment" "text", "p_emoji" "text", "p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_avaliacao_config_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;


ALTER FUNCTION "public"."fn_avaliacao_config_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_conversation_status_changed"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF NEW.status = 'em_atendimento' AND OLD.status != 'em_atendimento' THEN
    NEW.started_at := COALESCE(NEW.started_at, NOW());
  END IF;

  IF NEW.status = 'finalizado' AND OLD.status != 'finalizado' THEN
    NEW.finished_at := COALESCE(NEW.finished_at, NOW());
  END IF;

  IF NEW.status != 'finalizado' AND OLD.status = 'finalizado' THEN
    NEW.reopened_at := COALESCE(NEW.reopened_at, NOW());
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."fn_conversation_status_changed"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_log_conversation_status_change"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    NEW.previous_status   := OLD.status;
    NEW.status_changed_at := now();
    INSERT INTO public.conversation_status_log(
      tenant_id, conversation_id, from_status, to_status, changed_by, trigger
    ) VALUES (
      NEW.tenant_id, NEW.id, OLD.status, NEW.status, NEW.status_changed_by, 'db_trigger'
    );
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."fn_log_conversation_status_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_task_done_updates_goal"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF NEW.status = 'done' AND OLD.status != 'done' AND NEW.goal_id IS NOT NULL THEN
    UPDATE public.goals SET current_value = current_value + 1, updated_at = NOW() WHERE id = NEW.goal_id;
    UPDATE public.goals SET status = 'achieved', updated_at = NOW()
      WHERE id = NEW.goal_id AND current_value >= target_value AND status = 'active';
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."fn_task_done_updates_goal"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_tenant_members"("p_tenant_id" "uuid") RETURNS TABLE("user_id" "uuid", "role" "text", "display_name" "text", "email" "text", "full_name" "text", "last_sign_in_at" timestamp with time zone, "joined_at" timestamp with time zone)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
  SELECT
    tm.user_id,
    tm.role,
    tm.display_name,
    u.email,
    COALESCE(
      tm.display_name,
      u.raw_user_meta_data->>'full_name',
      split_part(u.email, '@', 1)
    ) AS full_name,
    u.last_sign_in_at,
    tm.created_at AS joined_at
  FROM public.tenant_members tm
  JOIN auth.users u ON u.id = tm.user_id
  WHERE tm.tenant_id = p_tenant_id
    AND EXISTS (
      SELECT 1 FROM public.tenant_members caller
      WHERE caller.tenant_id = p_tenant_id
        AND caller.user_id = auth.uid()
    )
  ORDER BY tm.created_at;
$$;


ALTER FUNCTION "public"."get_tenant_members"("p_tenant_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_screen_permissions"("p_tenant_id" "uuid", "p_user_id" "uuid") RETURNS TABLE("screen_id" "text", "allowed" boolean)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
BEGIN
  IF auth.uid() != p_user_id THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.tenant_members
      WHERE tenant_id = p_tenant_id
        AND user_id = auth.uid()
        AND role IN ('admin', 'owner')
    ) THEN
      RAISE EXCEPTION 'permission_denied';
    END IF;
  END IF;

  RETURN QUERY
    SELECT usp.screen_id, usp.allowed
    FROM public.user_screen_permissions usp
    WHERE usp.tenant_id = p_tenant_id AND usp.user_id = p_user_id;
END;
$$;


ALTER FUNCTION "public"."get_user_screen_permissions"("p_tenant_id" "uuid", "p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', new.email))
  on conflict (id) do nothing;
  return new;
end;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."has_rbac_role_in_hierarchy"("_tenant" "uuid", "_role_names" "text"[]) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  WITH RECURSIVE anc AS (
    SELECT _tenant AS id
    UNION
    SELECT t.parent_tenant_id FROM public.tenants t JOIN anc ON t.id = anc.id
      WHERE t.parent_tenant_id IS NOT NULL
  )
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.user_id = auth.uid()
      AND r.name = ANY(_role_names)
      AND r.tenant_id IN (SELECT id FROM anc)
  );
$$;


ALTER FUNCTION "public"."has_rbac_role_in_hierarchy"("_tenant" "uuid", "_role_names" "text"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."has_tenant_access"("_tenant" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$ SELECT _tenant IN (SELECT public.accessible_tenant_ids()); $$;


ALTER FUNCTION "public"."has_tenant_access"("_tenant" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_admin_of"("_tenant" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."is_admin_of"("_tenant" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_member_of"("_tenant" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$ SELECT _tenant IN (SELECT public.accessible_tenant_ids()); $$;


ALTER FUNCTION "public"."is_member_of"("_tenant" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_audit"("p_tenant_id" "uuid", "p_action" "text", "p_resource" "text" DEFAULT NULL::"text", "p_agent_name" "text" DEFAULT NULL::"text", "p_metadata" "jsonb" DEFAULT NULL::"jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  INSERT INTO audit_log(tenant_id, user_id, agent_name, action, resource, metadata)
  VALUES (p_tenant_id, auth.uid(), p_agent_name, p_action, p_resource, p_metadata);
END;
$$;


ALTER FUNCTION "public"."log_audit"("p_tenant_id" "uuid", "p_action" "text", "p_resource" "text", "p_agent_name" "text", "p_metadata" "jsonb") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."log_audit"("p_tenant_id" "uuid", "p_action" "text", "p_resource" "text", "p_agent_name" "text", "p_metadata" "jsonb") IS 'Helper para registrar ações no audit_log. SECURITY DEFINER para permitir uso por qualquer usuário autenticado.';



CREATE OR REPLACE FUNCTION "public"."notify_on_channel_message"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_tenant_id  uuid;
  v_chan_name  text;
  v_member     record;
  v_body       text;
BEGIN
  SELECT tenant_id, name INTO v_tenant_id, v_chan_name
  FROM public.internal_channels
  WHERE id = NEW.channel_id;

  IF v_tenant_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_body := NEW.sender_name || ': ' || LEFT(COALESCE(NEW.text, ''), 100);

  FOR v_member IN
    SELECT user_id
    FROM public.tenant_members
    WHERE tenant_id = v_tenant_id
      AND (NEW.sender_id IS NULL OR user_id != NEW.sender_id)
  LOOP
    INSERT INTO public.internal_notifications (
      tenant_id,
      recipient_user_id,
      kind,
      title,
      body,
      link,
      metadata
    ) VALUES (
      v_tenant_id,
      v_member.user_id,
      'channel_message',
      '#' || v_chan_name,
      v_body,
      '/chat',
      jsonb_build_object(
        'channel_id', NEW.channel_id,
        'message_id', NEW.id,
        'sender_name', NEW.sender_name
      )
    );
  END LOOP;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."notify_on_channel_message"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."remove_tenant_member"("p_tenant_id" "uuid", "p_user_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.tenant_members
    WHERE tenant_id = p_tenant_id
      AND user_id = auth.uid()
      AND role IN ('admin', 'owner')
  ) THEN
    RAISE EXCEPTION 'permission_denied';
  END IF;

  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'cannot_remove_self';
  END IF;

  DELETE FROM public.tenant_members
  WHERE tenant_id = p_tenant_id AND user_id = p_user_id;
END;
$$;


ALTER FUNCTION "public"."remove_tenant_member"("p_tenant_id" "uuid", "p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rls_auto_enable"() RETURNS "event_trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."rls_auto_enable"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."same_tenant_admin"("_target" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM tenant_members alvo
    JOIN tenant_members adm ON adm.tenant_id = alvo.tenant_id
    WHERE alvo.user_id = _target AND adm.user_id = auth.uid()
      AND adm.role IN ('owner','admin'));
$$;


ALTER FUNCTION "public"."same_tenant_admin"("_target" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."seed_rbac_system_roles"("p_tenant_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  insert into roles (tenant_id, name, description, is_system)
  values
    (p_tenant_id, 'admin',       'Acesso total',                              true),
    (p_tenant_id, 'atendimento', 'Atendimento e suporte — sem financeiro',    true),
    (p_tenant_id, 'deli_owner',  'COO digital — invoke agentes e aprovações', true),
    (p_tenant_id, 'dev',         'Dev frontend — sem financeiro',             true),
    (p_tenant_id, 'financeiro',  'Cobrança e inadimplência — restrito',       true),
    (p_tenant_id, 'marketing',   'Marketing e CRM — sem financeiro',          true),
    (p_tenant_id, 'viewer',      'Somente visualização',                      true)
  on conflict (tenant_id, name) do nothing;

  insert into role_permissions (role_id, resource, action)
  select r.id, p.resource, p.action
  from (values
    ('admin','agents_panel','execute'),('admin','agents_panel','view'),
    ('admin','analise_ifood','execute'),('admin','analise_ifood','view'),
    ('admin','approve_drafts','approve'),('admin','chat','create'),('admin','chat','view'),
    ('admin','cobranca','approve'),('admin','cobranca','create'),('admin','cobranca','edit'),
    ('admin','cobranca','execute'),('admin','cobranca','view'),
    ('admin','crm','create'),('admin','crm','delete'),('admin','crm','edit'),('admin','crm','view'),
    ('admin','deli','approve'),('admin','deli','execute'),('admin','deli','view'),
    ('admin','departments','create'),('admin','departments','delete'),('admin','departments','edit'),('admin','departments','view'),
    ('admin','financeiro','create'),('admin','financeiro','delete'),('admin','financeiro','edit'),('admin','financeiro','view'),
    ('admin','grupos_whatsapp','create'),('admin','grupos_whatsapp','view'),
    ('admin','kanban','create'),('admin','kanban','delete'),('admin','kanban','edit'),('admin','kanban','view'),
    ('admin','lara','approve'),('admin','lara','execute'),
    ('admin','reports','create'),('admin','reports','view'),
    ('admin','tenant_admin','edit'),('admin','tenant_admin','view'),
    ('atendimento','agents_panel','view'),('atendimento','analise_ifood','view'),
    ('atendimento','chat','create'),('atendimento','chat','view'),('atendimento','departments','view'),
    ('atendimento','grupos_whatsapp','create'),('atendimento','grupos_whatsapp','view'),
    ('atendimento','kanban','create'),('atendimento','kanban','edit'),('atendimento','kanban','view'),
    ('deli_owner','agents_panel','execute'),('deli_owner','agents_panel','view'),
    ('deli_owner','approve_drafts','approve'),('deli_owner','deli','approve'),
    ('deli_owner','deli','execute'),('deli_owner','deli','view'),
    ('dev','agents_panel','view'),('dev','analise_ifood','execute'),('dev','analise_ifood','view'),
    ('dev','chat','create'),('dev','chat','view'),('dev','crm','view'),('dev','departments','view'),
    ('dev','kanban','create'),('dev','kanban','edit'),('dev','kanban','view'),('dev','reports','view'),
    ('financeiro','agents_panel','view'),('financeiro','cobranca','create'),('financeiro','cobranca','edit'),
    ('financeiro','cobranca','execute'),('financeiro','cobranca','view'),('financeiro','departments','view'),
    ('financeiro','financeiro','create'),('financeiro','financeiro','edit'),('financeiro','financeiro','view'),
    ('marketing','agents_panel','view'),('marketing','chat','create'),('marketing','chat','view'),
    ('marketing','crm','create'),('marketing','crm','edit'),('marketing','crm','view'),('marketing','departments','view'),
    ('marketing','kanban','create'),('marketing','kanban','edit'),('marketing','kanban','view'),
    ('marketing','lara','approve'),('marketing','lara','execute'),('marketing','reports','view'),
    ('viewer','kanban','view'),('viewer','reports','view')
  ) as p(role_name, resource, action)
  join roles r on r.tenant_id = p_tenant_id and r.name = p.role_name
  on conflict (role_id, resource, action) do nothing;
end;
$$;


ALTER FUNCTION "public"."seed_rbac_system_roles"("p_tenant_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_leads_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_leads_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_user_screen_permission"("p_tenant_id" "uuid", "p_user_id" "uuid", "p_screen_id" "text", "p_allowed" boolean) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.tenant_members
    WHERE tenant_id = p_tenant_id
      AND user_id = auth.uid()
      AND role IN ('admin', 'owner')
  ) THEN
    RAISE EXCEPTION 'permission_denied';
  END IF;

  INSERT INTO public.user_screen_permissions (user_id, tenant_id, screen_id, allowed, granted_by)
  VALUES (p_user_id, p_tenant_id, p_screen_id, p_allowed, auth.uid())
  ON CONFLICT (user_id, tenant_id, screen_id)
  DO UPDATE SET allowed = p_allowed, granted_by = auth.uid(), created_at = now();
END;
$$;


ALTER FUNCTION "public"."set_user_screen_permission"("p_tenant_id" "uuid", "p_user_id" "uuid", "p_screen_id" "text", "p_allowed" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."tg_set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."tg_set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."touch_lwv_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END
$$;


ALTER FUNCTION "public"."touch_lwv_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trg_audit_regua"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  INSERT INTO audit_log (tenant_id, user_id, agent_name, action, resource, metadata)
  VALUES (
    NEW.tenant_id,
    NEW.criada_por,
    'lara',
    TG_OP,
    'reguas',
    jsonb_build_object('regua_id', NEW.id, 'loja_id', NEW.loja_id, 'status', NEW.status)
  );
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."trg_audit_regua"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trg_auto_create_loja"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  INSERT INTO lojas (tenant_id, client_id, nome, status)
  VALUES (NEW.tenant_id, NEW.id, NEW.name, 'ativo')
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."trg_auto_create_loja"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trg_auto_vinculo_grupo"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if new.loja_id is not null and new.evolution_jid is not null then
    insert into loja_whatsapp_vinculo (tenant_id, loja_id, remote_jid, tipo, monitorar, created_at, updated_at)
    select new.tenant_id, new.loja_id, new.evolution_jid, 'grupo', true, now(), now()
    where not exists (select 1 from loja_whatsapp_vinculo v where v.remote_jid = new.evolution_jid);
  end if;
  return new;
end $$;


ALTER FUNCTION "public"."trg_auto_vinculo_grupo"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trg_fn_atend_aval_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."trg_fn_atend_aval_updated_at"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."trg_fn_atend_aval_updated_at"() IS 'Atualiza updated_at automaticamente em cada UPDATE na tabela atendimento_avaliacoes.';



CREATE OR REPLACE FUNCTION "public"."trg_fn_conv_department_changed"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_dept_from text;
  v_dept_to   text;
BEGIN
  SELECT name INTO v_dept_from FROM public.departments WHERE id = OLD.department_id;
  SELECT name INTO v_dept_to   FROM public.departments WHERE id = NEW.department_id;

  INSERT INTO public.conversation_events (
    tenant_id,
    conversation_id,
    event_type,
    actor_type,
    metadata,
    ts
  ) VALUES (
    NEW.tenant_id,
    NEW.id,
    'transferred',
    'system',
    jsonb_build_object(
      'dept_from',    v_dept_from,
      'dept_to',      v_dept_to,
      'dept_id_from', OLD.department_id,
      'dept_id_to',   NEW.department_id
    ),
    now()
  );

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."trg_fn_conv_department_changed"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."trg_fn_conv_department_changed"() IS 'Ao mudar conversations.department_id, registra evento transferred em conversation_events com nomes dos deptos.';



CREATE OR REPLACE FUNCTION "public"."trg_fn_conv_gen_avaliacao_token"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_atendente_nome text;
BEGIN
  IF NEW.assigned_to IS NOT NULL THEN
    SELECT full_name INTO v_atendente_nome FROM public.profiles WHERE id = NEW.assigned_to LIMIT 1;
  END IF;

  INSERT INTO public.atendimento_avaliacoes (
    tenant_id, conversation_id, assigned_to, agent_id, atendente_nome
  ) VALUES (
    NEW.tenant_id, NEW.id, NEW.assigned_to, NEW.agent_id, v_atendente_nome
  )
  ON CONFLICT (conversation_id) WHERE conversation_id IS NOT NULL DO NOTHING;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'trg_fn_conv_gen_avaliacao_token falhou para conv %: % (%)', NEW.id, SQLERRM, SQLSTATE;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."trg_fn_conv_gen_avaliacao_token"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."trg_fn_conv_gen_avaliacao_token"() IS 'Gera automaticamente uma linha em atendimento_avaliacoes (status=pendente) quando uma conversa é fechada (status_v2 = ''closed''). Idempotente: reabrir e fechar de novo não cria duplicata. SECURITY DEFINER para bypassar RLS no INSERT.';



CREATE OR REPLACE FUNCTION "public"."trg_fn_conv_gen_nps_token"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_contact_nome text;
BEGIN
  IF NEW.whatsapp_chat_id IS NULL OR NEW.whatsapp_chat_id = '' THEN
    RETURN NEW;
  END IF;

  v_contact_nome := COALESCE(NULLIF(TRIM(NEW.push_name), ''), NULLIF(TRIM(NEW.contact_name), ''));

  IF NOT EXISTS (
    SELECT 1 FROM public.nps_avaliacoes
     WHERE tenant_id          = NEW.tenant_id
       AND contact_identifier = NEW.whatsapp_chat_id
       AND created_at         > now() - interval '30 days'
  ) THEN
    INSERT INTO public.nps_avaliacoes (
      tenant_id, contact_identifier, contact_nome, origin_conversation_id
    ) VALUES (
      NEW.tenant_id, NEW.whatsapp_chat_id, v_contact_nome, NEW.id
    );
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'trg_fn_conv_gen_nps_token falhou para conv %: % (%)', NEW.id, SQLERRM, SQLSTATE;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."trg_fn_conv_gen_nps_token"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."trg_fn_conv_gen_nps_token"() IS 'Gera NPS de marca ao fechar conversa, respeitando cooldown de 30 dias por contato. Usa whatsapp_chat_id como identificador. Ignora grupos e conversas sem JID. SECURITY DEFINER para bypassar RLS no INSERT.';



CREATE OR REPLACE FUNCTION "public"."trg_fn_conv_status_changed"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  -- 'closed' e 'reopened' são inseridos pelo frontend com actor info completo.
  -- Trigger não insere mais para evitar duplicação.
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."trg_fn_conv_status_changed"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."trg_fn_conv_status_changed"() IS 'Trigger desativado: eventos closed/reopened são gerenciados pelo frontend com actor_name.';



CREATE OR REPLACE FUNCTION "public"."trg_fn_nps_aval_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."trg_fn_nps_aval_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trg_set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  NEW.atualizada_em = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."trg_set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trg_set_updated_at_campanhas"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."trg_set_updated_at_campanhas"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_lojas_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_lojas_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_member_display_name"("p_tenant_id" "uuid", "p_user_id" "uuid", "p_display_name" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.tenant_members
    WHERE tenant_id = p_tenant_id
      AND user_id = auth.uid()
      AND role IN ('admin', 'owner')
  ) THEN
    RAISE EXCEPTION 'permission_denied';
  END IF;

  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'cannot_edit_own_name_here';
  END IF;

  IF length(trim(p_display_name)) = 0 THEN
    RAISE EXCEPTION 'display_name_empty';
  END IF;

  UPDATE public.tenant_members
  SET display_name = trim(p_display_name)
  WHERE tenant_id = p_tenant_id AND user_id = p_user_id;
END;
$$;


ALTER FUNCTION "public"."update_member_display_name"("p_tenant_id" "uuid", "p_user_id" "uuid", "p_display_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_member_role"("p_tenant_id" "uuid", "p_user_id" "uuid", "p_new_role" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.tenant_members
    WHERE tenant_id = p_tenant_id
      AND user_id = auth.uid()
      AND role IN ('admin', 'owner')
  ) THEN
    RAISE EXCEPTION 'permission_denied';
  END IF;

  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'cannot_change_own_role';
  END IF;

  IF p_new_role NOT IN ('owner','admin','consultor','operador','dev') THEN
    RAISE EXCEPTION 'invalid_role';
  END IF;

  UPDATE public.tenant_members
  SET role = p_new_role
  WHERE tenant_id = p_tenant_id AND user_id = p_user_id;
END;
$$;


ALTER FUNCTION "public"."update_member_role"("p_tenant_id" "uuid", "p_user_id" "uuid", "p_new_role" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_prospects_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;


ALTER FUNCTION "public"."update_prospects_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_tenant_hierarchy"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE parent_type text;
BEGIN
  IF NEW.tenant_type='platform' THEN
    IF NEW.parent_tenant_id IS NOT NULL THEN RAISE EXCEPTION 'platform nao tem pai'; END IF;
    RETURN NEW;
  END IF;
  IF NEW.parent_tenant_id IS NULL THEN
    RAISE EXCEPTION 'tenant_type % exige parent_tenant_id', NEW.tenant_type;
  END IF;
  SELECT tenant_type INTO parent_type FROM public.tenants WHERE id=NEW.parent_tenant_id;
  IF NEW.tenant_type='agency' AND parent_type<>'platform' THEN
    RAISE EXCEPTION 'agency deve pender de platform (pai e %)', parent_type;
  END IF;
  IF NEW.tenant_type='store' AND parent_type<>'agency' THEN
    RAISE EXCEPTION 'store deve pender de agency (pai e %)', parent_type;
  END IF;
  RETURN NEW;
END; $$;


ALTER FUNCTION "public"."validate_tenant_hierarchy"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."aceite_recontratacao" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "customer_id" "uuid",
    "whatsapp_jid" "text",
    "pacote_ofertado" "text" NOT NULL,
    "status" "text" DEFAULT 'pendente'::"text" NOT NULL,
    "mensagem_enviada_em" timestamp with time zone,
    "respondido_em" timestamp with time zone,
    "notas" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "aceite_recontratacao_pacote_ofertado_check" CHECK (("pacote_ofertado" = ANY (ARRAY['light'::"text", 'performance'::"text", 'enterprise'::"text", 'growth'::"text"]))),
    CONSTRAINT "aceite_recontratacao_status_check" CHECK (("status" = ANY (ARRAY['pendente'::"text", 'aceito'::"text", 'recusado'::"text", 'sem_resposta'::"text"])))
);


ALTER TABLE "public"."aceite_recontratacao" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."agent_action_approvals" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "agent_slug" "text" NOT NULL,
    "action_type" "text" NOT NULL,
    "action_label" "text" NOT NULL,
    "action_payload" "jsonb",
    "severity" "text" DEFAULT 'amarelo'::"text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "reviewed_by" "uuid",
    "reviewed_at" timestamp with time zone,
    "review_note" "text",
    "heartbeat_run_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "expires_at" timestamp with time zone DEFAULT ("now"() + '24:00:00'::interval),
    CONSTRAINT "agent_action_approvals_severity_check" CHECK (("severity" = ANY (ARRAY['verde'::"text", 'amarelo'::"text", 'vermelho'::"text"]))),
    CONSTRAINT "agent_action_approvals_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'rejected'::"text"])))
);


ALTER TABLE "public"."agent_action_approvals" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."agent_actions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "agent_id" "text" NOT NULL,
    "text" "text" NOT NULL,
    "related_kind" "text",
    "related_id" "uuid",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "occurred_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."agent_actions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."agent_chat_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "agent_id" "text" NOT NULL,
    "user_id" "uuid",
    "loja_id" "uuid",
    "role" "text" NOT NULL,
    "content" "text" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "agent_chat_messages_role_check" CHECK (("role" = ANY (ARRAY['user'::"text", 'assistant'::"text"])))
);

ALTER TABLE ONLY "public"."agent_chat_messages" REPLICA IDENTITY FULL;


ALTER TABLE "public"."agent_chat_messages" OWNER TO "postgres";


COMMENT ON TABLE "public"."agent_chat_messages" IS 'Histórico de conversas humano ↔ agente, genérico por agent_id (ex.: GESTOR). Append-only.';



CREATE TABLE IF NOT EXISTS "public"."agent_corrections" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid",
    "bloco" "text",
    "instrucao" "text" NOT NULL,
    "ativo" boolean DEFAULT true,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."agent_corrections" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."agent_drafts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "agent_name" "text" NOT NULL,
    "channel" "text" NOT NULL,
    "target_id" "text",
    "loja_id" "uuid",
    "subject" "text",
    "content" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "autonomy_level" "text" DEFAULT 'amarelo'::"text" NOT NULL,
    "reviewer_id" "uuid",
    "reviewed_at" timestamp with time zone,
    "sent_at" timestamp with time zone,
    "metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "reasoning" "text",
    "edits_made" "text",
    "rejection_reason" "text",
    "expires_at" timestamp with time zone DEFAULT ("now"() + '24:00:00'::interval),
    "origin" "text" DEFAULT 'agent'::"text" NOT NULL,
    "nps_avaliacao_id" "uuid",
    CONSTRAINT "agent_drafts_autonomy_level_check" CHECK (("autonomy_level" = ANY (ARRAY['verde'::"text", 'amarelo'::"text", 'vermelho'::"text"]))),
    CONSTRAINT "agent_drafts_origin_check" CHECK (("origin" = ANY (ARRAY['agent'::"text", 'deli'::"text", 'hermes'::"text", 'user_manual'::"text"]))),
    CONSTRAINT "agent_drafts_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'rejected'::"text", 'sent'::"text", 'edited'::"text", 'failed'::"text"])))
);

ALTER TABLE ONLY "public"."agent_drafts" REPLICA IDENTITY FULL;


ALTER TABLE "public"."agent_drafts" OWNER TO "postgres";


COMMENT ON TABLE "public"."agent_drafts" IS 'Mensagens que agentes querem enviar, aguardando aprovação. channel: whatsapp_group, whatsapp_pv, telegram_interno, painel. Somente channel interno com verde pode ser enviado sem aprovação.';



COMMENT ON COLUMN "public"."agent_drafts"."target_id" IS 'Destino do draft: JID whatsapp, chat_id telegram, ou identificador do painel';



COMMENT ON COLUMN "public"."agent_drafts"."content" IS 'Corpo da mensagem a ser enviada';



COMMENT ON COLUMN "public"."agent_drafts"."reviewer_id" IS 'Usuário que aprovou/rejeitou o draft';



COMMENT ON COLUMN "public"."agent_drafts"."reviewed_at" IS 'Timestamp da decisão (aprovação ou rejeição)';



COMMENT ON COLUMN "public"."agent_drafts"."reasoning" IS 'Raciocínio do agente ao criar o draft (contexto para o revisor)';



COMMENT ON COLUMN "public"."agent_drafts"."edits_made" IS 'Resumo das edições feitas pelo revisor antes de aprovar';



COMMENT ON COLUMN "public"."agent_drafts"."rejection_reason" IS 'Motivo da rejeição (feedback para o agente)';



COMMENT ON COLUMN "public"."agent_drafts"."expires_at" IS 'Draft expira automaticamente após 24h sem decisão';



COMMENT ON COLUMN "public"."agent_drafts"."origin" IS 'Origem da proposta: agent (agente de operacao) | deli (orquestradora) | hermes (copiloto CEO via admin MCP) | user_manual. Drafts do Hermes = hermes (admin-mcp-design.md secao 5). Enforcement de quem pode criar/aprovar = camada MCP/painel, nao RLS.';



CREATE TABLE IF NOT EXISTS "public"."agent_knowledge_base" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "agent_slug" "text",
    "title" "text" NOT NULL,
    "content" "text" NOT NULL,
    "tags" "text"[] DEFAULT '{}'::"text"[],
    "source" "text" DEFAULT 'manual'::"text",
    "is_active" boolean DEFAULT true,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."agent_knowledge_base" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."agent_memories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "agent_id" "text" NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "user_id" "uuid",
    "kind" "text" NOT NULL,
    "content" "text" NOT NULL,
    "importance" integer DEFAULT 5 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_at" timestamp with time zone,
    CONSTRAINT "agent_memories_importance_check" CHECK ((("importance" >= 1) AND ("importance" <= 10))),
    CONSTRAINT "agent_memories_kind_check" CHECK (("kind" = ANY (ARRAY['fact'::"text", 'preference'::"text", 'history'::"text", 'decision'::"text"])))
);


ALTER TABLE "public"."agent_memories" OWNER TO "postgres";


COMMENT ON TABLE "public"."agent_memories" IS 'Memória persistente de agentes. expires_at NULL = sem expiração.';



COMMENT ON COLUMN "public"."agent_memories"."importance" IS '1 = trivial, 10 = crítico. Usado para priorizar contexto no prompt.';



CREATE TABLE IF NOT EXISTS "public"."agent_prompts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "agent_id" "text" NOT NULL,
    "tenant_id" "uuid",
    "version" integer DEFAULT 1 NOT NULL,
    "prompt" "text" NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."agent_prompts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."agent_runs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "agent_id" "text",
    "triggered_by" "uuid",
    "trigger_dev_run_id" "text",
    "status" "text" DEFAULT 'queued'::"text" NOT NULL,
    "input" "jsonb",
    "output" "jsonb",
    "cost_usd" numeric(10,4),
    "duration_ms" integer,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "completed_at" timestamp with time zone,
    "explanation" "text",
    "confidence_score" numeric,
    "pipeline_stage" "text",
    "pipeline_position" integer,
    CONSTRAINT "agent_runs_status_check" CHECK (("status" = ANY (ARRAY['queued'::"text", 'running'::"text", 'success'::"text", 'failed'::"text"])))
);

ALTER TABLE ONLY "public"."agent_runs" REPLICA IDENTITY FULL;


ALTER TABLE "public"."agent_runs" OWNER TO "postgres";


COMMENT ON TABLE "public"."agent_runs" IS 'Audit log de execuções. Nunca deletar — append-only por convenção.';



CREATE TABLE IF NOT EXISTS "public"."agent_skills" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid",
    "nome" "text" NOT NULL,
    "descricao" "text",
    "conteudo" "text",
    "ativo" boolean DEFAULT true NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."agent_skills" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."agent_ticket_activity" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "ticket_id" "uuid" NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "event_type" "text" NOT NULL,
    "actor" "text" NOT NULL,
    "old_value" "text",
    "new_value" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."agent_ticket_activity" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."agent_ticket_comments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "ticket_id" "uuid" NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "author" "text" NOT NULL,
    "body" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."agent_ticket_comments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."agent_tickets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "priority" "text" DEFAULT 'medium'::"text" NOT NULL,
    "assignee_agent" "text",
    "goal_id" "uuid",
    "locked_at" timestamp with time zone,
    "locked_by" "text",
    "lock_timeout_seconds" integer DEFAULT 1800,
    "source_agent" "text",
    "source_session_id" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "agent_tickets_priority_check" CHECK (("priority" = ANY (ARRAY['urgent'::"text", 'high'::"text", 'medium'::"text", 'low'::"text"]))),
    CONSTRAINT "agent_tickets_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'in_progress'::"text", 'blocked'::"text", 'review'::"text", 'resolved'::"text", 'closed'::"text"])))
);


ALTER TABLE "public"."agent_tickets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."agente_analises" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "agente" "text" NOT NULL,
    "loja_id" "uuid",
    "status" "text" DEFAULT 'pendente'::"text" NOT NULL,
    "resultado" "jsonb",
    "erro_detalhe" "text",
    "custo_usd" numeric,
    "solicitado_por" "uuid",
    "processado_em" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "agente_analises_status_check" CHECK (("status" = ANY (ARRAY['pendente'::"text", 'processado'::"text", 'erro'::"text"])))
);


ALTER TABLE "public"."agente_analises" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."agents" (
    "id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "role" "text" NOT NULL,
    "letter" "text" NOT NULL,
    "color" "text" NOT NULL,
    "description" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "category" "text",
    "default_modo" "text" DEFAULT 'hibrido'::"text" NOT NULL,
    "is_custom" boolean DEFAULT false,
    "custom_prompt" "text",
    "custom_model" "text" DEFAULT 'claude-haiku-4-5-20251001'::"text",
    "custom_max_tokens" integer DEFAULT 4096,
    "tenant_id" "uuid",
    CONSTRAINT "agents_category_check" CHECK (("category" = ANY (ARRAY['orchestrator'::"text", 'specialist'::"text"]))),
    CONSTRAINT "agents_default_modo_check" CHECK (("default_modo" = ANY (ARRAY['humano'::"text", 'hibrido'::"text", 'ia'::"text"])))
);


ALTER TABLE "public"."agents" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."analise_loja" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "loja_id" "uuid",
    "status" "text" DEFAULT 'pendente'::"text" NOT NULL,
    "diagnostico" "jsonb",
    "erro_detalhe" "text",
    "custo_usd" numeric,
    "solicitado_por" "uuid",
    "processado_em" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "analise_loja_status_check" CHECK (("status" = ANY (ARRAY['pendente'::"text", 'processado'::"text", 'erro'::"text"])))
);


ALTER TABLE "public"."analise_loja" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."analises" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "job_id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "cliente_id" "uuid",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "drive_link" "text",
    "periodo" "text",
    "tipo_analise" "text" DEFAULT 'ifood'::"text",
    "resultado_json" "jsonb",
    "html_relatorio" "text",
    "mensagem_whatsapp" "text",
    "error_message" "text",
    "whatsapp_sent" boolean DEFAULT false,
    "criado_por" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "loja_id" "uuid",
    "loom_url" "text",
    "transcricao" "text",
    "tipo" "text",
    "agent_run_id" "text",
    "relatorio_markdown" "text",
    "resumo_executivo" "text",
    "total_tarefas_geradas" integer DEFAULT 0,
    "enviada_em" timestamp with time zone,
    "enviada_via" "text",
    "message_id_evolution" "text",
    "numero_whatsapp_cliente" "text",
    "concluida_em" timestamp with time zone,
    "public_token" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "public_token_expires_at" timestamp with time zone DEFAULT ("now"() + '60 days'::interval),
    CONSTRAINT "analises_periodo_check" CHECK (("periodo" = ANY (ARRAY['diaria'::"text", 'semanal'::"text", 'mensal'::"text"]))),
    CONSTRAINT "analises_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'processing'::"text", 'done'::"text", 'error'::"text", 'rascunho'::"text", 'processando'::"text", 'processada'::"text", 'erro'::"text", 'enviada_cliente'::"text", 'concluida'::"text"])))
);

ALTER TABLE ONLY "public"."analises" REPLICA IDENTITY FULL;


ALTER TABLE "public"."analises" OWNER TO "postgres";


COMMENT ON COLUMN "public"."analises"."status" IS 'Status do ciclo de vida da análise.
   Legado analise-ifood (EN): pending → processing → done | error.
   Onda 04 (PT): rascunho → processando → processada → enviada_cliente | erro.
   Ambos conjuntos válidos permanentemente — não migrar dados entre conjuntos.';



COMMENT ON COLUMN "public"."analises"."loja_id" IS 'Referência à loja (lojas.id). Onda 04: permite vincular análise diretamente a uma loja sem depender de cliente_id.';



COMMENT ON COLUMN "public"."analises"."loom_url" IS 'URL do vídeo Loom gravado durante a análise. Onda 04: entregue junto com o relatório via WhatsApp.';



COMMENT ON COLUMN "public"."analises"."transcricao" IS 'Transcrição gerada a partir do áudio do vídeo Loom (via Whisper/AssemblyAI).';



COMMENT ON COLUMN "public"."analises"."tipo" IS 'Discriminador Onda 04 para subtipo da análise (ex: loom_analise, analise_completa). Diferente de tipo_analise (legado).';



COMMENT ON COLUMN "public"."analises"."agent_run_id" IS 'Referência ao run do agente Trigger.dev que gerou esta análise (agent_runs.id). Para rastreabilidade.';



COMMENT ON COLUMN "public"."analises"."relatorio_markdown" IS 'Relatório completo da análise em formato Markdown. Alternativa ao html_relatorio para uso em WhatsApp/Loom.';



COMMENT ON COLUMN "public"."analises"."resumo_executivo" IS 'Resumo executivo curto (3-5 parágrafos) enviado via WhatsApp ao cliente/loja.';



COMMENT ON COLUMN "public"."analises"."total_tarefas_geradas" IS 'Contador de tarefas geradas automaticamente a partir desta análise (denormalizado para performance).';



COMMENT ON COLUMN "public"."analises"."enviada_em" IS 'Timestamp de quando a análise foi enviada ao destinatário (WhatsApp ou outro canal).';



COMMENT ON COLUMN "public"."analises"."enviada_via" IS 'Canal pelo qual a análise foi enviada (ex: whatsapp, email). Sem CHECK constraint — validação feita no app.';



COMMENT ON COLUMN "public"."analises"."message_id_evolution" IS 'ID da mensagem retornado pela Evolution API ao enviar. Usado para rastrear status de entrega.';



CREATE TABLE IF NOT EXISTS "public"."asaas_eventos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "contrato_id" "uuid",
    "asaas_charge_id" "text" NOT NULL,
    "evento_tipo" "text" NOT NULL,
    "payload" "jsonb",
    "received_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."asaas_eventos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."atendimento_avaliacoes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "conversation_id" "uuid",
    "assigned_to" "uuid",
    "agent_id" "text",
    "atendente_nome" "text",
    "public_token" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "public_token_expires_at" timestamp with time zone DEFAULT ("now"() + '7 days'::interval) NOT NULL,
    "nota" smallint,
    "comentario" "text",
    "nome_cliente" "text",
    "status" "text" DEFAULT 'pendente'::"text" NOT NULL,
    "responded_at" timestamp with time zone,
    "tratativa_status" "text" DEFAULT 'na'::"text" NOT NULL,
    "tratativa_obs" "text",
    "tratativa_by" "uuid",
    "tratativa_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "contact_identifier" "text",
    "origem" "text" DEFAULT 'interno'::"text" NOT NULL,
    "external_ref" "text",
    "msg_enviada_at" timestamp with time zone,
    "msg_enviada_status" "text",
    "atendimento_inicio_at" timestamp with time zone,
    "atendimento_fim_at" timestamp with time zone,
    "duracao_minutos" integer,
    "qtd_mensagens" integer,
    "contact_phone" "text",
    "ticket_code" integer,
    "loja_id" "uuid",
    CONSTRAINT "atendimento_avaliacoes_nota_check" CHECK ((("nota" >= 1) AND ("nota" <= 5))),
    CONSTRAINT "atendimento_avaliacoes_origem_check" CHECK (("origem" = ANY (ARRAY['interno'::"text", 'crm_externo'::"text"]))),
    CONSTRAINT "atendimento_avaliacoes_status_check" CHECK (("status" = ANY (ARRAY['pendente'::"text", 'respondida'::"text", 'expirada'::"text"]))),
    CONSTRAINT "atendimento_avaliacoes_tratativa_status_check" CHECK (("tratativa_status" = ANY (ARRAY['na'::"text", 'pendente'::"text", 'em_andamento'::"text", 'resolvido'::"text"])))
);


ALTER TABLE "public"."atendimento_avaliacoes" OWNER TO "postgres";


COMMENT ON TABLE "public"."atendimento_avaliacoes" IS 'Avaliações CSAT pós-atendimento. Uma linha por conversa fechada. O token público (public_token) é usado na página de avaliação sem autenticação. Página pública consome via Bridge com service-role (sem policy anon).';



COMMENT ON COLUMN "public"."atendimento_avaliacoes"."assigned_to" IS 'UUID do atendente no momento do fechamento. Snapshot — sem FK viva para sobreviver saída do usuário.';



COMMENT ON COLUMN "public"."atendimento_avaliacoes"."agent_id" IS 'agent_id da conversa no momento do fechamento (ex: "breno"). Snapshot.';



COMMENT ON COLUMN "public"."atendimento_avaliacoes"."atendente_nome" IS 'full_name do atendente capturado em profiles.full_name no momento do fechamento. Snapshot.';



COMMENT ON COLUMN "public"."atendimento_avaliacoes"."public_token" IS 'UUID único enviado no link da pesquisa. Nunca reutilizar. Expira em public_token_expires_at.';



COMMENT ON COLUMN "public"."atendimento_avaliacoes"."nota" IS 'Nota de 1 a 5. NULL enquanto o cliente ainda não respondeu (status=pendente).';



COMMENT ON COLUMN "public"."atendimento_avaliacoes"."tratativa_status" IS 'na=não aplicável (nota >= 4), pendente=reclamação aberta, em_andamento=supervisor atuando, resolvido=encerrado.';



COMMENT ON COLUMN "public"."atendimento_avaliacoes"."tratativa_by" IS 'UUID do usuário que registrou a tratativa. Snapshot — sem FK viva.';



COMMENT ON COLUMN "public"."atendimento_avaliacoes"."duracao_minutos" IS 'Duração do atendimento em minutos (abertura → finalização), capturada do DataCrazy.';



COMMENT ON COLUMN "public"."atendimento_avaliacoes"."ticket_code" IS 'Número do ticket/atendimento no Datacrazy (currentThread.code). Usado na notificação de detrator e para localizar o atendimento no painel.';



COMMENT ON COLUMN "public"."atendimento_avaliacoes"."loja_id" IS 'Fase 1c: vínculo opcional à loja. Preenchido quando a loja passa a operar atendimento pela plataforma.';



CREATE TABLE IF NOT EXISTS "public"."audit_log" (
    "id" bigint NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "user_id" "uuid",
    "agent_name" "text",
    "action" "text" NOT NULL,
    "resource" "text",
    "metadata" "jsonb",
    "ip_address" "inet",
    "user_agent" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."audit_log" OWNER TO "postgres";


COMMENT ON TABLE "public"."audit_log" IS 'Log imutável de todas as ações relevantes. Append-only: sem UPDATE, sem DELETE.';



CREATE SEQUENCE IF NOT EXISTS "public"."audit_log_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."audit_log_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."audit_log_id_seq" OWNED BY "public"."audit_log"."id";



CREATE TABLE IF NOT EXISTS "public"."avaliacao_config" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "csat_auto_envio" boolean DEFAULT true NOT NULL,
    "csat_mensagem_template" "text" DEFAULT 'Olá {nome_cliente}! 😊 Seu atendimento foi encerrado. Que tal avaliar como foi? Leva menos de 1 minuto: {link_avaliacao}'::"text" NOT NULL,
    "nps_auto_envio" boolean DEFAULT true NOT NULL,
    "nps_mensagem_template" "text" DEFAULT 'Olá {nome_cliente}! Gostaríamos de saber sua opinião sobre a {nome_empresa}. Responda nossa pesquisa rápida: {link_nps}'::"text" NOT NULL,
    "nps_cooldown_dias" smallint DEFAULT 30 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "datacrazy_api_key" "text",
    "nome_empresa" "text" DEFAULT 'nossa empresa'::"text",
    "csat_titulo" "text",
    "csat_subtitulo" "text",
    "csat_agradecimento" "text",
    "nps_titulo" "text",
    "nps_subtitulo" "text",
    "nps_agradecimento" "text",
    "detrator_notificar" boolean DEFAULT true,
    "detrator_wpp_jid" "text",
    "detrator_msg_template" "text",
    "nps_threshold_detrator" smallint DEFAULT 6,
    "nps_template_hsm_id" "text",
    "maia_autonomy_mode" "text" DEFAULT 'aprovacao'::"text",
    "maia_sla_horas" integer DEFAULT 48,
    "piloto_telefone_teste" "text",
    "nps_baseline_at" timestamp with time zone,
    "nps_min_atendimentos" integer DEFAULT 4 NOT NULL
);


ALTER TABLE "public"."avaliacao_config" OWNER TO "postgres";


COMMENT ON COLUMN "public"."avaliacao_config"."piloto_telefone_teste" IS 'Número de teste (só DDD+número, sem @s.whatsapp.net). Quando preenchido, o NPS é enviado para este número via Evolution API em vez de ir para o cliente real no DataCrazy. Usar durante piloto para validar o fluxo sem impactar clientes.';



COMMENT ON COLUMN "public"."avaliacao_config"."nps_baseline_at" IS 'Marco de go-live. O dispatcher (datacrazy-nps-poller) só processa conversas cujo updatedAt > nps_baseline_at, suprimindo o backlog de conversas já finalizadas antes da ativação. Setar = now() ao ativar o tenant em produção.';



COMMENT ON COLUMN "public"."avaliacao_config"."nps_min_atendimentos" IS 'A partir de qual atendimento finalizado o NPS pode ser enviado (default 4). Atendimentos abaixo desse número recebem CSAT. Acima, recebem NPS se fora do cooldown de 30 dias.';



CREATE TABLE IF NOT EXISTS "public"."avaliacoes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "loja_id" "uuid" NOT NULL,
    "nota" integer,
    "comentario" "text" NOT NULL,
    "nome_cliente" "text",
    "tipo" "text" NOT NULL,
    "prazo_label" "text",
    "resposta_sugerida" "text",
    "resposta_final" "text",
    "insights_consultoria" "text",
    "status" "text" DEFAULT 'gerada'::"text" NOT NULL,
    "draft_id" "uuid",
    "ajuste_pedido" "text",
    "run_id" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "avaliacoes_nota_check" CHECK ((("nota" >= 1) AND ("nota" <= 5))),
    CONSTRAINT "avaliacoes_status_check" CHECK (("status" = ANY (ARRAY['gerada'::"text", 'nao_responder'::"text", 'enviada_grupo'::"text", 'aprovada_cliente'::"text", 'ajuste_pedido'::"text", 'postada'::"text", 'descartada'::"text"]))),
    CONSTRAINT "avaliacoes_tipo_check" CHECK (("tipo" = ANY (ARRAY['loja'::"text", 'entrega'::"text"])))
);


ALTER TABLE "public"."avaliacoes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."avaliacoes_loja_config" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "loja_id" "uuid" NOT NULL,
    "logistica_tipo" "text" NOT NULL,
    "tom" "text",
    "tom_sugerido_ia" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "avaliacoes_loja_config_logistica_tipo_check" CHECK (("logistica_tipo" = ANY (ARRAY['ifood_logistica'::"text", 'entrega_propria'::"text"])))
);


ALTER TABLE "public"."avaliacoes_loja_config" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."bom_dia_config" (
    "tenant_id" "uuid" NOT NULL,
    "auto_send" boolean DEFAULT false NOT NULL,
    "hora_semana" time without time zone DEFAULT '09:00:00'::time without time zone NOT NULL,
    "hora_sabado" time without time zone DEFAULT '08:00:00'::time without time zone NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."bom_dia_config" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."bom_dia_feedback" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "run_id" "uuid" NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "vote" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "comment" "text",
    CONSTRAINT "bom_dia_feedback_vote_check" CHECK (("vote" = ANY (ARRAY['thumbs_up'::"text", 'thumbs_down'::"text"])))
);


ALTER TABLE "public"."bom_dia_feedback" OWNER TO "postgres";


COMMENT ON COLUMN "public"."bom_dia_feedback"."comment" IS 'Comentário livre do usuário ao registrar o voto. Nullable — campo opcional.';



CREATE TABLE IF NOT EXISTS "public"."bot_configs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "is_active" boolean DEFAULT false NOT NULL,
    "schedule" "jsonb" DEFAULT '{"fri": {"on": true, "end": "18:00", "start": "09:00"}, "mon": {"on": true, "end": "18:00", "start": "09:00"}, "sat": {"on": false, "end": "13:00", "start": "09:00"}, "sun": {"on": false, "end": "13:00", "start": "09:00"}, "thu": {"on": true, "end": "18:00", "start": "09:00"}, "tue": {"on": true, "end": "18:00", "start": "09:00"}, "wed": {"on": true, "end": "18:00", "start": "09:00"}}'::"jsonb" NOT NULL,
    "message" "text" DEFAULT 'Olá! No momento estamos fora do horário de atendimento. Em breve um consultor irá te atender. 🚀'::"text" NOT NULL,
    "respond_only_first" boolean DEFAULT true NOT NULL,
    "timezone" "text" DEFAULT 'America/Sao_Paulo'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "extra_messages" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "respond_to_groups" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."bot_configs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."bot_reply_log" (
    "conversation_id" "uuid" NOT NULL,
    "reply_date" "date" NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."bot_reply_log" OWNER TO "postgres";


COMMENT ON TABLE "public"."bot_reply_log" IS 'Registro atomico de bot replies por dia por conversa. PK (conversation_id, reply_date) eh usada como guard contra race conditions quando respond_only_first=true.';



CREATE TABLE IF NOT EXISTS "public"."breno_interactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "conversation_id" "uuid" NOT NULL,
    "inbound_message_id" "text" NOT NULL,
    "outbound_message_id" "text",
    "mode" "text" NOT NULL,
    "breno_response" "text" NOT NULL,
    "action_taken" "text" NOT NULL,
    "agent_run_id" "uuid",
    "requires_review" boolean DEFAULT false NOT NULL,
    "reviewed_at" timestamp with time zone,
    "reviewed_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "breno_interactions_action_taken_check" CHECK (("action_taken" = ANY (ARRAY['sent'::"text", 'suggested'::"text", 'skipped'::"text"]))),
    CONSTRAINT "breno_interactions_mode_check" CHECK (("mode" = ANY (ARRAY['humano'::"text", 'hibrido'::"text", 'ia'::"text"])))
);


ALTER TABLE "public"."breno_interactions" OWNER TO "postgres";


COMMENT ON TABLE "public"."breno_interactions" IS 'Audit log de cada decisão que o agente BRENO tomou ao receber uma mensagem WhatsApp.';



COMMENT ON COLUMN "public"."breno_interactions"."inbound_message_id" IS 'ID da mensagem WhatsApp recebida (whatsapp_msg_id) que disparou BRENO.';



COMMENT ON COLUMN "public"."breno_interactions"."outbound_message_id" IS 'ID Evolution API da mensagem de resposta enviada. Preenchido apenas quando action_taken = sent.';



COMMENT ON COLUMN "public"."breno_interactions"."mode" IS 'Modo de operação do BRENO no momento da decisão: humano (BRENO silencioso), hibrido (sugere), ia (envia direto).';



COMMENT ON COLUMN "public"."breno_interactions"."breno_response" IS 'Texto gerado pelo BRENO, independente de ter sido enviado, sugerido ou ignorado.';



COMMENT ON COLUMN "public"."breno_interactions"."action_taken" IS 'sent = enviado via Evolution; suggested = exibido ao Eduardo para aprovação; skipped = descartado.';



COMMENT ON COLUMN "public"."breno_interactions"."agent_run_id" IS 'Referência ao run Trigger.dev que gerou esta resposta. Permite correlacionar custo e duração.';



COMMENT ON COLUMN "public"."breno_interactions"."requires_review" IS 'true quando BRENO sinalizou que a resposta precisa de revisão humana antes de nova interação.';



COMMENT ON COLUMN "public"."breno_interactions"."reviewed_at" IS 'Timestamp em que um humano (Eduardo ou admin) revisou e liberou esta interação.';



COMMENT ON COLUMN "public"."breno_interactions"."reviewed_by" IS 'UUID do usuário que fez a revisão.';



CREATE TABLE IF NOT EXISTS "public"."breno_message_buffer" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "conversation_id" "text" NOT NULL,
    "remote_jid" "text" NOT NULL,
    "instance_name" "text" NOT NULL,
    "push_name" "text",
    "buffered_messages" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "last_message_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."breno_message_buffer" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."breno_triagem" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "origem" "text" NOT NULL,
    "remote_jid" "text" NOT NULL,
    "cliente_nome" "text",
    "cliente_numero" "text",
    "loja_id" "uuid",
    "nivel" "text" NOT NULL,
    "categoria" "text",
    "resumo" "text",
    "mensagem_raw" "text" NOT NULL,
    "confianca" numeric,
    "notificado" boolean DEFAULT false NOT NULL,
    "notificado_em" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "confirmado" boolean DEFAULT false NOT NULL,
    "confirmado_em" timestamp with time zone,
    "acao_confirmada" "text",
    CONSTRAINT "breno_triagem_acao_confirmada_check" CHECK (("acao_confirmada" = ANY (ARRAY['suporte'::"text", 'amanha'::"text", 'ignorar'::"text"]))),
    CONSTRAINT "breno_triagem_categoria_check" CHECK (("categoria" = ANY (ARRAY['suporte'::"text", 'demanda'::"text", 'venda'::"text", 'duvida'::"text", 'outro'::"text"]))),
    CONSTRAINT "breno_triagem_nivel_check" CHECK (("nivel" = ANY (ARRAY['urgente'::"text", 'normal'::"text", 'ignorar'::"text"]))),
    CONSTRAINT "breno_triagem_origem_check" CHECK (("origem" = ANY (ARRAY['grupo'::"text", 'pv'::"text"])))
);


ALTER TABLE "public"."breno_triagem" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."campanha_ativos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "campanha_id" "uuid" NOT NULL,
    "variacao" integer NOT NULL,
    "legenda" "text" NOT NULL,
    "midia_url" "text",
    "tipo_midia" "text",
    "fonte" "text" DEFAULT 'nexus'::"text" NOT NULL,
    "selecionada" boolean DEFAULT false,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "ts" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "campanha_ativos_fonte_check" CHECK (("fonte" = ANY (ARRAY['nexus'::"text", 'upload_manual'::"text", 'gerado_lara'::"text", 'editado'::"text"]))),
    CONSTRAINT "campanha_ativos_tipo_midia_check" CHECK (("tipo_midia" = ANY (ARRAY['imagem'::"text", 'video'::"text", 'audio'::"text"]))),
    CONSTRAINT "campanha_ativos_variacao_check" CHECK ((("variacao" >= 1) AND ("variacao" <= 5)))
);


ALTER TABLE "public"."campanha_ativos" OWNER TO "postgres";


COMMENT ON TABLE "public"."campanha_ativos" IS 'Variações de legenda + mídia geradas pelo Nexus para cada campanha. Tipicamente 3 variações.';



COMMENT ON COLUMN "public"."campanha_ativos"."selecionada" IS 'Marca qual variação a Wélida escolheu pra disparar.';



CREATE TABLE IF NOT EXISTS "public"."campanhas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "regua_id" "uuid" NOT NULL,
    "ordem" integer NOT NULL,
    "nome_campanha" "text" NOT NULL,
    "estagio_funil" "text",
    "objetivo" "text" NOT NULL,
    "tipo_campanha" "text" NOT NULL,
    "publico_alvo" "text" NOT NULL,
    "publico_excluir" "text",
    "dia_envio" "text",
    "horario_envio" "text",
    "justificativa_horario" "text",
    "canal" "text" NOT NULL,
    "categoria_meta" "text",
    "usa_cupom" boolean DEFAULT false,
    "cupom_jsonb" "jsonb",
    "como_criar" "text",
    "kpi_sucesso" "text",
    "status" "text" DEFAULT 'rascunho'::"text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "conteudo_gerado" "jsonb",
    "agent_run_id" "text",
    "tom_override" "text",
    CONSTRAINT "campanhas_canal_check" CHECK (("canal" = ANY (ARRAY['whatsapp_oficial'::"text", 'whatsapp_nao_oficial'::"text", 'sms'::"text", 'email'::"text"]))),
    CONSTRAINT "campanhas_categoria_meta_check" CHECK (("categoria_meta" = ANY (ARRAY['utility'::"text", 'marketing'::"text"]))),
    CONSTRAINT "campanhas_estagio_funil_check" CHECK (("estagio_funil" = ANY (ARRAY['lead_frio'::"text", 'primeiro_pedido'::"text", 'recorrente_novo'::"text", 'recorrente_fiel'::"text", 'inativo_recente'::"text", 'inativo_medio'::"text", 'cliente_perdido'::"text", 'aniversariante'::"text", 'pesquisa_satisfacao'::"text"]))),
    CONSTRAINT "campanhas_objetivo_check" CHECK (("objetivo" = ANY (ARRAY['vendas'::"text", 'relacionamento'::"text", 'fidelizacao'::"text", 'pesquisa'::"text"]))),
    CONSTRAINT "campanhas_status_check" CHECK (("status" = ANY (ARRAY['rascunho'::"text", 'aguardando_midia'::"text", 'pronta'::"text", 'rejeitada'::"text", 'em_execucao'::"text", 'concluida'::"text"]))),
    CONSTRAINT "campanhas_tipo_campanha_check" CHECK (("tipo_campanha" = ANY (ARRAY['gatilho_evento'::"text", 'disparo_continuo'::"text", 'disparo_unico'::"text"])))
);


ALTER TABLE "public"."campanhas" OWNER TO "postgres";


COMMENT ON TABLE "public"."campanhas" IS 'Cada campanha individual dentro de uma régua. Tipicamente 25-40 campanhas por régua de 90 dias.';



COMMENT ON COLUMN "public"."campanhas"."cupom_jsonb" IS 'Estrutura: {nome, tipo (percentual|valor_fixo|frete_gratis|brinde), valor, pedido_minimo, validade_dias}';



CREATE TABLE IF NOT EXISTS "public"."channel_members" (
    "channel_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "joined_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."channel_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."channel_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "channel_id" "uuid" NOT NULL,
    "sender_id" "uuid",
    "sender_name" "text" DEFAULT 'Usuário'::"text" NOT NULL,
    "text" "text" NOT NULL,
    "is_pinned" boolean DEFAULT false NOT NULL,
    "pinned_at" timestamp with time zone,
    "task_created" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "media_url" "text",
    "media_type" "text"
);


ALTER TABLE "public"."channel_messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."chat_tasks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text" DEFAULT ''::"text",
    "status" "text" DEFAULT 'todo'::"text" NOT NULL,
    "priority" "text" DEFAULT 'normal'::"text" NOT NULL,
    "assignee_id" "uuid",
    "contact_name" "text",
    "due_date" "date",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "loja_id" "uuid",
    CONSTRAINT "chat_tasks_priority_check" CHECK (("priority" = ANY (ARRAY['urgent'::"text", 'high'::"text", 'normal'::"text", 'low'::"text"]))),
    CONSTRAINT "chat_tasks_status_check" CHECK (("status" = ANY (ARRAY['ai_suggestion'::"text", 'todo'::"text", 'doing'::"text", 'waiting'::"text", 'blocked'::"text", 'canceled'::"text", 'done'::"text"])))
);


ALTER TABLE "public"."chat_tasks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."client_facts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "loja_id" "uuid" NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "source_agent" "text",
    "category" "text" NOT NULL,
    "key" "text" NOT NULL,
    "confidence" real DEFAULT 1.0 NOT NULL,
    "expires_at" timestamp with time zone,
    "ts" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "value" "jsonb" DEFAULT '{}'::"jsonb"
);


ALTER TABLE "public"."client_facts" OWNER TO "postgres";


COMMENT ON TABLE "public"."client_facts" IS 'Fatos duráveis sobre lojas. category: preferencia, restricao, historico, objetivo, risco. Agentes leem antes de agir e atualizam após aprender.';



COMMENT ON COLUMN "public"."client_facts"."source_agent" IS 'Agente que registrou o fato (ex: analista-ifood, deli)';



COMMENT ON COLUMN "public"."client_facts"."key" IS 'Identificador do fato (ex: "preferencia_contato", "ticket_habitual")';



COMMENT ON COLUMN "public"."client_facts"."confidence" IS 'Confiança do fato: 0.0 (incerto) a 1.0 (certeza)';



COMMENT ON COLUMN "public"."client_facts"."ts" IS 'Timestamp de criação do fato';



COMMENT ON COLUMN "public"."client_facts"."value" IS 'Valor JSONB do fato. Para fatos livres: {"text": "..."}';



CREATE TABLE IF NOT EXISTS "public"."client_tasks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "customer_id" "uuid" NOT NULL,
    "phase_id" "text" DEFAULT 'onboarding'::"text",
    "title" "text" NOT NULL,
    "description" "text",
    "status" "text" DEFAULT 'todo'::"text" NOT NULL,
    "priority" "text" DEFAULT 'normal'::"text" NOT NULL,
    "due_date" "date",
    "assignee_id" "uuid",
    "agent_id" "text",
    "position" integer DEFAULT 0,
    "flag" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "list_id" "uuid",
    "column_id" "uuid",
    "conversation_id" "uuid",
    "loop_state" "text",
    "target_system" "text",
    "execution_run_id" "text",
    "execution_result" "jsonb",
    "proposal_id" "uuid",
    CONSTRAINT "client_tasks_loop_state_check" CHECK (("loop_state" = ANY (ARRAY['open'::"text", 'executing'::"text", 'done'::"text", 'aguardando_autorizacao_ceo'::"text"]))),
    CONSTRAINT "client_tasks_priority_check" CHECK (("priority" = ANY (ARRAY['urgent'::"text", 'high'::"text", 'normal'::"text", 'low'::"text"]))),
    CONSTRAINT "client_tasks_status_check" CHECK (("status" = ANY (ARRAY['todo'::"text", 'doing'::"text", 'waiting'::"text", 'blocked'::"text", 'canceled'::"text", 'done'::"text"]))),
    CONSTRAINT "client_tasks_target_system_check" CHECK (("target_system" = ANY (ARRAY['vendaerp'::"text", 'asaas'::"text", 'nenhum'::"text"])))
);

ALTER TABLE ONLY "public"."client_tasks" REPLICA IDENTITY FULL;


ALTER TABLE "public"."client_tasks" OWNER TO "postgres";


COMMENT ON COLUMN "public"."client_tasks"."loop_state" IS 'Estado loop: open | executing | done.';



COMMENT ON COLUMN "public"."client_tasks"."target_system" IS 'Sistema alvo: vendaerp | asaas | nenhum.';



CREATE TABLE IF NOT EXISTS "public"."client_timeline" (
    "id" bigint NOT NULL,
    "loja_id" "uuid" NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "agent_name" "text",
    "event_type" "text" NOT NULL,
    "title" "text" NOT NULL,
    "payload" "jsonb",
    "ts" timestamp with time zone DEFAULT "now"() NOT NULL,
    "description" "text",
    "user_id" "uuid"
);


ALTER TABLE "public"."client_timeline" OWNER TO "postgres";


COMMENT ON TABLE "public"."client_timeline" IS 'Linha do tempo imutável de eventos por loja. event_type: analise, cobranca, mensagem, reuniao, meta, alerta. Append-only: sem UPDATE.';



COMMENT ON COLUMN "public"."client_timeline"."title" IS 'Título curto do evento (obrigatório)';



COMMENT ON COLUMN "public"."client_timeline"."payload" IS 'Dados extras do evento em JSONB';



COMMENT ON COLUMN "public"."client_timeline"."ts" IS 'Timestamp do evento (imutável)';



COMMENT ON COLUMN "public"."client_timeline"."description" IS 'Descrição expandida do evento (opcional)';



COMMENT ON COLUMN "public"."client_timeline"."user_id" IS 'Usuário humano que originou o evento (se aplicável)';



CREATE SEQUENCE IF NOT EXISTS "public"."client_timeline_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."client_timeline_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."client_timeline_id_seq" OWNED BY "public"."client_timeline"."id";



CREATE TABLE IF NOT EXISTS "public"."cobranca_eventos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "cobranca_id" "uuid" NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "event_type" "text" NOT NULL,
    "old_status" "text",
    "new_status" "text",
    "triggered_by" "text" DEFAULT 'manual'::"text" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "cobranca_eventos_event_type_check" CHECK (("event_type" = ANY (ARRAY['created'::"text", 'status_changed'::"text", 'payment_received'::"text", 'cora_acted'::"text", 'manual'::"text"]))),
    CONSTRAINT "cobranca_eventos_triggered_by_check" CHECK (("triggered_by" = ANY (ARRAY['asaas_webhook'::"text", 'cora'::"text", 'manual'::"text"])))
);


ALTER TABLE "public"."cobranca_eventos" OWNER TO "postgres";


COMMENT ON TABLE "public"."cobranca_eventos" IS 'Audit trail imutável de eventos de cobrança. Alimentado pelo webhook Asaas e por ações CORA/manual. Nunca atualizar nem deletar linhas desta tabela.';



COMMENT ON COLUMN "public"."cobranca_eventos"."cobranca_id" IS 'FK para cobrancas(id). Cascade delete: se a cobrança for removida (raro), o histórico some junto.';



COMMENT ON COLUMN "public"."cobranca_eventos"."tenant_id" IS 'Redundante com cobrancas.tenant_id mas necessário para RLS sem JOIN obrigatório e para índice composto por tenant.';



COMMENT ON COLUMN "public"."cobranca_eventos"."event_type" IS 'Tipo do evento: created=cobrança criada, status_changed=mudança de status, payment_received=pagamento confirmado, cora_acted=CORA tomou ação, manual=operação manual pelo time.';



COMMENT ON COLUMN "public"."cobranca_eventos"."old_status" IS 'Status anterior da cobrança antes do evento. NULL quando event_type = created.';



COMMENT ON COLUMN "public"."cobranca_eventos"."new_status" IS 'Status novo da cobrança após o evento. NULL quando não há mudança de status (ex: cora_acted sem troca de status).';



COMMENT ON COLUMN "public"."cobranca_eventos"."triggered_by" IS 'Origem do evento: asaas_webhook=callback Asaas, cora=agente CORA, manual=ação humana na plataforma.';



COMMENT ON COLUMN "public"."cobranca_eventos"."metadata" IS 'Dados adicionais sem schema fixo. Ex: payload bruto do webhook Asaas, ID do run da CORA, usuário que executou ação manual.';



COMMENT ON COLUMN "public"."cobranca_eventos"."created_at" IS 'Timestamp imutável do evento. Sem updated_at — esta tabela não admite UPDATE.';



CREATE TABLE IF NOT EXISTS "public"."cobrancas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "cliente_id" "uuid",
    "asaas_charge_id" "text",
    "valor" numeric(10,2) NOT NULL,
    "vencimento" "date" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "billing_type" "text" DEFAULT 'PIX'::"text" NOT NULL,
    "invoice_url" "text",
    "bank_slip_url" "text",
    "pix_qr_code" "text",
    "customer_name" "text",
    "customer_phone" "text",
    "notas" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "payment_date" "date",
    "net_value" numeric,
    "date_created" "date",
    "invoice_viewed_date" timestamp with time zone,
    "description" "text",
    "confirmed_date" "date",
    "ignorar_cobranca" boolean DEFAULT false NOT NULL,
    "ignorar_motivo" "text",
    "loja_id" "uuid",
    CONSTRAINT "cobrancas_billing_type_check" CHECK (("billing_type" = ANY (ARRAY['BOLETO'::"text", 'PIX'::"text", 'CREDIT_CARD'::"text", 'UNDEFINED'::"text"]))),
    CONSTRAINT "cobrancas_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'received'::"text", 'overdue'::"text", 'refunded'::"text", 'canceled'::"text"])))
);


ALTER TABLE "public"."cobrancas" OWNER TO "postgres";


COMMENT ON TABLE "public"."cobrancas" IS 'Cobranças V2 gerenciadas via API Asaas. Não confundir com cora_cobrancas (V1).';



COMMENT ON COLUMN "public"."cobrancas"."cliente_id" IS 'FK para crm_customers(id). Pode ser NULL quando cliente ainda não está no CRM ou a FK ainda não foi validada.';



COMMENT ON COLUMN "public"."cobrancas"."asaas_charge_id" IS 'ID retornado pela API Asaas ao criar a cobrança (ex: pay_xxx). Único por tenant implicitamente pela constraint UNIQUE.';



COMMENT ON COLUMN "public"."cobrancas"."status" IS 'Status espelhado do Asaas: pending=aguardando, received=pago, overdue=vencido, refunded=estornado, canceled=cancelado.';



COMMENT ON COLUMN "public"."cobrancas"."billing_type" IS 'Tipo de cobrança conforme enum Asaas: PIX, BOLETO, CREDIT_CARD ou UNDEFINED.';



COMMENT ON COLUMN "public"."cobrancas"."invoice_url" IS 'URL da fatura gerada pelo Asaas (link de pagamento).';



COMMENT ON COLUMN "public"."cobrancas"."bank_slip_url" IS 'URL do boleto bancário (somente billing_type = BOLETO).';



COMMENT ON COLUMN "public"."cobrancas"."pix_qr_code" IS 'Payload PIX copia-e-cola retornado pelo Asaas (somente billing_type = PIX).';



COMMENT ON COLUMN "public"."cobrancas"."customer_name" IS 'Cache do nome do cliente para evitar JOIN frequente em listagens. Atualizar quando crm_customers for alterado.';



COMMENT ON COLUMN "public"."cobrancas"."customer_phone" IS 'Cache do telefone do cliente. Mesmo racional que customer_name.';



COMMENT ON COLUMN "public"."cobrancas"."metadata" IS 'Dados adicionais sem schema fixo (ex: webhook payload bruto do Asaas, campos extras de integração).';



COMMENT ON COLUMN "public"."cobrancas"."payment_date" IS 'Data real do pagamento (paymentDate do Asaas)';



COMMENT ON COLUMN "public"."cobrancas"."net_value" IS 'Valor líquido após taxa Asaas (netValue)';



COMMENT ON COLUMN "public"."cobrancas"."date_created" IS 'Data de criação da cobrança no Asaas (dateCreated)';



COMMENT ON COLUMN "public"."cobrancas"."invoice_viewed_date" IS 'Timestamp em que o cliente visualizou a fatura (invoiceViewedDate)';



COMMENT ON COLUMN "public"."cobrancas"."description" IS 'Descrição da cobrança no Asaas';



COMMENT ON COLUMN "public"."cobrancas"."confirmed_date" IS 'Data de confirmação do pagamento (confirmedDate)';



COMMENT ON COLUMN "public"."cobrancas"."loja_id" IS 'Fase 1c: referência opcional à loja cobrada. tenant_id permanece na agência (receita da consultoria). Não usado por RLS.';



CREATE TABLE IF NOT EXISTS "public"."contact_optout" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "contact_identifier" "text" NOT NULL,
    "canal" "text" DEFAULT 'whatsapp'::"text" NOT NULL,
    "motivo" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."contact_optout" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."contact_tags" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid",
    "name" "text" NOT NULL,
    "color" "text" DEFAULT '#B70C00'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."contact_tags" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."contatos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "loja_origem_id" "uuid" NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "nome" "text",
    "whatsapp" "text",
    "cidade" "text",
    "client_id" "uuid",
    "metadata" "jsonb",
    "criado_em_lojas" timestamp with time zone,
    "migrado_em" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."contatos" OWNER TO "postgres";


COMMENT ON TABLE "public"."contatos" IS 'Contatos de WhatsApp que estavam misturados na tabela lojas (higienização Semana 2 B3, 2026-07-05). loja_origem_id aponta para a linha original em lojas, que NÃO foi apagada (só marcada is_contato=true).';



CREATE TABLE IF NOT EXISTS "public"."content_calendar" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "tema" "text" NOT NULL,
    "formato" "text" DEFAULT 'post'::"text" NOT NULL,
    "data_alvo" "date" NOT NULL,
    "status" "text" DEFAULT 'planejado'::"text" NOT NULL,
    "draft_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "content_calendar_formato_check" CHECK (("formato" = ANY (ARRAY['post'::"text", 'story'::"text", 'carrossel'::"text", 'reels'::"text"]))),
    CONSTRAINT "content_calendar_status_check" CHECK (("status" = ANY (ARRAY['planejado'::"text", 'gerado'::"text", 'revisao'::"text", 'publicado'::"text", 'cancelado'::"text"])))
);


ALTER TABLE "public"."content_calendar" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."content_drafts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "calendar_id" "uuid",
    "titulo" "text" NOT NULL,
    "corpo" "text" NOT NULL,
    "hashtags" "text"[],
    "formato" "text" DEFAULT 'post'::"text" NOT NULL,
    "status" "text" DEFAULT 'pendente'::"text" NOT NULL,
    "feedback" "text",
    "revisado_por" "uuid",
    "revisado_em" timestamp with time zone,
    "tokens_gastos" integer,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "content_drafts_status_check" CHECK (("status" = ANY (ARRAY['pendente'::"text", 'aprovado'::"text", 'rejeitado'::"text", 'publicado'::"text"])))
);


ALTER TABLE "public"."content_drafts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."content_published" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "draft_id" "uuid" NOT NULL,
    "titulo" "text" NOT NULL,
    "corpo" "text" NOT NULL,
    "hashtags" "text"[],
    "formato" "text" NOT NULL,
    "canal" "text" DEFAULT 'instagram'::"text" NOT NULL,
    "publicado_por" "uuid",
    "published_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "content_published_canal_check" CHECK (("canal" = ANY (ARRAY['instagram'::"text", 'linkedin'::"text", 'whatsapp'::"text", 'outro'::"text"])))
);


ALTER TABLE "public"."content_published" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."contratos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "customer_id" "uuid",
    "pacote" "text" NOT NULL,
    "valor_setup" numeric(10,2),
    "valor_mensal" numeric(10,2) NOT NULL,
    "percentual_crescimento" numeric(5,2),
    "duracao_meses" integer,
    "multa_percentual" numeric(5,2),
    "status" "text" DEFAULT 'rascunho'::"text" NOT NULL,
    "assinado_em" timestamp with time zone,
    "assinatura_hash" "text",
    "asaas_subscription_id" "text",
    "vigencia_inicio" "date",
    "vigencia_fim" "date",
    "pdf_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "pagamento_status" "text",
    "ultimo_pagamento_em" timestamp with time zone,
    "proxima_cobranca" timestamp with time zone,
    CONSTRAINT "contratos_pacote_check" CHECK (("pacote" = ANY (ARRAY['light'::"text", 'performance'::"text", 'enterprise'::"text", 'growth'::"text"]))),
    CONSTRAINT "contratos_status_check" CHECK (("status" = ANY (ARRAY['rascunho'::"text", 'enviado'::"text", 'assinado'::"text", 'encerrado'::"text"])))
);


ALTER TABLE "public"."contratos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."conversation_events" (
    "id" bigint NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "conversation_id" "uuid" NOT NULL,
    "event_type" "text" NOT NULL,
    "actor_id" "uuid",
    "actor_type" "text" DEFAULT 'user'::"text" NOT NULL,
    "actor_name" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "ts" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "conversation_events_actor_type_check" CHECK (("actor_type" = ANY (ARRAY['user'::"text", 'agent'::"text", 'system'::"text"]))),
    CONSTRAINT "conversation_events_event_type_check" CHECK (("event_type" = ANY (ARRAY['created'::"text", 'assigned'::"text", 'unassigned'::"text", 'transferred'::"text", 'tagged'::"text", 'untagged'::"text", 'closed'::"text", 'reopened'::"text", 'note_added'::"text", 'automation_executed'::"text"])))
);


ALTER TABLE "public"."conversation_events" OWNER TO "postgres";


COMMENT ON TABLE "public"."conversation_events" IS 'Eventos do sistema na timeline da conversa (finalizou, transferiu, etc). Imutável — apenas INSERT.';



COMMENT ON COLUMN "public"."conversation_events"."actor_name" IS 'Nome desnormalizado — preserva identidade mesmo após deleção do usuário.';



COMMENT ON COLUMN "public"."conversation_events"."metadata" IS 'Dados extras por tipo: ex: {dept_from, dept_to} para transferred, {tag_name} para tagged.';



ALTER TABLE "public"."conversation_events" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."conversation_events_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."conversation_status_log" (
    "id" bigint NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "conversation_id" "uuid" NOT NULL,
    "from_status" "text",
    "to_status" "text" NOT NULL,
    "changed_by" "uuid",
    "trigger" "text" DEFAULT 'manual'::"text" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "ts" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."conversation_status_log" OWNER TO "postgres";


COMMENT ON TABLE "public"."conversation_status_log" IS 'Log imutável de transições de status de conversa';



CREATE SEQUENCE IF NOT EXISTS "public"."conversation_status_log_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."conversation_status_log_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."conversation_status_log_id_seq" OWNED BY "public"."conversation_status_log"."id";



CREATE TABLE IF NOT EXISTS "public"."conversation_tags" (
    "conversation_id" "uuid" NOT NULL,
    "tag_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."conversation_tags" OWNER TO "postgres";


COMMENT ON TABLE "public"."conversation_tags" IS 'Tags aplicadas diretamente à conversa (N:N). Independente de customer_tags.';



CREATE TABLE IF NOT EXISTS "public"."conversations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid",
    "type" "text",
    "customer_id" "uuid",
    "agent_id" "text",
    "title" "text",
    "preview" "text",
    "unread_count" integer DEFAULT 0 NOT NULL,
    "is_online" boolean DEFAULT false NOT NULL,
    "status" "text" DEFAULT 'aguardando'::"text" NOT NULL,
    "last_message_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "instance_id" "uuid",
    "whatsapp_chat_id" "text",
    "is_group" boolean DEFAULT false,
    "group_name" "text",
    "push_name" "text",
    "contact_name" "text",
    "push_photo_url" "text",
    "assigned_to" "uuid",
    "started_at" timestamp with time zone,
    "finished_at" timestamp with time zone,
    "reopened_at" timestamp with time zone,
    "finished_by" "uuid",
    "reopened_by" "uuid",
    "internal_notes" "text",
    "status_v2" "public"."conversation_status_v2" DEFAULT 'open'::"public"."conversation_status_v2",
    "closed_at" timestamp with time zone,
    "closed_by" "uuid",
    "close_reason" "text",
    "department_id" "uuid",
    "previous_status" "text",
    "status_changed_at" timestamp with time zone DEFAULT "now"(),
    "status_changed_by" "uuid",
    "last_breno_handled_at" timestamp with time zone,
    "breno_paused" boolean DEFAULT false NOT NULL,
    "loop_status" "text",
    "active_task_id" "uuid",
    "attending_agent_id" "text",
    CONSTRAINT "conversations_loop_status_check" CHECK (("loop_status" = ANY (ARRAY['attending'::"text", 'task_pending'::"text", 'replied'::"text"]))),
    CONSTRAINT "conversations_status_check" CHECK (("status" = ANY (ARRAY['aguardando'::"text", 'em_atendimento'::"text", 'atendimento_aberto'::"text", 'automacao'::"text", 'finalizado'::"text", 'falha'::"text", 'archived'::"text"]))),
    CONSTRAINT "conversations_type_check" CHECK (("type" = ANY (ARRAY['whatsapp'::"text", 'internal'::"text", 'agent'::"text"])))
);

ALTER TABLE ONLY "public"."conversations" REPLICA IDENTITY FULL;


ALTER TABLE "public"."conversations" OWNER TO "postgres";


COMMENT ON COLUMN "public"."conversations"."status_v2" IS 'Workflow Sprint 1: open → in_progress → waiting → closed → archived';



COMMENT ON COLUMN "public"."conversations"."closed_at" IS 'Timestamp de quando a conversa foi finalizada';



COMMENT ON COLUMN "public"."conversations"."closed_by" IS 'UUID do usuário que finalizou a conversa';



COMMENT ON COLUMN "public"."conversations"."close_reason" IS 'Motivo opcional de fechamento informado pelo atendente';



COMMENT ON COLUMN "public"."conversations"."department_id" IS 'Departamento atual da conversa. NULL = sem departamento atribuído.';



COMMENT ON COLUMN "public"."conversations"."previous_status" IS 'Status anterior (Regra B: Falha → recupera status anterior)';



COMMENT ON COLUMN "public"."conversations"."status_changed_at" IS 'Timestamp da última mudança de status';



COMMENT ON COLUMN "public"."conversations"."status_changed_by" IS 'UUID do usuário que mudou o status (NULL = sistema/webhook)';



COMMENT ON COLUMN "public"."conversations"."last_breno_handled_at" IS 'Timestamp da última vez que BRENO atuou nesta conversa (sent ou suggested). NULL = BRENO nunca atuou.';



COMMENT ON COLUMN "public"."conversations"."breno_paused" IS 'Se true, Eduardo assumiu a conversa manualmente e BRENO deve silenciar até ser explicitamente liberado.';



COMMENT ON COLUMN "public"."conversations"."loop_status" IS 'Estado do loop AI-First: attending | task_pending | replied.';



COMMENT ON COLUMN "public"."conversations"."active_task_id" IS 'Tarefa ativa no loop AI-First.';



COMMENT ON COLUMN "public"."conversations"."attending_agent_id" IS 'Slug do agente atendendo (ex: breno).';



CREATE TABLE IF NOT EXISTS "public"."cora_acoes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "cobranca_id" "uuid",
    "tenant_id" "uuid" NOT NULL,
    "tipo" "text" NOT NULL,
    "canal" "text",
    "conteudo" "text",
    "resultado" "text",
    "agente" "text" DEFAULT 'cora'::"text" NOT NULL,
    "cora_analise" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "agent_run_id" "uuid",
    "cobranca_v2_id" "uuid",
    "acao" "text",
    "mensagem_enviada" "text",
    "whatsapp_message_id" "text"
);


ALTER TABLE "public"."cora_acoes" OWNER TO "postgres";


COMMENT ON COLUMN "public"."cora_acoes"."agent_run_id" IS 'ID do run no Trigger.dev (agent_runs.id) que gerou esta ação. NULL para registros V1 legados.';



COMMENT ON COLUMN "public"."cora_acoes"."cobranca_v2_id" IS 'FK para public.cobrancas (V2, Asaas). Registros V1 usam cobranca_id → cora_cobrancas. Mutuamente exclusivos na prática.';



COMMENT ON COLUMN "public"."cora_acoes"."acao" IS 'Ação executada no vocabulário CORA V2. Exemplos: mensagem_enviada, analise_ia, escalonamento. Equivalente semântico de tipo para novos registros.';



COMMENT ON COLUMN "public"."cora_acoes"."mensagem_enviada" IS 'Texto exato enviado ao cliente via WhatsApp quando acao = ''mensagem_enviada''. NULL para outras ações.';



COMMENT ON COLUMN "public"."cora_acoes"."whatsapp_message_id" IS 'ID de mensagem retornado pela Evolution API (ex: BAE5...). Permite rastrear status de entrega. NULL se a ação não gerou envio WhatsApp.';



CREATE TABLE IF NOT EXISTS "public"."cora_cobrancas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "customer_name" "text" NOT NULL,
    "customer_phone" "text",
    "customer_whatsapp" "text",
    "valor_original" numeric(10,2) NOT NULL,
    "valor_atual" numeric(10,2) NOT NULL,
    "data_vencimento" "date" NOT NULL,
    "status" "text" DEFAULT 'aberto'::"text" NOT NULL,
    "regua_id" "uuid",
    "asaas_charge_id" "text",
    "notas" "text",
    "cora_analise" "jsonb",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "cora_cobrancas_status_check" CHECK (("status" = ANY (ARRAY['aberto'::"text", 'negociando'::"text", 'pago'::"text", 'cancelado'::"text", 'escalonado'::"text"])))
);


ALTER TABLE "public"."cora_cobrancas" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cora_reguas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "nome" "text" NOT NULL,
    "descricao" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "passos" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."cora_reguas" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."crm_notas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "customer_id" "uuid" NOT NULL,
    "texto" "text" NOT NULL,
    "autor_id" "uuid",
    "autor_nome" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."crm_notas" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."crm_webhook_tokens" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "token_hash" "text" NOT NULL,
    "descricao" "text",
    "ativo" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_used_at" timestamp with time zone
);


ALTER TABLE "public"."crm_webhook_tokens" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."custom_field_values" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "custom_field_id" "uuid" NOT NULL,
    "entidade_id" "uuid" NOT NULL,
    "valor" "text",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."custom_field_values" OWNER TO "postgres";


COMMENT ON TABLE "public"."custom_field_values" IS 'Valores dos campos personalizados por instância de entidade';



CREATE TABLE IF NOT EXISTS "public"."custom_fields" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "entidade" "text" NOT NULL,
    "nome" "text" NOT NULL,
    "tipo" "text" NOT NULL,
    "opcoes" "jsonb",
    "obrigatorio" boolean DEFAULT false NOT NULL,
    "ordem" integer DEFAULT 0 NOT NULL,
    "ajuda" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "custom_fields_entidade_check" CHECK (("entidade" = ANY (ARRAY['loja'::"text", 'customer'::"text", 'tarefa'::"text", 'contrato'::"text", 'lead'::"text"]))),
    CONSTRAINT "custom_fields_tipo_check" CHECK (("tipo" = ANY (ARRAY['texto'::"text", 'numero'::"text", 'data'::"text", 'boolean'::"text", 'select'::"text", 'multiselect'::"text"])))
);


ALTER TABLE "public"."custom_fields" OWNER TO "postgres";


COMMENT ON TABLE "public"."custom_fields" IS 'Campos personalizados por tenant e entidade (loja, customer, tarefa, contrato, lead)';



CREATE TABLE IF NOT EXISTS "public"."customer_addresses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "customer_id" "uuid" NOT NULL,
    "cep" "text",
    "logradouro" "text",
    "numero" "text",
    "complemento" "text",
    "bairro" "text",
    "cidade" "text",
    "estado" character(2),
    "is_primary" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."customer_addresses" OWNER TO "postgres";


COMMENT ON TABLE "public"."customer_addresses" IS 'Endereço do cliente. CEP preenchido via ViaCEP no frontend.';



COMMENT ON COLUMN "public"."customer_addresses"."estado" IS 'UF em 2 caracteres: SP, RJ, MG, etc.';



CREATE TABLE IF NOT EXISTS "public"."customer_group_members" (
    "group_id" "uuid" NOT NULL,
    "customer_id" "uuid" NOT NULL,
    "added_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."customer_group_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."customer_groups" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "color" "text" DEFAULT '#DC2626'::"text",
    "filter_rules" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "tenant_id" "uuid"
);


ALTER TABLE "public"."customer_groups" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."customer_note_entries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "customer_id" "uuid",
    "conversation_id" "uuid",
    "content" "text" NOT NULL,
    "source" "text" DEFAULT 'manual'::"text" NOT NULL,
    "chat_task_id" "uuid",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "customer_note_entries_source_check" CHECK (("source" = ANY (ARRAY['manual'::"text", 'breno'::"text", 'conversation'::"text"])))
);


ALTER TABLE "public"."customer_note_entries" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."customer_notes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "customer_id" "uuid" NOT NULL,
    "content" "text" DEFAULT ''::"text" NOT NULL,
    "created_by" "uuid",
    "updated_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."customer_notes" OWNER TO "postgres";


COMMENT ON TABLE "public"."customer_notes" IS 'Nota livre por cliente (1:1). Frontend faz upsert com debounce 1s.';



CREATE TABLE IF NOT EXISTS "public"."customer_tag_relations" (
    "customer_id" "uuid" NOT NULL,
    "tag_id" "uuid" NOT NULL
);


ALTER TABLE "public"."customer_tag_relations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."customer_tags" (
    "customer_id" "uuid" NOT NULL,
    "tag_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."customer_tags" OWNER TO "postgres";


COMMENT ON TABLE "public"."customer_tags" IS 'Tags aplicadas a customers (N:N). Aplicar tag no customer reflete em todas as suas conversas.';



CREATE TABLE IF NOT EXISTS "public"."customers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "avatar" "text",
    "phone" "text",
    "email" "text",
    "is_vip" boolean DEFAULT false NOT NULL,
    "tags" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "status" "text" DEFAULT 'novo'::"text",
    "whatsapp_name" "text",
    "last_message_at" timestamp with time zone,
    "assigned_to" "uuid",
    "segment" "text" DEFAULT 'Lead'::"text",
    "phone_normalized" "text" GENERATED ALWAYS AS ("regexp_replace"("phone", '[^0-9]'::"text", ''::"text", 'g'::"text")) STORED,
    CONSTRAINT "customers_status_check" CHECK (("status" = ANY (ARRAY['novo'::"text", 'em_atendimento'::"text", 'aguardando'::"text", 'resolvido'::"text", 'inativo'::"text"])))
);


ALTER TABLE "public"."customers" OWNER TO "postgres";


COMMENT ON COLUMN "public"."customers"."phone_normalized" IS 'Gerada automaticamente a partir de phone, contendo apenas dígitos (0-9). Usada para busca por JID do WhatsApp (formato numérico). Somente leitura.';



CREATE TABLE IF NOT EXISTS "public"."daily_kpis" (
    "tenant_id" "uuid" NOT NULL,
    "day" "date" NOT NULL,
    "pedidos_count" integer DEFAULT 0 NOT NULL,
    "pedidos_delta_pct" numeric(6,2),
    "ticket_medio_cents" integer DEFAULT 0 NOT NULL,
    "ticket_delta_pct" numeric(6,2),
    "tarefas_count" integer DEFAULT 0 NOT NULL,
    "tarefas_urgentes" integer DEFAULT 0 NOT NULL,
    "inadimplencia_cents" integer DEFAULT 0 NOT NULL,
    "inadimplencia_clientes" integer DEFAULT 0 NOT NULL,
    "trend" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."daily_kpis" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."defesa_aprovadores" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "loja_id" "uuid",
    "telefone_jid" "text" NOT NULL,
    "nome" "text",
    "ativo" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid"
);


ALTER TABLE "public"."defesa_aprovadores" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."defesa_assinaturas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "asaas_customer_id" "text",
    "asaas_subscription_id" "text",
    "status" "text" DEFAULT 'pendente'::"text" NOT NULL,
    "valor_centavos" integer DEFAULT 14700 NOT NULL,
    "ciclo" "text" DEFAULT 'MONTHLY'::"text" NOT NULL,
    "ultima_cobranca_status" "text",
    "link_pagamento" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "payer_nome" "text",
    "payer_email" "text",
    "payer_cpf_cnpj" "text",
    CONSTRAINT "defesa_assinaturas_status_check" CHECK (("status" = ANY (ARRAY['pendente'::"text", 'ativa'::"text", 'atrasada'::"text", 'cancelada'::"text"])))
);


ALTER TABLE "public"."defesa_assinaturas" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."defesa_casos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "loja_id" "uuid",
    "canal" "text" DEFAULT 'ifood'::"text" NOT NULL,
    "tipo" "text" NOT NULL,
    "pedido_ref" "text",
    "valor_centavos" integer DEFAULT 0 NOT NULL,
    "motivo" "text",
    "analise" "jsonb",
    "draft_resposta" "text",
    "status" "text" DEFAULT 'aguardando_ok'::"text" NOT NULL,
    "resultado_valor_centavos" integer,
    "criado_por_agente" "text" DEFAULT 'defesa'::"text" NOT NULL,
    "aprovado_por" "uuid",
    "aprovado_em" timestamp with time zone,
    "enviado_em" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "defesa_casos_status_check" CHECK (("status" = ANY (ARRAY['rascunho'::"text", 'aguardando_ok'::"text", 'aprovado'::"text", 'enviado'::"text", 'ganho'::"text", 'perdido'::"text", 'descartado'::"text"]))),
    CONSTRAINT "defesa_casos_tipo_check" CHECK (("tipo" = ANY (ARRAY['cancelamento'::"text", 'avaliacao'::"text"])))
);


ALTER TABLE "public"."defesa_casos" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."defesa_metricas_mensal" WITH ("security_invoker"='true') AS
 SELECT "tenant_id",
    "date_trunc"('month'::"text", "created_at") AS "mes",
    "count"(*) AS "casos_total",
    "count"(*) FILTER (WHERE ("status" = 'aguardando_ok'::"text")) AS "aguardando_ok",
    "count"(*) FILTER (WHERE ("status" = 'ganho'::"text")) AS "ganhos",
    "count"(*) FILTER (WHERE ("status" = ANY (ARRAY['enviado'::"text", 'aprovado'::"text"]))) AS "em_andamento",
    COALESCE("sum"("resultado_valor_centavos") FILTER (WHERE ("status" = 'ganho'::"text")), (0)::bigint) AS "defendido_centavos"
   FROM "public"."defesa_casos"
  GROUP BY "tenant_id", ("date_trunc"('month'::"text", "created_at"));


ALTER VIEW "public"."defesa_metricas_mensal" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."deli_actions_log" (
    "id" bigint NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "trigger_id" "uuid",
    "related_draft_id" "uuid",
    "approval_id" "uuid",
    "autonomy_level" "text",
    "ts" timestamp with time zone DEFAULT "now"() NOT NULL,
    "context_jsonb" "jsonb",
    "action_taken_jsonb" "jsonb",
    "result" "text",
    "error_detail" "text",
    CONSTRAINT "deli_actions_log_autonomy_level_check" CHECK (("autonomy_level" = ANY (ARRAY['verde'::"text", 'amarelo'::"text", 'vermelho'::"text"])))
);


ALTER TABLE "public"."deli_actions_log" OWNER TO "postgres";


COMMENT ON TABLE "public"."deli_actions_log" IS 'Log imutável de todas as ações da DELI. action_type: trigger_fired, draft_created, draft_sent, draft_approved, draft_rejected, trigger_skipped, approval_expired. Append-only: sem UPDATE, sem DELETE.';



COMMENT ON COLUMN "public"."deli_actions_log"."related_draft_id" IS 'FK para agent_drafts — draft criado ou enviado nesta ação';



COMMENT ON COLUMN "public"."deli_actions_log"."ts" IS 'Timestamp da ação executada';



COMMENT ON COLUMN "public"."deli_actions_log"."context_jsonb" IS 'Contexto do evento (payload do Realtime que originou a ação)';



COMMENT ON COLUMN "public"."deli_actions_log"."action_taken_jsonb" IS 'Ação executada em formato JSONB {type, ...parâmetros}';



COMMENT ON COLUMN "public"."deli_actions_log"."result" IS 'Resultado: success, loja_id_not_resolved, invoke_failed:NNN, error:...';



COMMENT ON COLUMN "public"."deli_actions_log"."error_detail" IS 'Detalhe do erro se result começar com "error:"';



CREATE SEQUENCE IF NOT EXISTS "public"."deli_actions_log_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."deli_actions_log_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."deli_actions_log_id_seq" OWNED BY "public"."deli_actions_log"."id";



CREATE TABLE IF NOT EXISTS "public"."deli_agenda" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "tipo" "text" NOT NULL,
    "resumo" "text" NOT NULL,
    "alertas" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "acoes_sugeridas" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "agent_run_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "deli_agenda_tipo_check" CHECK (("tipo" = ANY (ARRAY['revisao_matinal'::"text", 'supervisao'::"text", 'alerta'::"text"])))
);


ALTER TABLE "public"."deli_agenda" OWNER TO "postgres";


COMMENT ON TABLE "public"."deli_agenda" IS 'Resumos executivos gerados pela DELI: revisões matinais diárias, supervisões intraday e alertas pontuais.';



COMMENT ON COLUMN "public"."deli_agenda"."alertas" IS 'Array JSONB de alertas. Default: array vazio.';



COMMENT ON COLUMN "public"."deli_agenda"."acoes_sugeridas" IS 'Array JSONB das ações propostas pela DELI. Default: array vazio.';



COMMENT ON COLUMN "public"."deli_agenda"."agent_run_id" IS 'FK opcional para agent_runs — rastreabilidade de qual run gerou este item.';



CREATE TABLE IF NOT EXISTS "public"."deli_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid",
    "user_id" "uuid",
    "role" "text" NOT NULL,
    "content" "text" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "deli_messages_role_check" CHECK (("role" = ANY (ARRAY['user'::"text", 'assistant'::"text"])))
);


ALTER TABLE "public"."deli_messages" OWNER TO "postgres";


COMMENT ON TABLE "public"."deli_messages" IS 'Histórico de conversas Wandson ↔ DELI. Nunca deletar — append-only.';



CREATE TABLE IF NOT EXISTS "public"."deli_pending_approvals" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "draft_id" "uuid",
    "trigger_id" "uuid",
    "autonomy_level" "text" NOT NULL,
    "summary" "text" NOT NULL,
    "context_jsonb" "jsonb",
    "status" "text" DEFAULT 'waiting'::"text" NOT NULL,
    "approver_id" "uuid",
    "approved_at" timestamp with time zone,
    "expires_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "proposed_action_jsonb" "jsonb",
    "reasoning" "text",
    "dedup_key" "text",
    CONSTRAINT "deli_pending_approvals_autonomy_level_check" CHECK (("autonomy_level" = ANY (ARRAY['verde'::"text", 'amarelo'::"text", 'vermelho'::"text"]))),
    CONSTRAINT "deli_pending_approvals_status_check" CHECK (("status" = ANY (ARRAY['waiting'::"text", 'approved'::"text", 'rejected'::"text", 'expired'::"text", 'failed'::"text"])))
);

ALTER TABLE ONLY "public"."deli_pending_approvals" REPLICA IDENTITY FULL;


ALTER TABLE "public"."deli_pending_approvals" OWNER TO "postgres";


COMMENT ON TABLE "public"."deli_pending_approvals" IS 'Aprovações pendentes da DELI. Amarelo: Wandson aprova com ok. Vermelho: aprovação explícita APROVADO VERMELHO apr-xxx.';



COMMENT ON COLUMN "public"."deli_pending_approvals"."context_jsonb" IS 'Contexto do evento que gerou a aprovação (payload do Realtime)';



COMMENT ON COLUMN "public"."deli_pending_approvals"."status" IS 'Status: waiting, approved, rejected, expired, failed';



COMMENT ON COLUMN "public"."deli_pending_approvals"."approver_id" IS 'Usuário que aprovou ou rejeitou';



COMMENT ON COLUMN "public"."deli_pending_approvals"."approved_at" IS 'Timestamp da decisão final';



COMMENT ON COLUMN "public"."deli_pending_approvals"."proposed_action_jsonb" IS 'Ação proposta copiada do trigger (para exibição e execução)';



COMMENT ON COLUMN "public"."deli_pending_approvals"."reasoning" IS 'Explicação da DELI sobre por que propõe esta ação';



COMMENT ON COLUMN "public"."deli_pending_approvals"."dedup_key" IS 'Chave de deduplicação anti-spam: tenant_id|trigger_name|item_id|janela_dia (YYYY-MM-DD). Garante no máximo 1 pendência waiting por evento/dia via índice único parcial.';



CREATE TABLE IF NOT EXISTS "public"."deli_triggers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "descricao" "text",
    "event_type" "text" NOT NULL,
    "condition_jsonb" "jsonb",
    "autonomy_level" "text" DEFAULT 'amarelo'::"text" NOT NULL,
    "enabled" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "proposed_action_jsonb" "jsonb",
    CONSTRAINT "deli_triggers_autonomy_level_check" CHECK (("autonomy_level" = ANY (ARRAY['verde'::"text", 'amarelo'::"text", 'vermelho'::"text"])))
);


ALTER TABLE "public"."deli_triggers" OWNER TO "postgres";


COMMENT ON TABLE "public"."deli_triggers" IS 'Regras da DELI: quando disparar e o que fazer. condition_jsonb: {source_table, event_type, checks:[{field,op,value}]}. proposed_action_jsonb: {type, ...parâmetros}.';



COMMENT ON COLUMN "public"."deli_triggers"."name" IS 'Nome do trigger (ex: "Cliente sumiu 7 dias")';



COMMENT ON COLUMN "public"."deli_triggers"."condition_jsonb" IS 'Condição JSONB: {source_table, event_type, checks:[{field,op,value}]}';



COMMENT ON COLUMN "public"."deli_triggers"."enabled" IS 'TRUE = trigger ativo e avaliado pelo Bridge Server';



COMMENT ON COLUMN "public"."deli_triggers"."proposed_action_jsonb" IS 'Ação proposta JSONB: {type, title, description, ...} — lida pelo executeVerde/createPendingApproval';



CREATE TABLE IF NOT EXISTS "public"."department_members" (
    "department_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "granted_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."department_members" OWNER TO "postgres";


COMMENT ON TABLE "public"."department_members" IS 'Membros de cada departamento. Uma pessoa pode pertencer a N departamentos independente do RBAC.';



CREATE TABLE IF NOT EXISTS "public"."departments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "color" "text" DEFAULT '#6B7280'::"text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."departments" OWNER TO "postgres";


COMMENT ON TABLE "public"."departments" IS 'Departamentos de atendimento. Complementam RBAC: RBAC define quem é a pessoa, departamento define onde a conversa está roteada.';



CREATE TABLE IF NOT EXISTS "public"."encerramento_config" (
    "tenant_id" "uuid" NOT NULL,
    "auto_send" boolean DEFAULT false NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."encerramento_config" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."espacos_columns" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "list_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "color" "text" DEFAULT '#6B7280'::"text" NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    "is_done" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE ONLY "public"."espacos_columns" REPLICA IDENTITY FULL;


ALTER TABLE "public"."espacos_columns" OWNER TO "postgres";


COMMENT ON TABLE "public"."espacos_columns" IS 'Coluna (status customizável) de uma lista ESPAÇOS. is_done=true marca a coluna de conclusão.';



CREATE TABLE IF NOT EXISTS "public"."espacos_folders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "customer_id" "uuid",
    "name" "text" NOT NULL,
    "color" "text" DEFAULT '#B70C00'::"text" NOT NULL,
    "icon" "text",
    "position" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "workspace_id" "uuid"
);

ALTER TABLE ONLY "public"."espacos_folders" REPLICA IDENTITY FULL;


ALTER TABLE "public"."espacos_folders" OWNER TO "postgres";


COMMENT ON TABLE "public"."espacos_folders" IS 'Pasta do módulo ESPAÇOS (estilo ClickUp). Pode pertencer a um cliente (customer_id) ou ser global (NULL).';



CREATE TABLE IF NOT EXISTS "public"."espacos_lists" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "folder_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "color" "text" DEFAULT '#6B7280'::"text" NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE ONLY "public"."espacos_lists" REPLICA IDENTITY FULL;


ALTER TABLE "public"."espacos_lists" OWNER TO "postgres";


COMMENT ON TABLE "public"."espacos_lists" IS 'Lista de tarefas dentro de uma pasta ESPAÇOS. As tarefas (client_tasks) referenciam list_id.';



CREATE TABLE IF NOT EXISTS "public"."espacos_workspaces" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "color" "text" DEFAULT '#B70C00'::"text" NOT NULL,
    "icon" "text",
    "position" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."espacos_workspaces" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."estudio_criacoes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "loja_id" "uuid",
    "tipo" "text" NOT NULL,
    "formato" "text" DEFAULT '1:1'::"text" NOT NULL,
    "brief" "text" NOT NULL,
    "tom" "text",
    "usar_identidade" boolean DEFAULT false NOT NULL,
    "texto_gerado" "text",
    "imagem_url" "text",
    "custo_usd" numeric(10,6) DEFAULT 0 NOT NULL,
    "status" "text" DEFAULT 'fila'::"text" NOT NULL,
    "erro_msg" "text",
    "criado_por" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "estudio_criacoes_formato_check" CHECK (("formato" = ANY (ARRAY['1:1'::"text", '9:16'::"text", '16:9'::"text", 'texto'::"text"]))),
    CONSTRAINT "estudio_criacoes_status_check" CHECK (("status" = ANY (ARRAY['fila'::"text", 'gerando'::"text", 'pronto'::"text", 'erro'::"text", 'aprovado'::"text"]))),
    CONSTRAINT "estudio_criacoes_tipo_check" CHECK (("tipo" = ANY (ARRAY['post_instagram'::"text", 'story_vaga'::"text", 'capa_youtube'::"text", 'oferta_whatsapp'::"text", 'cardapio_copy'::"text", 'calendario_mes'::"text"])))
);


ALTER TABLE "public"."estudio_criacoes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."evolution_instances" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "instance_name" "text" NOT NULL,
    "evolution_url" "text" NOT NULL,
    "api_key" "text" NOT NULL,
    "status" "text" DEFAULT 'disconnected'::"text",
    "phone" "text",
    "profile_name" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "tenant_id" "uuid" NOT NULL,
    "last_seen" timestamp with time zone
);

ALTER TABLE ONLY "public"."evolution_instances" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."evolution_instances" OWNER TO "postgres";


COMMENT ON COLUMN "public"."evolution_instances"."tenant_id" IS 'Tenant proprietário desta instância Evolution. Obrigatório. Edge function usa instance_name → tenant_id para rotear mensagens.';



CREATE TABLE IF NOT EXISTS "public"."goal_tasks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "goal_id" "uuid",
    "title" "text" NOT NULL,
    "description" "text",
    "status" "text" DEFAULT 'todo'::"text" NOT NULL,
    "priority" "text" DEFAULT 'medium'::"text" NOT NULL,
    "assignee_agent" "text",
    "due_date" "date",
    "created_by" "uuid",
    "completed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "goal_tasks_priority_check" CHECK (("priority" = ANY (ARRAY['urgent'::"text", 'high'::"text", 'medium'::"text", 'low'::"text"]))),
    CONSTRAINT "goal_tasks_status_check" CHECK (("status" = ANY (ARRAY['todo'::"text", 'in_progress'::"text", 'done'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."goal_tasks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."goals" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "project_id" "uuid",
    "title" "text" NOT NULL,
    "description" "text",
    "metric_type" "text" DEFAULT 'count'::"text" NOT NULL,
    "target_value" numeric DEFAULT 1 NOT NULL,
    "current_value" numeric DEFAULT 0 NOT NULL,
    "due_date" "date",
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "goals_metric_type_check" CHECK (("metric_type" = ANY (ARRAY['count'::"text", 'currency'::"text", 'percentage'::"text", 'boolean'::"text"]))),
    CONSTRAINT "goals_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'achieved'::"text", 'on_hold'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."goals" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."heartbeat_runs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "heartbeat_id" "uuid" NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'running'::"text" NOT NULL,
    "trigger_type" "text" DEFAULT 'interval'::"text" NOT NULL,
    "prompt_used" "text",
    "output" "text",
    "action_taken" boolean DEFAULT false NOT NULL,
    "action_summary" "text",
    "error_message" "text",
    "tokens_used" integer,
    "cost_usd" numeric(10,6),
    "duration_ms" integer,
    "execution_mode" "text",
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "finished_at" timestamp with time zone,
    CONSTRAINT "heartbeat_runs_status_check" CHECK (("status" = ANY (ARRAY['running'::"text", 'success'::"text", 'failed'::"text", 'skipped'::"text"]))),
    CONSTRAINT "heartbeat_runs_trigger_type_check" CHECK (("trigger_type" = ANY (ARRAY['interval'::"text", 'manual'::"text"])))
);


ALTER TABLE "public"."heartbeat_runs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."heartbeats" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "agent_slug" "text" NOT NULL,
    "prompt" "text" NOT NULL,
    "decision_prompt" "text",
    "interval_seconds" integer DEFAULT 3600 NOT NULL,
    "enabled" boolean DEFAULT false NOT NULL,
    "wake_triggers" "text"[] DEFAULT '{interval}'::"text"[] NOT NULL,
    "execution_mode" "text" DEFAULT 'api'::"text" NOT NULL,
    "max_tokens" integer DEFAULT 2048 NOT NULL,
    "timeout_seconds" integer DEFAULT 120 NOT NULL,
    "last_run_at" timestamp with time zone,
    "next_run_at" timestamp with time zone,
    "run_count" integer DEFAULT 0 NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "heartbeats_execution_mode_check" CHECK (("execution_mode" = ANY (ARRAY['api'::"text", 'claude_cli'::"text"])))
);


ALTER TABLE "public"."heartbeats" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ifood_merchants" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "merchant_id" "text" NOT NULL,
    "nome" "text",
    "status" "text" DEFAULT 'connected'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "ifood_merchants_status_check" CHECK (("status" = ANY (ARRAY['connected'::"text", 'revoked'::"text", 'error'::"text"])))
);


ALTER TABLE "public"."ifood_merchants" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."inadimplencia_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "inadimplencia_id" "uuid" NOT NULL,
    "from_kind" "text" NOT NULL,
    "body" "text" NOT NULL,
    "sent_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "inadimplencia_messages_from_kind_check" CHECK (("from_kind" = ANY (ARRAY['bot'::"text", 'client'::"text", 'user'::"text"])))
);


ALTER TABLE "public"."inadimplencia_messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."inadimplencias" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "customer_id" "uuid" NOT NULL,
    "order_id" "uuid",
    "amount_cents" integer NOT NULL,
    "days_late" integer DEFAULT 0 NOT NULL,
    "status" "text" DEFAULT 'trying'::"text" NOT NULL,
    "sentiment_score" integer,
    "pay_probability" integer,
    "next_action" "text",
    "last_action_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "inadimplencias_status_check" CHECK (("status" = ANY (ARRAY['trying'::"text", 'negotiating'::"text", 'paid'::"text", 'lost'::"text", 'critical'::"text"])))
);


ALTER TABLE "public"."inadimplencias" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."internal_channels" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid",
    "name" "text" NOT NULL,
    "description" "text",
    "is_global" boolean DEFAULT false,
    "color" "text" DEFAULT '#2563EB'::"text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."internal_channels" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."internal_notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "recipient_user_id" "uuid",
    "kind" "text" NOT NULL,
    "agent" "text",
    "title" "text" NOT NULL,
    "body" "text",
    "link" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "read_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "internal_notifications_kind_check" CHECK (("kind" = ANY (ARRAY['agent_invoked'::"text", 'agent_completed'::"text", 'agent_failed'::"text", 'draft_pending'::"text", 'draft_approved'::"text", 'draft_rejected'::"text", 'deli_proposal'::"text", 'deli_alert'::"text", 'system'::"text", 'channel_message'::"text"])))
);

ALTER TABLE ONLY "public"."internal_notifications" REPLICA IDENTITY FULL;


ALTER TABLE "public"."internal_notifications" OWNER TO "postgres";


COMMENT ON TABLE "public"."internal_notifications" IS 'Notificações internas para a equipe (sino do Topbar). Distintas dos drafts (que são p/ cliente).';



COMMENT ON COLUMN "public"."internal_notifications"."recipient_user_id" IS 'NULL = broadcast para todos os membros do tenant.';



COMMENT ON COLUMN "public"."internal_notifications"."kind" IS 'Categoria semântica — controla ícone/cor no frontend.';



COMMENT ON COLUMN "public"."internal_notifications"."agent" IS 'Nome do agente que gerou a notificação. NULL para notificações de sistema.';



CREATE TABLE IF NOT EXISTS "public"."lead_list_members" (
    "list_id" "uuid" NOT NULL,
    "customer_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."lead_list_members" OWNER TO "postgres";


COMMENT ON TABLE "public"."lead_list_members" IS 'Membros de cada lista de leads (N:N).';



CREATE TABLE IF NOT EXISTS "public"."lead_lists" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."lead_lists" OWNER TO "postgres";


COMMENT ON TABLE "public"."lead_lists" IS 'Listas de segmentação de leads (ex: Potenciais, Inativos, Promoção).';



CREATE TABLE IF NOT EXISTS "public"."lead_tags" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "color" "text" DEFAULT '#6B7280'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."lead_tags" OWNER TO "postgres";


COMMENT ON TABLE "public"."lead_tags" IS 'Tags coloridas para segmentação de leads e conversas. Criadas por tenant.';



CREATE TABLE IF NOT EXISTS "public"."leads" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "nome" "text" NOT NULL,
    "fonte" "text" NOT NULL,
    "cidade" "text",
    "bairro" "text",
    "telefone" "text",
    "instagram" "text",
    "ifood_url" "text",
    "gmaps_url" "text",
    "score" integer NOT NULL,
    "justificativa" "text" NOT NULL,
    "dados_json" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "status" "text" DEFAULT 'prospectado'::"text" NOT NULL,
    "crm_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "customer_id" "uuid",
    "email" "text",
    "whatsapp" "text",
    "origem" "text",
    "stage" "text" DEFAULT 'novo'::"text" NOT NULL,
    "valor_estimado" numeric,
    "responsavel_id" "uuid",
    "notas" "text",
    CONSTRAINT "leads_fonte_check" CHECK (("fonte" = ANY (ARRAY['google_maps'::"text", 'ifood'::"text", 'instagram'::"text", 'manual'::"text", 'outro'::"text"]))),
    CONSTRAINT "leads_score_check" CHECK ((("score" >= 1) AND ("score" <= 10))),
    CONSTRAINT "leads_stage_check" CHECK (("stage" = ANY (ARRAY['novo'::"text", 'qualificado'::"text", 'proposta'::"text", 'negociacao'::"text", 'fechado'::"text", 'perdido'::"text"]))),
    CONSTRAINT "leads_status_check" CHECK (("status" = ANY (ARRAY['prospectado'::"text", 'contactado'::"text", 'sem_resposta'::"text", 'interessado'::"text", 'nao_fit'::"text", 'crm'::"text", 'perdido'::"text"])))
);


ALTER TABLE "public"."leads" OWNER TO "postgres";


COMMENT ON TABLE "public"."leads" IS 'Leads qualificados pela SOFIA (SDR IA). Score 1-10 com critérios ICP food service.';



CREATE TABLE IF NOT EXISTS "public"."loja_consultores" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "loja_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "papel" "text" DEFAULT 'colaborador'::"text" NOT NULL,
    "atribuido_em" timestamp with time zone DEFAULT "now"(),
    "atribuido_por" "uuid",
    "ativo" boolean DEFAULT true,
    CONSTRAINT "loja_consultores_papel_check" CHECK (("papel" = ANY (ARRAY['principal'::"text", 'colaborador'::"text", 'observador'::"text"])))
);


ALTER TABLE "public"."loja_consultores" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."loja_gpt_conversations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "loja_id" "uuid" NOT NULL,
    "iniciada_por" "uuid",
    "titulo" "text",
    "resumo_curto" "text",
    "total_messages" integer DEFAULT 0 NOT NULL,
    "ultima_message_em" timestamp with time zone,
    "custo_total_usd" numeric(10,6) DEFAULT 0 NOT NULL,
    "arquivada" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."loja_gpt_conversations" OWNER TO "postgres";


COMMENT ON TABLE "public"."loja_gpt_conversations" IS 'Conversas GPT/IA vinculadas a uma loja. Permite histórico persistente, controle de custo e arquivamento por conversa.';



COMMENT ON COLUMN "public"."loja_gpt_conversations"."loja_id" IS 'Loja à qual esta conversa pertence. Cascade delete garante limpeza ao remover loja.';



COMMENT ON COLUMN "public"."loja_gpt_conversations"."iniciada_por" IS 'Usuário que iniciou a conversa. SET NULL ao deletar usuário preserva o histórico.';



COMMENT ON COLUMN "public"."loja_gpt_conversations"."titulo" IS 'Título gerado automaticamente ou editado pelo usuário para identificar o assunto da conversa.';



COMMENT ON COLUMN "public"."loja_gpt_conversations"."resumo_curto" IS 'Resumo em 1-2 frases gerado pela IA ao final ou a cada N mensagens. Facilita listagem.';



COMMENT ON COLUMN "public"."loja_gpt_conversations"."total_messages" IS 'Contador denormalizado de mensagens. Atualizado pela aplicação a cada insert em loja_gpt_messages.';



COMMENT ON COLUMN "public"."loja_gpt_conversations"."ultima_message_em" IS 'Timestamp da última mensagem. Usado para ordenar conversas recentes na listagem.';



COMMENT ON COLUMN "public"."loja_gpt_conversations"."custo_total_usd" IS 'Custo acumulado em USD das chamadas à API de IA. Calculado a partir dos tokens consumidos.';



COMMENT ON COLUMN "public"."loja_gpt_conversations"."arquivada" IS 'Se true, conversa não aparece na listagem padrão. Soft archive sem deleção de dados.';



CREATE TABLE IF NOT EXISTS "public"."loja_gpt_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "conversation_id" "uuid" NOT NULL,
    "role" "text" NOT NULL,
    "conteudo" "text" NOT NULL,
    "fontes_consultadas" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "contexto_loja_snapshot" "jsonb",
    "tokens_input" integer,
    "tokens_output" integer,
    "custo_usd" numeric(10,6),
    "duracao_ms" integer,
    "modelo" "text",
    "autor_user_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "loja_gpt_messages_role_check" CHECK (("role" = ANY (ARRAY['user'::"text", 'assistant'::"text", 'tool'::"text"])))
);


ALTER TABLE "public"."loja_gpt_messages" OWNER TO "postgres";


COMMENT ON TABLE "public"."loja_gpt_messages" IS 'Mensagens individuais de conversas GPT/IA. INSERT exclusivo via service role (Trigger.dev). Clientes leem via RLS herdada da conversa.';



COMMENT ON COLUMN "public"."loja_gpt_messages"."role" IS 'Papel da mensagem: user (consultor que perguntou), assistant (resposta da IA), tool (resultado de tool call). System prompt é parâmetro separado na API, não gravado como linha.';



COMMENT ON COLUMN "public"."loja_gpt_messages"."fontes_consultadas" IS 'Array JSON de fontes usadas pela IA: [{tipo, arquivo, trecho}]. Populado pelo helper knowledge-base.ts.';



COMMENT ON COLUMN "public"."loja_gpt_messages"."contexto_loja_snapshot" IS 'Snapshot do contexto da loja no momento da chamada (output de buildLojaContexto). Para auditoria e debug.';



COMMENT ON COLUMN "public"."loja_gpt_messages"."modelo" IS 'Modelo Anthropic usado, ex: claude-sonnet-4-6. Registrado para rastreamento de custo e comparação.';



COMMENT ON COLUMN "public"."loja_gpt_messages"."autor_user_id" IS 'Preenchido apenas quando role=user. Identifica qual consultor enviou a mensagem.';



CREATE TABLE IF NOT EXISTS "public"."loja_metricas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "loja_id" "uuid" NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "data" "date" NOT NULL,
    "faturamento" numeric(12,2),
    "pedidos" integer,
    "ticket_medio" numeric(10,2),
    "avaliacao" numeric(3,2),
    "cancelamentos" integer,
    "fonte" "text" DEFAULT 'manual'::"text" NOT NULL,
    "raw_data" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "novos_clientes" integer,
    "visitas" integer,
    "conversao_cardapio" real,
    "conversao_final" real,
    "tempo_aberto_pct" real
);


ALTER TABLE "public"."loja_metricas" OWNER TO "postgres";


COMMENT ON TABLE "public"."loja_metricas" IS 'Snapshot diário de métricas por loja. fonte: ifood, rappi, manual, analise_agente. Populado pelo n8n e pelo analista-ifood.';



COMMENT ON COLUMN "public"."loja_metricas"."data" IS 'Data de referência da métrica (DATE)';



COMMENT ON COLUMN "public"."loja_metricas"."novos_clientes" IS 'Novos clientes no período';



COMMENT ON COLUMN "public"."loja_metricas"."visitas" IS 'Total de visitas/visualizações do cardápio';



COMMENT ON COLUMN "public"."loja_metricas"."conversao_cardapio" IS 'Taxa de conversão: visitas que viraram pedido (0.0-1.0)';



COMMENT ON COLUMN "public"."loja_metricas"."conversao_final" IS 'Taxa de conversão final incluindo cancelamentos (0.0-1.0)';



COMMENT ON COLUMN "public"."loja_metricas"."tempo_aberto_pct" IS 'Percentual do tempo que a loja ficou aberta no período (0.0-1.0)';



CREATE TABLE IF NOT EXISTS "public"."loja_metricas_snapshot" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "loja_id" "uuid" NOT NULL,
    "data" "date" NOT NULL,
    "pedidos_30d" integer,
    "pedidos_90d" integer,
    "avaliacoes_30d" integer,
    "avaliacoes_90d" integer,
    "nota_media" numeric(3,2),
    "taxa_cancelamento" numeric(5,4),
    "taxa_chamados" numeric(5,4),
    "tempo_preparo_min" integer,
    "tempo_loja_aberta_pct" numeric(5,4),
    "tempo_espera_motoboy_min" integer,
    "invest_midia_30d" numeric(10,2),
    "custo_por_pedido" numeric(10,2),
    "ticket_medio" numeric(10,2),
    "posicao_categoria" "text",
    "fonte" "text" DEFAULT 'manual'::"text" NOT NULL,
    "capturado_por" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "loja_metricas_snapshot_fonte_check" CHECK (("fonte" = ANY (ARRAY['manual'::"text", 'api_ifood'::"text", 'print_ocr'::"text"])))
);


ALTER TABLE "public"."loja_metricas_snapshot" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."loja_whatsapp_vinculo" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "loja_id" "uuid" NOT NULL,
    "remote_jid" "text" NOT NULL,
    "tipo" "text" NOT NULL,
    "monitorar" boolean DEFAULT true NOT NULL,
    "ultimo_run_em" timestamp with time zone,
    "criado_por" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "loja_whatsapp_vinculo_tipo_check" CHECK (("tipo" = ANY (ARRAY['grupo'::"text", 'privado'::"text"])))
);


ALTER TABLE "public"."loja_whatsapp_vinculo" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."lojas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "nome" "text" NOT NULL,
    "nicho" "text",
    "cidade" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "plataforma" "text",
    "status" "text" DEFAULT 'ativo'::"text" NOT NULL,
    "estado" "text",
    "data_entrada" "date",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "client_id" "uuid",
    "slug" "text",
    "ifood_merchant_id" "text",
    "ifood_url" "text",
    "segmento" "text",
    "posicionamento" "text" DEFAULT 'indefinido'::"text",
    "ticket_medio" numeric(10,2),
    "data_inicio_consultoria" "date" DEFAULT CURRENT_DATE,
    "data_fim_consultoria" "date",
    "super_restaurante" boolean DEFAULT false,
    "data_super_restaurante" "date",
    "observacoes" "text",
    "tags" "text"[] DEFAULT '{}'::"text"[],
    "created_by" "uuid",
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "tipo" "text",
    "skill_criada" boolean DEFAULT false,
    "skill_path" "text",
    "dados_skill" "jsonb" DEFAULT '{}'::"jsonb",
    "logo_url" "text",
    "whatsapp" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "is_real_business" boolean DEFAULT false,
    "is_consultoria_ativa" boolean DEFAULT false NOT NULL,
    "store_tenant_id" "uuid",
    "ifood_portal_nome" "text",
    "whatsapp_group_jid" "text",
    "fonte_dados" "text" DEFAULT 'portal'::"text" NOT NULL,
    "is_contato" boolean DEFAULT false NOT NULL,
    CONSTRAINT "lojas_estado_check" CHECK ((("estado" IS NULL) OR ("length"("estado") = 2))),
    CONSTRAINT "lojas_fonte_dados_check" CHECK (("fonte_dados" = ANY (ARRAY['portal'::"text", 'api'::"text"]))),
    CONSTRAINT "lojas_posicionamento_check" CHECK (("posicionamento" = ANY (ARRAY['volume'::"text", 'premium'::"text", 'indefinido'::"text"]))),
    CONSTRAINT "lojas_segmento_check" CHECK ((("segmento" IS NULL) OR ("segmento" = ANY (ARRAY['hamburgueria'::"text", 'pizzaria'::"text", 'japonesa'::"text", 'brasileira'::"text", 'marmita'::"text", 'saudavel'::"text", 'acai'::"text", 'sobremesa'::"text", 'padaria'::"text", 'outro'::"text"])))),
    CONSTRAINT "lojas_status_check" CHECK (("status" = ANY (ARRAY['ativo'::"text", 'inativo'::"text", 'pausado'::"text", 'ativa'::"text", 'onboarding'::"text", 'pausada'::"text", 'encerrada'::"text"])))
);


ALTER TABLE "public"."lojas" OWNER TO "postgres";


COMMENT ON TABLE "public"."lojas" IS 'Lojas/clientes gerenciados pelo tenant. Base para client_facts e client_timeline.';



COMMENT ON COLUMN "public"."lojas"."nicho" IS 'Nicho/segmento da loja (ex: pizza, hamburguer, açaí)';



COMMENT ON COLUMN "public"."lojas"."plataforma" IS 'Plataforma principal (ex: ifood, rappi, ambos)';



COMMENT ON COLUMN "public"."lojas"."status" IS 'Status da loja: ativo, inativo, pausado';



COMMENT ON COLUMN "public"."lojas"."estado" IS 'Estado UF (ex: SP, RJ)';



COMMENT ON COLUMN "public"."lojas"."client_id" IS 'FK para customers — cliente/empresa proprietário da loja';



COMMENT ON COLUMN "public"."lojas"."is_consultoria_ativa" IS 'TRUE = consultoria ativa monitorada pelo deli-orchestrator (cliente_sumiu_7d, metrica_caiu_20pct). Controlada manualmente pelo Wandson. Default false: contato comum NAO e monitorado. Seed 2026-06-11 derivado da convencao de nome (CONSULTORIA -/CST), excluindo suspensas.';



COMMENT ON COLUMN "public"."lojas"."ifood_portal_nome" IS 'Nome exato da loja como aparece no switcher/modal "Escolher loja" do Portal do Parceiro iFood — usado por garantirLoja() para localizar/confirmar a loja certa.';



COMMENT ON COLUMN "public"."lojas"."whatsapp_group_jid" IS 'JID do grupo de WhatsApp da loja para onde o GESTOR posta relatórios/alertas.';



COMMENT ON COLUMN "public"."lojas"."fonte_dados" IS 'Fonte de coleta da loja: portal (browser/worker) ou api (oficial iFood). Migração gradual loja a loja — Frente A do Plano de Continuidade 2026-07.';



COMMENT ON COLUMN "public"."lojas"."is_contato" IS 'TRUE = linha classificada como contato de WhatsApp (higienização 2026-07-05), copiada para contatos. A linha permanece aqui (nunca DELETE) para não quebrar FK/histórico. Telas de listagem de loja devem filtrar is_contato = false.';



CREATE TABLE IF NOT EXISTS "public"."marca_pesquisa" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "loja_id" "uuid" NOT NULL,
    "documento_jsonb" "jsonb" NOT NULL,
    "fontes" "jsonb" DEFAULT '[]'::"jsonb",
    "origem" "text" DEFAULT 'manual'::"text",
    "versao" integer DEFAULT 1,
    "criado_por" "uuid",
    "ts" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "marca_pesquisa_origem_check" CHECK (("origem" = ANY (ARRAY['manual'::"text", 'nexus_pesquisa'::"text", 'mixed'::"text"])))
);


ALTER TABLE "public"."marca_pesquisa" OWNER TO "postgres";


COMMENT ON TABLE "public"."marca_pesquisa" IS 'Pesquisa profunda da marca de uma loja, gerada pela LARA + Nexus. Versionado: cada nova pesquisa cria nova linha.';



COMMENT ON COLUMN "public"."marca_pesquisa"."documento_jsonb" IS 'Documento completo: identificacao, operacao, cardapio, identidade, presenca_digital, base_clientes';



COMMENT ON COLUMN "public"."marca_pesquisa"."fontes" IS 'Array de URLs/origens consultadas: [{url, type, scraped_at}]';



CREATE TABLE IF NOT EXISTS "public"."max_knowledge_base" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid",
    "system_name" "text" NOT NULL,
    "title" "text" NOT NULL,
    "content" "text" NOT NULL,
    "tags" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."max_knowledge_base" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid",
    "conversation_id" "uuid" NOT NULL,
    "direction" "text" NOT NULL,
    "sender_kind" "text",
    "sender_user_id" "uuid",
    "sender_agent_id" "text",
    "body" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "sent_at" timestamp with time zone DEFAULT "now"(),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "whatsapp_msg_id" "text",
    "media_url" "text",
    "media_type" "text",
    "content" "text",
    "sender_name" "text",
    "delivery_status" smallint,
    "deleted_at" timestamp with time zone,
    "quoted_content" "jsonb",
    "reactions" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL
);

ALTER TABLE ONLY "public"."messages" REPLICA IDENTITY FULL;


ALTER TABLE "public"."messages" OWNER TO "postgres";


COMMENT ON COLUMN "public"."messages"."reactions" IS 'Array de reações WhatsApp no formato [{jid: string, emoji: string, name: string}]. Atualizado pelo evolution-webhook ao receber reactionMessage.';



CREATE TABLE IF NOT EXISTS "public"."mia_analises" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "conversation_id" "uuid",
    "message_id" "text",
    "sender_jid" "text",
    "message_body" "text" NOT NULL,
    "fatos" "text"[] DEFAULT '{}'::"text"[],
    "tarefas_sugeridas" "text"[] DEFAULT '{}'::"text"[],
    "confianca" numeric(3,2),
    "model_used" "text" DEFAULT 'kimi-k2.6:cloud'::"text",
    "latency_ms" integer,
    "status" "text" DEFAULT 'ok'::"text" NOT NULL,
    "error_message" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "mia_analises_status_check" CHECK (("status" = ANY (ARRAY['ok'::"text", 'error'::"text", 'skipped'::"text"])))
);


ALTER TABLE "public"."mia_analises" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."mia_audit_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "loja_id" "uuid",
    "vinculo_id" "uuid",
    "remote_jid" "text",
    "msg_count" integer DEFAULT 0 NOT NULL,
    "modelo_usado" "text" DEFAULT 'kimi-k2.6:cloud'::"text" NOT NULL,
    "latencia_ms" integer,
    "tokens_in" integer,
    "tokens_out" integer,
    "sugestoes_geradas" integer DEFAULT 0 NOT NULL,
    "erro" "text",
    "run_id" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."mia_audit_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."missions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "due_date" "date",
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "missions_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'achieved'::"text", 'on_hold'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."missions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."nexus_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "loja_id" "uuid" NOT NULL,
    "agent" "text" NOT NULL,
    "request_id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "status" "text" DEFAULT 'queued'::"text" NOT NULL,
    "request_payload" "jsonb",
    "response_payload" "jsonb",
    "error_detail" "text",
    "queued_at" timestamp with time zone DEFAULT "now"(),
    "responded_at" timestamp with time zone,
    "expires_at" timestamp with time zone DEFAULT ("now"() + '00:10:00'::interval),
    CONSTRAINT "nexus_requests_agent_check" CHECK (("agent" = ANY (ARRAY['pesquisa'::"text", 'regua'::"text", 'midia'::"text"]))),
    CONSTRAINT "nexus_requests_status_check" CHECK (("status" = ANY (ARRAY['queued'::"text", 'running'::"text", 'done'::"text", 'error'::"text", 'timeout'::"text"])))
);


ALTER TABLE "public"."nexus_requests" OWNER TO "postgres";


COMMENT ON TABLE "public"."nexus_requests" IS 'Rastreio de chamadas assíncronas da LARA aos sub-agentes Nexus. Cada invoke do Nexus gera uma linha; callback atualiza status e response_payload.';



CREATE TABLE IF NOT EXISTS "public"."notification_preferences" (
    "user_id" "uuid" NOT NULL,
    "sound_enabled" boolean DEFAULT true,
    "push_enabled" boolean DEFAULT true,
    "notify_nao_iniciados" boolean DEFAULT true,
    "notify_falha" boolean DEFAULT true,
    "notify_cliente_respondeu" boolean DEFAULT true,
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."notification_preferences" OWNER TO "postgres";


COMMENT ON TABLE "public"."notification_preferences" IS 'Preferências de notificação por atendente';



CREATE TABLE IF NOT EXISTS "public"."nova_blueprints" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "user_id" "uuid",
    "client_name" "text" NOT NULL,
    "segmento" "text",
    "problema" "text" NOT NULL,
    "objetivo" "text",
    "sistemas_atuais" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "budget_range" "text",
    "prazo_desejado" "text",
    "discovery" "jsonb",
    "blueprint" "jsonb",
    "estimate" "jsonb",
    "status" "text" DEFAULT 'discovery'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "nova_blueprints_status_check" CHECK (("status" = ANY (ARRAY['discovery'::"text", 'blueprint'::"text", 'complete'::"text"])))
);


ALTER TABLE "public"."nova_blueprints" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."nps_avaliacoes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "contact_identifier" "text" NOT NULL,
    "contact_nome" "text",
    "origin_conversation_id" "uuid",
    "public_token" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "public_token_expires_at" timestamp with time zone DEFAULT ("now"() + '7 days'::interval) NOT NULL,
    "nota" smallint,
    "comentario" "text",
    "status" "text" DEFAULT 'pendente'::"text" NOT NULL,
    "responded_at" timestamp with time zone,
    "tratativa_status" "text" DEFAULT 'na'::"text" NOT NULL,
    "tratativa_obs" "text",
    "tratativa_by" "uuid",
    "tratativa_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "msg_enviada_at" timestamp with time zone,
    "msg_enviada_status" "text",
    "external_ref" "text",
    "atendente_nome" "text",
    "assigned_to" "uuid",
    "agent_id" "text",
    "atendimento_inicio_at" timestamp with time zone,
    "atendimento_fim_at" timestamp with time zone,
    "duracao_minutos" integer,
    "qtd_mensagens" integer,
    "contact_phone" "text",
    "ticket_code" integer,
    "loja_id" "uuid",
    CONSTRAINT "nps_avaliacoes_nota_check" CHECK ((("nota" >= 0) AND ("nota" <= 10))),
    CONSTRAINT "nps_avaliacoes_status_check" CHECK (("status" = ANY (ARRAY['pendente'::"text", 'respondida'::"text", 'expirada'::"text"]))),
    CONSTRAINT "nps_avaliacoes_tratativa_status_check" CHECK (("tratativa_status" = ANY (ARRAY['na'::"text", 'pendente'::"text", 'em_andamento'::"text", 'resolvido'::"text"])))
);


ALTER TABLE "public"."nps_avaliacoes" OWNER TO "postgres";


COMMENT ON TABLE "public"."nps_avaliacoes" IS 'Pesquisas NPS de marca. Uma linha por ciclo de 30 dias por contato. Disparo: fechamento de conversa + cooldown de 30 dias por contact_identifier. Página pública consome via Bridge com service-role (sem policy anon).';



COMMENT ON COLUMN "public"."nps_avaliacoes"."contact_identifier" IS 'whatsapp_chat_id da conversa (ex: 5511999999999@s.whatsapp.net). Unidade de controle do cooldown de 30 dias.';



COMMENT ON COLUMN "public"."nps_avaliacoes"."nota" IS 'Escala NPS 0-10. NULL enquanto pendente. Promotor=9-10, Neutro/Passivo=7-8, Detrator=0-6.';



COMMENT ON COLUMN "public"."nps_avaliacoes"."tratativa_status" IS 'na=não aplicável (nota >= 7), pendente=detrator aberto, em_andamento=supervisor atuando, resolvido=encerrado.';



COMMENT ON COLUMN "public"."nps_avaliacoes"."ticket_code" IS 'Número do ticket/atendimento no Datacrazy (currentThread.code). Usado na notificação de detrator e para localizar o atendimento no painel.';



COMMENT ON COLUMN "public"."nps_avaliacoes"."loja_id" IS 'Fase 1c: vínculo opcional à loja. Preenchido quando a loja passa a operar atendimento pela plataforma.';



CREATE TABLE IF NOT EXISTS "public"."onboarding_checklists" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "customer_id" "uuid",
    "contrato_id" "uuid",
    "marco" "text" NOT NULL,
    "status" "text" DEFAULT 'pendente'::"text" NOT NULL,
    "concluido_em" timestamp with time zone,
    "notas" "text",
    "agendado_para" "date",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "onboarding_checklists_marco_check" CHECK (("marco" = ANY (ARRAY['D1'::"text", 'D7'::"text", 'D30'::"text", 'D60'::"text", 'D90'::"text"]))),
    CONSTRAINT "onboarding_checklists_status_check" CHECK (("status" = ANY (ARRAY['pendente'::"text", 'em_andamento'::"text", 'concluido'::"text"])))
);


ALTER TABLE "public"."onboarding_checklists" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."onboarding_templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid",
    "marco" "text" NOT NULL,
    "titulo" "text" NOT NULL,
    "descricao" "text" NOT NULL,
    "acao_automatica" "text",
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "onboarding_templates_marco_check" CHECK (("marco" = ANY (ARRAY['D1'::"text", 'D7'::"text", 'D30'::"text", 'D60'::"text", 'D90'::"text"])))
);


ALTER TABLE "public"."onboarding_templates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."onboarding_wizard_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "email" "text" NOT NULL,
    "whatsapp" "text",
    "nome_contato" "text",
    "nome_negocio" "text",
    "cnpj" "text",
    "faturamento_mensal_range" "text",
    "diagnostico" "jsonb" DEFAULT '{}'::"jsonb",
    "pacote_recomendado" "text",
    "passos_concluidos" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "status" "text" DEFAULT 'iniciado'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "completed_at" timestamp with time zone,
    CONSTRAINT "onboarding_wizard_sessions_pacote_recomendado_check" CHECK (("pacote_recomendado" = ANY (ARRAY['light'::"text", 'performance'::"text", 'ia_growth'::"text"]))),
    CONSTRAINT "onboarding_wizard_sessions_status_check" CHECK (("status" = ANY (ARRAY['iniciado'::"text", 'em_andamento'::"text", 'concluido'::"text"])))
);


ALTER TABLE "public"."onboarding_wizard_sessions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."oracle_drafts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'pendente'::"text" NOT NULL,
    "proposed_slug" "text" NOT NULL,
    "payload" "jsonb" NOT NULL,
    "source_chat" "jsonb",
    "created_by" "uuid" NOT NULL,
    "reviewed_by" "uuid",
    "review_note" "text",
    "agent_id" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "reviewed_at" timestamp with time zone,
    CONSTRAINT "oracle_drafts_status_check" CHECK (("status" = ANY (ARRAY['pendente'::"text", 'aprovado'::"text", 'rejeitado'::"text", 'aplicado'::"text"])))
);


ALTER TABLE "public"."oracle_drafts" OWNER TO "postgres";


COMMENT ON TABLE "public"."oracle_drafts" IS 'Drafts de AGENTE propostos pelo Oracle (chat de construção). Não confundir com agent_drafts (drafts de mensagem). Só status=aplicado gera linha em agents.';



CREATE TABLE IF NOT EXISTS "public"."orders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "customer_id" "uuid",
    "external_ref" "text",
    "channel" "text" DEFAULT 'ifood'::"text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "total_cents" integer DEFAULT 0 NOT NULL,
    "items_summary" "text",
    "placed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "delivered_at" timestamp with time zone,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "orders_channel_check" CHECK (("channel" = ANY (ARRAY['ifood'::"text", 'whatsapp'::"text", 'site'::"text", 'balcao'::"text", 'outro'::"text"]))),
    CONSTRAINT "orders_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'confirmed'::"text", 'preparing'::"text", 'delivering'::"text", 'delivered'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."orders" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "full_name" "text",
    "email" "text",
    "avatar_url" "text",
    "is_super" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."projects" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "mission_id" "uuid",
    "title" "text" NOT NULL,
    "description" "text",
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "projects_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'on_hold'::"text", 'completed'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."projects" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."prospect_abordagens" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "prospect_id" "uuid" NOT NULL,
    "canal" "text" NOT NULL,
    "mensagem" "text" NOT NULL,
    "status" "text" DEFAULT 'rascunho'::"text" NOT NULL,
    "created_by" "uuid",
    "approved_by" "uuid",
    "sent_at" timestamp with time zone,
    "responded_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "prospect_abordagens_canal_check" CHECK (("canal" = ANY (ARRAY['whatsapp'::"text", 'instagram_dm'::"text", 'email'::"text"]))),
    CONSTRAINT "prospect_abordagens_status_check" CHECK (("status" = ANY (ARRAY['rascunho'::"text", 'aprovada'::"text", 'enviada'::"text", 'respondida'::"text", 'sem_resposta'::"text"])))
);


ALTER TABLE "public"."prospect_abordagens" OWNER TO "postgres";


COMMENT ON TABLE "public"."prospect_abordagens" IS 'Rascunhos e histórico de mensagens de abordagem geradas pela SOFIA. Toda mensagem passa por aprovação humana antes do envio (política de drafts).';



COMMENT ON COLUMN "public"."prospect_abordagens"."status" IS 'Ciclo de vida: rascunho → aprovada → enviada → respondida | sem_resposta. Nunca enviar sem status aprovada.';



CREATE TABLE IF NOT EXISTS "public"."prospect_pesquisas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "prospect_id" "uuid" NOT NULL,
    "agent_run_id" "text",
    "dados_coletados" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "fontes" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."prospect_pesquisas" OWNER TO "postgres";


COMMENT ON TABLE "public"."prospect_pesquisas" IS 'Resultados brutos de cada ciclo de pesquisa executado pela SOFIA sobre um prospect. Cada execução do agente gera um registro, preservando histórico de coleta.';



COMMENT ON COLUMN "public"."prospect_pesquisas"."agent_run_id" IS 'ID do run no Trigger.dev que gerou esta pesquisa. NULL se não rastreado.';



CREATE TABLE IF NOT EXISTS "public"."prospects" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "nome" "text" NOT NULL,
    "cidade" "text",
    "estado" "text",
    "segmento" "text",
    "fonte" "text" NOT NULL,
    "instagram" "text",
    "whatsapp" "text",
    "site" "text",
    "ifood_link" "text",
    "avaliacao_ifood" numeric(2,1),
    "num_avaliacoes_ifood" integer,
    "cnpj" "text",
    "status" "text" DEFAULT 'novo'::"text" NOT NULL,
    "score" integer,
    "razao_score" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "prospects_fonte_check" CHECK (("fonte" = ANY (ARRAY['csv'::"text", 'manual'::"text", 'apify'::"text", 'outro'::"text"]))),
    CONSTRAINT "prospects_score_check" CHECK ((("score" >= 0) AND ("score" <= 100))),
    CONSTRAINT "prospects_segmento_check" CHECK (("segmento" = ANY (ARRAY['restaurante'::"text", 'hamburgueria'::"text", 'pizzaria'::"text", 'acai'::"text", 'lanches'::"text", 'saudavel'::"text", 'outro'::"text"]))),
    CONSTRAINT "prospects_status_check" CHECK (("status" = ANY (ARRAY['novo'::"text", 'pesquisando'::"text", 'qualificado'::"text", 'nao_qualificado'::"text", 'abordado'::"text", 'respondeu'::"text", 'convertido'::"text", 'descartado'::"text"])))
);


ALTER TABLE "public"."prospects" OWNER TO "postgres";


COMMENT ON TABLE "public"."prospects" IS 'Empresas de delivery identificadas como potenciais clientes da Consult Delivery. Populada pela SOFIA (SDR IA) via importação CSV, prospecção manual ou scraping Apify.';



COMMENT ON COLUMN "public"."prospects"."status" IS 'Estágio no funil SDR. Progressão: novo → pesquisando → qualificado/nao_qualificado → abordado → respondeu → convertido/descartado.';



COMMENT ON COLUMN "public"."prospects"."score" IS 'Score de 0-100 calculado pela SOFIA. NULL = ainda não avaliado.';



CREATE TABLE IF NOT EXISTS "public"."push_subscriptions" (
    "id" bigint NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "endpoint" "text" NOT NULL,
    "p256dh" "text" NOT NULL,
    "auth_key" "text" NOT NULL,
    "user_agent" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "last_used_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."push_subscriptions" OWNER TO "postgres";


COMMENT ON TABLE "public"."push_subscriptions" IS 'Subscriptions de Web Push por dispositivo/usuário';



CREATE SEQUENCE IF NOT EXISTS "public"."push_subscriptions_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."push_subscriptions_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."push_subscriptions_id_seq" OWNED BY "public"."push_subscriptions"."id";



CREATE TABLE IF NOT EXISTS "public"."quick_replies" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid",
    "agent_id" "uuid",
    "title" "text" NOT NULL,
    "content" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "shortcut" "text",
    "media_type" "text" DEFAULT 'text'::"text",
    "media_url" "text",
    "created_by" "uuid",
    "group_name" "text",
    "file_path" "text",
    "visible_user_ids" "uuid"[],
    "visible_dept_ids" "uuid"[],
    CONSTRAINT "quick_replies_media_type_check" CHECK (("media_type" = ANY (ARRAY['text'::"text", 'image'::"text", 'audio'::"text", 'video_link'::"text"])))
);


ALTER TABLE "public"."quick_replies" OWNER TO "postgres";


COMMENT ON COLUMN "public"."quick_replies"."group_name" IS 'Categoria/grupo da resposta rápida (ex: Cobrança, Boas-vindas)';



COMMENT ON COLUMN "public"."quick_replies"."file_path" IS 'Caminho no bucket Storage public (quick-replies/{tenant_id}/{uuid}.ext)';



COMMENT ON COLUMN "public"."quick_replies"."visible_user_ids" IS 'NULL = visível para todos; array de user_ids restringe a atendentes específicos';



COMMENT ON COLUMN "public"."quick_replies"."visible_dept_ids" IS 'NULL = todos os departamentos; array de department_ids restringe por depto';



CREATE TABLE IF NOT EXISTS "public"."radar_fontes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "loja_id" "uuid",
    "tipo_relatorio" "text",
    "origem" "text" DEFAULT 'planilha'::"text" NOT NULL,
    "arquivo_path" "text" NOT NULL,
    "arquivo_nome" "text",
    "periodo_inicio" "date",
    "periodo_fim" "date",
    "status" "text" DEFAULT 'pendente'::"text" NOT NULL,
    "erro_detalhe" "text",
    "resumo" "jsonb",
    "custo_usd" numeric,
    "enviado_por" "uuid",
    "processado_em" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "radar_fontes_origem_check" CHECK (("origem" = ANY (ARRAY['planilha'::"text", 'print'::"text"]))),
    CONSTRAINT "radar_fontes_status_check" CHECK (("status" = ANY (ARRAY['pendente'::"text", 'processado'::"text", 'erro'::"text"])))
);


ALTER TABLE "public"."radar_fontes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."radar_metricas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "loja_id" "uuid",
    "fonte_id" "uuid",
    "metrica" "text" NOT NULL,
    "valor" numeric,
    "valor_texto" "text",
    "periodo_inicio" "date",
    "periodo_fim" "date",
    "metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "granularidade" "text",
    "data_ref" "date",
    CONSTRAINT "radar_metricas_granularidade_check" CHECK (("granularidade" = ANY (ARRAY['dia'::"text", 'semana'::"text", 'mes'::"text", 'periodo'::"text"])))
);


ALTER TABLE "public"."radar_metricas" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."radar_series" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "loja_id" "uuid",
    "fonte_id" "uuid",
    "metrica" "text" NOT NULL,
    "dia" "date" NOT NULL,
    "valor" numeric,
    "metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."radar_series" OWNER TO "postgres";


COMMENT ON TABLE "public"."radar_series" IS 'Série diária de verdade do Dashboard iFood (Fase 5). Grão fino por dia onde a fonte tem (Operação/Cancelamentos/Logística). Escrita pelo cron radarProcessarFontes via service role.';



CREATE TABLE IF NOT EXISTS "public"."regua_cobranca" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "days" integer[] DEFAULT '{}'::integer[] NOT NULL,
    "channel" "text" DEFAULT 'whatsapp'::"text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."regua_cobranca" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."reguas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "loja_id" "uuid" NOT NULL,
    "pesquisa_id" "uuid",
    "status" "text" DEFAULT 'rascunho'::"text" NOT NULL,
    "cobertura_dias" integer DEFAULT 90 NOT NULL,
    "criada_por_agente" "text" DEFAULT 'lara'::"text",
    "criada_por" "uuid",
    "aprovada_por" "uuid",
    "aprovada_em" timestamp with time zone,
    "observacoes" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "criada_em" timestamp with time zone DEFAULT "now"(),
    "atualizada_em" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "reguas_cobertura_dias_check" CHECK ((("cobertura_dias" >= 30) AND ("cobertura_dias" <= 180))),
    CONSTRAINT "reguas_status_check" CHECK (("status" = ANY (ARRAY['rascunho'::"text", 'revisao'::"text", 'aprovada'::"text", 'em_geracao'::"text", 'revisao_midias'::"text", 'em_execucao'::"text", 'concluida'::"text", 'cancelada'::"text"])))
);


ALTER TABLE "public"."reguas" OWNER TO "postgres";


COMMENT ON TABLE "public"."reguas" IS 'Régua de disparo de 90 dias gerada pela LARA. Estado controlado por status (rascunho -> revisao -> aprovada -> em_execucao -> concluida).';



CREATE TABLE IF NOT EXISTS "public"."reviews" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "store" "text" NOT NULL,
    "order_id" "text" NOT NULL,
    "rating" integer NOT NULL,
    "client_name" "text",
    "client_comment" "text" NOT NULL,
    "suggested_response" "text" NOT NULL,
    "final_response" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "deadline" "text",
    "review_date" "text",
    "token" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "approved_at" timestamp with time zone,
    "published_at" timestamp with time zone,
    "whatsapp_group" "text",
    "sent_at" timestamp with time zone,
    "notes" "text",
    CONSTRAINT "reviews_rating_check" CHECK ((("rating" >= 1) AND ("rating" <= 5))),
    CONSTRAINT "reviews_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'sent_to_client'::"text", 'approved'::"text", 'modified'::"text", 'published'::"text"])))
);


ALTER TABLE "public"."reviews" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."role_permissions" (
    "role_id" "uuid" NOT NULL,
    "resource" "text" NOT NULL,
    "action" "text" NOT NULL
);


ALTER TABLE "public"."role_permissions" OWNER TO "postgres";


COMMENT ON TABLE "public"."role_permissions" IS 'Permissões por papel. resource: financeiro, crm, cobranca, analise_ifood, agents_panel, reports, tenant_admin, kanban, chat, grupos_whatsapp. action: view, create, edit, delete, execute, approve.';



CREATE TABLE IF NOT EXISTS "public"."roles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "is_system" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."roles" OWNER TO "postgres";


COMMENT ON TABLE "public"."roles" IS 'Papéis disponíveis dentro de um tenant. Ex: admin, dev, marketing, atendimento.';



CREATE TABLE IF NOT EXISTS "public"."sugestoes_ia" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "loja_id" "uuid" NOT NULL,
    "conversa_id" "uuid",
    "tipo" "text" NOT NULL,
    "conteudo" "text" NOT NULL,
    "evidencia" "jsonb",
    "confianca" "text" NOT NULL,
    "status" "text" DEFAULT 'pendente'::"text" NOT NULL,
    "criada_em" timestamp with time zone DEFAULT "now"() NOT NULL,
    "decidida_em" timestamp with time zone,
    "decidida_por" "uuid",
    "resultado_id" "uuid",
    "modelo_usado" "text",
    "run_id" "text",
    CONSTRAINT "sugestoes_ia_confianca_check" CHECK (("confianca" = ANY (ARRAY['alta'::"text", 'media'::"text", 'baixa'::"text"]))),
    CONSTRAINT "sugestoes_ia_status_check" CHECK (("status" = ANY (ARRAY['pendente'::"text", 'aprovada'::"text", 'rejeitada'::"text", 'editada'::"text"]))),
    CONSTRAINT "sugestoes_ia_tipo_check" CHECK (("tipo" = ANY (ARRAY['fact'::"text", 'tarefa'::"text"])))
);


ALTER TABLE "public"."sugestoes_ia" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sugestoes_plataforma" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid",
    "texto" "text" NOT NULL,
    "tela" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."sugestoes_plataforma" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."support_tickets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "conversation_id" "uuid",
    "sender_jid" "text" NOT NULL,
    "titulo" "text",
    "descricao" "text" NOT NULL,
    "status" "text" DEFAULT 'aberto'::"text" NOT NULL,
    "resolvido_por" "text",
    "resolucao" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "support_tickets_resolvido_por_check" CHECK (("resolvido_por" = ANY (ARRAY['breno'::"text", 'humano'::"text"]))),
    CONSTRAINT "support_tickets_status_check" CHECK (("status" = ANY (ARRAY['aberto'::"text", 'em_andamento'::"text", 'resolvido'::"text", 'escalado'::"text"])))
);


ALTER TABLE "public"."support_tickets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tarefa_anexos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tarefa_id" "uuid" NOT NULL,
    "acao_id" "uuid",
    "tenant_id" "uuid" NOT NULL,
    "url" "text" NOT NULL,
    "mime_type" "text" NOT NULL,
    "size_bytes" integer NOT NULL,
    "uploaded_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."tarefa_anexos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tarefa_aprovacoes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tarefa_id" "uuid" NOT NULL,
    "acao" "text" NOT NULL,
    "autor_id" "uuid",
    "nota" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "tarefa_aprovacoes_acao_check" CHECK (("acao" = ANY (ARRAY['enviada_aprovacao'::"text", 'aprovada'::"text", 'rejeitada'::"text", 'perguntou_duvida'::"text", 'iniciou_execucao'::"text", 'submeteu_validacao'::"text", 'concluiu'::"text", 'reabriu'::"text", 'reaberta'::"text"])))
);


ALTER TABLE "public"."tarefa_aprovacoes" OWNER TO "postgres";


COMMENT ON TABLE "public"."tarefa_aprovacoes" IS 'Log imutável de transições de status por tarefa. Nunca sofre UPDATE ou DELETE — apenas INSERT. Base do histórico no modal de tarefa (aba Histórico).';



COMMENT ON COLUMN "public"."tarefa_aprovacoes"."acao" IS 'Ação que ocorreu: enviada_aprovacao, aprovada, rejeitada, perguntou_duvida, iniciou_execucao, submeteu_validacao, concluiu, reabriu.';



COMMENT ON COLUMN "public"."tarefa_aprovacoes"."nota" IS 'Texto livre: motivo de rejeição, comentário de aprovação, dúvida. Opcional.';



CREATE TABLE IF NOT EXISTS "public"."tarefa_comentarios" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tarefa_id" "uuid" NOT NULL,
    "parent_id" "uuid",
    "print_id" "uuid",
    "autor_id" "uuid",
    "conteudo" "text" NOT NULL,
    "interno" boolean DEFAULT true NOT NULL,
    "editado_em" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."tarefa_comentarios" OWNER TO "postgres";


COMMENT ON TABLE "public"."tarefa_comentarios" IS 'Comentários internos e anotações por tarefa. Suporta threads via parent_id e link a prints via print_id. interno=true (padrão) = visível só equipe; interno=false = rascunho de mensagem ao cliente (fluxo drafts).';



COMMENT ON COLUMN "public"."tarefa_comentarios"."parent_id" IS 'Self-reference para threads. NULL = comentário raiz.';



COMMENT ON COLUMN "public"."tarefa_comentarios"."print_id" IS 'Vincula comentário a um print específico (anotação sobre imagem).';



COMMENT ON COLUMN "public"."tarefa_comentarios"."autor_id" IS 'NULL quando o comentário é gerado por agente IA via service role.';



CREATE TABLE IF NOT EXISTS "public"."tarefa_prints" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tarefa_id" "uuid" NOT NULL,
    "tipo" "text" NOT NULL,
    "storage_path" "text" NOT NULL,
    "url_publica" "text",
    "nome_arquivo" "text",
    "tamanho_bytes" integer,
    "mime_type" "text",
    "legenda" "text",
    "enviado_por" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "tarefa_prints_tipo_check" CHECK (("tipo" = ANY (ARRAY['antes'::"text", 'depois'::"text", 'referencia'::"text", 'aprovacao_cliente'::"text"])))
);


ALTER TABLE "public"."tarefa_prints" OWNER TO "postgres";


COMMENT ON TABLE "public"."tarefa_prints" IS 'Screenshots e imagens associadas a tarefas. Antes/depois documentam execução; aprovacao_cliente registra print da aprovação recebida (WhatsApp, e-mail etc).';



COMMENT ON COLUMN "public"."tarefa_prints"."storage_path" IS 'Caminho relativo no bucket tarefa-prints. Formato: {loja_id}/{tarefa_id}/{uuid}.{ext}';



COMMENT ON COLUMN "public"."tarefa_prints"."url_publica" IS 'Signed URL gerada pelo Bridge Server. Pode expirar — regenerar via GET /api/tarefas/:id/prints se null.';



CREATE TABLE IF NOT EXISTS "public"."tarefa_revisoes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tarefa_id" "uuid" NOT NULL,
    "tipo" "text" NOT NULL,
    "motivo" "text",
    "decidido_em" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "tarefa_revisoes_tipo_check" CHECK (("tipo" = ANY (ARRAY['aprovacao'::"text", 'recusa'::"text"])))
);


ALTER TABLE "public"."tarefa_revisoes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tarefas_analise" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "analise_id" "uuid",
    "cliente_id" "uuid" NOT NULL,
    "titulo" "text" NOT NULL,
    "descricao" "text",
    "acao" "text",
    "urgencia" "text" DEFAULT 'semana'::"text",
    "status" "text" DEFAULT 'pendente'::"text",
    "prioridade" integer DEFAULT 0,
    "impacto_financeiro" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "tarefas_analise_status_check" CHECK (("status" = ANY (ARRAY['pendente'::"text", 'em_andamento'::"text", 'concluida'::"text"]))),
    CONSTRAINT "tarefas_analise_urgencia_check" CHECK (("urgencia" = ANY (ARRAY['hoje'::"text", 'semana'::"text", 'proximo_ciclo'::"text"])))
);

ALTER TABLE ONLY "public"."tarefas_analise" REPLICA IDENTITY FULL;


ALTER TABLE "public"."tarefas_analise" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tarefas_loja" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "loja_id" "uuid" NOT NULL,
    "analise_id" "uuid",
    "bloco" "text" NOT NULL,
    "ordem_no_bloco" integer DEFAULT 0 NOT NULL,
    "titulo" "text" NOT NULL,
    "situacao" "text" NOT NULL,
    "o_que_sera_feito" "text" NOT NULL,
    "por_que_importa" "text",
    "status" "text" DEFAULT 'rascunho'::"text" NOT NULL,
    "prioridade" "text" DEFAULT 'estrutural'::"text",
    "prazo_estimado" "date",
    "aprovada_em" timestamp with time zone,
    "executada_em" timestamp with time zone,
    "concluida_em" timestamp with time zone,
    "responsavel_id" "uuid",
    "created_by" "uuid",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "tags" "text"[] DEFAULT '{}'::"text"[],
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "revisao_status" "text",
    "aguarda_revisao_em" timestamp with time zone,
    "revisao_motivo" "text",
    "criado_por_ia" boolean DEFAULT false NOT NULL,
    CONSTRAINT "tarefas_loja_bloco_check" CHECK (("bloco" = ANY (ARRAY['identidade'::"text", 'cardapio'::"text", 'operacao'::"text", 'avaliacoes'::"text", 'marketing'::"text", 'suporte'::"text"]))),
    CONSTRAINT "tarefas_loja_prioridade_check" CHECK (("prioridade" = ANY (ARRAY['quick_win'::"text", 'estrutural'::"text", 'material_cliente'::"text"]))),
    CONSTRAINT "tarefas_loja_revisao_status_check" CHECK (("revisao_status" = ANY (ARRAY['aguardando'::"text", 'aprovada'::"text", 'recusada'::"text"]))),
    CONSTRAINT "tarefas_loja_status_check" CHECK (("status" = ANY (ARRAY['rascunho'::"text", 'aguardando_envio'::"text", 'aguardando_aprovacao'::"text", 'aprovada'::"text", 'rejeitada'::"text", 'em_execucao'::"text", 'aguardando_validacao'::"text", 'concluida'::"text", 'cancelada'::"text"])))
);


ALTER TABLE "public"."tarefas_loja" OWNER TO "postgres";


COMMENT ON TABLE "public"."tarefas_loja" IS 'Tarefas de consultoria organizadas por bloco e loja. Ciclo de vida: rascunho → aprovada → concluida (ou cancelada). Núcleo do pipeline PILOTO Onda 02.';



COMMENT ON COLUMN "public"."tarefas_loja"."analise_id" IS 'FK opcional para analises. Preenchida quando a tarefa nasce de uma análise iFood automatizada (Onda 04). NULL = tarefa manual.';



COMMENT ON COLUMN "public"."tarefas_loja"."bloco" IS 'Agrupamento de trabalho: identidade, cardapio, operacao, avaliacoes, marketing, suporte.';



COMMENT ON COLUMN "public"."tarefas_loja"."ordem_no_bloco" IS 'Posição da tarefa dentro do bloco — controla ordenação no Kanban.';



COMMENT ON COLUMN "public"."tarefas_loja"."situacao" IS 'Descrição do estado atual da loja referente a este ponto. Texto livre gerado pelo consultor ou pela IA.';



COMMENT ON COLUMN "public"."tarefas_loja"."o_que_sera_feito" IS 'Ação concreta a executar. Obrigatório para criar a tarefa.';



COMMENT ON COLUMN "public"."tarefas_loja"."prioridade" IS 'quick_win = impacto rápido/baixo esforço; estrutural = muda algo fundamental; material_cliente = demanda material do cliente.';



COMMENT ON COLUMN "public"."tarefas_loja"."metadata" IS 'Bag JSON para extensões futuras sem ALTER TABLE (ex: link de drive, id externo, notas de rejeição).';



COMMENT ON COLUMN "public"."tarefas_loja"."criado_por_ia" IS 'true quando a tarefa foi criada via aprovação de sugestão do MIA (Monitor IA).';



CREATE TABLE IF NOT EXISTS "public"."task_comments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "task_id" "uuid" NOT NULL,
    "author_id" "uuid",
    "body" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."task_comments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tasks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "col" "text" DEFAULT 'todo'::"text" NOT NULL,
    "priority" "text" DEFAULT 'med'::"text" NOT NULL,
    "due_at" timestamp with time zone,
    "due_label" "text",
    "assignee_id" "uuid",
    "agent_id" "text",
    "attachments_count" integer DEFAULT 0 NOT NULL,
    "checklist_done" integer DEFAULT 0 NOT NULL,
    "checklist_total" integer DEFAULT 0 NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "analise_id" "uuid",
    "cliente_id" "uuid",
    "fonte" "text" DEFAULT 'manual'::"text",
    "resolucao" "text",
    CONSTRAINT "tasks_col_check" CHECK (("col" = ANY (ARRAY['todo'::"text", 'progress'::"text", 'review'::"text", 'done'::"text"]))),
    CONSTRAINT "tasks_fonte_check" CHECK (("fonte" = ANY (ARRAY['manual'::"text", 'analise'::"text"]))),
    CONSTRAINT "tasks_priority_check" CHECK (("priority" = ANY (ARRAY['low'::"text", 'med'::"text", 'high'::"text"])))
);


ALTER TABLE "public"."tasks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "tipo" "text" DEFAULT 'mensagem'::"text" NOT NULL,
    "nome" "text" NOT NULL,
    "conteudo" "text",
    "ativo" boolean DEFAULT true NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "templates_tipo_check" CHECK (("tipo" = ANY (ARRAY['mensagem'::"text", 'oferta'::"text"])))
);


ALTER TABLE "public"."templates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."templates_tarefa" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "bloco" "text" NOT NULL,
    "ordem" integer DEFAULT 0 NOT NULL,
    "titulo" "text" NOT NULL,
    "situacao_padrao" "text" NOT NULL,
    "o_que_sera_feito" "text" NOT NULL,
    "por_que_importa" "text",
    "prioridade" "text" DEFAULT 'estrutural'::"text",
    "ativo" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "templates_tarefa_bloco_check" CHECK (("bloco" = ANY (ARRAY['identidade'::"text", 'cardapio'::"text", 'operacao'::"text", 'avaliacoes'::"text", 'marketing'::"text", 'suporte'::"text"]))),
    CONSTRAINT "templates_tarefa_prioridade_check" CHECK (("prioridade" = ANY (ARRAY['quick_win'::"text", 'estrutural'::"text", 'material_cliente'::"text"])))
);


ALTER TABLE "public"."templates_tarefa" OWNER TO "postgres";


COMMENT ON TABLE "public"."templates_tarefa" IS 'Biblioteca de templates de tarefas por tenant. Bridge Server instancia templates → tarefas_loja ao aplicar em uma loja.';



CREATE TABLE IF NOT EXISTS "public"."tenant_agent_config" (
    "tenant_id" "uuid" NOT NULL,
    "agent_id" "text" NOT NULL,
    "modo_override" "text",
    "enabled" boolean DEFAULT true NOT NULL,
    "config" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "provider" "text",
    "cost_limit_usd" numeric,
    CONSTRAINT "tenant_agent_config_cost_limit_usd_check" CHECK (("cost_limit_usd" >= (0)::numeric)),
    CONSTRAINT "tenant_agent_config_modo_override_check" CHECK (("modo_override" = ANY (ARRAY['humano'::"text", 'hibrido'::"text", 'ia'::"text"]))),
    CONSTRAINT "tenant_agent_config_provider_check" CHECK (("provider" = ANY (ARRAY['anthropic'::"text", 'ollama'::"text", 'openrouter'::"text"])))
);


ALTER TABLE "public"."tenant_agent_config" OWNER TO "postgres";


COMMENT ON TABLE "public"."tenant_agent_config" IS 'Override por (tenant, agente). modo_override NULL = herda tenant.modo_padrao.';



COMMENT ON COLUMN "public"."tenant_agent_config"."provider" IS 'Provider preferido do tenant p/ este agente (NULL = usa padrao da plataforma). Sem efeito em runtime ainda — roteamento multi-provider (D1) consome depois.';



COMMENT ON COLUMN "public"."tenant_agent_config"."cost_limit_usd" IS 'Limite de custo mensal (US$) do tenant p/ este agente (NULL = sem limite). Sem efeito em runtime ainda.';



CREATE TABLE IF NOT EXISTS "public"."tenant_agents" (
    "tenant_id" "uuid" NOT NULL,
    "agent_id" "text" NOT NULL,
    "enabled" boolean DEFAULT true NOT NULL,
    "config" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."tenant_agents" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tenant_files" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "folder" "text" DEFAULT '/'::"text" NOT NULL,
    "size_bytes" bigint,
    "storage_path" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."tenant_files" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tenant_gatilhos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "nome" "text" NOT NULL,
    "fonte" "text" DEFAULT 'whatsapp'::"text" NOT NULL,
    "acao" "text" DEFAULT ''::"text" NOT NULL,
    "ativo" boolean DEFAULT true NOT NULL,
    "execucoes_7d" integer DEFAULT 0 NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."tenant_gatilhos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tenant_integracoes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "nome" "text" NOT NULL,
    "status" "text" DEFAULT 'conectada'::"text" NOT NULL,
    "usada_por" "text",
    "ordem" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "tenant_integracoes_status_check" CHECK (("status" = ANY (ARRAY['conectada'::"text", 'pendente'::"text", 'desconectada'::"text"])))
);


ALTER TABLE "public"."tenant_integracoes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tenant_links" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "arquivo" "text" NOT NULL,
    "url" "text" NOT NULL,
    "expira_em" timestamp with time zone,
    "acessos" integer DEFAULT 0 NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."tenant_links" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tenant_members" (
    "tenant_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "text" DEFAULT 'member'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "semaforo" "text" DEFAULT 'verde'::"text",
    "display_name" "text",
    CONSTRAINT "tenant_members_role_check" CHECK (("role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'consultor'::"text", 'operador'::"text", 'dev'::"text"])))
);


ALTER TABLE "public"."tenant_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tenant_modules" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "module_key" "text" NOT NULL,
    "enabled" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."tenant_modules" OWNER TO "postgres";


COMMENT ON TABLE "public"."tenant_modules" IS 'Allowlist de modulos do Console v2 por tenant. Sem linhas = acesso total (backward-compatible); com linhas = so module_key com enabled=true. module_key = id do item de menu em src/console/ConsoleV2.jsx (GRUPOS).';



COMMENT ON COLUMN "public"."tenant_modules"."module_key" IS 'Id do item de menu do Console v2 (ex.: visao, csat, nps). Desbloquear = inserir/ativar linha.';



CREATE TABLE IF NOT EXISTS "public"."tenant_provedores" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "provider" "text" NOT NULL,
    "modelo_padrao" "text",
    "chave_ref" "text",
    "status" "text" DEFAULT 'ativo'::"text" NOT NULL,
    "ordem" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "tenant_provedores_status_check" CHECK (("status" = ANY (ARRAY['ativo'::"text", 'fallback'::"text", 'inativo'::"text"])))
);


ALTER TABLE "public"."tenant_provedores" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tenant_sistemas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "nome" "text" NOT NULL,
    "endereco" "text",
    "tipo" "text",
    "ordem" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."tenant_sistemas" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tenant_tarefas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "titulo" "text" NOT NULL,
    "agente" "text",
    "quando" timestamp with time zone,
    "status" "text" DEFAULT 'agendada'::"text" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "tenant_tarefas_status_check" CHECK (("status" = ANY (ARRAY['agendada'::"text", 'executando'::"text", 'concluida'::"text", 'cancelada'::"text"])))
);


ALTER TABLE "public"."tenant_tarefas" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tenant_topicos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "titulo" "text" NOT NULL,
    "prioridade" "text" DEFAULT 'media'::"text" NOT NULL,
    "responsavel" "text",
    "status" "text" DEFAULT 'aberto'::"text" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "tenant_topicos_prioridade_check" CHECK (("prioridade" = ANY (ARRAY['baixa'::"text", 'media'::"text", 'alta'::"text", 'urgente'::"text"]))),
    CONSTRAINT "tenant_topicos_status_check" CHECK (("status" = ANY (ARRAY['aberto'::"text", 'em_andamento'::"text", 'concluido'::"text", 'arquivado'::"text"])))
);


ALTER TABLE "public"."tenant_topicos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tenants" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "slug" "text" NOT NULL,
    "name" "text" NOT NULL,
    "emoji" "text",
    "color" "text",
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "plan" "text" DEFAULT 'pro'::"text" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "logo_url" "text",
    "segment" "text",
    "phone" "text",
    "city" "text",
    "theme_color" "text" DEFAULT '#B70C00'::"text",
    "is_active" boolean DEFAULT true NOT NULL,
    "modo_padrao" "text" DEFAULT 'hibrido'::"text" NOT NULL,
    "parent_tenant_id" "uuid",
    "tenant_type" "text" DEFAULT 'store'::"text" NOT NULL,
    CONSTRAINT "tenants_modo_padrao_check" CHECK (("modo_padrao" = ANY (ARRAY['humano'::"text", 'hibrido'::"text", 'ia'::"text"]))),
    CONSTRAINT "tenants_plan_check" CHECK (("plan" = ANY (ARRAY['starter'::"text", 'pro'::"text", 'enterprise'::"text"]))),
    CONSTRAINT "tenants_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'paused'::"text", 'trial'::"text", 'churned'::"text"]))),
    CONSTRAINT "tenants_tenant_type_chk" CHECK (("tenant_type" = ANY (ARRAY['platform'::"text", 'agency'::"text", 'store'::"text"])))
);


ALTER TABLE "public"."tenants" OWNER TO "postgres";


COMMENT ON COLUMN "public"."tenants"."is_active" IS 'false = tenant desativado (sem acesso, dados preservados)';



COMMENT ON COLUMN "public"."tenants"."modo_padrao" IS 'humano = agentes só sugerem; hibrido = agentes agem em tarefas seguras; ia = agentes agem sozinhos';



CREATE TABLE IF NOT EXISTS "public"."user_agent_access" (
    "user_id" "uuid" NOT NULL,
    "agent_name" "text" NOT NULL,
    "can_invoke" boolean DEFAULT true NOT NULL,
    "can_view_history" boolean DEFAULT true NOT NULL,
    "can_approve_drafts" boolean DEFAULT false NOT NULL,
    "granted_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "granted_by" "uuid",
    "tenant_id" "uuid" NOT NULL,
    "agent_id" "text" NOT NULL
);


ALTER TABLE "public"."user_agent_access" OWNER TO "postgres";


COMMENT ON TABLE "public"."user_agent_access" IS 'Controle granular de acesso a agentes IA. Sobrescreve permissões de role para um agente específico.';



CREATE TABLE IF NOT EXISTS "public"."user_roles" (
    "user_id" "uuid" NOT NULL,
    "role_id" "uuid" NOT NULL,
    "granted_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "granted_by" "uuid"
);


ALTER TABLE "public"."user_roles" OWNER TO "postgres";


COMMENT ON TABLE "public"."user_roles" IS 'Associação usuário ↔ papel. Um usuário pode ter múltiplos papéis.';



CREATE TABLE IF NOT EXISTS "public"."user_screen_permissions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "screen_id" "text" NOT NULL,
    "allowed" boolean NOT NULL,
    "granted_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."user_screen_permissions" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."v_chart_7d" WITH ("security_invoker"='true') AS
 SELECT "tenant_id",
    "day",
    "pedidos_count"
   FROM "public"."daily_kpis"
  WHERE ("day" >= (CURRENT_DATE - '6 days'::interval));


ALTER VIEW "public"."v_chart_7d" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."v_dashboard_kpis" WITH ("security_invoker"='true') AS
 SELECT "tenant_id",
    "day",
    "pedidos_count",
    "pedidos_delta_pct",
    "ticket_medio_cents",
    "ticket_delta_pct",
    "tarefas_count",
    "tarefas_urgentes",
    "inadimplencia_cents",
    "inadimplencia_clientes"
   FROM "public"."daily_kpis" "k"
  WHERE ("day" = ( SELECT "max"("k2"."day") AS "max"
           FROM "public"."daily_kpis" "k2"
          WHERE ("k2"."tenant_id" = "k"."tenant_id")));


ALTER VIEW "public"."v_dashboard_kpis" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."val_desempenho_coleta" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "loja" "text" NOT NULL,
    "data_ref" "date" NOT NULL,
    "periodo" "text" DEFAULT 'dia'::"text" NOT NULL,
    "aba" "text" NOT NULL,
    "metrica" "text" NOT NULL,
    "valor" numeric,
    "valor_texto" "text",
    "variacao_pct" numeric,
    "coletado_em" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "val_desempenho_coleta_aba_check" CHECK (("aba" = ANY (ARRAY['vendas'::"text", 'operacao'::"text", 'negociacoes'::"text", 'cardapio'::"text", 'clientes'::"text", 'marketing'::"text", 'logistica'::"text"]))),
    CONSTRAINT "val_desempenho_coleta_periodo_check" CHECK (("periodo" = ANY (ARRAY['dia'::"text", '7d'::"text", '30d'::"text"])))
);


ALTER TABLE "public"."val_desempenho_coleta" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."val_kpi_coleta_diaria" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "loja" "text" NOT NULL,
    "data_ref" "date" NOT NULL,
    "loja_aberta" boolean,
    "faturamento_ontem" numeric(10,2),
    "pedidos_ontem" integer,
    "cancelamentos_ontem" integer,
    "nota" numeric(3,2),
    "novas_avaliacoes" integer,
    "produtos_pausados" integer,
    "produtos_pausados_nomes" "text"[],
    "observacoes" "jsonb" DEFAULT '{}'::"jsonb",
    "semaforo" "text",
    "motivo_semaforo" "text",
    "coletado_em" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "val_kpi_coleta_diaria_semaforo_check" CHECK (("semaforo" = ANY (ARRAY['critico'::"text", 'atencao'::"text", 'estavel'::"text"])))
);


ALTER TABLE "public"."val_kpi_coleta_diaria" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."vendaerp_instances" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "base_url" "text" DEFAULT 'https://cw.vendaerp.com.br'::"text" NOT NULL,
    "token_ref" "text",
    "user_ref" "text",
    "app_ref" "text",
    "status" "text" DEFAULT 'pendente'::"text" NOT NULL,
    "last_check_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "vendaerp_instances_status_check" CHECK (("status" = ANY (ARRAY['conectada'::"text", 'pendente'::"text", 'desconectada'::"text"])))
);


ALTER TABLE "public"."vendaerp_instances" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."vendaerp_proposals" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "tipo" "text" NOT NULL,
    "endpoint" "text" NOT NULL,
    "http_method" "text" DEFAULT 'POST'::"text" NOT NULL,
    "payload" "jsonb" NOT NULL,
    "resumo" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "token" "text" NOT NULL,
    "origin" "text" DEFAULT 'hermes'::"text" NOT NULL,
    "expires_at" timestamp with time zone DEFAULT ("now"() + '00:10:00'::interval) NOT NULL,
    "executed_at" timestamp with time zone,
    "resultado" "jsonb",
    "erro" "text",
    "created_by" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "confirm_code_hash" "text",
    "confirm_attempts" integer DEFAULT 0 NOT NULL,
    CONSTRAINT "vendaerp_proposals_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'confirmed'::"text", 'executed'::"text", 'failed'::"text", 'expired'::"text", 'cancelled'::"text"]))),
    CONSTRAINT "vendaerp_proposals_tipo_check" CHECK (("tipo" = ANY (ARRAY['oportunidade'::"text", 'lancamento'::"text", 'boleto'::"text", 'nfe'::"text", 'estoque'::"text"])))
);


ALTER TABLE "public"."vendaerp_proposals" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."vera_anomalias" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "detectada_em" timestamp with time zone DEFAULT "now"() NOT NULL,
    "metrica" "text" NOT NULL,
    "valor_esperado" numeric(10,4),
    "valor_observado" numeric(10,4),
    "severidade" "text" DEFAULT 'info'::"text" NOT NULL,
    "explicacao" "text",
    "notificado" boolean DEFAULT false NOT NULL,
    "resolvida" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "vera_anomalias_severidade_check" CHECK (("severidade" = ANY (ARRAY['info'::"text", 'warning'::"text", 'critical'::"text"])))
);


ALTER TABLE "public"."vera_anomalias" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."vera_metricas_snapshot" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "data" "date" NOT NULL,
    "metricas" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."vera_metricas_snapshot" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."vera_reports" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "tipo" "text" NOT NULL,
    "periodo_inicio" timestamp with time zone NOT NULL,
    "periodo_fim" timestamp with time zone NOT NULL,
    "titulo" "text" NOT NULL,
    "resumo_executivo" "text",
    "conteudo_markdown" "text",
    "metricas" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "destinatarios" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "agent_run_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "read_at" timestamp with time zone,
    CONSTRAINT "vera_reports_tipo_check" CHECK (("tipo" = ANY (ARRAY['diario'::"text", 'semanal'::"text", 'mensal'::"text", 'customizado'::"text", 'anomalia'::"text"])))
);


ALTER TABLE "public"."vera_reports" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."view_metricas_agentes_dia" WITH ("security_invoker"='true') AS
 SELECT "tenant_id",
    "agent_id",
    ("created_at")::"date" AS "data",
    "count"(*) AS "num_runs",
    "count"(*) FILTER (WHERE ("status" = 'success'::"text")) AS "num_success",
    "count"(*) FILTER (WHERE ("status" = 'failed'::"text")) AS "num_failed",
    COALESCE("sum"("cost_usd"), (0)::numeric) AS "custo_total_usd",
    (COALESCE("avg"("duration_ms") FILTER (WHERE ("duration_ms" IS NOT NULL)), (0)::numeric))::integer AS "duracao_media_ms"
   FROM "public"."agent_runs"
  WHERE ("tenant_id" IS NOT NULL)
  GROUP BY "tenant_id", "agent_id", (("created_at")::"date");


ALTER VIEW "public"."view_metricas_agentes_dia" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."whatsapp_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "evolution_message_id" "text" NOT NULL,
    "group_id" "uuid",
    "contact_id" "uuid",
    "conversation_id" "uuid",
    "is_group" boolean DEFAULT false NOT NULL,
    "direction" "text" NOT NULL,
    "content" "text",
    "message_type" "text",
    "media_url" "text",
    "is_mention_to_bot" boolean DEFAULT false NOT NULL,
    "mentioned_agent" "text",
    "processed_by_deli" boolean DEFAULT false NOT NULL,
    "ts" timestamp with time zone DEFAULT "now"() NOT NULL,
    "sender_contact_id" "uuid" NOT NULL,
    "media_metadata" "jsonb",
    CONSTRAINT "whatsapp_messages_direction_check" CHECK (("direction" = ANY (ARRAY['inbound'::"text", 'outbound'::"text"]))),
    CONSTRAINT "whatsapp_messages_media_type_check" CHECK (("message_type" = ANY (ARRAY['text'::"text", 'image'::"text", 'audio'::"text", 'video'::"text", 'document'::"text", 'sticker'::"text"])))
);


ALTER TABLE "public"."whatsapp_messages" OWNER TO "postgres";


COMMENT ON TABLE "public"."whatsapp_messages" IS 'Todas as mensagens WA do tenant. is_mention_to_bot: agente foi @mencionado. mentioned_agent: qual agente foi chamado. DELI avalia todas; só age nas com is_mention_to_bot=true ou via triggers.';



COMMENT ON COLUMN "public"."whatsapp_messages"."evolution_message_id" IS 'ID único da mensagem na Evolution API';



COMMENT ON COLUMN "public"."whatsapp_messages"."content" IS 'Texto da mensagem ou legenda de mídia';



COMMENT ON COLUMN "public"."whatsapp_messages"."message_type" IS 'Tipo: text, image, audio, video, document, sticker';



COMMENT ON COLUMN "public"."whatsapp_messages"."ts" IS 'Timestamp da mensagem (do Evolution API)';



COMMENT ON COLUMN "public"."whatsapp_messages"."sender_contact_id" IS 'FK para whatsapp_contacts — quem enviou (NOT NULL se tabela estava vazia)';



CREATE OR REPLACE VIEW "public"."view_metricas_conversas_dia" WITH ("security_invoker"='true') AS
 SELECT "c"."tenant_id",
    ("c"."created_at")::"date" AS "data",
    "count"(DISTINCT "c"."id") AS "num_conversas_novas",
    "count"("wm"."id") FILTER (WHERE ("wm"."direction" = 'inbound'::"text")) AS "num_mensagens_inbound",
    "count"("wm"."id") FILTER (WHERE ("wm"."direction" = 'outbound'::"text")) AS "num_mensagens_outbound"
   FROM ("public"."conversations" "c"
     LEFT JOIN "public"."whatsapp_messages" "wm" ON ((("wm"."conversation_id" = "c"."id") AND (("wm"."ts")::"date" = ("c"."created_at")::"date"))))
  WHERE ("c"."tenant_id" IS NOT NULL)
  GROUP BY "c"."tenant_id", (("c"."created_at")::"date");


ALTER VIEW "public"."view_metricas_conversas_dia" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."view_metricas_negocio_dia" WITH ("security_invoker"='true') AS
 SELECT "tenant_id",
    ("created_at")::"date" AS "data",
    "count"(*) AS "num_prospects_novos",
    "count"(*) FILTER (WHERE ("status" = ANY (ARRAY['qualificado'::"text", 'abordado'::"text", 'respondeu'::"text", 'convertido'::"text"]))) AS "num_prospects_qualificados",
    "count"(*) FILTER (WHERE ("status" = 'convertido'::"text")) AS "num_clientes_novos"
   FROM "public"."prospects"
  WHERE ("tenant_id" IS NOT NULL)
  GROUP BY "tenant_id", (("created_at")::"date");


ALTER VIEW "public"."view_metricas_negocio_dia" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."whatsapp_aprovacao_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "analise_id" "uuid" NOT NULL,
    "loja_id" "uuid" NOT NULL,
    "numero_destino" "text" NOT NULL,
    "evolution_instance" "text" NOT NULL,
    "status" "text" DEFAULT 'ativa'::"text",
    "expira_em" timestamp with time zone DEFAULT ("now"() + '7 days'::interval) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "encerrada_em" timestamp with time zone,
    CONSTRAINT "whatsapp_aprovacao_sessions_status_check" CHECK (("status" = ANY (ARRAY['ativa'::"text", 'concluida'::"text", 'expirada'::"text", 'cancelada'::"text"])))
);


ALTER TABLE "public"."whatsapp_aprovacao_sessions" OWNER TO "postgres";


COMMENT ON TABLE "public"."whatsapp_aprovacao_sessions" IS 'Sessões de aprovação de análise via WhatsApp (Onda 04). Cada linha é uma conversa ativa aguardando resposta do destinatário. TTL padrão: 7 dias.';



COMMENT ON COLUMN "public"."whatsapp_aprovacao_sessions"."analise_id" IS 'Análise que gerou esta sessão de aprovação. Cascade delete: se a análise for removida, a sessão some junto.';



COMMENT ON COLUMN "public"."whatsapp_aprovacao_sessions"."loja_id" IS 'Loja associada à análise. Usada para resolver o tenant_id via JOIN em policies RLS.';



COMMENT ON COLUMN "public"."whatsapp_aprovacao_sessions"."numero_destino" IS 'Número WhatsApp do destinatário no formato Evolution API (ex: 5511999999999@s.whatsapp.net ou grupo@g.us).';



COMMENT ON COLUMN "public"."whatsapp_aprovacao_sessions"."evolution_instance" IS 'Nome da instância Evolution API usada para envio (ex: consult-delivery-main).';



COMMENT ON COLUMN "public"."whatsapp_aprovacao_sessions"."status" IS 'Estado da sessão: ativa (aguardando resposta), concluida (aprovada/rejeitada), expirada (TTL vencido), cancelada (cancelada manualmente).';



COMMENT ON COLUMN "public"."whatsapp_aprovacao_sessions"."expira_em" IS 'Data/hora de expiração da sessão. Após esse timestamp o status deve ser marcado como expirada por job agendado.';



CREATE TABLE IF NOT EXISTS "public"."whatsapp_contacts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "evolution_jid" "text" NOT NULL,
    "display_name" "text",
    "phone" "text",
    "loja_id" "uuid",
    "tipo" "text" DEFAULT 'cliente'::"text" NOT NULL,
    "ativo" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "is_internal" boolean DEFAULT false NOT NULL,
    "internal_user_id" "uuid"
);


ALTER TABLE "public"."whatsapp_contacts" OWNER TO "postgres";


COMMENT ON TABLE "public"."whatsapp_contacts" IS 'Contatos únicos por tenant. jid: +5511999@s.whatsapp.net. tipo: cliente, equipe, desconhecido.';



COMMENT ON COLUMN "public"."whatsapp_contacts"."evolution_jid" IS 'JID do contato no WhatsApp via Evolution API (ex: +5511999@s.whatsapp.net)';



COMMENT ON COLUMN "public"."whatsapp_contacts"."display_name" IS 'Nome de exibição do contato (pushName ou nome salvo)';



COMMENT ON COLUMN "public"."whatsapp_contacts"."phone" IS 'Número de telefone limpo (sem JID)';



COMMENT ON COLUMN "public"."whatsapp_contacts"."is_internal" IS 'TRUE se o contato é membro da equipe Consult Delivery';



COMMENT ON COLUMN "public"."whatsapp_contacts"."internal_user_id" IS 'FK para auth.users se is_internal = TRUE';



CREATE TABLE IF NOT EXISTS "public"."whatsapp_group_members" (
    "group_id" "uuid" NOT NULL,
    "contact_id" "uuid" NOT NULL,
    "is_admin" boolean DEFAULT false NOT NULL,
    "joined_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "role_in_group" "text"
);


ALTER TABLE "public"."whatsapp_group_members" OWNER TO "postgres";


COMMENT ON TABLE "public"."whatsapp_group_members" IS 'Membros de grupos WhatsApp. Inclui dono, sócios, gerentes e equipe Consult Delivery.';



COMMENT ON COLUMN "public"."whatsapp_group_members"."is_admin" IS 'Atalho para admin (mantido por compatibilidade)';



COMMENT ON COLUMN "public"."whatsapp_group_members"."role_in_group" IS 'Papel no grupo: owner, admin, member, equipe_consult';



CREATE TABLE IF NOT EXISTS "public"."whatsapp_groups" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "evolution_jid" "text" NOT NULL,
    "group_name" "text" NOT NULL,
    "loja_id" "uuid",
    "ativo" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "bom_dia_ativo" boolean DEFAULT false NOT NULL,
    "encerramento_ativo" boolean DEFAULT false NOT NULL,
    "monitorar_inatividade" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."whatsapp_groups" OWNER TO "postgres";


COMMENT ON TABLE "public"."whatsapp_groups" IS 'Grupos WhatsApp do tenant. group_jid: 5511xxx@g.us. loja_id: associação ao cliente.';



COMMENT ON COLUMN "public"."whatsapp_groups"."evolution_jid" IS 'JID do grupo no WhatsApp via Evolution API (ex: 5511xxx@g.us)';



COMMENT ON COLUMN "public"."whatsapp_groups"."group_name" IS 'Nome do grupo (subject do WhatsApp)';



COMMENT ON COLUMN "public"."whatsapp_groups"."bom_dia_ativo" IS 'Se true, este grupo recebe a mensagem BomDia automática agendada pelo agente.';



COMMENT ON COLUMN "public"."whatsapp_groups"."monitorar_inatividade" IS 'TRUE = grupo monitorado pela régua cliente_sumiu_7d do deli-orchestrator: alerta no Telegram interno se o grupo ficar 7+ dias sem mensagem em whatsapp_messages. Controlada manualmente pelo Wandson na tela Grupos WhatsApp. Default false: grupo NÃO é monitorado.';



ALTER TABLE ONLY "public"."audit_log" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."audit_log_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."client_timeline" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."client_timeline_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."conversation_status_log" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."conversation_status_log_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."deli_actions_log" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."deli_actions_log_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."push_subscriptions" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."push_subscriptions_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."aceite_recontratacao"
    ADD CONSTRAINT "aceite_recontratacao_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."agent_action_approvals"
    ADD CONSTRAINT "agent_action_approvals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."agent_actions"
    ADD CONSTRAINT "agent_actions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."agent_chat_messages"
    ADD CONSTRAINT "agent_chat_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."agent_corrections"
    ADD CONSTRAINT "agent_corrections_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."agent_drafts"
    ADD CONSTRAINT "agent_drafts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."agent_knowledge_base"
    ADD CONSTRAINT "agent_knowledge_base_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."agent_memories"
    ADD CONSTRAINT "agent_memories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."agent_prompts"
    ADD CONSTRAINT "agent_prompts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."agent_runs"
    ADD CONSTRAINT "agent_runs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."agent_runs"
    ADD CONSTRAINT "agent_runs_trigger_dev_run_id_key" UNIQUE ("trigger_dev_run_id");



ALTER TABLE ONLY "public"."agent_skills"
    ADD CONSTRAINT "agent_skills_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."agent_ticket_activity"
    ADD CONSTRAINT "agent_ticket_activity_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."agent_ticket_comments"
    ADD CONSTRAINT "agent_ticket_comments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."agent_tickets"
    ADD CONSTRAINT "agent_tickets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."agente_analises"
    ADD CONSTRAINT "agente_analises_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."agents"
    ADD CONSTRAINT "agents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."analise_loja"
    ADD CONSTRAINT "analise_loja_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."analises"
    ADD CONSTRAINT "analises_job_id_key" UNIQUE ("job_id");



ALTER TABLE ONLY "public"."analises"
    ADD CONSTRAINT "analises_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."analises"
    ADD CONSTRAINT "analises_public_token_key" UNIQUE ("public_token");



ALTER TABLE ONLY "public"."asaas_eventos"
    ADD CONSTRAINT "asaas_eventos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."atendimento_avaliacoes"
    ADD CONSTRAINT "atendimento_avaliacoes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."atendimento_avaliacoes"
    ADD CONSTRAINT "atendimento_avaliacoes_public_token_key" UNIQUE ("public_token");



ALTER TABLE ONLY "public"."audit_log"
    ADD CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."avaliacao_config"
    ADD CONSTRAINT "avaliacao_config_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."avaliacao_config"
    ADD CONSTRAINT "avaliacao_config_tenant_id_key" UNIQUE ("tenant_id");



ALTER TABLE ONLY "public"."avaliacoes_loja_config"
    ADD CONSTRAINT "avaliacoes_loja_config_loja_id_key" UNIQUE ("loja_id");



ALTER TABLE ONLY "public"."avaliacoes_loja_config"
    ADD CONSTRAINT "avaliacoes_loja_config_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."avaliacoes"
    ADD CONSTRAINT "avaliacoes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."bom_dia_config"
    ADD CONSTRAINT "bom_dia_config_pkey" PRIMARY KEY ("tenant_id");



ALTER TABLE ONLY "public"."bom_dia_feedback"
    ADD CONSTRAINT "bom_dia_feedback_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."bom_dia_feedback"
    ADD CONSTRAINT "bom_dia_feedback_run_id_tenant_id_key" UNIQUE ("run_id", "tenant_id");



ALTER TABLE ONLY "public"."bot_configs"
    ADD CONSTRAINT "bot_configs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."bot_configs"
    ADD CONSTRAINT "bot_configs_tenant_id_key" UNIQUE ("tenant_id");



ALTER TABLE ONLY "public"."bot_reply_log"
    ADD CONSTRAINT "bot_reply_log_pkey" PRIMARY KEY ("conversation_id", "reply_date");



ALTER TABLE ONLY "public"."breno_interactions"
    ADD CONSTRAINT "breno_interactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."breno_message_buffer"
    ADD CONSTRAINT "breno_message_buffer_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."breno_message_buffer"
    ADD CONSTRAINT "breno_message_buffer_tenant_id_conversation_id_key" UNIQUE ("tenant_id", "conversation_id");



ALTER TABLE ONLY "public"."breno_triagem"
    ADD CONSTRAINT "breno_triagem_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."campanha_ativos"
    ADD CONSTRAINT "campanha_ativos_campanha_id_variacao_key" UNIQUE ("campanha_id", "variacao");



ALTER TABLE ONLY "public"."campanha_ativos"
    ADD CONSTRAINT "campanha_ativos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."campanhas"
    ADD CONSTRAINT "campanhas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."campanhas"
    ADD CONSTRAINT "campanhas_regua_id_ordem_key" UNIQUE ("regua_id", "ordem");



ALTER TABLE ONLY "public"."channel_members"
    ADD CONSTRAINT "channel_members_pkey" PRIMARY KEY ("channel_id", "user_id");



ALTER TABLE ONLY "public"."channel_messages"
    ADD CONSTRAINT "channel_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."chat_tasks"
    ADD CONSTRAINT "chat_tasks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."client_facts"
    ADD CONSTRAINT "client_facts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."client_tasks"
    ADD CONSTRAINT "client_tasks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."client_timeline"
    ADD CONSTRAINT "client_timeline_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cobranca_eventos"
    ADD CONSTRAINT "cobranca_eventos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cobrancas"
    ADD CONSTRAINT "cobrancas_asaas_charge_id_key" UNIQUE ("asaas_charge_id");



ALTER TABLE ONLY "public"."cobrancas"
    ADD CONSTRAINT "cobrancas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."contact_optout"
    ADD CONSTRAINT "contact_optout_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."contact_optout"
    ADD CONSTRAINT "contact_optout_tenant_id_contact_identifier_canal_key" UNIQUE ("tenant_id", "contact_identifier", "canal");



ALTER TABLE ONLY "public"."contact_tags"
    ADD CONSTRAINT "contact_tags_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."contatos"
    ADD CONSTRAINT "contatos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."content_calendar"
    ADD CONSTRAINT "content_calendar_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."content_drafts"
    ADD CONSTRAINT "content_drafts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."content_published"
    ADD CONSTRAINT "content_published_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."contratos"
    ADD CONSTRAINT "contratos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."conversation_events"
    ADD CONSTRAINT "conversation_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."conversation_status_log"
    ADD CONSTRAINT "conversation_status_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."conversation_tags"
    ADD CONSTRAINT "conversation_tags_pkey" PRIMARY KEY ("conversation_id", "tag_id");



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cora_acoes"
    ADD CONSTRAINT "cora_acoes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cora_cobrancas"
    ADD CONSTRAINT "cora_cobrancas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cora_reguas"
    ADD CONSTRAINT "cora_reguas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."crm_notas"
    ADD CONSTRAINT "crm_notas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."crm_webhook_tokens"
    ADD CONSTRAINT "crm_webhook_tokens_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."custom_field_values"
    ADD CONSTRAINT "custom_field_values_custom_field_id_entidade_id_key" UNIQUE ("custom_field_id", "entidade_id");



ALTER TABLE ONLY "public"."custom_field_values"
    ADD CONSTRAINT "custom_field_values_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."custom_fields"
    ADD CONSTRAINT "custom_fields_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."custom_fields"
    ADD CONSTRAINT "custom_fields_tenant_id_entidade_nome_key" UNIQUE ("tenant_id", "entidade", "nome");



ALTER TABLE ONLY "public"."customer_addresses"
    ADD CONSTRAINT "customer_addresses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."customer_group_members"
    ADD CONSTRAINT "customer_group_members_pkey" PRIMARY KEY ("group_id", "customer_id");



ALTER TABLE ONLY "public"."customer_groups"
    ADD CONSTRAINT "customer_groups_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."customer_note_entries"
    ADD CONSTRAINT "customer_note_entries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."customer_notes"
    ADD CONSTRAINT "customer_notes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."customer_notes"
    ADD CONSTRAINT "customer_notes_tenant_id_customer_id_key" UNIQUE ("tenant_id", "customer_id");



ALTER TABLE ONLY "public"."customer_tag_relations"
    ADD CONSTRAINT "customer_tag_relations_pkey" PRIMARY KEY ("customer_id", "tag_id");



ALTER TABLE ONLY "public"."customer_tags"
    ADD CONSTRAINT "customer_tags_pkey" PRIMARY KEY ("customer_id", "tag_id");



ALTER TABLE ONLY "public"."customers"
    ADD CONSTRAINT "customers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."daily_kpis"
    ADD CONSTRAINT "daily_kpis_pkey" PRIMARY KEY ("tenant_id", "day");



ALTER TABLE ONLY "public"."defesa_aprovadores"
    ADD CONSTRAINT "defesa_aprovadores_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."defesa_assinaturas"
    ADD CONSTRAINT "defesa_assinaturas_asaas_subscription_id_key" UNIQUE ("asaas_subscription_id");



ALTER TABLE ONLY "public"."defesa_assinaturas"
    ADD CONSTRAINT "defesa_assinaturas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."defesa_casos"
    ADD CONSTRAINT "defesa_casos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."deli_actions_log"
    ADD CONSTRAINT "deli_actions_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."deli_agenda"
    ADD CONSTRAINT "deli_agenda_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."deli_messages"
    ADD CONSTRAINT "deli_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."deli_pending_approvals"
    ADD CONSTRAINT "deli_pending_approvals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."deli_triggers"
    ADD CONSTRAINT "deli_triggers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."department_members"
    ADD CONSTRAINT "department_members_pkey" PRIMARY KEY ("department_id", "user_id");



ALTER TABLE ONLY "public"."departments"
    ADD CONSTRAINT "departments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."departments"
    ADD CONSTRAINT "departments_tenant_id_name_key" UNIQUE ("tenant_id", "name");



ALTER TABLE ONLY "public"."encerramento_config"
    ADD CONSTRAINT "encerramento_config_pkey" PRIMARY KEY ("tenant_id");



ALTER TABLE ONLY "public"."espacos_columns"
    ADD CONSTRAINT "espacos_columns_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."espacos_folders"
    ADD CONSTRAINT "espacos_folders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."espacos_lists"
    ADD CONSTRAINT "espacos_lists_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."espacos_workspaces"
    ADD CONSTRAINT "espacos_workspaces_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."estudio_criacoes"
    ADD CONSTRAINT "estudio_criacoes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."evolution_instances"
    ADD CONSTRAINT "evolution_instances_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."goal_tasks"
    ADD CONSTRAINT "goal_tasks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."goals"
    ADD CONSTRAINT "goals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."heartbeat_runs"
    ADD CONSTRAINT "heartbeat_runs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."heartbeats"
    ADD CONSTRAINT "heartbeats_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."heartbeats"
    ADD CONSTRAINT "heartbeats_tenant_id_name_key" UNIQUE ("tenant_id", "name");



ALTER TABLE ONLY "public"."ifood_merchants"
    ADD CONSTRAINT "ifood_merchants_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inadimplencia_messages"
    ADD CONSTRAINT "inadimplencia_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inadimplencias"
    ADD CONSTRAINT "inadimplencias_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."internal_channels"
    ADD CONSTRAINT "internal_channels_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."internal_notifications"
    ADD CONSTRAINT "internal_notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."lead_list_members"
    ADD CONSTRAINT "lead_list_members_pkey" PRIMARY KEY ("list_id", "customer_id");



ALTER TABLE ONLY "public"."lead_lists"
    ADD CONSTRAINT "lead_lists_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."lead_lists"
    ADD CONSTRAINT "lead_lists_tenant_id_name_key" UNIQUE ("tenant_id", "name");



ALTER TABLE ONLY "public"."lead_tags"
    ADD CONSTRAINT "lead_tags_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."lead_tags"
    ADD CONSTRAINT "lead_tags_tenant_id_name_key" UNIQUE ("tenant_id", "name");



ALTER TABLE ONLY "public"."leads"
    ADD CONSTRAINT "leads_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."loja_consultores"
    ADD CONSTRAINT "loja_consultores_loja_id_user_id_key" UNIQUE ("loja_id", "user_id");



ALTER TABLE ONLY "public"."loja_consultores"
    ADD CONSTRAINT "loja_consultores_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."loja_gpt_conversations"
    ADD CONSTRAINT "loja_gpt_conversations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."loja_gpt_messages"
    ADD CONSTRAINT "loja_gpt_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."loja_metricas"
    ADD CONSTRAINT "loja_metricas_loja_id_data_ref_fonte_key" UNIQUE ("loja_id", "data", "fonte");



ALTER TABLE ONLY "public"."loja_metricas"
    ADD CONSTRAINT "loja_metricas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."loja_metricas_snapshot"
    ADD CONSTRAINT "loja_metricas_snapshot_loja_id_data_key" UNIQUE ("loja_id", "data");



ALTER TABLE ONLY "public"."loja_metricas_snapshot"
    ADD CONSTRAINT "loja_metricas_snapshot_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."loja_whatsapp_vinculo"
    ADD CONSTRAINT "loja_whatsapp_vinculo_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."loja_whatsapp_vinculo"
    ADD CONSTRAINT "loja_whatsapp_vinculo_tenant_id_remote_jid_key" UNIQUE ("tenant_id", "remote_jid");



ALTER TABLE ONLY "public"."lojas"
    ADD CONSTRAINT "lojas_pkey" PRIMARY KEY ("id");



ALTER TABLE "public"."avaliacao_config"
    ADD CONSTRAINT "maia_autonomy_chk" CHECK (("maia_autonomy_mode" = ANY (ARRAY['aprovacao'::"text", 'automatico'::"text"]))) NOT VALID;



ALTER TABLE ONLY "public"."marca_pesquisa"
    ADD CONSTRAINT "marca_pesquisa_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."max_knowledge_base"
    ADD CONSTRAINT "max_knowledge_base_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_whatsapp_msg_id_unique" UNIQUE ("whatsapp_msg_id");



ALTER TABLE ONLY "public"."mia_analises"
    ADD CONSTRAINT "mia_analises_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."mia_audit_log"
    ADD CONSTRAINT "mia_audit_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."missions"
    ADD CONSTRAINT "missions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."nexus_requests"
    ADD CONSTRAINT "nexus_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."nexus_requests"
    ADD CONSTRAINT "nexus_requests_request_id_key" UNIQUE ("request_id");



ALTER TABLE ONLY "public"."notification_preferences"
    ADD CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."nova_blueprints"
    ADD CONSTRAINT "nova_blueprints_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."nps_avaliacoes"
    ADD CONSTRAINT "nps_avaliacoes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."nps_avaliacoes"
    ADD CONSTRAINT "nps_avaliacoes_public_token_key" UNIQUE ("public_token");



ALTER TABLE "public"."nps_avaliacoes"
    ADD CONSTRAINT "nps_duracao_chk" CHECK ((("duracao_minutos" IS NULL) OR ("duracao_minutos" >= 0))) NOT VALID;



ALTER TABLE "public"."nps_avaliacoes"
    ADD CONSTRAINT "nps_nota_chk" CHECK ((("nota" IS NULL) OR (("nota" >= 0) AND ("nota" <= 10)))) NOT VALID;



ALTER TABLE ONLY "public"."onboarding_checklists"
    ADD CONSTRAINT "onboarding_checklists_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."onboarding_templates"
    ADD CONSTRAINT "onboarding_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."onboarding_wizard_sessions"
    ADD CONSTRAINT "onboarding_wizard_sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."oracle_drafts"
    ADD CONSTRAINT "oracle_drafts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."projects"
    ADD CONSTRAINT "projects_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."prospect_abordagens"
    ADD CONSTRAINT "prospect_abordagens_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."prospect_pesquisas"
    ADD CONSTRAINT "prospect_pesquisas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."prospects"
    ADD CONSTRAINT "prospects_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_endpoint_key" UNIQUE ("endpoint");



ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."quick_replies"
    ADD CONSTRAINT "quick_replies_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."radar_fontes"
    ADD CONSTRAINT "radar_fontes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."radar_metricas"
    ADD CONSTRAINT "radar_metricas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."radar_series"
    ADD CONSTRAINT "radar_series_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."regua_cobranca"
    ADD CONSTRAINT "regua_cobranca_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."reguas"
    ADD CONSTRAINT "reguas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "reviews_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "reviews_token_key" UNIQUE ("token");



ALTER TABLE ONLY "public"."role_permissions"
    ADD CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id", "resource", "action");



ALTER TABLE ONLY "public"."roles"
    ADD CONSTRAINT "roles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."roles"
    ADD CONSTRAINT "roles_tenant_id_name_key" UNIQUE ("tenant_id", "name");



ALTER TABLE ONLY "public"."sugestoes_ia"
    ADD CONSTRAINT "sugestoes_ia_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sugestoes_plataforma"
    ADD CONSTRAINT "sugestoes_plataforma_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."support_tickets"
    ADD CONSTRAINT "support_tickets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tarefa_anexos"
    ADD CONSTRAINT "tarefa_anexos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tarefa_aprovacoes"
    ADD CONSTRAINT "tarefa_aprovacoes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tarefa_comentarios"
    ADD CONSTRAINT "tarefa_comentarios_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tarefa_prints"
    ADD CONSTRAINT "tarefa_prints_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tarefa_revisoes"
    ADD CONSTRAINT "tarefa_revisoes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tarefas_analise"
    ADD CONSTRAINT "tarefas_analise_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tarefas_loja"
    ADD CONSTRAINT "tarefas_loja_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."task_comments"
    ADD CONSTRAINT "task_comments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."templates"
    ADD CONSTRAINT "templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."templates_tarefa"
    ADD CONSTRAINT "templates_tarefa_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."templates_tarefa"
    ADD CONSTRAINT "templates_tarefa_tenant_id_bloco_titulo_key" UNIQUE ("tenant_id", "bloco", "titulo");



ALTER TABLE ONLY "public"."tenant_agent_config"
    ADD CONSTRAINT "tenant_agent_config_pkey" PRIMARY KEY ("tenant_id", "agent_id");



ALTER TABLE ONLY "public"."tenant_agents"
    ADD CONSTRAINT "tenant_agents_pkey" PRIMARY KEY ("tenant_id", "agent_id");



ALTER TABLE ONLY "public"."tenant_files"
    ADD CONSTRAINT "tenant_files_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tenant_gatilhos"
    ADD CONSTRAINT "tenant_gatilhos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tenant_integracoes"
    ADD CONSTRAINT "tenant_integracoes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tenant_links"
    ADD CONSTRAINT "tenant_links_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tenant_members"
    ADD CONSTRAINT "tenant_members_pkey" PRIMARY KEY ("tenant_id", "user_id");



ALTER TABLE ONLY "public"."tenant_modules"
    ADD CONSTRAINT "tenant_modules_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tenant_modules"
    ADD CONSTRAINT "tenant_modules_tenant_module_uq" UNIQUE ("tenant_id", "module_key");



ALTER TABLE ONLY "public"."tenant_provedores"
    ADD CONSTRAINT "tenant_provedores_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tenant_sistemas"
    ADD CONSTRAINT "tenant_sistemas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tenant_tarefas"
    ADD CONSTRAINT "tenant_tarefas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tenant_topicos"
    ADD CONSTRAINT "tenant_topicos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tenants"
    ADD CONSTRAINT "tenants_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tenants"
    ADD CONSTRAINT "tenants_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."user_agent_access"
    ADD CONSTRAINT "uq_uaa_tenant_user_agent" UNIQUE ("tenant_id", "user_id", "agent_id");



ALTER TABLE ONLY "public"."user_agent_access"
    ADD CONSTRAINT "user_agent_access_pkey" PRIMARY KEY ("user_id", "agent_name");



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_pkey" PRIMARY KEY ("user_id", "role_id");



ALTER TABLE ONLY "public"."user_screen_permissions"
    ADD CONSTRAINT "user_screen_permissions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_screen_permissions"
    ADD CONSTRAINT "user_screen_permissions_user_id_tenant_id_screen_id_key" UNIQUE ("user_id", "tenant_id", "screen_id");



ALTER TABLE ONLY "public"."val_desempenho_coleta"
    ADD CONSTRAINT "val_desempenho_coleta_loja_data_ref_periodo_aba_metrica_key" UNIQUE ("loja", "data_ref", "periodo", "aba", "metrica");



ALTER TABLE ONLY "public"."val_desempenho_coleta"
    ADD CONSTRAINT "val_desempenho_coleta_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."val_kpi_coleta_diaria"
    ADD CONSTRAINT "val_kpi_coleta_diaria_loja_data_ref_key" UNIQUE ("loja", "data_ref");



ALTER TABLE ONLY "public"."val_kpi_coleta_diaria"
    ADD CONSTRAINT "val_kpi_coleta_diaria_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."vendaerp_instances"
    ADD CONSTRAINT "vendaerp_instances_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."vendaerp_instances"
    ADD CONSTRAINT "vendaerp_instances_tenant_id_key" UNIQUE ("tenant_id");



ALTER TABLE ONLY "public"."vendaerp_proposals"
    ADD CONSTRAINT "vendaerp_proposals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."vera_anomalias"
    ADD CONSTRAINT "vera_anomalias_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."vera_metricas_snapshot"
    ADD CONSTRAINT "vera_metricas_snapshot_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."vera_metricas_snapshot"
    ADD CONSTRAINT "vera_metricas_snapshot_tenant_data_ukey" UNIQUE ("tenant_id", "data");



ALTER TABLE ONLY "public"."vera_reports"
    ADD CONSTRAINT "vera_reports_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."whatsapp_aprovacao_sessions"
    ADD CONSTRAINT "whatsapp_aprovacao_sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."whatsapp_contacts"
    ADD CONSTRAINT "whatsapp_contacts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."whatsapp_contacts"
    ADD CONSTRAINT "whatsapp_contacts_tenant_id_jid_key" UNIQUE ("tenant_id", "evolution_jid");



ALTER TABLE ONLY "public"."whatsapp_group_members"
    ADD CONSTRAINT "whatsapp_group_members_pkey" PRIMARY KEY ("group_id", "contact_id");



ALTER TABLE ONLY "public"."whatsapp_groups"
    ADD CONSTRAINT "whatsapp_groups_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."whatsapp_groups"
    ADD CONSTRAINT "whatsapp_groups_tenant_id_group_jid_key" UNIQUE ("tenant_id", "evolution_jid");



ALTER TABLE ONLY "public"."whatsapp_messages"
    ADD CONSTRAINT "whatsapp_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."whatsapp_messages"
    ADD CONSTRAINT "whatsapp_messages_tenant_id_message_id_key" UNIQUE ("tenant_id", "evolution_message_id");



CREATE INDEX "agent_actions_agent_id_idx" ON "public"."agent_actions" USING "btree" ("agent_id");



CREATE INDEX "agent_actions_agent_idx" ON "public"."agent_actions" USING "btree" ("tenant_id", "agent_id", "occurred_at" DESC);



CREATE INDEX "agent_actions_tenant_time_idx" ON "public"."agent_actions" USING "btree" ("tenant_id", "occurred_at" DESC);



CREATE INDEX "agent_chat_messages_tenant_agent_loja_idx" ON "public"."agent_chat_messages" USING "btree" ("tenant_id", "agent_id", "loja_id", "created_at");



CREATE INDEX "agent_memories_agent_tenant_idx" ON "public"."agent_memories" USING "btree" ("agent_id", "tenant_id");



CREATE INDEX "agent_memories_expires_at_idx" ON "public"."agent_memories" USING "btree" ("expires_at") WHERE ("expires_at" IS NOT NULL);



CREATE UNIQUE INDEX "agent_prompts_agent_tenant_version_idx" ON "public"."agent_prompts" USING "btree" ("agent_id", COALESCE("tenant_id", '00000000-0000-0000-0000-000000000000'::"uuid"), "version");



CREATE INDEX "agent_runs_agent_id_idx" ON "public"."agent_runs" USING "btree" ("agent_id");



CREATE INDEX "agent_runs_created_at_idx" ON "public"."agent_runs" USING "btree" ("created_at" DESC);



CREATE INDEX "agent_runs_tenant_id_idx" ON "public"."agent_runs" USING "btree" ("tenant_id");



CREATE INDEX "agent_runs_triggered_by_idx" ON "public"."agent_runs" USING "btree" ("triggered_by");



CREATE INDEX "agent_skills_tenant_idx" ON "public"."agent_skills" USING "btree" ("tenant_id");



CREATE INDEX "agente_analises_idx" ON "public"."agente_analises" USING "btree" ("tenant_id", "agente", "status", "created_at" DESC);



CREATE INDEX "agents_tenant_id_idx" ON "public"."agents" USING "btree" ("tenant_id");



CREATE INDEX "analise_loja_tenant_idx" ON "public"."analise_loja" USING "btree" ("tenant_id", "status", "created_at" DESC);



CREATE UNIQUE INDEX "atend_aval_conversation_unique_partial" ON "public"."atendimento_avaliacoes" USING "btree" ("conversation_id") WHERE ("conversation_id" IS NOT NULL);



CREATE UNIQUE INDEX "atend_aval_tenant_external_ref_unique" ON "public"."atendimento_avaliacoes" USING "btree" ("tenant_id", "external_ref") WHERE ("external_ref" IS NOT NULL);



CREATE INDEX "bom_dia_feedback_tenant_run_idx" ON "public"."bom_dia_feedback" USING "btree" ("tenant_id", "created_at" DESC);



CREATE INDEX "channel_messages_channel_id_created_at_idx" ON "public"."channel_messages" USING "btree" ("channel_id", "created_at");



CREATE INDEX "channel_messages_channel_id_is_pinned_idx" ON "public"."channel_messages" USING "btree" ("channel_id", "is_pinned") WHERE ("is_pinned" = true);



CREATE INDEX "conversations_agent_id_idx" ON "public"."conversations" USING "btree" ("agent_id");



CREATE INDEX "conversations_customer_id_idx" ON "public"."conversations" USING "btree" ("customer_id");



CREATE INDEX "conversations_last_msg_idx" ON "public"."conversations" USING "btree" ("tenant_id", "last_message_at" DESC);



CREATE INDEX "conversations_tenant_idx" ON "public"."conversations" USING "btree" ("tenant_id");



CREATE INDEX "conversations_tenant_type_idx" ON "public"."conversations" USING "btree" ("tenant_id", "type");



CREATE INDEX "cora_acoes_cobranca_idx" ON "public"."cora_acoes" USING "btree" ("cobranca_id", "created_at" DESC);



CREATE INDEX "cora_acoes_tenant_idx" ON "public"."cora_acoes" USING "btree" ("tenant_id", "created_at" DESC);



CREATE INDEX "cora_cobrancas_status_idx" ON "public"."cora_cobrancas" USING "btree" ("tenant_id", "status");



CREATE INDEX "cora_cobrancas_tenant_idx" ON "public"."cora_cobrancas" USING "btree" ("tenant_id", "status", "data_vencimento");



CREATE INDEX "cora_reguas_tenant_idx" ON "public"."cora_reguas" USING "btree" ("tenant_id");



CREATE INDEX "crm_notas_customer_idx" ON "public"."crm_notas" USING "btree" ("tenant_id", "customer_id", "created_at" DESC);



CREATE INDEX "crm_webhook_tokens_tenant_idx" ON "public"."crm_webhook_tokens" USING "btree" ("tenant_id");



CREATE UNIQUE INDEX "crm_webhook_tokens_token_hash_unique" ON "public"."crm_webhook_tokens" USING "btree" ("token_hash");



CREATE INDEX "customers_phone_idx" ON "public"."customers" USING "btree" ("tenant_id", "phone");



CREATE INDEX "customers_tenant_idx" ON "public"."customers" USING "btree" ("tenant_id");



CREATE INDEX "daily_kpis_tenant_day_desc_idx" ON "public"."daily_kpis" USING "btree" ("tenant_id", "day" DESC);



CREATE INDEX "defesa_aprovadores_tenant_idx" ON "public"."defesa_aprovadores" USING "btree" ("tenant_id") WHERE "ativo";



CREATE UNIQUE INDEX "defesa_aprovadores_uniq" ON "public"."defesa_aprovadores" USING "btree" ("tenant_id", "telefone_jid", COALESCE("loja_id", '00000000-0000-0000-0000-000000000000'::"uuid"));



CREATE INDEX "defesa_assinaturas_tenant_idx" ON "public"."defesa_assinaturas" USING "btree" ("tenant_id");



CREATE INDEX "defesa_casos_tenant_created_idx" ON "public"."defesa_casos" USING "btree" ("tenant_id", "created_at" DESC);



CREATE INDEX "defesa_casos_tenant_status_idx" ON "public"."defesa_casos" USING "btree" ("tenant_id", "status");



CREATE INDEX "deli_messages_tenant_user_idx" ON "public"."deli_messages" USING "btree" ("tenant_id", "user_id", "created_at");



CREATE UNIQUE INDEX "deli_pending_approvals_dedup_waiting" ON "public"."deli_pending_approvals" USING "btree" ("dedup_key") WHERE (("status" = 'waiting'::"text") AND ("dedup_key" IS NOT NULL));



CREATE INDEX "drafts_idx_nps_avaliacao" ON "public"."agent_drafts" USING "btree" ("nps_avaliacao_id");



CREATE INDEX "estudio_criacoes_fila_idx" ON "public"."estudio_criacoes" USING "btree" ("status") WHERE ("status" = 'fila'::"text");



CREATE INDEX "estudio_criacoes_tenant_idx" ON "public"."estudio_criacoes" USING "btree" ("tenant_id", "created_at" DESC);



CREATE INDEX "idx_agent_approvals_tenant_status" ON "public"."agent_action_approvals" USING "btree" ("tenant_id", "status") WHERE ("status" = 'pending'::"text");



CREATE INDEX "idx_agent_drafts_hermes_pending" ON "public"."agent_drafts" USING "btree" ("tenant_id", "created_at" DESC) WHERE (("origin" = 'hermes'::"text") AND ("status" = 'pending'::"text"));



CREATE INDEX "idx_agent_drafts_reviewer_id" ON "public"."agent_drafts" USING "btree" ("reviewer_id");



CREATE INDEX "idx_agent_ticket_comments_ticket" ON "public"."agent_ticket_comments" USING "btree" ("ticket_id");



CREATE INDEX "idx_agent_tickets_assignee" ON "public"."agent_tickets" USING "btree" ("assignee_agent") WHERE ("assignee_agent" IS NOT NULL);



CREATE INDEX "idx_agent_tickets_status" ON "public"."agent_tickets" USING "btree" ("status");



CREATE INDEX "idx_agent_tickets_tenant" ON "public"."agent_tickets" USING "btree" ("tenant_id");



CREATE INDEX "idx_analises_job_id" ON "public"."analises" USING "btree" ("job_id");



CREATE INDEX "idx_analises_loja_onda04" ON "public"."analises" USING "btree" ("loja_id", "created_at" DESC) WHERE ("loja_id" IS NOT NULL);



CREATE INDEX "idx_analises_public_token" ON "public"."analises" USING "btree" ("public_token");



CREATE INDEX "idx_analises_tenant_status" ON "public"."analises" USING "btree" ("tenant_id", "status");



CREATE INDEX "idx_aprovacoes_autor" ON "public"."tarefa_aprovacoes" USING "btree" ("autor_id");



CREATE INDEX "idx_aprovacoes_tarefa" ON "public"."tarefa_aprovacoes" USING "btree" ("tarefa_id", "created_at" DESC);



CREATE INDEX "idx_asaas_eventos_charge" ON "public"."asaas_eventos" USING "btree" ("asaas_charge_id");



CREATE INDEX "idx_asaas_eventos_contrato" ON "public"."asaas_eventos" USING "btree" ("contrato_id") WHERE ("contrato_id" IS NOT NULL);



CREATE INDEX "idx_asaas_eventos_tenant" ON "public"."asaas_eventos" USING "btree" ("tenant_id", "received_at" DESC);



CREATE INDEX "idx_at_aval_msg_pendente" ON "public"."atendimento_avaliacoes" USING "btree" ("tenant_id", "created_at" DESC) WHERE (("msg_enviada_at" IS NULL) AND ("status" = 'pendente'::"text"));



CREATE INDEX "idx_atend_aval_conversation_id" ON "public"."atendimento_avaliacoes" USING "btree" ("conversation_id");



CREATE UNIQUE INDEX "idx_atend_aval_public_token" ON "public"."atendimento_avaliacoes" USING "btree" ("public_token");



CREATE INDEX "idx_atend_aval_tenant_assigned_to" ON "public"."atendimento_avaliacoes" USING "btree" ("tenant_id", "assigned_to");



CREATE INDEX "idx_atend_aval_tenant_status" ON "public"."atendimento_avaliacoes" USING "btree" ("tenant_id", "status");



CREATE INDEX "idx_atend_aval_tenant_tratativa_status" ON "public"."atendimento_avaliacoes" USING "btree" ("tenant_id", "tratativa_status");



CREATE INDEX "idx_atendimento_avaliacoes_loja_id" ON "public"."atendimento_avaliacoes" USING "btree" ("loja_id") WHERE ("loja_id" IS NOT NULL);



CREATE INDEX "idx_audit_log_agent_ts" ON "public"."audit_log" USING "btree" ("agent_name", "created_at" DESC);



CREATE INDEX "idx_audit_log_tenant_ts" ON "public"."audit_log" USING "btree" ("tenant_id", "created_at" DESC);



CREATE INDEX "idx_audit_log_user_ts" ON "public"."audit_log" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "idx_avaliacoes_loja" ON "public"."avaliacoes" USING "btree" ("loja_id");



CREATE INDEX "idx_avaliacoes_status" ON "public"."avaliacoes" USING "btree" ("tenant_id", "status");



CREATE INDEX "idx_bot_reply_log_tenant_date" ON "public"."bot_reply_log" USING "btree" ("tenant_id", "reply_date" DESC);



CREATE INDEX "idx_breno_interactions_conversation_id" ON "public"."breno_interactions" USING "btree" ("conversation_id");



CREATE INDEX "idx_breno_interactions_requires_review" ON "public"."breno_interactions" USING "btree" ("tenant_id", "created_at" DESC) WHERE ("requires_review" = true);



CREATE INDEX "idx_breno_interactions_tenant_id" ON "public"."breno_interactions" USING "btree" ("tenant_id", "created_at" DESC);



CREATE INDEX "idx_breno_triagem_tenant_nivel" ON "public"."breno_triagem" USING "btree" ("tenant_id", "nivel", "created_at" DESC);



CREATE INDEX "idx_campanha_ativos_campanha" ON "public"."campanha_ativos" USING "btree" ("campanha_id");



CREATE INDEX "idx_campanha_ativos_selecionada" ON "public"."campanha_ativos" USING "btree" ("campanha_id") WHERE ("selecionada" = true);



CREATE INDEX "idx_campanhas_regua" ON "public"."campanhas" USING "btree" ("regua_id", "ordem");



CREATE INDEX "idx_campanhas_status" ON "public"."campanhas" USING "btree" ("status");



CREATE INDEX "idx_campanhas_tenant" ON "public"."campanhas" USING "btree" ("tenant_id");



CREATE INDEX "idx_cgm_customer" ON "public"."customer_group_members" USING "btree" ("customer_id");



CREATE INDEX "idx_cgm_group" ON "public"."customer_group_members" USING "btree" ("group_id");



CREATE INDEX "idx_chat_tasks_assignee" ON "public"."chat_tasks" USING "btree" ("assignee_id") WHERE ("assignee_id" IS NOT NULL);



CREATE INDEX "idx_chat_tasks_loja" ON "public"."chat_tasks" USING "btree" ("tenant_id", "loja_id", "status");



CREATE INDEX "idx_chat_tasks_tenant_status" ON "public"."chat_tasks" USING "btree" ("tenant_id", "status");



CREATE INDEX "idx_client_facts_loja" ON "public"."client_facts" USING "btree" ("loja_id");



CREATE INDEX "idx_client_facts_tenant" ON "public"."client_facts" USING "btree" ("tenant_id");



CREATE INDEX "idx_client_tasks_assignee" ON "public"."client_tasks" USING "btree" ("assignee_id") WHERE ("assignee_id" IS NOT NULL);



CREATE INDEX "idx_client_tasks_column_position" ON "public"."client_tasks" USING "btree" ("column_id", "position");



CREATE INDEX "idx_client_tasks_customer" ON "public"."client_tasks" USING "btree" ("tenant_id", "customer_id");



CREATE INDEX "idx_client_tasks_customer_phase_position" ON "public"."client_tasks" USING "btree" ("customer_id", "phase_id", "position");



CREATE INDEX "idx_client_tasks_list_position" ON "public"."client_tasks" USING "btree" ("list_id", "position");



CREATE INDEX "idx_client_tasks_loop_state_tenant" ON "public"."client_tasks" USING "btree" ("tenant_id", "loop_state") WHERE ("loop_state" = ANY (ARRAY['open'::"text", 'executing'::"text"]));



CREATE INDEX "idx_client_tasks_phase" ON "public"."client_tasks" USING "btree" ("customer_id", "phase_id");



CREATE INDEX "idx_client_tasks_tenant" ON "public"."client_tasks" USING "btree" ("tenant_id");



CREATE INDEX "idx_client_tasks_tenant_customer_position" ON "public"."client_tasks" USING "btree" ("tenant_id", "customer_id", "position");



CREATE INDEX "idx_client_tasks_tenant_status" ON "public"."client_tasks" USING "btree" ("tenant_id", "status") WHERE ("status" <> ALL (ARRAY['done'::"text", 'canceled'::"text"]));



CREATE INDEX "idx_client_timeline_loja" ON "public"."client_timeline" USING "btree" ("loja_id", "ts" DESC);



CREATE INDEX "idx_client_timeline_tenant" ON "public"."client_timeline" USING "btree" ("tenant_id", "ts" DESC);



CREATE INDEX "idx_client_timeline_type" ON "public"."client_timeline" USING "btree" ("event_type");



CREATE INDEX "idx_cobranca_eventos_cobranca_id" ON "public"."cobranca_eventos" USING "btree" ("cobranca_id");



CREATE INDEX "idx_cobranca_eventos_tenant_id" ON "public"."cobranca_eventos" USING "btree" ("tenant_id", "created_at" DESC);



CREATE INDEX "idx_cobrancas_asaas_charge_id" ON "public"."cobrancas" USING "btree" ("asaas_charge_id") WHERE ("asaas_charge_id" IS NOT NULL);



CREATE INDEX "idx_cobrancas_ignorar" ON "public"."cobrancas" USING "btree" ("tenant_id", "ignorar_cobranca") WHERE ("ignorar_cobranca" = false);



CREATE INDEX "idx_cobrancas_loja_id" ON "public"."cobrancas" USING "btree" ("loja_id") WHERE ("loja_id" IS NOT NULL);



CREATE INDEX "idx_cobrancas_status" ON "public"."cobrancas" USING "btree" ("tenant_id", "status");



CREATE INDEX "idx_cobrancas_tenant_id" ON "public"."cobrancas" USING "btree" ("tenant_id");



CREATE INDEX "idx_cobrancas_vencimento" ON "public"."cobrancas" USING "btree" ("tenant_id", "vencimento");



CREATE INDEX "idx_comentarios_autor" ON "public"."tarefa_comentarios" USING "btree" ("autor_id");



CREATE INDEX "idx_comentarios_parent" ON "public"."tarefa_comentarios" USING "btree" ("parent_id") WHERE ("parent_id" IS NOT NULL);



CREATE INDEX "idx_comentarios_tarefa" ON "public"."tarefa_comentarios" USING "btree" ("tarefa_id", "created_at" DESC);



CREATE INDEX "idx_contatos_client_id" ON "public"."contatos" USING "btree" ("client_id");



CREATE UNIQUE INDEX "idx_contatos_loja_origem" ON "public"."contatos" USING "btree" ("loja_origem_id");



CREATE INDEX "idx_contatos_tenant" ON "public"."contatos" USING "btree" ("tenant_id");



CREATE INDEX "idx_conv_status_log_conv" ON "public"."conversation_status_log" USING "btree" ("conversation_id", "ts" DESC);



CREATE INDEX "idx_conv_status_log_tenant" ON "public"."conversation_status_log" USING "btree" ("tenant_id", "ts" DESC);



CREATE INDEX "idx_conversation_events_conv_ts" ON "public"."conversation_events" USING "btree" ("conversation_id", "ts" DESC);



CREATE INDEX "idx_conversation_events_tenant_ts" ON "public"."conversation_events" USING "btree" ("tenant_id", "ts" DESC);



CREATE INDEX "idx_conversation_tags_tag" ON "public"."conversation_tags" USING "btree" ("tag_id");



CREATE INDEX "idx_conversations_assigned" ON "public"."conversations" USING "btree" ("assigned_to", "status");



CREATE INDEX "idx_conversations_breno_paused" ON "public"."conversations" USING "btree" ("tenant_id") WHERE ("breno_paused" = true);



CREATE INDEX "idx_conversations_department" ON "public"."conversations" USING "btree" ("tenant_id", "department_id");



CREATE INDEX "idx_conversations_loop_status_tenant" ON "public"."conversations" USING "btree" ("tenant_id", "loop_status") WHERE ("loop_status" IS NOT NULL);



CREATE INDEX "idx_conversations_status" ON "public"."conversations" USING "btree" ("status", "tenant_id");



CREATE INDEX "idx_conversations_status_v2_tenant" ON "public"."conversations" USING "btree" ("tenant_id", "status_v2", "last_message_at" DESC);



CREATE INDEX "idx_cora_acoes_agent_run_id" ON "public"."cora_acoes" USING "btree" ("agent_run_id");



CREATE INDEX "idx_cora_acoes_cobranca_v2_id" ON "public"."cora_acoes" USING "btree" ("cobranca_v2_id") WHERE ("cobranca_v2_id" IS NOT NULL);



CREATE INDEX "idx_cora_cobrancas_regua_id" ON "public"."cora_cobrancas" USING "btree" ("regua_id");



CREATE INDEX "idx_customer_addresses_customer" ON "public"."customer_addresses" USING "btree" ("customer_id");



CREATE INDEX "idx_customer_notes_customer" ON "public"."customer_notes" USING "btree" ("customer_id");



CREATE INDEX "idx_customer_tags_tag" ON "public"."customer_tags" USING "btree" ("tag_id");



CREATE INDEX "idx_customers_segment" ON "public"."customers" USING "btree" ("tenant_id", "segment");



CREATE INDEX "idx_customers_tenant_phone_norm" ON "public"."customers" USING "btree" ("tenant_id", "phone_normalized");



CREATE INDEX "idx_deli_agenda_tenant_tipo" ON "public"."deli_agenda" USING "btree" ("tenant_id", "tipo", "created_at" DESC);



CREATE INDEX "idx_deli_approvals_pending" ON "public"."deli_pending_approvals" USING "btree" ("tenant_id", "created_at" DESC) WHERE ("status" = 'aguardando'::"text");



CREATE INDEX "idx_deli_approvals_tenant_status" ON "public"."deli_pending_approvals" USING "btree" ("tenant_id", "status", "created_at" DESC);



CREATE INDEX "idx_deli_log_tenant" ON "public"."deli_actions_log" USING "btree" ("tenant_id", "ts" DESC);



CREATE INDEX "idx_deli_triggers_tenant" ON "public"."deli_triggers" USING "btree" ("tenant_id", "enabled");



CREATE INDEX "idx_department_members_user" ON "public"."department_members" USING "btree" ("user_id");



CREATE INDEX "idx_departments_tenant" ON "public"."departments" USING "btree" ("tenant_id", "is_active");



CREATE INDEX "idx_drafts_loja" ON "public"."agent_drafts" USING "btree" ("loja_id");



CREATE INDEX "idx_drafts_pending" ON "public"."agent_drafts" USING "btree" ("tenant_id", "created_at" DESC) WHERE ("status" = 'pending'::"text");



CREATE INDEX "idx_drafts_tenant_status" ON "public"."agent_drafts" USING "btree" ("tenant_id", "status", "created_at" DESC);



CREATE INDEX "idx_espacos_columns_list_position" ON "public"."espacos_columns" USING "btree" ("list_id", "position");



CREATE INDEX "idx_espacos_folders_customer" ON "public"."espacos_folders" USING "btree" ("customer_id");



CREATE INDEX "idx_espacos_folders_tenant_position" ON "public"."espacos_folders" USING "btree" ("tenant_id", "position");



CREATE INDEX "idx_espacos_folders_workspace" ON "public"."espacos_folders" USING "btree" ("workspace_id");



CREATE INDEX "idx_espacos_lists_folder_position" ON "public"."espacos_lists" USING "btree" ("folder_id", "position");



CREATE INDEX "idx_espacos_workspaces_tenant_position" ON "public"."espacos_workspaces" USING "btree" ("tenant_id", "position");



CREATE INDEX "idx_evolution_instances_tenant_id" ON "public"."evolution_instances" USING "btree" ("tenant_id");



CREATE INDEX "idx_goal_tasks_goal" ON "public"."goal_tasks" USING "btree" ("goal_id");



CREATE INDEX "idx_goal_tasks_tenant" ON "public"."goal_tasks" USING "btree" ("tenant_id");



CREATE INDEX "idx_goals_project" ON "public"."goals" USING "btree" ("project_id");



CREATE INDEX "idx_goals_tenant" ON "public"."goals" USING "btree" ("tenant_id");



CREATE INDEX "idx_heartbeat_runs_heartbeat" ON "public"."heartbeat_runs" USING "btree" ("heartbeat_id", "started_at" DESC);



CREATE INDEX "idx_heartbeat_runs_tenant" ON "public"."heartbeat_runs" USING "btree" ("tenant_id", "started_at" DESC);



CREATE INDEX "idx_heartbeats_next_run" ON "public"."heartbeats" USING "btree" ("next_run_at", "enabled") WHERE ("enabled" = true);



CREATE INDEX "idx_heartbeats_tenant" ON "public"."heartbeats" USING "btree" ("tenant_id", "enabled");



CREATE INDEX "idx_internal_notifications_recipient_unread" ON "public"."internal_notifications" USING "btree" ("tenant_id", "recipient_user_id", "created_at" DESC) WHERE ("read_at" IS NULL);



CREATE INDEX "idx_internal_notifications_recipient_user_id" ON "public"."internal_notifications" USING "btree" ("recipient_user_id");



CREATE INDEX "idx_internal_notifications_tenant_created" ON "public"."internal_notifications" USING "btree" ("tenant_id", "created_at" DESC);



CREATE INDEX "idx_knowledge_base_active" ON "public"."agent_knowledge_base" USING "btree" ("tenant_id", "agent_slug", "is_active") WHERE ("is_active" = true);



CREATE INDEX "idx_knowledge_base_agent" ON "public"."agent_knowledge_base" USING "btree" ("agent_slug");



CREATE INDEX "idx_knowledge_base_tenant" ON "public"."agent_knowledge_base" USING "btree" ("tenant_id");



CREATE INDEX "idx_lead_list_members_customer" ON "public"."lead_list_members" USING "btree" ("customer_id");



CREATE INDEX "idx_lead_lists_tenant" ON "public"."lead_lists" USING "btree" ("tenant_id");



CREATE INDEX "idx_lead_tags_tenant" ON "public"."lead_tags" USING "btree" ("tenant_id");



CREATE INDEX "idx_leads_score" ON "public"."leads" USING "btree" ("tenant_id", "score" DESC, "created_at" DESC);



CREATE INDEX "idx_leads_status" ON "public"."leads" USING "btree" ("tenant_id", "status", "created_at" DESC);



CREATE INDEX "idx_lgc_loja" ON "public"."loja_gpt_conversations" USING "btree" ("loja_id", "ultima_message_em" DESC);



CREATE INDEX "idx_lgc_tenant" ON "public"."loja_gpt_conversations" USING "btree" ("arquivada") WHERE (NOT "arquivada");



CREATE INDEX "idx_lgc_user" ON "public"."loja_gpt_conversations" USING "btree" ("iniciada_por");



CREATE INDEX "idx_lgm_conv" ON "public"."loja_gpt_messages" USING "btree" ("conversation_id", "created_at");



CREATE INDEX "idx_lgm_role" ON "public"."loja_gpt_messages" USING "btree" ("conversation_id", "role");



CREATE UNIQUE INDEX "idx_loja_consultor_principal_unico" ON "public"."loja_consultores" USING "btree" ("loja_id") WHERE (("papel" = 'principal'::"text") AND ("ativo" = true));



CREATE INDEX "idx_loja_consultores_loja" ON "public"."loja_consultores" USING "btree" ("loja_id");



CREATE INDEX "idx_loja_consultores_user" ON "public"."loja_consultores" USING "btree" ("user_id");



CREATE INDEX "idx_loja_metricas_loja" ON "public"."loja_metricas" USING "btree" ("loja_id", "data" DESC);



CREATE INDEX "idx_loja_metricas_tenant" ON "public"."loja_metricas" USING "btree" ("tenant_id", "data" DESC);



CREATE INDEX "idx_lojas_search" ON "public"."lojas" USING "gin" ("to_tsvector"('"portuguese"'::"regconfig", (((("nome" || ' '::"text") || COALESCE("cidade", ''::"text")) || ' '::"text") || COALESCE("segmento", ''::"text"))));



CREATE INDEX "idx_lojas_segmento" ON "public"."lojas" USING "btree" ("segmento");



CREATE INDEX "idx_lojas_status" ON "public"."lojas" USING "btree" ("status");



CREATE INDEX "idx_lojas_super_restaurante" ON "public"."lojas" USING "btree" ("super_restaurante") WHERE ("super_restaurante" = true);



CREATE INDEX "idx_lojas_tenant" ON "public"."lojas" USING "btree" ("tenant_id");



CREATE UNIQUE INDEX "idx_lojas_tenant_slug_unique" ON "public"."lojas" USING "btree" ("tenant_id", "slug") WHERE ("slug" IS NOT NULL);



CREATE INDEX "idx_lwv_monitorar" ON "public"."loja_whatsapp_vinculo" USING "btree" ("tenant_id") WHERE ("monitorar" = true);



CREATE INDEX "idx_lwv_tenant_loja" ON "public"."loja_whatsapp_vinculo" USING "btree" ("tenant_id", "loja_id");



CREATE INDEX "idx_marca_pesquisa_loja" ON "public"."marca_pesquisa" USING "btree" ("loja_id", "ts" DESC);



CREATE INDEX "idx_marca_pesquisa_tenant" ON "public"."marca_pesquisa" USING "btree" ("tenant_id");



CREATE INDEX "idx_metricas_snapshot_loja_data" ON "public"."loja_metricas_snapshot" USING "btree" ("loja_id", "data" DESC);



CREATE INDEX "idx_mia_audit_tenant_data" ON "public"."mia_audit_log" USING "btree" ("tenant_id", "created_at" DESC);



CREATE INDEX "idx_mia_conversation" ON "public"."mia_analises" USING "btree" ("conversation_id") WHERE ("conversation_id" IS NOT NULL);



CREATE INDEX "idx_mia_status" ON "public"."mia_analises" USING "btree" ("tenant_id", "status");



CREATE INDEX "idx_mia_tenant_time" ON "public"."mia_analises" USING "btree" ("tenant_id", "created_at" DESC);



CREATE INDEX "idx_missions_tenant" ON "public"."missions" USING "btree" ("tenant_id");



CREATE INDEX "idx_nexus_requests_loja_status" ON "public"."nexus_requests" USING "btree" ("loja_id", "status");



CREATE INDEX "idx_nexus_requests_request_id" ON "public"."nexus_requests" USING "btree" ("request_id");



CREATE INDEX "idx_nexus_requests_tenant" ON "public"."nexus_requests" USING "btree" ("tenant_id");



CREATE INDEX "idx_note_entries_conversation" ON "public"."customer_note_entries" USING "btree" ("conversation_id") WHERE ("conversation_id" IS NOT NULL);



CREATE INDEX "idx_note_entries_customer" ON "public"."customer_note_entries" USING "btree" ("customer_id") WHERE ("customer_id" IS NOT NULL);



CREATE INDEX "idx_note_entries_tenant_created" ON "public"."customer_note_entries" USING "btree" ("tenant_id", "created_at" DESC);



CREATE INDEX "idx_nps_aval_cooldown" ON "public"."nps_avaliacoes" USING "btree" ("tenant_id", "contact_identifier", "created_at" DESC);



CREATE INDEX "idx_nps_aval_msg_pendente" ON "public"."nps_avaliacoes" USING "btree" ("tenant_id", "created_at" DESC) WHERE (("msg_enviada_at" IS NULL) AND ("status" = 'pendente'::"text"));



CREATE UNIQUE INDEX "idx_nps_aval_public_token" ON "public"."nps_avaliacoes" USING "btree" ("public_token");



CREATE INDEX "idx_nps_aval_tenant_created_at" ON "public"."nps_avaliacoes" USING "btree" ("tenant_id", "created_at");



CREATE INDEX "idx_nps_aval_tenant_status" ON "public"."nps_avaliacoes" USING "btree" ("tenant_id", "status");



CREATE INDEX "idx_nps_aval_tratativa" ON "public"."nps_avaliacoes" USING "btree" ("tenant_id", "tratativa_status");



CREATE INDEX "idx_nps_avaliacoes_loja_id" ON "public"."nps_avaliacoes" USING "btree" ("loja_id") WHERE ("loja_id" IS NOT NULL);



CREATE INDEX "idx_onboarding_checklists_agendado_status" ON "public"."onboarding_checklists" USING "btree" ("agendado_para", "status") WHERE ("status" = 'pendente'::"text");



CREATE INDEX "idx_onboarding_checklists_tenant_customer" ON "public"."onboarding_checklists" USING "btree" ("tenant_id", "customer_id");



CREATE INDEX "idx_oracle_drafts_status" ON "public"."oracle_drafts" USING "btree" ("tenant_id", "status");



CREATE INDEX "idx_oracle_drafts_tenant" ON "public"."oracle_drafts" USING "btree" ("tenant_id");



CREATE INDEX "idx_prints_tarefa" ON "public"."tarefa_prints" USING "btree" ("tarefa_id", "created_at" DESC);



CREATE INDEX "idx_prints_tipo" ON "public"."tarefa_prints" USING "btree" ("tarefa_id", "tipo");



CREATE INDEX "idx_projects_mission" ON "public"."projects" USING "btree" ("mission_id");



CREATE INDEX "idx_projects_tenant" ON "public"."projects" USING "btree" ("tenant_id");



CREATE INDEX "idx_prospect_abordagens_prospect" ON "public"."prospect_abordagens" USING "btree" ("prospect_id", "created_at" DESC);



CREATE INDEX "idx_prospect_abordagens_status" ON "public"."prospect_abordagens" USING "btree" ("status") WHERE ("status" = ANY (ARRAY['rascunho'::"text", 'aprovada'::"text"]));



CREATE INDEX "idx_prospect_pesquisas_prospect" ON "public"."prospect_pesquisas" USING "btree" ("prospect_id", "created_at" DESC);



CREATE INDEX "idx_prospects_tenant_score" ON "public"."prospects" USING "btree" ("tenant_id", "score" DESC) WHERE ("score" IS NOT NULL);



CREATE INDEX "idx_prospects_tenant_status" ON "public"."prospects" USING "btree" ("tenant_id", "status");



CREATE INDEX "idx_push_subs_tenant" ON "public"."push_subscriptions" USING "btree" ("tenant_id");



CREATE INDEX "idx_push_subs_user" ON "public"."push_subscriptions" USING "btree" ("user_id");



CREATE INDEX "idx_quick_replies_tenant_id" ON "public"."quick_replies" USING "btree" ("tenant_id");



CREATE INDEX "idx_reguas_loja_status" ON "public"."reguas" USING "btree" ("loja_id", "status");



CREATE INDEX "idx_reguas_tenant" ON "public"."reguas" USING "btree" ("tenant_id");



CREATE INDEX "idx_sugestoes_criada_em" ON "public"."sugestoes_ia" USING "btree" ("tenant_id", "criada_em" DESC);



CREATE INDEX "idx_sugestoes_inbox" ON "public"."sugestoes_ia" USING "btree" ("tenant_id", "loja_id", "status") WHERE ("status" = 'pendente'::"text");



CREATE INDEX "idx_support_tickets_status" ON "public"."support_tickets" USING "btree" ("status");



CREATE INDEX "idx_support_tickets_tenant" ON "public"."support_tickets" USING "btree" ("tenant_id", "created_at" DESC);



CREATE INDEX "idx_tarefa_anexos_tarefa" ON "public"."tarefa_anexos" USING "btree" ("tarefa_id");



CREATE INDEX "idx_tarefa_anexos_tenant" ON "public"."tarefa_anexos" USING "btree" ("tenant_id");



CREATE INDEX "idx_tarefas_abertas" ON "public"."tarefas_loja" USING "btree" ("loja_id", "status") WHERE ("status" <> ALL (ARRAY['concluida'::"text", 'cancelada'::"text"]));



CREATE INDEX "idx_tarefas_analise" ON "public"."tarefas_loja" USING "btree" ("analise_id") WHERE ("analise_id" IS NOT NULL);



CREATE INDEX "idx_tarefas_analise_analise_id" ON "public"."tarefas_analise" USING "btree" ("analise_id");



CREATE INDEX "idx_tarefas_analise_cliente_id" ON "public"."tarefas_analise" USING "btree" ("cliente_id");



CREATE INDEX "idx_tarefas_analise_status" ON "public"."tarefas_analise" USING "btree" ("status");



CREATE INDEX "idx_tarefas_bloco" ON "public"."tarefas_loja" USING "btree" ("loja_id", "bloco", "ordem_no_bloco");



CREATE INDEX "idx_tarefas_loja" ON "public"."tarefas_loja" USING "btree" ("loja_id");



CREATE INDEX "idx_tarefas_responsavel" ON "public"."tarefas_loja" USING "btree" ("responsavel_id");



CREATE INDEX "idx_tarefas_status" ON "public"."tarefas_loja" USING "btree" ("status");



CREATE INDEX "idx_templates_ativo" ON "public"."templates_tarefa" USING "btree" ("tenant_id", "ativo") WHERE ("ativo" = true);



CREATE INDEX "idx_templates_tenant_bloco" ON "public"."templates_tarefa" USING "btree" ("tenant_id", "bloco", "ordem");



CREATE INDEX "idx_tenant_modules_tenant" ON "public"."tenant_modules" USING "btree" ("tenant_id");



CREATE INDEX "idx_tenants_parent" ON "public"."tenants" USING "btree" ("parent_tenant_id");



CREATE INDEX "idx_vendaerp_proposals_pending" ON "public"."vendaerp_proposals" USING "btree" ("tenant_id", "status") WHERE ("status" = 'pending'::"text");



CREATE INDEX "idx_vera_anomalias_tenant_detectada" ON "public"."vera_anomalias" USING "btree" ("tenant_id", "detectada_em" DESC);



CREATE INDEX "idx_vera_anomalias_tenant_severidade" ON "public"."vera_anomalias" USING "btree" ("tenant_id", "resolvida", "severidade");



CREATE INDEX "idx_vera_metricas_snapshot_tenant_data" ON "public"."vera_metricas_snapshot" USING "btree" ("tenant_id", "data" DESC);



CREATE INDEX "idx_vera_reports_tenant_created" ON "public"."vera_reports" USING "btree" ("tenant_id", "created_at" DESC);



CREATE INDEX "idx_vera_reports_tenant_tipo_created" ON "public"."vera_reports" USING "btree" ("tenant_id", "tipo", "created_at" DESC);



CREATE INDEX "idx_wa_contacts_loja" ON "public"."whatsapp_contacts" USING "btree" ("loja_id");



CREATE INDEX "idx_wa_contacts_tenant" ON "public"."whatsapp_contacts" USING "btree" ("tenant_id");



CREATE INDEX "idx_wa_groups_loja" ON "public"."whatsapp_groups" USING "btree" ("loja_id");



CREATE INDEX "idx_wa_groups_tenant" ON "public"."whatsapp_groups" USING "btree" ("tenant_id");



CREATE INDEX "idx_wa_messages_contact" ON "public"."whatsapp_messages" USING "btree" ("contact_id", "ts" DESC);



CREATE INDEX "idx_wa_messages_group" ON "public"."whatsapp_messages" USING "btree" ("group_id", "ts" DESC);



CREATE INDEX "idx_wa_messages_mention" ON "public"."whatsapp_messages" USING "btree" ("tenant_id", "ts" DESC) WHERE ("is_mention_to_bot" = true);



CREATE INDEX "idx_wa_messages_tenant" ON "public"."whatsapp_messages" USING "btree" ("tenant_id", "ts" DESC);



CREATE INDEX "idx_was_loja" ON "public"."whatsapp_aprovacao_sessions" USING "btree" ("loja_id");



CREATE INDEX "idx_was_numero_ativa" ON "public"."whatsapp_aprovacao_sessions" USING "btree" ("numero_destino") WHERE ("status" = 'ativa'::"text");



CREATE INDEX "idx_whatsapp_groups_bom_dia" ON "public"."whatsapp_groups" USING "btree" ("tenant_id", "bom_dia_ativo") WHERE ("bom_dia_ativo" = true);



CREATE INDEX "idx_whatsapp_groups_encerramento" ON "public"."whatsapp_groups" USING "btree" ("tenant_id", "encerramento_ativo") WHERE ("encerramento_ativo" = true);



CREATE INDEX "idx_wizard_sessions_email" ON "public"."onboarding_wizard_sessions" USING "btree" ("email");



CREATE INDEX "idx_wizard_sessions_status" ON "public"."onboarding_wizard_sessions" USING "btree" ("status", "created_at" DESC);



CREATE UNIQUE INDEX "ifood_merchants_tenant_merchant" ON "public"."ifood_merchants" USING "btree" ("tenant_id", "merchant_id");



CREATE INDEX "inadimplencia_messages_idx" ON "public"."inadimplencia_messages" USING "btree" ("inadimplencia_id", "sent_at");



CREATE INDEX "inadimplencia_messages_tenant_id_idx" ON "public"."inadimplencia_messages" USING "btree" ("tenant_id");



CREATE INDEX "inadimplencias_customer_idx" ON "public"."inadimplencias" USING "btree" ("customer_id");



CREATE INDEX "inadimplencias_order_id_idx" ON "public"."inadimplencias" USING "btree" ("order_id");



CREATE INDEX "inadimplencias_status_idx" ON "public"."inadimplencias" USING "btree" ("tenant_id", "status");



CREATE INDEX "inadimplencias_tenant_idx" ON "public"."inadimplencias" USING "btree" ("tenant_id");



CREATE INDEX "max_kb_system_idx" ON "public"."max_knowledge_base" USING "btree" ("system_name");



CREATE INDEX "max_kb_tags_idx" ON "public"."max_knowledge_base" USING "gin" ("tags");



CREATE INDEX "max_kb_tenant_idx" ON "public"."max_knowledge_base" USING "btree" ("tenant_id", "is_active");



CREATE INDEX "messages_conv_idx" ON "public"."messages" USING "btree" ("conversation_id", "sent_at");



CREATE INDEX "messages_sender_agent_id_idx" ON "public"."messages" USING "btree" ("sender_agent_id");



CREATE INDEX "messages_sender_user_id_idx" ON "public"."messages" USING "btree" ("sender_user_id");



CREATE INDEX "messages_tenant_idx" ON "public"."messages" USING "btree" ("tenant_id", "sent_at" DESC);



CREATE INDEX "nova_blueprints_tenant_idx" ON "public"."nova_blueprints" USING "btree" ("tenant_id", "created_at" DESC);



CREATE UNIQUE INDEX "nps_avaliacoes_external_ref_uniq" ON "public"."nps_avaliacoes" USING "btree" ("tenant_id", "external_ref") WHERE ("external_ref" IS NOT NULL);



CREATE INDEX "nps_idx_assigned_to" ON "public"."nps_avaliacoes" USING "btree" ("assigned_to");



CREATE INDEX "nps_idx_tenant_status" ON "public"."nps_avaliacoes" USING "btree" ("tenant_id", "status");



CREATE INDEX "nps_idx_tratativa_status" ON "public"."nps_avaliacoes" USING "btree" ("tenant_id", "tratativa_status");



CREATE UNIQUE INDEX "nps_uq_origin_conversation" ON "public"."nps_avaliacoes" USING "btree" ("origin_conversation_id") WHERE ("origin_conversation_id" IS NOT NULL);



CREATE INDEX "orders_customer_idx" ON "public"."orders" USING "btree" ("customer_id", "placed_at" DESC);



CREATE INDEX "orders_status_idx" ON "public"."orders" USING "btree" ("tenant_id", "status");



CREATE INDEX "orders_tenant_placed_idx" ON "public"."orders" USING "btree" ("tenant_id", "placed_at" DESC);



CREATE INDEX "radar_fontes_tenant_idx" ON "public"."radar_fontes" USING "btree" ("tenant_id", "status");



CREATE INDEX "radar_metricas_dedup_idx" ON "public"."radar_metricas" USING "btree" ("tenant_id", "loja_id", "metrica", "data_ref" DESC, "created_at" DESC);



CREATE INDEX "radar_metricas_tenant_metrica_idx" ON "public"."radar_metricas" USING "btree" ("tenant_id", "metrica", "periodo_fim" DESC);



CREATE INDEX "radar_series_fonte_idx" ON "public"."radar_series" USING "btree" ("fonte_id");



CREATE INDEX "radar_series_lookup_idx" ON "public"."radar_series" USING "btree" ("tenant_id", "loja_id", "metrica", "dia");



CREATE INDEX "regua_cobranca_tenant_id_idx" ON "public"."regua_cobranca" USING "btree" ("tenant_id");



CREATE INDEX "reviews_token_idx" ON "public"."reviews" USING "btree" ("token");



CREATE INDEX "task_comments_author_id_idx" ON "public"."task_comments" USING "btree" ("author_id");



CREATE INDEX "task_comments_task_idx" ON "public"."task_comments" USING "btree" ("task_id", "created_at");



CREATE INDEX "task_comments_tenant_id_idx" ON "public"."task_comments" USING "btree" ("tenant_id");



CREATE INDEX "tasks_agent_id_idx" ON "public"."tasks" USING "btree" ("agent_id");



CREATE INDEX "tasks_assignee_idx" ON "public"."tasks" USING "btree" ("assignee_id");



CREATE INDEX "tasks_created_by_idx" ON "public"."tasks" USING "btree" ("created_by");



CREATE INDEX "tasks_tenant_col_idx" ON "public"."tasks" USING "btree" ("tenant_id", "col", "position");



CREATE INDEX "tasks_tenant_due_idx" ON "public"."tasks" USING "btree" ("tenant_id", "due_at");



CREATE INDEX "templates_tenant_idx" ON "public"."templates" USING "btree" ("tenant_id", "tipo");



CREATE INDEX "tenant_agents_agent_id_idx" ON "public"."tenant_agents" USING "btree" ("agent_id");



CREATE INDEX "tenant_files_tenant_idx" ON "public"."tenant_files" USING "btree" ("tenant_id", "folder", "updated_at" DESC);



CREATE INDEX "tenant_gatilhos_tenant_idx" ON "public"."tenant_gatilhos" USING "btree" ("tenant_id", "created_at" DESC);



CREATE INDEX "tenant_integracoes_tenant_idx" ON "public"."tenant_integracoes" USING "btree" ("tenant_id", "ordem");



CREATE INDEX "tenant_links_tenant_idx" ON "public"."tenant_links" USING "btree" ("tenant_id", "created_at" DESC);



CREATE INDEX "tenant_members_user_idx" ON "public"."tenant_members" USING "btree" ("user_id");



CREATE INDEX "tenant_provedores_tenant_idx" ON "public"."tenant_provedores" USING "btree" ("tenant_id", "ordem");



CREATE INDEX "tenant_sistemas_tenant_idx" ON "public"."tenant_sistemas" USING "btree" ("tenant_id", "ordem");



CREATE INDEX "tenant_tarefas_tenant_idx" ON "public"."tenant_tarefas" USING "btree" ("tenant_id", "quando", "status");



CREATE INDEX "tenant_topicos_tenant_idx" ON "public"."tenant_topicos" USING "btree" ("tenant_id", "status", "created_at" DESC);



CREATE INDEX "tenants_status_idx" ON "public"."tenants" USING "btree" ("status");



CREATE UNIQUE INDEX "uq_tarefa_ia_origem_ativa" ON "public"."tarefas_loja" USING "btree" ("loja_id", (("metadata" ->> 'origem'::"text"))) WHERE ("criado_por_ia" AND ("status" <> ALL (ARRAY['concluida'::"text", 'cancelada'::"text", 'rejeitada'::"text"])));



CREATE INDEX "vendaerp_instances_tenant_idx" ON "public"."vendaerp_instances" USING "btree" ("tenant_id");



CREATE OR REPLACE TRIGGER "auto_vinculo_grupo" AFTER INSERT OR UPDATE OF "loja_id" ON "public"."whatsapp_groups" FOR EACH ROW EXECUTE FUNCTION "public"."trg_auto_vinculo_grupo"();



CREATE OR REPLACE TRIGGER "cobrancas_set_updated_at" BEFORE UPDATE ON "public"."cobrancas" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "conversations_set_updated_at" BEFORE UPDATE ON "public"."conversations" FOR EACH ROW EXECUTE FUNCTION "public"."tg_set_updated_at"();



CREATE OR REPLACE TRIGGER "customers_set_updated_at" BEFORE UPDATE ON "public"."customers" FOR EACH ROW EXECUTE FUNCTION "public"."tg_set_updated_at"();



CREATE OR REPLACE TRIGGER "inadimplencias_set_updated_at" BEFORE UPDATE ON "public"."inadimplencias" FOR EACH ROW EXECUTE FUNCTION "public"."tg_set_updated_at"();



CREATE OR REPLACE TRIGGER "leads_updated_at" BEFORE UPDATE ON "public"."leads" FOR EACH ROW EXECUTE FUNCTION "public"."set_leads_updated_at"();



CREATE OR REPLACE TRIGGER "lojas_updated_at" BEFORE UPDATE ON "public"."lojas" FOR EACH ROW EXECUTE FUNCTION "public"."update_lojas_updated_at"();



CREATE OR REPLACE TRIGGER "orders_set_updated_at" BEFORE UPDATE ON "public"."orders" FOR EACH ROW EXECUTE FUNCTION "public"."tg_set_updated_at"();



CREATE OR REPLACE TRIGGER "profiles_set_updated_at" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."tg_set_updated_at"();



CREATE OR REPLACE TRIGGER "prospects_updated_at" BEFORE UPDATE ON "public"."prospects" FOR EACH ROW EXECUTE FUNCTION "public"."update_prospects_updated_at"();



CREATE OR REPLACE TRIGGER "regua_cobranca_set_updated_at" BEFORE UPDATE ON "public"."regua_cobranca" FOR EACH ROW EXECUTE FUNCTION "public"."tg_set_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at_espacos_workspaces" BEFORE UPDATE ON "public"."espacos_workspaces" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "tarefa_comentarios_updated_at" BEFORE UPDATE ON "public"."tarefa_comentarios" FOR EACH ROW EXECUTE FUNCTION "public"."update_lojas_updated_at"();



CREATE OR REPLACE TRIGGER "tarefas_loja_updated_at" BEFORE UPDATE ON "public"."tarefas_loja" FOR EACH ROW EXECUTE FUNCTION "public"."update_lojas_updated_at"();



CREATE OR REPLACE TRIGGER "tasks_set_updated_at" BEFORE UPDATE ON "public"."tasks" FOR EACH ROW EXECUTE FUNCTION "public"."tg_set_updated_at"();



CREATE OR REPLACE TRIGGER "templates_tarefa_updated_at" BEFORE UPDATE ON "public"."templates_tarefa" FOR EACH ROW EXECUTE FUNCTION "public"."update_lojas_updated_at"();



CREATE OR REPLACE TRIGGER "tenant_agents_set_updated_at" BEFORE UPDATE ON "public"."tenant_agents" FOR EACH ROW EXECUTE FUNCTION "public"."tg_set_updated_at"();



CREATE OR REPLACE TRIGGER "tenants_set_updated_at" BEFORE UPDATE ON "public"."tenants" FOR EACH ROW EXECUTE FUNCTION "public"."tg_set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_atend_aval_updated_at" BEFORE UPDATE ON "public"."atendimento_avaliacoes" FOR EACH ROW EXECUTE FUNCTION "public"."trg_fn_atend_aval_updated_at"();



CREATE OR REPLACE TRIGGER "trg_avaliacao_config_updated_at" BEFORE UPDATE ON "public"."avaliacao_config" FOR EACH ROW EXECUTE FUNCTION "public"."fn_avaliacao_config_updated_at"();



CREATE OR REPLACE TRIGGER "trg_campanhas_updated" BEFORE UPDATE ON "public"."campanhas" FOR EACH ROW EXECUTE FUNCTION "public"."trg_set_updated_at_campanhas"();



CREATE OR REPLACE TRIGGER "trg_channel_messages_notify" AFTER INSERT ON "public"."channel_messages" FOR EACH ROW EXECUTE FUNCTION "public"."notify_on_channel_message"();



CREATE OR REPLACE TRIGGER "trg_client_tasks_updated_at" BEFORE UPDATE ON "public"."client_tasks" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_conv_department_changed" AFTER UPDATE OF "department_id" ON "public"."conversations" FOR EACH ROW WHEN (("new"."department_id" IS DISTINCT FROM "old"."department_id")) EXECUTE FUNCTION "public"."trg_fn_conv_department_changed"();



CREATE OR REPLACE TRIGGER "trg_conv_gen_avaliacao_token" AFTER UPDATE OF "status_v2" ON "public"."conversations" FOR EACH ROW WHEN ((("new"."status_v2" = 'closed'::"public"."conversation_status_v2") AND ("old"."status_v2" IS DISTINCT FROM 'closed'::"public"."conversation_status_v2"))) EXECUTE FUNCTION "public"."trg_fn_conv_gen_avaliacao_token"();



CREATE OR REPLACE TRIGGER "trg_conv_gen_nps_token" AFTER UPDATE OF "status_v2" ON "public"."conversations" FOR EACH ROW WHEN ((("new"."status_v2" = 'closed'::"public"."conversation_status_v2") AND ("old"."status_v2" IS DISTINCT FROM 'closed'::"public"."conversation_status_v2"))) EXECUTE FUNCTION "public"."trg_fn_conv_gen_nps_token"();



CREATE OR REPLACE TRIGGER "trg_conv_status_changed" AFTER UPDATE OF "status_v2" ON "public"."conversations" FOR EACH ROW WHEN (("new"."status_v2" IS DISTINCT FROM "old"."status_v2")) EXECUTE FUNCTION "public"."trg_fn_conv_status_changed"();



CREATE OR REPLACE TRIGGER "trg_conversation_status_change" BEFORE UPDATE ON "public"."conversations" FOR EACH ROW EXECUTE FUNCTION "public"."fn_log_conversation_status_change"();



CREATE OR REPLACE TRIGGER "trg_conversation_status_changed" BEFORE UPDATE OF "status" ON "public"."conversations" FOR EACH ROW EXECUTE FUNCTION "public"."fn_conversation_status_changed"();



CREATE OR REPLACE TRIGGER "trg_customer_addresses_updated_at" BEFORE UPDATE ON "public"."customer_addresses" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_customer_notes_updated_at" BEFORE UPDATE ON "public"."customer_notes" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_customers_create_loja" AFTER INSERT ON "public"."customers" FOR EACH ROW EXECUTE FUNCTION "public"."trg_auto_create_loja"();



CREATE OR REPLACE TRIGGER "trg_espacos_columns_updated_at" BEFORE UPDATE ON "public"."espacos_columns" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_espacos_folders_updated_at" BEFORE UPDATE ON "public"."espacos_folders" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_espacos_lists_updated_at" BEFORE UPDATE ON "public"."espacos_lists" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_internal_notifications_updated_at" BEFORE UPDATE ON "public"."internal_notifications" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_lgc_updated_at" BEFORE UPDATE ON "public"."loja_gpt_conversations" FOR EACH ROW EXECUTE FUNCTION "public"."update_lojas_updated_at"();



CREATE OR REPLACE TRIGGER "trg_lwv_touch" BEFORE UPDATE ON "public"."loja_whatsapp_vinculo" FOR EACH ROW EXECUTE FUNCTION "public"."touch_lwv_updated_at"();



CREATE OR REPLACE TRIGGER "trg_nps_aval_updated_at" BEFORE UPDATE ON "public"."nps_avaliacoes" FOR EACH ROW EXECUTE FUNCTION "public"."trg_fn_nps_aval_updated_at"();



CREATE OR REPLACE TRIGGER "trg_reguas_audit" AFTER INSERT OR UPDATE OF "status" ON "public"."reguas" FOR EACH ROW EXECUTE FUNCTION "public"."trg_audit_regua"();



CREATE OR REPLACE TRIGGER "trg_reguas_updated" BEFORE UPDATE ON "public"."reguas" FOR EACH ROW EXECUTE FUNCTION "public"."trg_set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_task_done_updates_goal" AFTER UPDATE OF "status" ON "public"."goal_tasks" FOR EACH ROW EXECUTE FUNCTION "public"."fn_task_done_updates_goal"();



CREATE OR REPLACE TRIGGER "trg_validate_tenant_hierarchy" BEFORE INSERT OR UPDATE OF "tenant_type", "parent_tenant_id" ON "public"."tenants" FOR EACH ROW EXECUTE FUNCTION "public"."validate_tenant_hierarchy"();



ALTER TABLE ONLY "public"."aceite_recontratacao"
    ADD CONSTRAINT "aceite_recontratacao_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id");



ALTER TABLE ONLY "public"."aceite_recontratacao"
    ADD CONSTRAINT "aceite_recontratacao_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");



ALTER TABLE ONLY "public"."agent_action_approvals"
    ADD CONSTRAINT "agent_action_approvals_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."agent_action_approvals"
    ADD CONSTRAINT "agent_action_approvals_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."agent_actions"
    ADD CONSTRAINT "agent_actions_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id");



ALTER TABLE ONLY "public"."agent_actions"
    ADD CONSTRAINT "agent_actions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."agent_chat_messages"
    ADD CONSTRAINT "agent_chat_messages_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id");



ALTER TABLE ONLY "public"."agent_chat_messages"
    ADD CONSTRAINT "agent_chat_messages_loja_id_fkey" FOREIGN KEY ("loja_id") REFERENCES "public"."lojas"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."agent_chat_messages"
    ADD CONSTRAINT "agent_chat_messages_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."agent_chat_messages"
    ADD CONSTRAINT "agent_chat_messages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."agent_corrections"
    ADD CONSTRAINT "agent_corrections_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."agent_corrections"
    ADD CONSTRAINT "agent_corrections_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."agent_drafts"
    ADD CONSTRAINT "agent_drafts_approved_by_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."agent_drafts"
    ADD CONSTRAINT "agent_drafts_loja_id_fkey" FOREIGN KEY ("loja_id") REFERENCES "public"."lojas"("id");



ALTER TABLE ONLY "public"."agent_drafts"
    ADD CONSTRAINT "agent_drafts_nps_avaliacao_id_fkey" FOREIGN KEY ("nps_avaliacao_id") REFERENCES "public"."nps_avaliacoes"("id");



ALTER TABLE ONLY "public"."agent_drafts"
    ADD CONSTRAINT "agent_drafts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."agent_knowledge_base"
    ADD CONSTRAINT "agent_knowledge_base_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."agent_knowledge_base"
    ADD CONSTRAINT "agent_knowledge_base_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."agent_memories"
    ADD CONSTRAINT "agent_memories_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."agent_memories"
    ADD CONSTRAINT "agent_memories_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."agent_memories"
    ADD CONSTRAINT "agent_memories_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."agent_prompts"
    ADD CONSTRAINT "agent_prompts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."agent_runs"
    ADD CONSTRAINT "agent_runs_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."agent_runs"
    ADD CONSTRAINT "agent_runs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."agent_runs"
    ADD CONSTRAINT "agent_runs_triggered_by_fkey" FOREIGN KEY ("triggered_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."agent_skills"
    ADD CONSTRAINT "agent_skills_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");



ALTER TABLE ONLY "public"."agent_ticket_activity"
    ADD CONSTRAINT "agent_ticket_activity_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."agent_ticket_activity"
    ADD CONSTRAINT "agent_ticket_activity_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "public"."agent_tickets"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."agent_ticket_comments"
    ADD CONSTRAINT "agent_ticket_comments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."agent_ticket_comments"
    ADD CONSTRAINT "agent_ticket_comments_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "public"."agent_tickets"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."agent_tickets"
    ADD CONSTRAINT "agent_tickets_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."agent_tickets"
    ADD CONSTRAINT "agent_tickets_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."agente_analises"
    ADD CONSTRAINT "agente_analises_loja_id_fkey" FOREIGN KEY ("loja_id") REFERENCES "public"."lojas"("id");



ALTER TABLE ONLY "public"."agente_analises"
    ADD CONSTRAINT "agente_analises_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");



ALTER TABLE ONLY "public"."agents"
    ADD CONSTRAINT "agents_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."analise_loja"
    ADD CONSTRAINT "analise_loja_loja_id_fkey" FOREIGN KEY ("loja_id") REFERENCES "public"."lojas"("id");



ALTER TABLE ONLY "public"."analise_loja"
    ADD CONSTRAINT "analise_loja_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");



ALTER TABLE ONLY "public"."analises"
    ADD CONSTRAINT "analises_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "public"."customers"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."analises"
    ADD CONSTRAINT "analises_criado_por_fkey" FOREIGN KEY ("criado_por") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."analises"
    ADD CONSTRAINT "analises_loja_id_fkey" FOREIGN KEY ("loja_id") REFERENCES "public"."lojas"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."analises"
    ADD CONSTRAINT "analises_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."asaas_eventos"
    ADD CONSTRAINT "asaas_eventos_contrato_id_fkey" FOREIGN KEY ("contrato_id") REFERENCES "public"."contratos"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."asaas_eventos"
    ADD CONSTRAINT "asaas_eventos_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");



ALTER TABLE ONLY "public"."atendimento_avaliacoes"
    ADD CONSTRAINT "atendimento_avaliacoes_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."atendimento_avaliacoes"
    ADD CONSTRAINT "atendimento_avaliacoes_loja_id_fkey" FOREIGN KEY ("loja_id") REFERENCES "public"."lojas"("id");



ALTER TABLE ONLY "public"."atendimento_avaliacoes"
    ADD CONSTRAINT "atendimento_avaliacoes_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."audit_log"
    ADD CONSTRAINT "audit_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."avaliacao_config"
    ADD CONSTRAINT "avaliacao_config_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."avaliacoes"
    ADD CONSTRAINT "avaliacoes_draft_id_fkey" FOREIGN KEY ("draft_id") REFERENCES "public"."agent_drafts"("id");



ALTER TABLE ONLY "public"."avaliacoes_loja_config"
    ADD CONSTRAINT "avaliacoes_loja_config_loja_id_fkey" FOREIGN KEY ("loja_id") REFERENCES "public"."lojas"("id");



ALTER TABLE ONLY "public"."avaliacoes_loja_config"
    ADD CONSTRAINT "avaliacoes_loja_config_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");



ALTER TABLE ONLY "public"."avaliacoes"
    ADD CONSTRAINT "avaliacoes_loja_id_fkey" FOREIGN KEY ("loja_id") REFERENCES "public"."lojas"("id");



ALTER TABLE ONLY "public"."avaliacoes"
    ADD CONSTRAINT "avaliacoes_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");



ALTER TABLE ONLY "public"."bom_dia_config"
    ADD CONSTRAINT "bom_dia_config_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."bom_dia_feedback"
    ADD CONSTRAINT "bom_dia_feedback_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "public"."agent_runs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."bom_dia_feedback"
    ADD CONSTRAINT "bom_dia_feedback_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."bot_reply_log"
    ADD CONSTRAINT "bot_reply_log_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."bot_reply_log"
    ADD CONSTRAINT "bot_reply_log_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."breno_interactions"
    ADD CONSTRAINT "breno_interactions_agent_run_fkey" FOREIGN KEY ("agent_run_id") REFERENCES "public"."agent_runs"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."breno_interactions"
    ADD CONSTRAINT "breno_interactions_conversation_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."breno_interactions"
    ADD CONSTRAINT "breno_interactions_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."breno_interactions"
    ADD CONSTRAINT "breno_interactions_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."breno_message_buffer"
    ADD CONSTRAINT "breno_message_buffer_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");



ALTER TABLE ONLY "public"."breno_triagem"
    ADD CONSTRAINT "breno_triagem_loja_id_fkey" FOREIGN KEY ("loja_id") REFERENCES "public"."lojas"("id");



ALTER TABLE ONLY "public"."breno_triagem"
    ADD CONSTRAINT "breno_triagem_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."campanha_ativos"
    ADD CONSTRAINT "campanha_ativos_campanha_id_fkey" FOREIGN KEY ("campanha_id") REFERENCES "public"."campanhas"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."campanha_ativos"
    ADD CONSTRAINT "campanha_ativos_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."campanhas"
    ADD CONSTRAINT "campanhas_regua_id_fkey" FOREIGN KEY ("regua_id") REFERENCES "public"."reguas"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."campanhas"
    ADD CONSTRAINT "campanhas_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."channel_members"
    ADD CONSTRAINT "channel_members_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "public"."internal_channels"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."channel_members"
    ADD CONSTRAINT "channel_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."channel_messages"
    ADD CONSTRAINT "channel_messages_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "public"."internal_channels"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."channel_messages"
    ADD CONSTRAINT "channel_messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."chat_tasks"
    ADD CONSTRAINT "chat_tasks_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."chat_tasks"
    ADD CONSTRAINT "chat_tasks_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."chat_tasks"
    ADD CONSTRAINT "chat_tasks_loja_id_fkey" FOREIGN KEY ("loja_id") REFERENCES "public"."lojas"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."chat_tasks"
    ADD CONSTRAINT "chat_tasks_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."client_facts"
    ADD CONSTRAINT "client_facts_loja_id_fkey" FOREIGN KEY ("loja_id") REFERENCES "public"."lojas"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."client_facts"
    ADD CONSTRAINT "client_facts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."client_tasks"
    ADD CONSTRAINT "client_tasks_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."client_tasks"
    ADD CONSTRAINT "client_tasks_column_id_fkey" FOREIGN KEY ("column_id") REFERENCES "public"."espacos_columns"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."client_tasks"
    ADD CONSTRAINT "client_tasks_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."client_tasks"
    ADD CONSTRAINT "client_tasks_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."client_tasks"
    ADD CONSTRAINT "client_tasks_list_id_fkey" FOREIGN KEY ("list_id") REFERENCES "public"."espacos_lists"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."client_tasks"
    ADD CONSTRAINT "client_tasks_proposal_id_fkey" FOREIGN KEY ("proposal_id") REFERENCES "public"."vendaerp_proposals"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."client_tasks"
    ADD CONSTRAINT "client_tasks_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."client_timeline"
    ADD CONSTRAINT "client_timeline_loja_id_fkey" FOREIGN KEY ("loja_id") REFERENCES "public"."lojas"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."client_timeline"
    ADD CONSTRAINT "client_timeline_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."client_timeline"
    ADD CONSTRAINT "client_timeline_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."cobranca_eventos"
    ADD CONSTRAINT "cobranca_eventos_cobranca_id_fkey" FOREIGN KEY ("cobranca_id") REFERENCES "public"."cobrancas"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cobranca_eventos"
    ADD CONSTRAINT "cobranca_eventos_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cobrancas"
    ADD CONSTRAINT "cobrancas_loja_id_fkey" FOREIGN KEY ("loja_id") REFERENCES "public"."lojas"("id");



ALTER TABLE ONLY "public"."cobrancas"
    ADD CONSTRAINT "cobrancas_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."contact_optout"
    ADD CONSTRAINT "contact_optout_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");



ALTER TABLE ONLY "public"."contact_tags"
    ADD CONSTRAINT "contact_tags_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."contatos"
    ADD CONSTRAINT "contatos_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."customers"("id");



ALTER TABLE ONLY "public"."contatos"
    ADD CONSTRAINT "contatos_loja_origem_id_fkey" FOREIGN KEY ("loja_origem_id") REFERENCES "public"."lojas"("id");



ALTER TABLE ONLY "public"."contatos"
    ADD CONSTRAINT "contatos_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");



ALTER TABLE ONLY "public"."content_calendar"
    ADD CONSTRAINT "content_calendar_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."content_drafts"
    ADD CONSTRAINT "content_drafts_calendar_id_fkey" FOREIGN KEY ("calendar_id") REFERENCES "public"."content_calendar"("id");



ALTER TABLE ONLY "public"."content_drafts"
    ADD CONSTRAINT "content_drafts_revisado_por_fkey" FOREIGN KEY ("revisado_por") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."content_drafts"
    ADD CONSTRAINT "content_drafts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."content_published"
    ADD CONSTRAINT "content_published_draft_id_fkey" FOREIGN KEY ("draft_id") REFERENCES "public"."content_drafts"("id");



ALTER TABLE ONLY "public"."content_published"
    ADD CONSTRAINT "content_published_publicado_por_fkey" FOREIGN KEY ("publicado_por") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."content_published"
    ADD CONSTRAINT "content_published_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."contratos"
    ADD CONSTRAINT "contratos_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id");



ALTER TABLE ONLY "public"."contratos"
    ADD CONSTRAINT "contratos_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");



ALTER TABLE ONLY "public"."conversation_events"
    ADD CONSTRAINT "conversation_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."conversation_events"
    ADD CONSTRAINT "conversation_events_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."conversation_events"
    ADD CONSTRAINT "conversation_events_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."conversation_status_log"
    ADD CONSTRAINT "conversation_status_log_changed_by_fkey" FOREIGN KEY ("changed_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."conversation_status_log"
    ADD CONSTRAINT "conversation_status_log_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."conversation_status_log"
    ADD CONSTRAINT "conversation_status_log_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."conversation_tags"
    ADD CONSTRAINT "conversation_tags_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."conversation_tags"
    ADD CONSTRAINT "conversation_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "public"."lead_tags"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_active_task_id_fkey" FOREIGN KEY ("active_task_id") REFERENCES "public"."client_tasks"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_closed_by_fkey" FOREIGN KEY ("closed_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_finished_by_fkey" FOREIGN KEY ("finished_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_instance_id_fkey" FOREIGN KEY ("instance_id") REFERENCES "public"."evolution_instances"("id");



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_reopened_by_fkey" FOREIGN KEY ("reopened_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_status_changed_by_fkey" FOREIGN KEY ("status_changed_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cora_acoes"
    ADD CONSTRAINT "cora_acoes_agent_run_id_fkey" FOREIGN KEY ("agent_run_id") REFERENCES "public"."agent_runs"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."cora_acoes"
    ADD CONSTRAINT "cora_acoes_cobranca_id_fkey" FOREIGN KEY ("cobranca_id") REFERENCES "public"."cora_cobrancas"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cora_acoes"
    ADD CONSTRAINT "cora_acoes_cobranca_v2_id_fkey" FOREIGN KEY ("cobranca_v2_id") REFERENCES "public"."cobrancas"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."cora_acoes"
    ADD CONSTRAINT "cora_acoes_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");



ALTER TABLE ONLY "public"."cora_cobrancas"
    ADD CONSTRAINT "cora_cobrancas_regua_id_fkey" FOREIGN KEY ("regua_id") REFERENCES "public"."cora_reguas"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."cora_cobrancas"
    ADD CONSTRAINT "cora_cobrancas_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cora_reguas"
    ADD CONSTRAINT "cora_reguas_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."crm_notas"
    ADD CONSTRAINT "crm_notas_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."crm_notas"
    ADD CONSTRAINT "crm_notas_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");



ALTER TABLE ONLY "public"."crm_webhook_tokens"
    ADD CONSTRAINT "crm_webhook_tokens_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."custom_field_values"
    ADD CONSTRAINT "custom_field_values_custom_field_id_fkey" FOREIGN KEY ("custom_field_id") REFERENCES "public"."custom_fields"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."custom_fields"
    ADD CONSTRAINT "custom_fields_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");



ALTER TABLE ONLY "public"."customer_addresses"
    ADD CONSTRAINT "customer_addresses_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."customer_addresses"
    ADD CONSTRAINT "customer_addresses_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."customer_group_members"
    ADD CONSTRAINT "customer_group_members_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."customer_group_members"
    ADD CONSTRAINT "customer_group_members_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."customer_groups"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."customer_groups"
    ADD CONSTRAINT "customer_groups_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");



ALTER TABLE ONLY "public"."customer_note_entries"
    ADD CONSTRAINT "customer_note_entries_chat_task_id_fkey" FOREIGN KEY ("chat_task_id") REFERENCES "public"."chat_tasks"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."customer_note_entries"
    ADD CONSTRAINT "customer_note_entries_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."customer_note_entries"
    ADD CONSTRAINT "customer_note_entries_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."customer_note_entries"
    ADD CONSTRAINT "customer_note_entries_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."customer_note_entries"
    ADD CONSTRAINT "customer_note_entries_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."customer_notes"
    ADD CONSTRAINT "customer_notes_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."customer_notes"
    ADD CONSTRAINT "customer_notes_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."customer_notes"
    ADD CONSTRAINT "customer_notes_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."customer_notes"
    ADD CONSTRAINT "customer_notes_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."customer_tag_relations"
    ADD CONSTRAINT "customer_tag_relations_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."customer_tag_relations"
    ADD CONSTRAINT "customer_tag_relations_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "public"."contact_tags"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."customer_tags"
    ADD CONSTRAINT "customer_tags_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."customer_tags"
    ADD CONSTRAINT "customer_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "public"."lead_tags"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."customers"
    ADD CONSTRAINT "customers_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."customers"
    ADD CONSTRAINT "customers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."daily_kpis"
    ADD CONSTRAINT "daily_kpis_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."defesa_aprovadores"
    ADD CONSTRAINT "defesa_aprovadores_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."defesa_aprovadores"
    ADD CONSTRAINT "defesa_aprovadores_loja_id_fkey" FOREIGN KEY ("loja_id") REFERENCES "public"."lojas"("id");



ALTER TABLE ONLY "public"."defesa_aprovadores"
    ADD CONSTRAINT "defesa_aprovadores_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");



ALTER TABLE ONLY "public"."defesa_assinaturas"
    ADD CONSTRAINT "defesa_assinaturas_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");



ALTER TABLE ONLY "public"."defesa_casos"
    ADD CONSTRAINT "defesa_casos_loja_id_fkey" FOREIGN KEY ("loja_id") REFERENCES "public"."lojas"("id");



ALTER TABLE ONLY "public"."defesa_casos"
    ADD CONSTRAINT "defesa_casos_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");



ALTER TABLE ONLY "public"."deli_actions_log"
    ADD CONSTRAINT "deli_actions_log_approval_id_fkey" FOREIGN KEY ("approval_id") REFERENCES "public"."deli_pending_approvals"("id");



ALTER TABLE ONLY "public"."deli_actions_log"
    ADD CONSTRAINT "deli_actions_log_draft_id_fkey" FOREIGN KEY ("related_draft_id") REFERENCES "public"."agent_drafts"("id");



ALTER TABLE ONLY "public"."deli_actions_log"
    ADD CONSTRAINT "deli_actions_log_trigger_id_fkey" FOREIGN KEY ("trigger_id") REFERENCES "public"."deli_triggers"("id");



ALTER TABLE ONLY "public"."deli_agenda"
    ADD CONSTRAINT "deli_agenda_run_fkey" FOREIGN KEY ("agent_run_id") REFERENCES "public"."agent_runs"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."deli_agenda"
    ADD CONSTRAINT "deli_agenda_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."deli_messages"
    ADD CONSTRAINT "deli_messages_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."deli_messages"
    ADD CONSTRAINT "deli_messages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."deli_pending_approvals"
    ADD CONSTRAINT "deli_pending_approvals_draft_id_fkey" FOREIGN KEY ("draft_id") REFERENCES "public"."agent_drafts"("id");



ALTER TABLE ONLY "public"."deli_pending_approvals"
    ADD CONSTRAINT "deli_pending_approvals_resolved_by_fkey" FOREIGN KEY ("approver_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."deli_pending_approvals"
    ADD CONSTRAINT "deli_pending_approvals_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."deli_pending_approvals"
    ADD CONSTRAINT "deli_pending_approvals_trigger_id_fkey" FOREIGN KEY ("trigger_id") REFERENCES "public"."deli_triggers"("id");



ALTER TABLE ONLY "public"."deli_triggers"
    ADD CONSTRAINT "deli_triggers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."department_members"
    ADD CONSTRAINT "department_members_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."department_members"
    ADD CONSTRAINT "department_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."departments"
    ADD CONSTRAINT "departments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."encerramento_config"
    ADD CONSTRAINT "encerramento_config_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."espacos_columns"
    ADD CONSTRAINT "espacos_columns_list_id_fkey" FOREIGN KEY ("list_id") REFERENCES "public"."espacos_lists"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."espacos_columns"
    ADD CONSTRAINT "espacos_columns_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."espacos_folders"
    ADD CONSTRAINT "espacos_folders_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."espacos_folders"
    ADD CONSTRAINT "espacos_folders_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."espacos_folders"
    ADD CONSTRAINT "espacos_folders_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."espacos_workspaces"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."espacos_lists"
    ADD CONSTRAINT "espacos_lists_folder_id_fkey" FOREIGN KEY ("folder_id") REFERENCES "public"."espacos_folders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."espacos_lists"
    ADD CONSTRAINT "espacos_lists_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."espacos_workspaces"
    ADD CONSTRAINT "espacos_workspaces_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."estudio_criacoes"
    ADD CONSTRAINT "estudio_criacoes_criado_por_fkey" FOREIGN KEY ("criado_por") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."estudio_criacoes"
    ADD CONSTRAINT "estudio_criacoes_loja_id_fkey" FOREIGN KEY ("loja_id") REFERENCES "public"."lojas"("id");



ALTER TABLE ONLY "public"."estudio_criacoes"
    ADD CONSTRAINT "estudio_criacoes_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");



ALTER TABLE ONLY "public"."evolution_instances"
    ADD CONSTRAINT "evolution_instances_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");



ALTER TABLE ONLY "public"."goal_tasks"
    ADD CONSTRAINT "goal_tasks_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."goal_tasks"
    ADD CONSTRAINT "goal_tasks_goal_id_fkey" FOREIGN KEY ("goal_id") REFERENCES "public"."goals"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."goal_tasks"
    ADD CONSTRAINT "goal_tasks_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."goals"
    ADD CONSTRAINT "goals_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."goals"
    ADD CONSTRAINT "goals_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."goals"
    ADD CONSTRAINT "goals_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."heartbeat_runs"
    ADD CONSTRAINT "heartbeat_runs_heartbeat_id_fkey" FOREIGN KEY ("heartbeat_id") REFERENCES "public"."heartbeats"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."heartbeat_runs"
    ADD CONSTRAINT "heartbeat_runs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."heartbeats"
    ADD CONSTRAINT "heartbeats_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."heartbeats"
    ADD CONSTRAINT "heartbeats_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ifood_merchants"
    ADD CONSTRAINT "ifood_merchants_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");



ALTER TABLE ONLY "public"."inadimplencia_messages"
    ADD CONSTRAINT "inadimplencia_messages_inadimplencia_id_fkey" FOREIGN KEY ("inadimplencia_id") REFERENCES "public"."inadimplencias"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."inadimplencia_messages"
    ADD CONSTRAINT "inadimplencia_messages_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."inadimplencias"
    ADD CONSTRAINT "inadimplencias_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."inadimplencias"
    ADD CONSTRAINT "inadimplencias_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."inadimplencias"
    ADD CONSTRAINT "inadimplencias_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."internal_channels"
    ADD CONSTRAINT "internal_channels_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."internal_channels"
    ADD CONSTRAINT "internal_channels_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."internal_notifications"
    ADD CONSTRAINT "internal_notifications_recipient_user_id_fkey" FOREIGN KEY ("recipient_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."internal_notifications"
    ADD CONSTRAINT "internal_notifications_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lead_list_members"
    ADD CONSTRAINT "lead_list_members_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lead_list_members"
    ADD CONSTRAINT "lead_list_members_list_id_fkey" FOREIGN KEY ("list_id") REFERENCES "public"."lead_lists"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lead_lists"
    ADD CONSTRAINT "lead_lists_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lead_tags"
    ADD CONSTRAINT "lead_tags_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."leads"
    ADD CONSTRAINT "leads_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id");



ALTER TABLE ONLY "public"."leads"
    ADD CONSTRAINT "leads_responsavel_id_fkey" FOREIGN KEY ("responsavel_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."leads"
    ADD CONSTRAINT "leads_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."loja_consultores"
    ADD CONSTRAINT "loja_consultores_atribuido_por_fkey" FOREIGN KEY ("atribuido_por") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."loja_consultores"
    ADD CONSTRAINT "loja_consultores_loja_id_fkey" FOREIGN KEY ("loja_id") REFERENCES "public"."lojas"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."loja_consultores"
    ADD CONSTRAINT "loja_consultores_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."loja_gpt_conversations"
    ADD CONSTRAINT "loja_gpt_conversations_iniciada_por_fkey" FOREIGN KEY ("iniciada_por") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."loja_gpt_conversations"
    ADD CONSTRAINT "loja_gpt_conversations_loja_id_fkey" FOREIGN KEY ("loja_id") REFERENCES "public"."lojas"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."loja_gpt_messages"
    ADD CONSTRAINT "loja_gpt_messages_autor_user_id_fkey" FOREIGN KEY ("autor_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."loja_gpt_messages"
    ADD CONSTRAINT "loja_gpt_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."loja_gpt_conversations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."loja_metricas"
    ADD CONSTRAINT "loja_metricas_loja_id_fkey" FOREIGN KEY ("loja_id") REFERENCES "public"."lojas"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."loja_metricas_snapshot"
    ADD CONSTRAINT "loja_metricas_snapshot_capturado_por_fkey" FOREIGN KEY ("capturado_por") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."loja_metricas_snapshot"
    ADD CONSTRAINT "loja_metricas_snapshot_loja_id_fkey" FOREIGN KEY ("loja_id") REFERENCES "public"."lojas"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."loja_metricas"
    ADD CONSTRAINT "loja_metricas_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."loja_whatsapp_vinculo"
    ADD CONSTRAINT "loja_whatsapp_vinculo_loja_id_fkey" FOREIGN KEY ("loja_id") REFERENCES "public"."lojas"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."loja_whatsapp_vinculo"
    ADD CONSTRAINT "loja_whatsapp_vinculo_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lojas"
    ADD CONSTRAINT "lojas_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."customers"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."lojas"
    ADD CONSTRAINT "lojas_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."lojas"
    ADD CONSTRAINT "lojas_store_tenant_id_fkey" FOREIGN KEY ("store_tenant_id") REFERENCES "public"."tenants"("id");



ALTER TABLE ONLY "public"."lojas"
    ADD CONSTRAINT "lojas_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."marca_pesquisa"
    ADD CONSTRAINT "marca_pesquisa_criado_por_fkey" FOREIGN KEY ("criado_por") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."marca_pesquisa"
    ADD CONSTRAINT "marca_pesquisa_loja_id_fkey" FOREIGN KEY ("loja_id") REFERENCES "public"."lojas"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."marca_pesquisa"
    ADD CONSTRAINT "marca_pesquisa_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."max_knowledge_base"
    ADD CONSTRAINT "max_knowledge_base_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_sender_agent_id_fkey" FOREIGN KEY ("sender_agent_id") REFERENCES "public"."agents"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_sender_user_id_fkey" FOREIGN KEY ("sender_user_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."mia_analises"
    ADD CONSTRAINT "mia_analises_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."mia_audit_log"
    ADD CONSTRAINT "mia_audit_log_loja_id_fkey" FOREIGN KEY ("loja_id") REFERENCES "public"."lojas"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."mia_audit_log"
    ADD CONSTRAINT "mia_audit_log_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."mia_audit_log"
    ADD CONSTRAINT "mia_audit_log_vinculo_id_fkey" FOREIGN KEY ("vinculo_id") REFERENCES "public"."loja_whatsapp_vinculo"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."missions"
    ADD CONSTRAINT "missions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."missions"
    ADD CONSTRAINT "missions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."nexus_requests"
    ADD CONSTRAINT "nexus_requests_loja_id_fkey" FOREIGN KEY ("loja_id") REFERENCES "public"."lojas"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."nexus_requests"
    ADD CONSTRAINT "nexus_requests_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notification_preferences"
    ADD CONSTRAINT "notification_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."nova_blueprints"
    ADD CONSTRAINT "nova_blueprints_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."nova_blueprints"
    ADD CONSTRAINT "nova_blueprints_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."nps_avaliacoes"
    ADD CONSTRAINT "nps_avaliacoes_loja_id_fkey" FOREIGN KEY ("loja_id") REFERENCES "public"."lojas"("id");



ALTER TABLE ONLY "public"."nps_avaliacoes"
    ADD CONSTRAINT "nps_avaliacoes_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."onboarding_checklists"
    ADD CONSTRAINT "onboarding_checklists_contrato_id_fkey" FOREIGN KEY ("contrato_id") REFERENCES "public"."contratos"("id");



ALTER TABLE ONLY "public"."onboarding_checklists"
    ADD CONSTRAINT "onboarding_checklists_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id");



ALTER TABLE ONLY "public"."onboarding_checklists"
    ADD CONSTRAINT "onboarding_checklists_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");



ALTER TABLE ONLY "public"."onboarding_templates"
    ADD CONSTRAINT "onboarding_templates_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");



ALTER TABLE ONLY "public"."oracle_drafts"
    ADD CONSTRAINT "oracle_drafts_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id");



ALTER TABLE ONLY "public"."oracle_drafts"
    ADD CONSTRAINT "oracle_drafts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."projects"
    ADD CONSTRAINT "projects_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."projects"
    ADD CONSTRAINT "projects_mission_id_fkey" FOREIGN KEY ("mission_id") REFERENCES "public"."missions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."projects"
    ADD CONSTRAINT "projects_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."prospect_abordagens"
    ADD CONSTRAINT "prospect_abordagens_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."prospect_abordagens"
    ADD CONSTRAINT "prospect_abordagens_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."prospect_abordagens"
    ADD CONSTRAINT "prospect_abordagens_prospect_id_fkey" FOREIGN KEY ("prospect_id") REFERENCES "public"."prospects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."prospect_pesquisas"
    ADD CONSTRAINT "prospect_pesquisas_prospect_id_fkey" FOREIGN KEY ("prospect_id") REFERENCES "public"."prospects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."prospects"
    ADD CONSTRAINT "prospects_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."quick_replies"
    ADD CONSTRAINT "quick_replies_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."quick_replies"
    ADD CONSTRAINT "quick_replies_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."quick_replies"
    ADD CONSTRAINT "quick_replies_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."radar_fontes"
    ADD CONSTRAINT "radar_fontes_loja_id_fkey" FOREIGN KEY ("loja_id") REFERENCES "public"."lojas"("id");



ALTER TABLE ONLY "public"."radar_fontes"
    ADD CONSTRAINT "radar_fontes_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");



ALTER TABLE ONLY "public"."radar_metricas"
    ADD CONSTRAINT "radar_metricas_fonte_id_fkey" FOREIGN KEY ("fonte_id") REFERENCES "public"."radar_fontes"("id");



ALTER TABLE ONLY "public"."radar_metricas"
    ADD CONSTRAINT "radar_metricas_loja_id_fkey" FOREIGN KEY ("loja_id") REFERENCES "public"."lojas"("id");



ALTER TABLE ONLY "public"."radar_metricas"
    ADD CONSTRAINT "radar_metricas_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");



ALTER TABLE ONLY "public"."radar_series"
    ADD CONSTRAINT "radar_series_fonte_id_fkey" FOREIGN KEY ("fonte_id") REFERENCES "public"."radar_fontes"("id");



ALTER TABLE ONLY "public"."radar_series"
    ADD CONSTRAINT "radar_series_loja_id_fkey" FOREIGN KEY ("loja_id") REFERENCES "public"."lojas"("id");



ALTER TABLE ONLY "public"."radar_series"
    ADD CONSTRAINT "radar_series_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");



ALTER TABLE ONLY "public"."regua_cobranca"
    ADD CONSTRAINT "regua_cobranca_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reguas"
    ADD CONSTRAINT "reguas_aprovada_por_fkey" FOREIGN KEY ("aprovada_por") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."reguas"
    ADD CONSTRAINT "reguas_criada_por_fkey" FOREIGN KEY ("criada_por") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."reguas"
    ADD CONSTRAINT "reguas_loja_id_fkey" FOREIGN KEY ("loja_id") REFERENCES "public"."lojas"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reguas"
    ADD CONSTRAINT "reguas_pesquisa_id_fkey" FOREIGN KEY ("pesquisa_id") REFERENCES "public"."marca_pesquisa"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."reguas"
    ADD CONSTRAINT "reguas_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."role_permissions"
    ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."roles"
    ADD CONSTRAINT "roles_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."sugestoes_ia"
    ADD CONSTRAINT "sugestoes_ia_conversa_id_fkey" FOREIGN KEY ("conversa_id") REFERENCES "public"."conversations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."sugestoes_ia"
    ADD CONSTRAINT "sugestoes_ia_loja_id_fkey" FOREIGN KEY ("loja_id") REFERENCES "public"."lojas"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."sugestoes_ia"
    ADD CONSTRAINT "sugestoes_ia_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."sugestoes_plataforma"
    ADD CONSTRAINT "sugestoes_plataforma_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."sugestoes_plataforma"
    ADD CONSTRAINT "sugestoes_plataforma_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."support_tickets"
    ADD CONSTRAINT "support_tickets_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id");



ALTER TABLE ONLY "public"."support_tickets"
    ADD CONSTRAINT "support_tickets_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");



ALTER TABLE ONLY "public"."tarefa_anexos"
    ADD CONSTRAINT "tarefa_anexos_acao_id_fkey" FOREIGN KEY ("acao_id") REFERENCES "public"."tarefa_aprovacoes"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."tarefa_anexos"
    ADD CONSTRAINT "tarefa_anexos_tarefa_id_fkey" FOREIGN KEY ("tarefa_id") REFERENCES "public"."tarefas_loja"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tarefa_anexos"
    ADD CONSTRAINT "tarefa_anexos_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");



ALTER TABLE ONLY "public"."tarefa_anexos"
    ADD CONSTRAINT "tarefa_anexos_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."tarefa_aprovacoes"
    ADD CONSTRAINT "tarefa_aprovacoes_autor_id_fkey" FOREIGN KEY ("autor_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."tarefa_aprovacoes"
    ADD CONSTRAINT "tarefa_aprovacoes_tarefa_id_fkey" FOREIGN KEY ("tarefa_id") REFERENCES "public"."tarefas_loja"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tarefa_comentarios"
    ADD CONSTRAINT "tarefa_comentarios_autor_id_fkey" FOREIGN KEY ("autor_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."tarefa_comentarios"
    ADD CONSTRAINT "tarefa_comentarios_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "public"."tarefa_comentarios"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tarefa_comentarios"
    ADD CONSTRAINT "tarefa_comentarios_print_id_fkey" FOREIGN KEY ("print_id") REFERENCES "public"."tarefa_prints"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."tarefa_comentarios"
    ADD CONSTRAINT "tarefa_comentarios_tarefa_id_fkey" FOREIGN KEY ("tarefa_id") REFERENCES "public"."tarefas_loja"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tarefa_prints"
    ADD CONSTRAINT "tarefa_prints_enviado_por_fkey" FOREIGN KEY ("enviado_por") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."tarefa_prints"
    ADD CONSTRAINT "tarefa_prints_tarefa_id_fkey" FOREIGN KEY ("tarefa_id") REFERENCES "public"."tarefas_loja"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tarefa_revisoes"
    ADD CONSTRAINT "tarefa_revisoes_tarefa_id_fkey" FOREIGN KEY ("tarefa_id") REFERENCES "public"."tarefas_loja"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tarefas_analise"
    ADD CONSTRAINT "tarefas_analise_analise_id_fkey" FOREIGN KEY ("analise_id") REFERENCES "public"."analises"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tarefas_loja"
    ADD CONSTRAINT "tarefas_loja_analise_id_fkey" FOREIGN KEY ("analise_id") REFERENCES "public"."analises"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."tarefas_loja"
    ADD CONSTRAINT "tarefas_loja_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."tarefas_loja"
    ADD CONSTRAINT "tarefas_loja_loja_id_fkey" FOREIGN KEY ("loja_id") REFERENCES "public"."lojas"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tarefas_loja"
    ADD CONSTRAINT "tarefas_loja_responsavel_id_fkey" FOREIGN KEY ("responsavel_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."task_comments"
    ADD CONSTRAINT "task_comments_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."task_comments"
    ADD CONSTRAINT "task_comments_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."task_comments"
    ADD CONSTRAINT "task_comments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_analise_id_fkey" FOREIGN KEY ("analise_id") REFERENCES "public"."analises"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "public"."customers"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."templates_tarefa"
    ADD CONSTRAINT "templates_tarefa_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."templates"
    ADD CONSTRAINT "templates_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");



ALTER TABLE ONLY "public"."tenant_agent_config"
    ADD CONSTRAINT "tenant_agent_config_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tenant_agent_config"
    ADD CONSTRAINT "tenant_agent_config_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tenant_agents"
    ADD CONSTRAINT "tenant_agents_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tenant_agents"
    ADD CONSTRAINT "tenant_agents_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tenant_files"
    ADD CONSTRAINT "tenant_files_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");



ALTER TABLE ONLY "public"."tenant_gatilhos"
    ADD CONSTRAINT "tenant_gatilhos_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");



ALTER TABLE ONLY "public"."tenant_integracoes"
    ADD CONSTRAINT "tenant_integracoes_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");



ALTER TABLE ONLY "public"."tenant_links"
    ADD CONSTRAINT "tenant_links_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");



ALTER TABLE ONLY "public"."tenant_members"
    ADD CONSTRAINT "tenant_members_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tenant_members"
    ADD CONSTRAINT "tenant_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tenant_modules"
    ADD CONSTRAINT "tenant_modules_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tenant_provedores"
    ADD CONSTRAINT "tenant_provedores_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");



ALTER TABLE ONLY "public"."tenant_sistemas"
    ADD CONSTRAINT "tenant_sistemas_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");



ALTER TABLE ONLY "public"."tenant_tarefas"
    ADD CONSTRAINT "tenant_tarefas_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");



ALTER TABLE ONLY "public"."tenant_topicos"
    ADD CONSTRAINT "tenant_topicos_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");



ALTER TABLE ONLY "public"."tenants"
    ADD CONSTRAINT "tenants_parent_tenant_id_fkey" FOREIGN KEY ("parent_tenant_id") REFERENCES "public"."tenants"("id");



ALTER TABLE ONLY "public"."user_agent_access"
    ADD CONSTRAINT "user_agent_access_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id");



ALTER TABLE ONLY "public"."user_agent_access"
    ADD CONSTRAINT "user_agent_access_granted_by_fkey" FOREIGN KEY ("granted_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."user_agent_access"
    ADD CONSTRAINT "user_agent_access_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");



ALTER TABLE ONLY "public"."user_agent_access"
    ADD CONSTRAINT "user_agent_access_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_granted_by_fkey" FOREIGN KEY ("granted_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_screen_permissions"
    ADD CONSTRAINT "user_screen_permissions_granted_by_fkey" FOREIGN KEY ("granted_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."user_screen_permissions"
    ADD CONSTRAINT "user_screen_permissions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_screen_permissions"
    ADD CONSTRAINT "user_screen_permissions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."vendaerp_instances"
    ADD CONSTRAINT "vendaerp_instances_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");



ALTER TABLE ONLY "public"."vendaerp_proposals"
    ADD CONSTRAINT "vendaerp_proposals_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");



ALTER TABLE ONLY "public"."vera_anomalias"
    ADD CONSTRAINT "vera_anomalias_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."vera_metricas_snapshot"
    ADD CONSTRAINT "vera_metricas_snapshot_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."vera_reports"
    ADD CONSTRAINT "vera_reports_agent_run_fkey" FOREIGN KEY ("agent_run_id") REFERENCES "public"."agent_runs"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."vera_reports"
    ADD CONSTRAINT "vera_reports_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."whatsapp_aprovacao_sessions"
    ADD CONSTRAINT "whatsapp_aprovacao_sessions_analise_id_fkey" FOREIGN KEY ("analise_id") REFERENCES "public"."analises"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."whatsapp_aprovacao_sessions"
    ADD CONSTRAINT "whatsapp_aprovacao_sessions_loja_id_fkey" FOREIGN KEY ("loja_id") REFERENCES "public"."lojas"("id");



ALTER TABLE ONLY "public"."whatsapp_contacts"
    ADD CONSTRAINT "whatsapp_contacts_internal_user_id_fkey" FOREIGN KEY ("internal_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."whatsapp_contacts"
    ADD CONSTRAINT "whatsapp_contacts_loja_id_fkey" FOREIGN KEY ("loja_id") REFERENCES "public"."lojas"("id");



ALTER TABLE ONLY "public"."whatsapp_contacts"
    ADD CONSTRAINT "whatsapp_contacts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."whatsapp_group_members"
    ADD CONSTRAINT "whatsapp_group_members_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "public"."whatsapp_contacts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."whatsapp_group_members"
    ADD CONSTRAINT "whatsapp_group_members_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."whatsapp_groups"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."whatsapp_groups"
    ADD CONSTRAINT "whatsapp_groups_loja_id_fkey" FOREIGN KEY ("loja_id") REFERENCES "public"."lojas"("id");



ALTER TABLE ONLY "public"."whatsapp_groups"
    ADD CONSTRAINT "whatsapp_groups_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."whatsapp_messages"
    ADD CONSTRAINT "whatsapp_messages_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "public"."whatsapp_contacts"("id");



ALTER TABLE ONLY "public"."whatsapp_messages"
    ADD CONSTRAINT "whatsapp_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id");



ALTER TABLE ONLY "public"."whatsapp_messages"
    ADD CONSTRAINT "whatsapp_messages_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."whatsapp_groups"("id");



ALTER TABLE ONLY "public"."whatsapp_messages"
    ADD CONSTRAINT "whatsapp_messages_sender_contact_id_fkey" FOREIGN KEY ("sender_contact_id") REFERENCES "public"."whatsapp_contacts"("id");



ALTER TABLE ONLY "public"."whatsapp_messages"
    ADD CONSTRAINT "whatsapp_messages_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



CREATE POLICY "Admins gerenciam atribuições" ON "public"."loja_consultores" USING ((EXISTS ( SELECT 1
   FROM "public"."lojas" "l"
  WHERE (("l"."id" = "loja_consultores"."loja_id") AND "public"."has_rbac_role_in_hierarchy"("l"."tenant_id", ARRAY['admin'::"text", 'consultor_senior'::"text"])))));



CREATE POLICY "Cancelar sessao do tenant" ON "public"."whatsapp_aprovacao_sessions" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."lojas" "l"
  WHERE (("l"."id" = "whatsapp_aprovacao_sessions"."loja_id") AND ("l"."tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids")))))) WITH CHECK (("status" = 'cancelada'::"text"));



CREATE POLICY "Comentar: admins, consultores_senior e consultores atribuidos" ON "public"."tarefa_comentarios" FOR INSERT WITH CHECK (((("autor_id" = "auth"."uid"()) OR ("autor_id" IS NULL)) AND ((EXISTS ( SELECT 1
   FROM ("public"."tarefas_loja" "t"
     JOIN "public"."lojas" "l" ON (("l"."id" = "t"."loja_id")))
  WHERE (("t"."id" = "tarefa_comentarios"."tarefa_id") AND "public"."has_rbac_role_in_hierarchy"("l"."tenant_id", ARRAY['admin'::"text", 'consultor_senior'::"text"])))) OR (EXISTS ( SELECT 1
   FROM ("public"."tarefas_loja" "t"
     JOIN "public"."loja_consultores" "lc" ON (("lc"."loja_id" = "t"."loja_id")))
  WHERE (("t"."id" = "tarefa_comentarios"."tarefa_id") AND ("lc"."user_id" = "auth"."uid"()) AND ("lc"."ativo" = true)))))));



CREATE POLICY "Deletar comentario: autor ou admin" ON "public"."tarefa_comentarios" FOR DELETE USING ((("autor_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM ("public"."tarefas_loja" "t"
     JOIN "public"."lojas" "l" ON (("l"."id" = "t"."loja_id")))
  WHERE (("t"."id" = "tarefa_comentarios"."tarefa_id") AND "public"."has_rbac_role_in_hierarchy"("l"."tenant_id", ARRAY['admin'::"text", 'consultor_senior'::"text"]))))));



CREATE POLICY "Editar métricas: admins, consultores_senior e consultores atri" ON "public"."loja_metricas_snapshot" USING (((EXISTS ( SELECT 1
   FROM "public"."lojas" "l"
  WHERE (("l"."id" = "loja_metricas_snapshot"."loja_id") AND "public"."has_rbac_role_in_hierarchy"("l"."tenant_id", ARRAY['admin'::"text", 'consultor_senior'::"text"])))) OR (EXISTS ( SELECT 1
   FROM "public"."loja_consultores" "lc"
  WHERE (("lc"."loja_id" = "loja_metricas_snapshot"."loja_id") AND ("lc"."user_id" = "auth"."uid"()) AND ("lc"."ativo" = true))))));



CREATE POLICY "Editar proprio comentario" ON "public"."tarefa_comentarios" FOR UPDATE USING (("autor_id" = "auth"."uid"())) WITH CHECK (("autor_id" = "auth"."uid"()));



CREATE POLICY "Enviar prints: admins, consultores_senior e consultores atribui" ON "public"."tarefa_prints" FOR INSERT WITH CHECK (((EXISTS ( SELECT 1
   FROM ("public"."tarefas_loja" "t"
     JOIN "public"."lojas" "l" ON (("l"."id" = "t"."loja_id")))
  WHERE (("t"."id" = "tarefa_prints"."tarefa_id") AND "public"."has_rbac_role_in_hierarchy"("l"."tenant_id", ARRAY['admin'::"text", 'consultor_senior'::"text"])))) OR (EXISTS ( SELECT 1
   FROM ("public"."tarefas_loja" "t"
     JOIN "public"."loja_consultores" "lc" ON (("lc"."loja_id" = "t"."loja_id")))
  WHERE (("t"."id" = "tarefa_prints"."tarefa_id") AND ("lc"."user_id" = "auth"."uid"()) AND ("lc"."ativo" = true))))));



CREATE POLICY "Gerenciar tarefas: admins, consultores_senior e consultores atr" ON "public"."tarefas_loja" USING (((EXISTS ( SELECT 1
   FROM "public"."lojas" "l"
  WHERE (("l"."id" = "tarefas_loja"."loja_id") AND "public"."has_rbac_role_in_hierarchy"("l"."tenant_id", ARRAY['admin'::"text", 'consultor_senior'::"text"])))) OR (EXISTS ( SELECT 1
   FROM "public"."loja_consultores" "lc"
  WHERE (("lc"."loja_id" = "tarefas_loja"."loja_id") AND ("lc"."user_id" = "auth"."uid"()) AND ("lc"."ativo" = true))))));



CREATE POLICY "Gerenciar templates: admins e consultores_senior" ON "public"."templates_tarefa" USING ("public"."has_rbac_role_in_hierarchy"("tenant_id", ARRAY['admin'::"text", 'consultor_senior'::"text"]));



CREATE POLICY "Métricas do próprio tenant" ON "public"."loja_metricas_snapshot" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."lojas" "l"
  WHERE (("l"."id" = "loja_metricas_snapshot"."loja_id") AND ("l"."tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids"))))));



CREATE POLICY "Registrar acao: admins, consultores_senior e consultores atribu" ON "public"."tarefa_aprovacoes" FOR INSERT WITH CHECK (((EXISTS ( SELECT 1
   FROM ("public"."tarefas_loja" "t"
     JOIN "public"."lojas" "l" ON (("l"."id" = "t"."loja_id")))
  WHERE (("t"."id" = "tarefa_aprovacoes"."tarefa_id") AND "public"."has_rbac_role_in_hierarchy"("l"."tenant_id", ARRAY['admin'::"text", 'consultor_senior'::"text"])))) OR (EXISTS ( SELECT 1
   FROM ("public"."tarefas_loja" "t"
     JOIN "public"."loja_consultores" "lc" ON (("lc"."loja_id" = "t"."loja_id")))
  WHERE (("t"."id" = "tarefa_aprovacoes"."tarefa_id") AND ("lc"."user_id" = "auth"."uid"()) AND ("lc"."ativo" = true))))));



CREATE POLICY "Remover prints proprios ou como admin" ON "public"."tarefa_prints" FOR DELETE USING ((("enviado_por" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM ("public"."tarefas_loja" "t"
     JOIN "public"."lojas" "l" ON (("l"."id" = "t"."loja_id")))
  WHERE (("t"."id" = "tarefa_prints"."tarefa_id") AND "public"."has_rbac_role_in_hierarchy"("l"."tenant_id", ARRAY['admin'::"text", 'consultor_senior'::"text"]))))));



CREATE POLICY "Sessoes do tenant" ON "public"."whatsapp_aprovacao_sessions" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."lojas" "l"
  WHERE (("l"."id" = "whatsapp_aprovacao_sessions"."loja_id") AND ("l"."tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids"))))));



CREATE POLICY "Ver atribuições do próprio tenant" ON "public"."loja_consultores" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."lojas" "l"
  WHERE (("l"."id" = "loja_consultores"."loja_id") AND ("l"."tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids"))))));



CREATE POLICY "Ver comentarios do proprio tenant" ON "public"."tarefa_comentarios" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."tarefas_loja" "t"
     JOIN "public"."lojas" "l" ON (("l"."id" = "t"."loja_id")))
  WHERE (("t"."id" = "tarefa_comentarios"."tarefa_id") AND ("l"."tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids"))))));



CREATE POLICY "Ver historico do proprio tenant" ON "public"."tarefa_aprovacoes" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."tarefas_loja" "t"
     JOIN "public"."lojas" "l" ON (("l"."id" = "t"."loja_id")))
  WHERE (("t"."id" = "tarefa_aprovacoes"."tarefa_id") AND ("l"."tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids"))))));



CREATE POLICY "Ver prints do proprio tenant" ON "public"."tarefa_prints" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."tarefas_loja" "t"
     JOIN "public"."lojas" "l" ON (("l"."id" = "t"."loja_id")))
  WHERE (("t"."id" = "tarefa_prints"."tarefa_id") AND ("l"."tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids"))))));



CREATE POLICY "Ver tarefas do proprio tenant" ON "public"."tarefas_loja" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."lojas" "l"
  WHERE (("l"."id" = "tarefas_loja"."loja_id") AND ("l"."tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids"))))));



CREATE POLICY "Ver templates do proprio tenant" ON "public"."templates_tarefa" FOR SELECT USING (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids")));



ALTER TABLE "public"."aceite_recontratacao" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "admin and dev can write bot_config" ON "public"."bot_configs" USING (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids_with_role"(ARRAY['admin'::"text", 'dev'::"text"]) AS "accessible_tenant_ids_with_role"))) WITH CHECK (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids_with_role"(ARRAY['admin'::"text", 'dev'::"text"]) AS "accessible_tenant_ids_with_role")));



CREATE POLICY "admin_read_screen_perms" ON "public"."user_screen_permissions" FOR SELECT USING ("public"."is_admin_of"("tenant_id"));



ALTER TABLE "public"."agent_action_approvals" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "agent_action_approvals_tenant" ON "public"."agent_action_approvals" USING (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids")));



ALTER TABLE "public"."agent_actions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "agent_actions_member_all" ON "public"."agent_actions" USING ("public"."is_member_of"("tenant_id")) WITH CHECK ("public"."is_member_of"("tenant_id"));



ALTER TABLE "public"."agent_chat_messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."agent_corrections" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."agent_drafts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."agent_knowledge_base" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."agent_memories" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."agent_prompts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."agent_runs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."agent_skills" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "agent_skills_select" ON "public"."agent_skills" FOR SELECT USING ((("tenant_id" IS NULL) OR "public"."is_member_of"("tenant_id")));



CREATE POLICY "agent_skills_write" ON "public"."agent_skills" USING ((("tenant_id" IS NOT NULL) AND "public"."is_admin_of"("tenant_id"))) WITH CHECK ((("tenant_id" IS NOT NULL) AND "public"."is_admin_of"("tenant_id")));



ALTER TABLE "public"."agent_ticket_activity" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "agent_ticket_activity_tenant" ON "public"."agent_ticket_activity" USING (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids")));



ALTER TABLE "public"."agent_ticket_comments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "agent_ticket_comments_tenant" ON "public"."agent_ticket_comments" USING (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids")));



ALTER TABLE "public"."agent_tickets" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "agent_tickets_tenant" ON "public"."agent_tickets" USING (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids")));



ALTER TABLE "public"."agente_analises" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "agente_analises_insert" ON "public"."agente_analises" FOR INSERT WITH CHECK ("public"."is_member_of"("tenant_id"));



CREATE POLICY "agente_analises_select" ON "public"."agente_analises" FOR SELECT USING ("public"."is_member_of"("tenant_id"));



ALTER TABLE "public"."agents" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "agents manage own quick_replies" ON "public"."quick_replies" USING (("agent_id" = "auth"."uid"())) WITH CHECK (("agent_id" = "auth"."uid"()));



CREATE POLICY "agents see own and workspace quick_replies" ON "public"."quick_replies" FOR SELECT USING ((("agent_id" = "auth"."uid"()) OR ("tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids"))));



CREATE POLICY "agents_delete_admin_custom" ON "public"."agents" FOR DELETE TO "authenticated" USING (("is_custom" AND ("tenant_id" IS NOT NULL) AND "public"."is_admin_of"("tenant_id")));



CREATE POLICY "agents_insert_admin_custom" ON "public"."agents" FOR INSERT TO "authenticated" WITH CHECK (("is_custom" AND ("tenant_id" IS NOT NULL) AND "public"."is_admin_of"("tenant_id")));



CREATE POLICY "agents_select_gated" ON "public"."agents" FOR SELECT TO "authenticated" USING ((("is_custom" AND ("tenant_id" IS NOT NULL) AND "public"."is_member_of"("tenant_id")) OR "public"."agent_enabled_for_user"("id")));



CREATE POLICY "agents_update_admin_custom" ON "public"."agents" FOR UPDATE TO "authenticated" USING (("is_custom" AND ("tenant_id" IS NOT NULL) AND "public"."is_admin_of"("tenant_id"))) WITH CHECK (("is_custom" AND ("tenant_id" IS NOT NULL) AND "public"."is_admin_of"("tenant_id")));



CREATE POLICY "allow_all_channel_members" ON "public"."channel_members" USING (true) WITH CHECK (true);



CREATE POLICY "allow_all_channel_messages" ON "public"."channel_messages" USING (true) WITH CHECK (true);



CREATE POLICY "allow_all_internal_channels" ON "public"."internal_channels" USING (true) WITH CHECK (true);



ALTER TABLE "public"."analise_loja" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "analise_loja_insert" ON "public"."analise_loja" FOR INSERT WITH CHECK ("public"."is_member_of"("tenant_id"));



CREATE POLICY "analise_loja_select" ON "public"."analise_loja" FOR SELECT USING ("public"."is_member_of"("tenant_id"));



ALTER TABLE "public"."analises" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "anon_insert" ON "public"."reviews" FOR INSERT TO "anon" WITH CHECK (true);



CREATE POLICY "anon_select" ON "public"."reviews" FOR SELECT TO "anon" USING (true);



CREATE POLICY "anon_update" ON "public"."reviews" FOR UPDATE TO "anon" USING (true) WITH CHECK (true);



ALTER TABLE "public"."asaas_eventos" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "atend_aval_insert_tenant" ON "public"."atendimento_avaliacoes" FOR INSERT WITH CHECK (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids")));



CREATE POLICY "atend_aval_select_tenant" ON "public"."atendimento_avaliacoes" FOR SELECT USING (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids")));



CREATE POLICY "atend_aval_update_tenant" ON "public"."atendimento_avaliacoes" FOR UPDATE USING (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids")));



ALTER TABLE "public"."atendimento_avaliacoes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."audit_log" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "audit_log_insert_authenticated" ON "public"."audit_log" FOR INSERT WITH CHECK (("auth"."uid"() IS NOT NULL));



CREATE POLICY "audit_log_select_admin" ON "public"."audit_log" FOR SELECT USING (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids_with_role"(ARRAY['admin'::"text"]) AS "accessible_tenant_ids_with_role")));



CREATE POLICY "aval_insert_tenant" ON "public"."atendimento_avaliacoes" FOR INSERT WITH CHECK (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids")));



CREATE POLICY "aval_select_tenant" ON "public"."atendimento_avaliacoes" FOR SELECT USING (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids")));



CREATE POLICY "aval_update_admin" ON "public"."atendimento_avaliacoes" FOR UPDATE USING ("public"."has_rbac_role_in_hierarchy"("tenant_id", ARRAY['admin'::"text", 'dev'::"text", 'atendimento'::"text"]));



ALTER TABLE "public"."avaliacao_config" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."avaliacoes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "avaliacoes_cfg_insert_tenant" ON "public"."avaliacoes_loja_config" FOR INSERT WITH CHECK (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids")));



CREATE POLICY "avaliacoes_cfg_select_tenant" ON "public"."avaliacoes_loja_config" FOR SELECT USING (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids")));



CREATE POLICY "avaliacoes_cfg_update_tenant" ON "public"."avaliacoes_loja_config" FOR UPDATE USING (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids")));



CREATE POLICY "avaliacoes_insert_tenant" ON "public"."avaliacoes" FOR INSERT WITH CHECK (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids")));



ALTER TABLE "public"."avaliacoes_loja_config" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "avaliacoes_select_tenant" ON "public"."avaliacoes" FOR SELECT USING (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids")));



CREATE POLICY "avaliacoes_update_tenant" ON "public"."avaliacoes" FOR UPDATE USING (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids")));



ALTER TABLE "public"."bom_dia_config" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "bom_dia_config_insert_admin_marketing" ON "public"."bom_dia_config" FOR INSERT WITH CHECK (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids_with_role"(ARRAY['admin'::"text", 'marketing'::"text"]) AS "accessible_tenant_ids_with_role")));



CREATE POLICY "bom_dia_config_select_tenant" ON "public"."bom_dia_config" FOR SELECT USING (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids")));



CREATE POLICY "bom_dia_config_update_admin_marketing" ON "public"."bom_dia_config" FOR UPDATE USING (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids_with_role"(ARRAY['admin'::"text", 'marketing'::"text"]) AS "accessible_tenant_ids_with_role")));



ALTER TABLE "public"."bom_dia_feedback" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."bot_configs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."bot_reply_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."breno_interactions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "breno_interactions_tenant" ON "public"."breno_interactions" USING (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids")));



ALTER TABLE "public"."breno_message_buffer" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."breno_triagem" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."campanha_ativos" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."campanhas" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."channel_members" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."channel_messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."chat_tasks" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "chat_tasks_tenant_isolation" ON "public"."chat_tasks" USING (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids"))) WITH CHECK (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids")));



ALTER TABLE "public"."client_facts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "client_facts_delete_admin" ON "public"."client_facts" FOR DELETE USING (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids_with_role"(ARRAY['admin'::"text"]) AS "accessible_tenant_ids_with_role")));



CREATE POLICY "client_facts_insert_tenant" ON "public"."client_facts" FOR INSERT WITH CHECK (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids")));



CREATE POLICY "client_facts_select_tenant" ON "public"."client_facts" FOR SELECT USING (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids")));



CREATE POLICY "client_facts_update_tenant" ON "public"."client_facts" FOR UPDATE USING (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids")));



ALTER TABLE "public"."client_tasks" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "client_tasks_tenant_isolation" ON "public"."client_tasks" TO "authenticated" USING (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids"))) WITH CHECK (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids")));



ALTER TABLE "public"."client_timeline" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "client_timeline_insert_tenant" ON "public"."client_timeline" FOR INSERT WITH CHECK (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids")));



CREATE POLICY "client_timeline_select_tenant" ON "public"."client_timeline" FOR SELECT USING (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids")));



ALTER TABLE "public"."cobranca_eventos" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "cobranca_eventos_insert" ON "public"."cobranca_eventos" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."cobrancas" "c"
  WHERE (("c"."id" = "cobranca_eventos"."cobranca_id") AND ("c"."tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids"))))));



CREATE POLICY "cobranca_eventos_select" ON "public"."cobranca_eventos" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."cobrancas" "c"
  WHERE (("c"."id" = "cobranca_eventos"."cobranca_id") AND ("c"."tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids"))))));



ALTER TABLE "public"."cobrancas" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "cobrancas_tenant_isolation" ON "public"."cobrancas" USING (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids"))) WITH CHECK (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids")));



ALTER TABLE "public"."contact_optout" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "contact_optout_tenant_isolation" ON "public"."contact_optout" USING (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids")));



ALTER TABLE "public"."contact_tags" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."contatos" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "contatos_tenant" ON "public"."contatos" USING (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids"))) WITH CHECK (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids")));



ALTER TABLE "public"."content_calendar" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."content_drafts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."content_published" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."contratos" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."conversation_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."conversation_status_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."conversation_tags" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."conversations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "conversations_delete_admin" ON "public"."conversations" FOR DELETE USING (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids_with_role"(ARRAY['admin'::"text"]) AS "accessible_tenant_ids_with_role")));



CREATE POLICY "conversations_insert_tenant" ON "public"."conversations" FOR INSERT WITH CHECK (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids")));



CREATE POLICY "conversations_member_all" ON "public"."conversations" USING ("public"."is_member_of"("tenant_id")) WITH CHECK ("public"."is_member_of"("tenant_id"));



CREATE POLICY "conversations_select_tenant" ON "public"."conversations" FOR SELECT USING (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids")));



CREATE POLICY "conversations_update_tenant" ON "public"."conversations" FOR UPDATE USING (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids")));



ALTER TABLE "public"."cora_acoes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "cora_acoes_tenant" ON "public"."cora_acoes" USING (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids")));



ALTER TABLE "public"."cora_cobrancas" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "cora_cobrancas_tenant" ON "public"."cora_cobrancas" USING (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids")));



ALTER TABLE "public"."cora_reguas" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "cora_reguas_tenant" ON "public"."cora_reguas" USING (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids")));



ALTER TABLE "public"."crm_notas" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "crm_notas_delete" ON "public"."crm_notas" FOR DELETE USING ("public"."is_member_of"("tenant_id"));



CREATE POLICY "crm_notas_insert" ON "public"."crm_notas" FOR INSERT WITH CHECK ("public"."is_member_of"("tenant_id"));



CREATE POLICY "crm_notas_select" ON "public"."crm_notas" FOR SELECT USING ("public"."is_member_of"("tenant_id"));



CREATE POLICY "crm_notas_update" ON "public"."crm_notas" FOR UPDATE USING ("public"."is_member_of"("tenant_id")) WITH CHECK ("public"."is_member_of"("tenant_id"));



ALTER TABLE "public"."crm_webhook_tokens" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "crm_webhook_tokens_tenant_members" ON "public"."crm_webhook_tokens" TO "authenticated" USING (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids"))) WITH CHECK (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids")));



ALTER TABLE "public"."custom_field_values" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."custom_fields" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."customer_addresses" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."customer_group_members" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "customer_group_members_select" ON "public"."customer_group_members" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."customers" "c"
  WHERE (("c"."id" = "customer_group_members"."customer_id") AND "public"."is_member_of"("c"."tenant_id")))));



CREATE POLICY "customer_group_members_write" ON "public"."customer_group_members" USING ((EXISTS ( SELECT 1
   FROM "public"."customers" "c"
  WHERE (("c"."id" = "customer_group_members"."customer_id") AND "public"."is_admin_of"("c"."tenant_id"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."customers" "c"
  WHERE (("c"."id" = "customer_group_members"."customer_id") AND "public"."is_admin_of"("c"."tenant_id")))));



ALTER TABLE "public"."customer_groups" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "customer_groups_select" ON "public"."customer_groups" FOR SELECT USING ((("tenant_id" IS NOT NULL) AND "public"."is_member_of"("tenant_id")));



CREATE POLICY "customer_groups_write" ON "public"."customer_groups" USING ((("tenant_id" IS NOT NULL) AND "public"."is_admin_of"("tenant_id"))) WITH CHECK ((("tenant_id" IS NOT NULL) AND "public"."is_admin_of"("tenant_id")));



ALTER TABLE "public"."customer_note_entries" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."customer_notes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."customer_tag_relations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."customer_tags" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."customers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "customers_member_all" ON "public"."customers" USING ("public"."is_member_of"("tenant_id")) WITH CHECK ("public"."is_member_of"("tenant_id"));



ALTER TABLE "public"."daily_kpis" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "daily_kpis_member_select" ON "public"."daily_kpis" FOR SELECT USING ("public"."is_member_of"("tenant_id"));



ALTER TABLE "public"."defesa_aprovadores" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "defesa_aprovadores_delete" ON "public"."defesa_aprovadores" FOR DELETE USING ("public"."is_member_of"("tenant_id"));



CREATE POLICY "defesa_aprovadores_insert" ON "public"."defesa_aprovadores" FOR INSERT WITH CHECK ("public"."is_member_of"("tenant_id"));



CREATE POLICY "defesa_aprovadores_select" ON "public"."defesa_aprovadores" FOR SELECT USING ("public"."is_member_of"("tenant_id"));



CREATE POLICY "defesa_aprovadores_update" ON "public"."defesa_aprovadores" FOR UPDATE USING ("public"."is_member_of"("tenant_id")) WITH CHECK ("public"."is_member_of"("tenant_id"));



ALTER TABLE "public"."defesa_assinaturas" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "defesa_assinaturas_insert_admin" ON "public"."defesa_assinaturas" FOR INSERT WITH CHECK ("public"."is_admin_of"("tenant_id"));



CREATE POLICY "defesa_assinaturas_select" ON "public"."defesa_assinaturas" FOR SELECT USING ("public"."is_member_of"("tenant_id"));



ALTER TABLE "public"."defesa_casos" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "defesa_casos_insert" ON "public"."defesa_casos" FOR INSERT WITH CHECK ("public"."is_member_of"("tenant_id"));



CREATE POLICY "defesa_casos_select" ON "public"."defesa_casos" FOR SELECT USING ("public"."is_member_of"("tenant_id"));



CREATE POLICY "defesa_casos_update" ON "public"."defesa_casos" FOR UPDATE USING ("public"."is_member_of"("tenant_id")) WITH CHECK ("public"."is_member_of"("tenant_id"));



CREATE POLICY "deletar_anexos_tenant" ON "public"."tarefa_anexos" FOR DELETE USING ((("uploaded_by" = "auth"."uid"()) OR ("tenant_id" IN ( SELECT "public"."accessible_tenant_ids_with_role"(ARRAY['admin'::"text", 'dev'::"text"]) AS "accessible_tenant_ids_with_role"))));



ALTER TABLE "public"."deli_actions_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."deli_agenda" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "deli_approvals_insert_tenant" ON "public"."deli_pending_approvals" FOR INSERT WITH CHECK (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids")));



CREATE POLICY "deli_approvals_select_tenant" ON "public"."deli_pending_approvals" FOR SELECT USING (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids")));



CREATE POLICY "deli_approvals_update_deli_owner" ON "public"."deli_pending_approvals" FOR UPDATE USING (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids_with_role"(ARRAY['admin'::"text", 'deli_owner'::"text"]) AS "accessible_tenant_ids_with_role")));



CREATE POLICY "deli_log_insert_authenticated" ON "public"."deli_actions_log" FOR INSERT WITH CHECK (("auth"."uid"() IS NOT NULL));



CREATE POLICY "deli_log_select_tenant" ON "public"."deli_actions_log" FOR SELECT USING (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids")));



ALTER TABLE "public"."deli_messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."deli_pending_approvals" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."deli_triggers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "deli_triggers_manage_admin" ON "public"."deli_triggers" USING (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids_with_role"(ARRAY['admin'::"text"]) AS "accessible_tenant_ids_with_role")));



CREATE POLICY "deli_triggers_select_tenant" ON "public"."deli_triggers" FOR SELECT USING (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids")));



ALTER TABLE "public"."department_members" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."departments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "drafts_insert_tenant" ON "public"."agent_drafts" FOR INSERT WITH CHECK (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids")));



CREATE POLICY "drafts_select_tenant" ON "public"."agent_drafts" FOR SELECT USING (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids")));



CREATE POLICY "drafts_update_tenant" ON "public"."agent_drafts" FOR UPDATE USING (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids"))) WITH CHECK ((("tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids")) AND ((("status" IS DISTINCT FROM 'approved'::"text") AND ("status" IS DISTINCT FROM 'rejected'::"text")) OR ("tenant_id" IN ( SELECT "public"."accessible_tenant_ids_with_role"(ARRAY['admin'::"text", 'owner'::"text", 'deli_owner'::"text"]) AS "accessible_tenant_ids_with_role")))));



ALTER TABLE "public"."encerramento_config" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "encerramento_config_insert_admin_marketing" ON "public"."encerramento_config" FOR INSERT WITH CHECK (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids_with_role"(ARRAY['admin'::"text", 'marketing'::"text"]) AS "accessible_tenant_ids_with_role")));



CREATE POLICY "encerramento_config_select_tenant" ON "public"."encerramento_config" FOR SELECT USING (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids")));



CREATE POLICY "encerramento_config_update_admin_marketing" ON "public"."encerramento_config" FOR UPDATE USING (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids_with_role"(ARRAY['admin'::"text", 'marketing'::"text"]) AS "accessible_tenant_ids_with_role")));



ALTER TABLE "public"."espacos_columns" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "espacos_columns_tenant_isolation" ON "public"."espacos_columns" TO "authenticated" USING (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids"))) WITH CHECK (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids")));



ALTER TABLE "public"."espacos_folders" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "espacos_folders_tenant_isolation" ON "public"."espacos_folders" TO "authenticated" USING (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids"))) WITH CHECK (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids")));



ALTER TABLE "public"."espacos_lists" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "espacos_lists_tenant_isolation" ON "public"."espacos_lists" TO "authenticated" USING (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids"))) WITH CHECK (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids")));



ALTER TABLE "public"."espacos_workspaces" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "espacos_workspaces_tenant_isolation" ON "public"."espacos_workspaces" USING (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids"))) WITH CHECK (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids")));



ALTER TABLE "public"."estudio_criacoes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "estudio_criacoes_insert" ON "public"."estudio_criacoes" FOR INSERT WITH CHECK (("public"."is_member_of"("tenant_id") AND ("status" = 'fila'::"text")));



CREATE POLICY "estudio_criacoes_select" ON "public"."estudio_criacoes" FOR SELECT USING ("public"."is_member_of"("tenant_id"));



CREATE POLICY "estudio_criacoes_update" ON "public"."estudio_criacoes" FOR UPDATE USING (("public"."is_member_of"("tenant_id") AND ("status" = 'pronto'::"text"))) WITH CHECK (("public"."is_member_of"("tenant_id") AND ("status" = 'aprovado'::"text")));



ALTER TABLE "public"."evolution_instances" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "evolution_instances_manage_admin" ON "public"."evolution_instances" USING ("public"."is_admin_of"("tenant_id"));



CREATE POLICY "evolution_instances_select_own_tenant" ON "public"."evolution_instances" FOR SELECT USING (("tenant_id" IN ( SELECT "r"."tenant_id"
   FROM ("public"."user_roles" "ur"
     JOIN "public"."roles" "r" ON (("r"."id" = "ur"."role_id")))
  WHERE ("ur"."user_id" = "auth"."uid"()))));



CREATE POLICY "evolution_instances_select_tenant" ON "public"."evolution_instances" FOR SELECT USING (("id" IN ( SELECT DISTINCT "conversations"."instance_id"
   FROM "public"."conversations"
  WHERE (("conversations"."tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids")) AND ("conversations"."instance_id" IS NOT NULL)))));



ALTER TABLE "public"."goal_tasks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."goals" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."heartbeat_runs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."heartbeats" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ifood_merchants" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."inadimplencia_messages" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "inadimplencia_messages_member_all" ON "public"."inadimplencia_messages" USING ("public"."is_member_of"("tenant_id")) WITH CHECK ("public"."is_member_of"("tenant_id"));



ALTER TABLE "public"."inadimplencias" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "inadimplencias_member_all" ON "public"."inadimplencias" USING ("public"."is_member_of"("tenant_id")) WITH CHECK ("public"."is_member_of"("tenant_id"));



CREATE POLICY "inserir_anexos_tenant" ON "public"."tarefa_anexos" FOR INSERT WITH CHECK (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids")));



ALTER TABLE "public"."internal_channels" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."internal_notifications" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "internal_notifications_select" ON "public"."internal_notifications" FOR SELECT USING ((("recipient_user_id" = "auth"."uid"()) OR (("recipient_user_id" IS NULL) AND ("tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids")))));



CREATE POLICY "internal_notifications_update_own" ON "public"."internal_notifications" FOR UPDATE USING ((("recipient_user_id" = "auth"."uid"()) OR (("recipient_user_id" IS NULL) AND ("tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids"))))) WITH CHECK ((("recipient_user_id" = "auth"."uid"()) OR (("recipient_user_id" IS NULL) AND ("tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids")))));



CREATE POLICY "knowledge_base_tenant" ON "public"."agent_knowledge_base" USING (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids")));



CREATE POLICY "lara_calendar_tenant" ON "public"."content_calendar" USING (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids")));



CREATE POLICY "lara_drafts_tenant" ON "public"."content_drafts" USING (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids")));



CREATE POLICY "lara_published_tenant" ON "public"."content_published" USING (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids")));



ALTER TABLE "public"."lead_list_members" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."lead_lists" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."lead_tags" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."leads" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "leads_tenant_isolation" ON "public"."leads" USING (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids"))) WITH CHECK (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids")));



CREATE POLICY "lgc_insert" ON "public"."loja_gpt_conversations" FOR INSERT WITH CHECK (("iniciada_por" = "auth"."uid"()));



CREATE POLICY "lgc_select" ON "public"."loja_gpt_conversations" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."lojas" "l"
  WHERE (("l"."id" = "loja_gpt_conversations"."loja_id") AND ("l"."tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids"))))));



CREATE POLICY "lgc_update" ON "public"."loja_gpt_conversations" FOR UPDATE USING ((("iniciada_por" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."lojas" "l"
  WHERE (("l"."id" = "loja_gpt_conversations"."loja_id") AND ("l"."tenant_id" IN ( SELECT "public"."accessible_tenant_ids_with_role"(ARRAY['admin'::"text"]) AS "accessible_tenant_ids_with_role")))))));



CREATE POLICY "lgm_select" ON "public"."loja_gpt_messages" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."loja_gpt_conversations" "c"
     JOIN "public"."lojas" "l" ON (("l"."id" = "c"."loja_id")))
  WHERE (("c"."id" = "loja_gpt_messages"."conversation_id") AND ("l"."tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids"))))));



ALTER TABLE "public"."loja_consultores" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."loja_gpt_conversations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."loja_gpt_messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."loja_metricas" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "loja_metricas_delete_admin" ON "public"."loja_metricas" FOR DELETE USING (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids_with_role"(ARRAY['admin'::"text"]) AS "accessible_tenant_ids_with_role")));



CREATE POLICY "loja_metricas_insert_tenant" ON "public"."loja_metricas" FOR INSERT WITH CHECK (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids")));



CREATE POLICY "loja_metricas_select_tenant" ON "public"."loja_metricas" FOR SELECT USING (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids")));



ALTER TABLE "public"."loja_metricas_snapshot" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "loja_metricas_update_tenant" ON "public"."loja_metricas" FOR UPDATE USING (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids")));



ALTER TABLE "public"."loja_whatsapp_vinculo" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."lojas" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "lojas_delete_admin" ON "public"."lojas" FOR DELETE USING (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids_with_role"(ARRAY['admin'::"text"]) AS "accessible_tenant_ids_with_role")));



CREATE POLICY "lojas_insert_tenant" ON "public"."lojas" FOR INSERT WITH CHECK (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids")));



CREATE POLICY "lojas_select_tenant" ON "public"."lojas" FOR SELECT USING (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids")));



CREATE POLICY "lojas_update_tenant" ON "public"."lojas" FOR UPDATE USING (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids")));



CREATE POLICY "lwv_tenant_isolation" ON "public"."loja_whatsapp_vinculo" USING (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids")));



ALTER TABLE "public"."marca_pesquisa" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "max_kb_select" ON "public"."max_knowledge_base" FOR SELECT USING ((("tenant_id" IS NULL) OR ("tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids"))));



CREATE POLICY "max_kb_write" ON "public"."max_knowledge_base" USING (((("tenant_id" IS NULL) AND (EXISTS ( SELECT 1
   FROM "public"."tenant_members"
  WHERE (("tenant_members"."user_id" = "auth"."uid"()) AND ("tenant_members"."role" = ANY (ARRAY['admin'::"text", 'owner'::"text", 'deli_owner'::"text"])))))) OR (("tenant_id" IS NOT NULL) AND ("tenant_id" IN ( SELECT "public"."accessible_tenant_ids_with_role"(ARRAY['admin'::"text", 'owner'::"text", 'deli_owner'::"text"]) AS "accessible_tenant_ids_with_role"))))) WITH CHECK (((("tenant_id" IS NULL) AND (EXISTS ( SELECT 1
   FROM "public"."tenant_members"
  WHERE (("tenant_members"."user_id" = "auth"."uid"()) AND ("tenant_members"."role" = ANY (ARRAY['admin'::"text", 'owner'::"text", 'deli_owner'::"text"])))))) OR (("tenant_id" IS NOT NULL) AND ("tenant_id" IN ( SELECT "public"."accessible_tenant_ids_with_role"(ARRAY['admin'::"text", 'owner'::"text", 'deli_owner'::"text"]) AS "accessible_tenant_ids_with_role")))));



ALTER TABLE "public"."max_knowledge_base" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "members can insert sugestoes" ON "public"."sugestoes_plataforma" FOR INSERT WITH CHECK (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids")));



CREATE POLICY "members can manage agent_corrections" ON "public"."agent_corrections" USING (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids"))) WITH CHECK (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids")));



CREATE POLICY "members can manage analises" ON "public"."analises" USING (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids")));



CREATE POLICY "members can read sugestoes" ON "public"."sugestoes_plataforma" FOR SELECT USING (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids")));



CREATE POLICY "members can update conversation status" ON "public"."conversations" FOR UPDATE USING (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids"))) WITH CHECK (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids")));



ALTER TABLE "public"."messages" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "messages_auth_all" ON "public"."messages" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "messages_insert_tenant" ON "public"."messages" FOR INSERT WITH CHECK (((("tenant_id" IS NOT NULL) AND ("tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids"))) OR (("tenant_id" IS NULL) AND ("conversation_id" IN ( SELECT "conversations"."id"
   FROM "public"."conversations"
  WHERE ("conversations"."tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids")))))));



CREATE POLICY "messages_member_all" ON "public"."messages" USING ("public"."is_member_of"("tenant_id")) WITH CHECK ("public"."is_member_of"("tenant_id"));



CREATE POLICY "messages_select_tenant" ON "public"."messages" FOR SELECT USING (((("tenant_id" IS NOT NULL) AND ("tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids"))) OR (("tenant_id" IS NULL) AND ("conversation_id" IN ( SELECT "conversations"."id"
   FROM "public"."conversations"
  WHERE ("conversations"."tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids")))))));



CREATE POLICY "messages_update_tenant" ON "public"."messages" FOR UPDATE USING (((("tenant_id" IS NOT NULL) AND ("tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids"))) OR (("tenant_id" IS NULL) AND ("conversation_id" IN ( SELECT "conversations"."id"
   FROM "public"."conversations"
  WHERE ("conversations"."tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids")))))));



ALTER TABLE "public"."mia_analises" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "mia_analises_tenant" ON "public"."mia_analises" USING (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids")));



ALTER TABLE "public"."mia_audit_log" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "mia_audit_tenant_isolation" ON "public"."mia_audit_log" FOR SELECT USING (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids")));



ALTER TABLE "public"."missions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."nexus_requests" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "note_entries_tenant" ON "public"."customer_note_entries" USING (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids"))) WITH CHECK (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids")));



ALTER TABLE "public"."notification_preferences" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."nova_blueprints" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "nova_blueprints_tenant" ON "public"."nova_blueprints" USING (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids")));



CREATE POLICY "nps_aval_insert_tenant" ON "public"."nps_avaliacoes" FOR INSERT WITH CHECK (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids")));



CREATE POLICY "nps_aval_select_tenant" ON "public"."nps_avaliacoes" FOR SELECT USING (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids")));



CREATE POLICY "nps_aval_update_tenant" ON "public"."nps_avaliacoes" FOR UPDATE USING (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids")));



ALTER TABLE "public"."nps_avaliacoes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."onboarding_checklists" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "onboarding_checklists_tenant_isolation" ON "public"."onboarding_checklists" TO "authenticated" USING (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids"))) WITH CHECK (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids")));



ALTER TABLE "public"."onboarding_templates" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "onboarding_templates_see_own_or_global" ON "public"."onboarding_templates" FOR SELECT TO "authenticated" USING ((("tenant_id" IS NULL) OR ("tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids"))));



ALTER TABLE "public"."onboarding_wizard_sessions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."oracle_drafts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "oracle_drafts_insert_member" ON "public"."oracle_drafts" FOR INSERT WITH CHECK (("public"."is_member_of"("tenant_id") AND ("created_by" = "auth"."uid"()) AND ("status" = 'pendente'::"text")));



CREATE POLICY "oracle_drafts_select_member" ON "public"."oracle_drafts" FOR SELECT USING ("public"."is_member_of"("tenant_id"));



CREATE POLICY "oracle_drafts_update_admin" ON "public"."oracle_drafts" FOR UPDATE USING ("public"."is_admin_of"("tenant_id")) WITH CHECK ("public"."is_admin_of"("tenant_id"));



ALTER TABLE "public"."orders" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "orders_member_all" ON "public"."orders" USING ("public"."is_member_of"("tenant_id")) WITH CHECK ("public"."is_member_of"("tenant_id"));



ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profiles_select_own" ON "public"."profiles" FOR SELECT USING (("id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "profiles_update_own" ON "public"."profiles" FOR UPDATE USING (("id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."projects" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."prospect_abordagens" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "prospect_abordagens_select" ON "public"."prospect_abordagens" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."prospects" "p"
  WHERE (("p"."id" = "prospect_abordagens"."prospect_id") AND ("p"."tenant_id" IN ( SELECT "public"."accessible_tenant_ids_with_role"(ARRAY['admin'::"text", 'marketing'::"text", 'dev'::"text", 'viewer'::"text"]) AS "accessible_tenant_ids_with_role"))))));



CREATE POLICY "prospect_abordagens_write" ON "public"."prospect_abordagens" USING ((EXISTS ( SELECT 1
   FROM "public"."prospects" "p"
  WHERE (("p"."id" = "prospect_abordagens"."prospect_id") AND ("p"."tenant_id" IN ( SELECT "public"."accessible_tenant_ids_with_role"(ARRAY['admin'::"text", 'marketing'::"text", 'dev'::"text"]) AS "accessible_tenant_ids_with_role")))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."prospects" "p"
  WHERE (("p"."id" = "prospect_abordagens"."prospect_id") AND ("p"."tenant_id" IN ( SELECT "public"."accessible_tenant_ids_with_role"(ARRAY['admin'::"text", 'marketing'::"text", 'dev'::"text"]) AS "accessible_tenant_ids_with_role"))))));



ALTER TABLE "public"."prospect_pesquisas" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "prospect_pesquisas_select" ON "public"."prospect_pesquisas" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."prospects" "p"
  WHERE (("p"."id" = "prospect_pesquisas"."prospect_id") AND ("p"."tenant_id" IN ( SELECT "public"."accessible_tenant_ids_with_role"(ARRAY['admin'::"text", 'marketing'::"text", 'dev'::"text", 'viewer'::"text"]) AS "accessible_tenant_ids_with_role"))))));



CREATE POLICY "prospect_pesquisas_write" ON "public"."prospect_pesquisas" USING ((EXISTS ( SELECT 1
   FROM "public"."prospects" "p"
  WHERE (("p"."id" = "prospect_pesquisas"."prospect_id") AND ("p"."tenant_id" IN ( SELECT "public"."accessible_tenant_ids_with_role"(ARRAY['admin'::"text", 'marketing'::"text", 'dev'::"text"]) AS "accessible_tenant_ids_with_role")))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."prospects" "p"
  WHERE (("p"."id" = "prospect_pesquisas"."prospect_id") AND ("p"."tenant_id" IN ( SELECT "public"."accessible_tenant_ids_with_role"(ARRAY['admin'::"text", 'marketing'::"text", 'dev'::"text"]) AS "accessible_tenant_ids_with_role"))))));



ALTER TABLE "public"."prospects" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "prospects_select_tenant_roles" ON "public"."prospects" FOR SELECT USING (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids_with_role"(ARRAY['admin'::"text", 'marketing'::"text", 'dev'::"text", 'viewer'::"text"]) AS "accessible_tenant_ids_with_role")));



CREATE POLICY "prospects_write_tenant_roles" ON "public"."prospects" USING (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids_with_role"(ARRAY['admin'::"text", 'marketing'::"text", 'dev'::"text"]) AS "accessible_tenant_ids_with_role"))) WITH CHECK (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids_with_role"(ARRAY['admin'::"text", 'marketing'::"text", 'dev'::"text"]) AS "accessible_tenant_ids_with_role")));



ALTER TABLE "public"."push_subscriptions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "qr_tenant_select" ON "public"."quick_replies" FOR SELECT USING ((("tenant_id" IS NULL) OR ("tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids"))));



CREATE POLICY "qr_tenant_write" ON "public"."quick_replies" TO "authenticated" USING (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids"))) WITH CHECK (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids")));



ALTER TABLE "public"."quick_replies" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."radar_fontes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "radar_fontes_insert" ON "public"."radar_fontes" FOR INSERT WITH CHECK ("public"."is_member_of"("tenant_id"));



CREATE POLICY "radar_fontes_select" ON "public"."radar_fontes" FOR SELECT USING ("public"."is_member_of"("tenant_id"));



ALTER TABLE "public"."radar_metricas" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "radar_metricas_select" ON "public"."radar_metricas" FOR SELECT USING ("public"."is_member_of"("tenant_id"));



ALTER TABLE "public"."radar_series" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "radar_series_select" ON "public"."radar_series" FOR SELECT USING ("public"."is_member_of"("tenant_id"));



ALTER TABLE "public"."regua_cobranca" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "regua_cobranca_admin_delete" ON "public"."regua_cobranca" FOR DELETE USING ("public"."is_admin_of"("tenant_id"));



CREATE POLICY "regua_cobranca_admin_insert" ON "public"."regua_cobranca" FOR INSERT WITH CHECK ("public"."is_admin_of"("tenant_id"));



CREATE POLICY "regua_cobranca_admin_update" ON "public"."regua_cobranca" FOR UPDATE USING ("public"."is_admin_of"("tenant_id")) WITH CHECK ("public"."is_admin_of"("tenant_id"));



CREATE POLICY "regua_cobranca_select" ON "public"."regua_cobranca" FOR SELECT USING ("public"."is_member_of"("tenant_id"));



ALTER TABLE "public"."reguas" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."reviews" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."role_permissions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "role_permissions_manage_admin" ON "public"."role_permissions" USING ((EXISTS ( SELECT 1
   FROM "public"."roles" "r"
  WHERE (("r"."id" = "role_permissions"."role_id") AND ("r"."tenant_id" IN ( SELECT "public"."accessible_tenant_ids_with_role"(ARRAY['admin'::"text"]) AS "accessible_tenant_ids_with_role"))))));



CREATE POLICY "role_permissions_select_tenant" ON "public"."role_permissions" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."roles" "r"
  WHERE (("r"."id" = "role_permissions"."role_id") AND ("r"."tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids"))))));



ALTER TABLE "public"."roles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "roles_delete_admin" ON "public"."roles" FOR DELETE USING ((("is_system" = false) AND ("tenant_id" IN ( SELECT "public"."accessible_tenant_ids_with_role"(ARRAY['admin'::"text"]) AS "accessible_tenant_ids_with_role"))));



CREATE POLICY "roles_insert_admin" ON "public"."roles" FOR INSERT WITH CHECK (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids_with_role"(ARRAY['admin'::"text"]) AS "accessible_tenant_ids_with_role")));



CREATE POLICY "roles_select_tenant" ON "public"."roles" FOR SELECT USING (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids")));



CREATE POLICY "roles_update_admin" ON "public"."roles" FOR UPDATE USING (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids_with_role"(ARRAY['admin'::"text"]) AS "accessible_tenant_ids_with_role")));



CREATE POLICY "service role can insert deli_agenda" ON "public"."deli_agenda" FOR INSERT WITH CHECK (true);



CREATE POLICY "service_full_access" ON "public"."reviews" USING (true) WITH CHECK (true);



CREATE POLICY "service_role_full" ON "public"."breno_triagem" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "service_role_manage_agent_chat_messages" ON "public"."agent_chat_messages" USING (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "service_role_manage_deli_messages" ON "public"."deli_messages" USING (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "service_role_manage_memories" ON "public"."agent_memories" USING (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "service_role_manage_runs" ON "public"."agent_runs" USING (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "service_role_tarefa_revisoes" ON "public"."tarefa_revisoes" USING (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "sofia_leads_tenant" ON "public"."leads" USING (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids"))) WITH CHECK (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids")));



ALTER TABLE "public"."sugestoes_ia" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sugestoes_plataforma" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "sugestoes_tenant_isolation" ON "public"."sugestoes_ia" USING (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids")));



ALTER TABLE "public"."support_tickets" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tarefa_anexos" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tarefa_aprovacoes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tarefa_comentarios" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tarefa_prints" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tarefa_revisoes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tarefas_analise" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tarefas_analise_select" ON "public"."tarefas_analise" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."analises" "a"
  WHERE (("a"."id" = "tarefas_analise"."analise_id") AND "public"."is_member_of"("a"."tenant_id")))));



CREATE POLICY "tarefas_analise_write" ON "public"."tarefas_analise" USING ((EXISTS ( SELECT 1
   FROM "public"."analises" "a"
  WHERE (("a"."id" = "tarefas_analise"."analise_id") AND "public"."is_member_of"("a"."tenant_id"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."analises" "a"
  WHERE (("a"."id" = "tarefas_analise"."analise_id") AND "public"."is_member_of"("a"."tenant_id")))));



ALTER TABLE "public"."tarefas_loja" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."task_comments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "task_comments_member_all" ON "public"."task_comments" USING ("public"."is_member_of"("tenant_id")) WITH CHECK ("public"."is_member_of"("tenant_id"));



ALTER TABLE "public"."tasks" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tasks_member_all" ON "public"."tasks" USING ("public"."is_member_of"("tenant_id")) WITH CHECK ("public"."is_member_of"("tenant_id"));



ALTER TABLE "public"."templates" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "templates_select" ON "public"."templates" FOR SELECT USING ("public"."is_member_of"("tenant_id"));



ALTER TABLE "public"."templates_tarefa" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "templates_write" ON "public"."templates" USING ("public"."is_admin_of"("tenant_id")) WITH CHECK ("public"."is_admin_of"("tenant_id"));



CREATE POLICY "tenant bom_dia_feedback delete" ON "public"."bom_dia_feedback" FOR DELETE USING (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids")));



CREATE POLICY "tenant bom_dia_feedback insert" ON "public"."bom_dia_feedback" FOR INSERT WITH CHECK (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids")));



CREATE POLICY "tenant bom_dia_feedback select" ON "public"."bom_dia_feedback" FOR SELECT USING (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids")));



CREATE POLICY "tenant bom_dia_feedback update" ON "public"."bom_dia_feedback" FOR UPDATE USING (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids")));



CREATE POLICY "tenant members can manage client_tasks" ON "public"."client_tasks" USING (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids"))) WITH CHECK (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids")));



CREATE POLICY "tenant members can read bot_config" ON "public"."bot_configs" FOR SELECT USING (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids")));



CREATE POLICY "tenant members can read deli_agenda" ON "public"."deli_agenda" FOR SELECT USING (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids")));



CREATE POLICY "tenant members see tag relations" ON "public"."customer_tag_relations" USING (("customer_id" IN ( SELECT "customers"."id"
   FROM "public"."customers"
  WHERE ("customers"."tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids")))));



CREATE POLICY "tenant members see tags" ON "public"."contact_tags" USING (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids")));



CREATE POLICY "tenant_admin_manage_agent_config" ON "public"."tenant_agent_config" USING ("public"."is_admin_of"("tenant_id"));



CREATE POLICY "tenant_admin_write_avaliacao_config" ON "public"."avaliacao_config" USING ("public"."has_rbac_role_in_hierarchy"("tenant_id", ARRAY['admin'::"text", 'dev'::"text"]));



ALTER TABLE "public"."tenant_agent_config" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tenant_agents" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tenant_agents_admin_delete" ON "public"."tenant_agents" FOR DELETE USING ("public"."is_admin_of"("tenant_id"));



CREATE POLICY "tenant_agents_admin_insert" ON "public"."tenant_agents" FOR INSERT WITH CHECK ("public"."is_admin_of"("tenant_id"));



CREATE POLICY "tenant_agents_admin_update" ON "public"."tenant_agents" FOR UPDATE USING ("public"."is_admin_of"("tenant_id")) WITH CHECK ("public"."is_admin_of"("tenant_id"));



CREATE POLICY "tenant_agents_select" ON "public"."tenant_agents" FOR SELECT USING ("public"."is_member_of"("tenant_id"));



ALTER TABLE "public"."tenant_files" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tenant_files_delete" ON "public"."tenant_files" FOR DELETE USING ("public"."is_member_of"("tenant_id"));



CREATE POLICY "tenant_files_insert" ON "public"."tenant_files" FOR INSERT WITH CHECK ("public"."is_member_of"("tenant_id"));



CREATE POLICY "tenant_files_select" ON "public"."tenant_files" FOR SELECT USING ("public"."is_member_of"("tenant_id"));



CREATE POLICY "tenant_files_update" ON "public"."tenant_files" FOR UPDATE USING ("public"."is_member_of"("tenant_id")) WITH CHECK ("public"."is_member_of"("tenant_id"));



ALTER TABLE "public"."tenant_gatilhos" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tenant_gatilhos_delete" ON "public"."tenant_gatilhos" FOR DELETE USING ("public"."is_member_of"("tenant_id"));



CREATE POLICY "tenant_gatilhos_insert" ON "public"."tenant_gatilhos" FOR INSERT WITH CHECK ("public"."is_member_of"("tenant_id"));



CREATE POLICY "tenant_gatilhos_select" ON "public"."tenant_gatilhos" FOR SELECT USING ("public"."is_member_of"("tenant_id"));



CREATE POLICY "tenant_gatilhos_update" ON "public"."tenant_gatilhos" FOR UPDATE USING ("public"."is_member_of"("tenant_id")) WITH CHECK ("public"."is_member_of"("tenant_id"));



ALTER TABLE "public"."tenant_integracoes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tenant_integracoes_select" ON "public"."tenant_integracoes" FOR SELECT USING ("public"."is_member_of"("tenant_id"));



CREATE POLICY "tenant_isolation" ON "public"."bot_reply_log" USING (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids")));



CREATE POLICY "tenant_isolation" ON "public"."breno_message_buffer" USING (("tenant_id" = (( SELECT ("auth"."jwt"() ->> 'tenant_id'::"text")))::"uuid"));



CREATE POLICY "tenant_isolation" ON "public"."breno_triagem" USING (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids")));



CREATE POLICY "tenant_isolation" ON "public"."conversation_events" USING (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids")));



CREATE POLICY "tenant_isolation" ON "public"."conversation_status_log" USING (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids")));



CREATE POLICY "tenant_isolation" ON "public"."conversation_tags" USING ((EXISTS ( SELECT 1
   FROM "public"."lead_tags" "lt"
  WHERE (("lt"."id" = "conversation_tags"."tag_id") AND ("lt"."tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids"))))));



CREATE POLICY "tenant_isolation" ON "public"."customer_addresses" USING (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids")));



CREATE POLICY "tenant_isolation" ON "public"."customer_notes" USING (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids")));



CREATE POLICY "tenant_isolation" ON "public"."customer_tags" USING ((EXISTS ( SELECT 1
   FROM "public"."lead_tags" "lt"
  WHERE (("lt"."id" = "customer_tags"."tag_id") AND ("lt"."tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids"))))));



CREATE POLICY "tenant_isolation" ON "public"."department_members" USING ((EXISTS ( SELECT 1
   FROM "public"."departments" "d"
  WHERE (("d"."id" = "department_members"."department_id") AND ("d"."tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids"))))));



CREATE POLICY "tenant_isolation" ON "public"."departments" USING (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids")));



CREATE POLICY "tenant_isolation" ON "public"."goal_tasks" USING (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids")));



CREATE POLICY "tenant_isolation" ON "public"."goals" USING (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids")));



CREATE POLICY "tenant_isolation" ON "public"."heartbeat_runs" USING (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids")));



CREATE POLICY "tenant_isolation" ON "public"."heartbeats" USING (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids")));



CREATE POLICY "tenant_isolation" ON "public"."ifood_merchants" USING (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids"))) WITH CHECK (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids")));



CREATE POLICY "tenant_isolation" ON "public"."lead_list_members" USING ((EXISTS ( SELECT 1
   FROM "public"."lead_lists" "ll"
  WHERE (("ll"."id" = "lead_list_members"."list_id") AND ("ll"."tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids"))))));



CREATE POLICY "tenant_isolation" ON "public"."lead_lists" USING (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids")));



CREATE POLICY "tenant_isolation" ON "public"."lead_tags" USING (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids")));



CREATE POLICY "tenant_isolation" ON "public"."missions" USING (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids")));



CREATE POLICY "tenant_isolation" ON "public"."projects" USING (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids")));



CREATE POLICY "tenant_isolation_campanha_ativos" ON "public"."campanha_ativos" USING (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids")));



CREATE POLICY "tenant_isolation_campanhas" ON "public"."campanhas" USING (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids")));



CREATE POLICY "tenant_isolation_marca_pesquisa" ON "public"."marca_pesquisa" USING (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids")));



CREATE POLICY "tenant_isolation_nexus_requests" ON "public"."nexus_requests" USING (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids")));



CREATE POLICY "tenant_isolation_reguas" ON "public"."reguas" USING (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids")));



ALTER TABLE "public"."tenant_links" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tenant_links_delete" ON "public"."tenant_links" FOR DELETE USING ("public"."is_member_of"("tenant_id"));



CREATE POLICY "tenant_links_insert" ON "public"."tenant_links" FOR INSERT WITH CHECK ("public"."is_member_of"("tenant_id"));



CREATE POLICY "tenant_links_select" ON "public"."tenant_links" FOR SELECT USING ("public"."is_member_of"("tenant_id"));



CREATE POLICY "tenant_links_update" ON "public"."tenant_links" FOR UPDATE USING ("public"."is_member_of"("tenant_id")) WITH CHECK ("public"."is_member_of"("tenant_id"));



CREATE POLICY "tenant_member_custom_field_values" ON "public"."custom_field_values" USING (("custom_field_id" IN ( SELECT "custom_fields"."id"
   FROM "public"."custom_fields"
  WHERE ("custom_fields"."tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids")))));



CREATE POLICY "tenant_member_custom_fields" ON "public"."custom_fields" USING (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids")));



CREATE POLICY "tenant_member_read_avaliacao_config" ON "public"."avaliacao_config" FOR SELECT USING (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids")));



ALTER TABLE "public"."tenant_members" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tenant_members_admin_delete" ON "public"."tenant_members" FOR DELETE USING ("public"."is_admin_of"("tenant_id"));



CREATE POLICY "tenant_members_admin_insert" ON "public"."tenant_members" FOR INSERT WITH CHECK ("public"."is_admin_of"("tenant_id"));



CREATE POLICY "tenant_members_admin_update" ON "public"."tenant_members" FOR UPDATE USING ("public"."is_admin_of"("tenant_id")) WITH CHECK ("public"."is_admin_of"("tenant_id"));



CREATE POLICY "tenant_members_insert_agent_chat_messages" ON "public"."agent_chat_messages" FOR INSERT WITH CHECK (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids")));



CREATE POLICY "tenant_members_select" ON "public"."tenant_members" FOR SELECT USING ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) OR "public"."is_admin_of"("tenant_id")));



CREATE POLICY "tenant_members_select_agent_chat_messages" ON "public"."agent_chat_messages" FOR SELECT USING (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids")));



CREATE POLICY "tenant_members_self_insert" ON "public"."tenant_members" FOR INSERT WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "tenant_members_view_memories" ON "public"."agent_memories" FOR SELECT USING (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids")));



CREATE POLICY "tenant_members_view_own_deli_messages" ON "public"."deli_messages" FOR SELECT USING (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids")));



CREATE POLICY "tenant_members_view_own_runs" ON "public"."agent_runs" FOR SELECT USING (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids")));



CREATE POLICY "tenant_members_view_tarefa_revisoes" ON "public"."tarefa_revisoes" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."tarefas_loja" "tl"
     JOIN "public"."lojas" "l" ON (("l"."id" = "tl"."loja_id")))
  WHERE (("tl"."id" = "tarefa_revisoes"."tarefa_id") AND ("l"."tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids"))))));



ALTER TABLE "public"."tenant_modules" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tenant_modules_delete_admin" ON "public"."tenant_modules" FOR DELETE USING (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids_with_role"(ARRAY['owner'::"text", 'admin'::"text"]) AS "accessible_tenant_ids_with_role")));



CREATE POLICY "tenant_modules_insert_admin" ON "public"."tenant_modules" FOR INSERT WITH CHECK (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids_with_role"(ARRAY['owner'::"text", 'admin'::"text"]) AS "accessible_tenant_ids_with_role")));



CREATE POLICY "tenant_modules_select_tenant" ON "public"."tenant_modules" FOR SELECT USING (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids")));



CREATE POLICY "tenant_modules_update_admin" ON "public"."tenant_modules" FOR UPDATE USING (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids_with_role"(ARRAY['owner'::"text", 'admin'::"text"]) AS "accessible_tenant_ids_with_role")));



CREATE POLICY "tenant_own" ON "public"."aceite_recontratacao" USING (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids")));



CREATE POLICY "tenant_own" ON "public"."asaas_eventos" USING (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids")));



CREATE POLICY "tenant_own" ON "public"."contratos" USING (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids")));



CREATE POLICY "tenant_own" ON "public"."support_tickets" USING (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids")));



CREATE POLICY "tenant_peers_see_profiles" ON "public"."profiles" FOR SELECT USING (("id" IN ( SELECT "tm"."user_id"
   FROM "public"."tenant_members" "tm"
  WHERE ("tm"."tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids")))));



ALTER TABLE "public"."tenant_provedores" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tenant_provedores_select" ON "public"."tenant_provedores" FOR SELECT USING ("public"."is_member_of"("tenant_id"));



CREATE POLICY "tenant_see_own_or_global" ON "public"."agent_prompts" FOR SELECT USING ((("tenant_id" IS NULL) OR ("tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids"))));



ALTER TABLE "public"."tenant_sistemas" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tenant_sistemas_select" ON "public"."tenant_sistemas" FOR SELECT USING ("public"."is_member_of"("tenant_id"));



ALTER TABLE "public"."tenant_tarefas" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tenant_tarefas_delete" ON "public"."tenant_tarefas" FOR DELETE USING ("public"."is_member_of"("tenant_id"));



CREATE POLICY "tenant_tarefas_insert" ON "public"."tenant_tarefas" FOR INSERT WITH CHECK ("public"."is_member_of"("tenant_id"));



CREATE POLICY "tenant_tarefas_select" ON "public"."tenant_tarefas" FOR SELECT USING ("public"."is_member_of"("tenant_id"));



CREATE POLICY "tenant_tarefas_update" ON "public"."tenant_tarefas" FOR UPDATE USING ("public"."is_member_of"("tenant_id")) WITH CHECK ("public"."is_member_of"("tenant_id"));



ALTER TABLE "public"."tenant_topicos" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tenant_topicos_delete" ON "public"."tenant_topicos" FOR DELETE USING ("public"."is_member_of"("tenant_id"));



CREATE POLICY "tenant_topicos_insert" ON "public"."tenant_topicos" FOR INSERT WITH CHECK ("public"."is_member_of"("tenant_id"));



CREATE POLICY "tenant_topicos_select" ON "public"."tenant_topicos" FOR SELECT USING ("public"."is_member_of"("tenant_id"));



CREATE POLICY "tenant_topicos_update" ON "public"."tenant_topicos" FOR UPDATE USING ("public"."is_member_of"("tenant_id")) WITH CHECK ("public"."is_member_of"("tenant_id"));



CREATE POLICY "tenant_write_campanha_ativos" ON "public"."campanha_ativos" TO "authenticated" USING (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids"))) WITH CHECK (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids")));



CREATE POLICY "tenant_write_campanhas" ON "public"."campanhas" TO "authenticated" USING (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids"))) WITH CHECK (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids")));



CREATE POLICY "tenant_write_marca_pesquisa" ON "public"."marca_pesquisa" TO "authenticated" USING (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids"))) WITH CHECK (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids")));



CREATE POLICY "tenant_write_nexus_requests" ON "public"."nexus_requests" TO "authenticated" USING (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids"))) WITH CHECK (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids")));



CREATE POLICY "tenant_write_reguas" ON "public"."reguas" TO "authenticated" USING (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids"))) WITH CHECK (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids")));



ALTER TABLE "public"."tenants" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tenants_delete_admin" ON "public"."tenants" FOR DELETE USING ("public"."is_admin_of"("id"));



CREATE POLICY "tenants_insert_authenticated" ON "public"."tenants" FOR INSERT WITH CHECK (("auth"."uid"() IS NOT NULL));



CREATE POLICY "tenants_select_member" ON "public"."tenants" FOR SELECT USING ("public"."is_member_of"("id"));



CREATE POLICY "tenants_update_admin" ON "public"."tenants" FOR UPDATE USING ("public"."is_admin_of"("id")) WITH CHECK ("public"."is_admin_of"("id"));



ALTER TABLE "public"."user_agent_access" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_agent_access_manage_admin" ON "public"."user_agent_access" TO "authenticated" USING ("public"."same_tenant_admin"("user_id")) WITH CHECK ("public"."same_tenant_admin"("user_id"));



CREATE POLICY "user_agent_access_self" ON "public"."user_agent_access" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "user_own_prefs" ON "public"."notification_preferences" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "user_own_subs" ON "public"."push_subscriptions" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "user_read_own_screen_perms" ON "public"."user_screen_permissions" FOR SELECT USING (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."user_roles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_roles_manage_admin" ON "public"."user_roles" USING ((EXISTS ( SELECT 1
   FROM "public"."roles" "r"
  WHERE (("r"."id" = "user_roles"."role_id") AND ("r"."tenant_id" IN ( SELECT "public"."accessible_tenant_ids_with_role"(ARRAY['admin'::"text"]) AS "accessible_tenant_ids_with_role"))))));



CREATE POLICY "user_roles_select_tenant" ON "public"."user_roles" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."roles" "r"
  WHERE (("r"."id" = "user_roles"."role_id") AND ("r"."tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids"))))));



ALTER TABLE "public"."user_screen_permissions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."val_desempenho_coleta" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "val_desempenho_read" ON "public"."val_desempenho_coleta" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."val_kpi_coleta_diaria" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "val_kpi_read" ON "public"."val_kpi_coleta_diaria" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."vendaerp_instances" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "vendaerp_instances_select" ON "public"."vendaerp_instances" FOR SELECT USING ("public"."is_member_of"("tenant_id"));



ALTER TABLE "public"."vendaerp_proposals" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "vendaerp_proposals_select" ON "public"."vendaerp_proposals" FOR SELECT USING ("public"."is_member_of"("tenant_id"));



CREATE POLICY "ver_anexos_tenant" ON "public"."tarefa_anexos" FOR SELECT USING (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids")));



ALTER TABLE "public"."vera_anomalias" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "vera_anomalias_select_tenant_members" ON "public"."vera_anomalias" FOR SELECT USING (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids")));



CREATE POLICY "vera_anomalias_service_role_all" ON "public"."vera_anomalias" USING (("auth"."role"() = 'service_role'::"text"));



ALTER TABLE "public"."vera_metricas_snapshot" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "vera_metricas_snapshot_select_tenant_members" ON "public"."vera_metricas_snapshot" FOR SELECT USING (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids")));



CREATE POLICY "vera_metricas_snapshot_service_role_all" ON "public"."vera_metricas_snapshot" USING (("auth"."role"() = 'service_role'::"text"));



ALTER TABLE "public"."vera_reports" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "vera_reports_select_tenant_members" ON "public"."vera_reports" FOR SELECT USING (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids")));



CREATE POLICY "vera_reports_service_role_all" ON "public"."vera_reports" USING (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "wa_contacts_insert_tenant" ON "public"."whatsapp_contacts" FOR INSERT WITH CHECK (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids")));



CREATE POLICY "wa_contacts_select_tenant" ON "public"."whatsapp_contacts" FOR SELECT USING (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids")));



CREATE POLICY "wa_contacts_update_tenant" ON "public"."whatsapp_contacts" FOR UPDATE USING (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids")));



CREATE POLICY "wa_group_members_manage_tenant" ON "public"."whatsapp_group_members" USING ((EXISTS ( SELECT 1
   FROM "public"."whatsapp_groups" "g"
  WHERE (("g"."id" = "whatsapp_group_members"."group_id") AND ("g"."tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids"))))));



CREATE POLICY "wa_group_members_select_tenant" ON "public"."whatsapp_group_members" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."whatsapp_groups" "g"
  WHERE (("g"."id" = "whatsapp_group_members"."group_id") AND ("g"."tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids"))))));



CREATE POLICY "wa_groups_insert_tenant" ON "public"."whatsapp_groups" FOR INSERT WITH CHECK (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids")));



CREATE POLICY "wa_groups_select_tenant" ON "public"."whatsapp_groups" FOR SELECT USING (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids")));



CREATE POLICY "wa_groups_update_admin_marketing" ON "public"."whatsapp_groups" FOR UPDATE USING (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids_with_role"(ARRAY['admin'::"text", 'marketing'::"text"]) AS "accessible_tenant_ids_with_role")));



CREATE POLICY "wa_messages_insert_tenant" ON "public"."whatsapp_messages" FOR INSERT WITH CHECK (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids")));



CREATE POLICY "wa_messages_select_tenant" ON "public"."whatsapp_messages" FOR SELECT USING (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids")));



CREATE POLICY "wa_messages_update_tenant" ON "public"."whatsapp_messages" FOR UPDATE USING (("tenant_id" IN ( SELECT "public"."accessible_tenant_ids"() AS "accessible_tenant_ids")));



ALTER TABLE "public"."whatsapp_aprovacao_sessions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."whatsapp_contacts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."whatsapp_group_members" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."whatsapp_groups" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."whatsapp_messages" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "wizard_sessions_authenticated_select" ON "public"."onboarding_wizard_sessions" FOR SELECT TO "authenticated" USING (true);





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."agent_chat_messages";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."agent_drafts";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."agent_runs";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."analises";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."breno_interactions";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."channel_messages";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."client_tasks";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."cobrancas";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."conversation_events";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."conversations";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."cora_acoes";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."cora_cobrancas";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."deli_messages";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."deli_pending_approvals";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."internal_notifications";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."messages";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."nova_blueprints";



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";


































































































































































GRANT ALL ON FUNCTION "public"."_slugify"("txt" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."_slugify"("txt" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_slugify"("txt" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."accessible_tenant_ids"() TO "anon";
GRANT ALL ON FUNCTION "public"."accessible_tenant_ids"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."accessible_tenant_ids"() TO "service_role";



GRANT ALL ON FUNCTION "public"."accessible_tenant_ids_with_role"("_roles" "text"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."accessible_tenant_ids_with_role"("_roles" "text"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."accessible_tenant_ids_with_role"("_roles" "text"[]) TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_get_tenant_modules"("p_tenant_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_get_tenant_modules"("p_tenant_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_get_tenant_modules"("p_tenant_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_is_platform_operator"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_is_platform_operator"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_set_tenant_modules"("p_tenant_id" "uuid", "p_modules" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_set_tenant_modules"("p_tenant_id" "uuid", "p_modules" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_set_tenant_modules"("p_tenant_id" "uuid", "p_modules" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."agent_enabled_for_user"("_agent" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."agent_enabled_for_user"("_agent" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."agent_enabled_for_user"("_agent" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_workspace"("p_name" "text", "p_slug" "text", "p_segment" "text", "p_emoji" "text", "p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."create_workspace"("p_name" "text", "p_slug" "text", "p_segment" "text", "p_emoji" "text", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_workspace"("p_name" "text", "p_slug" "text", "p_segment" "text", "p_emoji" "text", "p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."fn_avaliacao_config_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."fn_avaliacao_config_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_avaliacao_config_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."fn_conversation_status_changed"() TO "anon";
GRANT ALL ON FUNCTION "public"."fn_conversation_status_changed"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_conversation_status_changed"() TO "service_role";



GRANT ALL ON FUNCTION "public"."fn_log_conversation_status_change"() TO "anon";
GRANT ALL ON FUNCTION "public"."fn_log_conversation_status_change"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_log_conversation_status_change"() TO "service_role";



GRANT ALL ON FUNCTION "public"."fn_task_done_updates_goal"() TO "anon";
GRANT ALL ON FUNCTION "public"."fn_task_done_updates_goal"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_task_done_updates_goal"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_tenant_members"("p_tenant_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_tenant_members"("p_tenant_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_tenant_members"("p_tenant_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_screen_permissions"("p_tenant_id" "uuid", "p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_screen_permissions"("p_tenant_id" "uuid", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_screen_permissions"("p_tenant_id" "uuid", "p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."has_rbac_role_in_hierarchy"("_tenant" "uuid", "_role_names" "text"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."has_rbac_role_in_hierarchy"("_tenant" "uuid", "_role_names" "text"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_rbac_role_in_hierarchy"("_tenant" "uuid", "_role_names" "text"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."has_tenant_access"("_tenant" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."has_tenant_access"("_tenant" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_tenant_access"("_tenant" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_admin_of"("_tenant" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_admin_of"("_tenant" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin_of"("_tenant" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_member_of"("_tenant" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_member_of"("_tenant" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_member_of"("_tenant" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."log_audit"("p_tenant_id" "uuid", "p_action" "text", "p_resource" "text", "p_agent_name" "text", "p_metadata" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."log_audit"("p_tenant_id" "uuid", "p_action" "text", "p_resource" "text", "p_agent_name" "text", "p_metadata" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_audit"("p_tenant_id" "uuid", "p_action" "text", "p_resource" "text", "p_agent_name" "text", "p_metadata" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."notify_on_channel_message"() TO "anon";
GRANT ALL ON FUNCTION "public"."notify_on_channel_message"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."notify_on_channel_message"() TO "service_role";



GRANT ALL ON FUNCTION "public"."remove_tenant_member"("p_tenant_id" "uuid", "p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."remove_tenant_member"("p_tenant_id" "uuid", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."remove_tenant_member"("p_tenant_id" "uuid", "p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "anon";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "service_role";



GRANT ALL ON FUNCTION "public"."same_tenant_admin"("_target" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."same_tenant_admin"("_target" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."same_tenant_admin"("_target" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."seed_rbac_system_roles"("p_tenant_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."seed_rbac_system_roles"("p_tenant_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."seed_rbac_system_roles"("p_tenant_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."set_leads_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_leads_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_leads_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_user_screen_permission"("p_tenant_id" "uuid", "p_user_id" "uuid", "p_screen_id" "text", "p_allowed" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."set_user_screen_permission"("p_tenant_id" "uuid", "p_user_id" "uuid", "p_screen_id" "text", "p_allowed" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_user_screen_permission"("p_tenant_id" "uuid", "p_user_id" "uuid", "p_screen_id" "text", "p_allowed" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."tg_set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."tg_set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."tg_set_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."touch_lwv_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."touch_lwv_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."touch_lwv_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trg_audit_regua"() TO "anon";
GRANT ALL ON FUNCTION "public"."trg_audit_regua"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trg_audit_regua"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trg_auto_create_loja"() TO "anon";
GRANT ALL ON FUNCTION "public"."trg_auto_create_loja"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trg_auto_create_loja"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trg_auto_vinculo_grupo"() TO "anon";
GRANT ALL ON FUNCTION "public"."trg_auto_vinculo_grupo"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trg_auto_vinculo_grupo"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trg_fn_atend_aval_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."trg_fn_atend_aval_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trg_fn_atend_aval_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trg_fn_conv_department_changed"() TO "anon";
GRANT ALL ON FUNCTION "public"."trg_fn_conv_department_changed"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trg_fn_conv_department_changed"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trg_fn_conv_gen_avaliacao_token"() TO "anon";
GRANT ALL ON FUNCTION "public"."trg_fn_conv_gen_avaliacao_token"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trg_fn_conv_gen_avaliacao_token"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trg_fn_conv_gen_nps_token"() TO "anon";
GRANT ALL ON FUNCTION "public"."trg_fn_conv_gen_nps_token"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trg_fn_conv_gen_nps_token"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trg_fn_conv_status_changed"() TO "anon";
GRANT ALL ON FUNCTION "public"."trg_fn_conv_status_changed"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trg_fn_conv_status_changed"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trg_fn_nps_aval_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."trg_fn_nps_aval_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trg_fn_nps_aval_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trg_set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."trg_set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trg_set_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trg_set_updated_at_campanhas"() TO "anon";
GRANT ALL ON FUNCTION "public"."trg_set_updated_at_campanhas"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trg_set_updated_at_campanhas"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_lojas_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_lojas_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_lojas_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_member_display_name"("p_tenant_id" "uuid", "p_user_id" "uuid", "p_display_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."update_member_display_name"("p_tenant_id" "uuid", "p_user_id" "uuid", "p_display_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_member_display_name"("p_tenant_id" "uuid", "p_user_id" "uuid", "p_display_name" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_member_role"("p_tenant_id" "uuid", "p_user_id" "uuid", "p_new_role" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."update_member_role"("p_tenant_id" "uuid", "p_user_id" "uuid", "p_new_role" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_member_role"("p_tenant_id" "uuid", "p_user_id" "uuid", "p_new_role" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_prospects_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_prospects_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_prospects_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."validate_tenant_hierarchy"() TO "anon";
GRANT ALL ON FUNCTION "public"."validate_tenant_hierarchy"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."validate_tenant_hierarchy"() TO "service_role";


















GRANT ALL ON TABLE "public"."aceite_recontratacao" TO "anon";
GRANT ALL ON TABLE "public"."aceite_recontratacao" TO "authenticated";
GRANT ALL ON TABLE "public"."aceite_recontratacao" TO "service_role";



GRANT ALL ON TABLE "public"."agent_action_approvals" TO "anon";
GRANT ALL ON TABLE "public"."agent_action_approvals" TO "authenticated";
GRANT ALL ON TABLE "public"."agent_action_approvals" TO "service_role";



GRANT ALL ON TABLE "public"."agent_actions" TO "anon";
GRANT ALL ON TABLE "public"."agent_actions" TO "authenticated";
GRANT ALL ON TABLE "public"."agent_actions" TO "service_role";



GRANT ALL ON TABLE "public"."agent_chat_messages" TO "anon";
GRANT ALL ON TABLE "public"."agent_chat_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."agent_chat_messages" TO "service_role";



GRANT ALL ON TABLE "public"."agent_corrections" TO "anon";
GRANT ALL ON TABLE "public"."agent_corrections" TO "authenticated";
GRANT ALL ON TABLE "public"."agent_corrections" TO "service_role";



GRANT ALL ON TABLE "public"."agent_drafts" TO "anon";
GRANT ALL ON TABLE "public"."agent_drafts" TO "authenticated";
GRANT ALL ON TABLE "public"."agent_drafts" TO "service_role";



GRANT ALL ON TABLE "public"."agent_knowledge_base" TO "anon";
GRANT ALL ON TABLE "public"."agent_knowledge_base" TO "authenticated";
GRANT ALL ON TABLE "public"."agent_knowledge_base" TO "service_role";



GRANT ALL ON TABLE "public"."agent_memories" TO "anon";
GRANT ALL ON TABLE "public"."agent_memories" TO "authenticated";
GRANT ALL ON TABLE "public"."agent_memories" TO "service_role";



GRANT ALL ON TABLE "public"."agent_prompts" TO "anon";
GRANT ALL ON TABLE "public"."agent_prompts" TO "authenticated";
GRANT ALL ON TABLE "public"."agent_prompts" TO "service_role";



GRANT ALL ON TABLE "public"."agent_runs" TO "anon";
GRANT ALL ON TABLE "public"."agent_runs" TO "authenticated";
GRANT ALL ON TABLE "public"."agent_runs" TO "service_role";



GRANT ALL ON TABLE "public"."agent_skills" TO "anon";
GRANT ALL ON TABLE "public"."agent_skills" TO "authenticated";
GRANT ALL ON TABLE "public"."agent_skills" TO "service_role";



GRANT ALL ON TABLE "public"."agent_ticket_activity" TO "anon";
GRANT ALL ON TABLE "public"."agent_ticket_activity" TO "authenticated";
GRANT ALL ON TABLE "public"."agent_ticket_activity" TO "service_role";



GRANT ALL ON TABLE "public"."agent_ticket_comments" TO "anon";
GRANT ALL ON TABLE "public"."agent_ticket_comments" TO "authenticated";
GRANT ALL ON TABLE "public"."agent_ticket_comments" TO "service_role";



GRANT ALL ON TABLE "public"."agent_tickets" TO "anon";
GRANT ALL ON TABLE "public"."agent_tickets" TO "authenticated";
GRANT ALL ON TABLE "public"."agent_tickets" TO "service_role";



GRANT ALL ON TABLE "public"."agente_analises" TO "anon";
GRANT ALL ON TABLE "public"."agente_analises" TO "authenticated";
GRANT ALL ON TABLE "public"."agente_analises" TO "service_role";



GRANT ALL ON TABLE "public"."agents" TO "anon";
GRANT ALL ON TABLE "public"."agents" TO "authenticated";
GRANT ALL ON TABLE "public"."agents" TO "service_role";



GRANT ALL ON TABLE "public"."analise_loja" TO "anon";
GRANT ALL ON TABLE "public"."analise_loja" TO "authenticated";
GRANT ALL ON TABLE "public"."analise_loja" TO "service_role";



GRANT ALL ON TABLE "public"."analises" TO "anon";
GRANT ALL ON TABLE "public"."analises" TO "authenticated";
GRANT ALL ON TABLE "public"."analises" TO "service_role";



GRANT ALL ON TABLE "public"."asaas_eventos" TO "anon";
GRANT ALL ON TABLE "public"."asaas_eventos" TO "authenticated";
GRANT ALL ON TABLE "public"."asaas_eventos" TO "service_role";



GRANT ALL ON TABLE "public"."atendimento_avaliacoes" TO "anon";
GRANT ALL ON TABLE "public"."atendimento_avaliacoes" TO "authenticated";
GRANT ALL ON TABLE "public"."atendimento_avaliacoes" TO "service_role";



GRANT ALL ON TABLE "public"."audit_log" TO "anon";
GRANT ALL ON TABLE "public"."audit_log" TO "authenticated";
GRANT ALL ON TABLE "public"."audit_log" TO "service_role";



GRANT ALL ON SEQUENCE "public"."audit_log_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."audit_log_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."audit_log_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."avaliacao_config" TO "anon";
GRANT ALL ON TABLE "public"."avaliacao_config" TO "authenticated";
GRANT ALL ON TABLE "public"."avaliacao_config" TO "service_role";



GRANT ALL ON TABLE "public"."avaliacoes" TO "anon";
GRANT ALL ON TABLE "public"."avaliacoes" TO "authenticated";
GRANT ALL ON TABLE "public"."avaliacoes" TO "service_role";



GRANT ALL ON TABLE "public"."avaliacoes_loja_config" TO "anon";
GRANT ALL ON TABLE "public"."avaliacoes_loja_config" TO "authenticated";
GRANT ALL ON TABLE "public"."avaliacoes_loja_config" TO "service_role";



GRANT ALL ON TABLE "public"."bom_dia_config" TO "anon";
GRANT ALL ON TABLE "public"."bom_dia_config" TO "authenticated";
GRANT ALL ON TABLE "public"."bom_dia_config" TO "service_role";



GRANT ALL ON TABLE "public"."bom_dia_feedback" TO "anon";
GRANT ALL ON TABLE "public"."bom_dia_feedback" TO "authenticated";
GRANT ALL ON TABLE "public"."bom_dia_feedback" TO "service_role";



GRANT ALL ON TABLE "public"."bot_configs" TO "anon";
GRANT ALL ON TABLE "public"."bot_configs" TO "authenticated";
GRANT ALL ON TABLE "public"."bot_configs" TO "service_role";



GRANT ALL ON TABLE "public"."bot_reply_log" TO "anon";
GRANT ALL ON TABLE "public"."bot_reply_log" TO "authenticated";
GRANT ALL ON TABLE "public"."bot_reply_log" TO "service_role";



GRANT ALL ON TABLE "public"."breno_interactions" TO "anon";
GRANT ALL ON TABLE "public"."breno_interactions" TO "authenticated";
GRANT ALL ON TABLE "public"."breno_interactions" TO "service_role";



GRANT ALL ON TABLE "public"."breno_message_buffer" TO "anon";
GRANT ALL ON TABLE "public"."breno_message_buffer" TO "authenticated";
GRANT ALL ON TABLE "public"."breno_message_buffer" TO "service_role";



GRANT ALL ON TABLE "public"."breno_triagem" TO "anon";
GRANT ALL ON TABLE "public"."breno_triagem" TO "authenticated";
GRANT ALL ON TABLE "public"."breno_triagem" TO "service_role";



GRANT ALL ON TABLE "public"."campanha_ativos" TO "anon";
GRANT ALL ON TABLE "public"."campanha_ativos" TO "authenticated";
GRANT ALL ON TABLE "public"."campanha_ativos" TO "service_role";



GRANT ALL ON TABLE "public"."campanhas" TO "anon";
GRANT ALL ON TABLE "public"."campanhas" TO "authenticated";
GRANT ALL ON TABLE "public"."campanhas" TO "service_role";



GRANT ALL ON TABLE "public"."channel_members" TO "anon";
GRANT ALL ON TABLE "public"."channel_members" TO "authenticated";
GRANT ALL ON TABLE "public"."channel_members" TO "service_role";



GRANT ALL ON TABLE "public"."channel_messages" TO "anon";
GRANT ALL ON TABLE "public"."channel_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."channel_messages" TO "service_role";



GRANT ALL ON TABLE "public"."chat_tasks" TO "anon";
GRANT ALL ON TABLE "public"."chat_tasks" TO "authenticated";
GRANT ALL ON TABLE "public"."chat_tasks" TO "service_role";



GRANT ALL ON TABLE "public"."client_facts" TO "anon";
GRANT ALL ON TABLE "public"."client_facts" TO "authenticated";
GRANT ALL ON TABLE "public"."client_facts" TO "service_role";



GRANT ALL ON TABLE "public"."client_tasks" TO "anon";
GRANT ALL ON TABLE "public"."client_tasks" TO "authenticated";
GRANT ALL ON TABLE "public"."client_tasks" TO "service_role";



GRANT ALL ON TABLE "public"."client_timeline" TO "anon";
GRANT ALL ON TABLE "public"."client_timeline" TO "authenticated";
GRANT ALL ON TABLE "public"."client_timeline" TO "service_role";



GRANT ALL ON SEQUENCE "public"."client_timeline_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."client_timeline_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."client_timeline_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."cobranca_eventos" TO "anon";
GRANT ALL ON TABLE "public"."cobranca_eventos" TO "authenticated";
GRANT ALL ON TABLE "public"."cobranca_eventos" TO "service_role";



GRANT ALL ON TABLE "public"."cobrancas" TO "anon";
GRANT ALL ON TABLE "public"."cobrancas" TO "authenticated";
GRANT ALL ON TABLE "public"."cobrancas" TO "service_role";



GRANT ALL ON TABLE "public"."contact_optout" TO "anon";
GRANT ALL ON TABLE "public"."contact_optout" TO "authenticated";
GRANT ALL ON TABLE "public"."contact_optout" TO "service_role";



GRANT ALL ON TABLE "public"."contact_tags" TO "anon";
GRANT ALL ON TABLE "public"."contact_tags" TO "authenticated";
GRANT ALL ON TABLE "public"."contact_tags" TO "service_role";



GRANT ALL ON TABLE "public"."contatos" TO "anon";
GRANT ALL ON TABLE "public"."contatos" TO "authenticated";
GRANT ALL ON TABLE "public"."contatos" TO "service_role";



GRANT ALL ON TABLE "public"."content_calendar" TO "anon";
GRANT ALL ON TABLE "public"."content_calendar" TO "authenticated";
GRANT ALL ON TABLE "public"."content_calendar" TO "service_role";



GRANT ALL ON TABLE "public"."content_drafts" TO "anon";
GRANT ALL ON TABLE "public"."content_drafts" TO "authenticated";
GRANT ALL ON TABLE "public"."content_drafts" TO "service_role";



GRANT ALL ON TABLE "public"."content_published" TO "anon";
GRANT ALL ON TABLE "public"."content_published" TO "authenticated";
GRANT ALL ON TABLE "public"."content_published" TO "service_role";



GRANT ALL ON TABLE "public"."contratos" TO "anon";
GRANT ALL ON TABLE "public"."contratos" TO "authenticated";
GRANT ALL ON TABLE "public"."contratos" TO "service_role";



GRANT ALL ON TABLE "public"."conversation_events" TO "anon";
GRANT ALL ON TABLE "public"."conversation_events" TO "authenticated";
GRANT ALL ON TABLE "public"."conversation_events" TO "service_role";



GRANT ALL ON SEQUENCE "public"."conversation_events_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."conversation_events_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."conversation_events_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."conversation_status_log" TO "anon";
GRANT ALL ON TABLE "public"."conversation_status_log" TO "authenticated";
GRANT ALL ON TABLE "public"."conversation_status_log" TO "service_role";



GRANT ALL ON SEQUENCE "public"."conversation_status_log_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."conversation_status_log_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."conversation_status_log_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."conversation_tags" TO "anon";
GRANT ALL ON TABLE "public"."conversation_tags" TO "authenticated";
GRANT ALL ON TABLE "public"."conversation_tags" TO "service_role";



GRANT ALL ON TABLE "public"."conversations" TO "anon";
GRANT ALL ON TABLE "public"."conversations" TO "authenticated";
GRANT ALL ON TABLE "public"."conversations" TO "service_role";



GRANT ALL ON TABLE "public"."cora_acoes" TO "anon";
GRANT ALL ON TABLE "public"."cora_acoes" TO "authenticated";
GRANT ALL ON TABLE "public"."cora_acoes" TO "service_role";



GRANT ALL ON TABLE "public"."cora_cobrancas" TO "anon";
GRANT ALL ON TABLE "public"."cora_cobrancas" TO "authenticated";
GRANT ALL ON TABLE "public"."cora_cobrancas" TO "service_role";



GRANT ALL ON TABLE "public"."cora_reguas" TO "anon";
GRANT ALL ON TABLE "public"."cora_reguas" TO "authenticated";
GRANT ALL ON TABLE "public"."cora_reguas" TO "service_role";



GRANT ALL ON TABLE "public"."crm_notas" TO "anon";
GRANT ALL ON TABLE "public"."crm_notas" TO "authenticated";
GRANT ALL ON TABLE "public"."crm_notas" TO "service_role";



GRANT ALL ON TABLE "public"."crm_webhook_tokens" TO "anon";
GRANT ALL ON TABLE "public"."crm_webhook_tokens" TO "authenticated";
GRANT ALL ON TABLE "public"."crm_webhook_tokens" TO "service_role";



GRANT ALL ON TABLE "public"."custom_field_values" TO "anon";
GRANT ALL ON TABLE "public"."custom_field_values" TO "authenticated";
GRANT ALL ON TABLE "public"."custom_field_values" TO "service_role";



GRANT ALL ON TABLE "public"."custom_fields" TO "anon";
GRANT ALL ON TABLE "public"."custom_fields" TO "authenticated";
GRANT ALL ON TABLE "public"."custom_fields" TO "service_role";



GRANT ALL ON TABLE "public"."customer_addresses" TO "anon";
GRANT ALL ON TABLE "public"."customer_addresses" TO "authenticated";
GRANT ALL ON TABLE "public"."customer_addresses" TO "service_role";



GRANT ALL ON TABLE "public"."customer_group_members" TO "anon";
GRANT ALL ON TABLE "public"."customer_group_members" TO "authenticated";
GRANT ALL ON TABLE "public"."customer_group_members" TO "service_role";



GRANT ALL ON TABLE "public"."customer_groups" TO "anon";
GRANT ALL ON TABLE "public"."customer_groups" TO "authenticated";
GRANT ALL ON TABLE "public"."customer_groups" TO "service_role";



GRANT ALL ON TABLE "public"."customer_note_entries" TO "anon";
GRANT ALL ON TABLE "public"."customer_note_entries" TO "authenticated";
GRANT ALL ON TABLE "public"."customer_note_entries" TO "service_role";



GRANT ALL ON TABLE "public"."customer_notes" TO "anon";
GRANT ALL ON TABLE "public"."customer_notes" TO "authenticated";
GRANT ALL ON TABLE "public"."customer_notes" TO "service_role";



GRANT ALL ON TABLE "public"."customer_tag_relations" TO "anon";
GRANT ALL ON TABLE "public"."customer_tag_relations" TO "authenticated";
GRANT ALL ON TABLE "public"."customer_tag_relations" TO "service_role";



GRANT ALL ON TABLE "public"."customer_tags" TO "anon";
GRANT ALL ON TABLE "public"."customer_tags" TO "authenticated";
GRANT ALL ON TABLE "public"."customer_tags" TO "service_role";



GRANT ALL ON TABLE "public"."customers" TO "anon";
GRANT ALL ON TABLE "public"."customers" TO "authenticated";
GRANT ALL ON TABLE "public"."customers" TO "service_role";



GRANT ALL ON TABLE "public"."daily_kpis" TO "anon";
GRANT ALL ON TABLE "public"."daily_kpis" TO "authenticated";
GRANT ALL ON TABLE "public"."daily_kpis" TO "service_role";



GRANT ALL ON TABLE "public"."defesa_aprovadores" TO "anon";
GRANT ALL ON TABLE "public"."defesa_aprovadores" TO "authenticated";
GRANT ALL ON TABLE "public"."defesa_aprovadores" TO "service_role";



GRANT ALL ON TABLE "public"."defesa_assinaturas" TO "anon";
GRANT ALL ON TABLE "public"."defesa_assinaturas" TO "authenticated";
GRANT ALL ON TABLE "public"."defesa_assinaturas" TO "service_role";



GRANT ALL ON TABLE "public"."defesa_casos" TO "anon";
GRANT ALL ON TABLE "public"."defesa_casos" TO "authenticated";
GRANT ALL ON TABLE "public"."defesa_casos" TO "service_role";



GRANT ALL ON TABLE "public"."defesa_metricas_mensal" TO "anon";
GRANT ALL ON TABLE "public"."defesa_metricas_mensal" TO "authenticated";
GRANT ALL ON TABLE "public"."defesa_metricas_mensal" TO "service_role";



GRANT ALL ON TABLE "public"."deli_actions_log" TO "anon";
GRANT ALL ON TABLE "public"."deli_actions_log" TO "authenticated";
GRANT ALL ON TABLE "public"."deli_actions_log" TO "service_role";



GRANT ALL ON SEQUENCE "public"."deli_actions_log_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."deli_actions_log_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."deli_actions_log_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."deli_agenda" TO "anon";
GRANT ALL ON TABLE "public"."deli_agenda" TO "authenticated";
GRANT ALL ON TABLE "public"."deli_agenda" TO "service_role";



GRANT ALL ON TABLE "public"."deli_messages" TO "anon";
GRANT ALL ON TABLE "public"."deli_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."deli_messages" TO "service_role";



GRANT ALL ON TABLE "public"."deli_pending_approvals" TO "anon";
GRANT ALL ON TABLE "public"."deli_pending_approvals" TO "authenticated";
GRANT ALL ON TABLE "public"."deli_pending_approvals" TO "service_role";



GRANT ALL ON TABLE "public"."deli_triggers" TO "anon";
GRANT ALL ON TABLE "public"."deli_triggers" TO "authenticated";
GRANT ALL ON TABLE "public"."deli_triggers" TO "service_role";



GRANT ALL ON TABLE "public"."department_members" TO "anon";
GRANT ALL ON TABLE "public"."department_members" TO "authenticated";
GRANT ALL ON TABLE "public"."department_members" TO "service_role";



GRANT ALL ON TABLE "public"."departments" TO "anon";
GRANT ALL ON TABLE "public"."departments" TO "authenticated";
GRANT ALL ON TABLE "public"."departments" TO "service_role";



GRANT ALL ON TABLE "public"."encerramento_config" TO "anon";
GRANT ALL ON TABLE "public"."encerramento_config" TO "authenticated";
GRANT ALL ON TABLE "public"."encerramento_config" TO "service_role";



GRANT ALL ON TABLE "public"."espacos_columns" TO "anon";
GRANT ALL ON TABLE "public"."espacos_columns" TO "authenticated";
GRANT ALL ON TABLE "public"."espacos_columns" TO "service_role";



GRANT ALL ON TABLE "public"."espacos_folders" TO "anon";
GRANT ALL ON TABLE "public"."espacos_folders" TO "authenticated";
GRANT ALL ON TABLE "public"."espacos_folders" TO "service_role";



GRANT ALL ON TABLE "public"."espacos_lists" TO "anon";
GRANT ALL ON TABLE "public"."espacos_lists" TO "authenticated";
GRANT ALL ON TABLE "public"."espacos_lists" TO "service_role";



GRANT ALL ON TABLE "public"."espacos_workspaces" TO "anon";
GRANT ALL ON TABLE "public"."espacos_workspaces" TO "authenticated";
GRANT ALL ON TABLE "public"."espacos_workspaces" TO "service_role";



GRANT ALL ON TABLE "public"."estudio_criacoes" TO "anon";
GRANT ALL ON TABLE "public"."estudio_criacoes" TO "authenticated";
GRANT ALL ON TABLE "public"."estudio_criacoes" TO "service_role";



GRANT ALL ON TABLE "public"."evolution_instances" TO "anon";
GRANT ALL ON TABLE "public"."evolution_instances" TO "authenticated";
GRANT ALL ON TABLE "public"."evolution_instances" TO "service_role";



GRANT ALL ON TABLE "public"."goal_tasks" TO "anon";
GRANT ALL ON TABLE "public"."goal_tasks" TO "authenticated";
GRANT ALL ON TABLE "public"."goal_tasks" TO "service_role";



GRANT ALL ON TABLE "public"."goals" TO "anon";
GRANT ALL ON TABLE "public"."goals" TO "authenticated";
GRANT ALL ON TABLE "public"."goals" TO "service_role";



GRANT ALL ON TABLE "public"."heartbeat_runs" TO "anon";
GRANT ALL ON TABLE "public"."heartbeat_runs" TO "authenticated";
GRANT ALL ON TABLE "public"."heartbeat_runs" TO "service_role";



GRANT ALL ON TABLE "public"."heartbeats" TO "anon";
GRANT ALL ON TABLE "public"."heartbeats" TO "authenticated";
GRANT ALL ON TABLE "public"."heartbeats" TO "service_role";



GRANT ALL ON TABLE "public"."ifood_merchants" TO "anon";
GRANT ALL ON TABLE "public"."ifood_merchants" TO "authenticated";
GRANT ALL ON TABLE "public"."ifood_merchants" TO "service_role";



GRANT ALL ON TABLE "public"."inadimplencia_messages" TO "anon";
GRANT ALL ON TABLE "public"."inadimplencia_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."inadimplencia_messages" TO "service_role";



GRANT ALL ON TABLE "public"."inadimplencias" TO "anon";
GRANT ALL ON TABLE "public"."inadimplencias" TO "authenticated";
GRANT ALL ON TABLE "public"."inadimplencias" TO "service_role";



GRANT ALL ON TABLE "public"."internal_channels" TO "anon";
GRANT ALL ON TABLE "public"."internal_channels" TO "authenticated";
GRANT ALL ON TABLE "public"."internal_channels" TO "service_role";



GRANT ALL ON TABLE "public"."internal_notifications" TO "anon";
GRANT ALL ON TABLE "public"."internal_notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."internal_notifications" TO "service_role";



GRANT ALL ON TABLE "public"."lead_list_members" TO "anon";
GRANT ALL ON TABLE "public"."lead_list_members" TO "authenticated";
GRANT ALL ON TABLE "public"."lead_list_members" TO "service_role";



GRANT ALL ON TABLE "public"."lead_lists" TO "anon";
GRANT ALL ON TABLE "public"."lead_lists" TO "authenticated";
GRANT ALL ON TABLE "public"."lead_lists" TO "service_role";



GRANT ALL ON TABLE "public"."lead_tags" TO "anon";
GRANT ALL ON TABLE "public"."lead_tags" TO "authenticated";
GRANT ALL ON TABLE "public"."lead_tags" TO "service_role";



GRANT ALL ON TABLE "public"."leads" TO "anon";
GRANT ALL ON TABLE "public"."leads" TO "authenticated";
GRANT ALL ON TABLE "public"."leads" TO "service_role";



GRANT ALL ON TABLE "public"."loja_consultores" TO "anon";
GRANT ALL ON TABLE "public"."loja_consultores" TO "authenticated";
GRANT ALL ON TABLE "public"."loja_consultores" TO "service_role";



GRANT ALL ON TABLE "public"."loja_gpt_conversations" TO "anon";
GRANT ALL ON TABLE "public"."loja_gpt_conversations" TO "authenticated";
GRANT ALL ON TABLE "public"."loja_gpt_conversations" TO "service_role";



GRANT ALL ON TABLE "public"."loja_gpt_messages" TO "anon";
GRANT ALL ON TABLE "public"."loja_gpt_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."loja_gpt_messages" TO "service_role";



GRANT ALL ON TABLE "public"."loja_metricas" TO "anon";
GRANT ALL ON TABLE "public"."loja_metricas" TO "authenticated";
GRANT ALL ON TABLE "public"."loja_metricas" TO "service_role";



GRANT ALL ON TABLE "public"."loja_metricas_snapshot" TO "anon";
GRANT ALL ON TABLE "public"."loja_metricas_snapshot" TO "authenticated";
GRANT ALL ON TABLE "public"."loja_metricas_snapshot" TO "service_role";



GRANT ALL ON TABLE "public"."loja_whatsapp_vinculo" TO "anon";
GRANT ALL ON TABLE "public"."loja_whatsapp_vinculo" TO "authenticated";
GRANT ALL ON TABLE "public"."loja_whatsapp_vinculo" TO "service_role";



GRANT ALL ON TABLE "public"."lojas" TO "anon";
GRANT ALL ON TABLE "public"."lojas" TO "authenticated";
GRANT ALL ON TABLE "public"."lojas" TO "service_role";



GRANT ALL ON TABLE "public"."marca_pesquisa" TO "anon";
GRANT ALL ON TABLE "public"."marca_pesquisa" TO "authenticated";
GRANT ALL ON TABLE "public"."marca_pesquisa" TO "service_role";



GRANT ALL ON TABLE "public"."max_knowledge_base" TO "anon";
GRANT ALL ON TABLE "public"."max_knowledge_base" TO "authenticated";
GRANT ALL ON TABLE "public"."max_knowledge_base" TO "service_role";



GRANT ALL ON TABLE "public"."messages" TO "anon";
GRANT ALL ON TABLE "public"."messages" TO "authenticated";
GRANT ALL ON TABLE "public"."messages" TO "service_role";



GRANT ALL ON TABLE "public"."mia_analises" TO "anon";
GRANT ALL ON TABLE "public"."mia_analises" TO "authenticated";
GRANT ALL ON TABLE "public"."mia_analises" TO "service_role";



GRANT ALL ON TABLE "public"."mia_audit_log" TO "anon";
GRANT ALL ON TABLE "public"."mia_audit_log" TO "authenticated";
GRANT ALL ON TABLE "public"."mia_audit_log" TO "service_role";



GRANT ALL ON TABLE "public"."missions" TO "anon";
GRANT ALL ON TABLE "public"."missions" TO "authenticated";
GRANT ALL ON TABLE "public"."missions" TO "service_role";



GRANT ALL ON TABLE "public"."nexus_requests" TO "anon";
GRANT ALL ON TABLE "public"."nexus_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."nexus_requests" TO "service_role";



GRANT ALL ON TABLE "public"."notification_preferences" TO "anon";
GRANT ALL ON TABLE "public"."notification_preferences" TO "authenticated";
GRANT ALL ON TABLE "public"."notification_preferences" TO "service_role";



GRANT ALL ON TABLE "public"."nova_blueprints" TO "anon";
GRANT ALL ON TABLE "public"."nova_blueprints" TO "authenticated";
GRANT ALL ON TABLE "public"."nova_blueprints" TO "service_role";



GRANT ALL ON TABLE "public"."nps_avaliacoes" TO "anon";
GRANT ALL ON TABLE "public"."nps_avaliacoes" TO "authenticated";
GRANT ALL ON TABLE "public"."nps_avaliacoes" TO "service_role";



GRANT ALL ON TABLE "public"."onboarding_checklists" TO "anon";
GRANT ALL ON TABLE "public"."onboarding_checklists" TO "authenticated";
GRANT ALL ON TABLE "public"."onboarding_checklists" TO "service_role";



GRANT ALL ON TABLE "public"."onboarding_templates" TO "anon";
GRANT ALL ON TABLE "public"."onboarding_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."onboarding_templates" TO "service_role";



GRANT ALL ON TABLE "public"."onboarding_wizard_sessions" TO "anon";
GRANT ALL ON TABLE "public"."onboarding_wizard_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."onboarding_wizard_sessions" TO "service_role";



GRANT ALL ON TABLE "public"."oracle_drafts" TO "anon";
GRANT ALL ON TABLE "public"."oracle_drafts" TO "authenticated";
GRANT ALL ON TABLE "public"."oracle_drafts" TO "service_role";



GRANT ALL ON TABLE "public"."orders" TO "anon";
GRANT ALL ON TABLE "public"."orders" TO "authenticated";
GRANT ALL ON TABLE "public"."orders" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."projects" TO "anon";
GRANT ALL ON TABLE "public"."projects" TO "authenticated";
GRANT ALL ON TABLE "public"."projects" TO "service_role";



GRANT ALL ON TABLE "public"."prospect_abordagens" TO "anon";
GRANT ALL ON TABLE "public"."prospect_abordagens" TO "authenticated";
GRANT ALL ON TABLE "public"."prospect_abordagens" TO "service_role";



GRANT ALL ON TABLE "public"."prospect_pesquisas" TO "anon";
GRANT ALL ON TABLE "public"."prospect_pesquisas" TO "authenticated";
GRANT ALL ON TABLE "public"."prospect_pesquisas" TO "service_role";



GRANT ALL ON TABLE "public"."prospects" TO "anon";
GRANT ALL ON TABLE "public"."prospects" TO "authenticated";
GRANT ALL ON TABLE "public"."prospects" TO "service_role";



GRANT ALL ON TABLE "public"."push_subscriptions" TO "anon";
GRANT ALL ON TABLE "public"."push_subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."push_subscriptions" TO "service_role";



GRANT ALL ON SEQUENCE "public"."push_subscriptions_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."push_subscriptions_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."push_subscriptions_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."quick_replies" TO "anon";
GRANT ALL ON TABLE "public"."quick_replies" TO "authenticated";
GRANT ALL ON TABLE "public"."quick_replies" TO "service_role";



GRANT ALL ON TABLE "public"."radar_fontes" TO "anon";
GRANT ALL ON TABLE "public"."radar_fontes" TO "authenticated";
GRANT ALL ON TABLE "public"."radar_fontes" TO "service_role";



GRANT ALL ON TABLE "public"."radar_metricas" TO "anon";
GRANT ALL ON TABLE "public"."radar_metricas" TO "authenticated";
GRANT ALL ON TABLE "public"."radar_metricas" TO "service_role";



GRANT ALL ON TABLE "public"."radar_series" TO "anon";
GRANT ALL ON TABLE "public"."radar_series" TO "authenticated";
GRANT ALL ON TABLE "public"."radar_series" TO "service_role";



GRANT ALL ON TABLE "public"."regua_cobranca" TO "anon";
GRANT ALL ON TABLE "public"."regua_cobranca" TO "authenticated";
GRANT ALL ON TABLE "public"."regua_cobranca" TO "service_role";



GRANT ALL ON TABLE "public"."reguas" TO "anon";
GRANT ALL ON TABLE "public"."reguas" TO "authenticated";
GRANT ALL ON TABLE "public"."reguas" TO "service_role";



GRANT ALL ON TABLE "public"."reviews" TO "anon";
GRANT ALL ON TABLE "public"."reviews" TO "authenticated";
GRANT ALL ON TABLE "public"."reviews" TO "service_role";



GRANT ALL ON TABLE "public"."role_permissions" TO "anon";
GRANT ALL ON TABLE "public"."role_permissions" TO "authenticated";
GRANT ALL ON TABLE "public"."role_permissions" TO "service_role";



GRANT ALL ON TABLE "public"."roles" TO "anon";
GRANT ALL ON TABLE "public"."roles" TO "authenticated";
GRANT ALL ON TABLE "public"."roles" TO "service_role";



GRANT ALL ON TABLE "public"."sugestoes_ia" TO "anon";
GRANT ALL ON TABLE "public"."sugestoes_ia" TO "authenticated";
GRANT ALL ON TABLE "public"."sugestoes_ia" TO "service_role";



GRANT ALL ON TABLE "public"."sugestoes_plataforma" TO "anon";
GRANT ALL ON TABLE "public"."sugestoes_plataforma" TO "authenticated";
GRANT ALL ON TABLE "public"."sugestoes_plataforma" TO "service_role";



GRANT ALL ON TABLE "public"."support_tickets" TO "anon";
GRANT ALL ON TABLE "public"."support_tickets" TO "authenticated";
GRANT ALL ON TABLE "public"."support_tickets" TO "service_role";



GRANT ALL ON TABLE "public"."tarefa_anexos" TO "anon";
GRANT ALL ON TABLE "public"."tarefa_anexos" TO "authenticated";
GRANT ALL ON TABLE "public"."tarefa_anexos" TO "service_role";



GRANT ALL ON TABLE "public"."tarefa_aprovacoes" TO "anon";
GRANT ALL ON TABLE "public"."tarefa_aprovacoes" TO "authenticated";
GRANT ALL ON TABLE "public"."tarefa_aprovacoes" TO "service_role";



GRANT ALL ON TABLE "public"."tarefa_comentarios" TO "anon";
GRANT ALL ON TABLE "public"."tarefa_comentarios" TO "authenticated";
GRANT ALL ON TABLE "public"."tarefa_comentarios" TO "service_role";



GRANT ALL ON TABLE "public"."tarefa_prints" TO "anon";
GRANT ALL ON TABLE "public"."tarefa_prints" TO "authenticated";
GRANT ALL ON TABLE "public"."tarefa_prints" TO "service_role";



GRANT ALL ON TABLE "public"."tarefa_revisoes" TO "anon";
GRANT ALL ON TABLE "public"."tarefa_revisoes" TO "authenticated";
GRANT ALL ON TABLE "public"."tarefa_revisoes" TO "service_role";



GRANT ALL ON TABLE "public"."tarefas_analise" TO "anon";
GRANT ALL ON TABLE "public"."tarefas_analise" TO "authenticated";
GRANT ALL ON TABLE "public"."tarefas_analise" TO "service_role";



GRANT ALL ON TABLE "public"."tarefas_loja" TO "anon";
GRANT ALL ON TABLE "public"."tarefas_loja" TO "authenticated";
GRANT ALL ON TABLE "public"."tarefas_loja" TO "service_role";



GRANT ALL ON TABLE "public"."task_comments" TO "anon";
GRANT ALL ON TABLE "public"."task_comments" TO "authenticated";
GRANT ALL ON TABLE "public"."task_comments" TO "service_role";



GRANT ALL ON TABLE "public"."tasks" TO "anon";
GRANT ALL ON TABLE "public"."tasks" TO "authenticated";
GRANT ALL ON TABLE "public"."tasks" TO "service_role";



GRANT ALL ON TABLE "public"."templates" TO "anon";
GRANT ALL ON TABLE "public"."templates" TO "authenticated";
GRANT ALL ON TABLE "public"."templates" TO "service_role";



GRANT ALL ON TABLE "public"."templates_tarefa" TO "anon";
GRANT ALL ON TABLE "public"."templates_tarefa" TO "authenticated";
GRANT ALL ON TABLE "public"."templates_tarefa" TO "service_role";



GRANT ALL ON TABLE "public"."tenant_agent_config" TO "anon";
GRANT ALL ON TABLE "public"."tenant_agent_config" TO "authenticated";
GRANT ALL ON TABLE "public"."tenant_agent_config" TO "service_role";



GRANT ALL ON TABLE "public"."tenant_agents" TO "anon";
GRANT ALL ON TABLE "public"."tenant_agents" TO "authenticated";
GRANT ALL ON TABLE "public"."tenant_agents" TO "service_role";



GRANT ALL ON TABLE "public"."tenant_files" TO "anon";
GRANT ALL ON TABLE "public"."tenant_files" TO "authenticated";
GRANT ALL ON TABLE "public"."tenant_files" TO "service_role";



GRANT ALL ON TABLE "public"."tenant_gatilhos" TO "anon";
GRANT ALL ON TABLE "public"."tenant_gatilhos" TO "authenticated";
GRANT ALL ON TABLE "public"."tenant_gatilhos" TO "service_role";



GRANT ALL ON TABLE "public"."tenant_integracoes" TO "anon";
GRANT ALL ON TABLE "public"."tenant_integracoes" TO "authenticated";
GRANT ALL ON TABLE "public"."tenant_integracoes" TO "service_role";



GRANT ALL ON TABLE "public"."tenant_links" TO "anon";
GRANT ALL ON TABLE "public"."tenant_links" TO "authenticated";
GRANT ALL ON TABLE "public"."tenant_links" TO "service_role";



GRANT ALL ON TABLE "public"."tenant_members" TO "anon";
GRANT ALL ON TABLE "public"."tenant_members" TO "authenticated";
GRANT ALL ON TABLE "public"."tenant_members" TO "service_role";



GRANT ALL ON TABLE "public"."tenant_modules" TO "anon";
GRANT ALL ON TABLE "public"."tenant_modules" TO "authenticated";
GRANT ALL ON TABLE "public"."tenant_modules" TO "service_role";



GRANT ALL ON TABLE "public"."tenant_provedores" TO "anon";
GRANT ALL ON TABLE "public"."tenant_provedores" TO "authenticated";
GRANT ALL ON TABLE "public"."tenant_provedores" TO "service_role";



GRANT ALL ON TABLE "public"."tenant_sistemas" TO "anon";
GRANT ALL ON TABLE "public"."tenant_sistemas" TO "authenticated";
GRANT ALL ON TABLE "public"."tenant_sistemas" TO "service_role";



GRANT ALL ON TABLE "public"."tenant_tarefas" TO "anon";
GRANT ALL ON TABLE "public"."tenant_tarefas" TO "authenticated";
GRANT ALL ON TABLE "public"."tenant_tarefas" TO "service_role";



GRANT ALL ON TABLE "public"."tenant_topicos" TO "anon";
GRANT ALL ON TABLE "public"."tenant_topicos" TO "authenticated";
GRANT ALL ON TABLE "public"."tenant_topicos" TO "service_role";



GRANT ALL ON TABLE "public"."tenants" TO "anon";
GRANT ALL ON TABLE "public"."tenants" TO "authenticated";
GRANT ALL ON TABLE "public"."tenants" TO "service_role";



GRANT ALL ON TABLE "public"."user_agent_access" TO "anon";
GRANT ALL ON TABLE "public"."user_agent_access" TO "authenticated";
GRANT ALL ON TABLE "public"."user_agent_access" TO "service_role";



GRANT ALL ON TABLE "public"."user_roles" TO "anon";
GRANT ALL ON TABLE "public"."user_roles" TO "authenticated";
GRANT ALL ON TABLE "public"."user_roles" TO "service_role";



GRANT ALL ON TABLE "public"."user_screen_permissions" TO "anon";
GRANT ALL ON TABLE "public"."user_screen_permissions" TO "authenticated";
GRANT ALL ON TABLE "public"."user_screen_permissions" TO "service_role";



GRANT ALL ON TABLE "public"."v_chart_7d" TO "anon";
GRANT ALL ON TABLE "public"."v_chart_7d" TO "authenticated";
GRANT ALL ON TABLE "public"."v_chart_7d" TO "service_role";



GRANT ALL ON TABLE "public"."v_dashboard_kpis" TO "anon";
GRANT ALL ON TABLE "public"."v_dashboard_kpis" TO "authenticated";
GRANT ALL ON TABLE "public"."v_dashboard_kpis" TO "service_role";



GRANT ALL ON TABLE "public"."val_desempenho_coleta" TO "anon";
GRANT ALL ON TABLE "public"."val_desempenho_coleta" TO "authenticated";
GRANT ALL ON TABLE "public"."val_desempenho_coleta" TO "service_role";



GRANT ALL ON TABLE "public"."val_kpi_coleta_diaria" TO "anon";
GRANT ALL ON TABLE "public"."val_kpi_coleta_diaria" TO "authenticated";
GRANT ALL ON TABLE "public"."val_kpi_coleta_diaria" TO "service_role";



GRANT ALL ON TABLE "public"."vendaerp_instances" TO "anon";
GRANT ALL ON TABLE "public"."vendaerp_instances" TO "authenticated";
GRANT ALL ON TABLE "public"."vendaerp_instances" TO "service_role";



GRANT ALL ON TABLE "public"."vendaerp_proposals" TO "anon";
GRANT ALL ON TABLE "public"."vendaerp_proposals" TO "authenticated";
GRANT ALL ON TABLE "public"."vendaerp_proposals" TO "service_role";



GRANT ALL ON TABLE "public"."vera_anomalias" TO "anon";
GRANT ALL ON TABLE "public"."vera_anomalias" TO "authenticated";
GRANT ALL ON TABLE "public"."vera_anomalias" TO "service_role";



GRANT ALL ON TABLE "public"."vera_metricas_snapshot" TO "anon";
GRANT ALL ON TABLE "public"."vera_metricas_snapshot" TO "authenticated";
GRANT ALL ON TABLE "public"."vera_metricas_snapshot" TO "service_role";



GRANT ALL ON TABLE "public"."vera_reports" TO "anon";
GRANT ALL ON TABLE "public"."vera_reports" TO "authenticated";
GRANT ALL ON TABLE "public"."vera_reports" TO "service_role";



GRANT ALL ON TABLE "public"."view_metricas_agentes_dia" TO "anon";
GRANT ALL ON TABLE "public"."view_metricas_agentes_dia" TO "authenticated";
GRANT ALL ON TABLE "public"."view_metricas_agentes_dia" TO "service_role";



GRANT ALL ON TABLE "public"."whatsapp_messages" TO "anon";
GRANT ALL ON TABLE "public"."whatsapp_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."whatsapp_messages" TO "service_role";



GRANT ALL ON TABLE "public"."view_metricas_conversas_dia" TO "anon";
GRANT ALL ON TABLE "public"."view_metricas_conversas_dia" TO "authenticated";
GRANT ALL ON TABLE "public"."view_metricas_conversas_dia" TO "service_role";



GRANT ALL ON TABLE "public"."view_metricas_negocio_dia" TO "anon";
GRANT ALL ON TABLE "public"."view_metricas_negocio_dia" TO "authenticated";
GRANT ALL ON TABLE "public"."view_metricas_negocio_dia" TO "service_role";



GRANT ALL ON TABLE "public"."whatsapp_aprovacao_sessions" TO "anon";
GRANT ALL ON TABLE "public"."whatsapp_aprovacao_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."whatsapp_aprovacao_sessions" TO "service_role";



GRANT ALL ON TABLE "public"."whatsapp_contacts" TO "anon";
GRANT ALL ON TABLE "public"."whatsapp_contacts" TO "authenticated";
GRANT ALL ON TABLE "public"."whatsapp_contacts" TO "service_role";



GRANT ALL ON TABLE "public"."whatsapp_group_members" TO "anon";
GRANT ALL ON TABLE "public"."whatsapp_group_members" TO "authenticated";
GRANT ALL ON TABLE "public"."whatsapp_group_members" TO "service_role";



GRANT ALL ON TABLE "public"."whatsapp_groups" TO "anon";
GRANT ALL ON TABLE "public"."whatsapp_groups" TO "authenticated";
GRANT ALL ON TABLE "public"."whatsapp_groups" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";



































