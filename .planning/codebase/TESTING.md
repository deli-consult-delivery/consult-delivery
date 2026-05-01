---
last_mapped_commit: unknown
---
# Testing Patterns

**Date:** 2026-05-01

## Framework
- **No Testing Framework Detected:** The current `package.json` does not list any testing libraries (such as Jest, Vitest, React Testing Library, or Cypress).
- **Scripts:** There is no `"test"` script defined in the `package.json`.

## Current Strategy
- The application currently relies on manual testing and a built-in visual tweaking panel (`TweaksPanel.jsx`) for layout and branding adjustments.
- Mock data (`src/data.js`) is used extensively, which facilitates manual visual testing without requiring backend synchronization.
