# Phase 1: Foundation — Research

**Researched:** 2026-05-02
**Domain:** Supabase migration, React screen, api.js patterns, sidebar routing
**Confidence:** HIGH

---

## Summary

Phase 1 delivers the data layer (`analises` table + api.js functions) and the trigger UI
(AnaliseiFoodScreen with form, processing state, error state). All patterns needed to implement
this phase already exist in the codebase — this is an additive phase that follows established
conventions exactly.

The Supabase project is already linked (`ref: czyanilrverorwenikqw`). The existing migration
`20260426_evolution_chat.sql` provides the exact SQL style to follow. The `api.js` throw-on-error
pattern is the correct module to extend (not `db.js`). The n8n webhook is called via direct
`fetch` from the screen component — no Edge Function needed since the URL is not a secret that
requires server-side protection (n8n webhook URLs are fire-and-forget endpoints).

The CRM table for clients is `customers`, filtered by `tenant_id`. The `customers` table is
already queried in `CRMScreen.jsx` directly via `supabase.from('customers')`.

**Primary recommendation:** Write the SQL migration first, push it, verify RLS works with the
anon key, then add api.js functions, then build the screen. This order ensures INSERT works
before any UI code is written.

---

<user_constraints>
## User Constraints (from CONTEXT.md / STATE.md)

### Locked Decisions
- n8n orquestra (nao Edge Functions) — Drive, Evolution e Anthropic ja integrados no n8n
- Tarefas vao para Kanban da plataforma — ClickUp sendo substituido
- Regras YAML fixas no system prompt — Wandson gerencia diretamente no n8n
- Input via link Google Drive — consultores ja organizam arquivos no Drive por cliente
- Polling assíncrono (Realtime + fallback 5s) — n8n pode levar 30-60s

### Claude's Discretion
- Ordering of tasks within Phase 1
- Exact SQL index names
- Variable names in the screen component

### Deferred Ideas (OUT OF SCOPE for Phase 1)
- Live step indicators driven by Realtime subscription (Phase 3)
- HTML report rendering (Phase 3)
- Health badge (Phase 3)
- Top-5 priority cards (Phase 3)
- WhatsApp send button and preview (Phase 3)
- Analysis history list (Phase 3)
- 2-minute timeout error handling (Phase 3)
- Notification bell update when analysis completes (Phase 3)
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SCHEMA-01 | Migration cria tabela `analises` com todos os campos especificados | SQL pattern from 20260426_evolution_chat.sql; full field list in REQUIREMENTS.md |
| SCHEMA-02 | Tabela `analises` tem REPLICA IDENTITY FULL + publicada no canal Realtime | Must be set via SQL in migration (`ALTER TABLE analises REPLICA IDENTITY FULL`) + Supabase dashboard publication |
| SCHEMA-03 | RLS na tabela `analises` isola por tenant | Exact RLS pattern from evolution_instances in the existing migration |
| SCHEMA-04 | Index composto (tenant_id, status) + index em job_id | Standard CREATE INDEX pattern from existing migration |
| SCHEMA-05 | Funcoes em api.js: createAnalise, getAnalise, listAnalises, subscribeToAnalise | api.js throw-on-error pattern; Realtime channel pattern from ChatScreen |
| TRIGGER-01 | Tela "Analise iFood" acessivel pelo menu lateral | Sidebar NAV_ITEMS array + App.jsx conditional render pattern |
| TRIGGER-02 | Formulario com seletor de cliente, link Drive, seletor de periodo | customers table query pattern from CRMScreen; full component specs in 01-UI-SPEC.md |
| TRIGGER-03 | Botao desabilitado imediatamente apos primeiro clique | setSubmitting(true) before await — button reads `disabled={submitting}` |
| TRIGGER-04 | Frontend faz INSERT em analises com status pending, recebe job_id, dispara webhook n8n | createAnalise() returns row with job_id; fetch() to n8n webhook URL from VITE_N8N_WEBHOOK |
</phase_requirements>

---

## Supabase Migration Pattern

**Source:** `supabase/migrations/20260426_evolution_chat.sql` [VERIFIED: file read]

The one existing migration establishes the exact style to follow:

