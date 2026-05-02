---
phase: 2
plan: 1
slug: pipeline-n8n
title: "Pipeline n8n — Análise iFood"
goal: "n8n workflow complete: Drive → Claude → Supabase (done status) + Kanban tasks + WhatsApp, with full error handling"
requirements_addressed: [PIPE-01, PIPE-02, PIPE-03, PIPE-04, PIPE-05, PIPE-06, PIPE-07, PIPE-08, PIPE-09, PIPE-10, PIPE-11, INFRA-01, INFRA-02, INFRA-03]
estimated_effort: "5h"
waves: 4
status: draft
depends_on: ["Phase 1 complete — analises table applied (20260502_analises.sql), webhook trigger in React live"]
---

# Pipeline n8n — Análise iFood

## Context

**Three n8n workflows** are built in this phase:
- **Workflow 1 — Análise iFood: Main** — primary 13-node pipeline (PIPE-01 through PIPE-10)
- **Workflow 2 — Análise iFood: Error Handler** — global Error Trigger (INFRA-03)
- **Workflow 3 / pg_cron — Stale Cleanup** — 5-minute cron job (INFRA-01)

**All Supabase writes use the service_role key via REST API** — never the n8n Supabase node (blocked by RLS).

**n8n environment variables required (set before starting):**
- `SUPABASE_URL` — your project URL (e.g., `https://xxxx.supabase.co`)
- `SUPABASE_SERVICE_ROLE_KEY` — service_role key (from Supabase Dashboard → Settings → API)
- `ANTHROPIC_API_KEY` — from Infisical (already on VPS)
- `N8N_API_KEY` — generate in n8n Settings → API (needed for INFRA-03)

**Supabase REST PATCH pattern (used throughout):**
```
URL: {{ $env.SUPABASE_URL }}/rest/v1/analises?job_id=eq.{{ JOB_ID_EXPRESSION }}
Method: PATCH
Headers:
  apikey: {{ $env.SUPABASE_SERVICE_ROLE_KEY }}
  Authorization: Bearer {{ $env.SUPABASE_SERVICE_ROLE_KEY }}
  Content-Type: application/json
  Prefer: return=minimal
```

**analises table fields confirmed** (from `supabase/migrations/20260502_analises.sql`):
`job_id`, `tenant_id`, `cliente_id`, `status`, `drive_link`, `periodo`, `resultado_json`, `html_relatorio`, `mensagem_whatsapp`, `error_message`, `whatsapp_sent`, `criado_por`, `created_at`, `updated_at`

**tasks table Insert fields confirmed** (from `src/types/database.ts`):
`tenant_id` (required), `title` (required), `description`, `col`, `priority`, `due_label`, `due_at`, `position`, `created_by`, `agent_id`, `assignee_id`

---

## Wave 1 — Foundation

### Task 1.1: Create Workflow 1 skeleton — Webhook with immediate 200 response

**What:** Create n8n workflow named "Análise iFood — Main". Add a Webhook node configured to respond immediately with `job_id`, and a Set node that stores the system prompt text.

**Why:** PIPE-01 — webhook must return 200 + job_id without waiting for the full pipeline to complete.

**How:**
1. In n8n, click **New Workflow** → name it `Análise iFood — Main`
2. Add **Webhook** node:
   - HTTP Method: `POST`
   - Path: `analise-ifood`
   - Respond: `Immediately` (this is the critical setting — do NOT leave it on "When last node finishes")
   - Response Code: `200`
   - Response Body: `{ "job_id": "{{ $json.body.job_id }}", "status": "processing" }`
3. Add **Set** node immediately after Webhook (name it `Set System Prompt`):
   - Add field: `systemPrompt` (type: String)
   - Value: paste the full iFood analyst system prompt here (see Open Question OQ-1)
   - This is the single place Wandson edits the prompt — referenced downstream as `{{ $('Set System Prompt').item.json.systemPrompt }}`
4. Save the workflow
5. **Copy the webhook URL** shown in the Webhook node (format: `https://VPS_IP:5678/webhook/analise-ifood`)
6. Update the React frontend's webhook call in `AnaliseiFoodScreen.jsx` to use this URL (or confirm it's already configured)

**Test:**
```bash
curl -X POST https://193.202.85.82:5678/webhook/analise-ifood \
  -H "Content-Type: application/json" \
  -d '{"job_id":"test-uuid-123","tenant_id":"tenant-uuid","drive_link":"https://drive.google.com/drive/folders/1BDATwmJQgSkhgZ49WG2xckHesLLoKCZf"}'
```
Expected: HTTP 200 arrives in < 500ms with body `{"job_id":"test-uuid-123","status":"processing"}`. Workflow continues executing asynchronously (visible in n8n executions panel).

**Depends on:** Nothing — first task in workflow.

---

### Task 1.2: Add PATCH status='processing' (first Supabase write)

**What:** Add an HTTP Request node after the Set node that immediately PATCHes the `analises` row from `pending` to `processing`.

**Why:** PIPE-02 — the row must reflect `processing` before any Drive or Claude work begins, so the frontend spinner activates and duplicate triggers are blocked.

