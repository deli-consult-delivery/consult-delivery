-- Migration: 20260621_002_nps_avaliacoes.sql
-- Data: 2026-06-21
-- Motivo: Criar tabela NPS de Marca — pesquisa de lealdade periódica (0-10) por contato,
--         com cooldown de 30 dias por whatsapp_chat_id, disparo por fechamento de conversa.
--         Feature separada do CSAT (atendimento_avaliacoes). Tabela, trigger e painel próprios.
-- Risco: Baixo — tabela nova, trigger novo, zero alteração em tabelas existentes.
-- Reversão:
--   DROP TRIGGER IF EXISTS trg_conv_gen_nps_token ON public.conversations;
--   DROP FUNCTION IF EXISTS public.trg_fn_conv_gen_nps_token();
--   DROP TRIGGER IF EXISTS trg_nps_aval_updated_at ON public.nps_avaliacoes;
--   DROP FUNCTION IF EXISTS public.trg_fn_nps_aval_updated_at();
--   DROP TABLE IF EXISTS public.nps_avaliacoes;

BEGIN;

-- ============================================================================
-- 1. Tabela principal: nps_avaliacoes
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.nps_avaliacoes (
  -- Chave primária
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Multi-tenant obrigatório
  tenant_id             uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,

  -- Identificador do contato — whatsapp_chat_id da conversa (ex: 5511999999999@s.whatsapp.net)
  -- Sem FK viva: contatos podem ser deletados sem quebrar histórico.
  -- É a unidade de controle do cooldown de 30 dias.
  contact_identifier    text        NOT NULL,

  -- Snapshot do nome do contato no momento da geração
  contact_nome          text,

  -- Conversa que disparou a geração (rastreabilidade; não é chave de unicidade)
  origin_conversation_id uuid,

  -- Token público para a página sem login
  public_token          uuid        NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  public_token_expires_at timestamptz NOT NULL DEFAULT (now() + interval '60 days'),

  -- Resposta: escala NPS 0-10 (NULL enquanto pendente)
  nota                  smallint    CHECK (nota BETWEEN 0 AND 10),
  comentario            text,

  -- Ciclo de vida
  status                text        NOT NULL DEFAULT 'pendente'
                                    CHECK (status IN ('pendente', 'respondida', 'expirada')),
  responded_at          timestamptz,

  -- Tratativa interna de detratores (nota <= 6)
  tratativa_status      text        NOT NULL DEFAULT 'na'
                                    CHECK (tratativa_status IN ('na', 'pendente', 'em_andamento', 'resolvido')),
  tratativa_obs         text,
  tratativa_by          uuid,
  tratativa_at          timestamptz,

  -- Auditoria
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()

  -- SEM UNIQUE(contact_identifier): cadência é por janela de 30 dias (controlada no trigger),
  -- não por constraint. O mesmo contato pode ter múltiplos NPS históricos.
);

COMMENT ON TABLE public.nps_avaliacoes IS
  'Pesquisas NPS de marca. Uma linha por ciclo de 30 dias por contato. '
  'Disparo: fechamento de conversa + cooldown de 30 dias por contact_identifier. '
  'Página pública consome via Bridge com service-role (sem policy anon).';

COMMENT ON COLUMN public.nps_avaliacoes.contact_identifier IS
  'whatsapp_chat_id da conversa (ex: 5511999999999@s.whatsapp.net). '
  'Unidade de controle do cooldown de 30 dias.';

COMMENT ON COLUMN public.nps_avaliacoes.nota IS
  'Escala NPS 0-10. NULL enquanto pendente. '
  'Promotor=9-10, Neutro/Passivo=7-8, Detrator=0-6.';

COMMENT ON COLUMN public.nps_avaliacoes.tratativa_status IS
  'na=não aplicável (nota >= 7), pendente=detrator aberto, em_andamento=supervisor atuando, resolvido=encerrado.';

-- ============================================================================
-- 2. Índices
-- ============================================================================

-- Lookup pelo token público (página sem login)
CREATE UNIQUE INDEX IF NOT EXISTS idx_nps_aval_public_token
  ON public.nps_avaliacoes (public_token);

-- Fila de tratativas por tenant
CREATE INDEX IF NOT EXISTS idx_nps_aval_tenant_status
  ON public.nps_avaliacoes (tenant_id, status);

