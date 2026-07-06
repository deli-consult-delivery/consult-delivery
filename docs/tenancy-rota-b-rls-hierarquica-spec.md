# SPEC — Rota B: RLS hierárquica (aposentar a cópia de membros)

Status: **⏸️ AGUARDA APROVAÇÃO** (gated, alto risco). Nada aplicado. Projeto Supabase `czyanilrverorwenikqw`.
Autor: sessão consult-delivery-22 | Data: 2026-07-02.
Antecede: `project_tenancy_fase1b_aplicada`, migrations `20260701_012` (triggers de cópia) e `20260701_013` (fix LIMIT 1).

---

## GOAL

Fazer a RLS **descer a hierarquia** `parent_tenant_id` (platform → agency → store), para que um membro
de um tenant enxergue os dados dos **descendentes** sem depender da cópia física de membros. Depois de
validado, remover a cópia A1 e os triggers da migration 012.

Regra de acesso: usuário membro do conjunto `M` (seus tenants) acessa a linha de `tenant_id = T` sse
**T ∈ M OU T é descendente de algum tenant em M**. (Agência vê stores; store NÃO vê agência nem irmãos.)

## NÃO-GOALS
- Não muda RBAC (`role_permissions`) nem papéis. Só o "quais linhas" (RLS), não "quais telas".
- Não altera as 34 policies sem `tenant_id`.
- Não mexe em policies de gestão de membros que exigem pertencimento **estrito** (ver §Riscos).

---

## ESTADO ATUAL (medido nesta sessão)

- **336 policies** em `public`: **70** usam `is_member_of()`, **172** usam subquery inline
  `FROM tenant_members` (heterogêneas — ver §Famílias), **34** sem `tenant_id`.
- Helper atual `is_member_of(_tenant)` = **flat** (só pertencimento direto), SECURITY DEFINER STABLE.
- Hierarquia: `tenants.parent_tenant_id` + `tenant_type` + trigger `validate_tenant_hierarchy` (árvore
  acíclica garantida: platform sem pai, agency→platform, store→agency).
- Visibilidade da agência hoje: cópia A1 (membros da agência replicados nos stores), automatizada pelos
  triggers `trg_tenant_inherit_parent_members` / `trg_tenant_member_propagate` (migration 012).

---

## DESIGN

### 1) Função-conjunto `accessible_tenant_ids()` (núcleo)
Retorna `M ∪ descendentes(M)` de uma vez (evita recursão por linha; STABLE, cacheável no plano):
```sql
CREATE OR REPLACE FUNCTION public.accessible_tenant_ids()
RETURNS setof uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  WITH RECURSIVE mine AS (
    SELECT tenant_id AS id FROM public.tenant_members WHERE user_id = auth.uid()
  ),
  tree AS (
    SELECT id FROM mine
    UNION
    SELECT t.id FROM public.tenants t JOIN tree ON t.parent_tenant_id = tree.id
  )
  SELECT id FROM tree;
$$;
```
E o wrapper booleano para os call-sites de `is_member_of`:
```sql
CREATE OR REPLACE FUNCTION public.has_tenant_access(_tenant uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT _tenant IN (SELECT public.accessible_tenant_ids()); $$;
```
> Direção conferida: `tree` desce por `parent_tenant_id = tree.id` (descendentes). Store não alcança
> agência/irmãos. Árvore acíclica → recursão termina.

### 2) Estratégia por família de policy

| Família | Qtd | Ação |
|---|---|---|
| `is_member_of(x)` | 70 | Substituir por `has_tenant_access(x)`. Auditar antes os call-sites que exigem pertencimento estrito (§Riscos) — esses ficam com `is_member_of`. |
| inline `tenant_id IN (SELECT … tenant_members …)` | ~150 | `tenant_id IN (SELECT public.accessible_tenant_ids())`. |
| inline role-filtrado (`… AND role = 'admin'` etc.) | ~15 | Manter o filtro de role; trocar só o conjunto de tenants por `accessible_tenant_ids()`. Caso a caso. |
| inline aninhado (via `conversations`/`customers`/`custom_fields`) | ~5 | Reescrever o subselect interno de tenant por `accessible_tenant_ids()`. Caso a caso. |
| `EXISTS(… role …)` sem `tenant_id` (ex.: `max_kb_write`) | poucos | **Não tocar** (não filtram por tenant). |

