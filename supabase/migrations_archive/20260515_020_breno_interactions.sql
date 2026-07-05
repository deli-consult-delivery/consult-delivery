-- Migration: 20260515_020_breno_interactions.sql
-- Data: 2026-05-15
-- Autor: Wandson (via Claude Code)
-- Motivo: Feature V2-2 BRENO — agente de atendimento automático via WhatsApp.
--         Registra cada decisão que BRENO toma (resposta gerada, ação executada,
--         modo de operação no momento) para auditoria, treinamento e dashboard de revisão.
--         Sem este log não é possível auditar o que BRENO enviou, nem exibir pendências
--         de revisão humana para o Eduardo.
-- Risco: Baixo — tabela nova, sem alteração em tabelas existentes.
--        ALTER PUBLICATION pode gerar erro ignorável se a tabela já estiver na publicação.
-- Dependências:
--   - public.tenants          (existe desde migrations iniciais)
--   - public.conversations    (existe desde 20260426_evolution_chat.sql)
--   - public.agent_runs       (existe desde 20260512_005_create_agent_runs.sql)
--   - auth.users              (gerenciado pelo Supabase Auth)
-- Reversão:
--   BEGIN;
--   ALTER PUBLICATION supabase_realtime DROP TABLE IF EXISTS public.breno_interactions;
--   DROP TABLE IF EXISTS public.breno_interactions;
--   COMMIT;

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Tabela principal: breno_interactions
--    Um registro por mensagem WhatsApp recebida que acionou o BRENO.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.breno_interactions (
  id                    uuid        NOT NULL DEFAULT gen_random_uuid(),
  tenant_id             uuid        NOT NULL,
  conversation_id       uuid        NOT NULL,
  inbound_message_id    text        NOT NULL,
  outbound_message_id   text        NULL,
  mode                  text        NOT NULL,
  breno_response        text        NOT NULL,
  action_taken          text        NOT NULL,
  agent_run_id          uuid        NULL,
  requires_review       boolean     NOT NULL DEFAULT false,
  reviewed_at           timestamptz NULL,
  reviewed_by           uuid        NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),

  -- ── Chave primária ──────────────────────────────────────────────────────────
  CONSTRAINT breno_interactions_pkey
    PRIMARY KEY (id),

  -- ── Chaves estrangeiras ──────────────────────────────────────────────────────
  CONSTRAINT breno_interactions_tenant_fkey
    FOREIGN KEY (tenant_id)
    REFERENCES public.tenants(id)
    ON DELETE CASCADE,

  CONSTRAINT breno_interactions_conversation_fkey
    FOREIGN KEY (conversation_id)
    REFERENCES public.conversations(id)
    ON DELETE CASCADE,

  CONSTRAINT breno_interactions_agent_run_fkey
    FOREIGN KEY (agent_run_id)
    REFERENCES public.agent_runs(id)
    ON DELETE SET NULL,

  CONSTRAINT breno_interactions_reviewed_by_fkey
    FOREIGN KEY (reviewed_by)
    REFERENCES auth.users(id)
    ON DELETE SET NULL,

  -- ── Domínios via CHECK ───────────────────────────────────────────────────────
  CONSTRAINT breno_interactions_mode_check
    CHECK (mode IN ('humano', 'hibrido', 'ia')),

  CONSTRAINT breno_interactions_action_taken_check
    CHECK (action_taken IN ('sent', 'suggested', 'skipped'))
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Comentários nas colunas
-- ─────────────────────────────────────────────────────────────────────────────
COMMENT ON TABLE public.breno_interactions IS
  'Audit log de cada decisão que o agente BRENO tomou ao receber uma mensagem WhatsApp.';

COMMENT ON COLUMN public.breno_interactions.inbound_message_id IS
  'ID da mensagem WhatsApp recebida (whatsapp_msg_id) que disparou BRENO.';

COMMENT ON COLUMN public.breno_interactions.outbound_message_id IS
  'ID Evolution API da mensagem de resposta enviada. Preenchido apenas quando action_taken = sent.';

COMMENT ON COLUMN public.breno_interactions.mode IS
  'Modo de operação do BRENO no momento da decisão: humano (BRENO silencioso), hibrido (sugere), ia (envia direto).';

COMMENT ON COLUMN public.breno_interactions.breno_response IS
  'Texto gerado pelo BRENO, independente de ter sido enviado, sugerido ou ignorado.';

COMMENT ON COLUMN public.breno_interactions.action_taken IS
  'sent = enviado via Evolution; suggested = exibido ao Eduardo para aprovação; skipped = descartado.';

COMMENT ON COLUMN public.breno_interactions.agent_run_id IS
  'Referência ao run Trigger.dev que gerou esta resposta. Permite correlacionar custo e duração.';

COMMENT ON COLUMN public.breno_interactions.requires_review IS
  'true quando BRENO sinalizou que a resposta precisa de revisão humana antes de nova interação.';

COMMENT ON COLUMN public.breno_interactions.reviewed_at IS
  'Timestamp em que um humano (Eduardo ou admin) revisou e liberou esta interação.';

COMMENT ON COLUMN public.breno_interactions.reviewed_by IS
  'UUID do usuário que fez a revisão.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Índices
-- ─────────────────────────────────────────────────────────────────────────────

-- Busca por conversa (timeline de interações BRENO em uma conversa específica)
CREATE INDEX IF NOT EXISTS idx_breno_interactions_conversation_id
  ON public.breno_interactions (conversation_id);

-- Busca por tenant + data (relatório de atividade do BRENO por período)
CREATE INDEX IF NOT EXISTS idx_breno_interactions_tenant_id
  ON public.breno_interactions (tenant_id, created_at DESC);

-- Dashboard de pendências: só registros que precisam de revisão (cardinalidade baixa)
CREATE INDEX IF NOT EXISTS idx_breno_interactions_requires_review
  ON public.breno_interactions (tenant_id, created_at DESC)
  WHERE requires_review = true;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Row Level Security
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.breno_interactions ENABLE ROW LEVEL SECURITY;

-- Membros do tenant enxergam apenas as interações do próprio tenant
CREATE POLICY breno_interactions_tenant
  ON public.breno_interactions
  FOR ALL
  USING (
    tenant_id = (
      SELECT tenant_id
      FROM public.tenant_members
      WHERE user_id = auth.uid()
      LIMIT 1
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Realtime — notificação em tempo real para o painel de revisão do Eduardo
-- ─────────────────────────────────────────────────────────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE public.breno_interactions;

COMMIT;
