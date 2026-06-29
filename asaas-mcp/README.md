# cd-asaas-mcp

MCP do Hermes para o **Asaas — somente leitura** (FASE 2 do Blueprint v2 AI-First).

O Hermes nunca fala direto com a API do Asaas: chama o **Bridge** (`/api/asaas/*`) com
`x-internal-token`; a `ASAAS_API_KEY` vive **só no Bridge**. Toda chamada é auditada.

## Tools (leitura)
- `asaas_saldo` — saldo atual da conta
- `asaas_situacao_mes` — cobranças do mês por status (recebidas/confirmadas/aguardando/vencidas)

Cobrança/envio a cliente **não** vive aqui — é draft + aprovação (CORA).

## Env (Infisical, no MCP)
`INTERNAL_BRIDGE_TOKEN`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `CD_AUDIT_TENANT_ID`.

## Reservado ao Wandson (VPS)
`cd asaas-mcp && npm install` · `hermes mcp add asaas --env …` · `hermes gateway restart` ·
deploy do Bridge (as rotas `/api/asaas/*` passaram a aceitar `x-internal-token`).

## Testes
`npm run smoke` (offline) · `npm run live-smoke` (Bridge real — ativação).
