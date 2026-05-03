<!-- refreshed: 2026-05-01 -->
# Codebase Structure

**Analysis Date:** 2026-05-01

## Directory Layout

```
consult-delivery/
├── src/                        # All application source code
│   ├── App.jsx                 # Root component: auth, routing, tenant state
│   ├── main.jsx                # Entry point: ReactDOM.createRoot
│   ├── index.css               # Global CSS (custom properties, base styles)
│   ├── data.js                 # Static mock data (tenants, agents, tasks, KPIs)
│   ├── components/             # Reusable UI components
│   │   ├── Sidebar.jsx         # Left navigation bar
│   │   ├── Topbar.jsx          # Top header, tenant switcher, notifications
│   │   ├── TweaksPanel.jsx     # Dev/UI customization panel + useTweaks hook
│   │   ├── Icon.jsx            # SVG icon renderer
│   │   ├── Logo.jsx            # Brand logo component
│   │   ├── AgentAvatar.jsx     # AI agent colored avatar
│   │   └── UserAvatar.jsx      # User profile avatar
│   ├── screens/                # Full-page screen components (one per route)
│   │   ├── LoginScreen.jsx     # Auth: email/password + Google OAuth
│   │   ├── DashboardScreen.jsx # Home: KPIs, chart, agent activity
│   │   ├── ChatScreen.jsx      # Unified chat: WhatsApp + internal
│   │   ├── GruposScreen.jsx    # WhatsApp group management
│   │   ├── KanbanScreen.jsx    # Task board (drag-and-drop, 4 columns)
│   │   ├── CoraScreen.jsx      # CORA: debt collection panel
│   │   ├── CRMScreen.jsx       # Customer list
│   │   ├── ReportsScreen.jsx   # Reports and analytics
│   │   ├── AgentsPage.jsx      # AI agent catalog
│   │   ├── SettingsScreen.jsx  # Workspace, users, integrations, WhatsApp
│   │   └── Placeholder.jsx     # Generic placeholder for unbuilt screens
│   ├── lib/                    # External service clients and query helpers
│   │   ├── supabase.js         # Supabase client singleton
│   │   ├── api.js              # Primary query layer (typed, preferred)
│   │   ├── db.js               # Secondary query layer (older, avoid adding to)
│   │   └── evolution.js        # Evolution API REST client (WhatsApp)
│   └── types/
│       └── database.ts         # Auto-generated Supabase type definitions
├── supabase/
│   ├── functions/
│   │   ├── evolution-webhook/
│   │   │   └── index.ts        # Inbound WhatsApp webhook handler (Deno)
│   │   └── manage-users/
│   │       └── index.ts        # Admin user CRUD (Deno)
│   └── migrations/
│       └── 20260426_evolution_chat.sql  # evolution_instances table + conversation columns
├── public/                     # Static assets served as-is
│   └── assets/                 # Images (rocket-logo.png, wandson.jpg)
├── dist/                       # Vite build output (generated, not committed)
├── index.html                  # Vite HTML entry point
├── vite.config.js              # Vite config (React plugin only)
├── jsconfig.json               # JS editor config
├── package.json                # Dependencies and scripts
└── CLAUDE.md                   # Project master document (requirements, roadmap)
```

## Directory Purposes

**`src/screens/`:**
- Purpose: One file per application screen/route
- Contains: Full-page React components, each managing its own data fetching and state
- Naming: PascalCase + `Screen` suffix (e.g., `DashboardScreen.jsx`) or `Page` suffix for newer screens (`AgentsPage.jsx`)
- Key files: `ChatScreen.jsx` (most complex, ~800+ lines), `SettingsScreen.jsx` (multi-tab admin)

**`src/components/`:**
- Purpose: Shared UI building blocks used across multiple screens
- Contains: Layout components (Sidebar, Topbar), utility components (Icon, Logo, avatars), and the TweaksPanel
- Naming: PascalCase (e.g., `AgentAvatar.jsx`)

