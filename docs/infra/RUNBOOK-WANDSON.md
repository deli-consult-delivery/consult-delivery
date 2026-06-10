# 🔑 RUNBOOK DO WANDSON — o que só você pode executar

> **Por que este doc existe:** o orquestrador (Claude) já fez tudo que era autônomo e reversível.
> O que sobra para destravar **T4 (Hermes)** e o restante da **Onda 04** depende de **credenciais, VPS e decisões travadas** — reservado a você por design (Mandato Cowork D5 v2).
> Faça na ordem. Cada passo aponta para o doc detalhado. Última revisão: 2026-06-09 (sessão 30).

---

## Ordem de execução (não pular)

```
GATE 0 (rotação)  →  usuário claudedev na VPS  →  ceo_agent: schema já pronto  →  você liga (2 cmds)
   [§1] ✅              [§2] ✅                      [§3] ✅ sem SQL                  [§ "2 comandos"]
```

GATE 0 e `claudedev` ✅ feitos. O §3 **se dissolveu**: verifiquei o schema real e **não há migration do `ceo_agent` pra aplicar** (detalhe abaixo). Só resta você rodar os **2 comandos** que carregam o `service_role` (seção "Os 2 comandos reais").

---

## §1 · GATE 0 — rotação de credenciais 🔒 ✅ CONCLUÍDO (2026-06-10)

**Doc completo:** [`docs/infra/gate0-rotacao-credenciais.md`](gate0-rotacao-credenciais.md)
**Por que primeiro:** nada de Hermes/admin-MCP vai a runtime com credenciais antigas em circulação. Trava tudo.

> ✅ **Feito e validado (2026-06-10):** Telegram rotacionado · GitHub sem PAT de risco (classic vazio, fine-grained só never-used) · EvoNexus aposentado (`docker service rm` + `rm -rf /root/recovery`) · `claude-debug` inerte (presa no comentário da hostinger-key, não autentica) · `~/.git-credentials` inexistente. Resta só limpeza **cosmética** opcional da linha SSH (§4 do doc). **Próximo passo da fila: §2 (`claudedev`).**

Resumo do que fazer (detalhe e comandos no doc):
1. **4 PATs do GitHub** — revogar e recriar *fine-grained*, escopo mínimo (só o repo `consult-delivery`): `deli-agent-vps`, `Nexus`, `claude-code`, `Claude IA`.
2. **Token do Telegram** — `@BotFather` → `/revoke` → gerar novo → editar `/root/.hermes/.env` (`TELEGRAM_BOT_TOKEN=`) → `systemctl restart hermes-gateway` → **esperar ~15s e confirmar `active (running)` estável antes de testar** (o `FAILURE` transitório de poucos segundos no restart é normal — não teste na janela de troca de processo). ⚠️ **Não** é Infisical nem `pm2 restart bridge-server` — o token mora no `.env` do Hermes e o serviço é `hermes-gateway` (systemd). O bot é o **`@DeliConsultBot`** (um único `/revoke` cobre tudo — não há bot separado). (✅ rotação executada e validada com sucesso em 2026-06-09)
3. **`DASHBOARD_API_TOKEN`** — ⚠️ **não é bridge/Infisical**: é do **dashboard EvoNexus** (container Docker Swarm `evo-nexus_dashboard`), e **nenhum código do CD depende dele** (verificado 2026-06-09). Como EvoNexus é POC "não usar em prod", o caminho recomendado é **🅰 aposentar** (`docker service rm evo-nexus_dashboard` + `rm -rf /root/recovery`) em vez de rotacionar. Detalhe e opção 🅱 no doc §3.
4. **Remover SSH key `claude-debug`** das authorized_keys da VPS — ⚠️ aparece **3× em cada** arquivo; a linha 2 tem a `claude-debug` **colada na chave `hostinger-managed-key`** → **não** use `grep -v`/`sed -d` (apagaria a hostinger). Receita segura (filtra pelo blob, com backup) no doc §4.
5. **Limpar plaintext na VPS** — `.git-credentials`, history do shell, `.claude/*.jsonl`.
6. **Hygiene Actions Secrets** — conferir que nenhum secret rotacionado ficou velho no GitHub Actions.
7. **Propagar** os novos valores: Infisical → VPS → GitHub Actions → Trigger.dev. **Nunca colar valor em commit/chat/log** — só o NOME do segredo.

**📍 Achados do inventário read-only (2026-06-09) — já mapeados pra você:**
- **Telegram** → token em `/root/.hermes/.env`, serviço `hermes-gateway` (systemd). Não é Infisical/bridge.
- **`claude-debug`** → está em **2** arquivos: `/root/.ssh/authorized_keys` **e** `/home/wandson/.ssh/authorized_keys` (remover dos dois).
- **`~/.git-credentials`** → token GitHub em texto, mas o remote já é SSH → **resíduo, seguro remover**.
- **`/root/recovery/`** → pasta com `.env` + `.credentials.json` + logs em texto → maior foco de limpeza (§5).
- **Infisical** → **sem CLI** na VPS (só painel web `172.18.0.3:8080`); o Hermes lê do `.env` direto.

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

## §3 · `ceo_agent` — ✅ SEM SQL (schema já estava pronto, verificado 2026-06-10)

