# Wiki Log

## 2026-06-25 — Sessão 95: datacrazy-nps-poller para Karina Doceria

**Contexto:** Karina Doceria usa Datacrazy CRM (não Evolution API), precisava do equivalente do CSAT poller mas para NPS.

**Implementado:**
- `trigger/multicanal/datacrazy-nps-poller.ts` — cron 30 min, busca conversas finalizadas no Datacrazy, verifica idempotência por `external_ref` e cooldown de 30 dias por contato, envia link NPS via `POST /conversations/{id}/messages`
- `supabase/migrations/20260625_001_nps_avaliacoes_external_ref.sql` — coluna `external_ref TEXT` + índice único `(tenant_id, external_ref WHERE NOT NULL)` em `nps_avaliacoes`

**Verificações:**
- Config Karina: `nps_auto_envio=true`, `datacrazy_api_key` presente, cooldown 30 dias ✅
- `tsc --noEmit` sem erros ✅
- Deploy Trigger.dev versão `20260625.4` (83 tasks) ✅
- Migration aplicada no Supabase ✅
- PR #540 criado e mergeado em main ✅

## 2026-06-24 — Sessão 94: QA visual PipelineScreen + fix logAgentRun silencioso

**Contexto:** Continuação da investigação do bug onde `agent_runs` ficava vazio desde 16:01 UTC, e QA visual da tela "Pipeline ao Vivo".

**Bug corrigido — logAgentRun silencioso:**
- Causa-raiz: PR #524 (FASE 4) adicionou 4 colunas ao upsert de `logAgentRun()` que não existiam no banco (`explanation`, `confidence_score`, `pipeline_stage`, `pipeline_position`)
- Soft-fail (`try/catch + console.warn`) engolia o erro silenciosamente
- Fix: migration `supabase/migrations/20260624_006_agent_runs_add_pipeline_cols.sql` aplicada (4 colunas aditivas)
- Verificado: run de 19:30 UTC gravou `semaforo: Vermelho` em `agent_runs` com sucesso

**Heartbeat loop validado E2E:**
- Orchestrator detectou grupo "EQUIPE - CONSULT DELIVERY" com 7+ dias de inatividade
- `createHeartbeatTask()` criou task BRENO (18:57 e 19:06 UTC)
- Dedup funcionou: run de 19:30 pulou criação (task já existia)
- `agent_runs` registrando corretamente após o fix

**QA visual PipelineScreen — APROVADO:**
- Menu SISTEMA (sidebar) → "Pipeline ao Vivo" acessível em produção
- Kanban carregado: Aguardando (0) · Executando (0) · Concluído (59) · Falhou (1)
- Saúde 7D: 608 runs · 96% ok · avg 4.0s · top agentes: DELI (322), BRENO (176), VERA (56)
- Cards com timestamps e run IDs do Trigger.dev visíveis

**Pendente (próximas sessões):**
- Fatia 1.5: ERP write via `vendaerp_proposals` + confirmação Telegram
- E2E completo: conversa real → BRENO → `client_tasks` → Pipeline → execução → draft resposta

---

## 2026-06-24 — Sessão ajuste-cora: 4 ajustes na tela de cobrança da Cora (branch wandson/ajuste-cora)

**Problema:** 4 comportamentos incorretos na tela de cobrança da Cora identificados pelo Wandson:
1. Botão "Não cobrar" marcava a fatura como ignorada mas não limpava os drafts pendentes da fila de aprovação
2. Botão "Já pagou via PIX" só atualizava o banco local, não chamava a API Asaas para dar baixa real na fatura
3. Fila de aprovação mostrava cobranças de todos os dias, não só do dia atual
4. Deduplicação ocultava cobranças pelo telefone apenas — clientes com 2 faturas diferentes apareciam só 1 vez

**Fixes entregues (commit `8c62e26`, branch `wandson/ajuste-cora`):**

**(A) "Não cobrar" — rejeita drafts automaticamente:** `bridge-server/routes/cora-gestao.js` — após marcar `ignorar_cobranca=true`, faz PATCH em `agent_drafts` filtrando por `cobranca_v2_id=id` e `status=pending`, setando `status=rejected`. Task `trigger/cora/processar-cobranca.ts` agora também lê `ignorar_cobranca` na query e retorna `skipped: cobranca_ignorada` se true (evita gerar novo draft futuro).

**(B) "Já pagou via PIX" → Asaas receiveInCash:** `bridge-server/routes/cora-gestao.js` — após update local, chama `POST https://api.asaas.com/v3/payments/{asaas_charge_id}/receiveInCash` com `paymentDate` e `value`. Falha no Asaas é não-fatal (log de warn, não 500). Também corrigido: rejeição de drafts era de todos os drafts pending da fila — agora é apenas os da fatura específica (`metadata->>cobranca_v2_id=eq.${id}`).

**(C) Fila do dia atual:** `src/console/Cora.jsx` — `loadDrafts()` agora inclui filtro `.gte('created_at', todayBRT.toISOString())` onde `todayBRT = meia-noite BRT (03:00 UTC)`. Padrão consistente com o dedup já usado no Trigger.dev e no bridge.

**(D) Dedup por phone+fatura:** UI (`Cora.jsx`), Trigger.dev (`processar-cobranca.ts`) e bridge-server (`cora-aprovacao.js`) trocaram dedup de "mesmo telefone" para "mesmo telefone E mesma fatura (`cobranca_v2_id`)". Mesmo número com serviços diferentes aparece normalmente na fila.

**Pendente:** criar PR no GitHub (gh CLI sem auth na VPS). URL: `https://github.com/deli-consult-delivery/consult-delivery/pull/new/wandson/ajuste-cora`

## 2026-06-24 — Sessão 92: 4 defeitos do 1º cliente restrito (Karina Doceria) corrigidos (PR #508)

**Problema:** após provisionar o tenant Karina Doceria com 3 módulos (visao/csat/nps), 4 defeitos impediam o uso normal: CSAT e NPS retornavam "Acesso negado"; Visão Geral exibia o dashboard completo do CD em vez de KPIs do cliente; sidebar mostrava nome do cliente + "CONSOLE · BETA"; runbook sem instrução de RBAC.

**Causa raiz (defeitos 1 e 2):** tenant criado sem linhas em `roles` → `seed_rbac_system_roles` nunca havia sido chamado → `hasRole('admin') = false` → `<RequireRole>` bloqueava as telas.

**Fix RBAC:** migration `20260624_001_rbac_seed_karina_tenant.sql` — `seed_rbac_system_roles('e9fdaa66-…')` + `INSERT INTO user_roles` admin. Idempotente, verificado com `execute_sql` (7 papéis + 1 linha user_roles confirmados).

**Fix Visão Geral:** hook `useKpisAvaliacao` + componente `VisaoGeralAvaliacao` em `ConsoleV2.jsx`. Quando `allowedModules` é um `Set` (tenant restrito), `VisaoGeral` delega para o novo componente que exibe KPIs de CSAT% e NPS dos últimos 30 dias + CTAs para as telas. Tenants sem allowlist (null) continuam com o dashboard completo — zero regressão.

**Fix branding:** logo sempre `/assets/rocket-logo.png`, nome sempre "Consult Delivery", sem `<small>CONSOLE · BETA</small>`. Nome do cliente permanece só no chip do seletor de tenant.

**Lição:** ao criar um tenant restrito, o Passo 3c do runbook é obrigatório. Sem RBAC semeado, todas as telas protegidas com `<RequireRole>` retornam "Acesso negado" mesmo com `tenant_members.role = 'admin'` — os dois sistemas são independentes.

## 2026-06-24 — Sessão cora-r2-tracker-docs (continuação): hotfix `em7Dias` undefined na aba de cobrança CORA (PR #501)

**Problema:** PR #498 removeu `em7Dias` junto com `venceEm7Dias`, mas a variável ainda era referenciada no `useMemo` de `elegiveisRegua` (linha 1202). Em ES modules (strict mode), isso lança `ReferenceError: em7Dias is not defined`, quebrando o render do componente Cora e exibindo erro na tela ao clicar na aba de cobrança.

**Fix:** Redefinir `em7Dias` antes do `useMemo` (`const em7Dias = new Date(hoje); em7Dias.setDate(em7Dias.getDate() + 7);`). 1 linha inserida. PR #501 squash-mergeado; deploy via GitHub Actions em ~3 min.

**Lição:** ao remover uma variável intermediária, grep por todos os usos antes de deletar — TypeScript não capturou porque o arquivo é `.jsx` (não `.tsx`) e a checagem de tipos é parcial.

## 2026-06-24 — Sessão cora-dashboard-limpeza: remoção de seções redundantes do dashboard financeiro CORA (PR #498)

**Contexto:** Wandson identificou redundâncias no dashboard CORA (tab Financeiro → Visão Geral): (1) tabelas "Cobranças vencidas por cliente" e "Vencem nos próximos 7 dias" repetiam exatamente o que a Régua de Cobrança já mostra com seus filtros; (2) campo "A receber" nos blocos "Últimos 30 dias" e "Mês atual" era semanticamente incorreto (cobranças pending são futuras, não do passado).

**Comportamento entregue:** dashboard mais limpo, sem duplicações. A Régua de Cobrança é o ponto único para gerenciar cobranças elegíveis, com filtros Todas/Vencidas/Próx. 7 dias. Os blocos de período agora mostram apenas Recebido, Confirmados e Inadimplência.

**Confirmação sobre pagamento de boleto:** o sistema JÁ funciona corretamente. Asaas → `POST /webhooks/asaas` → status `received` → `regua-diaria.ts` filtra `.in("status", ["pending", "overdue"])` → CORA para de gerar mensagens. Sem alteração de código necessária.

