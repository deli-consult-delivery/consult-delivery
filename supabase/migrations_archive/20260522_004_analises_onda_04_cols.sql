-- Migration: 20260522_004_analises_onda_04_cols.sql
-- Data: 2026-05-22
-- Autor: Wandson (via Claude Code)
-- Motivo: Adicionar colunas necessárias para Onda 04 (WhatsApp + Loom) na tabela legada `analises`.
--         A tabela já existe e está em uso ativo pelo analise-ifood (9 rows, tipo_analise='ifood').
--         Usamos ADD COLUMN IF NOT EXISTS para ser idempotente e não quebrar reexecuções.
-- Risco: Baixo — colunas novas com default NULL/0, sem alterar colunas existentes.
--        A policy "members can manage analises" (ALL via tenant_id) já cobre as novas colunas.
--        NÃO adicionamos novas policies para evitar conflito com fluxo legado.
-- Mapeamento de nomes (spec vs legado):
--   spec: `created_by`  → tabela real: `criado_por` (mesmo campo, uuid REFERENCES auth.users)
--   Código da Onda 04 deve usar `criado_por` ao inserir/ler em `analises`. NÃO adicionar `created_by`.
--
-- Reversão:
--   ALTER TABLE analises DROP COLUMN IF EXISTS loja_id;
--   ALTER TABLE analises DROP COLUMN IF EXISTS loom_url;
--   ALTER TABLE analises DROP COLUMN IF EXISTS transcricao;
--   ALTER TABLE analises DROP COLUMN IF EXISTS tipo;
--   ALTER TABLE analises DROP COLUMN IF EXISTS agent_run_id;
--   ALTER TABLE analises DROP COLUMN IF EXISTS relatorio_markdown;
--   ALTER TABLE analises DROP COLUMN IF EXISTS resumo_executivo;
--   ALTER TABLE analises DROP COLUMN IF EXISTS total_tarefas_geradas;
--   ALTER TABLE analises DROP COLUMN IF EXISTS enviada_em;
--   ALTER TABLE analises DROP COLUMN IF EXISTS enviada_via;
--   ALTER TABLE analises DROP COLUMN IF EXISTS message_id_evolution;
--   DROP INDEX IF EXISTS idx_analises_loja_onda04;

-- Colunas Onda 04 para tabela analises (legada analise-ifood)
-- NÃO mexer em colunas existentes, NÃO remover policies existentes.
-- Sem BEGIN/COMMIT — cada ALTER TABLE é auto-commit.

ALTER TABLE analises
  ADD COLUMN IF NOT EXISTS loja_id uuid REFERENCES lojas(id) ON DELETE CASCADE;

COMMENT ON COLUMN analises.loja_id IS
  'Referência à loja (lojas.id). Onda 04: permite vincular análise diretamente a uma loja sem depender de cliente_id.';

ALTER TABLE analises
  ADD COLUMN IF NOT EXISTS loom_url text;

COMMENT ON COLUMN analises.loom_url IS
  'URL do vídeo Loom gravado durante a análise. Onda 04: entregue junto com o relatório via WhatsApp.';

ALTER TABLE analises
  ADD COLUMN IF NOT EXISTS transcricao text;

COMMENT ON COLUMN analises.transcricao IS
  'Transcrição gerada a partir do áudio do vídeo Loom (via Whisper/AssemblyAI).';

-- NOTA: campo `tipo` é NOVO e diferente de `tipo_analise` que já existe.
-- tipo_analise = 'ifood' (legado). tipo = discriminador Onda 04 (ex: 'loom_analise', 'analise_completa').
ALTER TABLE analises
  ADD COLUMN IF NOT EXISTS tipo text;

COMMENT ON COLUMN analises.tipo IS
  'Discriminador Onda 04 para subtipo da análise (ex: loom_analise, analise_completa). Diferente de tipo_analise (legado).';

ALTER TABLE analises
  ADD COLUMN IF NOT EXISTS agent_run_id uuid REFERENCES agent_runs(id) ON DELETE SET NULL;

COMMENT ON COLUMN analises.agent_run_id IS
  'Referência ao run do agente Trigger.dev que gerou esta análise (agent_runs.id). Para rastreabilidade.';

ALTER TABLE analises
  ADD COLUMN IF NOT EXISTS relatorio_markdown text;

COMMENT ON COLUMN analises.relatorio_markdown IS
  'Relatório completo da análise em formato Markdown. Alternativa ao html_relatorio para uso em WhatsApp/Loom.';

ALTER TABLE analises
  ADD COLUMN IF NOT EXISTS resumo_executivo text;

COMMENT ON COLUMN analises.resumo_executivo IS
  'Resumo executivo curto (3-5 parágrafos) enviado via WhatsApp ao cliente/loja.';

ALTER TABLE analises
  ADD COLUMN IF NOT EXISTS total_tarefas_geradas integer DEFAULT 0;

COMMENT ON COLUMN analises.total_tarefas_geradas IS
  'Contador de tarefas geradas automaticamente a partir desta análise (denormalizado para performance).';

ALTER TABLE analises
  ADD COLUMN IF NOT EXISTS enviada_em timestamptz;

COMMENT ON COLUMN analises.enviada_em IS
  'Timestamp de quando a análise foi enviada ao destinatário (WhatsApp ou outro canal).';

ALTER TABLE analises
  ADD COLUMN IF NOT EXISTS enviada_via text;

COMMENT ON COLUMN analises.enviada_via IS
  'Canal pelo qual a análise foi enviada (ex: whatsapp, email). Sem CHECK constraint — validação feita no app.';

ALTER TABLE analises
  ADD COLUMN IF NOT EXISTS message_id_evolution text;

COMMENT ON COLUMN analises.message_id_evolution IS
  'ID da mensagem retornado pela Evolution API ao enviar. Usado para rastrear status de entrega.';

-- Índice para queries Onda 04: buscar análises por loja ordenadas por data
CREATE INDEX IF NOT EXISTS idx_analises_loja_onda04
  ON analises(loja_id, created_at DESC)
  WHERE loja_id IS NOT NULL;
