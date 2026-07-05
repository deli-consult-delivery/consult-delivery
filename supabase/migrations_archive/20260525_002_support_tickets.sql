-- G02.1 — Tabela support_tickets (BRENO)
-- RLS via tenant_members (não profiles) conforme padrão do projeto.

CREATE TABLE IF NOT EXISTS support_tickets (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid        NOT NULL REFERENCES tenants(id),
  conversation_id uuid        REFERENCES conversations(id),
  sender_jid      text        NOT NULL,
  titulo          text,
  descricao       text        NOT NULL,
  status          text        NOT NULL DEFAULT 'aberto'
                              CHECK (status IN ('aberto','em_andamento','resolvido','escalado')),
  resolvido_por   text        CHECK (resolvido_por IN ('breno','humano')),
  resolucao       text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_own" ON support_tickets
  FOR ALL
  USING (
    tenant_id IN (
      SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS idx_support_tickets_tenant
  ON support_tickets(tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_support_tickets_status
  ON support_tickets(status);
