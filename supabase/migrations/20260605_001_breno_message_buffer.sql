-- Buffer de mensagens para debounce do BRENO off-hours
-- Acumula mensagens picotadas de uma conversa; triagem lê o conjunto completo
CREATE TABLE IF NOT EXISTS breno_message_buffer (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid        NOT NULL REFERENCES tenants(id),
  conversation_id   text        NOT NULL,
  remote_jid        text        NOT NULL,
  instance_name     text        NOT NULL,
  push_name         text,
  buffered_messages jsonb       NOT NULL DEFAULT '[]',
  last_message_at   timestamptz NOT NULL DEFAULT now(),
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, conversation_id)
);

ALTER TABLE breno_message_buffer ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON breno_message_buffer
  USING (tenant_id = (SELECT auth.jwt()->>'tenant_id')::uuid);
