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

## VendaERP — integração (Fase 1)

- **Credencial do ERP (3 headers `Authorization-Token`/`User`/`App`)** vive SÓ no env do Bridge:
  Infisical → `VENDAERP_BASE_URL`, `VENDAERP_TOKEN`, `VENDAERP_USER`, `VENDAERP_APP`.
  Após adicionar: `pm2 restart bridge-server`.
- **Bridge é o ponto único** — Console (JWT) e Hermes (`vendaerp-mcp` via x-internal-token) chamam
  `/api/vendaerp/*`; ninguém fala com o ERP direto.
- **Subir o MCP no Hermes (GATE 0):**
  ```bash
  hermes mcp add vendaerp --command node \
    --args /root/consult-delivery/vendaerp-mcp/src/server.js \
    --env BRIDGE_URL=http://127.0.0.1:3001 INTERNAL_BRIDGE_TOKEN=... \
          SUPABASE_URL=... SUPABASE_SERVICE_KEY=... \
          CD_AUDIT_TENANT_ID=9079bd4d-4df7-4023-90fb-d79c8ba7e900
  hermes mcp list && hermes mcp test vendaerp
  systemctl restart hermes-gateway
  ```
- Smoke real: `cd vendaerp-mcp && npm i && npm run live-smoke` (precisa dos secrets no env).
