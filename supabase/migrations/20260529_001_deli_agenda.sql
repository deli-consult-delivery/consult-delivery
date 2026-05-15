-- Migration: 20260529_001_deli_agenda.sql
-- Data: 2026-05-29
-- Autor: Wandson (via Claude Code)
-- Motivo: A DELI gera resumos executivos periódicos (revisões matinais, supervisões,
--         alertas pontuais) que precisam de uma tabela consultável e estruturada.
--         A tabela deli_messages já armazena o histórico de chat; esta tabela
--         complementa com JSONB de alertas e ações sugeridas, separando
--         conteúdo consultável de log de mensagens.
-- Risco: Baixo — tabela nova, sem impacto em queries ou tabelas existentes.
-- Dependencias:
--   - public.tenants        (schema base multi-tenant)
--   - public.agent_runs     (FK opcional para rastreabilidade de qual run gerou o item)
--   - public.tenant_members (usada na RLS policy de leitura)
-- Reversao:
--   DROP INDEX IF EXISTS idx_deli_agenda_tenant_tipo;
--   DROP TABLE IF EXISTS public.deli_agenda;

BEGIN;

-- ── 1. deli_agenda — resumos executivos gerados pela DELI ───────────────────

CREATE TABLE public.deli_agenda (
  id              uuid        NOT NULL DEFAULT gen_random_uuid(),
  tenant_id       uuid        NOT NULL,
  tipo            text        NOT NULL CHECK (tipo IN ('revisao_matinal', 'supervisao', 'alerta')),
  resumo          text        NOT NULL,
  alertas         jsonb       NOT NULL DEFAULT '[]',
  acoes_sugeridas jsonb       NOT NULL DEFAULT '[]',
  agent_run_id    uuid,
  created_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT deli_agenda_pkey          PRIMARY KEY (id),
  CONSTRAINT deli_agenda_tenant_fkey   FOREIGN KEY (tenant_id)
    REFERENCES public.tenants(id) ON DELETE CASCADE,
  CONSTRAINT deli_agenda_run_fkey      FOREIGN KEY (agent_run_id)
    REFERENCES public.agent_runs(id) ON DELETE SET NULL
);

COMMENT ON TABLE public.deli_agenda IS
  'Resumos executivos gerados pela DELI: revisões matinais diárias, supervisões '
  'intraday e alertas pontuais. Complementa deli_messages com estrutura consultável '
  'via JSONB (alertas, ações sugeridas).';

COMMENT ON COLUMN public.deli_agenda.tenant_id IS
  'Multi-tenant: isolamento por tenant. Obrigatório.';

COMMENT ON COLUMN public.deli_agenda.tipo IS
  'Categoria do resumo: revisao_matinal (início do dia), supervisao (check intraday), '
  'alerta (evento pontual crítico que a DELI escalou).';

COMMENT ON COLUMN public.deli_agenda.resumo IS
  'Texto narrativo do resumo executivo gerado pela DELI, em linguagem natural.';

COMMENT ON COLUMN public.deli_agenda.alertas IS
  'Array JSONB de alertas estruturados. Ex: [{"codigo": "A01", "descricao": "...", "severidade": "alta"}]. '
  'Default: array vazio.';

COMMENT ON COLUMN public.deli_agenda.acoes_sugeridas IS
  'Array JSONB das ações que a DELI propõe ao gestor. '
  'Ex: [{"acao": "Ligar para cliente X", "prioridade": "alta", "prazo": "hoje"}]. '
  'Default: array vazio.';

COMMENT ON COLUMN public.deli_agenda.agent_run_id IS
  'FK opcional para agent_runs — run da DELI que gerou este item (rastreabilidade de custo e duração).';

COMMENT ON COLUMN public.deli_agenda.created_at IS
  'Timestamp de criação do resumo (UTC). Usado para ordenação cronológica e filtros por período.';

-- ── 2. Índice principal ──────────────────────────────────────────────────────
-- Suporta a query mais comum: listar itens da agenda por tenant + tipo + data.
-- ex: SELECT * FROM deli_agenda WHERE tenant_id = $1 AND tipo = 'revisao_matinal'
--     ORDER BY created_at DESC LIMIT 30;
CREATE INDEX idx_deli_agenda_tenant_tipo
  ON public.deli_agenda (tenant_id, tipo, created_at DESC);

-- ── 3. RLS ───────────────────────────────────────────────────────────────────

ALTER TABLE public.deli_agenda ENABLE ROW LEVEL SECURITY;

-- Membros do tenant lêem apenas os resumos do seu próprio tenant.
CREATE POLICY "tenant members can read deli_agenda"
  ON public.deli_agenda
  FOR SELECT
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid()
    )
  );

-- Service role (Trigger.dev / Bridge Server) insere sem restrição de tenant,
-- pois o tenant_id é fornecido pela task que gera o resumo.
-- Padrão idêntico ao usado em vera_reports e agent_runs.
CREATE POLICY "service role can insert deli_agenda"
  ON public.deli_agenda
  FOR INSERT
  WITH CHECK (true);

COMMIT;
