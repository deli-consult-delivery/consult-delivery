-- supabase/migrations/20260525_006_sofia_leads.sql
-- S2-G02.1 — SOFIA: tabela leads + seed prompt
-- Critério de aceite: SELECT COUNT(*) FROM leads = 0; RLS bloqueia cross-tenant

BEGIN;

-- ── 1. Tabela leads ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.leads (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,

  -- Dados básicos
  nome         text        NOT NULL,
  fonte        text        NOT NULL CHECK (fonte IN ('google_maps','ifood','instagram','manual','outro')),
  cidade       text,
  bairro       text,
  telefone     text,
  instagram    text,
  ifood_url    text,
  gmaps_url    text,

  -- Qualificação
  score        int         NOT NULL CHECK (score BETWEEN 1 AND 10),
  justificativa text       NOT NULL,
  dados_json   jsonb       NOT NULL DEFAULT '{}',

  -- Ciclo de vida
  status       text        NOT NULL DEFAULT 'prospectado'
               CHECK (status IN ('prospectado','contactado','sem_resposta','interessado','nao_fit','crm','perdido')),
  crm_id       uuid,

  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.leads IS
  'Leads qualificados pela SOFIA (SDR IA). Score 1-10 com critérios ICP food service.';

-- ── 2. Trigger updated_at ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_leads_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER leads_updated_at
  BEFORE UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.set_leads_updated_at();

-- ── 3. Índices ───────────────────────────────────────────────────────────────

CREATE INDEX idx_leads_score  ON public.leads(tenant_id, score DESC, created_at DESC);
CREATE INDEX idx_leads_status ON public.leads(tenant_id, status, created_at DESC);

-- ── 4. RLS ───────────────────────────────────────────────────────────────────

ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sofia_leads_tenant" ON public.leads
  FOR ALL
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid()
    )
  );

-- ── 5. Seed: prompt SOFIA em agent_prompts ───────────────────────────────────

INSERT INTO public.agent_prompts (agent_id, prompt, active, tenant_id)
VALUES (
  'sofia',
  '# SOFIA — Prospectora de Leads Food Service

Você é SOFIA, SDR digital especializada em prospecção de lojas food service com alto potencial de crescimento.

## Perfil de cliente ideal (ICP)
- GMV estimado: R$80.000+/mês (indicadores: muitas avaliações, preços mais altos, múltiplos itens)
- Tecnologia: usa iFood Premium ou Pro (indicador: badge, variedade de pagamentos)
- Dono engajado: posts ativos no Instagram nos últimos 30 dias
- Segmento: restaurante, hamburgueria, pizzaria, saudável — qualquer nicho com ticket médio >R$40

## Critérios de score (1–10)
- 8–10: todos os critérios do ICP atendidos + indícios de escala
- 6–7: maioria atendida, 1–2 gaps menores
- 4–5: potencial mas gaps significativos (ex: tecnologia baixa ou sem Instagram ativo)
- 1–3: não fit (lanchonete simples, muito pequena, sem presença digital)

## Formato de saída (JSON obrigatório)
{
  "nome": "nome da loja",
  "fonte": "google_maps|ifood|instagram",
  "cidade": "cidade",
  "bairro": "bairro",
  "telefone": "telefone se encontrado",
  "instagram": "@handle se encontrado",
  "ifood_url": "URL iFood se encontrado",
  "gmaps_url": "URL Google Maps",
  "score": 8,
  "justificativa": "1 parágrafo explicando o score e os critérios atendidos",
  "dados_json": { "avaliacoes": 450, "nota": 4.8, "preco": "$$", "badge_premium": true }
}

Responda SEMPRE com JSON válido, sem markdown extra.',
  true,
  NULL
)
ON CONFLICT DO NOTHING;

COMMIT;
