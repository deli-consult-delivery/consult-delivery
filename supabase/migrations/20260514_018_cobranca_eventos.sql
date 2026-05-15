-- Migration: 20260514_018_cobranca_eventos
-- Criada em: 2026-05-14
-- Autor: Wandson (via Claude Code)
-- Descricao: Audit trail imutável de eventos de cobrança (webhook Asaas + ações CORA/manual).
--            Registra toda mudança de status de cobrança com origem (asaas_webhook, cora, manual).
-- Motivo: Rastreabilidade completa do ciclo de vida de cada cobrança para fins de auditoria,
--         debugging de integrações Asaas e histórico de ações da CORA. Sem esta tabela não há
--         como reconstruir o que aconteceu quando um pagamento apresenta inconsistência.
-- Risco: Baixo — tabela nova, zero impacto em dados existentes. Depende de cobrancas (017).
-- Dependencias: public.tenants (existe desde 001), public.cobrancas (criada em 017).
-- Reversao: DROP TABLE IF EXISTS public.cobranca_eventos CASCADE;

BEGIN;

-- ── 1. Tabela principal ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.cobranca_eventos (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  cobranca_id   uuid        NOT NULL
                            REFERENCES public.cobrancas(id) ON DELETE CASCADE,
  tenant_id     uuid        NOT NULL
                            REFERENCES public.tenants(id) ON DELETE CASCADE,
  event_type    text        NOT NULL
                            CHECK (event_type IN ('created','status_changed','payment_received','cora_acted','manual')),
  old_status    text        NULL,
  new_status    text        NULL,
  triggered_by  text        NOT NULL DEFAULT 'manual'
                            CHECK (triggered_by IN ('asaas_webhook','cora','manual')),
  metadata      jsonb       NOT NULL DEFAULT '{}',
  created_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.cobranca_eventos IS
  'Audit trail imutável de eventos de cobrança. Alimentado pelo webhook Asaas e por ações CORA/manual. Nunca atualizar nem deletar linhas desta tabela.';

COMMENT ON COLUMN public.cobranca_eventos.cobranca_id IS
  'FK para cobrancas(id). Cascade delete: se a cobrança for removida (raro), o histórico some junto.';
COMMENT ON COLUMN public.cobranca_eventos.tenant_id IS
  'Redundante com cobrancas.tenant_id mas necessário para RLS sem JOIN obrigatório e para índice composto por tenant.';
COMMENT ON COLUMN public.cobranca_eventos.event_type IS
  'Tipo do evento: created=cobrança criada, status_changed=mudança de status, payment_received=pagamento confirmado, cora_acted=CORA tomou ação, manual=operação manual pelo time.';
COMMENT ON COLUMN public.cobranca_eventos.old_status IS
  'Status anterior da cobrança antes do evento. NULL quando event_type = created.';
COMMENT ON COLUMN public.cobranca_eventos.new_status IS
  'Status novo da cobrança após o evento. NULL quando não há mudança de status (ex: cora_acted sem troca de status).';
COMMENT ON COLUMN public.cobranca_eventos.triggered_by IS
  'Origem do evento: asaas_webhook=callback Asaas, cora=agente CORA, manual=ação humana na plataforma.';
COMMENT ON COLUMN public.cobranca_eventos.metadata IS
  'Dados adicionais sem schema fixo. Ex: payload bruto do webhook Asaas, ID do run da CORA, usuário que executou ação manual.';
COMMENT ON COLUMN public.cobranca_eventos.created_at IS
  'Timestamp imutável do evento. Sem updated_at — esta tabela não admite UPDATE.';

-- ── 2. Índices ────────────────────────────────────────────────────────────────

-- Listagem de eventos de uma cobrança específica (query mais comum: abrir histórico de uma cobrança)
CREATE INDEX IF NOT EXISTS idx_cobranca_eventos_cobranca_id
  ON public.cobranca_eventos (cobranca_id);

-- Listagem por tenant com ordenação descendente (dashboard de auditoria, queries CORA)
CREATE INDEX IF NOT EXISTS idx_cobranca_eventos_tenant_id
  ON public.cobranca_eventos (tenant_id, created_at DESC);

-- ── 3. RLS ───────────────────────────────────────────────────────────────────

ALTER TABLE public.cobranca_eventos ENABLE ROW LEVEL SECURITY;

-- Política SELECT: usuário vê apenas eventos de cobranças do seu tenant.
-- O JOIN com cobrancas garante isolamento mesmo que tenant_id na linha seja inconsistente.
CREATE POLICY cobranca_eventos_select
  ON public.cobranca_eventos
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.cobrancas c
      JOIN public.tenant_members tm ON tm.tenant_id = c.tenant_id
      WHERE c.id = cobranca_eventos.cobranca_id
        AND tm.user_id = auth.uid()
    )
  );

-- Política INSERT: usuário só insere eventos em cobranças do seu tenant.
-- Garante que webhooks e ações só registram eventos em cobranças que pertencem ao tenant correto.
CREATE POLICY cobranca_eventos_insert
  ON public.cobranca_eventos
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.cobrancas c
      JOIN public.tenant_members tm ON tm.tenant_id = c.tenant_id
      WHERE c.id = cobranca_eventos.cobranca_id
        AND tm.user_id = auth.uid()
    )
  );

-- Sem políticas de UPDATE e DELETE — audit trail é imutável por design.

-- ── NOTA: Sem Realtime ────────────────────────────────────────────────────────
-- Esta tabela NÃO é adicionada à publication supabase_realtime.
-- O frontend não precisa de updates em tempo real desta tabela.
-- Para ver eventos de uma cobrança, o frontend faz fetch manual ao abrir o histórico.

-- ── NOTA: Sem trigger updated_at ─────────────────────────────────────────────
-- Tabela imutável — não possui coluna updated_at nem trigger associado.
-- Linhas inseridas nunca devem ser modificadas.

COMMIT;

-- ── Reversão ─────────────────────────────────────────────────────────────────
-- DROP TABLE IF EXISTS public.cobranca_eventos CASCADE;
-- (O DROP CASCADE remove índices e políticas RLS associadas automaticamente.)
