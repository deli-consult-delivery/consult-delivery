-- 20260706_017_val_kpi_coleta_diaria_service_role_scope.sql
-- Auditoria RLS geral (docs/seguranca/RLS-AUDIT-2026-07.md) — P1 #3.
--
-- public.val_kpi_coleta_diaria tem "val_kpi_read" (FOR SELECT TO
-- authenticated USING(true)) -- mesma situação de val_desempenho_coleta
-- (20260706_016): qualquer usuário logado, de qualquer tenant, vê KPIs
-- diários (pedidos/cancelamentos/semáforo/motivo_semaforo) de TODAS as
-- lojas monitoradas. Tabela sem tenant_id (só `loja` texto). Dado
-- operacional interno do agente GESTOR, não é PII/dado de cliente final.
--
-- Consumidores investigados: grep 'val_kpi_coleta_diaria' em TODO o repo
-- (src/, bridge-server/, trigger/, migrations) -- ZERO ocorrências fora da
-- própria definição da tabela/policy no baseline. Povoada por processo
-- externo (fora deste repo); nenhuma tela/rota/task lê isto hoje.
--
-- Fix: escopa a policy pra `TO service_role` (mesmo padrão de
-- 20260706_012/015/016).
--
-- RESIDUAL: mesma ressalva de 20260706_016 -- se uma ferramenta externa ler
-- isto com um usuário `authenticated` direto, ela vai parar. Verificar
-- antes de aplicar.
--
-- Aditivo/reversivel. Idempotente.
--
-- Rollback:
--   DROP POLICY IF EXISTS "val_kpi_read" ON public.val_kpi_coleta_diaria;
--   CREATE POLICY "val_kpi_read" ON public.val_kpi_coleta_diaria
--     FOR SELECT TO authenticated USING (true);

BEGIN;

DROP POLICY IF EXISTS "val_kpi_read" ON public.val_kpi_coleta_diaria;
CREATE POLICY "val_kpi_read" ON public.val_kpi_coleta_diaria
  FOR SELECT
  TO service_role
  USING (true);

COMMIT;

-- ============================================================================
-- TESTE DE ISOLAMENTO (NAO EXECUTAR AQUI -- rodar a parte). Esperado:
--   SELECT via authenticated -> 0 linhas
--   SELECT via service_role  -> continua OK
-- ============================================================================
--
-- BEGIN;
-- SET LOCAL role authenticated;
-- SELECT set_config('request.jwt.claims', json_build_object('sub', '<uuid de qualquer usuario logado>')::text, true);
-- SELECT count(*) AS deve_ser_zero FROM public.val_kpi_coleta_diaria;
-- ROLLBACK;
