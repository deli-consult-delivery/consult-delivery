# Trust proxy no bridge-server — RESOLVIDO (PR #839 → #844)

## Achado original (PR #839)
Várias rotas públicas do bridge (`asaas-webhook.js`, `crm-atendimento-webhook.js`,
`publico-aprovacao.js`, `publico-avaliacao.js`, `publico-nps.js`, `wizard-publico.js`,
mais `/webhooks/asaas` em `index.js`) faziam rate-limit lendo `x-forwarded-for`
diretamente, sem `app.set('trust proxy', ...)` — header 100% controlado pelo cliente,
spoofável.

## ⚠️ Erro da 1ª correção (revertido)
A 1ª tentativa (mesmo PR #844, 1ª rodada) assumiu, por não achar menção a proxy em
`memory/`, que **não havia** reverse proxy na frente — e trocou tudo para
`req.socket.remoteAddress` puro. **Isso estava errado**: a topologia real (documentada
em `.planning/.continue-here.md`, não verificada na 1ª busca) sempre teve nginx +
Cloudflare na frente. Com `req.socket.remoteAddress`, TODO tráfego chegaria de
`127.0.0.1` (o nginx local) — o rate-limit viraria um bucket **global** (todos os
visitantes somados), derrubando com 429 tráfego legítimo (ex.: webhooks de pagamento
Asaas) na primeira rajada de qualquer origem.

## Topologia confirmada ao vivo (`nginx -T` na VPS, read-only)
```
Cliente → Cloudflare (bridge.consultdelivery.com.br, proxied) → nginx local
  (proxy_pass http://localhost:3001; X-Forwarded-For via $proxy_add_x_forwarded_for)
  → bridge-server:3001
```
**2 hops confiáveis** (Cloudflare + nginx). Registrado em `memory/vps-infra.md`.

## Fix definitivo
- `bridge-server/index.js`: `app.set('trust proxy', 2)`.
- As 7 rotas usam `req.ip` (Express extrai o IP real do cliente da cadeia
  `X-Forwarded-For`, confiando só nos 2 hops declarados) — nunca mais leem o header
  cru nem usam `req.socket.remoteAddress` puro.

## Lição
Antes de decidir topologia de rede, buscar em **`.planning/`** além de `memory/` — o
handoff de sessão anterior (`.continue-here.md`) já tinha a resposta.
