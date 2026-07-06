-- Migration: 20260622_010_tenant_modules.sql
-- Data: 2026-06-22
-- Motivo: Gating de módulos por tenant (allowlist). Permite vender o console v2 com
--         um subconjunto de telas habilitadas por cliente (ex.: só Avaliação CSAT/NPS),
--         com desbloqueio progressivo via INSERT/UPDATE sem deploy.
-- Semântica de leitura (no frontend):
--   * Tenant SEM nenhuma linha aqui  -> vê TODOS os módulos (backward-compatible).
--   * Tenant COM linhas              -> vê SOMENTE os module_key com enabled = true (allowlist).
--   module_key = o `id` do item de menu do GRUPOS em src/console/ConsoleV2.jsx (ex.: 'visao','csat','nps').
-- Segurança: filtro de menu é defesa de UX; dados continuam protegidos por RLS/RBAC nas tabelas.
-- Risco: Baixo — tabela nova, aditiva, zero alteração em tabelas/linhas existentes.
-- Reversão:
--   DROP TABLE IF EXISTS public.tenant_modules;

BEGIN;

-- ============================================================================
-- 1. Tabela: tenant_modules
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.tenant_modules (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Multi-tenant obrigatório
  tenant_id   uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,

  -- Chave do módulo = id do item de menu em ConsoleV2 GRUPOS (ex.: 'visao','csat','nps')
  module_key  text        NOT NULL,

  -- Flag de habilitação. enabled=false desliga o módulo mantendo a linha (histórico/idempotência).
  enabled     boolean     NOT NULL DEFAULT true,

  -- Auditoria
  created_at  timestamptz NOT NULL DEFAULT now(),

  -- Idempotência por módulo: permite ON CONFLICT (tenant_id, module_key) DO UPDATE
  CONSTRAINT tenant_modules_tenant_module_uq UNIQUE (tenant_id, module_key)
);

COMMENT ON TABLE public.tenant_modules IS
  'Allowlist de módulos do Console v2 por tenant. '
  'Sem linhas = acesso total (backward-compatible); com linhas = só module_key com enabled=true. '
  'module_key = id do item de menu em src/console/ConsoleV2.jsx (GRUPOS).';

COMMENT ON COLUMN public.tenant_modules.module_key IS
  'Id do item de menu do Console v2 (ex.: visao, csat, nps). Desbloquear = inserir/ativar linha.';

-- ============================================================================
-- 2. Índice — leitura rápida no login (todos os módulos de um tenant)
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_tenant_modules_tenant
  ON public.tenant_modules (tenant_id);

-- ============================================================================
-- 3. RLS — Row Level Security
-- ============================================================================
-- Leitura: qualquer membro do tenant lê os módulos do próprio tenant.
-- Escrita: somente owner/admin do tenant. Bridge/edge usam service-role e bypassam RLS.

ALTER TABLE public.tenant_modules ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_modules_select_tenant ON public.tenant_modules
  FOR SELECT USING (
    tenant_id IN (
      SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY tenant_modules_insert_admin ON public.tenant_modules
  FOR INSERT WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM public.tenant_members
       WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

CREATE POLICY tenant_modules_update_admin ON public.tenant_modules
  FOR UPDATE USING (
    tenant_id IN (
      SELECT tenant_id FROM public.tenant_members
       WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

CREATE POLICY tenant_modules_delete_admin ON public.tenant_modules
  FOR DELETE USING (
    tenant_id IN (
      SELECT tenant_id FROM public.tenant_members
       WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

COMMIT;
