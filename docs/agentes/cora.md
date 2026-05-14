# CORA · Cobrança Inteligente

**Status:** ✅ Ativa — Feature V2-1 concluída em 14/05/2026  
**Role necessário:** `financeiro` ou `admin`  
**Integração externa:** Asaas (sandbox e produção)  
**Orquestrador:** Trigger.dev (projeto `proj_slexhoelcjwgbopmbzzr`)

---

## Identidade

CORA é a agente responsável por toda a régua de cobrança inteligente. Ela identifica inadimplentes, analisa o perfil de risco de cada devedor com IA, gera mensagens personalizadas via WhatsApp e escala quando necessário.

CORA nunca envia mensagens para clientes sem aprovação humana (modo humano ou híbrido). Em modo IA puro, age autonomamente.

---

## Modos de operação

Controlado por `tenant_agent_config.mode` (colunas: `tenant_id`, `agent = 'cora'`, `mode`).

| Modo | Comportamento |
|---|---|
| `humano` | CORA só sugere. Toda ação requer aprovação manual. Drafts criados em `agent_drafts` com `autonomy_level = humano`. |
| `hibrido` | CORA age em análises e drafts; envio de mensagem requer aprovação. |
| `ia` | CORA age de forma autônoma. Humano monitora via dashboard. |

O toggle de modo fica visível no header da tela `/agentes/cora`.

---

## Tasks Trigger.dev

### `cora-analisar-devedor`
**Arquivo:** `trigger/cora/analisar-devedor.ts`

Analisa uma cobrança em aberto usando Claude + dados históricos do cliente. Gera:
- `nivel_risco`: baixo / medio / alto / critico
- `probabilidade_pagamento`: 0–100%
- `estrategia_recomendada`: texto
- `proxima_acao`: texto
- `tom_recomendado`: amigavel / formal / firme

**Lê:** `cora_cobrancas` (V1) ou contexto passado via payload  
**Escreve:** `cora_acoes` (campo `acao = 'analise_ia'`), `agent_runs`

---

### `cora-gerar-mensagem`
**Arquivo:** `trigger/cora/gerar-mensagem.ts`

Gera mensagem personalizada baseada na análise. Cria draft em `agent_drafts` com o texto a ser enviado ao cliente.

**Input obrigatório:** `cobranca_id`, `tenant_id`, `tom`, `canal` (whatsapp | interno)  
**Escreve:** `agent_drafts` (`agent_name = 'cora'`, `channel`, `subject`, `autonomy_level`), `cora_acoes` (`acao = 'mensagem_enviada'`), `agent_runs`

---

### `cora-escalonar`
**Arquivo:** `trigger/cora/escalonar.ts`

Escala a cobrança para atendimento humano. Cria draft de escalonamento e atualiza status.

**Escreve:** `agent_drafts`, `cora_acoes` (`acao = 'escalonamento'`), `agent_runs`

---

### `cora-criar-cobranca`
**Arquivo:** `trigger/cora/criar-cobranca.ts`

Cria uma cobrança diretamente no Asaas via API e persiste no banco local.

**Input:**
```typescript
{
  tenant_id: string (uuid),
  asaas_customer_id: string,   // ID do cliente no Asaas: cus_xxx
  customer_name: string,
  customer_phone?: string,
  valor: number,
  vencimento: string,          // YYYY-MM-DD
  billing_type: "BOLETO" | "PIX" | "CREDIT_CARD",
  description?: string,
  cliente_id?: string (uuid),  // ID no CRM local (quando existir)
  triggered_by?: string (uuid),
}
```

**Output:**
```typescript
{
  ok: boolean,
  cobranca_id: string (uuid),   // ID em public.cobrancas
  asaas_charge_id: string,      // pay_xxx retornado pelo Asaas
  status: "pending",
  invoice_url: string | null,
  bank_slip_url: string | null,
  pix_payload: string | null,
  due_date: string,
}
```

**Fluxo:**
1. `createCharge()` → Asaas API (`POST /payments`)
2. INSERT em `public.cobrancas` com todos os dados + `asaas_raw` no metadata
3. INSERT em `public.cobranca_eventos` (`event_type = 'created'`) — warning se falhar, não lança
4. `logAgentRun()` → `agent_runs`

