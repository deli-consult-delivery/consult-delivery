# Trust proxy no bridge-server — decisão (PR #839, follow-up)

## Achado
Várias rotas públicas do bridge (`asaas-webhook.js`, `crm-atendimento-webhook.js`,
`publico-aprovacao.js`, `publico-avaliacao.js`, `publico-nps.js`, `wizard-publico.js`,
mais o handler `/webhooks/asaas` em `index.js`) faziam rate-limit lendo
`req.headers['x-forwarded-for']` **sem** `app.set('trust proxy', ...)` configurado.
`x-forwarded-for` é um header que **o próprio cliente HTTP envia** — sem um proxy de
confiança na frente que o sobrescreva/anexe de forma controlada, um atacante manda
`X-Forwarded-For: <ip aleatório>` a cada request e contorna o rate-limit trivialmente
(o código sempre pegava o 1º valor da lista, que é exatamente o campo controlado pelo
cliente).

## Investigação da topologia
- `memory/vps-infra.md`: bridge roda via PM2 direto na porta 3001, sem menção de
  nginx/Caddy/load balancer na frente.
- Busca em `memory/`, `docs/deli-memory/`, `docs/infra/` por
  nginx/"reverse proxy"/"trust proxy"/cloudflare: **zero resultado**.
- Sem acesso à VPS nesta sessão (regra dura) pra confirmar ao vivo (`nginx -T`,
  `curl -v`, etc.) se existe algum terminador de TLS na frente de `bridge.consultdelivery.com.br`.

## Decisão
**Sem confirmação de um proxy de confiança, a escolha segura é não confiar em
`x-forwarded-for`.** Configurar `app.set('trust proxy', N)` sem ter certeza do número
de hops e de que o proxy realmente *sobrescreve* (não só anexa) o header seria pior
que o bug atual — o app passaria a confiar cegamente num valor que pode continuar
vindo direto do atacante.

**Fix aplicado**: as 7 rotas passam a usar exclusivamente `req.socket.remoteAddress`
(o IP real da conexão TCP, não falsificável pelo cliente) para o rate-limit. Efeito
colateral aceito: se um dia existir de fato um proxy/CDN na frente, todas as
requisições passarão a contar como vindo do IP do proxy — o rate-limit vira "por
proxy" em vez de "por cliente final" (menos preciso, mas nunca inseguro).

## Reabertura (se/quando confirmado que há proxy)
Se alguém confirmar ao vivo (acesso à VPS) que há nginx/Cloudflare/LB na frente da
porta 3001 e qual o número exato de hops confiáveis:
1. `app.set('trust proxy', <hops>)` em `bridge-server/index.js`.
2. Trocar as 7 ocorrências de `req.socket.remoteAddress` por `req.ip` (Express já
   resolve `req.ip` corretamente combinando `trust proxy` + `x-forwarded-for`).
3. Remover este documento (ou marcar como resolvido) e apagar a ressalva dos
   comentários nas rotas.
