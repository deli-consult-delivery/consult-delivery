# Stack Research — Análise iFood

**Module:** Análise iFood (AI-powered iFood store performance analysis)
**Researched:** 2026-05-01
**Platform:** Vite + React 18 (JSX) + Supabase + n8n self-hosted (VPS 193.202.85.82)

---

## Google Drive Integration (n8n)

### Authentication

**Recommended: Custom OAuth2** (not Service Account)

- Self-hosted n8n requires Custom OAuth2 credentials — Managed OAuth2 is n8n Cloud only.
- Google deprecated Service Account access to personal drives for accounts created after April 15, 2025. Service Accounts now only work reliably with shared drives (Google Workspace).
- For this project, the consultant pastes a Google Drive folder link (personal drive). OAuth2 authenticated as a team Google account is the correct path.
- Setup: Google Cloud Console → Create project → Enable Drive API → Create OAuth2 credentials → Add n8n instance URL as redirect URI → Paste Client ID + Secret into n8n credential.

### Reading Files from a Shared Folder Link

**Node:** `Google Drive` (built-in, `n8n-nodes-base.googleDrive`)

**Pattern — List then download:**

1. **Google Drive node, Operation: Search/List Files**
   - Filter parameter: `q` = `'<folderId>' in parents and trashed=false`
   - Extract folder ID from the shared URL: `https://drive.google.com/drive/folders/<FOLDER_ID>`
   - The consultant pastes the URL → use n8n expression to extract the ID: `{{ $json.folderUrl.split('/').pop().split('?')[0] }}`
   - Returns a list of file objects with `id`, `name`, `mimeType`

2. **Loop Over Items (Split in Batches) node** — iterate over each file

3. **Google Drive node, Operation: Download a File**
   - Select file "By ID" → `{{ $json.id }}`
   - "Put Output File in Field": `data` (binary field name)
   - Output: binary data in `$binary.data`

**File type handling:**
- PNG/JPEG screenshots → download as binary directly
- CSV spreadsheets → download as binary, then pass through `Spreadsheet File` node (Operation: From File) or `CSV` Code node to parse rows
- Google Sheets files (mimeType `application/vnd.google-apps.spreadsheet`) → use "Export As: CSV" option in the Download operation

**Known issue:** The Google Drive node listing can return a folder object when given a file ID incorrectly. Always separate the "list files in folder" step (Search operation) from the "download file" step (Download operation) to avoid this.

**Pagination:** Default returns 100 items. For folders with more files, set `pageSize` to higher value or use pagination token in a loop.

### Permissions on the Shared Link

- The Google account used in n8n OAuth must have at minimum View access to the folder.
- If consultants paste links from their own Drive accounts, either: (a) they must share the folder with the n8n service Google account, or (b) use the consultant's own OAuth token (more complex). 
- **Simplest approach:** Create a dedicated Google account (e.g., `automacao@consultdelivery.com.br`), authenticate n8n with it, and require consultants to share folders with that account before triggering analysis.

---

## Claude Vision in n8n

### Node Choice: HTTP Request node (not native Anthropic node)

The native n8n Anthropic node (`n8n-nodes-langchain.anthropic`) does not directly expose multimodal/vision input for arbitrary binary images in an easy-to-configure way. Use the **HTTP Request node** calling the Messages API directly for full control over the payload.

### Model Recommendation: `claude-sonnet-4-6`

Current model IDs (verified from Anthropic official docs, May 2026):

| Model | API ID | Input $/MTok | Output $/MTok | Vision | Context |
|-------|--------|-------------|--------------|--------|---------|
| Haiku 4.5 | `claude-haiku-4-5-20251001` | $1 | $5 | Yes | 200k |
| Sonnet 4.6 | `claude-sonnet-4-6` | $3 | $15 | Yes | 1M |
| Opus 4.7 | `claude-opus-4-7` | $5 | $25 | Yes | 1M |

**Use `claude-sonnet-4-6`** for this use case:
- iFood analysis requires reading screenshots (menus, ratings, reviews) + interpreting CSV data and producing structured JSON with business recommendations — this is a reasoning task, not simple classification.
- Haiku is ~3x cheaper but produces noticeably weaker structured reasoning and business analysis. For a consulting product where output quality directly affects client trust, Sonnet's quality-to-cost ratio is the right choice.
- Note: `claude-sonnet-4-20250514` (the model ID in CLAUDE.md) is deprecated and will be retired June 15, 2026. Use `claude-sonnet-4-6` instead.

