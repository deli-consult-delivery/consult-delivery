-- ============================================================
-- MIGRATION: Adicionar tenant_id em evolution_instances
-- Data: 2026-05-04
-- Branch: feature/evolution-tenant-fix
--
-- Problema: edge function evolution-webhook busca tenant_id via
--   .select('id, tenant_id, ...) em evolution_instances, mas a
--   coluna não existia → tenantId ficava undefined → inserts em
--   whatsapp_contacts/whatsapp_messages falhavam silenciosamente.
--
-- Correções desta migration:
--   1. Adiciona tenant_id (nullable temporariamente)
--   2. Backfill: ambas as instâncias → tenant Consult Delivery
--   3. Guard: falha se alguma linha ficou sem tenant_id
--   4. Torna NOT NULL
--   5. Índice de performance
--   6. RLS: cada usuário só vê instâncias do seu tenant
-- ============================================================

BEGIN;

-- 1. Adiciona coluna tenant_id (nullable para permitir o backfill)
ALTER TABLE evolution_instances
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);

-- 2. Backfill: associa todas as instâncias existentes ao tenant Consult Delivery
--    (slug = 'consult', único tenant ativo)
UPDATE evolution_instances
SET tenant_id = (
  SELECT id FROM tenants WHERE slug = 'consult' LIMIT 1
)
WHERE tenant_id IS NULL;

-- 3. Guard: aborta se alguma linha ficou sem tenant_id (backfill falhou)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM evolution_instances WHERE tenant_id IS NULL) THEN
    RAISE EXCEPTION 'evolution_instances: backfill de tenant_id falhou — linhas sem tenant_id encontradas. Verifique a tabela tenants.';
  END IF;
END $$;

-- 4. Torna NOT NULL (garante integridade futura)
ALTER TABLE evolution_instances
  ALTER COLUMN tenant_id SET NOT NULL;

-- 5. Índice para consultas por tenant (RLS e queries de listagem)
CREATE INDEX IF NOT EXISTS idx_evolution_instances_tenant_id
  ON evolution_instances(tenant_id);

-- 6. RLS: usuário só enxerga instâncias do seu tenant
--    Join via user_roles → roles.tenant_id (user_tenants não existe)
ALTER TABLE evolution_instances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "evolution_instances_select_own_tenant" ON evolution_instances;
CREATE POLICY "evolution_instances_select_own_tenant"
  ON evolution_instances FOR SELECT
  USING (
    tenant_id IN (
      SELECT r.tenant_id
      FROM user_roles ur
      JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = auth.uid()
    )
  );

-- Service role (edge function) ignora RLS — não precisa de policy especial.

COMMENT ON COLUMN evolution_instances.tenant_id IS
  'Tenant proprietário desta instância Evolution. Obrigatório. '
  'Edge function usa instance_name → tenant_id para rotear mensagens.';

-- ============================================================
-- FIM
-- ============================================================

COMMIT;
