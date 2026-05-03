---
last_mapped_commit: unknown
---
# Coding Conventions

**Analysis Date:** 2026-05-01

## Language & Type System

**Language:** JavaScript (JSX) — not TypeScript for React components.
- All screen and component files use `.jsx` extension: `src/screens/ChatScreen.jsx`, `src/components/Sidebar.jsx`
- The single TypeScript file is `src/types/database.ts` — the auto-generated Supabase schema type file only
- `jsconfig.json` used instead of `tsconfig.json`; `checkJs: true` but `strict: false` — no strict null checks enforced
- JSDoc `@typedef` comments pull TypeScript types into JS files in `src/lib/api.js`:

```js
/** @typedef {import('../types/database').Database} Database */
/** @typedef {Database['public']['Tables']['tenants']['Row']} Tenant */
```

## Naming Conventions

**Files:**
- Screen components: `PascalCase` with `Screen` or `Page` suffix — `ChatScreen.jsx`, `AgentsPage.jsx`, `KanbanScreen.jsx`
- Shared UI components: `PascalCase` — `Sidebar.jsx`, `Topbar.jsx`, `AgentAvatar.jsx`, `UserAvatar.jsx`, `Icon.jsx`
- Utility/lib modules: `camelCase` — `supabase.js`, `api.js`, `evolution.js`, `db.js`
- Data constants file: `data.js`
- Type definitions: `database.ts`

**Functions and variables:**
- Functions: `camelCase` — `listTenants()`, `reloadTenants()`, `fetchDashboardKpis()`
- React components: `PascalCase` default exports — `export default function ChatScreen(...)`
- Module-level constants: `SCREAMING_SNAKE_CASE` — `COLS`, `PRIORITY`, `NAV_ITEMS`, `TWEAK_DEFAULTS`, `ROLE_MAP`
- Local state variables: `camelCase` — `[instances, setInstances]`, `[selectedInstance, setSelectedInstance]`

**Exports:**
- React components: `export default function ComponentName` (single default export per file)
- Utility functions: named exports — `export async function listTenants()`
- Custom hooks: named exports — `export function useTweaks(defaults)`
- Data constants: named exports — `export const TENANTS`, `export const AGENTS`

## Component Patterns

**Structure — all functional, no class components.**

Props destructured in function signature:
```jsx
export default function Sidebar({ route, setRoute, counts, isOpen }) { ... }
```

No prop-types validation — props undocumented except via JSDoc in lib files.

**State declaration order (observed):**
1. `useState` declarations
2. `useRef` declarations
3. `useEffect` blocks
4. Derived/computed values (`useMemo`)
5. Event handlers
6. Return/JSX

**Data-fetching component pattern (mock-first with real data overlay):**
```jsx
// Seen in DashboardScreen, ChatScreen, CoraScreen, CRMScreen
export default function DashboardScreen({ tenant, tenantDbId }) {
  const [kpis, setKpis] = useState(TENANT_DATA[tenant]?.kpis ?? null); // mock fallback

  useEffect(() => {
    if (!tenantDbId) return;    // guard: skip if no DB ID yet
    let alive = true;
    getKPIs(tenantDbId)
      .then(r => { if (alive && r) setKpis(mapKPIs(r)); })
      .catch(() => {});         // errors silently swallowed
    return () => { alive = false; }; // prevents setState after unmount
  }, [tenantDbId]);
```

**Custom hook pattern:**
- `useTweaks(defaults)` in `src/components/TweaksPanel.jsx`
- Returns `[values, setTweak]` where `setTweak` accepts `(key, value)` or `(partialObject)`

## Import Style

**Order (consistently observed):**
1. React hooks — `import { useState, useEffect, useMemo, useRef } from 'react'`
2. Local components — `import Icon from '../components/Icon.jsx'`
3. Lib/utilities — `import { supabase } from '../lib/supabase.js'`
4. Data — `import { AGENTS, TASKS } from '../data.js'`

**Path rules:**
- Always relative paths — `'../components/Icon.jsx'`, `'./supabase'`
- Always explicit `.jsx` or `.js` extensions on local imports
- `@/*` alias is configured in `jsconfig.json` (`"paths": { "@/*": ["src/*"] }`) but **not used anywhere** — all imports use relative paths

**No barrel files** — each component/module imported directly by file path.

## Code Style (No .eslintrc or .prettierrc present)