**How:**
1. Add **HTTP Request** node after `Set System Prompt` (name it `PATCH: status=processing`)
2. Configure:
   - Method: `PATCH`
   - URL: `{{ $env.SUPABASE_URL }}/rest/v1/analises?job_id=eq.{{ $('Webhook').item.json.body.job_id }}`
   - Authentication: `Header Auth`
   - Headers:
     - `apikey`: `{{ $env.SUPABASE_SERVICE_ROLE_KEY }}`
     - `Authorization`: `Bearer {{ $env.SUPABASE_SERVICE_ROLE_KEY }}`
     - `Content-Type`: `application/json`
     - `Prefer`: `return=minimal`
   - Body (JSON):
     ```json
     {
       "status": "processing",
       "updated_at": "{{ new Date().toISOString() }}"
     }
     ```
3. Save workflow

**Test:**
1. Insert a test row in Supabase with `status = 'pending'` and a known `job_id`
2. POST to the webhook with that `job_id`
3. In Supabase Dashboard → Table Editor → `analises`, confirm the row's `status` changed to `processing` within 2 seconds
4. Confirm `updated_at` was updated

**Depends on:** Task 1.1

---

### Task 1.3: Extract folder_id from Drive link and list folder files

**What:** Add a Code node that extracts the Google Drive folder ID from the `drive_link`, then add a Google Drive node that lists files in that folder (excluding subfolders, max 15).

**Why:** PIPE-03 (regex extraction) + PIPE-04 (Drive file listing).

**How:**
1. Add **Code** node after `PATCH: status=processing` (name it `Extract folderId`):
   ```javascript
   const driveLink = $('Webhook').item.json.body.drive_link;
   const match = driveLink.match(/\/folders\/([a-zA-Z0-9_-]{10,})/);
   if (!match) {
     throw new Error(`Link do Drive inválido — não foi possível extrair o folder ID. Link recebido: ${driveLink}`);
   }
   return [{ json: { folderId: match[1], job_id: $('Webhook').item.json.body.job_id } }];
   ```

2. Add **Google Drive** node after `Extract folderId` (name it `List Drive Files`):
   - Credential: `Google OAuth2 API` (select the `automacao@consultdelivery.com.br` credential)
   - Resource: `File`
   - Operation: `Get Many` (or `Search` depending on n8n version — find the one that accepts a Q filter)
   - Q (filter): `'{{ $json.folderId }}' in parents and trashed=false and mimeType != 'application/vnd.google-apps.folder'`
   - Fields: `id,name,mimeType,size`
   - Limit: `15`

3. Add **IF** node after `List Drive Files` (name it `Guard: files found?`):
   - Condition: `{{ $json.length === 0 }}` (or check if the output array is empty)
   - True branch (no files): connect to an **HTTP Request** node that PATCHes `status='error'`, `error_message='Pasta do Drive está vazia ou sem arquivos compatíveis. Compartilhe a pasta com automacao@consultdelivery.com.br e adicione screenshots ou CSVs.'`
   - False branch (files found): continue to Wave 2

**Test:**
1. Share a real Drive folder with `automacao@consultdelivery.com.br` (must have at least 1 PNG/JPG)
2. POST to webhook with that folder's Drive link
3. In n8n execution output, confirm `List Drive Files` returns a list with `id`, `name`, `mimeType`, `size` for each file
4. Confirm no folder-type entries appear (mimeType should never be `application/vnd.google-apps.folder`)
5. Test with an invalid link (e.g., `https://drive.google.com/file/d/...`) — confirm Code node throws and row gets `status='error'`

**Depends on:** Task 1.2

---

## Wave 2 — Core Pipeline

### Task 2.1: Download files loop — images as binary, CSVs as text

**What:** Add a Split In Batches node to iterate the file list, branch by mimeType, download images as binary and export Google Sheets/CSVs as text, applying the 5MB size filter.

**Why:** PIPE-05 — images must be downloaded as base64-encodable binary; CSVs as UTF-8 text. Files over 5MB are silently skipped (not an error — just filtered out).

**How:**
1. Add **Split In Batches** node after `Guard: files found?` false branch (name it `Loop: Files`, batchSize: 1)

2. Add **IF** node inside the loop (name it `Branch: image or CSV`):
   - Image condition: `{{ $json.mimeType.startsWith('image/') }}`
   - CSV condition (else branch): `{{ $json.mimeType === 'application/vnd.google-apps.spreadsheet' || $json.mimeType === 'text/csv' }}`

3. **Image branch** — add **Google Drive** node (name it `Download Image`):
   - Resource: `File`
   - Operation: `Download`
   - File ID: `{{ $json.id }}` (use `$json.id`, never `$json.name` — names with accents cause issues)
   - Binary property name: `data`

4. After `Download Image`, add **Code** node (name it `Filter: size check`):
   ```javascript
   const item = $input.first();
   const fileSizeRaw = item.binary?.data?.fileSize ?? 0;
   // Reject if raw size > 3,728,000 bytes (~3.7MB = ~5MB after base64 +34% overhead)
   if (fileSizeRaw > 3_728_000) {
     // Skip this file — return empty to exclude from aggregation
     return [];
   }
   return [item];
   ```

