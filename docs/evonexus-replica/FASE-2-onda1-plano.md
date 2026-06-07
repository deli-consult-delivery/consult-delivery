# FASE 2 — Onda 1: Segurança RLS + Cabear o B (tenant_agents)

> **Status: 🛑 CHECKPOINT 2 — AGUARDANDO APROVAÇÃO DO SQL PELO WANDSON. NADA FOI APLICADO.**
> Redigido por Cowork em 2026-06-06 (go do CHECKPOINT 1 dado pelo Wandson na mesma data).
> Branch: `cowork/fase2-onda1-migrations`. Aplicação: **manual pelo Wandson** (SQL Editor do
> Supabase ou CLI), **nunca via MCP**, na ordem 001→005, após merge deste PR.

## Evidência ao vivo (queries read-only, 2026-06-06 ~23h UTC)

1. **3 policies permissivas (DDL bruto):** `agents_read_all` SELECT `USING true` ·
   `customers_auth_all` ALL `USING true / CHECK true` · `user_agent_access_manage_admin`
   ALL `EXISTS(tenant_members tm WHERE tm.user_id=auth.uid() AND tm.role='admin')` — **sem casar tenant**.
2. **Brecha extra encontrada na verificação:** `agents_tenant_isolation` é `FOR ALL` com
   `USING (tenant_id IS NULL OR …)` e **sem WITH CHECK** → qualquer membro autenticado pode
   **INSERIR/ALTERAR agentes globais**. Corrigida na 002 (não estava no escopo original; padrão
   idêntico ao bug do #136/bot_configs).
3. **Funções RLS** (pendência 3 da FASE 1, resolvida): `is_member_of` / `is_admin_of` existem,
   `SECURITY DEFINER`, `search_path=public`; `is_admin_of` aceita `role IN ('owner','admin')`.
4. **PKs confirmadas:** `tenant_agents` e `tenant_agent_config` = PK `(tenant_id, agent_id)`.
5. **Counts:** `agent_runs` 1684 (383 NULL) · `agent_memories` 0 · `tenant_agents` 0 ·
   `tenant_agent_config` 0 · `tenants` 1.
6. **Catálogo (15 agentes, todos globais/ativos):** deli (orchestrator) · analise-ifood ·
   analise-gerar-relatorio · bom-dia · bom-dia-scheduler · breno · cora · encerramento ·
   encerramento-scheduler · lara · loja-gpt · max · nova · sofia · vera.
7. **`user_agent_access` (7 linhas):** agent_name = analista-ifood×3, lara×2, deli×1, main×1.
   `analista-ifood` e `main` **não existem** em `agents.id` — por isso o backfill mapeado da 005.

## As 5 migrations (ordem de aplicação obrigatória)

| # | Arquivo | O que faz | Reversibilidade |
|---|---------|-----------|------------------|
| 1 | `20260607_001_tenant_agents_populate.sql` | 15 INSERTs idempotentes em `tenant_agents` (consult) | DELETE simples |
| 2 | `20260607_002_agents_rls_gating.sql` | Troca `agents_read_all`+`agents_tenant_isolation` por 4 policies (select gated via `tenant_agents` + escrita só admin/custom) + helper `agent_enabled_for_user` | Recriar policies antigas (DDL no histórico git) |
| 3 | `20260607_003_customers_uaa_rls.sql` | Remove `customers_auth_all`; re-escopa `user_agent_access_manage_admin` (helper `same_tenant_admin`) | Recriar policies antigas |
| 4 | `20260607_004_agent_runs_backfill.sql` | 383 runs NULL → consult; `agent_memories.tenant_id SET NOT NULL` (0 linhas) | UPDATE é 1-way (mas valor único possível); DROP NOT NULL trivial |
| 5 | `20260607_005_user_agent_access_expand.sql` | ADD `tenant_id`+`agent_id` (FKs) + backfill mapeado; PK antiga intacta | Colunas novas, nada removido |

**Por que DROP POLICY não viola "nunca DROP em produção":** a proibição protege DADOS
(tabelas/colunas/linhas). Policy é código de autorização, recriável do histórico git — e é o
único jeito de substituir uma policy. Nenhuma linha de dado é destruída em nenhuma migration.

## Impacto no app (verificar após aplicar)

- **Agentes:** painel continua mostrando os 15 (via gating + 001). Se a lista vier vazia → 001 não rodou antes da 002.
- **Customers/Chat:** leitura como membro continua via `customers_member_all`; webhooks Evolution escrevem via service_role (bypassa RLS) — inalterado.
- **Trigger.dev/Bridge:** usam service_role — inalterados.
- **Smoke test** (QA mandato): logado no app → painel de agentes carrega · chat ao vivo abre conversa · `SELECT count(*) FROM agent_runs WHERE tenant_id IS NULL` = 0.

## Pendências para a onda 2

- **P-1:** linha `agent_name='main'` — mapear p/ deli ou aposentar (decisão Wandson).
- **P-2:** cutover `logAgentRun` → sempre enviar `tenant_id`; depois `agent_runs.tenant_id SET NOT NULL` + aposentar policy `authenticated_view_global_runs`.
- **P-3:** contract de `user_agent_access`: PK nova `(tenant_id, user_id, agent_id)` + aposentar `agent_name` após cutover do frontend/Bridge.
- **P-4:** popular `tenant_agent_config` quando houver overrides reais por tenant.

## 🛑 CHECKPOINT 2 — o que o Wandson aprova

1. Os 5 arquivos `.sql` acima (ler na íntegra — são curtos e comentados).
2. A ordem 001→005 e o procedimento: merge do PR → aplicar manualmente no SQL Editor → rodar as queries de validação de cada arquivo → smoke test do app.
3. As pendências P-1 a P-4 ficam para a onda 2.
