# Wiki Log

## [2026-05-14 23:59] session | Fases 6-7 + milestone v1 completo — CORA, BRENO, sidebar final
Touched: none

## [2026-05-14 22:00] session | Fase 6 — CORA · Cobrança Inteligente com dados reais
Touched: none

## [2026-05-14 20:00] session | Fase 5 — NOVA · Automação IA implementado
Touched: none

## [2026-05-14 18:00] session | Fase 4 — MAX · Suporte a Sistemas implementado
Touched: none

## [2026-05-14 14:00] session | módulo Leads no CRM + importação Datacrazy
Touched: none

## [2026-05-14 12:00] session | Fase 3 — LARA migração Trigger.dev + LaraScreen redesign
Touched: none

## [2026-05-14 00:00] session | Fase 2 — DELI chat + analise-ifood Trigger.dev
Touched: none

## [2026-05-13 03:00] session | departamentos — tela de gerenciamento
Touched: none

## [2026-05-13 02:30] session | bots — resposta automática fora do horário
Touched: none

## [2026-05-13 01:30] session | copiloto DELI + bulk finalizar + fix chat ao vivo
Touched: none

## [2026-05-11 00:00] session | fix pré-visualização mensagem citada WhatsApp
Touched: none

## [2026-05-11 00:00] session | histórico de ações no chat ao vivo
Touched: none

## [2026-05-09 00:00] session | merge PR #9 chat-status-system para main
Touched: none

## [2026-05-08 21:00] session | fix msgs invisíveis no chat ao vivo
Touched: none

## [2026-05-08 session | fix outbound fromMe chat ao vivo + composer mídia
Touched: none

## [2026-05-07 18:30] session | fix CSS classes ausentes CRMScreen handoff
Touched: none

## [2026-05-07] session | port CSS handoff para src/index.css
Touched: none

## [2026-05-07] session | port ChatScreen handoff design com dados reais
Touched: none

## [2026-05-07 06:35] session | LARA sub-agentes via openclaw async — E2E completo
Touched: LARA — Agente Régua

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

## [2026-05-05] session | fix: verify_jwt + VITE_EVOLUTION_URL — fluxo WhatsApp completo
Touched: none

- Bug 1: Edge Functions rejeitavam Evolution API com 401 — verify_jwt=true bloqueava webhooks (0 invocations). Fix: supabase/config.toml com verify_jwt=false nas 3 funções públicas.
- Bug 2: Envio falhava com 404 — VITE_EVOLUTION_URL apontava para evo-go (host errado). Fix: banco atualizado com api_key correta, instância teste removida, secrets GitHub + .env.local alinhados com Evo1.
- Resultado: fluxo bidirecional WhatsApp funcionando em produção (recebe e envia).

## [2026-05-05 00:00] session | Sprint 1 Chat Ao Vivo — migrations + 9 componentes frontend

Touched: none

- Backup DB pré-sprint criado em C:\Users\Consult Delivery\backups-consult\ (não comitado)
- Sprint spec: docs/SPRINT_CHAT_AO_VIVO.md
- Branch chat-ao-vivo/rename (consult-delivery): Sidebar + Topbar + CLAUDE.md renomeados
- Branch chat-ao-vivo/migrations (consult-migrations): 4 migrations (001-004) — status_v2 ENUM, conversation_events, customer_notes, customer_addresses
- Branch chat-ao-vivo/frontend (consult-frontend): 9 componentes em src/components/chat/ — ChatLayout, ConversationStatusBadge, TimelineEvent, LeadPanel, LeadPanelHeader, LeadProfileSection, LeadNotesSection (debounce 1s), LeadAddressSection (ViaCEP), ReopenButton
- Build: ✓ sem erros
- Todos os branches pushados para origin

## [2026-05-05 ] session | Bug fixes chat ao vivo — grupos e fotos de perfil
Touched: none

## [2026-05-05 14:30] session | Bug fixes chat ao vivo — grupos e fotos de perfil
Touched: none

## [2026-05-05 15:00] session | Bugs chat ao vivo — fotos grupo, dedup msgs, celular físico
Touched: none

## [2026-05-06 18:15] session | deploy LARA no OpenClaw + wiki procedimento
Touched: Deploy de Agentes OpenClaw, LARA — Agente Régua, index

## [2026-05-07 03:30] session | LARA integracao EvoNexus tickets API
Touched: none

## [2026-05-07 19:01] session | port kanban + cora screens to vite esm
Touched: none
## [2026-05-08 00:00] session | fix som notificação chat não tocava
Touched: none
## [2026-05-09 12:45] session | Ollama Cloud + Kimi K2.6 no OpenClaw
Touched: none
## [2026-05-13 00:23] session | Fase 0 Fundação Técnica completa
Touched: none (infra session — Trigger.dev, Bridge Server, 7 migrations, PR #11 aberto)