5. **CSV branch** — add **Google Drive** node (name it `Export CSV`):
   - Resource: `File`
   - Operation: `Download`
   - File ID: `{{ $json.id }}`
   - For Google Sheets: set Export MIME Type to `text/csv` (n8n appends `?mimeType=text%2Fcsv` automatically for Sheets files)
   - Binary property name: `data`

6. After `Export CSV`, add **Code** node (name it `CSV to Text`):
   ```javascript
   const item = $input.first();
   const csvText = item.binary.data.toString('utf8');
   return [{ json: { csvText, fileId: item.json.id } }];
   ```

7. The loop outputs (binary items from image branch + json items from CSV branch) feed into Wave 2 Task 2.2.

**Test:**
1. Run with a Drive folder containing 1 PNG, 1 Google Sheet, and 1 file over 5MB
2. In n8n execution output: confirm the PNG item has `binary.data` populated, the Sheet item has `json.csvText` as a string, and the large file produced no output (empty return)
3. Confirm `fileId` uses the Drive file `id` field (not name)

**Depends on:** Task 1.3

---

### Task 2.2: Aggregate payload and call Anthropic API with tool-use

**What:** Add a Code node that collects all loop outputs (images as base64 + CSV texts) and assembles the Claude API request body with tool-use mode. Then add an HTTP Request node that POSTs to Anthropic with retry-on-fail.

**Why:** PIPE-06 — Claude must be called with `claude-sonnet-4-6`, `max_tokens=8096`, tool-use mode (forces valid JSON output). INFRA-02 — 3 retries at 10s interval.

**How:**
1. After the loop completes, add **Code** node (name it `Build Claude Payload`):
   ```javascript
   // Pull ALL items from the loop (not just last batch)
   const allItems = $('Loop: Files').all();
   const images = [];
   const csvTexts = [];

   for (const item of allItems) {
     if (item.binary?.data) {
       const b64 = item.binary.data.toString('base64');
       const mediaType = item.binary.data.mimeType || 'image/jpeg';
       images.push({
         type: 'image',
         source: { type: 'base64', media_type: mediaType, data: b64 }
       });
     }
     if (item.json?.csvText) {
       csvTexts.push({ type: 'text', text: `CSV Data:\n${item.json.csvText}` });
     }
   }

   if (images.length === 0 && csvTexts.length === 0) {
     throw new Error('Nenhum arquivo válido encontrado após filtragem. Adicione screenshots PNG/JPG (máx 5MB) ou CSVs à pasta do Drive.');
   }

   const systemPrompt = $('Set System Prompt').item.json.systemPrompt;

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

2. Add **HTTP Request** node (name it `Call Anthropic API`):
   - Method: `POST`
   - URL: `https://api.anthropic.com/v1/messages`
   - Send Headers: on
   - Headers:
     - `x-api-key`: `{{ $env.ANTHROPIC_API_KEY }}`
     - `anthropic-version`: `2023-06-01`
     - `content-type`: `application/json`
   - Send Body: on, Body Content Type: `JSON`
   - Body: `{{ $json.claudeRequestBody }}` (pass the whole object)
   - **Timeout**: `120000` ms (2 minutes — Claude can take 30–90s for large analyses)
   - **Retry On Fail**: ON
     - Max Tries: `3`
     - Wait Between Tries: `10000` ms (10 seconds)

**Test:**
1. Run with a Drive folder containing at least 1 screenshot
   - You MUST have the system prompt in the Set node — even a placeholder prompt works for this test
2. In n8n execution output, confirm `Call Anthropic API` returns a response with `stop_reason` field
3. Confirm `response.content` array contains at least one item with `type === 'tool_use'` and `name === 'analise_ifood'`
4. Confirm `stop_reason !== 'max_tokens'` (if it equals `max_tokens`, reduce input or check token count)

**Depends on:** Tasks 2.1, 1.1 (Set System Prompt node must exist)

⚠️ OPEN OQ-1: The system prompt content (~2000 tokens of iFood analyst instructions) must be written by Wandson before this task can be tested end-to-end. A placeholder prompt ("Analise os arquivos e retorne dados fictícios usando a ferramenta analise_ifood.") unblocks initial testing of the API connection and tool-use parsing, but the real prompt is required for production-quality output.

---

### Task 2.3: Parse Claude response and generate HTML report

**What:** Add a Code node to extract the tool_use block from the Claude response (the `resultado_json`), then add another Code node to generate the full HTML report from that JSON using a template.

**Why:** PIPE-06 (response parsing) + PIPE-07 (HTML generation from JSON, not a second Claude call).

**How:**
1. Add **Code** node after `Call Anthropic API` (name it `Parse Claude Response`):
   ```javascript
   const response = $input.first().json;

   // Guard: truncated response
   if (response.stop_reason === 'max_tokens') {
     throw new Error('Resposta do Claude truncada (max_tokens atingido). Reduza o número de arquivos para máximo 10, ou remova CSVs muito grandes.');
   }

   // Extract tool_use block
   const toolUseBlock = response.content.find(
     b => b.type === 'tool_use' && b.name === 'analise_ifood'
   );
   if (!toolUseBlock) {
     throw new Error(`Claude não retornou um bloco tool_use válido. stop_reason: ${response.stop_reason}. Verifique a configuração tool_choice no nó Call Anthropic API.`);
   }

   // toolUseBlock.input is already a parsed JS object — do NOT call JSON.parse()
   const resultado_json = toolUseBlock.input;

   return [{
     json: {
       resultado_json,
       mensagem_whatsapp: resultado_json.mensagem_whatsapp,
       saude_geral: resultado_json.saude_geral,
       job_id: $('Webhook').item.json.body.job_id
     }
   }];
   ```