```sql
-- Migration: [description]
-- SCHEMA-01 / SCHEMA-02 / etc. — Module Name
-- Date: YYYY-MM-DD

-- ─────────────────────────────────────────────
-- 1. Section header
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS table_name (
  id             uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id      uuid        REFERENCES tenants(id) ON DELETE CASCADE,
  -- ... fields ...
  created_at     timestamptz DEFAULT now(),
  updated_at     timestamptz DEFAULT now()
);

ALTER TABLE table_name ENABLE ROW LEVEL SECURITY;

CREATE POLICY "policy description"
  ON table_name FOR ALL
  USING (
    tenant_id IN (
      SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS idx_table_field ON table_name(field);
```

**Full SQL for the `analises` table (ready to use):**

```sql
-- Migration: Módulo Análise iFood — tabela analises
-- SCHEMA-01 / SCHEMA-02 / SCHEMA-03 / SCHEMA-04
-- Date: 2026-05-02

-- ─────────────────────────────────────────────
-- 1. Tabela analises
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS analises (
  id                uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id            uuid        DEFAULT gen_random_uuid() NOT NULL UNIQUE,
  tenant_id         uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  cliente_id        uuid        REFERENCES customers(id) ON DELETE SET NULL,
  status            text        NOT NULL DEFAULT 'pending'
                                CHECK (status IN ('pending', 'processing', 'done', 'error')),
  drive_link        text,
  periodo           text        CHECK (periodo IN ('diaria', 'semanal', 'mensal')),
  tipo_analise      text        DEFAULT 'ifood',
  resultado_json    jsonb,
  html_relatorio    text,
  mensagem_whatsapp text,
  error_message     text,
  whatsapp_sent     boolean     DEFAULT false,
  criado_por        uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now()
);

-- ─────────────────────────────────────────────
-- 2. REPLICA IDENTITY FULL (obrigatório para Realtime filtrar por colunas não-PK)
-- ─────────────────────────────────────────────
ALTER TABLE analises REPLICA IDENTITY FULL;

-- ─────────────────────────────────────────────
-- 3. RLS
-- ─────────────────────────────────────────────
ALTER TABLE analises ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members can manage analises"
  ON analises FOR ALL
  USING (
    tenant_id IN (
      SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid()
    )
  );

-- ─────────────────────────────────────────────
-- 4. Indexes
-- ─────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_analises_tenant_status
  ON analises(tenant_id, status);

CREATE INDEX IF NOT EXISTS idx_analises_job_id
  ON analises(job_id);
```

**Migration filename convention:** `YYYYMMDD_slug.sql` — e.g. `20260502_analises.sql`

---

## Realtime Setup

**Source:** Supabase documentation + ChatScreen.jsx pattern [VERIFIED: file read]

### REPLICA IDENTITY FULL

`ALTER TABLE analises REPLICA IDENTITY FULL;` must be in the migration SQL.

Without `REPLICA IDENTITY FULL`, Supabase Realtime only sends the primary key in `UPDATE`
payloads. With it, the full row is sent on every UPDATE, which is required to filter
subscriptions by `job_id` (a non-PK column) and to receive the full `status` field.

### Adding the Table to the Realtime Publication

The migration SQL alone is NOT enough. The table must also be added to the `supabase_realtime`
publication. This is done in ONE of two ways:

**Option A — Via Supabase Dashboard (recommended for this project):**
Dashboard → Database → Replication → Select `analises` → Save.

**Option B — Via SQL in the migration:**
```sql
ALTER PUBLICATION supabase_realtime ADD TABLE analises;
```

Option B is cleaner (idempotent in migration), but requires the publication to already exist
(it does — Supabase creates it by default). Use Option B in the migration SQL to keep
everything in one file.

### Realtime Subscription Pattern (from ChatScreen.jsx)

[VERIFIED: src/screens/ChatScreen.jsx lines 251-343]

```js
// In api.js — subscribeToAnalise
export function subscribeToAnalise(jobId, callback) {
  const channel = supabase
    .channel(`analise-${jobId}`)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'analises', filter: `job_id=eq.${jobId}` },
      payload => callback(payload.new)
    )
    .subscribe();
  return () => supabase.removeChannel(channel);
}
```

The returned cleanup function is called from the screen's `useEffect` return.

