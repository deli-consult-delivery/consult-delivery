-- Migration: 20260521_002_loja_gpt_messages.sql
-- Data: 2026-05-21
-- Autor: Wandson (via Claude Code)
-- Motivo: Armazenar mensagens individuais de cada conversa GPT/IA por loja,
--         incluindo rastreamento de fontes consultadas, custo por mensagem,
--         tokens e modelo usado. INSERT somente via service role (Trigger.dev).
-- Risco: Baixo — tabela nova, depende de loja_gpt_conversations (criada em 001).
-- Reversão: DROP TABLE IF EXISTS loja_gpt_messages;

BEGIN;

CREATE TABLE IF NOT EXISTS loja_gpt_messages (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id         uuid        NOT NULL REFERENCES loja_gpt_conversations(id) ON DELETE CASCADE,

  role                    text        NOT NULL CHECK (role IN ('user', 'assistant', 'tool')),
  conteudo                text        NOT NULL,

  fontes_consultadas      jsonb       NOT NULL DEFAULT '[]',
  contexto_loja_snapshot  jsonb,

  tokens_input            integer,
  tokens_output           integer,
  custo_usd               numeric(10,6),
  duracao_ms              integer,
  modelo                  text,

  autor_user_id           uuid        REFERENCES auth.users(id) ON DELETE SET NULL,

  created_at              timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE loja_gpt_messages IS
  'Mensagens individuais de conversas GPT/IA. INSERT exclusivo via service role (Trigger.dev). Clientes leem via RLS herdada da conversa.';

COMMENT ON COLUMN loja_gpt_messages.role IS
  'Papel da mensagem: user (consultor que perguntou), assistant (resposta da IA), tool (resultado de tool call). System prompt é parâmetro separado na API, não gravado como linha.';

COMMENT ON COLUMN loja_gpt_messages.fontes_consultadas IS
  'Array JSON de fontes usadas pela IA: [{tipo, arquivo, trecho}]. Populado pelo helper knowledge-base.ts.';

COMMENT ON COLUMN loja_gpt_messages.contexto_loja_snapshot IS
  'Snapshot do contexto da loja no momento da chamada (output de buildLojaContexto). Para auditoria e debug.';

COMMENT ON COLUMN loja_gpt_messages.modelo IS
  'Modelo Anthropic usado, ex: claude-sonnet-4-6. Registrado para rastreamento de custo e comparação.';

COMMENT ON COLUMN loja_gpt_messages.autor_user_id IS
  'Preenchido apenas quando role=user. Identifica qual consultor enviou a mensagem.';

CREATE INDEX idx_lgm_conv ON loja_gpt_messages(conversation_id, created_at);
CREATE INDEX idx_lgm_role ON loja_gpt_messages(conversation_id, role);

ALTER TABLE loja_gpt_messages ENABLE ROW LEVEL SECURITY;

-- SELECT: herdado via conversation → loja → tenant_members
CREATE POLICY "lgm_select" ON loja_gpt_messages
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM loja_gpt_conversations c
      JOIN lojas l ON l.id = c.loja_id
      JOIN tenant_members tm ON tm.tenant_id = l.tenant_id
      WHERE c.id = loja_gpt_messages.conversation_id
        AND tm.user_id = auth.uid()
    )
  );

-- Sem policy INSERT/UPDATE/DELETE para usuários autenticados.
-- INSERT é feito exclusivamente pelo service role (Trigger.dev / bridge-server).

COMMIT;
