# BRENO · Atendimento & Suporte

**Status:** ✅ Ativo — Feature V2-2 concluída em 15/05/2026  
**Role necessário:** `atendimento` ou `admin`  
**Integração externa:** Evolution API (WhatsApp)  
**Orquestrador:** Trigger.dev (projeto `proj_slexhoelcjwgbopmbzzr`)

---

## Identidade

BRENO é o assistente de atendimento da Consult Delivery. Ajuda a equipe (principalmente Eduardo) a responder clientes de delivery com simpatia e eficiência via WhatsApp.

BRENO **nunca** responde clientes finais sem passar pelo fluxo de aprovação, exceto quando `mode = 'ia'` (autonomia total habilitada explicitamente).

---

## Modos de operação

Controlado por `tenant_agent_config.mode` (colunas: `tenant_id`, `agent = 'breno'`, `mode`).

| Modo | Comportamento |
|------|---------------|
| `humano` | BRENO não age — registra `action_taken: 'skipped'` em `breno_interactions` |
| `hibrido` | BRENO gera resposta → cria draft em `agent_drafts` → Eduardo aprova/rejeita |
| `ia` | BRENO envia diretamente via Evolution API → registra outbound em `messages` |

---

## Trigger.dev Tasks

### `breno-responder` ([trigger/breno/responder.ts](../../trigger/breno/responder.ts))

Analisa mensagem recebida e gera resposta ou encaminha para humano.

**Input:**
```ts
{
  tenant_id: uuid,
  conversation_id: uuid,
  message_id: uuid,
  message: string,
  sender_name?: string,
  context_messages: Array<{ role: 'client' | 'team', content: string }>,
  triggered_by?: uuid,
}
```

**Output:**
```ts
{
  ok: boolean,
  resposta: string,
  tom: 'amigavel' | 'informativo' | 'empatico' | 'urgente',
  draft_id?: uuid,
  precisa_humano: boolean,
  motivo_humano?: string,
  action_taken: 'sent' | 'suggested' | 'skipped',
  mode: string,
}
```

### `breno-resumir-conversa` ([trigger/breno/resumir-conversa.ts](../../trigger/breno/resumir-conversa.ts))

Analisa o histórico de uma conversa e produz resumo estruturado.

**Output:**
```ts
{
  ok: boolean,
  resumo: {
    assunto_principal: string,
    pontos_chave: string[],
    pendencias: string[],
    sentimento_cliente: 'positivo' | 'neutro' | 'negativo' | 'critico',
    urgencia: 'baixa' | 'media' | 'alta',
    proxima_acao: string,
  }
}
```

---

## Fluxo de ativação automática (WhatsApp)

```
Mensagem PV → Evolution → evolution-webhook (Edge Function)
  → triggerBrenoIfNeeded()
    → verifica breno_paused na conversations
    → se não pausado: POST /internal/agents/breno-responder/run (Bridge Server)
      → Bridge Server → Trigger.dev API → breno-responder task
```

**Condições para BRENO não disparar:**
- `conversations.breno_paused = true` (Eduardo assumiu manualmente)
- Mensagem em grupo (`@g.us`) — BRENO só age em PVs
- Mensagem de saída (direction = outbound)
- Mensagem vazia

---

## Schema

### `breno_interactions`
Audit log de toda decisão do BRENO.

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `tenant_id` | uuid | Multi-tenant |
| `conversation_id` | uuid | FK conversations |
| `inbound_message_id` | uuid | Mensagem que disparou |
| `outbound_message_id` | text | ID WhatsApp da resposta enviada (mode=ia) |
| `mode` | text | humano/hibrido/ia |
| `breno_response` | text | Resposta gerada |
| `action_taken` | text | sent/suggested/skipped |
| `requires_review` | boolean | true se mode=hibrido |
| `agent_run_id` | text | Trigger.dev run ID |

### Colunas adicionadas em `conversations`

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `last_breno_handled_at` | timestamptz | Última vez que BRENO atuou |
| `breno_paused` | boolean | Eduardo assumiu — BRENO silencia |

---

## UI

### ChatScreen ([src/screens/ChatScreen.jsx](../../src/screens/ChatScreen.jsx))
- **Badge na lista de conversas:** 🤖 BRENO (roxo) quando ativo, ⏸ BRENO (cinza) quando pausado
- **Botão "Pausar/Liberar BRENO"** no header do chat (aparece se BRENO já atuou)
- **Banner de sugestão BRENO:** aparece quando `mode=hibrido` — mostra resposta gerada com "Usar resposta" (preenche rascunho) e "Dispensar"

### BrenoScreen ([src/screens/BrenoScreen.jsx](../../src/screens/BrenoScreen.jsx)) — rota `/agentes/breno`
- **Aba Estatísticas:** totais de interações, enviadas, sugestões pendentes, lista recente
- **Aba Responder:** invoca BRENO manualmente com mensagem e conversa
- **Aba Resumir:** gera resumo estruturado de qualquer conversa
- **Aba Drafts:** aprova/rejeita drafts gerados pelo BRENO em modo híbrido

---

## Variáveis de ambiente necessárias (Bridge Server / Edge Function)

| Variável | Onde | Descrição |
|----------|------|-----------|
| `BRIDGE_URL` | Edge Function | URL do Bridge Server |
| `BRIDGE_SECRET` | Edge Function | Shared secret para rota interna |
| `TRIGGER_SECRET_KEY` | Bridge Server | Autenticação Trigger.dev |

---

## Decisões de design

- BRENO usa `claude-haiku-4-5-20251001` para velocidade e custo baixo em atendimento
- `breno_paused` é por conversa, não global — permite Eduardo assumir seletivamente
- O disparo automático é fire-and-forget na Edge Function (não bloqueia o webhook)
- Retry: 3 tentativas com backoff de 1s no Trigger.dev
