# SPEC — Tenancy Fase 1b: lojas com consultoria ativa → tenants `store`

Status: **AGUARDANDO APROVAÇÃO DO WANDSON** (Passo 2). Nada aplicado.
Autor: sessão consult-delivery-22 | Data: 2026-07-01 | Projeto Supabase: `czyanilrverorwenikqw`

---

## GOAL

Cada uma das **16 lojas com `is_consultoria_ativa = true`** vira um tenant `tenant_type='store'`,
filho da agência **Consult Delivery** (`9079bd4d-4df7-4023-90fb-d79c8ba7e900`). A loja é vinculada
ao seu tenant, os dados dependentes que têm `loja_id` migram para o novo `tenant_id`, e o isolamento
por loja passa a valer — sem quebrar a visibilidade operacional da consultoria.

---

## ESTADO REAL (levantado ao vivo — output bruto)

### Hierarquia de tenants (Fase 0 aplicada e confirmada)
```
platform  Plataforma Consult Delivery  8bf3132d-…            parent=null
agency    Consult Delivery             9079bd4d-…            parent=8bf3132d  (2 membros)
store     Cliente Teste Sandbox        fd7d9eb9-…            parent=9079bd4d  (0 membros)
store     Karina Doceria               e9fdaa66-…            parent=9079bd4d  (3 membros)
```
Trigger `validate_tenant_hierarchy` ativo: `store` DEVE ter pai `agency`. ✔ nossos inserts respeitam.

### As 16 lojas ativas (todas `tenant_id = 9079bd4d`, `slug = NULL`)
| # | loja_id | nome |
|---|---------|------|
| 1 | 8434cea4-b9c8-41ea-b366-57e8398aad0b | Café Container *(piloto Consultor iFood)* |
| 2 | 4df6ce1c-8abc-4788-ada6-f4d2a1961d19 | CONSULTORIA - CARDOSO CHURRASCARIA |
| 3 | 47e34d2e-5fac-47f9-9afd-481179411409 | CONSULTORIA - Delícias Grill |
| 4 | c2d14f21-d8ab-46e9-bfd0-0107768a224d | CONSULTORIA - PANELADA DA TIA |
| 5 | f0fa34d0-601d-422e-b9a9-dd21bd1ba9ec | CONSULTORIA - PIAZZA |
| 6 | 70f38835-d505-4e31-9ca3-38a415bb7818 | CONSULTORIA - POPDI PIZZA 🚀 |
| 7 | fd1a4ac1-fabc-4359-8894-f3add7992a60 | CONSULTORIA - VARANDAS |
| 8 | daf35575-0376-4f36-8c28-62dfed2956d9 | CONSULTORIA - VILLAS CALDO - C. JARDIM |
| 9 | 2d178584-2a43-4fc8-a939-9d26f22debcc | CONSULTORIA - VILLAS CALDOS |
| 10 | 7706639b-2aa4-4e34-a207-b0498a5433aa | CONSULTORIA MIKELLY CONTAINER |
| 11 | bc2b56e2-9587-4efd-b034-82e88c9ac1c1 | CST -  CAFÉ COM PÃO |
| 12 | a6c1d121-b78d-47cd-bbc5-a3f4a738be06 | CST - JF ESPETARIA |
| 13 | 2d46d7b1-a0f5-4539-b2a2-d1d587d2ee76 | Mangiare Pizzaria - Forno a Lenha |
| 14 | 5899c79e-5cbe-4573-9927-1eb590a7dd4b | Pizzaria Lá Mazza |
| 15 | b1349cf5-a9ff-4096-8195-9115bcd20523 | Planet Pizza |
| 16 | 78d3760e-1fe9-4985-b890-546bb095d99e | Uraka Burger |

`lojas`: 1177 registros, todas `tenant_id = 9079bd4d`. **As 1161 não-ativas não são tocadas.**

### Mapeamento de dados dependentes

