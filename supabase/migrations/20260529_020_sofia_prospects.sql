-- Migration: SOFIA — tabelas de prospecção SDR
-- Agente: SOFIA (SDR/Prospecção) — Feature V2-Sofia
-- Data: 2026-05-29

-- =====================================================
-- 1. TABELA PRINCIPAL: prospects
-- =====================================================
CREATE TABLE IF NOT EXISTS prospects (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Dados básicos da loja
  nome                  text NOT NULL,
  cidade                text,
  estado                text,
  segmento              text,                  -- 'pizzaria', 'hamburgueria', 'japonesa', etc.

  -- Dados coletados via pesquisa web (SOFIA pesquisar-prospect)
  instagram             text,
  ifood_link            text,
  avaliacao_ifood       numeric(3,1),
  num_avaliacoes_ifood  integer,
  whatsapp              text,
  site                  text,

  -- Qualificação (SOFIA qualificar)
  score                 integer CHECK (score >= 0 AND score <= 100),
  razao_score           text,

  -- Ciclo de vida
  status                text NOT NULL DEFAULT 'novo'
                          CHECK (status IN ('novo','pesquisando','pesquisado','qualificado','nao_qualificado','manual','abordado','respondeu','convertido','descartado')),

  -- Rastreabilidade
  created_by            uuid REFERENCES auth.users(id),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  created_at            timestamptz NOT NULL DEFAULT now()
);

-- Índices para queries frequentes
CREATE INDEX IF NOT EXISTS idx_prospects_tenant_status  ON prospects(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_prospects_tenant_score   ON prospects(tenant_id, score DESC);

-- RLS multi-tenant
ALTER TABLE prospects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolamento_prospects" ON prospects
  USING (tenant_id = (
    SELECT tenant_id FROM tenant_members
    WHERE user_id = auth.uid()
    LIMIT 1
  ));

-- =====================================================
-- 2. TABELA DE PESQUISAS: prospect_pesquisas
-- Log de cada execução de pesquisa web pela SOFIA
-- =====================================================
CREATE TABLE IF NOT EXISTS prospect_pesquisas (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  prospect_id       uuid NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,

  -- Dados coletados nesta rodada
  dados_coletados   jsonb NOT NULL DEFAULT '{}'::jsonb,
  fontes            text[] NOT NULL DEFAULT '{}',

  -- Rastreabilidade
  trigger_run_id    text,                       -- Trigger.dev run ID
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_prospect_pesquisas_prospect ON prospect_pesquisas(prospect_id, created_at DESC);

ALTER TABLE prospect_pesquisas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolamento_prospect_pesquisas" ON prospect_pesquisas
  USING (tenant_id = (
    SELECT tenant_id FROM tenant_members
    WHERE user_id = auth.uid()
    LIMIT 1
  ));

-- =====================================================
-- 3. TABELA DE ABORDAGENS: prospect_abordagens
-- Rascunhos de mensagens gerados pela SOFIA
-- =====================================================
CREATE TABLE IF NOT EXISTS prospect_abordagens (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  prospect_id   uuid NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,

  canal         text NOT NULL CHECK (canal IN ('whatsapp','instagram_dm','email')),
  mensagem      text NOT NULL,
  assunto       text,                           -- apenas para email

  -- Ciclo de aprovação (segue padrão draft da plataforma)
  status        text NOT NULL DEFAULT 'rascunho'
                  CHECK (status IN ('rascunho','aprovado','enviado','rejeitado')),

  -- Rastreabilidade
  created_by    uuid REFERENCES auth.users(id),
  trigger_run_id text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_prospect_abordagens_prospect ON prospect_abordagens(prospect_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_prospect_abordagens_status   ON prospect_abordagens(tenant_id, status);

ALTER TABLE prospect_abordagens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolamento_prospect_abordagens" ON prospect_abordagens
  USING (tenant_id = (
    SELECT tenant_id FROM tenant_members
    WHERE user_id = auth.uid()
    LIMIT 1
  ));

-- =====================================================
-- 4. SEED: registra SOFIA no catálogo de agentes
-- =====================================================
INSERT INTO agents (slug, display_name, category, is_active, default_modo)
VALUES ('sofia', 'SOFIA · SDR/Prospecção', 'specialist', true, 'hibrido')
ON CONFLICT (slug) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  is_active    = EXCLUDED.is_active;
