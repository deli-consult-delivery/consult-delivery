-- 20260706_014_messages_backfill_tenant_id.sql
-- Auditoria RLS geral (docs/seguranca/RLS-AUDIT-2026-07.md) — segue P0 #1
-- (ver 20260706_011_messages_drop_redundant_auth_all.sql).
--
-- Achado na revisão do PR #776: dropar "messages_auth_all" fecha o vazamento
-- cross-tenant, mas descobre um problema separado -- 927 linhas em prod têm
-- `messages.tenant_id IS NULL`. Sem a policy solta como rede de segurança,
-- essas linhas ficam órfãs de RLS pra UPDATE/DELETE:
--   - "messages_select_tenant"/"messages_update_tenant" JÁ têm um fallback
--     pra tenant_id NULL (via conversation_id -> conversations.tenant_id) --
--     SELECT e UPDATE dessas 927 linhas continuam funcionando.
--   - "messages_member_all" (FOR ALL, cobre DELETE) usa só
--     is_member_of(tenant_id) -- is_member_of(NULL) nunca casa com
--     nenhum usuário. Sem "messages_auth_all", DELETE dessas 927 linhas
--     vira NO-OP SILENCIOSO pra qualquer authenticated (RLS filtra a
--     linha, 0 afetadas, sem erro -- mesmo padrão do bug de UPDATE
--     silencioso corrigido em 20260706_009 pra `reviews`).
--
-- Fix: backfill de tenant_id a partir da conversa (toda mensagem pertence a
-- uma conversa, e conversa quase sempre tem tenant_id) -- elimina a raiz
-- (linhas com tenant_id NULL) em vez de reescrever a policy de DELETE.
-- Linhas cuja conversa TAMBÉM não tem tenant_id (órfã de verdade) continuam
-- NULL -- não há de onde inferir; ficam sinalizadas no count "depois".
--
-- APLICAR ANTES de 20260706_011 (a orquestradora aplica nesta ordem) -- se
-- rodar depois, DELETE dessas linhas já estaria no-op no meio tempo, mas o
-- backfill em si não depende da ordem (só idempotência).
--
-- Aditivo, idempotente: WHERE tenant_id IS NULL garante que rodar 2x não
-- reafeta nenhuma linha já preenchida (segunda rodada = 0 linhas).
--
-- Rollback: N/A (backfill de dado, não de schema/policy -- não há snapshot
-- de "quais linhas estavam NULL antes" pra reverter com segurança; reverter
-- significaria voltar a NULL um tenant_id que na verdade é o correto,
-- inferido da própria conversa da mensagem).

BEGIN;

UPDATE public.messages
SET tenant_id = c.tenant_id
FROM public.conversations c
WHERE messages.conversation_id = c.id
  AND messages.tenant_id IS NULL
  AND c.tenant_id IS NOT NULL;

COMMIT;

-- ============================================================================
-- TESTE (rodar ANTES e DEPOIS de aplicar -- não precisa de transação, é só
-- leitura). Esperado: "depois" bem menor que "antes"; idealmente 0 (só fica
-- > 0 se existir mensagem cuja própria conversa também não tem tenant_id --
-- aí não há como inferir e a linha continua órfã, sinalizada aqui).
-- ============================================================================
--
-- SELECT count(*) AS antes FROM public.messages WHERE tenant_id IS NULL;
-- -- (aplicar a migration)
-- SELECT count(*) AS depois FROM public.messages WHERE tenant_id IS NULL;
-- SELECT count(*) AS orfas_sem_conversa_com_tenant
--   FROM public.messages m
--   WHERE m.tenant_id IS NULL
--     AND NOT EXISTS (
--       SELECT 1 FROM public.conversations c
--       WHERE c.id = m.conversation_id AND c.tenant_id IS NOT NULL
--     );