2. Add **Code** node after `Parse Claude Response` (name it `Generate HTML`):
   ```javascript
   const json = $input.first().json.resultado_json;

   const urgenciaLabel = {
     hoje: 'HOJE',
     semana: 'ESTA SEMANA',
     proximo_ciclo: 'PRÓXIMO CICLO'
   };
   const saudeColor = {
     saudavel: '#22c55e',
     atencao: '#f59e0b',
     critico: '#ef4444'
   };
   const saudeLabel = {
     saudavel: 'SAUDÁVEL',
     atencao: 'ATENÇÃO',
     critico: 'CRÍTICO'
   };

   const prioridadesHtml = (json.prioridades || []).map(p => `
     <div style="border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin:12px 0;">
       <span style="font-size:11px;font-weight:bold;text-transform:uppercase;color:#6b7280;">
         ${urgenciaLabel[p.urgencia] || p.urgencia}
       </span>
       <h3 style="margin:8px 0 4px;">${p.ordem}. ${p.titulo}</h3>
       <p style="color:#374151;margin:0 0 8px;">${p.descricao}</p>
       ${p.impacto_financeiro_estimado
         ? `<p style="color:#059669;font-weight:600;margin:0;">Impacto estimado: ${p.impacto_financeiro_estimado}</p>`
         : ''}
     </div>
   `).join('');

   const metricasHtml = json.metricas ? `
     <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:12px;margin:16px 0;">
       ${json.metricas.avaliacao_media !== undefined ? `<div style="background:#f9fafb;padding:12px;border-radius:8px;"><div style="font-size:12px;color:#6b7280;">Avaliação Média</div><div style="font-size:24px;font-weight:bold;">${json.metricas.avaliacao_media}</div></div>` : ''}
       ${json.metricas.taxa_cancelamento !== undefined ? `<div style="background:#f9fafb;padding:12px;border-radius:8px;"><div style="font-size:12px;color:#6b7280;">Taxa Cancelamento</div><div style="font-size:24px;font-weight:bold;">${json.metricas.taxa_cancelamento}%</div></div>` : ''}
       ${json.metricas.total_avaliacoes !== undefined ? `<div style="background:#f9fafb;padding:12px;border-radius:8px;"><div style="font-size:12px;color:#6b7280;">Total Avaliações</div><div style="font-size:24px;font-weight:bold;">${json.metricas.total_avaliacoes}</div></div>` : ''}
       ${json.metricas.tempo_medio_entrega !== undefined ? `<div style="background:#f9fafb;padding:12px;border-radius:8px;"><div style="font-size:12px;color:#6b7280;">Tempo Médio Entrega</div><div style="font-size:24px;font-weight:bold;">${json.metricas.tempo_medio_entrega} min</div></div>` : ''}
     </div>
   ` : '';

   const html = `<!DOCTYPE html>
   <html lang="pt-BR">
   <head>
     <meta charset="UTF-8">
     <meta name="viewport" content="width=device-width, initial-scale=1.0">
     <title>Análise iFood</title>
   </head>
   <body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:800px;margin:0 auto;padding:20px;color:#111827;">
     <h1 style="font-size:24px;margin-bottom:8px;">Análise iFood</h1>
     <span style="display:inline-block;padding:8px 20px;border-radius:20px;font-weight:bold;color:white;background:${saudeColor[json.saude_geral] || '#6b7280'};margin-bottom:16px;">
       ${saudeLabel[json.saude_geral] || json.saude_geral}
     </span>
     <p style="color:#374151;line-height:1.6;">${json.resumo_executivo}</p>
     ${metricasHtml}
     <h2 style="font-size:18px;margin-top:24px;">Top Prioridades</h2>
     ${prioridadesHtml}
   </body>
   </html>`;

   return [{
     json: {
       ...($input.first().json),
       html_relatorio: html
     }
   }];
   ```

**Test:**
1. After running Task 2.2 with a real Claude response, confirm `Parse Claude Response` output contains `resultado_json` as a JS object (not a string — no JSON.parse needed)
2. Confirm `resultado_json.saude_geral` is one of `['saudavel', 'atencao', 'critico']`
3. Confirm `Generate HTML` output contains `html_relatorio` as a valid HTML string (log first 500 chars — should start with `<!DOCTYPE html>`)
4. If `stop_reason === 'max_tokens'` appears: verify the input file count is ≤ 10 and no individual CSV is over 100KB

**Depends on:** Task 2.2

---

## Wave 3 — Integrations

### Task 3.1: PATCH status='done' with all analysis outputs

**What:** Add an HTTP Request node that writes the final analysis results to Supabase in a single atomic PATCH: `status=done`, `resultado_json`, `html_relatorio`, `mensagem_whatsapp`.

