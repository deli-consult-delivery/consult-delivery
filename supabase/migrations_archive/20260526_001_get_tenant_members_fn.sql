-- RPC acessível pelo cliente para listar membros do tenant com dados de auth.users
-- auth.users não é acessível direto do client (RLS bloqueia); SECURITY DEFINER permite o JOIN de forma segura.
-- Segurança: EXISTS garante que apenas membros do próprio tenant podem ver outros membros.
-- Reversão: DROP FUNCTION public.get_tenant_members(uuid);

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
      u.raw_user_meta_data->>'full_name',
      tm.display_name,
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
