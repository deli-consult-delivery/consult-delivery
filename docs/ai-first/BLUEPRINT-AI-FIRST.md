# BLUEPRINT AI-FIRST — Consult Delivery
Versão: **2 (2026-06-28)** | Status: **APROVADO** (plano-mestre Hermes-first aprovado pelo Wandson)
Autor: sessão Claude | Modelo de redação: claude-opus-4-8[1m]
Validação: verificação adversarial (23 claims técnicos do Hermes, 37 achados de arquitetura/segurança) — correções incorporadas.

> **Doc autoritativo de visão AI-First.** Estende `PLANO-MESTRE.md` (raiz) e respeita `RESTRUCTURE.md`. Em divergência: RESTRUCTURE > PLANO-MESTRE > este blueprint. A v2 reenquadra a v1 sobre o **Hermes Agent (Nous Research)** como runtime, mantendo a máquina de estados do loop (agora confirmada como **estado no Supabase = fonte única**).

---

## 0. O que mudou da v1 → v2

A v1 modelava o AI-First como "1 cérebro (DELI) + 1 loop + 1 tela" **dentro da plataforma CD** (Trigger.dev/Supabase/React), com o Hermes como copiloto-CEO no Telegram. A v2 reenquadra: **"Hermes" = Hermes Agent (Nous Research)**, runtime self-hosted (concorrente do OpenClaw) já na VPS como `hermes-gateway`. A estratégia do Wandson: **montar toda a organização de agentes dentro do Hermes primeiro e, depois, integrar progressivamente à plataforma CD** o que fizer sentido.

A v1 continua válida onde descreve a **máquina de estados do loop** (§3) — ela é agora a **fonte única da verdade no Supabase** (decisão D11), e o Hermes a lê/escreve via MCP. As migrations `20260624_003_loop_core` / `20260624_004_pipeline_live` **já cabearam** esse loop no banco.

---

## 1. Visão

> Consult Delivery **AI-First**: a **DELI** (agente principal/orquestradora) comanda um time de **especialistas** (acionáveis individualmente), tudo rodando dentro do **Hermes Agent**. Especialistas atendem clientes no WhatsApp; o que não resolvem vira **tarefa** num loop com estado no Supabase, é **executado** no sistema externo via **MCP**, **verificado** por um agente revisor, e **volta ao cliente** sempre via draft + aprovação (semáforo). O **CEO comanda** o Hermes (Telegram/Console) e **autoriza demandas** que o cliente pediu.

### Decisões travadas
| # | Decisão |
|---|---------|
| AF-1..6 | (v1) blueprint primeiro · Ernesto = DELI · Telegram primeiro · loop primeiro · reusar tudo · motor EvoNexus proibido (só paradigma) |
| **D1** | Hermes (Nous) = runtime/cérebro; **DELI = orquestradora** |
| **D10** | Lógica nativa no Hermes (persona/skills/orquestração) + **sistemas via MCP** |
| **D11** | **Supabase = fonte única do estado do loop**; Kanban do Hermes = cache descartável |
| **D12** | **GATE de segurança P0 bloqueante** antes de expandir a org |
| **D7** | SaaS multi-tenant desde o design · **D8** um agente por função · **D6** verificação por agente revisor + CEO no risco |

---

## 2. Correções técnicas do Hermes (verificadas em docs primárias)

