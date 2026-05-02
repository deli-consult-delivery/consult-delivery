# External Integrations

**Analysis Date:** 2026-05-01

## APIs & External Services

**WhatsApp — Evolution API:**
- What it does: Send/receive WhatsApp messages, manage instances, groups, media
- Client module: `src/lib/evolution.js` (browser-side, direct HTTP calls)
- Auth: `apikey` HTTP header using `VITE_EVOLUTION_KEY`
- Base URL: `VITE_EVOLUTION_URL` (stored per-instance also in `evolution_instances` table)
- Key operations implemented in `src/lib/evolution.js`:
  - `sendTextMessage`, `sendMediaMessage`, `sendAudioMessage`
  - `listInstances`, `getInstanceStatus`, `getQRCode`, `setWebhook`
  - `fetchMessages`, `fetchContacts`, `fetchGroups`, `fetchProfile`, `markAsRead`
  - Full WhatsApp group management: create, update subject, add/remove participants, leave
- Webhook inbound: Evolution API POSTs to Supabase Edge Function `evolution-webhook`

**Google Fonts (CDN):**
- Loaded in `index.html` from `fonts.googleapis.com` / `fonts.gstatic.com`
- Fonts: Montserrat (400–800), Oswald (700)
- No API key required

## Data Storage

**Databases:**
- Supabase (PostgreSQL) — primary database
  - Project ref: `czyanilrverorwenikqw`
  - Project name: `consult-delivery-mvp`
  - URL: `https://czyanilrverorwenikqw.supabase.co` (also in `.env.example`)
  - Client: `@supabase/supabase-js` ^2.49.4 — initialized at `src/lib/supabase.js`
  - Row Level Security (RLS) active on all tables
  - Multi-tenant: all tables include `tenant_id` column with RLS policies

**Database Tables (from `src/types/database.ts` and migrations):**
- `tenants` — workspace/company records
- `tenant_members` — user-to-tenant membership with `role` (owner, admin, operador) and `semaforo`
- `profiles` — user profile data linked to Supabase Auth users
- `agents` — AI agent records (DELI, LARA, CORA, etc.)
- `tenant_agents` — per-tenant agent configuration
- `agent_actions` — audit log of agent activity
- `conversations` — chat threads (WhatsApp and internal)
- `messages` — individual messages with `direction` (inbound/outbound)
- `customers` — CRM customer records
- `orders` — delivery order records
- `tasks` — Kanban task cards
- `task_comments` — comments on tasks
- `inadimplencias` — overdue payment records (CORA module)
- `inadimplencia_messages` — conversation log for debt collection
- `daily_kpis` — pre-aggregated KPI data per tenant per day
- `regua_cobranca` — debt collection schedule rules
- `evolution_instances` — Evolution API instance config per tenant (includes `evolution_url`, `api_key`, `status`)

**Database Views:**
- `v_dashboard_kpis` — current KPIs per tenant
- `v_chart_7d` — order counts for last 7 days per tenant

**Database Functions:**
- `is_admin_of(_tenant)` — RLS helper
- `is_member_of(_tenant)` — RLS helper

**File Storage:**
- Supabase Storage — not explicitly configured in code yet
- Media (images, audio, video) from WhatsApp stored as base64 `data:` URIs in `messages.media_url` column (see `evolution-webhook` Edge Function)

**Caching:**
- None detected — no Redis, no service worker caching layer

## Authentication & Identity

**Auth Provider:**
- Supabase Auth — email/password authentication
- Implementation: `supabase.auth.getSession()` + `supabase.auth.onAuthStateChange()` in `src/App.jsx`
- User profiles synced to `profiles` table on user creation
- Role/permission model: `tenant_members.role` field (owner, admin, operador) + `semaforo` field (verde, amarelo, vermelho)
- Admin-only operations proxied through `manage-users` Edge Function to use service role key safely

## Supabase Edge Functions

**`evolution-webhook`** (`supabase/functions/evolution-webhook/index.ts`):
- Receives inbound WhatsApp messages from Evolution API
- Endpoint: `POST /functions/v1/evolution-webhook`
- Flow: validates event type → resolves instance → upserts conversation → saves message → async media download
- Uses `SUPABASE_SERVICE_ROLE_KEY` (platform-injected)

**`manage-users`** (`supabase/functions/manage-users/index.ts`):
- Admin-only user CRUD (create/update/delete) for tenant members
- Endpoint: `POST /functions/v1/manage-users`
- Auth: caller JWT verified; caller must have `owner` or `admin` role in target tenant
- Actions: `create` (creates Supabase Auth user + profile + tenant_members row), `update`, `delete`
- Uses `SUPABASE_SERVICE_ROLE_KEY` (platform-injected)

## Realtime

**Supabase Realtime:**
- Enabled on Supabase project (per CLAUDE.md setup)
- Used for live message delivery in chat screens
- Subscriptions implemented in `src/screens/ChatScreen.jsx` (actual subscription code not shown here but database is Realtime-enabled)

## Webhooks & Callbacks

**Incoming:**
- `POST /functions/v1/evolution-webhook` — receives `MESSAGES_UPSERT` events from Evolution API
  - Webhook URL configured per Evolution instance via `setWebhook()` in `src/lib/evolution.js`
  - Filters: only `messagesupsert` events, ignores `fromMe` messages

**Outgoing:**
- Evolution API calls from browser: `src/lib/evolution.js` makes direct `fetch()` calls to `VITE_EVOLUTION_URL`
- Supabase Edge Functions call Evolution API for media download: `${instanceData.evolution_url}/chat/getBase64FromMediaMessage/...`

## Planned / Referenced Integrations (not yet implemented in code)

**Asaas (payment):**
- Referenced in CLAUDE.md as the payment provider
- No SDK or API calls found in source — planned for TASK-403 (production migration)

**n8n (automation):**
- Referenced in CLAUDE.md; VPS hosts n8n instance
- No direct calls from this frontend repo — n8n is a separate orchestration layer

**Claude API (Anthropic):**
- Referenced in CLAUDE.md; `ANTHROPIC_API_KEY` stored in Infisical on VPS
- No direct calls from this frontend repo — used by AI agents running on VPS

**Infisical (secrets):**
- Self-hosted at `172.18.0.3:8080` on VPS
- Holds: `ANTHROPIC_API_KEY`, `HEYGEN_API_KEY`
- Not referenced in frontend code — VPS-side only

## Environment Variables Reference

| Variable | Used By | Purpose |
|---|---|---|
| `VITE_SUPABASE_URL` | `src/lib/supabase.js` | Supabase project endpoint |
| `VITE_SUPABASE_ANON_KEY` | `src/lib/supabase.js` | Supabase public/anon key |
| `VITE_EVOLUTION_URL` | `src/lib/evolution.js` | Evolution API base URL |
| `VITE_EVOLUTION_KEY` | `src/lib/evolution.js` | Evolution API key |
| `SUPABASE_URL` | Edge Functions (platform-injected) | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Edge Functions (platform-injected) | Admin access to Supabase |

---

*Integration audit: 2026-05-01*
