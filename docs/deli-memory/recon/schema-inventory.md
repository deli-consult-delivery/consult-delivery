# T4 — Schema Inventory: Supabase
S1-G00 Reconhecimento | 2026-05-24

> ISOLAMENTO: EvoNexus ignorado. Supabase czyanilrverorwenikqw / schema public.
> RECON APENAS — nenhuma alteração de schema.
>
> Fontes de dados:
> - information_schema.columns: col_count por tabela (exato)
> - information_schema.columns filtrado por tenant_id: presença multi-tenant
> - pg_stat_user_tables.n_live_tup: rowcount APROXIMADO (pode ser stale se ANALYZE não rodou)
> - COUNT(*) exato: batch 1 (40 tabelas) executado diretamente
>
> ⚠️ AVISO pg_stat: Para várias tabelas (ex: customers, analises), pg_stat retorna 0
>   enquanto COUNT() retorna >0. ANALYZE desatualizado. Usar COUNT() onde disponível.

---

## RESUMO GERAL

| Métrica | Valor |
|---------|-------|
| Total de tabelas/views públicas | 103 |
| Base tables (estimativa) | ~98 |
| Views | 5 (v_chart_7d, v_dashboard_kpis, view_metricas_*) |
| Tabelas COM tenant_id | 77 |
| Tabelas SEM tenant_id | ~26 |
| Tabelas com 0 rows (pg_stat) | ~53 |
| Tabelas com dados (pg_stat ou COUNT) | ~50 |

---

## INVENTÁRIO POR DOMÍNIO

### A — Core / Auth / RBAC

| Tabela | Cols | Tenant? | Rows (COUNT) | Rows (pg_stat) | Nota |
|--------|------|---------|------|---------|------|
| `tenants` | 17 | ❌ | — | ~0 (stale) | 1 tenant 'consult' existe |
| `profiles` | 7 | ❌ | — | ~3 | auth.users mirror |
| `roles` | 6 | ✅ | — | ~0 | RBAC roles por tenant |
| `role_permissions` | 3 | ❌ | — | ~0 | resource+action pairs |
| `user_roles` | 4 | ❌ | — | ~0 | join user↔role |
| `tenant_members` | 6 | ✅ | — | ~2 | membros por tenant |
| `user_agent_access` | 7 | ❌ | — | ~0 | RBAC de agente por user |
| `audit_log` | 10 | ✅ | 97 | ~49 | toda ação sensível |

> ⚠️ `roles`, `role_permissions`, `user_roles`, `user_agent_access` todas com 0 rows.
> RBAC schema criado (Fase 1A/1B) mas ainda não populado em produção → **T5 finding**.

---

### B — Agentes / Orquestração

