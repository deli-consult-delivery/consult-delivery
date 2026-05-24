# T2 — Chat ao Vivo: Inventory
S1-G00 Reconhecimento | 2026-05-24

> ISOLAMENTO: EvoNexus ignorado. Foco: /root/consult-delivery + Supabase czyanilrverorwenikqw / tenant='consult'.
> RECON APENAS — nenhuma alteração de código.

---

## FLUXO COMPLETO: Evolution → Supabase → Bridge → Trigger.dev

```
Cliente WhatsApp
    │
    ▼
Evolution API (porta Evolution na VPS)
    │  POST webhook → Supabase Edge Function URL
    ▼
supabase/functions/evolution-webhook/index.ts   ← ponto de entrada principal
    │
    ├─ Escreve: whatsapp_messages, whatsapp_contacts, whatsapp_groups
    ├─ Escreve: conversations, messages (backward compat)
    ├─ T6: whatsapp_aprovacao_sessions → aprovação de tarefas por WhatsApp
    ├─ Bot auto-resposta: bot_configs → fora do horário → Evolution API
    │
    ├─ @menção de agente (exceto @deli) → POST Bridge /analise  ── enqueueAgentInvoke()
    │       ↓ Trigger.dev task analise-ifood-run
    │
    └─ PV inbound, sem menção, breno_paused=false → POST Bridge /internal/agents/breno-processar-webhook/run
            ↓ triggerBrenoIfNeeded()
            ↓ Trigger.dev task: breno-processar-webhook
                    ↓ (se hibrido ou ia): brenoResponder.trigger()
                    ↓ Trigger.dev task: breno-responder
```

---

## EDGE FUNCTION: evolution-webhook/index.ts

| Campo | Valor |
|-------|-------|
| Path | `supabase/functions/evolution-webhook/index.ts` |
| Linhas | 1297 |
| Versão | v3 (comentário no topo) |
| Deploy | `supabase functions deploy evolution-webhook` |
| BRIDGE_URL | `Deno.env.get('BRIDGE_SERVER_URL') \|\| 'http://187.127.25.24:3001'` |

### Eventos tratados

| Evento | Handler | Ação principal |
|--------|---------|----------------|
| MESSAGES_UPSERT | `handleMessagesUpsert` | Escreve `whatsapp_messages` + `messages` + `conversations`. Dispara BRENO e bot. |
| CONNECTION_UPDATE | `handleConnectionUpdate` | Atualiza `evolution_instances.status`. Notifica desconexão. |
| MESSAGES_UPDATE | `handleMessagesUpdate` | Atualiza `messages.delivery_status` |
| MESSAGES_DELETE | `handleMessagesDelete` | Soft-delete: `messages.deleted_at`, content = '🚫 Mensagem apagada' |
| CONTACTS_UPSERT / UPDATE | `handleContactsUpsert` | Upsert em `whatsapp_contacts` |
| GROUPS_UPSERT | `handleGroupsUpsert` | Upsert em `whatsapp_groups` |
| GROUP_UPDATE | `handleGroupUpdate` | Atualiza `whatsapp_groups.group_name` |
| GROUP_PARTICIPANTS_UPDATE | `handleGroupParticipantsUpdate` | Add/remove em `whatsapp_group_members` |
| SEND_MESSAGE | `handleSendMessage` | Mensagem enviada — salva outbound, dedup por content+30s |
| CHATS_UPDATE | `handleChatsUpdate` | Arquiva `conversations.status_v2 = 'archived'` |

### Detecção de menção a agente

```
MENTION_REGEX = /@(analista|copiloto|co-piloto|deli|cora|lara|sofia|breno|max|vera)\b/i
```

- `@copiloto` → alias de `analista-ifood`
- **`@deli` → NOT dispatched ao Bridge** (linha 462 explicitamente exclui `deli`)
  - DELI mencionada é registrada em `whatsapp_messages.mentioned_agent` mas não invocada via webhook
