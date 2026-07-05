-- ============================================================
-- PILOTO Onda 02 — Migration 02 (arquivo: 20260520_006)
-- Data: 2026-05-20
-- Autor: Wandson via Claude Code
-- Motivo: Criar tabela tarefa_aprovacoes — log imutável de todas as
--         ações do ciclo de vida de uma tarefa (envio, aprovação,
--         rejeição, execução, conclusão). Rastreabilidade completa
--         para auditoria e para a timeline do modal de tarefa no
--         frontend. Cada evento é um registro novo; nunca se edita.
-- Risco: BAIXO — tabela nova; sem ALTER em tabelas existentes.
-- Reversão:
--   DROP TABLE IF EXISTS tarefa_aprovacoes;
-- ============================================================

BEGIN;

-- ============================================================
-- 1. TABELA
-- ============================================================

CREATE TABLE IF NOT EXISTS tarefa_aprovacoes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tarefa_id   uuid NOT NULL REFERENCES tarefas_loja(id) ON DELETE CASCADE,

  -- Ação registrada neste evento
  acao        text NOT NULL CHECK (acao IN (
    'enviada_aprovacao',
    'aprovada',
    'rejeitada',
    'perguntou_duvida',
    'iniciou_execucao',
    'submeteu_validacao',
    'concluiu',
    'reabriu'
  )),

  -- Quem fez a ação
  feita_por_tipo      text CHECK (feita_por_tipo IN ('consultor', 'cliente', 'sistema')),
  feita_por_user_id   uuid REFERENCES auth.users(id) ON DELETE SET NULL,  -- usuário interno
  feita_por_cliente_id uuid,   -- reservado para Onda 04 (cliente externo autenticado)
  feita_via           text CHECK (feita_via IN ('plataforma', 'whatsapp', 'email', 'chat')),

  comentario  text,
  metadata    jsonb DEFAULT '{}',

  created_at  timestamptz DEFAULT now()
);

COMMENT ON TABLE tarefa_aprovacoes IS
  'Log imutável de eventos do ciclo de vida de cada tarefa. '
  'Cada ação (aprovação, rejeição, execução…) gera um novo registro. '
  'Nunca é editado — serve como histórico e timeline no modal.';

COMMENT ON COLUMN tarefa_aprovacoes.acao IS
  'Tipo do evento: enviada_aprovacao | aprovada | rejeitada | '
  'perguntou_duvida | iniciou_execucao | submeteu_validacao | concluiu | reabriu.';
COMMENT ON COLUMN tarefa_aprovacoes.feita_por_tipo IS
  'Origem da ação: consultor (interno), cliente (externo) ou sistema (automação).';
COMMENT ON COLUMN tarefa_aprovacoes.feita_por_cliente_id IS
  'Reservado para Onda 04: cliente externo com identidade própria. '
  'NULL nesta onda — aprovação manual via plataforma.';
COMMENT ON COLUMN tarefa_aprovacoes.feita_via IS
  'Canal pelo qual a ação foi registrada: plataforma | whatsapp | email | chat.';
COMMENT ON COLUMN tarefa_aprovacoes.metadata IS
  'Bag JSON para dados extras sem ALTER TABLE '
  '(ex: snapshot do status anterior, delta de campos alterados).';

-- ============================================================
-- 2. ÍNDICES
-- ============================================================

-- Consulta principal: histórico de uma tarefa em ordem cronológica
CREATE INDEX IF NOT EXISTS idx_aprovacoes_tarefa
  ON tarefa_aprovacoes(tarefa_id, created_at DESC);

-- Filtragem por tipo de ação (ex: todas as aprovações pendentes de um tenant)
CREATE INDEX IF NOT EXISTS idx_aprovacoes_acao
  ON tarefa_aprovacoes(acao, created_at DESC);

-- ============================================================
-- 3. RLS — ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE tarefa_aprovacoes ENABLE ROW LEVEL SECURITY;

-- SELECT: qualquer membro do tenant vê o histórico da tarefa
DO $$ BEGIN
  CREATE POLICY "Ver aprovacoes do proprio tenant"
    ON tarefa_aprovacoes FOR SELECT
    USING (
      EXISTS (
        SELECT 1
        FROM tarefas_loja t
        JOIN lojas l        ON l.id          = t.loja_id
        JOIN tenant_members tm ON tm.tenant_id = l.tenant_id
        WHERE t.id        = tarefa_aprovacoes.tarefa_id
          AND tm.user_id  = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END$$;

-- INSERT: WITH CHECK (true) — validação de autorização feita no Bridge Server.
-- Justificativa: aprovações podem vir de atores variados (consultor, admin,
-- sistema Trigger.dev) e a lógica de permissão já é verificada antes do INSERT.
-- Manter simples no banco evita falsos bloqueios em chamadas server-side.
DO $$ BEGIN
  CREATE POLICY "Inserir aprovacoes via bridge"
    ON tarefa_aprovacoes FOR INSERT
    WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END$$;

-- Sem políticas UPDATE/DELETE: este log é imutável por design.

COMMIT;
