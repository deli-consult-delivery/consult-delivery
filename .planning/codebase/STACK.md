# Technology Stack

**Analysis Date:** 2026-05-01

## Languages

**Primary:**
- JavaScript (JSX) — all frontend screens, components, and lib modules under `src/`
- TypeScript — database type definitions at `src/types/database.ts`; Supabase Edge Functions at `supabase/functions/**/*.ts` (Deno runtime)

**Secondary:**
- SQL — migration files under `supabase/migrations/`
- CSS — global stylesheet at `src/index.css`

## Runtime

**Frontend:**
- Browser (standard web platform, no SSR)
- Entry point: `index.html` → `src/main.jsx`

**Edge Functions:**
- Deno (Supabase-managed). Functions import `@supabase/supabase-js@2` via `https://esm.sh/` at runtime.

**Package Manager:**
- npm (inferred from `package.json`; `"type": "module"` set; `node_modules` present)
- Lockfile: present (`node_modules` populated; `package-lock.json` assumed)

## Frameworks

**Core:**
- React `^18.3.1` — UI framework, used with hooks (`useState`, `useEffect`) throughout `src/`
- No router library — routing is managed via a single `route` state variable in `src/App.jsx` with conditional rendering

**Build/Dev:**
- Vite `^5.4.8` — dev server and production bundler (`vite.config.js`)
- `@vitejs/plugin-react` `^4.3.1` — Babel-based JSX transform and Fast Refresh (HMR)

**Testing:**
- No test framework detected — no jest/vitest config, no `*.test.*` or `*.spec.*` files

## Key Dependencies

**Critical:**
- `@supabase/supabase-js` `^2.49.4` — database client, auth, and Realtime subscriptions
  - Browser client initialized at `src/lib/supabase.js`
  - Used in `src/lib/api.js`, `src/lib/db.js`, and directly in `src/App.jsx` for auth

## Configuration

**Environment:**
- Managed via `.env.local` (gitignored); reference template at `.env.example`
- Vite exposes env vars prefixed `VITE_` to the browser bundle via `import.meta.env`
- Edge Functions read secrets via `Deno.env.get(...)` — injected by Supabase platform, not `.env.local`

**Required browser env vars (from `.env.example`):**
- `VITE_SUPABASE_URL` — Supabase project URL
- `VITE_SUPABASE_ANON_KEY` — Supabase publishable anon key
- `VITE_EVOLUTION_URL` — Evolution API base URL
- `VITE_EVOLUTION_KEY` — Evolution API key

**Required Edge Function env vars (Supabase secrets):**
- `SUPABASE_URL` — auto-injected by platform
- `SUPABASE_SERVICE_ROLE_KEY` — auto-injected by platform

**Build:**
- `vite.config.js` — minimal config: `plugins: [react()]`, no custom aliases or output paths

**Fonts:**
- Google Fonts loaded from CDN in `index.html`: Montserrat (400–800 weight), Oswald (700 weight)

## Dev Tooling

- No ESLint config detected (`no .eslintrc*`, `eslint.config.*`)
- No Prettier config detected (no `.prettierrc*`, `biome.json`)
- No TypeScript `tsconfig.json` in project root — TypeScript used only for `src/types/database.ts`; JSX files use JSDoc-style type hints without strict compilation
- Supabase CLI used for Edge Function deployment: `supabase functions deploy <name>`

## Platform Requirements

**Development:**
- Node.js (no `.nvmrc`; project works with current LTS; VPS runs Node 22.22.2)
- `npm install` then `npm run dev` to start Vite dev server (default port 5173)

**Production:**
- Vercel — static SPA deploy via `npm run build` (output to `dist/`)
- No `vercel.json` config file found; default Vite SPA deployment assumed
- Supabase Edge Functions hosted and executed on Supabase infrastructure
- VPS `193.202.85.82` hosts Evolution API, n8n, Infisical, OpenClaw (AI agents) — external to this repo

---

*Stack analysis: 2026-05-01*
