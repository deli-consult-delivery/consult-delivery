# Pattern Map — Phase 1: Foundation

**Mapped:** 2026-05-02
**Files analyzed:** 5 (2 new, 3 modified)
**Analogs found:** 5 / 5

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `supabase/migrations/20260502_analises.sql` | migration | CRUD | `supabase/migrations/20260426_evolution_chat.sql` | exact |
| `src/screens/AnaliseiFoodScreen.jsx` | screen/component | request-response + event-driven | `src/screens/CoraScreen.jsx` | role-match |
| `src/lib/api.js` (new functions) | utility/service | CRUD + event-driven | `src/lib/api.js` (existing) + `src/screens/ChatScreen.jsx` | exact |
| `src/App.jsx` (add route) | config/router | request-response | `src/App.jsx` lines 1-18, 145-159 | exact |
| `src/components/Sidebar.jsx` (add nav item) | component | — | `src/components/Sidebar.jsx` lines 5-15 | exact |

---

## Pattern Assignments

### `supabase/migrations/20260502_analises.sql`

**Analog:** `supabase/migrations/20260426_evolution_chat.sql`

**Header + section comment pattern** (lines 1-7 of analog):
```sql
-- Migration: Evolution API integration + chat tables extension
-- TASK-201 / TASK-202 — Chat Unificado
-- Date: 2026-04-26

-- ─────────────────────────────────────────────
-- 1. Instâncias Evolution API (multi-instância)
-- ─────────────────────────────────────────────
```

**CREATE TABLE pattern** (lines 8-19 of analog):
```sql
CREATE TABLE IF NOT EXISTS evolution_instances (
  id             uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id      uuid        REFERENCES tenants(id) ON DELETE CASCADE,
  instance_name  text        NOT NULL UNIQUE,
  -- ... fields ...
  created_at     timestamptz DEFAULT now(),
  updated_at     timestamptz DEFAULT now()
);
```

**RLS pattern** (lines 21-29 of analog):
```sql
ALTER TABLE evolution_instances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members can manage instances"
  ON evolution_instances FOR ALL
  USING (
    tenant_id IN (
      SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid()
    )
  );
```

**Index pattern** (lines 43-44 of analog):
```sql
CREATE INDEX IF NOT EXISTS idx_conversations_whatsapp_chat_id
  ON conversations(whatsapp_chat_id, instance_id);
```

**Adaptations for `analises` table:**
- Replace header comment: `-- Migration: Módulo Análise iFood — tabela analises` / `-- SCHEMA-01 / SCHEMA-02 / SCHEMA-03 / SCHEMA-04` / `-- Date: 2026-05-02`
- Table name: `analises`
- Policy name: `"members can manage analises"`
- Add these fields inside the CREATE TABLE block:
  - `job_id uuid DEFAULT gen_random_uuid() NOT NULL UNIQUE`
  - `cliente_id uuid REFERENCES customers(id) ON DELETE SET NULL`
  - `status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'done', 'error'))`
  - `drive_link text`, `periodo text CHECK (periodo IN ('diaria', 'semanal', 'mensal'))`, `tipo_analise text DEFAULT 'ifood'`
  - `resultado_json jsonb`, `html_relatorio text`, `mensagem_whatsapp text`, `error_message text`
  - `whatsapp_sent boolean DEFAULT false`
  - `criado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL`
- After the RLS block, add two lines required for Realtime before the indexes:
  ```sql
  ALTER TABLE analises REPLICA IDENTITY FULL;
  ALTER PUBLICATION supabase_realtime ADD TABLE analises;
  ```
- Two indexes:
  ```sql
  CREATE INDEX IF NOT EXISTS idx_analises_tenant_status ON analises(tenant_id, status);
  CREATE INDEX IF NOT EXISTS idx_analises_job_id ON analises(job_id);
  ```

---

### `src/screens/AnaliseiFoodScreen.jsx`

**Analog:** `src/screens/CoraScreen.jsx`

