# VPS — Infraestrutura e Serviços

**IP:** 187.127.25.24 | **User:** root | **Hostname:** srv1600147

## Dois repositórios na VPS

| Path | Uso |
|---|---|
| `/root/consult-delivery/` | **Produção** — onde bridge, Trigger.dev worker e agentes rodam |
| `/home/wandson/consult-delivery/` | Cópia dev (git clone principal, builds frontend) |

> Ao atualizar o bridge via git, **sempre** fazer em `/root/consult-delivery/`.

## Bridge Server

- **Arquivo:** `/root/consult-delivery/bridge-server/index.js`
- **Porta:** 3001
- **Gerenciado por:** PM2 — processo chamado `bridge-server`
- **Persistência:** `pm2-root.service` (systemd, habilitado — sobrevive a reboots)
- **Env vars:** `/root/consult-delivery/bridge-server/.env` (dotenvx)

### Como atualizar e reiniciar o bridge

```bash
cd /root/consult-delivery
git fetch origin && git reset --hard origin/main   # nunca git pull simples
pm2 restart bridge-server
pm2 logs bridge-server --lines 20
```

### Checar status

```bash
pm2 list                        # processos PM2
ss -tlnp | grep 3001            # porta ativa
pm2 logs bridge-server --lines 30
```

### NUNCA fazer

- `node index.js &` manual — PM2 já gerencia, criar duplicata conflita na porta 3001
- `git pull` simples em `/root/` — usar `git reset --hard origin/main`

### Problema resolvido (2026-05-20)

O `/root/consult-delivery` tinha commits locais divergentes do origin.
Fix: `git fetch origin && git reset --hard origin/main`.

## Outros serviços

| Serviço | Local | Notas |
|---|---|---|
| Claude Code 24/7 | `claude-dev.service` (systemd) | Sessão remota permanente |
| Evolution API | Docker VPS | WhatsApp bridge |
| Infisical | `172.18.0.3:8080` | Secrets self-hosted |
| OpenClaw | Porta 18789 (Docker) | **Legacy/EvoNexus POC — não tocar** |
| vendaerp-mcp | `/root/consult-delivery/vendaerp-mcp/src/server.js` | MCP do Hermes p/ o VendaERP (stdio). Registrado no gateway do Hermes, não no PM2. Só leitura (Fase 1). |

## VendaERP — integração (Fase 1) — ✅ GATE 0 FEITO E VERIFICADO LIVE (2026-06-14, sessão 52)

- **Credencial do ERP (3 headers `Authorization-Token`/`User`/`App`)** vive SÓ no env do Bridge:
  Infisical → `VENDAERP_BASE_URL`, `VENDAERP_TOKEN`, `VENDAERP_USER`, `VENDAERP_APP`.
  Após adicionar: `pm2 restart bridge-server --update-env`.
- **Bridge é o ponto único** — Console (JWT) e Hermes (`vendaerp-mcp` via x-internal-token) chamam
  `/api/vendaerp/*`; ninguém fala com o ERP direto.
- **MCP no Hermes registrado e ativo** (gateway reiniciado): `hermes mcp list` mostra `vendaerp`
  enabled 6/6 tools; `hermes mcp test` Connected ~200ms.
  ```bash
  hermes mcp add vendaerp --command node \
    --args /root/consult-delivery/vendaerp-mcp/src/server.js \
    --env BRIDGE_URL=http://127.0.0.1:3001 INTERNAL_BRIDGE_TOKEN=... \
          SUPABASE_URL=... SUPABASE_SERVICE_KEY=... \
          CD_AUDIT_TENANT_ID=9079bd4d-4df7-4023-90fb-d79c8ba7e900
  hermes mcp list && hermes mcp test vendaerp
  systemctl restart hermes-gateway
  ```
- ⚠️ **De-para de env:** o config do `vendaerp-mcp` pede `SUPABASE_SERVICE_KEY`, mas a chave no
  `.env` do Bridge é `SUPABASE_SERVICE_ROLE_KEY` — mapear na hora do `add`/`live-smoke`.
