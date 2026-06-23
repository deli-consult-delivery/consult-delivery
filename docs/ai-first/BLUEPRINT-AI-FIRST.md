# BLUEPRINT AI-FIRST — Consult Delivery
Versão: 1 (2026-06-22) | Status: PROPOSTA (aguardando 🛑 CHECKPOINT do Wandson para iniciar a construção)
Autor: sessão Claude | Modelo de redação: claude-opus-4-8

> **Doc autoritativo de visão AI-First.** Estende `PLANO-MESTRE.md` (raiz) e respeita `RESTRUCTURE.md`. Em divergência: RESTRUCTURE > PLANO-MESTRE > este blueprint. Nada aqui reabre decisões já travadas — apenas as costura num plano de execução faseado.

---

## 0. Como usar este documento

1. **Ler primeiro**, antes de qualquer build do tema AI-First.
2. O blueprint é **faseado**: cada fase tem objetivo, peças reusadas, peças novas, fatias verificáveis e critério de aceite. Nada de fase pulada em silêncio.
3. Status só vira ✅ **com evidência** (output bruto: SQL executado, JSON do run, print do painel, string da feature no bundle).
4. **🛑 CHECKPOINT** = a construção só começa após o Wandson aprovar. Este doc é o "blueprint completo primeiro" que ele pediu.

---

## 1. Visão (o que o Wandson pediu, em uma frase)

> Transformar a Consult Delivery numa empresa **AI-First**: um **cérebro (DELI) com memória**, acessado primeiro pelo **Telegram**, que orquestra **agentes especialistas**. Os especialistas atendem clientes no **live chat**; o que não resolvem na hora **vira tarefa num pipeline visível em tempo real**, é executado **dentro do sistema externo necessário** (ERP, Asaas, etc.), e o resultado **volta como resposta ao cliente** — sempre respeitando aprovação humana onde o modo do tenant exigir.

Três pilares:

- **(A) Cérebro + memória** — DELI como Oráculo único, Memory-First (`client_facts`, `client_timeline`, `agent_memories`). Acesso via Telegram (Hermes/`@DeliConsultBot`).
- **(B) Loop cliente→especialista→tarefa→resolução→resposta** — a máquina de estados que faz a empresa "rodar sozinha".
- **(C) Pipeline em tempo real** — uma tela no Console v2 onde toda tarefa de todo agente é visível ao vivo.

### Decisões travadas que este blueprint honra

| # | Decisão | Origem |
|---|---------|--------|
| AF-1 | **Blueprint completo primeiro**, depois construir por fases. | AskUserQuestion (sessão anterior) |
| AF-2 | **"Ernesto" = a própria DELI.** Não existe agente Ernesto separado. O cérebro É a DELI (evolução do copiloto DELI/Hermes). | Wandson, verbatim |
| AF-3 | **DELI começa no Telegram primeiro** (não WhatsApp). | Wandson, verbatim |
| AF-4 | **Primeira fase a construir = o Loop** cliente→especialista→tarefa→resposta. | AskUserQuestion |
| AF-5 | **Reusar tudo que já existe**; estender via `ALTER ADD COLUMN IF NOT EXISTS`, nunca recriar. | PLANO-MESTRE §reusar-não-recriar |
| AF-6 | **Motor EvoNexus PROIBIDO em prod.** Re-implementar só o *paradigma* na stack CD. | RESTRUCTURE §3.3 |

---

## 2. O que JÁ existe (inventário — não recriar)

A plataforma já tem a maioria dos blocos. O AI-First é **costura + 1 loop + 1 tela**, não um greenfield.

