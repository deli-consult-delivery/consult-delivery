-- 20260706_013_canais_internos_remove_anon_access.sql
-- Auditoria RLS geral (docs/seguranca/RLS-AUDIT-2026-07.md) — P0 #3.
--
-- 3 tabelas dos "canais internos" (chat interno da equipe/agentes, dentro do
-- Console) têm policy FOR ALL sem NENHUMA cláusula TO (= PUBLIC, que no
-- Postgres cobre TANTO anon QUANTO authenticated) com USING(true)/WITH
-- CHECK(true):
--   - channel_members    ("allow_all_channel_members")
--   - channel_messages   ("allow_all_channel_messages")
--   - internal_channels  ("allow_all_internal_channels")
--
-- Como o Console usa a anon key do Supabase (publica no bundle, GitHub Pages
-- -- ver app.consultdelivery.com.br), isso significa que QUALQUER PESSOA NA
-- INTERNET, sem login nenhum, consegue ler/inserir/editar/apagar QUALQUER
-- linha nessas 3 tabelas: conteudo do chat interno da equipe (mensagens,
-- media_url), lista de quem esta em qual canal, e os proprios canais.
--
-- Consumidores investigados (grep em src/): src/console/chat/engine/
-- useCanaisInternos.js (internal_channels + channel_messages), src/console/
-- Grupos.jsx (channel_members), src/console/chat/ChatAoVivoV2.jsx,
-- src/screens/ChatScreen.jsx, src/App.jsx (so subscribe realtime). TODOS
-- ficam dentro do Console (ConsoleV2), que so e alcancado apos login --
-- App.jsx so roteia LoginScreen/ResetPasswordScreen/ConsoleV2 ("Console
-- classico aposentado"). Nenhum consumidor legitimo e anonimo.
--
-- Fix MINIMO e conservador: tira o anon do escopo (TO authenticated), SEM
-- mudar USING(true)/WITH CHECK(true) -- qualquer usuario logado continua
-- com o MESMO comportamento de hoje (nenhuma quebra pra quem ja usa o chat
-- interno). Escopo fino por canal/membership (so quem e channel_member ve
-- as mensagens daquele canal) fica registrado como debito P1 no relatorio
-- de auditoria -- exige decisao de produto sobre o modelo de permissao
-- (hoje parece ser "qualquer membro do time ve tudo", que pode ser
-- intencional pro tamanho atual da equipe).
--
-- Aditivo/reversivel. Idempotente (DROP POLICY IF EXISTS + CREATE).
--
-- Rollback:
--   DROP POLICY IF EXISTS "allow_all_channel_members" ON public.channel_members;
--   CREATE POLICY "allow_all_channel_members" ON public.channel_members USING (true) WITH CHECK (true);
--   DROP POLICY IF EXISTS "allow_all_channel_messages" ON public.channel_messages;
--   CREATE POLICY "allow_all_channel_messages" ON public.channel_messages USING (true) WITH CHECK (true);
--   DROP POLICY IF EXISTS "allow_all_internal_channels" ON public.internal_channels;
--   CREATE POLICY "allow_all_internal_channels" ON public.internal_channels USING (true) WITH CHECK (true);

BEGIN;

DROP POLICY IF EXISTS "allow_all_channel_members" ON public.channel_members;
CREATE POLICY "allow_all_channel_members" ON public.channel_members
  TO authenticated
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "allow_all_channel_messages" ON public.channel_messages;
CREATE POLICY "allow_all_channel_messages" ON public.channel_messages
  TO authenticated
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "allow_all_internal_channels" ON public.internal_channels;
CREATE POLICY "allow_all_internal_channels" ON public.internal_channels
  TO authenticated
  USING (true) WITH CHECK (true);

COMMIT;

-- ============================================================================
-- TESTE DE ISOLAMENTO (NAO EXECUTAR AQUI -- rodar a parte). Esperado:
--   SELECT via anon (sem JWT, so a anon key)  -> 0 linhas nas 3 tabelas
--   SELECT via authenticated (qualquer login) -> continua igual a hoje
-- ============================================================================
--
-- BEGIN;
-- SET LOCAL role anon;
-- SELECT count(*) AS deve_ser_zero FROM public.channel_messages;
-- SELECT count(*) AS deve_ser_zero FROM public.channel_members;
-- SELECT count(*) AS deve_ser_zero FROM public.internal_channels;
-- ROLLBACK;
--
-- BEGIN;
-- SET LOCAL role authenticated;
-- SELECT set_config('request.jwt.claims', json_build_object('sub', '<uuid de qualquer usuario logado>')::text, true);
-- SELECT count(*) AS deve_continuar_igual FROM public.channel_messages;
-- ROLLBACK;
