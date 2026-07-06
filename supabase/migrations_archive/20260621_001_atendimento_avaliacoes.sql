-- Migration: 20260621_001_atendimento_avaliacoes.sql
-- Data: 2026-06-21
-- Autor: Wandson (via Claude Code)
-- Motivo: Criar tabela de avaliações CSAT pós-atendimento (pesquisa de satisfação
--         disparada automaticamente ao fechar conversa, via link público tokenizado).
--         Permite ao supervisor acompanhar NPS/CSAT por atendente, tratar reclamações
--         e ter histórico de tratativas — tudo vinculado à conversa original.
-- Risco: Baixo — tabela nova, trigger novo, zero alteração em tabelas existentes.
-- Reversão:
--   DROP TRIGGER IF EXISTS trg_conv_gen_avaliacao_token ON public.conversations;
--   DROP FUNCTION IF EXISTS public.trg_fn_conv_gen_avaliacao_token();
--   DROP TRIGGER IF EXISTS trg_atend_aval_updated_at ON public.atendimento_avaliacoes;
--   DROP FUNCTION IF EXISTS public.trg_fn_atend_aval_updated_at();
--   DROP TABLE IF EXISTS public.atendimento_avaliacoes;

BEGIN;

-- ============================================================================
-- 1. Tabela principal: atendimento_avaliacoes
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.atendimento_avaliacoes (
  -- Chave primária
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Multi-tenant obrigatório
  tenant_id             uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,

  -- Vínculo com a conversa (1:1 — uma avaliação por conversa)
  conversation_id       uuid        NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,

  -- Snapshots do atendente no momento do fechamento
  -- (sem FK viva: o atendente pode sair da equipe sem quebrar o histórico)
  assigned_to           uuid,
  agent_id              text,
  atendente_nome        text,

  -- Token público para a página de avaliação sem login
  public_token          uuid        NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  public_token_expires_at timestamptz NOT NULL DEFAULT (now() + interval '60 days'),

  -- Resposta da avaliação
  nota                  smallint    CHECK (nota BETWEEN 1 AND 5),  -- NULL enquanto pendente
  comentario            text,
  nome_cliente          text,

  -- Ciclo de vida da avaliação
  status                text        NOT NULL DEFAULT 'pendente'
                                    CHECK (status IN ('pendente', 'respondida', 'expirada')),
  responded_at          timestamptz,

  -- Tratativa interna (gestão de reclamações)
  tratativa_status      text        NOT NULL DEFAULT 'na'
                                    CHECK (tratativa_status IN ('na', 'pendente', 'em_andamento', 'resolvido')),
  tratativa_obs         text,
  tratativa_by          uuid,       -- uuid do usuário que tratou (sem FK viva por mesma razão)
  tratativa_at          timestamptz,

  -- Auditoria
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),

  -- Uma conversa só pode ter uma avaliação
  CONSTRAINT atend_aval_conversation_unique UNIQUE (conversation_id)
);

COMMENT ON TABLE public.atendimento_avaliacoes IS
  'Avaliações CSAT pós-atendimento. Uma linha por conversa fechada. '
  'O token público (public_token) é usado na página de avaliação sem autenticação. '
  'Página pública consome via Bridge com service-role (sem policy anon).';

COMMENT ON COLUMN public.atendimento_avaliacoes.assigned_to IS
  'UUID do atendente no momento do fechamento. Snapshot — sem FK viva para sobreviver saída do usuário.';
COMMENT ON COLUMN public.atendimento_avaliacoes.agent_id IS
  'agent_id da conversa no momento do fechamento (ex: "breno"). Snapshot.';
COMMENT ON COLUMN public.atendimento_avaliacoes.atendente_nome IS
  'full_name do atendente capturado em profiles.full_name no momento do fechamento. Snapshot.';
COMMENT ON COLUMN public.atendimento_avaliacoes.public_token IS
  'UUID único enviado no link da pesquisa. Nunca reutilizar. Expira em public_token_expires_at.';
COMMENT ON COLUMN public.atendimento_avaliacoes.nota IS
  'Nota de 1 a 5. NULL enquanto o cliente ainda não respondeu (status=pendente).';
COMMENT ON COLUMN public.atendimento_avaliacoes.tratativa_status IS
  'na=não aplicável (nota >= 4), pendente=reclamação aberta, em_andamento=supervisor atuando, resolvido=encerrado.';
COMMENT ON COLUMN public.atendimento_avaliacoes.tratativa_by IS
  'UUID do usuário que registrou a tratativa. Snapshot — sem FK viva.';

-- ============================================================================
-- 2. Índices
-- ============================================================================

-- Lookup pelo token público (página de avaliação)
CREATE UNIQUE INDEX IF NOT EXISTS idx_atend_aval_public_token
  ON public.atendimento_avaliacoes (public_token);