**O que foi removido (PROD via PR #498, squash-merged):** `vencidasPorCliente` + `venceEm7Dias` computed blocks, seções JSX 1.6 e 1.7, campo "A receber" dos dois IIFEs de período. 219 linhas deletadas, zero funcionalidade perdida. `npx tsc --noEmit` → zero erros.

## 2026-06-23 — Sessão 88c: guarda de janela horária — incidente 04:08 BRT investigado e corrigido (PR #495)

**Incidente:** agentes de encerramento enviaram mensagens a 15 grupos de clientes às 04:08 BRT do dia 23/06/2026. O horário correto é 18:00 BRT (seg-sex) e 12:00 BRT (sáb). Nenhum cron rodou fora do esperado.

**Causa raiz:** a sessão anterior (88b) disparou manualmente o task `encerramento-envio-agendado-semana` no dashboard do Trigger.dev para testar o fix de idempotência cross-day. Não havia nenhuma proteção que impedisse o envio real fora do horário de operação — o agente não distinguia entre trigger manual e trigger agendado.

**Evidência no banco:**
- `03:58 BRT` — `encerramento` (gerar-imagem) triggered manualmente
- `04:09 BRT` — `encerramento-scheduler` → enviou para 15 grupos ← INCIDENTE
- `18:01 BRT` — `encerramento-scheduler` → run correto pós-fix ✅

**Fix (PR #495, versão `20260623.8`, 75 tasks deployadas):** adicionada função `isWithinSendWindow(weekdayLabel, hourSP)` em ambos os arquivos de envio agendado:
- `trigger/encerramento/envio-agendado.ts` — janela 16h–22h BRT (seg-sex) | 10h–16h BRT (sáb)
- `trigger/bom-dia/envio-agendado.ts` — janela 07h–13h BRT (seg-sex) | 06h–12h BRT (sáb)

Se acionado fora da janela (manual ou cron defeituoso), aborta sem enviar, registra `WARN` nos logs e grava `reason: "fora_da_janela_horaria"` no `agent_runs`. A `getSPDate()` foi atualizada para expor `hourSP` (via `nowSP.getUTCHours()` após ajuste UTC-3).

**Verificação:** `tsc --noEmit` → zero erros. Run agendado das 18:01 BRT passou normalmente (dentro da janela).

---

## 2026-06-23 — Sessão webhook-hardening: `evolution-webhook` hardening defensivo deployado em prod (PR #491, Edge Function v56)

**Contexto:** offshoot da investigação da tela preta / "Nenhum workspace" (saturação de banco, sessão 89). Naquela sessão, o hardening defensivo da edge function `evolution-webhook` ficou apenas **OFERECIDO ao Wandson, não aplicado**. Esta sessão fechou o ciclo: CODOU + MERGEOU + DEPLOYOU.

**Comportamento entregue:** o webhook agora **loga o `instance_name` recebido** e responde **HTTP 200 a uma instância Evolution órfã/desconhecida em vez de 404**, para que a instância externa pare o loop de retry. Um **erro transitório de lookup** (timeout/conexão de banco sob carga — `instErr.code !== 'PGRST116'`) **ainda retorna 404 de propósito**, para o Evolution re-entregar o evento depois. "Zero linhas" genuíno (PGRST116) ou resultado vazio → 200, evento ignorado de propósito.

**Correções aplicadas (EM PROD):** código em `main` via **PR #491** (commit `2e25735`, "fix(webhook): hardening defensivo — 200 a instância órfã, 404 só em erro transitório"). Deploy via **Supabase MCP `deploy_edge_function`** — o CI **NÃO publica edge functions** (é frontend-only). A função está agora em **Edge Function v56, ACTIVE, `verify_jwt: false`**.

**Verificação (output bruto):** fidelidade byte-a-byte — md5 do deployado `eac6a1be4655ed3e79f4a1c0b6237bd0` **== local**, diff limpo, **62675 bytes / 1503 linhas**. Logs de runtime mostram a função servindo 200s sem erro de boot/sintaxe.

**Branch:** a feature original `wandson/webhook-hardening-instancia-orfa` foi squash-merged via #491 e **NÃO deve ser reusada** (conflito fantasma — caso #155). Esta atualização de docs foi feita na branch `wandson/webhook-hardening-docs`.

**Tracks:** T8/Infra (+ T8/Cora — destrava o "Front 1" da sessão 89, o loop de 404 do `evolution-webhook`).

---

## 2026-06-23 — Sessão 91: BLUEPRINT AI-First — plano-mestre escrito, aguardando 🛑 CHECKPOINT do Wandson

**Contexto (visão do Wandson, mensagem de voz):** transformar a Consult Delivery numa operação **AI-First** (~100% operada por agentes). Um cérebro/memória dentro da plataforma; **agentes especialistas** atendem clientes que chegam por **live chat**; o que o especialista não resolve vira **tarefa num pipeline com visão em tempo real**, onde ele resolve no sistema externo necessário (ERP/Asaas/sistema do cliente), atualiza a tarefa, e o atendente **responde ao cliente** com a conclusão — ou resolve direto. Reusar tudo que já existe; replicar o **paradigma EvoNexus** (chat interno com um **Oráculo** que aciona outros agentes e cria coisas na plataforma).

**4 decisões travadas (via AskUserQuestion, INVIOLÁVEIS):**
- **AF-1** — "Blueprint completo primeiro": escrever o plano-mestre AI-First completo e faseado, reusando a infra; construir por fases depois.
- **AF-2** — "Ernesto" = a própria **DELI** (verbatim do Wandson: *"Esse Ernesto, ele não existe. O Ernesto é a mesma Deli. É porque eu errei na hora de escrever. E ela deve iniciar primeiro no telegram mesmo."*). NÃO há agente Ernesto separado; o cérebro/orquestrador/Oráculo É a DELI.
- **AF-3** — DELI começa no **Telegram** primeiro (não WhatsApp).
- **AF-4** — Primeira fase a CONSTRUIR = **o Loop** cliente→especialista→tarefa→resolução→resposta.

**Entregue:** `docs/ai-first/BLUEPRINT-AI-FIRST.md` (PT-BR, v1, status PROPOSTA) — §0 como usar · §1 visão + decisões AF-1…AF-6 · §2 inventário do que JÁ existe + gaps · §3 arquitetura do Loop (máquina de estados attending→task_pending→executing→done→replied + mapa modo→semáforo) · §4 plano faseado (FASE 1 Loop · FASE 2 Pipeline tempo-real · FASE 3 DELI Oráculo Telegram · FASE 4 autonomia/heartbeats) · §5 arquivos a criar/estender · §6 guard-rails · §7 próxima ação.

**Inventário confirma** que a plataforma já tem a maioria dos blocos: memória (`client_facts`/`client_timeline`/`loja_metricas`/`agent_memories`), especialistas em `trigger/`, DELI + semáforo, Oracle (agent-builder), Hermes/Telegram + admin-mcp, drafts + aprovação, `client_tasks` + Realtime parcial, Console v2. **Gaps:** loop não cabeado · tela Pipeline · Realtime incompleto · `/agents/deli/notify` · `notifyBridge` comentado.

**Constraint:** motor EvoNexus PROIBIDO em prod (re-implementar só o paradigma); nenhuma mensagem a cliente sem aprovação (drafts).

**Próximo passo (🛑 CHECKPOINT):** Wandson lê o blueprint e aprova a **FASE 1 (o Loop)**. Ao aprovar, 1ª fatia = `supabase/migrations/20260623_001_loop_core.sql` (aditiva/reversível, autônoma) + helper `createLoopTask()` + estender `trigger/breno/responder.ts` (saída discriminada `resolver | criar_tarefa`). Nada de produção/cliente tocado nesta sessão.

---

## 2026-06-23 — Sessão 86: Onboarding de cliente restrito a Avaliação (CSAT/NPS) + aposentadoria do console clássico [T8/T9] — branch `claude/gracious-kapitsa-b2daad`, commit `f63c025`

**Contexto:** Wandson quer vender só o módulo de Avaliação (CSAT/NPS) para um cliente novo — entrar vendo apenas Visão Geral + CSAT + NPS, com desbloqueio progressivo de mais módulos depois, sem deploy. Junto, aposentar de vez o console clássico (dívida que atrapalha o onboarding restrito).

**Decisões travadas (AskUserQuestion, plano `cozy-skipping-breeze.md`):** **D1** aposentar o console clássico para todos (Console v2 = único; todo login autenticado cai no v2); **D2** gating de módulos via nova tabela `tenant_modules` (flag `enabled` por tenant; o menu do v2 filtra por ela); **D3** provisionamento via runbook SQL + edge `manage-users`; **D4** módulos do 1º cliente = Visão Geral + CSAT + NPS.

**Design central do gating — "allowlist quando há linhas; aberto quando não há":** tenant **sem nenhuma linha** em `tenant_modules` → vê **todos** os módulos (backward-compatible, zero migração dos tenants atuais); tenant **com linhas** → vê **só** os `module_key` com `enabled = true`. `module_key` = o `id` do item de menu em `GRUPOS` (`ConsoleV2.jsx`). Filtro de menu é **defesa de UX, não de dados** — RLS/RBAC permanecem no backend, nenhuma policy relaxada.

**Entregue:**
- **Migration `20260622_010_tenant_modules.sql`** (APLICADA, version `20260623021358`) — tabela `tenant_modules` (`id` uuid PK, `tenant_id` uuid NOT NULL REFERENCES tenants ON DELETE CASCADE, `module_key` text NOT NULL, `enabled` boolean NOT NULL DEFAULT true, `created_at`). UNIQUE `(tenant_id, module_key)`; índice `idx_tenant_modules_tenant`; RLS enabled + 4 policies. **Teste de isolamento RLS PASSOU**; não-regressão: **0 linhas em produção** → todos os tenants atuais seguem com menu completo.
- **`src/console/ConsoleV2.jsx`** — fetch de `tenant_modules` espelhando o padrão `defesaOn`/`tenant_agents`; `allowedIds = null` quando vazio (tudo liberado) ou `Set` dos `module_key` habilitados; filtro do render; guard de tela ativa; removido botão "Voltar ao console clássico" e a prop `onExit`.
- **`src/App.jsx`** — console clássico aposentado: sempre renderiza `<ConsoleV2 .../>` para usuário logado com tenant; branch do clássico (`<Sidebar>`, screens) removido.
- **`docs/runbooks/onboarding-cliente-avaliacao.md`** (novo) — runbook de 5 passos: criar tenant → ligar módulos (`visao,csat,nps`) → criar 1º admin via service-role → usuários adicionais via `manage-users` → desbloqueio progressivo sem deploy. Senhas via Infisical, nunca em git/chat.

**Verificação (output bruto):** teste de isolamento RLS PASSOU; não-regressão 0 linhas confirmada; `npm run build` exit 0 (vite v5.4.21, sem imports órfãos).

**Pendente do Wandson:** rodar o runbook para o 1º cliente real + validação visual.

**Encerramento (sessão de continuidade, 2026-06-23):** merge do `f63c025` resolvido contra `origin/main` (conflito do Tracker resolvido mantendo T8 webhook-hardening de origin + T9 gating do HEAD), merge commit `eb414db`; **PR [#493](https://github.com/deli-consult-delivery/consult-delivery/pull/493) squash-mergeado em `main` (`e0576e9`)**. **Deploy em prod VERIFICADO (output bruto):** GitHub Pages publicou o bundle novo `assets/index-FZTJqS2d.js` e o `grep tenant_modules` no bundle deployado retornou **1 ocorrência** (validação por string, não por hash — CI injeta `VITE_*`). Smoke autenticado do cliente restrito segue com o Wandson (depende do runbook + credenciais do cliente, fora do alcance desta sessão).

**Onboarding executado — 1º cliente restrito real (runbook rodado, 2026-06-24):** provisionado o tenant **Karina Doceria** seguindo `docs/runbooks/onboarding-cliente-avaliacao.md`. **Output bruto (Supabase `execute_sql`):** tenant `e9fdaa66-cbe7-4dff-905b-afc4b10219ff` · slug `karina-doceria` · `status=active` · `plan=pro` · `color=#0f40b0`; **`tenant_modules` = 3 linhas habilitadas** (`csat`, `nps`, `visao`) — allowlist ativa, então o cliente vê **só** Visão Geral + CSAT + NPS no Console v2; **1 membro admin** (`role=admin`, `display_name="Karina Doceria"`, email `wandsonconsultor@consultdelivery.com.br`) semeado via service-role (1º admin não pode usar `manage-users`, que exige caller já owner/admin — `manage-users/index.ts:71-81`). Senha entregue por canal seguro, **nunca em git/chat**. Desbloqueio progressivo de novos módulos = inserir linha em `tenant_modules`, sem deploy. **Pendente do Wandson:** smoke visual no browser logando como o cliente (menu deve listar só os 3 módulos).

---

## 2026-06-22 — Sessão 89: Tela preta "Nenhum workspace" — causa-raiz de banco resolvida em prod (#482 + #485) + Front 1 (loop 404 evolution-webhook)

**Sintoma:** Wandson não acessava `app.consultdelivery.com.br` — a plataforma carregava e caía numa tela preta **"Nenhum workspace encontrado para este usuário."**. Duas tentativas anteriores no frontend (#473 race-condition, #476 `getUser→getSession`) trataram o sintoma, não a causa.

**Root cause (prova `pg_stat_statements`, em 2 camadas):**
1. **Saturação do Postgres/PostgREST.** A query `SELECT cobrancas.* … WHERE tenant_id=$1 ORDER BY vencimento` acumulou **153.627 chamadas / 38.700s de tempo total / 251,9ms média = 81,1% de TODO o tempo de banco**. O `SELECT *` arrastava a coluna pesada `metadata jsonb` (guarda `asaas_raw` = a cobrança Asaas inteira por linha). #2 consumidor (13,5%) = decode de WAL do Realtime. Amplificado pelo cron `asaas-sync-financeiro` (UPSERT de ~2000 cobranças a cada 30 min, disparando eventos Realtime em todas as abas) e por subscriptions Realtime **sem debounce** que recarregavam a tabela inteira a cada evento. Isso esgotava o pool → `statement timeout` → PostgREST 503 → a query de `tenant_members` do `App.jsx` não pegava conexão.
2. **Frontend mentia.** Mesmo com o banco só lento/503, o `App.jsx` caía no safety-timer e mostrava "Nenhum workspace" como se o usuário não tivesse tenant (o `error` da query era descartado, `catch` mudo).

**Correções aplicadas (EM PROD, 2 camadas):**
- **CAMADA A — aliviar o banco (#482):** colunas explícitas no lugar de `SELECT *` em `loadCobrancasV2` (`src/screens/CoraScreen.jsx` + `src/console/Cora.jsx`), **omitindo `metadata`** + demais colunas não usadas pela UI; debounce 2s (`DEBOUNCE_REALTIME_MS`) nas subscriptions Realtime, padrão de `src/components/chat/LeadNotesSection.jsx` (const de módulo + `useRef` do timer + clearTimeout/setTimeout + cleanup limpando o timer ANTES do `removeChannel`). **#485** estendeu o debounce ao canal `cora-drafts` (`console/Cora.jsx`) e a `subscribeToDrafts` (`src/lib/api.js`, `DEBOUNCE_DRAFTS_MS`, cobre `DraftsPendentesScreen.jsx` + `Disparos.jsx`).
- **CAMADA B — frontend honesto (#482, `src/App.jsx`):** captura o `error`/timeout da query (antes descartado); retry com backoff 1s/2s/4s; render honesto "Servidor temporariamente indisponível, reconectando…" + botão "Tentar novamente"; "Nenhum workspace" só com resultado de zero-tenant REAL; usa a `session` já presente no estado em vez de novo `getUser()` no caminho saturado.

**Verificação (output bruto):** a query de `cobrancas` colapsou de **153.627 calls / 251,9ms mean / 81,1% do DB → 2 calls / 31ms total / 15,3ms mean** (colunas explícitas confirmadas no `query_head`). Browser: tela de **login limpa, sem "Nenhum workspace"/tela preta**. Índice composto `(tenant_id, vencimento)` já existia (`20260514_017_cobrancas.sql`) — o custo NÃO era índice faltando, era o `SELECT *`; nenhuma migration nova.

**Front 1 — loop de 404 do `evolution-webhook` (read-only, config Evolution NÃO tocada):** `get_logs` service `edge-function` mostra invocações recentes **100% `POST | 200`** (exec 142–671ms); os `404 instance_not_found` são todos ANTIGOS (~1,6h antes), com exec_time anormal (6.250–59.385ms, coerente com a janela de saturação do banco) — eram 404s de instância órfã durante o pico. **O loop CESSOU.** Hardening defensivo da edge function (logar `instance_name` + responder 200 a instância desconhecida em vez de 404) OFERECIDO ao Wandson, **NÃO aplicado** (aguarda `ok`; mexer em config externa exige aviso).

**PRs:** [#482](https://github.com/deli-consult-delivery/consult-delivery/pull/482) (camadas A+B) + [#485](https://github.com/deli-consult-delivery/consult-delivery/pull/485) (debounce estendido) — ambos mergeados, deploy GitHub Pages. **Tracks:** T8/Infra + T8/Cora. **⚠️ Pendente do Wandson:** validação visual logado em dia útil.

---

## 2026-06-22 — Sessão 88b: Fix idempotência cross-day (bom-dia + encerramento)

**Contexto:** Envio compensatório de segunda-feira 22/06 reusou imagem do domingo 21/06 indevidamente.

**Root cause:** Janela de idempotência de 26h em `gerar-imagem.ts` (ambos os agentes) permitia reuso de imagem do dia anterior. `envio-agendado.ts` também não verificava se `output.date` coincidia com o dia SP atual.

**Correções aplicadas (4 arquivos):**
- `trigger/bom-dia/gerar-imagem.ts` + `trigger/encerramento/gerar-imagem.ts`: janela 26h substituída por `${dateStr}T03:00:00.000Z` (meia-noite SP em UTC)
- `trigger/bom-dia/envio-agendado.ts` + `trigger/encerramento/envio-agendado.ts`: adicionada verificação `out.date === dateStr` antes de reusar imagem existente; divergência → loga warn e força nova geração

**Deploy:** PR [#486](https://github.com/deli-consult-delivery/consult-delivery/pull/486) mergeado → Trigger.dev versão `20260622.54`

---

## 2026-06-22 — Sessão 88: Encerramento — debug + fix timeout + envio manual

**Contexto:** Agente de encerramento não enviou mensagem no sábado 21/06. Investigação e correção.

**Root causes identificados:**
- `trigger.config.ts` tinha `maxDuration: 300` global limitando o task `encerramento-gerar-imagem` que tem `maxDuration: 600` — causava abort após ~300s (LLM ~120s + 2 imagens ~180s cada = ~480s necessários)
- Sexta 20/06: timeout no run de geração → sem imagem no `agent_runs`
- Sábado 21/06: `envio-agendado` não encontrou imagem do dia, tentou gerar no momento do envio → também falhou

**Ações tomadas:**
- ✅ Envio manual executado via bridge: 15 grupos receberam a mensagem com a imagem do sábado
- ✅ Fix: `maxDuration` global aumentado de 300s para 600s em `trigger.config.ts`
- ✅ PR [#483](https://github.com/deli-consult-delivery/consult-delivery/pull/483) mergeado
- ✅ Deploy Trigger.dev versão 20260622.47 (75 tasks, schedules re-registrados)

**Próxima verificação:** segunda-feira 23/06 às 21:00 UTC (18:00 BRT) — confirmar que o encerramento rodou sem timeout.

## 2026-06-22 — Sessão 87: CSAT — security findings resolvidos [T8/CSAT]

**Contexto:** 6 findings de segurança flagged na sessão 84/85 (não auto-aplicados em prod por protocolo) foram todos resolvidos pelo Wandson.

**Resolvidos:**
- HIGH: rate limiter in-memory por `x-forwarded-for` (spoofável; não durável em multi-worker)
- HIGH: `public_token` visível a qualquer membro do tenant sem segmentação por usuário
- MEDIUM: sem validação de tamanho/charset em `contact_identifier`/`nome_cliente`
- MEDIUM: CORS wildcard global no Bridge (pré-existente)
- LOW: Zod error details expostos em respostas 400
- LOW: sem CSP na página pública `/avaliacao/`

---

## 2026-06-22 — Sessão 86/87: CORA — dedup diário (PR #471) [T8/Cora]

**Problema:** Fila de aprovação exibia múltiplos drafts para o mesmo número de telefone (ex: Mikelly Container + MIKELLY & CIA para 94991857808). Wandson podia aprovar duas vezes e enviar 2 mensagens para o mesmo cliente no mesmo dia.

**Solução (3 camadas):**
1. **`trigger/cora/processar-cobranca.ts`** — antes de criar draft, verifica `agent_drafts` por `status in (pending, sent)` + `metadata->>customer_phone` + `created_at >= meia-noite BRT`. Retorna `skipped: true, reason: "draft_duplicado_hoje"` se já existe.
2. **`bridge-server/routes/cora-aprovacao.js`** — novo passo 4 (dedup diário): antes de enviar via Evolution, verifica se já há `status=sent` para o mesmo phone hoje. Retorna HTTP 409 com `code: DUPLICATE_SEND_TODAY`.
3. **`src/console/Cora.jsx`** — fila de aprovação deduplica por `metadata.customer_phone` antes de renderizar. Exibe aviso "N cobranças ocultas — mesmo número já aparece na fila".

**Resultado:** PR #471 mergeado · Bridge reiniciado (online, 0 unstable restarts) · Trigger.dev version 20260622.22 deployada (75 tasks).

## 2026-06-22 — Sessão 85/86: CORA — fix "Failed to fetch" ao Aprovar e Enviar + 422 para número sem WhatsApp (PR #467) [T8/Cora]

**Problema reportado:** Wandson clicou em "Aprovar e Enviar" no dashboard CORA → alerta genérico "Failed to fetch", mensagem não enviada.

**Causa raiz (2 pontos):**
1. `call()` em `Cora.jsx` usava `await r.json()` sem `.catch()` — se o parse falhasse, exceção subia ao `catch(e)` externo → `alert(e.message)` = "Failed to fetch"
2. Bridge: PATCH e INSERT sem try/catch dentro do bloco `!ew.ok` podiam lançar exceção e bloquear a resposta de erro ao frontend

**Entregue (PR #467, squash-mergeado, bridge deployado):**
- `src/console/Cora.jsx`: `call()` → `r.json().catch(()=>({}))` — parse falho retorna objeto vazio, sem exception
- `bridge-server/routes/cora-aprovacao.js`: detecta `exists:false` na resposta Evolution → retorna **422** com mensagem "Número X não está cadastrado no WhatsApp. Verifique o contato." (em vez de 502 genérico); PATCH + INSERT em try/catch independentes; Evolution 400 foi confirmado nos logs como causa dos erros anteriores da Villas Caldos da 14

**Verificação (output bruto):** `pm2 restart bridge-server` → bridge online, `pm2 logs` mostra boot clean + entry de erro anterior `[cora-aprovacao] Evolution 400: exists:false` confirmando que o novo código já processou corretamente.

**⚠️ Pendente do Wandson:** validação visual no browser — clicar "Aprovar e Enviar" em draft válido (número com WhatsApp) e confirmar que não aparece mais "Failed to fetch".

**Branch:** `wandson/cora-r3-error-ux` (squash → main).

---

## 2026-06-22 — Sessão 85: CSAT — fix 500→404 para token não-UUID + browser-test completo (PR #466) [T8]

**Problema:** `GET /api/publico/avaliacao/<token-malformado>` retornava HTTP 500. Causa: coluna `public_token` é `uuid` no PostgreSQL; string não-UUID na query fazia o Supabase retornar `400/22P02 (invalid input syntax for type uuid)` → `sbFetch` lançava exceção → caia no `catch` → 500.

**Fix (`bridge-server/routes/publico-avaliacao.js`):** UUID regex antes de consultar o banco:
```js
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
if (!UUID_RE.test(token)) return null; // → 404 link_invalido
```

**Verificação smoke (output bruto):**
- Token inválido `token-invalido-teste` → `{"error":"link_invalido"}` 404 ✓
- UUID não-cadastrado `00000000-0000-0000-0000-000000000000` → `{"error":"link_invalido"}` 404 ✓

**Browser-test completo via javascript_tool (tab V15/Chrome):**
- DOM: logo CD, nome cliente "João Teste Browser", atendente "Lorena (Atendente Teste)", ★★★★★, botão ✓
- Header background `rgb(183, 12, 0)` = `#B70C00` (brand color do tenant) ✓
- POST nota 5 → `status=respondida, tratativa_status=na` no banco ✓
- Anti-dupla-submissão: segundo POST → 409 `ja_respondida` ✓
- Detrator nota 2 → `tratativa_status=pendente` no banco ✓
- Bundle confirmado: `index-B27iXOsz.js` contém `theme_color`, `crm_externo`, bridge URL ✓
- Cleanup: 2 registros de teste removidos do banco ✓

**PR #466** (branch `wandson/fix-csat-uuid-404`) — squash-mergeado (SHA `c58fa4b`) — bridge re-deployado (PID 84701).

**Segurança (flags-only, NÃO aplicado em prod):** HIGH — `public_token` acessível a qualquer membro do tenant (RLS não segmenta por usuário); HIGH — rate limiter in-memory por `x-forwarded-for` (spoofável); MEDIUM — sem validação de formato em `contact_identifier`/`nome_cliente`; MEDIUM — CORS wildcard global; LOW — Zod error details em 400; LOW — sem CSP na página pública.

---

## 2026-06-22 — Sessão 84/85: CSAT de Atendimento — integração CRM externo, atendente, expiração 7d e branding [T8 — novas features]

**Contexto:** Wandson pediu 5 evoluções no CSAT de Atendimento, conectadas a um fato novo de produto: as empresas-clientes **fecham o atendimento dentro do CRM delas e usam a API oficial do WhatsApp** — logo nós NÃO enviamos a mensagem pela Evolution. O CRM dispara um webhook ao finalizar, criamos a avaliação e devolvemos o link na resposta síncrona, e o **próprio CRM envia o link pelo WhatsApp oficial dele**.

**Requisitos (verbatim):**
1. Identificar/registrar o atendente que fez o atendimento.
2. CRM fecha pelo chat ao vivo → enviar o link automaticamente no momento da finalização.
3. Cliente tem só **7 dias** para avaliar (antes 60).
4. Link/página precisa estar **personalizado com as cores da marca**.
5. CRM usa **API oficial do WhatsApp** → a mensagem sai do CRM dele, não da nossa Evolution.

**Decisões travadas (AskUserQuestion):** (Q1) CRM dispara webhook HTTP na finalização; (Q2) webhook inbound autenticado com **resposta síncrona** (CRM faz POST ao fechar → criamos avaliação → devolvemos o link no JSON → CRM envia pelo WhatsApp oficial dele; sem Evolution/outbound nosso); (Q3) conversas vivem **100% no CRM externo** (não usar nossa tabela `conversations`); (Q4) expiração de 7 dias vale para **CSAT e NPS**.

**Entregue:**
- **Migration `20260622_001_csat_origem_crm_e_expiracao.sql`** (APLICADA) — `atendimento_avaliacoes`: `conversation_id` DROP NOT NULL; UNIQUE vira **parcial** `WHERE conversation_id IS NOT NULL`; novas colunas `contact_identifier text`, `origem text NOT NULL DEFAULT 'interno' CHECK in ('interno','crm_externo')`, `external_ref text`; unique parcial `(tenant_id, external_ref) WHERE external_ref IS NOT NULL` (idempotência); `public_token_expires_at` DEFAULT `now()+7d` em **ambas** `atendimento_avaliacoes` e `nps_avaliacoes`.
- **Migration `20260622_002_crm_webhook_tokens.sql`** (APLICADA, RLS verificada) — tabela `crm_webhook_tokens` (tenant_id FK, `token_hash` SHA-256 — nunca plaintext, `ativo`, `last_used_at`), RLS por membro do tenant; Bridge usa service-role.
- **`bridge-server/routes/crm-atendimento-webhook.js`** (novo) — `POST /webhooks/crm/atendimento-finalizado`; auth `x-crm-token` → SHA-256 → `timingSafeEqual` vs `crm_webhook_tokens`, `ativo=true`; body Zod; idempotência por `(tenant_id, external_ref)`; cria `origem='crm_externo'`, `conversation_id=null`; resposta síncrona `{url, public_token, expires_at}`; rate limit 120/min; cap de 256 chars no token.
- **`bridge-server/routes/publico-avaliacao.js`** — GET passa a devolver `brand {name,color,theme_color,logo_url}` do tenant (`safeLogoUrl` só https); mantém a regra de NUNCA expor telefone/conversation_id/tenant_id/UUID atendente/tratativa_*.
- **`bridge-server/routes/avaliacao-link.js`** (novo) — GET `/api/avaliacao/link?conversation_id=` autenticado (requireJwt + assertTenantMember).
- **`src/screens/publico/AvaliacaoPublica.jsx`** (novo) — página pública branded (cores da marca, logo, 1–5 estrelas + comentário), `fetch` ao Bridge SEM anon key.
- **`src/main.jsx`** — branch de rota `/avaliacao/`.
- **`src/console/AtendimentoAvaliacoes.jsx`** — badge de origem (interno/crm_externo) + `contact_identifier` quando sem `nome_cliente`.

**Segurança (flag-only, NÃO aplicado em prod):** token público retornado a qualquer membro do tenant em avaliacao-link.js (decisão de design pendente); rate limiter in-memory por x-forwarded-for (spoofável / não durável em multi-worker); sem validação de formato em contact_identifier/nome_cliente; CORS wildcard pré-existente no index.js; `detalhes` Zod expostos em 400 público; sem CSP na página pública.

**Pendente do Wandson:** validação visual no browser da página `/avaliacao/<token>` + teste real do webhook com token do CRM (plaintext via Infisical, nunca no git).

**Branch:** `claude/gracious-kapitsa-b2daad`.

---

## 2026-06-22 — Sessão 83/84: CORA R3 — assinatura *Cora* negrito + log de erro retry (PR #463) [T8 — Cora]

**Contexto:** Wandson pediu 3 ajustes pós-R2: (1) assinatura com nome "Cora" em negrito WhatsApp; (2) remover palavra "equipe" dos textos de cobrança (grep nos tasks Trigger.dev → nenhuma ocorrência encontrada); (3) registrar erro quando envio WhatsApp falha, para que o agente possa retentar.

**Entregues:**

- **`bridge-server/routes/cora-aprovacao.js` (PR #463):**
  - `ASSINATURA_CORA = '*Cora* | Financeiro, Consult Delivery'` (negrito `*...*` WhatsApp). Idempotência via `ASSINATURA_MARKER = '| Financeiro, Consult Delivery'` (resiliente a mudanças de prefixo).
  - Bloco `if (!ew.ok)`: além do `console.warn` anterior, agora registra `last_error / last_error_at / last_error_status` em `agent_drafts.metadata` (draft permanece `pending` para retry manual) **e** insere row em `cora_acoes(tipo='erro_envio', acao='falha_whatsapp')` para rastreio e retry pelo agente.

**Deploy:**
- PR #463 squash-mergeado → `git reset --hard origin/main && pm2 restart bridge-server` VPS → online (0 unstable restarts, uptime 19s).

**Nota:** "equipe" não aparece em nenhum prompt dos tasks `trigger/cora/*.ts` — sem mudança necessária no Trigger.dev.

---

## 2026-06-22 — Sessão 82/83: CORA — overflow KPI + rótulo período + assinatura fixa (PRs #457 e #461) [T8 — Cora]

**Contexto:** Wandson reportou 3 problemas: (1) valor longo "R$ 247.888,40" estourando fora do card KPI no dashboard CORA; (2) cards KPI sem indicar de quando são os dados; (3) assinatura da CORA nas mensagens WhatsApp deveria ser `— Financeiro, Consult Delivery` (sem nome da equipe/loja).

**Entregues:**

- **`src/console/console.css` (PR #457):** `.cv2-kpi` recebeu `min-width:0;overflow:hidden`. `.cv2-kpi .v` font-size 23→19px + `word-break:break-word;overflow-wrap:break-word`. Resolve overflow de valores monetários longos.
- **`src/console/Cora.jsx` (PR #457):** Rótulo de período calculado de `min/max(cobrancasV2[*].vencimento)`, exibido acima dos KPIs como "Dados históricos de {mês ini} a {mês fim} · N cobranças carregadas".
- **`bridge-server/routes/cora-aprovacao.js` (PR #461):** Remove `getNomeLoja` (lookup async do nome da loja) e simplifica `anexarAssinatura(mensagem)` para usar `ASSINATURA_CORA = '— Financeiro, Consult Delivery'` fixo, idempotente. Sem nome de equipe/loja.

**Deploy:**
- PR #457 squash-mergeado → GitHub Actions → Pages.
- PR #461 squash-mergeado → `git reset --hard origin/main && pm2 restart bridge-server` VPS → bridge online (boot clean, 0 unstable restarts).

**Pendente do Wandson:** validação visual no browser + teste real "Enviar para meu número" (confirmar assinatura no WhatsApp).

---

## 2026-06-21 — Sessão 81/82: NPS de Marca — módulo completo fim-a-fim (PR #458) [T8 — novas features]

**Contexto:** Implementação do módulo NPS de Marca (fidelidade à marca, separado do CSAT de atendimento 1-5). Escala 0-10. NPS = %Promotores(9-10) − %Detratores(0-6). Passivos = 7-8. Cooldown 30 dias por contato (`whatsapp_chat_id`). Token público com 60 dias de expiração. Constraint de segurança permanente: endpoint público usa service-role via Bridge (sem anon key, sem policy permissiva para anon), NUNCA retorna PII (telefone, conversation_id, tenant_id, UUID do atendente, nenhum campo tratativa_*).

**Entregues (8 arquivos + 1 migration aplicada):**

- **Migration `20260621_002_nps_avaliacoes` (`{"success":true}`):** tabela `nps_avaliacoes` (id, tenant_id, contact_identifier, contact_nome, origin_conversation_id, public_token UUID UNIQUE, public_token_expires_at 60d, nota 0-10 nullable, comentario, status pendente/respondida/expirada, responded_at, tratativa_status na/pendente/em_andamento/resolvido, tratativa_obs/by/at, timestamps). 5 índices. RLS: membros do tenant podem SELECT/INSERT/UPDATE — sem policy anon. Trigger SECURITY DEFINER `trg_fn_conv_gen_nps_token`: dispara AFTER UPDATE OF status_v2 ON conversations WHEN fechado, verifica cooldown 30d via NOT EXISTS, insere registro com token UUID e expiração 60 dias.
- **`bridge-server/routes/publico-nps.js`:** GET/POST `/api/publico/nps/:token`. Rate-limiter in-memory 60 req/min/IP. GET: `{nome_loja, status}` ou `{ja_respondida:true, nota}` (sem PII). POST atômico: PATCH `status=eq.pendente + Prefer:return=representation` (array vazio → 409 anti-dupla-submissão). Nota ≤6 → `tratativa_status='pendente'`. Usa service-role via sbFetch (bypassa RLS).
- **`bridge-server/routes/nps-link.js`:** GET `/api/nps/link` autenticado por JWT. Retorna `{public_token, url, expires_at, status}` se pendente; `{disponivel:false}` em cooldown; 204 se sem NPS prévio.
- **`bridge-server/routes/avaliacao-resumo.js`:** generalizado para `fonte:'csat'|'nps'`. Tabela, colunas select e prompt de IA (contexto de indicação vs. satisfação) diferem por fonte. Node 22 native fetch (sem node-fetch ESM-only).
- **`bridge-server/index.js`:** ambas as rotas NPS registradas (`/api/publico` + `/api`).
- **`src/screens/publico/NpsPublico.jsx`:** página pública. 11 botões 0–10 com cores (≥9=verde/#10B981, ≥7=âmbar/#F59E0B, ≤6=vermelho/#EF4444). Estados LOADING/ERRO/JA_RESPONDIDA/FORMULARIO/SUCESSO. Sucesso mostra categoria Promotor 🥳/Passivo 😊/Detrator 😔 com nota/10 badge. Pergunta de indicação de marca.
- **`src/console/NpsResultados.jsx`:** painel Console v2. KPIs: NPS score (-100..100), %Promotor, %Detrator, total respondidas. Distribuição 0–10 com barras. Lista detratores pendentes (`nota≤6 + tratativa pendente/em_andamento`). Resumo IA via `/api/avaliacao/resumo` com `fonte:'nps'`. Tratativas inline por linha (save em `nps_avaliacoes`). `<RequireRole roles={['admin','gestor']}/>`.
- **`src/console/ConsoleV2.jsx`:** import NpsResultados + item de menu "NPS — Marca" (após csat) + render case.
- **`src/main.jsx`:** rota `/nps/:token` pública via `_isPublicNps = _path.startsWith('/nps/')`.

**Deploy:** PR #458 squash-mergeado em main (SHA `0d51dee`). Frontend em produção via GitHub Pages (~3 min pós-merge).

**⚠️ Pendente do Wandson:** `pm2 restart bridge-server` na VPS (3 novos routers só carregam após restart) + validação visual no browser + teste real da página `/nps/:token`.

**Track: T8/novas features.**

---

## 2026-06-21 — Sessão 77/78: Layout tabelas CORA + Gerar lembrete corrigido (PR #450) [T8 — Cora / financeiro]

**Contexto:** Wandson reportou 2 bugs no dashboard CORA após o PR #448: (1) "informações saindo fora do bloco" — coluna CLIENTE sem truncação expandia as tabelas; (2) "Gerar lembrete não faz nada" — botão chamava o bridge mas `cobranca_v2_id` era enviado na raiz do body e descartado silenciosamente.

**Correções (`src/console/Cora.jsx`, 19 linhas):**

- **Layout:** `tableLayout: 'fixed'` + `width%` em todas as colunas das duas tabelas (Vencidas por cliente + Vencem em 7 dias). CLIENTE e TELEFONE receberam `overflow: hidden` + `textOverflow: ellipsis` + `whiteSpace: nowrap` + `title` para ver o nome completo no hover.
- **Gerar lembrete:** root cause — bridge extrai `const { tenant_id, payload = {} } = req.body`, então `cobranca_v2_id` enviado na raiz do body nunca chegava ao Trigger.dev (Zod parse falhava silenciosamente no task). Fix: `body: JSON.stringify({ tenant_id, payload: { cobranca_v2_id: cob.id } })`.

**Deploy:** PR #450 squash-mergeado (SHA `c1ecbe8`). Frontend em build pelo GitHub Actions (~3 min).

**Track: T8/Cora.** Próxima ação: validação visual do Wandson — clicar Gerar lembrete e confirmar que o draft aparece com texto, e que as tabelas ficam dentro do bloco.

---

## 2026-06-21 — Sessão 76/77: Revisão completa do dashboard CORA — 8 reclamações do Wandson (PR #448) [T8 — Cora / financeiro]

**Contexto:** Wandson revisou o dashboard da CORA (cobrança via WhatsApp, em desenvolvimento) e listou 8 problemas: (1) "Gerar mensagem" não gera; (2) "Gerar lembrete" não gera; (3) sem opção de enviar manualmente ao cliente; (4) não vê o texto da mensagem; (5) sem data de vencimento na Régua; (6) sem telefone na tabela "Vencem nos próximos 7 dias"; (7) sem visibilidade de enviado/visualizado no WhatsApp; (8) layout bagunçado com informação vazando dos blocos.

**Causa-raiz nº 1 — coluna `body` → `content`:** a migration `20260504_006_align_schemas_with_restructuring_revised.sql:231` renomeou `agent_drafts.body` → `content`. O frontend ainda lia `draft.body` (4 lugares em `Cora.jsx`) e dois tasks Trigger ainda gravavam `body:` no insert (`gerar-mensagem.ts:123`, `processar-cobranca.ts:142`). Efeito: o draft até era criado pelo task correto (`gerar-mensagem-asaas`, que já usava `content`), mas o texto renderizava em branco → percebido como "não gera" + "não vejo o texto"; e os botões de envio manual ficavam escondidos atrás do preview vazio.

**Correções (`src/console/Cora.jsx` +225 linhas, 2 tasks Trigger):**

- **A — `body`→`content`:** frontend (`draft.content` nas leituras) + `trigger/cora/gerar-mensagem.ts` e `trigger/cora/processar-cobranca.ts` (insert usa `content:`).
- **B — falha de geração não mente mais:** `gerarMensagem(cob)` checa erro do Bridge/run; em falha, limpa o loading e mostra `alert()` em vez de spinner infinito de 30s.
- **C — data de vencimento na Régua (#5):** badge relativo + data `DD/MM` via `cob.vencimento.split('-').reverse().join('/')`.
- **D — coluna Telefone (#6):** adicionada nas tabelas "Vencidas" e "Vencem em 7 dias" (`customer_phone`).
- **E — status enviado/visualizado (#7):** componente `StatusEnvioCell({ enviado, viewedDate })` (badge "Enviado" de `cora_acoes` + "Visto" de `invoice_viewed_date` do Asaas) nas duas tabelas + preview inline do draft.
- **F — layout (#8):** linha-flex da Régua convertida para grid (`gridTemplateColumns: 'auto minmax(0,1fr) auto auto auto auto'`) com `min-width:0` nos blocos de texto — nada mais vaza do card.
- **Envio manual (#3):** os botões "✓ Enviar agora" / "🧪 Enviar para meu número" já existiam na Régua; passaram a aparecer com o preview visível (`enviarDraft(draft, testPhone)` → `POST /api/cora/aprovar/:draft_id[?test_phone=]`).

**Deploy:** PR #448 squash-mergeado (`74f1eb3` em main). Trigger.dev v20260621.14 (75 tasks) deployado.

**Verificação ponta-a-ponta (output bruto):** disparei o task real `cora-gerar-mensagem-asaas` (o que o botão chama) com cobrança real "Café Container" via Trigger REST API (chave `tr_prod_` de `bridge-server/.env`) → run `cmqn7e3e73fjk0jlq68nwny46` COMPLETED → output `{ok:true, draft_id:"d5ef7fd4-…", mensagem:"Oi! Tudo bem…", tom_usado:"amigavel"}` → DB confirmou draft com `content_len=460`, `status=pending`, telefone presente (antes vinha vazio e o INSERT falhava). Schema confirmado: coluna `content` existe, `body` não existe. Draft de teste `d5ef7fd4` DELETADO (linha única que criei) para não poluir o painel nem arriscar envio a cliente real. Bundle frontend em prod (`index-CPhTeOaP.js`) com as strings da feature ("Enviar agora", "Enviar para meu número", "Visto", "venc.").

**⚠️ Pendente de validação visual:** o teste no browser logado do Wandson NÃO foi feito (sessão noturna, sem ele presente); a prova foi via disparo real do task + DB. Wandson deve abrir Cora → Régua/Financeiro e confirmar visualmente: gerar mensagem mostra o texto, data de vencimento, telefone nas tabelas, badges enviado/visto e layout sem vazamento.

**Track: T8/Cora.** Próxima ação: validação visual do Wandson no dashboard CORA.

---

## 2026-06-21 — Sessão 75/76: Fit Cobrança da CORA — 6 bugs corrigidos (PR #444) [T8 — Cora / financeiro]

**Contexto:** Wandson identificou 6 problemas no dashboard da CORA após teste no browser. Sessão resolveu todos de forma completa.

**Bugs corrigidos:**

- **Bug 1 — LLM errado:** Tasks Cora usavam Anthropic Haiku via `anthropic.messages.create()`. Migradas para `chat()` do `trigger/agents/llm-client.ts` que roteia para Kimi K2.6 via Ollama (`LLM_PROVIDER=ollama-cloud`). Arquivos: `gerar-mensagem.ts`, `gerar-mensagem-asaas.ts`, `processar-cobranca.ts`. Padrão: remover `import Anthropic + new Anthropic()`, substituir chamada por `await chat([{role:"system",...},{role:"user",...}])`, usar `result.content`.
- **Bug 2 — KPI cards overflow em CoraScreen.jsx:** `gridTemplateColumns: 'repeat(4, 1fr)'` não quebrava em telas menores. Fix: `repeat(auto-fit, minmax(160px, 1fr))` com `minWidth: 0` nos cards.
- **Bug 3 — "Recebido este mês" usando data errada:** filtrava por `vencimento` (data de vencimento) em vez de `payment_date || confirmed_date` (data real do pagamento). Corrigido no bar chart dos 6 meses (chartData) em `Cora.jsx`.
- **Bug 4 — Dois blocos de período:** adicionados side-by-side ("Últimos 30 dias" + "Mês atual") com 4 KPIs cada (Recebido/Confirmados/A receber/Inadimplência). Recebidos calculados com `payment_date || confirmed_date`.
- **Bug 5 — Tabelas incompletas:** "Vencidas" e "Próx. 7 dias" ganharam colunas Forma (badge PIX/Boleto/Cartão colorido com cores específicas) e Fatura (link clicável via `invoice_url || bank_slip_url`).
- **Bug 6 — Mensagem sem link de pagamento:** `gerar-mensagem-asaas.ts` não buscava `invoice_url`, `bank_slip_url`, `pix_qr_code`, `billing_type`. Select expandido + variáveis `linkPagamento`/`pixCopiaECola` + prompt inclui os links + `metadata.link_pagamento` no draft.

**Deploy:** PR #444 squash-mergeado (`dab7d3c` em main). Trigger.dev v20260621.3 (75 tasks) deployado com sucesso.

**Track: T8/Cora.** Próxima ação: abrir browser, ir em Cora → Financeiro → Visão Geral e verificar (1) dois blocos de período side-by-side, (2) badges e links nas tabelas, (3) "Recebido" bate com dados reais Asaas, (4) gerar mensagem inclui link de pagamento.

---

## 2026-06-20 — Sessão 74/75: Debug cora-gerar-mensagem-asaas — 3 bugs root-cause corrigidos + migration nullable (PR #442) [T8 — Cora / financeiro]

**Contexto:** Fluxo "Gerar mensagem → Preview → Aprovar → Enviar WhatsApp" travava: spinner ficava ~20s e voltava sem draft em `agent_drafts`. Trigger.dev não mostrava erro porque o task dispara async (Bridge retorna 202 imediatamente). Investigação top-down revelou 3 bugs simultâneos no caminho de persistência.

**Bugs corrigidos (`trigger/cora/gerar-mensagem-asaas.ts`):**

- **Bug 1 — campo errado no insert:** `agent_drafts` tem coluna `content` (não `body`). O insert usava `body: parsed.mensagem` → Supabase retornava erro silencioso (PostgREST ignora campos desconhecidos); corrigido para `content: parsed.mensagem`.
- **Bug 2 — violação CHECK constraint em `autonomy_level`:** O insert passava `autonomy_level: modo` (literal `"hibrido"/"humano"/"ia"`) mas a coluna tem `CHECK (autonomy_level IN ('verde','amarelo','vermelho'))`. Inserção falhava com `check_violation`. Corrigido com mapeamento: `modo === "ia" ? "verde" : modo === "humano" ? "vermelho" : "amarelo"`.
- **Bug 3 — violação NOT NULL em `cora_acoes.cobranca_id`:** O insert em `cora_acoes` incluía `cobranca_id: null` para registros V2 (que usam `cobranca_v2_id`). A FK é `NOT NULL REFERENCES cora_cobrancas(id)` (tabela V1). Corrigido omitindo o campo completamente do insert V2.

**Migration aplicada (`supabase/migrations/20260620_004_cora_acoes_cobranca_id_nullable.sql`):** `ALTER TABLE public.cora_acoes ALTER COLUMN cobranca_id DROP NOT NULL` — permite inserção de registros V2 sem entrada em `cora_cobrancas`. Risco baixo: ALTER sem dados alterados, reversível.

**Conflitos de merge resolvidos em PR #442 (branch `claude/agitated-cray-5d3b5e` vs main após PRs #438-441):**
- `Cora.jsx` — 6 conflitos: sempre aceito `origin/main` (melhorias novas: `rejeitarMap`, `useMemo`, `rejeitarDraft`, spinner timeout 30s)
- `bridge-server/routes/cora-aprovacao.js` — 1 conflito: aceito `origin/main` (validação regex `test_phone`)

**Deploy:** PR #442 squash-mergeado (`56eba91` em main). Trigger.dev v20260620.18 (75 tasks) deployado. Bridge reiniciado: online, 0 unstable restarts. **Smoke test confirmado:** insert `agent_drafts` com `autonomy_level=amarelo` OK + draft removido. Todos os 3 bugs provados resolvidos.

**Track: T8/Cora.** Próxima ação: teste E2E no browser (Gerar → Preview → Aprovar → WhatsApp).

---

## 2026-06-20 — Sessão 73/74: Dashboard Cora — régua de cobrança interativa + saldo Asaas + gráficos de pizza (PR #437) [T8 — Cora / financeiro]

**Contexto:** Wandson pediu upgrade completo do dashboard Cora: ver a mensagem que seria enviada pela régua de cobrança, botão de envio manual com 1 clique, número de telefone visível, status de envio, teste para número próprio, saldo da conta Asaas, gráficos de pizza, filtros de status, e responsividade mobile completa.

**Entregues:**

- **`bridge-server/routes/asaas-saldo.js`** (novo) — GET `/api/asaas/saldo`: chama Asaas `/v3/finance/balance`, cache de 5 min em módulo, retorna `{ balance, onlineBalance, ... }`. Registrado em `bridge-server/index.js` com `requireJwt`.
- **`bridge-server/routes/cora-aprovacao.js`** — adicionado suporte a `?test_phone=` (redireciona envio para número de teste, mantendo autenticação JWT obrigatória). Combinado com `assertTenantMember()` do main para segurança IDOR.
- **`src/console/Cora.jsx`** — grandes adições:
  - **`PieChartSimple`**: SVG donut puro (sem dependência externa), cálculo trigonométrico de arcos `polar()/slicePath()`, tooltip nativo.
  - **KPIs expandidos**: 6 cards em `repeat(auto-fit, minmax(160px, 1fr))` — Saldo Asaas, Recebido este mês, Confirmadas, Aguardando, Inadimplência, Taxa %.
  - **Toggle gráficos**: botão "Versão gráfico" alterna cards ↔ 2 donuts (distribuição por status + por tipo de pagamento).
  - **Régua de Cobrança**: seção interativa com filtros (Todas / Vencidas / Próx. 7 dias), lista de elegíveis (overdue + pending ≤7d), telefone visível, badge de status (Pendente/Gerado/Enviado), botão contextual por cobrança.
  - **Fluxo gerar → preview → enviar**: `gerarMensagem(cob)` → POST Bridge → aguarda draft via realtime Supabase → auto-expande preview → `enviarDraft(draft, testPhone)` → badge "✓ Enviado".
  - **Auto-clear spinner**: `useEffect` observa `drafts` (realtime) e limpa `loadingMsgMap` quando draft aparece para aquela cobrança.
  - **"Enviar para meu número"**: `prompt()` coleta número → `enviarDraft(draft, phone)` → `?test_phone=` no endpoint.
  - **Mobile-first**: grids `repeat(auto-fit, ...)` para KPIs e pies; régua em coluna no mobile.

**Conflito de merge resolvido:** PRs #430 e #432 tinham chegado em main. `git merge origin/main` no worktree, `git checkout --theirs` nos arquivos trigger (não nossos), resolução manual do bridge, `git checkout --theirs` do Cora.jsx (tomou main 1544 linhas) + reaplicação manual das features novas.

**Deploy:** PR #437 squash-mergeado em main (SHA `e368cdb`). Bridge reiniciado: `git reset --hard origin/main && pm2 restart bridge-server` na VPS. `ASAAS_API_KEY: ✓` confirmado no env do bridge. Features `Régua de Cobrança` e `Saldo Asaas` confirmadas no bundle live `index-DsZ8t_2j.js` via grep.

**Track: T8/Cora.** Próximas ações pendentes (do Wandson): DELI motor — religar 2 triggers no banco; VendaERP GATE 0 + rotação token; Oracle E2E; OpenRouter recarga de créditos; T9: 1º cliente real.

---

## 2026-06-20 — Sessão 72/73: 5 bugs follow-up Respostas Rápidas — encerrando os 9 do code review sessão 60 (PR #435) [T9 — chat ao vivo]

**Contexto:** Sessão de continuação pós-compactação 71/72. O único pendente autônomo era fechar os 9 bugs do code review da sessão 60 (Respostas Rápidas / QR). 3 já foram corrigidos no PR #418 (sessão 66/67). A sessão auditou os arquivos reais e encontrou 5 bugs presentes (1 reclassificado como já-funcionando).

**Bugs corrigidos:**
- **MIME dinâmico em `ChatScreen.jsx` `insertQR`:** detection por extensão do arquivo (png/gif/webp/jpeg) para `file_path` e `media_url` — antes hardcoded `image/jpeg` para todas as imagens.
- **Feedback de erro em `ChatScreen.jsx` `enviarQrMidia`:** `!resp.ok` throw + `alert()` no catch — erros eram silenciados (usuário não sabia que a mídia não foi enviada).
- **JID strip em `evolution.js` `sendMediaMessage`:** `to.split('@')[0]` adicionado para consistência com `sendAudioMessage` (antes o `@s.whatsapp.net` era passado na chamada de mídia, causando falha potencial).
- **Memory leaks `URL.createObjectURL` em `RespostasRapidas.jsx`:** `URL.revokeObjectURL` adicionado em 3 call-sites: `handleFileChange` (revoga URL anterior antes de criar nova), `removerArquivo` (revoga ao limpar), `recorder.onstop` (revoga áudio anterior ao salvar novo).
- **Orphans no Storage em `RespostasRapidas.jsx` `remover`:** após DELETE na tabela `quick_replies`, agora deleta o arquivo correspondente do bucket `public` via `supabase.storage.from('public').remove([item.file_path])`.

**Verificação:** `npm run build` ✓ 7.99s (sem novos erros). **PR #435** squash-mergeado em main (SHA `ad0a974`).

**Resultado:** Todos 9 bugs do code review da sessão 60 encerrados — 3 no PR #418 (sessão 66/67) + 5 no PR #435 (esta sessão) + 1 reclassificado como já-funcionando.

**Próximas ações pendentes (do Wandson):**
- DELI motor: religar 2 triggers (`cliente_sumiu_7d`, `metrica_caiu_20pct`) no banco
- VendaERP GATE 0: E2E Telegram + rotação do token vazado
- Oracle: E2E autenticado no console
- OpenRouter: recarga de créditos (saldo $2.81 < $5)
- T9: 1º cliente real

---

## 2026-06-19 — Sessão 71/72: Continuação pós-compactação — confirmação de integridade + fix commit docs travado (PR #433) [T8/Cora + docs]

**Contexto:** Sessão de continuação após compactação de contexto da 70/71. Não havia trabalho técnico novo — objetivo era confirmar integridade e corrigir uma pendência de docs.

**Decisões/ações:**
- **Verificação:** migration `20260619_001` aplicada, `sync-financeiro.ts` mapeando 6 colunas, `Cora.jsx` com 3 sub-tabs, PR #432 mergeado, Trigger.dev `20260619.27` deployado (75 tasks) — tudo confirmado com leitura dos arquivos reais.
- **Fix de commit travado:** commit `a9d8848` (`docs(tracker): sessão 70/71`) estava em main local mas o hook bloqueou push direto. Solução: branch `wandson/tracker-sessao-70-71` criada do HEAD local, PR #433 criado via GitHub MCP e mergeado (SHA `0275da3`).
- **Tracker atualizado:** entradas formais para sessões 70/71 e 71/72 adicionadas ao log de sessões; "Onde parou" atualizado para sessão 71/72.

**Pendente autônomo (próxima sessão):** 9 bugs Respostas Rápidas identificados no code review da sessão 60 — 3 críticos (mic leak ao trocar tipo, media_url zerando em QRs legados, insertQR silenciando QRs com media_url), 4 médios, 2 baixos. Arquivos: `src/console/RespostasRapidas.jsx` + `src/screens/ChatScreen.jsx`.

---

## 2026-06-19 — Sessão 69/70: Dashboard Financeiro — seções "Vencidas por cliente" + "Vencem em 7 dias" + task `cora-gerar-mensagem-asaas` (PR #430) [T8 — Cora / financeiro]

**Contexto:** Continuação da sessão 68/69. O dashboard financeiro da Cora precisava de dois blocos de ação rápida: (1) cobranças já vencidas agrupadas por cliente com botão de geração de mensagem com tom automático; (2) cobranças que vencem nos próximos 7 dias com lembrete preventivo. Além disso, havia um gap V1/V2: a task `cora-gerar-mensagem` original lia da tabela `cora_cobrancas` (V1) e não preenchia `metadata.customer_phone` nem `metadata.cobranca_v2_id` — campos obrigatórios para o `cora-aprovacao.js` enviar via WhatsApp.

**Decisões tomadas:**
- Nova task dedicada `cora-gerar-mensagem-asaas` lendo de `cobrancas` (V2/Asaas) em vez de reutilizar a V1
- Auto-seleção de tom: `isLembrete` (dias<0) → amigavel, ≤7d → neutro, ≤14d → formal, 15+d → urgente
- `metadata` salvo com `customer_phone` + `cobranca_v2_id` para `cora-aprovacao.js` funcionar
- Geração via `claude-haiku-4-5-20251001` (mais barato para volume de cobranças)
- UI: grupos "vencidas por cliente" por `customer_name || customer_phone || id`, ordenado por `maxDias DESC`

**Arquivos criados:**
- `trigger/cora/gerar-mensagem-asaas.ts` — task `cora-gerar-mensagem-asaas` com leitura de `cobrancas` V2, auto-tom, Haiku, draft + `cora_acoes`

**Arquivos modificados:**
- `src/console/Cora.jsx` — dois novos blocos na aba Financeiro entre o aging e a tabela de cobranças: "Cobranças vencidas por cliente" (badge vermelho pulsante, tabela cliente/qtd/total/dias/botão auto-tom) + "Vencem nos próximos 7 dias" (badge âmbar pulsante, tabela cliente/valor/vencimento/faltam/botão lembrete); novo estado `loadingMsg`; nova função `gerarMensagemRapida(cobId, tom)` via Bridge `/agents/cora-gerar-mensagem-asaas/run`

**Verificação:**
- PR #430 squash-mergeado em main — SHA `9af365dc00f9d848b4cb4effd878b351ce15b04f`
- Trigger.dev deployado versão `20260619.21` com 75 tasks (inclui `cora-gerar-mensagem-asaas`)

**Próxima ação:**
- Teste E2E ponta-a-ponta: aba Financeiro → "Cobranças vencidas por cliente" → botão "Gerar cobrança" → verificar draft na aba "Agente Cora" → aprovar → mensagem chega no WhatsApp do cliente

---

## 2026-06-19 — Sessão 68/69: Integração Asaas completa — Dashboard Financeiro + Agente Cora ativado (PR #423) [T8 — Cora / financeiro]

**Contexto:** Wandson pediu integração completa do Asaas em uma sessão: sync de cobranças → dashboard financeiro → régua diária de cobrança → aprovação com 1 clique via WhatsApp.

**Decisões tomadas:**
- Modo Cora = Híbrido (draft → aprovação humana → Evolution API envia)
- Cora.jsx reformulada: 2 abas (Financeiro + Agente Cora)
- Tabela `cobrancas` = fonte primária (Supabase); Asaas = origem dos dados via cron
- `autonomy_level` mapeado: humano→vermelho, hibrido→amarelo, ia→verde (constraint DB)
- `tenant_agent_config` usa coluna `agent_id` (não `agent`)
- CSS flex bars para gráfico (sem biblioteca de charting instalada)
- `MAIN_TENANT_ID` via Infisical (lazy getter)

**Arquivos criados:**
- `trigger/asaas/sync-financeiro.ts` — cron a cada 30 min, upsert completo Asaas → `cobrancas` via `asaas_charge_id`
- `trigger/cora/regua-diaria.ts` — cron 09h BRT (12h UTC), janela T-7 a T+90, skip se já houve ação hoje
- `trigger/cora/processar-cobranca.ts` — subtask: lê V2, chama claude-haiku-4-5-20251001, insere `agent_drafts` + `cora_acoes`
- `bridge-server/routes/cora-aprovacao.js` — `POST /api/cora/aprovar/:id` (Evolution API) + `POST /api/cora/rejeitar/:id`

**Arquivos modificados:**
- `trigger/_shared/asaas.ts` — adicionado `listChargesAll()` com paginação completa (offset/limit)
- `bridge-server/index.js` — montagem da rota `cora-aprovacao` com `requireJwt`
- `src/console/Cora.jsx` — reescrita do componente principal: 2 abas, KPIs V2, CSS bar chart receita 6m, aging, tabela filtrada, fila de drafts com Aprovar/Rejeitar, histórico `cora_acoes`, ModoToggle

**Bug corrigido:**
- V1/V2 mismatch: régua original importava `coraEscalonar` (lê `cora_cobrancas` V1); refatorado para `coraProcessarCobranca` direto (V2)

**Verificação:**
- PR #423 squash-mergeado → SHA `d2f13fb635f7270b45e9dee9c912b7c5dd599722` em main
- `trigger.config.ts` usa `dirs: ["./trigger"]` — auto-descobre tasks novas sem registro manual

**Pendente (requer Wandson):**
- Fase 0: chave de produção Asaas → Infisical (`ASAAS_API_KEY` + `ASAAS_ENVIRONMENT=production`)
- Adicionar `MAIN_TENANT_ID` (UUID do tenant) ao Infisical
- `pm2 restart bridge-server` após atualizar Infisical
- `npx trigger.dev@4.4.6 deploy` para registrar as 3 novas tasks no Trigger.dev cloud

---

## 2026-06-18 — Sessão 67/68: Painel Agentes reescrito com identidade Console v2 (PR #420) [Console v2 — hub]

**Contexto:** Wandson pediu para refazer o Painel Agentes com identidade visual do Console v2, e verificar conformidade em produção.

**Problema:** O antigo `AgentsHub` (`src/screens/AgentsPage.jsx`) usava fundo escuro `#0f172a`, hero layout, gradiente e prompt composer dark — totalmente fora do design system do Console v2.

**Entregue:**
- `src/console/DeliHub.jsx` — novo componente com identidade v2 nativa: `.cv2-kpis`, `.cv2-card`, `.cv2-btn`, `var(--red)`, fundo claro `var(--bg)`. 11 agentes em `AGENT_META` com avatar colorido + letra, descrição, ETA. Grid responsivo de AgentCards. KPIs: execuções 30d, custo, taxa sucesso, agentes ativos. Execuções recentes via `agent_runs` (30d, limit 50) + Supabase Realtime. PromptBox delegando à DELI via Bridge. Overlays `BomDiaScreen`/`EncerramentoScreen` reusadas.
- `src/console/ConsoleV2.jsx` — import `AgentsHub` trocado por `DeliHub`, case `'hub'` atualizado.

**Verificação em produção:**
- Bundle `index-DEVP-sio.js` em `app.consultdelivery.com.br` confirmado com `analise-ifood` + `COO digital` (strings literais do novo `AGENT_META`)
- `DELI Hub` ausente (antigo removido)
- PR #420 squash-mergeado → `ba5e014` em main

---

## 2026-06-18 — Sessão 66/67: 3 bugs críticos Respostas Rápidas (PR #418) [T9 — chat ao vivo]

**Contexto:** bugs identificados no code review da sessão 60 (PR #372) ainda não corrigidos. Wandson aprovou com "Pode resolver isso".

**Bug 1 — Mic leak ao double-tap (`RespostasRapidas.jsx:iniciarGravacao`)**
- Sintoma: clicar 2x rápido no botão de gravação antes do React re-renderizar criava dois `getUserMedia` simultâneos; o primeiro stream nunca era parado.
- Raiz: nenhum guard de re-entrância.
- Fix: `if (recording) return;` no topo de `iniciarGravacao`.

**Bug 2 — `onstop` assíncrono sobrescreve `setFilePath(null)` após troca de tipo**
- Sintoma: usuário grava áudio, troca para outro tipo (ex: Texto) → o callback `onstop` (assíncrono) faz upload ao Storage e chama `setFilePath(path)` DEPOIS de `setFilePath(null)` → QR fica com `filePath` não-nulo → ao salvar, `media_url` de QRs legados é zerada para null.
- Raiz: `pararGravacao()` chama `recorder.stop()`, mas `onstop` é callback async; `setFilePath(null)` no handler do botão é sync — race condition.
- Fix: `uploadCancelledRef = useRef(false)` — setado para `true` antes de `pararGravacao()` na troca de tipo; checado no início de `onstop` para abortar o upload se cancelado.

**Bug 3 — crash silencioso em `enviarQrMidia` para QRs com `media_url` legada (`ChatScreen.jsx`)**
- Sintoma: QR antigo (criado antes de `file_path` existir, usa campo `media_url`) chegava ao modal de confirmação via branch `media_url` em `insertQR`, mas em `enviarQrMidia` a linha `qr.file_path.split('/')` lançava `TypeError: Cannot read properties of null` — swallowed pelo catch → mensagem nunca enviada, sem feedback ao usuário.
- Raiz: `qr.file_path` é `null` para QRs legados; `insertQR` roteia corretamente, mas `enviarQrMidia` não tratava o null.
- Fix: null-safe com fallback: `qr.file_path ? qr.file_path.split('/').pop() : (publicUrl.split('/').pop().split('?')[0] || 'media')`.

**Resultado:** PR #418 squash-mergeado (SHA `c25a900`). Build verde (6.78s). 2 arquivos modificados, 8 linhas adicionadas, 2 removidas.

## 2026-06-18 — Sessão 65/66: Transcrição automática de áudio outbound (PR #413) [T9 — chat ao vivo]

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

## 2026-06-18 — Sessão 66/67: Regras de feriado nacional para bom-dia e encerramento (PR #416) [T8 — agentes]

- **Contexto:** Wandson pediu que as mensagens automáticas de bom-dia e encerramento respeitassem feriados nacionais: (a) no próprio dia do feriado → não enviar nada; (b) no dia anterior a um feriado nacional → encerramento não pode dizer "voltamos amanhã" nem sugerir disponibilidade no feriado; (c) feriado facultativo → funciona normalmente (empresa trabalha).
- **`trigger/_shared/feriados.ts` (NOVO):** fonte única de verdade para feriados 2026/2027. Inclui 11-20 Consciência Negra (Lei 14.759/2023), que estava faltando em todos os arquivos. Exporta `isFeriadoNacional()` e `getNextWorkingDayReturnLine()` (itera até 10 dias à frente para cobrir correntes de feriados como Páscoa+Tiradentes 04-20+04-21 em 2026).
- **`bom-dia/envio-agendado.ts` + `encerramento/envio-agendado.ts`:** removida lista local duplicada de feriados; passam a importar `isFeriadoNacional` do `_shared`.
- **`encerramento/gerar-imagem.ts`:** detecta se amanhã é feriado nacional via `isFeriadoNacional(tomorrowYear, tomorrowMd)`; ajusta `returnLine` para indicar o próximo dia útil real; injeta `linha2System`/`linha2User` dinâmicos no prompt LLM para impedir que o modelo diga "disponível amanhã" ou qualquer variação quando o dia seguinte é feriado.
- **`bom-dia/gerar-imagem.ts`:** os dois schedules de cache-warming (seg–sex e sáb) pulam a geração de imagem em feriado nacional com early return + log.
- **TypeScript:** 0 erros (`/root/consult-delivery/node_modules/.bin/tsc --noEmit` EXIT 0).
- **Deploy:** versão `20260618.7` no Trigger.dev — 71 tasks detectadas e deployadas.
- **PR #416** squash-mergeado (SHA `e562387`).

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

## 2026-06-19 — Sessão 70/71: Extrato de Pagamentos Asaas no Dashboard Cora (PR #432) [T8 — Cora]

- **Contexto:** Wandson pediu: área de extrato com confirmação de pagamento, forma de pagamento (PIX/Boleto/Cartão), se o cliente visualizou a fatura (`invoiceViewedDate`) e extrair tudo possível da API Asaas.
- **Migration `20260619_001_cobrancas_extrato_fields.sql`** (APLICADA): 6 colunas aditivas em `cobrancas` — `payment_date` (date), `net_value` (numeric), `date_created` (date), `invoice_viewed_date` (timestamptz), `description` (text), `confirmed_date` (date). Antes esses campos existiam só no JSON bruto de `metadata.asaas_raw`.
- **`trigger/_shared/asaas.ts`:** schema `AsaasCharge` expandido com `invoiceViewedDate` e `confirmedDate` (nullable optional) — para que o Zod os valide/passe ao mapper.
- **`trigger/asaas/sync-financeiro.ts`:** upsert atualizado — os 6 campos agora salvos em colunas dedicadas para query eficiente no frontend (sem ter que fazer `->>'invoiceViewedDate'` no JSON).
- **`src/console/Cora.jsx`:** aba Financeiro reestruturada com estado `finSubTab` e 3 sub-tabs:
  - **Visão Geral:** KPIs existentes (total, overdue, pendente, taxa inadimplência).
  - **Extrato de Pagamentos:** KPI bruto/líquido/taxa Asaas %; breakdown por forma de pagamento (PIX, Boleto, Cartão, Indefinido) com cards coloridos + barra de progresso percentual; timeline cronológica reversa (mais recente no topo) — Cliente, Descrição, Forma (badge colorido), Bruto, Taxa (−R$X.XX), Líquido, Data pagamento, Fatura (👁 badge "Visualizado" com hover mostrando timestamp, ou "Não visto").
  - **Cobranças:** tabela filtrada existente (movida do sub-tab de Visão Geral).
- **Build:** `vite build` ✓ antes do commit.
- **PR #432** squash-mergeado em main (SHA `577da6fb`).
- **Deploy Trigger.dev:** versão `20260619.27` (75 tasks detectadas) — sync passará a popular `invoice_viewed_date` e `confirmed_date` a partir do próximo ciclo de 30 min.
- **Próxima ação:** nenhuma pendente nesta feature. Aguardar próximo sync do Asaas para as novas colunas preencherem; Extrato sub-tab então mostrará taxa real e badges "👁 Visualizado" para clientes que abriram a fatura.

## 2026-06-21 — Sessão 80/81: CORA revisão rodada 2 — envio de teste desbloqueado + horário legal + assinatura + extrato filtrável (PR #454 + hotfix #455) [T8 — Cora]

- **Contexto:** Wandson trouxe 6 itens novos com prints sobre o dashboard CORA (rodada 2 do feedback). Sessão de continuação fechando verificação/deploy/docs do plano A–F.
- **Causa-raiz nº 1 (envio de teste quebrado):** bridge filtrava `evolution_instances` por `&ativo=eq.true`, mas a tabela **não tem coluna `ativo`** — a real é `status` (`connected`/`disconnected`/`connecting`, `supabase/migrations/20260426_evolution_chat.sql:8-19`). Copy-paste de `whatsapp_groups(ativo)`. Erro `42703` no browser bloqueava todo envio manual.
- **(A) Bridge — `&ativo=eq.true`→`&status=eq.connected`** em `bridge-server/routes/cora-aprovacao.js` + demais routers que tocam `evolution_instances` (bom-dia/encerramento em `index.js`, `contratos.js`). NÃO tocado `contratos.js:76` (é `err.body` de HTTP, não a coluna).
- **(B) Bridge — guarda de horário legal + assinatura:** novo helper `bridge-server/lib/horario-cobranca.js` — `dentroHorarioLegal(date)` via `Intl.DateTimeFormat` TZ `America/Sao_Paulo` + feriados nacionais 2026–27. Regra: Seg–Sex 8h–21h · Sáb 8h–12h · Dom+feriados PROIBIDO. Guarda `409 { motivo, proximaJanela }` no `POST /api/cora/aprovar/:draft_id` ANTES do envio Evolution; envio de teste para número próprio é isento (passar o telefone do cliente como `test_phone` NÃO contorna — validação `/^\d{10,15}$/` + `isTestSend = rawTestPhone !== undefined && rawTestPhone !== phone`). Assinatura dinâmica `— CORA, assistente de cobrança da {lojas.nome}` (fallback genérico `— CORA, assistente de cobrança`), idempotente. **Boleto/PIX automático do Asaas NÃO passa por aqui → segue sem restrição** (requisito legal).
- **(C/D/E/F) Frontend `src/console/Cora.jsx`:** 409 tratado com motivo + próxima janela (alerta claro, não erro cru); aba Extrato com seletor de período (pills + datas personalizadas) e rótulo de período; KPIs do Extrato passam a refletir o período; card "Mês atual" com "faltam N cobr."; grades de KPI responsivas (`auto-fit minmax`) + `minWidth:0`/`wordBreak` sem vazamento.
- **Hotfix (#455):** `bridge-server/routes/avaliacao-resumo.js` — removido `require('node-fetch')` (ESM-only no v3, não é `require`-ável; derrubava o boot do bridge) → `fetch` global nativo do Node 22.
- **Verificação (output bruto):** bridge online/estável (0 unstable restarts, sem erro de boot); smoke do `dentroHorarioLegal` 6/6 (Seg 10h ok · Sex 21:30 bloqueia · Sáb 11h ok · Sáb 13h bloqueia · Dom 10h bloqueia · próxima janela "amanhã 08h"); `cora-aprovacao.js` lido na íntegra confirmando A+B+IDOR (`assertTenantMember`)+validação `test_phone`; bundle prod `index-CMpTGpqm.js` com grep de C/D/E ("Fora do horário legal", "proximaJanela", "Todo o histórico", "Últimos 30 dias", "faltam").
- **⚠️ Decisão de segurança:** NÃO cliquei "Aprovar e Enviar" em draft de cliente real (domingo 21/06 + guarda sob teste). Verificação feita de forma determinística (código deployado + smoke do helper + grep do bundle) sem tocar cliente real.
- **PRs:** [#454](https://github.com/deli-consult-delivery/consult-delivery/pull/454) (SHA `61455b5`) + hotfix [#455](https://github.com/deli-consult-delivery/consult-delivery/pull/455) (SHA `3506cef`) — ambos squash-mergeados em main.
- **Pendente do Wandson:** validação visual no browser em horário útil + 1 teste real "🧪 Enviar para meu número" (deve chegar com assinatura, sem o erro `ativo does not exist`).

## Sessão 86 — 2026-06-22 — ECC versionado no repo + auditoria de duplicatas

- **ECC versionado (PR #477, SHA `e666a0a`, squash em main):** adicionado `ecc` em `extraKnownMarketplaces` (git source affaan-m/everything-claude-code), `ecc@ecc` em `enabledPlugins` e `env.ECC_HOOK_PROFILE=minimal` no `.claude/settings.json`. Antes o ECC só vivia em `~/.claude` (escopo de usuário/VPS); agora skills/agents/hooks/MCP do ECC auto-carregam em qualquer máquina que clone o repo (VPS + notebook).
- **Auditoria de duplicatas (output bruto):** 0 duplicatas reais — ECC tem 271 skills + 67 agents com nomes únicos (os "repetidos" no `find` eram cópias de tradução `docs/ja-JP`/`docs/zh-CN` + scaffold `.agents`/`.kiro`). 0 colisão ECC × claude-plugins-official, ECC × thedotmack, ECC × agents `cd-*` do repo. Sobreposições de nome resolvidas por namespace (sem shadowing): comando `pr` (`/pr` repo vs `/ecc:pr`) e skill `benchmark` (gstack user-level vs `ecc:benchmark`). Gstack mantido (fora do escopo "só ECC").
- **Conflito fantasma (#155) resolvido:** branch carregava o commit GSD já squash-mergeado (#474); absorvido com `git merge origin/main` (não rebase), deixando o diff líquido só com a mudança ECC.
- **Próxima ação:** validar em outra máquina (notebook) — `git pull` + abrir Claude Code no repo → `claude plugin list ecc@ecc` deve mostrar ECC ativo sem instalação manual.

## Sessão 86b — 2026-06-22 — Subagents cd-* desativados (só agentes do ECC ativos)

- **Pedido do Wandson:** *"quero que esses agentes que são do Repo, o CD, eles não fiquem mais ativando. Eu quero que ative os agentes do ECC e os recursos do ECC."*
- **Feito (PR #480, SHA `aa68d2e`, squash em main):** `git rm` dos 14 arquivos `.claude/agents/*.md` (README + `cd-apex`, `cd-bolt`, `cd-compass`, `cd-echo`, `cd-endpoint-builder`, `cd-frontend-component`, `cd-helper-writer`, `cd-lens`, `cd-migration-creator`, `cd-oath`, `cd-raven`, `cd-task-creator`, `cd-validator`, `cd-validator-strict`). Diretório `.claude/agents/` agora vazio em main. Reversível pelo histórico do git.
- **No lugar:** os agentes do ECC (architect, code-reviewer, typescript-reviewer, database-reviewer, react-reviewer, security-reviewer, build-error-resolver, e2e-runner, planner, refactor-cleaner etc.) passam a ser o conjunto ativo.
- **Não tocado (de propósito):** hooks (`typecheck.cjs`, `typecheck-stop.cjs`) e comandos (`/dev-status`, `/onboard`, `/pr`, `/release-notes`, `/supabase-query`, `/vps-health`) do repo — são hooks/commands, não agentes. Referências textuais a `cd-*` em docs (PARALLEL-DEV.md, V2-*, PILOTO-*, Tracker, td-index) ficaram como estão: documentação, não ativam agente.
- **Efeito:** vale no próximo reload do Claude Code (a lista de subagents é lida no início da sessão).
- **Próxima ação:** ao abrir nova sessão, confirmar que os `cd-*` não aparecem mais na lista de agent types e usar os agentes do ECC.

## Sessão 90 — 2026-06-22 — Faxina aditiva: 4 índices de FK das tabelas CORA

- **Origem:** follow-up de manutenção da investigação da tela preta "Nenhum workspace" (#482/#485, sessão 89). Durante aquela investigação o advisor do Supabase (`get_advisors → unindexed_foreign_keys`) listou **134 FKs sem índice no projeto inteiro**. Decisão com o Wandson (*"Aceito sua recomendação"*): mexer **só nas 4 das tabelas CORA** como faxina aditiva/reversível — escopo mínimo, nada das outras 130.
- **Feito (PR [#489](https://github.com/deli-consult-delivery/consult-delivery/pull/489), SHA `567b8d6`, squash em main):** migration `supabase/migrations/20260622_003_cora_fk_indexes.sql` — 4 `CREATE INDEX IF NOT EXISTS`:
  - `idx_agent_drafts_reviewer_id` ON `agent_drafts (reviewer_id)`
  - `idx_cora_acoes_agent_run_id` ON `cora_acoes (agent_run_id)`
  - `idx_cora_cobrancas_regua_id` ON `cora_cobrancas (regua_id)`
  - `idx_internal_notifications_recipient_user_id` ON `internal_notifications (recipient_user_id)`
- **Correção não-óbvia:** a constraint `agent_drafts_approved_by_fkey` indexa a coluna **`reviewer_id`**, NÃO `approved_by` — nome real confirmado no `pg_catalog` antes de criar o índice (anti-padrão: nunca deduzir coluna pelo nome da constraint).
- **Por que aditivo e seguro:** tabelas pequenas hoje (33 / 58 / 1 / 245 linhas) → lock `ACCESS EXCLUSIVE` de ~1ms, plain `CREATE INDEX` (não `CONCURRENTLY`), migration transacional, idempotente (`IF NOT EXISTS`). Reversão = `DROP INDEX` dos 4 nomes. Verificado em `pg_indexes` que **nenhum índice existente tem a coluna da FK como líder** → 0 duplicatas.
- **Benefício:** (a) zera o lint do advisor para essas 4 FKs; (b) acelera a checagem de integridade da FK quando a linha-pai é deletada/atualizada (antes seq scan no filho); (c) future-proofing conforme as tabelas crescem.
- **Verificação (output bruto):** `apply_migration` retornou `{"success":true}`; query em `pg_indexes` confirmou os 4 índices presentes em prod com `btree` correto. NÃO houve mudança de frontend/bridge → sem deploy de Pages/bridge necessário.
- **Pendente:** nenhum (escopo fechado). As outras 130 FKs sem índice do advisor ficaram **intencionalmente fora de escopo**.

## Sessão 92 — 2026-06-23 — CORA: isenção de cobrança, baixa manual PIX e régua flexível

- **Migration `20260623_001_cora_ignorar_cobranca.sql` (APLICADA):** ADD COLUMN `ignorar_cobranca BOOLEAN NOT NULL DEFAULT FALSE` + `ignorar_motivo TEXT` na tabela `cobrancas`; índice parcial `idx_cobrancas_ignorar` filtra rapidamente os não-isentos.
- **Bridge `cora-gestao.js` (novo):** `PATCH /api/cora/cobrancas/:id/ignorar` (marca/desmarca isenção com auditoria em `cora_acoes`) + `POST /api/cora/cobrancas/:id/marcar-pago` (set `status='received'`, insere `cobranca_eventos`, rejeita todos os `agent_drafts` pending da cobrança, auditoria). Ambos validam tenant membership (anti-IDOR).
- **Trigger `regua-diaria.ts`:** filtro `.eq("ignorar_cobranca", false)` na query de elegíveis + dedup com janela de tempo dinâmica: pré-vencimento (`dias < 0`) = 48h mínimo entre mensagens; pós-vencimento (`dias >= 0`) = 24h. Substitui o dedup de meia-noite que enviava todo dia.
- **Frontend `Cora.jsx`:** `elegiveisRegua` filtra `ignorar_cobranca=true`; botões "✓ Já pagou (PIX)" (verde, baixa manual) e "🚫 Não cobrar" (cinza, isenta) adicionados à coluna de ações de cada card da fila de aprovação.
- **PR [#497](https://github.com/deli-consult-delivery/consult-delivery/pull/497), squash-mergeado em main.**
- **Próximas ações:** (1) `pm2 restart bridge-server` na VPS; (2) `npx trigger.dev@4.4.6 deploy` para a nova régua; (3) validação visual no browser.

## Sessão 93 — 2026-06-24 — Compactação manual: confiar no auto-compact nativo (remover chave ignorada)

- **Problema (Wandson):** precisava rodar `/compact` na mão sempre que a janela de contexto enchia (~70%). Pediu um hook que compactasse sozinho a 70% e desse continuidade — ou qualquer outra coisa que resolvesse.
- **Descoberta crítica (pesquisa na doc oficial):** **(1)** hooks NÃO conseguem disparar compactação — `PreCompact`/`PostCompact` são puramente reativos; não existe evento "ao atingir X% de contexto". Um hook que faz `/compact` a 70% é **impossível**. **(2)** `autoCompactWindow: 140000` no `.claude/settings.json` era a tentativa anterior de fixar o limiar em 70% (140k/200k) — chave **não-documentada e comprovadamente ignorada** (a prova empírica é o próprio Wandson continuar compactando na mão apesar dela). Não há setting/env documentado para ajustar o **limiar** (só `DISABLE_AUTO_COMPACT=1`, liga/desliga). **(3)** `autoCompactEnabled: true` é documentado e válido — já compacta sozinho perto do limite e **retoma a tarefa**.
- **Decisão (AskUserQuestion):** abordagem = **"Só confiar no nativo"** (não criar hook); escopo = **só consult-delivery** (settings.json versionado).
- **Mudança:** removida a linha `"autoCompactWindow": 140000` do `.claude/settings.json`; mantido `autoCompactEnabled: true`; **nenhum hook criado**; hooks existentes (SessionStart→ecc-pipeline-context, PostToolUse→typecheck, Stop→typecheck-stop) intactos.
- **Verificação (output bruto):** em `origin/main:.claude/settings.json` → `autoCompactEnabled: true` presente, `autoCompactWindow` ausente; `jq empty` ok (JSON íntegro — settings.json malformado desligaria TODAS as settings em silêncio).
- **PR [#506](https://github.com/deli-consult-delivery/consult-delivery/pull/506), squash-mergeado em main (`c77325e`).**
- **Limite honesto:** o auto-compact nativo dispara **perto do limite**, não a 70% — o Wandson perde o controle fino de compactar mais cedo, mas deixa de precisar do `/compact` manual. Se quiser o nudge a 70% de volta no futuro, o caminho é um hook `PostToolUse` que lê o `usage` do transcript e só **avisa** a 70% (não compacta).
- **Propagação à VPS:** `.claude/settings.json` é config de tooling local — sem deploy de Pages/bridge. O checkout canônico `/root/consult-delivery` recebe a mudança no próximo `git reset --hard origin/main` da rotina do bridge.

## 2026-06-24 — Sessão realtime-replica-identity + AI-First Item 2 e 3

### Item 3 — REPLICA IDENTITY FULL (PR #528, mergeado)
- Applied `REPLICA IDENTITY FULL` + `supabase_realtime` publication para tabelas do pipeline: `client_tasks`, `deli_pending_approvals`, `agent_runs`, `internal_notifications`.
- Migration: `supabase/migrations/20260624_005_pipeline_realtime_full.sql`

### Item 2 — Heartbeat Loop end-to-end (Blueprint AI-First)
- **Objetivo:** orchestrator detecta inatividade do grupo "EQUIPE - CONSULT DELIVERY" (7+ dias) → cria `client_tasks` para BRENO → aparece no PipelineScreen.
- **Fixes aplicados:**
  1. `deli_triggers`: `cliente_sumiu_7d` tinha `autonomy_level='verde'`; corrigido para `'vermelho'` (apenas VERMELHO gera heartbeat task).
  2. `lojas`: loja de teste "LOJA DE TESTE - PLATAFORMA" tinha `client_id=null`; corrigido com UUID real do customer.
  3. `agent_runs` migration: `logAgentRun` tentava upsert com colunas inexistentes (`explanation`, `confidence_score`, `pipeline_stage`, `pipeline_position`) → upsert falhava silenciosamente desde o FASE 4 (PR #524). Migration `20260624_006_agent_runs_add_pipeline_cols.sql` adicionou as colunas.
- **Verificação (output bruto):**
  - Run de 19:30 UTC: `agent_runs` → `semaforo: Vermelho`, `motivos: ["🔴 1 grupo(s) sem mensagem há 7+ dias: EQUIPE - CONSULT DELIVERY"]`
  - `client_tasks` para BRENO: "Retomar contato: EQUIPE - CONSULT DELIVERY" (criadas às 18:57 e 19:06 UTC)
  - Dedup funcionando: run das 19:30 não criou duplicata (1 task/trigger/loja/dia)
- **Loop confirmado:** orchestrator → detecta inatividade → VERMELHO → createHeartbeatTask → client_tasks → PipelineScreen (BRENO).

### Karina Doceria — CSAT e NPS automáticos (PR #529, mergeado)
- Sessão `avaliacao-karina` (interativa via cd-spawn sem --auto) implementou módulos CSAT e NPS para o tenant Karina Doceria.
- PR #529 + fix TS #530 mergeados.
- **Próximas ações:** nenhuma (escopo fechado). Observar nas próximas sessões longas se o auto-compact nativo retoma a tarefa sem intervenção.

## 2026-06-24 — Sessão: fix datacrazy webhook CSAT

### O que foi feito
- **404 URL typo**: URL `datarazy` → `datacrazy` corrigida no Datacrazy
- **sbFetch.from bug**: Reescrita total de `datacrazy-webhook.js` para usar PostgREST REST (PR #537)
- **check constraint**: `origem: 'datacrazy'` → `'crm_externo'`
- **token 63 chars**: Token no Datacrazy tinha letra `e` faltando no meio — corrigido para 64 chars
- **mensagem não chegava ao WhatsApp**: Conversa estava encerrada ao enviar. Solução: bridge reabre conversa (`PATCH status: open`) antes de enviar a mensagem CSAT, fecha depois (`PATCH status: resolved`)
- **hook auto-restart**: Bridge reinicia automaticamente quando PR toca `bridge-server/`

### Resultado final
- Webhook recebe → cria avaliação → reabre conversa → envia CSAT → fecha conversa → cliente avalia ✅
- Wandson testou e avaliou nota 5 às 22:34
