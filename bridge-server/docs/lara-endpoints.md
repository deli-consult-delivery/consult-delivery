# Bridge Server — Endpoints LARA

> Especificação dos endpoints que o Bridge Server (Express :3001) precisa expor
> para a LARA funcionar end-to-end. Implementação fica a cargo do dev (Yasmin/Wandson).
> Versão: 1.0 — 06/05/2026

---

## Visão geral

```
React (frontend) ──▶ Bridge Server :3001 ──▶ OpenClaw :18789 (LARA)
                              │
                              └──▶ Nexus (Evonexus)
                              │
                              ◀── Nexus callback
                              │
                              └──▶ Supabase (persist)
```

3 endpoints:

1. `POST /invoke/lara` — frontend chama LARA
2. `POST /api/nexus-dispatch/:agent` — LARA chama Nexus (proxy interno)
3. `POST /api/nexus-callback` — Nexus retorna assíncrono

---

## 1. POST /invoke/lara

### Propósito
Frontend (aba Régua/Disparo) envia mensagem da Wélida pra LARA.

### Auth
- Header `Authorization: Bearer {supabase_jwt}`
- Middleware `requireAgentAccess('lara')` valida:
  - JWT válido
  - `user_agent_access.can_invoke = true` para `agent_name = 'lara'`
  - Caso contrário: 403 + log em `audit_log`

### Request
```json
POST /invoke/lara
Authorization: Bearer eyJ...
Content-Type: application/json

{
  "tenant_id": "uuid",
  "loja_id": "uuid",
  "session_id": "uuid",
  "message": "preciso de régua para Salgados da Mônica",
  "context": {
    "ultima_regua_id": null,
    "ultima_pesquisa_id": null
  }
}
```

### Response (streaming)
Server-Sent Events (SSE) ou WebSocket:
```
event: stage
data: {"stage":"verifying","label":"Consultando dados existentes da loja..."}

event: stage
data: {"stage":"asking","label":"Onboarding necessário","payload":{...}}

event: message
data: {"role":"assistant","text":"Ainda não tenho dados completos da loja. Pode me passar..."}

event: done
data: {"session_id":"uuid","tokens_used":1234}
```

### Implementação (pseudocódigo)
```javascript
app.post('/invoke/lara',
  authMiddleware,
  requireAgentAccess('lara'),
  async (req, res) => {
    const { tenant_id, loja_id, message, session_id } = req.body;

    await supabase.from('audit_log').insert({
      tenant_id,
      user_id: req.user.id,
      agent_name: 'lara',
      action: 'invoke',
      resource: 'lara',
      metadata: { session_id, loja_id }
    });

    const stream = openclaw.invoke({
      agent: 'lara',
      session_id,
      message,
      context: { tenant_id, loja_id, user_id: req.user.id }
    });

    res.setHeader('Content-Type', 'text/event-stream');
    for await (const chunk of stream) {
      res.write(`event: ${chunk.type}\ndata: ${JSON.stringify(chunk.data)}\n\n`);
    }
    res.end();
  }
);
```

---

## 2. POST /api/nexus-dispatch/:agent

### Propósito
LARA (rodando no OpenClaw) chama esse endpoint pra disparar webhook ao Nexus. Este endpoint é proxy interno: LARA não conhece NEXUS_API_KEY, apenas o Bridge Server conhece (via Infisical).

### Auth
- Header `X-Internal-Token: {INTERNAL_BRIDGE_TOKEN}` (segredo compartilhado entre OpenClaw e Bridge Server)
- Caso inválido: 401

### Path params
- `:agent` = `pesquisa | regua | midia`

### Request
```json
POST /api/nexus-dispatch/pesquisa
X-Internal-Token: ...
Content-Type: application/json

{
  "request_id": "uuid",
  "tenant_id": "uuid",
  "loja_id": "uuid",
  "payload": { /* conteúdo do request específico do sub-agente */ }
}
```

### Response
```json
{
  "ok": true,
  "request_id": "uuid",
  "estimated_duration_seconds": 90,
  "queued_at": "2026-05-06T..."
}
```

### O que o Bridge Server faz
1. Valida `X-Internal-Token`
2. Busca `NEXUS_API_KEY` no Infisical
3. Calcula `callback_signature_secret` (Infisical)
4. Adiciona `callback_url = https://app.consultdelivery.com.br/api/nexus-callback`
5. Faz POST para `${NEXUS_BASE_URL}/agents/${agent}/run`
6. Registra em tabela auxiliar `nexus_requests`:

```sql
CREATE TABLE nexus_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  loja_id UUID NOT NULL,
  agent TEXT NOT NULL CHECK (agent IN ('pesquisa','regua','midia')),
  request_id UUID NOT NULL UNIQUE,
  status TEXT DEFAULT 'queued' CHECK (status IN ('queued','running','done','error','timeout')),
  request_payload JSONB,
  response_payload JSONB,
  error_detail TEXT,
  queued_at TIMESTAMPTZ DEFAULT NOW(),
  responded_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '10 minutes')
);
```

