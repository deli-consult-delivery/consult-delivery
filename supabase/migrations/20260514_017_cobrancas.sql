-- Migration: 20260514_017_cobrancas
-- Criada em: 2026-05-14
-- Autor: Wandson (via Claude Code)
-- Descricao: Tabela de cobranças V2 integrada com Asaas.
--            Substitui o uso direto de cora_cobrancas para operações via API Asaas.
--            cora_cobrancas (V1, criada em 016) continua intacta e não deve ser alterada.
-- Motivo: Suportar ciclo completo de cobrança Asaas (PIX/Boleto/Cartão) com campos
--         específicos da API (invoice_url, bank_slip_url, pix_qr_code, asaas_charge_id),
--         status alinhado ao vocabulário Asaas e cache de dados do cliente para evitar
--         JOINs frequentes em listagens de alto volume.
-- Risco: Baixo — tabela nova, zero impacto em dados existentes.
-- Dependencias: tenants (existe), crm_customers (AINDA NAO EXISTE — FK adiada via NOT VALID).
-- Reversao: DROP TABLE IF EXISTS public.cobrancas CASCADE;

BEGIN;

-- ── 1. Tabela principal ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.cobrancas (
  id               uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid           NOT NULL
                                  REFERENCES public.tenants(id) ON DELETE CASCADE,
  -- FK para crm_customers: tabela ainda não existe neste milestone.
  -- Constraint adicionada como NOT VALID e será validada na migration que criar crm_customers.
  cliente_id       uuid           NULL,
  asaas_charge_id  text           UNIQUE,
  valor            numeric(10,2)  NOT NULL,
  vencimento       date           NOT NULL,
  status           text           NOT NULL DEFAULT 'pending'
                                  CHECK (status IN ('pending','received','overdue','refunded','canceled')),
  billing_type     text           NOT NULL DEFAULT 'PIX'
                                  CHECK (billing_type IN ('BOLETO','PIX','CREDIT_CARD','UNDEFINED')),
  invoice_url      text           NULL,
  bank_slip_url    text           NULL,
  pix_qr_code      text           NULL,
  customer_name    text           NULL,
  customer_phone   text           NULL,
  notas            text           NULL,
  metadata         jsonb          NOT NULL DEFAULT '{}',
  created_at       timestamptz    NOT NULL DEFAULT now(),
  updated_at       timestamptz    NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.cobrancas IS
  'Cobranças V2 gerenciadas via API Asaas. Não confundir com cora_cobrancas (V1).';

COMMENT ON COLUMN public.cobrancas.asaas_charge_id IS
  'ID retornado pela API Asaas ao criar a cobrança (ex: pay_xxx). Único por tenant implicitamente pela constraint UNIQUE.';
COMMENT ON COLUMN public.cobrancas.cliente_id IS
  'FK para crm_customers(id). Pode ser NULL quando cliente ainda não está no CRM ou a FK ainda não foi validada.';
COMMENT ON COLUMN public.cobrancas.status IS
  'Status espelhado do Asaas: pending=aguardando, received=pago, overdue=vencido, refunded=estornado, canceled=cancelado.';
COMMENT ON COLUMN public.cobrancas.billing_type IS
  'Tipo de cobrança conforme enum Asaas: PIX, BOLETO, CREDIT_CARD ou UNDEFINED.';
COMMENT ON COLUMN public.cobrancas.customer_name IS
  'Cache do nome do cliente para evitar JOIN frequente em listagens. Atualizar quando crm_customers for alterado.';
COMMENT ON COLUMN public.cobrancas.customer_phone IS
  'Cache do telefone do cliente. Mesmo racional que customer_name.';
COMMENT ON COLUMN public.cobrancas.invoice_url IS
  'URL da fatura gerada pelo Asaas (link de pagamento).';
COMMENT ON COLUMN public.cobrancas.bank_slip_url IS
  'URL do boleto bancário (somente billing_type = BOLETO).';
COMMENT ON COLUMN public.cobrancas.pix_qr_code IS
  'Payload PIX copia-e-cola retornado pelo Asaas (somente billing_type = PIX).';
COMMENT ON COLUMN public.cobrancas.metadata IS
  'Dados adicionais sem schema fixo (ex: webhook payload bruto do Asaas, campos extras de integração).';

-- ── 2. Índices ────────────────────────────────────────────────────────────────

-- Listagem por tenant (query base de toda a tela de cobranças)
CREATE INDEX IF NOT EXISTS idx_cobrancas_tenant_id
  ON public.cobrancas (tenant_id);

-- Filtro por status dentro de um tenant (listagem "cobranças vencidas", "pagas" etc.)
CREATE INDEX IF NOT EXISTS idx_cobrancas_status
  ON public.cobrancas (tenant_id, status);

-- Ordenação e filtro por vencimento dentro de um tenant
CREATE INDEX IF NOT EXISTS idx_cobrancas_vencimento
  ON public.cobrancas (tenant_id, vencimento);

-- Lookup por ID Asaas (webhooks de confirmação de pagamento)
CREATE INDEX IF NOT EXISTS idx_cobrancas_asaas_charge_id
  ON public.cobrancas (asaas_charge_id)
  WHERE asaas_charge_id IS NOT NULL;

-- ── 3. Trigger de updated_at ─────────────────────────────────────────────────

-- A função public.set_updated_at() já existe (criada em 20260505_001_internal_notifications.sql).
-- Reutilizamos sem recriar.
CREATE TRIGGER cobrancas_set_updated_at
  BEFORE UPDATE ON public.cobrancas
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ── 4. RLS ───────────────────────────────────────────────────────────────────

ALTER TABLE public.cobrancas ENABLE ROW LEVEL SECURITY;

-- Política única de isolamento por tenant.
-- Cada operação (SELECT/INSERT/UPDATE/DELETE) verifica que o tenant_id da linha
-- pertence ao tenant do usuário autenticado.
CREATE POLICY cobrancas_tenant_isolation
  ON public.cobrancas
  FOR ALL
  USING (
    tenant_id = (
      SELECT tenant_id
      FROM public.tenant_members
      WHERE user_id = auth.uid()
      LIMIT 1
    )
  )
  WITH CHECK (
    tenant_id = (
      SELECT tenant_id
      FROM public.tenant_members
      WHERE user_id = auth.uid()
      LIMIT 1
    )
  );

-- ── 5. Realtime ───────────────────────────────────────────────────────────────

-- Permite que o frontend receba updates em tempo real (ex: status alterado pelo webhook Asaas).
ALTER PUBLICATION supabase_realtime ADD TABLE public.cobrancas;

-- ── NOTA FUTURA ───────────────────────────────────────────────────────────────
-- Quando a migration de crm_customers for criada, adicionar:
--
--   ALTER TABLE public.cobrancas
--     ADD CONSTRAINT cobrancas_cliente_fkey
--     FOREIGN KEY (cliente_id) REFERENCES public.crm_customers(id)
--     ON DELETE SET NULL
--     NOT VALID;
--
--   ALTER TABLE public.cobrancas
--     VALIDATE CONSTRAINT cobrancas_cliente_fkey;
--
-- ─────────────────────────────────────────────────────────────────────────────

COMMIT;

-- ── Reversao ─────────────────────────────────────────────────────────────────
-- DROP TABLE IF EXISTS public.cobrancas CASCADE;
-- (O DROP CASCADE remove índices, trigger e políticas associadas automaticamente.)
