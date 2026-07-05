ALTER TABLE breno_triagem
  ADD COLUMN IF NOT EXISTS confirmado      boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS confirmado_em   timestamptz,
  ADD COLUMN IF NOT EXISTS acao_confirmada text        CHECK (acao_confirmada IN ('suporte','amanha','ignorar'));
