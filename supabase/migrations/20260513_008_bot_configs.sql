-- Migration: bot_configs
-- Tabela de configuração do bot de resposta automática por tenant
-- Criada em: 13/05/2026

CREATE TABLE IF NOT EXISTS bot_configs (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID        NOT NULL UNIQUE,
  is_active           BOOLEAN     NOT NULL DEFAULT false,
  schedule            JSONB       NOT NULL DEFAULT '{
    "mon": {"on": true,  "start": "09:00", "end": "18:00"},
    "tue": {"on": true,  "start": "09:00", "end": "18:00"},
    "wed": {"on": true,  "start": "09:00", "end": "18:00"},
    "thu": {"on": true,  "start": "09:00", "end": "18:00"},
    "fri": {"on": true,  "start": "09:00", "end": "18:00"},
    "sat": {"on": false, "start": "09:00", "end": "13:00"},
    "sun": {"on": false, "start": "09:00", "end": "13:00"}
  }'::jsonb,
  message             TEXT        NOT NULL DEFAULT 'Olá! No momento estamos fora do horário de atendimento. Em breve um consultor irá te atender. 🚀',
  respond_only_first  BOOLEAN     NOT NULL DEFAULT true,
  timezone            TEXT        NOT NULL DEFAULT 'America/Sao_Paulo',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE bot_configs ENABLE ROW LEVEL SECURITY;

-- Qualquer membro do tenant pode ler
CREATE POLICY "tenant members can read bot_config" ON bot_configs
  FOR SELECT USING (
    tenant_id IN (
      SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid()
    )
  );

-- Admin e dev podem escrever
CREATE POLICY "admin and dev can write bot_config" ON bot_configs
  FOR ALL USING (
    tenant_id IN (
      SELECT tenant_id FROM tenant_members
      WHERE user_id = auth.uid() AND role IN ('admin', 'dev')
    )
  );
