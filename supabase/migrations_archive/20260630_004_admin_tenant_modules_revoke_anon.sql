-- 20260630_004_admin_tenant_modules_revoke_anon.sql
-- Hardening do advisor de segurança: as funções de 20260630_003 ficaram chamáveis
-- pelo papel `anon` (default privilege do Supabase concede EXECUTE a anon/authenticated;
-- o REVOKE FROM public da 003 não removia o grant herdado por anon).
-- As funções já eram seguras (check interno admin_is_platform_operator levanta exceção),
-- mas tirar anon fecha o advisor (defense-in-depth).
--
-- admin_is_platform_operator é helper interno: chamado dentro das funções SECURITY DEFINER
-- (que rodam como owner), não precisa de EXECUTE para nenhum papel cliente.
--
-- Aditivo/reversível (só GRANT/REVOKE).

REVOKE EXECUTE ON FUNCTION public.admin_get_tenant_modules(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_set_tenant_modules(uuid, jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.admin_is_platform_operator() FROM PUBLIC, anon, authenticated;
