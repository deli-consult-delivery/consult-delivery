---
created: 2026-05-04T00:00:00-03:00
title: Etapa 10 — ClickUp Light (Sidebar + TasksScreen MultiView)
area: ui
files:
  - src/components/Sidebar.jsx
  - src/screens/KanbanScreen.jsx
  - src/components/TopbarFilter.jsx (novo)
  - src/components/tasks/MultiViewSwitch.jsx (novo)
  - src/components/tasks/TaskList.jsx (novo)
  - src/components/tasks/TaskCalendar.jsx (novo)
  - src/screens/TasksScreen.jsx (novo — substitui KanbanScreen)
---

## Problem

KanbanScreen atual só tem Board view (3 colunas). Sidebar é plana, sem hierarquia por cliente.
ClickUp é referência de UX: multi-views, sidebar hierárquica, filtros inline.

## Solution

1. Sidebar hierárquica: agrupamento por cliente/loja, colapsável, estilo ClickUp
2. TasksScreen (substitui KanbanScreen) com MultiViewSwitch: Lista | Board | Calendário
3. TopbarFilter: cliente, responsável, prioridade, prazo
4. TaskList: view tabular com sorting
5. TaskCalendar: view calendário simplificada (semanas)
6. TaskBoard: refatorar Kanban atual para componente reutilizável
7. Identidade visual preservada (vermelho, dark mode)
