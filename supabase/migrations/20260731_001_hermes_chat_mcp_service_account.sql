-- 20260731_001_hermes_chat_mcp_service_account.sql
-- CON-6: conta de serviço dedicada do hermes-chat-mcp (wrapper Nimbalyst <-> DELI/Ana).
-- O usuário em auth.users já foi criado via GoTrue Admin API (fora de migration —
-- não é DDL de schema). Aqui só concedemos acesso de leitura ao tenant plataforma,
-- necessário para a policy RLS de deli_messages
-- (tenant_members_view_own_deli_messages -> accessible_tenant_ids()).
-- tenant_members.role é restrito por CHECK a owner|admin|consultor|operador|dev
-- (não tem "viewer") -- 'operador' é o menor privilégio disponível nesse enum.
-- Aditivo/reversível: DELETE FROM tenant_members WHERE user_id = '726e3fbd-6a40-4b85-ae98-ba634f5f8a50' reverte.

INSERT INTO tenant_members (tenant_id, user_id, role, display_name)
VALUES (
  '9079bd4d-4df7-4023-90fb-d79c8ba7e900', -- tenant plataforma (CD_AUDIT_TENANT_ID)
  '726e3fbd-6a40-4b85-ae98-ba634f5f8a50', -- hermes-chat-mcp@service.consultdelivery.com.br
  'operador',
  'hermes-chat-mcp (service account)'
)
ON CONFLICT (tenant_id, user_id) DO NOTHING;

-- CORREÇÃO (achado ao testar live-smoke): o middleware requireAgentAccess do Bridge
-- (bridge-server/index.js) NÃO usa roles/role_permissions/user_roles (esse RBAC é do
-- Console) -- checa (1) user_agent_access.can_invoke=true por slug exato, com fallback
-- (2) tenant_members.role contra ROLE_AGENT_PREFIXES (só admin/owner cobrem 'deli-*').
-- Em vez de dar tenant_members.role='admin' (acesso total, desnecessário), usamos a via
-- de menor privilégio: grant explícito e escopado só ao agente 'deli-conversa'.
-- Aditivo/reversível: DELETE FROM user_agent_access WHERE user_id = '726e3fbd-...' AND agent_name = 'deli-conversa' reverte.
INSERT INTO user_agent_access (user_id, tenant_id, agent_name, agent_id, can_invoke, can_view_history, can_approve_drafts, granted_by)
VALUES (
  '726e3fbd-6a40-4b85-ae98-ba634f5f8a50', -- hermes-chat-mcp@service.consultdelivery.com.br
  '9079bd4d-4df7-4023-90fb-d79c8ba7e900', -- tenant plataforma
  'deli-conversa', 'deli', -- agent_name = slug da rota (checagem primária); agent_id = FK real em agents
  true,  -- can_invoke: precisa disparar /agents/deli-conversa/run
  false, -- can_view_history: não precisa (não lê deli_messages fora do que a própria tool recebe)
  false, -- can_approve_drafts: nunca aprova draft, é só ponte de chat
  '726e3fbd-6a40-4b85-ae98-ba634f5f8a50'
)
ON CONFLICT (user_id, agent_name) DO NOTHING;
