# Codebase Concerns

**Analysis Date:** 2026-05-01

---

## HIGH — Security

### VPS IP and Port Hardcoded in Source Code

**Issue:** The production VPS IP address `193.202.85.82` and OpenClaw port `18789` are hardcoded in `src/screens/SettingsScreen.jsx` (lines 96 and 1340). These are rendered to the browser in plain text and thus exposed to any authenticated user.
**Files:** `src/screens/SettingsScreen.jsx`
**Impact:** Infrastructure reconnaissance — any logged-in user can see the exact server address and port of the AI backend.
**Fix approach:** Move to a non-rendered constant or display only in admin-only views behind a role check; ideally exclude from client bundle entirely.

### Evolution API Key Exposed in Frontend Bundle

**Issue:** `VITE_EVOLUTION_KEY` is a Vite public env var — it is embedded in the client JS bundle at build time and accessible to anyone who opens devtools.
**Files:** `src/lib/evolution.js`, `src/screens/ChatScreen.jsx`, `src/screens/SettingsScreen.jsx`
**Impact:** Anyone with the WhatsApp API key can send messages, list contacts, fetch groups, set webhooks, and read all chat history from the Evolution API instance — completely bypassing the app's auth.
**Fix approach:** All Evolution API calls must be proxied through Supabase Edge Functions (using `SUPABASE_SERVICE_ROLE_KEY` server-side, never `VITE_*`). The frontend should never hold the Evolution API key.

### Supabase Anon Key in `.env.example` Is Real

**Issue:** `.env.example` contains what appears to be the real Supabase project URL and a real publishable key (`sb_publishable_MduR9lddqVcBHLkdw13-_g_2NgRaFlK`) committed to the repository. Example files should contain placeholder values only.
**Files:** `.env.example`
**Impact:** Publicly exposes the Supabase project reference. While anon keys are designed to be safe under correct RLS, rotating them is now necessary.
**Fix approach:** Replace `.env.example` values with placeholder strings (`your-supabase-url`, `your-anon-key`). Rotate the real anon key via the Supabase dashboard.

### CORS Wildcard on `manage-users` Edge Function

**Issue:** `manage-users` Edge Function sets `'Access-Control-Allow-Origin': '*'`, allowing any origin to attempt user management operations.
**Files:** `supabase/functions/manage-users/index.ts`
**Impact:** CSRF risk — any web page can trigger calls. The JWT check mitigates this partially, but the wildcard CORS should be locked to the production Vercel domain.
**Fix approach:** Set `Access-Control-Allow-Origin` to the specific production URL (e.g., `https://deli-os.vercel.app`).

### No Webhook Signature Validation in `evolution-webhook`

**Issue:** The Edge Function at `supabase/functions/evolution-webhook/index.ts` accepts any POST without verifying a shared secret or signature from the Evolution API.
**Files:** `supabase/functions/evolution-webhook/index.ts`
**Impact:** Any actor who discovers the webhook URL can forge incoming WhatsApp messages, create arbitrary conversations and messages in the database.
**Fix approach:** Add a shared secret header check (e.g., `X-Webhook-Secret`) configured in Evolution API and verified server-side in the Edge Function.

---

## HIGH — Multi-tenancy

### `listTenants()` in `api.js` Fetches All Tenants Without User Scoping

**Issue:** `src/lib/api.js:listTenants()` queries the `tenants` table without filtering by the current user's memberships. It relies entirely on RLS to restrict results. If RLS is misconfigured or missing on the `tenants` table, any authenticated user would see all tenants.
**Files:** `src/lib/api.js` (lines 13–19)
**Impact:** Tenant data leakage between clients in the worst case.
**Fix approach:** Add explicit `.in('id', [...user_tenant_ids])` filter client-side as defense in depth, or verify RLS policy on `tenants` is correctly scoped to `tenant_members`.

### `loadInternalChannels()` Has Incomplete Tenant Filter

**Issue:** In `ChatScreen`, `loadInternalChannels()` uses `.or(`tenant_id.eq.${tenantDbId},is_global.eq.true`)`. If `tenantDbId` is `null` (before tenant loads), the filter becomes `.or('tenant_id.eq.null,is_global.eq.true')`, which may return unexpected records.
**Files:** `src/screens/ChatScreen.jsx` (line 381)
**Impact:** Potential display of wrong tenant's internal channels if tenant ID resolves late.
**Fix approach:** Guard the query with `if (!tenantDbId) return;` before executing.