---

## RLS Pattern

**Source:** `supabase/migrations/20260426_evolution_chat.sql` [VERIFIED: file read]

The project uses a single consistent RLS pattern across all tenant-scoped tables:

```sql
ALTER TABLE table_name ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members can manage [table_name]"
  ON table_name FOR ALL
  USING (
    tenant_id IN (
      SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid()
    )
  );
```

- Policy scope: `FOR ALL` (covers SELECT, INSERT, UPDATE, DELETE in one policy)
- Condition: checks that the row's `tenant_id` is in the set of tenants where the calling
  user is a member via `tenant_members`
- This matches `evolution_instances`, and the pattern documented in ARCHITECTURE.md

**For `analises` specifically:** n8n writes to `analises` using the `service_role` key
(bypasses RLS), so the RLS policy only needs to cover frontend reads and the initial INSERT.
The frontend INSERT will succeed because the user is a member of their own tenant.

**Important:** The frontend INSERT must include `tenant_id: tenantDbId` explicitly. RLS does
not auto-populate it — it only checks that the value provided matches a membership.

---

## api.js Patterns

**Source:** `src/lib/api.js` [VERIFIED: file read]

### Existing Pattern (throw-on-error)

```js
export async function listTasks(tenantId) {
  const { data, error } = await supabase
    .from('tasks')
    .select(`id, title, col, priority, position`)
    .eq('tenant_id', tenantId)
    .order('col')
    .order('position');
  if (error) throw error;
  return data ?? [];
}
```

All api.js functions:
- Are named exports (`export async function`)
- Use `if (error) throw error` (NOT `if (error) return null`)
- Return `data ?? []` for lists, `data` for single rows
- Use `.maybeSingle()` for queries that may return zero rows (never `.single()` for optional)

### Four Functions for Phase 1

```js
// SCHEMA-05 — createAnalise
export async function createAnalise(payload) {
  // payload: { tenant_id, cliente_id, drive_link, periodo, criado_por }
  const { data, error } = await supabase
    .from('analises')
    .insert({ ...payload, status: 'pending' })
    .select('id, job_id, status')
    .single();
  if (error) throw error;
  return data; // caller uses data.job_id
}

// SCHEMA-05 — getAnalise
export async function getAnalise(jobId) {
  const { data, error } = await supabase
    .from('analises')
    .select('*')
    .eq('job_id', jobId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// SCHEMA-05 — listAnalises
export async function listAnalises(tenantId) {
  const { data, error } = await supabase
    .from('analises')
    .select(`
      id, job_id, status, periodo, drive_link, created_at, error_message,
      cliente:customers(id, name)
    `)
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

// SCHEMA-05 — subscribeToAnalise (returns unsubscribe function)
export function subscribeToAnalise(jobId, callback) {
  const channel = supabase
    .channel(`analise-${jobId}`)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'analises', filter: `job_id=eq.${jobId}` },
      payload => callback(payload.new)
    )
    .subscribe();
  return () => supabase.removeChannel(channel);
}
```

Note `subscribeToAnalise` is NOT `async` — it returns a cleanup function synchronously,
matching how ChatScreen handles its cleanup. The `callback` receives `payload.new` (the full
updated row, thanks to REPLICA IDENTITY FULL).

Also add `listClientes(tenantDbId)` for the form's client selector:

```js
// For AnaliseiFoodScreen form — client selector
export async function listClientes(tenantId) {
  const { data, error } = await supabase
    .from('customers')
    .select('id, name, phone')
    .eq('tenant_id', tenantId)
    .order('name');
  if (error) throw error;
  return data ?? [];
}
```

---

## App.jsx Routing Pattern

**Source:** `src/App.jsx` [VERIFIED: file read]
**Source:** `src/components/Sidebar.jsx` [VERIFIED: file read]

### Routing Model

The app uses `useState`-based routing — `route` is a string, screens render via inline
conditionals in `App.jsx`. No React Router, no URL changes.

```jsx
// In App.jsx — screen rendering block (lines 145-159)
{route === 'dashboard' && <DashboardScreen tenant={tenant} tenantDbId={tenantDbId} />}
{route === 'chat'      && <ChatScreen tenant={tenant} tenantDbId={tenantDbId} onNavigate={setRoute} />}
{route === 'cora'      && <CoraScreen tenant={tenant} tenantDbId={tenantDbId} />}
// ... other screens
```

