-- Entradas de notas por cliente/conversa (multi-entrada, timestampada)
-- Substitui o textarea morto do inspector com sistema estruturado
-- Suporta: nota manual, sugestão do Breno, contexto de conversa
-- Reversão: DROP TABLE public.customer_note_entries;

CREATE TABLE public.customer_note_entries (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  customer_id     uuid        NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  conversation_id uuid        NULL REFERENCES public.conversations(id) ON DELETE SET NULL,
  content         text        NOT NULL,
  source          text        NOT NULL DEFAULT 'manual'
                              CHECK (source IN ('manual','breno','conversation')),
  chat_task_id    uuid        NULL REFERENCES public.chat_tasks(id) ON DELETE SET NULL,
  created_by      uuid        NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.customer_note_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "note_entries_tenant" ON public.customer_note_entries
  USING (
    EXISTS (SELECT 1 FROM public.tenant_members tm
            WHERE tm.tenant_id = customer_note_entries.tenant_id AND tm.user_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.tenant_members tm
            WHERE tm.tenant_id = customer_note_entries.tenant_id AND tm.user_id = auth.uid())
  );

CREATE INDEX idx_note_entries_customer    ON public.customer_note_entries(customer_id)              WHERE customer_id IS NOT NULL;
CREATE INDEX idx_note_entries_conversation ON public.customer_note_entries(conversation_id)         WHERE conversation_id IS NOT NULL;
CREATE INDEX idx_note_entries_tenant_created ON public.customer_note_entries(tenant_id, created_at DESC);