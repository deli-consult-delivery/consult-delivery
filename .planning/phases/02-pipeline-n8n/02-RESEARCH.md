# Phase 2 Research — Pipeline n8n

**Researched:** 2026-05-02
**Domain:** n8n workflow automation — Google Drive, Anthropic API (tool-use), Supabase REST, Evolution API
**Confidence:** HIGH overall — schema verified from codebase; n8n patterns verified from official docs and STACK.md; tool-use request body from Anthropic official docs

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PIPE-01 | Webhook n8n responds immediately (200 + job_id) | "Respond: Immediately" mode — verified n8n Webhook node setting |
| PIPE-02 | n8n PATCHes row to `status = processing` on receipt | HTTP Request node → Supabase REST PATCH with service_role key |
| PIPE-03 | n8n extracts folder_id from Drive link via regex | JS Code node regex `/\/folders\/([a-zA-Z0-9_-]{10,})/` |
| PIPE-04 | n8n lists files (max 15, excludes subfolders) via automacao@ OAuth2 | Google Drive node, Resource: File, Operation: Get Many |
| PIPE-05 | n8n downloads images (PNG/JPG, rejects >5MB) and exports CSVs as text | Google Drive node, Operation: Download; size check in Code node |
| PIPE-06 | n8n calls Anthropic API (claude-sonnet-4-6, max_tokens=8096, tool-use mode) with images as base64 + CSVs + system prompt | HTTP Request node — verified exact body structure; tool_choice: {type: "tool"} |
| PIPE-07 | n8n generates HTML report from JSON returned by Claude | Code node template (not second Claude call) — faster, cheaper, deterministic |
| PIPE-08 | n8n PATCHes row: status=done, resultado_json, html_relatorio, mensagem_whatsapp | HTTP Request node → Supabase REST PATCH |
| PIPE-09 | n8n INSERTs top-5 priorities as tasks in Kanban `tasks` table | Exact schema verified from database.ts — fields documented below |
| PIPE-10 | n8n sends WhatsApp via Evolution API (non-fatal branch) | Existing Evolution API integration; non-fatal via separate branch |
| PIPE-11 | Error path: any failure PATCHes status=error with readable error_message | Error Trigger workflow + explicit error branch in main workflow |
| INFRA-01 | pg_cron or n8n scheduled workflow sets status=error for rows stuck in processing >5min | pg_cron verified available in Supabase — SQL documented below |
| INFRA-02 | HTTP Request node has retry (3 attempts, 10s interval) for Anthropic call | n8n "Retry on fail" setting on HTTP Request node |
| INFRA-03 | Separate n8n Error Trigger workflow catches unhandled failures → writes status=error | Error Trigger node — limitation: job_id not directly available; workaround documented |
</phase_requirements>

---

## Summary

Phase 2 builds the n8n automation pipeline that is the core engine of the Módulo Análise iFood. The frontend (Phase 1) inserts a row and fires a webhook; n8n takes over completely from that point: reading Google Drive, calling Claude via HTTP with tool-use mode for JSON enforcement, generating HTML, and writing all outputs back to Supabase using the service_role key.

The pipeline splits into three n8n workflows: (1) the main analysis workflow, (2) a global Error Trigger workflow that catches unhandled failures, and (3) an INFRA-01 cleanup — which can be implemented as either a pg_cron SQL job (simpler) or a scheduled n8n workflow (no Supabase extension required).

The key design insight is that every Supabase write from n8n uses the REST API with the service_role key — never the n8n Supabase node (which defaults to anon key and is blocked by RLS). The Error Trigger workflow cannot directly read the job_id from the failed execution context; a workaround using the n8n Executions API or passing job_id as a workflow-level variable is required.

**Primary recommendation:** Build and test in node sequence order — Webhook → Drive → Claude → Supabase writes → Tasks → WhatsApp. Add the Error Trigger and cleanup job last, after the happy path is confirmed working.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Status transition pending→processing | n8n (PATCH via service_role) | — | n8n owns all writes post-webhook |
| Google Drive file listing | n8n (Google Drive node, OAuth2) | — | Credentials never exposed to frontend |
| File download and base64 encoding | n8n (Code node) | — | Binary manipulation, server-side only |
| Claude API call (tool-use) | n8n (HTTP Request node) | — | Native Anthropic node lacks binary multimodal support |
| JSON response parsing | n8n (Code node after HTTP Request) | — | Extracts `tool_use` block input object |
| HTML generation | n8n (Code node template) | — | Deterministic, cheap, fast — no second Claude call |
| Status transition processing→done | n8n (HTTP Request, service_role PATCH) | — | Single atomic write of all output fields |
| Kanban task creation | n8n (HTTP Request, service_role INSERT) | — | React never writes tasks directly from analysis |
| WhatsApp send | n8n (HTTP Request → Evolution API) | — | Non-fatal branch; existing integration |
| Error state write | n8n Error Trigger + explicit error branch | pg_cron (INFRA-01 fallback) | Two-layer safety net |
| Stale processing cleanup | pg_cron scheduled SQL | n8n scheduled workflow (fallback) | pg_cron simpler; n8n workflow if extension unavailable |

---

## n8n Workflow Architecture

### Three workflows total

