# Project State — Módulo Análise iFood

**Status:** Planning complete — ready to execute
**Current phase:** None (not started)
**Next action:** /gsd-discuss-phase 1

---

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | Foundation | Not started |
| 2 | Pipeline n8n | Not started |
| 3 | Report & Actions UI | Not started |

---

## Project Reference

**Core value:** Consultor clica em Analisar e recebe diagnóstico completo + tarefas priorizadas sem trabalho manual
**Stack:** Vite + React 18 + Supabase + n8n (VPS) + Evolution API + Claude API
**Developer:** Wandson, 2–4h/day
**Period:** Maio 2026

---

## Current Position

**Phase:** —
**Plan:** —
**Progress:** 0/35 requirements implemented

```
[                              ] 0%
Phase 1 ░░░░░░░░░░
Phase 2 ░░░░░░░░░░░░░░
Phase 3 ░░░░░░░░░░░░
```

---

## Performance Metrics

- Analyses triggered: 0
- Phases completed: 0/3
- Requirements delivered: 0/35

---

## Accumulated Context

### Key Decisions
- n8n orquestra (não Edge Functions) — Drive, Evolution e Anthropic já integrados no n8n
- Tarefas vão para Kanban da plataforma — ClickUp sendo substituído
- Regras YAML fixas no system prompt — Wandson gerencia diretamente no n8n
- Input via link Google Drive — consultores já organizam arquivos no Drive por cliente
- Polling assíncrono (Realtime + fallback 5s) — n8n pode levar 30–60s

### Open Questions (from research)
1. Compartilhamento do Drive — manual por análise ou onboarding self-service?
2. Destino WhatsApp — direto ao dono da loja ou ao consultor primeiro?
3. Limite 15 arquivos por pasta — confirmado como aceitável?
4. Schema Kanban (tasks) — finalizado antes de construir nó de criação de tarefas no n8n?
5. Modelo Claude — `claude-sonnet-4-6` aprovado como substituto do `claude-sonnet-4-20250514` (aposenta 15/jun/2026)?

### Critical Risks (from research)
- Claude retorna JSON inválido → usar tool-use mode + Code node strip
- Triggers duplicados → botão desabilita no primeiro clique + IF guard no n8n
- Spinner infinito se n8n falhar → Error Trigger + pg_cron cleanup
- Drive folder sem acesso → documentar onboarding obrigatório
- Row presa em `processing` → pg_cron define `error` após 5min

### Todos
- [ ] Confirmar questões abertas com Wandson antes de Phase 2
- [ ] Validar schema `tasks` (Kanban) antes de PIPE-09

### Blockers
- Nenhum no momento

---

## Session Continuity

**Last updated:** 2026-05-01 — project initialized, roadmap created
**Last action:** Roadmap written — 3 phases, 35 requirements mapped
**Resume from:** /gsd-discuss-phase 1
