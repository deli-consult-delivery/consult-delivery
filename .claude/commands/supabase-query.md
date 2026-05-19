---
description: Executa SQL no Supabase via MCP (WRITE pede confirmação explícita)
argument-hint: <SQL — opcional, será pedido se vazio>
---

# /supabase-query — Query SQL no Supabase

Executa SQL no projeto Supabase via `mcp__supabase__execute_sql`.

## Tenant padrão

Quando a query envolver dados do consult-delivery e o usuário não especificar tenant, use:
```
9079bd4d-4df7-4023-90fb-d79c8ba7e900
```

Lembre o usuário do tenant ativo antes de executar.

## Argumentos

`$ARGUMENTS` contém o SQL.
- Se vazio: pergunte ao usuário qual query rodar.
- Se preenchido: trate como o SQL completo.

## Detecção de WRITE

Considere WRITE se o SQL (case-insensitive, ignorando comentários) contém qualquer um:
- `INSERT INTO`
- `UPDATE `
- `DELETE FROM`
- `DROP `
- `ALTER `
- `TRUNCATE `
- `CREATE ` (table/index/function)
- `GRANT ` / `REVOKE `

Resto é READ (`SELECT`, `EXPLAIN`, etc.).

## Fluxo

### Se READ
1. Mostre o SQL formatado (uma linha por cláusula).
2. Execute `mcp__supabase__execute_sql` direto.
3. Renderize resultado como tabela markdown (max 50 linhas; se mais, mostre 50 + total).

### Se WRITE
1. Mostre o SQL formatado dentro de um bloco ```sql.
2. Mostre **alvo**: tabela(s) afetada(s), tenant_id se presente.
3. Estime **escopo**: rode primeiro um `SELECT COUNT(*) FROM ... WHERE <mesma condição>` se possível, pra mostrar quantas linhas serão tocadas.
4. Pergunte **explicitamente**:
   > Esta query é WRITE e vai modificar `<alvo>`. Digite **SIM EXECUTAR** para confirmar, ou qualquer outra coisa para cancelar.
5. Só execute se a resposta for exatamente `SIM EXECUTAR`. Caso contrário, cancele e mostre "Query cancelada".

## Regras

- **Nunca execute WRITE sem confirmação textual `SIM EXECUTAR`.**
- Nunca rode `DROP DATABASE`, `DROP SCHEMA public`, ou `TRUNCATE` sem confirmação **dobrada** (peça o nome da tabela como verificação extra).
- Se o usuário pedir migration, prefira `mcp__supabase__apply_migration` e direcione para o subagente `cd-migration-creator`.
- Sempre mostre o SQL bruto antes de executar (mesmo READ) — auditabilidade.
- Resultado vazio: mostre "0 linhas".
- Em erro do MCP: mostre a mensagem bruta sem interpretar.