- Smoke real: `cd vendaerp-mcp && npm i && npm run live-smoke` (precisa dos secrets no env) —
  ✅ passou contra o ERP real via Bridge; 6 linhas em `audit_log` (`action=mcp:erp_*`,
  `agent_name=ceo_agent`, sucesso = `metadata->>'ok'`=true; a tabela NÃO tem coluna `status`).
- Bug `empresa:null` (a API responde PascalCase) corrigido (#354, squash `048310a`) → live
  `{"conectado":true,"total_empresas":1,"empresa":"Consult  Delivery"}`.
- ⚠️ **Pendências manuais do Wandson (não-bloqueantes):**
  (a) teste E2E no Telegram em **sessão NOVA** do @DeliConsultBot ("qual o status do VendaERP?" → `erp_status`);
  (b) **ROTACIONAR o `VENDAERP_TOKEN`** (vazou em texto plano no chat): gerar chave nova no token
  "Hermes", trocar no `.env` do Bridge, `pm2 restart bridge-server`, revogar a antiga. Nunca ecoar o token bruto.

## Sync `consult-delivery-os` (dados financeiros) — clone read-only + webhook (2026-07-31)

Repo GitHub `deli-consult-delivery/consult-delivery-os` (separado deste repo `consult-delivery`)
sincronizado para a VPS via clone git read-only + webhook, com cron de fallback.

- **Clone:** `~claudedev/consult-delivery-os` (usuário `claudedev`, não-root, separado do bridge).
  Deploy key SSH read-only em `~claudedev/.ssh/deli_consult_delivery_os_deploy`, alias no
  `~claudedev/.ssh/config` (`Host github-consult-delivery-os`).
- **Script de pull:** `~claudedev/bin/pull-consult-delivery-os.sh` (`git pull origin main`).
- **Rota webhook:** `POST /webhooks/github` em `/root/consult-delivery/bridge-server/index.js`
  (mesmo padrão HMAC de `/webhooks/asaas`/`/api/nexus-callback`: header `X-Hub-Signature-256`,
  `crypto.timingSafeEqual` sobre `req.rawBody`). Só dispara pull se `event=push` e
  `ref=refs/heads/main`. Bridge roda como root → dispara o pull como `claudedev` via
  `exec('su - claudedev -c "~/bin/pull-consult-delivery-os.sh"')` (root já tem privilégio de `su`
  sem senha para qualquer usuário — não precisou de sudoers novo).
- **Secret:** env var `GITHUB_WEBHOOK_SECRET` no `.env` do Bridge (plaintext, mesmo formato das
  demais — `.env` não está criptografado com dotenvx apesar do loader `dotenvx` estar em uso).
- **Cron de fallback:** crontab do `claudedev`, `*/5 * * * * ~/bin/pull-consult-delivery-os.sh >> ~/consult-delivery-os-pull.log 2>&1`.
- **Webhook GitHub:** configurado via `gh api repos/deli-consult-delivery/consult-delivery-os/hooks`,
  evento `push` apenas, apontando para a URL pública do bridge + `/webhooks/github`.

## Sync `consult-delivery-os` — upgrade pra escrita via MCP + aprovação Telegram (2026-07-31)

O clone read-only acima virou insuficiente quando a DELI passou a precisar *escrever* de volta
nesse repo (não só ler dados sincronizados do GitHub). Troca de deploy key + MCP novo, mantendo
o clone/webhook/cron de leitura documentados na seção anterior intactos.

- **Deploy key trocada para read-write:** id `158943385`, title
  `hermes-gateway-vps-readwrite`, `read_only: false` no repo
  `deli-consult-delivery/consult-delivery-os` (chave em si não documentada aqui — vive só no
  `~claudedev/.ssh/`).
- **MCP novo `consult-delivery-os-mcp`:**
  - Path: `/home/claudedev/consult-delivery-os-mcp/` (processo Node, `src/server.js`).
  - Roda **fora do Docker** — motivo: o gate `approvals:manual` nativo do Hermes ignora 100% dos
    comandos executados dentro de container (`terminal_tool`), então o gate de commit/push só
    funciona vivendo num processo host puro.
  - Registrado em `/home/claudedev/.hermes/.hermes/config.yaml` (chave `consult-delivery-os` em
    `mcpServers`, `command: node`, `enabled: true`) e ativo no `hermes-gateway.service`
    (subprocesso confirmado via `systemctl status`, PID filho do gateway).
  - **Tools expostas:** `consult_delivery_os_read_file`, `consult_delivery_os_list_files`,
    `consult_delivery_os_write_file` (escreve só no working tree local, sem commit — sem
    aprovação), `consult_delivery_os_commit_and_push` (propõe commit+push, exige confirmação),
    `consult_delivery_os_confirm` (executa de fato, com `proposal_id` + código). Trava de path
    (`pathGuard`) bloqueia qualquer caminho fora do repo e qualquer coisa em `.git/`.
- **Mecanismo de confirmação:** estado **em memória do processo MCP** (não é tabela SQL — módulo
  `src/proposals.js`). `commit_and_push` gera um código, manda resumo do diff + código pro
  Telegram (`@DeliConsultBot`, `TELEGRAM_HOME_CHANNEL` — mesmas credenciais já usadas pelo
  Hermes) e retorna só o `proposal_id` (o código nunca volta pra DELI). Confirmação real só
  acontece quando o Wandson responde o código e alguém chama `confirm(proposal_id, codigo)`.
  Expira em `CD_OS_PROPOSAL_TTL_MS` — default **10 min**; máx. 5 tentativas de código errado
  (`CD_OS_MAX_CONFIRM_ATTEMPTS`).
- ⚠️ **Nota ponytail:** aprovação em memória do processo — não sobrevive a restart do MCP (uma
  proposta pendente se perde se o `hermes-gateway.service` reiniciar antes da confirmação).
  Upgrade pra persistência (SQL) só se isso virar problema recorrente na prática — não
  implementar antes disso.

### Teste E2E feito nesta sessão (2026-07-31, ~23:00 UTC)

Logs do `journalctl -u hermes-gateway` não continham nenhuma linha do MCP em si (o gateway só
loga em WARNING falhas de conexão de outros MCPs — não há log de tool call bem-sucedida nem
arquivo de log próprio do `consult-delivery-os-mcp`), então o commit `786f7bf` (limpeza de teste
anterior) **não pôde ser confirmado via log**. Para confirmar o fluxo de verdade, rodei um
cliente MCP manual (`@modelcontextprotocol/sdk` Client + `StdioClientTransport`, mesmo binário
`src/server.js`, mesmas env vars do `config.yaml`) direto na VPS:

1. `consult_delivery_os_write_file` em `_test_mcp_confirm/ping.txt` (arquivo isolado) → ok,
   escrito no working tree, sem commit.
2. `consult_delivery_os_commit_and_push` → resposta real:
   `{"ok": true, "proposal_id": "e0263c21-c4cb-443a-9b86-f32f53afe446", "status":
   "pending_confirmation", "delivered": true, "fileCount": 1}`. `delivered: true` vem do próprio
   `telegram.js` só depois de receber `200 OK` da API do Telegram — ou seja, a mensagem com o
   código chegou de fato no chat configurado.
3. **Não confirmei a proposta** (não simulei ser o Wandson) — ela ficou `pending_confirmation`,
   confirmando que a trava de aprovação funciona (a DELI sozinha não consegue commitar/dar push).
   Deixei a proposta expirar sozinha (TTL 10 min, sem tool de cancelamento manual exposta).
4. Limpeza pós-teste: removido o arquivo `_test_mcp_confirm/` **não commitado** do working tree
   do clone (`git status --short` confirmou que nada tinha sido de fato commitado/pushado) e os
   scripts de teste temporários em `/tmp` na VPS. Nenhum commit real foi criado, nenhum push
   ocorreu, histórico do repo remoto intocado.
