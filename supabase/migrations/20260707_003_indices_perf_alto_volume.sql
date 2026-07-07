-- 20260707_003_indices_perf_alto_volume.sql
-- Índices compostos faltantes nas tabelas de maior volume, achados varrendo
-- as queries reais dos componentes/rotas (grep .eq/.gte/.order). Aditivo,
-- reversível (DROP INDEX), CREATE INDEX IF NOT EXISTS -- NÃO aplicado aqui,
-- a orquestradora aplica.
--
-- Índices já existentes confirmados via pg_indexes (não repetidos aqui):
--   audit_log: (tenant_id, created_at DESC), (agent_name, created_at DESC), (user_id, created_at DESC)
--   agent_runs: agent_id, created_at DESC, tenant_id, triggered_by (todos SEPARADOS, nenhum composto)
--   client_timeline: (tenant_id, ts DESC), (loja_id, ts DESC), event_type -- já bem coberto, sem mudança
--   atendimento_avaliacoes: (tenant_id, status), (tenant_id, created_at DESC parcial), (tenant_id, assigned_to),
--     (tenant_id, tratativa_status), loja_id -- já bem coberto, sem mudança
--   reviews: só pkey(id) + token -- nenhum índice em created_at

-- 1) audit_log — falta (tenant_id, id DESC): a tela usa paginação por cursor
--    de id, não por created_at (o índice (tenant_id,created_at DESC) já
--    existente NÃO serve pra ORDER BY id).
--    Query real: src/console/AuditLog.jsx:28-32
--      supabase.from('audit_log').select(...).eq('tenant_id', tenantDbId)
--        .order('id', { ascending: false }).limit(PAGE_SIZE + 1)
CREATE INDEX IF NOT EXISTS idx_audit_log_tenant_id_desc
  ON public.audit_log (tenant_id, id DESC);

-- 2) agent_runs — falta índice COMPOSTO (tenant_id, created_at DESC); hoje
--    tenant_id e created_at são índices separados (Postgres precisa
--    bitmap-and dois índices em vez de 1 scan direto). Tabela de altíssimo
--    volume (confirmado no QA C2: Consult tenant teve 1975-3904 linhas em
--    janelas de 7-30 dias) e usada em pelo menos 8 telas com esse EXATO
--    padrão de filtro:
--      src/console/ConsoleV2.jsx:251,262 — .eq('tenant_id',...).gte('created_at',...)
--      src/console/CustosIA.jsx:20-27 — .eq('tenant_id',...).gte('created_at',...).order('created_at',...)
--      src/console/Execucoes.jsx:75-80 — .eq('tenant_id',...).gte('created_at',...)
--      src/console/DeliHub.jsx:193 · src/console/Deli.jsx:276 ·
--      src/console/Lara.jsx:329 · src/console/PainelAgentes.jsx:133 ·
--      src/console/PipelineScreen.jsx:374 — mesmo padrão
CREATE INDEX IF NOT EXISTS idx_agent_runs_tenant_created_desc
  ON public.agent_runs (tenant_id, created_at DESC);

-- 3) reviews — nenhum índice em created_at hoje (só pkey + token). Query real
--    (única leitura de lista da tabela, sem filtro de tenant/store no app —
--    isolamento por RLS):
--      src/console/PainelAvaliacoesConsultor.jsx:7-13
--        supabase.from('reviews').select('*').order('created_at', { ascending: false }).limit(300)
CREATE INDEX IF NOT EXISTS idx_reviews_created_at_desc
  ON public.reviews (created_at DESC);