### Adding AnaliseiFoodScreen to App.jsx

Step 1 — Import at top of App.jsx (after existing screen imports):
```js
import AnaliseiFoodScreen from './screens/AnaliseiFoodScreen.jsx';
```

Step 2 — Add conditional render in the `<main>` block, after cora:
```jsx
{route === 'analise-ifood' && <AnaliseiFoodScreen tenant={tenant} tenantDbId={tenantDbId} />}
```

The `key={route + tenant}` on `<main>` means the screen unmounts/remounts on navigation,
which is fine — no persistent state needed between visits in Phase 1.

### Adding to Sidebar

**Source:** `src/components/Sidebar.jsx` NAV_ITEMS array [VERIFIED: file read]

Current NAV_ITEMS ends with `cora`, `crm`, `reports`, `agents`, `settings`.

Per 01-UI-SPEC.md, insert after `cora`:

```js
const NAV_ITEMS = [
  { id: 'dashboard',     icon: 'home',    label: 'Dashboard' },
  { id: 'chat',          icon: 'chat',    label: 'Chat Unificado' },
  { id: 'grupos',        icon: 'whatsapp',label: 'Grupos' },
  { id: 'tasks',         icon: 'check',   label: 'Tarefas' },
  { id: 'cora',          icon: 'dollar',  label: 'CORA — Cobrança', pulse: true },
  { id: 'analise-ifood', icon: 'chart',   label: 'Análise iFood' },  // ADD THIS LINE
  { id: 'crm',           icon: 'users',   label: 'Clientes / CRM' },
  // ...
];
```

The `chart` icon already exists in `Icon.jsx` [VERIFIED: file read] — also used by
ReportsScreen. No badge count for this item in Phase 1.

---

## CRM Client Query

**Source:** `src/screens/CRMScreen.jsx` lines 138-156 [VERIFIED: file read]
**Source:** `src/components/ARCHITECTURE.md` [VERIFIED: file read]

The client table is `customers`. It is tenant-scoped via `tenant_id`.

CRMScreen queries it directly:
```js
supabase.from('customers')
  .select('*, orders(...), customer_tag_relations(tag_id)')
  .eq('tenant_id', tenantDbId)
  .order('updated_at', { ascending: false })
```

For the Phase 1 form, only `id` and `name` are needed. Use `listClientes(tenantDbId)` from
api.js (defined above):
```js
supabase.from('customers')
  .select('id, name, phone')
  .eq('tenant_id', tenantId)
  .order('name');
```

Loading pattern in the screen:
```js
useEffect(() => {
  if (!tenantDbId) return;
  let alive = true;
  setLoadingClientes(true);
  listClientes(tenantDbId)
    .then(r => { if (alive) { setClientes(r); setLoadingClientes(false); } })
    .catch(() => { if (alive) setLoadingClientes(false); });
  return () => { alive = false; };
}, [tenantDbId]);
```

The `alive` flag prevents setState after unmount — standard pattern across all screens.

---

## Webhook Firing Pattern

**Source:** `src/lib/evolution.js` lines 15-82 [VERIFIED: file read], project decisions

**Recommendation: Direct `fetch` from the screen component, URL from a VITE_ env var.**

Rationale:
- n8n webhook URLs are not secrets that require server-side proxying — they are fire-and-forget
  endpoints that accept POST with a payload and respond 200 immediately
- The existing `evolution.js` module demonstrates that the project calls external APIs
  directly from the frontend via `fetch` + `import.meta.env.VITE_*`
- An Edge Function would add latency and complexity for zero security benefit here — the n8n
  webhook does not carry credentials, just data that the user already has access to
- The project's locked decision is "n8n orquestra (nao Edge Functions)"

**Pattern:**

Add to `.env.local` and `.env.example`:
```
VITE_N8N_WEBHOOK_ANALISE=https://n8n.seu-servidor.com/webhook/analise-ifood
```

