---
created: 2026-05-04T00:00:00-03:00
title: Reestruturação estratégica v2 — Plataforma Consult Delivery
area: general
files:
  - docs/RESTRUCTURING_REVISED.md
  - CLAUDE.md
  - src/screens/CoraScreen.jsx
  - src/screens/ReportsScreen.jsx
  - src/screens/KanbanScreen.jsx
  - src/components/Sidebar.jsx
  - supabase/migrations/
  - .openclaw/bridge-server/index.js
  - supabase/functions/evolution-webhook/index.ts
---

## Problem

O projeto cresceu além do plano inicial. CLAUDE.md ainda menciona Lovable e Vercel (descontinuados).
Faltam 4 fundações críticas antes de novas features:
1. RBAC — colaboradores sem restrições de acesso dentro do tenant
2. Memória central — fatos de clientes fragmentados em `memory/*.md` por agente na VPS
3. Modelo WhatsApp — grupo/PV/remetente sem distinção, DELI sem infra para monitorar
4. Drafts e DELI — COO digital planejada mas sem triggers, aprovação ou auditoria técnica

Além disso: CoraScreen e ReportsScreen usam mock data; KanbanScreen sem multi-view.

## Solution

Implementar 16 etapas atômicas conforme `docs/RESTRUCTURING_REVISED.md`:
1. Atualizar CLAUDE.md (stack real, equipe correta, sem Lovable/Vercel)
2-5. 4 migrations Supabase: RBAC, Memória Central, WhatsApp, Drafts+DELI
6. Seed de papéis (admin/dev/marketing/atendimento/financeiro/deli_owner)
7. Componentes React RequireRole + RequireAgent + usePermissions
8. Middleware RBAC no Bridge Server
9. CoraScreen e ReportsScreen sem mock
10. ClickUp Light: Sidebar hierárquica + TasksScreen com MultiViewSwitch (Lista/Board/Calendário)
11. Tela DraftsPendentesScreen
12. Agente DELI no OpenClaw
13. DELI escutando Realtime do Supabase
14. Webhook Evolution evoluído (grupo/PV/menção)
15. AgentsPage como painel de controle real
16. Atualizar diagramas Mermaid em docs/fluxos/
