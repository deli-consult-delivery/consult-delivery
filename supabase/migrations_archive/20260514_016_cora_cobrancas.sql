-- CORA · Cobrança Inteligente
-- Tabelas: cora_cobrancas, cora_reguas, cora_acoes

-- ── Réguas de cobrança ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.cora_reguas (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  nome        text        NOT NULL,
  descricao   text,
  is_active   boolean     NOT NULL DEFAULT true,
  passos      jsonb       NOT NULL DEFAULT '[]',
  -- passos: [{dia: 3, canal: 'whatsapp', template: 'amigavel'}, ...]
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cora_reguas_tenant_idx ON public.cora_reguas (tenant_id);

ALTER TABLE public.cora_reguas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cora_reguas_tenant" ON public.cora_reguas FOR ALL USING (
  tenant_id = (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid() LIMIT 1)
);

-- Seed: régua padrão (será preenchida por tenant no primeiro acesso)
-- (não seed aqui pois tenant_id é necessário)

-- ── Cobranças ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.cora_cobrancas (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  customer_name      text        NOT NULL,
  customer_phone     text,
  customer_whatsapp  text,
  valor_original     numeric(10,2) NOT NULL,
  valor_atual        numeric(10,2) NOT NULL,
  data_vencimento    date        NOT NULL,
  status             text        NOT NULL DEFAULT 'aberto'
                                 CHECK (status IN ('aberto','negociando','pago','cancelado','escalonado')),
  regua_id           uuid        REFERENCES public.cora_reguas(id) ON DELETE SET NULL,
  asaas_charge_id    text,
  notas              text,
  cora_analise       jsonb,      -- última análise IA da CORA
  metadata           jsonb       NOT NULL DEFAULT '{}',
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cora_cobrancas_tenant_idx ON public.cora_cobrancas (tenant_id, status, data_vencimento);
CREATE INDEX IF NOT EXISTS cora_cobrancas_status_idx ON public.cora_cobrancas (tenant_id, status);

ALTER TABLE public.cora_cobrancas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cora_cobrancas_tenant" ON public.cora_cobrancas FOR ALL USING (
  tenant_id = (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid() LIMIT 1)
);

-- ── Ações executadas pela CORA ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.cora_acoes (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  cobranca_id   uuid        NOT NULL REFERENCES public.cora_cobrancas(id) ON DELETE CASCADE,
  tenant_id     uuid        NOT NULL REFERENCES public.tenants(id),
  tipo          text        NOT NULL,
  -- 'mensagem_enviada' | 'analise_ia' | 'escalonamento' | 'pagamento_confirmado' | 'negociacao'
  canal         text,       -- 'whatsapp' | 'email' | 'interno'
  conteudo      text,
  resultado     text,       -- 'entregue' | 'lido' | 'respondido' | 'pago' | 'ignorado'
  agente        text        NOT NULL DEFAULT 'cora',
  cora_analise  jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cora_acoes_cobranca_idx ON public.cora_acoes (cobranca_id, created_at DESC);
CREATE INDEX IF NOT EXISTS cora_acoes_tenant_idx ON public.cora_acoes (tenant_id, created_at DESC);

ALTER TABLE public.cora_acoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cora_acoes_tenant" ON public.cora_acoes FOR ALL USING (
  tenant_id = (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid() LIMIT 1)
);

-- ── Realtime ─────────────────────────────────────────────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE public.cora_cobrancas;
ALTER PUBLICATION supabase_realtime ADD TABLE public.cora_acoes;
