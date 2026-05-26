-- F3 Onda07 — Revisão cliente pós-conclusão de tarefa
-- Adiciona colunas de revisão em tarefas_loja e cria tabela tarefa_revisoes

ALTER TABLE tarefas_loja
  ADD COLUMN IF NOT EXISTS revisao_status    text CHECK (revisao_status IN ('aguardando','aprovada','recusada')),
  ADD COLUMN IF NOT EXISTS aguarda_revisao_em timestamptz,
  ADD COLUMN IF NOT EXISTS revisao_motivo    text;

CREATE TABLE IF NOT EXISTS tarefa_revisoes (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tarefa_id   uuid        NOT NULL REFERENCES tarefas_loja(id) ON DELETE CASCADE,
  tipo        text        NOT NULL CHECK (tipo IN ('aprovacao','recusa')),
  motivo      text,
  decidido_em timestamptz DEFAULT now()
);

ALTER TABLE tarefa_revisoes ENABLE ROW LEVEL SECURITY;

-- Service role: acesso total (bridge-server usa service role)
CREATE POLICY "service_role_tarefa_revisoes" ON tarefa_revisoes
  FOR ALL USING (auth.role() = 'service_role');

-- Tenant members: leitura (via tarefas_loja → lojas → tenant_members)
CREATE POLICY "tenant_members_view_tarefa_revisoes" ON tarefa_revisoes
  FOR SELECT USING (
    EXISTS (
      SELECT 1
        FROM tarefas_loja tl
        JOIN lojas l  ON l.id  = tl.loja_id
        JOIN tenant_members tm ON tm.tenant_id = l.tenant_id
       WHERE tl.id = tarefa_revisoes.tarefa_id
         AND tm.user_id = auth.uid()
    )
  );
