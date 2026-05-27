-- RPCs de gestão de membros do tenant
-- update_member_role: admin/owner muda o role de outro membro (não pode alterar o próprio)
-- remove_tenant_member: admin/owner remove membro (não pode se auto-remover)
-- Reversão: DROP FUNCTION public.update_member_role(uuid,uuid,text); DROP FUNCTION public.remove_tenant_member(uuid,uuid);

CREATE OR REPLACE FUNCTION public.update_member_role(
  p_tenant_id uuid,
  p_user_id   uuid,
  p_new_role  text
)
RETURNS void
SECURITY DEFINER
SET search_path = public, auth
LANGUAGE plpgsql
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

GRANT EXECUTE ON FUNCTION public.update_member_role(uuid, uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.remove_tenant_member(
  p_tenant_id uuid,
  p_user_id   uuid
)
RETURNS void
SECURITY DEFINER
SET search_path = public, auth
LANGUAGE plpgsql
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

GRANT EXECUTE ON FUNCTION public.remove_tenant_member(uuid, uuid) TO authenticated;