In the screen's `handleSubmit`:
```js
const N8N_URL = import.meta.env.VITE_N8N_WEBHOOK_ANALISE;

async function handleSubmit() {
  setSubmitting(true); // TRIGGER-03: disable button immediately, before any await

  let analise;
  try {
    const { data: { user } } = await supabase.auth.getUser();
    analise = await createAnalise({
      tenant_id:  tenantDbId,
      cliente_id: clienteId,
      drive_link: driveLink,
      periodo,
      criado_por: user.id,
    });
    setJobId(analise.job_id);
  } catch (err) {
    setError({ title: 'Erro ao iniciar análise', message: 'Não foi possível salvar a análise. Tente novamente.' });
    setSubmitting(false); // re-enable button on INSERT error
    return;
  }

  // Fire-and-forget — do not await response body, only check status
  try {
    const res = await fetch(N8N_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ job_id: analise.job_id, tenant_id: tenantDbId, cliente_id: clienteId, drive_link: driveLink, periodo }),
    });
    if (!res.ok) throw new Error(`n8n ${res.status}`);
    setPhase('processing'); // show spinner card, hide form
  } catch (err) {
    // Row already exists in DB with status=pending — webhook failed
    setError({ title: 'Erro ao iniciar análise', message: 'A análise foi registrada mas não pôde ser disparada. Tente novamente.' });
    setSubmitting(false); // re-enable button for retry
  }
}
```

**Note on VITE_N8N_WEBHOOK_ANALISE:** The webhook URL is not yet known — it will be
configured when the n8n workflow is built in Phase 2. For Phase 1, the variable can be set
to a placeholder or a test endpoint. The form should gracefully show the error state if the
env var is missing or the call fails.

---

## Schema Push Command

**Source:** `supabase/.temp/linked-project.json` [VERIFIED: file read]
**Source:** `.mcp.json` project-ref [VERIFIED: file read]

The project is already linked to `czyanilrverorwenikqw` (project: `consult-delivery-mvp`).

```bash
# From the project root (c:\Users\Consult Delivery\consult-delivery)
npx supabase db push
```

This reads the project ref from `.temp/linked-project.json` and applies any unapplied
migrations from `supabase/migrations/` to the remote Supabase project.

If the CLI is not installed globally:
```bash
npx supabase@latest db push
```

To verify what will be pushed before pushing:
```bash
npx supabase db diff
```

To verify the push worked, check the Supabase dashboard → Table Editor → `analises` should
appear with the correct schema.

**No `supabase link` needed** — the project is already linked. The `.temp/linked-project.json`
file holds the ref; the CLI reads it automatically.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| `analises` table + RLS + indexes | Database (Supabase) | — | All schema lives in migrations |
| Realtime publication | Database (Supabase) | — | Set via SQL in migration |
| api.js functions | Frontend (lib layer) | — | Supabase JS client abstractions |
| Form + submit handler | Frontend (screen) | — | React state machine |
| n8n webhook call | Frontend (screen) | — | Direct fetch, fire-and-forget |
| Sidebar + routing | Frontend (App/Sidebar) | — | useState-based routing |
| Duplicate prevention | Frontend (screen) | — | setSubmitting(true) before await |

---

## Implementation Notes

### Ordering Constraint (Critical)

Build in this exact order to enable incremental testing:

1. Write migration SQL (`20260502_analises.sql`)
2. `npx supabase db push` — verify table appears in dashboard
3. Add api.js functions (`createAnalise`, `getAnalise`, `listAnalises`, `listClientes`, `subscribeToAnalise`)
4. Manually test INSERT via browser console or Supabase Studio to confirm RLS works
5. Add `AnaliseiFoodScreen.jsx` — skeleton with just the form, no processing state yet
6. Add Sidebar entry + App.jsx import/render
7. Complete form logic (loadClientes, handleSubmit, setSubmitting, error state)
8. Add processing state card (shown after successful INSERT + webhook dispatch)

### Gotcha: REPLICA IDENTITY FULL Must Be Set Before Realtime Works

If the Realtime subscription is added to the screen before the migration runs, UPDATE events
will only deliver the primary key — not the `status` field. Always verify this with
`ALTER TABLE analises REPLICA IDENTITY FULL` in the migration (before `db push`).

### Gotcha: `job_id` vs `id`