- Qualquer outro agente → `enqueueAgentInvoke()` → `POST Bridge /analise`

### BRENO no webhook (triggerBrenoIfNeeded)

Condição de disparo:
```
!isGroup && convId && savedMsg && messageText && !isMentionToBot
```

Verificações internas:
1. Lê `conversations.breno_paused` — se true, pula
2. Chama `POST ${BRIDGE_URL}/internal/agents/breno-processar-webhook/run` com `x-bridge-secret`

### Bot fora-de-horário

- Tabela: `bot_configs` (tenant_id, is_active, schedule jsonb, message, respond_only_first, timezone)
- Dedup atômico via `bot_reply_log` (PK: conversation_id + reply_date)
- Envia via `Evolution /message/sendText/{instance}`
- Salva na tabela `messages` como `direction='outbound'`, `sender_name='Bot'`

### T6 — Aprovação de tarefas via WhatsApp

- Trigger: PV inbound, texto, sessão ativa em `whatsapp_aprovacao_sessions`
- Parser inline `parseRespostaClienteLocal()` — reconhece: "ok 5", "ok bloco marketing", "ok tudo", "nao 3", "duvida 2"
- Atualiza `tarefas_loja.status` + insere `tarefa_aprovacoes`
- Encerra sessão quando todas as tarefas processadas
- 5 sessões ativas no banco

---

## BRENO — Status e Extension Points

### Status atual: ⚠️ SCAFFOLDED, 0 RUNS

| Campo | Valor |
|-------|-------|
| Task IDs | `breno-processar-webhook`, `breno-responder`, `breno-resumir-conversa` |
| Arquivos | `trigger/breno/processar-webhook.ts`, `responder.ts`, `resumir-conversa.ts` |
| Runs em agent_runs | **0** (jamais executou em produção) |
| Modo default | `hibrido` (draft) — `tenant_agent_config` vazio para breno |

### Output bruto: tenant_agent_config para breno

```sql
SELECT * FROM tenant_agent_config WHERE agent_id = 'breno';
-- (0 rows)
```

**Não há configuração de BRENO no banco.** A task defaulta para `modo = "hibrido"`.

### Bug crítico: coluna errada na task

`trigger/breno/processar-webhook.ts:110`:
```ts
.eq("agent_slug", "breno")   // ← ERRADO
```
Coluna real na tabela `tenant_agent_config`: **`agent_id`** (não `agent_slug`).
Resultado: query retorna `null`, `data: config = null`, modo defaulta para `"hibrido"`.
Não quebra — apenas não lê config do banco. **→ TD#40**

### Modos de operação BRENO

| Modo | Comportamento |
|------|---------------|
| `humano` | Registra audit, não age |
| `hibrido` | Dispara `breno-responder` para gerar draft (sugestão para humano aprovar) |
| `ia` | Dispara `breno-responder` para resposta automática + notifica equipe |

### Colunas de extensão em conversations

| Coluna | Tipo | Uso |
|--------|------|-----|
| `breno_paused` | boolean NOT NULL | Se true, Edge Function não dispara BRENO |
| `last_breno_handled_at` | timestamptz | Registra última atuação do BRENO |

---

## DELI — Extension Points no Chat

### Copilot: /chat/ai (Bridge)