**`src/lib/`:**
- Purpose: Service clients and data access abstractions
- Contains: Supabase singleton, query modules, Evolution API client
- Key rule: Add new Supabase queries to `api.js` only (has type annotations). Do not add to `db.js`.

**`src/types/`:**
- Purpose: TypeScript type definitions for Supabase schema
- Contains: `database.ts` — auto-generated from Supabase CLI (`supabase gen types`)
- Usage: Imported via JSDoc `@typedef` in `api.js` for editor autocompletion

**`supabase/functions/`:**
- Purpose: Deno-based Supabase Edge Functions
- Contains: `evolution-webhook` (inbound WhatsApp ingestion), `manage-users` (admin user management)
- Deploy command: `supabase functions deploy <function-name>`

**`supabase/migrations/`:**
- Purpose: Versioned SQL schema changes applied to the Supabase project
- Naming: `YYYYMMDD_description.sql`
- Current: One migration file (`20260426_evolution_chat.sql`) for Evolution API integration

**`src/data.js`:**
- Purpose: Static mock data for development fallback and demo tenants
- Contains: `TENANTS`, `AGENTS`, `CONVERSATIONS`, `TASKS`, `INADIMPLENTES`, `TENANT_DATA`, `SETTINGS_DATA`
- Note: `KanbanScreen` reads tasks exclusively from this file — not from Supabase

## Key File Locations

**Entry Points:**
- `index.html` — Vite HTML shell
- `src/main.jsx` — `ReactDOM.createRoot` mount point
- `src/App.jsx` — Root component; auth gate and route controller

**Configuration:**
- `vite.config.js` — Vite build config (React plugin only; no aliases)
- `jsconfig.json` — Editor JS config
- `.env.local` — Runtime secrets (not committed): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_EVOLUTION_URL`, `VITE_EVOLUTION_KEY`

**Core Logic:**
- `src/lib/supabase.js` — Supabase client (import `supabase` from here everywhere)
- `src/lib/api.js` — All new Supabase queries go here
- `src/lib/evolution.js` — All Evolution API calls go here
- `src/types/database.ts` — Schema types (regenerate with `supabase gen types typescript`)

**Supabase Backend:**
- `supabase/functions/evolution-webhook/index.ts` — Webhook receiver
- `supabase/functions/manage-users/index.ts` — User management API
- `supabase/migrations/20260426_evolution_chat.sql` — Latest schema migration

## Naming Conventions

**Files:**
- Screen components: `PascalCase` + `Screen` suffix → `DashboardScreen.jsx`, `ChatScreen.jsx`
- Layout/shared components: `PascalCase` → `Sidebar.jsx`, `Topbar.jsx`, `Icon.jsx`
- Library modules: `camelCase.js` → `supabase.js`, `api.js`, `evolution.js`
- Migrations: `YYYYMMDD_snake_case.sql`
- Edge Functions: directory named `kebab-case`, entry file `index.ts`

**Directories:**
- `screens/` — full-page components
- `components/` — reusable UI pieces
- `lib/` — service clients and query helpers
- `types/` — TypeScript definitions

**Variables and exports:**
- Component exports: default export named same as file (e.g., `export default function DashboardScreen`)
- Query functions: camelCase verbs — `listTenants`, `getKPIs`, `moveTask`, `fetchConversations`
- Constants: UPPER_SNAKE_CASE — `TENANTS`, `AGENTS`, `COLS`, `PRIORITY`
- CSS custom properties: kebab-case with `--` prefix — `--red`, `--g-500`, `--r-sm`

## Route Structure

No React Router. Routing is managed by `route` state in `src/App.jsx`.

| Route String | Screen Component | File |
|---|---|---|
| `'dashboard'` | DashboardScreen | `src/screens/DashboardScreen.jsx` |
| `'chat'` | ChatScreen | `src/screens/ChatScreen.jsx` |
| `'grupos'` | GruposScreen | `src/screens/GruposScreen.jsx` |
| `'tasks'` | KanbanScreen | `src/screens/KanbanScreen.jsx` |
| `'cora'` | CoraScreen | `src/screens/CoraScreen.jsx` |
| `'crm'` | CRMScreen | `src/screens/CRMScreen.jsx` |
| `'reports'` | ReportsScreen | `src/screens/ReportsScreen.jsx` |
| `'agents'` | AgentsPage | `src/screens/AgentsPage.jsx` |
| `'settings'` | SettingsScreen | `src/screens/SettingsScreen.jsx` |

Navigation is triggered by clicking items in `src/components/Sidebar.jsx` which calls `setRoute(id)`.

## Supabase Migrations and Functions Layout

```
supabase/
├── .temp/
│   ├── cli-latest              # Supabase CLI version cache
│   └── linked-project.json     # Linked project reference (project_id)
├── functions/
│   ├── evolution-webhook/
│   │   └── index.ts            # Deno: inbound WhatsApp message ingestion
│   └── manage-users/
│       └── index.ts            # Deno: create/update/delete tenant users
└── migrations/
    └── 20260426_evolution_chat.sql  # evolution_instances table + conversations/messages columns
