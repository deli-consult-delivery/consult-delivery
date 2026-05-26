# PRD Sprint 2 — Combustível
Versão: 1.0 | Data: 2026-05-25 | Horizonte: D31–D60
Autor: Wandson Silva (CEO) | Status: APROVADO

---

## 1. FOCO DO SPRINT

**Combustível = Conteúdo + Prospecção.**

Sprint 1 entregou a fundação (DELI, BRENO, Contratos, Onboarding, Re-contratação).
Sprint 2 ativa o motor de crescimento: LARA publica conteúdo didático sobre food service 3×/semana;
SOFIA prospecta leads qualificados diariamente no Maps + iFood + Instagram.

---

## 2. ESCOPO TRAVADO (30 dias D31–D60)

| Goal | Agente | Entrega principal | Métrica D60 |
|------|--------|-------------------|-------------|
| S2-G01 | LARA | 3 posts/semana auto-gerados → Wélida revisa → publica | 12 posts publicados em 30 dias |
| S2-G02 | SOFIA | Scan diário + score qualificação + lista pra Wandson | 100 leads qualificados no banco |
| G06 | VPS | Hardening: fail2ban + branches stale + tenants seed + views migration | 0 branch stale; views em migration |

---

## 3. AGENTES

### LARA — Conteúdo Editorial
- **Função:** gera rascunhos de posts Instagram/LinkedIn sobre delivery e food service
- **Fluxo:** cron seg/qua/sex 9h BRT → gerador → draft → Wélida revisa no painel → aprova → publicado
- **Tom Wélida:** didático, food service, anti-churn (delivery é jogo longo prazo, não sprint)
- **Estilo:** sem jargão técnico, linguagem próxima ao dono de loja, stories com dados reais
- **Sem auto-post:** NUNCA publica sem aprovação de Wélida (mesmo canal `painel`)

### SOFIA — Prospecção Automática
- **Função:** SDR digital, prospecta lojas food service com perfil Automação IA
- **Perfil ideal:** loja R$80k+/mês, tecnologia (iFood Premium/Pro), dono engajado (posts ativos)
- **Fontes:** Google Maps por cidade (config por tenant), cross-ref iFood + Instagram
- **Score 1–10:** Claude analisa dados + critérios IA Growth → score + justificativa
- **Fluxo:** cron dia útil 9h BRT → scan → score → lista pra Wandson no painel (Semáforo Amarelo)

---

## 4. MÉTRICAS D60 COM SQL DE ACEITE

### LARA — 12 posts publicados

```sql
-- Aceite: ≥12 posts em content_published nos últimos 30 dias
SELECT COUNT(*) AS posts_publicados
FROM content_published
WHERE published_at >= NOW() - INTERVAL '30 days'
  AND tenant_id = '<tenant_consult>';
-- Critério: posts_publicados >= 12
```

### SOFIA — 100 leads qualificados

```sql
-- Aceite: ≥100 leads com score ≥6 inseridos nos últimos 30 dias
SELECT COUNT(*) AS leads_qualificados
FROM leads
WHERE score >= 6
  AND created_at >= NOW() - INTERVAL '30 days'
  AND tenant_id = '<tenant_consult>';
-- Critério: leads_qualificados >= 100
```

### Pipeline — crescimento 5→15 leads/mês em CRM

```sql
-- Aceite: ≥15 leads com status='crm' no mês
SELECT COUNT(*) AS no_crm
FROM leads
WHERE status = 'crm'
  AND created_at >= DATE_TRUNC('month', NOW())
  AND tenant_id = '<tenant_consult>';
-- Critério: no_crm >= 15
```

---

## 5. ARQUITETURA

### Motor compartilhado
Ambos usam `src/agents/shared/runtime.ts` (existente pós-S1).
- `executeAgent(agentId, payload, ctx)` — chama Anthropic via runtime
- `getPrompt(agentId, tenantId)` — lê de `agent_prompts`
- `logRun(params)` — escreve em `agent_runs`

### Isolamento — sem colisão de namespaces
```
src/agents/lara/   → gerador.ts + prompt.md
src/agents/sofia/  → prospeccao.ts + prompt.md
trigger/lara/      → lara-gerar-conteudo.ts
trigger/sofia/     → sofia-prospect.ts
src/screens/Lara/  → UI editorial
src/screens/Sofia/ → UI prospecção
```

### Tabelas novas
- `content_calendar` / `content_drafts` / `content_published` (LARA)
- `leads` (SOFIA)
Toda tabela: `tenant_id NOT NULL` + RLS via `tenant_members`.

---

## 6. DEPENDÊNCIAS

| Dependência | Status | Observação |
|-------------|--------|------------|
| `src/agents/shared/runtime.ts` | ✅ existe | Motor único pós-S1 |
| `agent_prompts` (tabela) | ✅ existe | Criada em S1-G01.2 |
| `agent_runs` (tabela) | ✅ existe | Log padrão |
| `tenants` (tabela) | ✅ existe | tenant_id FK |
| `tenant_members` (tabela) | ✅ existe | RLS base |
| Bridge Server VPS | ✅ existe | endpoints novos a criar |
| Trigger.dev cloud | ✅ existe | deploy via `npx trigger.dev@4.4.6 deploy` |

---

## 7. PADRÕES NÃO NEGOCIÁVEIS (herdados do PRD Master)

1. Todo agente usa `runtime.executeAgent()` — sem Anthropic SDK direto
2. Toda tabela nova: `tenant_id NOT NULL` + RLS policy
3. Toda task Trigger.dev: InputSchema Zod + OutputSchema Zod + `logAgentRun()`
4. `throw` apenas dentro do `run()` — nunca no topo do módulo
5. Smoke E2E obrigatório antes de declarar sub-goal concluído
6. Nenhum agente envia mensagem a cliente sem draft + aprovação

---

## 8. RISCOS S2

| Risco | Probabilidade | Mitigação |
|-------|-------------|-----------|
| Google Maps sem API key / rate limit | Média | Usar Places API com key em Infisical; fallback: só iFood |
| LARA gera conteúdo off-brand | Baixa | Wélida revisa 100% antes de publicar; sem auto-post |
| Wélida não revisa (gargalo humano) | Média | Dashboard com contador de drafts pendentes; notif Telegram |
| Score SOFIA subjetivo | Média | Critérios explícitos no prompt + justificativa obrigatória |

---

*PRD Sprint 2 — Combustível | 2026-05-25*
