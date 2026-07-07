-- 20260707_007_is_pending_tenant_member_rpc.sql
-- Follow-up da revisão do PR #832: POST /users/resend-invite (bridge) não
-- validava se o e-mail pertence a um tenant_member PENDENTE daquele tenant
-- antes de chamar o GoTrue — um admin podia reenviar convite (e portanto
-- forçar o envio de e-mail de "invite" da Supabase) pra qualquer endereço,
-- confirmado ou não, mesmo de fora do tenant.
--
-- RPC nova (chamada pelo bridge via service key, por isso SEM checagem de
-- auth.uid() — o gate de "quem pode reenviar" já é feito na rota, checando
-- se o CALLER é admin/owner do tenant_id antes de chamar esta função; esta
-- função só confirma que o E-MAIL ALVO é um membro pendente do MESMO tenant).
--
-- Aditivo/reversível/idempotente (CREATE OR REPLACE).
-- Rollback: DROP FUNCTION IF EXISTS public.is_pending_tenant_member(uuid, text);

CREATE OR REPLACE FUNCTION public.is_pending_tenant_member(p_tenant_id uuid, p_email text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tenant_members tm
    JOIN auth.users u ON u.id = tm.user_id
    WHERE tm.tenant_id = p_tenant_id
      AND lower(u.email) = lower(p_email)
      AND u.last_sign_in_at IS NULL
  );
$$;
