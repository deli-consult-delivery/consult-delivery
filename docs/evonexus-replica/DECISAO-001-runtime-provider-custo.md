# DECISÃO 001 — Runtime, multi-provider e custo (fecha D1)

**Status:** ✅ DECIDIDO — 2026-06-03 (Wandson).
**Fecha:** D1/D2/D3 que estavam abertos em `PLANO-MESTRE.md` §1.
**Escopo:** arquitetura de provedor de IA + o que entra e o que **NÃO** entra no build.
**Entra no plano em:** camada de framework peça #3 (orquestrador) e tela **Provedores/Integrações** (ADAPTA) do CHECKLIST MESTRE.

---

## 1. Runtime do produto

- **Base:** `@anthropic-ai/sdk` (Messages API), API key, pago por token. **Resolve o D1.**
- O **Agent SDK** (`@anthropic-ai/claude-agent-sdk`) fica **fora** do runtime do produto multi-tenant. Pode rodar no **Bridge VPS** para uso pessoal do Wandson, **nunca** como motor dos tenants (RESTRUCTURE §3.3 linha 100: requer binário `claude`, não roda em Trigger.dev cloud).
- **D2:** Trigger.dev **v4** (não v3) — a stack já está em v4.
- **D3:** FASE 0 (leitura do código do EvoNexus) roda na **VPS** / `cd-evonexus-lab` — **não** do Windows local.

## 2. Arquitetura de provedor (multi-provider, do jeito legítimo)

Camada de abstração de provedor no orquestrador, **config por tenant**:

- **Provedores suportados:** Anthropic API (qualidade), Ollama (barato/open — self-host ou Cloud), OpenRouter (flexibilidade). **Todos via API key.**
- **BYO-key por tenant:** cada cliente conecta a própria chave (guardada no **Infisical** por `tenant_id`); o custo cai na conta dele.
- **Roteamento por tarefa:**
  - **Claude** (Haiku padrão / Sonnet no alto valor) para o raciocínio que o cliente paga para ver (ex.: `analista-ifood`).
  - **Ollama** para barato/bulk (classificação, rascunho, extração). ⚠️ **Tradeoff de qualidade** — **não** usar em análise nuançada PT-BR + domínio iFood.
- **Fallback** entre provedores quando um faz throttle ou cai. Nunca preso a um só.

## 3. FORA DE ESCOPO — decisão registrada (NÃO construir)

- **Perna de assinatura via OAuth (Claude Max / ChatGPT) embutida no produto: NÃO.**
  Implementar "como o EvoNexus fez" exigiria a plataforma se passar por um cliente oficial da Anthropic para usar cota de assinatura = **circunvenção dos controles de acesso** (fingerprinting / cliente não autorizado) + violação dos Termos Comerciais (Seção D.4) + risco da **conta inteira** (mesma org que roda a produção por API key).
  **Nenhuma sessão futura deve adicionar isso.**
- A assinatura **Max do Wandson** segue **legítima** no Claude Code oficial (dev) e no EvoNexus como laboratório pessoal — **fora** do código do produto.

---

## 4. Custo por token (Anthropic, mai/2026 — conforme decisão do Wandson)

Rates por milhão de tokens (MTok), entrada / saída:

| Modelo | Input | Output |
|--------|-------|--------|
| Haiku 4.5 (`claude-haiku-4-5-20251001`) | US$ 1,00 | US$ 5,00 |
| Sonnet 4.6 (`claude-sonnet-4-6`) | US$ 3,00 | US$ 15,00 |
| Opus 4.7 (`claude-opus-4-7`) | US$ 5,00 | US$ 25,00 |

- Saída custa **5x** a entrada em todos. Pago por uso, sem mensalidade na API.
- **Prompt caching** corta até **90%** do input repetido (ex.: KB iFood + system prompt = prefixo estável entre runs). **Batch** corta 50% (não serve para agente interativo).

> ⚠️ Disciplina (RESTRUCTURE §2 / CLAUDE.md): número real vence estimativa. **Medir os tokens reais nas primeiras runs** (`logAgentRun` registra custo por run) e ajustar.

## 5. Estimativa de custo por cliente (ordem de grandeza)

Câmbio ilustrativo ~R$ 5,50/US$.

**Uma análise completa do `analista-ifood`** (lê planilhas + KB iFood + gera perfil/relatório-interno/relatório-cliente/tarefas/followup):
- Input ~50k tokens (KB + system prompt + dados da loja), boa parte **cacheável** entre runs.
- Output ~12k tokens (os 4-5 arquivos).
- **Haiku:** ~50k×$1/M + ~12k×$5/M = **~US$ 0,11/run** (menos com caching) → ~R$ 0,60.
- **Sonnet** (alto valor): ~US$ 0,33/run → ~R$ 1,80.

**Mês típico por cliente** (~4 análises/mês + ~200 chamadas pequenas de cobrança/suporte/prospecção):
- 4 análises (Haiku) ~US$ 0,44 + ~200 chamadas pequenas ~US$ 0,01 cada = ~US$ 2,00.
- **Total ~US$ 2,5/mês/cliente → ~R$ 14/mês.** Mesmo errando 3-5x: **R$ 15-70/mês**.

**Contra o preço** (pacotes R$ 500-2.500/mês): custo de token = **~1% a 5% da mensalidade**. Margem folgada, e **escala com a receita** (mais clientes = mais tokens = mais receita) — custo variável alinhado ao negócio, não fixo.

**Alavancas de custo:** Haiku como padrão; Sonnet/Opus só no alto valor; prompt caching ligado no prefixo estável (KB+system prompt); Ollama para bulk barato.

---

## 6. Próximo passo

Com D1/D2/D3 fechados, o build segue pelo `PLANO-MESTRE.md`: **FASE 0** (inventário técnico read-only, na VPS) → 🛑 CHECKPOINT 0 → demais fases. O escopo de provedor desta decisão entra na **peça #3 (orquestrador)** e na tela **Provedores/Integrações** (ADAPTA).
