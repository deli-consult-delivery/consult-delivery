-- REPLICA IDENTITY FULL para tabelas do pipeline de agentes
-- Necessário para o Supabase Realtime detectar mudanças em UPDATE/DELETE
-- client_tasks já estava FULL — aplicar nas 3 restantes
ALTER TABLE public.deli_pending_approvals REPLICA IDENTITY FULL;
ALTER TABLE public.agent_runs             REPLICA IDENTITY FULL;
ALTER TABLE public.internal_notifications  REPLICA IDENTITY FULL;

-- Adicionar à publication de Realtime as tabelas que ainda não estavam
-- (agent_runs e internal_notifications já estavam; client_tasks e deli_pending_approvals não)
ALTER PUBLICATION supabase_realtime ADD TABLE public.deli_pending_approvals;
ALTER PUBLICATION supabase_realtime ADD TABLE public.client_tasks;
