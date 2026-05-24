# T1 — Inventário de Agentes CD em Produção
S1-G00 Reconhecimento | 2026-05-24

> ISOLAMENTO: EvoNexus (oracle, custom-analista-loja, aria-hr) roda na mesma VPS em modo TESTE.
> NÃO é parte do Consult Delivery. Ignorado neste inventário.
> Foco: /root/consult-delivery + Supabase czyanilrverorwenikqw / tenant='consult'.

---

## OUTPUT BRUTO: agent_runs — todos os agent_id únicos

```
SELECT DISTINCT agent_id, COUNT(*) as runs, MAX(created_at) as last_run,
  SUM(CASE WHEN status='success' THEN 1 ELSE 0 END) as successes,
  SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) as failures
FROM agent_runs GROUP BY agent_id ORDER BY last_run DESC;

agent_id                 | runs | last_run                       | successes | failures
-------------------------|------|--------------------------------|-----------|--------
vera                     |  77  | 2026-05-24 16:01:20.21+00      |  77       | 0
deli                     |  11  | 2026-05-24 08:01:02.66+00      |  10       | 1
analise-gerar-relatorio  |   5  | 2026-05-24 01:07:26.38+00      |   5       | 0
encerramento-scheduler   |  12  | 2026-05-23 15:02:40.15+00      |   8       | 4
encerramento             |   7  | 2026-05-23 15:02:07.61+00      |   5       | 2
bom-dia-scheduler        |  10  | 2026-05-23 11:01:25.89+00      |   8       | 2
bom-dia                  |  41  | 2026-05-23 10:56:02.04+00      |  29       | 12
loja-gpt                 |   7  | 2026-05-22 20:15:38.80+00      |   7       | 0
cora                     |   1  | 2026-05-15 00:01:56.61+00      |   1       | 0
```

---

## OUTPUT BRUTO: última falha dos schedulers

```
SELECT agent_id, status, created_at, output
FROM agent_runs
WHERE agent_id IN ('bom-dia-scheduler','encerramento-scheduler') AND status='failed'
ORDER BY created_at DESC LIMIT 4;

-- encerramento-scheduler | failed | 2026-05-23 15:02:40 UTC
output: {"date":"2026-05-23","results":[{"error":"The operation was aborted due to timeout","status":"failed","tenant_id":"9079bd4d-...","groups_count":0}],"is_holiday":false,"tenants_processed":1}

-- encerramento-scheduler | failed | 2026-05-23 15:02:39 UTC (retry mesmo run)
output: {"error":"The operation was aborted due to timeout"}

-- bom-dia-scheduler | failed | 2026-05-23 11:01:25 UTC
output: {"date":"2026-05-23","results":[{"error":"The operation was aborted due to timeout","status":"failed","tenant_id":"9079bd4d-...","groups_count":0}],"is_holiday":false,"tenants_processed":1}

-- bom-dia-scheduler | failed | 2026-05-23 11:01:25 UTC (retry mesmo run)
output: {"error":"The operation was aborted due to timeout"}
```

**Causa raiz dos timeouts:** Trigger.dev cloud → Bridge Server VPS (POST /agents/bom-dia/send-groups) com `AbortSignal.timeout(30_000)`. Bridge então chama Evolution API com timeout de 20s por grupo. A Evolution API está lenta/instável. **→ TD#36**

---

## AGENTES COM RUNS EM PRODUÇÃO

---

### 1. VERA — BI e Relatórios
**Status:** ✅ SAUDÁVEL

| Campo | Valor |
|-------|-------|
| agent_id | `vera` |
| Filepath | `trigger/vera/relatorio-diario.ts`, `relatorio-semanal.ts`, `snapshot-diario.ts`, `detectar-anomalia.ts`, `responder-pergunta.ts` |
| Prompt-base | Não encontrado `.md` externo — prompt embutido no código TypeScript |
| Tabelas Supabase | A confirmar em T4 |
| Cron/Job | Confirmado ativo: múltiplos runs/dia (ver runs abaixo) |
| Runs total | 77 |
| Success | 77 (100%) |
| Última run | 2026-05-24 16:01:20 UTC (hoje) |
| Run ID | `run_cmpjys9gj0vfy0un514odo0hl` |

---

### 2. DELI — COO Digital
**Status:** ✅ SAUDÁVEL (1 falha isolada)

| Campo | Valor |
|-------|-------|
| agent_id | `deli` |
| Filepath | `trigger/deli/supervisionar.ts`, `revisao-matinal.ts`, `conversa.ts` |
| Prompt-base | Não encontrado `.md` externo — prompt embutido |
| Tabelas Supabase | A confirmar em T4 |
| Cron/Job | Cron diário (revisao-matinal) |
| Runs total | 11 |
| Success | 10 (91%) |
| Falhas | 1 |
| Última run | 2026-05-24 08:01:02 UTC (hoje) |
| Run ID | `run_cmpjhm6q06d6d0omuhj9pul1d` |

