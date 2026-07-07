-- 20260707_008_cvnovas_referencia_rls_authenticated_scope.sql
-- Fix da validação smoke (#843): as 12 policies das 3 tabelas de referência
-- do CvNovas (Provedores de IA, Integrações, Sistemas externos) — 3 SELECT
-- (baseline) + 9 INSERT/UPDATE/DELETE (20260707_004) — não declaram cláusula
-- TO, o que no Postgres significa TO PUBLIC (anon + authenticated), em vez
-- de TO authenticated como o restante do endurecimento RLS do projeto
-- (ver 20260706_013_canais_internos_remove_anon_access.sql).
--
--   - tenant_provedores   (select/insert/update/delete)
--   - tenant_integracoes  (select/insert/update/delete)
--   - tenant_sistemas     (select/insert/update/delete)
--
-- Investigado (READ-ONLY, sem aplicar): nenhuma das 12 precisa valer para
-- anon. A condição USING/WITH CHECK de todas é public.is_member_of(tenant_id),
-- que resolve via public.accessible_tenant_ids() -> tenant_members WHERE
-- user_id = auth.uid(). Para o role anon, auth.uid() é NULL, então a
-- condição já é sempre falsa hoje -- restringir TO authenticated não muda
-- comportamento para ninguém, só remove o role supérfluo da ACL da policy
-- (defesa em profundidade, fecha a divergência apontada pela #843).
-- Consumidor único (grep em src/): src/console/CvNovas.jsx, renderizado só
-- dentro do ConsoleV2 (App.jsx só roteia LoginScreen/ResetPasswordScreen/
-- ConsoleV2 -- Console clássico aposentado). Nenhum consumidor anônimo.
--
-- Fix MINIMO: DROP + CREATE de cada policy com a MESMA condição, só
-- adicionando TO authenticated. Aditivo/reversível. Idempotente (DROP POLICY
-- IF EXISTS + CREATE).
--
-- NÃO aplicar aqui -- a orquestradora aplica via MCP/CLI.

BEGIN;

-- tenant_provedores
DROP POLICY IF EXISTS "tenant_provedores_select" ON public.tenant_provedores;
CREATE POLICY "tenant_provedores_select" ON public.tenant_provedores
  FOR SELECT TO authenticated
  USING (public.is_member_of(tenant_id));

DROP POLICY IF EXISTS "tenant_provedores_insert" ON public.tenant_provedores;
CREATE POLICY "tenant_provedores_insert" ON public.tenant_provedores
  FOR INSERT TO authenticated
  WITH CHECK (public.is_member_of(tenant_id));

DROP POLICY IF EXISTS "tenant_provedores_update" ON public.tenant_provedores;
CREATE POLICY "tenant_provedores_update" ON public.tenant_provedores
  FOR UPDATE TO authenticated
  USING (public.is_member_of(tenant_id)) WITH CHECK (public.is_member_of(tenant_id));

DROP POLICY IF EXISTS "tenant_provedores_delete" ON public.tenant_provedores;
CREATE POLICY "tenant_provedores_delete" ON public.tenant_provedores
  FOR DELETE TO authenticated
  USING (public.is_member_of(tenant_id));

-- tenant_integracoes
DROP POLICY IF EXISTS "tenant_integracoes_select" ON public.tenant_integracoes;
CREATE POLICY "tenant_integracoes_select" ON public.tenant_integracoes
  FOR SELECT TO authenticated
  USING (public.is_member_of(tenant_id));

DROP POLICY IF EXISTS "tenant_integracoes_insert" ON public.tenant_integracoes;
CREATE POLICY "tenant_integracoes_insert" ON public.tenant_integracoes
  FOR INSERT TO authenticated
  WITH CHECK (public.is_member_of(tenant_id));

DROP POLICY IF EXISTS "tenant_integracoes_update" ON public.tenant_integracoes;
CREATE POLICY "tenant_integracoes_update" ON public.tenant_integracoes
  FOR UPDATE TO authenticated
  USING (public.is_member_of(tenant_id)) WITH CHECK (public.is_member_of(tenant_id));

DROP POLICY IF EXISTS "tenant_integracoes_delete" ON public.tenant_integracoes;
CREATE POLICY "tenant_integracoes_delete" ON public.tenant_integracoes
  FOR DELETE TO authenticated
  USING (public.is_member_of(tenant_id));

-- tenant_sistemas
DROP POLICY IF EXISTS "tenant_sistemas_select" ON public.tenant_sistemas;
CREATE POLICY "tenant_sistemas_select" ON public.tenant_sistemas
  FOR SELECT TO authenticated
  USING (public.is_member_of(tenant_id));

DROP POLICY IF EXISTS "tenant_sistemas_insert" ON public.tenant_sistemas;
CREATE POLICY "tenant_sistemas_insert" ON public.tenant_sistemas
  FOR INSERT TO authenticated
  WITH CHECK (public.is_member_of(tenant_id));

DROP POLICY IF EXISTS "tenant_sistemas_update" ON public.tenant_sistemas;
CREATE POLICY "tenant_sistemas_update" ON public.tenant_sistemas
  FOR UPDATE TO authenticated
  USING (public.is_member_of(tenant_id)) WITH CHECK (public.is_member_of(tenant_id));

DROP POLICY IF EXISTS "tenant_sistemas_delete" ON public.tenant_sistemas;
CREATE POLICY "tenant_sistemas_delete" ON public.tenant_sistemas
  FOR DELETE TO authenticated
  USING (public.is_member_of(tenant_id));

COMMIT;

-- ROLLBACK (reversível — recria as policies sem cláusula TO, = PUBLIC):
-- BEGIN;
-- DROP POLICY IF EXISTS "tenant_provedores_select" ON public.tenant_provedores;
-- CREATE POLICY "tenant_provedores_select" ON public.tenant_provedores FOR SELECT USING (public.is_member_of(tenant_id));
-- DROP POLICY IF EXISTS "tenant_provedores_insert" ON public.tenant_provedores;
-- CREATE POLICY "tenant_provedores_insert" ON public.tenant_provedores FOR INSERT WITH CHECK (public.is_member_of(tenant_id));
-- DROP POLICY IF EXISTS "tenant_provedores_update" ON public.tenant_provedores;
-- CREATE POLICY "tenant_provedores_update" ON public.tenant_provedores FOR UPDATE USING (public.is_member_of(tenant_id)) WITH CHECK (public.is_member_of(tenant_id));
-- DROP POLICY IF EXISTS "tenant_provedores_delete" ON public.tenant_provedores;
-- CREATE POLICY "tenant_provedores_delete" ON public.tenant_provedores FOR DELETE USING (public.is_member_of(tenant_id));
-- DROP POLICY IF EXISTS "tenant_integracoes_select" ON public.tenant_integracoes;
-- CREATE POLICY "tenant_integracoes_select" ON public.tenant_integracoes FOR SELECT USING (public.is_member_of(tenant_id));
-- DROP POLICY IF EXISTS "tenant_integracoes_insert" ON public.tenant_integracoes;
-- CREATE POLICY "tenant_integracoes_insert" ON public.tenant_integracoes FOR INSERT WITH CHECK (public.is_member_of(tenant_id));
-- DROP POLICY IF EXISTS "tenant_integracoes_update" ON public.tenant_integracoes;
-- CREATE POLICY "tenant_integracoes_update" ON public.tenant_integracoes FOR UPDATE USING (public.is_member_of(tenant_id)) WITH CHECK (public.is_member_of(tenant_id));
-- DROP POLICY IF EXISTS "tenant_integracoes_delete" ON public.tenant_integracoes;
-- CREATE POLICY "tenant_integracoes_delete" ON public.tenant_integracoes FOR DELETE USING (public.is_member_of(tenant_id));
-- DROP POLICY IF EXISTS "tenant_sistemas_select" ON public.tenant_sistemas;
-- CREATE POLICY "tenant_sistemas_select" ON public.tenant_sistemas FOR SELECT USING (public.is_member_of(tenant_id));
-- DROP POLICY IF EXISTS "tenant_sistemas_insert" ON public.tenant_sistemas;
-- CREATE POLICY "tenant_sistemas_insert" ON public.tenant_sistemas FOR INSERT WITH CHECK (public.is_member_of(tenant_id));
-- DROP POLICY IF EXISTS "tenant_sistemas_update" ON public.tenant_sistemas;
-- CREATE POLICY "tenant_sistemas_update" ON public.tenant_sistemas FOR UPDATE USING (public.is_member_of(tenant_id)) WITH CHECK (public.is_member_of(tenant_id));
-- DROP POLICY IF EXISTS "tenant_sistemas_delete" ON public.tenant_sistemas;
-- CREATE POLICY "tenant_sistemas_delete" ON public.tenant_sistemas FOR DELETE USING (public.is_member_of(tenant_id));
-- COMMIT;

-- ============================================================================
-- TESTE DE ISOLAMENTO (NÃO EXECUTAR AQUI -- rodar à parte). Esperado:
--   SELECT via anon (sem JWT, só a anon key)  -> 0 linhas nas 3 tabelas
--   SELECT via authenticated (membro do tenant) -> continua igual a hoje
-- ============================================================================
--
-- BEGIN;
-- SET LOCAL role anon;
-- SELECT count(*) AS deve_ser_zero FROM public.tenant_provedores;
-- SELECT count(*) AS deve_ser_zero FROM public.tenant_integracoes;
-- SELECT count(*) AS deve_ser_zero FROM public.tenant_sistemas;
-- ROLLBACK;
--
-- BEGIN;
-- SET LOCAL role authenticated;
-- SELECT set_config('request.jwt.claims', json_build_object('sub', '<uuid de qualquer usuario logado>')::text, true);
-- SELECT count(*) AS deve_continuar_igual FROM public.tenant_provedores;
-- ROLLBACK;
