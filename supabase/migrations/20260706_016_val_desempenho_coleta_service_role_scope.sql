-- 20260706_016_val_desempenho_coleta_service_role_scope.sql
-- Auditoria RLS geral (docs/seguranca/RLS-AUDIT-2026-07.md) — P1 #2.
--
-- public.val_desempenho_coleta tem "val_desempenho_read" (FOR SELECT TO
-- authenticated USING(true)) -- qualquer usuário logado, de qualquer
-- tenant, vê métricas de desempenho de TODAS as lojas monitoradas (a
-- tabela não tem tenant_id, só `loja` texto -- nunca poderia ser escopada
-- por accessible_tenant_ids() sem uma coluna nova). Dado operacional
-- interno (coleta de validação/homologação do agente GESTOR), não é PII
-- nem dado de cliente final -- por isso P1 e não P0.
--
-- Consumidores investigados: grep 'val_desempenho_coleta' em TODO o repo
-- (src/, bridge-server/, trigger/, migrations) -- ZERO ocorrências fora da
-- própria definição da tabela/policy no baseline. Nenhuma tela, rota ou
-- task lê ou escreve esta tabela hoje neste repo -- é povoada por processo
-- externo (fora deste repo).
--
-- Fix: escopa a policy pra `TO service_role` (mesmo raciocínio de
-- 20260706_012/015) -- fecha o SELECT aberto pra qualquer authenticated
-- sem consumidor conhecido; se algum dia uma tela do Console precisar
-- ler isto, o caminho correto é via Bridge (service_role), como o resto
-- do app já faz.
--
-- RESIDUAL: se existir uma ferramenta externa (BI, script de coleta,
-- Retool) lendo esta tabela com um usuário `authenticated` direto no
-- Supabase, ela vai parar -- verificar antes de aplicar (não achamos
-- evidência disso no repo, mas é dado alimentado de fora).
--
-- Aditivo/reversivel. Idempotente.
--
-- Rollback:
--   DROP POLICY IF EXISTS "val_desempenho_read" ON public.val_desempenho_coleta;
--   CREATE POLICY "val_desempenho_read" ON public.val_desempenho_coleta
--     FOR SELECT TO authenticated USING (true);

BEGIN;

DROP POLICY IF EXISTS "val_desempenho_read" ON public.val_desempenho_coleta;
CREATE POLICY "val_desempenho_read" ON public.val_desempenho_coleta
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
-- SELECT count(*) AS deve_ser_zero FROM public.val_desempenho_coleta;
-- ROLLBACK;
