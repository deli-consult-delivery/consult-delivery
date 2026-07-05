-- Habilita Realtime para agent_drafts (badge de pendentes na LaraScreen atualiza em tempo real)
ALTER PUBLICATION supabase_realtime ADD TABLE public.agent_drafts;
