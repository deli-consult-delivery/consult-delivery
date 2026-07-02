# PLANO — Agente GESTOR (Consultor de iFood IA)

> STATUS: FINAL — entrevistas (4 rodadas) + mapeamento (3 Explore) + design (Plan agent, código do Bridge lido) + verificação no banco real.
>
> **Aprovado em 2026-07-02.** **2026-07-02 (consolidação):** F0 + F1b + F1 parcial + F2 parcial **EM PRODUÇÃO** — 11 PRs #681-#691 mergeados: F0 fundação (migrations `20260702_001`/`002`/`003` aplicadas + rota Bridge `portal-worker.js` + `garantirLoja`, #681); chat `gestor-conversa` na cascata multi-provider Ollama Cloud (kimi-k2.6) → OpenRouter → Anthropic com tools+web search (#683/#685); DELI portada para a mesma cascata (#687); perfil Hermes fase B (#686); Dashboard v1 por loja (`src/console/GestorDashboard.jsx`, #688); `telegram.ts` compartilhado + `relatorio-semanal.ts` + esqueleto `coleta-diaria.ts` atrás da trava `GESTOR_COLETA_ATIVA` (desligada por padrão, #689); rota de aprovação/execução de drafts whatsapp+portal_ifood (`gestor-aprovacao.js`, #690); fix de segurança removendo secrets hardcoded do `PainelAvaliacoesConsultor.jsx` (#691). **Pendente — gates do Wandson:** login único consolidado do Portal iFood (email/senha + 2FA das 16 lojas) · probe do seletor do modal "Escolher loja" no viewer do `ifood-browser` + validar `garantirLoja` entre 2 lojas reais · deploy do Bridge na VPS (`pm2 restart bridge-server`) · rotação da chave Evolution que estava hardcoded. Depois dos gates: ativar `GESTOR_COLETA_ATIVA=true` e escalar F2 às 16 lojas.

## Context

Wandson é o único consultor de iFood da Consult Delivery, com ~14 lojas em consultoria ativa. A rotina diária (análise de métricas, monitoramento, responder avaliações, contestar cancelamentos, ajustes de cardápio, orientação ao cliente) é manual via Portal do Parceiro do iFood — não há API oficial liberada. O objetivo é um agente IA ("Gestor") que execute essas rotinas de forma automática/supervisionada, com memória por loja, base de conhecimento de iFood/delivery, dashboard por loja na plataforma CD e relatórios para clientes.