**Tabelas com `loja_id` E `tenant_id` (25). Linhas ligadas às 16 lojas (output bruto):**
| tabela | total | linhas nas 16 lojas | loja_id NULL |
|--------|------:|-------------------:|-------------:|
| radar_series | 150 | **150** | 0 |
| radar_metricas | 35 | **35** | 0 |
| avaliacoes_loja_config | 39 | **9** | 0 |
| radar_fontes | 7 | **7** | 0 |
| analises | 16 | **2** | 9 |
| loja_whatsapp_vinculo | 4 | **2** | 0 |
| whatsapp_groups | 70 | **1** | 68 |
| agent_drafts | 211 | 0 | 210 |
| breno_triagem | 215 | 0 | 196 |
| chat_tasks | 226 | 0 | 226 |
| whatsapp_contacts | 156 | 0 | 156 |
| (demais 14 tabelas) | ~ | 0 | — |

→ **~206 linhas** realmente ligadas às 16 lojas, em **7 tabelas**. Migração pequena.
As linhas com `loja_id NULL` **não** são migradas (não pertencem a nenhuma loja específica).

**⚠️ Tabelas citadas na tarefa que NÃO têm `loja_id` (só `tenant_id`) — não migram por loja:**
| tabela | total | na agência | chave de loja |
|--------|------:|-----------:|---------------|
| atendimento_avaliacoes | 411 | 46 | `conversation_id` / `contact_identifier` |
| nps_avaliacoes | 48 | 45 | `contact_identifier` |
| cobrancas | 2318 | 2318 | `cliente_id` (Asaas) |

Não existe FK direta loja↔registro nessas tabelas. **Ficam na agência** nesta fase → ver Decisão B.

### Modelo de RLS (crítico para isolamento)
Padrão em **184 policies**: `tenant_id IN (SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid())`
(e helper `is_member_of(tenant_id)`). **É flat — não desce a hierarquia.** Consequência:
mover `tenant_id` de uma loja para o store tenant faz a **agência perder acesso** àquele dado,
a menos que os membros da agência sejam também membros do store. → ver Decisão A.

Constraints relevantes: `tenants.slug` UNIQUE; `tenant_members` PK `(tenant_id,user_id)`;
`lojas` só tem `tenant_id` (não há `store_tenant_id`).

---

## DECISÕES ABERTAS (precisam do `ok` do Wandson)

**Decisão A — visibilidade da consultoria após isolar (RECOMENDADO: copiar membros).**
A CD é a consultoria que opera essas 16 lojas; precisa continuar vendo tudo.
- **A1 (recomendado):** copiar os 2 membros da agência para cada store (`tenant_members`, ON CONFLICT DO NOTHING). Mantém a agência vendo tudo, o lojista (membro só do seu store) vê só o dele, loja A não vê loja B. **Zero alteração nas 184 policies.**
- A2: RLS hierárquica (`has_tenant_access` = membro do tenant OU de ancestral) reescrevendo 184 policies. Correto a longo prazo, mas alto risco → **fica para Fase 1c**, não nesta.

**Decisão B — tabelas tenant-only (cobrancas/atendimento/nps).** Sem `loja_id`, não dá para fatiar por loja com segurança agora. Recomendo **deixá-las na agência** e tratar a vinculação loja↔cobrança/atendimento numa Fase 1c dedicada (mapear `cliente_id`/`contact_identifier` → loja). Confirmar.

**Decisão C — esquema de slug do store.** `slugify(nome)` + sufixo dos 8 primeiros chars do `loja_id` (garante unicidade; há dois "VILLAS CALDOS"). Ex.: `consultoria-piazza-f0fa34d0`. Confirmar formato.

**Decisão D — reconciliar "Karina Doceria".** Já é `store` com 3 membros, mas **não** está entre as 16 lojas ativas nem tem `loja_id` vinculado. Fora do escopo desta migração; só sinalizado.

---

