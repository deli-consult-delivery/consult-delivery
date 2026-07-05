-- MIA-01: Monitor IA — análise de conversas WhatsApp via Kimi K2.6
CREATE TABLE IF NOT EXISTS mia_analises (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  conversation_id  UUID,                       -- referência à conversations.id (soft)
  message_id       TEXT,                       -- evolution_message_id do webhook
  sender_jid       TEXT,                       -- número do cliente (ex: 55119...@s.whatsapp.net)
  message_body     TEXT        NOT NULL,
  fatos            TEXT[]      DEFAULT '{}',
  tarefas_sugeridas TEXT[]     DEFAULT '{}',
  confianca        NUMERIC(3,2),               -- 0.00 a 1.00
  model_used       TEXT        DEFAULT 'kimi-k2.6:cloud',
  latency_ms       INTEGER,
  status           TEXT        NOT NULL DEFAULT 'ok'
                     CHECK (status IN ('ok', 'error', 'skipped')),
  error_message    TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE mia_analises ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mia_analises_tenant" ON mia_analises FOR ALL USING (
  tenant_id = (SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid() LIMIT 1)
);

CREATE INDEX IF NOT EXISTS idx_mia_tenant_time  ON mia_analises(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mia_conversation ON mia_analises(conversation_id) WHERE conversation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_mia_status       ON mia_analises(tenant_id, status);
