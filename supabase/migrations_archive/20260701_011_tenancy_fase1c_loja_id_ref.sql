-- Tenancy Fase 1c — coluna de referência loja_id nas tabelas dependentes
-- Decisões do Wandson (2026-07-01):
--   (1) cobrancas ficam na agência (receita da consultoria); loja_id é só REFERÊNCIA p/ relatório.
--   (2) Roteamento automático adiado — só Karina opera; loja_id nasce NULL, preenchido quando 2ª loja ativar.
--   (3) 91 CSAT/NPS órfãos ficam na agência (sem loja pra derivar com segurança).
--
-- Natureza: SQL ADITIVO/REVERSÍVEL. NÃO altera tenant_id de nenhuma linha. NÃO altera RLS.
-- loja_id é nullable e não é usado por nenhuma policy — é apenas vínculo/relatório.
-- Ver mapeamento e evidência em docs/tenancy-fase1c-lojas-dependentes-spec.md

ALTER TABLE public.cobrancas
  ADD COLUMN IF NOT EXISTS loja_id uuid REFERENCES public.lojas(id);

ALTER TABLE public.atendimento_avaliacoes
  ADD COLUMN IF NOT EXISTS loja_id uuid REFERENCES public.lojas(id);

ALTER TABLE public.nps_avaliacoes
  ADD COLUMN IF NOT EXISTS loja_id uuid REFERENCES public.lojas(id);

-- Índices parciais (só linhas já vinculadas) para consultas por loja.
CREATE INDEX IF NOT EXISTS idx_cobrancas_loja_id
  ON public.cobrancas(loja_id) WHERE loja_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_atendimento_avaliacoes_loja_id
  ON public.atendimento_avaliacoes(loja_id) WHERE loja_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_nps_avaliacoes_loja_id
  ON public.nps_avaliacoes(loja_id) WHERE loja_id IS NOT NULL;

COMMENT ON COLUMN public.cobrancas.loja_id IS
  'Fase 1c: referência opcional à loja cobrada. tenant_id permanece na agência (receita da consultoria). Não usado por RLS.';
COMMENT ON COLUMN public.atendimento_avaliacoes.loja_id IS
  'Fase 1c: vínculo opcional à loja. Preenchido quando a loja passa a operar atendimento pela plataforma.';
COMMENT ON COLUMN public.nps_avaliacoes.loja_id IS
  'Fase 1c: vínculo opcional à loja. Preenchido quando a loja passa a operar atendimento pela plataforma.';

-- ROLLBACK (se necessário):
-- DROP INDEX IF EXISTS idx_cobrancas_loja_id, idx_atendimento_avaliacoes_loja_id, idx_nps_avaliacoes_loja_id;
-- ALTER TABLE public.cobrancas DROP COLUMN IF EXISTS loja_id;
-- ALTER TABLE public.atendimento_avaliacoes DROP COLUMN IF EXISTS loja_id;
-- ALTER TABLE public.nps_avaliacoes DROP COLUMN IF EXISTS loja_id;
