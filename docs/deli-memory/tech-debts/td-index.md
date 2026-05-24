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

*Atualizado em: 2026-05-24 S1-G00 T2*
