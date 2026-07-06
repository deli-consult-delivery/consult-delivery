-- Migration: 20260525_006_onboarding_wizard.sql
-- Data: 2026-05-25
-- Autor: OnbWiz — Wizard Self-service
-- Motivo: Tabela onboarding_wizard_sessions para leads que se cadastram sozinhos
--         antes de contratar (rota pública /comecar, sem login).
-- Risco: Baixo — tabela nova, sem impacto em queries existentes.
-- Reversão: DROP TABLE IF EXISTS public.onboarding_wizard_sessions;

BEGIN;

CREATE TABLE IF NOT EXISTS public.onboarding_wizard_sessions (
  id                       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  email                    text        NOT NULL,
  whatsapp                 text,
  nome_contato             text,
  nome_negocio             text,
  cnpj                     text,
  faturamento_mensal_range text,
  diagnostico              jsonb       DEFAULT '{}'::jsonb,
  pacote_recomendado       text        CHECK (pacote_recomendado IN ('light','performance','ia_growth')),
  passos_concluidos        jsonb       NOT NULL DEFAULT '[]'::jsonb,
  status                   text        NOT NULL DEFAULT 'iniciado'
                                       CHECK (status IN ('iniciado','em_andamento','concluido')),
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  completed_at             timestamptz
);

-- Autenticados (admin/owner) podem consultar leads
ALTER TABLE public.onboarding_wizard_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY wizard_sessions_authenticated_select
  ON public.onboarding_wizard_sessions
  FOR SELECT
  TO authenticated
  USING (true);

CREATE INDEX IF NOT EXISTS idx_wizard_sessions_status
  ON public.onboarding_wizard_sessions (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_wizard_sessions_email
  ON public.onboarding_wizard_sessions (email);

COMMIT;