The table has two UUIDs: `id` (internal PK) and `job_id` (business identifier). The screen
uses `job_id` everywhere (for the webhook payload, Realtime filter, and URL sharing). The
`id` column exists only for Postgres join purposes. Make sure `createAnalise` returns
`.select('id, job_id, status').single()` — not just `id`.

### Gotcha: Duplicate Sidebar Route Name

The `reports` screen already uses `icon: 'chart'` in NAV_ITEMS. The `analise-ifood` entry
also uses `icon: 'chart'` — this is correct per 01-UI-SPEC.md. Both screens can share
the same icon.

### Gotcha: `customers` Table May Be Empty in Dev

If the Supabase dev project has no customers for the test tenant, the client selector will
show an empty dropdown. This is a data issue, not a bug. Add a test customer via Supabase
Studio or CRMScreen before testing the form.

### Gotcha: VITE_N8N_WEBHOOK_ANALISE Not Yet Configured

The n8n workflow does not exist until Phase 2. In Phase 1, set `VITE_N8N_WEBHOOK_ANALISE`
to a placeholder or use a temporary test webhook (e.g., webhook.site) to confirm the
fetch fires correctly. The error state handles a non-200 response gracefully.

### Gotcha: `warning` Icon Not in Icon.jsx

The 01-UI-SPEC.md error state uses `<Icon name="warning" />` but `warning` is NOT in the
Icon.jsx paths object [VERIFIED: file read]. Use `<Icon name="info" />` instead (which exists),
or add a `warning` path to Icon.jsx. The `info` icon (circle with `!`) is semantically
appropriate for error states.

### Gotcha: `listClientes` Is a New api.js Function

The function `listClientes(tenantId)` does not exist in api.js yet — it must be added in
this phase. The 01-UI-SPEC.md refers to it as `listClients(tenantDbId)` in the interaction
contract section, but the api.js convention for Portuguese codebase is `listClientes`.
Use `listClientes` in api.js and `listClientes` in the screen import.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Supabase Realtime subscription | Custom polling loop | `supabase.channel().on('postgres_changes')` | Already used in ChatScreen; handles reconnect |
| UUID generation for job_id | `crypto.randomUUID()` in JS | `DEFAULT gen_random_uuid()` in SQL | Server-side guarantees uniqueness even on concurrent INSERTs |
| Tenant isolation | Manual `WHERE tenant_id = ?` filter | RLS policy in migration | Defense in depth; RLS catches cases where filter is forgotten |
| Drive link validation | Complex regex | Simple `/drive\.google\.com\/drive\/folders\//` check | Only needs to detect paste errors, not prevent all invalid URLs |

---

## Common Pitfalls

### Pitfall 1: Button Re-enables After Webhook Error But Row Stays Pending

**What goes wrong:** User clicks retry, a second INSERT is created, but the first `pending`
row is never resolved. Over time, orphaned rows accumulate.
**Why it happens:** The "Tentar novamente" button resets `submitting = false` and lets the
user submit again — but if Phase 2 n8n workflow is running for the first row, two concurrent
analyses can start.
**How to avoid:** In Phase 1, this is acceptable — there's no n8n workflow yet. In Phase 2,
the n8n workflow should add a guard (`IF` node checking for existing `processing` row for
the same cliente_id+tenant_id before starting).

### Pitfall 2: RLS Blocks Frontend INSERT

**What goes wrong:** `createAnalise` throws `new row violates row-level security policy`
**Why it happens:** The INSERT payload is missing `tenant_id`, or `tenantDbId` is `null`
at the time of the call.
**How to avoid:** Guard `handleSubmit` with `if (!tenantDbId) return`. Always include
`tenant_id: tenantDbId` in the INSERT payload.

### Pitfall 3: Realtime Events Never Fire

**What goes wrong:** Processing state never advances; `subscribeToAnalise` callback is never
called.
**Why it happens:** Most likely cause: table was not added to the Realtime publication. The
migration sets `REPLICA IDENTITY FULL` but a separate step is needed to add the table to
the `supabase_realtime` publication.
**How to avoid:** Include `ALTER PUBLICATION supabase_realtime ADD TABLE analises;` in the
migration SQL, or add it manually via the Supabase dashboard → Database → Replication.

### Pitfall 4: Spinner Appears But Webhook Actually Failed

