-- Migration: Módulo Análise iFood — tabela analises
-- SCHEMA-01 / SCHEMA-02 / SCHEMA-03 / SCHEMA-04
-- Date: 2026-05-02

-- ─────────────────────────────────────────────
-- 1. Tabela analises
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS analises (
  id                uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id            uuid        DEFAULT gen_random_uuid() NOT NULL UNIQUE,
  tenant_id         uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  cliente_id        uuid        REFERENCES customers(id) ON DELETE SET NULL,
  status            text        NOT NULL DEFAULT 'pending'
                                CHECK (status IN ('pending', 'processing', 'done', 'error')),
  drive_link        text,
  periodo           text        CHECK (periodo IN ('diaria', 'semanal', 'mensal')),
  tipo_analise      text        DEFAULT 'ifood',
  resultado_json    jsonb,
  html_relatorio    text,
  mensagem_whatsapp text,
  error_message     text,
  whatsapp_sent     boolean     DEFAULT false,
  criado_por        uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now()
);

-- ─────────────────────────────────────────────
-- 2. REPLICA IDENTITY FULL
--    Obrigatório para Supabase Realtime enviar a row
--    completa em UPDATE events (não só a PK).
--    Sem isso, subscribeToAnalise nunca recebe status.
-- ─────────────────────────────────────────────
ALTER TABLE analises REPLICA IDENTITY FULL;

-- ─────────────────────────────────────────────
-- 3. RLS
-- ─────────────────────────────────────────────
ALTER TABLE analises ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members can manage analises"
  ON analises FOR ALL
  USING (
    tenant_id IN (
      SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid()
    )
  );

-- ─────────────────────────────────────────────
-- 4. Realtime publication
--    Adiciona a tabela ao canal supabase_realtime.
--    A publicacao ja existe por padrao no Supabase.
-- ─────────────────────────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE analises;

-- ─────────────────────────────────────────────
-- 5. Indexes
-- ─────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_analises_tenant_status
  ON analises(tenant_id, status);

CREATE INDEX IF NOT EXISTS idx_analises_job_id
  ON analises(job_id);
