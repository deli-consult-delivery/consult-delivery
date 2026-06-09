# 🔑 RUNBOOK DO WANDSON — o que só você pode executar

> **Por que este doc existe:** o orquestrador (Claude) já fez tudo que era autônomo e reversível.
> O que sobra para destravar **T4 (Hermes)** e o restante da **Onda 04** depende de **credenciais, VPS e decisões travadas** — reservado a você por design (Mandato Cowork D5 v2).
> Faça na ordem. Cada passo aponta para o doc detalhado. Última revisão: 2026-06-09 (sessão 30).

---

## Ordem de execução (não pular)

```
GATE 0 (rotação)  →  usuário claudedev na VPS  →  ok no SQL do ceo_agent  →  Claude liga o resto
   [§1]                    [§2]                        [§3]                      [autônomo]
```

Os três primeiros são SEUS. Depois deles, eu (orquestrador) implemento as tools de leitura/escrita, audito e ligo o gateway — sem mais bloqueio.

---

## §1 · GATE 0 — rotação de credenciais 🔒 (PRIORIDADE)

**Doc completo:** [`docs/infra/gate0-rotacao-credenciais.md`](gate0-rotacao-credenciais.md)
**Por que primeiro:** nada de Hermes/admin-MCP vai a runtime com credenciais antigas em circulação. Trava tudo.

Resumo do que fazer (detalhe e comandos no doc):
1. **4 PATs do GitHub** — revogar e recriar *fine-grained*, escopo mínimo (só o repo `consult-delivery`): `deli-agent-vps`, `Nexus`, `claude-code`, `Claude IA`.
2. **Token do Telegram** — `@BotFather` → `/revoke` → gerar novo. (afeta Hermes e @DeliConsultBot)
3. **`DASHBOARD_API_TOKEN`** — gerar novo: `openssl rand -hex 32`.
4. **Remover SSH key `claude-debug`** das authorized_keys da VPS.
5. **Limpar plaintext na VPS** — `.git-credentials`, history do shell, `.claude/*.jsonl`.
6. **Hygiene Actions Secrets** — conferir que nenhum secret rotacionado ficou velho no GitHub Actions.
7. **Propagar** os novos valores: Infisical → VPS → GitHub Actions → Trigger.dev. **Nunca colar valor em commit/chat/log** — só o NOME do segredo.

✅ **Critério de pronto:** verificação final do doc passa (tokens antigos não autenticam mais; novos propagados nos 4 lugares).

---

## §2 · Usuário dedicado `claudedev` na VPS (gateway root → não-root)

**Doc completo:** [`docs/infra/claude-code-vps-setup.md`](claude-code-vps-setup.md)
**Por que:** o admin MCP e o Claude Code na VPS **não rodam como root**. Isolamento na VPS compartilhada.

Resumo (comandos no doc):
1. `adduser claudedev` (não-root).
2. `npm i -g @anthropic-ai/claude-code` como `claudedev`.
3. **Token GitHub fine-grained** com escopo **só do repo** → `git clone` com esse token.
4. `npm ci && npm run build` para validar o checkout.
5. `export ANTHROPIC_API_KEY` puxando do **Infisical** (nunca hardcode).
6. `tmux new -s dev` para a sessão persistente.

⚠️ **NÃO usar `bypassPermissions`** (regra do doc admin-MCP §4).

✅ **Critério de pronto:** `claudedev` builda o repo e tem Claude Code rodando em tmux, sem privilégio de root.

---

## §3 · `ok` no SQL do papel `ceo_agent` (RBAC do Hermes)

**Design completo:** [`docs/infra/admin-mcp-design.md`](admin-mcp-design.md) §2 e §6.
**O que é:** o Hermes acessa a CD com um papel novo de **leitura ampla + escrita só via draft** (nunca `admin`, nunca aprova o próprio draft).

**O que eu preciso de você (agora só 1 coisa):**

1. ✅ **Decisão de escopo — JÁ RESPONDIDA (2026-06-09):** `ceo_agent` enxerga **todos os tenants** (visão CEO), marcando quais são seed/teste. Gravado em `admin-mcp-design.md` §2.

2. **`ok` no SQL** que cria a identidade `ceo_agent` + permissões (read amplo / write só draft).
   Eu **escrevo e te mostro o SQL** (padrão migration versionada, aditivo, RLS) e **espero seu `ok`** antes de aplicar — igual fizemos na LEVA 3.
   *Ainda não escrevi este SQL* de propósito: ele depende de uma escolha de modelagem (Opção A vs B em `admin-mcp-design.md` §2.1 — o RBAC é per-tenant, o `ceo_agent` é cross-tenant) que eu resolvo **na sessão de build, depois do GATE 0**. Escrever antes do GATE 0 seria SQL que nem dá pra aplicar.

✅ **Critério de pronto:** GATE 0 feito → eu autoro o SQL (Opção A recomendada) e te mostro → seu `ok` → eu aplico (1 arquivo, output bruto, teste de isolamento RLS) e sigo para as tools.

---

## Depois dos três: o que EU faço (autônomo, sem você)

Sequência do `admin-mcp-design.md` §6, passos 4–7:
- Implementar tools de **leitura** (`cd_status`, `cd_lojas`, `cd_agent_runs`, `cd_drafts_pendentes`, `cd_inadimplencia`, `cd_audit`) — validando audit em cada uma.
- Implementar `cd_propor_draft` reusando `drafts_deli` — provando que o Hermes **não** consegue aprovar o próprio draft.
- Teste de isolamento: Hermes não lê segredo nenhum; não muta tabela cliente-facing direto.
- Só então **ligar o gateway** root→`claudedev` e habilitar no Hermes.

---

## Onda 04 (WhatsApp + Loom) — o que é SEU lá também

O restante da Onda 04 (épico de 9–13 dias) tem pré-requisitos e passos **reservados a você**, separados do que é autônomo:

| Item | Quem |
|------|------|
| Parser `parseRespostaCliente` (Tarefa 7) | ✅ **JÁ FEITO** — em prod no `main` (`c5f3afc`), 18 testes verdes |
| Migrations `analises` / ALTER `tarefas_loja` / `whatsapp_aprovacao_sessions` | SQL eu escrevo → **seu `ok`** p/ aplicar |
| Configurar Evolution API (número, instância) | **Wandson** (credenciais/VPS) |
| ≥1 **cliente real** topar testar | **Wandson** (negócio) |
| Envio real de WhatsApp / E2E com cliente | **Wandson** — eu **nunca** disparo msg a número real |

→ spec do épico: [`docs/piloto/PILOTO-04-WHATSAPP-LOOM.md`](../piloto/PILOTO-04-WHATSAPP-LOOM.md)

---

## TL;DR — sua fila agora

1. **GATE 0** (§1) — rotacionar credenciais. *Destrava tudo.*
2. **`claudedev`** (§2) — usuário não-root na VPS.
3. ~~Responder escopo do `ceo_agent`~~ ✅ **já respondido: todos os tenants.**
4. Quando eu te mostrar o **SQL do `ceo_agent`** (eu autoro pós-GATE 0), dar `ok` (§3.2).

Feito o GATE 0 + `claudedev`, T4 (Hermes) destranca e eu sigo sozinho (autoro o SQL, você dá `ok`, eu aplico e ligo as tools).
