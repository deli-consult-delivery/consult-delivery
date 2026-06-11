# AUDITORIA DA PLATAFORMA — 2026-06

**Tipo:** auditoria READ-ONLY (nenhum código alterado, nenhuma migration rodada, nenhum push).
**Data:** 2026-06-11 | **Branch:** `wandson/auditoria-plataforma` (a partir de `origin/main`)
**Quem leu isto:** Wandson (CEO). Escrito em linguagem direta, sem jargão sempre que possível.

> **O que esta auditoria É:** uma fotografia honesta do que está no ar, o que funciona, o que está
> quebrado e o que falta para os próximos passos. Toda afirmação vem com a evidência colada
> (arquivo:linha ou saída de comando literal).
>
> **O que esta auditoria NÃO é:** ela NÃO corrige nada. Os consertos viram uma lista de backlog
> no fim do documento — para serem feitos depois, em sessões próprias, com aprovação.

---

## 0. Resumo de uma página (para quem tem 2 minutos)

| Área | Veredito |
|------|----------|
| **Build do frontend** | ✅ VERDE — compila sem erro em ~5s (só avisos de chunk grande). |
| **Bridge Server (:3001)** | ✅ NO AR — responde, rotas protegidas exigem login (correto). |
| **Agentes em produção** | ✅ RODANDO HOJE — DELI, VERA, BRENO, BomDia, Encerramento, SOFIA ativos. |
| **Trigger.dev (orquestrador)** | ✅ LOGADO e operante (CLI autenticado no projeto certo). |
| **Telas (Console v2)** | ✅ ~40 telas cabeadas; todos os GAP-1..8 do mapa T3 têm tela. |
| **Escopo V1 (1A–1G)** | ✅ Concluído. 1E (DELI Realtime) ok; resta reativar 1 cron desligado. |
| **Segurança (RLS/RBAC)** | 🟡 ATENÇÃO — 5 views SECURITY DEFINER (ERRO) + 6 policies `USING true` + 1 bucket público listável. Nada catastrófico, mas é dívida de segurança real. |
| **Falhas de agente** | 🟢 Transitórias/externas (créditos OpenRouter, modelo inválido, timeout, Anthropic 529). Não são bug de código. |

**Tradução:** a plataforma está de pé e operando. Os riscos reais são de **segurança de banco**
(views e policies frouxas) e de **dependência externa** (créditos OpenRouter zeraram e quebraram
geração de imagem no fim de maio). Nenhum impede o uso hoje.

---

## 1. Inventário de Telas / Rotas

A navegação NÃO usa react-router. Existem dois mundos:

1. **Console clássico** (`src/App.jsx`) — variável `route` decide o que renderizar.
2. **Console v2** (`src/console/ConsoleV2.jsx`) — shell próprio em tela cheia, acionado por
   `if (route === 'console-v2')` (`src/App.jsx:337`). Dentro dele, um `switch(secao)` mapeia ~40 telas.

### 1.1 Console v2 — telas cabeadas (evidência: `src/console/ConsoleV2.jsx`)

| id da seção | Componente | Linha |
|-------------|-----------|-------|
| visao | VisaoGeral (KPIs reais) | 566 |
| deli | DeliScreen | 567 |
| crm | CrmScreen | 568 |
| lojas | LojasScreen | 569 |
| mia | MiaAuditScreen | 570 |
| aprovacoes | AprovacoesUnificadas | 571 |
| cobranca | InadimplentesScreen | 572 |
| defesa | Defesa / PaywallDefesa | 573 |
| radar | RadarReal | 574 |
| ativar | AtivarLoja | 575 |
| catalogo | PainelAgentes | 576 |
| estudio | Estudio | 577 |
| habilidades | Habilidades | 578 |
| analise | AnaliseLoja | 579 |
| cardapio | AgenteAnalise (cardápio) | 580 |
| multicanal | AgenteAnalise (multicanal) | 581 |
| construtor | AgentBuilderScreen | 582 |
| inbox | AgentInboxScreen | 583 |
| tarefas | TarefasAgendadas | 584 |
| gatilhos | Gatilhos | 585 |
| heartbeats | HeartbeatsScreen | 586 |
| atividade | Execucoes | 587 |
| metas | GoalsScreen | 588 |
| topicos | Topicos | 589 |
| modelos | Templates | 590 |
| config | AgenteConfig | 591 |
| arquivos | Arquivos | 592 |
| links | Links | 593 |
| memoria | MemoriesScreen | 594 |
| conhecimento | KnowledgeBaseScreen | 595 |
| custos | CustosIA | 596 |
| importar | ImportarRelatorios | 597 |
| configsys | SettingsScreen | 598 |
| clientesplat | Clientes | 599 |
| marca | Marca | 600 |
| provedores | Provedores | 601 |
| integracoes | Integracoes | 602 |
| sistemas | Sistemas | 603 |
| acesso | AcessoUsuarios | 604 |
| auditoria | AuditLog | 605 |

