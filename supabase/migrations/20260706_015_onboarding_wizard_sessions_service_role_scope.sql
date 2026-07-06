-- 20260706_015_onboarding_wizard_sessions_service_role_scope.sql
-- Auditoria RLS geral (docs/seguranca/RLS-AUDIT-2026-07.md) — P1 #1.
--
-- public.onboarding_wizard_sessions tem "wizard_sessions_authenticated_select"
-- (FOR SELECT TO authenticated USING(true)) -- qualquer usuário logado no
-- Console, de qualquer tenant, lê email/whatsapp/cnpj/nome_negocio/
-- faturamento_mensal_range de TODOS os leads em onboarding de TODOS os
-- tenants. PII de prospecção cross-tenant. Não é `anon` (exige login), por
-- isso P1 e não P0.
--
-- Consumidores investigados: grep 'onboarding_wizard_sessions' em src/,
-- bridge-server/, trigger/ -- ZERO ocorrências no front (nenhum
-- `.from('onboarding_wizard_sessions')` client-side). O único consumidor
-- real é bridge-server/routes/wizard-publico.js, que só usa `sbFetch`/
-- `supabaseInsert` -- helpers do Bridge com SUPABASE_SERVICE_ROLE_KEY
-- (bypassa RLS por padrão). Ou seja, a policy `TO authenticated` nunca
-- teve consumidor legítimo -- é uma porta aberta sem uso.
--
-- Fix: escopa a policy pra `TO service_role` (mesmo raciocínio do fix de
-- `deli_agenda` em 20260706_012) -- redundante pra quem já bypassa RLS,
-- fecha o vazamento pra qualquer authenticated sem afetar ninguém real.
--
-- RESIDUAL: se existir alguma ferramenta de BI/relatório FORA deste repo
-- (Metabase, Retool etc.) conectando com um usuário `authenticated` pra ler
-- esta tabela, ela vai parar de funcionar -- não encontramos evidência de
-- uma no repo, mas é o tipo de consumidor que um grep não pega. Verificar
-- antes de aplicar.
--
-- Aditivo/reversivel. Idempotente (DROP POLICY IF EXISTS + CREATE).
--
-- Rollback:
--   DROP POLICY IF EXISTS "wizard_sessions_authenticated_select" ON public.onboarding_wizard_sessions;
--   CREATE POLICY "wizard_sessions_authenticated_select" ON public.onboarding_wizard_sessions
--     FOR SELECT TO authenticated USING (true);

BEGIN;

DROP POLICY IF EXISTS "wizard_sessions_authenticated_select" ON public.onboarding_wizard_sessions;
CREATE POLICY "wizard_sessions_authenticated_select" ON public.onboarding_wizard_sessions
  FOR SELECT
  TO service_role
  USING (true);

COMMIT;

-- ============================================================================
-- TESTE DE ISOLAMENTO (NAO EXECUTAR AQUI -- rodar a parte). Esperado:
--   SELECT via authenticated (qualquer login) -> 0 linhas (RLS bloqueia)
--   SELECT via service_role (Bridge)          -> continua OK
--   POST /api/wizard/... (wizard-publico.js, service_role por trás)
--     -> continua funcionando normalmente (não depende desta policy)
-- ============================================================================
--
-- BEGIN;
-- SET LOCAL role authenticated;
-- SELECT set_config('request.jwt.claims', json_build_object('sub', '<uuid de qualquer usuario logado>')::text, true);
-- SELECT count(*) AS deve_ser_zero FROM public.onboarding_wizard_sessions;
-- ROLLBACK;