> Nota: essa tabela `nexus_requests` deve ser adicionada à migration ou em migration separada.

7. Devolve `request_id` para LARA. LARA não bloqueia, segue o fluxo e aguarda callback.

---

## 3. POST /api/nexus-callback

### Propósito
Nexus chama esse endpoint quando termina pesquisa/régua/mídia.

### Auth
- Header `X-Nexus-Signature: {hmac_sha256_hex}` calculado sobre o body
- Bridge Server valida com secret compartilhado do Infisical
- Caso inválido: 401 + log em `audit_log` com `action='nexus_callback_rejected'`

### Request
```json
POST /api/nexus-callback
X-Nexus-Signature: a1b2c3...
Content-Type: application/json

{
  "event": "pesquisa_concluida | regua_concluida | midia_concluida",
  "request_id": "uuid",
  "tenant_id": "uuid",
  "loja_id": "uuid",
  /* ... payload específico ... */
}
```

### O que o Bridge Server faz
1. Valida assinatura HMAC
2. `SELECT nexus_requests WHERE request_id = $1 AND status = 'running'`
3. Se não encontrar ou estado errado: 404/409 + log
4. Persistir conforme tipo de evento:
   - `pesquisa_concluida` → INSERT em `marca_pesquisa`
   - `regua_concluida` → INSERT em `reguas` + bulk INSERT em `campanhas`
   - `midia_concluida` → INSERT em `campanha_ativos`
5. UPDATE `nexus_requests SET status='done', responded_at = NOW(), response_payload = $1`
6. Notificar OpenClaw que LARA pode continuar (via Realtime do Supabase OU webhook reverso)

### Response
```json
{
  "ok": true,
  "persisted_id": "uuid"
}
```

### Implementação (pseudocódigo)
```javascript
app.post('/api/nexus-callback', async (req, res) => {
  const sig = req.headers['x-nexus-signature'];
  const secret = await infisical.get('NEXUS_CALLBACK_SECRET');
  const expected = crypto.createHmac('sha256', secret)
                         .update(JSON.stringify(req.body))
                         .digest('hex');
  if (sig !== expected) {
    await audit({ action: 'nexus_callback_rejected', metadata: { reason: 'sig_mismatch' } });
    return res.status(401).json({ error: 'invalid signature' });
  }

  const { event, request_id, tenant_id, loja_id } = req.body;

  const { data: reqRow } = await supabase
    .from('nexus_requests')
    .select('*').eq('request_id', request_id).single();

  if (!reqRow || reqRow.status !== 'running') {
    return res.status(409).json({ error: 'invalid state' });
  }

  let persistedId;
  switch (event) {
    case 'pesquisa_concluida':
      persistedId = await persistPesquisa(req.body);
      break;
    case 'regua_concluida':
      persistedId = await persistRegua(req.body);
      break;
    case 'midia_concluida':
      persistedId = await persistMidia(req.body);
      break;
    default:
      return res.status(400).json({ error: 'unknown event' });
  }

  await supabase.from('nexus_requests')
    .update({ status: 'done', responded_at: new Date().toISOString(), response_payload: req.body })
    .eq('request_id', request_id);

  res.json({ ok: true, persisted_id: persistedId });
});
```

---

## Variáveis de ambiente / secrets (Infisical)

| Secret | Onde usar | Notas |
|---|---|---|
| `INTERNAL_BRIDGE_TOKEN` | Bridge ↔ OpenClaw | Token compartilhado, rotacionar trimestral |
| `NEXUS_API_KEY` | Bridge → Nexus | API key da plataforma Evonexus |
| `NEXUS_BASE_URL` | Bridge → Nexus | `https://evonexus.evolutionfoundation.com.br` |
| `NEXUS_CALLBACK_SECRET` | Validar callback do Nexus | HMAC secret compartilhado |
| `SUPABASE_URL` | Bridge → Supabase | já existe |
| `SUPABASE_SERVICE_ROLE_KEY` | Bridge → Supabase (admin) | já existe |

---

## Checklist de implementação

- [ ] Criar middleware `requireAgentAccess(agent_name)` no Bridge Server (se ainda não existe)
- [ ] Migration extra: `nexus_requests` (1 tabela auxiliar)
- [ ] Endpoint `POST /invoke/lara` (com SSE/WebSocket)
- [ ] Endpoint `POST /api/nexus-dispatch/:agent` (proxy interno)
- [ ] Endpoint `POST /api/nexus-callback` (recebe Nexus)
- [ ] Funções `persistPesquisa`, `persistRegua`, `persistMidia`
- [ ] Validação HMAC do callback
- [ ] Logs em `audit_log` em todos os endpoints
- [ ] Teste E2E: invoke → dispatch → callback → persist

---

*Especificação para handoff. Yasmin/Wandson implementam no `bridge-server/`.*
