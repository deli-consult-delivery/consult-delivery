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

*Atualizado em: 2026-05-24 S1-G00 T1*
