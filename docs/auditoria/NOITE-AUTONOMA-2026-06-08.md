# Noite autônoma — 2026-06-08
**Mandato do Wandson:** construir a plataforma completa até a última fase do roadmap, sem perguntar nada. Ele confere de manhã.

## Regras que estou seguindo
- Sem perguntas, sem widgets. Decisões com default sensato, registradas aqui.
- SQL **apenas aditivo/reversível** (CREATE/ADD COLUMN/policies/índices). **PROIBIDO esta noite:** DELETE/limpeza (inclusive registros de teste), DROP, remoção destrutiva, rotação de credenciais, cobrança real no Asaas (só sandbox).
- Build verde antes de cada merge. Teste de isolamento RLS sempre que mexer em multi-tenant.

## Decisões tomadas (com motivo)

### D-N1 — RLS das 3 tabelas abertas (item 1 do Wandson)
`customer_groups`, `customer_group_members`, `tarefas_analise` tinham RLS ON sem policy (deny-all). **Todas vazias (0 linhas)** — risco zero. Decisão:
- `customer_groups` não tinha vínculo de tenant → **adicionei coluna `tenant_id`** (aditivo, sem backfill pois vazia) e scopei por `is_member_of`/`is_admin_of`.
- `customer_group_members` → scope via `customers.tenant_id` (join).
- `tarefas_analise` → scope via `analises.tenant_id` (join).
Migration `20260608_010`. **Pendência p/ Wandson:** se a feature de grupos de clientes for usada, popular `customer_groups.tenant_id` ao criar grupos (a UI/route do CRM precisa setar isso).

## Lista de revisão da manhã (ações que NÃO fiz por serem destrutivas/financeiras)
- [ ] **Limpar registros de teste** (tenant "Cliente Teste Sandbox" `fd7d9eb9`, assinatura sandbox, análises de teste) — deixei para você (DELETE proibido esta noite).
- [ ] **Migrations aplicadas sob mandato autônomo** (todas aditivas, isolamento provado) — revisar: `008` (analise_loja), `009` (skills_templates), `010` (rls tabelas abertas) + as desta noite listadas abaixo.
- [ ] **Cobrança Asaas real** — não disparei nenhuma; assinaturas reais continuam dependendo de você.
- [ ] **Rotação de credenciais** — não toquei.

## PRs da noite (atualizado ao longo do trabalho)
- RLS 3 tabelas + este log (em andamento).
