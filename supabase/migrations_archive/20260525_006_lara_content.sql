-- S2-G01.1 — LARA: content_calendar, content_drafts, content_published
-- RLS via tenant_members (não profiles.tenant_id)

-- Calendário editorial
CREATE TABLE IF NOT EXISTS content_calendar (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  tema        text NOT NULL,
  formato     text NOT NULL DEFAULT 'post' CHECK (formato IN ('post','story','carrossel','reels')),
  data_alvo   date NOT NULL,
  status      text NOT NULL DEFAULT 'planejado' CHECK (status IN ('planejado','gerado','revisao','publicado','cancelado')),
  draft_id    uuid,
  created_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE content_calendar ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lara_calendar_tenant" ON content_calendar
  FOR ALL USING (tenant_id IN (SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid()));

-- Rascunhos gerados pela LARA
CREATE TABLE IF NOT EXISTS content_drafts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  calendar_id   uuid REFERENCES content_calendar(id),
  titulo        text NOT NULL,
  corpo         text NOT NULL,
  hashtags      text[],
  formato       text NOT NULL DEFAULT 'post',
  status        text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','aprovado','rejeitado','publicado')),
  feedback      text,
  revisado_por  uuid REFERENCES auth.users(id),
  revisado_em   timestamptz,
  tokens_gastos int,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE content_drafts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lara_drafts_tenant" ON content_drafts
  FOR ALL USING (tenant_id IN (SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid()));

-- Posts publicados (imutável)
CREATE TABLE IF NOT EXISTS content_published (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  draft_id      uuid NOT NULL REFERENCES content_drafts(id),
  titulo        text NOT NULL,
  corpo         text NOT NULL,
  hashtags      text[],
  formato       text NOT NULL,
  canal         text NOT NULL DEFAULT 'instagram' CHECK (canal IN ('instagram','linkedin','whatsapp','outro')),
  publicado_por uuid REFERENCES auth.users(id),
  published_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE content_published ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lara_published_tenant" ON content_published
  FOR ALL USING (tenant_id IN (SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid()));
