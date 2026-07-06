# SPEC — Fase 0: Fundação de Hierarquia de Tenancy

**Data:** 2026-07-01 · **Status:** ✅ APLICADA em produção (2026-07-01) — QUALITY BAR toda verde (platform=1, agency=1, store=2, órfãos=0, trigger rejeita órfã). Nota: banco tinha **3 tenants** (não 14 — os clientes de consultoria vivem em `lojas`); o tenant "Consult Delivery" (slug `consult`) foi **promovido** a agência-raiz em vez de criar uma nova.
**Base:** `docs/tenancy-estrutura-estudo.md` · `docs/tenancy-decisoes-discussao.md`
**Migration alvo:** `supabase/migrations/20260701_001_tenancy_hierarchy.sql`

---

## Context

A plataforma vai ser revendida para outras agências e para lojistas. Isso exige uma **camada de agrupamento acima do tenant** que hoje não existe (`tenants` é flat). A Fase 0 introduz **só a fundação estrutural** — sem mexer em RLS, billing ou UI ainda. É o pré-requisito de tudo que vem depois (RLS por hierarquia, portal de agência, white-label, planos).

Decisões travadas que esta fase materializa:
- Hierarquia via **`parent_tenant_id`** (self-reference) + **`tenant_type`** (`platform`/`agency`/`store`), **profundidade fixa de 3 níveis**.

---

## GOAL

Adicionar a hierarquia de 3 níveis ao schema `tenants`, de forma **aditiva e reversível**, e reorganizar os tenants atuais sob uma **agência-raiz "Consult Delivery"**, sem alterar nenhum comportamento visível da aplicação.

Entregável: 1 migration SQL (`20260701_001_tenancy_hierarchy.sql`) versionada em git, aplicada com output bruto de validação.

## QUALITY BAR (binário)

- [ ] Migration é **100% aditiva** (só `ADD COLUMN`, `INSERT`, `CREATE TRIGGER`) — nenhum `DROP`/`DELETE`/`TRUNCATE`/`ALTER … DROP`.
- [ ] `tenants` ganha `parent_tenant_id uuid REFERENCES tenants(id)` e `tenant_type text` com CHECK `('platform','agency','store')`.
- [ ] Existe **exatamente 1** linha `tenant_type='platform'` e **1** `tenant_type='agency'` chamada "Consult Delivery" (agência-raiz) após o backfill.
- [ ] Os **14 tenants de loja atuais** ficam com `tenant_type='store'` e `parent_tenant_id` = id da agência-raiz. Nenhum tenant de loja fica órfão (`parent_tenant_id IS NULL AND tenant_type='store'` → 0 linhas).
- [ ] Trigger de integridade impede par inválido (ex.: `store` com pai `store`, ou `platform` com pai não-nulo).
- [ ] **Nada muda na aplicação**: login, carga de tenant (`App.jsx`), menu e RLS existentes continuam idênticos (a coluna nova é ignorada pelo código atual).
- [ ] Output bruto das queries de validação colado no PR.
- [ ] Rollback documentado e testado mentalmente (setar colunas de volta a NULL / droppar colunas reverte sem perda).

---

## Escopo do SQL (rascunho — vira a migration após ok)

