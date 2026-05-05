-- supabase/migrations/20260520_004_lead_notes_and_address.sql
-- Sprint 1 — Chat Ao Vivo
-- Tabelas customer_notes e customer_addresses para o painel Lead

-- ─────────────────────────────────────────────
-- Função updated_at (reutiliza se já existir)
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ─────────────────────────────────────────────
-- 1. customer_notes — nota por cliente (auto-save)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.customer_notes (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  customer_id uuid        NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  content     text        NOT NULL DEFAULT '',
  created_by  uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by  uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, customer_id)
  -- UNIQUE garante 1 nota por customer → frontend usa upsert
);

CREATE INDEX IF NOT EXISTS idx_customer_notes_customer
  ON public.customer_notes (customer_id);

ALTER TABLE public.customer_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON public.customer_notes
  FOR ALL
  USING (
    tenant_id = (
      SELECT tenant_id FROM public.tenant_members
      WHERE user_id = auth.uid()
      LIMIT 1
    )
  );

CREATE TRIGGER trg_customer_notes_updated_at
  BEFORE UPDATE ON public.customer_notes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.customer_notes IS
  'Nota livre por cliente (1:1). Frontend faz upsert com debounce 1s.';

-- ─────────────────────────────────────────────
-- 2. customer_addresses — endereço com autocomplete ViaCEP
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.customer_addresses (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  customer_id  uuid        NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  cep          text,
  logradouro   text,
  numero       text,
  complemento  text,
  bairro       text,
  cidade       text,
  estado       char(2),
  is_primary   boolean     NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customer_addresses_customer
  ON public.customer_addresses (customer_id);

ALTER TABLE public.customer_addresses ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON public.customer_addresses
  FOR ALL
  USING (
    tenant_id = (
      SELECT tenant_id FROM public.tenant_members
      WHERE user_id = auth.uid()
      LIMIT 1
    )
  );

CREATE TRIGGER trg_customer_addresses_updated_at
  BEFORE UPDATE ON public.customer_addresses
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.customer_addresses IS
  'Endereço do cliente. CEP preenchido via ViaCEP no frontend.';
COMMENT ON COLUMN public.customer_addresses.estado IS
  'UF em 2 caracteres: SP, RJ, MG, etc.';
