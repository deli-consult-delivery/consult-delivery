-- Remove duplicatas de mensagens inbound (Evolution API dispara webhook múltiplas vezes).
-- Mantém o registro mais antigo por whatsapp_msg_id.
DELETE FROM messages
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (PARTITION BY whatsapp_msg_id ORDER BY created_at ASC, id ASC) AS rn
    FROM messages
    WHERE whatsapp_msg_id IS NOT NULL
  ) t
  WHERE rn > 1
);

-- Índice UNIQUE parcial: garante idempotência mesmo sob requisições concorrentes.
CREATE UNIQUE INDEX IF NOT EXISTS messages_whatsapp_msg_id_unique
  ON messages (whatsapp_msg_id)
  WHERE whatsapp_msg_id IS NOT NULL;