| Bloco | Onde vive | Estado | Papel no AI-First |
|-------|-----------|--------|-------------------|
| Cérebro de memória | `client_facts`, `client_timeline`, `loja_metricas`, `agent_memories` (`20260504_002/003`) | ✅ em prod | Memory-First do Oráculo e dos especialistas |
| Runtime de agente | `src/agents/shared/runtime.ts` (`executeAgent`, `getClientContext`, `recordFact`, `logTimeline`, `getPrompt`) | ✅ | Motor de execução de todo especialista |
| Wrapper Claude | `trigger/_shared/claude.ts` (`runClaudeWithWebSearch`) | ✅ | LLM com `web_search_20250305` |
| Especialistas | `trigger/breno/*`, `trigger/cora/*`, `trigger/lara/*`, `trigger/vera/*` | ✅/POC | Quem atende e resolve |
| Orquestrador DELI | `trigger/deli/orchestrator-5min.ts` (cron 5min) | ✅ (com `notifyBridge` comentado) | O "coração" do cérebro |
| DELI no Telegram | Hermes gateway → `@DeliConsultBot` → admin-mcp (`cd-admin`) → banco | ✅ | Canal AF-3 do Oráculo |
| Oracle agent-builder | `bridge-server/routes/oracle.js` (`oracle_drafts`) | ✅ | Paradigma "peça à DELI e ela cria" |
| Drafts + aprovação | `agent_drafts`, `deli_pending_approvals`, `deli-approvals.js` | ✅ | Guard-rail: nada vai ao cliente sem aprovação |
| Pipeline de tarefas | `client_tasks` (modelo ClickUp: `column_id`/`is_done`, `20260620_003`) | ✅ | A "tarefa" do loop |
| Semáforo / modo | `tenant_agent_config.mode`, `getTenantAgentConfig` | ✅ | Verde/amarelo/vermelho por tenant |
| Escrita gated ERP | `vendaerp_proposals` (`20260614_003`) + Bridge `lib/vendaerp.js` | ✅ Fase read-only em prod | Especialista executa no ERP com confirmação |
| Console v2 | `src/console/ConsoleV2.jsx` (5 grupos `.cv2-*`) | ✅ | Onde a tela Pipeline entra |
| Realtime | `agent_runs`/`agent_drafts` na publication (sem `REPLICA IDENTITY FULL`) | ⚠️ parcial | Base do tempo-real do pipeline |

### Gaps confirmados (o que falta — escopo deste blueprint)

1. **Loop ponta-a-ponta não está cabeado** — `conversations` não tem link a tarefa/loop; especialista não cria `client_tasks` nem responde de volta.
2. **Tela Pipeline não existe** no Console v2.
3. **Realtime incompleto** — `client_tasks` e `deli_pending_approvals` fora da publication; faltam `REPLICA IDENTITY FULL`.
4. **`POST /agents/deli/notify` não existe** no Bridge; `notifyBridge` está comentado (bug de spam de 2026-05-26).
5. **DELI no Telegram é copiloto de admin**, ainda não despacha especialista para o loop nem traz retorno por tenant.

---

## 3. Arquitetura do Loop (o coração do AI-First)

### 3.1 Máquina de estados

A conversa (`conversations`) e a tarefa (`client_tasks`) carregam o estado do loop. Estados:

```
              cliente escreve no live chat
                        │
                        ▼
              ┌───────────────────┐
              │  ATENDIMENTO      │  especialista lê contexto (client_facts/timeline)
              │  (loop_status=    │  e decide: resolver agora ou abrir tarefa
              │   'attending')    │
              └─────────┬─────────┘
            resolve         │  não resolve
            agora           ▼
              │     ┌───────────────────┐
              │     │  TAREFA ABERTA    │  cria client_tasks (loop_state='open')
              │     │  (loop_status=    │  vincula conversation_id ↔ active_task_id
              │     │   'task_pending') │
              │     └─────────┬─────────┘
              │               ▼
              │     ┌───────────────────┐
              │     │  EXECUÇÃO         │  especialista age no sistema externo
              │     │  (loop_state=     │  (VendaERP via proposta, Asaas, etc.)
              │     │   'executing')    │  grava execution_run_id/execution_result
              │     └─────────┬─────────┘
              │               ▼
              │     ┌───────────────────┐
              │     │  CONCLUSÃO        │  especialista monta resposta ao cliente
              │     │  (loop_state=     │  → agent_drafts (pending)
              │     │   'done')         │
              │     └─────────┬─────────┘
              ▼               ▼
       ┌────────────────────────────────┐
       │  RESPOSTA AO CLIENTE           │  respeita semáforo/modo do tenant:
       │  (loop_status='replied')       │  ia→envia · hibrido→aprova · humano→trava
       └────────────────────────────────┘
```