### HTTP Request Node Configuration

**Endpoint:** `POST https://api.anthropic.com/v1/messages`

**Headers:**
```
x-api-key: {{ $env.ANTHROPIC_API_KEY }}
anthropic-version: 2023-06-01
content-type: application/json
```

**Body (JSON, send as raw):**
```json
{
  "model": "claude-sonnet-4-6",
  "max_tokens": 4096,
  "messages": [
    {
      "role": "user",
      "content": [
        {
          "type": "image",
          "source": {
            "type": "base64",
            "media_type": "image/jpeg",
            "data": "{{ $binary.data.toString('base64') }}"
          }
        },
        {
          "type": "text",
          "text": "Analise este screenshot do iFood e retorne um JSON com: { rating, total_reviews, response_rate, avg_response_time, top_issues: [], recommendations: [] }"
        }
      ]
    }
  ]
}
```

**Multiple images in one request:** Build the `content` array dynamically. In n8n, use a Code node before the HTTP Request to aggregate all downloaded binary images into one messages payload. Claude supports up to 100 images per request (200k context window models) — well within range for a typical iFood analysis folder.

**Image size:** Claude auto-downscales images larger than 1568px on the long edge. iFood screenshots are typically 1080p or smaller — no pre-processing needed. Token cost: ~1568 tokens per 1920x1080 screenshot at Sonnet pricing ≈ $0.005/image. Ten screenshots ≈ $0.05 per analysis call. Acceptable.

**CSV data:** Paste CSV text directly as a `type: text` block in the content array — Claude reads tabular data in plain text format well. No need to encode CSV as an image.

**Parsing the response:** Claude returns `response.choices[0].message.content` — actually for Messages API it returns `response.content[0].text`. Add a Code node after HTTP Request:
```js
const text = $input.first().json.content[0].text;
const json = JSON.parse(text);
return [{ json }];
```
Wrap in try/catch and ask Claude in the prompt to return ONLY valid JSON (no markdown code fences).

---

## Async Job Pattern

### Problem

n8n processing takes 30-90 seconds (Google Drive listing + downloads + Claude API). The React frontend cannot block a fetch call that long.

### Recommended Pattern: Fire-and-forget webhook + Supabase Realtime subscription

**Flow:**

1. **React frontend** inserts a row in `analises` table with `status: 'pending'`, `client_id`, `drive_url`, gets back the `analise_id` (UUID).
2. **React frontend** calls `POST /webhook/analise-ifood` on n8n, sending `{ analise_id, client_id, drive_url }`.
3. **n8n Webhook node** is configured with "Respond: Immediately" — returns `{ status: 'queued', analise_id }` within milliseconds. The workflow continues executing asynchronously.
4. **n8n workflow** processes files, calls Claude, then calls Supabase REST API to update the `analises` row: set `status: 'done'`, save `resultado_json` and `resultado_html`.
5. **React frontend** subscribes to Supabase Realtime on that specific `analise_id` and reacts when `status` changes to `'done'` or `'error'`.

**Why not polling?** Polling (setInterval every 3s) works but wastes requests and adds latency. Supabase Realtime (Postgres CDC via WebSocket) fires immediately when the row updates — better UX, no wasted calls.

**Why not long-polling or SSE?** Adds infrastructure complexity with no benefit when Supabase Realtime is already in the stack.

### n8n "Respond to Webhook" Node Behavior

The key requirement: place the "Respond to Webhook" node early in the workflow (immediately after the Webhook trigger), before the Google Drive and Claude nodes. n8n continues executing all downstream nodes after responding — the workflow does NOT stop at "Respond to Webhook".

```
[Webhook Trigger] → [Respond to Webhook: {status: 'queued'}] → [Google Drive: List] → [Loop] → [Google Drive: Download] → ... → [Supabase: Update analise status=done]
```

### React Realtime Subscription Pattern