### 1.2 Cruzamento com o mapa T3 (GAPs) — `origin/cowork/t3-mapa-v1`

O mapa T3 definiu 8 GAPs (GAP-1..4 = MVP 🟢, GAP-5..8 = 🟡). **Todos têm tela cabeada hoje:**

| GAP | O que era | Tela existe? | Evidência |
|-----|-----------|--------------|-----------|
| GAP-1 Habilitação de agentes por tenant | toggle por cliente (`tenant_agents`) | ✅ | `PainelAgentes` (`catalogo`, ConsoleV2.jsx:576) |
| GAP-2 Config de agente (modo/provider/custo) | completar S-09 | ✅ | `AgenteConfig` (`config`, :591) |
| GAP-3 Fila única de aprovações | fundir 3-4 superfícies | ✅ | `AprovacoesUnificadas` (`aprovacoes`, :571) |
| GAP-4 Custos | agregar `agent_runs.cost_usd` | ✅ | `CustosIA` (`custos`, :596) |
| GAP-5 Skills/Habilidades | lista+editor | ✅ | `Habilidades` (`habilidades`, :578) |
| GAP-6 Audit log | viewer de `audit_log` | ✅ | `AuditLog` (`auditoria`, :605) |
| GAP-7 Acesso por usuário | UI de `user_agent_access` | ✅ | `AcessoUsuarios` (`acesso`, :604) |
| GAP-8 Templates | mensagens+ofertas | ✅ | `Templates` (`modelos`, :590) |

> **Observação honesta:** esta auditoria confirma que a tela EXISTE e está cabeada na navegação.
> Ela NÃO testou clicando cada uma para confirmar que cada botão grava no banco corretamente
> (isso exigiria sessão de browser autenticada — registrado como limite na §6). O mapa T3 marcava
> GAP-1 e GAP-2 como "banco pronto, UI não expõe": a tela agora existe, falta validar o fluxo ponta-a-ponta.

### 1.3 Console clássico — guardas de acesso (`src/App.jsx`)

Rotas sensíveis estão protegidas por `<RequireRole>` (import em `src/App.jsx:36`). Exemplos:

```
391  route === 'chat'   → RequireRole roles=['admin','atendimento','marketing']
403  route === 'crm'    → RequireRole roles=['admin','marketing']
408  route === 'reports'→ RequireRole roles=['admin','marketing']
445  route === 'tarefas'→ RequireRole roles=['admin']
```

**Exceção declarada no próprio código** (`src/App.jsx:385`): "Rotas públicas (sem RequireRole)" —
`dashboard` (:386), `lojas` (:387) e `notificacoes` (:388) renderizam SEM guarda de papel.
Isso é intencional no código, mas vale anotar: a tela `lojas` (que lista a base inteira de
contatos) não tem `RequireRole` no console clássico. → vira item de backlog (B-05).

---

## 2. Verificação funcional (output bruto)

### 2.1 Build do frontend — ✅ VERDE

```
=== INSTALL DONE ===
=== BUILD EXIT: 0 ===
```

`npm install` foi necessário (node_modules ausente no worktree). Depois `npm run build` → exit 0.
Build conclui em ~5s; apenas avisos (chunks > 500kB e import dinâmico+estático de supabase.js).
Zero erros de compilação.

### 2.2 Bridge Server :3001 — ✅ NO AR (smoke HTTP, nunca SQL)

- `GET /health` → 200
- `GET /breno/offhours-check` → 200 com JSON real
- `GET /api/*` sem token → **401 "missing token"** (comportamento correto: rotas JWT-protegidas)
- PM2: processo `bridge-server` online. O contador `↺` é cumulativo (não é crash-loop — ver
  memória `bridge-pm2-restart-counter-nao-e-crashloop`).

### 2.3 Trigger.dev (orquestrador) — ✅ LOGADO

