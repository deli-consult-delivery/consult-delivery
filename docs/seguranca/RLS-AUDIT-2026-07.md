# Auditoria RLS geral — 2026-07-06/07

**Escopo:** todas as 177 tabelas de `public` no schema de prod, a partir de `supabase/migrations/00000000000000_baseline.sql` (squash de 2026-07-05, PR #746) + todas as migrations aplicadas desde então (`20260630_001` até `20260706_010`). Sem amostragem — as 177 linhas estão listadas no apêndice.

**Gatilho:** na sessão de 2026-07-06 fechamos 3 buracos por acaso (`reviews` com `USING(true)` + INSERT/UPDATE abertos pra `anon`, ver #757/#764; `evolution_instances.api_key` legível via PostgREST, ver #761). Se 3 apareceram sem procurar, valia varrer tudo — este documento é o resultado dessa varredura.

**Metodologia:** parser determinístico (`node`, script descartável, não versionado) sobre o baseline extraindo: toda `CREATE TABLE` (+ colunas), todo `ENABLE/FORCE ROW LEVEL SECURITY`, toda `CREATE POLICY` (comando, `TO`, `USING`, `WITH CHECK`) e todo `GRANT`. Critérios de risco (brief): (a) RLS habilitada?, (b) `USING(true)`/`WITH CHECK(true)` — pra qual role? `anon`? `authenticated`? **policy sem `TO` = vale pra `PUBLIC`, ou seja `anon` E `authenticated` juntos**, (c) colunas sensíveis (`key`/`token`/`secret`/`password`/`api_`) legíveis por `anon`/`authenticated`, (d) GRANTs largos. Todo achado com `USING`/`WITH CHECK` literalmente `true` foi cruzado com a lista final de classificação — **zero tabelas com policy aberta ficaram fora do P0/P1/FECHADO abaixo** (conferido programaticamente, não por amostragem).

**Classificação:** P0 = dado exposto/gravável cross-tenant ou por `anon` (sem login). P1 = exposto para qualquer `authenticated` além do necessário, mas não pra `anon`/sem login. P2 = hardening (não é vazamento real hoje).

---

## P0 — corrigidos nesta PR (migrations, não aplicadas)

### P0-1 — `messages`: policy solta anula o escopo por tenant

- **Evidência:** `public.messages` tem 4 policies corretas (`messages_select_tenant`, `messages_insert_tenant`, `messages_update_tenant` via `accessible_tenant_ids()`; `messages_member_all` via `is_member_of()`) **e também** `"messages_auth_all" FOR ALL TO authenticated USING (true) WITH CHECK (true)` (baseline linha ~11380). Policies permissivas do Postgres se combinam com `OR` — a 5ª policy sozinha libera **qualquer usuário autenticado, de qualquer tenant**, a ler/editar/apagar qualquer mensagem de qualquer conversa de WhatsApp de qualquer outro tenant. É o conteúdo real das conversas com clientes — o maior blast radius do lote.
- **Consumidores (grep `.from('messages')`, 32 ocorrências, 10 arquivos):** `src/console/ChatV2.jsx`, `src/console/chat/ChatAoVivoV2.jsx`, `src/console/chat/engine/{useAcoesMsg,useConversas,useEnvio,useEvolutionHealth,useIA,useThread}.js`, `src/lib/api.js`, `src/screens/ChatScreen.jsx`. Todas as queries reais filtram por `tenant_id` ou `conversation_id` — nenhuma depende do acesso irrestrito.
- **Fix:** `supabase/migrations/20260706_011_messages_drop_redundant_auth_all.sql` — `DROP POLICY "messages_auth_all"`. As 4 policies restantes continuam cobrindo 100% do acesso legítimo.

### P0-2 — `deli_agenda`: policy de INSERT "nomeada" pra service_role mas sem `TO`

- **Evidência:** policy `"service role can insert deli_agenda" FOR INSERT WITH CHECK (true)` — **sem `TO service_role`**, então vale pra `PUBLIC` (inclusive `anon`, a chave pública embutida no bundle). Qualquer um na internet, sem login, insere linhas arbitrárias em `deli_agenda` pra **qualquer `tenant_id`** (sem validação de pertencimento). Mesmo padrão de bug do `service_full_access` de `reviews` (nome sugere um escopo que o `CREATE POLICY` não tem).
- **Consumidores:** único INSERT real no repo é `trigger/deli/revisao-matinal.ts`, via `getSupabase()` (`trigger/_shared/supabase.ts`) usando `SUPABASE_SERVICE_ROLE_KEY` — `service_role` tem `BYPASSRLS` por padrão no Supabase, **nunca dependeu desta policy**. `src/console/Deli.jsx` e `src/screens/DeliScreen.jsx` só fazem `.select()` (confirmado por grep) — nenhum INSERT de app.
- **Risco de negócio:** `deli_agenda` alimenta o que a DELI (COO digital) mostra como "revisão matinal"/alertas/ações sugeridas — um atacante anônimo poderia injetar uma recomendação falsa da DELI.
- **Fix:** `supabase/migrations/20260706_012_deli_agenda_insert_service_role_scope.sql` — recria a policy com `TO service_role`. Redundante para quem já bypassa RLS; fecha o buraco sem afetar ninguém real.

### P0-3 — Canais internos (`channel_members`, `channel_messages`, `internal_channels`): sem `TO`, abertos pra `anon`

- **Evidência:** as 3 tabelas do chat interno da equipe têm policy `FOR ALL` sem `TO` + `USING(true)`/`WITH CHECK(true)` (`allow_all_channel_members`, `allow_all_channel_messages`, `allow_all_internal_channels`). Com a anon key pública no bundle (GitHub Pages), **qualquer pessoa na internet, sem login**, lê/escreve/apaga qualquer linha: quem está em qual canal, e o conteúdo do chat interno (mensagens, `media_url`).
- **Consumidores:** `src/console/chat/engine/useCanaisInternos.js` (`internal_channels`, `channel_messages`), `src/console/Grupos.jsx` (`channel_members`), `src/console/chat/ChatAoVivoV2.jsx`, `src/screens/ChatScreen.jsx`, `src/App.jsx` (subscribe realtime). Todos dentro do Console (`ConsoleV2`), só alcançável após login — `App.jsx` só roteia `LoginScreen`/`ResetPasswordScreen`/`ConsoleV2`. Nenhum consumidor anônimo legítimo.
- **Fix:** `supabase/migrations/20260706_013_canais_internos_remove_anon_access.sql` — troca `PUBLIC` por `TO authenticated`, **mantendo `USING(true)`** (zero mudança de comportamento pra quem já usa logado). Escopo fino por membership de canal fica como **débito P1** — ver abaixo.

---

## FECHADO nesta sessão (referência, sem ação nova aqui)

| Tabela | O que era | Migrations | PR |
|---|---|---|---|
| `reviews` | `service_full_access` sem `TO` (valia pra todos); `anon_select` dump completo via anon; `anon_insert`/`anon_update` sem filtro (qualquer review, qualquer tenant) | `20260706_007`, `20260706_008_reviews_anon_write_scope`, `20260706_009` | #757 → #764 |
| `evolution_instances` | `api_key`/`evolution_url` legíveis via PostgREST (`?select=api_key`) apesar de o front não usar mais essas colunas | `20260706_008_evolution_instances_column_privileges` (REVOKE/GRANT por coluna) | #761 |

---

## P1 — exposto além do necessário (authenticated, sem `anon`) — documentado, sem migration nesta PR

| Tabela | Policy | Exposição | Colunas sensíveis | Nota |
|---|---|---|---|---|
| `onboarding_wizard_sessions` | `wizard_sessions_authenticated_select` (`SELECT TO authenticated USING(true)`) | Qualquer usuário logado (qualquer tenant) vê `email`/`whatsapp`/`cnpj`/`nome_negocio`/`faturamento_mensal_range` de **todos** os leads em onboarding, de todos os tenants | `email`, `cnpj` | PII de prospecção — sem `tenant_id` na tabela, precisa de coluna nova ou lógica de dono antes de escopar |
| `val_desempenho_coleta` | `val_desempenho_read` (`SELECT TO authenticated USING(true)`) | Qualquer logado vê métricas de desempenho de **todas** as lojas monitoradas (não só as suas) | — | Dado operacional interno (QA/homologação iFood), não é dado de cliente; sem coluna `tenant_id` na tabela (só `loja` texto) |
| `val_kpi_coleta_diaria` | `val_kpi_read` (idem) | Idem, KPIs diários (pedidos/cancelamentos/semáforo) de todas as lojas | — | Idem — mesma raiz (tabelas de validação do GESTOR, criadas fora do modelo multi-tenant) |

**Por que não entrou nesta PR:** o brief pediu migration só pra P0. Os 3 P1 acima exigem decisão de produto (criar coluna de dono/tenant nas tabelas de validação; ou aceitar que são ferramentas internas de uso único-equipe e documentar como aceito) antes de escrever a policy certa — proponho como próxima rodada.

---

## P2 / observações de hardening (não são vazamento hoje)

- **`GRANT ALL` para `anon`/`authenticated` é o padrão em TODAS as 177 tabelas** (235 grants pra `anon`, 237 pra `authenticated` — praticamente 1:1 por tabela). É o dump padrão do Supabase CLI (`supabase db dump`) — a proteção real vem inteiramente do RLS, não do GRANT. Implicação prática: **qualquer bug de RLS = exposição total daquela tabela** (foi exatamente o padrão dos 5 P0 achados). Não recomendo revogar os GRANTs largos em massa (mudança de arquitetura fora do pedido) — mas vale o registro: a superfície de risco real é 100% "toda policy está certa?", não "o GRANT está certo?".
- **`breno_triagem` (`service_role_full`, `TO service_role`, `USING(true)`)** — plenamente correto: `service_role` já bypassa RLS por padrão, a policy é só segurança-em-profundidade. Mesmo padrão saudável que os fixes de `reviews`/`deli_agenda` restauraram.
- **Colunas com "token"/"key" no nome que NÃO são risco** (falso-positivo do grep amplo, verificado manualmente): `agents.custom_max_tokens`, `content_drafts.tokens_gastos`, `heartbeat_runs.tokens_used`, `heartbeats.max_tokens`, `loja_gpt_messages.tokens_input/output`, `mia_audit_log.tokens_in/out` — todas são **contagem de tokens de LLM** (billing/uso), não segredos. `client_facts.key` (chave de fato genérico tipo "meta_faturamento"), `deli_pending_approvals.dedup_key` (deduplicação), `tenant_modules.module_key` (identificador de módulo tipo `"analise-ifood"`) — nomes, não segredos.
- **Colunas com "token" que SÃO capability-tokens (padrão correto, verificado):** `analises.public_token`, `atendimento_avaliacoes.public_token`, `nps_avaliacoes.public_token`, `reviews.token` (agora fechado) — todas com policies de leitura escopadas por tenant (`accessible_tenant_ids()`), então diferente de `reviews` antes do fix, **não há SELECT aberto por `anon` que permita descobrir o token de outra loja por enumeração**. `vendaerp_instances.token_ref` é uma referência/ponteiro pro sistema externo (não o segredo em si) e a tabela só tem `SELECT` escopada por `is_member_of(tenant_id)`.
- **`avaliacao_config.datacrazy_api_key`, `crm_webhook_tokens.token_hash`, `push_subscriptions.auth_key`** — todas com policies corretamente escopadas (`has_rbac_role_in_hierarchy`, `accessible_tenant_ids()`, `user_id = auth.uid()` respectivamente). Sem ação necessária.

---

## Apêndice — todas as 177 tabelas de `public`

Legenda: RLS = `ENABLE ROW LEVEL SECURITY` presente (todas as 177 têm). "Policies" resume comando/role de cada policy da tabela (role `PUBLIC(sem TO!)` = sem cláusula `TO`, vale pra `anon` **e** `authenticated` — só é problema quando o `USING`/`WITH CHECK` também é `true`, que é exatamente o que este documento cobre acima; nas demais o `USING` filtra por tenant/membership mesmo sem `TO` explícito).

| Tabela | RLS | Policies (cmd/role) | Classificação |
|---|---|---|---|
| `aceite_recontratacao` | ✅ | ALL/PUBLIC(sem TO!) | OK |
| `agent_action_approvals` | ✅ | ALL/PUBLIC(sem TO!) | OK |
| `agent_actions` | ✅ | ALL/PUBLIC(sem TO!) | OK |
| `agent_chat_messages` | ✅ | ALL/PUBLIC(sem TO!); INSERT/PUBLIC(sem TO!); SELECT/PUBLIC(sem TO!) | OK |
| `agent_corrections` | ✅ | ALL/PUBLIC(sem TO!) | OK |
| `agent_drafts` | ✅ | INSERT/PUBLIC(sem TO!); SELECT/PUBLIC(sem TO!); UPDATE/PUBLIC(sem TO!) | OK |
| `agent_knowledge_base` | ✅ | ALL/PUBLIC(sem TO!) | OK |
| `agent_memories` | ✅ | ALL/PUBLIC(sem TO!); SELECT/PUBLIC(sem TO!) | OK |
| `agent_prompts` | ✅ | SELECT/PUBLIC(sem TO!) | OK |
| `agent_runs` | ✅ | ALL/PUBLIC(sem TO!); SELECT/PUBLIC(sem TO!) | OK |
| `agent_skills` | ✅ | SELECT/PUBLIC(sem TO!); ALL/PUBLIC(sem TO!) | OK |
| `agent_ticket_activity` | ✅ | ALL/PUBLIC(sem TO!) | OK |
| `agent_ticket_comments` | ✅ | ALL/PUBLIC(sem TO!) | OK |
| `agent_tickets` | ✅ | ALL/PUBLIC(sem TO!) | OK |
| `agente_analises` | ✅ | INSERT/PUBLIC(sem TO!); SELECT/PUBLIC(sem TO!) | OK |
| `agents` | ✅ | DELETE/authenticated; INSERT/authenticated; SELECT/authenticated; UPDATE/authenticated | OK |
| `analise_loja` | ✅ | INSERT/PUBLIC(sem TO!); SELECT/PUBLIC(sem TO!) | OK |
| `analises` | ✅ | ALL/PUBLIC(sem TO!) | OK |
| `asaas_eventos` | ✅ | ALL/PUBLIC(sem TO!) | OK |
| `atendimento_avaliacoes` | ✅ | INSERT/PUBLIC(sem TO!); SELECT/PUBLIC(sem TO!); UPDATE/PUBLIC(sem TO!); INSERT/PUBLIC(sem TO!); SELECT/PUBLIC(sem TO!); UPDATE/PUBLIC(sem TO!) | OK |
| `audit_log` | ✅ | INSERT/PUBLIC(sem TO!); SELECT/PUBLIC(sem TO!) | OK |
| `avaliacao_config` | ✅ | ALL/PUBLIC(sem TO!); SELECT/PUBLIC(sem TO!) | OK |
| `avaliacoes` | ✅ | INSERT/PUBLIC(sem TO!); SELECT/PUBLIC(sem TO!); UPDATE/PUBLIC(sem TO!) | OK |
| `avaliacoes_loja_config` | ✅ | INSERT/PUBLIC(sem TO!); SELECT/PUBLIC(sem TO!); UPDATE/PUBLIC(sem TO!) | OK |
| `bom_dia_config` | ✅ | INSERT/PUBLIC(sem TO!); SELECT/PUBLIC(sem TO!); UPDATE/PUBLIC(sem TO!) | OK |
| `bom_dia_feedback` | ✅ | DELETE/PUBLIC(sem TO!); INSERT/PUBLIC(sem TO!); SELECT/PUBLIC(sem TO!); UPDATE/PUBLIC(sem TO!) | OK |
| `bot_configs` | ✅ | ALL/PUBLIC(sem TO!); SELECT/PUBLIC(sem TO!) | OK |
| `bot_reply_log` | ✅ | ALL/PUBLIC(sem TO!) | OK |
| `breno_interactions` | ✅ | ALL/PUBLIC(sem TO!) | OK |
| `breno_message_buffer` | ✅ | ALL/PUBLIC(sem TO!) | OK |
| `breno_triagem` | ✅ | ALL/service_role; ALL/PUBLIC(sem TO!) | OK |
| `campanha_ativos` | ✅ | ALL/PUBLIC(sem TO!); ALL/authenticated | OK |
| `campanhas` | ✅ | ALL/PUBLIC(sem TO!); ALL/authenticated | OK |
| `channel_members` | ✅ | ALL/PUBLIC(sem TO!) | **P0** |
| `channel_messages` | ✅ | ALL/PUBLIC(sem TO!) | **P0** |
| `chat_tasks` | ✅ | ALL/PUBLIC(sem TO!) | OK |
| `client_facts` | ✅ | DELETE/PUBLIC(sem TO!); INSERT/PUBLIC(sem TO!); SELECT/PUBLIC(sem TO!); UPDATE/PUBLIC(sem TO!) | OK |
| `client_tasks` | ✅ | ALL/authenticated; ALL/PUBLIC(sem TO!) | OK |
| `client_timeline` | ✅ | INSERT/PUBLIC(sem TO!); SELECT/PUBLIC(sem TO!) | OK |
| `cobranca_eventos` | ✅ | INSERT/PUBLIC(sem TO!); SELECT/PUBLIC(sem TO!) | OK |
| `cobrancas` | ✅ | ALL/PUBLIC(sem TO!) | OK |
| `contact_optout` | ✅ | ALL/PUBLIC(sem TO!) | OK |
| `contact_tags` | ✅ | ALL/PUBLIC(sem TO!) | OK |
| `contatos` | ✅ | ALL/PUBLIC(sem TO!) | OK |
| `content_calendar` | ✅ | ALL/PUBLIC(sem TO!) | OK |
| `content_drafts` | ✅ | ALL/PUBLIC(sem TO!) | OK |
| `content_published` | ✅ | ALL/PUBLIC(sem TO!) | OK |
| `contratos` | ✅ | ALL/PUBLIC(sem TO!) | OK |
| `conversation_events` | ✅ | ALL/PUBLIC(sem TO!) | OK |
| `conversation_status_log` | ✅ | ALL/PUBLIC(sem TO!) | OK |
| `conversation_tags` | ✅ | ALL/PUBLIC(sem TO!) | OK |
| `conversations` | ✅ | DELETE/PUBLIC(sem TO!); INSERT/PUBLIC(sem TO!); ALL/PUBLIC(sem TO!); SELECT/PUBLIC(sem TO!); UPDATE/PUBLIC(sem TO!); UPDATE/PUBLIC(sem TO!) | OK |
| `cora_acoes` | ✅ | ALL/PUBLIC(sem TO!) | OK |
| `cora_cobrancas` | ✅ | ALL/PUBLIC(sem TO!) | OK |
| `cora_reguas` | ✅ | ALL/PUBLIC(sem TO!) | OK |
| `crm_notas` | ✅ | DELETE/PUBLIC(sem TO!); INSERT/PUBLIC(sem TO!); SELECT/PUBLIC(sem TO!); UPDATE/PUBLIC(sem TO!) | OK |
| `crm_webhook_tokens` | ✅ | ALL/authenticated | OK |
| `custom_field_values` | ✅ | ALL/PUBLIC(sem TO!) | OK |
| `custom_fields` | ✅ | ALL/PUBLIC(sem TO!) | OK |
| `customer_addresses` | ✅ | ALL/PUBLIC(sem TO!) | OK |
| `customer_group_members` | ✅ | SELECT/PUBLIC(sem TO!); ALL/PUBLIC(sem TO!) | OK |
| `customer_groups` | ✅ | SELECT/PUBLIC(sem TO!); ALL/PUBLIC(sem TO!) | OK |
| `customer_note_entries` | ✅ | ALL/PUBLIC(sem TO!) | OK |
| `customer_notes` | ✅ | ALL/PUBLIC(sem TO!) | OK |
| `customer_tag_relations` | ✅ | ALL/PUBLIC(sem TO!) | OK |
| `customer_tags` | ✅ | ALL/PUBLIC(sem TO!) | OK |
| `customers` | ✅ | ALL/PUBLIC(sem TO!) | OK |
| `daily_kpis` | ✅ | SELECT/PUBLIC(sem TO!) | OK |
| `defesa_aprovadores` | ✅ | DELETE/PUBLIC(sem TO!); INSERT/PUBLIC(sem TO!); SELECT/PUBLIC(sem TO!); UPDATE/PUBLIC(sem TO!) | OK |
| `defesa_assinaturas` | ✅ | INSERT/PUBLIC(sem TO!); SELECT/PUBLIC(sem TO!) | OK |
| `defesa_casos` | ✅ | INSERT/PUBLIC(sem TO!); SELECT/PUBLIC(sem TO!); UPDATE/PUBLIC(sem TO!) | OK |
| `deli_actions_log` | ✅ | INSERT/PUBLIC(sem TO!); SELECT/PUBLIC(sem TO!) | OK |
| `deli_agenda` | ✅ | INSERT/PUBLIC(sem TO!); SELECT/PUBLIC(sem TO!) | **P0** |
| `deli_messages` | ✅ | ALL/PUBLIC(sem TO!); SELECT/PUBLIC(sem TO!) | OK |
| `deli_pending_approvals` | ✅ | INSERT/PUBLIC(sem TO!); SELECT/PUBLIC(sem TO!); UPDATE/PUBLIC(sem TO!) | OK |
| `deli_triggers` | ✅ | ALL/PUBLIC(sem TO!); SELECT/PUBLIC(sem TO!) | OK |
| `department_members` | ✅ | ALL/PUBLIC(sem TO!) | OK |
| `departments` | ✅ | ALL/PUBLIC(sem TO!) | OK |
| `encerramento_config` | ✅ | INSERT/PUBLIC(sem TO!); SELECT/PUBLIC(sem TO!); UPDATE/PUBLIC(sem TO!) | OK |
| `espacos_columns` | ✅ | ALL/authenticated | OK |
| `espacos_folders` | ✅ | ALL/authenticated | OK |
| `espacos_lists` | ✅ | ALL/authenticated | OK |
| `espacos_workspaces` | ✅ | ALL/PUBLIC(sem TO!) | OK |
| `estudio_criacoes` | ✅ | INSERT/PUBLIC(sem TO!); SELECT/PUBLIC(sem TO!); UPDATE/PUBLIC(sem TO!) | OK |
| `evolution_instances` | ✅ | ALL/PUBLIC(sem TO!); SELECT/PUBLIC(sem TO!); SELECT/PUBLIC(sem TO!) | FECHADO (#761) |
| `goal_tasks` | ✅ | ALL/PUBLIC(sem TO!) | OK |
| `goals` | ✅ | ALL/PUBLIC(sem TO!) | OK |
| `heartbeat_runs` | ✅ | ALL/PUBLIC(sem TO!) | OK |
| `heartbeats` | ✅ | ALL/PUBLIC(sem TO!) | OK |
| `ifood_merchants` | ✅ | ALL/PUBLIC(sem TO!) | OK |
| `inadimplencia_messages` | ✅ | ALL/PUBLIC(sem TO!) | OK |
| `inadimplencias` | ✅ | ALL/PUBLIC(sem TO!) | OK |
| `internal_channels` | ✅ | ALL/PUBLIC(sem TO!) | **P0** |
| `internal_notifications` | ✅ | SELECT/PUBLIC(sem TO!); UPDATE/PUBLIC(sem TO!) | OK |
| `lead_list_members` | ✅ | ALL/PUBLIC(sem TO!) | OK |
| `lead_lists` | ✅ | ALL/PUBLIC(sem TO!) | OK |
| `lead_tags` | ✅ | ALL/PUBLIC(sem TO!) | OK |
| `leads` | ✅ | ALL/PUBLIC(sem TO!); ALL/PUBLIC(sem TO!) | OK |
| `loja_consultores` | ✅ | ALL/PUBLIC(sem TO!); SELECT/PUBLIC(sem TO!) | OK |
| `loja_gpt_conversations` | ✅ | INSERT/PUBLIC(sem TO!); SELECT/PUBLIC(sem TO!); UPDATE/PUBLIC(sem TO!) | OK |
| `loja_gpt_messages` | ✅ | SELECT/PUBLIC(sem TO!) | OK |
| `loja_metricas` | ✅ | DELETE/PUBLIC(sem TO!); INSERT/PUBLIC(sem TO!); SELECT/PUBLIC(sem TO!); UPDATE/PUBLIC(sem TO!) | OK |
| `loja_metricas_snapshot` | ✅ | ALL/PUBLIC(sem TO!); SELECT/PUBLIC(sem TO!) | OK |
| `loja_whatsapp_vinculo` | ✅ | ALL/PUBLIC(sem TO!) | OK |
| `lojas` | ✅ | DELETE/PUBLIC(sem TO!); INSERT/PUBLIC(sem TO!); SELECT/PUBLIC(sem TO!); UPDATE/PUBLIC(sem TO!) | OK |
| `marca_pesquisa` | ✅ | ALL/PUBLIC(sem TO!); ALL/authenticated | OK |
| `max_knowledge_base` | ✅ | SELECT/PUBLIC(sem TO!); ALL/PUBLIC(sem TO!) | OK |
| `messages` | ✅ | ALL/authenticated; INSERT/PUBLIC(sem TO!); ALL/PUBLIC(sem TO!); SELECT/PUBLIC(sem TO!); UPDATE/PUBLIC(sem TO!) | **P0** |
| `mia_analises` | ✅ | ALL/PUBLIC(sem TO!) | OK |
| `mia_audit_log` | ✅ | SELECT/PUBLIC(sem TO!) | OK |
| `missions` | ✅ | ALL/PUBLIC(sem TO!) | OK |
| `nexus_requests` | ✅ | ALL/PUBLIC(sem TO!); ALL/authenticated | OK |
| `notification_preferences` | ✅ | ALL/PUBLIC(sem TO!) | OK |
| `nova_blueprints` | ✅ | ALL/PUBLIC(sem TO!) | OK |
| `nps_avaliacoes` | ✅ | INSERT/PUBLIC(sem TO!); SELECT/PUBLIC(sem TO!); UPDATE/PUBLIC(sem TO!) | OK |
| `onboarding_checklists` | ✅ | ALL/authenticated | OK |
| `onboarding_templates` | ✅ | SELECT/authenticated | OK |
| `onboarding_wizard_sessions` | ✅ | SELECT/authenticated | **P1** |
| `oracle_drafts` | ✅ | INSERT/PUBLIC(sem TO!); SELECT/PUBLIC(sem TO!); UPDATE/PUBLIC(sem TO!) | OK |
| `orders` | ✅ | ALL/PUBLIC(sem TO!) | OK |
| `profiles` | ✅ | SELECT/PUBLIC(sem TO!); UPDATE/PUBLIC(sem TO!); SELECT/PUBLIC(sem TO!) | OK |
| `projects` | ✅ | ALL/PUBLIC(sem TO!) | OK |
| `prospect_abordagens` | ✅ | SELECT/PUBLIC(sem TO!); ALL/PUBLIC(sem TO!) | OK |
| `prospect_pesquisas` | ✅ | SELECT/PUBLIC(sem TO!); ALL/PUBLIC(sem TO!) | OK |
| `prospects` | ✅ | SELECT/PUBLIC(sem TO!); ALL/PUBLIC(sem TO!) | OK |
| `push_subscriptions` | ✅ | ALL/PUBLIC(sem TO!) | OK |
| `quick_replies` | ✅ | ALL/PUBLIC(sem TO!); SELECT/PUBLIC(sem TO!); SELECT/PUBLIC(sem TO!); ALL/authenticated | OK |
| `radar_fontes` | ✅ | INSERT/PUBLIC(sem TO!); SELECT/PUBLIC(sem TO!) | OK |
| `radar_metricas` | ✅ | SELECT/PUBLIC(sem TO!) | OK |
| `radar_series` | ✅ | SELECT/PUBLIC(sem TO!) | OK |
| `regua_cobranca` | ✅ | DELETE/PUBLIC(sem TO!); INSERT/PUBLIC(sem TO!); UPDATE/PUBLIC(sem TO!); SELECT/PUBLIC(sem TO!) | OK |
| `reguas` | ✅ | ALL/PUBLIC(sem TO!); ALL/authenticated | OK |
| `reviews` | ✅ | RPC por token (get/update_review_by_token); SELECT+UPDATE `TO authenticated` escopado à agência | FECHADO (#757→#764) |
| `role_permissions` | ✅ | ALL/PUBLIC(sem TO!); SELECT/PUBLIC(sem TO!) | OK |
| `roles` | ✅ | DELETE/PUBLIC(sem TO!); INSERT/PUBLIC(sem TO!); SELECT/PUBLIC(sem TO!); UPDATE/PUBLIC(sem TO!) | OK |
| `sugestoes_ia` | ✅ | ALL/PUBLIC(sem TO!) | OK |
| `sugestoes_plataforma` | ✅ | INSERT/PUBLIC(sem TO!); SELECT/PUBLIC(sem TO!) | OK |
| `support_tickets` | ✅ | ALL/PUBLIC(sem TO!) | OK |
| `tarefa_anexos` | ✅ | DELETE/PUBLIC(sem TO!); INSERT/PUBLIC(sem TO!); SELECT/PUBLIC(sem TO!) | OK |
| `tarefa_aprovacoes` | ✅ | INSERT/PUBLIC(sem TO!); SELECT/PUBLIC(sem TO!) | OK |
| `tarefa_comentarios` | ✅ | INSERT/PUBLIC(sem TO!); DELETE/PUBLIC(sem TO!); UPDATE/PUBLIC(sem TO!); SELECT/PUBLIC(sem TO!) | OK |
| `tarefa_prints` | ✅ | INSERT/PUBLIC(sem TO!); DELETE/PUBLIC(sem TO!); SELECT/PUBLIC(sem TO!) | OK |
| `tarefa_revisoes` | ✅ | ALL/PUBLIC(sem TO!); SELECT/PUBLIC(sem TO!) | OK |
| `tarefas_analise` | ✅ | SELECT/PUBLIC(sem TO!); ALL/PUBLIC(sem TO!) | OK |
| `tarefas_loja` | ✅ | ALL/PUBLIC(sem TO!); SELECT/PUBLIC(sem TO!) | OK |
| `task_comments` | ✅ | ALL/PUBLIC(sem TO!) | OK |
| `tasks` | ✅ | ALL/PUBLIC(sem TO!) | OK |
| `templates` | ✅ | SELECT/PUBLIC(sem TO!); ALL/PUBLIC(sem TO!) | OK |
| `templates_tarefa` | ✅ | ALL/PUBLIC(sem TO!); SELECT/PUBLIC(sem TO!) | OK |
| `tenant_agent_config` | ✅ | ALL/PUBLIC(sem TO!) | OK |
| `tenant_agents` | ✅ | DELETE/PUBLIC(sem TO!); INSERT/PUBLIC(sem TO!); UPDATE/PUBLIC(sem TO!); SELECT/PUBLIC(sem TO!) | OK |
| `tenant_files` | ✅ | DELETE/PUBLIC(sem TO!); INSERT/PUBLIC(sem TO!); SELECT/PUBLIC(sem TO!); UPDATE/PUBLIC(sem TO!) | OK |
| `tenant_gatilhos` | ✅ | DELETE/PUBLIC(sem TO!); INSERT/PUBLIC(sem TO!); SELECT/PUBLIC(sem TO!); UPDATE/PUBLIC(sem TO!) | OK |
| `tenant_integracoes` | ✅ | SELECT/PUBLIC(sem TO!) | OK |
| `tenant_links` | ✅ | DELETE/PUBLIC(sem TO!); INSERT/PUBLIC(sem TO!); SELECT/PUBLIC(sem TO!); UPDATE/PUBLIC(sem TO!) | OK |
| `tenant_members` | ✅ | DELETE/PUBLIC(sem TO!); INSERT/PUBLIC(sem TO!); UPDATE/PUBLIC(sem TO!); SELECT/PUBLIC(sem TO!); INSERT/PUBLIC(sem TO!) | OK |
| `tenant_modules` | ✅ | DELETE/PUBLIC(sem TO!); INSERT/PUBLIC(sem TO!); SELECT/PUBLIC(sem TO!); UPDATE/PUBLIC(sem TO!) | OK |
| `tenant_provedores` | ✅ | SELECT/PUBLIC(sem TO!) | OK |
| `tenant_sistemas` | ✅ | SELECT/PUBLIC(sem TO!) | OK |
| `tenant_tarefas` | ✅ | DELETE/PUBLIC(sem TO!); INSERT/PUBLIC(sem TO!); SELECT/PUBLIC(sem TO!); UPDATE/PUBLIC(sem TO!) | OK |
| `tenant_topicos` | ✅ | DELETE/PUBLIC(sem TO!); INSERT/PUBLIC(sem TO!); SELECT/PUBLIC(sem TO!); UPDATE/PUBLIC(sem TO!) | OK |
| `tenants` | ✅ | DELETE/PUBLIC(sem TO!); INSERT/PUBLIC(sem TO!); SELECT/PUBLIC(sem TO!); UPDATE/PUBLIC(sem TO!) | OK |
| `user_agent_access` | ✅ | ALL/authenticated; SELECT/PUBLIC(sem TO!) | OK |
| `user_roles` | ✅ | ALL/PUBLIC(sem TO!); SELECT/PUBLIC(sem TO!) | OK |
| `user_screen_permissions` | ✅ | SELECT/PUBLIC(sem TO!); SELECT/PUBLIC(sem TO!) | OK |
| `val_desempenho_coleta` | ✅ | SELECT/authenticated | **P1** |
| `val_kpi_coleta_diaria` | ✅ | SELECT/authenticated | **P1** |
| `vendaerp_instances` | ✅ | SELECT/PUBLIC(sem TO!) | OK |
| `vendaerp_proposals` | ✅ | SELECT/PUBLIC(sem TO!) | OK |
| `vera_anomalias` | ✅ | SELECT/PUBLIC(sem TO!); ALL/PUBLIC(sem TO!) | OK |
| `vera_metricas_snapshot` | ✅ | SELECT/PUBLIC(sem TO!); ALL/PUBLIC(sem TO!) | OK |
| `vera_reports` | ✅ | SELECT/PUBLIC(sem TO!); ALL/PUBLIC(sem TO!) | OK |
| `whatsapp_aprovacao_sessions` | ✅ | UPDATE/PUBLIC(sem TO!); SELECT/PUBLIC(sem TO!) | OK |
| `whatsapp_contacts` | ✅ | INSERT/PUBLIC(sem TO!); SELECT/PUBLIC(sem TO!); UPDATE/PUBLIC(sem TO!) | OK |
| `whatsapp_group_members` | ✅ | ALL/PUBLIC(sem TO!); SELECT/PUBLIC(sem TO!) | OK |
| `whatsapp_groups` | ✅ | INSERT/PUBLIC(sem TO!); SELECT/PUBLIC(sem TO!); UPDATE/PUBLIC(sem TO!) | OK |
| `whatsapp_messages` | ✅ | INSERT/PUBLIC(sem TO!); SELECT/PUBLIC(sem TO!); UPDATE/PUBLIC(sem TO!) | OK |

**177/177 tabelas cobertas.** RLS habilitada em 100% (177/177) — nenhuma tabela roda sem RLS nenhuma.

---

## Migrations desta PR (branch `wandson/rls-audit-0607`, NÃO aplicadas)

1. `supabase/migrations/20260706_011_messages_drop_redundant_auth_all.sql`
2. `supabase/migrations/20260706_012_deli_agenda_insert_service_role_scope.sql`
3. `supabase/migrations/20260706_013_canais_internos_remove_anon_access.sql`

Cada uma: aditiva/reversível, idempotente, com teste de isolamento documentado no cabeçalho (não executado — a orquestradora aplica com teste real).
