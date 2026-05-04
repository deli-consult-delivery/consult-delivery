-- ============================================================
-- SEED: Papéis, permissões e acesso de agentes — Consult Delivery
-- Data: 2026-05-04
-- tenant_id: 9079bd4d-4df7-4023-90fb-d79c8ba7e900
-- ============================================================

DO $$
DECLARE
  v_tenant      UUID := '9079bd4d-4df7-4023-90fb-d79c8ba7e900';
  v_wandson     UUID := '718e256d-cc54-4dcf-b69a-b7574d31aceb';
  v_yasmin      UUID := '20353272-fe45-41da-9c4a-63472dd2a2ce';
  v_welida      UUID := '14904752-87f9-4d92-bd66-571cd3bd14ac';
  v_eduardo     UUID := 'cba66f88-f97d-4eb0-93fc-0a9d585e07ef';
  r_admin       UUID;
  r_dev         UUID;
  r_marketing   UUID;
  r_atendimento UUID;
  r_financeiro  UUID;
  r_viewer      UUID;
  r_deli_owner  UUID;
BEGIN

-- 1. Criar os 7 papéis do sistema
INSERT INTO roles (tenant_id, name, description, is_system) VALUES
  (v_tenant, 'admin',       'Acesso total',                              true),
  (v_tenant, 'dev',         'Dev frontend — sem financeiro',             true),
  (v_tenant, 'marketing',   'Marketing e CRM — sem financeiro',          true),
  (v_tenant, 'atendimento', 'Atendimento e suporte — sem financeiro',    true),
  (v_tenant, 'financeiro',  'Cobrança e inadimplência — restrito',       true),
  (v_tenant, 'viewer',      'Somente visualização',                      true),
  (v_tenant, 'deli_owner',  'COO digital — invoke agentes e aprovações', true)
ON CONFLICT (tenant_id, name) DO NOTHING;

-- Recuperar IDs gerados
SELECT id INTO r_admin       FROM roles WHERE tenant_id = v_tenant AND name = 'admin';
SELECT id INTO r_dev         FROM roles WHERE tenant_id = v_tenant AND name = 'dev';
SELECT id INTO r_marketing   FROM roles WHERE tenant_id = v_tenant AND name = 'marketing';
SELECT id INTO r_atendimento FROM roles WHERE tenant_id = v_tenant AND name = 'atendimento';
SELECT id INTO r_financeiro  FROM roles WHERE tenant_id = v_tenant AND name = 'financeiro';
SELECT id INTO r_viewer      FROM roles WHERE tenant_id = v_tenant AND name = 'viewer';
SELECT id INTO r_deli_owner  FROM roles WHERE tenant_id = v_tenant AND name = 'deli_owner';

-- 2. role_permissions ─────────────────────────────────────

-- admin → acesso total
INSERT INTO role_permissions (role_id, resource, action) VALUES
  (r_admin, 'financeiro',      'view'),
  (r_admin, 'financeiro',      'create'),
  (r_admin, 'financeiro',      'edit'),
  (r_admin, 'financeiro',      'delete'),
  (r_admin, 'crm',             'view'),
  (r_admin, 'crm',             'create'),
  (r_admin, 'crm',             'edit'),
  (r_admin, 'crm',             'delete'),
  (r_admin, 'cobranca',        'view'),
  (r_admin, 'cobranca',        'create'),
  (r_admin, 'cobranca',        'edit'),
  (r_admin, 'cobranca',        'execute'),
  (r_admin, 'cobranca',        'approve'),
  (r_admin, 'analise_ifood',   'view'),
  (r_admin, 'analise_ifood',   'execute'),
  (r_admin, 'agents_panel',    'view'),
  (r_admin, 'agents_panel',    'execute'),
  (r_admin, 'reports',         'view'),
  (r_admin, 'reports',         'create'),
  (r_admin, 'tenant_admin',    'view'),
  (r_admin, 'tenant_admin',    'edit'),
  (r_admin, 'kanban',          'view'),
  (r_admin, 'kanban',          'create'),
  (r_admin, 'kanban',          'edit'),
  (r_admin, 'kanban',          'delete'),
  (r_admin, 'chat',            'view'),
  (r_admin, 'chat',            'create'),
  (r_admin, 'grupos_whatsapp', 'view'),
  (r_admin, 'grupos_whatsapp', 'create'),
  (r_admin, 'approve_drafts',  'approve'),
  (r_admin, 'deli',            'view'),
  (r_admin, 'deli',            'execute'),
  (r_admin, 'deli',            'approve')
ON CONFLICT DO NOTHING;

