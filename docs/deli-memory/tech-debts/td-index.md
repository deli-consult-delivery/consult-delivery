# Tech Debts — Índice S1-G00 Reconhecimento
Plataforma Consult Delivery | Iniciado em 2026-05-24

> Este arquivo registra débitos técnicos encontrados durante o reconhecimento S1-G00.
> Numeração sequencial a partir do último TD conhecido (TD#35 fechado em onda-07).
> Para débitos fechados anteriores, ver docs/tech-debt/onda-07.md.

---

## Triagem 2026-07-05 — TD#36-55 (resumo)

Contexto: squash de migrations (PR #746), remoção de telas órfãs, RLS hierárquica (Rota B), tenancy multi-nível — muitos TDs abertos em maio já tinham sido resolvidos por trabalho subsequente sem fechar o registro. Triagem confirmou 20/20 com evidência (grep + SQL via Supabase MCP).

| TD | Status pós-triagem | Mudou? |
|----|---------------------|--------|
| #36 | ✅ FECHADO | confirmado, sem mudança |
| #37 | ✅ FECHADO | confirmado, sem mudança |
| #38 | 🔵 OBSERVAÇÃO | ainda vivo (0 runs novos) |
| #39 | 🔵 OBSERVAÇÃO | ainda vivo (0 runs novos) |
| #40 | ✅ FECHADO | confirmado, sem mudança |
| #41 | ✅ RESOLVIDO | confirmado, sem mudança |
| #42 | ✅ RESOLVIDO | **era ABERTO** → BRENO com 3.106 runs |
| #43 | ✅ RESOLVIDO | **era OBSERVAÇÃO** → exclusão de `deli` removida do código |
| #44 | 🟡 ABERTO | ainda vivo, duplica #57 |
| #45 | ✅ FECHADO | confirmado, sem mudança |
| #46 | ✅ CORRIGIDO | confirmado, sem mudança |
| #47 | ✅ RESOLVIDO | **era parcial** → helpers unificados |
| #48 | ✅ FECHADO | confirmado, sem mudança |
| #49 | ✅ RESOLVIDO | **era ABERTO** → seed aplicado (4 triggers, 35 approvals) |
| #50 | ✅ RESOLVIDO | **era ABERTO** → RBAC populado (16/202/5) |
| #51 | ✅ RESOLVIDO | **era OBSERVAÇÃO** → loja_metricas com 29 linhas |
| #52 | 🟡 PARCIAL | **era OBSERVAÇÃO** → timeline ativo, facts incipiente |
| #53 | ✅ FECHADO | **ação nesta sessão** → ANALYZE executado |
| #54 | 🟡 VIVO (reduzido) | 25→14 branches merged |
| #55 | 🔴 VIVO (piorou) | 23→471 branches unmerged |
| #57 | 🟡 ROADMAP | premissa (v3) desatualizada — stack já em v4.4.6 |

**Sem fixes de código nesta sessão**: todos os itens que estavam de fato ABERTOS e eram corrigíveis (#42, #43, #49, #50, #51) já tinham sido resolvidos por trabalho de outras sessões — só faltava atualizar o registro. Os que continuam ABERTOS (#44/#57) exigem decisão de arquitetura (scheduler dinâmico), não um fix pequeno. #54/#55 são limpeza de repositório (decisão, não código). Única ação executada: `ANALYZE` (#53).

---

## TD#36 — Schedulers BomDia + Encerramento com timeout
**Status:** ✅ FECHADO — fix/p0-td36-td40
**Descoberto em:** S1-G00 T1 (2026-05-24)
**Fechado em:** 2026-05-24
**Severidade:** Alta — envios automáticos falhando silenciosamente

**Sintoma:**
`bom-dia-scheduler` e `encerramento-scheduler` falham com:
```json
{"error": "The operation was aborted due to timeout"}
```
Última falha BomDia: 2026-05-23 11:01:25 UTC
Última falha Encerramento: 2026-05-23 15:02:40 UTC

**Root cause:**
Trigger.dev cloud → Bridge Server `POST /agents/{bom-dia|encerramento}/send-groups` com `AbortSignal.timeout(30_000)` (30s).
Bridge chama Evolution API `/message/sendMedia/{instance}` com 20s por grupo.
Evolution API lenta ou instável → timeout acumulado excede 30s → Trigger.dev cancela a task.

**Fix aplicado:**
`AbortSignal.timeout(30_000)` → `AbortSignal.timeout(120_000)` em:
- `trigger/bom-dia/envio-agendado.ts`
- `trigger/encerramento/envio-agendado.ts`

Ambas as tasks já tinham retry configurado (5 tentativas, backoff 30s→120s).

---

## TD#37 — /chat/ai sem logging em agent_runs
**Status:** ✅ FECHADO — PR #298 (2026-06-10)
**Descoberto em:** S1-G00 T1 (2026-05-24)
**Severidade:** Média — sem observabilidade de uso e custo

> **Fix aplicado (2026-06-10, sessão 31):** o `/chat/ai` já logava em `agent_runs` (`:620-631`), mas os ramos `/tarefa` (`:518`) e `/handoff` (`:552`) davam `return` **antes** desse bloco. Adicionado `supabaseInsert('agent_runs', {...}).catch(...)` não-bloqueante antes de cada `return` (`agent_id: chat-ai-tarefa` / `chat-ai-handoff`, `duration_ms` a partir do `_chatAiStart`). `node --check` OK.

**Sintoma:**
Endpoint `POST /chat/ai` do Bridge Server chama Anthropic API diretamente sem registrar em `agent_runs`.

**Root cause:**
Implementação síncrona direta (< 5s target). Não passou pelo padrão Trigger.dev.
Model: `claude-haiku-4-5-20251001`. Sem tracking de tokens, custo, ou volume.

**Impacto:** Impossível saber:
- Quantas chamadas DELI copilot por dia
- Custo da API da feature
- Quem usa (conversation_id recebido mas não logado)

**Sugestão de fix:**
- Adicionar `supabaseInsert('agent_runs', {...})` no final do handler /chat/ai
- Ou migrar para Trigger.dev task (mas viola requisito < 5s)
- Alternativa: tabela separada `chat_ai_logs` para não misturar com agent_runs

---

## TD#38 — loja-gpt sem runs nos últimos 2 dias (verificar)
**Status:** 🔵 OBSERVAÇÃO — CONFIRMADO AINDA VIVO (triagem 2026-07-05)
**Descoberto em:** S1-G00 T1 (2026-05-24)

loja-gpt é on-demand. Última run: 2026-05-22 20:15 UTC (**mesma data 44 dias depois** — `SELECT max(created_at) FROM agent_runs WHERE agent_id ilike '%loja-gpt%'` retornou o mesmo timestamp, total=7 runs, nenhum novo).
Feature dormente confirmada. **Recomendação:** decidir com Wandson se descontinua (remover de `agents`/UI) ou reativa divulgação para consultores.

---

## TD#39 — cora com apenas 1 run em 9 dias (POC)
**Status:** 🔵 OBSERVAÇÃO — CONFIRMADO AINDA VIVO (triagem 2026-07-05)
**Descoberto em:** S1-G00 T1 (2026-05-24)

CORA continua com **exatamente 1 run** (2026-05-15, mesmo registro 51 dias depois). Disparada por webhook Asaas PAYMENT_OVERDUE.
POC nunca saiu do papel. **Recomendação:** decidir com Wandson — arquivar CORA (`tenant_agents`/status) ou retomar como track ativa.

---

---

## TD#40 — BRENO processar-webhook usa coluna errada no banco
**Status:** ✅ FECHADO — fix/p0-td36-td40
**Descoberto em:** S1-G00 T2 (2026-05-24)
**Fechado em:** 2026-05-24
**Severidade:** Alta — BRENO nunca lê configuração real do banco

**Sintoma:**
`trigger/breno/processar-webhook.ts` linha ~110 faz:
```ts
.eq("agent_slug", "breno")
```
Coluna real em `tenant_agent_config`: **`agent_id`** (não `agent_slug`).
Resultado: query sempre retorna `null`, modo defaulta para `"hibrido"` sem ler DB.

**Root cause:** Nome de coluna errado no código — provavelmente mudança de schema posterior à escrita da task.

**Fix aplicado:**
`.eq("agent_slug", "breno")` → `.eq("agent_id", "breno")` em `trigger/breno/processar-webhook.ts`.
Confirmado via SQL: `tenant_agent_config` tem coluna `agent_id`, não `agent_slug`.

---

## TD#41 — ChatScreen tem /tarefa e /handoff sem handler no Bridge
**Status:** ✅ RESOLVIDO (2026-06-10, sessão 32, PR #302 `3ddc589`)
**Descoberto em:** S1-G00 T2 (2026-05-24)
**Severidade:** Média — UI mostra comandos não funcionais

**Sintoma (original):**
`src/screens/ChatScreen.jsx` declara AI_COMMANDS incluindo `/tarefa` e `/handoff`, mas o front nunca os enviava ao Bridge — caíam num stub morto ("use o painel ao lado").

**Resolução (2 ondas):**
1. **Backend (TD#37, PR #298):** o Bridge `POST /chat/ai` já ganhou os handlers `/tarefa` (insere em `tarefas_loja`, status `rascunho`) e `/handoff` (insere `conversation_events` `event_type:transferred`), ambos auditados em `agent_runs`. Ver `bridge-server/index.js:518-589`.
2. **Frontend (TD#41, PR #302):** `ChatScreen.jsx` `runCommand()` agora captura o `freeText` do draft e faz POST autenticado a `/chat/ai` com `{command, prompt, messages.slice(-30), conversation_id, tenant_id}`, renderizando `data.title`+`data.bullets` (ou `data.error`). Stub morto removido.

**Validação:** contrato Bridge↔front conferido linha-a-linha; colunas confirmadas em prod (sem P1); deploy validado por string no bundle `index-H2PWXSLd.js` (`conversation_id:r,tenant_id`, `bullets||[]`).

---

## TD#42 — BRENO deployado no Trigger.dev? Nunca executou em produção
**Status:** ✅ RESOLVIDO (triagem 2026-07-05)
**Descoberto em:** S1-G00 T2 (2026-05-24)
**Severidade:** Média — feature planejada inoperante

**Evidência (SQL, 2026-07-05):** `agent_runs` tem **3.106 runs** com `agent_id ilike '%breno%'`. `tenant_agent_config` tem 1 linha para `agent_id='breno'` (habilitado). BRENO está deployado, rodando e configurado — provavelmente resolvido durante o trabalho de RBAC/tenancy (PRs #648/#647 mencionados no handoff da sessão anterior confirmam "consultor-ifood: skill + worker enviarResposta/runners" ativos, e o mesmo ciclo cobriu BRENO).

**Original (histórico, já não se aplica):** task existia em código mas 0 runs / 0 config.

---

## TD#43 — @deli em grupo capturada mas não invocada
**Status:** ✅ RESOLVIDO (triagem 2026-07-05)
**Descoberto em:** S1-G00 T2 (2026-05-24)
**Severidade:** Baixa — design intencional, mas limita DELI ativa

**Evidência:** `evolution-webhook/index.ts:577-578` hoje enfileira **qualquer** `mentionedAgent` (incluindo `deli`) via `enqueueAgentInvoke()` → Bridge `/analise`. A exclusão específica de `deli` mencionada no TD original não existe mais no código atual — não foi resolvido pela sugestão original (Realtime listener em `processed_by_deli`), e sim por uma mudança arquitetural que unificou o roteamento de todos os agentes mencionados.

**Ressalva:** `SELECT * FROM whatsapp_messages WHERE mentioned_agent='deli'` retorna **0 linhas** em produção — ninguém mencionou `@deli` em grupo ainda, então o caminho nunca foi exercitado de ponta a ponta. Mecanismo existe e está cabeado; validação E2E real pendente na primeira menção real.

---

## TD#44 — bom_dia_config.hora_semana/hora_sabado não consumidas pelo cron
**Status:** 🟡 ABERTO — CONFIRMADO AINDA VIVO (triagem 2026-07-05). Duplica TD#57 (mesmo root cause).
**Descoberto em:** S1-G00 T3 (2026-05-24)
**Severidade:** Média — UI pode dar falsa impressão de controle de horário

**Evidência (2026-07-05):** `trigger/bom-dia/envio-agendado.ts:111,116` — comentário explícito "hora_semana e hora_sabado são lidos para log/observabilidade" confirma que as colunas continuam decorativas, cron ainda fixo. Não é fix pequeno (exige scheduler dinâmico) — ver TD#57 para as opções de arquitetura.

**Sintoma:**
`bom_dia_config` tem colunas `hora_semana` (09:00) e `hora_sabado` (08:00).
Essas colunas NÃO são lidas pelo código de agendamento — os horários estão hardcoded no cron:
- `0 12 * * 1-5` (12:00 UTC = 09:00 BRT)
- `0 11 * * 6` (11:00 UTC = 08:00 BRT)

**Root cause:** Colunas criadas para uma feature de horário configurável que nunca foi implementada.

**Impacto:** Alterar `hora_semana` no banco ou via UI não muda o horário real de disparo.

**Fix:** Implementar leitura de `bom_dia_config.hora_semana/hora_sabado` no cron dinâmico
OU documentar que as colunas são decorativas e remover da UI.

---

## TD#45 — BomDia tem 4 schedule tasks (design dual-scheduler não documentado)
**Status:** ✅ FECHADO — PR #298 (2026-06-10)
**Descoberto em:** S1-G00 T3 (2026-05-24)
**Severidade:** Baixa — funciona, mas pode causar confusão em manutenção

> **Fix aplicado (2026-06-10, sessão 31):** comentário em `trigger/bom-dia/gerar-imagem.ts` acima de `bomDiaScheduleWeekday/Sabado` explicando que são **cache-warming** (geram a imagem ~5min antes), NÃO duplicata do envio real — o envio é feito pelos schedulers de `trigger/bom-dia/envio-agendado.ts`. Headers de seção renomeados "Agendamento" → "Cache-warming".

**Sintoma:**
BomDia tem 4 schedule tasks no Trigger.dev:
- `bom-dia-schedule-weekday` (11:55 UTC, `gerar-imagem.ts`) — só gera imagem
- `bom-dia-schedule-sabado` (10:55 UTC, `gerar-imagem.ts`) — só gera imagem  
- `bom-dia-envio-agendado-semana` (12:00 UTC, `envio-agendado.ts`) — gera + envia
- `bom-dia-envio-agendado-sabado` (11:00 UTC, `envio-agendado.ts`) — gera + envia

Design intent: pré-geração 5min antes do envio. Não está documentado em nenhum arquivo.
Encerramento tem apenas 2 tasks (sem pré-geração).

**Fix:** Documentar o design dual-scheduler em `docs/` ou em comentário de código.

---

## TD#46 — agents-state.md incorretamente lista HeyGen como engine de BomDia
**Status:** ✅ CORRIGIDO NO ARQUIVO T1
**Descoberto em:** S1-G00 T3 (2026-05-24)
**Severidade:** Baixa — erro documental, não funcional

agents-state.md linha 121 dizia: `geração de imagem HeyGen`
Engine real: OpenRouter API / Recraft V4.1 Utility
Fix aplicado: linha corrigida em agents-state.md durante S1-G00 T3.

---

## TD#47 — Encerramento sem withOverloadedRetry para Recraft
**Status:** ✅ FECHADO (parcial) — fix/p0-td36-td40
**Descoberto em:** S1-G00 T3 (2026-05-24)
**Fechado em:** 2026-05-24
**Severidade:** Baixa — inconsistência entre BomDia e Encerramento

`trigger/encerramento/gerar-imagem.ts` usa `withOverloadedRetry()` para chamadas Claude (529),
mas NÃO usa retry equivalente para chamadas Recraft V4.1 via OpenRouter.
`trigger/bom-dia/gerar-imagem.ts` usa retry manual (3 tentativas, delay 3s) para Recraft,
mas NÃO tem `withOverloadedRetry()` para Claude.

**Fix aplicado (scheduler layer):**
Ambas as tasks de envio (`envio-agendado.ts`) já tinham `retry: { maxAttempts: 5, minTimeoutInMs: 30_000, maxTimeoutInMs: 120_000, factor: 2 }` idêntico — retry no scheduler está consistente.

**Pendente (gerar-imagem layer):** Padronizar `withOverloadedRetry` / Recraft retry entre os dois `gerar-imagem.ts` files — deixar para próxima iteração.

> **Atualização (triagem 2026-07-05): ✅ RESOLVIDO.** Os dois `gerar-imagem.ts` (bom-dia e encerramento) hoje chamam o mesmo helper Recraft local (3 tentativas, `AbortSignal.timeout(180_000)`, código idêntico linha a linha) e o mesmo `chat()` compartilhado de `trigger/agents/llm-client.ts` para Claude. A assimetria original não existe mais — ambos passaram a usar os mesmos caminhos de código. Gap remanescente: **nenhum dos dois** tem retry dedicado para erro 529 da Anthropic no `chat()` — mas isso agora é simétrico (não é mais uma inconsistência entre os dois arquivos), vira um TD novo se quiser tratar 529 explicitamente.

---

## TD#48 — BomDia: storage path diz 1920x1080 mas resolução real é 1820x1024
**Status:** ✅ FECHADO — PR #298 (2026-06-10)
**Descoberto em:** S1-G00 T3 / cd-validator-strict (2026-05-24)
**Severidade:** Baixa — arquivo funciona, mas metadata do nome é enganoso

> **Fix aplicado (2026-06-10, sessão 31):** `groupStoragePath`/`portraitStoragePath` em `gerar-imagem.ts:763-764` corrigidos para `feed-1820x1024.webp` / `story-1024x1820.webp`, casando com o `size` real em `:363`. `grep` confirmou serem as 2 únicas refs e que nenhum consumer dependia do nome antigo (sem migração de paths legados necessária).

**Sintoma:**
`trigger/bom-dia/gerar-imagem.ts` linha 363: `size = "1820x1024"` (para Recraft V4.1)
linha 763: path no Storage: `bom-dia/{date}-{pathId}-feed-1920x1080.webp` (nome errado)

Encerramento é consistente: usa `feed-1820x1024.webp` no path (sem discrepância).

**Root cause:** Cópia/rename errada durante desenvolvimento. Storage path não foi atualizado.

**Fix:** Corrigir o nome do path em `gerar-imagem.ts` para `feed-1820x1024.webp`.
Atenção: a mudança invalida URLs já no Storage — considerar migração de paths existentes ou manter legado.

---

---

## TD#49 — deli_triggers sem seed em produção — DELI sem regras de autonomia
**Status:** ✅ RESOLVIDO (triagem 2026-07-05)
**Descoberto em:** S1-G00 T4 (2026-05-24)
**Severidade:** Média — DELI opera sem regras Verde/Amarelo/Vermelho configuradas

**Evidência (SQL, 2026-07-05):** `deli_triggers` tem **4 linhas** (era 0). `deli_pending_approvals` tem **35 linhas** — fluxo de aprovação Verde/Amarelo/Vermelho está ativo e sendo usado. Seed foi executado em algum momento entre maio e julho.

**Sintoma:**
Tabela `deli_triggers` tem 0 rows. CLAUDE.md §16 lista triggers iniciais que deveriam existir:
- Verde: cliente sumiu 7 dias → notifica equipe
- Verde: mensagem recebida → atualizar client_timeline
- Amarelo: métrica caiu 20%+ → invocar analista-ifood
- Vermelho: mudança em config → aguardar APROVADO VERMELHO

Nenhum desses seeds foi inserido em produção.

**Root cause:** Seed foi planejado mas nunca executado. Migration criou schema, não dados.

**Impacto:** DELI funciona (10 runs, 91% sucesso) mas sem regras de autonomia — opera ad-hoc.
`deli_pending_approvals` também vazia: fluxo de aprovação verde/amarelo/vermelho não ativado.

**Fix:** Executar INSERT em `deli_triggers` com os triggers iniciais do CLAUDE.md §16.

---

## TD#50 — RBAC schema criado mas tabelas vazias — permissões não aplicadas via DB
**Status:** ✅ RESOLVIDO (triagem 2026-07-05)
**Descoberto em:** S1-G00 T4 (2026-05-24)
**Severidade:** Média — RequireRole no React pode não ter dados reais para validar

**Evidência (SQL, 2026-07-05):** `roles`=16 linhas, `role_permissions`=202 linhas, `user_roles`=5 linhas (eram 0/0/0). RBAC populado e em uso — condiz com o RBAC habilitado para tenant Karina Doceria mencionado no handoff anterior e com a Fase 1b/Rota B de tenancy concluída.

**Sintoma:**
`roles`, `role_permissions`, `user_roles` têm 0 rows.
Schema criado em migration `20260504_001_rbac.sql`. Dados nunca inseridos.

**Impacto:** Se RequireRole consulta estas tabelas para controle de acesso,
o RBAC pode estar operando sem dados → acesso possivelmente não restrito via DB.
(RequireRole pode usar claims do JWT ao invés do DB — verificar implementação.)

**Fix:** 1. Verificar se RequireRole usa JWT claims ou consulta DB.
        2. Se usa DB: inserir dados em `roles` e `role_permissions` conforme CLAUDE.md §13.

---

## TD#51 — loja_metricas sempre vazia — ingestão de métricas sem implementação
**Status:** ✅ RESOLVIDO (triagem 2026-07-05)
**Descoberto em:** S1-G00 T4 (2026-05-24)
**Severidade:** Baixa — não bloqueia operação atual

**Evidência (SQL, 2026-07-05):** `loja_metricas` tem **29 linhas** (era 0) — alguma task passou a popular a tabela. `vera_metricas_snapshot` continua em paralelo com 159 linhas.

**Sintoma:**
`loja_metricas` (17 cols, tenant_id presente) tem 0 rows.
CLAUDE.md §14 menciona: "snapshot diário de métricas (populado pelo n8n)".
n8n foi REMOVIDO da stack (CLAUDE.md §3: "N8N: NÃO USADO").

**Root cause:** Ingestão de métricas dependia do n8n que foi eliminado.
Tabela ficou órfã. VERA usa `vera_metricas_snapshot` (3 rows) como alternativa.

**Impacto:** Sem dados históricos de métricas por loja. Dashboards que consultam `loja_metricas` retornam vazio.

**Fix:** Criar task Trigger.dev para popular `loja_metricas` diariamente (substituindo n8n).

---

## TD#52 — client_facts e client_timeline vazios — Memória Central nunca usada
**Status:** 🟡 PARCIAL (triagem 2026-07-05) — melhorou, não plenamente adotado
**Descoberto em:** S1-G00 T4 (2026-05-24)
**Severidade:** Baixa — sistema de memória de agentes inoperante

**Evidência (SQL, 2026-07-05):** `client_timeline` tem **114 linhas** (era 0) — em uso ativo. `client_facts` tem apenas **2 linhas** (era 0) — mecanismo existe mas quase nenhum agente escreve fatos-chave ainda. **Recomendação:** decidir se vale expandir `client_facts` para mais agentes (DELI/VERA) ou se `client_timeline` sozinho já cobre a necessidade.

**Sintoma:**
`client_facts` e `client_timeline` têm 0 rows.
CLAUDE.md §14 define: "Agentes leem contexto ANTES de agir" e "Agentes registram fatos novos".
Nenhum agente ativo (VERA, DELI, analise-gerar-relatorio, BomDia) escreve nestas tabelas.

**Root cause:** Integração com Memória Central não foi implementada em nenhuma task Trigger.dev.
Agentes operam sem contexto persistente sobre lojas.

**Fix:** Adicionar `INSERT INTO client_facts` e `client_timeline` em agents relevantes (DELI, VERA, analise).

---

## TD#53 — pg_stat stale para múltiplas tabelas — rowcounts via monitoramento não confiáveis
**Status:** ✅ FECHADO (ação nesta sessão, 2026-07-05)
**Descoberto em:** S1-G00 T4 (2026-05-24)
**Severidade:** Baixa — afeta apenas observabilidade, não funcionalidade

**Ação aplicada:** `ANALYZE customers, analises, agents, whatsapp_groups, conversation_events;` executado via Supabase MCP em 2026-07-05. Confirmado depois: `pg_stat_user_tables.n_live_tup` agora bate com `COUNT(*)` real (customers 0→1172, whatsapp_groups 0→70, agents 5→26, analises 0→16, conversation_events 62→1844).
**Nota:** é uma correção pontual — sem autovacuum/ANALYZE periódico o stat volta a ficar stale. Se recorrer, considerar `pg_cron` semanal com `ANALYZE;`.

**Sintoma:**
`pg_stat_user_tables.n_live_tup` retorna 0 para tabelas que têm dados:
- `customers`: pg_stat=0, COUNT=1168 (discrepância de 1168 rows)
- `analises`: pg_stat=6, COUNT=15
- `agents`: pg_stat=5, COUNT=15
- `whatsapp_groups`: pg_stat=0, COUNT=69
- `conversation_events`: pg_stat=62, COUNT=1008

**Root cause:** PostgreSQL ANALYZE não foi executado recentemente em todas as tabelas.
`n_live_tup` só é atualizado após ANALYZE/autovacuum, não em tempo real.

**Fix:** Executar `ANALYZE;` periodicamente ou confiar em COUNT(*) ao invés de pg_stat para rowcounts precisos.

---

*Atualizado em: 2026-05-24 S1-G00 T3, T4, T5 | 2026-05-25 batch TDs P1 | 2026-06-10 sessão 31 (TD#37/#45/#48 fechados via PR #298) | 2026-07-05 triagem TD#36-55 (branch `wandson/td-triagem-2026-07`)*

---

## TD#57 — bom_dia_config: schedule dinâmica por-tenant não suportada pelo Trigger.dev v3
**Status:** 🟡 ROADMAP — premissa desatualizada (triagem 2026-07-05). Duplica TD#44 (mesmo sintoma).
**Descoberto em:** batch TDs P1 (2026-05-25)
**Severidade:** Baixa — schedule atual (fixo UTC) funciona; hora por-tenant é melhoria

**Atualização (2026-07-05):** `package.json` confirma `@trigger.dev/sdk: 4.4.6` — a stack já está na v4.4.5+ decidida em D2 (`docs/evonexus-replica/DECISAO-001-runtime-provider-custo.md`). A premissa original ("v3 não suporta") está desatualizada; falta reavaliar se `schedules.create()` dinâmico da v4 resolve o caso antes de escolher entre as opções A/B/C abaixo. **Recomendação:** não implementar agora — pesquisar suporte v4 a dynamic schedules na próxima vez que este TD for priorizado.

**Sintoma:**
`bom_dia_config` tem colunas `hora_semana` e `hora_sabado` por tenant, mas o scheduler usa
cron fixo `"0 12 * * 1-5"` / `"0 11 * * 6"` para todos os tenants.
Trigger.dev v3 não suporta schedules dinâmicas criadas em runtime — `schedules.task()` exige
cron estático na definição do task.

**Root cause:** Limitação arquitetural do Trigger.dev v3: `schedules.task()` aceita apenas
cron literal no código. Não há API para registrar schedules por-tenant dinamicamente.

**Impacto:** Todos os tenants disparam no mesmo horário (12h UTC = 09h BRT seg-sex, 11h UTC = 08h BRT sáb).
Columns `hora_semana` e `hora_sabado` são lidas e logadas, mas não respeitadas para alterar horário.

**Fix (roadmap):**
Opção A: Trigger.dev v4+ ou Inngest — avaliar suporte a dynamic schedules.
Opção B: Task única + cron de 15 em 15 min que verifica se cada tenant está dentro da janela configurada.
Opção C: Usar Supabase pg_cron com invocação via HTTP para cada tenant.

---

## TD#54 — 25 branches merged não removidos do remote
**Status:** 🟢 RESOLVIDO — triagem 2026-07-06 (brief `brief-85-branches-deadroute.md`): 30 branches squash-merged comprovadas (diff vazio contra `main` OU arquivos byte-idênticos ao `main` atual) deletadas do remote via `git push origin --delete`. Output bruto e lista completa em `~/.ao/briefs/report-85-branches.md`.
**Descoberto em:** S1-G00 T5 (2026-05-24)
**Severidade:** Baixa — higiene de repositório

**Evidência da resolução:** repo tinha 65 branches remotas (excluindo `main`/`gh-pages`) em 2026-07-06; nenhuma via `git branch -r --merged` (todo o fluxo é squash-merge, não fast-forward) — critério de segurança usado foi comparar o conteúdo dos arquivos alterados por cada branch contra o `main` atual. 30 identificadas como squash-merged e removidas; 0 falhas.
**Recomendação ainda pendente (fora do escopo desta triagem):** ativar "Auto-delete head branches" nas Settings do GitHub — resolve de raiz, evita a branch órfã se acumular de novo a cada PR squash-merged.

**Sintoma:**
`git branch -r --merged origin/main` retorna 25 branches além de main/gh-pages.
Todos já foram merged — não têm código pendente.

**Root cause:** Nenhum processo de cleanup pós-merge. GitHub não deleta automaticamente.

**Fix:** `git push origin --delete <branch>` para cada um dos 25. Lista completa em broken-inventory.md §1.1.
Ou ativar "Auto-delete head branches" nas Settings do GitHub repo.

---

## TD#55 — 23 branches unmerged potencialmente stale (lote 2026-05-15)
**Status:** 🟡 MUITO REDUZIDO — triagem 2026-07-06: **33 branches unmerged** (era 471 em 2026-07-05 — a maior parte já tinha sido resolvida entre uma triagem e outra pelo próprio fluxo de PRs squash-merge da noite/madrugada). As 33 restantes foram classificadas em 4 grupos com recomendação em `docs/deli-memory/tech-debts/td55-branches-triagem.md` — decisão final por grupo é do Wandson, nenhuma deletada nesta rodada (critério do brief: só delete automática com squash-merge comprovado).
**Descoberto em:** S1-G00 T5 (2026-05-24)
**Severidade:** Média → Baixa (volume caiu ~93%) — risco residual é só nos grupos B/C/D da triagem (código não incorporado, se existir)

**Evidência 2026-07-06:** `git branch -r --no-merged origin/main` (após excluir 30 squash-merged deletadas via TD#54) retorna 33 branches. Grupo A (4, sessões `claude/*` automáticas), Grupo B (8, stale >30 dias), Grupo C (6, sprint recente 11-17 dias), Grupo D (15, sprint da madrugada 07-06 sem PR aberto — várias com "gêmea" já squash-merged sob nome diferente). Detalhe completo e recomendação por branch em `td55-branches-triagem.md`.

**Sintoma:**
29 branches no remote não mergeados em main. Após excluir os 6 ativos da série piloto:
- 3 branches com ≥15 dias (wandson/chat-status-system, wandson/fix-sidebar-chat, wandson/lara-agente-regua) — definitivamente stale
- 20 branches do lote 2026-05-15 (v2-8 a v2-12, fix/*, feat/*, docs/*) — podem conter fixes reais não aplicados

**Root cause:** Features desenvolvidas em sprint Onda v2 (mai/2026) não foram mergeadas nem descartadas explicitamente.

**Fix:** Revisar cada branch do lote 2026-05-15. Para cada um: merge em main ou delete explícito.
Lista completa com datas em broken-inventory.md §1.2.
