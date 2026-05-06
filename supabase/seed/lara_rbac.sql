-- ============================================================
-- SEED: Permissões RBAC para agente LARA
-- Data: 2026-05-06
-- tenant_id: 9079bd4d-4df7-4023-90fb-d79c8ba7e900
-- Referência: docs/fluxos/lara-regua.md §5 Permissões
-- ============================================================

DO $$
DECLARE
  v_tenant   UUID := '9079bd4d-4df7-4023-90fb-d79c8ba7e900';
  v_wandson  UUID := '718e256d-cc54-4dcf-b69a-b7574d31aceb';
  v_welida   UUID := '14904752-87f9-4d92-bd66-571cd3bd14ac';
  r_admin    UUID;
  r_marketing UUID;
BEGIN

SELECT id INTO r_admin    FROM roles WHERE tenant_id = v_tenant AND name = 'admin';
SELECT id INTO r_marketing FROM roles WHERE tenant_id = v_tenant AND name = 'marketing';

-- 1. role_permissions — acesso por papel (React <RequireRole>)
--    marketing e admin podem invocar e aprovar drafts da LARA
INSERT INTO role_permissions (role_id, resource, action) VALUES
  (r_marketing, 'lara', 'execute'),
  (r_marketing, 'lara', 'approve'),
  (r_admin,     'lara', 'execute'),
  (r_admin,     'lara', 'approve')
ON CONFLICT DO NOTHING;

-- 2. user_agent_access — controle granular por usuário (Bridge Server requireAgentAccess)
--    Wandson: pode invocar + aprovar drafts
--    Wélida: pode invocar + aprovar drafts (usuária principal da LARA)
INSERT INTO user_agent_access
  (user_id, agent_name, can_invoke, can_view_history, can_approve_drafts, granted_by)
VALUES
  (v_wandson, 'lara', true, true, true, v_wandson),
  (v_welida,  'lara', true, true, true, v_wandson)
ON CONFLICT (user_id, agent_name) DO UPDATE SET
  can_invoke         = EXCLUDED.can_invoke,
  can_view_history   = EXCLUDED.can_view_history,
  can_approve_drafts = EXCLUDED.can_approve_drafts;

END $$;
