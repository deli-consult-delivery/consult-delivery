-- supabase/migrations/20260527_006_tags_and_lists.sql
-- Sprint 2 — Chat Ao Vivo
-- Tags e Listas para segmentação de clientes e conversas

-- ─────────────────────────────────────────────
-- 1. lead_tags
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.lead_tags (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name       text        NOT NULL,
  color      text        NOT NULL DEFAULT '#6B7280',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name)
);

CREATE INDEX IF NOT EXISTS idx_lead_tags_tenant
  ON public.lead_tags (tenant_id);

ALTER TABLE public.lead_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON public.lead_tags
  FOR ALL
  USING (
    tenant_id = (
      SELECT tenant_id FROM public.tenant_members
      WHERE user_id = auth.uid()
      LIMIT 1
    )
  );

COMMENT ON TABLE public.lead_tags IS
  'Tags coloridas para segmentação de leads e conversas. Criadas por tenant.';

-- ─────────────────────────────────────────────
-- 2. customer_tags (N:N)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.customer_tags (
  customer_id uuid        NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  tag_id      uuid        NOT NULL REFERENCES public.lead_tags(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (customer_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_customer_tags_tag
  ON public.customer_tags (tag_id);

ALTER TABLE public.customer_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON public.customer_tags
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.lead_tags lt
      INNER JOIN public.tenant_members tm ON tm.tenant_id = lt.tenant_id
      WHERE lt.id = tag_id
        AND tm.user_id = auth.uid()
    )
  );

COMMENT ON TABLE public.customer_tags IS
  'Tags aplicadas a customers (N:N). Aplicar tag no customer reflete em todas as suas conversas.';

-- ─────────────────────────────────────────────
-- 3. conversation_tags (N:N)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.conversation_tags (
  conversation_id uuid        NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  tag_id          uuid        NOT NULL REFERENCES public.lead_tags(id) ON DELETE CASCADE,
  created_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_conversation_tags_tag
  ON public.conversation_tags (tag_id);

ALTER TABLE public.conversation_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON public.conversation_tags
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.lead_tags lt
      INNER JOIN public.tenant_members tm ON tm.tenant_id = lt.tenant_id
      WHERE lt.id = tag_id
        AND tm.user_id = auth.uid()
    )
  );

COMMENT ON TABLE public.conversation_tags IS
  'Tags aplicadas diretamente à conversa (N:N). Independente de customer_tags.';

-- ─────────────────────────────────────────────
-- 4. lead_lists
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.lead_lists (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name        text        NOT NULL,
  description text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name)
);

CREATE INDEX IF NOT EXISTS idx_lead_lists_tenant
  ON public.lead_lists (tenant_id);

ALTER TABLE public.lead_lists ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON public.lead_lists
  FOR ALL
  USING (
    tenant_id = (
      SELECT tenant_id FROM public.tenant_members
      WHERE user_id = auth.uid()
      LIMIT 1
    )
  );

COMMENT ON TABLE public.lead_lists IS
  'Listas de segmentação de leads (ex: Potenciais, Inativos, Promoção).';

-- ─────────────────────────────────────────────
-- 5. lead_list_members
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.lead_list_members (
  list_id     uuid        NOT NULL REFERENCES public.lead_lists(id) ON DELETE CASCADE,
  customer_id uuid        NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (list_id, customer_id)
);

CREATE INDEX IF NOT EXISTS idx_lead_list_members_customer
  ON public.lead_list_members (customer_id);

ALTER TABLE public.lead_list_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON public.lead_list_members
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.lead_lists ll
      INNER JOIN public.tenant_members tm ON tm.tenant_id = ll.tenant_id
      WHERE ll.id = list_id
        AND tm.user_id = auth.uid()
    )
  );

COMMENT ON TABLE public.lead_list_members IS
  'Membros de cada lista de leads (N:N).';
