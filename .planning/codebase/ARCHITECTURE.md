<!-- refreshed: 2026-05-01 -->
# Architecture

**Analysis Date:** 2026-05-01

## System Overview

```text
┌──────────────────────────────────────────────────────────────────────┐
│                    Browser (React 18 SPA — Vite)                     │
│                    Deployed on Vercel                                 │
├───────────┬──────────────┬────────────┬────────────┬─────────────────┤
│ Dashboard │ Chat Screen  │  Kanban    │  CORA      │ Settings / CRM  │
│  (screen) │  (screen)    │  (screen)  │  (screen)  │ (screens)       │
└─────┬─────┴──────┬───────┴─────┬──────┴─────┬──────┴────────┬────────┘
      │            │             │            │               │
      └────────────┴─────────────┴────────────┴───────────────┘
                              │
             ┌────────────────┼──────────────────────┐
             │                │                      │
             ▼                ▼                      ▼
     src/lib/api.js    src/lib/db.js     src/lib/evolution.js
     (query layer)    (alt query layer)  (Evolution API client)
             │                │                      │
             └────────────────┘                      │
                              │                      │
                              ▼                      ▼
              ┌───────────────────────────┐    ┌─────────────────────┐
              │     Supabase (remote)     │    │  Evolution API       │
              │  Auth + Postgres + RLS    │    │  (WhatsApp gateway)  │
              │  Realtime + Edge Funcs    │    │  VPS 193.202.85.82   │
              └───────────────────────────┘    └─────────────────────┘
                              │
              ┌───────────────┴──────────────────────┐
              │       Supabase Edge Functions         │
              │  evolution-webhook/index.ts           │
              │  manage-users/index.ts                │
              └───────────────────────────────────────┘
```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| App | Auth gate, tenant state, routing, theme, tweaks | `src/App.jsx` |
| LoginScreen | Email/password + Google OAuth via Supabase | `src/screens/LoginScreen.jsx` |
| DashboardScreen | KPI cards, 7-day chart, agent action feed | `src/screens/DashboardScreen.jsx` |
| ChatScreen | WhatsApp + internal chat via Realtime | `src/screens/ChatScreen.jsx` |
| KanbanScreen | Drag-and-drop task board (4 columns) | `src/screens/KanbanScreen.jsx` |
| CoraScreen | Debt collection panel (inadimplencias) | `src/screens/CoraScreen.jsx` |
| GruposScreen | WhatsApp group management | `src/screens/GruposScreen.jsx` |
| CRMScreen | Customer list | `src/screens/CRMScreen.jsx` |
| ReportsScreen | Metrics and reports | `src/screens/ReportsScreen.jsx` |
| AgentsPage | AI agent catalog display | `src/screens/AgentsPage.jsx` |
| SettingsScreen | Workspace, users, integrations, WhatsApp, billing | `src/screens/SettingsScreen.jsx` |
| Sidebar | Navigation, badge counts, user identity | `src/components/Sidebar.jsx` |
| Topbar | Tenant switcher, search, notifications, theme | `src/components/Topbar.jsx` |
| TweaksPanel | Runtime UI tweaks (color, density) | `src/components/TweaksPanel.jsx` |
| api.js | Primary Supabase query layer with JSDoc types | `src/lib/api.js` |
| db.js | Secondary Supabase query layer (older pattern) | `src/lib/db.js` |
| evolution.js | Evolution API REST client for WhatsApp | `src/lib/evolution.js` |
| evolution-webhook | Edge Function: receives inbound WhatsApp messages | `supabase/functions/evolution-webhook/index.ts` |
| manage-users | Edge Function: admin user CRUD | `supabase/functions/manage-users/index.ts` |

## Pattern Overview

**Overall:** Single-page application with custom client-side routing via `useState` in `src/App.jsx`. No React Router. Navigation is a `route` string; each screen is conditionally rendered via `{route === 'x' && <Screen />}`.

**Key Characteristics:**
- No URL-based routing — `route` state in App controls which screen renders
- All Supabase calls made directly from screen components or via `src/lib/api.js` / `src/lib/db.js`
- Multi-tenant isolation enforced at the database layer via RLS; frontend passes `tenantDbId` (UUID) as prop to screens
- Static mock data in `src/data.js` serves as fallback when live Supabase data is unavailable
- Two parallel query modules (`api.js` and `db.js`) exist with overlapping coverage

