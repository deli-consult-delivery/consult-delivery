-- Fase 6 (Dashboard iFood) — idempotência forte dos rascunhos gerados pela IA.
--
-- O diagnóstico-semanal cria rascunhos em tarefas_loja a partir dos sinais da loja
-- e já deduplica por (loja_id, metadata->>'origem') via SELECT-then-filter. Esse
-- filtro cobre re-execução sequencial (o retry enxerga as linhas da tentativa
-- anterior), mas NÃO uma corrida concorrente (dois runs sobrepostos cujo SELECT
-- ainda não vê o INSERT um do outro). Este índice único parcial é o backstop:
-- garante no máximo 1 rascunho IA ATIVO por (loja_id, origem). Origens terminais
-- (concluída/cancelada/rejeitada) ficam fora do índice, então um novo ciclo pode
-- recriar a recomendação depois que a anterior foi encerrada.
--
-- Aditivo/reversível. Verificado antes de aplicar: índice ainda não existe; nenhum
-- par (loja_id, origem) duplicado entre tarefas IA não-terminais; 0 tarefas IA hoje.
-- Reverter: DROP INDEX IF EXISTS uq_tarefa_ia_origem_ativa;

CREATE UNIQUE INDEX IF NOT EXISTS uq_tarefa_ia_origem_ativa
  ON tarefas_loja (loja_id, (metadata->>'origem'))
  WHERE criado_por_ia AND status NOT IN ('concluida', 'cancelada', 'rejeitada');
