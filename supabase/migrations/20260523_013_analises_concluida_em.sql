-- T6/G6: análise encerra quando todas as tarefas são concluídas.
-- Adiciona concluida_em e expande status CHECK para incluir 'concluida'.

ALTER TABLE analises
  ADD COLUMN IF NOT EXISTS concluida_em TIMESTAMP WITH TIME ZONE;

ALTER TABLE analises
  DROP CONSTRAINT IF EXISTS analises_status_check;

ALTER TABLE analises
  ADD CONSTRAINT analises_status_check
    CHECK (status IN (
      'pending', 'processing', 'done', 'error',
      'rascunho', 'processando', 'processada', 'erro',
      'enviada_cliente', 'concluida'
    ));
