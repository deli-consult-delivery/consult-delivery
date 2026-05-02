-- Módulo Análise iFood — Phase 2
-- Tarefas geradas pelo analista-ifood por análise (separadas do Kanban interno)
CREATE TABLE tarefas_analise (
  id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  analise_id          UUID NOT NULL REFERENCES analises(id) ON DELETE CASCADE,
  cliente_id          UUID NOT NULL REFERENCES customers(id),
  titulo              TEXT NOT NULL,
  descricao           TEXT,
  acao                TEXT,
  urgencia            TEXT CHECK (urgencia IN ('alta', 'media', 'baixa')) DEFAULT 'media',
  status              TEXT CHECK (status IN ('pendente', 'em_progresso', 'concluida')) DEFAULT 'pendente',
  prioridade          INTEGER DEFAULT 0,
  impacto_financeiro  TEXT,
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE tarefas_analise ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant members can manage tarefas_analise"
ON tarefas_analise
USING (
  EXISTS (
    SELECT 1 FROM analises a
    JOIN tenant_members tm ON tm.tenant_id = a.tenant_id
    WHERE a.id = tarefas_analise.analise_id
      AND tm.user_id = auth.uid()
  )
);

ALTER TABLE tarefas_analise REPLICA IDENTITY FULL;