---

### 3. ANALISE-GERAR-RELATORIO — Análise iFood
**Status:** ✅ SAUDÁVEL

| Campo | Valor |
|-------|-------|
| agent_id | `analise-gerar-relatorio` |
| Filepath | `trigger/analise/gerar-relatorio.ts` |
| Prompt-base | Não encontrado `.md` externo |
| Tabelas Supabase | `analises` (trigger via Bridge `/analise`) |
| Cron/Job | On-demand via Bridge `POST /analise` → Trigger.dev `analise-ifood-run` |
| Runs total | 5 |
| Success | 5 (100%) |
| Última run | 2026-05-24 01:07:26 UTC (hoje, 58 s duração) |
| Run ID | `run_cmpj2tx5w2l7l0hoep09rqt1o` |

---

### 4. BOM-DIA — Envio de Bom Dia nos Grupos
**Status:** ⚠️ SCHEDULER FALHANDO (timeout Bridge→Evolution)

| Campo | Valor |
|-------|-------|
| agent_id | `bom-dia` (manual) + `bom-dia-scheduler` (cron) |
| Filepath | `trigger/bom-dia/envio-agendado.ts`, `trigger/bom-dia/gerar-imagem.ts` |
| Prompt-base | Não encontrado `.md` externo — geração de imagem HeyGen |
| Tabelas Supabase | `bom_dia_config`, `agent_runs`, `whatsapp_groups`, `evolution_instances` |
| Schedule IDs | `bom-dia-envio-agendado-semana` (cron `0 12 * * 1-5` = seg-sex 09:00 BRT) |
| | `bom-dia-envio-agendado-sabado` (cron `0 11 * * 6` = sáb 08:00 BRT) |
| Bridge endpoint | `POST /agents/bom-dia/send-groups` (x-internal-token) → Evolution API sendMedia |
| Runs total | bom-dia: 41 (29 ok / 12 fail) &#124; bom-dia-scheduler: 10 (8 ok / 2 fail) |
| Última run com sucesso | 2026-05-23 10:56:02 UTC (manual `bom-dia`) |
| Última falha scheduler | 2026-05-23 11:01:25 UTC — "The operation was aborted due to timeout" |
| Tech Debt | **TD#36** — timeout AbortSignal(30s) no Trigger.dev→Bridge; Evolution API retorna lento |

---

### 5. ENCERRAMENTO — Envio de Encerramento nos Grupos
**Status:** ⚠️ SCHEDULER FALHANDO (timeout idêntico ao BomDia)

| Campo | Valor |
|-------|-------|
| agent_id | `encerramento` (manual) + `encerramento-scheduler` (cron) |
| Filepath | `trigger/encerramento/envio-agendado.ts`, `trigger/encerramento/gerar-imagem.ts` |
| Prompt-base | Não encontrado `.md` externo — geração de imagem |
| Tabelas Supabase | `encerramento_config`, `agent_runs`, `whatsapp_groups`, `evolution_instances` |
| Schedule IDs | `encerramento-envio-agendado-semana` (cron `0 21 * * 1-5` = seg-sex 18:00 BRT) |
| | `encerramento-envio-agendado-sabado` (cron `0 15 * * 6` = sáb 12:00 BRT) |
| Bridge endpoint | `POST /agents/encerramento/send-groups` (x-internal-token) → Evolution API sendMedia |
| Runs total | encerramento: 7 (5 ok / 2 fail) &#124; encerramento-scheduler: 12 (8 ok / 4 fail) |
| Última run com sucesso | 2026-05-23 15:02:07 UTC (manual `encerramento`) |
| Última falha scheduler | 2026-05-23 15:02:40 UTC — "The operation was aborted due to timeout" |
| Tech Debt | **TD#36** (mesmo root cause do BomDia) |

---

### 6. LOJA-GPT — Chat Especialista por Loja (on-demand)
**Status:** ✅ SAUDÁVEL (on-demand, sem cron)