Como as inline são heterogêneas, **gerar o DDL programaticamente** a partir de `pg_policies`
(snapshot), transformar por assinatura, e aplicar `DROP+CREATE` por policy — **não** regex cego.

### 3) Aposentar a cópia (fase final, só após validação)
- `DELETE` das linhas de `tenant_members` que são cópia da agência nos stores (membros da agência que
  não são o lojista). Reversível (regeráveis pelos triggers). ⚠️ toca membership → confirmar com Wandson.
- `DROP` dos triggers 012 e das funções de cópia.
- Manter apenas: lojista como membro direto do seu store; equipe da agência como membro só da agência
  (passa a ver stores por hierarquia).

---

## PLANO DE ROLLOUT (staged, em branch Supabase)

0. **Branch Supabase** (`create_branch`) — aplicar e testar fora de produção primeiro.
1. Criar `accessible_tenant_ids()` + `has_tenant_access()`.
2. **Snapshot** de `pg_policies` (todas as 336) → arquivo de rollback com o DDL original regenerado.
3. Migrar família `is_member_of` (após auditoria de estrito). Testar.
4. Migrar inline simples (~150). Testar.
5. Migrar inline role-filtrado + aninhado (~20), caso a caso. Testar.
6. Rodar **matriz de isolamento** completa (§Testes) na branch.
7. Merge da branch → produção. Reexecutar a matriz em produção.
8. (Follow-up gated) Aposentar cópia + triggers 012.

Cada passo: 1 grupo por vez, `BEGIN/COMMIT` atômico, output bruto, parar no 1º erro.

---

## MATRIZ DE TESTES (isolamento) — obrigatória por passo

Simular `auth.uid()` com `SET LOCAL role authenticated` + `request.jwt.claims` (método já usado no fix 013).

| Persona | Deve VER | NÃO pode ver |
|---|---|---|
| Membro platform | tudo (platform + agencies + stores) | — |
| Membro agency | agency + seus stores | outra agency / stores de outra agency |
| Lojista (store único) | só o próprio store | agency, irmãos, outros stores |
| Não-membro | nada | tudo |

Tabelas-amostra por passo: ao menos 1 de cada família + `cobrancas` (agency), uma store-scoped
(ex.: `radar_series`), e `tenant_members`/gestão (checar que estrito continua estrito).

Critério de aceite: **0 vazamento** (persona nunca vê tenant fora do seu ramo) **e** visibilidade
esperada presente (agency vê stores; lojista não perde o próprio).

---

## RISCOS

1. **Call-sites que exigem pertencimento estrito.** Ex.: gerenciar membros/roles do próprio tenant
   (`same_tenant_admin`, policies de `tenant_members`), aprovar drafts, ações "só deste tenant". Se
   virarem hierárquicos, um admin de agency poderia gerir membros de um store indevidamente. **Auditar
   cada uso de `is_member_of` e das policies de gestão ANTES**; manter estrito onde for gestão.
2. **Superfície enorme (242 policies)** logo após vazamentos cross-tenant (#671/#672). Mitigação: branch
   + matriz por passo + snapshot de rollback.
3. **Performance:** `accessible_tenant_ids()` recursivo por query. É STABLE (avaliado 1×/query) e a
   árvore é rasa (3 níveis, ≤ dezenas de nós). Baixo risco; medir em tabelas grandes (`cobrancas`).
4. **Ordem de corte da cópia:** só remover A1/triggers DEPOIS da RLS hierárquica validada em produção,
   senão a agência perde visibilidade dos stores no intervalo.

## ROLLBACK
- Por passo: restaurar o DDL das policies do snapshot (`pg_policies` regenerado no passo 2).
- Funções: `DROP FUNCTION has_tenant_access, accessible_tenant_ids`.
- Cópia/triggers 012: permanecem intactos até a fase final → reverter é só não executá-la.

## QUALITY BAR
- [ ] Branch Supabase usada antes de produção
- [ ] Snapshot de rollback das 336 policies gerado e guardado
- [ ] Auditoria de pertencimento estrito feita (lista de policies que ficam com `is_member_of`)
- [ ] Matriz de isolamento passa (0 vazamento) em cada passo, com output bruto
- [ ] Performance medida em `cobrancas`
- [ ] Cópia A1 + triggers 012 só removidos após RLS validada em produção
