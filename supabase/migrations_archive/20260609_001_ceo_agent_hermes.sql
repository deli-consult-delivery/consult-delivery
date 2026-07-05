-- ════════════════════════════════════════════════════════════════════════════
-- 20260609_001_ceo_agent_hermes.sql
-- T4·3B — admin MCP do Hermes (copiloto CEO). Opção A (admin-mcp-design.md §2.1).
--
-- DECISÃO DE MODELAGEM (Opção A, recomendada e adotada):
--   O `ceo_agent` NÃO é um papel no RBAC (`roles` é per-tenant, `tenant_id NOT NULL`;
--   forçar um papel global afrouxaria RLS). Em vez disso, `ceo_agent` é o PRINCIPAL
--   do admin MCP, que roda como o usuário de SO `claudedev` e lê via credencial
--   service_role-equivalente COM AUDITORIA OBRIGATÓRIA — o enforcement (allowlist de
--   tools, escopo de leitura, "nunca aprova o próprio draft") vive na CAMADA DO
--   MCP/gateway, não no schema. Logo, este SQL NÃO cria papel/role: faz só a única
--   mudança de schema que a Opção A exige.
--
-- O QUE ESTE ARQUIVO FAZ (aditivo, reversível, não-destrutivo):
--   1. Adiciona `agent_drafts.origin` — marca a ORIGEM de cada draft (design §5:
--      "drafts criados pelo Hermes carregam origem='hermes'"), pra o Wandson saber
--      no painel que a proposta veio do copiloto e não de um agente de operação.
--   2. Backfill seguro dos drafts existentes para 'agent' (origem neutra).
--   3. Índice parcial p/ a tool `cd_drafts_pendentes` filtrar propostas do Hermes.
--
-- ⚠️ NÃO APLICAR sem `ok` do Wandson (Mandato Cowork D5 v2). Versionado em git ANTES
--    de aplicar, por design. Go-live de T4·3B ainda depende de: claudedev na VPS +
--    token service_role dedicado (Infisical) — reservado ao Wandson.
-- ════════════════════════════════════════════════════════════════════════════

-- 1 · Coluna de origem (aditiva, com default neutro — não quebra inserts existentes)
ALTER TABLE public.agent_drafts
  ADD COLUMN IF NOT EXISTS origin TEXT NOT NULL DEFAULT 'agent';

-- 2 · Constraint de valores válidos (idempotente)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'agent_drafts_origin_check'
  ) THEN
    ALTER TABLE public.agent_drafts
      ADD CONSTRAINT agent_drafts_origin_check
      CHECK (origin IN ('agent', 'deli', 'hermes', 'user_manual'));
  END IF;
END$$;

COMMENT ON COLUMN public.agent_drafts.origin IS
  'Origem da proposta: agent (agente de operação) | deli (orquestradora) | hermes (copiloto CEO via admin MCP) | user_manual. Drafts do Hermes = ''hermes'' (admin-mcp-design.md §5). Enforcement de quem pode criar/aprovar = camada MCP/painel, não RLS.';

-- 3 · Índice parcial p/ a tool cd_drafts_pendentes filtrar propostas do Hermes pendentes
CREATE INDEX IF NOT EXISTS idx_agent_drafts_hermes_pending
  ON public.agent_drafts (tenant_id, created_at DESC)
  WHERE origin = 'hermes' AND status = 'pending';

-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK (referência — não executar aqui):
--   DROP INDEX IF EXISTS public.idx_agent_drafts_hermes_pending;
--   ALTER TABLE public.agent_drafts DROP CONSTRAINT IF EXISTS agent_drafts_origin_check;
--   ALTER TABLE public.agent_drafts DROP COLUMN IF EXISTS origin;
-- ════════════════════════════════════════════════════════════════════════════