**What goes wrong:** The user sees the processing card (spinner) but n8n never received
the webhook, so the row stays in `pending` forever.
**Why it happens:** `fetch` threw a network error after the row was inserted — the error
was caught and the error state was shown, but if the catch branch was not reached (e.g., due
to a CORS preflight issue), `setPhase('processing')` ran anyway.
**How to avoid:** Only call `setPhase('processing')` inside the `try` block after confirming
`res.ok`. Show the error state in the `catch` block and reset `submitting = false`.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Supabase CLI (`npx supabase`) | Schema push | Via npx | Latest via npx | Use Supabase Studio SQL editor |
| Node.js | npx commands | Yes (project has node_modules) | v22.22.2 | — |
| Supabase project | All features | Yes (linked: czyanilrverorwenikqw) | — | — |
| VITE_N8N_WEBHOOK_ANALISE | Webhook fire | Not yet configured | — | Use webhook.site for Phase 1 testing |

**Missing dependencies with no fallback:**
- None that block Phase 1 execution.

**Missing dependencies with fallback:**
- `VITE_N8N_WEBHOOK_ANALISE`: Not yet set — use `https://webhook.site/your-id` for Phase 1
  integration test, then replace with real n8n URL in Phase 2.

---

## Sources

### Primary (HIGH confidence)
- `supabase/migrations/20260426_evolution_chat.sql` — migration style, RLS pattern
- `src/lib/api.js` — all api.js function patterns
- `src/App.jsx` — routing and screen wiring pattern
- `src/components/Sidebar.jsx` — NAV_ITEMS array, sidebar item pattern
- `src/components/Icon.jsx` — confirmed icon names (chart: exists, warning: does NOT exist)
- `src/screens/ChatScreen.jsx` lines 251-343 — Realtime subscription pattern
- `src/screens/CRMScreen.jsx` lines 138-156 — customers table query
- `.planning/phases/01-foundation/01-UI-SPEC.md` — complete component specs
- `supabase/.temp/linked-project.json` — confirmed project ref czyanilrverorwenikqw

### Secondary (MEDIUM confidence)
- ARCHITECTURE.md — multi-tenant pattern, table schema overview
- CONVENTIONS.md — coding style, import order, async patterns
- REQUIREMENTS.md — all field names for analises table
- SUMMARY.md — REPLICA IDENTITY FULL rationale, fire-and-forget webhook pattern

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `ALTER PUBLICATION supabase_realtime ADD TABLE analises` works in the migration | Realtime Setup | Realtime would not fire — fix: add table via dashboard |
| A2 | `customers` table has a `name` column (not `company_name` or similar) | CRM Client Query | Client selector would show blank options — fix: inspect schema and adjust select |
| A3 | VITE_N8N_WEBHOOK_ANALISE will be a plain HTTP endpoint (no auth header required) | Webhook Pattern | n8n could require a secret header — fix: add `X-N8N-Token` header if n8n workflow requires auth |

## Open Questions

1. **`warning` icon missing from Icon.jsx**
   - What we know: Icon.jsx has `info` but not `warning`
   - What's unclear: Whether to use `info` or add a `warning` icon
   - Recommendation: Add `warning` path to Icon.jsx in this phase (one line), or use `info` as documented in this file

2. **VITE_N8N_WEBHOOK_ANALISE URL**
   - What we know: The n8n workflow doesn't exist until Phase 2
   - What's unclear: Whether to block Phase 1 completion on having the real URL
   - Recommendation: Use webhook.site for Phase 1 smoke test; the UI error state handles non-200 responses gracefully

## Metadata

**Confidence breakdown:**
- Supabase migration pattern: HIGH — copied from verified existing migration
- RLS pattern: HIGH — exact match to existing migration
- api.js patterns: HIGH — read directly from source file
- Routing/sidebar: HIGH — read directly from App.jsx and Sidebar.jsx
- CRM client query: HIGH — read from CRMScreen.jsx
- Realtime setup: HIGH — verified from ChatScreen + Supabase docs pattern
- Webhook firing: HIGH — direct fetch pattern matches evolution.js precedent

**Research date:** 2026-05-02
**Valid until:** 2026-06-02 (stable stack)
