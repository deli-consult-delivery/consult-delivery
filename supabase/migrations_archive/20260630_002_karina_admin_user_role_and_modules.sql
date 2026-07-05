-- 20260630_002_karina_admin_user_role_and_modules.sql
-- Conserta o acesso completo do admin da Karina Doceria. Dois furos:
--
--   (1) RBAC: o admin real karinadoceria@hotmail.com (67c294d7) não tinha linha em
--       `user_roles`. Telas embrulhadas em <RequireRole roles={['admin', ...]}>
--       (ex.: NpsResultados.jsx, AtendimentoAvaliacoes.jsx) leem user_roles/role_permissions
--       via usePermissions.js — não a coluna tenant_members.role — então davam AccessDenied
--       mesmo com tenant_members.role='admin'. A seed 20260624_001 concedeu o papel ao
--       usuário errado (5b7f2042 = wandsonconsultor), nunca ao admin da Karina.
--
--   (2) tenant_modules: a migration 20260630_001 usou ON CONFLICT DO NOTHING, que NÃO
--       flipou as linhas pré-existentes `configsys` e `acesso` que estavam enabled=false.
--       Só `auditoria` (linha nova) ficou true. O menu do ConsoleV2 escondia os 2 itens.
--
-- Aditivo/reversível e idempotente. Não afeta nenhum outro tenant nem usuário.
--
-- Tenant:  e9fdaa66-cbe7-4dff-905b-afc4b10219ff  (Karina Doceria)
-- Usuário: 67c294d7-8903-4d52-a0eb-31681ef533fa  (karinadoceria@hotmail.com)
--
-- Rollback:
--   DELETE FROM public.user_roles
--   WHERE user_id = '67c294d7-8903-4d52-a0eb-31681ef533fa'
--     AND role_id IN (SELECT id FROM public.roles
--                     WHERE tenant_id = 'e9fdaa66-cbe7-4dff-905b-afc4b10219ff' AND name = 'admin');
--   UPDATE public.tenant_modules SET enabled = false
--   WHERE tenant_id = 'e9fdaa66-cbe7-4dff-905b-afc4b10219ff'
--     AND module_key IN ('configsys','acesso');

-- (1) papel RBAC admin para o admin real da Karina (espelha 20260624_001, granted_by NULL)
INSERT INTO public.user_roles (user_id, role_id, granted_by)
SELECT '67c294d7-8903-4d52-a0eb-31681ef533fa', r.id, NULL
FROM public.roles r
WHERE r.tenant_id = 'e9fdaa66-cbe7-4dff-905b-afc4b10219ff'
  AND r.name = 'admin'
ON CONFLICT DO NOTHING;

-- (2) completar a 20260630_001: flipar as linhas que o DO NOTHING deixou em false
UPDATE public.tenant_modules
SET enabled = true
WHERE tenant_id = 'e9fdaa66-cbe7-4dff-905b-afc4b10219ff'
  AND module_key IN ('configsys', 'acesso')
  AND enabled = false;