-- dev → chat, kanban, crm(view), reports, analise_ifood, agents_panel
INSERT INTO role_permissions (role_id, resource, action) VALUES
  (r_dev, 'chat',          'view'),
  (r_dev, 'chat',          'create'),
  (r_dev, 'kanban',        'view'),
  (r_dev, 'kanban',        'create'),
  (r_dev, 'kanban',        'edit'),
  (r_dev, 'crm',           'view'),
  (r_dev, 'reports',       'view'),
  (r_dev, 'analise_ifood', 'view'),
  (r_dev, 'analise_ifood', 'execute'),
  (r_dev, 'agents_panel',  'view')
ON CONFLICT DO NOTHING;

-- marketing → chat, kanban, crm, reports, agents_panel
INSERT INTO role_permissions (role_id, resource, action) VALUES
  (r_marketing, 'chat',         'view'),
  (r_marketing, 'chat',         'create'),
  (r_marketing, 'kanban',       'view'),
  (r_marketing, 'kanban',       'create'),
  (r_marketing, 'kanban',       'edit'),
  (r_marketing, 'crm',          'view'),
  (r_marketing, 'crm',          'create'),
  (r_marketing, 'crm',          'edit'),
  (r_marketing, 'reports',      'view'),
  (r_marketing, 'agents_panel', 'view')
ON CONFLICT DO NOTHING;

-- atendimento → chat, grupos_whatsapp, kanban, analise_ifood(view), agents_panel
INSERT INTO role_permissions (role_id, resource, action) VALUES
  (r_atendimento, 'chat',            'view'),
  (r_atendimento, 'chat',            'create'),
  (r_atendimento, 'grupos_whatsapp', 'view'),
  (r_atendimento, 'grupos_whatsapp', 'create'),
  (r_atendimento, 'kanban',          'view'),
  (r_atendimento, 'kanban',          'create'),
  (r_atendimento, 'kanban',          'edit'),
  (r_atendimento, 'analise_ifood',   'view'),
  (r_atendimento, 'agents_panel',    'view')
ON CONFLICT DO NOTHING;

-- financeiro → financeiro, cobranca, agents_panel(view)
INSERT INTO role_permissions (role_id, resource, action) VALUES
  (r_financeiro, 'financeiro',   'view'),
  (r_financeiro, 'financeiro',   'create'),
  (r_financeiro, 'financeiro',   'edit'),
  (r_financeiro, 'cobranca',     'view'),
  (r_financeiro, 'cobranca',     'create'),
  (r_financeiro, 'cobranca',     'edit'),
  (r_financeiro, 'cobranca',     'execute'),
  (r_financeiro, 'agents_panel', 'view')
ON CONFLICT DO NOTHING;

-- viewer → kanban(view), reports(view)
INSERT INTO role_permissions (role_id, resource, action) VALUES
  (r_viewer, 'kanban',  'view'),
  (r_viewer, 'reports', 'view')
ON CONFLICT DO NOTHING;

-- deli_owner → agents_panel, approve_drafts, deli
INSERT INTO role_permissions (role_id, resource, action) VALUES
  (r_deli_owner, 'agents_panel',  'view'),
  (r_deli_owner, 'agents_panel',  'execute'),
  (r_deli_owner, 'approve_drafts','approve'),
  (r_deli_owner, 'deli',          'view'),
  (r_deli_owner, 'deli',          'execute'),
  (r_deli_owner, 'deli',          'approve')
ON CONFLICT DO NOTHING;

-- 3. user_roles ─────────────────────────────────────────
INSERT INTO user_roles (user_id, role_id, granted_by) VALUES
  (v_wandson, r_admin,       v_wandson),
  (v_wandson, r_deli_owner,  v_wandson),
  (v_yasmin,  r_dev,         v_wandson),
  (v_welida,  r_marketing,   v_wandson),
  (v_eduardo, r_atendimento, v_wandson)
ON CONFLICT DO NOTHING;

-- 4. user_agent_access ──────────────────────────────────
INSERT INTO user_agent_access
  (user_id, agent_name, can_invoke, can_view_history, can_approve_drafts, granted_by)
VALUES
  (v_wandson, 'main',           true, true, true,  v_wandson),
  (v_wandson, 'analista-ifood', true, true, true,  v_wandson),
  (v_wandson, 'deli',           true, true, true,  v_wandson),
  (v_yasmin,  'analista-ifood', true, true, false, v_wandson),
  (v_welida,  'analista-ifood', true, true, false, v_wandson),
  (v_eduardo, 'analista-ifood', true, true, false, v_wandson)
ON CONFLICT DO NOTHING;

END $$;
