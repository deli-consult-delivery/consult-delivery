---
last_mapped_commit: unknown
---
# Coding Conventions

**Date:** 2026-05-01

## Code Style
- **Language:** JavaScript (ES2022+ features) with JSX.
- **Components:** Functional components with React Hooks.
- **File Naming:** PascalCase for React components (`App.jsx`, `LoginScreen.jsx`), camelCase or lowercase for utilities (`api.js`, `data.js`).
- **Extensions:** `.jsx` is explicitly used for files containing JSX markup, differentiating them from plain `.js` logic files.

## Patterns
- **Prop Drilling:** Configuration and state like `tenant` and `route` are passed down explicitly from `App.jsx`.
- **CSS Styling:** Class names are used alongside CSS custom properties (variables) defined in `index.css` for theming (e.g., `--red` variable modified dynamically in `App.jsx`).
- **Placeholders:** Incomplete features are currently mapped using a `Placeholder.jsx` component to maintain layout continuity.