```sql
-- 1. Colunas de hierarquia (aditivo, idempotente)
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS parent_tenant_id uuid REFERENCES public.tenants(id);
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS tenant_type text NOT NULL DEFAULT 'store';
ALTER TABLE public.tenants DROP CONSTRAINT IF EXISTS tenants_tenant_type_chk;
ALTER TABLE public.tenants ADD CONSTRAINT tenants_tenant_type_chk
  CHECK (tenant_type IN ('platform','agency','store'));
CREATE INDEX IF NOT EXISTS idx_tenants_parent ON public.tenants(parent_tenant_id);

-- 2. Nó Plataforma (dono do SaaS) — idempotente por slug
INSERT INTO public.tenants (name, slug, tenant_type, parent_tenant_id)
SELECT 'Plataforma Consult Delivery', 'plataforma', 'platform', NULL
WHERE NOT EXISTS (SELECT 1 FROM public.tenants WHERE tenant_type='platform');

-- 3. Agência-raiz "Consult Delivery" sob a Plataforma — idempotente por slug
INSERT INTO public.tenants (name, slug, tenant_type, parent_tenant_id)
SELECT 'Consult Delivery', 'consult-delivery-agencia', 'agency',
       (SELECT id FROM public.tenants WHERE tenant_type='platform' LIMIT 1)
WHERE NOT EXISTS (SELECT 1 FROM public.tenants WHERE slug='consult-delivery-agencia');

-- 4. Backfill: todo tenant pré-existente (que não é os 2 nós criados) vira store da agência-raiz
UPDATE public.tenants
SET tenant_type='store',
    parent_tenant_id=(SELECT id FROM public.tenants WHERE slug='consult-delivery-agencia' LIMIT 1)
WHERE tenant_type='store' AND parent_tenant_id IS NULL
  AND slug NOT IN ('plataforma','consult-delivery-agencia');

-- 5. Trigger de integridade (par tipo-pai × tipo-filho)
CREATE OR REPLACE FUNCTION public.validate_tenant_hierarchy() RETURNS trigger AS $$
DECLARE parent_type text;
BEGIN
  IF NEW.tenant_type='platform' THEN
    IF NEW.parent_tenant_id IS NOT NULL THEN RAISE EXCEPTION 'platform não tem pai'; END IF;
    RETURN NEW;
  END IF;
  IF NEW.parent_tenant_id IS NULL THEN RAISE EXCEPTION '% exige parent_tenant_id', NEW.tenant_type; END IF;
  SELECT tenant_type INTO parent_type FROM public.tenants WHERE id=NEW.parent_tenant_id;
  IF NEW.tenant_type='agency' AND parent_type<>'platform' THEN RAISE EXCEPTION 'agency deve pender de platform'; END IF;
  IF NEW.tenant_type='store'  AND parent_type<>'agency'   THEN RAISE EXCEPTION 'store deve pender de agency'; END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_validate_tenant_hierarchy ON public.tenants;
CREATE TRIGGER trg_validate_tenant_hierarchy
  BEFORE INSERT OR UPDATE OF tenant_type, parent_tenant_id ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.validate_tenant_hierarchy();
```

> Ordem importa: criar trigger **depois** dos inserts/backfill (senão o backfill dispara validação antes da agência existir) — ou criar o trigger por último, como acima.

## Validação (output bruto obrigatório no PR)

```sql
-- estrutura
SELECT tenant_type, count(*) FROM public.tenants GROUP BY tenant_type ORDER BY 1;
-- esperado: platform=1, agency>=1, store=14(+)

-- nenhum órfão
SELECT count(*) AS orfaos FROM public.tenants
WHERE tenant_type='store' AND parent_tenant_id IS NULL;  -- esperado: 0

-- árvore
SELECT p.tenant_type parent_type, t.tenant_type child_type, count(*)
FROM public.tenants t LEFT JOIN public.tenants p ON p.id=t.parent_tenant_id
GROUP BY 1,2 ORDER BY 1,2;

-- integridade: tentar inserir store órfã deve FALHAR (teste do trigger)
-- INSERT INTO tenants(name,slug,tenant_type) VALUES('x','x-test','store');  -- deve dar exceção
```

## Rollback

Aditivo → reverter é trivial e sem perda de dados de loja:
```sql
DROP TRIGGER IF EXISTS trg_validate_tenant_hierarchy ON public.tenants;
DROP FUNCTION IF EXISTS public.validate_tenant_hierarchy();
ALTER TABLE public.tenants DROP COLUMN IF EXISTS parent_tenant_id;
ALTER TABLE public.tenants DROP COLUMN IF EXISTS tenant_type;
-- (os 2 nós platform/agency ficam como tenants soltos; deletá-los é opcional e só se não tiverem dados)
```

## Riscos & mitigações

| Risco | Mitigação |
|---|---|
| `tenant_type` default `'store'` marcar os nós platform/agency errado | Inserts 2 e 3 setam o tipo explicitamente; backfill exclui os 2 slugs. |
| Backfill pegar tenant de teste/lixo | Rodar `SELECT id,name,slug FROM tenants` antes e conferir os 14 na revisão. |
| App atual quebrar | Coluna nova é ignorada pelo código (`App.jsx`/`ConsoleV2` não a leem). Zero mudança de comportamento. |
| Conflito com QA em andamento (Karina session-18) | Fase 0 não toca dados de loja nem RLS; só adiciona coluna. Coordenar timing da aplicação. |
| Alguma RLS de subquery escalar já assumir 1 tenant/user | Fora de escopo da Fase 0 (é dívida G7, tratada na Fase 1). Fase 0 não altera RLS. |

## Fora de escopo (fases seguintes)

- RLS ciente de hierarquia (agência vê descendentes) → **Fase 1**.
- Papéis `platform_owner`/`agency_admin` → **Fase 1**.
- Portal de agência + editor de `tenant_modules` + fail-closed → **Fase 2**.
- White-label header/subdomínio → **Fase 3**.
- Catálogo de planos + assinatura Asaas R$ 149,99/loja + `custom_price` → **Fase 4**.