### `loadWAGroups()` Does Not Filter by `tenant_id`

**Issue:** The `whatsapp_groups` query in `ChatScreen` filters only by `instance_name`, not by `tenant_id`. If two tenants share an Evolution instance, groups bleed across tenants.
**Files:** `src/screens/ChatScreen.jsx` (lines 360–373)
**Impact:** Tenant A users could see Tenant B's WhatsApp groups.
**Fix approach:** Add `.eq('tenant_id', tenantDbId)` to the query; ensure `whatsapp_groups` table has a `tenant_id` column and appropriate RLS.

### `channel_messages` Insert Sends Hardcoded `sender_name: 'Você'`

**Issue:** When sending an internal channel message, the code inserts `sender_name: 'Você'` instead of the actual authenticated user's name.
**Files:** `src/screens/ChatScreen.jsx` (lines 417–418)
**Impact:** All channel messages appear as "Você" — no attribution, audit trail broken, wrong display for other users viewing the same channel.
**Fix approach:** Pass `currentUser.name` (already loaded in state) as `sender_name`.

---

## HIGH — Data Integrity

### Kanban Tasks Are Stored in Memory Only — Not Persisted

**Issue:** `KanbanScreen` initializes from `TASKS` in `src/data.js` (hardcoded mock data) and all CRUD operations (create, edit, delete, drag-to-move) update only local React state. Nothing is persisted to Supabase.
**Files:** `src/screens/KanbanScreen.jsx` (lines 26, 46, 87, 94–101, 103–105)
**Impact:** All task changes are lost on page refresh. The Kanban is non-functional for real use.
**Fix approach:** Replace local state mutations with `supabase.from('tasks').insert/update/delete` calls. `lib/api.js` already has `moveTask()` and `listTasks()` — wire them in.

### Dashboard's "Nova tarefa" Button Does Nothing

**Issue:** The "Nova tarefa" button in `DashboardScreen` has no `onClick` handler beyond an empty arrow function.
**Files:** `src/screens/DashboardScreen.jsx` (line 100)
**Impact:** Dead UI element — misleads users into believing they can create tasks from the dashboard.
**Fix approach:** Wire to `KanbanScreen`'s task modal or navigate to the tasks route with a pre-opened modal.

---

## MEDIUM — Technical Debt

### Dual Data Layer: `api.js` and `db.js` With Overlapping Functions

**Issue:** Two separate data access files exist — `src/lib/api.js` and `src/lib/db.js` — with overlapping functionality. Both query `tasks`, `conversations`, dashboard KPIs, and inadimplências with slightly different field mappings. `db.js` maps `status` → `col`, `api.js` uses `col` directly.
**Files:** `src/lib/api.js`, `src/lib/db.js`
**Impact:** Confusion about which to use. `DashboardScreen` uses `api.js`; `KanbanScreen` uses neither (mock data); `CRMScreen` uses `db.js`. Risk of divergent data shapes causing runtime errors.
**Fix approach:** Consolidate into a single data layer. Audit which field names match the actual schema. Delete the redundant file.

### Mock Data Used as Primary Application State in Most Screens

**Issue:** `src/data.js` (532 lines) contains hardcoded demo data for `TENANTS`, `CONVERSATIONS`, `TASKS`, `SETTINGS_DATA`, `REPORTS_DATA`, `CRM_DATA`, and `INADIMPLENTES`. Most screens fall back to or primarily use this data instead of Supabase.
**Files:** `src/data.js`, `src/App.jsx` (lines 29–31), `src/screens/KanbanScreen.jsx` (lines 5, 26), `src/screens/CoraScreen.jsx`, `src/screens/CRMScreen.jsx`, `src/screens/ReportsScreen.jsx`
**Impact:** The app shows fictional data to real users. Multi-tenant isolation is cosmetic — switching "tenants" in the UI just changes which section of the mock array is shown.
**Fix approach:** Each screen should load from Supabase on mount with `tenantDbId` as scope. Mock data should be removed from production code or moved to a dev-only fixture module.

