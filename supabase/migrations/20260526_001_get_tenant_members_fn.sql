-- Migration: 20260526_001_get_tenant_members_fn.sql
-- Data: 2026-05-26
-- Autor: Wandson (via Claude Code)
-- Motivo: O frontend precisa listar membros de um tenant com email e last_sign_in_at,
--         mas auth.users não é acessível diretamente pelo cliente (RLS bloqueia).
--         Uma função SECURITY DEFINER roda com privilégios de superuser/postgres,
--         permitindo o JOIN em auth.users de forma segura e controlada.
--         A segurança é garantida pela cláusula EXISTS que verifica se o caller
--         pertence ao mesmo tenant — nenhum membro pode listar outros tenants.
-- Risco: Baixo — função somente leitura, sem escrita. Expõe apenas dados de membros
--        do próprio tenant do caller. Não expõe tokens, passwords ou dados sensíveis.
-- Reversão: DROP FUNCTION public.get_tenant_members(uuid);

BEGIN;

-- RPC acessível pelo cliente para listar membros do tenant com dados de auth.users
CREATE OR REPLACE FUNCTION public.get_tenant_members(p_tenant_id uuid)
RETURNS TABLE (
  user_id      uuid,
  role         text,
  display_name text,
  email        text,
  full_name    text,
  last_sign_in_at timestamptz,
  joined_at    timestamptz
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

COMMENT ON FUNCTION public.get_tenant_members(uuid) IS
  'Lista membros do tenant com dados de auth.users (email, last_sign_in_at). '
  'SECURITY DEFINER: acessa auth.users sem expor ao cliente. '
  'Segurança: só retorna dados se auth.uid() já é membro do mesmo tenant (p_tenant_id).';

GRANT EXECUTE ON FUNCTION public.get_tenant_members(uuid) TO authenticated;

COMMIT;
