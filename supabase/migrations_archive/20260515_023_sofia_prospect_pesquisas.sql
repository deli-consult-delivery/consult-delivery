-- Migration: 20260515_023_sofia_prospect_pesquisas.sql
-- Data: 2026-05-15
-- Autor: Wandson (via Claude Code)
-- Motivo: A SOFIA executa pesquisas automatizadas sobre cada prospect (busca web, scraping
--         iFood/Instagram, consulta CNPJ) antes de qualificar e pontuar. Esta tabela
--         armazena o resultado bruto de cada ciclo de pesquisa como JSONB, preservando
--         o histórico de coleta e as fontes consultadas. Permite auditoria e reprocessamento
--         sem perder dados anteriores.
-- Risco: Baixo — tabela nova dependente de prospects (20260515_022).
-- Dependencias:
--   - public.prospects (20260515_022_sofia_prospects.sql)
-- Reversao:
--   DROP INDEX IF EXISTS idx_prospect_pesquisas_prospect;
--   DROP TABLE IF EXISTS public.prospect_pesquisas;

BEGIN;

-- ── 1. Tabela de pesquisas por prospect ──────────────────────────────────────

CREATE TABLE public.prospect_pesquisas (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id      uuid        NOT NULL REFERENCES public.prospects(id) ON DELETE CASCADE,

  -- Rastreio do run do agente que gerou esta pesquisa (Trigger.dev run ID)
  agent_run_id     text,

  -- Dados brutos coletados neste ciclo (livre: iFood, CNPJ, redes sociais, etc.)
  dados_coletados  jsonb       NOT NULL DEFAULT '{}'::jsonb,

  -- Lista de fontes consultadas neste ciclo
  -- Ex: ['ifood_scraping', 'cnpj_api', 'web_search', 'instagram_profile']
  fontes           text[]      NOT NULL DEFAULT '{}',

  created_at       timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.prospect_pesquisas IS
  'Resultados brutos de cada ciclo de pesquisa executado pela SOFIA sobre um prospect. '
  'Cada execução do agente gera um registro, preservando histórico de coleta.';

COMMENT ON COLUMN public.prospect_pesquisas.prospect_id IS
  'FK para public.prospects. ON DELETE CASCADE: se o prospect for removido, '
  'todas as pesquisas associadas são apagadas junto.';
COMMENT ON COLUMN public.prospect_pesquisas.agent_run_id IS
  'ID do run no Trigger.dev (agent_runs.id ou run ID textual da plataforma) que gerou '
  'esta pesquisa. Permite rastrear qual execução produziu os dados. NULL se não rastreado.';
COMMENT ON COLUMN public.prospect_pesquisas.dados_coletados IS
  'Payload livre em JSONB com todos os dados coletados neste ciclo. '
  'Estrutura varia por fonte: iFood retorna avaliação/pedidos, CNPJ retorna situação fiscal, etc. '
  'Manter histórico bruto aqui — dados processados sobem para public.prospects.';
COMMENT ON COLUMN public.prospect_pesquisas.fontes IS
  'Array das fontes consultadas nesta pesquisa. '
  'Valores conhecidos: ifood_scraping, cnpj_api, web_search, instagram_profile, apify_maps.';

-- ── 2. Índice ────────────────────────────────────────────────────────────────

-- Lookup padrão: todas as pesquisas de um prospect, mais recente primeiro
CREATE INDEX idx_prospect_pesquisas_prospect
  ON public.prospect_pesquisas (prospect_id, created_at DESC);

-- ── 3. RLS via prospects.tenant_id ──────────────────────────────────────────
--
-- prospect_pesquisas não tem tenant_id direto.
-- O tenant é derivado via prospects.tenant_id usando EXISTS subquery.
-- Esta abordagem garante que a policy segue automaticamente qualquer
-- mudança de tenant no prospect pai.

ALTER TABLE public.prospect_pesquisas ENABLE ROW LEVEL SECURITY;

-- SELECT: membros do tenant com roles de leitura
CREATE POLICY "prospect_pesquisas_select"
  ON public.prospect_pesquisas
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.prospects p
      JOIN public.tenant_members tm ON tm.tenant_id = p.tenant_id
      WHERE p.id = prospect_pesquisas.prospect_id
        AND tm.user_id = auth.uid()
        AND tm.role IN ('admin', 'marketing', 'dev', 'viewer')
    )
  );

-- INSERT / UPDATE / DELETE: apenas roles com escrita
CREATE POLICY "prospect_pesquisas_write"
  ON public.prospect_pesquisas
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.prospects p
      JOIN public.tenant_members tm ON tm.tenant_id = p.tenant_id
      WHERE p.id = prospect_pesquisas.prospect_id
        AND tm.user_id = auth.uid()
        AND tm.role IN ('admin', 'marketing', 'dev')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.prospects p
      JOIN public.tenant_members tm ON tm.tenant_id = p.tenant_id
      WHERE p.id = prospect_pesquisas.prospect_id
        AND tm.user_id = auth.uid()
        AND tm.role IN ('admin', 'marketing', 'dev')
    )
  );

COMMIT;
