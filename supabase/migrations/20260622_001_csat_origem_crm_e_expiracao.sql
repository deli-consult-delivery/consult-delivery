-- ════════════════════════════════════════════════════════════════════════════
-- 20260622_001_csat_origem_crm_e_expiracao
--
-- CSAT de Atendimento: suportar avaliações originadas em CRM externo
-- (conversa vive 100% no CRM do cliente, sem conversation_id nosso) +
-- expiração de 7 dias para CSAT e NPS.
--
-- Aditivo/reversível. Não destrói dados (1 linha existente preservada).
--   1. atendimento_avaliacoes.conversation_id passa a aceitar NULL
--   2. UNIQUE(conversation_id) → UNIQUE parcial WHERE conversation_id IS NOT NULL
--      (mantém regra 1-avaliação-por-conversa no fluxo interno; permite N NULLs)
--   3. FK ON DELETE CASCADE mantida (válida quando há conversa; NULL é aceito)
--   4. Novas colunas: contact_identifier, origem ('interno'|'crm_externo'), external_ref
--   5. Idempotência CRM: UNIQUE parcial (tenant_id, external_ref) WHERE external_ref NOT NULL
--   6. public_token_expires_at default → 7 dias (atendimento_avaliacoes E nps_avaliacoes)
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. conversation_id deixa de ser obrigatório ──────────────────────────────
ALTER TABLE public.atendimento_avaliacoes
  ALTER COLUMN conversation_id DROP NOT NULL;

-- ── 2. UNIQUE(conversation_id) total → parcial ───────────────────────────────
ALTER TABLE public.atendimento_avaliacoes
  DROP CONSTRAINT IF EXISTS atend_aval_conversation_unique;

CREATE UNIQUE INDEX IF NOT EXISTS atend_aval_conversation_unique_partial
  ON public.atendimento_avaliacoes (conversation_id)
  WHERE conversation_id IS NOT NULL;

-- ── 4. Colunas de origem externa ─────────────────────────────────────────────
ALTER TABLE public.atendimento_avaliacoes
  ADD COLUMN IF NOT EXISTS contact_identifier text;

ALTER TABLE public.atendimento_avaliacoes
  ADD COLUMN IF NOT EXISTS origem text NOT NULL DEFAULT 'interno';

ALTER TABLE public.atendimento_avaliacoes
  ADD COLUMN IF NOT EXISTS external_ref text;

ALTER TABLE public.atendimento_avaliacoes
  DROP CONSTRAINT IF EXISTS atendimento_avaliacoes_origem_check;
ALTER TABLE public.atendimento_avaliacoes
  ADD CONSTRAINT atendimento_avaliacoes_origem_check
  CHECK (origem IN ('interno', 'crm_externo'));

-- ── 5. Idempotência do webhook do CRM ────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS atend_aval_tenant_external_ref_unique
  ON public.atendimento_avaliacoes (tenant_id, external_ref)
  WHERE external_ref IS NOT NULL;

-- ── 6. Expiração 7 dias (req #3 + Q4: vale p/ CSAT e NPS) ─────────────────────
ALTER TABLE public.atendimento_avaliacoes
  ALTER COLUMN public_token_expires_at SET DEFAULT (now() + interval '7 days');

ALTER TABLE public.nps_avaliacoes
  ALTER COLUMN public_token_expires_at SET DEFAULT (now() + interval '7 days');