**Why:** PIPE-08 — this single write triggers the Supabase Realtime event that fires `subscribeToAnalise` in the frontend, completing the user-visible analysis flow.

**How:**
1. Add **HTTP Request** node after `Generate HTML` (name it `PATCH: status=done`):
   - Method: `PATCH`
   - URL: `{{ $env.SUPABASE_URL }}/rest/v1/analises?job_id=eq.{{ $json.job_id }}`
   - Headers: (same service_role pattern as Task 1.2)
     - `apikey`: `{{ $env.SUPABASE_SERVICE_ROLE_KEY }}`
     - `Authorization`: `Bearer {{ $env.SUPABASE_SERVICE_ROLE_KEY }}`
     - `Content-Type`: `application/json`
     - `Prefer`: `return=minimal`
   - Body (JSON):
     ```json
     {
       "status": "done",
       "resultado_json": {{ JSON.stringify($json.resultado_json) }},
       "html_relatorio": {{ JSON.stringify($json.html_relatorio) }},
       "mensagem_whatsapp": {{ JSON.stringify($json.mensagem_whatsapp) }},
       "updated_at": "{{ new Date().toISOString() }}"
     }
     ```
   - Note: use n8n's expression mode for the body, or set Body Content Type to `JSON (Raw)` and use: `{{ $json }}` after restructuring the output of `Generate HTML` to match the PATCH shape. If mixing static keys and dynamic values is awkward, use the `JSON (Raw)` approach and build the object in a Set node first.

**Test:**
1. Run the full pipeline from Task 1.1 through this task with a real Drive folder
2. In Supabase Dashboard → `analises` table, confirm the row now shows:
   - `status = 'done'`
   - `resultado_json` is non-null JSONB with `saude_geral` and `prioridades`
   - `html_relatorio` is non-null TEXT starting with `<!DOCTYPE html>`
   - `mensagem_whatsapp` is non-null TEXT
3. If the React frontend is running (Phase 1 complete), confirm the Realtime subscription fires and the UI transitions from spinner to result

**Depends on:** Task 2.3

---

### Task 3.2: INSERT top-5 Kanban tasks from prioridades

**What:** Add a Loop node over `resultado_json.prioridades` (max 5 items) and an HTTP Request node inside the loop that INSERTs each priority as a task in the `tasks` table.

**Why:** PIPE-09 — top-5 priorities auto-create as Kanban tasks in `col='todo'` with correct `priority` and `due_label` values matching the existing Kanban UI constants.

**How:**
1. Add **Code** node after `PATCH: status=done` (name it `Prepare Task Items`):
   ```javascript
   const prioridades = $json.resultado_json.prioridades.slice(0, 5);
   const webhookData = $('Webhook').item.json.body;

   const urgenciaMap = {
     hoje: { priority: 'high', due_label: 'Hoje' },
     semana: { priority: 'med', due_label: 'Esta semana' },
     proximo_ciclo: { priority: 'low', due_label: 'Próximo ciclo' }
   };

   return prioridades.map((p, idx) => ({
     json: {
       tenant_id: webhookData.tenant_id,
       title: p.titulo,
       description: p.descricao || null,
       col: 'todo',
       priority: urgenciaMap[p.urgencia]?.priority || 'low',
       due_label: urgenciaMap[p.urgencia]?.due_label || 'Próximo ciclo',
       position: idx,
       created_by: webhookData.criado_por || null
     }
   }));
   ```

2. Add **Loop Over Items** node (name it `Loop: Tasks`, batchSize: 1) — this iterates each item from `Prepare Task Items`

3. Inside the loop, add **HTTP Request** node (name it `INSERT Task`):
   - Method: `POST`
   - URL: `{{ $env.SUPABASE_URL }}/rest/v1/tasks`
   - Headers:
     - `apikey`: `{{ $env.SUPABASE_SERVICE_ROLE_KEY }}`
     - `Authorization`: `Bearer {{ $env.SUPABASE_SERVICE_ROLE_KEY }}`
     - `Content-Type`: `application/json`
     - `Prefer`: `return=minimal`
   - Body (JSON): `{{ $json }}` (passes the full item as the INSERT body)

**Test:**
1. Run the full pipeline with a Drive folder that has enough content for Claude to produce ≥ 3 priorities
2. In Supabase Dashboard → `tasks` table, confirm 3–5 new rows appear with:
   - `col = 'todo'`
   - `priority` one of `['high', 'med', 'low']`
   - `due_label` one of `['Hoje', 'Esta semana', 'Próximo ciclo']`
   - `tenant_id` matching the webhook payload
3. Open the Kanban screen in the React app and confirm the new tasks appear in the "A Fazer" column

**Depends on:** Task 3.1

⚠️ OPEN OQ-4: Confirm the `tasks` table schema is finalized (no pending migrations) before running this task. The schema is verified from `src/types/database.ts` but any pending Kanban changes would affect INSERT compatibility.

⚠️ OPEN OQ-5: The DELI agent UUID — if Wandson wants tasks to show the DELI agent avatar in the Kanban, add `agent_id: '<DELI_UUID>'` to the INSERT body in `Prepare Task Items`. DELI's UUID can be found in Supabase → `agents` table. If not set, `agent_id` defaults to null (tasks appear without agent assignment).

