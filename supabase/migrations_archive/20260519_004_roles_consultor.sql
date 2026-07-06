-- ============================================================
-- PILOTO Onda 01 — Migration 04
-- Data: 2026-05-19
-- Autor: Wandson via Claude Code
-- Motivo: Adicionar papéis consultor e consultor_senior
-- Risco: BAIXO (apenas INSERT, schema preservado)
-- IMPORTANTE: roles usa (name, description, tenant_id) em inglês.
--             role_permissions usa (resource, action) em inglês.
--             ON CONFLICT (tenant_id, name) — UNIQUE real da tabela.
-- Reversão:
--   DELETE FROM role_permissions WHERE role_id IN
--     (SELECT id FROM roles WHERE name IN ('consultor','consultor_senior'));
--   DELETE FROM roles WHERE name IN ('consultor','consultor_senior');
-- ============================================================

BEGIN;

-- Insere papéis para cada tenant existente (idempotente)
INSERT INTO roles (id, tenant_id, name, description, is_system)
SELECT
  gen_random_uuid(),
  t.id,
  'consultor',
  'Consultor de delivery atribuído a lojas específicas',
  false
FROM tenants t
ON CONFLICT (tenant_id, name) DO NOTHING;

INSERT INTO roles (id, tenant_id, name, description, is_system)
SELECT
  gen_random_uuid(),
  t.id,
  'consultor_senior',
  'Consultor sênior: cria lojas e gerencia atribuições',
  false
FROM tenants t
ON CONFLICT (tenant_id, name) DO NOTHING;

-- Permissões do consultor
INSERT INTO role_permissions (role_id, resource, action)
SELECT r.id, perms.resource, perms.action
FROM roles r
CROSS JOIN (VALUES
  ('lojas',                   'read'),
  ('lojas',                   'update'),
  ('tarefas_loja',            'read'),
  ('tarefas_loja',            'create'),
  ('tarefas_loja',            'update'),
  ('analises',                'read'),
  ('analises',                'create'),
  ('loja_metricas_snapshot',  'read'),
  ('loja_metricas_snapshot',  'create'),
  ('agent_memories',          'read'),
  ('agent_memories',          'create')
) AS perms(resource, action)
WHERE r.name = 'consultor'
ON CONFLICT DO NOTHING;

-- Permissões do consultor_senior (inclui gerenciar lojas e atribuições)
INSERT INTO role_permissions (role_id, resource, action)
SELECT r.id, perms.resource, perms.action
FROM roles r
CROSS JOIN (VALUES
  ('lojas',                   'read'),
  ('lojas',                   'create'),
  ('lojas',                   'update'),
  ('lojas',                   'delete'),
  ('loja_consultores',        'create'),
  ('loja_consultores',        'update'),
  ('loja_consultores',        'delete'),
  ('tarefas_loja',            '*'),
  ('analises',                '*'),
  ('loja_metricas_snapshot',  '*'),
  ('agent_memories',          '*')
) AS perms(resource, action)
WHERE r.name = 'consultor_senior'
ON CONFLICT DO NOTHING;

COMMIT;
