# Comunicação Frontend ↔ Bridge ↔ Trigger.dev

**Versão:** 1.0  
**Fase:** 0 — Fundação Técnica  
**Data:** 13/05/2026

---

## 1. Visão geral

Toda invocação de agente IA segue o mesmo fluxo:

1. **Frontend** chama o Bridge Server com JWT do usuário
2. **Bridge** valida JWT + RBAC e dispara a task no Trigger.dev
3. **Trigger.dev** executa a task (pode durar segundos a minutos)
4. **Task** salva o resultado em `agent_runs` no Supabase
5. **Frontend** recebe o resultado via Supabase Realtime (sem polling)

---

## 2. Diagrama de fluxo

```
Frontend (React)         Bridge Server (VPS:3001)    Trigger.dev Cloud      Supabase
      │                           │                          │                   │
      │  POST /agents/deli/run    │                          │                   │
      │  Authorization: Bearer JWT│                          │                   │
      │  { tenant_id, payload }   │                          │                   │
      │──────────────────────────▶│                          │                   │
      │                           │  valida JWT              │                   │
      │                           │  verifica RBAC           │                   │
      │                           │  (user_agent_access)     │                   │
      │                           │                          │                   │
      │                           │  POST /api/v1/tasks/     │                   │
      │                           │  deli/trigger            │                   │
      │                           │──────────────────────────▶                   │
      │                           │◀── { id: "run_xxx" }     │                   │
      │                           │                          │                   │
      │◀── { run_id: "run_xxx" } ─│                          │                   │
      │                           │                          │                   │
      │  SUBSCRIBE Realtime ──────────────────────────────────────────────────── ▶│
      │  agent_runs WHERE         │                          │                   │
      │  trigger_dev_run_id =     │                          │                   │
      │  "run_xxx"                │                          │                   │
      │                           │                          │                   │
      │                           │                          │  executa task     │
      │                           │                          │  (Claude + tools) │
      │                           │                          │                   │
      │                           │                          │  logAgentRun() ──▶│
      │                           │                          │  UPDATE agent_runs│
      │                           │                          │                   │
      │◀── Realtime: { status: "success", output: {...} } ────────────────────── │
      │                           │                          │                   │
```

---

## 3. Endpoint: disparar agente

### Request

```http
POST https://187.127.25.24:3001/agents/{slug}/run
Authorization: Bearer {supabase_jwt}
Content-Type: application/json

{
  "tenant_id": "uuid-do-tenant",
  "payload": {
    // campos específicos de cada agente
    // ex para deli: { "message": "Qual o status das cobranças?" }
    // ex para analise-ifood: { "loja_id": "uuid", "periodo": "semanal" }
  }
}
```

### Response de sucesso

```json
{
  "run_id": "run_cm3xyz...",
  "status": "QUEUED"
}
```

### Erros possíveis

| Status | Motivo |
|---|---|
| 401 | JWT ausente ou inválido |
| 403 | Usuário sem `can_invoke` para este agente |
| 404 | Agente `slug` não existe no Trigger.dev |
| 503 | `TRIGGER_SECRET_KEY` não configurado no Bridge |

---

## 4. Endpoint: consultar status (fallback)

Usar apenas quando Realtime não estiver disponível.

### Request

```http
GET https://187.127.25.24:3001/agents/{slug}/runs/{run_id}
Authorization: Bearer {supabase_jwt}
```

### Response

```json
{
  "run_id": "run_cm3xyz...",
  "status": "SUCCESS",
  "output": {
    "ok": true,
    "message": "Olá, Wandson! Task funcionando."
  },
  "created_at": "2026-05-13T10:00:00Z",
  "finished_at": "2026-05-13T10:00:03Z"
}
```

**Valores de `status`:** `QUEUED` | `EXECUTING` | `COMPLETED` | `FAILED` | `CANCELED`

---

## 5. Supabase Realtime — receber resultado

O frontend não faz polling. Assina a tabela `agent_runs` e aguarda.

### Exemplo React

```typescript
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

function useAgentRun(runId: string | null) {
  const [run, setRun] = useState<{ status: string; output: unknown } | null>(null);

  useEffect(() => {
    if (!runId) return;

    const channel = supabase
      .channel(`agent-run-${runId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "agent_runs",
          filter: `trigger_dev_run_id=eq.${runId}`,
        },
        (payload) => {
          setRun({ status: payload.new.status, output: payload.new.output });
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [runId]);

  return run;
}

// Uso:
// const { mutate: dispararAgente } = useMutation(...)
// const run = useAgentRun(runId)
// if (run?.status === "success") mostrarResultado(run.output)
```

---

## 6. Exemplo ponta a ponta — chamar hello-world

```typescript
// 1. Disparar (frontend)
const resp = await fetch("https://187.127.25.24:3001/agents/hello-world/run", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${session.access_token}`,
  },
  body: JSON.stringify({
    tenant_id: currentTenant.id,
    payload: { name: "Wandson" },
  }),
});
const { run_id } = await resp.json();

// 2. Subscrever resultado (Realtime)
const channel = supabase
  .channel(`run-${run_id}`)
  .on("postgres_changes", {
    event: "UPDATE",
    schema: "public",
    table: "agent_runs",
    filter: `trigger_dev_run_id=eq.${run_id}`,
  }, ({ new: row }) => {
    if (row.status === "success") {
      console.log("Resultado:", row.output);
      // { ok: true, message: "Olá, Wandson! Task Trigger.dev funcionando..." }
    }
  })
  .subscribe();
```

---

## 7. RBAC — quem pode invocar cada agente

Acesso gerenciado via tabela `user_agent_access` (coluna `can_invoke`).  
Admins e owners do tenant têm acesso implícito a todos os agentes.

| Agente | Acesso padrão |
|---|---|
| `deli` | admin, deli_owner |
| `analise-ifood` | admin, dev, marketing, atendimento |
| `lara` | admin, marketing |
| `cora` | admin, financeiro |
| `max` | admin, atendimento |
| `nova` | admin, marketing |

Para conceder acesso individual:
```sql
INSERT INTO user_agent_access (user_id, agent_name, can_invoke)
VALUES ('uuid-do-usuario', 'deli', true);
```

---

## 8. Estrutura de arquivos relacionados

```
consult-delivery/
├── bridge-server/
│   ├── index.js              # POST /agents/:slug/run + GET /agents/:slug/runs/:id
│   └── README.md             # Documentação do Bridge
├── trigger/
│   ├── trigger.config.ts     # project: proj_slexhoelcjwgbopmbzzr
│   ├── _shared/
│   │   ├── claude.ts         # wrapper @anthropic-ai/sdk
│   │   ├── supabase.ts       # lazy singleton client service_role
│   │   ├── audit.ts          # logAgentRun() → agent_runs
│   │   └── schemas.ts        # Zod schemas comuns
│   └── _examples/
│       └── hello-world.ts    # task de sanidade
└── docs/architecture/
    └── agent-communication.md  # este documento
```
