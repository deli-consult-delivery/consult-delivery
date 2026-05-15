# DELI · COO Digital

**Status:** ✅ Ativa — Feature V2-6 concluída em 15/05/2026  
**Role necessário:** `admin`, `owner` ou `deli_owner`  
**Usuário principal:** Wandson Silva (CEO)  
**Integração externa:** nenhuma direta (orquestra outros agentes)  
**Orquestrador:** Trigger.dev (projeto `proj_slexhoelcjwgbopmbzzr`)

---

## Identidade

DELI é a COO Digital da Consult Delivery. Ela é o braço direito do CEO Wandson Silva: monitora o estado do negócio em tempo real, propõe ações estratégicas com semáforo de autonomia e orquestra todos os demais agentes (LARA, VERA, CORA, SOFIA, BRENO).

DELI **nunca** responde clientes finais. Ela fala exclusivamente com a equipe interna (Wandson, Wélida, Eduardo) e reporta via painel, `deli_messages` e notificações push.

DELI opera com semáforo de autonomia:
- 🟢 **Verde** — executa e reporta sem aprovação
- 🟡 **Amarelo** — propõe ação, aguarda "ok" do Wandson
- 🔴 **Vermelho** — requer aprovação explícita "APROVADO VERMELHO apr-xxx"

---

## Trigger.dev Tasks

### `deli-conversa` ([trigger/deli/conversa.ts](../../trigger/deli/conversa.ts))

Task principal de conversa estratégica com o CEO. DELI mantém histórico, usa memórias persistentes e aciona agentes especialistas via tool use.

**Input:**
```ts
{
  tenant_id: uuid,
  user_id: uuid,
  message: string,            // min 1, max 4000 chars
  triggered_by?: uuid,
}
```

**Output:**
```ts
{
  ok: boolean,
  reply: string,
  memories_used: number,
  lara_triggered?: boolean,
  agents_triggered?: string[], // ex: ["lara", "vera"]
}
```

**Ferramentas disponíveis no loop agentico:**
| Tool | Descrição |
|------|-----------|
| `acionar_lara` | Tasks: `pesquisar-loja`, `gerar-conteudo`, `analisar-tendencia` |
| `acionar_vera` | Tasks: `vera-responder-pergunta`, `vera-snapshot-diario` |
| `acionar_cora` | Escalonar cobrança via `cora-escalonar` |
| `acionar_sofia` | Gerar abordagem via `sofia-gerar-abordagem` |
| `acionar_breno` | Pausar ou liberar BRENO em uma conversa |
| `consultar_kpis` | Busca direta no banco: `snapshot_vera`, `cobrancas_vencidas`, `prospects_novos`, `conversas_abertas`, `anomalias_ativas` |

**Efeitos colaterais:**
- Salva mensagens (user + assistant) em `deli_messages`
- Se a mensagem contém decisão (regex: "decidimos", "ficou acertado", etc.), salva memória em `agent_memories` com `kind = 'decision'`, `importance = 7`
- Loop agentico: até 5 turns antes de forçar resposta final

**Modelo:** `claude-sonnet-4-6` (único agente que usa Sonnet — conversas estratégicas exigem raciocínio mais complexo)

---

### `deli-revisao-matinal` ([trigger/deli/revisao-matinal.ts](../../trigger/deli/revisao-matinal.ts))

Revisão executiva automática gerada todo dia às 8h UTC. Agrega dados de todos os sistemas e gera resumo com semáforo.

**Schedule:** cron `0 8 * * *` via `deli-revisao-matinal-schedule` (fan-out por tenant)

**Input:**
```ts
{
  tenant_id: uuid,
  triggered_by?: uuid,
}
```

**Output:**
```ts
{
  ok: boolean,
  tenant_id: uuid,
  resumo: string,             // Texto gerado pelo Claude Haiku com semáforos 🟢🟡🔴
  alertas: string[],          // Linhas com ⚠️ ou 🔴 extraídas do resumo
  acoes_sugeridas: string[],  // Linhas com ✅, → ou "Ação" extraídas do resumo
}
```

