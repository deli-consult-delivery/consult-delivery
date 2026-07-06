-- 20260706_012_deli_agenda_insert_service_role_scope.sql
-- Auditoria RLS geral (docs/seguranca/RLS-AUDIT-2026-07.md) — P0 #2.
--
-- public.deli_agenda tem a policy "service role can insert deli_agenda" --
-- mas o CREATE POLICY original NAO tem `TO service_role` (mesmo bug de
-- nomeação-nao-bate-com-escopo do "service_full_access" de `reviews`, achado
-- e corrigido em 20260706_007). Sem TO, a policy vale pra QUALQUER role,
-- INCLUSIVE anon -- ou seja, com só a anon key (publica no bundle do
-- Console), qualquer um na internet consegue INSERIR linhas arbitrarias em
-- deli_agenda p/ QUALQUER tenant_id (WITH CHECK(true), sem validar
-- pertencimento). deli_agenda alimenta o que Deli.jsx/DeliScreen.jsx exibem
-- como "revisão matinal" da DELI (alertas/acoes_sugeridas) -- um atacante
-- poderia forjar uma "recomendação da DELI" fake pro Wandson ver no painel.
-- A policy de leitura ("tenant members can read deli_agenda", USING
-- accessible_tenant_ids()) já está correta -- só a escrita está aberta.
--
-- Consumidores investigados:
--   - trigger/deli/revisao-matinal.ts (unico INSERT real no repo) usa
--     getSupabase() (trigger/_shared/supabase.ts) com SUPABASE_SERVICE_ROLE_KEY
--     -- service_role tem BYPASSRLS por padrão no Supabase, então NUNCA
--     dependeu desta policy pra inserir (ela era só uma porta destrancada
--     do lado de fora, sem uso legítimo).
--   - src/console/Deli.jsx e src/screens/DeliScreen.jsx só fazem .select()
--     (leitura), nunca .insert() -- confirmado por grep.
-- Escopar pra `TO service_role` fecha o buraco sem afetar NENHUM consumidor
-- real (redundante para quem já bypassa RLS; só existe como
-- segurança-em-profundidade, mesmo raciocínio do fix de `reviews`).
--
-- Aditivo/reversivel. Idempotente (DROP POLICY IF EXISTS + CREATE).
--
-- Rollback:
--   DROP POLICY IF EXISTS "service role can insert deli_agenda" ON public.deli_agenda;
--   CREATE POLICY "service role can insert deli_agenda" ON public.deli_agenda
--     FOR INSERT WITH CHECK (true);

BEGIN;

DROP POLICY IF EXISTS "service role can insert deli_agenda" ON public.deli_agenda;
CREATE POLICY "service role can insert deli_agenda" ON public.deli_agenda
  FOR INSERT
  TO service_role
  WITH CHECK (true);

COMMIT;

-- ============================================================================
-- TESTE DE ISOLAMENTO (NAO EXECUTAR AQUI -- rodar a parte). Esperado:
--   INSERT via anon (sem token nenhum) -> bloqueado pelo RLS (0 linhas, erro
--                                          de policy se RETURNING for pedido)
--   INSERT via service_role (chave real do Bridge/Trigger.dev) -> continua OK
-- ============================================================================
--
-- BEGIN;
-- SET LOCAL role anon;
-- -- tipo precisa ser um dos valores de deli_agenda_tipo_check (revisao_matinal
-- -- | supervisao | alerta) -- 'teste-isolamento' violaria o CHECK antes de
-- -- chegar no RLS e mascararia o teste.
-- INSERT INTO public.deli_agenda (tenant_id, tipo, resumo)
--   VALUES ((SELECT id FROM public.tenants LIMIT 1), 'alerta', 'teste de isolamento RLS');
-- -- esperado: erro "new row violates row-level security policy"
-- ROLLBACK;