---

### Task 3.3: Send WhatsApp via Evolution API (non-fatal branch)

**What:** Add a non-fatal WhatsApp send branch that runs AFTER `PATCH: status=done` completes. A failure here does NOT revert the analysis. On failure, `whatsapp_sent` remains `false` (the default) — no additional PATCH needed.

**Why:** PIPE-10 — WhatsApp delivery is a best-effort action. Analysis results must be safe in Supabase regardless of WhatsApp connectivity.

**How:**
1. Connect `PATCH: status=done` to two parallel paths:
   - Path A → `Loop: Tasks` (Task 3.2)
   - Path B → this WhatsApp node

2. Add **Code** node on Path B (name it `Prepare WhatsApp Payload`):
   ```javascript
   const webhookData = $('Webhook').item.json.body;
   const mensagem = $('Generate HTML').item.json.mensagem_whatsapp;

   // phone must be in E.164 format without '+': e.g., 5511999998888
   const phone = webhookData.customer_phone
     || webhookData.phone
     || null;

   if (!phone) {
     // No phone available — skip send silently
     return [];
   }

   return [{
     json: {
       number: phone.replace(/\D/g, ''),
       text: mensagem
     }
   }];
   ```

3. Add **HTTP Request** node (name it `Send WhatsApp`):
   - Method: `POST`
   - URL: `http://localhost:3000/message/sendText/<INSTANCE_NAME>`
   - Headers:
     - `apikey`: `{{ $env.EVOLUTION_API_KEY }}`
     - `Content-Type`: `application/json`
   - Body: `{{ $json }}`
   - **Continue on Fail**: ON (this is critical — makes the branch non-fatal)
   - Do NOT add error handling here — `Continue on Fail` absorbs the error and execution continues

**Test:**
1. Run with a real tenant and `customer_phone` in the webhook payload
2. Confirm WhatsApp message is received on the destination phone
3. **Disconnect test:** Stop the Evolution API container, run the pipeline again — confirm the `analises` row still reaches `status='done'` and the only evidence of WhatsApp failure is a failed node in n8n execution (not a status='error' row in Supabase)

**Depends on:** Task 3.1

⚠️ OPEN OQ-3: The Evolution API endpoint format depends on the version running on VPS 193.202.85.82. Check the version:
- v1: `POST /message/sendText/<instance>` with body `{ "number": "<phone>", "text": "<msg>" }`
- v2: `POST /message/sendText/<instance>` with body `{ "number": "<phone>", "textMessage": { "text": "<msg>" } }`
Run `curl http://localhost:3000/` on the VPS to see the version, then adjust the body structure accordingly.

⚠️ OPEN OQ-2: WhatsApp destination — is `mensagem_whatsapp` sent directly to the store owner (`customer.phone`) or to Wandson/the consultant for approval first? If the latter, the send should target the consultant's phone and ACTION-02 (Phase 3) handles final delivery to the client.

---

## Wave 4 — Resilience

### Task 4.1: Explicit error path — PATCH status='error' on known failures

**What:** Wire the explicit error path for all known failure points in Workflow 1: (1) invalid Drive link (from Task 1.3), (2) empty Drive folder (from Task 1.3), (3) no valid files after filtering (from Task 2.2), (4) Claude response missing tool_use block or truncated.

**Why:** PIPE-11 — every failure must write a human-readable `error_message` to the row. No row should ever get stuck in `processing` due to a silent failure in the main workflow.

**How:**
1. Create a reusable **HTTP Request** node configuration for error PATCHes (you may need multiple copies in n8n — one per failure point):
   - Method: `PATCH`
   - URL: `{{ $env.SUPABASE_URL }}/rest/v1/analises?job_id=eq.{{ $('Webhook').item.json.body.job_id }}`
   - Headers: service_role pattern
   - Body:
     ```json
     {
       "status": "error",
       "error_message": "{{ $json.errorMessage || 'Erro interno no processamento. Tente novamente.' }}",
       "updated_at": "{{ new Date().toISOString() }}"
     }
     ```

2. Wire the following failure exits to their respective error PATCH nodes:
   - `Guard: files found?` TRUE branch → PATCH with `error_message = 'Pasta do Drive está vazia ou inacessível. Compartilhe a pasta com automacao@consultdelivery.com.br e adicione os arquivos da loja.'`
   - `Extract folderId` Code node throw → caught by Error Trigger (INFRA-03 handles this) — no explicit PATCH needed here, Error Trigger covers it
   - `Build Claude Payload` throw (no valid files) → PATCH with `error_message = 'Nenhuma imagem ou CSV válido encontrado. Adicione screenshots PNG/JPG (máx 5MB) à pasta do Drive.'`
   - `Parse Claude Response` throw → PATCH with `error_message = 'Falha ao processar resposta da IA. Detalhes: {{ $json.error?.message || "erro desconhecido" }}'`

3. For Code node throws that should produce explicit error PATCHes (rather than relying on Error Trigger): wrap the Code node logic in try/catch and use the IF node to route errors to the PATCH node.

   Alternative: use n8n's built-in **Error Output** connector on Code nodes (enable "Continue on Fail" → false, and route the error output pin). Check your n8n version for error output connector availability.

