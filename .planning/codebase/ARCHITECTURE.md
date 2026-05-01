---
last_mapped_commit: unknown
---
# Architecture

**Date:** 2026-05-01

## Overview
This is a Single Page Application (SPA) built with React and Vite. It serves as a dashboard/admin panel interface with various modules like Chat, Kanban, and Cora.

## Data Flow
- State management is primarily handled via React's `useState` and `useEffect` at the top level in `src/App.jsx` (e.g., `loggedIn`, `route`, `tenant`).
- Top-level state is passed down to screens and components via props.
- There is no external state management library (like Redux or Zustand) currently in use.

## Pattern & Layers
- **Routing:** Simple conditional rendering based on state (`route` variable in `App.jsx`). No dedicated router library (like React Router) is present.
- **Screens:** High-level views (`src/screens/*.jsx`) that compose smaller components and render specific modules based on the active route.
- **Components:** Reusable UI elements (`src/components/*.jsx`) such as `Sidebar`, `Topbar`, and `TweaksPanel`.
- **Data/Logic:** Abstracted in `src/lib/api.js` and `src/data.js` for mock scenarios.

## Entry Points
- `index.html`: Main HTML template.
- `src/main.jsx`: React root mounting script.
- `src/App.jsx`: Main application shell managing global state and navigation.
