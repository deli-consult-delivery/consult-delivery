-- Habilita Realtime para agent_runs (necessário para LaraScreen e outros consumidores)
ALTER PUBLICATION supabase_realtime ADD TABLE public.agent_runs;