```

**Migration naming pattern:** `YYYYMMDD_description.sql`

**Deploying functions:**
```bash
supabase functions deploy evolution-webhook
supabase functions deploy manage-users
```

**Regenerating types:**
```bash
supabase gen types typescript --project-id <ref> > src/types/database.ts
```

## Where to Add New Code

**New screen / route:**
1. Create `src/screens/NewFeatureScreen.jsx`
2. Import and add conditional render in `src/App.jsx`: `{route === 'new-feature' && <NewFeatureScreen tenant={tenant} tenantDbId={tenantDbId} />}`
3. Add nav item to `NAV_ITEMS` array in `src/components/Sidebar.jsx`
4. Add label to `ROUTE_LABELS` in `src/components/Topbar.jsx`

**New Supabase query:**
- Add to `src/lib/api.js` only (not `db.js`)
- Follow existing pattern: async function, destructure `{ data, error }`, `if (error) throw error`, `return data ?? []`

**New Evolution API call:**
- Add to `src/lib/evolution.js`
- Use the module-level `headers` constant and `EVO_URL` / `EVO_KEY` env vars

**New reusable component:**
- Add to `src/components/ComponentName.jsx`
- Export as default named function

**New database table:**
- Create migration: `supabase/migrations/YYYYMMDD_description.sql`
- Always include `tenant_id uuid REFERENCES tenants(id)` for tenant-scoped tables
- Always add `ALTER TABLE x ENABLE ROW LEVEL SECURITY` + policy
- Regenerate types: `supabase gen types typescript` → update `src/types/database.ts`

**New Edge Function:**
- Create directory: `supabase/functions/function-name/`
- Create `index.ts` with `Deno.serve(async (req) => { ... })`
- Use `SUPABASE_SERVICE_ROLE_KEY` for admin operations; always verify caller JWT first
- Deploy: `supabase functions deploy function-name`

**New mock data (temporary):**
- Add to `src/data.js` only
- Do not use mock data as permanent state — connect to Supabase queries before shipping

## Special Directories

**`dist/`:**
- Purpose: Vite production build output
- Generated: Yes (by `npm run build`)
- Committed: No (in .gitignore)

**`supabase/.temp/`:**
- Purpose: Supabase CLI cache (linked project ID, CLI version)
- Generated: Yes
- Committed: No

**`.planning/codebase/`:**
- Purpose: GSD codebase map documents consumed by planning and execution agents
- Generated: Yes (by gsd-map-codebase agent)
- Committed: Yes

**`.agent/`:**
- Purpose: GSD agent skills and workflow definitions
- Generated: No (checked in)
- Committed: Yes

---

*Structure analysis: 2026-05-01*