- **Roteamento (Kanban):** board SQLite (`~/.hermes/kanban.db`) roteia entre profiles via **LLM decompositor** que lê as **descrições textuais** dos profiles → grafo de tarefas JSON. `hermes profile describe --text/--auto` **define** a descrição; não é o mecanismo de seleção. Roteamento é **não-determinístico (LLM)**.
- **Skills:** `~/.hermes/skills/<categoria>/<skill>/SKILL.md`; `requires_toolsets`/`category`/`tags`/`config` sob **`metadata.hermes`** (só `name`/`description` no topo).
- **terminal.backend:** `local|docker|ssh|modal|daytona|singularity` (6).
- **Canais:** ~21; WhatsApp via bridge **Baileys não-oficial** (WhatsApp Web, não Business API). **`require_mention` é só do Telegram** (controle de grupo WhatsApp = feature request aberto, issue #7992).
- **Deploy:** Node v22; config `~/.hermes/`; **existe** `hermes gateway install` (systemd/launchd).
- Confirmados: profiles persistentes (`hermes profile create`, isolam SOUL.md/skills/memória/mcp.json), `hermes -p <nome> chat -q`, `delegate_task` efêmero, MEMORY.md/USER.md bounded + episódica `state.db` FTS5, `hermes mcp add/serve`, OAuth 2.1, `approvals.mode manual|smart|off`, checkpoints shadow-git.

---

## 3. Arquitetura central (síntese D10/D11)

| Camada | Onde mora | Portável p/ plataforma CD? |
|---|---|---|
| Persona/identidade/tom | Nativo Hermes (`SOUL.md`) | Não — **descartável** (reescreve persona) |
| Skills = playbook de persona/tom | Nativo Hermes (`SKILL.md`) | Não — descartável; **proibido conter regra de negócio** |
| Memória política/working | Nativo Hermes (`MEMORY.md`/`state.db`) | Não — descartável; **dado de negócio nunca aqui** |
| Orquestração em runtime | Nativo Hermes (Kanban **efêmero**) | Não — cache, **não** system-of-record |
| **Estado do loop** (loop_status/loop_state/execution_result/autorização) | **Supabase** (via MCP) | ✅ **Fonte única (D11)** |
| **Roteamento** (quem→quem) | **Dado no Supabase** (`agents`/`tenant_agents` + capacidades; `profile describe` é **gerado** disso) | ✅ consumido por Hermes **e** Trigger.dev |
| **Ações reais** (Supabase/iFood/Asaas/VendaERP/WhatsApp) | **MCP → Bridge → sistema** | ✅ **Bridge = API estável**; MCP é wrapper |
| Execução pesada/determinística | Trigger.dev (via MCP) | ✅ |
| Dado de negócio | Supabase (via MCP) | ✅ |

**Lock-in (honestidade):** config-como-código mitiga lock-in de **infra** (recriar a VPS), **não** de **plataforma**. O anteparo real ao lock-in de plataforma é manter **estado/decisões/ações fora do Hermes** (Supabase+Bridge); persona/skill são camada descartável. **O orquestrador será reescrito na integração** — por isso roteamento vira **dado** e o roteador-LLM é isolado como **um classificador de intenção reutilizável** (chamável por Hermes e Trigger.dev), com decisões logadas em `audit_log`.

---

## 4. Máquina de estados do loop (v1, agora canônica no Supabase)

```
cliente escreve (WhatsApp PV/grupo)
  → resolução de identidade (PV: telefone→loja · grupo: remetente→loja · tratar client_id=null)
  → ATENDIMENTO (conversations.loop_status='attending')  especialista lê contexto (client_facts/timeline via MCP)
      ├─ resolve agora ─────────────────────────────────────────────┐
      └─ exige execução real → AUTORIZAÇÃO (fluxo C, ver §5)         │
            → TAREFA (client_tasks.loop_state='open', conversation_id↔active_task_id)
            → EXECUÇÃO (loop_state='executing', via MCP→Bridge; grava execution_run_id/execution_result)
            → VERIFICA (revisor: grounding do texto + checagem do EFEITO real reconsultando o sistema-alvo)
            → CONCLUSÃO (loop_state='done') → agent_drafts (pending)                      │
  → RESPOSTA AO CLIENTE (loop_status='replied') ◄────────────────────────────────────────┘
      semáforo: ia→envia · hibrido→aprova com `ok` · humano→trava   (gate ANTES do envio = idempotente)
      privacidade: resposta sensível (cobrança/financeiro) vai por PV mesmo se o pedido veio do grupo
```

**Regra de ouro:** o agente **nunca** envia direto ao cliente. Resposta nasce como `agent_drafts` pending; envio gated pelo modo do tenant. Exceção: `telegram_interno`/`painel`.

**Mapa modo→semáforo** (reusar `tenant_agent_config.mode`): `ia`🟢 envia · `hibrido`🟡 aprova · `humano`🔴 trava. **GATE 0 codifica isso no servidor** (hoje `autonomy_level` é só campo default 'amarelo').

---

## 5. Os três fluxos

**A. Loop do cliente** — §4 (Supabase = estado).

**B. Comando do CEO** — Wandson no Telegram/Console. Acionamento **direto** de um especialista por menção (`@cora cobre a loja X`) **vs roteado** pela DELI (desambiguar; registrar em `agent_runs` com `agent_name` correto). **Pesquisa/benchmark** (dono `sofia`/`vera`): aceite ≥3 URLs reais. **Monitoramento** (dono `vera`/`deli`, cron): heartbeats Bridge / runs falhos / inadimplência / SLA do loop → alerta proativo no Telegram.

**C. CEO autoriza demanda do cliente (NOVO):** triagem detecta pedido que exige execução real → cria `client_tasks` em **`aguardando_autorizacao_ceo`** **antes** de executar → notifica o CEO (pedido original + ação proposta + custo/risco + `proposal_id` imutável) → executa **só** após `ok` vinculado ao `proposal_id` (não a "ok" em linguagem natural) → recusa encerra sem efeito.

---

## 6. Org-chart → profiles do Hermes (um por função, D8)

Slug = chave real (`agents.id`, `agent_runs.agent_name`, profile Hermes, despachador). **Resolver os 5 novos antes da FASE 1** (decisão do Wandson):

| Função | Slug (proposto) | MCP toolset (least-privilege) | Semáforo |
|---|---|---|---|
| Orquestração (COO) | `deli` (`role: orchestrator`) | cd-admin | — |
| Atendimento | `breno` | evolution (read+draft), cd-admin | Amarelo |
| Suporte de sistema | `max` | vendaerp (read), cd-admin | Amarelo |
| Consultoria iFood | `analista-ifood` | ifood (read), cd-admin | Verde interno |
| Marketing | `lara` | cd-admin, web | Amarelo |
| Financeiro/Cobrança | `cora` | asaas, cd-admin | **Vermelho** |
| Prospecção (SDR) | `sofia` | web, cd-admin | Amarelo |
| BI/Relatórios/Monitoramento | `vera` | cd-admin | Verde interno |
| **Verificação/QA** | `revisor` *(novo)* | cd-admin + read do sistema-alvo | gate |
| Planejamento | `pedro` *(novo, a confirmar)* | web, cd-admin | Amarelo |
| Estratégia | `estela` *(novo, a confirmar)* | web, cd-admin | Amarelo |
| Vendas/Closing | `vitor` *(novo, a confirmar)* | vendaerp, cd-admin | **Vermelho** |

**Despachador:** `admin-mcp/src/tools/cd_despachar_especialista.js` tem enum travado em 6. **Substituir por lookup em `tenant_agents`** (12) e **mover a regra para `POST /loop/despachar` no Bridge** (Hermes e Trigger.dev chamam) — tool MCP vira CRUD/RPC sem decisão.

**Config como código:** versionar em `hermes/` no repo (`config.yaml`, `profiles/<slug>/SOUL.md`, `skills/<cat>/<skill>/SKILL.md`, `mcp/*.json` sem segredo, `deploy-hermes.sh`, `gen-describe.js`). **gitleaks no pre-commit/CI** (token já vazou uma vez).

---

## 7. Plano faseado

### GATE 0 — Segurança P0 (BLOQUEANTE, D12)
**Cowork (autônomo, código):** Bridge **fail-closed** + **constant-time** ✅ (feito: `index.js` `safeTokenEqual` + boot check) · proteger endpoints de escrita VendaERP (`routes/vendaerp.js`) atrás de auth forte separada · `erp_confirmar` estrutural (confirmação out-of-band vinculada a `proposal_id`) · autorização por tenant server-side (hoje `service_role` bypassa RLS; `tenant_id` é arg livre) · auditoria fail-closed + antes do efeito · atribuição por profile no `audit_log` · semáforo codificado no servidor · threat-model prompt-injection (canal confiável CEO vs não-confiável cliente; allow-list por origem) · bind/CORS + redação PII + TTL de proposta alinhado ao SLA.
**Wandson (VPS):** root→`claudedev` · `terminal.backend: docker` · `checkpoints.enabled` · `approvals.mode: manual` · **rotacionar `VENDAERP_TOKEN`** (vazado) · 2 comandos que ligam `cd-admin` live (de-para `SUPABASE_SERVICE_KEY`↔`SUPABASE_SERVICE_ROLE_KEY`).
**Aceite:** Bridge nega sem token; escrita exige auth forte; `erp_confirmar` não executa sem confirmação out-of-band; cross-tenant negado; Hermes não-root; `hermes mcp list` mostra cd-admin+vendaerp; gitleaks verde.

### FASE 1 — Roteamento-como-dado + DELI + especialistas como profiles
Catálogo de roteamento no Supabase; `gen-describe.js` gera `profile describe`; `POST /loop/despachar` (Bridge) cobre os 12 slugs (lookup `tenant_agents`); criar profiles (`deli` orchestrator + 12) a partir do `hermes/` versionado; **teste de escalonamento por delegação** (profile não alcança tool fora do seu `mcp.json`).
**Aceite:** `hermes -p <12> chat` ok; despacho aceita 12 slugs; DELI roteia certo; roteamento logado em `audit_log`.

### FASE 2 — MCPs de ação (4 prioritárias) — Bridge primeiro
`ifood-mcp`, `asaas-mcp`, `evolution-mcp` (manter Evolution API, **não Baileys**), `web`. Padrão `vendaerp-mcp` (fino → Bridge; credenciais distintas/menor escopo por MCP; audit fail-closed; nenhuma escrita direta sem rota Bridge).
**Aceite:** cada ação via `hermes -p <agente>` com `run_id`/JSON em `agent_runs`; escrita só como draft pending; audit com profile correto.

### FASE 3 — Loop + fluxo C + canais (Supabase = estado)
Hermes lê/escreve `conversations.loop_status`/`client_tasks.loop_state` via MCP (Kanban=cache; contrato 1:1). Implementar fluxo C (`aguardando_autorizacao_ceo`) + VERIFICA 2 camadas. Identidade PV vs grupo + privacidade. **Contexto mínimo já aqui** (≥1 fato real da loja via MCP antes de responder).
**Aceite:** msg real percorre o loop; pedido que exige execução para em `aguardando_autorizacao_ceo` e só executa após `ok` vinculado ao `proposal_id`; revisor barra falha silenciosa; 1 envio único; `SELECT` confirma estado no Supabase.

### FASE 4 — Skills (persona) + write-back de memória
`SKILL.md` = só persona/tom; **lint no `deploy-hermes.sh`** falha se contiver valor de negócio (R$/%/prazos). **Resolver TD#52**: job Trigger.dev consolida `client_facts`/`client_timeline`/`agent_memories`; profiles stateless entre sessões exceto pelo Supabase.
**Aceite:** lint ativo; ≥1 fato consolidado a partir de interação real.

### FASE 5 — Integração com a plataforma CD (cutover testável)
Console chat/pipeline ao vivo, dashboards, onboarding multi-tenant SaaS. **Teste de equivalência + shadow:** N casos → exigir equivalência de drafts/ações entre os dois motores; plataforma roteia em shadow comparando contra o Hermes; **só desligar o Hermes quando equivalência passar**; drenar aprovações pendentes antes do cutover.
**Aceite:** harness de equivalência verde; 2º tenant isolado por RLS.

---

## 8. Guard-rails (inviolável)
- Branch sempre; nunca commit direto em `main`.
- Nenhuma mensagem a cliente sem aprovação (drafts+semáforo). Exceção: `telegram_interno`/`painel`.
- Motor EvoNexus proibido em prod — só o paradigma.
- SQL aditivo/reversível = autônomo; DDL destrutivo sobre dados reais = confirmar com o Wandson.
- **Agente nunca toca segredo** — credenciais só no env do Bridge via Infisical.
- **Revisor (LLM) é controle de qualidade, não de segurança** — efeito cliente-facing sempre gated por humano out-of-band.
- Output bruto > resumo; testar antes de declarar pronto.

## 9. Governança (Mandato Cowork D5)
- **Autônomo (Cowork), não bloqueia esperando a VPS:** estrutura `hermes/` versionada, código dos MCPs (ifood/asaas/evolution), `/loop/despachar` + despachador por `tenant_agents`, fixes de segurança do Bridge, SQL aditivo (enum de autorização, catálogo de roteamento, RBAC seed), lints/gitleaks.
- **Reservado ao Wandson:** comandos na VPS, `hermes profile create`/`mcp add`, credenciais/`service_role`/Infisical, claudedev/systemd, rotação de token, DDL destrutivo, envio a cliente.

## 10. 🛑 PRÓXIMA AÇÃO
**GATE 0 em andamento.** Feito nesta sessão: Bridge fail-closed + constant-time (`bridge-server/index.js`) + Blueprint v2. Próximo: proteger endpoints de escrita do VendaERP, `erp_confirmar` estrutural, e a estrutura `hermes/` versionada (config como código). Itens da VPS aguardam o Wandson (rotação de token, claudedev, ligar `cd-admin` live).