### `ChatScreen.jsx` Is 2,415 Lines — Single-File God Component

**Issue:** `src/screens/ChatScreen.jsx` is a 2,415-line monolithic component handling instance management, conversation listing, message display, realtime subscriptions, audio recording, file uploads, emoji picker, internal channels, WhatsApp groups, quick replies, task creation from messages, and mobile/desktop layouts.
**Files:** `src/screens/ChatScreen.jsx`
**Impact:** Extremely difficult to maintain, test, or debug. Every change risks regressions across unrelated features.
**Fix approach:** Extract into sub-components: `ConversationList`, `MessageThread`, `MessageComposer`, `InternalChannelView`, `WAGroupView`. Extract hooks: `useRealtime`, `useAudioRecorder`, `useQuickReplies`.

### Pervasive Silent Error Swallowing in `ChatScreen`

**Issue:** `ChatScreen` contains 14+ `catch { /* ignore */ }` blocks that suppress all errors without user feedback or logging.
**Files:** `src/screens/ChatScreen.jsx` (lines 26, 176, 192, 373, 391, 402, 426, 440, 453, 470, 513, 568, 594, 2068, 2107)
**Impact:** Failures in message sending, contact loading, audio recording, and task creation are completely silent. Users get no error feedback; developers have no error signals.
**Fix approach:** Distinguish truly ignorable failures (e.g., AudioContext on unsupported browsers) from user-facing ones (e.g., message send failure). Show error toasts for the latter.

### `DashboardScreen` Greeting Hardcodes "Wandson"

**Issue:** The dashboard greeting says "Bom dia, Wandson 👋" with no dynamic user name lookup.
**Files:** `src/screens/DashboardScreen.jsx` (line 91)
**Impact:** Every authenticated user sees "Wandson" — broken UX for all other team members.
**Fix approach:** Load `currentUser.name` from `supabase.auth.getUser()` and display it dynamically.

### `reloadTenants` Errors Are Fully Silenced

**Issue:** Both try/catch blocks in `reloadTenants` in `App.jsx` use `catch (_) { /* silencioso */ }` — if tenant loading fails, the app shows fallback mock tenants silently.
**Files:** `src/App.jsx` (lines 56, 70)
**Impact:** Authentication or network failures are invisible to the user, who sees demo data without knowing it's not real.
**Fix approach:** Add a visible error state that renders a message if tenant loading fails after auth.

---

## MEDIUM — Performance

### `fetchConversations()` Fetches All Messages for All Conversations

**Issue:** `fetchConversations()` in `db.js` uses a nested select `messages(id, content, direction, created_at)` with no LIMIT on the nested join, fetching ALL messages for every conversation just to compute the preview.
**Files:** `src/lib/db.js` (lines 134–165)
**Impact:** For tenants with high message volume, this query returns massive payloads. A conversation with 10,000 messages returns all 10,000 rows on every conversation list load.
**Fix approach:** Remove the nested `messages` join from the conversation list query. Load messages separately via `listMessages(conversationId)` only when a conversation is opened.

### Base64 Media Stored Directly in Database Column

**Issue:** The webhook stores media files as `data:${mime};base64,${base64}` strings directly in the `messages.media_url` column in Supabase.
**Files:** `supabase/functions/evolution-webhook/index.ts` (lines 180–181)
**Impact:** Audio/image/video base64 strings can be hundreds of KB to MB each. Storing them in Postgres massively inflates the database, slows queries, and pushes towards storage tier limits rapidly.
**Fix approach:** Upload media to Supabase Storage (using the service role client in the Edge Function), store the public URL in `media_url` instead.

### Realtime Subscription Covers All Messages Across All Tenants

**Issue:** The realtime subscription in `ChatScreen` subscribes to `postgres_changes` on the entire `messages` table with no tenant or conversation filter.
**Files:** `src/screens/ChatScreen.jsx` (lines 251–341)
**Impact:** Every message from every tenant is pushed to every connected client. As user count grows, each client receives irrelevant events and must filter them client-side, wasting bandwidth and CPU.
**Fix approach:** Add a Postgres filter to the subscription scoped to the current user's conversation IDs, or use a tenant-scoped broadcast channel.

---

## MEDIUM — Auth/Permission Gaps

### No Route-Level Role Enforcement

