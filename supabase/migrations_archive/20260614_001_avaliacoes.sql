-- ============================================================================
-- 20260614_001_avaliacoes.sql
-- Aba "Avaliações" — agente IA p/ responder avaliações do iFood (multi-loja).
--
-- Aditivo/reversível (D5 v3). Cria 2 tabelas + RLS (padrão tenant_members) e
-- registra o agente 'avaliacoes' no catálogo (agents) habilitando-o no tenant
-- da Consult Delivery (tenant_agents). Idempotente onde possível.
--
-- Schema vivo verificado via Supabase MCP antes de aplicar:
--   lojas.id / tenants.id / agent_drafts.id / tenant_members.{tenant_id,user_id} = uuid
--   RLS padrão = tenant_id IN (SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid())
--   agents.id é TEXT (o próprio slug); colunas NOT NULL: name, role, letter, color
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (a) avaliacoes_loja_config — config por loja (logística + tom)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.avaliacoes_loja_config (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES public.tenants(id),
  loja_id         uuid NOT NULL REFERENCES public.lojas(id),
  logistica_tipo  text NOT NULL CHECK (logistica_tipo IN ('ifood_logistica','entrega_propria')),
  tom             text,        -- tom final, editado pelo consultor (entra no prompt)
  tom_sugerido_ia text,        -- sugestão da IA (histórico)
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT avaliacoes_loja_config_loja_id_key UNIQUE (loja_id)  -- 1 config por loja
);

ALTER TABLE public.avaliacoes_loja_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY avaliacoes_cfg_select_tenant ON public.avaliacoes_loja_config
  FOR SELECT USING (
    tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid())
  );
CREATE POLICY avaliacoes_cfg_insert_tenant ON public.avaliacoes_loja_config
  FOR INSERT WITH CHECK (
    tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid())
  );
CREATE POLICY avaliacoes_cfg_update_tenant ON public.avaliacoes_loja_config
  FOR UPDATE USING (
    tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid())
  );

-- ----------------------------------------------------------------------------
-- (b) avaliacoes — uma linha por avaliação colada
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.avaliacoes (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES public.tenants(id),
  loja_id             uuid NOT NULL REFERENCES public.lojas(id),
  nota                int  CHECK (nota BETWEEN 1 AND 5),
  comentario          text NOT NULL,
  nome_cliente        text,
  tipo                text NOT NULL CHECK (tipo IN ('loja','entrega')),
  prazo_label         text,        -- rótulo cru: "1 dia", "23h", "3h"
  resposta_sugerida   text,        -- saída da IA
  resposta_final      text,        -- após edição/ajuste do consultor
  insights_consultoria text,       -- orientações operacionais + dicas selo Super
  status              text NOT NULL DEFAULT 'gerada'
                        CHECK (status IN ('gerada','nao_responder','enviada_grupo',
                                          'aprovada_cliente','ajuste_pedido','postada','descartada')),
  draft_id            uuid REFERENCES public.agent_drafts(id),
  ajuste_pedido       text,        -- texto do ajuste pedido pelo cliente
  run_id              text,        -- rastro do run de IA
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_avaliacoes_loja  ON public.avaliacoes (loja_id);
CREATE INDEX IF NOT EXISTS idx_avaliacoes_status ON public.avaliacoes (tenant_id, status);

ALTER TABLE public.avaliacoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY avaliacoes_select_tenant ON public.avaliacoes
  FOR SELECT USING (
    tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid())
  );
CREATE POLICY avaliacoes_insert_tenant ON public.avaliacoes
  FOR INSERT WITH CHECK (
    tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid())
  );
CREATE POLICY avaliacoes_update_tenant ON public.avaliacoes
  FOR UPDATE USING (
    tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid())
  );

-- ----------------------------------------------------------------------------
-- (c) Registrar o agente no catálogo + habilitar no tenant Consult Delivery
--     agents.id é TEXT (o próprio slug). category='specialist'.
-- ----------------------------------------------------------------------------
INSERT INTO public.agents (id, name, role, letter, color, description, category)
VALUES (
  'avaliacoes',
  'Agente de Avaliações',
  'Resposta a Avaliações iFood',
  'A',
  '#FFC247',
  'Gera respostas humanizadas a avaliações do iFood (regra de logística, nota, tom da loja, <=300 chars) e extrai insights de consultoria rumo ao selo Super.',
  'specialist'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.tenant_agents (tenant_id, agent_id, enabled)
VALUES ('9079bd4d-4df7-4023-90fb-d79c8ba7e900', 'avaliacoes', true)
ON CONFLICT DO NOTHING;