- Endpoint: `POST /chat/ai` — stateless, sem Trigger.dev
- Auth: JWT Supabase obrigatório
- Model: `claude-haiku-4-5-20251001`
- Comandos: `/resumir`, `/proxima`, `/traduzir`, `/tom`, `/cobranca`, `/livre`, `/resposta`
- **Sem logging em agent_runs** (TD#37)

### DELI via @menção no WhatsApp

- `@deli` em grupo → `mentioned_agent = 'deli'` em `whatsapp_messages`
- `processed_by_deli = false` (default) — coluna existe, não usada ativamente
- **NÃO é dispatched ao Bridge** — linha 462 da Edge Function exclui `deli` do `enqueueAgentInvoke()`
- **Extension point**: DELI poderia escutar Supabase Realtime em `whatsapp_messages` WHERE `mentioned_agent = 'deli'` AND `processed_by_deli = false`

### DELI cron (revisao-matinal)

- Runs diariamente (11 runs, 10 sucessos)
- Não monitorá mensagens de WhatsApp — opera sobre dados do DB

---

## TABELAS DE CHAT — Schema e Rowcounts

### OUTPUT BRUTO: rowcounts

```sql
SELECT
  (SELECT COUNT(*) FROM conversations) as conversations_count,
  (SELECT COUNT(*) FROM messages) as messages_count,
  (SELECT COUNT(*) FROM whatsapp_messages) as whatsapp_messages_count,
  (SELECT COUNT(*) FROM whatsapp_groups) as whatsapp_groups_count,
  (SELECT COUNT(*) FROM whatsapp_contacts) as whatsapp_contacts_count,
  (SELECT COUNT(*) FROM whatsapp_aprovacao_sessions) as aprovacao_sessions_count,
  (SELECT COUNT(*) FROM channel_messages) as channel_messages_count;

conversations_count: 105
messages_count:      5058
whatsapp_messages:   2449
whatsapp_groups:     69
whatsapp_contacts:   94
aprovacao_sessions:  5
channel_messages:    39
```

### conversations (105 rows)

| Coluna | Tipo | NOT NULL | Nota |
|--------|------|----------|------|
| id | uuid | ✅ | PK |
| tenant_id | uuid | | |
| type | text | | |
| customer_id | uuid | | |
| agent_id | text | | agente responsável |
| status | text | ✅ | aguardando/automacao/em_atendimento/finalizado |
| status_v2 | USER-DEFINED | | open/in_progress/closed/archived (enum) |
| whatsapp_chat_id | text | | JID do chat Evolution |
| instance_id | uuid | | FK evolution_instances |
| is_group | boolean | | |
| assigned_to | uuid | | FK users |
| department_id | uuid | | FK departments |
| **breno_paused** | boolean | ✅ | extension point BRENO |
| **last_breno_handled_at** | timestamptz | | extension point BRENO |
| close_reason | text | | |
| internal_notes | text | | |

### messages (5058 rows)

| Coluna | Tipo | NOT NULL | Nota |
|--------|------|----------|------|
| id | uuid | ✅ | |
| conversation_id | uuid | ✅ | |
| direction | text | ✅ | inbound/outbound |
| sender_kind | text | | user/agent/bot |
| sender_agent_id | text | | |
| content | text | | texto |
| media_type | text | | audio/image/video/document |
| media_url | text | | base64 ou URL |
| whatsapp_msg_id | text | | dedup key da Evolution |
| quoted_content | jsonb | | reply context |
| reactions | jsonb | ✅ | array de {jid,emoji,name} |
| delivery_status | smallint | | WhatsApp delivery ticks |
| deleted_at | timestamptz | | soft-delete |

### whatsapp_messages (2449 rows)

| Coluna | Tipo | NOT NULL | Nota |
|--------|------|----------|------|
| evolution_message_id | text | ✅ | dedup key |
| is_mention_to_bot | boolean | ✅ | |
| **mentioned_agent** | text | | nome do agente mencionado |
| **processed_by_deli** | boolean | ✅ | extension point DELI |
| sender_contact_id | uuid | ✅ | |
| group_id / contact_id / conversation_id | uuid | | |
| media_metadata | jsonb | | |

### whatsapp_groups (69 rows)

| Coluna | Nota |
|--------|------|
| evolution_jid | PK natural |
| loja_id | FK lojas (vínculo grupo ↔ cliente) |
| bom_dia_ativo | controla BomDia por grupo |
| encerramento_ativo | controla Encerramento por grupo |

### whatsapp_contacts (94 rows)

| Coluna | Nota |
|--------|------|
| is_internal | membro da equipe CD |
| internal_user_id | FK users |
| loja_id | FK lojas (quando contact é cliente) |

### whatsapp_aprovacao_sessions (5 rows)

Sessões de aprovação de tarefas via WhatsApp (T6).
Campos: `numero_destino`, `analise_id`, `loja_id`, `status` (ativa/concluida), `encerrada_em`.

### channel_messages (39 rows)

Chat interno (não WhatsApp). Campos: `channel_id`, `sender_id`, `text`, `is_pinned`, `task_created`, `media_url`, `media_type`.
Não integrado com Evolution API.

---

## REACT UI — Chat

### Arquivos

| Arquivo | Responsabilidade |
|---------|-----------------|
| `src/screens/ChatScreen.jsx` | Tela principal do chat (componente monolítico, ~1000+ linhas) |
| `src/components/chat/ChatLayout.jsx` | Layout 3 colunas: lista \| janela \| lead panel |
| `src/components/chat/ConversationFiltersBar.jsx` | Filtros de conversa |
| `src/components/chat/DepartmentSelector.jsx` | Seletor de departamento |
| `src/components/chat/ConversationStatusBadge.jsx` | Badge de status |
| `src/components/chat/LeadPanel.jsx` | Painel lateral de info do lead |
| `src/lib/evolution.js` | Chamadas diretas à Evolution API: sendText, sendMedia, sendAudio, fetchProfile, fetchGroups, fetchContacts, deleteMessage |
| `src/lib/conversationStatus.js` | Hook `useConversationStatus` + `STATUS_EMOJI` |

### HAS_EVO guard

```js
const HAS_EVO = !!(import.meta.env.VITE_EVOLUTION_URL && import.meta.env.VITE_EVOLUTION_KEY);
```
Bloqueia funcionalidades Evolution quando variáveis ausentes.

### AI commands no ChatScreen

```js
const AI_COMMANDS = [
  { cmd: '/resumir'  }, { cmd: '/traduzir' }, { cmd: '/tom'   },
  { cmd: '/proxima'  }, { cmd: '/tarefa'   }, { cmd: '/cobranca' },
  { cmd: '/handoff'  },
];
```

`/tarefa` e `/handoff` estão no UI mas **não documentados no Bridge `/chat/ai`** — possível gap. → TD#41

### AI Superagents mostrados no ChatScreen

```js
const AI_SUPERAGENTS = [
  { id: 'deli' }, { id: 'cora' }, { id: 'max' }, { id: 'vera' }, { id: 'lara' },
];
```

**BRENO não aparece no AI_SUPERAGENTS** — ausente da lista visual da UI.

---

## EDGE FUNCTIONS DEPLOYADAS

```
supabase/functions/manage-users/index.ts          — gestão de usuários
supabase/functions/analista-callback/index.ts     — callback do analista iFood
supabase/functions/persist-profile-pic/index.ts   — foto de perfil WhatsApp
supabase/functions/dispatch-push-notification/index.ts — push notifications
supabase/functions/evolution-webhook/index.ts     — webhook Evolution (principal)
```

---

## TECH DEBTS IDENTIFICADOS EM T2

| TD | Severidade | Descrição |
|----|-----------|-----------|
| TD#40 | 🔴 Alta | BRENO: processar-webhook.ts usa `.eq("agent_slug", "breno")` mas coluna é `agent_id` — query sempre falha silenciosamente |
| TD#41 | 🟡 Média | ChatScreen tem `/tarefa` e `/handoff` como AI commands mas Bridge `/chat/ai` não os processa |
| TD#42 | 🟡 Média | BRENO scaffolded mas nunca executou — verificar se task está deployada no Trigger.dev cloud e configurar tenant_agent_config |
| TD#43 | 🔵 Observação | `@deli` em grupo é logada mas não invocada — DELI precisa de Realtime listener em whatsapp_messages para responder a menções |

---

*Gerado em: 2026-05-24 | S1-G00 T2*
