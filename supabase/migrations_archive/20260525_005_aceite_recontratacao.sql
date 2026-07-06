-- G05.3: tabela de rastreamento de re-contratação dos 49 clientes
-- RLS usa tenant_members (profiles.tenant_id não existe neste schema)

CREATE TABLE aceite_recontratacao (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  customer_id uuid REFERENCES customers(id),
  whatsapp_jid text,
  pacote_ofertado text NOT NULL CHECK (pacote_ofertado IN ('light','performance','enterprise','growth')),
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','aceito','recusado','sem_resposta')),
  mensagem_enviada_em timestamptz,
  respondido_em timestamptz,
  notas text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE aceite_recontratacao ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_own" ON aceite_recontratacao FOR ALL
  USING (tenant_id=(SELECT tenant_id FROM tenant_members WHERE user_id=auth.uid() LIMIT 1));
