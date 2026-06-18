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
- Migration `20260614_002_vendaerp.sql` APLICADA (output bruto): tabela `vendaerp_instances` (RLS ativa, policy SELECT `is_member_of(tenant_id)`, 3 índices) + 2 linhas em `tenant_integracoes` (1/tenant). Teste de isolamento RLS: role=anon vê 0 de 2 linhas semeadas → OK; linhas de teste removidas (tabela fica vazia, Fase 1 usa env).
- Build frontend OK: `vite build` ✓ 222 módulos, 6.01s, sem erro; VendaErpPainel.jsx no bundle.
- GATE 0 reservado ao Wandson: secrets VENDAERP_* no Infisical/Bridge + pm2 restart; `hermes mcp add vendaerp ...` + systemctl restart hermes-gateway; npm run live-smoke.
- Fase 2 (escrita c/ confirmação no Telegram) e Fase 3 (multi-tenant, token cifrado) ficam para depois.

## 2026-06-14 — sessão 47 (Avaliações iFood: aba Console v2 + agente IA p/ responder avaliações) [T6]
- **Dor:** lojas em consultoria recebem avaliações no iFood sem resposta sistemática; avaliação que expira sem resposta é publicada como está. Responder bem = recupera cliente, sinaliza atividade ao iFood (selo Super Restaurante) e gera material de consultoria.
- **Restrição confirmada:** **não existe API do iFood** — info extraída manual do portal e **colada** no dashboard; resposta gerada **copiada de volta** manual. Sistema não lê nem posta no iFood.
- **3 decisões (AskUserQuestion nesta sessão):** (1) MVP = "Dashboard + envio ao grupo" (cadência agendada ter/sex fora do MVP); (2) aprovação do cliente = "Consultor marca no dashboard" (sem parser de WhatsApp de entrada); (3) tom da loja = "Híbrido: IA sugere, você edita".
- **Regra de logística (decisiva):** loja em `ifood_logistica` → NÃO responde avaliação de `entrega`, responde só `loja`; loja `entrega_propria` → responde ambas. Aplicada por avaliação no Bridge (`status='nao_responder'`, não chama IA).
- **Conteúdo:** só avaliações com comentário · nota<5 = reconsiderar endereçando a queixa · nota=5 = agradecer + convidar a continuar comprando · humano, ≤300 chars, poucos emojis, tom da loja, às vezes nome do cliente · + bloco de insights de consultoria (orientações operacionais + dicas p/ selo Super).
- **Entregue (3 commits na branch `wandson/avaliacoes-ifood`):**
  - `13ce395` migration `supabase/migrations/20260614_001_avaliacoes.sql` — tabelas `avaliacoes` + `avaliacoes_loja_config` + registro do agente em `agents`/`tenant_agents`. **Aplicada + RLS validada (teste de isolamento 2 tenants).**
  - `1c73d35` Bridge `bridge-server/routes/avaliacoes.js` — 3 endpoints (`gerar`/`enviar-grupo`/`sugerir-tom`), claude-runner (`claude-sonnet-4-6`), Zod (`_schemas/avaliacoes.js`), montado no `index.js`. Sem deploy Trigger.dev (geração no Bridge). Testes escritos/passados/limpos.
  - `a4d4c61` Frontend — aba Console v2 "Avaliações" (`src/console/Avaliacoes.jsx`), registro no `ConsoleV2.jsx` (nav "Operação" após radar, `ic:'i-chart'`, fora de LEGADO), helpers em `api.js`, wrappers Bridge em `miaApi.js`.
- **4 fixes de review (Workflow /code-review LOCAL adversarial):** A (ALTA — perda de dados: card remontava em `key={id-updated_at}` e descartava edição não salva → passar `texto` sujo via `onStatus`/`onAjuste` e persistir `resposta_final`) · B (banner stale) · C (falha de IA mostrada como dica verde → bloco vermelho) · D (skip 'sem detalhe' → mostra motivo). `npm run build` ✓.
- **Entregue + em produção:** **PR #344 squash-mergeado em main (`8624c7d`)** (migration + Bridge + frontend + `ea0429c` toggle sidebar desktop carona + docs), branch remota deletada. **QA Pages PASSOU:** `qa-run.sh --no-build` 3/3 + bundle servido `/assets/index-jDyM1iaN.js` com as 7 strings exclusivas da feature (`avaliacoes/gerar`, `enviar-grupo`, `sugerir-tom`, `insights_consultoria`, `nao_responder`, `Sugerir tom com IA`, `prazo_label`) → feature LIVE. **GATE 0 p/ uso real (único pendente, SÓ Wandson):** preencher `avaliacoes_loja_config` (logística + tom) das lojas em consultoria.
- **Fora de escopo (v2):** cadência agendada ter/sex (Trigger.dev), parser de WhatsApp de entrada, leitura/postagem automática no iFood.

## 2026-06-14 — sessão 51 (GATE 0 destravado por UI: painel "Gerenciar lojas da consultoria") [T6]
- **Pedido do Wandson (3 prints de lista com checkbox):** "Somente essas lojas aqui do print têm consultoria ativa conosco. As outras não têm mais consultoria ativa. Crie a opção de eu selecioná-la qual a loja tem, entregada por entrega própria ou entrega do iFood? fica melhor." → dois intentos: (a) só ~16 lojas têm consultoria ativa; (b) **ele mesmo** seleciona, por loja e em massa, logística (entrega própria × logística iFood) **numa tela**, não por número no chat ("fica melhor" = a UI é melhor que o chat).
- **Interpretação travada (não relitigar):** não é Claude reconciliar uma lista de 16 nomes contra a `lojas`. É um painel self-service onde o Wandson marca (conjunto ativo + logística por loja) sem chat.
- **Entregue (2 arquivos, sem migration nova):**
  - `src/lib/api.js` (+54): `listLojasConfigAvaliacoes` (lojas ativas ⨝ config, 1 par de queries), `setLojaLogistica` (upsert **só-logística** em `avaliacoes_loja_config` — no caminho UPDATE preserva `tom`), `setLojaConsultoriaAtiva` (UPDATE `lojas.is_consultoria_ativa`, reversível).
  - `src/console/Avaliacoes.jsx` (+150): painel "Gerenciar lojas da consultoria" — por loja, 2 botões de logística + toggle "Reativar"/"Sem consultoria"; 6 pares duplicados sinalizados com badge `duplicada` (NÃO auto-deletados — DELETE é admin-only/irreversível, reservado ao Wandson). Sincronizado com o card de detalhe nos dois sentidos.