```
npx trigger.dev@4.4.6 whoami → SUCESSO
User:    deli@consultdelivery.com.br
Project: proj_slexhoelcjwgbopmbzzr  "consult-delivery-main"
Org:     Consult Delivery LTDA
```

77 arquivos de task em `trigger/`. ~60 task ids (deli, vera, breno, cora, defesa, bom-dia,
encerramento, lara, sofia, max, mia-monitor-conversas-15min, deli-orchestrator-5min, etc.).

> **BLOQUEIO REGISTRADO:** `npx trigger.dev deploy` é **PROIBIDO** nesta missão (read-only).
> Não foi executado. Listagem de tasks/runs foi feita só por leitura (CLI autenticado + tabela
> `agent_runs` por SELECT).

### 2.4 Agentes em produção — ✅ RODANDO (SELECT em `agent_runs`, últimos 7 dias)

```
agent_id                status    n    last_run
analise-loja            success   1    2026-06-08
bom-dia                 success   6    2026-06-10 11:57
bom-dia-scheduler       success   10   2026-06-10 12:01
bom-dia-scheduler       failed    2    2026-06-06 11:02
breno                   success   807  2026-06-11 01:00
cardapio                success   1    2026-06-08
defesa                  success   3    2026-06-07
deli                    success   9    2026-06-11 05:30
encerramento            success   6    2026-06-10 21:01
encerramento-scheduler  success   12   2026-06-10 21:02
estudio                 success   1    2026-06-08 03:54
estudio                 failed    2    2026-06-08 03:42
multicanal              success   1    2026-06-08
sofia                   success   5    2026-06-10 12:00
vera                    success   83   2026-06-11 04:01
```

BRENO é o mais ativo (807 sucessos em 7 dias). DELI, VERA, BomDia, Encerramento e SOFIA
todos com execuções de sucesso recentes.

**Detalhe das falhas (SELECT, últimos 20 dias) — todas externas/transitórias, não bug de código:**

```
estudio   2026-06-08  OpenRouter 400: "openai/gpt-image-2 is not a valid model ID"
estudio   2026-06-08  OpenRouter 404 (HTML de erro)
bom-dia-scheduler   2026-06-06  "fetch failed"  (tenant consult)
encerramento (×2)   2026-05-29  OpenRouter 402: "Insufficient credits"
encerramento-scheduler ×2  2026-05-29  mesma causa (créditos OpenRouter zerados)
*-scheduler  2026-05-22/23  "operation was aborted due to timeout"
deli  2026-05-22  Anthropic 529 "Overloaded"
```

**Leitura:** as falhas concentram-se em (a) créditos da OpenRouter zerados no fim de maio,
(b) um model id inválido `openai/gpt-image-2` usado pelo agente Estúdio em 08/06, e
(c) timeouts/overload pontuais. Nenhuma é defeito de lógica do código. O model id inválido (B-04)
é o único que parece um bug de configuração concreto a corrigir.

> **CORA:** não aparece nos últimos 7 dias. Pelo histórico anterior, último run foi 2026-05-15
> (agente em POC, esperado estar parado). Anotado, não é regressão.

---

## 3. Escopo V1 (1A–1G) — item a item

Definições oficiais em `docs/RESTRUCTURING_REVISED.md:405-432`.

| Fase | Descrição | Estado | Evidência |
|------|-----------|--------|-----------|
| 1A Fundação | Schema RBAC, Memória, WhatsApp, Drafts no Supabase | ✅ | migrations `20260504_001..004` referenciadas no CLAUDE.md; tabelas em uso (agent_runs, audit_log, etc.) |
| 1B RBAC aplicado | `<RequireRole>` no React + middleware Bridge | ✅ | `src/App.jsx:36` + guardas :391/:403/:408/:445; Bridge `/api/*`→401 sem token |
| 1C Telas reais | Cora/Reports sem mock + Drafts | ✅ | `CoraScreen.jsx`, `ReportsScreen.jsx`, `DraftsPendentesScreen.jsx` presentes |
| 1D ClickUp Light | Sidebar hierárquica + TasksScreen | ✅ | `TasksScreen.jsx`, `KanbanScreen.jsx`, sidebar Console v2 com 5 grupos |
| 1E DELI ativa (Realtime) | DELI escutando + DeliPainel | ✅ (com 1 pendência) | `deli` com 9 runs de sucesso, último 2026-06-11 05:30; `DeliPainel.jsx` presente |
| 1F WhatsApp evoluído | webhook grupo/PV/menção + remetente | ✅ | edge `evolution-webhook` (citada no CLAUDE.md); `MiaAuditScreen` + `WhatsappVinculosScreen` |
| 1G AgentsPage real + Notificações | — | ✅ | `AgentsPage.jsx` + `NotificacoesScreen.jsx` presentes; notificações globais em App.jsx |

