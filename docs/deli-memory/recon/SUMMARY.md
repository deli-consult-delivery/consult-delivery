# S1-G00 — Reconhecimento: Sumário Executivo
Plataforma Consult Delivery | 2026-05-24 | Leitura: ~5 min

> Fonte autorativa: docs/deli-memory/recon/ (T1–T5). Em caso de conflito, leia o doc da task.
> Escopo: /root/consult-delivery + Supabase czyanilrverorwenikqw / tenant='consult'.
> EvoNexus ignorado (VPS, modo TESTE, não é parte do CD).

---

## NÚMEROS DO PROJETO

| Dimensão | Número |
|----------|--------|
| Migrations SQL | 93 (20260426 a 20260602) |
| Tabelas + views no banco | 103 |
| Tabelas com 0 rows (scaffolded) | 53 (52%) |
| Edge Functions deployadas | 5 (todas ACTIVE) |
| agent_runs total | 171 |
| Agents com runs em produção | 7 (VERA, DELI, analise-gerar-relatorio, bom-dia, encerramento, loja-gpt, cora) |
| Agents em código / 0 runs | 5 (BRENO, LARA, MAX, NOVA, SOFIA) |
| conversations | 105 |
| messages | 5058 |
| whatsapp_groups | 69 |
| lojas / customers | ~1172 / 1168 |
| Branches no remote | 54 (25 merged stale, 29 unmerged) |
| TODOs no código | 0 |

---

## O QUE FUNCIONA EM PRODUÇÃO

### Agentes ativos e saudáveis
| Agente | Runs | Success | Cron |
|--------|------|---------|------|
| VERA (BI + relatórios) | 77 | 100% | Diário |
| DELI (revisão matinal) | 11 | 91% | Diário |
| analise-gerar-relatorio | 5 | 100% | On-demand |
| loja-gpt | 7 | 100% | On-demand |
| cora | 1 | 100% | On-demand (POC) |

### Chat ao vivo
- Evolution webhook (`evolution-webhook` v43, 1297 linhas) processa 10 tipos de evento
- Mensagens em tempo real: conversations (105), messages (5058), whatsapp_messages (2449)
- Bot fora-de-horário via `bot_configs` + dedup atômico em `bot_reply_log`
- T6 aprovação de tarefas via WhatsApp: `whatsapp_aprovacao_sessions` (5 sessões ativas)

### BomDia + Encerramento
- Geração de imagem 100% funcional (Claude → Recraft V4.1 via OpenRouter → Storage)
- Último envio automático bem-sucedido: BomDia 2026-05-22 12:00 UTC / Encerramento 2026-05-22 14:06 UTC
- **Scheduler FALHANDO desde 2026-05-23** (ver Problemas Críticos)

---

## PROBLEMAS CRÍTICOS — RESOLVER PRIMEIRO

### TD#36 🔴 — Scheduler BomDia + Encerramento em timeout (4 dias sem envio automático)
- Trigger.dev → Bridge `POST /agents/*/send-groups` com `AbortSignal.timeout(30s)`
- Bridge chama Evolution API que está lenta/instável → timeout
- Corrida manual (`bom-dia`, `encerramento`) gera imagem OK mas não envia para grupos
- **Impacto: grupos sem bom-dia desde 2026-05-23**

### TD#40 🔴 — BRENO quebrado silenciosamente (query com coluna errada)
- `trigger/breno/processar-webhook.ts:110` usa `.eq("agent_slug", "breno")`
- Coluna real em `tenant_agent_config`: `agent_id` (não `agent_slug`)
- Query retorna null → BRENO sempre roda em modo hibrido default
- **BRENO nunca executou em produção (0 runs)**

---

## O QUE EXISTE MAS NUNCA FUNCIONOU

