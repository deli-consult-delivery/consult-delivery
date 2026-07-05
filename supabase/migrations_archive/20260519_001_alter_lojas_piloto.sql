-- ============================================================
-- PILOTO Onda 01 — Migration 01
-- Data: 2026-05-19
-- Autor: Wandson via Claude Code
-- Motivo: Adicionar colunas PILOTO + colunas faltantes do módulo
--         Campanhas (bonus: conserta bug pré-existente).
-- Estratégia: ALTER TABLE incremental. Zero DROP. Zero renomeação.
-- Risco: BAIXO — ADD COLUMN IF NOT EXISTS em todos os ALTERs
-- Reversão: ALTER TABLE lojas DROP COLUMN <coluna_nova>;
--           (só se a coluna ainda estiver vazia)
--
-- Estado da tabela lojas antes desta migration (12 colunas):
--   id, tenant_id, nome, nicho, cidade, created_at,
--   plataforma, status, estado, data_entrada, metadata, client_id
--
-- Nota: 20260506_campanhas.sql foi NO-OP (tabela já existia).
--       Função update_lojas_updated_at() e trigger não existem —
--       criados aqui pela primeira vez.
-- ============================================================

BEGIN;

-- ============================================================
-- 1. COLUNAS DO PILOTO
-- ============================================================
ALTER TABLE lojas
  ADD COLUMN IF NOT EXISTS slug                   text,
  ADD COLUMN IF NOT EXISTS ifood_merchant_id      text,
  ADD COLUMN IF NOT EXISTS ifood_url              text,
  ADD COLUMN IF NOT EXISTS segmento               text,
  ADD COLUMN IF NOT EXISTS posicionamento         text DEFAULT 'indefinido',
  ADD COLUMN IF NOT EXISTS ticket_medio           numeric(10,2),
  ADD COLUMN IF NOT EXISTS data_inicio_consultoria date DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS data_fim_consultoria   date,
  ADD COLUMN IF NOT EXISTS super_restaurante      boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS data_super_restaurante date,
  ADD COLUMN IF NOT EXISTS observacoes            text,
  ADD COLUMN IF NOT EXISTS tags                   text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS created_by             uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS updated_at             timestamptz DEFAULT now();

-- ============================================================
-- 2. COLUNAS DO MÓDULO CAMPANHAS (conserta bug pré-existente)
-- ============================================================
ALTER TABLE lojas
  ADD COLUMN IF NOT EXISTS tipo         text,
  ADD COLUMN IF NOT EXISTS skill_criada boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS skill_path   text,
  ADD COLUMN IF NOT EXISTS dados_skill  jsonb DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS logo_url     text,
  ADD COLUMN IF NOT EXISTS whatsapp     text;

-- ============================================================
-- 3. CONSTRAINTS DE VALIDAÇÃO
-- ============================================================

-- status: aceita valores legados + PILOTO (sem duplicatas)
DO $$ BEGIN
  ALTER TABLE lojas ADD CONSTRAINT lojas_status_check
    CHECK (status IN (
      'ativo', 'inativo', 'pausado',
      'ativa',
      'onboarding', 'pausada', 'encerrada'
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END$$;

-- segmento: valores controlados (nullable)
DO $$ BEGIN
  ALTER TABLE lojas ADD CONSTRAINT lojas_segmento_check
    CHECK (segmento IS NULL OR segmento IN (
      'hamburgueria', 'pizzaria', 'japonesa', 'brasileira', 'marmita',
      'saudavel', 'acai', 'sobremesa', 'padaria', 'outro'
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END$$;

-- posicionamento: valores controlados
DO $$ BEGIN
  ALTER TABLE lojas ADD CONSTRAINT lojas_posicionamento_check
    CHECK (posicionamento IN ('volume', 'premium', 'indefinido'));
EXCEPTION WHEN duplicate_object THEN NULL; END$$;

-- estado: UF 2 chars quando preenchido
DO $$ BEGIN
  ALTER TABLE lojas ADD CONSTRAINT lojas_estado_check
    CHECK (estado IS NULL OR length(estado) = 2);
EXCEPTION WHEN duplicate_object THEN NULL; END$$;

-- ============================================================
-- 4. ÍNDICES
-- ============================================================

-- UNIQUE (tenant_id, slug) — índice parcial quando slug preenchido
CREATE UNIQUE INDEX IF NOT EXISTS idx_lojas_tenant_slug_unique
  ON lojas(tenant_id, slug)
  WHERE slug IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_lojas_status
  ON lojas(status);

CREATE INDEX IF NOT EXISTS idx_lojas_segmento
  ON lojas(segmento);

CREATE INDEX IF NOT EXISTS idx_lojas_super_restaurante
  ON lojas(super_restaurante)
  WHERE super_restaurante = true;

CREATE INDEX IF NOT EXISTS idx_lojas_search
  ON lojas USING gin(
    to_tsvector('portuguese',
      nome || ' ' || coalesce(cidade, '') || ' ' || coalesce(segmento, '')
    )
  );

-- ============================================================
-- 5. FUNÇÃO E TRIGGER updated_at
-- (função não existia no banco — criada aqui pela primeira vez)
-- ============================================================
CREATE OR REPLACE FUNCTION update_lojas_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'lojas_updated_at'
      AND tgrelid = 'lojas'::regclass
  ) THEN
    CREATE TRIGGER lojas_updated_at
      BEFORE UPDATE ON lojas
      FOR EACH ROW
      EXECUTE FUNCTION update_lojas_updated_at();
  END IF;
END$$;

COMMIT;