**Workflow 1: Análise iFood — Main**
This is the primary pipeline. Every PIPE-01 through PIPE-10 lives here.

```
[1]  Webhook trigger (POST /webhook/analise-ifood)
       - Set: "Respond: Immediately" mode
       - Returns: { "job_id": "{{ $json.job_id }}" } at once (HTTP 200)
       - Continues executing asynchronously

[2]  HTTP Request — PATCH status='processing'
       - Supabase REST, service_role key
       - PATCH analises WHERE job_id=eq.{{ $json.body.job_id }}

[3]  Code node — Extract folder_id from drive_link
       - Regex: /\/folders\/([a-zA-Z0-9_-]{10,})/
       - Throws readable error if regex fails → triggers Error Trigger workflow

[4]  Google Drive node — List files in folder
       - Resource: File, Operation: Get Many
       - Filter query: '{{ $json.folderId }}' in parents and trashed=false
         and mimeType != 'application/vnd.google-apps.folder'
       - Fields: id, name, mimeType, size
       - Limit: 15 (enforced in Code node below if needed)

[4b] IF node — Guard: no files found
       - Condition: {{ $json.files.length === 0 }}
       - True branch → explicit PATCH status='error' (not Error Trigger)

[5]  Split In Batches node — iterate file list (batchSize: 1)

[6]  IF node — Branch by mimeType
       - Images branch: mimeType starts with 'image/'
       - CSV branch: mimeType = 'application/vnd.google-apps.spreadsheet'
         or mimeType = 'text/csv'

[6a] Google Drive node — Download image (binary)
       - Operation: Download a File, By ID: {{ $json.id }}
       - Output binary field: 'data'

[6b] Code node — Size check (images)
       - if ($binary.data.fileSize * 1.34 > 5_000_000) skip
       - if (file count > 15) skip with log

[6c] Google Drive node — Export CSV as text
       - Operation: Download a File
       - Export MIME type: text/csv (for Google Sheets)
       - For native CSVs: direct download as binary → toString('utf8')

[7]  Code node — Aggregate payload for Claude
       - Collects all downloaded binaries from loop iterations
       - Builds content array: images as base64 blocks + CSV as text blocks
       - Constructs full messages array with system prompt + user content

[8]  HTTP Request — POST to Anthropic Messages API
       - URL: https://api.anthropic.com/v1/messages
       - Headers: x-api-key, anthropic-version: 2023-06-01, content-type: application/json
       - Body: tool-use mode (exact structure below)
       - Retry on fail: 3 attempts, 10s interval (INFRA-02)
       - Timeout: 120 seconds

[9]  Code node — Parse tool_use response
       - Finds content block where type === 'tool_use'
       - Returns block.input as resultado_json
       - Checks stop_reason !== 'max_tokens'

[10] Code node — Generate HTML from JSON
       - Template-based (see HTML Generation Strategy below)

[11] HTTP Request — PATCH status='done' with all results
       - Supabase REST, service_role key
       - Writes: status, resultado_json, html_relatorio, mensagem_whatsapp

[12] HTTP Request × 5 — INSERT tasks (top-5 priorities)
       - One INSERT per priority from resultado_json.prioridades (or loop node)

[13] HTTP Request — Evolution API send WhatsApp
       - Non-fatal: placed in separate branch AFTER step 11 completes
       - Failure here does NOT revert step 11
       - On fail: PATCH whatsapp_sent=false (already default false in schema)

[ERROR PATH] — Explicit catch at step 4b and step 9b
       HTTP Request — PATCH status='error', error_message='<readable message>'
       This is the branch-level catch. The Error Trigger (Workflow 2) is the
       fallback for truly unhandled failures (e.g., node crash).
```

---

**Workflow 2: Análise iFood — Error Handler**
[INFRA-03] A separate n8n workflow activated as the "Error Workflow" in Workflow 1's Settings.

```
[1]  Error Trigger node
       - Receives: { execution: { id, url, mode, workflowId, error: { message, stack } } }
       - NOTE: does NOT directly provide the job_id from the failed execution's input

[2]  HTTP Request — GET failed execution data from n8n API
       - GET http://localhost:5678/api/v1/executions/{{ $json.execution.id }}
       - Auth: n8n API key (configured in n8n settings)
       - Extracts: data.resultData.runData['Webhook node name'][0].data.main[0][0].json.body.job_id

[3]  IF node — Guard: was job_id found?
       - True: proceed to PATCH
       - False: log error and stop (no job_id to update)

[4]  HTTP Request — PATCH status='error' in Supabase
       - error_message: 'Falha interna no processamento. Tente novamente.'
       - Uses service_role key
```

**Critical limitation of Error Trigger:** The node provides `execution.id` and `execution.error.message` but does NOT natively expose the input data (job_id) that was flowing through the failed workflow. To recover job_id, Workflow 2 must call the n8n Executions API using the execution.id, then navigate the execution data JSON path to find the webhook input. [ASSUMED: exact JSON path in execution data — verify by inspecting a real failed execution in n8n UI before finalizing Workflow 2 Code node]

---

**Workflow 3: INFRA-01 Cleanup (choose one approach)**

