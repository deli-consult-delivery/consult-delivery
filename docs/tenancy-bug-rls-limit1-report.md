# Relatório — bug RLS `= (SELECT … LIMIT 1)` em 28 policies

Status: **✅ CORRIGIDO 2026-07-01** (migration `20260701_013_rls_fix_limit1_to_in.sql`, commit 4d47d2b).
27 policies migradas `= (…LIMIT 1)` → `IN (…)`; `max_kb_write` deixada intacta (não compara tenant_id).
Teste de isolamento: agência multi-tenant passou a ver 2319 cobranças; store único (Karina) vê 0 → sem vazamento.
Histórico original abaixo.
Descoberto ao investigar a "RLS hierárquica". Projeto Supabase `czyanilrverorwenikqw`.

## O bug

28 policies (todas `cmd=ALL`, exceto `max_knowledge_base` que tem SELECT+ALL) usam, em **USING e
WITH CHECK**:
```sql
tenant_id = ( SELECT tenant_members.tenant_id
              FROM tenant_members
              WHERE tenant_members.user_id = auth.uid()
              LIMIT 1 )          -- sem ORDER BY => tenant ARBITRÁRIO
```
Para um usuário **membro de vários tenants**, o `LIMIT 1` escolhe **um tenant qualquer** (ordem não
determinística do Postgres). A policy então só deixa ver/gravar linhas **daquele um tenant arbitrário**.

## Por que virou problema agora (ativado pela Fase 1b)

Antes da Fase 1b, os membros da agência eram single-tenant → `LIMIT 1` retornava o único tenant →
correto. A **cópia A1** (Fase 1b) tornou os membros da agência **multi-tenant** (agência + 18 stores =
19). Agora `LIMIT 1` retorna um dos 19 ao acaso → nessas 28 tabelas o usuário da agência vê/grava só
um tenant arbitrário.

## Severidade: correção funcional, **NÃO é vazamento**

- **Não vaza dado cross-tenant:** o `LIMIT 1` sempre retorna um tenant do qual o usuário É membro.
  Nunca expõe dado de tenant alheio.
- **É quebra de visibilidade/gravação para multi-tenant (equipe da agência):** ao alternar para o
  store X no switcher, a query da tela pode ser bloqueada pela RLS se `LIMIT 1` ≠ X → tela vazia,
  dados do tenant errado, ou insert barrado. Afeta telas sensíveis (ex.: `cobrancas` = financeiro).
- Usuário single-tenant (lojista onboardado, membro de 1 store) → `LIMIT 1` = o único → **correto**.

## Tabelas afetadas (28 policies)
`aceite_recontratacao` · `agent_action_approvals` · `agent_knowledge_base` · `agent_ticket_activity`
· `agent_ticket_comments` · `agent_tickets` · `breno_interactions` · `breno_triagem` · **`cobrancas`**
· `conversation_events` · `cora_acoes` · `cora_cobrancas` · `cora_reguas` · `customer_addresses`
· `customer_notes` · `departments` · `goal_tasks` · `goals` · `heartbeat_runs` · `heartbeats`
· `lead_lists` · `lead_tags` · `max_knowledge_base` (×2) · `mia_analises` · `missions`
· `nova_blueprints` · `projects`

## Correção recomendada (quando aprovado)

Trocar `= ( … LIMIT 1)` por `IN ( … )` — mesmo padrão da maioria das outras policies inline. É
**aditivo à visibilidade** (passa a ver todos os tenants de que é membro) e reversível. Cada policy
exige DROP+CREATE (não dá ALTER de USING/WITH CHECK in place). Aplicar com teste de isolamento por
tabela (garantir que um membro de 1 store continua vendo só o dele). Migration gated — não aplicada
nesta sessão por decisão do Wandson.

Query para regerar a lista exata:
```sql
select tablename, policyname, cmd from pg_policies
where schemaname='public'
  and (coalesce(qual,'')||' '||coalesce(with_check,'')) ilike '%from tenant_members%'
  and (coalesce(qual,'')||' '||coalesce(with_check,'')) ilike '%limit 1%'
order by tablename, policyname;
```
