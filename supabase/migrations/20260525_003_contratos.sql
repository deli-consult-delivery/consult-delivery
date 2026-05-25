-- G03.1 — Tabela contratos digitais
-- NOTA: profiles.tenant_id não existe; RLS usa tenant_members(user_id, tenant_id)

CREATE TABLE contratos (
  id                    uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid          NOT NULL REFERENCES tenants(id),
  customer_id           uuid          REFERENCES customers(id),
  pacote                text          NOT NULL CHECK (pacote IN ('light','performance','enterprise','growth')),
  valor_setup           numeric(10,2),
  valor_mensal          numeric(10,2) NOT NULL,
  percentual_crescimento numeric(5,2),
  duracao_meses         int,
  multa_percentual      numeric(5,2),
  status                text          NOT NULL DEFAULT 'rascunho'
                                      CHECK (status IN ('rascunho','enviado','assinado','encerrado')),
  assinado_em           timestamptz,
  assinatura_hash       text,
  asaas_subscription_id text,
  vigencia_inicio       date,
  vigencia_fim          date,
  pdf_url               text,
  created_at            timestamptz   NOT NULL DEFAULT now(),
  updated_at            timestamptz   NOT NULL DEFAULT now()
);

ALTER TABLE contratos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_own" ON contratos
  FOR ALL
  USING (tenant_id IN (
    SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid()
  ));
