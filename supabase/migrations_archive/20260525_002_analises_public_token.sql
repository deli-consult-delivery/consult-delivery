-- supabase/migrations/20260525_002_analises_public_token.sql
-- F4 Onda 07 — Dashboard público cliente (sem login)
-- Adiciona public_token para compartilhamento seguro de análises

ALTER TABLE public.analises
  ADD COLUMN IF NOT EXISTS public_token UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL;

ALTER TABLE public.analises
  ADD COLUMN IF NOT EXISTS public_token_expires_at TIMESTAMPTZ DEFAULT (now() + interval '60 days');

CREATE INDEX IF NOT EXISTS idx_analises_public_token ON public.analises(public_token);
