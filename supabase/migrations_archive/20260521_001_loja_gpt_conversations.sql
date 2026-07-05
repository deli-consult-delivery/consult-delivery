-- Migration: 20260521_001_loja_gpt_conversations.sql
-- Data: 2026-05-21
-- Autor: Wandson (via Claude Code)
-- Motivo: Armazenar conversas GPT/IA vinculadas a uma loja, permitindo histórico
--         persistente de consultas por loja, controle de custo por conversa e
--         arquivamento. Fundação para o módulo de consultoria IA por loja.
-- Risco: Baixo — tabela nova, sem impacto em queries existentes.
-- Reversão: DROP TABLE IF EXISTS loja_gpt_conversations;

BEGIN;

CREATE TABLE IF NOT EXISTS loja_gpt_conversations (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  loja_id             uuid        NOT NULL REFERENCES lojas(id) ON DELETE CASCADE,
  iniciada_por        uuid        REFERENCES auth.users(id) ON DELETE SET NULL,

  titulo              text,
  resumo_curto        text,

  total_messages      integer     NOT NULL DEFAULT 0,
  ultima_message_em   timestamptz,
  custo_total_usd     numeric(10,6) NOT NULL DEFAULT 0,
  arquivada           boolean     NOT NULL DEFAULT false,

  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE loja_gpt_conversations IS
  'Conversas GPT/IA vinculadas a uma loja. Permite histórico persistente, controle de custo e arquivamento por conversa.';

COMMENT ON COLUMN loja_gpt_conversations.loja_id IS
  'Loja à qual esta conversa pertence. Cascade delete garante limpeza ao remover loja.';

COMMENT ON COLUMN loja_gpt_conversations.iniciada_por IS
  'Usuário que iniciou a conversa. SET NULL ao deletar usuário preserva o histórico.';

COMMENT ON COLUMN loja_gpt_conversations.titulo IS
  'Título gerado automaticamente ou editado pelo usuário para identificar o assunto da conversa.';

COMMENT ON COLUMN loja_gpt_conversations.resumo_curto IS
  'Resumo em 1-2 frases gerado pela IA ao final ou a cada N mensagens. Facilita listagem.';

COMMENT ON COLUMN loja_gpt_conversations.total_messages IS
  'Contador denormalizado de mensagens. Atualizado pela aplicação a cada insert em loja_gpt_messages.';

COMMENT ON COLUMN loja_gpt_conversations.ultima_message_em IS
  'Timestamp da última mensagem. Usado para ordenar conversas recentes na listagem.';

COMMENT ON COLUMN loja_gpt_conversations.custo_total_usd IS
  'Custo acumulado em USD das chamadas à API de IA. Calculado a partir dos tokens consumidos.';

COMMENT ON COLUMN loja_gpt_conversations.arquivada IS
  'Se true, conversa não aparece na listagem padrão. Soft archive sem deleção de dados.';

CREATE INDEX idx_lgc_loja    ON loja_gpt_conversations(loja_id, ultima_message_em DESC);
CREATE INDEX idx_lgc_user    ON loja_gpt_conversations(iniciada_por);
CREATE INDEX idx_lgc_tenant  ON loja_gpt_conversations(arquivada) WHERE NOT arquivada;

CREATE TRIGGER trg_lgc_updated_at
  BEFORE UPDATE ON loja_gpt_conversations
  FOR EACH ROW EXECUTE FUNCTION update_lojas_updated_at();

ALTER TABLE loja_gpt_conversations ENABLE ROW LEVEL SECURITY;

-- SELECT: qualquer membro do mesmo tenant da loja
CREATE POLICY "lgc_select" ON loja_gpt_conversations
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM lojas l
      JOIN tenant_members tm ON tm.tenant_id = l.tenant_id
      WHERE l.id = loja_gpt_conversations.loja_id
        AND tm.user_id = auth.uid()
    )
  );

-- INSERT: usuário autenticado define como dono
CREATE POLICY "lgc_insert" ON loja_gpt_conversations
  FOR INSERT
  WITH CHECK (iniciada_por = auth.uid());

-- UPDATE: dono da conversa OU admin do tenant
CREATE POLICY "lgc_update" ON loja_gpt_conversations
  FOR UPDATE
  USING (
    iniciada_por = auth.uid()
    OR EXISTS (
      SELECT 1 FROM lojas l
      JOIN tenant_members tm ON tm.tenant_id = l.tenant_id
      WHERE l.id = loja_gpt_conversations.loja_id
        AND tm.user_id = auth.uid()
        AND tm.role = 'admin'
    )
  );

COMMIT;
