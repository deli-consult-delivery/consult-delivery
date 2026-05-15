-- Migration: 20260515_026_vera_views.sql
-- Data: 2026-05-15
-- Autor: Wandson (via Claude Code)
-- Motivo: VERA precisa de views SQL para agregar métricas de diferentes domínios
--         (agentes, conversas WhatsApp, negócio) sem duplicar lógica no código da task.
--         As views são consultadas pela task Trigger.dev da VERA para popular
--         vera_metricas_snapshot e gerar relatórios.
-- Risco: Baixo — apenas views (CREATE OR REPLACE), sem alteração de dados.
--         Views herdam RLS das tabelas-base; não é necessário RLS adicional.
-- Dependencias:
--   - public.agent_runs        (20260512_005_create_agent_runs.sql)
--   - public.conversations     (criada antes das migrations versionadas, RLS em 20260504_002_fix_rls.sql)
--   - public.whatsapp_messages (20260504_004_whatsapp.sql) — usada em view_metricas_conversas_dia
--                               porque somente whatsapp_messages tem coluna `direction`
--   - public.prospects         (20260515_022_sofia_prospects.sql)
--   - public.cora_cobrancas    (20260514_016_cora_cobrancas.sql)
-- Reversao:
--   DROP VIEW IF EXISTS public.view_metricas_negocio_dia;
--   DROP VIEW IF EXISTS public.view_metricas_conversas_dia;
--   DROP VIEW IF EXISTS public.view_metricas_agentes_dia;

BEGIN;

-- ── 1. view_metricas_agentes_dia ─────────────────────────────────────────────
-- Agrega execuções de agentes por tenant + agent_id + dia.
-- Usado pela VERA para monitorar custo e taxa de sucesso por agente.

CREATE OR REPLACE VIEW public.view_metricas_agentes_dia AS
SELECT
  tenant_id,
  agent_id,
  created_at::date                                                               AS data,
  COUNT(*)                                                                       AS num_runs,
  COUNT(*) FILTER (WHERE status = 'success')                                     AS num_success,
  COUNT(*) FILTER (WHERE status = 'failed')                                      AS num_failed,
  COALESCE(SUM(cost_usd), 0)                                                     AS custo_total_usd,
  COALESCE(AVG(duration_ms) FILTER (WHERE duration_ms IS NOT NULL), 0)::integer  AS duracao_media_ms
FROM public.agent_runs
WHERE tenant_id IS NOT NULL
GROUP BY tenant_id, agent_id, created_at::date;

COMMENT ON VIEW public.view_metricas_agentes_dia IS
  'Agrega execuções de agent_runs por tenant, agente e dia. '
  'Usado pela VERA para calcular custo diário, taxa de sucesso e latência por agente. '
  'RLS herdada de agent_runs.';

-- ── 2. view_metricas_conversas_dia ───────────────────────────────────────────
-- Agrega conversas do tenant por dia, incluindo volume de mensagens por direção.
-- Nota de implementação: usa whatsapp_messages (coluna `direction` confirmada em
-- 20260504_004_whatsapp.sql) em vez de `messages`, que não possui coluna `direction`
-- nas migrations versionadas. O JOIN liga whatsapp_messages à conversation via
-- conversation_id quando a mensagem pertence ao mesmo dia que a conversa foi criada.

CREATE OR REPLACE VIEW public.view_metricas_conversas_dia AS
SELECT
  c.tenant_id,
  c.created_at::date                                                              AS data,
  COUNT(DISTINCT c.id)                                                            AS num_conversas_novas,
  COUNT(wm.id) FILTER (WHERE wm.direction = 'inbound')                           AS num_mensagens_inbound,
  COUNT(wm.id) FILTER (WHERE wm.direction = 'outbound')                          AS num_mensagens_outbound
FROM public.conversations c
LEFT JOIN public.whatsapp_messages wm
       ON wm.conversation_id = c.id
      AND wm.ts::date = c.created_at::date
WHERE c.tenant_id IS NOT NULL
GROUP BY c.tenant_id, c.created_at::date;

COMMENT ON VIEW public.view_metricas_conversas_dia IS
  'Agrega conversas por tenant e dia, com contagem de mensagens inbound/outbound '
  'via JOIN em whatsapp_messages (única tabela com coluna direction confirmada). '
  'RLS herdada de conversations e whatsapp_messages.';

-- ── 3. view_metricas_negocio_dia ─────────────────────────────────────────────
-- Agrega prospects novos, qualificados e convertidos (clientes novos) por dia.
-- Usado pela VERA para monitorar funil SDR da SOFIA.

CREATE OR REPLACE VIEW public.view_metricas_negocio_dia AS
SELECT
  tenant_id,
  created_at::date                                                                AS data,
  COUNT(*)                                                                        AS num_prospects_novos,
  COUNT(*) FILTER (WHERE status IN ('qualificado','abordado','respondeu','convertido'))
                                                                                  AS num_prospects_qualificados,
  COUNT(*) FILTER (WHERE status = 'convertido')                                   AS num_clientes_novos
FROM public.prospects
WHERE tenant_id IS NOT NULL
GROUP BY tenant_id, created_at::date;

COMMENT ON VIEW public.view_metricas_negocio_dia IS
  'Agrega prospects da SOFIA por tenant e dia: total criados, qualificados no funil '
  'e convertidos em clientes. RLS herdada de prospects.';

COMMIT;
