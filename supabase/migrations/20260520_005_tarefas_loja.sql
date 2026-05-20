-- ============================================================
-- PILOTO Onda 02 — Migration 01 (arquivo: 20260520_005)
-- Data: 2026-05-20
-- Autor: Wandson via Claude Code
-- Motivo: Criar tabela tarefas_loja — coração do pipeline de
--         consultoria. Cada loja recebe tarefas organizadas por
--         bloco (identidade, cardápio, operação…) com ciclo de
--         vida completo desde rascunho até conclusão.
--         Campo analise_id vincula opcionalmente à análise iFood
--         (ligação completa prevista na Onda 04).
-- Risco: BAIXO — tabela nova; sem ALTER em tabelas existentes.
--        Trigger reutiliza função update_lojas_updated_at() já
--        existente (criada em 20260519_001_alter_lojas_piloto.sql).
-- Reversão:
--   DROP TRIGGER IF EXISTS tarefas_loja_updated_at ON tarefas_loja;
--   DROP TABLE IF EXISTS tarefas_loja;
--
-- Nota sobre numeração: 20260520_001–004 já existem (módulo chat).
--   Esta migration recebe o sufixo _005 para manter sequência.
--   O usuário solicitou o nome "20260520_001_tarefas_loja" mas a
--   numeração correta é _005 para evitar conflito de nome de arquivo.
-- ============================================================

BEGIN;

-- ============================================================
-- 1. TABELA PRINCIPAL
-- ============================================================