Option A — pg_cron (preferred, simpler):
```sql
-- Enable extension once in Supabase Dashboard → Extensions → pg_cron
-- Then create the job:
SELECT cron.schedule(
  'cleanup-stale-analises',
  '*/5 * * * *',   -- every 5 minutes
  $$
    UPDATE analises
    SET status = 'error',
        error_message = 'Processamento interrompido automaticamente após 5 minutos',
        updated_at = now()
    WHERE status = 'processing'
      AND updated_at < now() - interval '5 minutes'
  $$
);
```

Option B — n8n Scheduled Workflow (if pg_cron unavailable):
```
[1]  Schedule Trigger: every 5 minutes
[2]  HTTP Request — PATCH (Supabase REST)
     URL: .../rest/v1/analises?status=eq.processing&updated_at=lt.{{ 5 minutes ago ISO }}
     Method: PATCH
     Body: { "status": "error", "error_message": "Processamento interrompido automaticamente" }
```

**Recommendation:** Use pg_cron. It runs inside Postgres, survives n8n downtime, and is simpler to reason about. Supabase Pro includes pg_cron (v1.6.4) — enable via Dashboard → Integrations → Cron. [VERIFIED: Supabase Cron docs]

---

## Google Drive Integration (n8n specifics)

### Node name and configuration

**Node:** `Google Drive` (built-in node: `n8n-nodes-base.googleDrive`)

**Credential type:** Google OAuth2 API (Custom) — already configured in n8n for `automacao@consultdelivery.com.br` per STACK.md.

**Operation: List files in folder**
- Resource: `File`
- Operation: `Get Many` (or "Search" depending on n8n version)
- Filter (Q parameter): `'{{ $json.folderId }}' in parents and trashed=false and mimeType != 'application/vnd.google-apps.folder'`
- Fields to return: `id, name, mimeType, size` (size needed for 5MB check)
- Page size: set to 15 or limit in Code node after listing

**Operation: Download a file**
- Resource: `File`
- Operation: `Download`
- File ID: `{{ $json.id }}`
- Binary property name: `data`

**Google Sheets export as CSV:**
- Use same Download operation
- Add export MIME type: `text/csv`
- n8n passes `?mimeType=text%2Fcsv` to the Drive export endpoint automatically when the source file is a Google Sheets (`application/vnd.google-apps.spreadsheet`)

**Image handling:**
- PNG/JPEG files: downloaded as binary directly, available as `$binary.data`
- Encoding for Claude: `$binary.data.toString('base64')` inside Code node
- Size limit: check `$binary.data.fileSize` (bytes) — reject if > 3,728,000 bytes (~3.7MB raw = ~5MB after base64 encoding +34%)

**Known gotcha:** The Google Drive node listing can return mixed types. Always filter by `mimeType != 'application/vnd.google-apps.folder'` in the query parameter itself (not as a post-filter), or the folder entry itself may appear in results. [VERIFIED: STACK.md]

**Known gotcha 2:** Filenames with Portuguese accents (e.g., `Relatório.csv`) are returned correctly from Drive but can corrupt downstream logging. Use `$json.id` for routing, never `$json.name`. [VERIFIED: PITFALLS.md]

---

## Anthropic Tool-Use in n8n

### Why HTTP Request node, not the native Anthropic node