**Fontes de dados agregadas:**
| Tabela | O que lê |
|--------|----------|
| `vera_metricas_snapshot` | Snapshot mais recente de métricas VERA |
| `cora_cobrancas` | Count e soma de pendentes/vencidas |
| `prospects` | Count com `status = 'novo'` |
| `conversations` | Count com `status IN ('open', 'pendente')` |
| `vera_anomalias` | Até 5 anomalias não resolvidas |

**Efeitos colaterais:**
- Salva resumo em `deli_messages` com `metadata.tipo = 'revisao_matinal'`
- Salva em `deli_agenda` (se tabela disponível)
- Notifica todos os usuários do tenant via `notify()` com `kind = 'deli_alert'`

**Modelo:** `claude-haiku-4-5-20251001` — resumo diário não precisa de Sonnet

---

### `deli-supervisionar` ([trigger/deli/supervisionar.ts](../../trigger/deli/supervisionar.ts))

Analisa o estado operacional de todos os agentes (falhas, custos, anomalias) e produz diagnóstico executivo. Pode acionar agentes corretivos.

**Input:**
```ts
{
  tenant_id: uuid,
  contexto: string,           // min 1, max 2000 chars — contexto adicional
  pergunta?: string,          // max 500 chars — pergunta específica opcional
  triggered_by?: uuid,
}
```

**Output:**
```ts
{
  ok: boolean,
  diagnostico: string,
  falhas_detectadas: number,
  custo_total_24h_usd: number,
  acoes_tomadas: string[],
}
```

**Fontes de dados:**
| Tabela | O que lê |
|--------|----------|
| `agent_runs` | Últimas 24h — status, custo, agente |
| `vera_anomalias` | Anomalias ativas não resolvidas |

**Ferramentas disponíveis:** `acionar_lara`, `acionar_vera`, `acionar_cora`, `acionar_sofia` — DELI pode acionar agentes corretivos automaticamente (semáforo Verde).

**Efeitos colaterais:**
- Salva diagnóstico em `deli_messages` com `metadata.tipo = 'supervisao'`
- Loop agentico: até 3 turns

**Modelo:** `claude-sonnet-4-6`

---

## Schema do banco

### `public.deli_messages`

Histórico de todas as conversas e relatórios de agentes no contexto DELI.

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | uuid PK | |
| `tenant_id` | uuid FK tenants | |
| `user_id` | uuid nullable | NULL = mensagem de agente (não de humano) |
| `role` | text | `user` \| `assistant` |
| `content` | text | Conteúdo da mensagem |
| `metadata` | jsonb nullable | `source_agent`, `source_task`, `run_id`, `tipo` |
| `created_at` | timestamptz | |

**Convenção:** `user_id IS NULL` + `metadata.source_agent != null` = relatório de agente (LARA, MAX, etc. postam aqui para DELI monitorar).

---

### `public.agent_memories`

Memórias persistentes de DELI por tenant — contexto que persiste entre conversas.

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `agent_id` | text | `'deli'` |
| `tenant_id` | uuid | |
| `user_id` | uuid nullable | Usuário que gerou a memória |
| `kind` | text | `decision` \| `fact` \| `preference` \| etc. |
| `content` | text | Conteúdo da memória (até 250 chars recomendado) |
| `importance` | int | 1–10 — ordena quais memórias são carregadas (top 15) |
| `created_at` | timestamptz | |

---

### `public.deli_agenda`

Registro de revisões matinais e eventos agendados da DELI.

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `tenant_id` | uuid | |
| `tipo` | text | `revisao_matinal` \| outros |
| `resumo` | text | Texto gerado |
| `alertas` | text[] | Alertas extraídos |
| `acoes_sugeridas` | text[] | Ações sugeridas |
| `agent_run_id` | uuid nullable | FK agent_runs |

