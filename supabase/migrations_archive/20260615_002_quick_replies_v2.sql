-- ============================================================
-- quick_replies v2 — adiciona tenant_id, shortcut, media_type, media_url
-- Aditivo, sem DROP. Linhas sem tenant_id = defaults globais (ignorados pelo cliente).
-- ============================================================

ALTER TABLE quick_replies
  ADD COLUMN IF NOT EXISTS tenant_id  uuid REFERENCES tenants(id),
  ADD COLUMN IF NOT EXISTS shortcut   text,
  ADD COLUMN IF NOT EXISTS media_type text DEFAULT 'text'
    CHECK (media_type IN ('text', 'image', 'audio', 'video_link')),
  ADD COLUMN IF NOT EXISTS media_url  text,
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id);

-- RLS — padrão do projeto: via tenant_members (igual a marca_pesquisa, reguas, etc.)
ALTER TABLE quick_replies ENABLE ROW LEVEL SECURITY;

CREATE POLICY qr_tenant_select ON quick_replies
  FOR SELECT
  USING (
    tenant_id IS NULL
    OR tenant_id IN (SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid())
  );

CREATE POLICY qr_tenant_write ON quick_replies
  FOR ALL TO authenticated
  USING    (tenant_id IN (SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid()))
  WITH CHECK (tenant_id IN (SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid()));

-- Índice para buscas por tenant
CREATE INDEX IF NOT EXISTS idx_quick_replies_tenant_id ON quick_replies(tenant_id);
