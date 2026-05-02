---
last_mapped_commit: unknown
---
# Testing Patterns

**Analysis Date:** 2026-05-01

## Test Framework

**Runner:** None — no testing framework is installed or configured.

**Confirmed absent:**
- No `vitest`, `jest`, `@testing-library/react`, `cypress`, or `playwright` in `package.json`
- No `vitest.config.*`, `jest.config.*`, or `playwright.config.*` files in the project root
- No `"test"` script in `package.json` scripts section

**`package.json` scripts (complete list):**
```json
{
  "dev":     "vite",
  "build":   "vite build",
  "preview": "vite preview"
}
```

## Test File Coverage

**Test files found:** Zero (0).

No `*.test.jsx`, `*.test.js`, `*.spec.jsx`, or `*.spec.js` files exist anywhere under `src/`.

## Current Verification Strategy

The project relies entirely on manual testing and visual inspection:

1. **Mock data layer (`src/data.js`):** Comprehensive mock data for all tenants (`TENANTS`, `AGENTS`, `CONVERSATIONS`, `TASKS`, `INADIMPLENTES`, `TENANT_DATA`) allows screens to render and be reviewed visually without any backend connection.

2. **Mock-first pattern in all screens:** Every screen initializes state from `src/data.js` mock data and overlays real Supabase data when `tenantDbId` is available. This means the UI is always visible and testable manually even with no database.

3. **`TweaksPanel` component (`src/components/TweaksPanel.jsx`):** A built-in live-editing panel for adjusting primary color, layout density, and feature flags without code changes. Supports Lovable iframe integration via `postMessage`.

4. **`Placeholder.jsx` (`src/screens/Placeholder.jsx`):** Used for incomplete module screens to maintain layout continuity during development.

## CI/CD Test Integration

**No CI/CD pipeline detected.** No `.github/workflows/`, no `Jenkinsfile`, no other pipeline config present in the repository.

## Test Health Assessment

**Status: No automated tests exist. Risk level: High.**

Key untested areas by file:

| File | Risk | Notes |
|------|------|-------|
| `src/lib/api.js` | High | All Supabase queries — no unit or integration tests |
| `src/lib/db.js` | High | Duplicate data layer with inconsistent error handling — untested |
| `src/lib/evolution.js` | High | WhatsApp integration, audio recording, media send — untested |
| `src/App.jsx` `reloadTenants()` | High | Multi-tenant fallback logic — silent errors, untested |
| `src/screens/ChatScreen.jsx` | High | 2,415 lines, Realtime subscriptions, audio recording — untested |
| `src/screens/KanbanScreen.jsx` | Medium | Drag-and-drop, filter logic — untested |
| `src/screens/SettingsScreen.jsx` | Medium | Workspace CRUD, WhatsApp webhook config — untested |
| `src/screens/LoginScreen.jsx` | Medium | Auth flow — untested |

## Recommendations for Adding Tests

**Recommended setup (when ready to add tests):**

```bash
npm install -D vitest @testing-library/react @testing-library/jest-dom jsdom
```

**Suggested `vitest.config.js`:**
```js
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  test: { environment: 'jsdom', setupFiles: './src/test-setup.js' },
});
```

**Where to place test files:**
- Co-located with source: `src/lib/api.test.js`, `src/screens/LoginScreen.test.jsx`
- Or in a separate dir: `src/__tests__/`

**Highest-priority tests to write first:**
1. `src/lib/api.js` — mock Supabase client, test each exported function
2. `src/screens/LoginScreen.jsx` — form submit, error display, Google OAuth button
3. `reloadTenants()` in `src/App.jsx` — fallback chain logic

---

*Testing analysis: 2026-05-01*
