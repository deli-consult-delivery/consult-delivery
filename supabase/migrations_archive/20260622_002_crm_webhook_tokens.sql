-- ════════════════════════════════════════════════════════════════════════════
-- 20260622_002_crm_webhook_tokens
--
-- Credenciais por tenant para o webhook inbound do CRM externo.
-- O CRM autentica via header x-crm-token; guardamos apenas o SHA-256 do token
-- (nunca o plaintext). O plaintext é gerado uma vez e configurado no CRM via
-- Infisical. O Bridge usa service-role e bypassa RLS; membros do tenant veem
-- só os tokens do próprio tenant.
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.crm_webhook_tokens (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  token_hash   text        NOT NULL,
  descricao    text,
  ativo        boolean     NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz
);

-- token_hash globalmente único (SHA-256 hex) → lookup direto por hash no Bridge
CREATE UNIQUE INDEX IF NOT EXISTS crm_webhook_tokens_token_hash_unique
  ON public.crm_webhook_tokens (token_hash);

CREATE INDEX IF NOT EXISTS crm_webhook_tokens_tenant_idx
  ON public.crm_webhook_tokens (tenant_id);

-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE public.crm_webhook_tokens ENABLE ROW LEVEL SECURITY;

-- Membros do tenant (via tenant_members) gerenciam os próprios tokens.
DROP POLICY IF EXISTS crm_webhook_tokens_tenant_members ON public.crm_webhook_tokens;
CREATE POLICY crm_webhook_tokens_tenant_members
  ON public.crm_webhook_tokens
  FOR ALL
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tm.tenant_id FROM public.tenant_members tm WHERE tm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    tenant_id IN (
      SELECT tm.tenant_id FROM public.tenant_members tm WHERE tm.user_id = auth.uid()
    )
  );