**Regra de ouro (AF-6 + drafts):** o agente **nunca** envia direto ao cliente. A resposta sempre nasce como `agent_drafts` (pending) e o envio é gated pelo modo do tenant. Exceção herdada: canais `telegram_interno`/`painel` (equipe interna) vão direto.

### 3.2 Mapa modo → semáforo (já existente, reusar)

| `tenant_agent_config.mode` | Semáforo | Comportamento no loop |
|----------------------------|----------|------------------------|
| `ia` | 🟢 Verde | especialista executa e envia (draft auto-aprovado/log) |
| `hibrido` | 🟡 Amarelo | especialista propõe; humano aprova com `ok` no painel/Telegram |
| `humano` | 🔴 Vermelho | especialista só rascunha; humano conduz |

Mapeamento canônico já implementado em `trigger/cora/processar-cobranca.ts` (linha ~60) — **reusar, não reescrever**.

### 3.3 Onde a execução externa acontece

- **VendaERP**: especialista → `vendaerp_proposals` (escrita gated) → confirmação Telegram → Bridge `lib/vendaerp.js` executa. Agente **nunca** toca a credencial de 3 headers (vive só no env do Bridge via Infisical).
- **Asaas** (cobrança/CORA): mesmo padrão de proposta+confirmação.
- **`sistema_alvo='nenhum'`**: tarefa resolvida só com conhecimento/memória, sem sistema externo.

---

## 4. Plano faseado

> Ordem deriva do design do loop. Cada fatia é verificável isoladamente (output bruto). Migrations são **aditivas/reversíveis** → autônomas (versionar em git antes · 1 arquivo por vez · parar no 1º erro · teste de isolamento ao tocar RLS).

### FASE 1 — O Loop ponta-a-ponta *(primeira construção, AF-4)*

**Objetivo:** cliente no live chat → especialista atende → o que não resolve vira `client_tasks` → especialista executa (começando read-only no ERP) → responde via draft respeitando o semáforo.

#### Fatia 1.1 — Schema do loop (migration aditiva)
`supabase/migrations/20260623_001_loop_core.sql`
```sql
-- conversations: estado do loop + ponteiros
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS loop_status text,
  ADD COLUMN IF NOT EXISTS active_task_id uuid REFERENCES public.client_tasks(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS attending_agent_id text;

-- client_tasks: vínculo de volta + execução
ALTER TABLE public.client_tasks
  ADD COLUMN IF NOT EXISTS conversation_id  uuid REFERENCES public.conversations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS loop_state       text,
  ADD COLUMN IF NOT EXISTS target_system    text,
  ADD COLUMN IF NOT EXISTS execution_run_id text,
  ADD COLUMN IF NOT EXISTS execution_result jsonb,
  ADD COLUMN IF NOT EXISTS proposal_id      uuid REFERENCES public.vendaerp_proposals(id) ON DELETE SET NULL;
```
**Aceite:** colunas existem (`\d+ conversations` / `\d+ client_tasks`); nenhuma policy RLS quebrada (teste de isolamento por tenant).

#### Fatia 1.2 — `createLoopTask()` + branch `criar_tarefa`
- Novo helper `trigger/_shared/loop-tasks.ts`: `createLoopTask({tenantId, conversationId, lojaId, agentId, titulo, descricao, prioridade, sistemaAlvo})` → insere `client_tasks` (respeitando `customer_id` NOT NULL) na coluna inicial do board ClickUp, seta `loop_state='open'`, e atualiza `conversations.loop_status='task_pending'` + `active_task_id`.
- Nova task discriminada `respond_or_classify` no especialista (estender `trigger/breno/responder.ts`): a saída Zod decide `acao: 'resolver' | 'criar_tarefa'`:
```ts
{
  acao: 'resolver' | 'criar_tarefa',
  resposta?: string, tom?: string,
  tarefa?: { titulo, descricao, prioridade:'urgent'|'high'|'normal'|'low',
             sistema_alvo:'vendaerp'|'asaas'|'nenhum', operacao?, parametros? },
  precisa_humano: boolean, motivo_humano?: string
}
```
**Aceite:** mensagem de teste que o agente não resolve cria uma `client_tasks` vinculada à conversa (SELECT mostrando `conversation_id` + `active_task_id` casados).