```js
// After inserting analise row and triggering webhook:
const channel = supabase
  .channel(`analise:${analiseId}`)
  .on(
    'postgres_changes',
    {
      event: 'UPDATE',
      schema: 'public',
      table: 'analises',
      filter: `id=eq.${analiseId}`
    },
    (payload) => {
      if (payload.new.status === 'done') {
        setAnalise(payload.new);
        channel.unsubscribe();
      }
      if (payload.new.status === 'error') {
        setError(payload.new.error_message);
        channel.unsubscribe();
      }
    }
  )
  .subscribe();

// Cleanup on unmount
return () => supabase.removeChannel(channel);
```

Note: Supabase Postgres Changes (CDC) supports row-level filter `id=eq.<uuid>` directly in the subscription filter — this is supported and documented. No need for the broadcast trigger pattern unless you need private/authenticated real-time (which adds complexity). For internal tool, standard Postgres Changes with RLS is sufficient.

**Timeout handling:** If n8n fails silently (network error, crash), the frontend would wait forever. Add a client-side timeout (e.g., 2 minutes) that shows an error state and allows retry.

---

## Supabase Job Queue Pattern

### Table Schema

```sql
create table analises (
  id uuid default gen_random_uuid() primary key,
  tenant_id uuid not null references tenants(id),
  client_id uuid references clients(id),
  drive_url text not null,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'done', 'error')),
  resultado_json jsonb,
  resultado_html text,
  error_message text,
  criado_por uuid references auth.users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- RLS: tenant isolation
alter table analises enable row level security;

create policy "tenant_isolation" on analises
  using (tenant_id = (select tenant_id from users where id = auth.uid()));

-- Realtime: enable for this table
alter publication supabase_realtime add table analises;
```

### Status Lifecycle

```
pending → processing → done
                    ↘ error
```

- `pending`: Row inserted by React frontend when user clicks Analyze.
- `processing`: n8n updates immediately when it starts the Google Drive fetch (prevents duplicate triggering).
- `done`: n8n updates after successfully saving `resultado_json` and `resultado_html`.
- `error`: n8n updates if any step fails, with `error_message` populated.

### Why This Is Sufficient (No External Queue Needed)

- For internal use (Consult Delivery team), concurrency is low (< 10 simultaneous analyses). Postgres as a queue is entirely adequate.
- No need for Supabase Queues (pgmq), Redis, or BullMQ at this scale.
- The n8n webhook trigger handles the actual processing — the Supabase table is purely for state tracking and result storage, not for work dispatch.
- n8n's own execution queue handles retries and concurrency at the workflow level.

### n8n → Supabase Update (via REST API)

In the final n8n node, use an HTTP Request node to call Supabase REST:

```
PATCH https://<project-ref>.supabase.co/rest/v1/analises?id=eq.{{ $json.analise_id }}
Headers:
  apikey: <supabase_service_role_key>
  Authorization: Bearer <supabase_service_role_key>
  Content-Type: application/json
  Prefer: return=minimal
Body:
  { "status": "done", "resultado_json": {{ $json.analysis }}, "resultado_html": "{{ $json.html }}", "updated_at": "{{ new Date().toISOString() }}" }
```

Use `service_role` key (not `anon`) for n8n → Supabase calls to bypass RLS. Store this key in Infisical alongside the Anthropic key.

---

## Recommended Approach

### Full Stack Decision

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Google Drive auth | Custom OAuth2 in n8n | Service accounts unreliable for personal Drive post-April 2025 |
| Drive file access | By folder ID extracted from URL | Supports "paste link" UX; folder ID is last URL segment |
| File loop | Google Drive Search → Loop Over Items → Google Drive Download | Standard n8n pattern, binary data handled natively |
| CSV parsing | Spreadsheet File node or Code node JSON.parse | Drive CSV exports as binary; parse before sending to Claude |
| Claude model | `claude-sonnet-4-6` | Best reasoning quality for structured business analysis; Haiku insufficient for consulting-grade output |
| Claude call | HTTP Request node to `/v1/messages` | Native Anthropic node lacks multimodal binary input configuration |
| Images to Claude | base64 in content array | `$binary.data.toString('base64')` in n8n expression; aggregate multiple images in Code node |
| Async pattern | Fire-and-forget webhook + Supabase Realtime | Fits existing stack; zero extra infrastructure |
| Job state | `analises` table with status enum | Lightweight, observable, queryable; no queue infra needed |
| Frontend updates | Supabase `postgres_changes` subscription filtered by `id=eq.<uuid>` | Real-time push, no polling overhead |

