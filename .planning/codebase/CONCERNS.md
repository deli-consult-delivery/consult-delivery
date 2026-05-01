---
last_mapped_commit: unknown
---
# Codebase Concerns

**Date:** 2026-05-01

## Technical Debt
- **Missing Tests:** There is a complete lack of automated testing frameworks and coverage, making refactoring risky.
- **Hardcoded State:** Routing is handled via manual state strings in `App.jsx` rather than a scalable router library.
- **Mock Data Reliance:** The application heavily relies on `src/data.js` for "simulations" and state, which will need to be swapped out for real API calls (via `src/lib/api.js` and Supabase).

## Known Issues / Incomplete Features
- Several routes (CRM, Reports, Settings) are wired to a `Placeholder.jsx` dummy screen.
- State management may become unwieldy in `App.jsx` as the application grows, since it currently manages route, tenant, and global tweaking state.

## Security
- Ensure `src/lib/supabase.js` does not commit sensitive keys directly. Currently `package.json` and `.env` references suggest environment variables are intended to be used, but must be verified.