**File export signature** (line 14 of analog):
```jsx
export default function CoraScreen({ tenant }) {
```
Adaptation: `export default function AnaliseiFoodScreen({ tenant, tenantDbId }) {`

**Root div + page-container pattern** (line 26 of analog):
```jsx
<div className="route-enter page-container" style={{ padding: 32, maxWidth: 1400, margin: '0 auto', position: 'relative' }}>
```
Adaptation: `maxWidth: 960` (focused action screen, not data-dense dashboard per 01-UI-SPEC.md)

**Header pattern** (lines 28-45 of analog):
```jsx
<div className="header-wrap" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 24 }}>
  <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
    <AgentAvatar id="cora" size={56} />
    <div>
      <h1 className="page-h1">CORA — Cobrança Inteligente</h1>
      <p className="page-sub">...</p>
    </div>
  </div>
</div>
```
Adaptation: Replace `<AgentAvatar>` with the iFood gradient icon div (48×48, `linear-gradient(135deg, #EA1D2C, #C4111F)`, emoji `🍔`). Title: `Análise iFood`. No right-side button group needed.

**Card container pattern** (line 101, line 175 of analog):
```jsx
<div className="card" style={{ padding: 20 }}>
```
Adaptation: `padding: 28` for the form card; `padding: 40` for the processing card.

**`useEffect` with cleanup + alive flag pattern** — standard async data loading used throughout the codebase:
```jsx
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

**Realtime subscription cleanup pattern** (lines 248-344 of ChatScreen.jsx):
```jsx
useEffect(() => {
  // ... subscription setup via supabase.channel().on().subscribe()
  return () => { supabase.removeChannel(channel); };
}, [dependency]);
```
Adaptation: Call `subscribeToAnalise(jobId, callback)` from api.js — it returns the unsubscribe function directly.

**Import block pattern** (lines 1-5 of CoraScreen.jsx):
```jsx
import { useState, useEffect } from 'react';
import Icon from '../components/Icon.jsx';
import AgentAvatar from '../components/AgentAvatar.jsx';
import UserAvatar from '../components/UserAvatar.jsx';
import { INADIMPLENTES } from '../data.js';
```
Adaptation for AnaliseiFoodScreen:
```jsx
import { useState, useEffect } from 'react';
import Icon from '../components/Icon.jsx';
import { createAnalise, listClientes, subscribeToAnalise } from '../lib/api.js';
import { supabase } from '../lib/supabase.js';
```

**State declarations — order convention** (derived from CoraScreen.jsx lines 16-19):
```jsx
const [tab, setTab] = useState('inad');
const [openDrawer, setOpenDrawer] = useState(false);
const [liveTick, setLiveTick] = useState(0);
```
Adaptation order for AnaliseiFoodScreen:
```jsx
// form inputs
const [clienteId, setClienteId] = useState('');
const [driveLink, setDriveLink] = useState('');
const [periodo, setPeriodo] = useState('semanal');
// data
const [clientes, setClientes] = useState([]);
const [loadingClientes, setLoadingClientes] = useState(false);
// async flow
const [submitting, setSubmitting] = useState(false);
const [phase, setPhase] = useState('idle'); // 'idle' | 'processing'
const [jobId, setJobId] = useState(null);
const [error, setError] = useState(null); // { title, message } | null
// validation
const [driveLinkError, setDriveLinkError] = useState('');
```

**Section comment convention** (PT-BR):
```jsx
// ── Carregamento de clientes ──────────────────────────
// ── Submit handler ────────────────────────────────────
// ── Realtime subscription ─────────────────────────────
// ── Render ────────────────────────────────────────────
```

**Warning icon note:** `<Icon name="warning" />` is NOT in `Icon.jsx`. Use `<Icon name="info" />` in the error state, or add a `warning` path to `Icon.jsx` (one-line addition).

---

### `src/lib/api.js` (new functions)

**Analog:** `src/lib/api.js` existing functions (all verified in file read)

**Throw-on-error pattern** (lines 13-20 of api.js):
```js
export async function listTenants() {
  const { data, error } = await supabase
    .from('tenants')
    .select('id, slug, name, emoji, color, status, plan')
    .order('name');
  if (error) throw error;
  return data ?? [];
}
```

**`.maybeSingle()` for optional single-row query** (lines 22-30 of api.js):
```js
export async function getTenantBySlug(slug) {
  const { data, error } = await supabase
    .from('tenants')
    .select('id, slug, name, emoji, color')
    .eq('slug', slug)
    .maybeSingle();
  if (error) throw error;
  return data;
}
```

**INSERT returning specific fields** (derived from `moveTask` + `listTasks` patterns — lines 108-130 of api.js):
```js
export async function moveTask(taskId, col, position) {
  const { error } = await supabase
    .from('tasks')
    .update({ col, position })
    .eq('id', taskId);
  if (error) throw error;
}
```
Adaptation for `createAnalise` — must chain `.select('id, job_id, status').single()` to return the new row:
```js
export async function createAnalise(payload) {
  const { data, error } = await supabase
    .from('analises')
    .insert({ ...payload, status: 'pending' })
    .select('id, job_id, status')
    .single();
  if (error) throw error;
  return data;
}
```

**Relational join in select** (lines 108-121 of api.js):
```js
.select(`
  id, title, description, col, priority, due_label,
  assignee:profiles!tasks_assignee_id_fkey(id, full_name, avatar_url)
`)
```
Adaptation for `listAnalises`:
```js
.select(`
  id, job_id, status, periodo, drive_link, created_at, error_message,
  cliente:customers(id, name)
`)
```

**Realtime subscription — NOT async, returns cleanup** (pattern from ChatScreen.jsx lines 248-344):
```js
// ChatScreen analog — channel setup + cleanup
const channel = supabase
  .channel('global-messages-realtime')
  .on('postgres_changes',
    { event: 'INSERT', schema: 'public', table: 'messages' },
    payload => { /* handler */ })
  .subscribe();
