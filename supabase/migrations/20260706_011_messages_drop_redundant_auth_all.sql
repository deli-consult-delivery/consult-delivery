-- 20260706_011_messages_drop_redundant_auth_all.sql
-- Auditoria RLS geral (docs/seguranca/RLS-AUDIT-2026-07.md) — P0 #1.
--
-- public.messages tem 4 policies corretamente escopadas por tenant/membership
-- (messages_select_tenant, messages_insert_tenant, messages_update_tenant via
-- accessible_tenant_ids(); messages_member_all cobre ALL via is_member_of()) --
-- MAS convive com uma 5a policy solta, "messages_auth_all" (FOR ALL TO
-- authenticated USING(true) WITH CHECK(true)). Policies permissivas do
-- Postgres sao combinadas com OR: essa 5a policy sozinha ja libera qualquer
-- usuario autenticado (qualquer tenant, qualquer role) a ler/editar/apagar
-- QUALQUER mensagem de QUALQUER conversa de QUALQUER outro tenant -- as 4
-- policies corretas viram enfeite. Mesmo padrao do bug corrigido em
-- 20260706_007 pra `reviews` (policy ampla nao removida quando o escopo por
-- tenant foi introduzido), so que aqui e o CONTEUDO DAS CONVERSAS DE
-- WHATSAPP de TODOS os clientes de TODOS os tenants -- maior blast radius
-- do lote desta auditoria.
--
-- Consumidores investigados (grep .from('messages') em src/, 32 ocorrencias,
-- 10 arquivos -- toda a feature de chat: ChatV2.jsx, ChatScreen.jsx,
-- ChatAoVivoV2.jsx, useAcoesMsg/useConversas/useEnvio/useEvolutionHealth/
-- useIA/useThread.js, lib/api.js): TODAS as queries reais filtram por
-- tenant_id ou conversation_id (que pertence a um tenant via `conversations`).
-- Nenhum consumidor depende do acesso irrestrito de messages_auth_all --
-- dropar essa policy nao muda nenhum comportamento legitimo, so fecha o
-- vazamento cross-tenant.
--
-- Aditivo/reversivel (DROP POLICY e reversivel por CREATE). Idempotente
-- (DROP POLICY IF EXISTS).
--
-- Rollback:
--   CREATE POLICY "messages_auth_all" ON public.messages
--     FOR ALL TO authenticated USING (true) WITH CHECK (true);

BEGIN;

DROP POLICY IF EXISTS "messages_auth_all" ON public.messages;

COMMIT;

-- ============================================================================
-- TESTE DE ISOLAMENTO (NAO EXECUTAR AQUI -- rodar a parte, manualmente, apos
-- aplicar; pede um user_id real de tenant A e de tenant B com mensagens).
-- Esperado:
--   membro do tenant A -> ve só mensagens de conversas do tenant A (via
--                          messages_select_tenant/messages_member_all)
--   membro do tenant B -> 0 linhas ao tentar ler mensagens do tenant A
-- ============================================================================
--
-- BEGIN;
-- SET LOCAL role authenticated;
-- SELECT set_config('request.jwt.claims', json_build_object('sub', '<uuid membro tenant B>')::text, true);
-- SELECT count(*) AS deve_ser_zero FROM public.messages WHERE tenant_id = '<uuid tenant A>';
-- ROLLBACK;
--
-- BEGIN;
-- SET LOCAL role authenticated;
-- SELECT set_config('request.jwt.claims', json_build_object('sub', '<uuid membro tenant A>')::text, true);
-- SELECT count(*) AS deve_continuar_igual FROM public.messages WHERE tenant_id = '<uuid tenant A>';
-- ROLLBACK;
