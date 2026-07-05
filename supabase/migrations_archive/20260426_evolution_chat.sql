-- Migration: Evolution API integration + chat tables extension
-- TASK-201 / TASK-202 — Chat Unificado
-- Date: 2026-04-26

-- ─────────────────────────────────────────────
-- 1. Instâncias Evolution API (multi-instância)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS evolution_instances (
  id             uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id      uuid        REFERENCES tenants(id) ON DELETE CASCADE,
  instance_name  text        NOT NULL UNIQUE,
  evolution_url  text        NOT NULL,
  api_key        text        NOT NULL,
  status         text        DEFAULT 'disconnected', -- connected | disconnected | connecting
  phone          text,
  profile_name   text,
  created_at     timestamptz DEFAULT now(),
  updated_at     timestamptz DEFAULT now()
);

ALTER TABLE evolution_instances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members can manage instances"
  ON evolution_instances FOR ALL
  USING (
    tenant_id IN (
      SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid()
    )
  );

-- ─────────────────────────────────────────────
-- 2. Extend conversations
-- ─────────────────────────────────────────────
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS instance_id      uuid    REFERENCES evolution_instances(id),
  ADD COLUMN IF NOT EXISTS whatsapp_chat_id text,   -- ex: 5511999999999@s.whatsapp.net ou grupo@g.us
  ADD COLUMN IF NOT EXISTS is_group         boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS group_name       text,
  ADD COLUMN IF NOT EXISTS preview          text,
  ADD COLUMN IF NOT EXISTS last_message_at  timestamptz;

-- Index para busca por chat_id
CREATE INDEX IF NOT EXISTS idx_conversations_whatsapp_chat_id
  ON conversations(whatsapp_chat_id, instance_id);

-- ─────────────────────────────────────────────
-- 3. Extend messages
-- ─────────────────────────────────────────────
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS whatsapp_msg_id text,
  ADD COLUMN IF NOT EXISTS media_url       text,
  ADD COLUMN IF NOT EXISTS media_type      text;  -- image | video | audio | document

CREATE INDEX IF NOT EXISTS idx_messages_whatsapp_msg_id
  ON messages(whatsapp_msg_id);

-- ─────────────────────────────────────────────
-- 4. Instância padrão Consult Delivery
--    (inserida somente se não existir)
-- ─────────────────────────────────────────────
-- Nota: api_key e tenant_id devem ser preenchidos manualmente ou via seed.
-- O INSERT abaixo é um placeholder para referência:
--
-- INSERT INTO evolution_instances (instance_name, evolution_url, api_key, status)
-- VALUES ('suporte-consult-delivery',
--         'https://evo-go-evolution-api.3kork4.easypanel.host',
--         '<VITE_EVOLUTION_KEY>',
--         'disconnected')
-- ON CONFLICT (instance_name) DO NOTHING;