| Tabela | Cols | Tenant? | Rows | Nota |
|--------|------|---------|------|------|
| `agent_runs` | 12 | ✅ | **171** | audit central de todas as runs |
| `agents` | 10 | ❌ | 15 | registro de agentes no sistema |
| `tenant_agents` | 6 | ✅ | ~0 | agentes habilitados por tenant |
| `tenant_agent_config` | 5 | ✅ | ~0 | config jsonb por agente+tenant — VAZIO (TD#42 BRENO) |
| `agent_drafts` | 19 | ✅ | ~0 | drafts aguardando aprovação humana — VAZIO |
| `agent_memories` | 9 | ✅ | ~0 | memória persistente de agentes — VAZIO |
| `agent_actions` | 8 | ✅ | 0 | ações propostas pelo agente |
| `agent_corrections` | 7 | ✅ | 0 | correções humanas às ações |

> ⚠️ `agent_drafts` com 0 rows: fluxo de draft (Fase 1C) nunca usado em produção.
> ⚠️ `agent_memories` com 0 rows: memória persistente schema criado mas nunca populado.
> ⚠️ `tenant_agent_config` com 0 rows: BRENO não consegue ler config → TD#42.

---

### C — BomDia / Encerramento

| Tabela | Cols | Tenant? | Rows | Nota |
|--------|------|---------|------|------|
| `bom_dia_config` | 5 | ✅ | 1 | auto_send, hora_semana, hora_sabado (hora não usada — TD#44) |
| `bom_dia_feedback` | 6 | ✅ | 3 | thumbs up/down para orientar geração |
| `encerramento_config` | 3 | ✅ | 1 | auto_send, sem hora columns (hardcoded) |

---

### D — Chat / WhatsApp

| Tabela | Cols | Tenant? | Rows | Nota |
|--------|------|---------|------|------|
| `conversations` | 37 | ✅ | **105** | contém breno_paused, status_v2 |
| `messages` | 20 | ✅ | **5058** | histórico de mensagens (inbound+outbound) |
| `whatsapp_messages` | 17 | ✅ | **2449** | schema novo (V3 webhook); mentioned_agent, processed_by_deli |
| `whatsapp_contacts` | 12 | ✅ | 94 | is_internal, internal_user_id, loja_id |
| `whatsapp_groups` | 9 | ✅ | ~0 | bom_dia_ativo, encerramento_ativo (pg_stat stale) |
| `whatsapp_group_members` | 5 | ❌ | ~0 | membros por grupo |
| `whatsapp_aprovacao_sessions` | 9 | ❌ | **5** | aprovação de tarefas via WhatsApp (T6) |
| `channel_messages` | 11 | ✅ | 39 | chat interno equipe |
| `channel_members` | 3 | ❌ | ~3 | membros de canal interno |
| `internal_channels` | 9 | ✅ | ~0 | canais internos (não WhatsApp) |
| `internal_notifications` | 12 | ✅ | 15 | notificações internas |
| `conversation_events` | 9 | ✅ | **1008** | eventos de conversa (status change etc) |
| `conversation_status_log` | 9 | ✅ | **1447** | histórico de status de conversas |
| `conversation_tags` | 3 | ❌ | 0 | tags em conversas |
| `contact_tags` | 5 | ✅ | 0 | tags em contatos |
| `bot_configs` | 9 | ✅ | 1 | config bot fora-de-horário |
| `bot_reply_log` | 4 | ✅ | 11 | dedup de respostas automáticas |
| `evolution_instances` | 11 | ✅ | ~0 | instâncias Evolution API (pg_stat stale) |
| `push_subscriptions` | 9 | ✅ | ~0 | web push |

> ⚠️ `whatsapp_groups` com pg_stat=0 mas sabemos que tem 69 grupos (T2).
>   pg_stat muito stale para esta tabela. Usar T2 COUNT: 69.

---

### E — Lojas / CRM

| Tabela | Cols | Tenant? | Rows | Nota |
|--------|------|---------|------|------|
| `lojas` | 33 | ✅ | **~1172** | loja iFood; é_active (soft delete desde onda-07) |
| `customers` | 17 | ✅ | **1168** | clientes da plataforma (vs lojas = clientes iFood) |
| `client_facts` | 11 | ✅ | 0 | fatos key-value por loja (memória central) — VAZIO |
| `client_timeline` | 10 | ✅ | 0 | linha do tempo por loja — VAZIO |
| `client_tasks` | 15 | ✅ | 0 | tarefas de cliente — VAZIO |
| `loja_consultores` | 7 | ❌ | ~0 | consultor responsável por loja |
| `loja_metricas` | 17 | ✅ | ~0 | snapshot diário de métricas — VAZIO |
| `loja_metricas_snapshot` | 20 | ❌ | ~0 | snapshot VERA — VAZIO |
| `customer_addresses` | 13 | ✅ | 0 | endereços de clientes |
| `customer_notes` | 8 | ✅ | 0 | notas por cliente |
| `customer_groups` | 7 | ❌ | ~0 | grupos de clientes |
| `customer_group_members` | 3 | ❌ | 0 | membros de grupos |
| `customer_tags` | 3 | ❌ | 0 | tags de clientes |
| `customer_tag_relations` | 2 | ❌ | 0 | relação tag↔cliente |
| `daily_kpis` | 12 | ✅ | 0 | KPIs diários — VAZIO |

> ⚠️ `client_facts` e `client_timeline` VAZIOS: Memória Central (CLAUDE.md §14) schema criado
>   mas NENHUM agente escreveu dados ainda. DELI/agentes não usam o sistema ainda.
> ⚠️ `loja_metricas` VAZIO: VERA roda 77× mas não popula via n8n (n8n não está na stack).
> ⚠️ `loja_metricas_snapshot` VAZIO: VERA usa `vera_metricas_snapshot` (3 rows) — tabela separada.

---

### F — Tarefas / ClickUp Light

| Tabela | Cols | Tenant? | Rows | Nota |
|--------|------|---------|------|------|
| `tarefas_loja` | 21 | ✅ | **61** | tarefas por loja (Kanban) |
| `tarefa_aprovacoes` | 6 | ❌ | **134** | aprovações de tarefa (ações aprovadas/rejeitadas) |
| `tarefa_comentarios` | 10 | ❌ | ~0 | comentários em tarefas |
| `tarefa_prints` | 11 | ❌ | ~0 | prints/evidências de tarefas |
| `tarefas_analise` | 12 | ✅ | ~0 | tarefas geradas pelo analista iFood |
| `tasks` | 21 | ✅ | ~0 | kanban interno da equipe |
| `task_comments` | 6 | ✅ | ~0 | comentários em tasks internas |
| `templates_tarefa` | 12 | ✅ | ~0 | templates de tarefas |
| `departments` | 7 | ✅ | ~0 | departamentos da equipe |
| `department_members` | 3 | ❌ | ~0 | membros por departamento |
| `notification_preferences` | 7 | ✅ | ~0 | preferências de notificação por user |
| `quick_replies` | 6 | ✅ | ~0 | respostas rápidas pré-definidas |
| `sugestoes_plataforma` | 6 | ✅ | ~0 | sugestões da equipe |

---

### G — Análise iFood

| Tabela | Cols | Tenant? | Rows | Nota |
|--------|------|---------|------|------|
| `analises` | 29 | ✅ | 15 | relatórios de análise iFood por loja |
| `loja_gpt_conversations` | 11 | ✅ | ~9 | conversas com o loja-gpt (especialista por loja) |
| `loja_gpt_messages` | 13 | ✅ | ~16 | mensagens do loja-gpt |

---

### H — DELI

| Tabela | Cols | Tenant? | Rows | Nota |
|--------|------|---------|------|------|
| `deli_agenda` | 8 | ✅ | 10 | agenda/eventos DELI |
| `deli_messages` | 7 | ✅ | ~2 | mensagens internas da DELI |
| `deli_triggers` | 10 | ✅ | ~0 | triggers de autonomia (Verde/Amarelo/Vermelho) — VAZIO |
| `deli_pending_approvals` | 14 | ✅ | ~0 | aprovações pendentes DELI — VAZIO |
| `deli_actions_log` | 11 | ✅ | 0 | log de ações DELI — VAZIO |

> ⚠️ `deli_triggers` VAZIO: seed de triggers não foi executado. DELI roda sem regras de autonomia.
> (CLAUDE.md §16 lista triggers iniciais: Verde 7 dias, Amarelo métrica -20%, Vermelho config)
> ⚠️ `deli_pending_approvals` VAZIO: fluxo de aprovação não ativado.

---

### I — VERA

| Tabela | Cols | Tenant? | Rows | Nota |
|--------|------|---------|------|------|
| `vera_reports` | 13 | ✅ | ~3 | relatórios VERA gerados |
| `vera_anomalias` | 11 | ✅ | ~0 | anomalias detectadas por VERA |
| `vera_metricas_snapshot` | 5 | ✅ | ~3 | snapshots de métricas VERA |

> VERA tem 77 runs com 100% sucesso mas apenas 3 reports/snapshots. Maioria das runs
> provavelmente usa agent_runs como único registro (output salvo em output jsonb).

---

### J — CORA (Cobrança)

| Tabela | Cols | Tenant? | Rows | Nota |
|--------|------|---------|------|------|
| `cora_acoes` | 15 | ✅ | ~3 | ações de cobrança propostas |
| `cora_cobrancas` | 16 | ✅ | ~1 | cobranças CORA |
| `cora_reguas` | 7 | ✅ | 0 | regras de cobrança — VAZIO |
| `cobrancas` | 17 | ✅ | 1 | cobranças Asaas |
| `cobranca_eventos` | 9 | ✅ | 1 | eventos de cobrança (webhook Asaas) |
| `inadimplencias` | 13 | ✅ | ~0 | inadimplências detectadas |
| `inadimplencia_messages` | 7 | ✅ | ~0 | mensagens de inadimplência |
| `regua_cobranca` | 8 | ✅ | ~0 | régua de cobrança |
| `reguas` | 14 | ✅ | ~0 | regras de automação |

> CORA POC: 1 run, poucos dados. `cora_reguas` vazio → cobrança sem regras configuradas.

---

### K — LARA / Marketing (schema existente, 0 dados)

| Tabela | Cols | Tenant? | Rows | Nota |
|--------|------|---------|------|------|
| `campanhas` | 26 | ✅ | 0 | campanhas de marketing |
| `campanha_ativos` | 11 | ✅ | 0 | ativos de campanha |
| `nexus_requests` | 12 | ✅ | ~0 | sub-agentes NEXUS (LARA) |
| `marca_pesquisa` | 9 | ✅ | ~0 | pesquisa de marca |

---

### L — SOFIA / Prospects (schema existente, 0 dados)

| Tabela | Cols | Tenant? | Rows | Nota |
|--------|------|---------|------|------|
| `prospects` | 19 | ✅ | ~0 | prospects SDR |
| `prospect_abordagens` | 10 | ✅ | ~0 | abordagens a prospects |
| `prospect_pesquisas` | 6 | ✅ | ~0 | pesquisas sobre prospects |
| `lead_lists` | 5 | ✅ | ~0 | listas de leads |
| `lead_list_members` | 3 | ❌ | ~0 | membros de lista de leads |
| `lead_tags` | 5 | ✅ | ~0 | tags de leads |

---

### M — NOVA (schema existente, 0 dados)

| Tabela | Cols | Tenant? | Rows | Nota |
|--------|------|---------|------|------|
| `nova_blueprints` | 16 | ✅ | ~0 | blueprints de onboarding NOVA |

---

### N — MAX (schema existente, 0 dados)

| Tabela | Cols | Tenant? | Rows | Nota |
|--------|------|---------|------|------|
| `max_knowledge_base` | 9 | ✅ | ~0 | base de conhecimento MAX |

---

### O — BRENO (schema existente, 0 dados)

| Tabela | Cols | Tenant? | Rows | Nota |
|--------|------|---------|------|------|
| `breno_interactions` | 13 | ✅ | 0 | interações BRENO — VAZIO (BRENO nunca rodou) |

---

### P — Orders / Asaas

| Tabela | Cols | Tenant? | Rows | Nota |
|--------|------|---------|------|------|
| `orders` | 13 | ✅ | ~0 | pedidos (futuro) |

---

### Q — Views analíticas

| View | Cols | Tenant? | Nota |
|------|------|---------|------|
| `v_chart_7d` | 3 | ✅ | gráfico 7 dias — ⚠️ sem migration no repo |
| `v_dashboard_kpis` | 10 | ✅ | KPIs do dashboard — ⚠️ sem migration no repo |
| `view_metricas_agentes_dia` | 8 | ✅ | métricas agentes por dia |
| `view_metricas_conversas_dia` | 5 | ✅ | métricas conversas por dia |
| `view_metricas_negocio_dia` | 5 | ✅ | métricas negócio por dia |

> ⚠️ `v_chart_7d` e `v_dashboard_kpis` existem em produção mas NÃO têm migration rastreável no repo.
>   Foram criadas diretamente via Supabase Dashboard (sem versionamento no git).
>   As demais 3 views têm migration: `20260515_026_vera_views.sql`.

---

## TABELAS VAZIAS — DESTAQUE (T5)

Tabelas com schema criado mas 0 rows em produção, agrupadas por implicação:

### Críticas (funcionais degradadas hoje)
| Tabela | Por que importa |
|--------|----------------|
| `tenant_agent_config` | BRENO não lê config → TD#42 |
| `deli_triggers` | DELI sem regras de autonomia Verde/Amarelo/Vermelho |
| `cora_reguas` | CORA sem regras de cobrança |
| `roles` / `role_permissions` / `user_roles` | RBAC schema criado, sem dados → permissões não aplicadas via DB |
| `agent_drafts` | Fluxo de draft nunca ativado |

### Schema antecipado (features futuras)
| Tabela | Feature |
|--------|---------|
| `client_facts` / `client_timeline` | Memória Central (§14 CLAUDE.md) |
| `loja_metricas` | Ingestão de métricas (esperava n8n — removido da stack) |
| `nova_blueprints` | NOVA onboarding |
| `max_knowledge_base` | MAX consultor técnico |
| `campanhas` / `campanha_ativos` | LARA campanhas |
| `prospects` / `prospect_*` | SOFIA SDR |

---

## MIGRATIONS APLICADAS

Para contexto, as migrations identificadas no código:

| Migration | Criação principal |
|-----------|------------------|
| 20260504_001_rbac | roles, user_roles, role_permissions, user_agent_access, audit_log |
| 20260504_002_memoria_central | client_facts, client_timeline, loja_metricas |
| 20260504_003_whatsapp | whatsapp_contacts, whatsapp_groups, whatsapp_messages |
| 20260504_004_drafts_deli | agent_drafts, deli_triggers, deli_pending_approvals, deli_actions_log |
| 20260506_001_lara_regua | reguas, regua_cobranca, nexus_requests |
| 20260524_015_tarefa_aprovacoes_reaberta | ADD 'reaberta' ao check de tarefa_aprovacoes |
| ... (93 arquivos total) | ... |

Total migrations: **93 arquivos .sql** (20260426 a 20260602, verificado via Glob)

> Nota: `v_chart_7d` e `v_dashboard_kpis` são views existentes em produção mas SEM migration
> correspondente no repo — criadas diretamente no Supabase Dashboard. Risco de perda em recreate.

---

## TECH DEBTS IDENTIFICADOS EM T4

| TD | Severidade | Descrição |
|----|-----------|-----------|
| TD#49 | 🟡 Média | `deli_triggers` sem seed em produção — DELI opera sem regras de autonomia configuradas |
| TD#50 | 🟡 Média | `roles`/`role_permissions`/`user_roles` vazios — RBAC schema ativo mas sem dados; RequireRole no React pode não ter base de dados real |
| TD#51 | 🔵 Observação | `loja_metricas` VAZIO — esperava ingestão via n8n (removido da stack). VERA usa `vera_metricas_snapshot` alternativo |
| TD#52 | 🔵 Observação | `client_facts`/`client_timeline` VAZIOS — Memória Central (CLAUDE.md §14) nunca populada; nenhum agente escreveu fatos sobre lojas |
| TD#53 | 🔵 Observação | pg_stat stale para várias tabelas (customers, whatsapp_groups, analises) — ANALYZE não roda frequentemente; monitoramento de rowcounts via pg_stat é não-confiável |

---

*Gerado em: 2026-05-24 | S1-G00 T4*