CREATE TABLE IF NOT EXISTS tarefas_loja (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loja_id     uuid NOT NULL REFERENCES lojas(id) ON DELETE CASCADE,
  analise_id  uuid REFERENCES analises(id) ON DELETE SET NULL,  -- ligação opcional Onda 04

  -- Categorização
  bloco             text    NOT NULL CHECK (bloco IN (
    'identidade', 'cardapio', 'operacao',
    'avaliacoes', 'marketing', 'suporte'
  )),
  ordem_no_bloco    integer NOT NULL DEFAULT 0,

  -- Conteúdo
  titulo            text    NOT NULL,
  situacao          text    NOT NULL,
  o_que_sera_feito  text    NOT NULL,
  por_que_importa   text,

  -- Estado
  status    text NOT NULL CHECK (status IN (
    'rascunho',
    'aguardando_envio',
    'aguardando_aprovacao',
    'aprovada',
    'rejeitada',
    'em_execucao',
    'aguardando_validacao',
    'concluida',
    'cancelada'
  )) DEFAULT 'rascunho',

  prioridade  text CHECK (prioridade IN (
    'quick_win', 'estrutural', 'material_cliente'
  )) DEFAULT 'estrutural',

  -- Datas de ciclo de vida
  prazo_estimado  date,
  aprovada_em     timestamptz,
  executada_em    timestamptz,
  concluida_em    timestamptz,

  -- Atribuição
  responsavel_id  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Metadados livres
  metadata  jsonb    DEFAULT '{}',
  tags      text[]   DEFAULT '{}',

  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

COMMENT ON TABLE tarefas_loja IS
  'Tarefas de consultoria organizadas por bloco e loja. '
  'Ciclo de vida: rascunho → aprovada → concluida (ou cancelada). '
  'Núcleo do pipeline PILOTO Onda 02.';

COMMENT ON COLUMN tarefas_loja.analise_id IS
  'FK opcional para analises. Preenchida quando a tarefa nasce de '
  'uma análise iFood automatizada (Onda 04). NULL = tarefa manual.';
COMMENT ON COLUMN tarefas_loja.bloco IS
  'Agrupamento de trabalho: identidade, cardapio, operacao, '
  'avaliacoes, marketing, suporte.';
COMMENT ON COLUMN tarefas_loja.ordem_no_bloco IS
  'Posição da tarefa dentro do bloco — controla ordenação no Kanban.';
COMMENT ON COLUMN tarefas_loja.situacao IS
  'Descrição do estado atual da loja referente a este ponto. '
  'Texto livre gerado pelo consultor ou pela IA.';
COMMENT ON COLUMN tarefas_loja.o_que_sera_feito IS
  'Ação concreta a executar. Obrigatório para criar a tarefa.';
COMMENT ON COLUMN tarefas_loja.prioridade IS
  'quick_win = impacto rápido/baixo esforço; '
  'estrutural = muda algo fundamental; '
  'material_cliente = demanda material do cliente.';
COMMENT ON COLUMN tarefas_loja.metadata IS
  'Bag JSON para extensões futuras sem ALTER TABLE '
  '(ex: link de drive, id externo, notas de rejeição).';

-- ============================================================
-- 2. ÍNDICES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_tarefas_loja
  ON tarefas_loja(loja_id);

CREATE INDEX IF NOT EXISTS idx_tarefas_status
  ON tarefas_loja(status);

CREATE INDEX IF NOT EXISTS idx_tarefas_bloco
  ON tarefas_loja(loja_id, bloco, ordem_no_bloco);

CREATE INDEX IF NOT EXISTS idx_tarefas_responsavel
  ON tarefas_loja(responsavel_id);

-- Índice parcial para tarefas abertas (filtragem mais comum)
CREATE INDEX IF NOT EXISTS idx_tarefas_abertas
  ON tarefas_loja(loja_id, status)
  WHERE status NOT IN ('concluida', 'cancelada');

-- ============================================================
-- 3. RLS — ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE tarefas_loja ENABLE ROW LEVEL SECURITY;

-- Política SELECT: qualquer membro do tenant vê tarefas das lojas do seu tenant
-- Padrão Onda 01: lojas → tenant_members (user_roles NÃO tem tenant_id)
DO $$ BEGIN
  CREATE POLICY "Ver tarefas do proprio tenant"
    ON tarefas_loja FOR SELECT
    USING (
      EXISTS (
        SELECT 1
        FROM lojas l
        JOIN tenant_members tm ON tm.tenant_id = l.tenant_id
        WHERE l.id = tarefas_loja.loja_id
          AND tm.user_id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END$$;

-- Política ALL (INSERT/UPDATE/DELETE):
--   admins e consultores_senior do tenant  OR  consultor atribuído à loja via loja_consultores
DO $$ BEGIN
  CREATE POLICY "Gerenciar tarefas: admins, consultores_senior e consultores atribuidos"
    ON tarefas_loja FOR ALL
    USING (
      -- Caso 1: admin ou consultor_senior do tenant
      EXISTS (
        SELECT 1
        FROM lojas l
        JOIN tenant_members tm ON tm.tenant_id = l.tenant_id
        JOIN user_roles ur     ON ur.user_id    = tm.user_id
        JOIN roles r           ON r.id          = ur.role_id
                              AND r.tenant_id   = l.tenant_id
        WHERE l.id          = tarefas_loja.loja_id
          AND tm.user_id    = auth.uid()
          AND r.name        IN ('admin', 'consultor_senior')
      )
      OR
      -- Caso 2: consultor ativo atribuído à loja
      EXISTS (
        SELECT 1
        FROM loja_consultores lc
        WHERE lc.loja_id  = tarefas_loja.loja_id
          AND lc.user_id  = auth.uid()
          AND lc.ativo    = true
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END$$;

-- ============================================================
-- 4. TRIGGER updated_at
--    Reutiliza update_lojas_updated_at() (20260519_001).
--    Envolto em DO $$ para idempotência.
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname   = 'tarefas_loja_updated_at'
      AND tgrelid  = 'tarefas_loja'::regclass
  ) THEN
    CREATE TRIGGER tarefas_loja_updated_at
      BEFORE UPDATE ON tarefas_loja
      FOR EACH ROW
      EXECUTE FUNCTION update_lojas_updated_at();
  END IF;
END$$;

COMMIT;