### n8n Workflow Structure

```
Webhook (POST /analise-ifood)
  ↓
Respond to Webhook → { status: 'queued', analise_id }
  ↓
Supabase PATCH → status = 'processing'
  ↓
Extract folder_id from drive_url (Code node)
  ↓
Google Drive: Search files in folder (list all)
  ↓
Split Out: separate images from CSVs by mimeType
  ↓
[Image branch]                    [CSV branch]
Google Drive: Download (binary)   Google Drive: Download (CSV export)
  ↓                                 ↓
Aggregate all binaries            Parse CSV to text (Code node)
  ↓                               ↓
[Merge both branches]
  ↓
Code node: Build Claude messages payload (images as base64 + CSV text)
  ↓
HTTP Request: POST /v1/messages (Claude Sonnet 4.6)
  ↓
Code node: JSON.parse(response.content[0].text)
  ↓
Code node: Generate HTML report from JSON
  ↓
Supabase PATCH → status = 'done', resultado_json, resultado_html
  ↓
Supabase INSERT → Kanban tasks (from analysis recommendations)
  ↓
Evolution API: Send WhatsApp summary message
```

### React Frontend Structure

```
AnaliseIFood page
├── ClientSelector (existing CRM dropdown)
├── DriveUrlInput (text field + validate URL format)
├── AnalyzeButton → onClick: insert analise row → call n8n webhook
├── AnalysisStatus (pending/processing spinner)
└── AnalysisReport (renders resultado_html when status=done)

Hook: useAnalise(analiseId)
  - subscribes to supabase realtime on mount
  - polls with 2-minute timeout fallback
  - unsubscribes on unmount or completion
```

---

## Confidence Levels

| Decision Area | Confidence | Notes |
|---------------|------------|-------|
| Google Drive OAuth2 auth | HIGH | Official n8n docs confirm; service account limitations are documented by Google |
| Drive file listing by folder ID | HIGH | Documented in n8n Google Drive node; folder ID extracted from URL is standard pattern |
| Drive binary download in n8n | MEDIUM | Documented but community reports occasional quirks with folder vs file confusion; test in staging |
| Claude vision via HTTP Request node | HIGH | Official Anthropic API docs + community examples confirm base64 pattern works |
| Claude model ID `claude-sonnet-4-6` | HIGH | Verified directly from Anthropic models overview page (May 2026) |
| Haiku vs Sonnet recommendation | MEDIUM | Based on published benchmarks and pricing; actual quality difference for iFood analysis is empirical — test with real data |
| Async webhook + Supabase Realtime | HIGH | Both n8n "Respond Immediately" pattern and Supabase Postgres Changes subscription are well-documented and proven |
| Supabase `postgres_changes` row filter | HIGH | Confirmed in Supabase docs; `filter: 'id=eq.<uuid>'` is supported directly |
| Supabase as lightweight job queue | HIGH | Established pattern in 2025, multiple sources confirm; adequate for low-concurrency internal use |
| n8n → Supabase via REST PATCH | HIGH | Standard pattern; service_role key requirement is documented |

---

## Sources

- n8n Google Drive node docs: https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.googledrive/
- n8n Google Service Account docs: https://docs.n8n.io/integrations/builtin/credentials/google/service-account/
- n8n Respond to Webhook docs: https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.respondtowebhook/
- n8n Loop Over Items docs: https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.splitinbatches/
- Anthropic models overview (verified May 2026): https://platform.claude.com/docs/en/about-claude/models/overview
- Anthropic vision docs: https://platform.claude.com/docs/en/docs/build-with-claude/vision
- Supabase Realtime subscribing to DB changes: https://supabase.com/docs/guides/realtime/subscribing-to-database-changes
- Supabase background jobs pattern: https://www.jigz.dev/blogs/how-i-solved-background-jobs-using-supabase-tables-and-edge-functions
- n8n + Claude vision community example: https://dev.to/vinal2/automated-handwritten-food-order-processing-with-n8n-and-claudes-vision-api-3g5f