**Test:**
1. **Invalid Drive link test:** POST webhook with `drive_link = 'https://drive.google.com/file/d/xyz/view'` → confirm Supabase row gets `status='error'` with readable `error_message` within 10 seconds
2. **Empty folder test:** Share an empty Drive folder with `automacao@` → confirm `status='error'` with "Pasta do Drive está vazia" message
3. **Verify no spinner-lock:** For each error test, confirm the React frontend (if running) receives the Realtime UPDATE and stops showing the spinner

**Depends on:** Tasks 1.3, 2.2, 2.3

---

### Task 4.2: Error Trigger workflow — global unhandled failure catch

**What:** Create a separate n8n workflow "Análise iFood — Error Handler" with an Error Trigger node that catches any unhandled failure in Workflow 1, recovers the `job_id` via the n8n Executions API, and PATCHes `status='error'` in Supabase.

**Why:** INFRA-03 — explicit error paths (Task 4.1) cover known failures, but infrastructure crashes (node OOM, unhandled exception, network timeout mid-workflow) bypass those paths. The Error Trigger is the safety net.

**How:**
1. Create a **new n8n workflow** named `Análise iFood — Error Handler`

2. Add **Error Trigger** node (first node — no configuration needed)
   - Output: `{ execution: { id, url, error: { message, stack }, lastNodeExecuted, mode, workflowId }, workflow: { id, name } }`

3. Add **HTTP Request** node (name it `Fetch Failed Execution`):
   - Method: `GET`
   - URL: `http://localhost:5678/api/v1/executions/{{ $json.execution.id }}`
   - Headers:
     - `X-N8N-API-KEY`: `{{ $env.N8N_API_KEY }}`
   - This returns the full execution record including the webhook input data

4. Add **Code** node (name it `Extract job_id`):
   ```javascript
   // IMPORTANT: The exact JSON path depends on your n8n version and Webhook node name.
   // Verify this path by inspecting a real failed execution via the n8n Executions UI.
   // The Webhook node in Workflow 1 must be named exactly 'Webhook' for this path to work.
   const execData = $input.first().json;
   
   let job_id = null;
   try {
     // Navigate: data.resultData.runData['Webhook'][0].data.main[0][0].json.body.job_id
     const runData = execData.data?.resultData?.runData;
     const webhookNode = runData?.['Webhook'];
     job_id = webhookNode?.[0]?.data?.main?.[0]?.[0]?.json?.body?.job_id || null;
   } catch (e) {
     // Path not found — log and continue to IF guard
     job_id = null;
   }

   const errorMessage = $('Error Trigger').item.json.execution.error?.message || 'Erro interno não identificado';

   return [{ json: { job_id, errorMessage } }];
   ```

5. Add **IF** node (name it `Guard: job_id found?`):
   - Condition: `{{ $json.job_id !== null && $json.job_id !== undefined }}`
   - True branch → PATCH status='error'
   - False branch → Stop (log: "Error Trigger fired but job_id could not be recovered — pg_cron will clean up")

6. Add **HTTP Request** node on true branch (name it `PATCH: error from trigger`):
   - Method: `PATCH`
   - URL: `{{ $env.SUPABASE_URL }}/rest/v1/analises?job_id=eq.{{ $json.job_id }}`
   - Headers: service_role pattern
   - Body:
     ```json
     {
       "status": "error",
       "error_message": "Falha interna no processamento. O servidor pode ter sido reiniciado. Tente novamente.",
       "updated_at": "{{ new Date().toISOString() }}"
     }
     ```

7. **Connect Workflow 2 to Workflow 1:**
   In **Workflow 1 Settings** (gear icon) → Error Workflow → select `Análise iFood — Error Handler`

8. Generate the `N8N_API_KEY` in n8n Settings → API → Create API Key. Store it as an n8n environment variable (same `.env` file as `ANTHROPIC_API_KEY`).

**Test:**
1. In Workflow 1, temporarily add a **Code** node that throws `new Error('DELIBERATE TEST ERROR')` early in the workflow (before any Supabase writes)
2. POST to the webhook with a real `job_id` from a `processing` row
3. In n8n → Executions, confirm Workflow 2 was triggered automatically
4. In Supabase, confirm the row gets `status='error'` with the fallback error message
5. Remove the deliberate error node from Workflow 1 after the test passes

⚠️ OPEN (implementation-time): The JSON path `data.resultData.runData['Webhook'][0].data.main[0][0].json.body.job_id` is an assumption (A1 in the research doc). After step 1 of the test above, inspect the raw response from `Fetch Failed Execution` in the n8n execution panel and update the `Extract job_id` Code node path to match reality. This is the single highest-risk step in this phase.

**Depends on:** Tasks 1.1 (Workflow 1 must exist and have the Webhook node named 'Webhook')

---

### Task 4.3: pg_cron stale cleanup — rows stuck in processing > 5 minutes

**What:** Enable pg_cron in Supabase and schedule a job that runs every 5 minutes to set `status='error'` on any row that has been in `processing` for more than 5 minutes.

