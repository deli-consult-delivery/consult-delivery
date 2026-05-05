-- Migration: colunas para eventos Evolution API (v2)
-- Necessárias para: CONNECTION_UPDATE, MESSAGES_UPDATE, MESSAGES_DELETE
-- ATENÇÃO: não aplicar sem aprovação do Wandson

-- Rastrear quando a instância foi vista pela última vez (CONNECTION_UPDATE state='open')
ALTER TABLE evolution_instances
  ADD COLUMN IF NOT EXISTS last_seen timestamptz;

-- Status de entrega das mensagens (MESSAGES_UPDATE)
-- Valores Evolution API: 0=erro, 1=pendente, 2=servidor, 3=entregue, 4=lido
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS delivery_status smallint;

-- Soft delete de mensagens (MESSAGES_DELETE)
-- Preservar histórico — nunca deletar fisicamente
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