| Campo | Valor |
|-------|-------|
| agent_id | `loja-gpt` |
| Task Trigger ID | `loja-gpt-responder` |
| Filepath | `trigger/loja-gpt/responder.ts` |
| Prompt-base | embutido em `buildSystemPrompt()` (responder.ts:53-93) — `trigger/knowledge-base/99-agentes/loja-gpt/system-prompt.md` é artefato de design, NÃO carregado em runtime |
| Tabelas Supabase | `loja_gpt_conversations`, `loja_gpt_messages`, `lojas`, `loja_metricas_snapshot`, `tarefas_loja`, `agent_memories` (via `buildLojaContexto`) + knowledge-base = filesystem estático em `KNOWLEDGE_BASE_PATH` (não tabela Supabase) |
| Cron/Job | On-demand — Frontend → Bridge `POST /agents/loja-gpt-responder/run` → Trigger.dev |
| Retry | maxAttempts: 1 |
| Runs total | 7 |
| Success | 7 (100%) |
| Última run | 2026-05-22 20:15:38 UTC (há 2 dias — on-demand, normal) |
| ⚠️ Nota | Sem runs nos últimos 2 dias — normal para on-demand, mas confirmar com usuário |

---

### 7. CORA — Cobrança Inteligente (POC)
**Status:** 🔵 POC — apenas 1 run em toda a história

| Campo | Valor |
|-------|-------|
| agent_id | `cora` |
| Filepath | `trigger/cora/analisar-devedor.ts`, `escalonar.ts`, `gerar-mensagem.ts`, `criar-cobranca.ts` |
| Prompt-base | Não encontrado `.md` externo |
| Tabelas Supabase | `cobrancas`, `cobranca_eventos` (via webhook Asaas) |
| Cron/Job | On-demand — disparado via webhook Asaas PAYMENT_OVERDUE |
| Runs total | 1 |
| Success | 1 (100%) |
| Última run | 2026-05-15 00:01:56 UTC (há 9 dias) |
| Nota | Volume muito baixo — confirmar se Asaas webhook está ativo em produção |

---

## CHAT AO VIVO — DELI Copilot (Sem Trigger.dev)

| Campo | Valor |
|-------|-------|
| Endpoint | `POST /chat/ai` (Bridge Server) |
| Auth | JWT Supabase obrigatório |
| Model | `claude-haiku-4-5-20251001` (ANTHROPIC_MODEL env var) |
| Commands | `/resumir`, `/proxima`, `/traduzir`, `/tom`, `/cobranca`, `/livre`, `/resposta` |
| Timeout | AbortSignal(30s) para Anthropic API |
| Logging | ⚠️ SEM logging em agent_runs — chamada direta Anthropic, sem audit |
| Tabelas | Nenhuma (stateless — não persiste conversas do chat ao vivo) |
| Cron | Nenhum — on-demand via UI |
| ⚠️ TD | **TD#37** — /chat/ai não registra em agent_runs; sem observabilidade de uso e custo |

---

## AGENTES EM CÓDIGO APENAS (0 RUNS EM PRODUÇÃO)

Os agentes abaixo existem em `trigger/` mas têm **zero runs** em `agent_runs`:

| Agente | Arquivos | Status |
|--------|----------|--------|
| BRENO | `trigger/breno/responder.ts`, `resumir-conversa.ts`, `processar-webhook.ts` | Em desenvolvimento |
| LARA | `trigger/lara/analisar-tendencia.ts`, `gerar-conteudo.ts`, `pesquisar-loja.ts` | Em desenvolvimento |
| MAX | `trigger/max/tutorial.ts`, `diagnostico.ts`, `escalonar.ts` | Em desenvolvimento |
| NOVA | `trigger/nova/discovery.ts`, `blueprint.ts`, `estimate.ts` | Em desenvolvimento |
| SOFIA | `trigger/sofia/batch-pesquisar.ts`, `gerar-abordagem.ts`, `pesquisar-prospect.ts`, `qualificar.ts` | Em desenvolvimento |
| ANALISE-IFOOD | `trigger/analise-ifood/run.ts` | Em desenvolvimento (ANALISE-GERAR-RELATORIO já ativo) |

---

## RESUMO DE STATUS

| Agente | Runs | Saúde | Cron Ativo |
|--------|------|-------|------------|
| vera | 77 | ✅ | Sim |
| deli | 11 | ✅ | Sim |
| analise-gerar-relatorio | 5 | ✅ | On-demand |
| bom-dia | 41 | ⚠️ scheduler timeout | Sim (com falhas) |
| encerramento | 12 scheduler | ⚠️ scheduler timeout | Sim (com falhas) |
| loja-gpt | 7 | ✅ | On-demand |
| cora | 1 | 🔵 POC | On-demand |
| breno/lara/max/nova/sofia | 0 | — em dev | Não |

**Tech Debts identificados:**
- TD#36 — Schedulers BomDia + Encerramento com timeout (Trigger.dev → Bridge → Evolution)
- TD#37 — /chat/ai sem logging em agent_runs

---

*Gerado em: 2026-05-24 | S1-G00 T1*
