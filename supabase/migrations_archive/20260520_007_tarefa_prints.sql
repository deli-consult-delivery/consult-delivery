-- ============================================================
-- PILOTO Onda 02 — Migration 03 (arquivo: 20260520_007)
-- Data: 2026-05-20
-- Autor: Wandson via Claude Code
-- Motivo: Criar tabela tarefa_prints — metadados de imagens
--         (antes/depois/referência) associadas a tarefas de
--         consultoria. Arquivos ficam no Supabase Storage;
--         esta tabela armazena apenas o path e metadados.
--         Prints são evidências do trabalho executado e podem
--         ser enviados ao cliente no relatório da Onda 02.
-- Risco: BAIXO — tabela nova; sem ALTER em tabelas existentes.
-- Reversão:
--   DROP TABLE IF EXISTS tarefa_prints;
-- ============================================================

BEGIN;

-- ============================================================
-- 1. TABELA
-- ============================================================

CREATE TABLE IF NOT EXISTS tarefa_prints (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tarefa_id   uuid NOT NULL REFERENCES tarefas_loja(id) ON DELETE CASCADE,

  -- Localização no Supabase Storage
  storage_path  text NOT NULL,  -- path dentro do bucket (ex: "prints/loja-id/arquivo.png")
  url_publica   text,           -- URL signed gerada pelo Bridge; renovável

  legenda text,
  tipo    text CHECK (tipo IN ('antes', 'depois', 'referencia', 'aprovacao_cliente')),

  enviado_por   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  enviado_em    timestamptz DEFAULT now()
);

COMMENT ON TABLE tarefa_prints IS
  'Metadados de prints (imagens) associados a tarefas de consultoria. '
  'O arquivo físico fica no Supabase Storage; este registro guarda o '
  'path e URL signed para exibição no modal e no relatório.';

COMMENT ON COLUMN tarefa_prints.storage_path IS
  'Caminho relativo dentro do bucket Supabase Storage. '
  'Formato esperado: prints/{loja_id}/{uuid}.{ext}';
COMMENT ON COLUMN tarefa_prints.url_publica IS
  'URL signed gerada pelo Bridge Server. Válida por período definido. '
  'NULL até o primeiro request de download.';
COMMENT ON COLUMN tarefa_prints.tipo IS
  'Contexto do print: antes (situação pré-intervenção), '
  'depois (resultado pós-execução), referencia (material de apoio), '
  'aprovacao_cliente (evidência de aprovação recebida).';

-- ============================================================
-- 2. ÍNDICES
-- ============================================================

-- Galeria de uma tarefa (consulta principal do modal)
CREATE INDEX IF NOT EXISTS idx_prints_tarefa
  ON tarefa_prints(tarefa_id);

-- Filtragem por tipo dentro de uma tarefa
CREATE INDEX IF NOT EXISTS idx_prints_tarefa_tipo
  ON tarefa_prints(tarefa_id, tipo);

-- ============================================================
-- 3. RLS — ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE tarefa_prints ENABLE ROW LEVEL SECURITY;

-- SELECT: qualquer membro do tenant vê os prints da tarefa
DO $$ BEGIN
  CREATE POLICY "Ver prints do proprio tenant"
    ON tarefa_prints FOR SELECT
    USING (
      EXISTS (
        SELECT 1
        FROM tarefas_loja t
        JOIN lojas l           ON l.id          = t.loja_id
        JOIN tenant_members tm ON tm.tenant_id   = l.tenant_id
        WHERE t.id        = tarefa_prints.tarefa_id
          AND tm.user_id  = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END$$;

-- INSERT: membro do tenant pode enviar prints
-- (consultor atribuído ou qualquer membro — upload é ação de baixo risco;
--  associação correta com tarefa já garante escopo correto)
DO $$ BEGIN
  CREATE POLICY "Enviar prints: membros do tenant"
    ON tarefa_prints FOR INSERT
    WITH CHECK (
      EXISTS (
        SELECT 1
        FROM tarefas_loja t
        JOIN lojas l           ON l.id          = t.loja_id
        JOIN tenant_members tm ON tm.tenant_id   = l.tenant_id
        WHERE t.id        = tarefa_prints.tarefa_id
          AND tm.user_id  = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END$$;

-- Sem DELETE/UPDATE por ora: prints são evidências; remoção via Bridge
-- com aprovação explícita (futuro).

COMMIT;
