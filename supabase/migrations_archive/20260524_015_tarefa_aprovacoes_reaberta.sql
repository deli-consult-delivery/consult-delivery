-- Migration: adicionar 'reaberta' ao check constraint tarefa_aprovacoes.acao
-- Necessário para o endpoint POST /api/tarefas/:id/reabrir (TD#35, Onda 07 F2)

ALTER TABLE tarefa_aprovacoes
  DROP CONSTRAINT tarefa_aprovacoes_acao_check;

ALTER TABLE tarefa_aprovacoes
  ADD CONSTRAINT tarefa_aprovacoes_acao_check
  CHECK (acao = ANY (ARRAY[
    'enviada_aprovacao'::text,
    'aprovada'::text,
    'rejeitada'::text,
    'perguntou_duvida'::text,
    'iniciou_execucao'::text,
    'submeteu_validacao'::text,
    'concluiu'::text,
    'reabriu'::text,
    'reaberta'::text
  ]));
