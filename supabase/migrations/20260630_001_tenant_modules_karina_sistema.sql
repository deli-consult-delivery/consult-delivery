-- Migration: 20260630_001_tenant_modules_karina_sistema.sql
-- Data: 2026-06-30
-- Motivo: Pedido do Wandson — no tenant Karina Doceria, grupo "Sistema" do menu deve
--         mostrar só "Usuários e equipe" + "Auditoria". A allowlist em tenant_modules
--         já existia para este tenant (FASE-2 RBAC) mas não tinha 'usuarios' e ainda
--         liberava 'configsys' e 'acesso'.
-- Tenant: e9fdaa66-cbe7-4dff-905b-afc4b10219ff (Karina Doceria)
-- Aditivo/reversível (D5 v3): aplicado direto no Supabase via MCP antes desta migration
--   ser commitada; este arquivo só versiona o estado em git.
-- Reversão:
--   UPDATE tenant_modules SET enabled = true
--     WHERE tenant_id = 'e9fdaa66-cbe7-4dff-905b-afc4b10219ff' AND module_key IN ('configsys','acesso');
--   DELETE FROM tenant_modules
--     WHERE tenant_id = 'e9fdaa66-cbe7-4dff-905b-afc4b10219ff' AND module_key = 'usuarios';

BEGIN;

INSERT INTO tenant_modules (tenant_id, module_key, enabled)
VALUES ('e9fdaa66-cbe7-4dff-905b-afc4b10219ff', 'usuarios', true)
ON CONFLICT (tenant_id, module_key) DO UPDATE SET enabled = true;

UPDATE tenant_modules SET enabled = false
WHERE tenant_id = 'e9fdaa66-cbe7-4dff-905b-afc4b10219ff'
  AND module_key IN ('configsys', 'acesso');

COMMIT;
