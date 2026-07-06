# GAP-2 estrutural — Unificação `tenant_agents.config` × `tenant_agent_config`

> Fila de retomada do handoff 05/07. Decisão + plano de migração (fase 1 aditiva, aplicada por
> este PR; fase 2 destrutiva, reservada ao Wandson).

## 1. Mapeamento real (grep + leitura, arquivo:linha)

### Fonte canônica de fato hoje (config real de agente): `tenant_agent_config`
- `trigger/_shared/tenant-agent-config.ts:36-62` — helper único `getTenantAgentConfig(tenantId, agentId)`, lê `modo_override, enabled, config` de `tenant_agent_config`. Consumido por **9 tasks**: `trigger/agents/responder-conclusao.ts`, `trigger/bom-dia/gerar-imagem.ts`, `trigger/breno/processar-webhook.ts`, `trigger/breno/responder.ts`, `trigger/cora/analisar-devedor.ts`, `trigger/cora/escalonar.ts`, `trigger/cora/gerar-mensagem-asaas.ts`, `trigger/cora/gerar-mensagem.ts`, `trigger/cora/processar-cobranca.ts`.
- `bridge-server/lib/semaforo.js:18` — traduz `modo_override` de `tenant_agent_config` no semáforo (verde/amarelo/vermelho).
- `bridge-server/routes/agent-builder.js:182-266` — `GET`/`PATCH /api/agent-builder/agents/:id/config` lê e grava direto em `tenant_agent_config` (REST, `sbFetch`).
- `bridge-server/routes/oracle.js:302-303` — ao criar um agente novo, grava a allow-list de tools em `tenant_agent_config.config`.
- `src/console/AgenteConfig.jsx:32-47` — tela "Config de Agentes" (module `config`): lê `tenant_agents` **só para enumerar quais agentes existem** (`agent_id, agents(...)`, sem tocar `config`) e lê/escreve `modo_override, enabled, config, provider, cost_limit_usd` em `tenant_agent_config`. **Já estava correto.**

### Uso divergente achado (bug real, corrigido neste PR): `tenant_agents.config`
- `src/console/PainelAgentes.jsx` (tela "Catálogo", module `catalogo`, roteada em `ConsoleV2.jsx:836`) — **era a única tela lendo/escrevendo `tenant_agents.config`** em vez de `tenant_agent_config`:
  - `carregar()` fazia `.select('agent_id, modo, config')` em `tenant_agents` — **a coluna `modo` NÃO EXISTE nessa tabela** (schema real: `tenant_id, agent_id, enabled, config, created_at, updated_at` — `modo_override` só existe em `tenant_agent_config`). Isso quebrava a query inteira (erro do PostgREST) toda vez que a tela carregava.
  - `toggleAgente()` fazia `upsert({..., modo: agente?.default_modo || 'revisao'})` — mesmo problema, coluna inexistente.
  - `salvarConfig()` escrevia em `tenant_agents.config` — funcionaria (a coluna existe), mas nunca era lido de volta pela tela canônica (`AgenteConfig.jsx`), então qualquer config salva por aqui ficava invisível/perdida do ponto de vista do resto do sistema.
  - **Corrigido neste PR**: as 3 funções agora usam `tenant_agent_config` (mesmo padrão de `AgenteConfig.jsx`), e o upsert de habilitação em `tenant_agents` não manda mais o campo `modo` inexistente.

### `tenant_agents` como tabela de "habilitação" (não de config) — uso correto, sem mudança
`src/console/AcessoUsuarios.jsx`, `src/console/Clientes.jsx`, `src/console/ConsoleV2.jsx`, `src/types/database.ts`, `bridge-server/routes/loop-despachar.js`, `bridge-server/routes/oracle.js` (INSERT ao criar agente, sem `config`), `trigger/asaas/defesa-sync-assinaturas.ts`, `trigger/defesa/vigia.ts` — todos usam `tenant_agents` só para checar/gravar `enabled`/existência (catálogo de quais agentes o tenant tem), nunca `.config`. Esse uso é legítimo e não muda.

## 2. Levantamento em prod (read-only, `czyanilrverorwenikqw`, 2026-07-07)

