-- 20260706_009_reviews_authenticated_update_fix.sql
-- Corrige uma REGRESSAO introduzida pela 20260706_007 (ja aplicada em prod),
-- achada na revisao da 20260706_008 (ecc:security-reviewer).
--
-- A 007 escopou "service_full_access" para `TO service_role` (fechando o
-- vazamento p/ authenticated/anon) e adicionou "reviews_select_agencia"
-- (SELECT, TO authenticated) -- mas NAO criou nenhuma policy de UPDATE p/
-- authenticated. Resultado: desde a 007, todo UPDATE feito pelo painel
-- interno do consultor (src/console/PainelAvaliacoesConsultor.jsx,
-- sbUpdate/sbUpdateNote -- marcar sent_to_client/published, editar draft,
-- salvar nota) roda sob RLS SEM NENHUMA policy que autorize `authenticated`
-- a escrever em `reviews`. O Postgres so aplica UPDATE nas linhas que
-- passam por alguma policy (nenhuma aqui) -- 0 linhas afetadas, sem erro
-- (o codigo nao usa .select() apos o update, entao a UI nao percebe:
-- "sucesso" silencioso sem persistir nada).
--
-- Fix: policy de UPDATE p/ authenticated com a MESMA condicao de
-- "reviews_select_agencia" (membro do tenant agencia) -- restaura a escrita
-- do painel interno sem reabrir p/ nenhum outro tenant/role.
--
-- Aditivo/reversivel. Idempotente: DROP POLICY IF EXISTS + CREATE.
--
-- Rollback:
--   DROP POLICY IF EXISTS "reviews_update_agencia" ON public.reviews;

BEGIN;

DROP POLICY IF EXISTS "reviews_update_agencia" ON public.reviews;
CREATE POLICY "reviews_update_agencia" ON public.reviews
  FOR UPDATE
  TO authenticated
  USING ('9079bd4d-4df7-4023-90fb-d79c8ba7e900' IN (SELECT public.accessible_tenant_ids()))
  WITH CHECK ('9079bd4d-4df7-4023-90fb-d79c8ba7e900' IN (SELECT public.accessible_tenant_ids()));

COMMIT;

-- ============================================================================
-- TESTE (NAO EXECUTAR AQUI -- rodar a parte apos aplicar). Esperado:
--   membro da agencia    -> UPDATE em qualquer review afeta 1 linha
--   membro cd-demo/outro -> UPDATE afeta 0 linhas
-- ============================================================================
--
-- BEGIN;
-- SET LOCAL role authenticated;
-- SELECT set_config('request.jwt.claims', json_build_object('sub','<uuid membro agencia>')::text, true);
-- UPDATE public.reviews SET notes = 'teste-isolamento' WHERE id = (SELECT id FROM public.reviews LIMIT 1);
-- -- esperado: UPDATE 1
-- ROLLBACK;
--
-- BEGIN;
-- SET LOCAL role authenticated;
-- SELECT set_config('request.jwt.claims', json_build_object('sub','<uuid membro cd-demo>')::text, true);
-- UPDATE public.reviews SET notes = 'teste-isolamento' WHERE id = (SELECT id FROM public.reviews LIMIT 1);
-- -- esperado: UPDATE 0
-- ROLLBACK;