| Item | Tabela/Código | Status |
|------|--------------|--------|
| RBAC (roles/role_permissions/user_roles) | 0 rows nas 3 tabelas | Schema criado, dados não populados |
| deli_triggers | 0 rows | DELI sem regras Verde/Amarelo/Vermelho |
| client_facts / client_timeline | 0 rows | Memória Central jamais usada por agente |
| loja_metricas | 0 rows | n8n foi removido; ingestão não substituída |
| agent_drafts / deli_pending_approvals | 0 rows | Fluxo de aprovação de drafts não ativado |
| BRENO agente | 0 runs | Scaffolded, bug de query, nunca deployado funcionando |
| LARA / MAX / NOVA / SOFIA | 0 runs | Em desenvolvimento, código existe, sem runs |

---

## GAPS DE SCHEMA E OBSERVABILIDADE

- **TD#50 🟡**: RBAC existe mas sem dados — permissions não são aplicadas via banco
- **TD#49 🟡**: `deli_triggers` vazio — DELI não aciona nada automaticamente por regra
- **TD#37 🟡**: `/chat/ai` (Bridge) chama Anthropic diretamente sem registrar em `agent_runs` — custo e uso invisíveis
- **TD#44 🟡**: `bom_dia_config.hora_semana/hora_sabado` existem mas NÃO alteram o cron (hardcoded)
- **Views sem migration**: `v_chart_7d` e `v_dashboard_kpis` ativas em produção, sem SQL no repo

---

## HIGIENE GIT

- **25 branches merged** ainda no remote → seguro deletar (TD#54)
- **29 branches não-merged**: 6 ativos (série piloto), 3 stale ≥15 dias, 20 do lote 2026-05-15 aguardando decisão merge/discard (TD#55)
- **0 TODOs/FIXMEs** em src/, trigger/, bridge-server/ — código limpo

---

## DASHBOARD DE TECH DEBTS

| TD | Sev | Área | Título curto |
|----|-----|------|-------------|
| TD#36 | 🔴 | BomDia/Encerramento | Scheduler timeout 30s → Evolution lenta |
| TD#40 | 🔴 | BRENO | `.eq("agent_slug")` → coluna errada, 0 runs |
| TD#37 | 🟡 | Chat | /chat/ai sem logging em agent_runs |
| TD#41 | 🟡 | Chat | /tarefa e /handoff na UI sem handler no Bridge |
| TD#42 | 🟡 | BRENO | Scaffolded, não deployado funcionando |
| TD#44 | 🟡 | BomDia | hora_semana/hora_sabado não consumidas pelo cron |
| TD#49 | 🟡 | DELI | deli_triggers vazia — DELI sem autonomia por regra |
| TD#50 | 🟡 | RBAC | roles/role_permissions/user_roles vazias |
| TD#55 | 🟡 | Git | 23 branches unmerged aguardando triage |
| TD#43 | 🔵 | DELI | @deli em grupo logado mas não invocado |
| TD#45 | 🔵 | BomDia | 4 schedule tasks — design intencional, não documentado |
| TD#46 | 🔵 | BomDia | T1 doc diz "HeyGen" — engine real é Recraft V4.1 |
| TD#51 | 🔵 | VERA | loja_metricas vazia — n8n removido, ingestão órfã |
| TD#52 | 🔵 | Agentes | client_facts/client_timeline vazias — Memória Central off |
| TD#53 | 🔵 | Schema | pg_stat stale — rowcounts via monitoramento não confiáveis |
| TD#54 | 🔵 | Git | 25 merged branches pendentes de cleanup no remote |

---

## ARTEFATOS PRODUZIDOS (T1–T5)

| Arquivo | Conteúdo |
|---------|---------|
| `docs/deli-memory/recon/agents-state.md` | Inventário completo de agentes (T1) |
| `docs/deli-memory/recon/chat-ao-vivo.md` | Chat ao vivo, Edge Function, BRENO (T2) |
| `docs/deli-memory/recon/bomdiaencerramento.md` | BomDia + Encerramento full docs (T3) |
| `docs/deli-memory/recon/schema-inventory.md` | 103 tabelas, rowcounts, 17 domínios (T4) |
| `docs/deli-memory/recon/broken-inventory.md` | Branches, TODOs, Edge Functions (T5) |
| `docs/deli-memory/tech-debts/td-index.md` | TD#36–TD#55 numerados |

---

*Reconhecimento S1-G00 concluído. Próximo passo: PRD Master.*
