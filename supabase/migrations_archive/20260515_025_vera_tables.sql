-- Migration: 20260515_025_vera_tables.sql
-- Data: 2026-05-15
-- Autor: Wandson (via Claude Code)
-- Motivo: VERA (BI & Relatórios) precisa de tabelas próprias para armazenar relatórios
--         gerados pela IA, snapshots diários de métricas e anomalias detectadas
--         automaticamente. Substitui o uso de logs/planilhas e dá rastreabilidade
--         completa ao módulo de Business Intelligence da plataforma.
-- Risco: Baixo — tabelas novas, zero impacto em queries existentes.
-- Dependencias:
--   - public.tenants (schema base multi-tenant)
--   - public.agent_runs (FK opcional para rastrear qual run gerou o relatório)
--   - public.tenant_members (usada nas RLS policies)
-- Reversao:
--   DROP INDEX IF EXISTS idx_vera_anomalias_tenant_detectada;
--   DROP INDEX IF EXISTS idx_vera_anomalias_tenant_severidade;
--   DROP INDEX IF EXISTS idx_vera_metricas_snapshot_tenant_data;
--   DROP INDEX IF EXISTS idx_vera_reports_tenant_created;
--   DROP INDEX IF EXISTS idx_vera_reports_tenant_tipo_created;
--   DROP TABLE IF EXISTS public.vera_anomalias;
--   DROP TABLE IF EXISTS public.vera_metricas_snapshot;
--   DROP TABLE IF EXISTS public.vera_reports;

BEGIN;

-- ── 1. vera_reports — relatórios gerados pela VERA ──────────────────────────

CREATE TABLE public.vera_reports (
  id                  uuid        NOT NULL DEFAULT gen_random_uuid(),
  tenant_id           uuid        NOT NULL,
  tipo                text        NOT NULL CHECK (tipo IN ('diario','semanal','mensal','customizado','anomalia')),
  periodo_inicio      timestamptz NOT NULL,
  periodo_fim         timestamptz NOT NULL,
  titulo              text        NOT NULL,
  resumo_executivo    text,
  conteudo_markdown   text,
  metricas            jsonb       NOT NULL DEFAULT '{}',
  destinatarios       text[]      NOT NULL DEFAULT '{}',
  agent_run_id        uuid,
  created_at          timestamptz NOT NULL DEFAULT now(),
  read_at             timestamptz,

  CONSTRAINT vera_reports_pkey           PRIMARY KEY (id),
  CONSTRAINT vera_reports_tenant_fkey    FOREIGN KEY (tenant_id)
    REFERENCES public.tenants(id) ON DELETE CASCADE,
  CONSTRAINT vera_reports_agent_run_fkey FOREIGN KEY (agent_run_id)
    REFERENCES public.agent_runs(id) ON DELETE SET NULL
);

COMMENT ON TABLE public.vera_reports IS
  'Relatórios gerados pela VERA (agente BI). Cada relatório tem um período, '
  'tipo (diário/semanal/mensal/customizado/anomalia), resumo executivo em texto '
  'e payload de métricas em JSONB para uso do frontend.';

COMMENT ON COLUMN public.vera_reports.tenant_id IS
  'Multi-tenant: isolamento por tenant. Obrigatório.';
COMMENT ON COLUMN public.vera_reports.tipo IS
  'Tipo do relatório: diario, semanal, mensal, customizado (range livre), anomalia (alerta pontual).';
COMMENT ON COLUMN public.vera_reports.periodo_inicio IS
  'Início do período coberto pelo relatório (UTC).';
COMMENT ON COLUMN public.vera_reports.periodo_fim IS
  'Fim do período coberto pelo relatório (UTC).';
COMMENT ON COLUMN public.vera_reports.resumo_executivo IS
  'Resumo em linguagem natural gerado pela VERA para leitura rápida pelo gestor.';
COMMENT ON COLUMN public.vera_reports.conteudo_markdown IS
  'Relatório completo em Markdown — renderizado no frontend.';
COMMENT ON COLUMN public.vera_reports.metricas IS
  'Snapshot das métricas usadas no relatório em JSONB. Ex: {"conversas_novas": 42, "custo_agentes_usd": 1.23}.';
COMMENT ON COLUMN public.vera_reports.destinatarios IS
  'Array de user_ids ou roles que devem receber notificação do relatório.';
COMMENT ON COLUMN public.vera_reports.agent_run_id IS
  'FK para agent_runs — run da VERA que gerou este relatório (rastreabilidade).';
COMMENT ON COLUMN public.vera_reports.read_at IS
  'Timestamp de quando o relatório foi lido pelo primeiro destinatário.';

-- Índice principal: listar relatórios por tipo e data (tela VERA)
CREATE INDEX idx_vera_reports_tenant_tipo_created
  ON public.vera_reports (tenant_id, tipo, created_at DESC);

-- Índice secundário: listar todos os relatórios do tenant por data
CREATE INDEX idx_vera_reports_tenant_created
  ON public.vera_reports (tenant_id, created_at DESC);

ALTER TABLE public.vera_reports ENABLE ROW LEVEL SECURITY;

-- SELECT: membros do tenant com qualquer role
CREATE POLICY "vera_reports_select_tenant_members"
  ON public.vera_reports
  FOR SELECT
  USING (
    tenant_id IN (
      SELECT tenant_id
      FROM public.tenant_members
      WHERE user_id = auth.uid()
    )
  );

-- ALL: service_role (agentes e backend)
CREATE POLICY "vera_reports_service_role_all"
  ON public.vera_reports
  FOR ALL
  USING (auth.role() = 'service_role');

-- ── 2. vera_metricas_snapshot — snapshot diário de métricas ─────────────────