The native n8n Anthropic node (`n8n-nodes-langchain.anthropic`) does not support multimodal binary input (base64 images assembled dynamically). Use the HTTP Request node for full control. [VERIFIED: STACK.md + n8n community issue #26300]

### Complete HTTP Request node configuration

**URL:** `https://api.anthropic.com/v1/messages`
**Method:** POST
**Authentication:** Header-based (not n8n credential)

**Headers:**
```
x-api-key: {{ $env.ANTHROPIC_API_KEY }}
anthropic-version: 2023-06-01
content-type: application/json
```

**Body type:** JSON / Raw JSON (paste as expression)

The body is assembled in the Code node at step [7] and passed to the HTTP Request node as a JSON object. The Code node builds:

```javascript
// Code node [7] — Build Claude payload
// $('Split In Batches').all() collects all loop outputs
const images = [];
const csvTexts = [];

// Collect from all loop iterations (use $('node name').all() pattern)
for (const item of $input.all()) {
  if (item.binary?.data) {
    const b64 = item.binary.data.toString('base64');
    const mediaType = item.binary.data.mimeType || 'image/jpeg';
    images.push({
      type: 'image',
      source: { type: 'base64', media_type: mediaType, data: b64 }
    });
  }
  if (item.json.csvText) {
    csvTexts.push({ type: 'text', text: item.json.csvText });
  }
}

const systemPrompt = `Você é um analista especialista em iFood...`; // 2000-token system prompt

const content = [
  ...images,
  ...csvTexts,
  {
    type: 'text',
    text: 'Analise os arquivos acima e retorne a análise completa usando a ferramenta analise_ifood.'
  }
];

const body = {
  model: 'claude-sonnet-4-6',
  max_tokens: 8096,
  system: systemPrompt,
  tools: [{
    name: 'analise_ifood',
    description: 'Retorna a análise estruturada completa de uma loja iFood',
    input_schema: {
      type: 'object',
      properties: {
        saude_geral: { type: 'string', enum: ['saudavel', 'atencao', 'critico'] },
        resumo_executivo: { type: 'string' },
        metricas: {
          type: 'object',
          properties: {
            avaliacao_media: { type: 'number' },
            total_avaliacoes: { type: 'integer' },
            taxa_cancelamento: { type: 'number' },
            tempo_medio_entrega: { type: 'integer' }
            // ... other metrics
          }
        },
        prioridades: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              ordem: { type: 'integer' },
              titulo: { type: 'string' },
              descricao: { type: 'string' },
              urgencia: { type: 'string', enum: ['hoje', 'semana', 'proximo_ciclo'] },
              impacto_financeiro_estimado: { type: 'string' }
            },
            required: ['ordem', 'titulo', 'descricao', 'urgencia']
          },
          minItems: 1,
          maxItems: 5
        },
        mensagem_whatsapp: { type: 'string' }
      },
      required: ['saude_geral', 'resumo_executivo', 'prioridades', 'mensagem_whatsapp']
    }
  }],
  tool_choice: { type: 'tool', name: 'analise_ifood' },
  messages: [{ role: 'user', content }]
};

return [{ json: { claudeRequestBody: body } }];
```

[VERIFIED: tool_choice structure from Anthropic official docs — `{"type": "tool", "name": "analise_ifood"}` forces Claude to always call this specific tool]
[VERIFIED: tool input_schema with strict type definitions from Anthropic define-tools docs]

### Response parsing (Code node [9])

```javascript
// Code node [9] — Parse tool_use response
const response = $input.first().json;

// Check for truncation
if (response.stop_reason === 'max_tokens') {
  throw new Error('Claude response truncated — increase max_tokens or reduce input');
}

// Find the tool_use block
const toolUseBlock = response.content.find(b => b.type === 'tool_use' && b.name === 'analise_ifood');
if (!toolUseBlock) {
  throw new Error('Claude did not return a tool_use block — unexpected response structure');
}

// The input IS the structured JSON (already parsed — no JSON.parse needed)
const resultado_json = toolUseBlock.input;

return [{
  json: {
    resultado_json,
    mensagem_whatsapp: resultado_json.mensagem_whatsapp,
    saude_geral: resultado_json.saude_geral
  }
}];
```

**Critical difference from text mode:** In tool-use mode, `toolUseBlock.input` is already a parsed JavaScript object — you do NOT call `JSON.parse()` on it. The API returns the structured data natively. In text mode, you'd get a string in `response.content[0].text` and need `JSON.parse()`. [VERIFIED: Anthropic official docs]

---

## HTML Generation Strategy

**Recommendation: Code node with a hardcoded HTML template (not a second Claude call)**

| Criterion | Code node template | Second Claude call |
|-----------|-------------------|-------------------|
| Speed | Instant (~0ms) | +5–15s per analysis |
| Cost | Free | ~$0.02 additional |
| Determinism | 100% consistent layout | Variable formatting |
| Maintenance | Edit template once in n8n | Reprompt every change |
| Reliability | Always produces HTML | Risk of malformed output |
| Customization | Full CSS control | Claude's interpretation |

The HTML template Code node takes `resultado_json` and produces styled HTML. Since the JSON schema is fixed (enforced by tool-use), the template can reference properties directly without defensive checks.

**Template approach (Code node [10]):**

```javascript
// Code node [10] — Generate HTML report
const json = $input.first().json.resultado_json;

const urgenciaLabel = { hoje: 'HOJE', semana: 'ESTA SEMANA', proximo_ciclo: 'PRÓXIMO CICLO' };
const saudeColor = { saudavel: '#22c55e', atencao: '#f59e0b', critico: '#ef4444' };

const prioridadesHtml = json.prioridades.map(p => `
  <div class="priority-card">
    <span class="urgencia-badge">${urgenciaLabel[p.urgencia] || p.urgencia}</span>
    <h3>${p.ordem}. ${p.titulo}</h3>
    <p>${p.descricao}</p>
    ${p.impacto_financeiro_estimado ? `<p class="impacto">Impacto estimado: ${p.impacto_financeiro_estimado}</p>` : ''}
  </div>
`).join('');

const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Análise iFood</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
    .health-badge { display: inline-block; padding: 8px 16px; border-radius: 20px; font-weight: bold; color: white; background: ${saudeColor[json.saude_geral] || '#6b7280'}; }
    .priority-card { border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin: 12px 0; }
    .urgencia-badge { font-size: 11px; font-weight: bold; text-transform: uppercase; }
    .impacto { color: #059669; font-weight: 600; }
  </style>
</head>
<body>
  <h1>Análise iFood</h1>
  <span class="health-badge">${json.saude_geral.toUpperCase()}</span>
  <p>${json.resumo_executivo}</p>
  <h2>Top Prioridades</h2>
  ${prioridadesHtml}
</body>
</html>`;

return [{ json: { html_relatorio: html } }];
```

The actual template will be expanded with all 8 analysis blocks once the full `resultado_json` schema is finalized. The structure above covers the minimum viable output. [ASSUMED: Final system prompt and JSON schema shape — will be defined by Wandson in n8n before first real test run]

---

## Kanban Tasks Schema

**Source:** Verified from `src/types/database.ts` in the codebase.

### `tasks` table — Insert fields

| Field | Type | Required | Default | Notes for PIPE-09 |
|-------|------|----------|---------|-------------------|
| `id` | uuid | no | gen_random_uuid() | Omit — auto-generated |
| `tenant_id` | uuid | YES | — | Pass from webhook input |
| `title` | text | YES | — | `resultado_json.prioridades[i].titulo` |
| `description` | text | no | null | `resultado_json.prioridades[i].descricao` |
| `col` | text | no | `'todo'` | Always `'todo'` for new tasks from analysis |
| `priority` | text | no | ? | Map urgencia → priority: hoje='high', semana='med', proximo_ciclo='low' |
| `due_at` | timestamptz | no | null | Set based on urgencia (optional in v1) |
| `due_label` | text | no | null | Human-readable: `'Hoje'`, `'Esta semana'`, `'Próximo ciclo'` |
| `agent_id` | uuid | no | null | Set to DELI agent UUID if available; else null |
| `assignee_id` | uuid | no | null | Null for auto-created tasks |
| `created_by` | uuid | no | null | Pass `criado_por` from analise row |
| `position` | integer | no | 0 | Set to index (0–4) for ordering |
| `checklist_done` | integer | no | 0 | Omit — defaults |
| `checklist_total` | integer | no | 0 | Omit — defaults |
| `attachments_count` | integer | no | 0 | Omit — defaults |

**Kanban column values (from KanbanScreen.jsx):**
- `'todo'` = "A Fazer" (correct column for auto-created tasks)
- `'progress'` = "Em Andamento"
- `'review'` = "Em Revisão"
- `'done'` = "Concluído"

**Priority values (from KanbanScreen.jsx PRIORITY constant):**
- `'high'` → badge "URGENTE"
- `'med'` → badge "MÉDIA"
- `'low'` → badge "BAIXA"

**n8n INSERT pattern (HTTP Request node, one per priority):**

```
URL: https://<ref>.supabase.co/rest/v1/tasks
Method: POST
Headers:
  apikey: <service_role_key>
  Authorization: Bearer <service_role_key>
  Content-Type: application/json
  Prefer: return=minimal
Body:
{
  "tenant_id": "{{ $('Webhook').item.json.body.tenant_id }}",
  "title": "{{ $json.prioridade.titulo }}",
  "description": "{{ $json.prioridade.descricao }}",
  "col": "todo",
  "priority": "{{ $json.prioridade.urgencia === 'hoje' ? 'high' : $json.prioridade.urgencia === 'semana' ? 'med' : 'low' }}",
  "due_label": "{{ $json.prioridade.urgencia === 'hoje' ? 'Hoje' : $json.prioridade.urgencia === 'semana' ? 'Esta semana' : 'Próximo ciclo' }}",
  "position": {{ $json.prioridade.ordem - 1 }},
  "created_by": "{{ $('Webhook').item.json.body.criado_por }}"
}
```

Use a Loop node over `resultado_json.prioridades` (max 5 items) to INSERT each task separately. Do NOT batch into a single array INSERT unless confirmed that Supabase returns `201` correctly for array inserts via service_role (it does, but a loop is clearer for error tracing). [VERIFIED: schema from database.ts; column values from KanbanScreen.jsx]

---

## System Prompt Storage

**Recommendation: n8n Set node at the start of the workflow**

| Option | Pros | Cons |
|--------|------|------|
| **n8n Set node (recommended)** | Edit in n8n UI without deployment; visible in workflow; version-controlled via n8n export | Only accessible within n8n |
| n8n workflow variable | Persistent across executions | Harder to find and edit |
| Supabase table row | Frontend-editable | Extra DB read per execution; overkill for v1 |
| Code node hardcoded | Simple | Requires workflow edit to change prompt |
| Infisical secret | Secure for keys; wrong tool for long text | Not designed for ~2000 token text blobs |

**Implementation:** Add a Set node immediately after the Webhook node. Set a field named `systemPrompt` with the full 2000-token iFood analyst prompt as a string. Reference it downstream as `{{ $('Set System Prompt').item.json.systemPrompt }}` in the Code node that builds the Claude payload.

**Why not Supabase:** Adds a network round-trip before the Drive call. The system prompt changes infrequently (when YAML rules are updated); n8n workflow export to git provides version control. [ASSUMED: System prompt content — Wandson defines this; only storage location is decided here]

**Why not Infisical:** Infisical is for credentials (ANTHROPIC_API_KEY, SUPABASE_SERVICE_ROLE). A 2000-token analysis prompt is configuration, not a secret.

---

## INFRA Implementation Details

### INFRA-01: Stale processing cleanup

**Approach 1 — pg_cron (preferred):**

```sql
-- Step 1: Enable extension in Supabase Dashboard → Integrations → Cron
-- OR via SQL:
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Step 2: Create the cleanup job
SELECT cron.schedule(
  'cleanup-stale-analises',
  '*/5 * * * *',
  $$
    UPDATE public.analises
    SET
      status        = 'error',
      error_message = 'Processamento interrompido automaticamente. O servidor pode ter reiniciado durante a análise. Tente novamente.',
      updated_at    = now()
    WHERE status = 'processing'
      AND updated_at < now() - interval '5 minutes';
  $$
);

-- Verify the job was created:
SELECT * FROM cron.job;
```

**Note:** pg_cron jobs run as the `postgres` superuser role by default on Supabase. The UPDATE above bypasses RLS because pg_cron runs outside the session context. This is the correct behavior — the cleanup job needs to update rows regardless of tenant. [VERIFIED: pg_cron docs via WebSearch]

**Approach 2 — n8n Scheduled Workflow (if pg_cron unavailable):**
```
[1] Schedule Trigger: every 5 minutes
[2] HTTP Request — PATCH
    URL: https://<ref>.supabase.co/rest/v1/analises?status=eq.processing&updated_at=lt.{{ new Date(Date.now() - 5*60*1000).toISOString() }}
    Method: PATCH
    Headers: service_role key
    Body: { "status": "error", "error_message": "Processamento interrompido automaticamente. Tente novamente." }
```

---

### INFRA-02: Retry on fail for Anthropic call

In the HTTP Request node at step [8]:
- Toggle: "Retry On Fail" → ON
- Max tries: 3
- Wait between tries: 10000ms (10 seconds)

This handles 529 Overloaded errors and transient network failures. If all 3 retries fail, n8n marks the node as failed and triggers the Error Trigger workflow (INFRA-03). [VERIFIED: n8n HTTP Request node documentation]

---

### INFRA-03: Error Trigger workflow setup

**Configuration in Workflow 1 Settings:**
- Workflow Settings → Error Workflow → select "Análise iFood — Error Handler"

**Data available in the Error Trigger node:**
```json
{
  "execution": {
    "id": "abc123",
    "url": "http://localhost:5678/execution/abc123",
    "retryOf": null,
    "error": {
      "message": "Node X failed: ...",
      "stack": "..."
    },
    "lastNodeExecuted": "Google Drive",
    "mode": "webhook",
    "workflowId": "12"
  },
  "workflow": {
    "id": "12",
    "name": "Análise iFood — Main"
  }
}
```

**What is NOT available:** The original webhook input (job_id, tenant_id) is NOT in the Error Trigger's default output. [VERIFIED: n8n error handling docs]

**Workaround to recover job_id:**
1. In Workflow 2, after the Error Trigger, add an HTTP Request node calling the n8n Executions API:
   - `GET http://localhost:5678/api/v1/executions/{{ $json.execution.id }}`
   - Auth: n8n API key (generate in n8n Settings → API)
2. Parse the response to extract the webhook body: navigate to `data.resultData.runData['Webhook'][0].data.main[0][0].json.body.job_id`
   - [ASSUMED: exact JSON path — must be verified by inspecting a real failed execution in n8n. Node name in path must match the actual Webhook node name in Workflow 1]

**Alternative if Executions API proves unreliable:** At the START of Workflow 1 (step [2], right after the Webhook), write the job_id to a Supabase row field `processing_started_at = now()`. The Error Trigger can then run a Supabase query to find the most-recently-stuck `processing` row for this workflow. This is less precise but avoids the Executions API dependency.

---

## Supabase REST PATCH Pattern (service_role)

All Supabase writes from n8n use the REST API with service_role key. This pattern bypasses RLS and is the established convention in this codebase (matching Edge Functions pattern).

**PATCH analises row:**
```
URL: https://{{ $env.SUPABASE_URL }}/rest/v1/analises?job_id=eq.{{ $json.job_id }}
Method: PATCH
Headers:
  apikey: {{ $env.SUPABASE_SERVICE_ROLE_KEY }}
  Authorization: Bearer {{ $env.SUPABASE_SERVICE_ROLE_KEY }}
  Content-Type: application/json
  Prefer: return=minimal
Body: { "status": "processing", "updated_at": "{{ new Date().toISOString() }}" }
```

Store `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in n8n environment variables (accessible as `$env.VAR_NAME`), loaded from Infisical on VPS startup. [VERIFIED: existing codebase pattern in ARCHITECTURE.md and STACK.md]

---

## Implementation Order (tasks for planner)

The following is the recommended atomic task sequence for the planner. Each task is testable in isolation before proceeding to the next.

**Task 1 — Create Workflow 1 skeleton with Webhook + immediate response**
- Create n8n workflow "Análise iFood — Main"
- Add Webhook node: path `/analise-ifood`, method POST, Respond: Immediately, response body `{ "job_id": "{{ $json.body.job_id }}" }`
- Test: POST to webhook URL, confirm 200 response arrives in < 500ms

**Task 2 — Add PATCH status='processing' (PIPE-02)**
- HTTP Request node after Webhook
- Confirm row in Supabase changes from `pending` to `processing`
- Verify service_role key is correct (test INSERT shows up in table)

**Task 3 — folder_id extraction and Drive file listing (PIPE-03, PIPE-04)**
- Code node: regex extraction
- Google Drive node: list files with mimeType filter
- Test with real Drive folder shared to automacao@consultdelivery.com.br
- Confirm: (a) images listed, (b) subfolders excluded, (c) error thrown for bad URL

**Task 4 — File download loop and size filtering (PIPE-05)**
- Split In Batches node + IF node for mimeType
- Google Drive Download node for images
- Google Drive Export node for CSVs
- Code node: size check (reject >3.7MB raw)
- Test: confirm binary data available for a sample PNG

**Task 5 — Claude API call with tool-use (PIPE-06)**
- Code node: build Claude payload (images as base64 + CSV text)
- HTTP Request node: POST to Anthropic with tool-use body
- Enable Retry on fail (3 attempts, 10s) — INFRA-02
- Test: confirm response has stop_reason='end_turn', content includes type='tool_use' block

**Task 6 — Parse Claude response + generate HTML (PIPE-07)**
- Code node: extract toolUseBlock.input as resultado_json
- Code node: generate HTML from JSON template
- Test: console log HTML, confirm valid markup

**Task 7 — PATCH status='done' with all outputs (PIPE-08)**
- HTTP Request PATCH: status, resultado_json, html_relatorio, mensagem_whatsapp
- Test: confirm React Realtime subscription fires and displays resultado_json

**Task 8 — INSERT Kanban tasks (PIPE-09)**
- Loop node over prioridades (max 5)
- HTTP Request POST to /rest/v1/tasks for each
- Test: open Kanban, confirm 5 new tasks appear in "A Fazer" column

**Task 9 — WhatsApp send non-fatal branch (PIPE-10)**
- HTTP Request to Evolution API (existing integration)
- Place in separate branch AFTER step 7 PATCH completes
- Test with disconnected Evolution instance — confirm analysis still saved to status='done'

**Task 10 — Error path: explicit branch (PIPE-11)**
- IF node after file listing: no files → PATCH error
- IF/error check after Claude parse: bad response → PATCH error
- Test: use invalid Drive link → confirm status='error', error_message legible

**Task 11 — Error Trigger workflow (INFRA-03)**
- Create Workflow 2: Error Trigger → Executions API call → PATCH status='error'
- Set Workflow 1 Settings → Error Workflow = Workflow 2
- Test: manually fail a node in Workflow 1, confirm Supabase row gets status='error'

**Task 12 — INFRA-01: stale cleanup**
- Enable pg_cron in Supabase Dashboard
- Run `SELECT cron.schedule(...)` SQL
- Test: manually set a row to processing + updated_at = now()-6min, wait for pg_cron run, confirm status='error'

---

## Risks and Mitigations

### Risk 1 — Error Trigger cannot recover job_id [HIGH probability, CRITICAL if not handled]
**What goes wrong:** The Error Trigger fires but job_id is not in its default output. Workflow 2 calls the Executions API to recover it, but the JSON path to the webhook body is version-dependent.
**Mitigation:** Test Workflow 2 with a deliberately failed Workflow 1 execution on the actual VPS before go-live. Print the raw Executions API response to n8n console to discover the correct JSON path.

### Risk 2 — Drive quota: listing files returns unexpected structure [MEDIUM probability]
**What goes wrong:** The Google Drive node's filter query syntax changes between n8n versions. The `'folderId' in parents` filter may require URL encoding or slightly different syntax.
**Mitigation:** Test Task 3 with a real Drive folder before building Tasks 4–6. Log the raw node output to verify file list structure matches expectations.

### Risk 3 — max_tokens=8096 is still not enough for large analyses [LOW probability, HIGH impact]
**What goes wrong:** 10+ screenshots + long CSVs + system prompt + tool schema tokens exhaust the 8096 output limit. stop_reason='max_tokens' causes Code node [9] to throw.
**Mitigation:** Code node [9] checks stop_reason explicitly and throws with a readable message. Error path writes `status='error'` with "Análise muito grande — reduza o número de arquivos para máx 10". Note: claude-sonnet-4-6 max output is 64k tokens (verified from Anthropic docs) — 8096 is a conservative guard, not a hard ceiling.

### Risk 4 — n8n loop node aggregation [MEDIUM probability]
**What goes wrong:** After the Split In Batches loop (for file downloads), the downstream Code node [7] that aggregates all binary items may receive items from only the last batch iteration if not correctly wired.
**Mitigation:** Use the `$('node name').all()` pattern in Code node [7] to pull from all iterations rather than `$input.first()`. Test with ≥3 images in the Drive folder.

### Risk 5 — tool_choice forcing not available in extended thinking mode [LOW probability, LOW impact]
**What goes wrong:** If Wandson enables extended thinking on claude-sonnet-4-6 in the future, `tool_choice: {type: "tool"}` is incompatible.
**Mitigation:** Do not enable extended thinking for this pipeline. Keep `tool_choice: {type: "tool", "name": "analise_ifood"}` as is. Verified: `tool_choice: {"type": "any"}` and `{"type": "tool"}` are incompatible with extended thinking per Anthropic docs.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Error Trigger can recover job_id via n8n Executions API at path `data.resultData.runData['Webhook'][...].json.body.job_id` | INFRA-03 | Error handler cannot update correct Supabase row; rows stuck in 'processing' until pg_cron cleanup |
| A2 | System prompt content (~2000 tokens) is defined by Wandson separately | HTML Generation + System Prompt | Pipeline cannot be tested end-to-end until prompt exists |
| A3 | Full resultado_json schema (all 8 analysis blocks) determined by system prompt shape | HTML Generation, PIPE-07 | HTML template Code node needs updating after schema is finalized |
| A4 | `automacao@consultdelivery.com.br` OAuth2 credential is already configured and working in n8n | Drive Integration | Tasks 3–5 will fail; need to re-create credential |
| A5 | Evolution API integration (existing) sends WhatsApp text via `POST /message/sendText/<instance>` with body `{ "number": "<phone>", "text": "<message>" }` | PIPE-10 | Adjust node if Evolution API version on VPS uses different endpoint |

**Non-assumed (verified in this session):**
- `claude-sonnet-4-6` is the correct current model ID (not the deprecated `claude-sonnet-4-20250514`) — [VERIFIED: Anthropic docs]
- tool_choice force syntax is `{"type": "tool", "name": "<tool_name>"}` — [VERIFIED: Anthropic define-tools docs]
- tool_use response: `toolUseBlock.input` is already a parsed object — [VERIFIED: Anthropic API response docs]
- tasks schema (col, priority, due_label values) — [VERIFIED: src/types/database.ts, src/screens/KanbanScreen.jsx]
- analises schema (all fields) — [VERIFIED: supabase/migrations/20260502_analises.sql]
- pg_cron syntax `cron.schedule()` — [VERIFIED: Supabase Cron docs]
- api.js functions createAnalise, getAnalise, subscribeToAnalise already implemented — [VERIFIED: src/lib/api.js]

---

## Open Questions

1. **System prompt content** — The iFood analyst system prompt (~2000 tokens) needs to be written before Task 5 can be tested end-to-end. Wandson manages this directly in n8n. Is there a draft prompt or YAML rules document to use as a starting point?

2. **Phase 1 completion status** — Phase 2 depends on Phase 1's analises table migration and webhook trigger being live. Confirm 20260502_analises.sql has been applied to the Supabase project before starting Task 1.

3. **Evolution API send endpoint** — What is the exact endpoint and request body format in the Evolution API version running on the VPS (193.202.85.82)? The endpoint changes between Evolution API v1 and v2.

4. **DELI agent UUID** — For PIPE-09 task INSERTs, should the `agent_id` field reference the DELI agent UUID from the `agents` table? If yes, what is DELI's UUID in the current database?

5. **WhatsApp destination** — PIPE-10 sends WhatsApp to the store owner (`customer.phone`). Is the `customers` table guaranteed to have a `phone` field for iFood clients? The api.js `listClientes` query fetches `id, name, phone` — confirm phone is always populated for clients being analyzed.

---

## Environment Availability

| Dependency | Required By | Available | Notes |
|------------|------------|-----------|-------|
| n8n self-hosted | All workflow tasks | Yes | VPS 193.202.85.82, Docker, port 5678 |
| Google Drive node | PIPE-04, PIPE-05 | Yes | Built-in n8n node |
| automacao@ OAuth2 credential | PIPE-04, PIPE-05 | [A4-ASSUMED] | Already set up per STACK.md |
| Anthropic API key in n8n env | PIPE-06 | Yes | ANTHROPIC_API_KEY in Infisical |
| Supabase service_role key in n8n env | PIPE-02, PIPE-08, PIPE-09, PIPE-11 | Yes | Matches existing Edge Function pattern |
| Evolution API (local) | PIPE-10 | Yes | Same VPS, existing integration |
| pg_cron extension | INFRA-01 | Available (Supabase Pro) | Enable via Dashboard → Integrations → Cron |
| n8n Executions API | INFRA-03 | Yes | Built-in, requires n8n API key from Settings |

---

## Sources

### Primary (HIGH confidence)
- Anthropic Models Overview (verified May 2026) — model ID `claude-sonnet-4-6`, max output 64k tokens
- Anthropic Define Tools docs — tool_choice `{"type": "tool"}` syntax, input_schema structure, tool_use response format
- `src/types/database.ts` (codebase) — tasks table Insert schema, all field names and types
- `supabase/migrations/20260502_analises.sql` (codebase) — analises table schema, confirmed fields
- `src/lib/api.js` (codebase) — confirmed subscribeToAnalise, getAnalise, createAnalise already implemented
- `src/screens/KanbanScreen.jsx` (codebase) — confirmed COLS (todo/progress/review/done) and PRIORITY (high/med/low) values
- `.planning/research/STACK.md` — Drive node, HTTP Request approach, binary download pattern
- `.planning/research/PITFALLS.md` — verified risk patterns and priorities

### Secondary (MEDIUM confidence)
- Supabase Cron docs (WebSearch verified) — pg_cron availability, `cron.schedule()` syntax
- n8n Error Trigger docs (WebSearch) — Error Trigger output structure, execution.id field availability
- n8n community (WebSearch) — Executions API approach to recover input data from failed workflow

### Tertiary (LOW confidence — flag for validation)
- [A1] Error Trigger → Executions API JSON path to webhook body — requires live verification on VPS
- [A5] Evolution API send endpoint format — depends on version installed on VPS

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — model ID verified from Anthropic live docs; tasks schema verified from codebase
- Architecture: HIGH — follows established patterns from STACK.md and ARCHITECTURE.md; no new infrastructure
- Tool-use request body: HIGH — verified from Anthropic official define-tools documentation
- Error Trigger + job_id recovery: MEDIUM — documented limitation, workaround is standard pattern but path is version-dependent
- pg_cron SQL: HIGH — syntax verified from WebSearch against official pg_cron and Supabase sources
- Pitfalls: HIGH — all carried forward from verified PITFALLS.md

**Research date:** 2026-05-02
**Valid until:** 2026-06-01 (stable stack; reassess if n8n is upgraded on VPS)
