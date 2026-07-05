-- supabase/migrations/20260602_001_bot_reply_log.sql
-- Tabela atômica para guard de bot replies (anti race condition).
--
-- Problema: quando cliente envia 2+ mensagens em rapido sucessao (< 1s) fora
-- do horario, dois invokes paralelos de checkAndSendBotResponse rodam o SELECT
-- de "ja respondi hoje?" ANTES de qualquer INSERT commitar. Ambos passam o
-- check, ambos enviam, cliente recebe N copias da resposta automatica.
--
-- Fix: PK (conversation_id, reply_date) bloqueia o segundo INSERT
-- atomicamente. checkAndSendBotResponse tenta INSERT primeiro; se PK violation,
-- ja existe registro para hoje -> aborta sem enviar.
--
-- Tambem cobre o caso de fire-and-forget cancelado pelo Deno Edge Runtime:
-- se o INSERT de messages nao persistir, o log AQUI ja persistiu (insert
-- aconteceu ANTES do fetch para Evolution), entao a proxima invocacao ainda
-- bloqueia corretamente.

CREATE TABLE IF NOT EXISTS public.bot_reply_log (
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  reply_date      date NOT NULL,
  tenant_id       uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  created_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, reply_date)
);

CREATE INDEX IF NOT EXISTS idx_bot_reply_log_tenant_date
  ON public.bot_reply_log (tenant_id, reply_date DESC);

ALTER TABLE public.bot_reply_log ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'bot_reply_log'
      AND policyname = 'tenant_isolation'
  ) THEN
    CREATE POLICY "tenant_isolation" ON public.bot_reply_log
      FOR ALL USING (
        tenant_id IN (
          SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid()
        )
      );
  END IF;
END $$;

COMMENT ON TABLE public.bot_reply_log IS
  'Registro atomico de bot replies por dia por conversa. PK (conversation_id, reply_date) eh usada como guard contra race conditions quando respond_only_first=true.';
