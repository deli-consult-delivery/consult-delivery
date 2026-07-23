-- Data: 2026-07-23 | Autor: Wandson | Risco: baixo
-- Motivo: inbox idempotente e credenciais por tenant da integração Cardápio Web -> Venda ERP.
-- Reversão: DROP TABLE, na ordem, cardapio_web_events, cardapio_web_orders,
-- cardapio_web_oauth_states e cardapio_web_installations.
BEGIN;

CREATE TABLE IF NOT EXISTS public.cardapio_web_installations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  merchant_id bigint NOT NULL,
  access_token_ciphertext text NOT NULL,
  refresh_token_ciphertext text NOT NULL,
  token_expires_at timestamptz NOT NULL,
  scope text NOT NULL DEFAULT '',
  enabled boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'revoked', 'error')),
  venda_empresa text NOT NULL,
  venda_deposito text NOT NULL DEFAULT 'PADRÃO',
  venda_cliente_generico text NOT NULL DEFAULT 'Consumidor Final',
  venda_plano_conta text NOT NULL DEFAULT 'VENDA DE MERCADORIAS',
  venda_forma_pagamento text NOT NULL DEFAULT 'À vista - Dinheiro',
  venda_payment_mapping jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, merchant_id),
  UNIQUE (merchant_id),
  UNIQUE (id, tenant_id, merchant_id)
);

CREATE TABLE IF NOT EXISTS public.cardapio_web_oauth_states (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  merchant_id bigint NOT NULL,
  state_hash text NOT NULL UNIQUE,
  code_verifier_ciphertext text NOT NULL,
  venda_empresa text NOT NULL,
  bootstrap_token_hash text UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.cardapio_web_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  installation_id uuid NOT NULL REFERENCES public.cardapio_web_installations(id) ON DELETE CASCADE,
  merchant_id bigint NOT NULL,
  order_id bigint NOT NULL,
  codigo_pedido_cliente text NOT NULL,
  cw_status text NOT NULL,
  venda_order_code bigint,
  venda_order jsonb,
  write_started_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (installation_id, tenant_id, merchant_id)
    REFERENCES public.cardapio_web_installations (id, tenant_id, merchant_id)
    ON DELETE CASCADE,
  UNIQUE (tenant_id, merchant_id, order_id),
  UNIQUE (tenant_id, codigo_pedido_cliente)
);

CREATE TABLE IF NOT EXISTS public.cardapio_web_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  installation_id uuid NOT NULL REFERENCES public.cardapio_web_installations(id) ON DELETE CASCADE,
  event_id text NOT NULL UNIQUE,
  event_type text NOT NULL CHECK (event_type IN ('ORDER_CREATED', 'ORDER_STATUS_UPDATED')),
  merchant_id bigint NOT NULL,
  order_id bigint NOT NULL,
  order_status text NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'done', 'ignored', 'failed', 'reconcile')),
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  received_at timestamptz NOT NULL DEFAULT now(),
  available_at timestamptz NOT NULL DEFAULT now(),
  claimed_at timestamptz,
  processed_at timestamptz,
  FOREIGN KEY (installation_id, tenant_id, merchant_id)
    REFERENCES public.cardapio_web_installations (id, tenant_id, merchant_id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_cardapio_web_events_pending
  ON public.cardapio_web_events (available_at, received_at)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_cardapio_web_orders_lookup
  ON public.cardapio_web_orders (tenant_id, merchant_id, order_id);
CREATE INDEX IF NOT EXISTS idx_cardapio_web_oauth_states_expiry
  ON public.cardapio_web_oauth_states (expires_at)
  WHERE used_at IS NULL;

ALTER TABLE public.cardapio_web_installations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cardapio_web_oauth_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cardapio_web_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cardapio_web_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.cardapio_web_installations FROM anon, authenticated;
REVOKE ALL ON public.cardapio_web_oauth_states FROM anon, authenticated;
REVOKE ALL ON public.cardapio_web_orders FROM anon, authenticated;
REVOKE ALL ON public.cardapio_web_events FROM anon, authenticated;

-- Desde 2026, tabelas novas podem não ser autoexpostas ao Data API. O Bridge
-- usa PostgREST com service_role; o grant explícito mantém apenas esse acesso.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cardapio_web_installations TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cardapio_web_oauth_states TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cardapio_web_orders TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cardapio_web_events TO service_role;

COMMIT;

-- Isolamento esperado:
-- SET LOCAL ROLE authenticated; SELECT count(*) FROM public.cardapio_web_events; -- 0
-- O Bridge usa service_role e é o único consumidor destas tabelas.
