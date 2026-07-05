-- ============================================================
-- MIGRATION: Modelo WhatsApp — Contacts, Groups, Members, Messages
-- Data: 2026-05-04
-- Nota: whatsapp_groups existia com schema antigo (wa_group_id) — recriada
-- ============================================================

-- Recriar whatsapp_groups com schema correto
DROP TABLE IF EXISTS whatsapp_groups CASCADE;

-- ------------------------------------------------------------
-- 1. WHATSAPP_CONTACTS — todos os números que já interagiram
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS whatsapp_contacts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  jid         TEXT NOT NULL,
  nome        TEXT,
  telefone    TEXT,
  loja_id     UUID REFERENCES lojas(id),
  tipo        TEXT NOT NULL DEFAULT 'cliente',
  ativo       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, jid)
);

COMMENT ON TABLE whatsapp_contacts IS 'Contatos únicos por tenant. jid: +5511999@s.whatsapp.net. tipo: cliente, equipe, desconhecido.';

CREATE INDEX IF NOT EXISTS idx_wa_contacts_tenant ON whatsapp_contacts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_wa_contacts_loja   ON whatsapp_contacts(loja_id);

ALTER TABLE whatsapp_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wa_contacts_select_tenant" ON whatsapp_contacts
  FOR SELECT USING (
    tenant_id IN (SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid())
  );

CREATE POLICY "wa_contacts_insert_tenant" ON whatsapp_contacts
  FOR INSERT WITH CHECK (
    tenant_id IN (SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid())
  );

CREATE POLICY "wa_contacts_update_tenant" ON whatsapp_contacts
  FOR UPDATE USING (
    tenant_id IN (SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid())
  );

-- ------------------------------------------------------------
-- 2. WHATSAPP_GROUPS — um grupo por loja cliente (regra geral)
-- ------------------------------------------------------------
CREATE TABLE whatsapp_groups (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  group_jid   TEXT NOT NULL,
  nome        TEXT,
  loja_id     UUID REFERENCES lojas(id),
  ativo       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, group_jid)
);

COMMENT ON TABLE whatsapp_groups IS 'Grupos WhatsApp do tenant. group_jid: 5511xxx@g.us. loja_id: associação ao cliente.';

CREATE INDEX IF NOT EXISTS idx_wa_groups_tenant ON whatsapp_groups(tenant_id);
CREATE INDEX IF NOT EXISTS idx_wa_groups_loja   ON whatsapp_groups(loja_id);

ALTER TABLE whatsapp_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wa_groups_select_tenant" ON whatsapp_groups
  FOR SELECT USING (
    tenant_id IN (SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid())
  );

CREATE POLICY "wa_groups_insert_tenant" ON whatsapp_groups
  FOR INSERT WITH CHECK (
    tenant_id IN (SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid())
  );

CREATE POLICY "wa_groups_update_tenant" ON whatsapp_groups
  FOR UPDATE USING (
    tenant_id IN (SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid())
  );

-- ------------------------------------------------------------
-- 3. WHATSAPP_GROUP_MEMBERS — participantes de cada grupo
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS whatsapp_group_members (
  group_id    UUID NOT NULL REFERENCES whatsapp_groups(id) ON DELETE CASCADE,
  contact_id  UUID NOT NULL REFERENCES whatsapp_contacts(id) ON DELETE CASCADE,
  is_admin    BOOLEAN NOT NULL DEFAULT FALSE,
  joined_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (group_id, contact_id)
);

COMMENT ON TABLE whatsapp_group_members IS 'Membros de grupos WhatsApp. Inclui dono, sócios, gerentes e equipe Consult Delivery.';

ALTER TABLE whatsapp_group_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wa_group_members_select_tenant" ON whatsapp_group_members
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM whatsapp_groups g
      JOIN tenant_members tm ON tm.tenant_id = g.tenant_id
      WHERE g.id = whatsapp_group_members.group_id AND tm.user_id = auth.uid()
    )
  );

CREATE POLICY "wa_group_members_manage_tenant" ON whatsapp_group_members
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM whatsapp_groups g
      JOIN tenant_members tm ON tm.tenant_id = g.tenant_id
      WHERE g.id = whatsapp_group_members.group_id AND tm.user_id = auth.uid()
    )
  );

-- ------------------------------------------------------------
-- 4. WHATSAPP_MESSAGES — todas as mensagens (grupos e PVs)
-- DELI monitora. Agentes só agem quando is_mention_to_bot = TRUE
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS whatsapp_messages (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  message_id        TEXT NOT NULL,
  group_id          UUID REFERENCES whatsapp_groups(id),
  contact_id        UUID REFERENCES whatsapp_contacts(id),
  conversation_id   UUID REFERENCES conversations(id),
  is_group          BOOLEAN NOT NULL DEFAULT FALSE,
  direction         TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  body              TEXT,
  media_type        TEXT CHECK (media_type IN ('text', 'image', 'audio', 'video', 'document', 'sticker')),
  media_url         TEXT,
  is_mention_to_bot BOOLEAN NOT NULL DEFAULT FALSE,
  mentioned_agent   TEXT,
  processed_by_deli BOOLEAN NOT NULL DEFAULT FALSE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, message_id)
);

COMMENT ON TABLE whatsapp_messages IS 'Todas as mensagens WA do tenant. is_mention_to_bot: agente foi @mencionado. mentioned_agent: qual agente foi chamado. DELI avalia todas; só age nas com is_mention_to_bot=true ou via triggers.';

CREATE INDEX IF NOT EXISTS idx_wa_messages_tenant  ON whatsapp_messages(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wa_messages_group   ON whatsapp_messages(group_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wa_messages_contact ON whatsapp_messages(contact_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wa_messages_mention ON whatsapp_messages(tenant_id, created_at DESC) WHERE is_mention_to_bot = TRUE;

ALTER TABLE whatsapp_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wa_messages_select_tenant" ON whatsapp_messages
  FOR SELECT USING (
    tenant_id IN (SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid())
  );

CREATE POLICY "wa_messages_insert_tenant" ON whatsapp_messages
  FOR INSERT WITH CHECK (
    tenant_id IN (SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid())
  );

CREATE POLICY "wa_messages_update_tenant" ON whatsapp_messages
  FOR UPDATE USING (
    tenant_id IN (SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid())
  );
