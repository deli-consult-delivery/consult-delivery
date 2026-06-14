# cd-vendaerp-mcp

MCP do **Hermes** (copiloto do CEO, via Telegram) para o **VendaERP**.
**Fase 1 = SÓ LEITURA.** A escrita (criar/emitir, com confirmação no Telegram) é Fase 2.

## Princípio de arquitetura

Este MCP **não fala direto com o VendaERP**. Toda chamada vai para o **Bridge**:

```
Hermes ── vendaerp-mcp ──(x-internal-token)──► Bridge /api/vendaerp/* ──(3 headers)──► VendaERP
                  │
                  └──► audit_log (Supabase)   ← toda chamada é auditada
```

A credencial do ERP (`Authorization-Token`, `User`, `App`) vive **só no env do Bridge**
(Infisical: `VENDAERP_BASE_URL/TOKEN/USER/APP`). Este processo **não carrega nenhum
segredo do ERP** — só `INTERNAL_BRIDGE_TOKEN` (p/ falar com o Bridge) e a
`service_role` do Supabase (p/ gravar a trilha de auditoria).

## Tools (Fase 1 — leitura)

| Tool             | O que faz                                              | Bridge |
|------------------|--------------------------------------------------------|--------|
| `erp_status`     | credencial do ERP válida? empresa principal            | `/status` |
| `erp_contratos`  | lista/pesquisa contratos                               | `/contratos` |
| `erp_financeiro` | lançamentos (default) ou boletos                       | `/lancamentos` · `/boletos` |
| `erp_estoque`    | saldos (default) ou depósitos                          | `/estoque` · `/depositos` |
| `erp_fiscal`     | NFE por código ou por período                          | `/fiscal` |
| `erp_crm`        | oportunidades (funil)                                  | `/oportunidades` |

Não há tool de escrita — a mutação simplesmente não existe (enforcement estrutural).

## Variáveis de ambiente (fail-closed)

| Var                     | Obrig. | Default                  | Para quê |
|-------------------------|--------|--------------------------|----------|
| `INTERNAL_BRIDGE_TOKEN` | ✅     | —                        | autentica no Bridge |
| `SUPABASE_URL`          | ✅     | —                        | PostgREST (audit) |
| `SUPABASE_SERVICE_KEY`  | ✅     | —                        | grava `audit_log` |
| `CD_AUDIT_TENANT_ID`    | ✅     | —                        | tenant da trilha |
| `BRIDGE_URL`            | ❌     | `http://127.0.0.1:3001`  | endereço do Bridge |
| `CD_MCP_PRINCIPAL`      | ❌     | `ceo_agent`              | `audit_log.agent_name` |
| `CD_MCP_TIMEOUT_MS`     | ❌     | `25000`                  | timeout das chamadas ao Bridge |

## Testes

```bash
npm i
npm run smoke        # offline: contrato das tools + nenhuma tool de escrita
npm run live-smoke   # real: chama as 6 tools via Bridge (precisa do GATE 0)
```

## Subida (GATE 0 — reservado ao Wandson)

Pré: o Bridge já precisa ter os 4 `VENDAERP_*` no env + `pm2 restart bridge-server`.

```bash
hermes mcp add vendaerp \
  --command node \
  --args /root/consult-delivery/vendaerp-mcp/src/server.js \
  --env BRIDGE_URL=http://127.0.0.1:3001 \
        INTERNAL_BRIDGE_TOKEN=... \
        SUPABASE_URL=... \
        SUPABASE_SERVICE_KEY=... \
        CD_AUDIT_TENANT_ID=9079bd4d-4df7-4023-90fb-d79c8ba7e900
hermes mcp list && hermes mcp test vendaerp
systemctl restart hermes-gateway
```
