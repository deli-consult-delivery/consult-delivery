-- BRENO Off-Hours: tabela de triagem de mensagens fora do expediente
-- Branch: feat/breno-offhours | 2026-06-04

-- Garantir row BRENO (idempotente — já existe mas cobre reset de ambientes)
INSERT INTO public.agents (id, name, role, letter, color, category, default_modo)
VALUES ('breno', 'BRENO', 'Atendimento', 'B', '#2563eb', 'specialist', 'ia')
ON CONFLICT (id) DO NOTHING;

-- Tabela principal de triagem off-hours
CREATE TABLE IF NOT EXISTS public.breno_triagem (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  origem         text        NOT NULL CHECK (origem IN ('grupo', 'pv')),
  remote_jid     text        NOT NULL,
  cliente_nome   text,
  cliente_numero text,
  loja_id        uuid        REFERENCES public.lojas(id),
  nivel          text        NOT NULL CHECK (nivel IN ('urgente', 'normal', 'ignorar')),
  categoria      text        CHECK (categoria IN ('suporte', 'demanda', 'venda', 'duvida', 'outro')),
  resumo         text,
  mensagem_raw   text        NOT NULL,
  confianca      numeric,
  notificado     boolean     NOT NULL DEFAULT false,
  notificado_em  timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_breno_triagem_tenant_nivel
  ON public.breno_triagem (tenant_id, nivel, created_at DESC);

-- RLS: isolar por tenant
ALTER TABLE public.breno_triagem ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON public.breno_triagem
  USING (
    tenant_id = (
      SELECT tenant_id FROM public.tenant_members
      WHERE user_id = auth.uid()
      LIMIT 1
    )
  );

-- Service role bypassa RLS (padrão do projeto)
CREATE POLICY "service_role_full" ON public.breno_triagem
  TO service_role USING (true) WITH CHECK (true);
