-- TD#20: Sessão WhatsApp encerra automaticamente quando todas as tarefas são processadas.
-- Adiciona coluna encerrada_em para registrar o timestamp de encerramento da sessão.

ALTER TABLE whatsapp_aprovacao_sessions
  ADD COLUMN IF NOT EXISTS encerrada_em TIMESTAMP WITH TIME ZONE;
