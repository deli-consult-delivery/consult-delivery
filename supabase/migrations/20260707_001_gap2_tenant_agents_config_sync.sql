-- 20260707_001_gap2_tenant_agents_config_sync.sql
-- GAP-2 estrutural (fila 05/07): unifica as 2 fontes de config de agente por
-- tenant. Decisao completa em docs/decisions/gap2-unificacao-config.md.
--
-- Fonte canonica DECIDIDA: tenant_agent_config (modo_override, enabled,
-- config, provider, cost_limit_usd) -- ja e o que trigger/_shared/
-- tenant-agent-config.ts (usado por 9 tasks) e bridge-server/routes/
-- agent-builder.js leem/escrevem. tenant_agents.config (jsonb) fica como
-- coluna LEGADA/mirror, nunca mais escrita por codigo novo.
--
-- Levantamento em prod (czyanilrverorwenikqw, 2026-07-07, read-only):
--   tenant_agents:       30 linhas, 0 com config != '{}' (100% vazio)
--   tenant_agent_config:  2 linhas, ambas com config real (bom-dia, breno)
--   overlap (mesma tenant_id+agent_id nas 2 tabelas): 2
-- ZERO divergencia de dado real hoje -- nada a perder/reconciliar. O risco
-- e so de codigo (2 caminhos de escrita), nao de dado.
--
-- Fix embutido: PainelAgentes.jsx (tela 'catalogo') fazia
-- .select('agent_id, modo, config') em tenant_agents -- coluna `modo` NAO
-- EXISTE nessa tabela (so em tenant_agent_config, chamada modo_override).
-- Toda carga da tela quebrava (erro 400 do PostgREST). Corrigido no mesmo
-- PR: a tela passa a ler/escrever tenant_agent_config, igual AgenteConfig.jsx.
--
-- O que esta migration faz (100% aditivo, sem DROP/DELETE):
--   1) trigger em tenant_agent_config: apos INSERT/UPDATE, espelha
--      enabled+config pra tenant_agents.config (SO UPDATE -- nunca insere
--      linha nova em tenant_agents; "habilitar agente pro tenant" continua
--      sendo decisao separada de "configurar o agente"). Fecha o "qual
--      vence" pra sempre: tenant_agent_config manda, tenant_agents.config
--      so reflete.
--   2) backfill (no-op hoje, dado o levantamento acima -- mantido por
--      seguranca/idempotencia caso rode depois de novos INSERTs manuais).
--
-- FORA DE ESCOPO (fase 2, reservado ao Wandson -- destrutivo, NAO incluido
-- aqui): DROP COLUMN tenant_agents.config (so depois de confirmar que
-- nenhum consumidor le mais dela -- ver secao "Fase 2" do doc de decisao).
--
-- Idempotente: CREATE OR REPLACE FUNCTION + DROP TRIGGER IF EXISTS.
-- Rollback:
--   DROP TRIGGER IF EXISTS trg_sync_tenant_agents_config ON public.tenant_agent_config;
--   DROP FUNCTION IF EXISTS public.sync_tenant_agents_config();

BEGIN;

-- 1) backfill: espelha o que ja existe em tenant_agent_config pra dentro de
--    tenant_agents.config, SO para pares que ja tem linha em tenant_agents
--    (nunca cria linha nova = nunca "habilita" um agente por engano).
UPDATE public.tenant_agents ta
SET config = tac.config,
    updated_at = now()
FROM public.tenant_agent_config tac
WHERE ta.tenant_id = tac.tenant_id
  AND ta.agent_id = tac.agent_id
  AND ta.config IS DISTINCT FROM tac.config;

-- 2) trigger: daqui pra frente, todo INSERT/UPDATE em tenant_agent_config
--    espelha automaticamente pra tenant_agents.config (se a linha existir).
CREATE OR REPLACE FUNCTION public.sync_tenant_agents_config()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.tenant_agents
  SET config = NEW.config,
      updated_at = now()
  WHERE tenant_id = NEW.tenant_id
    AND agent_id = NEW.agent_id
    AND config IS DISTINCT FROM NEW.config;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_tenant_agents_config ON public.tenant_agent_config;
CREATE TRIGGER trg_sync_tenant_agents_config
  AFTER INSERT OR UPDATE OF config ON public.tenant_agent_config
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_tenant_agents_config();

COMMIT;

-- ============================================================================
-- VERIFICACAO (NAO EXECUTAR AQUI -- rodar a parte apos aplicar):
--   SELECT ta.config = tac.config AS bate
--   FROM tenant_agents ta JOIN tenant_agent_config tac USING (tenant_id, agent_id);
--   -- esperado: bate = true em todas as linhas
-- ============================================================================
