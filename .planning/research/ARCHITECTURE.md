# Architecture Research — Análise iFood

**Researched:** 2026-05-01
**Confidence:** HIGH (schema + Supabase patterns verified against official docs and existing codebase; n8n patterns verified via official docs + community)

---

## Supabase Schema

### `analises` table — SQL

```sql
-- Migration: YYYYMMDD_analise_ifood.sql

CREATE TABLE IF NOT EXISTS analises (
  -- Identity
  id               uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id           uuid        DEFAULT gen_random_uuid() UNIQUE NOT NULL,

  -- Multi-tenant (matches every other table in this codebase)
  tenant_id        uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Relationships
  cliente_id       uuid        REFERENCES customers(id) ON DELETE SET NULL,
  criado_por       uuid        REFERENCES profiles(id) ON DELETE SET NULL,

  -- Input fields (submitted by consultant)
  drive_link       text        NOT NULL,
  drive_folder_id  text,                    -- extracted from drive_link by n8n
  periodo          text        NOT NULL,    -- e.g. "Abril 2026"
  tipo_analise     text        NOT NULL     -- e.g. "mensal", "semanal", "ad_hoc"
                   CHECK (tipo_analise IN ('mensal', 'semanal', 'ad_hoc')),

  -- Job lifecycle
  status           text        NOT NULL     DEFAULT 'pending'
                   CHECK (status IN ('pending', 'processing', 'done', 'error')),
  error_message    text,

  -- Output fields (written by n8n after Claude analysis)
  resultado_json   jsonb,                   -- raw structured JSON from Claude
  html_relatorio   text,                    -- rendered HTML report (see note on Storage below)
  mensagem_whatsapp text,                   -- WhatsApp message text sent by n8n

  -- Timestamps
  created_at       timestamptz DEFAULT now() NOT NULL,
  updated_at       timestamptz DEFAULT now() NOT NULL
);

-- Keep updated_at current automatically
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER analises_updated_at
  BEFORE UPDATE ON analises
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS (matches codebase pattern from existing tables)
ALTER TABLE analises ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant members can access their analises"
  ON analises FOR ALL
  USING (
    tenant_id IN (
      SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid()
    )
  );

-- Indexes
CREATE INDEX idx_analises_tenant_id     ON analises(tenant_id);
CREATE INDEX idx_analises_status        ON analises(status);
CREATE INDEX idx_analises_job_id        ON analises(job_id);
CREATE INDEX idx_analises_tenant_status ON analises(tenant_id, status);  -- composite for polling query
CREATE INDEX idx_analises_created_at    ON analises(created_at DESC);
CREATE INDEX idx_analises_cliente_id    ON analises(cliente_id);

-- Realtime: must set replica identity FULL so Realtime can filter on non-PK columns
-- Required for Supabase Realtime to broadcast status column changes
ALTER TABLE analises REPLICA IDENTITY FULL;
```

### Why these indexes

| Index | Reason |
|-------|--------|
| `(tenant_id)` | Every query is tenant-scoped |
| `(status)` | n8n updates status; React checks status |
| `(job_id)` | n8n and React look up by job_id after creation |
| `(tenant_id, status)` | The polling query is `WHERE tenant_id = X AND status = 'done'` — composite covers both predicates |
| `(created_at DESC)` | History list sorted by newest first |
| `(cliente_id)` | CRM join: "analyses for this client" |

### `REPLICA IDENTITY FULL` is mandatory