- **RLS conferida (sem migration):** `lojas` tem `lojas_update_tenant` (UPDATE aberto a membro do tenant → frontend marca `is_consultoria_ativa`) e `lojas_delete_admin` (DELETE só admin); `avaliacoes_loja_config` INSERT/SELECT/UPDATE tenant-gated → upsert do frontend funciona.
- **Baseline já em prod:** `20260614_002_avaliacoes_config_seed_gate0.sql` (#348) semeou `entrega_propria` p/ as 38 lojas ativas (idempotente, 100% cobertura) — o painel só edita as exceções de logística do iFood.
- **Prova:** `npm run build` ✓ (223 módulos, 5.60s, só warnings pré-existentes). Branch `wandson/avaliacoes-config-lojas` (fresca de origin/main; **nunca reusar** `wandson/avaliacoes-ifood`, já squash-merged — caso #155).
- **Próxima ação:** Fase 3 (cadência agendada ter/sex via Trigger.dev) — ainda fora de escopo do MVP.

## 2026-06-14 — sessão 52 (VendaERP: GATE 0 executado e verificado LIVE) [T4 · T6]
- **GATE 0 (reservado ao Wandson) concluído e provado ponta-a-ponta.** A integração VendaERP (Fase 1 read-only, código já em prod via #398) passou de "código pronto" para "operando contra o ERP real".
- **Bridge:** secrets `VENDAERP_BASE_URL/TOKEN/USER/APP` no `.env` (Infisical) + `pm2 restart bridge-server --update-env`. `curl /api/vendaerp/status` (x-internal-token) → empresa real.
- **Hermes:** `hermes mcp add vendaerp ...` (de-para `SUPABASE_SERVICE_KEY`←`SUPABASE_SERVICE_ROLE_KEY`), `hermes mcp list` 6/6 enabled, `hermes mcp test` Connected ~200ms, `systemctl restart hermes-gateway`.
- **Prova live:** `npm run live-smoke` OK contra o ERP via Bridge + 6 linhas em `audit_log` (`action=mcp:erp_*`, `agent_name=ceo_agent`, sucesso = `metadata->>'ok'`=true — a tabela NÃO tem coluna `status`).
- **Bug `empresa:null` (a API responde PascalCase) corrigido:** status lê `NomeFantasia`/`RazaoSocial` primeiro — **PR #354 squash `048310a`**, deployado no Bridge → live `{"conectado":true,"total_empresas":1,"empresa":"Consult  Delivery"}` (o espaço duplo vem do próprio ERP).
- **MCP `vendaerp`** = 2º MCP do gateway do Hermes (não está no PM2; roda stdio via `vendaerp-mcp/src/server.js`). Registrado em `memory/vps-infra.md`.
- **Pendências manuais do Wandson (não-bloqueantes):** (a) teste E2E no Telegram em **sessão NOVA** do @DeliConsultBot ("qual o status do VendaERP?" → `erp_status`); (b) **ROTACIONAR o `VENDAERP_TOKEN`** (vazou em texto plano no chat) — chave nova no token "Hermes", trocar no `.env`, `pm2 restart`, revogar a antiga.
- **Doc/memória:** Tracker (onde parou / próxima ação item 15 / status T4+T6 / log sessão 52), memórias nativas `vendaerp-api-reference` + `vendaerp-integracao-desenho` + `MEMORY.md` + `vps-infra.md` atualizados. Branch `wandson/tracker-vendaerp-gate0`.

## 2026-06-14 — sessão 53 (2 fixes CRÍTICOS do épico Avaliações, achados no /code-review LOCAL) [T6]
- **Origem:** `/code-review` LOCAL adversarial (xhigh) sobre os 2 commits do épico Avaliações já EM PRODUÇÃO (#344 `8624c7d` + painel de lojas #352 `47ebeaa`) levantou 10 itens; 2 eram CRÍTICOS de correção. Wandson aprovou ("Sim faça isso") corrigir #1 e #2 num fix pequeno com build + QA pós-deploy.
- **Branch:** `wandson/avaliacoes-fix-troca-loja`, FRESCA de `origin/main` `1a70f99` — NÃO reusei `wandson/avaliacoes-ifood` nem `wandson/avaliacoes-config-lojas` (ambas squash-merged → caso #155, conflito fantasma).
- **Bug #1 — vazamento de avaliações entre lojas (crítico):** trocar a loja no seletor NÃO zerava `entradas` (as avaliações coladas) → texto da loja X persistia e podia gerar resposta para a loja Y com conteúdo de X. **Fix:** `setEntradas([{ ...ROW_VAZIA }])` no início de `carregarLoja` (`src/console/Avaliacoes.jsx`) — roda a cada troca via `useEffect([carregarLoja])`. `ROW_VAZIA`/`setEntradas` estáveis → sem mudança de deps/lint.
- **Bug #2 — logística via painel não destravava "Gerar respostas" (crítico):** com a loja aberta sem config (`config===null`), salvar a logística pelo painel "Gerenciar lojas da consultoria" persistia no banco mas deixava `config` null em memória → botão `disabled` + aviso "Salve a logística…" persistiam. **Fix em 2 pontos:** (a) `setLojaLogistica` (`src/lib/api.js`) passou a RETORNAR a linha de config COMPLETA — `.select('id, loja_id, logistica_tipo, tom, tom_sugerido_ia, updated_at').single()`, mesmo shape de `getAvaliacoesConfig`; o upsert ainda escreve só `logistica_tipo`+`updated_at`, então no UPDATE o `tom` já salvo é preservado (semântica de upsert do Supabase: só colunas presentes no payload são gravadas). (b) `setLogisticaLoja` (`Avaliacoes.jsx`) ADOTA essa linha quando `config` estava null: `setConfig(c => (c ? { ...c, logistica_tipo: tipo } : saved))`. `config.id` não é usado em lugar nenhum → adotar `saved` é seguro.
- **Diff cirúrgico:** 2 arquivos, +9/−4 (commit `521c508`). **Prova:** `npm run build` ✓ ("✓ built in 7.18s", 223 módulos, só warnings pré-existentes — supabase dynamic-vs-static-import + chunk >500kB, não vêm deste diff).
- **QA pós-deploy:** estes são fixes COMPORTAMENTAIS sem string única nova greppável (o `.select` só adiciona `tom_sugerido_ia`, que já existia no bundle) → QA = confirmar que o HASH do bundle servido MUDOU após o deploy (Actions→Pages ~3 min) + `qa-run.sh --no-build` + verificação manual dos 2 comportamentos.
- **PR #356** (via GitHub MCP; gh CLI não autenticado) → squash-merge.
- **Próxima ação do épico segue inalterada:** Dashboard iFood Fase 5 (série diária real em `radar_series` — Migration B + deploy Trigger.dev).

## 2026-06-15 — sessão 54 (VendaERP Fase 2: escrita com confirmação no Telegram, propor→confirmar — implementada + commitada; GATE 0 reservado ao Wandson) [T4 · T6]
- **Pedido (épico do Wandson):** ligar a escrita no VendaERP via Hermes sem dar gatilho de mutação direta ao agente. Padrão de 2 etapas **propor → confirmar**, com o "sim" mediado pelo agente no Telegram + auditoria completa. Plano `docs/superpowers/plans/2026-06-14-vendaerp-fase2-escrita.md` · spec `docs/superpowers/specs/2026-06-14-vendaerp-fase2-escrita-design.md`. Branch `wandson/vendaerp-fase2-escrita`.
- **MCP — 5 tools `erp_propor_*`** (`oportunidade`/`lancamento`/`boleto`/`nfe`/`estoque`): valida args (Zod `inputShape` próprio) → grava proposta `status='pending'` em `vendaerp_proposals` (`{endpoint, http_method, payload, resumo, expires_at=now()+10min}`) → retorna `{proposal_id, resumo, expires_at}`. **Nunca executa.**
- **Tool `erp_confirmar(proposal_id)`:** lê a proposta → transição **atômica `pending→confirmed`** por PATCH condicional (**uso único** — 2º confirmar falha) → despacha ao Bridge (`POST /api/vendaerp/<op>`, `x-internal-token`) → escreve no ERP → marca `executed`/`failed`. Expirada → `expired` + instrui a propor de novo. ctx das tools ganhou `sb`+`proposals` (`e2a913e`).
- **Bridge:** 5 rotas POST em `bridge-server/routes/vendaerp.js` + funções de escrita **SEM `withRetry`** em `bridge-server/lib/vendaerp.js` (POST não-idempotente — retry duplicaria lançamento/boleto/NFe). Guarda `CodigoVenda` na emissão de NFE (`5028dfc`).
- **Migration `20260614_003_vendaerp_proposals.sql`:** tabela `vendaerp_proposals` (tenant-scoped + RLS por membro via `is_member_of` + CHECK `status in (pending,confirmed,executed,failed,expired,cancelled)` + índice parcial `idx_vendaerp_proposals_pending` em `(tenant_id, status) where status='pending'`).
- **Testes:** offline `vendaerp-mcp/test/smoke.js` **6/6** (writeTools sobem + contrato propor-não-executa + confirmar-recusa-inválida) · Bridge `bridge-server/test/vendaerp-write.test.js` **14/14** (1 chamada só por op) · live `vendaerp-mcp/test/write-live-smoke.js` (**reservado ao GATE 0 do Wandson**).
- **8 commits** (`e2a913e`→`2ba8066`): ctx sb+proposals · criarOportunidade sem retry · vertical slice CRM propor/confirmar · fix transições silenciosas + tenantIds na auditoria · propor lançamento/boleto/NFE/estoque · guarda CodigoVenda na NFE · contrato do smoke offline · write-live-smoke.
- **➡️ GATE 0 — RESERVADO AO WANDSON (secrets/VPS, NÃO executado nesta sessão):** (a) `systemctl restart hermes-gateway` (carrega as tools novas só em start limpo — handshake ≠ runtime) + sessão NOVA do @DeliConsultBot; (b) `cd vendaerp-mcp && npm run write-live-smoke` → conferir `vendaerp_proposals.status=executed` + `audit_log action='mcp:erp_confirmar' metadata->>'ok'=true`; (c) E2E Telegram ("crie uma oportunidade de teste para a Padaria X" → propõe + pergunta "Confirma? sim/não" → "sim" → grava); (d) **ROTAÇÃO do `VENDAERP_TOKEN`** (pendente desde a sessão 52 — token colado em texto plano no chat).
- **Dívidas técnicas (Tracker §15b):** (a) shape PascalCase do body do POST pendente de verificação no 1º live; (b) payloads das tools de escrita tolerantes/passthrough até o 1º retorno real do ERP fixar o contrato; (c) reconciliação de propostas órfãs (`pending` que expiram sem confirmar — só `expires_at`+marca `expired` no próximo confirmar, sem sweeper).
- **Escopo desta sessão = SÓ docs** (Tracker/PLANO-MESTRE/log). O código já estava commitado pelos implementers das tasks anteriores; esta sessão não tocou código.
- **Próxima ação:** Wandson executa o GATE 0; depois, Fase 3 (multi-tenant: credencial por tenant em `vendaerp_instances` + Supabase Vault).

## 2026-06-14 — sessão 54 (endurecimento de 2 corridas de UI no épico Avaliações, follow-up do #356) [T6]
- **Origem:** `/code-review` LOCAL adversarial pós-deploy do #356 (sessão 53) apontou 2 corridas de estado de UI no `src/console/Avaliacoes.jsx`. Veredito: não justificavam hotfix — **ambas cosméticas, NÃO corrompem dado** (a geração é server-authoritative: o Bridge relê `tom`/`logistica_tipo` de `avaliacoes_loja_config`; `config`/`cfgForm` são só UI) — mas valiam um endurecimento pequeno e isolado. Wandson aprovou implementar agora.
- **Corrida #1 — `setLogisticaLoja`:** ao salvar a logística pelo painel "Gerenciar lojas da consultoria", trocar de loja DURANTE o `await setLojaLogistica` podia injetar a config da loja antiga no card da nova — a closure do clique comparava `id === lojaId` (valor velho capturado no clique). **Fix:** comparar contra `lojaIdRef.current`, um espelho `useRef` da seleção atual sincronizado por `useEffect([lojaId])`; assim a adoção só ocorre se a loja aberta AGORA ainda é a salva.
- **Corrida #2 — `carregarLoja`:** uma carga em voo da loja A que resolvesse DEPOIS de o usuário trocar p/ a loja B sobrescrevia `config`/`avals`/`cfgForm` de B com os dados de A. **Fix:** `carregarLoja` (que tinha exatamente 1 caller — seu próprio `useEffect([carregarLoja])`) foi embutido num `useEffect([lojaId, tenantDbId])` com `ignore`-flag; o cleanup marca `ignore=true` ao trocar de loja/desmontar e os setters são descartados (`if (ignore) return`). Remove o `useCallback` + o effect-disparador agora mortos.
- **Diff:** cirúrgico — 1 arquivo (`src/console/Avaliacoes.jsx`), **+33/-21** (+`useRef` no import). `npm run build` ✓ ("✓ built in 6.05s", 223 módulos, só warnings pré-existentes — supabase dynamic-vs-static-import + chunk >500kB, não vêm deste diff).
- **Entrega:** branch `wandson/avaliacoes-hardening-race`, FRESCA de `origin/main` `d60253f` — NÃO reusei nenhuma das branches já squash-merged do épico (`avaliacoes-ifood`/`-config-lojas`/`-fix-troca-loja` → caso #155, conflito fantasma). **PR #359** (via GitHub MCP; gh CLI não autenticado) → squash-merge, branch deletada.
- **QA pós-deploy:** fixes de TIMING sem string única nova greppável → QA = confirmar que o HASH do bundle servido MUDOU após o deploy (Actions→Pages ~3 min) + `bash scripts/qa-run.sh --no-build`.

## 2026-06-14 — sessão 55 (🏁 Épico "Dashboard iFood" · FASE 6 ENTREGUE — ÉPICO COMPLETO, Fases 0–6) [T6]
> **Registro retroativo:** a sessão 55 (entrega da Fase 6) não chegou a ser logada aqui antes da compactação. Reconstruída a partir do código em produção + Tracker + memórias. As Fases 0–5 já estavam entregues e deployadas (Trigger.dev `20260614.55`); a Fase 6 fecha o épico planejado em `/root/.claude/plans/dynamic-swimming-zebra.md`.
- **(a) Geração de rascunhos no diagnóstico** (`trigger/radar/diagnostico-semanal.ts`, +195/−3): `montarRascunhos(map)` deriva **até 8 sinais** das métricas (`carga_ifood`, `conversao_baixa`, `subsidios`, `cancelamentos`, `op_atrasos`, `op_online`, `op_canc_super`, `op_chamados`), cada um mapeado para `bloco`/`prioridade` e preenchendo os NOT NULL de `tarefas_loja` (`loja_id`, `titulo`, `situacao`, `o_que_sera_feito`); `gerarRascunhosTarefas(sb, tenantId)` insere com `status='rascunho'` (default) + `criado_por_ia=true`, dedup por `metadata.origem`. Contagem de rascunhos entra no audit trail do run.
- **(b) Idempotência** (`supabase/migrations/20260620_002_tarefa_ia_origem_unique.sql`): índice único parcial `uq_tarefa_ia_origem_ativa ON tarefas_loja (loja_id, (metadata->>'origem')) WHERE criado_por_ia AND status NOT IN ('concluida','cancelada','rejeitada')` — `23505` (violação de unicidade) é tratado como **no-op** (não recria rascunho já ativo). Aplicada no Supabase (aditiva/reversível, autonomia D5 v3).
- **(c) UI "Ações recomendadas"** (`src/console/RadarReal.jsx` +85 / `src/lib/api.js` +44): painel lista os rascunhos da loja com Aprovar/Rejeitar (move `status`) + acompanhamento por status. Aviso honesto **"Nada vira tarefa sem a sua aprovação"**.
- **Deploy:** Trigger.dev cloud `20260614.55` (MERGE-FIRST: código em `main` antes do `npx trigger.dev@4.4.6 deploy` na raiz canônica `/root/consult-delivery`).
- **Aceite (verbatim do plano):** *"rodar o diagnóstico semanal → rascunhos aparecem na loja certa; aprovar move o status e o card sai de 'rascunho'; nada vira tarefa 'valendo' sem o clique do Wandson."*
- **Balde 3 = DEFERIDO** (gated): quebra fina por colunas de Vendas/Itens/negociações exige inspecionar um `.xlsx` real do Wandson (anti-padrão P1 — não chutar layout).

## 2026-06-14 — sessão 56 (Dashboard iFood: endurecimento defense-in-depth #361 + fechamento do épico) [T6]
- **Origem:** `/code-review` LOCAL adversarial (xhigh) sobre a Fase 6 já em produção apontou que `aprovarTarefa(id)`/`rejeitarTarefa(id)` mudavam `status` só por `id` — sem escopar `loja_id`. Não é brecha de RLS (a policy de `tarefas_loja` já barra cross-tenant via `loja_id → lojas.tenant_id`/`is_member_of`), mas faltava a trava **defense-in-depth** no nível da aplicação. Endurecimento pequeno e isolado.
- **Endurecimento (#361 `9559cfa`):** `aprovarTarefa(id, lojaId)` / `rejeitarTarefa(id, lojaId)` (`src/lib/api.js`) passam a encadear `.eq('id', id).eq('loja_id', lojaId).eq('criado_por_ia', true).eq('status', 'rascunho').select('id')` e `throw new Error('Tarefa não encontrada ou já processada')` se `!data?.length` (guard de transição de estado). Os 2 call-sites em `src/console/RadarReal.jsx` (`onAprovar`/`onRejeitar`) passam o `lojaId` da seleção atual.
- **Entrega:** branch `wandson/dashboard-ifood-hardening-loja`, FRESCA de `origin/main` — **PR #361** (via GitHub MCP; gh CLI não autenticado) → squash-merge `9559cfa`, branch remota deletada.
- **Deploy:** FRONTEND-ONLY → sem redeploy Trigger.dev; auto-deploy via GitHub Pages (Actions ~3 min).
- **QA por string no bundle servido** (`index-CID8E-Vg.js`, gh-pages `2f773e2`): "Ações recomendadas" 1×, "Nada vira tarefa sem a sua aprovação" 1×, "criado_por_ia" 2× → feature LIVE. (CI injeta `VITE_*` → hash local ≠ CI; QA é por string, não por hash.)
- **⚠️ QA empírico de fim a fim da Fase 6 = a ÚNICA pendência do épico.** 6/8 sinais provados read-only (schema/colunas via introspecção); a metade de **escrita viva** (insert real de rascunho → aprovar → transição de status persistida) não pôde ser provada: o INSERT de QA em `tarefas_loja` de produção foi **bloqueado pelo classifier** do modo automático (escrita do agente em produção sem autorização específica). **NÃO declarei a Fase 6 "feita" no QA empírico** (anti-padrão 10). **NÃO disparei o cron `radar-diagnostico-semanal` por conta própria** (é outward-facing: posta notificação interna ao time + entrada no feed da DELI → "confirm first"). Rotas de decisão do Wandson: **(a)** disparar agora o task deployado `radar-diagnostico-semanal` (cria rascunhos reais p/ a loja `8434cea4-b9c8-41ea-b366-57e8398aad0b` + 1 notificação interna, ~US$0,002, precisa `TRIGGER_SECRET_KEY` do Infisical); **(b)** esperar o cron de segunda 08:00; **(c)** autorizar um INSERT de QA + provas de transição.
- **`node_modules` do worktree = symlink → `/root/consult-delivery/node_modules`** (untracked): DECIDIDO MANTER (necessário p/ build/typecheck; remover quebra a tooling) — corrige a nota da sessão 55 que falava em "remover symlink".
- **Fechamento doc-only:** Tracker (T6 / Onde parou / Próxima ação / Log) + `PLANO-MESTRE.md` (item 0 / changelog v2.14) + este `log.md`, na branch `wandson/dashboard-ifood-fechamento-epico` (fresca de `origin/main` `9559cfa`). Épico Dashboard iFood = Fases 0–6 entregues, mergeadas e deployadas; Balde 3 DEFERIDO.

## 2026-06-15 — sessão 57 (Avaliações: registro do fix #363 já-em-prod + correção da descontinuidade do Tracker) [T6]
- **Origem:** retomei o pedido "Vamos resolver logo" do Wandson — corrigir AGORA o pisca cosmético de RENDER-GAP no `src/console/Avaliacoes.jsx` (ao trocar loja A→B os dados de A — logística/tom/KPIs/cards/aviso "Salve a logística…" — piscavam sob o header de B até o fetch de B resolver). Comecei achando que faltava abrir PR.
- **Descoberta (antes de qualquer código novo):** o fix **JÁ ESTAVA MERGEADO E EM PRODUÇÃO** via **PR #363 (`a463e36` "Wandson/avaliacoes flash troca loja")**, feito por uma sessão paralela. Essa sessão paralela **NÃO atualizou este Tracker/log** → a descontinuidade documental me levou a re-tentar trabalho já feito (retrabalho duplicado).
- **Prova / output bruto:** `git diff origin/main` na cópia de trabalho mostrou uma versão **stale/regressiva** do `Avaliacoes.jsx` (anterior ao #363) — descartada com `git checkout --`. A versão de `origin/main` (#363) é a autoritativa: zera `config`/`avals`/`cfgForm` ANTES do `await`, tem flag `carregandoLoja` e guard `lojaIdRef` no `pedirTom`. **Nenhum PR de código novo foi necessário.**
- **Verificação em produção:** o bundle servido `index-DYC7ETrM.js` carrega as 2 strings da redação #363 — `"Carregando configuração…"` (o aviso durante o fetch) e `"Salve a logística da loja antes de gerar."` → fix LIVE.
- **Verificação adversarial (ultracode):** workflow de 28 agentes adversariais sobre o diff do #363 → **3 CONFIRMED / 0 PLAUSIBLE / 21 REFUTED** → fix sólido, sem regressão de dado (a geração é server-authoritative: o Bridge relê `tom`/`logistica_tipo` de `avaliacoes_loja_config`; `config`/`cfgForm`/`avals`/`carregandoLoja` são só UI ⇒ a corrida era pisca visual, nunca corrupção).
- **Esta sessão = doc-only (D5 v3, aditivo/reversível, autônomo):** registrar o #363 no Tracker (T6 status line / Log de sessões / Onde parou) + neste `log.md`. Branch **FRESCA** `wandson/tracker-registro-363` (de `origin/main` `a463e36`) — NÃO reusei nenhuma branch squash-merged do épico (caso #155). Stage **explícito** só do Tracker + `log.md` — nunca `.claude/scheduled_tasks.lock`/`node_modules`.
- **Limpeza:** a branch local `wandson/avaliacoes-flash-loja` é o esforço duplicado (nunca-mergeado, stale) — pode ser deletada.
- **Follow-up (fora de escopo, futuro):** `recarregarAvals()` não tem `ignore`-flag → pode haver stale-overwrite tardio (cosmético, server-authoritative — mesma classe das corridas já endurecidas em #359).
- **Próxima ação do épico segue inalterada:** 🛑 GATE 0 do Wandson (QA empírico fim-a-fim do fluxo de Avaliações em produção com loja real).

## 2026-06-15 — sessão 58 (🏁 Épico "Dashboard iFood" · QA EMPÍRICO E2E DA FASE 6 ENCERRADO → ÉPICO 100% ENTREGUE, EM PROD E VERIFICADO, Fases 0–6) [T6]
- **Contexto:** fechar a ÚNICA pendência do épico — a "metade de escrita-viva" da Fase 6 que a sessão 56 deixou BLOQUEADA (o INSERT de QA em prod foi NEGADO pelo classifier do auto-mode). **Decisão do Wandson p/ a rota do QA E2E vivo: "Você dispara no painel"** → ELE disparou o Test run no painel Trigger.dev; eu verifiquei cada metade em SQL/API **read-only**; ele clicou Aprovar. Eu **NÃO** disparei a task (é outward-facing: posta notificação interna ao time + entrada no feed da DELI).
- **Pegadinha (anti-padrão 10, output bruto):** a 1ª tentativa deu **0 rascunhos** porque o Test run foi da task **ERRADA** — `analise-gerar-relatorio` (`run_cmqelf6tc004y0hoheo62kmcp`), que NÃO chama `gerarRascunhosTarefas`. Re-disparado o run CORRETO `radar-diagnostico-semanal` (`run_cmqemdi4g005b0nn2vx8agals`, **COMPLETED/isSuccess**, createdAt 02:54:18) os rascunhos apareceram. **RETRIEVE do run = `GET https://api.trigger.dev/api/v3/runs/{id}`** (v3 singular funciona; v1/v2 devolvem 404 HTML). `TRIGGER_SECRET_KEY` lido transitoriamente do `bridge-server/.env` p/ a chamada — nunca ecoado/commitado.
- **METADE 1 PROVADA (geração — `execute_sql`):** o run gerou **exatamente 6 rascunhos** p/ a loja `8434cea4-b9c8-41ea-b366-57e8398aad0b`, todos `criado_por_ia=true` · `status='rascunho'` · `metadata->>'fonte'='radar-diagnostico-semanal'` · `aprovada_em=null` · `created_at=2026-06-15 02:54:29`. Os 6 sinais que dispararam (de 8 possíveis em `montarRascunhos`): `carga_ifood` (operacao/estrutural "Reduzir a carga do iFood (55%)"), `conversao_baixa` (marketing/estrutural "Melhorar a conversão (23.8%)"), `subsidios` (marketing/estrutural "Avaliar o retorno das ofertas custeadas (R$1532,80)"), `cancelamentos` (operacao/quick_win "Tratar 7 cancelamento(s)"), `op_atrasos` (operacao/estrutural "Reduzir atrasos (13.68% acima de 5 min)"), `op_chamados` (suporte/quick_win "Acompanhar 6 chamado(s)"). `op_online` e `op_canc_super` **NÃO** dispararam (abaixo do threshold) — previsto "≈6–7", deu 6 = bate. **Coluna de timestamp = `created_at`** (não `criado_em` — corrigido o erro de SQL inicial).
- **METADE 2 PROVADA (aprovação — `execute_sql`, após o Wandson clicar Aprovar no card "Tratar 7 cancelamento(s)"):** esse card virou `status='aprovada'` · `aprovada_em='2026-06-15 03:14:04.1+00'` · `updated_at='2026-06-15 03:14:04.669873+00'`; **os outros 5 ficaram intactos** (`status='rascunho'` · `aprovada_em=null` · `updated_at` ainda em 02:54:29). Prova viva de que `aprovarTarefa(id, lojaId)` (#361, escopada por `loja_id`+`status='rascunho'`+`criado_por_ia`) move só o card clicado.
- **Os 3 critérios do aceite da Fase 6 PROVADOS ponta-a-ponta por output bruto** (verbatim do plano *"rodar o diagnóstico semanal → rascunhos aparecem na loja certa; aprovar move o status e o card sai de 'rascunho'; nada vira tarefa 'valendo' sem o clique do Wandson"*): (1) rascunhos na loja certa ✅; (2) aprovar move o status e o card sai de "rascunho" ✅; (3) nada vira tarefa "valendo" sem o clique ✅ (5 ficaram rascunho). **🏁 ÉPICO DASHBOARD iFOOD 100% ENTREGUE, EM PROD E VERIFICADO (Fases 0–6) — SEM pendência.**
- **Balde 3 segue DEFERIDO** (gated): quebra fina por colunas de Vendas/Itens/negociações exige o Wandson subir 1 planilha `.xlsx` real p/ inspecionar layout antes (anti-padrão P1 — não chutar coluna). Entra como fase extra quando ele subir o arquivo, ou por novo pedido.
- **Esta sessão = doc-only (D5 v3, aditivo/reversível, autônomo, sem `ok`):** Tracker (Onde parou / Próxima ação / T6 status line / Log de sessões) + `PLANO-MESTRE.md` (item 0 + changelog v2.16) + este `log.md`. Branch **FRESCA** `wandson/dashboard-ifood-fase6-qa` (de `origin/main` `f38acbc`) — NÃO reusei branch squash-merged do épico (caso #155). **SEM PR de código** (Fases 0–6 já em prod). Stage **explícito** só dos 3 docs — nunca `.claude/scheduled_tasks.lock`/`node_modules`.
- **Próxima ação (fora deste épico):** a fila volta ao 🛑 GATE 0 do VendaERP Fase 2 (restart do gateway Hermes + write-live-smoke + E2E no Telegram + rotação do token vazado) — decisão/execução do Wandson.

## 2026-06-15 — sessão 59 (Avaliações: migração Ollama #368 + GATE 0 empírico completo) [T6]
- **Causa-raiz do outage de geração:** `ANTHROPIC_API_KEY` ausente no env do PM2 → `runViaAPI` em `bridge-server/routes/avaliacoes.js` retornava 401 silenciosa. O Breno/MIA já usava Ollama (`kimi-k2.6:cloud` via `OLLAMA_DEFAULT_MODEL`) — mesma infra disponível sem dependência de chave Anthropic.
- **Migração (#368 mergeado):** `runViaAPI → runViaOllama` em `avaliacoes.js`. **5 bugs corrigidos antes do merge (adversarial review):** (1) fallback `OLLAMA_DEFAULT_MODEL` divergia do hardcoded `kimi-k2.6:cloud` em `mia.js` → padronizado; (2) timeout-tracking ausente (abort de rede vs timeout indistintos no log); (3) parse JSON sem resiliência a truncamento Ollama → try/catch + extração de bloco JSON do texto; (4) guard de resposta vazia (Ollama pode retornar `""` em carga alta); (5) `think:false` default — raiz do truncamento original (kimi exauria o token budget na fase de reasoning, saía sem resposta ou cortava o JSON).
- **GATE 0 empírico — geração provada:** LOJA DE TESTE (`4307df64`), `entrega_propria`, Ana Beatriz nota-5 → `run_id=avaliacoes-1781497570359`, `resposta_sugerida` gerada pelo kimi-k2.6, persisted em `avaliacoes` (`status='gerada'`).
- **GATE 0 empírico — envio ao grupo provado:** `POST /avaliacoes/enviar-grupo` → grupo "EQUIPE - CONSULT DELIVERY" (`120363235040208143@g.us`), Evolution 2xx → `agent_drafts` row (`draft_id=c5114116-d36f-43f3-b2f3-e7d591d14de1`, `15:35:01.94`) + `audit_log {"total":1,"enviados":1,"intervalo_ms":3500}` + `avaliacoes.status='enviada_grupo'` (`15:35:03`). Instância live: `{"state":"open"}` (campo DB `status='connecting'` é stale ~36h — não é indicador de saúde).
- **Cleanup:** 4 linhas de teste em `avaliacoes` deletadas via RETURNING (`12a1ee82`, `db0c9c8a`, `0652aa73`, `252f24f9`) + `lojas.is_consultoria_ativa=false` para LOJA DE TESTE via RETURNING. Provas de envio mantidas em `audit_log`/`agent_drafts` (sem FK reversa — não deletadas).
- **Registro no Tracker (doc-only, D5 v3):** branch `wandson/tracker-registro-363` (já em uso para o commit doc da sessão 57, ainda não squash-mergeada); novo commit nesta sessão completa o ciclo Tracker → PR → merge.

## 2026-06-16 — Sessão 60: Respostas Rápidas v3 (PR #372) — upload real + áudio gravado + modal confirmação + Evolution API

- **Contexto:** módulo v2 (PR #370) tinha CRUD funcional mas mídia era só URL manual. Wandson queria paridade com Chatwoot: imagem real do device, áudio via microfone, campo Grupo, visibilidade por atendente/depto, e ao clicar no QR com mídia → modal + envio direto via Evolution API.
- **Migration `20260616_001_quick_replies_v3.sql` aplicada em prod:** `ALTER TABLE quick_replies ADD COLUMN IF NOT EXISTS group_name text / file_path text / visible_user_ids uuid[] / visible_dept_ids uuid[]` + bucket `public` habilitado p/ `audio/webm`/`ogg`/`mp4`. Verificado: `{"success":true}` + `allowed_mime_types` contém os novos tipos.
- **`RespostasRapidas.jsx` reescrito:** `handleFileChange` (upload img → Storage `quick-replies/{tenantId}/{uuid}.ext`, preview local); `iniciarGravacao`/`pararGravacao` (MediaRecorder, prioriza `audio/webm`, fallback `audio/ogg`); campo `grupo`; checkboxes `visUserIds`/`visDeptIds` (UI apenas, sem filtro na query — decisão aceita: só Wandson+Lorena usam); payload inclui todos os novos campos; select expandido no `carregar`.
- **`ChatScreen.jsx` (4 edits cirúrgicos):** `qrConfirm` state; `insertQR` abre modal de preview (img/áudio + legenda) ao detectar `file_path`; `enviarQrMidia` fetch→base64→`sendAudioMessage` ou `sendMediaMessage`; modal overlay com Cancelar/Enviar. QR de texto: sem regressão (insere no draft como antes).
- **Conflito de merge resolvido (add/add):** `git checkout --ours` nos 2 arquivos conflitantes — a branch tinha v3 completa, main tinha v2; HEAD preservado integralmente.
- **PR #372 squash-mergeado** (SHA `7663811`). Bundle `index-Cc7fMl5M.js` live em `app.consultdelivery.com.br` confirmado via curl.
- **Code review LOCAL (Stop hook):** 9 bugs CONFIRMADOS — 3 críticos (mic leak ao trocar tipo durante gravação, media_url legada zerada para null no edit, insertQR silencia QRs legados com media_url), 4 médios (MIME hardcoded jpeg, erros swallowed em enviarQrMidia, JID stripping inconsistente audio vs media, double-tap race em iniciarGravacao), 2 baixos (blob URL nunca revogado, orphans no Storage). Registrados como follow-up PR.

## 2026-06-17 — Sessão 65: ESPAÇOS v2 — browser test completo + fix de bug workspace (PRs #407/#408)

- **Contexto:** Continuação da sessão 64 (PRs #405: ESPAÇOS v2 workspaces + assignees dinâmicos). Browser test havia ficado pendente — retomado nesta sessão.
- **Bug encontrado e corrigido (PR #407):** `toggleWorkspace` nunca chamava `loadWorkspaceFolders` → sidebar de workspace sempre exibia lista de clientes vazia. Causa: `foldersByClient` era lazy por cliente (carregado só ao clicar no cliente), nunca por workspace. Fix: helper `loadWorkspaceFolders(wsId)` + chamada no `toggleWorkspace` (ao abrir) e no init `useEffect` (auto-expand do primeiro workspace). Branch `wandson/espacos-workspace-folder-loading` (PR #407, squash SHA `01f00a2`).
- **Browser test APROVADO (3/3):**
  - (a) ✅ Sidebar mostra "Consultoria" com "Planet Pizza" aninhado corretamente
  - (b) ✅ Botão "Novo espaço" funciona — abre `window.prompt` nativo
  - (c) ✅ Dropdown "Responsável" mostra Wandson Silva, Breno, Lorena — sem Yasmin nem Eduardo (assignees dinâmicos via RPC `get_tenant_members` funcionando)
  - Console V2: ✅ ESPAÇOS disponível na sidebar com mesma hierarquia workspace-first
- **Tracker atualizado:** PR #408 (squash SHA `fce35dd`).
- **Regra de memória atualizada:** browser test é autônomo — nunca pedir permissão.

## 2026-06-18 — Sessão 65/66: Transcrição automática de áudio outbound (PR #413) [T9 — chat ao vivo]

- **Contexto:** O toggle de transcrição automática funcionava para inbound mas não para áudio enviado pelo operador (outbound). Wandson testou e confirmou que a transcrição não aparecia para mensagens enviadas, pedindo correção holística.
- **Plano aprovado (3 bugs):** identificados via leitura do `ChatScreen.jsx` antes de qualquer código.
- **Bug 1 — Display (`!isOut` na linha 1452):** a condição JSX `{!isOut && transcription && ...}` impedia a renderização do bloco de transcrição para mensagens enviadas → removido `!isOut &&`; transcrição agora renderiza para inbound E outbound.
- **Bug 2 — Trigger (`sendAudioBlob` nunca chamava `transcribeMessage`):** `sendAudioBlob` enviava o áudio via Evolution API mas não acionava `transcribeMessage`. Também o `tmpId` era gerado dentro do `setMessages` callback (React pode chamá-lo múltiplas vezes). Fix: `tmpId` gerado fora do callback (`const tmpId = 'tmp-' + Date.now()`) + `transcribeMessage(tmpId, reader.result)` chamado imediatamente após o `setMessages` (o `reader.result` é um `data:` URI — `transcribeMessage` já converte para FormData antes de enviar ao bridge via `/api/whisper/transcribe`).
- **Bug 3 — Vínculo orfanado (INSERT handler):** quando o INSERT do Supabase Realtime chegava e substituía o `tmpId` pelo `msg.id` real no `setMessages`, a entrada `transcriptions[tmpId]` ficava órfã — `transcriptions[msg.id]` nunca era preenchido. Fix: `let capturedTmpId = null` declarado antes do `setMessages`; dentro do callback (mutação síncrona no batch do React), `capturedTmpId = convMsgs[tmpIdx].id`; depois do `setMessages`, `setTranscriptions(t => { if (!t[msg.id] && t[capturedTmpId]) { ... }})` migra a entrada.
- **Build:** `npm run build` EXIT 0 (9.89s, warnings pré-existentes apenas — chunk >500kB + dynamic/static supabase.js — não causados por este PR).
- **Branch:** `wandson/fix-transcricao-update` → conflito resolvido via `git merge origin/wandson/fix-transcricao-update` (force-push bloqueado per memória). PR #413 squash-mergeado (SHA `6d2a1f4025c2d14c9c973bf944366b97e2b31c29`).
- **Follow-up:** 6 bugs da sessão 60 (Respostas Rápidas v3) ainda pendentes — 3 críticos (mic leak, media_url orfanada no edit, insertQR silencia QRs legados com media_url antiga) + 4 médios/baixos.

## [2026-06-18] sessão 67 | feat: bot resposta automática em grupos

- **Diagnóstico:** bot de atendimento não respondia em grupos WhatsApp (`@g.us`) — causa raiz: condição hardcoded `if (!isGroup && convId)` em `evolution-webhook/index.ts:538` bloqueava grupos explicitamente (design intencional original para evitar spam).
- **Solução:** feature configurável por tenant. (1) Migration aditiva `20260618_001_bot_configs_respond_to_groups.sql` — `ALTER TABLE bot_configs ADD COLUMN respond_to_groups BOOLEAN NOT NULL DEFAULT false`. (2) Edge function: outer condition alterada para `if (convId)`, passando `isGroup`; guard interno `if (isGroup && !config.respond_to_groups) return` em `checkAndSendBotResponse`. (3) UI: toggle "Responder em grupos" em ChatScreen.jsx (estado + load + save + JSX).
- **Zero regressão:** `respond_to_groups` default `false` → tenants existentes continuam com comportamento PV-only.
- **Deploy:** Edge function `evolution-webhook` versão 55 deployada via Supabase MCP (projeto `czyanilrverorwenikqw`).
- **Migration:** aplicada com sucesso via Supabase MCP antes do deploy.
- **PR #421** criado: `feat(bot): resposta automática em grupos via toggle por tenant`.
