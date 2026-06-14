# Wiki Log

## [2026-05-24] session | G01 DELI Core — 5/5 sub-goals shipados
- G01.2: migration agent_prompts (RLS via tenant_members, profiles sem tenant_id), seed 3 prompts globais. Smoke: COUNT=3 ✓
- G01.1: src/agents/shared/runtime.ts — executeAgent/getPrompt/logRun. tsc --noEmit EXIT:0 ✓
- G01.3: trigger/deli/briefing-7h.ts — schedule 10h UTC, agent_runs 24h + contratos, Bridge send-whatsapp
- G01.4: trigger/deli/chat-handler.ts — filtra @deli, draft em agent_drafts (nunca envia direto)
- G01.5: trigger/deli/orchestrator-5min.ts — semáforo Verde/Amarelo/Vermelho, Bridge notify
- PR #62 mergeado em main (ad6319b)
- Nota: UNIQUE com COALESCE não funciona em CREATE TABLE inline → usa CREATE UNIQUE INDEX separado
- Nota: worktree sem node_modules → junction para main repo (mklink /J)

## [2026-05-25] session | Sprint 1 AI First bootstrap — PRDs + 5 goals paralelos
- PRD-MASTER.md (90d): diagnóstico real (49 clientes, R$20k MRR, churn 33%), metas S1/S2/S3, arquitetura runtime único, 5 schemas SQL
- PRD-SPRINT-1.md (30d): 5 métricas D30 com critérios de aceite SQL, dependências G01→G02, anti-padrões travados
- G01.md: DELI Core — runtime.ts + agent_prompts + briefing-7h + chat-handler + orchestrator-5min
- G02.md: BRENO — webhook reusa runtime + task-extractor 30min + renewal-monitor 8h
- G03.md: Contratos digitais — migration + UI + bridge + assinatura digital + Asaas
- G04.md: Onboarding — migration + UI D1/D7/D30/D60/D90 + task automação
- G05.md: Re-contratação 49 — script lista + UI bulk WhatsApp + tracker aceite
- SETUP-WORKTREES.md: 5 worktrees, regras de colisão, prefixos migration, fluxo PR
- PR #61 mergeado em main (squash)
- Touched: docs/deli-memory/sprint-01/ (7 arquivos criados)

## [2026-05-25] session | P0 fix: TD#36 + TD#40 — BRENO + schedulers
- TD#40: `trigger/breno/processar-webhook.ts:113` `.eq("agent_slug","breno")` → `.eq("agent_id","breno")` — silent fail em toda leitura de config corrigido
- TD#36: `trigger/bom-dia/envio-agendado.ts` e `trigger/encerramento/envio-agendado.ts` AbortSignal.timeout 30s → 120s
- PR #60 mergeado, Trigger.dev redeploy + VPS pull confirmado
- T3 smoke: agent_run `breno/success` criado em prod (run_id: `run_cmpkj08th313y0uop2r0nakn9`)
- T4 evidência: pre-fix AbortErrors em agent_runs (2026-05-22/23), fix deployado, VPS limpo pós-deploy
- TD#36, TD#40, TD#47(parcial) fechados em td-index.md

## [2026-05-24 HH:MM] session | F2 reabrir tarefa shipada onda-07
Touched: none

## [2026-05-23 23:00] session | piloto-06 TD#31 smoke E2E + PR #57 mergeado
Touched: none

## [2026-05-23] session | Uraka invisível — Supabase 1000-row limit fix
Touched: none

## [2026-05-24] session | is_active soft-delete + TD#24 fechado
Touched: none

