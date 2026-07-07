-- 20260707_001_secdef_tenant_validation.sql
-- Auditoria SECURITY DEFINER (docs/seguranca/security-definer-audit.md).
-- 2 funcoes confiavam em parametro do caller sem validar auth.uid():
--
-- 1) log_audit(p_tenant_id,...): qualquer autenticado inseria entrada
--    forjada em audit_log de QUALQUER outro tenant (spoofing de trilha de
--    auditoria). Fix: exige que auth.uid() seja membro de p_tenant_id,
--    mesmo padrao ja usado em get_tenant_members/remove_tenant_member.
--
-- 2) create_workspace(...,p_user_id): p_user_id nao era forcado a
--    auth.uid() -- caller podia criar um workspace e tornar QUALQUER outro
--    user_id admin dele. Fix: ignora o parametro, sempre usa auth.uid().
--
-- Aditivo/reversivel (CREATE OR REPLACE substitui a versao anterior).
-- Idempotente.
--
-- Rollback: reverter para a definicao anterior (ver baseline.sql linhas
-- 193-209 e 426-433) via CREATE OR REPLACE com o corpo antigo.
--
-- NAO APLICAR -- a orquestradora aplica com teste.

BEGIN;

CREATE OR REPLACE FUNCTION "public"."log_audit"(
  "p_tenant_id" "uuid",
  "p_action" "text",
  "p_resource" "text" DEFAULT NULL::"text",
  "p_agent_name" "text" DEFAULT NULL::"text",
  "p_metadata" "jsonb" DEFAULT NULL::"jsonb"
) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.tenant_members
    WHERE tenant_id = p_tenant_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'permission_denied: caller nao e membro do tenant informado';
  END IF;

  INSERT INTO audit_log(tenant_id, user_id, agent_name, action, resource, metadata)
  VALUES (p_tenant_id, auth.uid(), p_agent_name, p_action, p_resource, p_metadata);
END;
$$;

CREATE OR REPLACE FUNCTION "public"."create_workspace"(
  "p_name" "text",
  "p_slug" "text",
  "p_segment" "text",
  "p_emoji" "text",
  "p_user_id" "uuid"
) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_tenant_id uuid;
BEGIN
  INSERT INTO public.tenants (name, slug, segment, emoji, plan, status, color)
  VALUES (p_name, p_slug, p_segment, p_emoji, 'starter', 'active', '#B70C00')
  RETURNING id INTO v_tenant_id;

  -- p_user_id ignorado de proposito: sempre o caller real (auth.uid()),
  -- nunca um id arbitrario vindo do parametro.
  INSERT INTO public.tenant_members (tenant_id, user_id, role, semaforo)
  VALUES (v_tenant_id, auth.uid(), 'admin', 'verde');

  RETURN v_tenant_id;
END;
$$;

COMMIT;

-- ============================================================================
-- TESTE DE ISOLAMENTO (NAO EXECUTAR AQUI -- rodar a parte). Esperado:
--   log_audit com p_tenant_id de um tenant que o caller NAO e membro
--     -> RAISE EXCEPTION permission_denied
--   log_audit com p_tenant_id do proprio tenant do caller -> insere normal
--   create_workspace com p_user_id = uuid de outra pessoa -> tenant_members
--     grava com o UUID do CALLER (auth.uid()), nao o p_user_id passado
-- ============================================================================
--
-- BEGIN;
-- SET LOCAL role authenticated;
-- SELECT set_config('request.jwt.claims', json_build_object('sub','<uuid membro tenant A>')::text, true);
-- SELECT public.log_audit('<uuid tenant B>'::uuid, 'teste', null, null, null);
-- -- esperado: ERROR permission_denied
-- ROLLBACK;