**Design completo:** [`docs/infra/admin-mcp-design.md`](admin-mcp-design.md) §2 e §6.
**O que é:** o Hermes acessa a CD como **leitura ampla + escrita só via draft** (nunca `admin`, nunca aprova o próprio draft).

1. ✅ **Decisão de escopo (2026-06-09):** `ceo_agent` enxerga **todos os tenants** (visão CEO), marcando quais são seed/teste. Gravado em `admin-mcp-design.md` §2.

2. ✅ **SQL: NÃO É PRECISO.** Resolvida a modelagem (**Opção A**: `ceo_agent` não é role de banco — enforcement na camada do MCP, não no RBAC per-tenant). Varri o schema **real** (2026-06-10) e tudo que o copiloto toca já existe e está correto:
   - `audit_log` — colunas completas; `action` é texto livre; principal vai em `agent_name`.
   - `agent_drafts` — CHECKs já aceitam `origin='hermes'`, `status='pending'`, `autonomy_level='amarelo'`; todas as colunas do `cd_propor_draft` existem.
   - `lojas.is_real_business` — já populado (141 real / 1033 seed / 0 nulo) → o sinal seed/teste da visão-CEO funciona de fábrica (a `cd_lojas` lê daqui, **não** de `tenants.metadata`).
   - tenant plataforma `consult` existe → **`CD_AUDIT_TENANT_ID = 9079bd4d-4df7-4023-90fb-d79c8ba7e900`**.
   - Opção A ⇒ nada pra `GRANT`/role no banco.

✅ **Critério de pronto:** ALCANÇADO. Sem migration a aplicar. Pula direto para os **2 comandos reais** (carregam o `service_role`) — esses são seus.

---

## Depois dos três: o que EU faço (autônomo, sem você)

Sequência do `admin-mcp-design.md` §6, passos 4–7:
- ✅ **FEITO** — tools de **leitura** (`cd_status`, `cd_lojas`, `cd_agent_runs`, `cd_drafts_pendentes`, `cd_inadimplencia`, `cd_audit`) implementadas e auditadas (PR #287).
- ✅ **FEITO** — `cd_propor_draft` reusa `agent_drafts` (`status=pending`, `origin='hermes'`); o Hermes **não** tem tool de aprovar/enviar — enforcement é estrutural (a mutação não existe no catálogo).
- ✅ **FEITO** — smoke offline (`npm run smoke` + `npm run test:integration`) e **smoke real** (`npm run live-smoke`) prontos. O live-smoke lê o env em runtime, chama as 6 tools de leitura e imprime output bruto — **fail-closed** sem credencial.

### Os 2 comandos reais que ligam tudo (você cola o segredo aqui)

> ⚠️ O `--env` carrega o `service_role` em texto → por isso este passo é **seu**, não meu:
> é o único lugar onde o segredo entra.
> **Rode como `root`** (não `claudedev`): o CLI `hermes` e o gateway systemd vivem no `root`
> (`/root/.local/bin/hermes`, `/root/hermes-agent`), e o `claudedev` não enxerga `/root`. O `--args`
> aponta pro server no checkout do root: `/root/consult-delivery/admin-mcp/src/server.js`.

**1. Registrar o MCP no gateway** (mecanismo real do Hermes — confirmado via `hermes mcp add --help`):

```bash
hermes mcp add cd-admin \
  --command node \
  --args /root/consult-delivery/admin-mcp/src/server.js \
  --env SUPABASE_URL='https://czyanilrverorwenikqw.supabase.co' \
        SUPABASE_SERVICE_KEY='<cole o service_role DEDICADO do Infisical>' \
        CD_AUDIT_TENANT_ID='<tenant_id da plataforma/CD>'

hermes mcp list           # confirma que 'cd-admin' aparece
hermes mcp test cd-admin  # handshake do gateway com o server
```

**2. Smoke com a credencial real** (prova que as queries respondem antes de liberar leitura):

```bash
cd /root/consult-delivery/admin-mcp
export SUPABASE_URL='https://czyanilrverorwenikqw.supabase.co'
export SUPABASE_SERVICE_KEY='<o mesmo service_role>'
export CD_AUDIT_TENANT_ID='<o mesmo tenant_id>'
npm run live-smoke        # chama as 6 read tools, imprime output bruto
```

Saída `live-smoke OK` = leitura validada ponta-a-ponta contra o banco real. A escrita (`cd_propor_draft`) continua gated por draft+aprovação no painel.

**Teste de isolamento** (já garantido em código): o Hermes não lê segredo de tabela; a única escrita é draft `pending`; toda chamada (leitura e escrita, sucesso e erro) grava em `audit_log`.

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

1. ~~**GATE 0** (§1) — rotacionar credenciais~~ ✅ **feito (2026-06-10).**
2. **`claudedev`** (§2) — usuário não-root na VPS.
3. ~~Responder escopo do `ceo_agent`~~ ✅ **já respondido: todos os tenants.**
4. ~~Dar `ok` no SQL do `ceo_agent`~~ ✅ **não há SQL** — schema verificado, nada a aplicar (§3).
5. **Rodar os 2 comandos reais** (seção "Os 2 comandos reais", como **root**): `hermes mcp add cd-admin …` + `npm run live-smoke`. É só onde o `service_role` entra — o único passo que falta.

Feito isso, T4 (Hermes) está no ar: as 6 tools de leitura respondem e a escrita continua gated por draft+aprovação.