**Retry:** maxAttempts 2 (Asaas já tem retry interno em `_shared/asaas.ts`)

---

## Integração Asaas

**Arquivo shared:** `trigger/_shared/asaas.ts`

### Configuração

| Variável de ambiente | Onde configurar |
|---|---|
| `ASAAS_API_KEY` | Infisical + Trigger.dev dashboard (Environment Variables) |
| `ASAAS_ENVIRONMENT` | `sandbox` (padrão) ou `production` |
| `ASAAS_WEBHOOK_SECRET` | Bridge Server `.env` (VPS) |

### Endpoints usados

| Função | Endpoint Asaas |
|---|---|
| `createCharge()` | `POST /payments` |
| `getCharge()` | `GET /payments/:id` |
| `listCharges()` | `GET /payments` |
| `refundCharge()` | `POST /payments/:id/refund` |

### Retry automático (withRetry)

- Tentativas: 3 (delays: 0ms, 1000ms, 2000ms)
- Retry apenas em: 429 (rate limit) e 5xx (erros Asaas)
- 4xx (exceto 429): não retenta — payload inválido

### Webhook Asaas → Bridge Server

**Rota:** `POST /webhooks/asaas`  
**Autenticação:** header `asaas-access-token` ou `x-asaas-access-token`  
**Resposta:** 200 imediato (processa async via `setImmediate`)

**Mapeamento de eventos:**

| Evento Asaas | Status local |
|---|---|
| `PAYMENT_CREATED` | `pending` |
| `PAYMENT_CONFIRMED`, `PAYMENT_RECEIVED` | `received` |
| `PAYMENT_OVERDUE` | `overdue` → dispara `cora-analisar-devedor` |
| `PAYMENT_DELETED` | `canceled` |
| `PAYMENT_RESTORED` | `pending` |
| `PAYMENT_REFUNDED` | `refunded` |

**Ao receber `PAYMENT_OVERDUE`:** Bridge busca a cobrança em `cobrancas` pelo `asaas_charge_id`, atualiza status e dispara a task `cora-analisar-devedor` via Trigger.dev API.

---

## Schema do banco

### `public.cobrancas` (V2 — integrada com Asaas)

| Coluna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `tenant_id` | uuid FK tenants | CASCADE |
| `cliente_id` | uuid nullable | FK futura para crm_customers (não existe ainda) |
| `asaas_charge_id` | text UNIQUE | `pay_xxx` retornado pelo Asaas |
| `valor` | numeric(10,2) | |
| `vencimento` | date | |
| `status` | text CHECK | pending \| received \| overdue \| refunded \| canceled |
| `billing_type` | text CHECK | BOLETO \| PIX \| CREDIT_CARD \| UNDEFINED |
| `invoice_url` | text nullable | Link de pagamento (todos os tipos) |
| `bank_slip_url` | text nullable | URL do boleto (só BOLETO) |
| `pix_qr_code` | text nullable | Payload copia-e-cola (só PIX) |
| `customer_name` | text | Cache local do nome do cliente |
| `customer_phone` | text nullable | Cache local do telefone |
| `notas` | text nullable | Notas internas |
| `metadata` | jsonb | Inclui `asaas_raw` com resposta completa do Asaas |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | Trigger automático `set_updated_at()` |

**Realtime:** ativado. Frontend escuta via `supabase_realtime`.

---

### `public.cobranca_eventos` (audit trail imutável)

| Coluna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `cobranca_id` | uuid FK cobrancas | CASCADE |
| `tenant_id` | uuid FK tenants | Redundante para RLS sem JOIN |
| `event_type` | text CHECK | created \| status_changed \| payment_received \| cora_acted \| manual |
| `old_status` | text nullable | NULL quando `event_type = created` |
| `new_status` | text nullable | NULL quando não há mudança de status |
| `triggered_by` | text CHECK DEFAULT 'manual' | asaas_webhook \| cora \| manual |
| `metadata` | jsonb | Dados adicionais (payload webhook, run_id CORA, etc.) |
| `created_at` | timestamptz | Imutável — sem `updated_at` |

