-- Migration: 20260515_022_sofia_prospects.sql
-- Data: 2026-05-15
-- Autor: Wandson (via Claude Code)
-- Motivo: SOFIA (SDR/Prospecção) precisa de uma tabela central de prospects para registrar
--         empresas de delivery identificadas como potenciais clientes da Consult Delivery.
--         Cada prospect tem origem (fonte), status no funil SDR, score calculado pela IA e
--         dados de contato multi-canal (WhatsApp, Instagram, iFood). O objetivo é substituir
--         o uso de planilhas e dar rastreabilidade completa ao processo de prospecção.
-- Risco: Baixo — tabela nova, zero impacto em dados existentes.
-- Dependencias:
--   - public.tenants (schema base)
-- Reversao:
--   DROP TRIGGER IF EXISTS prospects_updated_at ON public.prospects;
--   DROP FUNCTION IF EXISTS update_prospects_updated_at();
--   DROP INDEX IF EXISTS idx_prospects_tenant_status;
--   DROP INDEX IF EXISTS idx_prospects_tenant_score;
--   DROP TABLE IF EXISTS public.prospects;

BEGIN;

-- ── 1. Tabela principal de prospects ────────────────────────────────────────

CREATE TABLE public.prospects (
  id                   uuid        DEFAULT gen_random_uuid(),
  tenant_id            uuid        NOT NULL,

  -- Identificação do prospect
  nome                 text        NOT NULL,
  cidade               text,
  estado               text,
  segmento             text        CHECK (segmento IN (
                                     'restaurante', 'hamburgueria', 'pizzaria',
                                     'acai', 'lanches', 'saudavel', 'outro'
                                   )),

  -- Origem do lead
  fonte                text        NOT NULL CHECK (fonte IN ('csv', 'manual', 'apify', 'outro')),

  -- Contatos multi-canal
  instagram            text,
  whatsapp             text,
  site                 text,
  ifood_link           text,

  -- Dados iFood (coletados pela SOFIA via scraping/Apify)
  avaliacao_ifood      numeric(2,1),
  num_avaliacoes_ifood integer,

  -- Dados fiscais
  cnpj                 text,

  -- Funil SDR
  status               text        NOT NULL DEFAULT 'novo' CHECK (status IN (
                                     'novo', 'pesquisando', 'qualificado', 'nao_qualificado',
                                     'abordado', 'respondeu', 'convertido', 'descartado'
                                   )),

  -- Score calculado pela IA (0-100) e justificativa
  score                integer     CHECK (score BETWEEN 0 AND 100),
  razao_score          text,

  -- Auditoria
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),

  -- Constraints com nome explícito
  CONSTRAINT prospects_pkey      PRIMARY KEY (id),
  CONSTRAINT prospects_tenant_fkey FOREIGN KEY (tenant_id)
    REFERENCES public.tenants(id) ON DELETE CASCADE
);

COMMENT ON TABLE public.prospects IS
  'Empresas de delivery identificadas como potenciais clientes da Consult Delivery. '
  'Populada pela SOFIA (SDR IA) via importação CSV, prospecção manual ou scraping Apify.';

COMMENT ON COLUMN public.prospects.tenant_id IS
  'Multi-tenant: isolamento por tenant. Obrigatório.';
COMMENT ON COLUMN public.prospects.fonte IS
  'Origem do prospect: csv (importação manual), manual (criado na plataforma), '
  'apify (scraping automatizado), outro.';
COMMENT ON COLUMN public.prospects.status IS
  'Estágio no funil SDR. Progressão: novo → pesquisando → qualificado/nao_qualificado '
  '→ abordado → respondeu → convertido/descartado.';
COMMENT ON COLUMN public.prospects.score IS
  'Score de 0-100 calculado pela SOFIA com base em avaliação iFood, segmento, '
  'presença digital e potencial de conversão. NULL = ainda não avaliado.';
COMMENT ON COLUMN public.prospects.razao_score IS
  'Justificativa da IA para o score atribuído. Exemplo: "Alta avaliação iFood (4.8), '
  'segmento hamburgueria com crescimento regional, sem consultoria ativa visível."';
COMMENT ON COLUMN public.prospects.avaliacao_ifood IS
  'Nota do estabelecimento no iFood (0.0–5.0). Coletada pelo agente SOFIA.';
COMMENT ON COLUMN public.prospects.ifood_link IS
  'URL do perfil do estabelecimento no iFood. Permite rastrear mudanças de métricas.';

-- ── 2. Trigger de updated_at ─────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_prospects_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION update_prospects_updated_at() IS
  'Atualiza updated_at automaticamente a cada UPDATE na tabela prospects.';

CREATE TRIGGER prospects_updated_at
  BEFORE UPDATE ON public.prospects
  FOR EACH ROW
  EXECUTE FUNCTION update_prospects_updated_at();

-- ── 3. Índices para queries comuns ───────────────────────────────────────────

-- Query principal da tela SOFIA: listar prospects por tenant filtrados por status
CREATE INDEX idx_prospects_tenant_status
  ON public.prospects (tenant_id, status);

-- Ranking de melhores prospects para abordagem (top-N por score)
CREATE INDEX idx_prospects_tenant_score
  ON public.prospects (tenant_id, score DESC)
  WHERE score IS NOT NULL;

-- ── 4. RLS — Row Level Security ──────────────────────────────────────────────

ALTER TABLE public.prospects ENABLE ROW LEVEL SECURITY;

-- SELECT: todos os membros do tenant com role admin, marketing ou dev
CREATE POLICY "prospects_select_tenant_roles"
  ON public.prospects
  FOR SELECT
  USING (
    tenant_id IN (
      SELECT tenant_id
      FROM public.tenant_members
      WHERE user_id = auth.uid()
        AND role IN ('admin', 'marketing', 'dev', 'viewer')
    )
  );

-- INSERT / UPDATE: apenas admin, marketing e dev (não viewer)
CREATE POLICY "prospects_write_tenant_roles"
  ON public.prospects
  FOR ALL
  USING (
    tenant_id IN (
      SELECT tenant_id
      FROM public.tenant_members
      WHERE user_id = auth.uid()
        AND role IN ('admin', 'marketing', 'dev')
    )
  )
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id
      FROM public.tenant_members
      WHERE user_id = auth.uid()
        AND role IN ('admin', 'marketing', 'dev')
    )
  );

COMMIT;