Já existe trabalho prévio no épico "Consultor de iFood": worker `ifood-portal-worker` + container `ifood-browser` com envio de resposta a avaliação validado ao vivo na loja piloto Café Container (PRs #647/#648), skill `ifood-responder-avaliacao`, Memória Central (client_facts/client_timeline/loja_metricas), tenancy por loja (16 tenants store, PR #674) e o Hermes.

## Decisões da entrevista (2026-07-02)

| Tema | Decisão |
|------|---------|
| Escopo v1 | As 4 capacidades: análise diária + sugestões · responder avaliações · contestação de cancelamento · gestão de cardápio |
| Ordem de build | Coleta → Avaliações (escalar piloto) → Contestação → Cardápio |
| Identidade | Novo agente **"Gestor" criado DENTRO do Hermes** (Hermes suporta múltiplos perfis de agente); conectar Hermes ↔ plataforma CD |
| Interfaces | Chat na plataforma CD + Telegram (@DeliConsultBot) + Claude Code/terminal + Hermes |
| Autonomia | Supervisionado no início: toda ação no portal vira draft → aprovação → executa. Autonomia gradual depois |
| Coleta | 1x/dia de madrugada (~5h), worker na VPS varre as 14 lojas → Supabase |
| Credenciais | **1 login único** com todas as lojas de consultoria vinculadas (Wandson vai criar e passar email/senha). Portal tem **2FA ativo** → sessão persistente no container, re-login com código 2FA fornecido pelo Wandson quando expirar |
| Dashboard v1 | KPIs de operação + Reputação + Diário do agente + Sugestões pendentes (por loja, na plataforma CD) |
| Relatórios | Semanal via WhatsApp com draft (aprovação antes do envio via Evolution API); cliente também vê dashboard com login (lojista = role admin do próprio tenant store) |
| Conhecimento | Curadoria do Wandson (links/vídeos/insights → ingestão) + pesquisa web sob demanda pelo agente, salvando o que aprende |
| Contestação | Caso a caso: agente analisa motivo/culpa/valor e monta draft de contestação |
| Alertas imediatos | Avaliação ≤3★ ou queda de nota · pico de cancelamentos · loja fechada/pausada em horário de pico · queda de vendas · **loja sem pedidos no dia** · **desconto por pedido muito alto** |
| 2FA expirado | Agente notifica Wandson no Telegram pedindo o código, pausa a coleta e retoma ao receber |
| Relatório semanal | Segunda de manhã — fecha seg–dom anterior, draft pronto ~8h para aprovação |

## Restrições e observações

- CLAUDE.md diz "todo agente novo → trigger/ (Trigger.dev)"; a direção do Wandson é Hermes → registrar a exceção/atualizar doc no fim.
- Sem API oficial iFood → tudo via browser automation no Portal do Parceiro (padrão já validado no piloto).
- Drafts: nenhuma mensagem a cliente sem aprovação (schema 20260504_004) — respostas de avaliação são públicas → também passam por draft na fase supervisionada.
- 2FA: coleta de madrugada exige sessão já autenticada; plano precisa de rotina de manutenção de sessão.

## Mapeamento do repo (resultados dos Explore agents)

### A. Épico "Consultor de iFood" (browser automation) — JÁ EXISTE E FUNCIONA
- **`ifood-browser/`** (F0 ✅): container persistente na VPS (Docker Swarm/EasyPanel), Chromium KasmVNC headful com CDP `127.0.0.1:9222` (nunca publicado), viewer em `127.0.0.1:7470` (SSH tunnel). **Sessão/2FA persistem no volume `ifood_browser_profile`** — sobrevive a restart. Login 100% MANUAL pelo viewer (2FA); relogin ~diário quando sessão expira.
- **`ifood-portal-worker/`** (F1–F3 ✅): Node + playwright-core + zod, roda como container efêmero `docker run --rm --network container:ifood-browser`. Runners one-shot: `run-listar` (avaliações pendentes, real desde 2026-06-29), `run-gerar` (IA multi-provider: Ollama kimi-k2.6 → OpenRouter → Anthropic; Zod 20–600 chars), `run-preencher` (preenche, não envia), `run-enviar` (anti-TOCTOU + match exato do botão, `index.js:247-307`; envio ao vivo testado OK #647/#648), `probe-dom`.
- **Skill `ifood-responder-avaliacao`** (`.claude/skills/ifood-responder-avaliacao/SKILL.md`): fluxo supervisionado com paradas obrigatórias.
- **Limitações**: conta tem ~75 lojas → modal "Escolher loja" (`data-testid="choose-restaurant-modal-list"`) com seleção MANUAL hoje (TODO F3 = automatizar — pré-requisito para escalar às 14 lojas); só 1ª página de avaliações; loja piloto Café Container hardcoded (`IFOOD_LOJA` env + `gerarResposta.js:17`); CDP trava entre sessões → `docker restart` resolve; memória do épico só na VPS (`/root/.claude/projects/-root-consult-delivery/memory/consultor-ifood-epico.md`).
- **Track paralela `ifood-mcp/`**: MCP server que fala com a API iFood via Bridge Server (`ifood_status/reviews/cardapio/catalogo/vendas`), **já consumido pelo copiloto Hermes**; tabela `ifood_merchants` (`20260627_001`). Caminho natural de integração Gestor↔dados.

### B. Backbone (Hermes, dados, agentes)
- **Memória Central por loja** (migrations `20260504_003` + `_006`): `lojas` (âncora, `is_consultoria_ativa`), `client_facts` (key-value JSONB por loja, confidence, expires_at), `client_timeline` (append-only), `loja_metricas` (snapshot diário: faturamento, pedidos, ticket_medio, avaliacao, cancelamentos, fonte, raw_data). RLS por `tenant_members`.
- **API pronta — REUSAR, não recriar**: `src/agents/shared/runtime.ts` → `getClientContext(lojaId, tenantId)`, `recordFact(...)`, `logTimeline(...)`, `getPrompt(agentId, tenantId)`, `executeAgent(...)`. Molde de task: `trigger/lara/gerar-conteudo.ts`.
- **Catálogo de agentes**: `agents` (12: deli, breno, cora, lara, max, sofia, vera, analise-ifood, nova, revisor, pedro, estela) + `tenant_agents` (enabled por tenant; ⚠️ sem migration de CREATE — lacuna) + `tenant_agent_config` + `agent_prompts` (versionado, override por tenant) + `agent_runs` (audit). ⚠️ `agent_memories` é por tenant SEM `loja_id` — memória por loja = `client_facts`/`client_timeline`.
- **Hermes** (`hermes/`): runtime Nous Research na VPS (`hermes-gateway`), 1 profile por agente (`hermes/profiles/<slug>/SOUL.md` + `describe.txt`), roteamento em `hermes/routing/roster.json`, deploy `hermes/deploy-hermes.sh` (GATE 0 — Wandson roda). **Ainda não está em runtime** (pendências GATE 0: rotação de token, usuário `claudedev`).
- **admin-mcp** (`admin-mcp/`): MCP com reads auditados (`cd_status`, `cd_lojas`, `cd_agent_runs`, `cd_drafts_pendentes`...) + writes gated: `cd_propor_draft` (cria agent_drafts pending, nunca envia) e `cd_despachar_especialista` (→ Bridge `POST /loop/despachar`).
- **Drafts** (`20260504_005`): `agent_drafts` (status, autonomy_level verde/amarelo/vermelho, channel, loja_id, body, origin) → aprovação humana → envio. Canais internos (telegram_interno/painel) vão direto.
- **Trigger.dev** (`trigger/`, ~90 tasks): wrapper `_shared/claude.ts` (`runClaudeWithWebSearch`, claude-sonnet-4-6 + web_search), padrão task+Zod+logAgentRun. Roda em CLOUD — não alcança o CDP local da VPS (precisa do Bridge como ponte).
- ⚠️ Tenancy: nesta worktree só existe a migration Fase 0 (`20260701_001`); a conversão lojas→tenants store (Fase 1b/PR #674) está no banco mas não nas migrations locais — verificar estado real antes de assumir loja==tenant.

### C. Frontend plataforma CD
- **Shell**: `src/console/ConsoleV2.jsx` — sem react-router; menu = array `GRUPOS` (l.79-160) + `switch(tela)` (l.772-845). Tela nova = import + entrada em GRUPOS + case no switch, props `tenantDbId`/`userId`. Gating por tenant via `tenant_modules`.
- **Template dashboard por loja**: `src/console/RadarReal.jsx` — JÁ é dashboard loja-a-loja (seletor de loja, filtro período, KPIs `Kpi()`, série temporal `SerieDiaria`, tabela de sinais). Clonar.
- **Template chat com agente**: `ChatTab` em `src/console/Deli.jsx` (l.413-619) — histórico via `deli_messages`, envio `POST ${BRIDGE}/agents/deli-conversa/run` + Bearer, resposta por realtime. Padrão universal: `POST ${BRIDGE}/agents/<agent-id>/run` com `{tenant_id, payload}`.
- **Aba Resp. Avaliações**: `src/console/PainelAvaliacoesConsultor.jsx` — ⚠️ fora do padrão: anon key + Evolution API key HARDCODED (l.4-8), lojas em constante `KNOWN_STORES` (14 lojas, l.18-33) em vez do banco. Migrar para `listLojasConsultoria(tenantId)` (`src/lib/api.js:668`) + client supabase.
- **Relatórios**: `src/console/Relatorios.jsx` consome Bridge `/api/relatorios/dashboard?tenant_id=&periodo=&loja_id=` — só visualização interna; NÃO existe envio de relatório ao cliente (lacuna a construir).
- Sem lib de charts (SVG/CSS à mão); RBAC dentro de telas via `<RequireRole>`/`usePermissions`.

## Verificação no banco real (2026-07-02, read-only)

- `lojas`: 1.177 linhas no total; **16 com `is_consultoria_ativa=true`** (não 14 — reconciliar com Wandson no seed). ⚠️ NÃO existe coluna `ativo` — filtrar por `is_consultoria_ativa`. Já existem `ifood_merchant_id`, `ifood_url`, `whatsapp`, `store_tenant_id` — reusar.
- `ifood_merchants`: **1 linha** → API oficial só cabeada para 1 loja; F4 exige mapear merchant_id das demais.
- `tenants` tipo store: 18 → Fase 1b confirmada aplicada no banco (migrations locais desatualizadas — não bloqueia).
- `agents`: 25 no catálogo; `agent_knowledge_base` existe (0 linhas) com rotas prontas no Bridge.
- Bridge verificado no código: `POST /agents/:slug/run` (index.js:377, requireJwt+requireAgentAccess), `requireInternalToken` (index.js:81), precedente de spawn (routes/scraping.js), `lib/ifood.js` com API oficial (listarReviews:249, listarVendas:256, criarOuAtualizarItem:318, pausarItem:344), rotas `knowledge-base.js`/`breno-aprovacao.js` existem.

## Arquitetura (decisão de runtime)

**Fase A (agora): cérebro = task Trigger.dev `gestor-conversa`, despachada pelo Bridge** — mesmo caminho do ChatTab da DELI (`POST ${BRIDGE}/agents/<slug>/run`). **Fase B: perfil Hermes `gestor` pluga por cima** como interface conversacional adicional (SOUL.md só persona; execução continua via tools/Bridge), ativado quando Wandson rodar o GATE 0 do Hermes. Isso concilia a decisão do CEO (Gestor no Hermes) com o CLAUDE.md (agente novo → trigger/): **tudo que executa é trigger/Bridge; Hermes é camada de conversa**.

Portal: Trigger.dev (cloud) não alcança o CDP da VPS → **o Bridge executa os runners** (`docker run --rm --network container:ifood-browser`) via rota interna nova.

```
[cron Trigger.dev 03h] gestor-coleta-diaria
  └─ por loja (is_consultoria_ativa + ifood_portal_nome):
       Bridge POST /api/portal-worker/run {runner, loja} (x-internal-token, mutex, allowlist)
         └─ docker run … node run-metricas.js / run-listar.js
       → upsert loja_metricas + INSERT reviews pendentes + logTimeline
  └─ regras de alerta vs histórico → Telegram (queda nota, pico cancelamento,
     loja pausada, queda vendas, zero pedidos, desconto alto)

[chat] src/console/Gestor.jsx (clone ChatTab) → Bridge → task gestor-conversa
  → contexto: getClientContext + loja_metricas 14d + agent_knowledge_base
  → tools: propor_draft | consultar_metricas | pesquisar_web | salvar_conhecimento

[ação no portal] agent_drafts (channel='portal_ifood') → aprovação (painel/1-clique)
  → Bridge POST /api/gestor/aprovar/:draft_id → runner preencher+enviar
    (anti-TOCTOU existente: texto aprovado do draft == textoEsperado)
  → draft 'sent' + client_timeline + reconferência de status
```

## Fases de implementação

### F0 — Fundação (multi-loja + identidade + canal Bridge→worker) ✅ CONCLUÍDA (PR #681)
1. Migrations (aditivas, 1 a 1, output bruto — autônomas por D5 v3):
   - `20260702_001_gestor_agent.sql`: INSERT `agents` ('gestor', especialista) + `tenant_agents` (tenant agência `9079bd4d-...`, enabled) + `agent_prompts` persona v1.
   - `20260702_002_agent_chat_messages.sql`: tabela genérica (tenant_id, agent_id, user_id, **loja_id**, role, content, metadata) + RLS + realtime. Não reusar `deli_messages` (conversa.ts lê sem filtro de agente).
   - `20260702_003_lojas_portal_ifood.sql`: `ALTER lojas ADD ifood_portal_nome, ADD whatsapp_group_jid` + seed das 16 lojas de consultoria (nomes exatos de `KNOWN_STORES` → conferir com Wandson; reusar `ifood_merchant_id` existente).
2. Bridge: novo `bridge-server/routes/portal-worker.js` — `POST /api/portal-worker/run {runner, loja}` com allowlist fixa de runners, spawn com array de args (sem shell), `-e IFOOD_LOJA`, mutex global in-process (1 sessão de portal ⇒ 409 se ocupado), timeout 180s, `requireInternalToken`.
3. Worker: `garantirLoja(page, nome)` em `ifood-portal-worker/index.js` — automatiza o modal "Escolher loja" (~75) e a troca; **pós-condição obrigatória**: confere nome da loja ativa, aborta se divergir. Descobrir seletores via `probe-dom` em sessão supervisionada.
4. 🛑 Gate Wandson: sessão no viewer p/ probe do switcher + validar `garantirLoja` em 2 lojas. Criar o login único consolidado (email/senha + 2FA manual).

**Nota:** F0 mergeada via PR #681 (3 migrations + rota Bridge `/api/portal-worker/run` + `garantirLoja` no `ifood-portal-worker`); migrations `20260702_001`/`002`/`003` aplicadas no banco. Gate do item 4 (probe do store-switcher no viewer) segue pendente com o Wandson.

### F1 — Coleta diária + alertas + relatório semanal
- `ifood-portal-worker/run-metricas.js` + `coletarMetricas()` (abas Desempenho/Avaliações/Pedidos — mapear via probe; saída Zod).
- `trigger/gestor/coleta-diaria.ts` — `schedules.task` cron `0 6 * * *` UTC (03h Belém), itera lojas sequencialmente via Bridge; upsert `loja_metricas` (fonte='portal_ifood') + `logTimeline` + lista avaliações pendentes (alimenta F2).
- Alertas: comparação vs 7/28 dias → Telegram (extrair notifier p/ `trigger/_shared/telegram.ts`). Sessão expirada → aborta e alerta "relogin 2FA no viewer" (opcional: probe de sessão às 22h).
- `trigger/gestor/relatorio-semanal.ts` — cron seg 06h Belém → agrega semana vs anterior por loja → `agent_drafts` channel='whatsapp' (grupo da loja) → aprovação → Evolution API.
- Upgrade opcional (decisão Wandson): migrar parte da coleta p/ API oficial (`lib/ifood.js`) conforme merchant_ids forem mapeados.

### F1b — Chat + tela Gestor + prep Hermes
- `trigger/gestor/conversa.ts` (clone estrutural de `trigger/deli/conversa.ts`): histórico `agent_chat_messages`, contexto por loja, 4 tools (`propor_draft` espelha admin-mcp `cd_propor_draft`; `pesquisar_web` usa wrapper existente; `salvar_conhecimento` → `agent_knowledge_base`).
- `src/console/Gestor.jsx` (clone ChatTab + seletor de loja + faixa de KPIs estilo RadarReal) + registro em ConsoleV2 (GRUPOS + switch + `tenant_modules` key 'gestor').
- Hermes fase B: `hermes/profiles/gestor/SOUL.md` + `describe.txt` + entrada no `roster.json` (gerar via gen-describe.cjs). Ativação = GATE 0 (Wandson). Telegram-chat inbound vem de graça com Hermes; até lá Telegram = alertas outbound. Skill `ifood-responder-avaliacao` atualizada p/ usar o endpoint do Bridge.

### F2 — Avaliações em escala (16 lojas)
- Geração do texto migra p/ dentro da task (prompt em `agent_prompts`, wrapper multi-provider existente); `run-gerar` continua p/ uso manual.
- Pendências → `avaliacoes` + `agent_drafts` {channel:'portal_ifood', loja_id, metadata:{pedido}}.
- Novo `bridge-server/routes/gestor-aprovacao.js` (`POST /api/gestor/aprovar/:draft_id`, espelho de breno-aprovacao.js): despacha por channel — portal_ifood → runners preencher+enviar (env `TEXTO_APROVADO` mantém o vínculo anti-TOCTOU); whatsapp → Evolution.
- De passagem: **remover secrets hardcoded** de `PainelAvaliacoesConsultor.jsx` (anon key + Evolution key) e trocar `KNOWN_STORES` por `listLojasConsultoria`.
- 🛑 Gate: 3 primeiros envios por loja aprovados 1 a 1; nunca lote automático.

### F3 — Contestação de cancelamento
- Probe supervisionado da aba Pedidos/Cancelamentos → `run-contestar.js` com o mesmo consent-binding do enviar.
- Coleta detecta cancelamento contestável → alerta Telegram IMEDIATO (prazo curto) → task gera argumentação → draft metadata.action='contestar' → aprovação → runner.

### F4 — Gestão de cardápio (via API oficial)
- `lib/ifood.js` já cobre catálogo (criar/atualizar/pausar item, categorias, teste real em bridge-server/test/). Pré-requisito: mapear merchant_id das 16 lojas em `ifood_merchants`/`lojas.ifood_merchant_id` (hoje só 1).
- Tool `propor_mudanca_cardapio` no gestor-conversa → draft metadata.action='cardapio' → aprovação → Bridge chama API. Browser só onde a API não cobre.

## Encerramento de sessão (obrigatório ao implementar)
- Atualizar `WikiBrain/wiki/PLANO-MESTRE — Tracker.md` + `PLANO-MESTRE.md` (nova track do Gestor), branch `wandson/gestor-f0` + PR, memória do projeto.

## Verificação (Quality Bar por fase)
- [ ] Build sem erros (vite + trigger deploy) e output bruto de cada passo
- [ ] F0: JSON do probe + `garantirLoja` trocando entre 2 lojas com pós-condição validada
- [ ] F1: SELECT de `loja_metricas` após 1ª coleta assistida das 16 lojas, números conferidos vs portal; alerta Telegram real com queda simulada
- [ ] F1b: mensagem no chat Gestor → resposta via realtime; draft criado por tool aparece no painel
- [ ] F2: 1 resposta publicada ao vivo com texto aprovado == enviado (anti-TOCTOU); status "Resposta enviada"
- [ ] F3/F4: 1 contestação e 1 alteração de cardápio reais aprovadas e confirmadas no portal

## Riscos
- DOM do portal muda → runner quebra: probe-dom + erro claro + alerta; nunca chutar seletor.
- Sessão 2FA expira (~diária) → coleta falha: alerta + retry pós-relogin.
- Loja errada no modal de 75: pós-condição de nome em `garantirLoja` aborta.
- Bridge+docker = superfície nova: allowlist fixa, token interno fail-closed, args em array.
- Concorrência: mutex 409; coleta de madrugada minimiza colisão.