By default Postgres only includes primary key columns in the WAL (Write Ahead Log) for UPDATE events. Supabase Realtime uses the WAL. If you want to filter on `status` (a non-PK column) in a Realtime subscription, the table must have `REPLICA IDENTITY FULL` set. Without it, Realtime cannot see the `status` value in change events to apply the filter. [Source: Supabase Realtime Docs](https://supabase.com/docs/guides/realtime/postgres-changes)

---

## HTML Storage: DB vs Storage

**Recommendation: Store HTML in the `html_relatorio` text column in the database.**

Rationale:

1. **Size is appropriate for DB.** iFood analysis reports are expected to be 10–100 KB of HTML. PostgreSQL's `text` type supports up to 1 GB per cell. Reports in this size range have negligible performance impact when fetched as part of the row.

2. **One query, one result.** When React fetches the completed analysis (`SELECT * FROM analises WHERE job_id = X`), it gets the HTML immediately. No second request to Storage, no signed URL generation, no CORS edge case.

3. **Simpler n8n write path.** n8n's Supabase node inserts a row or updates a column. Writing to Supabase Storage from n8n requires an HTTP node with multipart upload. The DB column is three times simpler.

4. **Supabase Storage adds complexity for no gain here.** Storage is the right choice for binary files (images, PDFs, audio) or files that need CDN delivery to end users. HTML reports accessed only by logged-in consultants on their own tenant do not benefit from CDN distribution or signed URL access control.

**Use Supabase Storage if:** Reports grow beyond 500 KB routinely, or if you need to serve the HTML to a third party (customer-facing report link). Store the Storage path in a `relatorio_storage_path` column instead of inline HTML.

---

## Polling vs Realtime

### Three options compared

| | Option A: Polling | Option B: Realtime | Option C: n8n → SSE |
|---|---|---|---|
| **Complexity** | Low | Medium | High |
| **Infrastructure fit** | Matches existing codebase | Matches ChatScreen pattern | New infrastructure (SSE endpoint) |
| **Latency** | 0–3s delay | Near-instant (~200ms) | Near-instant |
| **Setup requirement** | None | `REPLICA IDENTITY FULL` + RLS channel auth | New Edge Function |
| **Failure recovery** | Auto (next poll) | Must handle reconnect | Complex |
| **Cost** | Low (few queries/min) | Low (WebSocket, server-push only) | Medium |
| **Works today** | Yes | Needs `REPLICA IDENTITY FULL` migration | No |

### Recommendation: Option B — Supabase Realtime, with polling as fallback

**Primary: Supabase Realtime subscription on `analises`.**

The existing `ChatScreen.jsx` already establishes Supabase Realtime subscriptions directly in a `useEffect`. The `AnáliseiFood` screen should follow the exact same pattern. Realtime delivers the `status = done` update within ~200ms of n8n writing it, eliminating the "staring at a spinner for up to 3 extra seconds" problem.

Subscribe to UPDATE events on `analises` filtered by `job_id`:

```js
// src/lib/api.js — add this function
export function subscribeToAnalise(jobId, onUpdate) {
  return supabase
    .channel(`analise-${jobId}`)
    .on('postgres_changes', {
      event: 'UPDATE',
      schema: 'public',
      table: 'analises',
      filter: `job_id=eq.${jobId}`,
    }, (payload) => {
      onUpdate(payload.new);
    })
    .subscribe();
}
```

In the screen component:

```js
useEffect(() => {
  if (!jobId) return;
  const channel = subscribeToAnalise(jobId, (updated) => {
    setAnalise(updated);
    if (updated.status === 'done' || updated.status === 'error') {
      channel.unsubscribe(); // stop listening once terminal state reached
    }
  });
  return () => channel.unsubscribe(); // cleanup on unmount
}, [jobId]);
```

**Fallback: Poll every 5s as safety net.** Analysis can take 30–120 seconds (Claude vision + Drive file reads). Add a polling interval that runs in parallel and stops when status is terminal. This guards against Realtime disconnects on mobile or flaky connections.

```js
useEffect(() => {
  if (!jobId || analise?.status === 'done' || analise?.status === 'error') return;
  const interval = setInterval(async () => {
    const row = await getAnalise(jobId); // query analises by job_id
    if (row) setAnalise(row);
    if (row?.status === 'done' || row?.status === 'error') clearInterval(interval);
  }, 5000);
  return () => clearInterval(interval);
}, [jobId, analise?.status]);
```

**Do not use Option C.** Building an SSE infrastructure for one async job type is overengineering. The existing codebase has no SSE infrastructure and it would require a new Edge Function, new browser API code, and connection management. The Realtime subscription pattern already exists in this codebase.

---

## n8n Workflow Structure

### Node sequence

```
[1] Webhook (POST /webhook/analise-ifood)
      Respond: "Immediately" (returns 200 + job_id at once)
      Body fields: job_id, tenant_id, drive_link, periodo, tipo_analise, cliente_id

[2] Set status = 'processing'
      Supabase node: UPDATE analises SET status='processing', updated_at=now()
      WHERE job_id = {{ $json.job_id }}
      Auth: service_role key (bypasses RLS, consistent with existing Edge Functions)

[3] Extract folder ID from drive_link
      Function node (JS):
        const match = items[0].json.drive_link.match(/\/folders\/([^/?]+)/);
        const folderId = match ? match[1] : null;
        if (!folderId) throw new Error('Drive link inválido: ' + items[0].json.drive_link);
        return [{ json: { ...items[0].json, folderId } }];

[4] Google Drive — List Files in Folder
      Resource: File, Operation: Get Many
      Query: parents in '{{ $json.folderId }}'
      Filter: mimeType != 'application/vnd.google-apps.folder'  (exclude sub-folders)
      Fields: id, name, mimeType, webViewLink

[4b] IF — No files found
      Condition: {{ $json.files.length === 0 }}
      True branch → [ERROR PATH] (step 9)
      False branch → continue

[5] Google Drive — Download/Export Each File
      Loop over files from step 4
      For Google Sheets: Export as CSV (mimeType=text/csv)
      For Google Docs: Export as plain text
      For images/PDFs: pass webViewLink to Claude for vision

[6] Anthropic Claude — Vision + JSON Analysis
      Model: claude-sonnet-4-20250514 (from CLAUDE.md)
      Messages: system prompt + file content (text) or image URL
      System prompt: instructs Claude to analyze iFood metrics and return structured JSON
      Max tokens: 4096
      Response format: JSON object (resultado_json)

[6b] IF — Claude returned error or empty
      Condition: {{ !$json.content || $json.error }}
      True branch → [ERROR PATH] (step 9)

[7] Build HTML report
      Function node: converts resultado_json → HTML string
      (Or: call Claude again with "render this JSON as HTML report" prompt)

[8] Supabase — Save analysis result
      UPDATE analises SET
        status = 'done',
        resultado_json = {{ $json.resultado_json }},
        html_relatorio = {{ $json.html_relatorio }},
        mensagem_whatsapp = {{ $json.mensagem_whatsapp }},
        updated_at = now()
      WHERE job_id = {{ $json.job_id }}

[8b] Supabase — Create tasks in Kanban
      INSERT INTO tasks (tenant_id, title, description, status, agent_id, ...)
      One INSERT per action item identified by Claude in resultado_json

[8c] Evolution API — Send WhatsApp
      HTTP node: POST to Evolution API sendText
      Body: { number: cliente_phone, text: mensagem_whatsapp }

[ERROR PATH — step 9]
      Supabase: UPDATE analises SET
        status = 'error',
        error_message = {{ $json.error.message }},
        updated_at = now()
      WHERE job_id = {{ $json.job_id }}
      (React will show error state when it receives the update)
```

### Error handling strategy

**n8n error workflow (global):** Configure a separate n8n Error Trigger workflow that catches any unhandled execution failure and updates `analises.status = 'error'` with `error_message`. Set this as the error workflow in Workflow Settings for the main análise workflow.

**Node-level error handling:** For steps 4, 6, and 8, use n8n's "Continue on Fail" setting set to OFF — let failures propagate to the Error Trigger workflow.

**Drive link validation (step 3):** Validate before hitting Drive API. If the regex returns null, throw immediately and route to the error path. This prevents a useless Drive API call that returns a 404.

**Claude timeout:** The Anthropic API node has a configurable timeout. Set it to 90 seconds. If Claude times out, the node fails and the error workflow fires, updating status to 'error'.

### Timeout handling

n8n has a configurable workflow execution timeout. For self-hosted n8n (on the VPS at 193.202.85.82), this is set in `N8N_EXECUTIONS_TIMEOUT` environment variable (default 3600 seconds = 1 hour on self-hosted). The analysis pipeline should complete in under 5 minutes. No special timeout handling needed beyond the error workflow catching failures.

The webhook node MUST be set to **"Respond: Immediately"** (returns 200 before processing). This prevents the React frontend from waiting for a response and timing out. The React side gets `{ job_id: "..." }` immediately, then subscribes to Realtime for completion.

### Status should become 'processing' immediately

Yes. Step 2 updates status to 'processing' as the first action after webhook receipt. This gives the React UI immediate feedback that the job started. Without this, the spinner could run for 10+ seconds before any status change, making the user think nothing happened.

**Status lifecycle:**
```
pending    → created by React (INSERT)
processing → set by n8n immediately on webhook receipt
done       → set by n8n after all outputs are saved
error      → set by n8n error workflow or explicit error node
```

---

## Google Drive Link Parsing

### URL formats to handle

Google Drive folder links have two common shapes:

```
https://drive.google.com/drive/folders/1abc2DEF3ghi4JKL5mno6PQR
https://drive.google.com/drive/u/0/folders/1abc2DEF3ghi4JKL5mno6PQR
https://drive.google.com/drive/u/1/folders/1abc2DEF3ghi4JKL5mno6PQR?usp=sharing
```

The folder ID is always the path segment immediately after `/folders/`.

### Extraction regex (use in n8n Function node)

```javascript
// Step 3 of the n8n workflow — Function node
const driveLink = $input.first().json.drive_link;
const match = driveLink.match(/\/folders\/([a-zA-Z0-9_-]{10,})/);

if (!match) {
  throw new Error(`Drive link inválido. Cole o link completo da pasta. Recebido: ${driveLink}`);
}

const folderId = match[1];
return [{ json: { ...$input.first().json, folderId } }];
```

The character class `[a-zA-Z0-9_-]{10,}` matches Drive IDs (which are 28–33 alphanumeric + dash + underscore characters). The `{10,}` minimum prevents false matches on short path segments.

### Listing files inside the folder

In n8n, use the **Google Drive node** with:
- Resource: **File**
- Operation: **Get Many**
- Filter / Query: `'{{ $json.folderId }}' in parents`

This returns all files whose parent is the extracted folder ID. The node requires a Google OAuth2 credential configured in n8n. The consultant's Google account must have at least "Viewer" access to the folder.

**File type filtering:** Add a query condition `mimeType != 'application/vnd.google-apps.folder'` to skip sub-folders. If the consultant organizes by sub-folders, a recursive loop or a second list call per sub-folder will be needed (flag this as a known limitation for the first version).

**Export formats for reading content:**
- `application/vnd.google-apps.spreadsheet` → export as `text/csv`
- `application/vnd.google-apps.document` → export as `text/plain`
- `application/pdf` → pass URL to Claude vision
- `image/*` → pass URL to Claude vision

---

## Component Boundaries

### Who owns what

| Concern | Owner | Notes |
|---------|-------|-------|
| Form UI (paste link, choose period) | React (`AnáliseiFood` screen) | Follows existing screen pattern: `src/screens/AnaliseiFoodScreen.jsx` |
| INSERT into `analises` with status='pending' | React (via `api.js`) | React creates the job before triggering n8n |
| Trigger n8n workflow | React | POST to n8n webhook URL with `job_id` + form fields |
| Realtime subscription on `analises` | React (`subscribeToAnalise` in `api.js`) | Same pattern as `ChatScreen` |
| Rendering the HTML report | React | `dangerouslySetInnerHTML` on `html_relatorio` field, sandboxed in `<iframe>` for safety |
| Drive link validation | n8n (primary) + React (basic) | React validates URL is non-empty; n8n validates it's a parseable Drive link |
| Reading Google Drive files | n8n exclusively | React never touches Drive API |
| Calling Anthropic Claude | n8n exclusively | React never calls Claude API (key is server-side in n8n) |
| Updating `analises` (status, resultado_json, html) | n8n exclusively using service_role | React only reads; n8n writes |
| Creating kanban tasks | n8n exclusively | Inserts into `tasks` table with service_role |
| Sending WhatsApp | n8n exclusively | Via Evolution API HTTP node |
| Error reporting to user | React reads `error_message` from `analises` row | Displayed when status='error' |

### React screen responsibilities (boundaries)

```
AnaliseiFoodScreen.jsx
  ├── Form state: drive_link, periodo, tipo_analise, cliente_id
  ├── onSubmit:
  │     1. INSERT analises row (status='pending') via api.js
  │     2. POST to n8n webhook with job_id + form data
  │     3. setJobId(job_id)
  ├── Analysis-in-progress state:
  │     - Realtime subscription on job_id (primary)
  │     - Polling every 5s (fallback)
  │     - Show progress indicator
  ├── Done state:
  │     - Render html_relatorio (sandboxed)
  │     - Show tasks created (link to Kanban)
  │     - Show WhatsApp sent confirmation
  └── Error state:
        - Show error_message
        - Retry button (re-triggers n8n with same job_id or new INSERT)
```

### n8n workflow responsibilities (boundaries)

n8n owns everything that happens after the webhook fires:
- Drive access
- Claude analysis
- Supabase writes (via service_role, same pattern as existing Edge Functions)
- Task creation
- WhatsApp delivery
- Error state updates

n8n does NOT:
- Validate tenant permissions (the job_id + tenant_id combo was written by authenticated React — trust it)
- Return analysis results synchronously (webhook responds immediately with 200)
- Generate the UI — it only stores HTML in the DB

---

## Build Order

Implement in this sequence to enable testing at each step:

**Step 1 — Schema** (30 min)
Create migration `YYYYMMDD_analise_ifood.sql` with the `analises` table, indexes, RLS policy, and `REPLICA IDENTITY FULL`. Run against Supabase. Regenerate types.

**Step 2 — api.js functions** (30 min)
Add `createAnalise`, `getAnalise`, `listAnalises`, `subscribeToAnalise` to `src/lib/api.js`.

**Step 3 — React screen skeleton** (1h)
Create `src/screens/AnaliseiFoodScreen.jsx` with form only (no n8n integration yet). Wire it to a new route `'analise-ifood'` in `App.jsx` and add nav item in `Sidebar.jsx`. Confirm INSERT into `analises` works and RLS returns the row.

**Step 4 — n8n: Drive + Claude nodes** (2h)
Build the n8n workflow: Webhook → Extract folder ID → List Drive files → Call Claude → log result to console. Test end-to-end with a real Drive folder. Confirm Claude returns valid JSON.

**Step 5 — n8n: Supabase writes** (1h)
Add Supabase UPDATE nodes to the n8n workflow (status=processing, then status=done with results). Confirm React polling/Realtime picks up the change.

**Step 6 — React: report rendering** (1h)
Add the in-progress spinner and done state with HTML report rendering. Wire up Realtime subscription and polling fallback.

**Step 7 — n8n: Tasks + WhatsApp** (1h)
Add task INSERT nodes and Evolution API call to the n8n workflow.

**Step 8 — n8n: Error workflow** (30 min)
Create the n8n Error Trigger workflow. Configure it as the error workflow in the main analysis workflow's Settings. Test by using an invalid Drive link.

**Step 9 — React: error state + retry** (30 min)
Display `error_message` in the screen. Add retry button.

---

## Key Decisions Summary

| Decision | Choice | Rationale |
|----------|--------|-----------|
| HTML storage location | DB text column | Reports are 10–100 KB; one-query access; simpler n8n write path |
| Status notification | Realtime (primary) + polling 5s (fallback) | ChatScreen precedent; Realtime needs REPLICA IDENTITY FULL |
| n8n webhook response mode | Respond Immediately | Prevents frontend timeout; job_id returned synchronously |
| First status update | n8n sets 'processing' immediately | User sees feedback within ~1s of submit |
| Error surface | `analises.error_message` → React reads it | Consistent with Realtime/polling pattern; no extra channel needed |
| Drive file access | n8n Google Drive node (OAuth2) | Never exposes Drive credentials to frontend |
| Supabase writes from n8n | service_role key | Matches existing Edge Function pattern in this codebase |
| Kanban task creation | n8n inserts into `tasks` table | Keeps React out of the analysis pipeline; tasks appear in Kanban automatically |

---

*Confidence notes:*
- *Schema design: HIGH — follows codebase patterns exactly, verified against existing migration*
- *REPLICA IDENTITY FULL requirement: HIGH — verified against Supabase Realtime official docs*
- *n8n webhook "Respond Immediately" mode: HIGH — verified via official docs + community*
- *Drive URL regex: HIGH — format is stable and well-documented*
- *n8n Google Drive node folder listing: MEDIUM — confirmed node exists and supports folder ID filtering; exact UI field names depend on installed n8n version*
- *HTML in DB vs Storage: HIGH — PostgreSQL text limits documented; Storage adds complexity for no gain at this file size*
