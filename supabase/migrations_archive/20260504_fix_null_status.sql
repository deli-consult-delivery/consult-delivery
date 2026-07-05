-- PATCH: Corrigir conversas com status NULL
-- Após aplicar a migration 20260504_conversation_status.sql, conversas criadas
-- ANTES da migration ou por edge functions sem status ficaram com NULL.
-- Este patch atualiza todas para 'aguardando'.
--
-- Rode no Supabase SQL Editor (Dashboard → SQL Editor → New query)

UPDATE conversations
SET status = 'aguardando'
WHERE status IS NULL;

-- Verificação: contagem por status após correção
SELECT status, COUNT(*) AS total
FROM conversations
GROUP BY status
ORDER BY total DESC;
