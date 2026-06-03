# CONSULT DELIVERY — CLAUDE.md
Última revisão: 2026-05-24 | Status: APROVADO

## MEMÓRIA — LER PRIMEIRO

Ler antes de qualquer sessão:
- `memory/vps-infra.md` — VPS, PM2, Bridge Server, repos
- `memory/bom-dia-feature.md` — Feature BomDia, diagnóstico
- `docs/deli-memory/` — contexto acumulado (recon/, tech-debts/, decisions/, principles/)

Ao descobrir algo não-óbvio sobre infra/config/decisões → atualizar `memory/` e commitar. Sem pedir permissão.

⚠️ DOC AUTORITATIVO: `RESTRUCTURE.md` (raiz). Em divergência com este CLAUDE.md, o RESTRUCTURE.md vence.

---

## EVONEXUS-REPLICA — PLANO MESTRE (contrato de execução)

> Plano para replicar o **feature-surface do EvoNexus NATIVO** na CD (multi-tenant). Doc completo: **`docs/evonexus-replica/PLANO-MESTRE.md`** — CHECKLIST MESTRE (todas as telas), 5 peças de framework, FASES 0-4 com 🛑 CHECKPOINTS. Ler antes de qualquer build deste tema. **Nada de tela pulada em silêncio — o checklist é o contrato de completude.**

- **Não viola a proibição de EvoNexus.** O proibido é o *motor/produto* EvoNexus em prod (CLAUDE.md acima, RESTRUCTURE §3.3). Aqui re-implementamos o *paradigma* na stack CD. EvoNexus = referência de features, nunca dependência em runtime.
- **3 conflitos a resolver no CHECKPOINT 0** (não codar do jeito do prompt sem decisão): **(D1)** runtime = `@anthropic-ai/sdk` (NÃO `@anthropic-ai/claude-agent-sdk` — RESTRUCTURE §3.3 linha 100: não roda em Trigger.dev cloud); **(D2)** Trigger.dev **v4.4.5+** (não v3); **(D3)** FASE 0 (ler código EvoNexus) precisa do lab `/root/cd-evonexus-lab` na VPS — não acessível deste Windows.
- **Reusar, não recriar:** `agents` já tem `tenant_id` + RLS (`agents_tenant_isolation`); `agent_runs`, `agent_memories`, `tenant_agent_config`, `roles`/`role_permissions`, `audit_log` já existem → estender via `ALTER ADD COLUMN IF NOT EXISTS`.
- **Build é gated:** parar em cada 🛑 CHECKPOINT (Wandson aprova). Plano persistido em 2026-06-02; FASE 0 ainda não iniciada.

---

## STACK OFICIAL (não mudar sem decisão formal)

| Camada         | Tecnologia                                      |
|----------------|-------------------------------------------------|
| Frontend       | React 18 + Vite + TailwindCSS                   |
| Banco          | Supabase (czyanilrverorwenikqw) — auth + RLS     |
| Orquestrador   | Trigger.dev cloud (proj_slexhoelcjwgbopmbzzr)   |
| Runtime agente | @anthropic-ai/sdk + web_search_20250305          |
| Validação      | Zod                                             |
| Bridge Server  | Node.js/Express VPS 187.127.25.24:3001 (systemd)|
| WhatsApp       | Evolution API                                   |
| Payment        | Asaas                                           |
| Secrets        | Infisical 172.18.0.3:8080                       |
| Deploy         | GitHub Actions → GitHub Pages                   |
| Domínio        | app.consultdelivery.com.br                      |

**NÃO USAR (proibido):** n8n, OpenClaw, EvoNexus, Lovable, Vercel, OpenSpec  
**Em avaliação (não usar em prod):** EvoNexus (POC em evonexus.evolutionfoundation.com.br)

OpenClaw: containers rodando na porta 18789 hospedando agentes da EvoNexus (POC). Nenhum agente do consult-delivery depende dele.

---

## INFRA

```
VPS: 187.127.25.24 — Ubuntu 24.04 — Node.js v22.22.2
Bridge Server: porta 3001, systemd persistente
Trigger.dev: proj_slexhoelcjwgbopmbzzr (hello-world validado)
Infisical secrets: ANTHROPIC_API_KEY, TRIGGER_SECRET_KEY, HEYGEN_API_KEY
GitHub: github.com/deli-consult-delivery/consult-delivery
SSH alias: ver memory/vps-infra.md
```

