-- Migration: 20260525_004_onboarding.sql
-- Data: 2026-05-25
-- Autor: G04 — Onboarding
-- Motivo: Tabelas onboarding_templates e onboarding_checklists para playbook
--         D1/D7/D30/D60/D90 ativado automaticamente na assinatura do contrato.
-- Risco: Baixo — tabelas novas, sem impacto em queries existentes.
-- Reversão: DROP TABLE IF EXISTS public.onboarding_checklists, public.onboarding_templates;

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 0. Stub de contratos (IF NOT EXISTS)
--    G03 cria a tabela completa; este stub garante que a FK funcione caso G03
--    ainda não tenha sido aplicado neste ambiente.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.contratos (
  id            uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid          NOT NULL REFERENCES public.tenants(id),
  customer_id   uuid          REFERENCES public.customers(id),
  pacote        text          NOT NULL DEFAULT 'light',
  valor_mensal  numeric(10,2) NOT NULL DEFAULT 0,
  status        text          NOT NULL DEFAULT 'rascunho',
  created_at    timestamptz   NOT NULL DEFAULT now(),
  updated_at    timestamptz   NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. onboarding_templates — playbook global (tenant_id NULL) ou customizado
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.onboarding_templates (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid        REFERENCES public.tenants(id),
  marco           text        NOT NULL CHECK (marco IN ('D1','D7','D30','D60','D90')),
  titulo          text        NOT NULL,
  descricao       text        NOT NULL,
  acao_automatica text,
  active          boolean     NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. onboarding_checklists — instância por cliente/contrato
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.onboarding_checklists (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid        NOT NULL REFERENCES public.tenants(id),
  customer_id   uuid        REFERENCES public.customers(id),
  contrato_id   uuid        REFERENCES public.contratos(id),
  marco         text        NOT NULL CHECK (marco IN ('D1','D7','D30','D60','D90')),
  status        text        NOT NULL DEFAULT 'pendente'
                            CHECK (status IN ('pendente','em_andamento','concluido')),
  concluido_em  timestamptz,
  notas         text,
  agendado_para date,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. RLS — padrão tenant_members (profiles.tenant_id não existe neste projeto)
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.onboarding_checklists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding_templates  ENABLE ROW LEVEL SECURITY;

CREATE POLICY onboarding_checklists_tenant_isolation
  ON public.onboarding_checklists
  FOR ALL
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.tenant_members
      WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM public.tenant_members
      WHERE user_id = auth.uid()
    )
  );

-- Templates globais (tenant_id NULL) visíveis a todos; templates de tenant só ao próprio tenant
CREATE POLICY onboarding_templates_see_own_or_global
  ON public.onboarding_templates
  FOR SELECT
  TO authenticated
  USING (
    tenant_id IS NULL
    OR tenant_id IN (
      SELECT tenant_id FROM public.tenant_members
      WHERE user_id = auth.uid()
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Índices
-- ─────────────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_onboarding_checklists_tenant_customer
  ON public.onboarding_checklists (tenant_id, customer_id);

CREATE INDEX IF NOT EXISTS idx_onboarding_checklists_agendado_status
  ON public.onboarding_checklists (agendado_para, status)
  WHERE status = 'pendente';

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Seed — templates globais (tenant_id IS NULL)
--    Anti-padrão #4: D90 deve mencionar oportunidade de upsell
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO public.onboarding_templates (tenant_id, marco, titulo, descricao, acao_automatica)
VALUES
  (NULL, 'D1',
   'Configuração inicial',
   'Verificar acesso ao painel + grupos WhatsApp. Garantir que consultor e cliente estão no grupo de acompanhamento.',
   'whatsapp_grupo'),
  (NULL, 'D7',
   'Primeira semana',
   'Revisar primeiros resultados iFood. Verificar métricas de visualização e taxa de conversão da loja.',
   'relatorio_d7'),
  (NULL, 'D30',
   'Primeiro mês',
   'Análise de métricas completa + ajustes de cardápio/pricing. Comparar período com mês anterior.',
   'relatorio_mensal'),
  (NULL, 'D60',
   'Dois meses',
   'Review de estratégia. Identificar pontos de melhoria e novas oportunidades de crescimento.',
   NULL),
  (NULL, 'D90',
   'Trimestre — renovação e upsell',
   'Análise trimestral completa. Avaliar ROI da consultoria. Apresentar oportunidade de upsell para pacote superior ou renovação de contrato com novas metas.',
   'proposta_renovacao')
ON CONFLICT DO NOTHING;

COMMIT;
