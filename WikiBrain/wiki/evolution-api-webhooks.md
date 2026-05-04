# Evolution API v2 — Webhook Architecture

## Problema que motivou esta página

Em 04/05/2026, diagnosticamos que o webhook da instância `suporte-consult-delivery` apontava para `https://messaging.g1.datacrazy.io/...` com `enabled: false` — mas o `GET /webhook/find` via REST API retornou `enabled: true` apontando para o Supabase. Isso revelou que a Evolution v2 tem **duas camadas independentes de webhook** que podem divergir.

---

## Duas Camadas de Webhook

### Camada 1 — Global Webhook (configurado no servidor)

- Definido via variáveis de ambiente do servidor (`.env` no servidor Evolution):
  ```
  WEBHOOK_GLOBAL_ENABLED=true
  WEBHOOK_GLOBAL_URL=https://...
  WEBHOOK_GLOBAL_WEBHOOK_BY_EVENTS=false
  ```
- Visível no **painel UI** da Evolution (EvolutionX Manager)
- Aplica-se a todas as instâncias por padrão
- Não é modificável via REST API — requer acesso direto ao servidor

### Camada 2 — Instance Webhook (configurado via REST API)

- Configurado por instância via `POST /webhook/set/{instance}`
- Lido via `GET /webhook/find/{instance}`
- Tem precedência sobre o webhook global para aquela instância
- **É a camada que o Claude Code manipula** — porém o painel UI pode mostrar outra coisa

### Por que as camadas divergem

O painel UI exibe o webhook global, mas o `GET /webhook/find/{instance}` retorna a configuração da instância. Se uma instância tem webhook próprio configurado e o servidor tem webhook global, **ambos podem disparar** — ou apenas um, dependendo da versão da Evolution e da configuração.

Lição: **sempre mostrar o output bruto do `GET /webhook/find` ao diagnosticar** — não resumir o resultado sem exibir o JSON.

---

## Endpoints REST

### GET /webhook/find/{instance}

Retorna a configuração atual da instância:

```json
{
  "id": "cmog6t5qi0aslno4w63g2h6s2",
  "url": "https://czyanilrverorwenikqw.supabase.co/functions/v1/evolution-webhook",
  "headers": null,
  "enabled": true,
  "events": ["MESSAGES_UPSERT"],
  "webhookByEvents": false,
  "webhookBase64": true,
  "createdAt": "2026-04-26T19:54:43.145Z",
  "updatedAt": "2026-05-04T21:06:46.334Z",
  "instanceId": "aa28496c-69f4-4add-aa1a-d3fef4840448"
}
```

### POST /webhook/set/{instance}

Body obrigatório:
```json
{
  "webhook": {
    "enabled": true,
    "url": "https://your-endpoint.com/webhook",
    "webhook_by_events": false,
    "events": ["MESSAGES_UPSERT"]
  }
}
```

---

## Campos importantes

| Campo | Significado |
|---|---|
| `enabled` | Se `false`, nenhum evento é enviado para a URL |
| `url` | Endpoint de destino. Deve ser a Supabase Edge Function |
| `events` | Eventos subscritos. Usar `["MESSAGES_UPSERT"]` para mensagens recebidas |
| `webhookByEvents` | Se `true`, cada evento vai para uma URL separada (ex: `/webhook-messages-upsert`). **Deixar false** |
| `webhookBase64` | Se `true`, mídia é embutida como base64 no payload. **Problemas em produção** com arquivos grandes (bug #2375). Preferir `false` |

---

## Eventos suportados (principais)

- `MESSAGES_UPSERT` — mensagem recebida ou enviada (checar `key.fromMe` para distinguir)
- `CONNECTION_UPDATE` — status de conexão (open, close, connecting)
- `QRCODE_UPDATED` — novo QR Code disponível
- `MESSAGES_UPDATE` — status de entrega/leitura
- `GROUPS_UPSERT`, `GROUP_PARTICIPANTS_UPDATE` — eventos de grupo

---

## Comportamento de retry (não configurável)

- 10 tentativas com intervalo de 30 segundos entre elas
- Retenta mesmo em erros permanentes (401, 404) — desperdício
- Bug documentado (#1325): envio duplicado mesmo com HTTP 200

**Consequência:** a Edge Function deve ser idempotente usando `evolution_message_id` como chave de unicidade.

---

## Nossa configuração padrão (Consult Delivery)

```json
{
  "enabled": true,
  "url": "https://czyanilrverorwenikqw.supabase.co/functions/v1/evolution-webhook",
  "webhook_by_events": false,
  "events": ["MESSAGES_UPSERT"],
  "webhookBase64": false
}
```

`webhookBase64: false` porque mídia é buscada separadamente via `getBase64FromMediaMessage` (já implementado na edge function com timeout de 10s).

---

## Self-healing automático

Implementado em `feature/webhook-self-healing` (2026-05-04):

- **Frontend** (`src/lib/api.js`): `ensureWebhookConfig(instanceName, opts)` — GET + correção + log em `audit_log`
- **Bridge Server** (`bridge-server/webhookGuard.js`): job que roda a cada hora, verifica todas as instâncias
- **SettingsScreen**: badge verde/vermelho por instância mostrando status em tempo real

---

## Diagnóstico rápido

```bash
# Verificar configuração atual da instância
curl -s -X GET "https://evo-go-evolution-api.3kork4.easypanel.host/webhook/find/suporte-consult-delivery" \
  -H "apikey: E609B026967A-4B6D-A397-4355F7E4B348" | python -m json.tool

# Corrigir (sobrescreve com config correta)
curl -s -X POST "https://evo-go-evolution-api.3kork4.easypanel.host/webhook/set/suporte-consult-delivery" \
  -H "apikey: E609B026967A-4B6D-A397-4355F7E4B348" \
  -H "Content-Type: application/json" \
  -d '{"webhook":{"enabled":true,"url":"https://czyanilrverorwenikqw.supabase.co/functions/v1/evolution-webhook","webhook_by_events":false,"events":["MESSAGES_UPSERT"]}}'
```

---

*Criada em: 2026-05-04 | Atualizar se Evolution API for atualizada ou URL do Supabase mudar.*

[[Evolution API]] · [[WhatsApp]] · [[Supabase Edge Functions]] · [[Bridge Server]]