Inferred from source inspection:

| Rule | Value |
|------|-------|
| Quotes | Single quotes in JS; double quotes in JSX attributes |
| Semicolons | Yes, present throughout |
| Indentation | 2 spaces |
| Trailing commas | Yes, in objects and arrays |
| Arrow functions | Used for event handlers and callbacks |
| Template literals | Used for dynamic class names |

Example:
```jsx
className={`side-item ${route === item.id ? 'active' : ''}`}
onChange={e => setEmail(e.target.value)}
onClick={() => setSidebarOpen(v => !v)}
```

## Styling

**Approach:** Global CSS custom properties in `src/index.css`. No CSS modules, no Tailwind, no styled-components.

**CSS variables used throughout:**
- Colors: `var(--red)`, `var(--success)`, `var(--warn)`, `var(--info)`, `var(--white)`, `var(--black)`
- Grays: `var(--g-50)` through `var(--g-700)`
- Tokens: `var(--r-sm)` (border-radius), `var(--ease-out)`

**Utility class names (used as `className`):**
`card`, `btn-primary`, `btn-secondary`, `btn-icon`, `badge-red`, `badge-green`, `badge-blue`, `badge-yellow`, `badge-gray`, `kpi`, `kpi-label`, `page-h1`, `page-sub`, `input`, `label`

**Inline styles:** Used heavily for layout, positioning, and one-off styling:
```jsx
<div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
```

**Theme:** Applied via `data-theme` attribute on `document.documentElement`. Primary color (`--red`) overridden dynamically via `document.documentElement.style.setProperty('--red', tweaks.primaryColor)`.

## Error Handling Patterns

**Two divergent patterns in the two API layers:**

`src/lib/api.js` — throw on error:
```js
const { data, error } = await supabase.from('tenants').select('*').order('name');
if (error) throw error;
return data ?? [];
```

`src/lib/db.js` — return null on error:
```js
const { data, error } = await supabase.from('v_dashboard_kpis').select('*').single();
if (error || !data) return null;
```

**Component-level:** Errors silently swallowed with empty `.catch(() => {})` — no user-visible error state for data loading in most screens.

**Auth errors:** User-facing via local `error` state in `src/screens/LoginScreen.jsx`.

**App-level fallback:** Double try/catch in `src/App.jsx` `reloadTenants()` with comment `/* silencioso */`.

**console.log for debug:** Present in `src/lib/evolution.js` (line 195) and `src/screens/ChatScreen.jsx` (lines 118, 669).

## Async Patterns

**All async operations use `async/await`.** No raw `.then().then()` chains.

**Effect + cleanup pattern (standard across screens):**
```js
useEffect(() => {
  if (!tenantDbId) return;
  let alive = true;
  apiCall(tenantDbId).then(r => { if (alive) setData(r); }).catch(() => {});
  return () => { alive = false; };
}, [tenantDbId]);
```

**Supabase Realtime subscription pattern (ChatScreen):**
```js
const channel = supabase.channel('room-id')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, handler)
  .subscribe();
return () => supabase.removeChannel(channel);
```

## Supabase Query Patterns

**Shared client:** `src/lib/supabase.js` — `export const supabase = createClient(url, key)`

**`.maybeSingle()` preferred over `.single()`** for queries that may return zero rows.

**Join pattern (related table as alias):**
```js
supabase.from('conversations')
  .select(`
    id, type, title,
    customer:customers(id, name, avatar, is_vip, tags),
    agent:agents(id, name, letter, color)
  `)
  .eq('tenant_id', tenantId)
  .eq('status', 'open')
  .order('last_message_at', { ascending: false, nullsFirst: false })
```

**Auth queries:**
```js
supabase.auth.signInWithPassword({ email, password })
supabase.auth.getSession()
supabase.auth.onAuthStateChange((_event, session) => { ... })
supabase.auth.getUser()
supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } })
```

## Comments

**Language:** Brazilian Portuguese for all in-code comments and domain-specific identifiers.

**Section separators** used inside large files to visually divide logical blocks:
```js
// ── Gravação de áudio ──────────────────────────────────
// ── Canais Internos state ───────────────────────────────
// ─── Helpers ───────────────────────────────────────────
```

**Task references in lib files:** Link code directly to roadmap items:
```js
// TASK-205 — Enviar mensagem WhatsApp pela plataforma
```

---

*Convention analysis: 2026-05-01*
