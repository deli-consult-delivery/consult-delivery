-- 20260630_001_karina_enable_admin_modules.sql
-- Desbloqueia a gestão de usuários/permissões para o tenant "Karina Doceria".
--
-- Contexto: o módulo de usuários (tela Configurações → aba "Usuários e equipes",
-- convite via /api/users/invite, edição de role via update_member_role) já existe
-- e está cabeado no ConsoleV2 (case 'configsys'). O que faltava era habilitar o
-- módulo no allowlist `tenant_modules` da Karina — sem a linha, o ConsoleV2 esconde
-- o item de menu e o guard bloqueia a tela.
--
-- Aditivo/reversível e idempotente (ON CONFLICT DO NOTHING). NÃO altera os 5 módulos
-- já habilitados (avaliacao-config, controle-atendimentos, csat, nps, visao).
-- Não afeta nenhum outro tenant.
--
-- Tenant: e9fdaa66-cbe7-4dff-905b-afc4b10219ff  (Karina Doceria)
--
-- Rollback:
--   DELETE FROM public.tenant_modules
--   WHERE tenant_id = 'e9fdaa66-cbe7-4dff-905b-afc4b10219ff'
--     AND module_key IN ('configsys','acesso','auditoria');

INSERT INTO public.tenant_modules (tenant_id, module_key, enabled)
VALUES
  ('e9fdaa66-cbe7-4dff-905b-afc4b10219ff', 'configsys', true),  -- Configurações: gestão de usuários, roles, permissões de tela
  ('e9fdaa66-cbe7-4dff-905b-afc4b10219ff', 'acesso',    true),  -- Acesso por usuário (controle por agente)
  ('e9fdaa66-cbe7-4dff-905b-afc4b10219ff', 'auditoria', true)   -- Auditoria (audit_log) — visibilidade do admin
ON CONFLICT (tenant_id, module_key) DO NOTHING;