## [2026-05-23 23:30] session | E2E Uraka jornada completa + Onda 07 planning
Touched: docs/piloto/PILOTO-07-PLANNING.md
- Onda 04+05+06 validadas em prod via UI real
- 12/12 tarefas, G5+G6, TD#31 1-clique OK
- 3 bugs UI fixados durante teste real (TD#33, TD#34, TD#24)
- Onda 07 (F1-F4) planejada ~6d total

## [2026-05-24 00:00] session | fix NovaLojaModal wrapper Bridge + cleanup Uraka
Touched: none

## [2026-05-23 00:00] session | piloto-05 Bloco B T5-T6 concluídos
Touched: none

## [2026-05-22 14:00] session | piloto-04 Tarefas 3+4 validadas e entregues
Touched: none

## [2026-05-23 03:30] session | piloto-04 T10 Parte1 smoke E2E completo + migration 010
Touched: none

## [2026-05-22 22:00] session | piloto-04 T8+T9 implementados + deploy completo
Touched: none

## [2026-05-22 12:00] session | smoke test analise-gerar-relatorio concluido
Touched: none

## [2026-05-22 00:00] session | task analise-gerar-relatorio criada
Touched: none

## [2026-05-17 17:00] session | feedback comment panel + agent context enrichment
Touched: none

## [2026-05-17 16:00] session | SSH VPS + deploy bridge-server GET /whatsapp/groups
Touched: none

## [2026-05-17 00:00] session | bom-dia: nomes de grupos, scroll e logo
Touched: none

## [2026-05-16 17:00] session | bom-dia: feedback 👍👎 + memória agente + overflow fix
Touched: none

## [2026-05-16 22:00] session | bom-dia: feed 1800x630, criatividade, formulário completo, histórico
Touched: none

## [2026-05-16 21:15] session | fix bom-dia: story orientação 9:16 via prompt texto puro
Touched: none

## [2026-05-16 20:30] session | fix bom-dia: cores marca + storage único + story referência
Touched: none

## [2026-05-16 19:30] session | fix bom-dia: portrait, custom_brief, labels
Touched: none

## [2026-05-16 10:00] session | formatação WhatsApp no chat ao vivo
Touched: none

## [2026-05-16 18:00] session | fix 406 webhook grupos + config autonomia Claude Code
Touched: none

## [2026-05-16 13:30] session | diagnóstico Evolution API desconectada + health check banner
Touched: none

## [2026-05-15 24:00] session | BomDia RLS fix + 3 formatos + envio grupos + config agente
Touched: none

## [2026-05-15 23:30] session | Espaços redesign + fix HEIC + useMemo build error
Touched: none

## [2026-05-15 23:00] session | agente bom-dia + fix OpenRouter recraft
Touched: none

## [2026-05-15 21:00] session | notificações de canal interno + canais em todas as abas
Touched: none

## [2026-05-15 20:30] session | limpeza OpenClaw bridge-server + migration client_tasks
Touched: none

## [2026-05-15 19:00] session | Feature V2-6 — hook useDashboardData criado
Touched: none

## [2026-05-15 20:10] session | docs agentes LARA MAX NOVA DELI + cleanup OpenClaw
Touched: none

## [2026-05-15 05:00] session | Importar leads CSV Datacrazy → CRMScreen worktree continuidade
Touched: none

## [2026-05-15 18:00] session | Merge PRs #13 #14 #15 — BRENO, SOFIA, VERA em main + worktrees
Touched: none

## [2026-05-15 17:00] session | Feature V2-4 VERA BI — config, migrations, tasks, UI, PR#15
Touched: none

## [2026-05-15 10:00] session | SofiaScreen UI completa prospects CSV abordagens
Touched: none

## [2026-05-15 12:00] session | VERA migrations tabelas e views BI
Touched: none

## [2026-05-15 03:00] session | SOFIA tasks Trigger.dev pesquisar qualificar gerar-abordagem batch
Touched: none

## [2026-05-15 00:30] session | Feature V2-1 CORA + Asaas end-to-end concluída
Touched: none

## [2026-05-15] session | SOFIA migrations prospects pesquisas abordagens
Touched: none

## [2026-05-15] session | Deploy tasks BRENO no Trigger.dev v20260515.1
Touched: none

## [2026-05-14 23:59] session | Fases 6-7 + milestone v1 completo — CORA, BRENO, sidebar final
Touched: none

## [2026-05-14] session | refatoracao smoke-test CORA 3 tasks
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
## [2026-05-15 03:30] session | Feature V2-2 BRENO concluída e PR aberto
Touched: none
## [2026-05-15 05:30] session | Feature V2-3 SOFIA SDR concluída e PR aberto
Touched: none

## [2026-05-15 08:30] session | V2-5 DELI COO Digital entregue e validada
Touched: none
## [2026-05-16 03:15] session | bom-dia fixes: download, grupos, realtime, artTab
Touched: none
## [2026-05-16 10:22] session | fix chat caption formatting
Touched: none

## [2026-05-16 11:05] session | fix bom-dia preview zoom download
Touched: none

## [2026-05-16 15:30] session | fix webhook inbound messages não salvos em messages
Touched: none

## [2026-05-16 14:36] session | fix TypeScript .catch + GSD hooks config
Touched: none
## [2026-05-17 11:25] session | config: deploy sem prompt + Stop hook tsc
Touched: none

## [2026-05-23 16:30] session | piloto-04 merge PR #55 + cleanup + onda-05 planning
Touched: none

## [2026-05-23 15:30] session | piloto-04 deploy evolution-webhook v42 + PR Onda 04
Touched: none

## [2026-05-23 14:30] session | piloto-04 T10 validação final + tech debt TD#16-TD#21
Touched: none

## [2026-05-23 04:30] session | piloto-04 T10 Parte2 — bug phone mismatch + colunas inexistentes fix
Touched: none

## [2026-05-20] PR #54 mergeado SEM teste visual do modal RelatorioModal
- Decisão: Wandson assumiu risco, mergeou direto
- Pendência: testar visualmente quando voltar (loja real, clicar Gerar relatório, validar modal/botões)
- Se quebrar: hotfix em branch nova, não regredir

## [2026-05-23 14:25] session | Onda 05 Bloco A T1-T4 concluído
Touched: none

## [2026-05-23 19:00] session | piloto-05 deploy A+B + smoke E2E concluído
Touched: none

## [2026-05-23 19:25] session | piloto-05 smoke E2E Parte 1 — loja+analise+envio OK
Touched: none

## [2026-05-23 20:30] session | piloto-05 TD#16 race fix + smoke v2 E2E setup completo
Touched: none

## [2026-05-23 21:30] session | piloto-05 validação Bloco A + G5 disparado em 2 tarefas
Touched: none

## [2026-05-23 22:00] session | piloto-05 G6 fix TD#28 + 9 tarefas concluídas + analise fechada
Touched: none

## [2026-05-23 23:00] session | piloto-05 merge PR #56 + VPS main + PILOTO-06 planning
Touched: docs/piloto/PILOTO-06-PLANNING.md (criado), docs/tech-debt/onda-04.md (TD#28 fechado)

## [2026-05-23 23:30] session | piloto-06 TD#31 _notificarConclusao + marcar-concluida + UI 1-clique
Touched: bridge-server/routes/tarefas.js, bridge-server/schemas/tarefas.js, src/screens/lojas/LojaWorkspace.jsx, docs/tech-debt/onda-04.md (TD#31 fechado)

## [2026-05-24 18:00] session | Feature Discovery Swarm — F1 + F3
Touched: none (planos salvos em docs/features/, não em WikiBrain/wiki/)

## [2026-05-24 20:00] session | S1-G00 recon T5-T6 branches edge functions
Touched: none

## [2026-05-24 21:35] session | slim CLAUDE.md 42k→10k
Touched: none

## 2026-06-12 — sessão 38 (B-03 colateral: bucket contratos public→private)
- Bucket storage `contratos` (G03, nunca cabeado, 0 objetos, 0 refs em código) estava public=true → aplicado public=false via Storage API; SQL versionado em `supabase/migrations/20260612_003_contratos_bucket_private.sql`.
- Prova: URL pública sem auth → 400; signed URL → 200; bucket vazio. Deleção descartada (irreversível → Wandson). B-03 100% (#319 + colateral).

## 2026-06-14 — sessão: integração VendaERP (Fase 1, MVP read-only)
- Plano aprovado pelo Wandson. VendaERP (cw.vendaerp.com.br) ↔ Console v2 ↔ Hermes. Bridge = ponto único de contato com o ERP (credencial só no env do Bridge; Console via JWT, Hermes via x-internal-token, ambos em /api/vendaerp/*).
- Código (todos verificados — smoke offline 5/5, node --check 3/3): `bridge-server/lib/vendaerp.js` (15 exports), `bridge-server/routes/vendaerp.js` + registro em index.js:1525, `src/console/VendaErpPainel.jsx` + wiring ConsoleV2.jsx, `vendaerp-mcp/` (6 tools de leitura: erp_status/contratos/financeiro/estoque/fiscal/crm; writeTools=[] como enforcement estrutural da Fase 1).
- Migration `20260614_001_vendaerp.sql` APLICADA (output bruto): tabela `vendaerp_instances` (RLS ativa, policy SELECT `is_member_of(tenant_id)`, 3 índices) + 2 linhas em `tenant_integracoes` (1/tenant). Teste de isolamento RLS: role=anon vê 0 de 2 linhas semeadas → OK; linhas de teste removidas (tabela fica vazia, Fase 1 usa env).
- Build frontend OK: `vite build` ✓ 222 módulos, 6.01s, sem erro; VendaErpPainel.jsx no bundle.
- GATE 0 reservado ao Wandson: secrets VENDAERP_* no Infisical/Bridge + pm2 restart; `hermes mcp add vendaerp ...` + systemctl restart hermes-gateway; npm run live-smoke.
- Fase 2 (escrita c/ confirmação no Telegram) e Fase 3 (multi-tenant, token cifrado) ficam para depois.
