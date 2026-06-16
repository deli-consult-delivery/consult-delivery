# VendaERP — Fase 2 (escrita com confirmação no Telegram)

**Data:** 2026-06-14 · **Épico:** `dazzling-stream` · **Status:** APROVADO (design) · **Branch:** `wandson/vendaerp-fase2-escrita`

Plano-pai: `/root/.claude/plans/preciso-fazer-a-integra-o-dazzling-stream.md`
Fase 1 (leitura) já em produção e verificada live (PR #398, GATE 0 sessão 52).

---

## 1. Objetivo

Habilitar **operações de escrita** no VendaERP através do Hermes (Telegram), com **confirmação em 2 etapas** ("confirma? sim/não") mediada pelo agente. Toda mutação no ERP passa pelo Bridge (ponto único de contato e credencial). Decisão do Wandson (2026-06-14): **todas** as operações de escrita são habilitadas, porque a confirmação é o gate de risco — o mecanismo é uniforme, então cada operação nova fica barata depois do padrão pronto.

**Não-objetivos (YAGNI):**
- Tela no Console v2 para propostas de escrita → fast-follow opcional (decidido: MVP é Telegram+Bridge).
- Gate humano fora do agente (botão Telegram nativo / aprovação no painel) → fora de escopo (rejeitado em favor das 2 tools no MCP).
- Multi-tenant em runtime → continua Fase 3 (a tabela já nasce tenant-scoped).

---

## 2. Arquitetura — fluxo propor → confirmar

```
Telegram → Hermes (agente) → erp_propor_<op> (MCP)
        → INSERT vendaerp_proposals {status:'pending', token, expires_at: now()+10min, endpoint, method, payload, resumo}
        → retorna {proposal_id, resumo legível}

Agente mostra o resumo no Telegram: "Vou <ação> — <resumo>. Confirma? (sim/não)"

Usuário: "sim" → agente → erp_confirmar(proposal_id) (MCP)
        → valida (existe · status=='pending' · não expirada · uso único)
        → POST {BRIDGE_URL}/api/vendaerp/<op> (x-internal-token)  → ERP grava
        → UPDATE proposal {status:'executed', executed_at, resultado}  → retorna resultado
```

**Por que isto não toca o gateway Python (`/root/hermes-agent/`):** o que faz o agente *propor → perguntar → confirmar* é a **descrição da tool** `erp_propor_*`, que instrui explicitamente: "esta tool NÃO executa nada; ela cria uma proposta PENDENTE. Mostre o `resumo` ao usuário e só chame `erp_confirmar` com o `proposal_id` retornado APÓS um 'sim' explícito do usuário. Nunca chame `erp_confirmar` sem confirmação." O agente (Claude no Hermes) segue a descrição. O wrapper de auditoria do `server.js` já grava `audit_log` nas duas chamadas automaticamente.

---

## 3. Modelo de consentimento (postura honesta)

Neste modelo, **quem media o "sim" é o agente** (Claude, auditado em toda chamada). O `token` + `expires_at` + uso-único protegem contra **dupla execução** e **proposta velha** — **não** contra um agente malicioso. Para ações fiscais irreversíveis, se um dia for preciso um gate humano duro (fora do agente), pluga-se o painel/botão depois. Para o MVP, o agente é o mediador + auditoria completa em `audit_log` e `vendaerp_proposals`.

---

## 4. Dados — `supabase/migrations/20260614_002_vendaerp_proposals.sql` (aditivo/reversível)

Nova tabela `vendaerp_proposals` (estado pendente de confirmação):

| Coluna | Tipo | Nota |
|---|---|---|
| `id` | uuid PK default gen_random_uuid() | serve de `proposal_id` |
| `tenant_id` | uuid NOT NULL REFERENCES tenants(id) | Fase 1 = tenant CD; pronto p/ Fase 3 |
| `tipo` | text NOT NULL | `oportunidade` \| `lancamento` \| `boleto` \| `nfe` \| `estoque` |
| `endpoint` | text NOT NULL | rota do Bridge a chamar no confirmar (ex. `/api/vendaerp/lancamento`) |
| `http_method` | text NOT NULL default 'POST' | |
| `payload` | jsonb NOT NULL | corpo a enviar ao Bridge/ERP |
| `resumo` | text NOT NULL | linha legível mostrada ao usuário no Telegram |
| `status` | text NOT NULL default 'pending' | CHECK in (`pending`,`confirmed`,`executed`,`failed`,`expired`,`cancelled`) |
| `token` | text NOT NULL | uso único (gerado no propor) |
| `origin` | text NOT NULL default 'hermes' | espelha `agent_drafts.origin` |
| `expires_at` | timestamptz NOT NULL | `now() + interval '10 minutes'` |
| `executed_at` | timestamptz | |
| `resultado` | jsonb | resposta do ERP no sucesso |
| `erro` | text | mensagem no fracasso |
| `created_by` | text | `User` do MCP |
| `created_at` | timestamptz NOT NULL default now() | |

- **RLS** habilitada; policy SELECT por `is_member_of(tenant_id)` (molde `20260426_evolution_chat.sql`). O MCP usa service key (bypassa RLS); o Console (futuro) lê via RLS.
- Índice parcial `idx_vendaerp_proposals_pending` em `(tenant_id, status)` WHERE `status='pending'`.
- **Aplicação autônoma (D5 v3):** SQL versionado em git antes · 1 arquivo · output bruto · parar no 1º erro · teste de isolamento RLS.

---

## 5. MCP — `vendaerp-mcp/src/registry.js` `writeTools`

**Tools `erp_propor_<op>`** (uma por domínio — cada uma com Zod `inputShape` próprio para validar o payload). Cada handler: valida args → monta `{endpoint, http_method, payload, resumo}` → `INSERT vendaerp_proposals (status='pending')` → retorna `{ summary, tenantIds, data:{ proposal_id, resumo, expires_at } }`. **Nunca executa.**

| Tool | Domínio | Endpoint-alvo (a confirmar no swagger) |
|---|---|---|
| `erp_propor_oportunidade` | CRM | `POST /api/vendaerp/oportunidade` |
| `erp_propor_lancamento` | Financeiro | `POST /api/vendaerp/lancamento` |
| `erp_propor_boleto` | Financeiro | `POST /api/vendaerp/boleto` |
| `erp_propor_nfe` | Fiscal | `POST /api/vendaerp/nfe` |
| `erp_propor_estoque` | Estoque | `POST /api/vendaerp/estoque-ajuste` |

> ⚠️ **Anti-alucinação (anti-padrão #2):** o caminho/payload exato de cada endpoint de escrita do VendaERP **será verificado contra o swagger live do ERP antes de escrever a função correspondente**. Se algum domínio não expuser escrita na API, a tool é cortada do escopo (a máquina propor/confirmar é endpoint-agnóstica, então o corte é local).

**Tool genérica `erp_confirmar(proposal_id)`**: lê a proposta → valida (`status=='pending'`, `now() < expires_at`, não executada) → `POST` no `endpoint` guardado com o `payload` (opaco — sem lógica por tipo) → `UPDATE` para `executed`/`failed` → retorna resultado. Se expirada, marca `expired` e instrui o usuário a propor de novo.

`readTools` permanecem **intactas**.

---

## 6. Bridge — escrita

- Novas funções em `bridge-server/lib/vendaerp.js` (uma por endpoint de escrita), usando `erpFetch` com `method:'POST'`.
- **Correção crítica — sem retry em escrita:** as funções de escrita **não** usam `withRetry` em 5xx/timeout (POST não-idempotente → retry duplicaria registro no ERP). Em timeout/5xx → falha fechada; `erp_confirmar` marca a proposta `failed` e o agente avisa "não confirmei a gravação — verifique no ERP". Apenas 429 pode reesperar, com cautela.
- Novas rotas `POST /api/vendaerp/<op>` em `bridge-server/routes/vendaerp.js`, mesmo middleware `requireJwtOrInternal`.

---

## 7. Verificação (output bruto obrigatório — QA Mandato)

1. **Migration:** aplicar `20260614_002_vendaerp_proposals.sql` → output bruto + teste de isolamento RLS (membro vê / não-membro não vê).
2. **Offline smoke** (`vendaerp-mcp`): writeTools sobem; `erp_confirmar` **recusa** proposta inexistente / expirada / já-executada; nenhuma tool executa sem proposta válida.
3. **Live (op reversível):** `erp_propor_oportunidade` (ou `erp_propor_estoque` revertível) → `erp_confirmar` contra o ERP real → output bruto do resultado + linha `executed` em `vendaerp_proposals` + linha em `audit_log` (`action='mcp:erp_confirmar'`, `metadata->>'ok'`=true).
4. **Console (frontend):** N/A nesta fase (sem tela).

---

## 8. Passos manuais do Wandson (GATE 0 — não-bloqueante p/ código)

- Nenhum secret novo (o Bridge já tem as credenciais do ERP da Fase 1).
- ⚠️ O gateway do Hermes só carrega as tools novas num **start limpo**: `systemctl restart hermes-gateway` + **sessão nova** do @DeliConsultBot para o teste E2E.
- Pendência herdada da Fase 1 ainda aberta: **rotacionar o `VENDAERP_TOKEN`** (vazou em texto plano).

---

## 9. Critérios de aceite

- [ ] `vendaerp_proposals` aplicada com RLS testada (isolamento provado).
- [ ] writeTools registradas; `readTools` inalteradas; smoke offline passa (confirmar recusa propostas inválidas).
- [ ] Cada `erp_propor_*` tem endpoint/payload verificado contra o swagger do ERP (ou cortado se inexistente).
- [ ] Escrita no Bridge **não** faz retry em 5xx/timeout.
- [ ] Teste live de uma op reversível: proposta `pending` → `executed`, com output bruto + `audit_log`.
- [ ] Tracker + log + memória atualizados; PR aberto a partir de `wandson/vendaerp-fase2-escrita`.
