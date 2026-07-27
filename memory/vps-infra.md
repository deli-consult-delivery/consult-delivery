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
- **Topologia de rede (confirmada ao vivo, `nginx -T`, PR #844):**
  `Cliente → Cloudflare (bridge.consultdelivery.com.br, proxied/laranja) → nginx local
  na VPS (proxy_pass http://localhost:3001; proxy_set_header X-Forwarded-For
  $proxy_add_x_forwarded_for) → bridge-server:3001`. **2 hops confiáveis**
  (Cloudflare + nginx) → `bridge-server/index.js` usa `app.set('trust proxy', 2)` +
  `req.ip` nas rotas com rate-limit por IP (nunca ler `x-forwarded-for` cru — era
  spoofável antes disso, achado do PR #839/correção do #844). Doc completo:
  `docs/deli-memory/tech-debts/trust-proxy-bridge.md`.

### Como atualizar e reiniciar o bridge

⚠️ **Isto já é automático, não manual.** `.github/workflows/deploy.yml` job `deploy-bridge`
roda em TODO push em `main` via self-hosted runner (`runs-on: [self-hosted, bridge-vps]`,
desde PR #148) e faz exatamente `git reset --hard origin/main` + `pm2 restart bridge-server`
em `/root/consult-delivery`. Confirmado ativo: últimos runs `deploy-bridge` = success
(verificado 2026-07-05, `gh run view`).

**Implicação:** qualquer alteração feita à mão em `/root/consult-delivery` (hotfix não
commitado, checkout de outra branch p/ teste) é **apagada no próximo push em `main`** —
não existe deploy manual "seguro" nesse diretório, é sempre sobrescrito. Se precisar
testar algo sem isso ser destruído pelo próximo push, usar `/home/wandson/consult-delivery/`
(cópia dev) ou uma branch separada, nunca o diretório de produção.

Comando manual (só se o runner cair/estiver indisponível):
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

## Deploy do Trigger.dev já é automático — não rodar manual por padrão

`.github/workflows/deploy.yml` tem um job `deploy-trigger` que roda `npx trigger.dev@4.4.6
deploy --native-build-server` em runner Linux hospedado pela GitHub, em TODO push em `main`
— junto com `build-and-deploy` (frontend) e `deploy-bridge` (self-hosted). Confirmado ao vivo
(PR #888, run 30297648517): versão `20260727.8` deployada com sucesso, ~1min30s.
**Não precisa rodar `npm run deploy:trigger` manualmente depois de mergear em main — o CI já
faz isso.** O workaround abaixo só serve pra um deploy ad-hoc a partir deste Windows, fora do
fluxo normal (testar antes de commitar, por exemplo).

### `npx trigger.dev deploy` quebra no Windows (path com espaço) — usar bin local

Rodar `npx trigger.dev@4.4.6 deploy` direto (baixando pro cache global do npx) **falha
sempre** neste ambiente Windows, no passo `[indexer 2/2]` do build, com
`Cannot find module '/app/Users/Consult%20Delivery/...managed-index-controller.mjs'`
(ou `%7E1` se tentar contornar redirecionando `npm_config_cache` pra um path 8.3 tipo
`CONSUL~1`). Causa: o CLI resolve o path absoluto do próprio pacote no HOST (que inclui
`C:\Users\Consult Delivery\...\AppData\Local\npm-cache\_npx\<hash>\...`) e tenta reproduzir
esse mesmo path absoluto dentro do container Docker do build remoto — como o path do host
tem espaço, vira `%20`/`%7E1` no container e o módulo não existe lá.

**Fix:** instalar `trigger.dev` como devDependency do próprio projeto (`node_modules/trigger.dev`
vive num path relativo ao repo, sem o `AppData\...\Consult Delivery\...` do usuário) e rodar via
`npm run deploy:trigger` (script em `package.json` → `trigger deploy`, resolve pro bin local).
Fixado em `4.4.6` — mesma versão de `@trigger.dev/sdk`/`@trigger.dev/build` já usada no projeto,
pra não divergir. Confirmado ao vivo: versão `20260725.5`, 87 tasks detectadas
(https://cloud.trigger.dev/projects/v3/proj_slexhoelcjwgbopmbzzr/deployments/2sx5a907).

### Homologação Cardápio Web → Venda ERP (2026-07-23)

- O Venda ERP pode responder `HTTP 200` contendo uma string de erro de negócio;
  `response.ok` sozinho não comprova sucesso.
- `Pessoas/Salvar` exige CPF ou CNPJ, inclusive para cliente genérico. O pedido
  também exige o nome de um cliente já cadastrado.
- `Pedidos/SalvarEFaturar` exige plano de contas válido.
- Gate aprovado: `SalvarEFaturar` baixou estoque e criou contas a receber;
  `ExcluirPedido` reverteu os três efeitos; `Pedidos/Salvar` atualizou status.
- A ponte vive no Bridge, mas inicia desligada. Segredos novos:
  `CARDAPIO_WEB_CLIENT_ID`, `CARDAPIO_WEB_WEBHOOK_TOKEN` e
  `CARDAPIO_WEB_TOKEN_ENCRYPTION_KEY` (32 bytes base64), mais
  `CARDAPIO_WEB_BOOTSTRAP_TOKEN`. A V1 também exige a allowlist
  `CARDAPIO_WEB_BOOTSTRAP_TENANT_ID`, `CARDAPIO_WEB_BOOTSTRAP_MERCHANT_ID`,
  `CARDAPIO_WEB_BOOTSTRAP_VENDA_EMPRESA` e o kill switch
  `CARDAPIO_WEB_VENDA_WRITE_ENABLED=true`.
- O callback e a ativação exigem os escopos OAuth `orders` e `store`; `store`
  é necessário para consultar a loja autorizada e validar o `merchant_id`.
  Se a permissão for adicionada após a instalação, o app precisa ser reinstalado.
- Valores monetários são normalizados em centavos com arredondamento half-up e
  o fechamento entre itens, frete, outras despesas e total ocorre antes de qualquer
  write no Venda ERP.
- Situação operacional: solicitação enviada à Cardápio Web e cliente genérico
  `Consumidor Final` já cadastrado no Venda ERP.
- A URL pública de instalação é exatamente
  `https://bridge.consultdelivery.com.br/api/cardapio-web/oauth/start`. Ela
  renderiza um formulário `no-store`; o código one-shot trafega somente no body
  urlencoded e nunca no path, query ou redirect.
- Evidência completa e sanitizada:
  `docs/integracoes/cardapio-web-venda-erp-homologacao.md`.