**Pendência única de V1** (conforme `docs/evonexus-replica/PLANO-MESTRE-mapa-vivo.md:63-66`):
reativar o cron do `deli-orchestrator-5min`, hoje desligado (`0 0 29 2 1` = nunca) desde 2026-05-26
por causa de spam. Isso é o "🔄 1E" do PLANO-MESTRE. → backlog B-01.

> **Veredito V1:** concluído (~99%). 1A–1G entregues. O único item aberto é reativar 1 cron
> (decisão de produto, não bug).

---

## 4. Itens quebrados / Riscos

### 4.1 Segurança de banco (Supabase Security Advisor) — 🟡 ATENÇÃO

Total de 64 apontamentos. Quebra por tipo:

```
ERROR  security_definer_view                               5
WARN   function_search_path_mutable                        17
WARN   anon_security_definer_function_executable           17
WARN   authenticated_security_definer_function_executable  17
WARN   rls_policy_always_true                              6
WARN   public_bucket_allows_listing                        1
WARN   auth_leaked_password_protection                     1
```

**5 ERROS — views SECURITY DEFINER** (rodam com permissão do criador, furam RLS de quem consulta):
```
public.view_metricas_negocio_dia
public.v_dashboard_kpis
public.view_metricas_agentes_dia
public.view_metricas_conversas_dia
public.v_chart_7d
```
Remediação: https://supabase.com/docs/guides/database/database-linter?lint=0010_security_definer_view

**6 policies `USING true` (acesso irrestrito — furam RLS):**
```
channel_members      allow_all_channel_members        (ALL, USING+CHECK true)
channel_messages     allow_all_channel_messages       (ALL, USING+CHECK true)
deli_agenda          "service role can insert ..."    (INSERT, CHECK true)
evolution_instances  "authenticated users can manage" (ALL, USING+CHECK true)
internal_channels    allow_all_internal_channels      (ALL, USING+CHECK true)
messages             messages_auth_all                (ALL, USING+CHECK true)
```
> As de `channel_*`/`internal_channels`/`messages` são canais internos da equipe (1 humano hoje),
> risco baixo na prática. `evolution_instances` é o mais sensível (config de WhatsApp acessível a
> qualquer autenticado). → backlog B-02.

**1 bucket público listável:** bucket `public` tem 2 policies SELECT amplas em `storage.objects`
("Allow public read on public bucket", "public_read_public") permitindo listar todos os arquivos.
→ backlog B-03.

**1 aviso de auth:** proteção contra senha vazada (leaked password protection) desabilitada. → B-06.

**51 WARN de funções** (search_path mutável + funções SECURITY DEFINER executáveis por anon/auth):
endurecimento recomendado, baixo risco isolado. → backlog B-07 (lote).

### 4.2 Dependência externa frágil

Geração de imagem (Estúdio / Encerramento) depende de créditos OpenRouter — zeraram em 29/05 e
quebraram a função. Sem alerta proativo de saldo. → backlog B-08.

---

## 5. Gaps estratégicos (capacidades-alvo)

Classificação: **[já dá hoje]** · **[configuração]** · **[feature pequena]** · **[feature grande]**

