---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
current_phase: None (not started)
status: planning
last_updated: "2026-05-08T03:46:15.319Z"
progress:
  total_phases: 3
  completed_phases: 0
  total_plans: 3
  completed_plans: 0
  percent: 0
---

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

**Last updated:** 2026-07-06 — sessão worker W1 (sprint homologação iFood, fora do escopo deste roadmap antigo): PR #757 aberto — migrations 20260706_001/002 (tenants cd-homolog/cd-demo + allowlist tenant_modules) + fixes ConsoleV2 (radar na Visão Geral, chat-legado removido, label Avaliações iFood). Aguarda revisão/aplicação pela orquestradora.
**Last action:** PR #757 criado (branch wandson/homolog-demo-tenants) — NÃO mergeado, migrations NÃO aplicadas por este worker
**Resume from:** orquestradora revisa PR #757

---

## Sessões avulsas (fora do roadmap GSD)

- **2026-07-06 (worker W3, sprint homologação iFood):** Missão P0 segurança do PainelAvaliacoesConsultor. Constatado que credenciais hardcoded, lista fixa de 14 lojas e envio WA direto **já estavam corrigidos em main** (#716/#745). Brecha restante fechada: `listEvoGroups` deixou de chamar Evolution API direto do front (VITE_EVOLUTION_KEY no bundle) e passou a usar `GET /whatsapp/groups` do Bridge, por tenant → **PR #756 MERGEADO**. Débito registrado no PR (segue como missão irmã): `src/lib/evolution.js`, `ChatScreen.jsx` e `ensureWebhookConfig` ainda usam VITE_EVOLUTION_KEY no front.
- **2026-07-06 (worker W3, follow-up CONCLUÍDO):** Migrados os 3 usos restantes de VITE_EVOLUTION_URL/KEY (`src/lib/evolution.js`, `src/lib/api.js`, `src/screens/ChatScreen.jsx`) + achado extra: `ChatV2.jsx`/`ChatScreen.jsx`/`ChatAoVivoV2.jsx` selecionavam `evolution_url, api_key` de `evolution_instances` direto no client (mesma classe de exposição, key real de produção em vez de placeholder). Solução: novo router `bridge-server/routes/evolution-actions.js` (14 endpoints, `requireJwt` + `assertTenantMember`, resolve credenciais por `instance_name` — identificador já público no front, nunca a key) + `bridge-server/lib/evolution-instance.js`. `ensureWebhookConfig` (api.js) e 8 funções mortas de `evolution.js` deletadas (zero callers). Screen legado não roteado `src/screens/GruposScreen.jsx` deletado. Revisão multi-agente (fix_first) fechou: CORS sem PUT, limite de body 2mb quebrando mídia, IDOR cross-tenant (assertTenantMember) e migration aditiva `20260706_008` (REVOKE/GRANT coluna api_key/evolution_url, não aplicada). Branch `wandson/evolution-front-bridge` → **PR #761 aberto, não mergeado**.