```sql
SELECT
  (SELECT count(*) FROM tenant_agents) AS ta_total,
  (SELECT count(*) FROM tenant_agents WHERE config IS NOT NULL AND config <> '{}'::jsonb) AS ta_com_config,
  (SELECT count(*) FROM tenant_agent_config) AS tac_total,
  (SELECT count(*) FROM tenant_agent_config WHERE config IS NOT NULL AND config <> '{}'::jsonb) AS tac_com_config,
  (SELECT count(*) FROM tenant_agents ta JOIN tenant_agent_config tac USING (tenant_id, agent_id)) AS overlap_rows;
```
```
ta_total: 30 | ta_com_config: 0 | tac_total: 2 | tac_com_config: 2 | overlap_rows: 2
```

**Resultado: zero divergência de dado real hoje.** `tenant_agents.config` está 100% vazio (`{}`) nas 30 linhas em prod (agência + 2 outros tenants); as únicas 2 linhas com config real (`bom-dia`: `calendar_id`; `breno`: `bypass_offhours`) estão em `tenant_agent_config`, a fonte que já é lida por trigger/bridge. Confirmado via `FULL OUTER JOIN` linha a linha — nenhum par `(tenant_id, agent_id)` tem valores conflitantes entre as duas tabelas. O risco descrito no brief ("qual vence?") era um risco de **código** (2 caminhos de escrita possíveis), não um problema de dado já materializado.

## 3. Decisão

**Fonte canônica: `tenant_agent_config`.** Já é o que 9 tasks + 2 rotas do Bridge + a tela correta do Console leem. `tenant_agents` continua existindo só para "o agente X está habilitado pro tenant Y" (papel de catálogo/membership); sua coluna `config` vira **mirror somente-leitura** (nunca mais escrita por código de aplicação).

### Fase 1 — aditiva (este PR)
1. **Código**: `PainelAgentes.jsx` corrigido para ler/escrever `tenant_agent_config` (fix do bug real + alinhamento com a fonte canônica).
2. **Migration `20260707_001_gap2_tenant_agents_config_sync.sql`**:
   - Backfill: espelha `tenant_agent_config.config` → `tenant_agents.config` para pares que já têm linha em `tenant_agents` (no-op hoje, dado o levantamento acima — mantido por idempotência/segurança).
   - Trigger `trg_sync_tenant_agents_config` (`AFTER INSERT OR UPDATE OF config ON tenant_agent_config`): todo write futuro na fonte canônica espelha automaticamente para `tenant_agents.config`, **só via UPDATE** (nunca insere linha nova em `tenant_agents` — habilitar um agente continua sendo uma decisão separada de configurá-lo). Fecha a possibilidade de divergência futura sem exigir que nenhum consumidor legado mude de tabela imediatamente.
3. **Nenhum DROP, nenhum DELETE, nenhuma aplicação em prod por este worker** — migration só versionada, a orquestradora aplica.

### Fase 2 — destrutiva (reservada ao Wandson, NÃO incluída neste PR)
Depois que a Fase 1 estiver em prod por um tempo razoável e um novo grep confirmar que **nenhum código lê `tenant_agents.config` diretamente** (hoje, após o fix, isso já seria verdade — mas a checagem deve ser refeita no momento de aplicar a Fase 2, não assumida):
```sql
-- reservado ao Wandson — DESTRUTIVO, não faz parte desta migration
DROP TRIGGER IF EXISTS trg_sync_tenant_agents_config ON public.tenant_agent_config;
DROP FUNCTION IF EXISTS public.sync_tenant_agents_config();
ALTER TABLE public.tenant_agents DROP COLUMN config;
```

## 4. Verificação (output bruto)
- SQL de levantamento acima rodado via MCP Supabase (read-only) — resultado colado na seção 2.
- `npm run build` → `✓ built in 4.61s`.
- `grep -rln "tenant_agent_config" src/ bridge-server/ trigger/ supabase/migrations/` e `grep -rln "tenant_agents" src/ bridge-server/ trigger/` — listas completas usadas para a seção 1, nenhuma citação de memória.