CREATE TABLE public.vera_metricas_snapshot (
  id          uuid        NOT NULL DEFAULT gen_random_uuid(),
  tenant_id   uuid        NOT NULL,
  data        date        NOT NULL,
  metricas    jsonb       NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT vera_metricas_snapshot_pkey             PRIMARY KEY (id),
  CONSTRAINT vera_metricas_snapshot_tenant_fkey      FOREIGN KEY (tenant_id)
    REFERENCES public.tenants(id) ON DELETE CASCADE,
  CONSTRAINT vera_metricas_snapshot_tenant_data_ukey UNIQUE (tenant_id, data)
);

COMMENT ON TABLE public.vera_metricas_snapshot IS
  'Snapshot diário de métricas consolidadas por tenant. Populado pela VERA uma vez por dia. '
  'UNIQUE (tenant_id, data) garante idempotência: INSERT ... ON CONFLICT DO UPDATE.';

COMMENT ON COLUMN public.vera_metricas_snapshot.tenant_id IS
  'Multi-tenant: isolamento por tenant. Obrigatório.';
COMMENT ON COLUMN public.vera_metricas_snapshot.data IS
  'Data de referência do snapshot (DATE, sem hora). Ex: 2026-05-15.';
COMMENT ON COLUMN public.vera_metricas_snapshot.metricas IS
  'Objeto JSONB com todas as métricas do dia. Ex: {"conversas_novas": 12, "custo_total_usd": 0.85, '
  '"prospects_novos": 5, "cobrancas_pagas": 2}.';

-- Índice para timeline de snapshots do tenant
CREATE INDEX idx_vera_metricas_snapshot_tenant_data
  ON public.vera_metricas_snapshot (tenant_id, data DESC);

ALTER TABLE public.vera_metricas_snapshot ENABLE ROW LEVEL SECURITY;

-- SELECT: membros do tenant
CREATE POLICY "vera_metricas_snapshot_select_tenant_members"
  ON public.vera_metricas_snapshot
  FOR SELECT
  USING (
    tenant_id IN (
      SELECT tenant_id
      FROM public.tenant_members
      WHERE user_id = auth.uid()
    )
  );

-- ALL: service_role
CREATE POLICY "vera_metricas_snapshot_service_role_all"
  ON public.vera_metricas_snapshot
  FOR ALL
  USING (auth.role() = 'service_role');

-- ── 3. vera_anomalias — anomalias detectadas pela VERA ──────────────────────

CREATE TABLE public.vera_anomalias (
  id                uuid        NOT NULL DEFAULT gen_random_uuid(),
  tenant_id         uuid        NOT NULL,
  detectada_em      timestamptz NOT NULL DEFAULT now(),
  metrica           text        NOT NULL,
  valor_esperado    numeric(10,4),
  valor_observado   numeric(10,4),
  severidade        text        NOT NULL DEFAULT 'info' CHECK (severidade IN ('info','warning','critical')),
  explicacao        text,
  notificado        boolean     NOT NULL DEFAULT false,
  resolvida         boolean     NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT vera_anomalias_pkey        PRIMARY KEY (id),
  CONSTRAINT vera_anomalias_tenant_fkey FOREIGN KEY (tenant_id)
    REFERENCES public.tenants(id) ON DELETE CASCADE
);

COMMENT ON TABLE public.vera_anomalias IS
  'Anomalias detectadas pela VERA em métricas do tenant. Quando uma métrica '
  'desvia significativamente do esperado (ex: queda >30% em conversas), '
  'um registro é criado aqui e pode gerar draft de alerta para o gestor.';

COMMENT ON COLUMN public.vera_anomalias.tenant_id IS
  'Multi-tenant: isolamento por tenant. Obrigatório.';
COMMENT ON COLUMN public.vera_anomalias.metrica IS
  'Nome da métrica anômala. Ex: "conversas_novas", "custo_agentes_usd", "prospects_novos".';
COMMENT ON COLUMN public.vera_anomalias.valor_esperado IS
  'Valor esperado da métrica (baseado em média histórica ou baseline definido).';
COMMENT ON COLUMN public.vera_anomalias.valor_observado IS
  'Valor real observado no período — causou o disparo da anomalia.';
COMMENT ON COLUMN public.vera_anomalias.severidade IS
  'Nível de severidade: info (observação), warning (atenção), critical (ação imediata).';
COMMENT ON COLUMN public.vera_anomalias.explicacao IS
  'Explicação em linguagem natural gerada pela VERA sobre a anomalia detectada.';
COMMENT ON COLUMN public.vera_anomalias.notificado IS
  'TRUE quando a equipe já foi notificada sobre esta anomalia (via draft ou notificação interna).';
COMMENT ON COLUMN public.vera_anomalias.resolvida IS
  'TRUE quando a anomalia foi reconhecida/resolvida pelo gestor ou pela própria VERA.';

-- Índice para filtrar anomalias abertas por severidade (tela de alertas)
CREATE INDEX idx_vera_anomalias_tenant_severidade
  ON public.vera_anomalias (tenant_id, resolvida, severidade);

-- Índice para timeline de anomalias do tenant
CREATE INDEX idx_vera_anomalias_tenant_detectada
  ON public.vera_anomalias (tenant_id, detectada_em DESC);

ALTER TABLE public.vera_anomalias ENABLE ROW LEVEL SECURITY;

-- SELECT: membros do tenant
CREATE POLICY "vera_anomalias_select_tenant_members"
  ON public.vera_anomalias
  FOR SELECT
  USING (
    tenant_id IN (
      SELECT tenant_id
      FROM public.tenant_members
      WHERE user_id = auth.uid()
    )
  );

-- ALL: service_role
CREATE POLICY "vera_anomalias_service_role_all"
  ON public.vera_anomalias
  FOR ALL
  USING (auth.role() = 'service_role');

COMMIT;
