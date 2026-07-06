-- Habilita REPLICA IDENTITY FULL em agent_drafts para que eventos UPDATE
-- no Supabase Realtime carreguem os valores anteriores da linha (old record).
-- Sem isso, subscriptions que filtram por campo só recebem o novo valor,
-- impossibilitando diff de status no PipelineScreen.
ALTER TABLE public.agent_drafts REPLICA IDENTITY FULL;

-- Adicionar agent_drafts à publication do realtime (caso não esteja)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'agent_drafts'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.agent_drafts;
  END IF;
END$$;
