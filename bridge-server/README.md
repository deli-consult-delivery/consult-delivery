# Bridge Server

Node.js/Express rodando na VPS (porta 3001). Intermediário entre o frontend React e a infraestrutura backend (OpenClaw, Trigger.dev, Supabase).

## Env vars obrigatórias

| Variável | Descrição |
|---|---|
| `SUPABASE_URL` | URL do projeto Supabase |
| `SUPABASE_ANON_KEY` | Chave anon (valida JWTs do frontend) |
| `SUPABASE_SERVICE_ROLE_KEY` | Chave service_role (leitura/escrita sem RLS) |
| `BRIDGE_SECRET` | Secret para endpoints legados (/analise) |
| `INTERNAL_BRIDGE_TOKEN` | Token para chamadas internas (nexus-dispatch) |
| `TRIGGER_SECRET_KEY` | Secret key do Trigger.dev cloud (Infisical) |
| `GOOGLE_API_KEY` | Para leitura de Google Drive (analista-ifood) |

---

## Endpoints

### Saúde

```
GET /health
→ { ok: true, ts: "..." }
```

---

### Agentes IA (Fase 0+)

#### Disparar task de agente

```
POST /agents/:slug/run
Authorization: Bearer <supabase_jwt>
Content-Type: application/json

{
  "tenant_id": "uuid-do-tenant",
  "payload": { ...campos específicos do agente... }
}

→ 200 { "run_id": "run_xxx", "status": "QUEUED" }
→ 403 sem permissão para invocar o agente
→ 503 TRIGGER_SECRET_KEY não configurado
```

**RBAC:** verifica `user_agent_access.can_invoke = true` para o agente. Fallback: `tenant_members.role IN ('admin','owner')`.

O frontend deve subscrever `agent_runs` via **Supabase Realtime** para receber o resultado quando o run completar.

#### Consultar status de run

```
GET /agents/:slug/runs/:run_id
Authorization: Bearer <supabase_jwt>

→ 200 {
    "run_id": "run_xxx",
    "status": "SUCCESS" | "FAILURE" | "QUEUED" | "EXECUTING",
    "output": { ...output da task... } | null,
    "created_at": "...",
    "finished_at": "..." | null
  }
```

Usar como fallback quando Realtime não estiver disponível.

---

### Fluxo completo Frontend ↔ Bridge ↔ Trigger.dev

```
Frontend                  Bridge                    Trigger.dev            Supabase
   |                         |                           |                     |
   |-- POST /agents/deli/run →|                           |                     |
   |                         |-- POST /api/v1/tasks/deli/trigger →             |
   |                         |← { run_id }               |                     |
   |← { run_id } ------------|                           |                     |
   |                         |                           |                     |
   |-- SUBSCRIBE agent_runs WHERE id = run_id (Realtime) ----------------------→|
   |                         |                           |-- exec task ------->|
   |                         |                           |-- UPDATE agent_runs →|
   |← { status: SUCCESS, output: {...} } -----------------------------------------|
```

---

### Endpoints legados (OpenClaw — saem na Fase 4)

| Endpoint | Descrição |
|---|---|
| `POST /invoke/lara` | Invoca LARA via OpenClaw (SSE) |
| `POST /api/nexus-dispatch/:agent` | Sub-agentes NEXUS via OpenClaw |
| `GET /api/nexus-status/:request_id` | Status de job NEXUS |
| `POST /api/nexus-callback` | Callback HMAC do EvoNexus |
| `POST /analise` | Análise iFood via OpenClaw |

---

## Deploy na VPS

O bridge-server roda via systemd na VPS `45.39.210.183`. Para atualizar:

```bash
cd /root/bridge-server
git pull origin main
pm2 restart bridge-server   # ou: systemctl restart bridge-server
```

`TRIGGER_SECRET_KEY` deve ser adicionado ao Infisical antes do próximo deploy.