-- Listagem por tenant + status (dashboard)
CREATE INDEX IF NOT EXISTS idx_atend_aval_tenant_status
  ON public.atendimento_avaliacoes (tenant_id, status);

-- Relatório por atendente
CREATE INDEX IF NOT EXISTS idx_atend_aval_tenant_assigned_to
  ON public.atendimento_avaliacoes (tenant_id, assigned_to);

-- Lookup pela conversa (JOIN de conversations)
CREATE INDEX IF NOT EXISTS idx_atend_aval_conversation_id
  ON public.atendimento_avaliacoes (conversation_id);

-- Fila de tratativas abertas
CREATE INDEX IF NOT EXISTS idx_atend_aval_tenant_tratativa_status
  ON public.atendimento_avaliacoes (tenant_id, tratativa_status);

-- ============================================================================
-- 3. RLS — Row Level Security
-- ============================================================================
-- REGRA: usuários autenticados acessam apenas registros do próprio tenant.
-- Página pública usa Bridge com service-role — NENHUMA policy anon criada aqui.
-- Padrão espelhado exatamente da tabela public.avaliacoes (migration 20260614_001).

ALTER TABLE public.atendimento_avaliacoes ENABLE ROW LEVEL SECURITY;

-- SELECT: membros do tenant podem ler todas as avaliações do tenant
CREATE POLICY atend_aval_select_tenant ON public.atendimento_avaliacoes
  FOR SELECT USING (
    tenant_id IN (
      SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid()
    )
  );

-- INSERT: membros do tenant podem inserir (usado pelo trigger via service-role e pelo sistema)
CREATE POLICY atend_aval_insert_tenant ON public.atendimento_avaliacoes
  FOR INSERT WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid()
    )
  );

-- UPDATE: membros do tenant podem atualizar (tratativas, etc.)
-- Sem WITH CHECK — padrão idêntico ao de public.avaliacoes
CREATE POLICY atend_aval_update_tenant ON public.atendimento_avaliacoes
  FOR UPDATE USING (
    tenant_id IN (
      SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid()
    )
  );

-- ============================================================================
-- 4. Trigger: updated_at automático
-- ============================================================================

CREATE OR REPLACE FUNCTION public.trg_fn_atend_aval_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.trg_fn_atend_aval_updated_at() IS
  'Atualiza updated_at automaticamente em cada UPDATE na tabela atendimento_avaliacoes.';

CREATE TRIGGER trg_atend_aval_updated_at
  BEFORE UPDATE ON public.atendimento_avaliacoes
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_fn_atend_aval_updated_at();

-- ============================================================================
-- 5. Trigger: gerar avaliação ao fechar conversa
-- ============================================================================
-- Dispara AFTER UPDATE em conversations quando status_v2 transiciona para 'closed'.
-- Captura snapshot do atendente (profiles.full_name) e faz INSERT com ON CONFLICT
-- DO NOTHING para ser idempotente (reabrir+fechar de novo não duplica).

CREATE OR REPLACE FUNCTION public.trg_fn_conv_gen_avaliacao_token()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER  -- necessário para bypassar RLS no INSERT (trigger roda como dono da função)
AS $$
DECLARE
  v_atendente_nome text;
BEGIN
  -- 1. Buscar full_name do atendente (pode ser null se assigned_to for null)
  IF NEW.assigned_to IS NOT NULL THEN
    SELECT full_name
      INTO v_atendente_nome
      FROM public.profiles
     WHERE id = NEW.assigned_to
     LIMIT 1;
  END IF;

  -- 2. Inserir avaliação pendente (ON CONFLICT DO NOTHING = idempotente)
  INSERT INTO public.atendimento_avaliacoes (
    tenant_id,
    conversation_id,
    assigned_to,
    agent_id,
    atendente_nome
  ) VALUES (
    NEW.tenant_id,
    NEW.id,
    NEW.assigned_to,
    NEW.agent_id,
    v_atendente_nome
  )
  ON CONFLICT (conversation_id) DO NOTHING;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.trg_fn_conv_gen_avaliacao_token() IS
  'Gera automaticamente uma linha em atendimento_avaliacoes (status=pendente) quando uma '
  'conversa é fechada (status_v2 = ''closed''). Idempotente: reabrir e fechar de novo '
  'não cria duplicata. SECURITY DEFINER para bypassar RLS no INSERT.';

CREATE TRIGGER trg_conv_gen_avaliacao_token
  AFTER UPDATE OF status_v2 ON public.conversations
  FOR EACH ROW
  WHEN (
    NEW.status_v2 = 'closed'::conversation_status_v2
    AND OLD.status_v2 IS DISTINCT FROM 'closed'::conversation_status_v2
  )
  EXECUTE FUNCTION public.trg_fn_conv_gen_avaliacao_token();

COMMIT;