return () => { supabase.removeChannel(channel); };
```
Adaptation for `subscribeToAnalise` — filter by `job_id`, event `UPDATE`:
```js
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
Note: This function is NOT `async` — it returns a cleanup function synchronously.

**All five functions to add** (names and signatures):
```js
export async function createAnalise(payload)      // INSERT, returns { id, job_id, status }
export async function getAnalise(jobId)            // SELECT by job_id, maybeSingle
export async function listAnalises(tenantId)       // SELECT list, order created_at DESC
export async function listClientes(tenantId)       // SELECT from customers, order name
export function subscribeToAnalise(jobId, callback) // Realtime channel, returns unsubscribe fn
```

---

### `src/App.jsx` (add route)

**Analog:** `src/App.jsx` lines 1-18 (imports) and 145-159 (route rendering block)

**Screen import pattern** (lines 5-14 of App.jsx):
```jsx
import LoginScreen from './screens/LoginScreen.jsx';
import DashboardScreen from './screens/DashboardScreen.jsx';
import ChatScreen from './screens/ChatScreen.jsx';
import KanbanScreen from './screens/KanbanScreen.jsx';
import CoraScreen from './screens/CoraScreen.jsx';
```
Add after line 9 (after CoraScreen import):
```jsx
import AnaliseiFoodScreen from './screens/AnaliseiFoodScreen.jsx';
```

**Route rendering pattern** (lines 145-159 of App.jsx):
```jsx
<main className="main scroll" key={route + tenant}>
  {route === 'dashboard' && <DashboardScreen tenant={tenant} tenantDbId={tenantDbId} />}
  {route === 'chat'      && <ChatScreen tenant={tenant} tenantDbId={tenantDbId} onNavigate={setRoute} />}
  {route === 'tasks'     && <KanbanScreen tenant={tenant} tenantDbId={tenantDbId} />}
  {route === 'cora'      && <CoraScreen tenant={tenant} tenantDbId={tenantDbId} />}
  {route === 'crm'       && <CRMScreen tenant={tenant} tenantDbId={tenantDbId} />}
```
Add after the `cora` line:
```jsx
  {route === 'analise-ifood' && <AnaliseiFoodScreen tenant={tenant} tenantDbId={tenantDbId} />}
```