## PLANO DE MIGRAÇÃO (aplicar só após `ok` — Passo 3)

Arquivo único: `supabase/migrations/20260701_010_tenancy_fase1b_lojas_store.sql`.
Idempotente (IF NOT EXISTS / ON CONFLICT / derivação determinística por `loja_id`).

```sql
BEGIN;

-- 0) vínculo loja -> store tenant (não-destrutivo; lojas.tenant_id permanece = agência)
ALTER TABLE public.lojas ADD COLUMN IF NOT EXISTS store_tenant_id uuid REFERENCES public.tenants(id);

-- slugify determinístico (minúsculo, sem acento, não-alnum -> '-', colapsa, apara)
CREATE OR REPLACE FUNCTION public._slugify(txt text) RETURNS text AS $$
  SELECT trim(both '-' from regexp_replace(
           lower(unaccent(coalesce(txt,''))), '[^a-z0-9]+', '-', 'g'));
$$ LANGUAGE sql IMMUTABLE;  -- requer extensão unaccent (CREATE EXTENSION IF NOT EXISTS unaccent;)

-- 1) criar 1 tenant store por loja ativa + vincular (idempotente por slug determinístico)
DO $$
DECLARE r record; v_slug text; v_tid uuid;
BEGIN
  FOR r IN SELECT id, nome FROM public.lojas WHERE is_consultoria_ativa = true LOOP
    v_slug := left(public._slugify(r.nome),40) || '-' || left(r.id::text,8);
    -- cria só se ainda não existe store para esta loja
    SELECT store_tenant_id INTO v_tid FROM public.lojas WHERE id = r.id;
    IF v_tid IS NULL THEN
      INSERT INTO public.tenants (name, slug, tenant_type, parent_tenant_id)
      VALUES (r.nome, v_slug, 'store', '9079bd4d-4df7-4023-90fb-d79c8ba7e900')
      ON CONFLICT (slug) DO UPDATE SET slug = EXCLUDED.slug  -- no-op p/ retornar id
      RETURNING id INTO v_tid;
      UPDATE public.lojas SET store_tenant_id = v_tid WHERE id = r.id;
    END IF;
  END LOOP;
END $$;

-- 2) migrar dados dependentes: toda tabela com loja_id+tenant_id, só linhas das 16 lojas
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT c1.table_name FROM information_schema.columns c1
           JOIN information_schema.columns c2
             ON c1.table_name=c2.table_name AND c1.table_schema=c2.table_schema
           WHERE c1.table_schema='public' AND c1.column_name='loja_id'
             AND c2.column_name='tenant_id' LOOP
    EXECUTE format(
      'UPDATE public.%I d SET tenant_id = l.store_tenant_id
         FROM public.lojas l
        WHERE d.loja_id = l.id AND l.is_consultoria_ativa = true
          AND l.store_tenant_id IS NOT NULL
          AND d.tenant_id = ''9079bd4d-4df7-4023-90fb-d79c8ba7e900''', t);
  END LOOP;
END $$;

-- 3) Decisão A1: copiar membros da agência para cada store (mantém visibilidade da consultoria)
INSERT INTO public.tenant_members (tenant_id, user_id, role)
SELECT l.store_tenant_id, m.user_id, m.role
FROM public.tenant_members m
JOIN public.lojas l ON l.is_consultoria_ativa = true AND l.store_tenant_id IS NOT NULL
WHERE m.tenant_id = '9079bd4d-4df7-4023-90fb-d79c8ba7e900'
ON CONFLICT (tenant_id, user_id) DO NOTHING;

COMMIT;
```

