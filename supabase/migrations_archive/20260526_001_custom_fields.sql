-- Sprint 02 — Custom Fields v2
-- Tabelas: custom_fields + custom_field_values com RLS via tenant_members

CREATE TABLE IF NOT EXISTS custom_fields (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid        NOT NULL REFERENCES tenants(id),
  entidade     text        NOT NULL CHECK (entidade IN ('loja','customer','tarefa','contrato','lead')),
  nome         text        NOT NULL,
  tipo         text        NOT NULL CHECK (tipo IN ('texto','numero','data','boolean','select','multiselect')),
  opcoes       jsonb,
  obrigatorio  boolean     NOT NULL DEFAULT false,
  ordem        int         NOT NULL DEFAULT 0,
  ajuda        text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, entidade, nome)
);

ALTER TABLE custom_fields ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_member_custom_fields" ON custom_fields
  FOR ALL
  USING (
    tenant_id IN (
      SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid()
    )
  );

CREATE TABLE IF NOT EXISTS custom_field_values (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  custom_field_id uuid        NOT NULL REFERENCES custom_fields(id) ON DELETE CASCADE,
  entidade_id     uuid        NOT NULL,
  valor           text,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (custom_field_id, entidade_id)
);

ALTER TABLE custom_field_values ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_member_custom_field_values" ON custom_field_values
  FOR ALL
  USING (
    custom_field_id IN (
      SELECT id FROM custom_fields
      WHERE tenant_id IN (
        SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid()
      )
    )
  );

COMMENT ON TABLE custom_fields IS 'Campos personalizados por tenant e entidade (loja, customer, tarefa, contrato, lead)';
COMMENT ON TABLE custom_field_values IS 'Valores dos campos personalizados por instância de entidade';
