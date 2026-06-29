# HANDOFF — AI-First (Blueprint v2) · continuação

> Última atualização: 2026-06-29. Doc de retomada. Ler junto com `docs/ai-first/BLUEPRINT-AI-FIRST.md` (v2, APROVADO) e o Tracker.

## Onde estamos

Toda a **superfície de código autônoma e verificável** do Blueprint v2 está em `main`. **16 PRs** mergeados (todos aditivos/reversíveis, verificados por output bruto, **nada auto-deploya** — Bridge/MCP/Trigger são deploy manual na VPS).

### ✅ Pronto e mergeado
| Bloco | PRs | O quê |
|-------|-----|-------|
| GATE 0 | #621 (nuvem), #622–#626 | Bridge fail-closed/constant-time, escrita VendaERP com token dedicado, audit fail-closed, despachador por `tenant_agents`, `erp_confirmar` out-of-band (#624 + entrega #625), authz por tenant (#626), gitleaks CI |
| FASE 1 | #622 | roteamento-como-dado (`hermes/routing/roster.json` + `gen-describe.cjs` → 12 `describe.txt`) |
| FASE 4 | #627 | lint de persona (`hermes/routing/lint-persona.cjs`, barra R$/%/prazos em SOUL.md) |
| FASE 2 | #629 ifood, #630 asaas, #631 evolution | MCPs de **leitura** (fino→Bridge, auditados, ZERO write). `web` = toolset **nativo do Hermes** (config no profile) |
| GATE 0 (semáforo) | #633 | `bridge-server/lib/semaforo.js` — gate central ia🟢/hibrido🟡/humano🔴, fail-closed; ligado no `breno-aprovacao` |
| FASE 3 (Fluxo C) | #634 | demanda com execução externa nasce em `aguardando_autorizacao_ceo`; `POST /loop/autorizar` (aguardando→open / done+cancelled) |

## ⏳ O que falta (em 3 blocos)

### Bloco 2 — código autônomo, verificável (PRÓXIMO)
1. **Revisor (VERIFICA 2 camadas)** — gate antes de responder ao cliente. Entra em `trigger/agents/responder-conclusao.ts` (onde o draft é criado, após `executar-tarefa`). Deve: (a) **grounding** — o texto da resposta é suportado por `execution_result`? (b) **efeito real** — reconsultar o sistema-alvo (via Bridge) e confirmar que a ação aconteceu. Se falhar → não cria o draft `pending`/não auto-envia; marca a tarefa como `failed`/precisa-humano. Provavelmente 1 chamada LLM para o grounding (usar `trigger/agents/llm-client.ts`, modelo Kimi via Ollama, padrão de bom-dia/breno). **Cuidado:** revisor mal-feito é pior que nenhum — testar com fixture (grounding ok vs alucinado) antes de declarar pronto.
2. **Notificação ao CEO no Fluxo C** — quando `createLoopTask` cria uma tarefa em `aguardando_autorizacao_ceo`, alertar o CEO (pedido original + ação proposta + `target_system`) reusando o padrão `bridge-server/routes/deli-notify.js` (Telegram + sino, soft-fail). Hoje a tarefa entra em aguardando mas o CEO precisa descobrir por conta — DELI/Hermes pode listar pendências, mas o push está faltando.

### Bloco 1 — ativação na VPS (Wandson)
- `pm2 restart bridge-server` (rotas novas: `/loop/despachar`, `/loop/erp-confirm-code`, `/loop/autorizar`, `/api/evolution/status`, asaas com `requireJwtOrInternal`)
- Env: `INTERNAL_BRIDGE_TOKEN` no admin-mcp · `VENDAERP_WRITE_TOKEN` · `TELEGRAM_BOT_TOKEN` + `CEO_TELEGRAM_CHAT_ID` · rotação do `VENDAERP_TOKEN` (vazado) · root→`claudedev`
- Por MCP (`ifood`/`asaas`/`evolution`): `npm install` + `hermes mcp add <nome> --env INTERNAL_BRIDGE_TOKEN/SUPABASE_*/CD_AUDIT_TENANT_ID` + `hermes gateway restart` + `npm run live-smoke`
- `bash hermes/deploy-hermes.sh --apply` + `hermes gateway restart` (aplica os 12 profiles/roteamento)
- Deploy Trigger.dev: `npx trigger.dev@4.4.6 deploy` (Fluxo C tocou `trigger/_shared/loop-tasks.ts`)

### Bloco 3 — só com Hermes vivo (Wandson + sessão)
- **FASE 3 end-to-end** — loop real cliente→especialista→tarefa→execução→VERIFICA→resposta no Hermes. Aceite = `hermes -p <agente> chat` contra o sistema real. Partes já existem (loop_core, `createLoopTask`, `executar-tarefa.ts`, `responder-conclusao.ts`).
- **FASE 5** — integração plataforma (Console chat/pipeline ao vivo, dashboards, cutover shadow/equivalência).

## Gotchas (não tropeçar de novo)
- **tsc no worktree dá falso-positivo** (`node_modules/.bin/tsc: not found`) — rodar o tsc real de `/root/consult-delivery` (`npx tsc --noEmit -p .` filtrado ao arquivo). É a memória `hooks-worktree-node-modules-ausente`.
- **Smokes dos MCPs/Bridge no worktree** precisam de `NODE_PATH=/root/consult-delivery/vendaerp-mcp/node_modules` (ou `bridge-server/node_modules`) porque o worktree não tem `node_modules`.
- **Branches squash-merged** continuam no remoto → conflito-fantasma (caso #155). Sempre branch nova de `origin/main`.
- **Stop hook de code-review** dispara a cada branch não-revisada; se já revisou (verificação feita pré-merge), responder "revisão já feita".
- **Padrão de MCP** (replicar): `vendaerp-mcp`/`ifood-mcp` — `config.js` (fail-closed) + `<sistema>-bridge.js` (fino→Bridge) + `supabase.js`+`audit.js`+`_util.js` (copiar) + `registry.js` + `server.js` + `tools/*` + `test/smoke.js`. ZERO write; escrita/envio = draft+aprovação.

## Como retomar
1. `git fetch && git checkout -b wandson/<slug> origin/main` (worktree próprio).
2. Pegar o Revisor: ler `trigger/agents/responder-conclusao.ts` + `executar-tarefa.ts` + `trigger/agents/llm-client.ts`.
3. Construir → verificar (tsc real + fixture de grounding) → PR → merge.
4. Atualizar Tracker (`WikiBrain/wiki/PLANO-MESTRE — Tracker.md` §Onde parou) + `WikiBrain/log.md`.
