-- 20260707_005_custo_por_tenant_agente_rpc.sql
-- Dashboard de custo por tenant/agente (ConsoleV2 "Custos de IA"). Agora que
-- cost_usd está instrumentado (PR #822, #828), o gap é agregar por tenant sem
-- estourar o cap de 1000 linhas do PostgREST nem trazer todos os agent_runs
-- pro cliente pra reduzir em JS (CustosIA.jsx já faz isso, mas só p/ 1 tenant
-- de cada vez, via paginação client-side — ver comentário em CustosIA.jsx:13-16).
--
-- Função SQL (não view): GROUP BY já em Postgres, retorna no máximo
-- (nº tenants acessíveis × nº agentes) linhas — sempre << 1000 no volume atual
-- e por bastante tempo, mesmo em cenário de revenda com centenas de lojas.
--
-- SECURITY INVOKER (default de função, explícito aqui por clareza): roda com o
-- RLS do usuário chamador, reusa a policy hierárquica já existente em
-- agent_runs (tenant_members_view_own_runs → accessible_tenant_ids()) — um
-- admin de agência já enxerga o custo de todas as lojas filhas; um usuário de
-- 1 loja só vê a própria. Sem policy nova a manter.
--
-- NÃO APLICAR sem decisão do Wandson (aditiva, reversível, mas cria função
-- nova — seguir o protocolo de aplicar SQL só via ele, pós-#793).
--
-- Rollback: DROP FUNCTION IF EXISTS public.custo_por_tenant_agente(int);

CREATE OR REPLACE FUNCTION public.custo_por_tenant_agente(dias_atras int DEFAULT 30)
RETURNS TABLE (
  tenant_id   uuid,
  agent_id    text,
  execucoes   bigint,
  custo_total numeric,
  custo_medio numeric
)
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = 'public'
AS $$
  SELECT
    tenant_id,
    agent_id,
    COUNT(*)                    AS execucoes,
    COALESCE(SUM(cost_usd), 0)  AS custo_total,
    AVG(cost_usd)               AS custo_medio
  FROM public.agent_runs
  WHERE created_at >= now() - (GREATEST(dias_atras, 1) || ' days')::interval
  GROUP BY tenant_id, agent_id;
$$;

COMMENT ON FUNCTION public.custo_por_tenant_agente(int) IS
  'Custo (cost_usd) agregado por tenant+agente nos últimos N dias. SECURITY INVOKER — respeita RLS hierárquica de agent_runs, sem policy própria. Usado pelo card "Por tenant" de src/console/CustosIA.jsx.';

GRANT EXECUTE ON FUNCTION public.custo_por_tenant_agente(int) TO authenticated;