-- Cooldown lookup: (tenant_id, contact_identifier, created_at DESC) — crítico pro trigger
CREATE INDEX IF NOT EXISTS idx_nps_aval_cooldown
  ON public.nps_avaliacoes (tenant_id, contact_identifier, created_at DESC);

-- Tratativas abertas
CREATE INDEX IF NOT EXISTS idx_nps_aval_tratativa
  ON public.nps_avaliacoes (tenant_id, tratativa_status);

-- Série temporal (tendência mensal do NPS)
CREATE INDEX IF NOT EXISTS idx_nps_aval_tenant_created_at
  ON public.nps_avaliacoes (tenant_id, created_at);

-- ============================================================================
-- 3. RLS — Row Level Security
-- ============================================================================
-- Usuários autenticados acessam apenas registros do próprio tenant.
-- Página pública usa Bridge com service-role — NENHUMA policy anon criada aqui.

ALTER TABLE public.nps_avaliacoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY nps_aval_select_tenant ON public.nps_avaliacoes
  FOR SELECT USING (
    tenant_id IN (
      SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY nps_aval_insert_tenant ON public.nps_avaliacoes
  FOR INSERT WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY nps_aval_update_tenant ON public.nps_avaliacoes
  FOR UPDATE USING (
    tenant_id IN (
      SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid()
    )
  );

-- ============================================================================
-- 4. Trigger: updated_at automático
-- ============================================================================

CREATE OR REPLACE FUNCTION public.trg_fn_nps_aval_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_nps_aval_updated_at
  BEFORE UPDATE ON public.nps_avaliacoes
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_fn_nps_aval_updated_at();

-- ============================================================================
-- 5. Trigger: gerar NPS ao fechar conversa (com cooldown de 30 dias)
-- ============================================================================
-- Dispara AFTER UPDATE em conversations quando status_v2 transiciona para 'closed'.
-- Só insere se NÃO houver NPS do mesmo (tenant_id, contact_identifier) nos últimos 30 dias.
-- whatsapp_chat_id é usado como contact_identifier (identificador estável do contato).
-- Se whatsapp_chat_id for NULL (grupo ou conversa sem JID), não gera NPS.

CREATE OR REPLACE FUNCTION public.trg_fn_conv_gen_nps_token()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER  -- bypassar RLS no INSERT (trigger roda como dono da função)
AS $$
DECLARE
  v_contact_nome text;
BEGIN
  -- Só gera NPS para conversas individuais com whatsapp_chat_id
  IF NEW.whatsapp_chat_id IS NULL OR NEW.whatsapp_chat_id = '' THEN
    RETURN NEW;
  END IF;

  -- Nome do contato: preferir push_name, fallback para contact_name
  v_contact_nome := COALESCE(NULLIF(TRIM(NEW.push_name), ''), NULLIF(TRIM(NEW.contact_name), ''));

  -- Cooldown de 30 dias: só insere se não houver NPS recente deste contato neste tenant
  IF NOT EXISTS (
    SELECT 1 FROM public.nps_avaliacoes
     WHERE tenant_id          = NEW.tenant_id
       AND contact_identifier = NEW.whatsapp_chat_id
       AND created_at         > now() - interval '30 days'
  ) THEN
    INSERT INTO public.nps_avaliacoes (
      tenant_id,
      contact_identifier,
      contact_nome,
      origin_conversation_id
    ) VALUES (
      NEW.tenant_id,
      NEW.whatsapp_chat_id,
      v_contact_nome,
      NEW.id
    );
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.trg_fn_conv_gen_nps_token() IS
  'Gera NPS de marca ao fechar conversa, respeitando cooldown de 30 dias por contato. '
  'Usa whatsapp_chat_id como identificador. Ignora grupos e conversas sem JID. '
  'SECURITY DEFINER para bypassar RLS no INSERT.';

CREATE TRIGGER trg_conv_gen_nps_token
  AFTER UPDATE OF status_v2 ON public.conversations
  FOR EACH ROW
  WHEN (
    NEW.status_v2 = 'closed'::conversation_status_v2
    AND OLD.status_v2 IS DISTINCT FROM 'closed'::conversation_status_v2
  )
  EXECUTE FUNCTION public.trg_fn_conv_gen_nps_token();

COMMIT;
