-- 20260624_001_rbac_seed_karina_tenant.sql
-- Semeia papéis-sistema para o tenant Karina Doceria e atribui role admin ao usuário.
-- Idempotente (ON CONFLICT DO NOTHING em toda inserção).
-- Espelha o padrão de 20260610_001_rbac_seed_system_roles.sql.
--
-- Tenant:  e9fdaa66-cbe7-4dff-905b-afc4b10219ff  (Karina Doceria)
-- Usuário: 5b7f2042-9158-424b-b2fc-f58c41bcd0ef  (wandsonconsultor@consultdelivery.com.br)

-- 1) semear os 7 papéis-sistema do tenant
SELECT public.seed_rbac_system_roles('e9fdaa66-cbe7-4dff-905b-afc4b10219ff');

-- 2) atribuir role admin ao usuário
INSERT INTO user_roles (user_id, role_id, granted_by)
SELECT
  '5b7f2042-9158-424b-b2fc-f58c41bcd0ef',
  r.id,
  NULL
FROM roles r
WHERE r.tenant_id = 'e9fdaa66-cbe7-4dff-905b-afc4b10219ff'
  AND r.name = 'admin'
ON CONFLICT DO NOTHING;
