# Tech Debts — Índice S1-G00 Reconhecimento
Plataforma Consult Delivery | Iniciado em 2026-05-24

> Este arquivo registra débitos técnicos encontrados durante o reconhecimento S1-G00.
> Numeração sequencial a partir do último TD conhecido (TD#35 fechado em onda-07).
> Para débitos fechados anteriores, ver docs/tech-debt/onda-07.md.

---

## TD#36 — Schedulers BomDia + Encerramento com timeout
**Status:** 🔴 ABERTO
**Descoberto em:** S1-G00 T1 (2026-05-24)
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

**Retry:** configurado (5 tentativas, backoff 30s→120s), mas falha em todas.

**Evidência:**
```
agent_runs WHERE agent_id='bom-dia-scheduler' AND status='failed' — 2 ocorrências
agent_runs WHERE agent_id='encerramento-scheduler' AND status='failed' — 4 ocorrências
```

**Impacto:** Clientes não recebem imagem de bom dia / encerramento nos grupos quando Evolution API está lenta.

**Sugestão de fix:**
1. Aumentar timeout no Trigger.dev para 120s (ou remover AbortSignal e depender do retry)
2. Separar `gerar-imagem` de `enviar-grupos` em tasks independentes com retry individual por grupo
3. Adicionar fallback: se Evolution timeout, enfileirar para retry manual

---

## TD#37 — /chat/ai sem logging em agent_runs
**Status:** 🟡 ABERTO
**Descoberto em:** S1-G00 T1 (2026-05-24)
**Severidade:** Média — sem observabilidade de uso e custo

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
**Status:** 🔵 OBSERVAÇÃO (verificar com Wandson)
**Descoberto em:** S1-G00 T1 (2026-05-24)

loja-gpt é on-demand. Última run: 2026-05-22 20:15 UTC. Normal se não há demanda.
Verificar se consultores estão usando o chat especialista por loja ou se feature está descartada.

---

## TD#39 — cora com apenas 1 run em 9 dias (POC)
**Status:** 🔵 OBSERVAÇÃO
**Descoberto em:** S1-G00 T1 (2026-05-24)

CORA tem 1 run (2026-05-15). Disparada por webhook Asaas PAYMENT_OVERDUE.
Confirmar se Asaas webhook está ativo em produção ou se CORA é ainda POC.

---

---

## TD#40 — BRENO processar-webhook usa coluna errada no banco
**Status:** 🔴 ABERTO
**Descoberto em:** S1-G00 T2 (2026-05-24)
**Severidade:** Alta — BRENO nunca lê configuração real do banco

**Sintoma:**
`trigger/breno/processar-webhook.ts` linha ~110 faz:
```ts
.eq("agent_slug", "breno")
```
Coluna real em `tenant_agent_config`: **`agent_id`** (não `agent_slug`).
Resultado: query sempre retorna `null`, modo defaulta para `"hibrido"` sem ler DB.
Não quebra a task — mas ignora qualquer configuração inserida no banco.

**Root cause:** Nome de coluna errado no código — provavelmente mudança de schema posterior à escrita da task.

**Impacto:** `tenant_agent_config` inacessível para BRENO. Qualquer mudança de modo via DB ignorada silenciosamente.

**Fix:** Trocar `.eq("agent_slug", "breno")` por `.eq("agent_id", "breno")` em `processar-webhook.ts`.

---

## TD#41 — ChatScreen tem /tarefa e /handoff sem handler no Bridge
**Status:** 🟡 ABERTO
**Descoberto em:** S1-G00 T2 (2026-05-24)
**Severidade:** Média — UI mostra comandos não funcionais

**Sintoma:**
`src/screens/ChatScreen.jsx` declara AI_COMMANDS: `/resumir`, `/traduzir`, `/tom`, `/proxima`, `/tarefa`, `/cobranca`, `/handoff`.
Bridge `POST /chat/ai` trata apenas: `/resumir`, `/proxima`, `/traduzir`, `/tom`, `/cobranca`, `/livre`, `/resposta`.

`/tarefa` e `/handoff` estão na UI mas não têm handler no Bridge.

**Impacto:** Usuário digita `/tarefa` ou `/handoff`, sem feedback de erro claro — provavelmente cai no fallback genérico.

**Fix:** Implementar handlers no Bridge OU remover da lista AI_COMMANDS no ChatScreen.

---

## TD#42 — BRENO deployado no Trigger.dev? Nunca executou em produção
**Status:** 🟡 ABERTO
**Descoberto em:** S1-G00 T2 (2026-05-24)
**Severidade:** Média — feature planejada inoperante

**Sintoma:**
- `trigger/breno/processar-webhook.ts`, `responder.ts`, `resumir-conversa.ts` existem em código
- `agent_runs` mostra **0 runs** para qualquer agent_id relacionado a BRENO
- `tenant_agent_config` não tem nenhuma linha para `agent_id='breno'`

**Possíveis causas:**
1. Task nunca deployada no Trigger.dev cloud (task ID `breno-processar-webhook` não registrado)
2. Bridge `POST /internal/agents/breno-processar-webhook/run` retornando erro 404
3. `triggerBrenoIfNeeded()` na Edge Function falhando silenciosamente (fire-and-forget com `.catch`)

**Fix:** Verificar se `breno-processar-webhook` aparece em cloud.trigger.dev → Runs. Rodar `npx trigger.dev@4.4.6 deploy` para garantir deploy. Inserir row em `tenant_agent_config`.

---

## TD#43 — @deli em grupo capturada mas não invocada
**Status:** 🔵 OBSERVAÇÃO
**Descoberto em:** S1-G00 T2 (2026-05-24)
**Severidade:** Baixa — design intencional, mas limita DELI ativa

**Sintoma:**
Linha 462 da `evolution-webhook/index.ts` exclui `deli` do `enqueueAgentInvoke()`.
`@deli` em grupo é salva em `whatsapp_messages.mentioned_agent = 'deli'` mas nunca chama o Bridge.
`whatsapp_messages.processed_by_deli` existe mas permanece `false`.

**Contexto:** DELI foi projetada como cron-driven (revisao-matinal), não event-driven.

**Extension point:**
Para DELI responder a @menções: adicionar Realtime listener em `whatsapp_messages`
WHERE `mentioned_agent = 'deli' AND processed_by_deli = false` → invocar Bridge.

---

## TD#44 — bom_dia_config.hora_semana/hora_sabado não consumidas pelo cron
**Status:** 🟡 ABERTO
**Descoberto em:** S1-G00 T3 (2026-05-24)
**Severidade:** Média — UI pode dar falsa impressão de controle de horário

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
**Status:** 🔵 OBSERVAÇÃO
**Descoberto em:** S1-G00 T3 (2026-05-24)
**Severidade:** Baixa — funciona, mas pode causar confusão em manutenção

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
**Status:** 🔵 OBSERVAÇÃO
**Descoberto em:** S1-G00 T3 (2026-05-24)
**Severidade:** Baixa — inconsistência entre BomDia e Encerramento

`trigger/encerramento/gerar-imagem.ts` usa `withOverloadedRetry()` para chamadas Claude (529),
mas NÃO usa retry equivalente para chamadas Recraft V4.1 via OpenRouter.
`trigger/bom-dia/gerar-imagem.ts` usa retry manual (3 tentativas, delay 3s) para Recraft,
mas NÃO tem `withOverloadedRetry()` para Claude.

Inconsistência: cada arquivo tem retry em lugares diferentes.

**Sugestão:** Padronizar o retry pattern nos dois arquivos.

---

## TD#48 — BomDia: storage path diz 1920x1080 mas resolução real é 1820x1024
**Status:** 🟡 ABERTO
**Descoberto em:** S1-G00 T3 / cd-validator-strict (2026-05-24)
**Severidade:** Baixa — arquivo funciona, mas metadata do nome é enganoso

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
**Status:** 🟡 ABERTO
**Descoberto em:** S1-G00 T4 (2026-05-24)
**Severidade:** Média — DELI opera sem regras Verde/Amarelo/Vermelho configuradas

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
**Status:** 🟡 ABERTO
**Descoberto em:** S1-G00 T4 (2026-05-24)
**Severidade:** Média — RequireRole no React pode não ter dados reais para validar

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
**Status:** 🔵 OBSERVAÇÃO
**Descoberto em:** S1-G00 T4 (2026-05-24)
**Severidade:** Baixa — não bloqueia operação atual

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
**Status:** 🔵 OBSERVAÇÃO
**Descoberto em:** S1-G00 T4 (2026-05-24)
**Severidade:** Baixa — sistema de memória de agentes inoperante

**Sintoma:**
`client_facts` e `client_timeline` têm 0 rows.
CLAUDE.md §14 define: "Agentes leem contexto ANTES de agir" e "Agentes registram fatos novos".
Nenhum agente ativo (VERA, DELI, analise-gerar-relatorio, BomDia) escreve nestas tabelas.

**Root cause:** Integração com Memória Central não foi implementada em nenhuma task Trigger.dev.
Agentes operam sem contexto persistente sobre lojas.

**Fix:** Adicionar `INSERT INTO client_facts` e `client_timeline` em agents relevantes (DELI, VERA, analise).

---

## TD#53 — pg_stat stale para múltiplas tabelas — rowcounts via monitoramento não confiáveis
**Status:** 🔵 OBSERVAÇÃO
**Descoberto em:** S1-G00 T4 (2026-05-24)
**Severidade:** Baixa — afeta apenas observabilidade, não funcionalidade

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

*Atualizado em: 2026-05-24 S1-G00 T3, T4, T5*

---

## TD#54 — 25 branches merged não removidos do remote
**Status:** 🔵 OBSERVAÇÃO
**Descoberto em:** S1-G00 T5 (2026-05-24)
**Severidade:** Baixa — higiene de repositório

**Sintoma:**
`git branch -r --merged origin/main` retorna 25 branches além de main/gh-pages.
Todos já foram merged — não têm código pendente.

**Root cause:** Nenhum processo de cleanup pós-merge. GitHub não deleta automaticamente.

**Fix:** `git push origin --delete <branch>` para cada um dos 25. Lista completa em broken-inventory.md §1.1.
Ou ativar "Auto-delete head branches" nas Settings do GitHub repo.

---

## TD#55 — 23 branches unmerged potencialmente stale (lote 2026-05-15)
**Status:** 🟡 MÉDIA
**Descoberto em:** S1-G00 T5 (2026-05-24)
**Severidade:** Média — risco de código pendente não mergeado e acúmulo de drift

**Sintoma:**
29 branches no remote não mergeados em main. Após excluir os 6 ativos da série piloto:
- 3 branches com ≥15 dias (wandson/chat-status-system, wandson/fix-sidebar-chat, wandson/lara-agente-regua) — definitivamente stale
- 20 branches do lote 2026-05-15 (v2-8 a v2-12, fix/*, feat/*, docs/*) — podem conter fixes reais não aplicados

**Root cause:** Features desenvolvidas em sprint Onda v2 (mai/2026) não foram mergeadas nem descartadas explicitamente.

**Fix:** Revisar cada branch do lote 2026-05-15. Para cada um: merge em main ou delete explícito.
Lista completa com datas em broken-inventory.md §1.2.