## Layers

**UI Layer:**
- Purpose: Render screens, handle local component state and user interactions
- Location: `src/screens/`, `src/components/`
- Contains: JSX screen components, layout components (Sidebar, Topbar), utility components (Icon, Logo, Avatar)
- Depends on: `src/lib/`, `src/data.js`
- Used by: `src/App.jsx`

**Library / Query Layer:**
- Purpose: Abstract Supabase and Evolution API calls
- Location: `src/lib/`
- Contains: `supabase.js` (client singleton), `api.js` (primary queries), `db.js` (secondary queries), `evolution.js` (WhatsApp REST)
- Depends on: `@supabase/supabase-js`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_EVOLUTION_URL`, `VITE_EVOLUTION_KEY`
- Used by: screens, `App.jsx`

**Backend Layer (Supabase):**
- Purpose: Persistent storage, auth, real-time events, RLS enforcement
- Location: Remote Supabase project; Edge Functions in `supabase/functions/`
- Contains: Postgres tables, RLS policies, SQL views, Deno-based Edge Functions
- Depends on: Supabase platform, Evolution API (webhook ingestion)

**Mock Data Layer:**
- Purpose: Fallback and demo data
- Location: `src/data.js`
- Contains: `TENANTS`, `AGENTS`, `CONVERSATIONS`, `TASKS`, `INADIMPLENTES`, `TENANT_DATA`, `SETTINGS_DATA`

## Data Flow

### Auth Flow

1. App mounts → `supabase.auth.getSession()` called (`src/App.jsx:74`)
2. If no session → `<LoginScreen>` rendered; shell hidden
3. User submits email/password → `supabase.auth.signInWithPassword()` (`src/screens/LoginScreen.jsx:17`)
4. On success → `onLogin(session)` sets `session` in App state → shell renders
5. `supabase.auth.onAuthStateChange` subscription keeps session current for the lifetime of the page

### Tenant Resolution Flow

1. After auth, `reloadTenants()` fires (`src/App.jsx:38`)
2. Calls `listTenants()` from `src/lib/api.js` → queries `tenants` table (RLS-filtered to user's memberships)
3. Falls back to direct `tenant_members` → `tenants` join if `listTenants()` returns empty
4. `tenant` (slug string) and `tenantDbId` (UUID) stored in App state
5. Both propagated as props to all screen components on every render

### Inbound WhatsApp Message Flow

1. WhatsApp user sends message → Evolution API receives it
2. Evolution API POSTs webhook payload to `supabase/functions/evolution-webhook/index.ts`
3. Edge Function validates event type (`MESSAGES_UPSERT`), skips `fromMe`
4. Looks up `evolution_instances` by `instance_name`
5. Finds or creates `conversations` record keyed by `whatsapp_chat_id` + `instance_id`
6. Inserts into `messages` table immediately (non-blocking — never held for media)
7. If media present: async fetch of base64 from Evolution API (10s timeout), then updates `messages.media_url`
8. Frontend `ChatScreen` subscribes to Supabase Realtime on `messages` — update appears live

### Outbound WhatsApp Message Flow

1. User types in `ChatScreen`, clicks send
2. `sendTextMessage(instanceName, to, text)` called (`src/lib/evolution.js:30`)
3. POST to `${VITE_EVOLUTION_URL}/message/sendText/${instanceName}`
4. Evolution API delivers to WhatsApp
5. Message inserted into `messages` table for persistence

### Dashboard KPI Flow

1. `DashboardScreen` mounts with `tenantDbId`
2. Calls `fetchDashboardKpis(tenantDbId)` from `src/lib/db.js`
3. Queries `v_dashboard_kpis` Supabase view filtered by `tenant_id`
4. Falls back to `TENANT_DATA[tenant]` mock if Supabase returns null

## Auth and Session Model

- **Provider:** Supabase Auth — email/password and Google OAuth
- **Session storage:** Managed automatically by Supabase JS client (localStorage)
- **Session check:** `supabase.auth.getSession()` on mount; `onAuthStateChange` subscription for updates
- **Auth guard:** `src/App.jsx` — `if (!session)` renders `<LoginScreen>`, else renders the main shell
- **User identity:** `supabase.auth.getUser()` called inline in screens when `user.id` is needed
- **Admin operations:** `manage-users` Edge Function verifies caller JWT and checks `tenant_members.role` is `owner` or `admin` before any mutation

## Multi-Tenancy Approach

- Each tenant is a row in `tenants` (UUID `id` + human-readable `slug`)
- Users linked via `tenant_members` join table: `(user_id, tenant_id, role)`
- **RLS pattern:** Every data table has a `tenant_id` UUID column. Policy: `USING (tenant_id IN (SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid()))`
- **Frontend:** `tenantDbId` (UUID) prop passed to all screens; every query uses `.eq('tenant_id', tenantDbId)`
- **Tenant switching:** Topbar dropdown calls `setTenant(slug)` which triggers `useEffect` to update `tenantDbId`; screens re-mount via `key={route + tenant}`
- **Helper RLS functions:** `is_member_of(_tenant)` and `is_admin_of(_tenant)` defined as Postgres functions in the schema

## Supabase Schema Overview

### Core Tables

| Table | Purpose | Tenant-scoped |
|-------|---------|---------------|
| `tenants` | Workspace registry (slug, name, plan, status) | No (root) |
| `profiles` | Auth user profiles (full_name, avatar_url, is_super) | No |
| `tenant_members` | User-Tenant membership with role and semaforo | Via tenant_id |
| `customers` | End-customers (phone, email, tags, is_vip) | Yes |
| `orders` | Delivery orders (channel, status, total_cents) | Yes |
| `conversations` | Chat threads (WhatsApp or internal, instance_id, whatsapp_chat_id, is_group) | Yes |
| `messages` | Individual messages (direction, body, media_url, sender_kind) | Yes |
| `tasks` | Kanban tasks (col, priority, position, assignee_id) | Yes |
| `task_comments` | Task discussion threads | Yes |
| `agents` | AI agent catalog (id=slug like 'cora', role, color) — global | No |
| `tenant_agents` | Agent enablement per tenant with config JSON | Yes |
| `agent_actions` | AI agent activity log shown on Dashboard | Yes |
| `inadimplencias` | Overdue accounts (amount_cents, days_late, pay_probability, sentiment_score) | Yes |
| `inadimplencia_messages` | CORA conversation transcript per debt case | Yes |
| `daily_kpis` | Pre-aggregated daily metric snapshots | Yes |
| `regua_cobranca` | Debt collection schedule (days array, channel) | Yes |
| `evolution_instances` | WhatsApp connection instances (instance_name, evolution_url, api_key) | Yes |

### Views

| View | Source | Purpose |
|------|--------|---------|
| `v_dashboard_kpis` | `daily_kpis` | Latest KPI row per tenant |
| `v_chart_7d` | `daily_kpis` | 7-day orders count series per tenant |

### Key Relationships

- `messages.conversation_id` → `conversations.id`
- `conversations.customer_id` → `customers.id`
- `conversations.instance_id` → `evolution_instances.id`
- `tasks.assignee_id` → `profiles.id`
- `tasks.agent_id` → `agents.id`
- `inadimplencias.customer_id` → `customers.id`
- `tenant_members.user_id` → `profiles.id`

## Edge Functions

### `evolution-webhook` (`supabase/functions/evolution-webhook/index.ts`)

- **Trigger:** HTTP POST from Evolution API for every inbound WhatsApp event
- **Logic:**
  1. Filters to `MESSAGES_UPSERT` events; ignores `fromMe`
  2. Resolves `evolution_instances` by `instance_name`
  3. Finds or creates `conversations` by `whatsapp_chat_id` + `instance_id`
  4. Inserts `messages` row immediately
  5. Async: fetches base64 media with 10s timeout; updates `messages.media_url` on success
- **Auth:** `SUPABASE_SERVICE_ROLE_KEY` — bypasses RLS
- **Error strategy:** Media errors are caught and swallowed; message row is always saved first

### `manage-users` (`supabase/functions/manage-users/index.ts`)

- **Trigger:** HTTP POST from `SettingsScreen` admin UI
- **Actions:** `create`, `update`, `delete`
- **Auth guard:** Verifies caller Bearer JWT; checks `tenant_members.role` is `owner` or `admin`
- **create:** Creates Supabase auth user → upserts `profiles` → inserts `tenant_members` (with semaforo field)
- **update:** Updates `tenant_members` (role, semaforo, display_name) and `profiles.full_name`
- **delete:** Removes `tenant_members` entry; deletes auth user only if no other tenant memberships remain
- **Auth:** `SUPABASE_SERVICE_ROLE_KEY` for auth admin operations

## State Management Approach

No external state library. All state is React `useState` / `useEffect`.

**App-level state** (`src/App.jsx`):
- `session` — Supabase auth session object
- `route` — current screen string (e.g., `'dashboard'`, `'chat'`)
- `tenant` — current tenant slug (e.g., `'pizza-joao'`)
- `tenantDbId` — current tenant UUID (string | null)
- `tenants` — array of tenant objects available to the user
- `tweaks` — UI customization (color, density, toggles) via `useTweaks` hook
- `theme` — `'claro'` | `'cinza'` | `'escuro'`, persisted in `localStorage` key `cd-theme`
- `sidebarOpen` — boolean for mobile sidebar overlay

**Screen-level state:** Each screen component manages its own data, loading, and UI state via local `useState` + `useEffect`.

**No shared context:** Props are drilled from App to screens (`tenant`, `tenantDbId`, `onNavigate`).

**Realtime:** `ChatScreen` sets up Supabase Realtime channel subscriptions directly inside the component using `useEffect`.

## Architectural Constraints

- **No URL routing:** Browser URL never changes — deep links and browser back/forward do not work
- **Dual query layers:** `src/lib/api.js` and `src/lib/db.js` have overlapping coverage with different field conventions; field names for the same view differ between modules
- **KanbanScreen reads only mock data:** `KanbanScreen` uses `TASKS[tenant]` from `src/data.js` — not connected to Supabase
- **Tenant prop drilling:** `tenantDbId` passed as prop to every screen — no React Context
- **Service role bypasses RLS:** Both Edge Functions use service role key — mutations are not RLS-protected on the server side
- **Evolution API key in browser bundle:** `VITE_EVOLUTION_KEY` is public-facing

## Anti-Patterns

### Dual Query Modules With Divergent Field Names

**What happens:** `src/lib/api.js` and `src/lib/db.js` both query the same Supabase views and tables. The `v_chart_7d` view field is `pedidos_count` in `api.js` but `orders_count` in `db.js`.
**Why it's wrong:** New developers (or AI assistants) cannot reliably know which module to use, and the field name inconsistency causes runtime errors if mixed.
**Do this instead:** Consolidate all queries into `src/lib/api.js` (it has JSDoc type annotations from `src/types/database.ts`). Delete or stop adding to `src/lib/db.js`.

### KanbanScreen Uses Static Mock Data

**What happens:** `KanbanScreen` imports `TASKS[tenant]` from `src/data.js` instead of querying Supabase.
**Why it's wrong:** Task edits are not persisted; multi-user editing is not possible; the screen does not reflect real database state.
**Do this instead:** Call `listTasks(tenantDbId)` from `src/lib/api.js` on mount, same pattern as `ChatScreen` and `DashboardScreen`.

### No URL-Based Routing

**What happens:** `route` is a `useState` string; screens render via inline conditionals in `src/App.jsx`.
**Why it's wrong:** Deep links, browser back/forward, and bookmarks do not work.
**Do this instead:** Introduce React Router (`react-router-dom`) — map each `route` string to a URL path.

## Error Handling

**Strategy:** Mostly silent. No global error boundary. No toast system.

**Patterns:**
- `try { ... } catch (_) { /* silencioso */ }` — used in `App.jsx` tenant loading
- `if (error) throw error` — pattern in `src/lib/api.js`
- `if (error || !data) return null` — pattern in `src/lib/db.js`
- Edge Functions return JSON `{ error: '...' }` with appropriate HTTP status codes
- Media download failures in `evolution-webhook` are caught and logged; message row preserved

## Cross-Cutting Concerns

**Theme:** CSS custom properties (`--red`, `--white`, `--black`) on `document.documentElement`; `data-theme` attribute applied for dark/gray modes.
**Logging:** `console.log` / `console.warn` / `console.error` only — no structured logging library.
**Authentication:** Handled in `App.jsx` before any screen renders — no per-screen auth guards needed.
**Realtime:** Supabase Realtime subscriptions used in `ChatScreen` for live message delivery; not yet used in other screens.

---

*Architecture analysis: 2026-05-01*
