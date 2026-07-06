# Tenancy Fase 1c — APLICADA

Data: 2026-07-01
Migration: `supabase/migrations/20260701_011_tenancy_fase1c_loja_id_ref.sql`
Projeto Supabase: `czyanilrverorwenikqw`
Spec: `docs/tenancy-fase1c-lojas-dependentes-spec.md`

## 1. Aplicação da migration (output bruto)

```
mcp__claude_ai_Supabase__apply_migration
project_id: czyanilrverorwenikqw
name: 20260701_011_tenancy_fase1c_loja_id_ref
→ {"success":true}
```

## 2. Validação (a): colunas loja_id existem

```sql
SELECT table_name, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('cobrancas','atendimento_avaliacoes','nps_avaliacoes')
  AND column_name = 'loja_id'
ORDER BY table_name;
```

Output bruto:
```json
[
  {"table_name":"atendimento_avaliacoes","column_name":"loja_id","data_type":"uuid","is_nullable":"YES"},
  {"table_name":"cobrancas","column_name":"loja_id","data_type":"uuid","is_nullable":"YES"},
  {"table_name":"nps_avaliacoes","column_name":"loja_id","data_type":"uuid","is_nullable":"YES"}
]
```

✅ As 3 colunas existem, tipo `uuid`, nullable.

## 3. Validação (b): contagens por tenant_id idênticas ao spec (nenhum dado migrou)

```sql
SELECT 'cobrancas' AS tabela, tenant_id, count(*) AS n
FROM public.cobrancas GROUP BY tenant_id
UNION ALL
SELECT 'atendimento_avaliacoes', tenant_id, count(*)
FROM public.atendimento_avaliacoes GROUP BY tenant_id
UNION ALL
SELECT 'nps_avaliacoes', tenant_id, count(*)
FROM public.nps_avaliacoes GROUP BY tenant_id
ORDER BY tabela, tenant_id;
```

Output bruto:
```json
[
  {"tabela":"atendimento_avaliacoes","tenant_id":"9079bd4d-4df7-4023-90fb-d79c8ba7e900","n":46},
  {"tabela":"atendimento_avaliacoes","tenant_id":"e9fdaa66-cbe7-4dff-905b-afc4b10219ff","n":415},
  {"tabela":"cobrancas","tenant_id":"9079bd4d-4df7-4023-90fb-d79c8ba7e900","n":2319},
  {"tabela":"nps_avaliacoes","tenant_id":"9079bd4d-4df7-4023-90fb-d79c8ba7e900","n":45},
  {"tabela":"nps_avaliacoes","tenant_id":"e9fdaa66-cbe7-4dff-905b-afc4b10219ff","n":3}
]
```

Comparação com spec:
| Tabela | Esperado (spec) | Obtido | Match |
|---|---|---|---|
| cobrancas (agência 9079bd4d) | 2319 | 2319 | ✅ |
| atendimento_avaliacoes (Karina e9fdaa66) | 415 | 415 | ✅ |
| atendimento_avaliacoes (agência 9079bd4d) | 46 | 46 | ✅ |
| nps_avaliacoes (Karina e9fdaa66) | 3 | 3 | ✅ |
| nps_avaliacoes (agência 9079bd4d) | 45 | 45 | ✅ |

✅ Contagens idênticas ao spec — nenhuma linha teve `tenant_id` alterado pela migration.

## Validação extra: loja_id nasceu 100% NULL

```sql
SELECT 'cobrancas' AS tabela, count(*) FILTER (WHERE loja_id IS NOT NULL) AS com_loja_id, count(*) AS total
FROM public.cobrancas
UNION ALL
SELECT 'atendimento_avaliacoes', count(*) FILTER (WHERE loja_id IS NOT NULL), count(*)
FROM public.atendimento_avaliacoes
UNION ALL
SELECT 'nps_avaliacoes', count(*) FILTER (WHERE loja_id IS NOT NULL), count(*)
FROM public.nps_avaliacoes;
```

Output bruto:
```json
[
  {"tabela":"cobrancas","com_loja_id":0,"total":2319},
  {"tabela":"atendimento_avaliacoes","com_loja_id":0,"total":461},
  {"tabela":"nps_avaliacoes","com_loja_id":0,"total":48}
]
```

✅ `com_loja_id = 0` em todas as tabelas — confirma que a coluna nasceu NULL, roteamento adiado conforme decisão do Wandson.

## 4. Validação (c): Karina (e9fdaa66) segue isolada

```sql
SELECT count(*) AS cobrancas_karina
FROM public.cobrancas WHERE tenant_id = 'e9fdaa66-cbe7-4dff-905b-afc4b10219ff';
```

Output bruto:
```json
[{"cobrancas_karina":0}]
```

✅ Karina não tem nenhuma linha em `cobrancas` (cobranças ficam só na agência, por design — decisão 1 do spec). Suas contagens em `atendimento_avaliacoes` (415) e `nps_avaliacoes` (3) batem exatamente com o valor pré-migration, sem cruzamento com a agência.

## Conclusão

Migration Fase 1c aplicada com sucesso: SQL 100% aditivo/reversível, sem alteração de `tenant_id` de nenhuma linha, sem alteração de RLS. As 3 colunas `loja_id` existem, nullable, nasceram NULL, e o isolamento multi-tenant existente (Fase 1b) permanece intacto.
