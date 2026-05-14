-- NOVA · Blueprints de Automação IA
CREATE TABLE IF NOT EXISTS public.nova_blueprints (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id         uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  client_name     text        NOT NULL,
  segmento        text,
  problema        text        NOT NULL,
  objetivo        text,
  sistemas_atuais text[]      NOT NULL DEFAULT '{}',
  budget_range    text,       -- 'ate-500' | '500-2000' | '2000-5000' | 'acima-5000'
  prazo_desejado  text,       -- 'urgente' | '1-mes' | '2-3-meses' | 'flexivel'
  discovery       jsonb,
  blueprint       jsonb,
  estimate        jsonb,
  status          text        NOT NULL DEFAULT 'discovery'
                              CHECK (status IN ('discovery', 'blueprint', 'complete')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS nova_blueprints_tenant_idx ON public.nova_blueprints (tenant_id, created_at DESC);

ALTER TABLE public.nova_blueprints ENABLE ROW LEVEL SECURITY;

CREATE POLICY "nova_blueprints_tenant" ON public.nova_blueprints FOR ALL USING (
  tenant_id = (
    SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid() LIMIT 1
  )
);

-- Habilita Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.nova_blueprints;