---

## Migrations

| Arquivo | O que faz |
|---------|-----------|
| `20260504_005_drafts_deli.sql` | `agent_drafts`, `deli_triggers`, `deli_pending_approvals`, `deli_actions_log` |
| `20260514_011_deli_messages.sql` | Tabela `deli_messages` com índices e RLS |
| `20260529_001_deli_agenda.sql` | Tabela `deli_agenda` para histórico de revisões |

---

## UI — tela `/agentes/deli` (DeliScreen)

**Componente:** `src/screens/DeliScreen.jsx`  
**Rota:** `/deli`

### Seções

| Seção | Função |
|-------|--------|
| Chat | Conversa direta com DELI — invoca `deli-conversa` |
| Revisão Matinal | Última revisão gerada + histórico de revisões anteriores em `deli_agenda` |
| Supervisão | Painel de status dos agentes — invoca `deli-supervisionar` manualmente |
| Memórias | Lista e edita memórias em `agent_memories` |

### Realtime

- Canal `deli-messages-realtime` → tabela `deli_messages` — mensagens aparecem em tempo real, inclusive relatórios de outros agentes
- Notificações push via `notifications` quando revisão matinal chega

---

## RBAC

| Papel | Pode invocar tasks DELI | Acessa tela |
|-------|------------------------|-------------|
| `admin` / `owner` | ✅ | ✅ |
| `deli_owner` | ✅ (invoke + approve_drafts) | ✅ |
| outros | ❌ | ❌ |

Bridge Server valida via `requireAgentAccess` → prefixo `deli-` restrito a admin/owner.

---

## Variáveis de ambiente necessárias

| Variável | Onde | Descrição |
|----------|------|-----------|
| `ANTHROPIC_API_KEY` | Infisical + Trigger.dev | Claude Sonnet (conversa/supervisão) e Haiku (revisão matinal) |
| `SUPABASE_SERVICE_ROLE_KEY` | Infisical + Trigger.dev | Leitura/escrita em todas as tabelas monitoradas |
| `TRIGGER_SECRET_KEY` | Bridge Server | Autenticação Trigger.dev + triggers de outros agentes |

---

## Decisões de design

- DELI usa `claude-sonnet-4-6` em conversas e supervisão — única agente que usa Sonnet (decisões estratégicas)
- `deli-revisao-matinal` usa Haiku — resumo diário não requer raciocínio complexo, e executa para todos os tenants
- Até 15 memórias são carregadas por conversa, ordenadas por `importance DESC`; memórias de decisão têm `importance = 7`
- Histórico de conversa: até 25 mensagens (inclui relatórios de agentes com `user_id IS NULL`)
- Loop agentico: 5 turns max em `deli-conversa`, 3 turns em `deli-supervisionar`
- DELI é a única agente que aciona outras agentes diretamente via `tasks.trigger()` da Trigger.dev SDK
- Schedule da revisão matinal: cron `0 8 * * *` (8h UTC = 5h BRT) — fan-out por tenant ativo

---

## Referências cruzadas

- `trigger/_shared/audit.ts` — `logAgentRun()`
- `trigger/_shared/notify.ts` — `notify()` para push notifications
- `trigger/_shared/notify-deli.ts` — `notifyDeli()` usado por LARA, MAX e outros para postar em `deli_messages`
- `bridge-server/index.js` — rota `/agents/:slug/run` e webhook handlers
- `supabase/migrations/20260504_005_drafts_deli.sql`
- `supabase/migrations/20260514_011_deli_messages.sql`
- `supabase/migrations/20260529_001_deli_agenda.sql`
- `CLAUDE.md` § 16 — semáforo de autonomia e triggers iniciais da DELI
- `CLAUDE.md` § 5 — identidades dos agentes e papel do COO digital