**Props convention:** All screens receive `tenant` (slug string) and `tenantDbId` (UUID). No `onNavigate` needed for AnaliseiFoodScreen in Phase 1.

---

### `src/components/Sidebar.jsx` (add nav item)

**Analog:** `src/components/Sidebar.jsx` lines 5-15 (NAV_ITEMS array)

**NAV_ITEMS array** (lines 5-15 of Sidebar.jsx):
```js
const NAV_ITEMS = [
  { id: 'dashboard', icon: 'home',      label: 'Dashboard' },
  { id: 'chat',      icon: 'chat',      label: 'Chat Unificado' },
  { id: 'grupos',    icon: 'whatsapp',  label: 'Grupos' },
  { id: 'tasks',     icon: 'check',     label: 'Tarefas' },
  { id: 'cora',      icon: 'dollar',    label: 'CORA — Cobrança', pulse: true },
  { id: 'crm',       icon: 'users',     label: 'Clientes / CRM' },
  { id: 'reports',   icon: 'chart',     label: 'Relatórios' },
  { id: 'agents',    icon: 'bot',       label: 'Agentes IA' },
  { id: 'settings',  icon: 'gear',      label: 'Configurações' },
];
```
Insert after the `cora` entry (after line 10):
```js
  { id: 'analise-ifood', icon: 'chart', label: 'Análise iFood' },
```

**Exact entry to copy** (model from `cora` entry, line 10):
```js
{ id: 'cora', icon: 'dollar', label: 'CORA — Cobrança', pulse: true },
```
New entry omits `pulse` — no badge count for `analise-ifood` in Phase 1.

**Icon note:** `icon: 'chart'` is already used by the `reports` entry — both entries can share the same icon. Verified in `Icon.jsx`.

---

## Shared Patterns

### Alive-flag async loading
**Source:** `src/screens/CoraScreen.jsx` + all screens
**Apply to:** `AnaliseiFoodScreen.jsx` (listClientes useEffect)
```jsx
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

### Throw-on-error api.js convention
**Source:** `src/lib/api.js` all existing functions
**Apply to:** All five new api.js functions
- Always use `if (error) throw error;` — never `if (error) return null`
- Lists return `data ?? []`
- Single-row returns return `data` (may be null — use `maybeSingle()` not `single()` for optional)
- Exception: `createAnalise` uses `.single()` because the INSERT must return exactly one row

### CSS class + inline style pattern
**Source:** `src/screens/CoraScreen.jsx` throughout
**Apply to:** `AnaliseiFoodScreen.jsx`
- Use className for semantic classes (`card`, `btn-primary`, `route-enter`, `page-container`, `label`, `input`, `header-wrap`, `page-h1`, `page-sub`)
- Use inline `style` props for layout values (`padding`, `marginBottom`, `display`, `gap`, etc.)
- Never create new CSS classes — all styling via existing globals + inline `style`

### Supabase Realtime channel cleanup
**Source:** `src/screens/ChatScreen.jsx` lines 341-344
**Apply to:** `AnaliseiFoodScreen.jsx` useEffect for subscribeToAnalise
```jsx
useEffect(() => {
  if (!jobId) return;
  const unsubscribe = subscribeToAnalise(jobId, row => {
    // update state based on row.status
  });
  return unsubscribe;
}, [jobId]);
```

---

## No Analog Found

No files in this phase lack an analog. All patterns exist in the current codebase.

---

## Metadata

**Analog search scope:** `src/screens/`, `src/lib/`, `src/components/`, `supabase/migrations/`
**Files scanned:** 8
**Pattern extraction date:** 2026-05-02