Deploy: `npx trigger.dev@4.4.6 deploy` na raiz (Trigger.dev)  
Deploy frontend: push em main → GitHub Actions → GitHub Pages (~3 min)  
VPS Bridge: `git pull && pm2 restart bridge-server` (ver memory/vps-infra.md)

---

## EQUIPE

- **Wandson Silva** — CEO, único dev, aprova decisões
- **Eduardo** — atendimento e suporte (role: `atendimento`)
- **Wélida** — marketing e CRM (role: `marketing`)
- **DELI** — COO digital, agente IA (Trigger.dev)

Emails: @consultdelivery.com.br | Bot Telegram: @DeliConsultBot (analista-ifood)

---

## AGENTES

| Agente | Função                        | Status              |
|--------|-------------------------------|---------------------|
| DELI   | COO digital, orquestradora    | Fase 1E (Trigger.dev)|
| LARA   | CRM food service + régua      | scaffolded          |
| VERA   | BI e relatórios               | scaffolded          |
| BRENO  | atendimento e suporte         | scaffolded          |
| CORA   | cobrança inteligente          | POC                 |
| SOFIA  | SDR/prospecção                | futuro              |
| MAX    | consultor técnico             | futuro              |

**DELI:** COO, não chatbot. Monitora tudo, aciona especialistas, semáforo Verde/Amarelo/Vermelho. NUNCA responde clientes.  
**Todo agente novo → `trigger/` (Trigger.dev).** Nunca OpenClaw/n8n/EvoNexus.

LARA refs: `docs/fluxos/lara-regua.md` | `bridge-server/docs/lara-endpoints.md` | `supabase/migrations/20260506_001_lara_regua.sql`

---

## SEMÁFORO DELI

- **Verde** → DELI executa e reporta
- **Amarelo** → DELI propõe, Wandson aprova com `ok`
- **Vermelho** → aprovação explícita `APROVADO VERMELHO apr-xxx`

---

## PADRÃO TASK TRIGGER.DEV (seguir sempre)

```typescript
export const minhaTask = task({
  id: "agente-acao",
  retry: { maxAttempts: 3 },
  run: async (payload, { ctx }) => {
    const input = InputSchema.parse(payload);
    // lógica
    await logAgentRun({ runId: ctx.run.id, agentId: "...", status: "ok" });
    return OutputSchema.parse(result);
  }
});
```

- Zod: todo input/output tem schema. Nomenclatura: `PascalCase + Input/Output` (ex: `DeliConversaInput`)
- Modelo padrão: `claude-sonnet-4-6` | wrapper: `trigger/_shared/claude.ts`
- ⚠️ **Nunca `throw` no topo do módulo** — derruba o worker inteiro. Env vars em lazy getter (`getSupabase()`).
- ⚠️ **`additionalFiles`** no `trigger.config.ts` se o task importar arquivos fora de `trigger/`.

---

## PADRÃO MIGRATION

```
Arquivo: supabase/migrations/YYYYMMDD_NNN_descricao.sql
```

- Toda tabela nova: `tenant_id uuid NOT NULL REFERENCES tenants(id)` + RLS policy.
- **Nunca rodar sem mostrar SQL e ter aprovação.** Migration é irreversível em produção.
- Padrão P1: não usar `.select('coluna_que_nao_existe')` — erro silenciado, data = null.

---

## RBAC

Schema: `supabase/migrations/20260504_001_rbac.sql`  
Papéis: `admin`, `dev`, `marketing`, `atendimento`, `financeiro`, `viewer`, `deli_owner`  
React: `<RequireRole resource="x" action="y">` | Bridge: `requireAgentAccess` middleware  
Toda ação logada em `audit_log`.  
→ detalhes: `docs/deli-memory/principles/rbac-roles.md`

---

## MEMÓRIA CENTRAL DOS AGENTES

Schema: `supabase/migrations/20260504_002_memoria_central.sql`  
Tabelas: `lojas`, `client_facts` (key-value por loja), `client_timeline` (imutável), `loja_metricas`  
Agentes leem contexto ANTES de agir. Escrevem fatos novos DEPOIS. Nunca em VPS/files.  
→ detalhes: `docs/deli-memory/principles/agent-memory.md`

---

## WHATSAPP