#### Fatia 1.3 — `agent-executar-tarefa` (execução read-only)
- Nova task `trigger/agents/executar-tarefa.ts` (id `agent-executar-tarefa`): pega tarefa `open`, seta `loop_state='executing'`, executa a operação no sistema-alvo **começando por leitura no VendaERP** (via vendaerp-mcp/Bridge — nunca toca segredo), grava `execution_run_id`/`execution_result`, seta `loop_state='done'`.
**Aceite:** run real lendo dado do ERP; `execution_result` populado (JSON bruto do run).

#### Fatia 1.4 — `agent-responder-conclusao` (draft + semáforo)
- Nova task `trigger/agents/responder-conclusao.ts` (id `agent-responder-conclusao`): monta resposta ao cliente a partir de `execution_result` + contexto, cria `agent_drafts` (campo **`content`**, não `body`), lê `tenant_agent_config.mode` e aplica o mapa do §3.2. Atualiza `conversations.loop_status='replied'` quando enviado/aprovado.
**Aceite:** draft criado com `content` correto; em tenant `ia` o envio dispara; em `hibrido` fica `pending` aguardando `ok`.

#### Fatia 1.5 — Escrita no ERP via proposta *(gated)*
- Quando `operacao` é de escrita: especialista cria `vendaerp_proposals` + confirmação Telegram antes de executar (padrão `20260614_003`). POST sem retry (não idempotente).
**Aceite:** proposta criada; execução só após confirmação; `proposal_id` linkado na tarefa.

> **Multi-tenant de credencial (Fase 3)** fica fora da Fase 1: `getVendaErpConfig` ignora `tenantId` hoje (mono-credencial). Ponto de extensão: tabela `vendaerp_instances` + fallback env.

---

### FASE 2 — Pipeline em tempo real (Console v2)

**Objetivo:** uma tela onde toda tarefa de todo agente é visível ao vivo, com o estado do loop.

#### Fatia 2.1 — Realtime (migration aditiva, gated por `ok` por mexer em publication)
`supabase/migrations/20260623_002_pipeline_realtime.sql`
```sql
ALTER TABLE public.agent_runs              REPLICA IDENTITY FULL;
ALTER TABLE public.agent_drafts            REPLICA IDENTITY FULL;
ALTER TABLE public.deli_pending_approvals  REPLICA IDENTITY FULL;
ALTER TABLE public.client_tasks            REPLICA IDENTITY FULL;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.client_tasks;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.deli_pending_approvals;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
```
**Aceite:** `SELECT * FROM pg_publication_tables WHERE pubname='supabase_realtime'` lista as 4 tabelas.

#### Fatia 2.2 — Tela Pipeline
- `src/console/PipelineScreen.jsx` + hook `src/console/usePipelineRealtime.js` (padrão de subscription de `src/console/Deli.jsx` linhas 448-472: `supabase.channel(...).on('postgres_changes', {filter:'tenant_id=eq.<id>'}).subscribe()` + cleanup `removeChannel`).
- Registrar no `ConsoleV2.jsx`: item `{ id:'pipeline', ic:'i-activity', label:'Pipeline ao Vivo' }` no grupo "Operação" + case no switch + import.
- Colunas/visão: por `loop_state` (open → executing → done → replied) + cartões mostrando agente, cliente, sistema-alvo, e aprovações pendentes.
**Aceite:** abrir a tela no browser (app.consultdelivery.com.br) e ver uma tarefa mudar de coluna ao vivo sem refresh; string da feature confirmada no bundle deployado.

---

### FASE 3 — DELI Oráculo no Telegram (cérebro de comando)

**Objetivo:** o Wandson conversa com a DELI pelo Telegram; ela aciona o especialista certo, acompanha o loop e traz o retorno (por tenant).