**Issue:** All screens are accessible to any authenticated user regardless of role (`admin`, `consultor`, `operador`). There is no route guard that checks the user's role before rendering.
**Files:** `src/App.jsx` (lines 145–159)
**Impact:** An `operador` can access Settings, manage users, delete workspaces, and view all integrations — actions that should be admin-only.
**Fix approach:** Fetch the user's `role` from `tenant_members` after login and store it in context. Wrap sensitive screens in a role check.

### "Esqueci a senha" Link Is Dead

**Issue:** The "Esqueci a senha" link in `LoginScreen` is `<a href="#">` with no click handler.
**Files:** `src/screens/LoginScreen.jsx` (line 151)
**Impact:** Users cannot recover their accounts via the UI.
**Fix approach:** Wire to `supabase.auth.resetPasswordForEmail(email)`.

### "Falar com consultor" Signup Link Is Dead

**Issue:** The "Ainda não tem conta? Falar com consultor →" link is also `<a href="#">` with no handler.
**Files:** `src/screens/LoginScreen.jsx` (line 202)
**Impact:** No user acquisition path from login screen.
**Fix approach:** Link to a contact form, WhatsApp number, or sales email.

---

## LOW — Dead Code / Stale References

### Two `fetchTasks` Implementations With Divergent Schema Assumptions

**Issue:** `db.js:fetchTasks()` selects `status` and maps it via `COL_MAP`, but `api.js:listTasks()` selects `col` directly. The actual Supabase schema appears to have `col` (based on `api.js`), meaning `db.js:fetchTasks()` may be querying a non-existent column.
**Files:** `src/lib/db.js` (line 78), `src/lib/api.js` (line 112)
**Impact:** `db.js:fetchTasks()` likely returns `null` in production, causing screens to silently fall back to mock data.
**Fix approach:** Audit the actual Supabase schema. Remove the unused implementation.

### Chat Unread Badge Count Reads From Mock Data

**Issue:** The chat unread badge count in `App.jsx` (lines 121–124) reads from `CONVERSATIONS[tenant]` in `data.js`, not from real Supabase data. `ChatScreen` loads real conversations separately and never syncs the count back to `App`.
**Files:** `src/App.jsx` (lines 121–124), `src/data.js`
**Impact:** The chat unread badge always shows mock counts, not real unread messages.
**Fix approach:** Derive unread count from the real Supabase conversation state via a shared context or callback.

### `iFood` Integration Has No Implementation

**Issue:** iFood appears in `SETTINGS_DATA.integrations` with `status: 'pending'` and `detail: 'Aguardando credenciais'`, but there is no code, endpoint, or schema migration for iFood anywhere in the codebase.
**Files:** `src/data.js` (line 237)
**Impact:** Cosmetic placeholder. No groundwork exists for a planned core module.

### `Asaas` Payment Integration Is in Sandbox With No Code

**Issue:** Asaas is listed as `status: 'sandbox'` in integrations (TASK-403 planned), but no Asaas SDK, API calls, or schema exist in the frontend codebase.
**Files:** `src/data.js` (line 238)
**Impact:** CORA's payment collection relies on Asaas — the integration is entirely absent from code.

### No Tests Exist

**Issue:** No test files, no test runner configuration (`jest.config.*`, `vitest.config.*`), no `test` script in `package.json`.
**Files:** `package.json`
**Impact:** Zero regression protection. Any refactor or integration change carries full risk.
**Fix approach:** Add Vitest. Start with unit tests for the data layer functions in `lib/api.js` and `lib/db.js`. Mock the Supabase client.

### Missing Environment Validation at Build Time

**Issue:** No startup-time check verifies that required `VITE_*` env vars are present. If `VITE_EVOLUTION_URL` or `VITE_EVOLUTION_KEY` are missing, Evolution features silently disable (`HAS_EVO = false`) with no warning to developers.
**Files:** `vite.config.js`, `src/screens/ChatScreen.jsx` (lines 7–9)
**Impact:** Misconfigured deployments fail silently — WhatsApp chat UI renders but no real messages can be sent or received.
**Fix approach:** Add a `vite.config.js` environment validation plugin or a startup check that logs clear warnings when expected vars are absent.

---

*Concerns audit: 2026-05-01*
