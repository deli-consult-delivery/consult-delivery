-- RPC para admin/owner editar o display_name de um membro do tenant
-- Atualiza tenant_members.display_name diretamente (não auth.users)
-- Também atualiza get_tenant_members para dar prioridade a display_name sobre auth metadata
-- Reversão: DROP FUNCTION public.update_member_display_name(uuid,uuid,text);
--           Recriar get_tenant_members com COALESCE original.

CREATE OR REPLACE FUNCTION public.update_member_display_name(
  p_tenant_id    uuid,
  p_user_id      uuid,
  p_display_name text
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

GRANT EXECUTE ON FUNCTION public.update_member_display_name(uuid, uuid, text) TO authenticated;

-- Atualiza get_tenant_members: display_name tem prioridade sobre raw_user_meta_data
-- Seguro: usuários sem display_name continuam usando o fallback de auth metadata
CREATE OR REPLACE FUNCTION public.get_tenant_members(p_tenant_id uuid)
RETURNS TABLE (
  user_id         uuid,
  role            text,
  display_name    text,
  email           text,
  full_name       text,
  last_sign_in_at timestamptz,
  joined_at       timestamptz
)
SECURITY DEFINER
SET search_path = public, auth
LANGUAGE sql
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

GRANT EXECUTE ON FUNCTION public.get_tenant_members(uuid) TO authenticated;