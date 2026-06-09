# Admin MCP — design (T4 · Hermes 3B)

> **Status:** DESENHO (não implementado). Última revisão: 2026-06-09 (sessão 30).
> **O que é:** a interface pela qual o **Hermes** (copiloto pessoal do CEO, rodando isolado na VPS, allowlist Telegram só Wandson `8745522380`) acessa a plataforma Consult Delivery para **consultar estado e propor ações** — sem virar o motor da plataforma e sem poder agir sozinho sobre clientes.
> **Bloqueios de go-live (reservados ao Wandson):** 🔒 GATE 0 (rotação de credenciais — `docs/infra/gate0-rotacao-credenciais.md`) · gateway root→usuário dedicado (`docs/infra/claude-code-vps-setup.md`). **Este doc cobre só o design; nada vai a runtime antes desses dois.**

---

## 1. Princípio de design (o que NÃO pode acontecer)

O Hermes é mono-usuário (Wandson) e mono-tenant na intenção, mas a CD é **multi-tenant**. Por isso o admin MCP é desenhado a partir de 3 proibições:

1. **Nada de credencial de produção no Hermes.** O admin MCP nunca devolve segredos (chaves Asaas/Anthropic/Evolution). Ele expõe **estado e métricas**, não o cofre. Segredos seguem só no Infisical.
2. **Hermes nunca fala com cliente.** Igual à regra da DELI (CLAUDE.md): nenhuma ação do Hermes envia mensagem a cliente direto. Escrita que toca cliente = **draft → aprovação do Wandson → sistema envia** (reusa o fluxo `drafts_deli`).
3. **Escopo mínimo, não admin total.** O principal do Hermes (`ceo_agent`) **não** é `admin` do RBAC. É um papel novo, de **leitura ampla + escrita só via proposta**, auditado em cada chamada.

---

## 2. Identidade — o principal `ceo_agent`

- Novo papel no RBAC (`supabase/migrations/...rbac`): `ceo_agent`, distinto de `admin`/`deli_owner`.
- **Permissões (read):** `select` em telas de painel — métricas de loja, runs de agentes, status de integrações, inadimplência (visão agregada), drafts pendentes, audit_log.
- **Permissões (write):** **nenhuma escrita direta a tabelas cliente-facing.** Só pode **criar drafts** (proposta) e **disparar tasks Trigger.dev de leitura/análise** (ex.: pedir um relatório VERA, rodar uma análise de loja). Nunca aprovar o próprio draft.
- **Multi-tenant:** o `ceo_agent` é da **CD (equipe)**, não de um tenant. Lê via `service_role`-equivalente com escopo de leitura — mas **toda query passa por uma view/endpoint que registra `tenant_id` no audit**, nunca SQL livre.

> Decisão travada p/ Wandson: o `ceo_agent` enxerga **todos os tenants** (visão CEO) ou **só os tenants ativos/pagantes**? Default proposto: **todos**, com marcação de quais são seed/teste. 🛑 confirmar.

---

## 3. Superfície de tools (MCP)

Duas classes, separadas no protocolo para o gateway poder bloquear a segunda sem a primeira.

### 3.1 Tools de LEITURA (sempre liberadas, pós-GATE 0)
| Tool | Devolve | Fonte |
|------|---------|-------|
| `cd_status` | semáforo geral (agentes vivos, bridge online, deploy atual) | bridge `/health` + `pm2 jlist` resumido |
| `cd_lojas` | lista de lojas + métricas-chave por tenant | `lojas` / `loja_metricas` |
| `cd_agent_runs` | últimos runs de agentes (status/custo) | `agent_runs` |
| `cd_drafts_pendentes` | drafts aguardando aprovação | `drafts_deli` (status=pendente) |
| `cd_inadimplencia` | visão agregada de cobrança | Supabase (fonte primária, não Evolution) |
| `cd_audit` | últimas N entradas de auditoria | `audit_log` |

Read tools **nunca** retornam: chaves/secrets, conteúdo de mensagem de cliente em claro além do necessário, PII fora do escopo de painel.

### 3.2 Tools de ESCRITA (propõe-e-aprova, gated)
| Tool | Efeito | Aprovação |
|------|--------|-----------|
| `cd_propor_draft` | cria um draft (mensagem/ação) | **vira draft `pendente`** → Wandson aprova no painel → sistema executa. Hermes **não** aprova. |
| `cd_disparar_analise` | enfileira task Trigger.dev de **análise/relatório** (read-only de negócio) | liberada (não toca cliente), mas **logada** |
| ~~`cd_executar_*`~~ | qualquer mutação direta cliente-facing | **NÃO EXISTE.** Fora de escopo por design. |

---

## 4. Transporte & runtime

- **Onde roda:** o admin MCP é um **processo separado** (não o bridge de produção), exposto só na rede interna da VPS, consumido pelo gateway do Hermes. Roda como o **usuário dedicado `claudedev`**, nunca root (pré-req: `docs/infra/claude-code-vps-setup.md`).
- **Auth:** token dedicado do admin MCP (gerado no GATE 0, guardado no Infisical), distinto do `DASHBOARD_API_TOKEN`. Rotacionável isolado.
- **Sem `bypassPermissions`:** o Hermes mantém allowlist de tools; o gateway pode desligar a classe de escrita (§3.2) sem derrubar a leitura.

---

## 5. Auditoria (não-negociável)

- **Toda** chamada (read e write) grava em `audit_log`: quem (`ceo_agent`), qual tool, qual `tenant_id` tocado, timestamp, resultado.
- Drafts criados pelo Hermes carregam `origem='hermes'` para o Wandson saber que a proposta veio do copiloto.
- Custo de tasks disparadas entra no rastreio de custo de IA existente (`custos`/`agent_runs`).

---

## 6. Checklist de go-live (ordem obrigatória)

1. [ ] 🔒 **GATE 0** completo (Wandson) — `docs/infra/gate0-rotacao-credenciais.md`.
2. [ ] Usuário `claudedev` + token escopado na VPS (Wandson) — `docs/infra/claude-code-vps-setup.md`.
3. [ ] Migration RBAC: papel `ceo_agent` + permissões (read amplo / write só draft). **SQL aprovado pelo Wandson antes de aplicar.**
4. [ ] Implementar tools de leitura (§3.1) primeiro; validar audit em cada uma.
5. [ ] Implementar `cd_propor_draft` reusando `drafts_deli`; provar que Hermes **não** consegue aprovar.
6. [ ] Teste de isolamento: Hermes não lê segredo nenhum; não muta tabela cliente-facing direto.
7. [ ] Só então ligar o gateway root→`claudedev` e habilitar no Hermes.

> **Resumo p/ o Tracker:** o design (este doc) é a parte **não-gated** de T4·3B e está pronto para revisão. Os passos 1–2 e 7 são do Wandson (VPS/credenciais); 3 precisa do `ok` do SQL. **T4 não fecha sem o GATE 0.**
