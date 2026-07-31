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