Schema: `supabase/migrations/20260504_003_whatsapp.sql` | Edge Function: `evolution-webhook`  
DELI monitora mas NUNCA responde cliente. Agentes agem só quando @mencionados.  
Evolution API lenta/instável → usar Supabase como fonte primária (QA Pattern P3).  
→ detalhes: `docs/deli-memory/principles/whatsapp-model.md`

---

## DRAFTS

Schema: `supabase/migrations/20260504_004_drafts_deli.sql`  
**Nenhum agente envia mensagem a cliente sem aprovação.** Fluxo: draft → notifica humano → aprova/rejeita → sistema envia.  
Exceção: `channel = 'telegram_interno'` ou `'painel'` → vai direto (é para equipe interna).

---

## GIT

```bash
git branch --show-current          # verificar branch SEMPRE ao iniciar sessão
git checkout -b wandson/nome       # NUNCA commitar direto em main
git push -u origin wandson/nome
gh pr create --base main
gh pr merge --squash --delete-branch
```

Se estiver em `main`: PARAR e pedir branch ao usuário.  
→ fluxo completo da equipe: `docs/deli-memory/principles/git-workflow.md`

---

## QA MANDATO

**Nunca declarar "feito" sem output bruto** (SQL executado, JSON retornado, print do run).

Após push:
1. Aguardar ~3 min (GitHub Actions → GitHub Pages)
2. `bash scripts/qa-run.sh --no-build`
3. Confirmar bundle hash: `curl -s https://app.consultdelivery.com.br/ | grep -o '"[^"]*\.js"' | head -1`

Antes de investigar bug → `scripts/qa-knowledge.md` (bugs já resolvidos, padrões).  
Após resolver bug → atualizar `scripts/qa-knowledge.md`.

Padrões conhecidos: P1 colunas inexistentes `.select()` | P2 build local ≠ prod | P3 Evolution API lenta | P4 RLS bloqueando query.

---

## ANTI-PADRÕES (viola = defeito grave)

1. Declarar "feito" sem rodar de verdade → output bruto obrigatório sempre
2. Confiar em memória p/ nomes de pacotes/APIs → validar em node_modules ou docs
3. Feature sem critério de aceite → definir antes de implementar
4. `throw` no topo de módulo Trigger.dev → lazy getter para env vars
5. Agente sem gargalo real mapeado → dor mensurável com critério de aceite
6. Pular validação entre fases → cada fase tem critério, não há pulo
7. Agente novo fora de `trigger/` → proibido (OpenClaw/n8n/EvoNexus fora da stack)
8. Commit direto em main → sempre branch + PR
9. Migration sem aprovação do SQL → mostrar SQL, aguardar ok
10. Confiar no resultado do Claude sem teste manual → 1 teste + log/output real

---

## SKILLS

- **GSD:** `/gsd-discuss-phase` antes de implementar | `/gsd-code-review` antes de PR | `/gsd-complete-milestone` ao fechar fase
- **Graphify:** consultar `graphify-out/graph.json` antes de reler arquivos do zero — economiza tokens
- **Wiki-Brain:** `WikiBrain/wiki/` para metodologia e decisões anteriores. Todo fim de sessão → append em `WikiBrain/log.md`

---

## DIAGRAMAS

- **Formais (time):** Mermaid em `docs/fluxos/` — versionado, renderiza no GitHub
- **Rascunhos:** Excalidraw (WikiBrain/Obsidian) → PNG/SVG em `docs/rascunhos/` se quiser commitar

Arquivos: `docs/fluxos/arquitetura.md` | `docs/fluxos/analise-ifood.md` | `docs/fluxos/lara-regua.md`

---

## ÍNDICE docs/deli-memory/

| Arquivo                                    | Conteúdo                                     |
|--------------------------------------------|----------------------------------------------|
| `principles/git-workflow.md`               | fluxo git detalhado da equipe                |
| `principles/rbac-roles.md`                 | papéis e permissões completos                |
| `principles/whatsapp-model.md`             | modelo WhatsApp (JIDs, agentes, DELI)        |
| `principles/agent-memory.md`               | Memória Central (client_facts, timeline)     |
| `decisions/stack-history.md`               | histórico de decisões de stack (Fase 0)      |
| `decisions/clickup-vision.md`              | referência UX ClickUp                        |
| `decisions/drive-folders.md`               | IDs de pastas Google Drive                   |
| `recon/SUMMARY.md`                         | inventário S1-G00: agentes, schema, broken   |
| `tech-debts/td-index.md`                   | TD#36–TD#55                                  |
