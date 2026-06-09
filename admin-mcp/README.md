# cd-admin-mcp — Admin MCP do Hermes (copiloto CEO)

Servidor **MCP (stdio)** que dá ao copiloto do Wandson (Hermes / `ceo_agent`) uma
**janela de leitura ampla** sobre o Consult Delivery — todos os tenants — e **uma
única forma de escrita: propor um draft pendente**. Nunca envia a cliente, nunca
aprova o próprio draft, nunca executa mutação direta.

Spec autoritativa: [`docs/infra/admin-mcp-design.md`](../docs/infra/admin-mcp-design.md).
Ordem de subida: [`docs/infra/RUNBOOK-WANDSON.md`](../docs/infra/RUNBOOK-WANDSON.md).

> ⚠️ **Este módulo é só o CÓDIGO.** Ele **não vai a runtime** sem três passos
> reservados ao Wandson (credenciais/VPS): **GATE 0** (rotação) · usuário do SO
> **`claudedev`** · **token `service_role` dedicado** no Infisical. Enquanto isso
> não acontecer, é um deliverable versionado e testável offline — nada liga sozinho.

---

## O que é (e o que NÃO é)

| | |
|---|---|
| **É** | processo separado do bridge; lê via `service_role` (bypassa RLS) e **audita toda chamada**; escreve só `agent_drafts` pendente com `origin='hermes'`. |
| **NÃO é** | não tem tool de aprovar/enviar/executar/deletar/atualizar. O enforcement é **estrutural**: a mutação não existe no catálogo, então o Hermes não consegue chamá-la nem que queira. |

As três proibições do design (§1) viram garantias de código:
1. **credencial de prod nunca no Hermes** → token vem do Infisical em runtime, nunca no git (`config.js` é fail-closed);
2. **Hermes nunca fala com cliente** → única escrita é draft `pending`; o sistema só envia depois do Wandson aprovar no painel;
3. **escopo mínimo, não admin total** → 6 tools de leitura + 1 de proposta; sem `cd_executar_*`.

---

## Tools (7)

**Leitura (6)** — liberadas após GATE 0:

| Tool | O que faz |
|---|---|
| `cd_status` | semáforo da infra: bridge `/health` + ping no banco |
| `cd_lojas` | lojas de todos os tenants, marca `is_real_business` vs seed/teste |
| `cd_agent_runs` | execuções recentes de agentes + soma de `cost_usd` |
| `cd_drafts_pendentes` | drafts `pending` (filtra por `origin`), conta os do Hermes |
| `cd_inadimplencia` | cobranças CORA em aberto + soma de `valor_atual` |
| `cd_audit` | trilha recente do `audit_log` |

**Escrita (1)** — gated:

| Tool | O que faz |
|---|---|
| `cd_propor_draft` | cria **proposta** (`agent_drafts` `status=pending`, `origin='hermes'`). **Não envia.** Vira draft no painel → Wandson aprova → sistema executa. |

---

## Variáveis de ambiente

Injetadas pelo Wandson a partir do **Infisical** ao ligar o gateway. Nada hardcoded.

| Var | Obrig. | Default | Para quê |
|---|---|---|---|
| `SUPABASE_URL` | ✅ | — | endpoint PostgREST |
| `SUPABASE_SERVICE_KEY` | ✅ | — | token `service_role` **dedicado** (bypassa RLS → por isso tudo é auditado) |
| `CD_AUDIT_TENANT_ID` | ✅ | — | `tenant_id` da "plataforma/CD" para auditar chamadas cross-tenant (`audit_log.tenant_id` é `NOT NULL`) |
| `BRIDGE_URL` | — | `http://127.0.0.1:3001` | health-check do bridge (`cd_status`) |
| `CD_MCP_PRINCIPAL` | — | `ceo_agent` | identidade em `audit_log.agent_name` |
| `CD_MCP_DEFAULT_LIMIT` | — | `20` | limite padrão das listagens |
| `CD_MCP_MAX_LIMIT` | — | `100` | teto de `limit` por chamada |

Falta de obrigatória → o processo **não sobe** (fail-closed, de propósito: melhor não
subir do que subir sem auditoria ou sem credencial).

---

## Auditoria (não-negociável, §5)

Toda tool — leitura **e** escrita, sucesso **e** erro — grava em `audit_log`:
`agent_name=<principal>`, `action=mcp:<tool>`, `resource=<tool>`, `metadata={args, ok, summary, error, scope}`.
Chamada com tenant específico → **uma linha por tenant tocado** (`scope=tenant`);
chamada de infra (ex.: `cd_status`) → uma linha sob `CD_AUDIT_TENANT_ID` (`scope=platform`).
A auditoria é best-effort em relação à resposta (uma falha de gravação vai ao stderr,
não derruba a tool), mas **nenhuma chamada passa sem tentativa de trilha**.

---

## Testar offline (sem banco, sem credencial)

```bash
cd admin-mcp
npm install
npm run smoke              # contrato: tools certas, nenhuma tool proibida, McpServer registra tudo
npm run test:integration  # handshake MCP real sobre stdio (tools/list devolve as 7) — env dummy, não toca o banco
```

Ambos rodam sem rede e sem segredo: provam o catálogo, o enforcement estrutural e
o protocolo ponta-a-ponta. Não provam as queries reais — isso depende de credencial
e só roda após a subida.

---

## Subida (RESERVADO AO WANDSON)

Resumo; passo-a-passo em [`RUNBOOK-WANDSON.md`](../docs/infra/RUNBOOK-WANDSON.md) e checklist em `admin-mcp-design.md` §6.

1. **GATE 0** — rotação de credenciais (pré-requisito de tudo).
2. **`claudedev`** — usuário do SO sob o qual o gateway/MCP roda (não-root).
3. **Token `service_role` dedicado** no Infisical → exporta as env vars acima para o processo.
4. **Registrar este MCP no Hermes** (gateway), comando `node admin-mcp/src/server.js` (stdio).
5. **Teste de isolamento + smoke com credencial real** antes de liberar a escrita.

Enquanto 1–3 não estiverem feitos, **não ligar**. O código está pronto e testado; o
runtime é decisão e credencial do Wandson.
