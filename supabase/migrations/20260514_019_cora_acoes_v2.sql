-- Migration: 20260514_019_cora_acoes_v2
-- Criada em: 2026-05-14
-- Autor: Wandson (via Claude Code)
-- Descricao: Adiciona colunas V2 em cora_acoes para integração com cobrancas (Asaas) e agent_runs.
--            Registros V1 existentes não são afetados — todas as colunas novas são nullable.
--            cobranca_v2_id aponta para public.cobrancas (tabela V2, criada em 20260514_017).
--            agent_run_id vincula cada ação ao run do Trigger.dev que a gerou (auditoria).
-- Motivo: CORA V2 precisa rastrear:
--           1. Qual run do Trigger.dev disparou a ação (agent_run_id).
--           2. Para qual cobrança Asaas a ação foi executada (cobranca_v2_id → public.cobrancas).
--           3. O texto exato da mensagem enviada ao cliente (mensagem_enviada).
--           4. O ID retornado pela Evolution API para reconciliação de status (whatsapp_message_id).
--           5. Campo 'acao' como equivalente semântico de 'tipo' para registros V2,
--              alinhado ao vocabulário do novo agente.
-- Risco: Baixo — ALTER TABLE ADD COLUMN IF NOT EXISTS em colunas nullable.
--        Zero impacto em registros existentes. Zero impacto em queries existentes.
--        FKs com ON DELETE SET NULL: se o run ou a cobrança for removida,
--        o registro de ação é preservado com NULL nas colunas V2.
-- Dependencias:
--   - public.agent_runs   (20260512_005_create_agent_runs.sql)
--   - public.cobrancas    (20260514_017_cobrancas.sql)
--   - public.cora_acoes   (20260514_016_cora_cobrancas.sql)  <- tabela alvo
-- Reversao:
--   ALTER TABLE public.cora_acoes
--     DROP COLUMN IF EXISTS agent_run_id,
--     DROP COLUMN IF EXISTS cobranca_v2_id,
--     DROP COLUMN IF EXISTS acao,
--     DROP COLUMN IF EXISTS mensagem_enviada,
--     DROP COLUMN IF EXISTS whatsapp_message_id;
--   DROP INDEX IF EXISTS idx_cora_acoes_cobranca_v2_id;

-- ── 1. Colunas V2 ─────────────────────────────────────────────────────────────

-- Vínculo ao run do Trigger.dev que gerou esta ação.
-- NULL = ação criada por processo legado (V1) ou sem rastreio de run.
ALTER TABLE public.cora_acoes
  ADD COLUMN IF NOT EXISTS agent_run_id uuid NULL
    REFERENCES public.agent_runs(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.cora_acoes.agent_run_id IS
  'ID do run no Trigger.dev (agent_runs.id) que gerou esta ação. NULL para registros V1 legados.';

-- Vínculo à cobrança V2 (tabela public.cobrancas, integrada com Asaas).
-- Registros V1 usam cobranca_id → cora_cobrancas. Registros V2 usam este campo.
-- ON DELETE SET NULL: se a cobrança V2 for cancelada/removida, o histórico de ação é preservado.
ALTER TABLE public.cora_acoes
  ADD COLUMN IF NOT EXISTS cobranca_v2_id uuid NULL
    REFERENCES public.cobrancas(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.cora_acoes.cobranca_v2_id IS
  'FK para public.cobrancas (V2, Asaas). Registros V1 usam cobranca_id → cora_cobrancas. Mutuamente exclusivos na prática.';

-- Equivalente semântico de ''tipo'' para registros gerados pelo agente CORA V2.
-- ''tipo'' permanece NOT NULL nos registros V1. Registros V2 preenchem ambos por compatibilidade,
-- mas ''acao'' reflete o vocabulário do novo agente.
ALTER TABLE public.cora_acoes
  ADD COLUMN IF NOT EXISTS acao text NULL;

COMMENT ON COLUMN public.cora_acoes.acao IS
  'Ação executada no vocabulário CORA V2. Exemplos: mensagem_enviada, analise_ia, escalonamento. Equivalente semântico de tipo para novos registros.';

-- Texto completo da mensagem enviada ao cliente quando acao = ''mensagem_enviada''.
-- Separado de ''conteudo'' (campo V1) para evitar ambiguidade de semântica.
ALTER TABLE public.cora_acoes
  ADD COLUMN IF NOT EXISTS mensagem_enviada text NULL;

COMMENT ON COLUMN public.cora_acoes.mensagem_enviada IS
  'Texto exato enviado ao cliente via WhatsApp quando acao = ''mensagem_enviada''. NULL para outras ações.';

-- ID retornado pela Evolution API ao disparar a mensagem.
-- Permite reconciliar status de entrega (lido, recebido) com o registro de ação.
ALTER TABLE public.cora_acoes
  ADD COLUMN IF NOT EXISTS whatsapp_message_id text NULL;

COMMENT ON COLUMN public.cora_acoes.whatsapp_message_id IS
  'ID de mensagem retornado pela Evolution API (ex: BAE5...). Permite rastrear status de entrega. NULL se a ação não gerou envio WhatsApp.';

-- ── 2. Índice parcial para lookups por cobrança V2 ───────────────────────────

-- Apenas registros com cobranca_v2_id preenchido são indexados.
-- Mantém o índice pequeno e focado: queries de "todas as ações desta cobrança V2".
CREATE INDEX IF NOT EXISTS idx_cora_acoes_cobranca_v2_id
  ON public.cora_acoes (cobranca_v2_id)
  WHERE cobranca_v2_id IS NOT NULL;

-- ── 3. RLS — verificação e criação condicional ────────────────────────────────

-- A policy "cora_acoes_tenant" foi criada na migration 20260514_016_cora_cobrancas.sql.
-- O bloco abaixo verifica se ela ainda existe antes de recriar para garantir idempotência.
-- Caso a policy tenha sido removida manualmente, este bloco a restaura.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'cora_acoes'
      AND policyname = 'cora_acoes_tenant'
  ) THEN
    -- RLS pode ter sido desabilitada manualmente; reabilita por segurança.
    ALTER TABLE public.cora_acoes ENABLE ROW LEVEL SECURITY;

    CREATE POLICY "cora_acoes_tenant"
      ON public.cora_acoes
      FOR ALL
      USING (
        tenant_id = (
          SELECT tenant_id
          FROM public.tenant_members
          WHERE user_id = auth.uid()
          LIMIT 1
        )
      );
  END IF;
END
$$;
