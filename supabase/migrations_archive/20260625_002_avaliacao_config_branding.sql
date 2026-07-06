-- ════════════════════════════════════════════════════════════════════════════
-- avaliacao_config: campos de mensagem personalizável por tenant
-- CSAT e NPS — título, subtítulo, agradecimento
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.avaliacao_config
  ADD COLUMN IF NOT EXISTS csat_titulo        text,
  ADD COLUMN IF NOT EXISTS csat_subtitulo     text,
  ADD COLUMN IF NOT EXISTS csat_agradecimento text,
  ADD COLUMN IF NOT EXISTS nps_titulo         text,
  ADD COLUMN IF NOT EXISTS nps_subtitulo      text,
  ADD COLUMN IF NOT EXISTS nps_agradecimento  text;
