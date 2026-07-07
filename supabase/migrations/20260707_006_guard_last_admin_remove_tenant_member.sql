-- 20260707_006_guard_last_admin_remove_tenant_member.sql
-- Follow-up da revisão do PR #832 (gestão de membros): remove_tenant_member
-- já bloqueia auto-remoção (cannot_remove_self), mas NAO impedia remover o
-- ÚLTIMO membro com papel de gestão (admin/owner) do tenant — lockout total
-- (ninguém mais conseguiria convidar, editar cargo ou remover ninguém).
--
-- Fix: antes do DELETE, se o alvo tem role IN ('admin','owner') E ele é o
-- ÚNICO com esse papel no tenant, recusa com 'cannot_remove_last_admin'.
-- Mesmo conjunto de papéis já usado no gate de permissão desta função
-- (linhas 505-512 do baseline) — mantém a definição de "quem gerencia"
-- consistente dentro da própria função.
--
-- Aditivo/reversível: só troca o corpo da função (CREATE OR REPLACE),
-- mesma assinatura. Idempotente.
--
-- Rollback: recriar a função sem o bloco de guarda abaixo (versão anterior
-- preservada no baseline, supabase/migrations/00000000000000_baseline.sql
-- linhas 500-521).

CREATE OR REPLACE FUNCTION "public"."remove_tenant_member"("p_tenant_id" "uuid", "p_user_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
DECLARE
  v_target_role text;
  v_gestores_restantes integer;
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

  SELECT role INTO v_target_role
  FROM public.tenant_members
  WHERE tenant_id = p_tenant_id AND user_id = p_user_id;

  IF v_target_role IN ('admin', 'owner') THEN
    SELECT count(*) INTO v_gestores_restantes
    FROM public.tenant_members
    WHERE tenant_id = p_tenant_id
      AND role IN ('admin', 'owner')
      AND user_id <> p_user_id;

    IF v_gestores_restantes = 0 THEN
      RAISE EXCEPTION 'cannot_remove_last_admin';
    END IF;
  END IF;

  DELETE FROM public.tenant_members
  WHERE tenant_id = p_tenant_id AND user_id = p_user_id;
END;
$$;