**Why:** INFRA-01 — catches edge cases where both the explicit error paths AND the Error Trigger fail to update the row (e.g., VPS crash, network partition). This is the last line of defence against stuck spinners.

**How:**
1. Enable pg_cron in Supabase Dashboard:
   - Go to **Dashboard → Integrations → Cron**
   - Toggle ON
   - Wait for the extension to activate (< 1 minute)

2. Open **Supabase Dashboard → SQL Editor** and run:
   ```sql
   -- Verify pg_cron is active
   SELECT * FROM cron.job;
   -- Should return an empty table (no error = extension is enabled)

   -- Create the cleanup job
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

   -- Confirm the job was registered
   SELECT jobid, jobname, schedule, command FROM cron.job;
   ```
   Expected: 1 row returned with `jobname = 'cleanup-stale-analises'` and `schedule = '*/5 * * * *'`

3. The pg_cron job runs as the `postgres` superuser role — it bypasses RLS intentionally (correct behavior for a cleanup job).

**Test:**
1. Manually insert a test row in the `analises` table with `status = 'processing'` and `updated_at = now() - interval '6 minutes'`:
   ```sql
   INSERT INTO analises (tenant_id, status, updated_at, error_message)
   VALUES (
     (SELECT id FROM tenants LIMIT 1),
     'processing',
     now() - interval '6 minutes',
     null
   );
   ```
2. Wait up to 5 minutes for pg_cron to run (or check `cron.job_run_details` for the last run time)
3. Query the row: confirm `status = 'error'` and `error_message = 'Processamento interrompido automaticamente...'`
4. Verify that rows with `status = 'pending'` or `status = 'done'` are NOT affected by the job

**Depends on:** Nothing (pg_cron runs independently of n8n workflows)

---

## End-to-End Verification

Run this sequence to confirm all 14 requirements are working as a complete system:

1. **Precondition:** Phase 1 complete — React form live, `analises` migration applied, `subscribeToAnalise` wired in frontend

2. **Happy path test:**
   - Use the React form: select a real client, paste a valid Drive folder link (with 2–3 screenshots shared with `automacao@consultdelivery.com.br`), click "Iniciar Análise"
   - Expected sequence (verify in Supabase Dashboard):
     - Row appears with `status = 'pending'` (React INSERT)
     - Within 2 seconds: `status = 'processing'` (n8n PATCH)
     - Within 90 seconds: `status = 'done'`, `resultado_json` non-null, `html_relatorio` non-null, `mensagem_whatsapp` non-null
     - 5 new rows in `tasks` table with `col = 'todo'`

3. **Error path test:**
   - Use the form with a Google Drive link to a folder NOT shared with `automacao@`
   - Expected: row transitions to `status = 'error'` with a human-readable message within 30 seconds

4. **Resilience test:**
   - Manually set a row to `status = 'processing'`, `updated_at = now() - interval '6 minutes'`
   - Wait ≤ 5 minutes
   - Expected: pg_cron sets `status = 'error'`

---

## Open Questions Summary

| ID | Question | Blocks | Resolution |
|----|----------|--------|------------|
| OQ-1 | System prompt content (~2000 tokens) | Task 2.2 end-to-end test | Wandson writes in n8n Set node before first real test |
| OQ-2 | WhatsApp destination: store owner direct or consultant approval first? | Task 3.3 phone target | Wandson decides — affects `number` field in payload |
| OQ-3 | Evolution API version on VPS (v1 vs v2 body format) | Task 3.3 | Run `curl http://localhost:3000/` on VPS to check version |
| OQ-4 | tasks table schema finalized (no pending migrations) | Task 3.2 | Check Supabase migrations before running PIPE-09 |
| OQ-5 | DELI agent UUID for task `agent_id` field | Task 3.2 (optional) | Check `agents` table in Supabase; optional field |

---

## Requirements Coverage

| Requirement | Task | Status |
|-------------|------|--------|
| PIPE-01 — Webhook 200 immediate | Task 1.1 | Planned |
| PIPE-02 — PATCH status=processing | Task 1.2 | Planned |
| PIPE-03 — Extract folder_id via regex | Task 1.3 | Planned |
| PIPE-04 — List Drive files (max 15, no subfolders) | Task 1.3 | Planned |
| PIPE-05 — Download images, export CSVs, reject >5MB | Task 2.1 | Planned |
| PIPE-06 — Claude API call (tool-use, 8096 tokens, retry) | Task 2.2 + INFRA-02 | Planned |
| PIPE-07 — Generate HTML from JSON (Code node template) | Task 2.3 | Planned |
| PIPE-08 — PATCH status=done with all outputs | Task 3.1 | Planned |
| PIPE-09 — INSERT top-5 as Kanban tasks | Task 3.2 | Planned |
| PIPE-10 — WhatsApp send (non-fatal) | Task 3.3 | Planned |
| PIPE-11 — Error path: PATCH status=error readable message | Task 4.1 | Planned |
| INFRA-01 — pg_cron stale cleanup >5min | Task 4.3 | Planned |
| INFRA-02 — Retry on fail (3×, 10s) for Anthropic call | Task 2.2 | Planned |
| INFRA-03 — Error Trigger workflow | Task 4.2 | Planned |
