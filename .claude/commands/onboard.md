---
description: Onboarding de novo cliente (gera SQL tenant+user, executa após aprovação)
---

# /onboard — Onboarding de cliente real

Cria tenant + user admin no Supabase para um novo cliente. **Destrutivo controlado**: gera SQL, mostra, exige aprovação textual antes de executar.

## Coleta de dados (perguntas obrigatórias)

Pergunte ao usuário, uma por vez ou em bloco:

1. **Nome da loja** (ex: "Pizza do Zé")
2. **Nome do dono / responsável** (ex: "José Silva")
3. **CNPJ** (formato livre — normalize para só números)
4. **E-mail do admin** (será o login no sistema)
5. **Plano** — escolha: `basic` | `pro` | `enterprise`
6. **Telefone do dono** (WhatsApp — formato `+55119...`)

Se algum campo vier vazio, pare e pergunte. Não invente valores.

## Validações antes de gerar SQL

- CNPJ: exatamente 14 dígitos numéricos depois de normalizar (`[^0-9]` removido). Se não bater, peça de novo.
- E-mail: contém `@` e domínio. Se inválido, peça de novo.
- Plano: estritamente uma das 3 opções acima.
- **Verifique se já existe**:
  ```sql
  SELECT id, name, cnpj FROM tenants WHERE cnpj = '<cnpj>' LIMIT 1;
  SELECT id, email FROM users WHERE email = '<email>' LIMIT 1;
  ```
  Se qualquer um retornar linha → ABORTE e mostre o existente. Não duplica.

## Geração do SQL

Mostre o bloco completo dentro de ```sql```, com placeholders explícitos. Exemplo:

```sql
-- 1. Criar tenant
INSERT INTO tenants (name, owner_name, cnpj, plan, phone, created_at)
VALUES ('Pizza do Zé', 'José Silva', '12345678000199', 'pro', '+5511999998888', NOW())
RETURNING id;

-- 2. Criar user admin (usar o id retornado acima)
INSERT INTO users (tenant_id, email, role, created_at)
VALUES ('<tenant_id_retornado>', 'jose@pizza.com', 'admin', NOW())
RETURNING id;
```

> **Atenção**: os nomes de coluna acima são exemplo. Antes de executar, faça `\d tenants` e `\d users` via `mcp__supabase__list_tables` para confirmar o schema real. Se houver colunas obrigatórias adicionais (ex: `slug`, `status`, `created_by`), inclua valores apropriados — e mostre na lista para o usuário aprovar.

## Confirmação

Pergunte explicitamente:

> Vou executar o SQL acima no Supabase do consult-delivery. Isso criará 1 tenant e 1 user.
> Digite **APROVAR ONBOARDING** para executar, ou qualquer outra coisa para cancelar.

Só execute se a resposta for **exatamente** `APROVAR ONBOARDING`.

## Execução

Use `mcp__supabase__execute_sql` em duas chamadas (precisamos do `tenant_id` retornado):

1. Primeira chamada: INSERT tenant + RETURNING id
2. Segunda chamada: INSERT user com o id capturado

Se a primeira falhar, **não execute a segunda**.

## Próximos passos manuais (mostrar ao final)

Após executar com sucesso, imprima checklist:

```
✓ Tenant criado: <tenant_id> — <nome>
✓ User admin criado: <user_id> — <email>

Próximos passos manuais:
- [ ] Configurar instância Evolution API para o número <telefone>
- [ ] Criar grupo WhatsApp "Consultoria - <nome>" e inserir o número oficial
- [ ] Cadastrar a loja iFood vinculada ao tenant (tabela `lojas`)
- [ ] Enviar e-mail de boas-vindas para <email> com link de primeiro acesso
- [ ] Configurar régua LARA inicial (Wélida aprova drafts)
- [ ] Cobrança mensal (plano <plano>) — criar no Asaas e linkar via tenant_billing
```

## Regras

- **Nunca execute sem `APROVAR ONBOARDING` literal.**
- Se schema das tabelas mudou desde este comando ser escrito (colunas renomeadas, novas NOT NULL), pare e peça ajuda — não tente adivinhar.
- Sem confirmação dobrada, nunca rode mais de 2 INSERTs em sequência.
- Nunca crie tenant duplicado por CNPJ ou user duplicado por email.
- Log de auditoria: ao final, insira linha em `audit_log` se existir:
  ```sql
  INSERT INTO audit_log (actor, action, resource, resource_id, metadata, created_at)
  VALUES ('claude-code:/onboard', 'tenant.create', 'tenants', '<tenant_id>',
          jsonb_build_object('plan', '<plano>', 'cnpj_last4', '<últimos 4 do cnpj>'), NOW());
  ```
