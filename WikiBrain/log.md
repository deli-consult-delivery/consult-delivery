# Wiki Log

Chronological, append-only record of everything that's happened in this wiki.

**Format:**
```
## [YYYY-MM-DD HH:MM] <type> | <title>
<optional detail line>
```

## [2026-05-04 23:59] session | Fase 1F concluída — WhatsApp bidirecional em produção
Touched: none

### Resumo do dia 04/05/2026 — Fases concluídas

**Fase 1F — WhatsApp evoluído (CONCLUÍDA ✓)**
- Evolution API v2: diagnosticada arquitetura dual webhook (global UI vs instance API)
- Webhook corrigido manualmente no painel: URL Supabase, enabled=true, MESSAGES_UPSERT
- Migration 007: ADD COLUMN tenant_id em evolution_instances + backfill + RLS
- Edge function v12: upsertConversation agora grava tenant_id em INSERT e UPDATE
- Backfill: 6 conversas com tenant_id=null → preenchidas com tenant correto
- webhookGuard.js: job horário no Bridge Server validando/corrigindo webhook automaticamente
- ensureWebhookConfig em api.js: self-healing client-side
- SettingsScreen: badges de status de webhook por instância
- Chat Unificado: mensagens aparecem + envio pela plataforma chegou no WhatsApp ✓

**Fase 1D — ClickUp Light (CONCLUÍDA anteriormente)**
- Sidebar hierárquica + TasksScreen MultiView (Lista/Board/Calendário)

**Fase 1E — DELI + Realtime (PARCIALMENTE CONCLUÍDA)**
- Bridge Server: startRealtime() + DELI avaliando triggers
- Agente DELI não foi subido no OpenClaw ainda

### Lições aprendidas

1. Evolution API v2 tem duas camadas de webhook independentes: global (UI/server .env) e instância (REST API). GET /webhook/find retorna apenas a instância, não o global. Nunca confiar num sem mostrar output bruto.
2. Sempre mostrar output bruto de chamadas externas críticas — nunca resumir sem mostrar o JSON.
3. RLS com tenant_id=null bloqueia silenciosamente: NULL IN (subquery) é sempre false. Debugging RLS: checar pg_policies + verificar se os dados têm tenant_id antes de testar queries do browser.
4. supabase/.temp/ deve ser ignorado mas pode ser rastreado se foi commitado antes do .gitignore. Fix: git rm --cached.

### Pendências abertas (Milestone v1)

- **Fase 1E**: Subir agente DELI no OpenClaw da VPS
- **Fase 1G**: AgentsPage como painel de controle real + notificações
- Todo pendente: 2026-05-04-reestruturacao-estrategica-v2.md (pendente review)
- Todo pendente: 2026-05-04-etapa-10-clickup-light.md

## [2026-05-04 22:30] session | webhook self-healing + Evolution v2 architecture
Touched: wiki/evolution-api-webhooks.md, wiki/index.md

## [2026-05-04 22:00] session | schema-alignment migrations e frontend
Touched: none

## [2026-05-04 15:00] session | Etapas 11 e 15 — Drafts UI e AgentsPage real
Touched: none

## [2026-05-04 20:00] session | Etapa 10 ClickUp Light — Sidebar hierárquica + TasksScreen MultiView
Touched: none (código entregue via git — 2 commits: feat(ui) sidebar + feat(ui) TasksScreen)

## [2026-05-04 18:00] session | Reestruturação estratégica v2 — migrations + RBAC + componentes
Touched: none (decisões técnicas — schema já está no git e CLAUDE.md)

## [2026-05-03 23:05] session | Sprint 2 análise iFood — treinamento + kanban real
Touched: none

**Types:** `session`, `ingest`, `query`, `lint`, `rebuild`

**Quick access:** `grep "^## \[" log.md | tail -5` gives you the last 5 entries.

---

## [2026-05-03 00:00] ingest | Salgados da Mônica — análise iFood
Touched: wiki/salgados-da-monica-analise.md, wiki/metodologia-analise-ifood.md, wiki/campanha-inteligente-ifood.md, wiki/estrategias-dias-fracos-ifood.md, wiki/metricas-ifood.md

## [2026-05-03 13:33] session | graphify pipeline — full project knowledge graph
Touched: none
