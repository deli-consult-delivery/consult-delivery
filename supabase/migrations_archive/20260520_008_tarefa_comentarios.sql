-- ============================================================
-- PILOTO Onda 02 — Migration 04 (arquivo: 20260520_008)
-- Data: 2026-05-20
-- Autor: Wandson via Claude Code
-- Motivo: Criar tabela tarefa_comentarios — thread de comentários
--         por tarefa, suportando consultores, clientes (futura Onda 04),
--         sistema e IA. Comentários podem referenciar um print
--         para criar contexto visual ("veja o print X acima").
--         Rastreabilidade e comunicação interna sem sair da plataforma.
-- Risco: BAIXO — tabela nova; sem ALTER em tabelas existentes.
--        Depende de tarefa_prints (20260520_007) — aplicar depois.
-- Reversão:
--   DROP TABLE IF EXISTS tarefa_comentarios;
-- ============================================================

BEGIN;

-- ============================================================
-- 1. TABELA
-- ============================================================

CREATE TABLE IF NOT EXISTS tarefa_comentarios (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tarefa_id   uuid NOT NULL REFERENCES tarefas_loja(id) ON DELETE CASCADE,

  -- Autor
  autor_id    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  autor_tipo  text CHECK (autor_tipo IN ('consultor', 'cliente', 'sistema', 'ia')),

  conteudo    text NOT NULL,

  -- Referência opcional a print (enriquece o comentário com contexto visual)
  print_id    uuid REFERENCES tarefa_prints(id) ON DELETE SET NULL,

  created_at  timestamptz DEFAULT now()
);

COMMENT ON TABLE tarefa_comentarios IS
  'Thread de comentários por tarefa. Usado para comunicação interna '
  'entre consultores e, na Onda 04, com o cliente externo. '
  'Comentários de IA e sistema são identificados pelo autor_tipo.';

COMMENT ON COLUMN tarefa_comentarios.autor_tipo IS
  'Tipo do autor: consultor (equipe interna), cliente (Onda 04), '
  'sistema (automação Bridge/Trigger.dev), ia (agente Claude).';
COMMENT ON COLUMN tarefa_comentarios.print_id IS
  'Print opcional referenciado neste comentário. ON DELETE SET NULL: '
  'se o print for removido, o comentário permanece (sem o link visual).';
COMMENT ON COLUMN tarefa_comentarios.conteudo IS
  'Texto do comentário. Markdown aceito no frontend. Mínimo 1 caractere.';

-- ============================================================
-- 2. ÍNDICES
-- ============================================================

-- Thread de uma tarefa em ordem cronológica (consulta principal)
CREATE INDEX IF NOT EXISTS idx_comentarios_tarefa
  ON tarefa_comentarios(tarefa_id, created_at DESC);

-- Buscar comentários de um usuário específico (auditoria / "meus comentários")
CREATE INDEX IF NOT EXISTS idx_comentarios_autor
  ON tarefa_comentarios(autor_id);

-- ============================================================
-- 3. RLS — ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE tarefa_comentarios ENABLE ROW LEVEL SECURITY;

-- SELECT: qualquer membro do tenant vê os comentários da tarefa
DO $$ BEGIN
  CREATE POLICY "Ver comentarios do proprio tenant"
    ON tarefa_comentarios FOR SELECT
    USING (
      EXISTS (
        SELECT 1
        FROM tarefas_loja t
        JOIN lojas l           ON l.id          = t.loja_id
        JOIN tenant_members tm ON tm.tenant_id   = l.tenant_id
        WHERE t.id        = tarefa_comentarios.tarefa_id
          AND tm.user_id  = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END$$;

-- INSERT: membro do tenant, e o autor_id deve ser o próprio usuário logado
-- (ou NULL quando inserido pelo sistema/IA via service role)
DO $$ BEGIN
  CREATE POLICY "Comentar: membro do tenant com autor correto"
    ON tarefa_comentarios FOR INSERT
    WITH CHECK (
      -- autor_id igual ao usuário logado (comentário humano)
      -- OU autor_id NULL/sistema (inserção via service role do Bridge/Trigger.dev)
      (autor_id = auth.uid() OR autor_id IS NULL)
      AND EXISTS (
        SELECT 1
        FROM tarefas_loja t
        JOIN lojas l           ON l.id          = t.loja_id
        JOIN tenant_members tm ON tm.tenant_id   = l.tenant_id
        WHERE t.id        = tarefa_comentarios.tarefa_id
          AND tm.user_id  = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END$$;

-- Sem UPDATE/DELETE: comentários são imutáveis (histórico fiel).
-- Moderação futura via soft delete em coluna `deletado_em` (nova migration).

COMMIT;
