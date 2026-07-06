# Decisão: scheduler por-tenant (TD#44/#57)

**Status:** proposta + PoC — decisão final é do Wandson.
**Contexto:** `docs/deli-memory/tech-debts/td-index.md` TD#44/#57.

---

## Problema

Schedules hoje são cron fixo, globais, definidos no código (`schedules.task({ cron: "..." })`)
— todos os tenants disparam no mesmo horário UTC. Vários já têm (ou deveriam
ter) configuração de horário **por tenant** que não é respeitada:

- `bom_dia_config.hora_semana`/`hora_sabado` — existem no schema, são lidas
  só para log (`trigger/bom-dia/envio-agendado.ts:111-116`), nunca mudam o
  horário real de disparo (TD#44).
- Mesma limitação se aplica, em potencial, a `encerramento` (mesmo padrão de
  2 schedules semana/sábado), `gestor-coleta-diaria` (22h fixo pra todas as
  16 lojas), `cora-regua-diaria`, `lara-editorial-schedule`.

TD#57 registrava a premissa "Trigger.dev v3 não suporta schedule dinâmica por
tenant" como bloqueio arquitetural. **Essa premissa está desatualizada** — a
stack já está em v4.4.6 (decisão D2), que tem API de schedules dinâmicos.

## Mapeamento dos schedules atuais

Levantamento via `grep -rn "schedules.task" trigger/ --include=*.ts` (output
bruto completo no PR) — 33 schedules ativos + 4 comentados (`multicanal/*`,
desativados). Tabela com os candidatos reais a horário por-tenant (os
demais — heartbeat, backup, monitor de conversas, sync financeiro, etc. — são
infra/operação cross-tenant, não fazem sentido por-tenant):

| Task (`id`) | Cron atual | Por-tenant? | Por quê |
|---|---|---|---|
| `bom-dia-envio-agendado-semana` / `-sabado` | `0 12 * * 1-5` / `0 11 * * 6` | **Sim** | `bom_dia_config.hora_semana/sabado` já existe e não é respeitada (TD#44, a origem deste doc) |
| `bom-dia-schedule-weekday` / `-sabado` (gerar-imagem) | `55 11 * * 1-5` / `55 10 * * 6` | Sim (acoplado ao par acima) | gera a imagem ~1h antes do envio — precisa mover junto se o horário virar configurável |
| `encerramento-envio-agendado-semana` / `-sabado` | `0 21 * * 1-5` / `0 15 * * 6` | Provável | mesmo padrão do bom-dia (mensagem de fechamento), sem coluna de horário hoje |
| `gestor-coleta-diaria` | cron por objeto (ver código) — 22h BRT pra todas as 16 lojas | Provável | memória do projeto registra isso como fixo pra todo mundo; lojas em fusos/operação diferentes poderiam querer outro horário |
| `cora-regua-diaria` | `0 12 * * *` | Talvez | régua de cobrança — horário de contato pode ser sensível por tenant/mercado |
| `lara-editorial-schedule` | `0 12 * * 1,3,5` | Talvez | conteúdo editorial — menos urgente que os acima |
| `lara-csat-reengajamento-schedule` | `0 14 * * *` | **Já resolvido** | já roda como "1 cron + task de negócio com `tenant_id` opcional" (PR #775/#781) — é literalmente a Opção B abaixo, funcionando em produção; usei esse padrão como precedente pro PoC |

Demais 26 schedules (`heartbeat-runner`, `backup-supabase-diario`,
`deli-orchestrator-5min`, `monitor-conversas-15min`, `asaas-sync-*`,
`radar-*`, `multicanal-processar`, `analise-loja-processar`,
`cardapio-processar`, `defesa-vigia`, `estudio-gerar`, `sofia-prospect`,
`onboarding-verificar-marcos`, `breno-*`, `vera-*`, etc.) são polling/infra
cross-tenant (rodam a cada N minutos varrendo todos os tenants de qualquer
forma) — não têm um "horário do tenant" a respeitar, ficam fora de escopo.

## Pesquisa: API oficial de schedules dinâmicos (Trigger.dev v4, via context7 — não de memória)

Fonte: `context7 /websites/trigger_dev` (`docs/tasks/scheduled`,
`docs/management/schedules/create`, `docs/management/schedules/delete`).

- `schedules.create({ task, cron, timezone?, externalId?, deduplicationKey })`
  — cria uma schedule **imperativa** (runtime), anexada a uma
  `schedules.task()` já declarada no código. `externalId` = ex. `tenant_id`;
  `deduplicationKey` único por `(tenant, feature)` evita duplicar ao
  re-chamar `create` (2ª chamada com a mesma key **atualiza** em vez de
  duplicar).
- Dentro do `run()`, o `payload` da task recebe `payload.externalId`,
  `payload.scheduleId`, `payload.timestamp`, `payload.timezone`,
  `payload.upcoming` — dá pra buscar o tenant certo com `externalId`.
- `schedules.del(scheduleId)` remove. Existe API REST equivalente
  (`POST/DELETE /api/v1/schedules`) pro management fora do runtime.
- **Limites por tier** (fonte: `docs/llms-full.txt` via context7): **Free =
  10 schedules/projeto, Hobby = 100, Pro = 1.000+** (bundles extras de 1.000
  a US$10/mês no Pro). Isso é por **ambiente** (dev/staging/prod contam
  separado) — não achei confirmação explícita se é por-ambiente ou por-projeto-total
  na doc consultada; tratar como **por ambiente** é a leitura conservadora.

## Opções

### A — Schedules dinâmicos nativos do Trigger.dev v4 (1 schedule por tenant×feature)

`schedules.create()` no onboarding do tenant (ou quando ele configura o
horário no Console), 1 schedule por `(tenant_id, feature)`.

- ✅ Precisão de minuto, sem lag de polling; usa a infra de scheduling do
  próprio Trigger.dev (retry, observability, dashboard nativo).
- ✅ Menor mudança de código — a lógica de negócio (`enviarBomDia` etc.)
  quase não muda, só troca "1 cron fixo" por "N schedules criadas/atualizadas".
- ❌ **Custo escala com tenants**: hoje ~14-16 lojas ativas; se cada uma
  tiver 3-4 features com horário próprio (bom-dia, encerramento, coleta,
  cora) já são ~50-64 schedules só disso, **além** dos ~30 schedules de
  infra já existentes. Em modelo de revenda (`docs/tenancy-*.md`,
  potencialmente centenas de lojas), passa de 1.000 (limite Pro incluído)
  rápido — custo real de US$10/mês por bundle extra de 1.000.
- ❌ **Ciclo de vida a gerenciar**: criar ao habilitar, atualizar ao mudar
  horário, deletar ao desabilitar/encerrar tenant — mais um lugar pra
  divergir (schedule órfã se o cleanup falhar) e mais uma tabela de
  correlação `tenant_id/feature → scheduleId` pra manter em sincronia com
  `bom_dia_config`/equivalentes.

### B — Task única + cron fino + fan-out lendo config (RECOMENDADA)

1 `schedules.task` com cron fino (ex. `*/15 * * * *`), que a cada tick lê a
tabela de config (por tenant) e processa só quem está dentro da própria
janela de horário — exatamente o padrão já em produção em
`lara-csat-reengajamento` (task de negócio separada da schedule, aceita
`tenant_id` opcional, roda em fan-out).

- ✅ **Custo zero adicional em schedules do Trigger.dev** — sempre 1 schedule
  por feature, não importa se são 16 tenants ou 1.600.
  Sem exposição a limite de plano.
- ✅ **Sem ciclo de vida a gerenciar** — não cria/deleta nada em runtime, só lê
  config de uma tabela (mesmo modelo de `bom_dia_config.auto_send` que já
  existe hoje).
  Reaproveita 100% o padrão de auditoria/observability já usado
  (`logAgentRun`, `agent_runs`) — nenhuma peça nova no stack de scheduling.
- ✅ **Baixo risco de cutover**: dá pra rodar em paralelo com o schedule
  fixo atual (como este PoC faz) antes de decidir desligar o antigo.
- ❌ Precisão limitada ao passo do cron (15 min → o envio pode atrasar até
  ~14min do horário exato configurado). Aceitável para bom-dia/encerramento
  (mensagens de saudação, não têm SLA de segundo); pode não servir para algo
  como um lembrete de reunião com hora exata.
- ❌ Mais 1 tenant = mais 1 linha varrida a cada tick — em volume muito alto
  (milhares de tenants) o próprio `SELECT` + loop dentro da task pode
  precisar de paginação/`limit` (mesmo ajuste que `lara-csat-reengajamento`
  já fez pro problema de starvation, PR #781 — solução conhecida).

### C — Supabase `pg_cron` + HTTP por tenant

Cron dentro do Postgres (`pg_cron`) chama um endpoint HTTP (Bridge ou Edge
Function) por tenant no horário configurado.

- ✅ Não consome schedules do Trigger.dev (mesma vantagem de custo da B).
- ❌ **Duplica a infraestrutura de agendamento**: hoje TUDO passa por
  Trigger.dev (retry automático, `agent_runs`, dashboard unificado); `pg_cron`
  seria um segundo sistema de scheduling, com seu próprio retry/observability
  a construir do zero — mais superfície, menos consistência com o resto do
  repo.
- ❌ `pg_cron` também é cron fixo — pra ser por-tenant, ainda precisaria de N
  jobs (1 por tenant) ou do mesmo padrão de fan-out da Opção B, só que rodando
  em Postgres em vez de Trigger.dev. Não resolve nada que a B não resolva,
  só move a complexidade pra outro lugar.

## Recomendação

**Opção B** — task única + cron fino + fan-out lendo config por tenant.

Motivos, em ordem de peso:
1. **Já é o padrão que o time acabou de validar em produção** —
   `lara-csat-reengajamento` (PR #775/#781, testado ao vivo nesta sessão,
   ver `docs/fluxos/lara-regua-teste-prod-2026-07-06.md`) é literalmente essa
   arquitetura, funcionando, com dedup e fix de starvation já resolvidos.
   Reusar > reinventar.
2. **Custo previsível** — zero exposição ao limite de schedules/plano do
   Trigger.dev conforme o número de tenants cresce (modelo de revenda é
   plano declarado da empresa).
3. **Menor superfície nova** — nenhuma API de scheduling nova a aprender/
   manter (Opção A) nem sistema de cron paralelo (Opção C).

A precisão de ~15min (vs. minuto exato da Opção A) é a única desvantagem
real, e é aceitável para os casos identificados (bom-dia, encerramento,
coleta, régua) — nenhum tem requisito de horário ao segundo.

## PoC (neste PR, sem cutover)

- `trigger/_shared/tenant-window.ts` — função pura `estaNaJanela()` (+ teste
  `tenant-window.test.ts`, `npx tsx` — 0 rede, 0 I/O).
- `trigger/bom-dia/poc-scheduler-por-tenant.ts` — nova `schedules.task`
  (`bom-dia-poc-scheduler-por-tenant`, cron `*/15 * * * *`) que lê
  `bom_dia_config` (já existe, já tem `hora_semana`/`hora_sabado`) e loga
  quais tenants estariam "na janela" agora — **dry-run puro**: nenhuma
  escrita, nenhum envio, nenhuma chamada a Evolution/WhatsApp. Não substitui
  `bomDiaEnvioAgendadoSemana/Sabado` — aquelas continuam rodando cron fixo,
  intocadas.
- `supabase/migrations/20260707_002_tenant_schedule_config.sql` — tabela
  genérica `tenant_schedule_config` (tenant_id, feature, hora, dias_semana,
  ativo) pro **próximo passo** de generalizar a Opção B além do bom-dia
  (encerramento, gestor-coleta, cora-regua não têm coluna de horário
  dedicada hoje) — **NÃO aplicada** nesta sessão.

## O que falta pra ativar de verdade (fora do escopo desta tarefa)

1. Wandson decidir: Opção B confirmada, ou prefere A/C por algum motivo não
   antecipado aqui?
2. Se B confirmada: aplicar a migration 018 (ou decidir usar as colunas que
   já existem por feature, como `bom_dia_config`, sem tabela genérica).
3. Trocar o **dry-run** do PoC por lógica real (chamar `enviarBomDia`) — e só
   depois de rodar em paralelo por um tempo, desligar
   `bomDiaEnvioAgendadoSemana/Sabado` (cutover explícito, não implícito).
4. Deploy do Trigger.dev (gate — não feito nesta sessão).
5. Repetir o mesmo desenho pra `encerramento`/`gestor-coleta`/`cora-regua`
   se o Wandson quiser estender além do bom-dia.