#### Fatia 3.1 — `cd_despachar_especialista` (admin-mcp)
- Nova tool `admin-mcp/src/tools/cd_despachar_especialista.js` (assinatura `async handler(args, {sb, cfg})`, modelo `cd_propor_draft.js`): a DELI, a pedido do Wandson, dispara um especialista para uma demanda → cria `client_tasks` no loop (reusa `createLoopTask` via Bridge). Registrada em `registry.js` como writeTool (auditoria automática via `server.js`).
**Aceite:** comando no `@DeliConsultBot` cria tarefa real e responde com o id; `audit_log` registra.

#### Fatia 3.2 — Retorno do loop ao Telegram
- Bridge: criar `POST /agents/deli/notify` (não existe hoje) e **reativar `notifyBridge`** no `orchestrator-5min.ts` com dedup por `dedup_key` (evita o spam de 2026-05-26). Padrão trigger→poll de `routes/analises.js` (`pollRunUntilDone`) para acompanhar o run até a conclusão.
**Aceite:** ao concluir uma tarefa despachada, a DELI manda no Telegram o resultado uma única vez (sem spam); log do dedup.

> **Por que Telegram primeiro (AF-3):** o canal Hermes/`@DeliConsultBot` já existe e já fala com o banco via admin-mcp. É o caminho mais curto para o "cérebro de comando" sem tocar WhatsApp. WhatsApp do Wandson fica para uma fase posterior.

---

### FASE 4 — Autonomia ampliada (heartbeats + memória ativa)

**Objetivo:** a empresa "roda sozinha" — agentes proativos, não só reativos.

- Heartbeats: o `orchestrator-5min` varre sinais (cliente sumiu, cobrança vencendo, tarefa parada) e **abre tarefas no loop sozinho**, respeitando semáforo.
- Memória ativa: especialistas escrevem `client_facts`/`client_timeline` após cada loop (confidence, expires_at), alimentando o próximo atendimento.
- Métrica de saúde do pipeline: tarefas paradas > X, taxa de auto-resolução, % que precisou de humano.

**Aceite:** uma tarefa nascida de heartbeat (sem cliente escrever) percorre o loop e aparece no pipeline.

---

## 5. Arquivos do blueprint (a criar/estender)

| Arquivo | Tipo | Fase |
|---------|------|------|
| `supabase/migrations/20260623_001_loop_core.sql` | novo (aditivo) | 1.1 |
| `supabase/migrations/20260623_002_pipeline_realtime.sql` | novo (aditivo, gated) | 2.1 |
| `trigger/_shared/loop-tasks.ts` | novo | 1.2 |
| `trigger/breno/responder.ts` | estender (branch `criar_tarefa`) | 1.2 |
| `trigger/agents/executar-tarefa.ts` | novo (`agent-executar-tarefa`) | 1.3 |
| `trigger/agents/responder-conclusao.ts` | novo (`agent-responder-conclusao`) | 1.4 |
| `admin-mcp/src/tools/cd_despachar_especialista.js` | novo | 3.1 |
| `bridge-server` `POST /agents/deli/notify` + reativar `notifyBridge` | novo/edição | 3.2 |
| `src/console/PipelineScreen.jsx` + `usePipelineRealtime.js` | novo | 2.2 |
| `src/console/ConsoleV2.jsx` | estender (item Pipeline) | 2.2 |

---

## 6. Guard-rails (inviolável)

- **Branch sempre**, nunca commit direto em `main`.
- **Nenhuma mensagem a cliente sem aprovação** (drafts + semáforo). Exceção: `telegram_interno`/`painel`.
- **Motor EvoNexus PROIBIDO** em prod — só o paradigma.
- **SQL aditivo/reversível = autônomo**; DROP/DELETE/TRUNCATE em massa / DDL destrutivo sobre dados reais = confirmar com o Wandson.
- **Agente nunca toca segredo** — credenciais só no env do Bridge via Infisical.
- **Output bruto > resumo**; testar no browser antes de declarar pronto.

---

## 7. 🛑 PRÓXIMA AÇÃO

**Aguardando aprovação do Wandson para iniciar a FASE 1 (o Loop).** Ao aprovar, a primeira fatia é `20260623_001_loop_core.sql` (migration aditiva, autônoma) + `createLoopTask()`. Nada de produção/cliente é tocado até lá.
