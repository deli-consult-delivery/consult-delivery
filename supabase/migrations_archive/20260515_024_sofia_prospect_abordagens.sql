-- Migration: 20260515_024_sofia_prospect_abordagens.sql
-- Data: 2026-05-15
-- Autor: Wandson (via Claude Code)
-- Motivo: A SOFIA gera rascunhos de mensagens de abordagem personalizada para cada
--         prospect qualificado. Antes de enviar qualquer mensagem ao prospect externo,
--         um humano (Wandson ou Wélida) DEVE aprovar — sem exceção (regra de DELI/SOFIA
--         seção 16 do CLAUDE.md). Esta tabela registra o ciclo completo: rascunho →
--         aprovação → envio → resposta. Canal pode ser WhatsApp, Instagram DM ou e-mail.
--         Garante rastreabilidade e conformidade com a política de drafts da plataforma.
-- Risco: Baixo — tabela nova. A FK para auth.users é ON DELETE SET NULL,
--         preservando histórico se o usuário for removido.
-- Dependencias:
--   - public.prospects (20260515_022_sofia_prospects.sql)
--   - auth.users (Supabase Auth — sempre presente)
-- Reversao:
--   DROP INDEX IF EXISTS idx_prospect_abordagens_status;
--   DROP INDEX IF EXISTS idx_prospect_abordagens_prospect;
--   DROP TABLE IF EXISTS public.prospect_abordagens;

BEGIN;

-- ── 1. Tabela de abordagens (drafts + histórico de envio) ────────────────────

CREATE TABLE public.prospect_abordagens (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id   uuid        NOT NULL REFERENCES public.prospects(id) ON DELETE CASCADE,

  -- Canal de comunicação com o prospect
  canal         text        NOT NULL CHECK (canal IN ('whatsapp', 'instagram_dm', 'email')),

  -- Texto da mensagem gerada pela SOFIA (rascunho ou mensagem enviada)
  mensagem      text        NOT NULL,

  -- Ciclo de aprovação (nunca enviar sem status 'aprovada')
  status        text        NOT NULL DEFAULT 'rascunho' CHECK (status IN (
                              'rascunho',    -- gerado pela SOFIA, aguardando revisão
                              'aprovada',    -- Wandson/Wélida aprovou, pronto para envio
                              'enviada',     -- mensagem disparada pelo canal
                              'respondida',  -- prospect respondeu
                              'sem_resposta' -- enviada mas sem retorno após período definido
                            )),

  -- Rastreio de quem criou e aprovou
  created_by    uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_by   uuid        REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Timestamps de lifecycle
  sent_at       timestamptz,       -- preenchido quando status muda para 'enviada'
  responded_at  timestamptz,       -- preenchido quando prospect responde

  -- Auditoria
  created_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.prospect_abordagens IS
  'Rascunhos e histórico de mensagens de abordagem geradas pela SOFIA para prospects qualificados. '
  'Toda mensagem passa por aprovação humana antes do envio (política de drafts — seção 16 CLAUDE.md). '
  'Jamais alterar status para enviada sem confirmação do humano aprovador.';

COMMENT ON COLUMN public.prospect_abordagens.prospect_id IS
  'FK para public.prospects. ON DELETE CASCADE: se o prospect for descartado/removido, '
  'todo o histórico de abordagens é apagado junto.';
COMMENT ON COLUMN public.prospect_abordagens.canal IS
  'Canal pelo qual a mensagem será enviada: whatsapp (Evolution API), '
  'instagram_dm (futura integração), email (SMTP/SendGrid).';
COMMENT ON COLUMN public.prospect_abordagens.mensagem IS
  'Texto completo da mensagem. Pode conter variáveis resolvidas (nome, segmento, avaliação iFood). '
  'A SOFIA personaliza com base nos dados de prospect_pesquisas.';
COMMENT ON COLUMN public.prospect_abordagens.status IS
  'Ciclo de vida da abordagem. Regra: nunca enviar com status != aprovada. '
  'A plataforma deve bloquear envio de rascunho por código. '
  'Progressão: rascunho → aprovada → enviada → respondida | sem_resposta.';
COMMENT ON COLUMN public.prospect_abordagens.created_by IS
  'UUID do usuário auth.users que criou o rascunho. Normalmente NULL quando gerado '
  'automaticamente pela SOFIA (agente não tem user_id). Preenchido em criações manuais.';
COMMENT ON COLUMN public.prospect_abordagens.approved_by IS
  'UUID do usuário que aprovou o envio. Obrigatório na prática antes de marcar enviada. '
  'ON DELETE SET NULL: se o aprovador sair da equipe, o histórico é preservado com NULL.';
COMMENT ON COLUMN public.prospect_abordagens.sent_at IS
  'Timestamp de quando a mensagem foi efetivamente enviada pelo canal. '
  'NULL enquanto status != enviada.';
COMMENT ON COLUMN public.prospect_abordagens.responded_at IS
  'Timestamp de quando o prospect respondeu. Preenchido pelo webhook ou manualmente. '
  'NULL enquanto não há resposta.';

-- ── 2. Índices ───────────────────────────────────────────────────────────────

-- Lookup padrão: todas as abordagens de um prospect
CREATE INDEX idx_prospect_abordagens_prospect
  ON public.prospect_abordagens (prospect_id, created_at DESC);

-- Fila de aprovação: filtrar apenas rascunhos e aprovadas (ação necessária)
CREATE INDEX idx_prospect_abordagens_status
  ON public.prospect_abordagens (status)
  WHERE status IN ('rascunho', 'aprovada');

-- ── 3. RLS via prospects.tenant_id ──────────────────────────────────────────
--
-- prospect_abordagens não tem tenant_id direto.
-- O tenant é derivado via prospects.tenant_id usando EXISTS subquery,
-- mesmo padrão adotado em prospect_pesquisas (20260515_023).

ALTER TABLE public.prospect_abordagens ENABLE ROW LEVEL SECURITY;

-- SELECT: membros do tenant com qualquer role de leitura
CREATE POLICY "prospect_abordagens_select"
  ON public.prospect_abordagens
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.prospects p
      JOIN public.tenant_members tm ON tm.tenant_id = p.tenant_id
      WHERE p.id = prospect_abordagens.prospect_id
        AND tm.user_id = auth.uid()
        AND tm.role IN ('admin', 'marketing', 'dev', 'viewer')
    )
  );

-- INSERT / UPDATE / DELETE: admin, marketing e dev
CREATE POLICY "prospect_abordagens_write"
  ON public.prospect_abordagens
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.prospects p
      JOIN public.tenant_members tm ON tm.tenant_id = p.tenant_id
      WHERE p.id = prospect_abordagens.prospect_id
        AND tm.user_id = auth.uid()
        AND tm.role IN ('admin', 'marketing', 'dev')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.prospects p
      JOIN public.tenant_members tm ON tm.tenant_id = p.tenant_id
      WHERE p.id = prospect_abordagens.prospect_id
        AND tm.user_id = auth.uid()
        AND tm.role IN ('admin', 'marketing', 'dev')
    )
  );

COMMIT;
