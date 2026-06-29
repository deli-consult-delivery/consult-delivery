# cd-evolution-mcp

MCP do Hermes para o **WhatsApp (Evolution) — só leitura de status** (FASE 2 / Blueprint v2).

O Hermes nunca fala direto com a Evolution: chama o **Bridge** (`/api/evolution/status`) com
`x-internal-token`. **Não envia nada** — envio a cliente é **draft + aprovação** (regra de ouro),
fora deste MCP. Tudo auditado.

## Tools (leitura)
- `evolution_status` — instância(s) WhatsApp do tenant conectada(s)? (útil antes de propor envio)

## Env (Infisical, no MCP)
`INTERNAL_BRIDGE_TOKEN`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `CD_AUDIT_TENANT_ID`.

## Reservado ao Wandson (VPS)
deploy do Bridge (rota nova `/api/evolution/status`) · `cd evolution-mcp && npm install` ·
`hermes mcp add evolution --env …` · `hermes gateway restart` · `npm run live-smoke`.

## Testes
`npm run smoke` (offline) · `npm run live-smoke` (Bridge real — ativação).