**Sem UPDATE/DELETE por design.** Sem Realtime (frontend faz fetch manual ao abrir histórico).

---

### `public.cora_acoes` — colunas V2 adicionadas

As colunas originais (V1) foram mantidas. Colunas V2 adicionadas via `ALTER TABLE`:

| Coluna nova | Tipo | Significado |
|---|---|---|
| `agent_run_id` | uuid nullable FK agent_runs | Run do Trigger.dev que gerou esta ação |
| `cobranca_v2_id` | uuid nullable FK cobrancas | Cobrança V2 (Asaas) associada |
| `acao` | text nullable | Ação V2: `analise_ia`, `mensagem_enviada`, `escalonamento` |
| `mensagem_enviada` | text nullable | Texto exato enviado ao cliente |
| `whatsapp_message_id` | text nullable | ID retornado pela Evolution API para rastreio |

**Registros V1** usam `cobranca_id → cora_cobrancas`. Registros V2 usam `cobranca_v2_id → cobrancas`.

---

## Migrations

| Arquivo | O que faz |
|---|---|
| `20260514_016_cora_cobrancas.sql` | Tabelas V1: `cora_cobrancas`, `cora_acoes` |
| `20260514_017_cobrancas.sql` | Tabela V2: `cobrancas` (integrada Asaas) |
| `20260514_018_cobranca_eventos.sql` | Audit trail: `cobranca_eventos` |
| `20260514_019_cora_acoes_v2.sql` | ALTER TABLE: colunas V2 em `cora_acoes` |

---

## UI — tela `/agentes/cora`

**Componente:** `src/screens/CoraScreen.jsx`

### Tabs

| Tab | Fonte de dados | Filtro |
|---|---|---|
| Em aberto | `cora_cobrancas` (V1) | status = aberto \| negociando |
| Escalonados | `cora_cobrancas` (V1) | status = escalonado |
| Pagos | `cora_cobrancas` (V1) | status = pago |
| **Asaas V2** | `cobrancas` (V2) | todos os status; badge vermelho conta `overdue` |

### Header

- `ModoToggle`: humano / híbrido / IA — lê e salva em `tenant_agent_config`
- Botão **"Asaas"**: abre `NovaCobrancaAsaasModal` → POST `/agents/cora-criar-cobranca/run`
- Botão **"Manual"**: abre `NovaCobrancaModal` → INSERT direto em `cora_cobrancas`

### Drawers

- `CobrancaDrawer` (V1): ações CORA, análise IA, histórico `cora_acoes`, botões Analisar / Gerar Mensagem / Marcar Pago / Escalonar
- `CobrancaV2Drawer` (V2): links de pagamento (invoice_url / bank_slip_url / pix_qr_code), eventos Asaas (`cobranca_eventos`), ações CORA (`cora_acoes` via `cobranca_v2_id`), botões Analisar / Gerar Mensagem

### Realtime

- Canal `cora-cobrancas-realtime` → tabela `cora_cobrancas`
- Canal `cora-cobrancas-v2-realtime` → tabela `cobrancas`
- Drawers escutam `agent_runs` para atualizar status de loading pós-execução

---

## RBAC

| Papel | Pode invocar tarefas CORA | Acessa tela |
|---|---|---|
| `financeiro` | ✅ (prefixo `cora-`) | ✅ |
| `admin` / `owner` | ✅ (acesso total) | ✅ |
| outros | ❌ | ❌ (sem RequireRole) |

Bridge Server valida via `requireAgentAccess` → `ROLE_AGENT_PREFIXES.financeiro = ['cora-', 'nova-']`.

---

## Referências cruzadas

- `trigger/_shared/asaas.ts` — wrapper completo da Asaas API
- `trigger/_shared/audit.ts` — `logAgentRun()` usado por todas as tasks
- `bridge-server/index.js` — webhook `/webhooks/asaas` e rota `/agents/:slug/run`
- `RESTRUCTURE.md` § 4.3 — modos de operação (humano/híbrido/ia)
- `supabase/migrations/20260514_017_cobrancas.sql`
- `supabase/migrations/20260514_018_cobranca_eventos.sql`
- `supabase/migrations/20260514_019_cora_acoes_v2.sql`
