# cd-ifood-mcp

MCP do Hermes para o **iFood — somente leitura** (FASE 2 do Blueprint v2 AI-First).

**Princípio (igual ao vendaerp-mcp):** o Hermes nunca fala direto com a API do iFood.
Este MCP chama o **Bridge** (`/api/ifood/*`) com `x-internal-token`; o Bridge resolve
tenant/merchant e injeta a credencial (client_credentials). **Nenhuma credencial do
iFood vive aqui.** Toda chamada é auditada em `audit_log`.

## Tools (leitura)
- `ifood_status` — loja aberta/fechada agora
- `ifood_catalogo` — catálogos (ou itens vendáveis de um `groupId`)
- `ifood_cardapio` — cardápio agregado (categorias→itens + disponibilidade)
- `ifood_reviews` — avaliações
- `ifood_vendas` — vendas por período (`dataInicio`/`dataFim`)

Escrita no iFood (responder review, mudar cardápio) **não** vive aqui — é rota Bridge +
draft/aprovação (fase futura).

## Env (Infisical, no MCP)
`INTERNAL_BRIDGE_TOKEN`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `CD_AUDIT_TENANT_ID`
(opcionais: `BRIDGE_URL`, `CD_MCP_PRINCIPAL`, `CD_MCP_TIMEOUT_MS`).

## Reservado ao Wandson (VPS)
`npm install` no diretório · registrar no gateway: `hermes mcp add ifood --env …` ·
`hermes gateway restart`. As rotas `/api/ifood/*` do Bridge já existem (leitura).

## Testes
`npm run smoke` (offline) · `npm run live-smoke` (contra o Bridge real — fase de ativação).
