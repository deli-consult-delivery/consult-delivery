---
last_mapped_commit: unknown
---
# Codebase Structure

**Date:** 2026-05-01

## Directory Layout
- `public/`: Static assets.
- `src/`: Main source code directory.
  - `components/`: Reusable UI components (`Sidebar.jsx`, `Topbar.jsx`, etc.).
  - `lib/`: Utility libraries and API clients (`api.js`, `supabase.js`).
  - `screens/`: Top-level page views (`DashboardScreen.jsx`, `ChatScreen.jsx`, etc.).
  - `types/`: Type definitions (`database.ts`, possibly for JSDoc or future TS migration).
- Root configuration files: `package.json`, `vite.config.js`, `jsconfig.json`.

## Key Locations
- **Routing & State:** `src/App.jsx`
- **Global Styles:** `src/index.css`
- **Mock Data:** `src/data.js`
- **Backend Init:** `src/lib/supabase.js`