### Validação (output bruto obrigatório após aplicar)
```sql
-- 16 stores criados sob a agência
SELECT count(*) FROM tenants WHERE tenant_type='store' AND parent_tenant_id='9079bd4d-4df7-4023-90fb-d79c8ba7e900';  -- espera >=16 (16 + sandbox + karina = 18)
-- toda loja ativa vinculada
SELECT count(*) FROM lojas WHERE is_consultoria_ativa AND store_tenant_id IS NULL;  -- espera 0
-- nenhum dado das 16 lojas ficou na agência
SELECT count(*) FROM radar_series rs JOIN lojas l ON l.id=rs.loja_id
 WHERE l.is_consultoria_ativa AND rs.tenant_id='9079bd4d-4df7-4023-90fb-d79c8ba7e900';  -- espera 0
-- nenhuma das 1161 não-ativas foi tocada
SELECT count(*) FROM lojas WHERE NOT is_consultoria_ativa AND store_tenant_id IS NOT NULL;  -- espera 0
```

### Teste de isolamento RLS (obrigatório)
Simular dois usuários com `set local role authenticated` + `request.jwt.claims`/`auth.uid()`:
1. Membro só do store da **loja A**: `SELECT` em `radar_series` retorna só linhas da loja A; retorna **0** da loja B.
2. Membro da **agência** (após A1): vê linhas de todas as 16 lojas.
3. Um `avaliacoes`/`radar_series` da loja B **não** aparece para o membro-loja-A.
Rodar com `EXECUTE ... AS` via função SECURITY DEFINER de teste ou set `role`/`request.jwt.claim.sub`, com output bruto das contagens.

### Rollback (reversível)
```sql
BEGIN;
-- devolve dados dependentes à agência
DO $$ DECLARE t text; BEGIN
  FOR t IN SELECT c1.table_name FROM information_schema.columns c1
    JOIN information_schema.columns c2 ON c1.table_name=c2.table_name AND c1.table_schema=c2.table_schema
    WHERE c1.table_schema='public' AND c1.column_name='loja_id' AND c2.column_name='tenant_id' LOOP
    EXECUTE format('UPDATE public.%I d SET tenant_id=''9079bd4d-4df7-4023-90fb-d79c8ba7e900''
       FROM public.lojas l WHERE d.loja_id=l.id AND l.store_tenant_id IS NOT NULL
         AND d.tenant_id=l.store_tenant_id', t);
  END LOOP; END $$;
-- remove membros copiados e os stores
DELETE FROM tenant_members tm USING lojas l
 WHERE tm.tenant_id=l.store_tenant_id AND l.is_consultoria_ativa;
DELETE FROM tenants t USING lojas l WHERE t.id=l.store_tenant_id AND l.is_consultoria_ativa;
UPDATE lojas SET store_tenant_id=NULL WHERE is_consultoria_ativa;
ALTER TABLE lojas DROP COLUMN IF EXISTS store_tenant_id;
DROP FUNCTION IF EXISTS public._slugify(text);
COMMIT;
```
Backup antes: `SELECT id, loja_id, tenant_id INTO backup schema` das 7 tabelas afetadas (ou `pg_dump` das linhas) — anexar no PR.

---

## QUALITY BAR
- [ ] SQL aplica sem erro (1 arquivo, output bruto de cada passo)
- [ ] 16 lojas ativas viram `store` com `parent_tenant_id = 9079bd4d`; trigger de hierarquia respeitado
- [ ] `lojas.store_tenant_id` preenchido para as 16; `lojas.tenant_id` das 1177 intocado
- [ ] dados com `loja_id` das 16 lojas migrados (0 remanescente na agência nas 7 tabelas)
- [ ] nenhuma das 1161 lojas não-ativas afetada (`store_tenant_id` NULL nelas)
- [ ] teste de isolamento passa com output bruto (loja A não vê B; lojista só o próprio; agência vê tudo)
- [ ] rollback testado (ou documentado + backup anexado)

## Fora de escopo (Fase 1c)
- Vincular `cobrancas`/`atendimento_avaliacoes`/`nps_avaliacoes` (sem `loja_id`) a lojas.
- RLS hierárquica (has_tenant_access) substituindo a cópia de membros.
- Onboarding de usuários lojistas (membros dos stores).