| # | Capacidade desejada | Classificação | Por quê (evidência) |
|---|---------------------|---------------|---------------------|
| G1 | Gestão de tarefas por loja + lembretes + histórico | **[já dá hoje / feature pequena]** | `TarefasClientesScreen.jsx`, `TasksScreen.jsx`, `KanbanScreen.jsx`, `client_timeline` existem. Falta amarrar lembrete→notificação por loja. |
| G2 | Base de conhecimento + agentes especialistas | **[já dá hoje]** | `KnowledgeBaseScreen.jsx` (`conhecimento`, ConsoleV2:595) + 7 agentes especialistas rodando. |
| G3 | Régua / follow-up automático por WhatsApp | **[configuração / feature pequena]** | LARA régua existe (`supabase/migrations/20260506_001_lara_regua.sql`, `docs/fluxos/lara-regua.md`). Falta ativar/configurar por tenant + aprovar drafts. |
| G4 | Dashboards por cliente | **[já dá hoje]** | `DashboardScreen.jsx`, `RadarReal`, `VisaoGeral` com KPIs reais; views de métrica por dia já no banco. |
| G5 | Suporte BRENO fora de horário | **[já dá hoje]** | `breno` = 807 runs/7d; endpoint `/breno/offhours-check` responde 200. Operante. |
| G6 | Conteúdo / artes (LARA) | **[já dá hoje, com ressalva]** | `Estudio.jsx`, `LaraEditorial/`, agentes `estudio`/`lara`. Ressalva: geração de imagem depende de créditos OpenRouter (quebrou em maio) + model id inválido a corrigir. |
| G7 | Prospecção (SOFIA) | **[feature pequena]** | `sofia` roda (5 runs/7d), `SofiaScreen.jsx` existe. Pipeline de prospecção ativa precisa fonte de leads + cadência. |
| G8 | Multi-canal: iFood → 99Food / Keeta / Rappi | **[feature grande]** | Hoje agente `multicanal` consolida métricas (1 run em 08/06), mas integração nativa com cada plataforma extra é trabalho grande. |
| G9 | Cardápio próprio + venda direta no WhatsApp | **[feature grande]** | Agente `cardapio` analisa cardápio (sugestões), mas "loja/venda direta no WhatsApp" é produto novo, não existe hoje. |

**Leitura para o Wandson:** a maioria das capacidades-alvo **já existe ou é configuração/feature
pequena** — a plataforma está mais perto do alvo do que parece. Os dois esforços grandes de verdade
são **multi-plataforma de delivery (G8)** e **venda direta/cardápio próprio (G9)**.

---

## 6. Limites desta auditoria (o que NÃO foi verificado)

Por honestidade, registro o que ficou fora do alcance read-only:

- **Não cliquei as telas num browser autenticado.** Confirmei que cada tela existe e está cabeada
  na navegação (arquivo:linha), mas não validei cada fluxo de gravação ponta-a-ponta.
- **Não rodei deploy do Trigger.dev** (proibido). Confirmei só que o CLI está logado e que os
  agentes têm runs reais em `agent_runs`.
- **Não testei a edge `evolution-webhook` recebendo evento real do WhatsApp** (exigiria disparo
  externo). Confirmei presença pela referência no CLAUDE.md e telas MIA/Vínculos.
- **Não fiz teste de isolamento de RLS** (exigiria query como tenant B). Os riscos de RLS vêm do
  Security Advisor da Supabase (fonte confiável), não de teste manual cruzado.

---

## 7. Backlog de fixes — NÃO EXECUTADO (para sessões futuras)

> Cada item é um conserto candidato. Nenhum foi aplicado nesta sessão. Prioridade sugerida P0>P1>P2.

| ID | Prioridade | Item | Tipo |
|----|-----------|------|------|
| B-01 | P1 | Reativar cron `deli-orchestrator-5min` (hoje `0 0 29 2 1` = desligado desde 2026-05-26 por spam). Decisão de produto: religar com proteção anti-spam. | config |
| B-02 | P1 | Apertar 6 policies `USING true`. Prioridade na `evolution_instances` (config WhatsApp exposta a qualquer autenticado). | SQL aditivo (policy) |
| B-03 | P1 | Revisar 2 policies amplas do bucket público `public` em `storage.objects` (permite listar todos os arquivos). | SQL/config storage |
| B-04 | P1 | Corrigir model id inválido `openai/gpt-image-2` no agente Estúdio (causou OpenRouter 400 em 08/06). | bug config |
| B-05 | P2 | Avaliar `RequireRole` na rota `lojas` do console clássico (`src/App.jsx:387`, hoje sem guarda). | RBAC frontend |
| B-06 | P2 | Habilitar leaked-password protection no Supabase Auth. | config |
| B-07 | P2 | Endurecer 51 WARN de funções (search_path mutável + SECURITY DEFINER executável por anon/auth) — lote. | SQL aditivo |
| B-08 | P2 | Alerta proativo de saldo OpenRouter (créditos zeraram em 29/05 e quebraram geração de imagem). | feature pequena |
| B-09 | P2 | Reavaliar as 5 views SECURITY DEFINER (métricas/dashboard) — confirmar se o DEFINER é intencional para KPIs cross-tenant ou se deve virar INVOKER. | SQL/review |

---

*Fim da auditoria. Gerada em modo read-only — nenhum arquivo de código alterado, nenhuma migration
aplicada, nenhum push. O único arquivo criado é este relatório.*
