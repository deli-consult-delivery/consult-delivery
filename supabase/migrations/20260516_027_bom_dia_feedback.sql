-- Feedback de postagens do agente Bom Dia
-- Um voto por run por tenant (thumbs_up / thumbs_down)

CREATE TABLE IF NOT EXISTS public.bom_dia_feedback (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id     UUID        NOT NULL REFERENCES public.agent_runs(id) ON DELETE CASCADE,
  tenant_id  UUID        NOT NULL REFERENCES public.tenants(id)    ON DELETE CASCADE,
  vote       TEXT        NOT NULL CHECK (vote IN ('thumbs_up', 'thumbs_down')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (run_id, tenant_id)
);

CREATE INDEX IF NOT EXISTS bom_dia_feedback_tenant_run_idx
  ON public.bom_dia_feedback (tenant_id, created_at DESC);

ALTER TABLE public.bom_dia_feedback ENABLE ROW LEVEL SECURITY;

-- Membros do tenant podem ler e escrever feedback
CREATE POLICY "tenant bom_dia_feedback select"
  ON public.bom_dia_feedback FOR SELECT
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "tenant bom_dia_feedback insert"
  ON public.bom_dia_feedback FOR INSERT
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "tenant bom_dia_feedback update"
  ON public.bom_dia_feedback FOR UPDATE
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "tenant bom_dia_feedback delete"
  ON public.bom_dia_feedback FOR DELETE
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid()
    )
  );
