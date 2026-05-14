# Consult Delivery — Reestruturação Completa

**Documento mestre — versão 1.0**
**Data:** 12/05/2026
**Autor das decisões:** Wandson Silva (CEO/Fundador)
**Status:** Aprovado para execução

---

## 0. COMO USAR ESTE DOCUMENTO

Este documento é a **fonte autoritativa** da reestruturação. Em qualquer divergência entre este doc e a memória do Claude Code (ou de qualquer agente), **vence o doc**.

- Para Wandson: leia uma vez na íntegra, depois consulte por seção quando precisar decidir algo.
- Para Claude Code: este é seu ground truth. Releia a seção relevante antes de cada tarefa.
- Para qualquer dúvida: prefira perguntar a alucinar. Output bruto > resumo confiante.

---

## 1. CONTEXTO E PROBLEMA

### 1.1 Estado atual (validado em 11/05/2026)

| Módulo | Status real |
|---|---|
| Chat Ao Vivo | ✅ Funcional, em uso interno (única coisa validada) |
| Resto da plataforma | ⚠️ Existe estrutura mas funcionalidades quebradas / não usadas |
| Plataforma em produção pra clientes | ❌ Não — apenas uso interno |
| Equipe dev | Wandson sozinho (Yasmin saiu) |
| Equipe ops | Wélida (marketing/CRM), Eduardo (atendimento) |

### 1.2 Dores que motivaram esta reestruturação

1. **Retrabalho** — features chegavam incompletas (ex: chat sem áudio funcionando, sem preview, sem reply)
2. **Stack confusa** — múltiplas ferramentas sem critério claro de quando usar cada uma
3. **Manutenção difícil** — n8n e OpenClaw são caixa-preta pro Claude Code
4. **Falta de braço humano** — consultoria saturada, precisa de IA fazendo trabalho repetitivo
5. **Alucinações de IA** — 4 alucinações sérias documentadas em poucos dias

### 1.3 Objetivo desta reestruturação

Construir uma plataforma **AI-first** onde:
- Humanos atuam só na revisão ou quando assumem manualmente
- Agentes IA fazem o trabalho repetitivo de consultoria delivery
- Stack é 100% TypeScript versionado em Git (Claude Code resolve bugs sozinho)
- Cada cliente escolhe seu modo de operação (humano / híbrido / IA pura)

---

## 2. PRINCÍPIOS NÃO-NEGOCIÁVEIS

Estes princípios se aplicam a TODA tarefa, TODA fase, TODO agente. Violar qualquer um destes é defeito grave, não estilo.

1. **Output bruto > resumo confiante.** Nunca aceitar "está pronto" sem ver o output cru (SQL, JSON, log, screenshot da execução real).
2. **Critério de aceite explícito antes de codar.** Toda task começa com lista de aceite. Sem isso, retrabalho garantido.
3. **Migrations versionadas em Git** para toda mudança de schema. Zero alteração manual no Supabase Studio.
4. **Doc autoritativo > memória do agente.** Releia este doc antes de assumir qualquer coisa.
5. **Anti-alucinação:** consulte documentação oficial / `node_modules` / código real antes de afirmar API/nome de pacote/versão.
6. **Testes mínimos por entregável:** 1 teste manual + 1 teste automatizado mínimo, antes de declarar "feito".
7. **Worktrees Git** para paralelizar trabalho (Wandson em main, Claude Code em feature/X).
8. **Sem n8n, sem EvoNexus, sem OpenClaw novo.** OpenClaw existente sai gradualmente (Fase 4).
9. **RBAC granular sempre.** Toda nova feature precisa decidir quais papéis acessam.
10. **Branches efêmeras.** Toda fase tem branch própria. Mergeia ao final, deleta.

---

## 3. STACK FINAL DEFINIDA

### 3.1 O que MANTÉM

| Camada | Tecnologia | Por quê |
|---|---|---|
| Frontend | React 18 + Vite + TailwindCSS | Estável, performante, Claude Code domina |
| Backend (DB/Auth/Realtime/Storage) | Supabase | Multi-tenant nativo, RBAC integrado |
| Edge Functions | Supabase Edge (Deno) | Para webhooks simples e jobs leves |
| Bridge Server | Node.js + Express (VPS porta 3001) | Já existe, expande |
| Hospedagem | GitHub Pages + Actions | OK pra V1/V2; migrar pra Cloudflare em V3 white-label |
| WhatsApp | Evolution API | Já configurado, funciona |
| Cobrança | Asaas | Já integrado |
| Secrets | Infisical | Já em uso |
| VPS | 187.127.25.24 (Ubuntu 24, 8GB/6vCPU) | Suficiente pra V1/V2 |
| Domínio | app.consultdelivery.com.br | Mantém |

### 3.2 O que ENTRA

| Camada | Tecnologia | Função |
|---|---|---|
| **Workflow orquestrador** | **Trigger.dev cloud** (v4.4.5+) | Substituto de n8n e OpenClaw como orquestrador. Tasks duráveis, retry, cron, composição. |
| **Runtime de agente IA** | **`@anthropic-ai/sdk`** + ferramenta `web_search_20250305` server-side | Substituto do OpenClaw para rodar agentes. Funciona em qualquer ambiente. |
| **Validação de output** | **Zod** | Schema de entrada/saída de toda task. |

### 3.3 O que SAI

| Tecnologia | Quando sai | Por quê |
|---|---|---|
| OpenClaw | Gradualmente, Fase 4 | Caixa-preta pro Claude Code, dependência de comunidade pequena |
| n8n | Nunca entrou | Decisão consciente do Wandson |
| EvoNexus | Nunca entra | UI-driven, não API-first (testado e descartado em 07/05) |
| Vercel | Já saiu | Descontinuado |
| `@anthropic-ai/claude-agent-sdk` | Não usado | Requer binário `claude` instalado — não funciona em Trigger.dev cloud |

### 3.4 Por que Trigger.dev e não outras opções

Decisão tomada após teste real em 11/05/2026 (task `pesquisa-loja` rodada com sucesso em 14.3s):

- vs **OpenClaw**: Trigger.dev faz tudo que OpenClaw faz + scheduling + retry + composição + dashboard. OpenClaw é só runtime.
- vs **Inngest cloud**: Trigger.dev tem AI Tasks nativas, melhor encaixe pra agentes long-running.
- vs **Trigger.dev self-hosted**: complexo demais agora; cloud free tier cobre V1+V2; migra pra self-hosted quando crescer.

---

## 4. ARQUITETURA AI-FIRST

### 4.1 Fluxo geral

```
USUÁRIO (web)
   ↓
Frontend React (GitHub Pages, app.consultdelivery.com.br)
   ↓ HTTP
Bridge Server (VPS, porta 3001)
   ↓ HTTP / Trigger.dev SDK
Trigger.dev Cloud (workflow orchestrator)
   ↓
Task (TypeScript) que invoca:
   ↓
@anthropic-ai/sdk → Claude (Sonnet/Haiku) + web_search_20250305
   ↓
Resultado validado por Zod
   ↓
Salvo em Supabase (audit, runs, output)
   ↓
Notifica frontend via Supabase Realtime
```

### 4.2 Tipos de fluxo

| Tipo | Quando | Exemplo |
|---|---|---|
| **Síncrono** | UI espera resposta < 30s | Cliente pergunta no chat → BRENO responde |
| **Assíncrono** | Resposta pode levar minutos | Análise iFood: usuário dispara, recebe notificação quando pronta |
| **Agendado (cron)** | Roda em horário definido | DELI revisão matinal 8h, CORA verificação cobrança diária |
| **Evento (webhook)** | Reage a evento externo | Evolution → webhook → BRENO responde WhatsApp |
| **Composto** | Agente chama agente | DELI dispara LARA (pesquisa) → recebe resultado → decide próxima ação |

### 4.3 Modo de operação (hierarquia)

Cada cliente (tenant) escolhe modo PADRÃO; cada agente pode ter override individual:

```
TENANT (cliente)
├── modo_padrao: "humano" | "hibrido" | "ia"
│
└── Agentes do tenant
    ├── Agente A: override = null  → herda padrão do tenant
    ├── Agente B: override = "humano"  → força humano mesmo se tenant for IA
    └── Agente C: override = "ia"
```

**Comportamento por modo:**

| Modo | Como funciona |
|---|---|
| **humano** | Agente NÃO age. Só sugere/rascunha. Humano aprova e executa. |
| **híbrido** | Agente age automaticamente em tarefas seguras; tarefas sensíveis pedem aprovação. |
| **IA puro** | Agente age sozinho 100%. Humano só monitora via dashboard / audit log. |

### 4.4 Acesso (RBAC)

Schema RBAC já existe (`roles`, `user_roles`, `role_permissions`, `user_agent_access`).

**Default por papel:**

| Papel | Acessa |
|---|---|
| admin (Wandson) | TUDO, incluindo DELI |
| dev | TUDO técnico, sem DELI por padrão |
| marketing (Wélida) | LARA + Campanhas + Disparos + Dashboard |
| atendimento (Eduardo) | Chat Ao Vivo + BRENO + Clientes |
| financeiro | CORA + Relatórios |
| viewer | Dashboard + Relatórios (read-only) |
| deli_owner | DELI + tudo (variante de admin) |

DELI por padrão é admin-only; Wandson libera Wélida/Eduardo quando quiser via `user_agent_access`.

---

## 5. REORGANIZAÇÃO DO MENU

Aprovado em 12/05/2026.

```
INÍCIO
├── Dashboard
└── DELI                         ← nova, CEO digital

OPERAÇÃO
├── Chat Ao Vivo
├── Clientes                     ← renomeado (era "Clientes / CRM")
└── Tarefas                      ← unifica "Tarefas" + "Tarefas Cliente" com filtro

AGENTES IA
├── Painel Agentes               ← lista todos, status, custo, runs
├── Análise iFood
├── CORA · Cobrança
├── LARA · Marketing             ← futuro (Fase 3)
├── MAX · Suporte                ← futuro (Fase 4)
└── NOVA · Automação             ← futuro (Fase 5)

MARKETING
├── Campanhas
└── Disparos                     ← renomeado (era "Régua de Disparo")

DADOS
└── Relatórios

ADMIN
├── Configurações
└── Grupos WhatsApp              ← movido (era no menu principal)
```

### 5.1 Mudanças resumidas

| Ação | Item | Detalhe |
|---|---|---|
| **Novo** | Página DELI | Chat direto com CEO digital |
| **Novo grupo** | AGENTES IA | Consolida todos os agentes |
| **Renomeia** | Régua de Disparo → Disparos | |
| **Renomeia** | Clientes / CRM → Clientes | |
| **Unifica** | Tarefas + Tarefas Cliente → Tarefas com filtro | |
| **Move** | Grupos WhatsApp → Admin | É config técnica |
| **Remove grupo** | "FINANCEIRO & IA" | CORA vai pra AGENTES IA, Relatórios vai pra DADOS |

---

## 6. ROADMAP EM FASES

Cada fase tem entrega validável em produção interna. Não se avança sem critério de aceite atingido.

### Fase 0 — Fundação Técnica (1 semana)

**Objetivo:** Preparar terreno pra Fase 1. Sem isso, qualquer feature vira retrabalho.

**Entregáveis:**
1. Trigger.dev integrado ao repo principal (estrutura `trigger/` com config e padrões)
2. Bridge Server expandido com endpoints `/agents/:slug/run` e `/agents/:slug/status`
3. Schema RBAC validado + 3 migrations novas:
   - `tenants.modo_padrao` (enum humano/hibrido/ia)
   - Tabela `tenant_agent_config` (override por agente)
   - Tabela `agent_runs` (log de execuções)
4. `CLAUDE.md` atualizado com padrões desta reestruturação
5. Padrão de comunicação Frontend ↔ Bridge ↔ Trigger.dev documentado
6. Branch `yasmin/dev` deletada após confirmar que não tem código aproveitável
7. Limpeza: 5 tenants seed removidos (pizza-joao, burger, acai, sushi, tapioca)
8. `is_active` adicionado em tabela `tenants`

**Critério de aceite:**
- [ ] `npm run dev` no Bridge sobe sem erro
- [ ] `npx trigger.dev@latest dev` conecta ao cloud no repo principal
- [ ] Migrations rodam em DB local sem erro
- [ ] Existe 1 task de exemplo "hello-world" que retorna `{ ok: true }` validada por Zod
- [ ] CLAUDE.md atualizado e commitado

**Riscos:**
- Migration mal feita pode quebrar dados existentes → testar em branch antes de mergear
- Conflito com chat ao vivo existente → não tocar em rotas/componentes do chat na Fase 0

---

### Fase 1 — Chat Ao Vivo 100% Funcional com IA (2-3 semanas)

**Objetivo:** Fechar todos os buracos do chat ao vivo, integrar IA.

**Entregáveis:**

**Bugs críticos do chat (todos com critério de aceite explícito):**
1. **Áudio** — gravar, preview antes de enviar, enviar, reproduzir
2. **Preview de mensagem** — vê texto antes de enviar (botão "ver preview")
3. **Reply** — citar mensagem específica (quote/responder)

**Features de IA do chat:**
4. **Copiloto IA** — sugere resposta ao operador humano (modo híbrido)
5. **Tradução IA** — traduz mensagem recebida pro idioma do operador
6. **Bots** — bot simples que responde fora do horário comercial
7. **Departamentos** — roteamento de conversa por departamento
8. **DELI integrada no chat** — Wandson chama DELI direto pelo chat (canal restrito)

**Critério de aceite (por feature, exemplo áudio):**

```
ÁUDIO — CRITÉRIO DE ACEITE
- [ ] Botão de gravar áudio aparece no input
- [ ] Ao clicar, mostra waveform/timer da gravação
- [ ] Ao parar, mostra preview com botão play
- [ ] Botão "enviar" envia o áudio
- [ ] Botão "descartar" descarta sem enviar
- [ ] Áudio enviado aparece na conversa do destinatário
- [ ] Áudio é reproduzível pelo destinatário
- [ ] Tamanho máximo: 5MB (com aviso se exceder)
- [ ] Formato: webm/opus (compatível com WhatsApp via Evolution)
- [ ] Funciona em Chrome, Firefox, mobile (Safari iOS)
```

Mesmo nível de critério para preview, reply, copiloto, etc.

**Riscos:**
- Áudio em Safari iOS é notoriamente difícil → testar EARLY
- Tradução IA tem custo por chamada → cachear traduções repetidas
- Copiloto pode dar sugestão ruim → modo "desligado por padrão", usuário ativa

---

### Fase 2 — DELI + Análise iFood (3-4 semanas) — SLICE PILOTO

**Objetivo:** Primeira combinação CEO digital + agente especialista funcionando ponta-a-ponta na nova stack. Valida arquitetura inteira.

**Entregáveis:**

**DELI (CEO Digital):**
1. Página `/deli` (chat dedicado)
2. Acesso default: admin only (Wandson)
3. Task Trigger.dev `deli-conversa` (responde mensagens)
4. Task Trigger.dev `deli-revisao-matinal` (schedule 8h, revisa estado do negócio)
5. Capacidade de delegar: DELI dispara `analise-ifood-run` quando Wandson pede análise
6. Memória persistente em Supabase (`deli_memories`)
7. Audit log de toda decisão tomada

**Análise iFood (migrada do OpenClaw):**
1. Reescrever pipeline atual (PIPE-04 a PIPE-10) como tasks Trigger.dev
2. Task `analise-ifood-run` (orquestradora)
3. Sub-tasks: coletar dados, analisar, gerar relatório, salvar
4. UI em `/agentes/analise-ifood`: dispara, mostra histórico, abre relatório
5. Output: relatório markdown + dados estruturados em Supabase
6. Integração com Google Drive (mantém `automacao@consultdelivery.com.br`)

**Schema novo:**
```sql
-- Catálogo de agentes
CREATE TABLE agents (
  slug text PRIMARY KEY,
  display_name text NOT NULL,
  category text, -- 'orchestrator' | 'specialist'
  is_active boolean DEFAULT true,
  default_modo text DEFAULT 'hibrido',
  created_at timestamptz DEFAULT now()
);

-- Override por tenant + agente
CREATE TABLE tenant_agent_config (
  tenant_id uuid REFERENCES tenants(id),
  agent_slug text REFERENCES agents(slug),
  modo_override text, -- nullable: se null, herda tenant.modo_padrao
  enabled boolean DEFAULT true,
  config jsonb DEFAULT '{}'::jsonb,
  PRIMARY KEY (tenant_id, agent_slug)
);

-- Log de execuções
CREATE TABLE agent_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id),
  agent_slug text REFERENCES agents(slug),
  triggered_by uuid REFERENCES auth.users(id),
  trigger_dev_run_id text,
  status text, -- 'queued' | 'running' | 'success' | 'failed'
  input jsonb,
  output jsonb,
  cost_usd numeric(10,4),
  duration_ms integer,
  created_at timestamptz DEFAULT now(),
  completed_at timestamptz
);

-- Memórias persistentes (DELI e outros agentes que precisam)
CREATE TABLE agent_memories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_slug text REFERENCES agents(slug),
  tenant_id uuid REFERENCES tenants(id),
  user_id uuid REFERENCES auth.users(id),
  kind text, -- 'fact' | 'preference' | 'history' | 'decision'
  content text,
  importance integer DEFAULT 5, -- 1-10
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz
);
```

**Critério de aceite Fase 2:**
- [ ] Wandson conversa com DELI no chat dedicado, DELI responde com contexto do negócio
- [ ] DELI cita memória anterior em conversa nova ("você me disse semana passada que...")
- [ ] Wandson pede "DELI, analisa a loja X" → DELI dispara análise iFood e devolve resultado
- [ ] Análise iFood roda end-to-end (coleta → análise → relatório) em < 5min
- [ ] Todo run aparece em `agent_runs` com custo e duração
- [ ] Audit log registra decisões de DELI

**Riscos:**
- DELI alucinar dados do negócio → sempre buscar dados reais do Supabase, nunca confiar em memória
- Análise iFood depender de OAuth Google Drive existente → testar autenticação em ambiente novo

---

### Fase 3 — LARA · Marketing (2-3 semanas)

**Objetivo:** Cobrir gargalo nº 1 (Marketing). Wélida ganha braço de IA.

**Entregáveis:**
1. Migração da LARA do OpenClaw pra Trigger.dev + SDK
2. Página `/agentes/lara` (acesso Wélida + admin)
3. Tasks:
   - `lara-pesquisar-loja` (já testada em 11/05)
   - `lara-gerar-conteudo` (post Instagram, texto WhatsApp, e-mail)
   - `lara-analisar-tendencia` (pesquisa tendências do mercado)
4. Integração com Campanhas (LARA sugere conteúdo, Wélida aprova/edita)
5. Audit + custos via `agent_runs`

**Critério de aceite:**
- [ ] Wélida usa LARA pra gerar 5 conteúdos de campanha em < 30min
- [ ] Output validado por Zod (sem alucinação de cidade/nome/dado)
- [ ] DELI consegue delegar tarefa pra LARA via task composition
- [ ] LARA respeita modo do tenant (humano = só rascunha; IA = pode publicar)

---

### Fase 4 — MAX · Suporte a Sistemas (2-3 semanas)

**Objetivo:** Cobrir gargalo nº 2 (Suporte a sistemas).

**Entregáveis:**
1. Agente novo: MAX (consultor técnico)
2. Página `/agentes/max`
3. Tasks:
   - `max-diagnostico` (cliente descreve problema, MAX sugere solução)
   - `max-tutorial` (gera tutorial passo-a-passo)
   - `max-escalonar` (decide se humano precisa entrar)
4. Base de conhecimento (knowledge base) — começa com sistemas que você revende
5. Integração WhatsApp via Evolution (cliente pergunta, MAX responde)
6. **OpenClaw aposentado nesta fase** (migrar últimas dependências)

**Critério de aceite:**
- [ ] Cliente pergunta no WhatsApp, MAX responde em < 60s com solução ou escalonamento
- [ ] Taxa de resolução > 60% (60% das perguntas resolvidas sem humano)
- [ ] MAX cita fonte da resposta (qual doc/tutorial)

---

### Fase 5 — NOVA · Automação IA (3-4 semanas)

**Objetivo:** Cobrir gargalo nº 3 (Automação IA — VENDIDA como serviço pra clientes).

**Status especial:** Esta é parte do PRODUTO de consultoria, não só ferramenta interna.

**Entregáveis:**
1. Agente NOVA: ajuda a desenhar automações IA pra clientes finais
2. Página `/agentes/nova` (acesso Wandson + Wélida)
3. Tasks:
   - `nova-discovery` (entrevista cliente, mapeia caso de uso)
   - `nova-blueprint` (gera blueprint da automação)
   - `nova-estimate` (estima escopo, prazo, custo)
4. Templates de automações comuns (cobrança, atendimento, marketing automatizado)
5. Capacidade de gerar especificação técnica que outro Claude Code pode implementar

**Critério de aceite:**
- [ ] Em 1 conversa de 30min, NOVA gera blueprint completo de uma automação tipo cobrança
- [ ] Blueprint inclui: gatilhos, ações, integrações, prazo, custo estimado
- [ ] Wandson valida 3 blueprints reais com clientes reais antes de considerar pronto

---

### Fase 6+ — CORA, BRENO, SOFIA, VERA (V2/V3)

**CORA · Cobrança** — ✅ CONCLUÍDA (Feature V2-1, 14/05/2026). Ver `docs/agentes/cora.md`.
- 4 tasks Trigger.dev: `cora-analisar-devedor`, `cora-gerar-mensagem`, `cora-escalonar`, `cora-criar-cobranca`
- Integração completa com Asaas (sandbox): criação de cobranças PIX/BOLETO/CC, webhook de status
- 3 migrations novas: `cobrancas` (V2), `cobranca_eventos` (audit trail), `cora_acoes` V2 columns
- UI: ModoToggle, aba "Asaas V2", CobrancaV2Drawer com histórico de eventos

**BRENO · Atendimento** — Eduardo já cobre manualmente, prioridade baixa.  
**SOFIA · SDR/Prospecção** — V2 piloto.  
**VERA · BI & Relatórios** — V3.

---

## 7. ESTRUTURA TRIGGER.DEV

### 7.1 Pastas

```
consult-delivery/
├── trigger/
│   ├── trigger.config.ts
│   ├── _shared/
│   │   ├── claude.ts          # wrapper @anthropic-ai/sdk com web_search
│   │   ├── supabase.ts        # client para tasks
│   │   ├── schemas.ts         # schemas Zod compartilhados
│   │   └── audit.ts           # registra agent_runs
│   ├── deli/
│   │   ├── conversa.ts
│   │   └── revisao-matinal.ts
│   ├── analise-ifood/
│   │   ├── run.ts
│   │   ├── coletar.ts
│   │   ├── analisar.ts
│   │   └── relatorio.ts
│   ├── lara/
│   │   ├── pesquisar-loja.ts
│   │   ├── gerar-conteudo.ts
│   │   └── analisar-tendencia.ts
│   ├── cora/                  # ✅ V2-1 (14/05/2026)
│   │   ├── analisar-devedor.ts
│   │   ├── gerar-mensagem.ts
│   │   ├── escalonar.ts
│   │   └── criar-cobranca.ts  # integração Asaas
│   └── _examples/
│       └── hello-world.ts     # task de teste, nunca remover
```

### 7.2 Convenções de nomenclatura

- Pasta = agente (slug minúsculo): `deli/`, `lara/`, `analise-ifood/`
- Arquivo = ação (verbo): `pesquisar-loja.ts`, `gerar-conteudo.ts`
- Task ID = `agente-acao`: `lara-pesquisar-loja`, `deli-conversa`
- Schema Zod = PascalCase: `LaraPesquisarLojaInput`, `LaraPesquisarLojaOutput`

### 7.3 Template de task (todo agente segue isso)

```typescript
import { task } from "@trigger.dev/sdk/v3";
import { z } from "zod";
import { runClaudeWithWebSearch } from "../_shared/claude";
import { logAgentRun } from "../_shared/audit";

const InputSchema = z.object({
  // ...
});

const OutputSchema = z.object({
  // ...
});

export const laraPesquisarLoja = task({
  id: "lara-pesquisar-loja",
  retry: { maxAttempts: 3 },
  run: async (payload: z.infer<typeof InputSchema>, { ctx }) => {
    const input = InputSchema.parse(payload);
    
    const result = await runClaudeWithWebSearch({
      systemPrompt: "...",
      userPrompt: `Pesquise dados de: ${input.nome_loja}`,
      outputSchema: OutputSchema,
      maxRetries: 1, // 1 retry se schema falhar
    });
    
    await logAgentRun({
      runId: ctx.run.id,
      agentSlug: "lara",
      input,
      output: result,
      tenantId: input.tenant_id,
    });
    
    return result;
  }
});
```

### 7.4 Padrão de comunicação Frontend ↔ Bridge ↔ Trigger.dev

```
Frontend                Bridge                    Trigger.dev               Supabase
   |                       |                          |                       |
   |--- POST /agents/:slug/run -->                    |                       |
   |                       |--- runs.trigger() ------>                       |
   |                       |<-- { run_id }            |                       |
   |<-- { run_id } ---------                          |                       |
   |                       |                          |--- exec --->         |
   |                       |                          |                       |
   |--- SUBSCRIBE agent_runs:run_id (Realtime) ------------------------------>|
   |                       |                          |--- update agent_runs->|
   |<-- { status: done, output } -------------------------------------------- |
```

---

## 8. WORKFLOW DE TRABALHO

### 8.1 Branches

- `main` — sempre deployável
- `feature/fase-0/fundacao` — fase atual
- `feature/fase-1/chat-audio` — sub-feature de fase
- Worktrees: cada Claude Code paralelo em worktree própria

### 8.2 Commits

Convencional commits:
- `feat(lara): adiciona tarefa pesquisar-loja`
- `fix(chat): corrige preview de áudio no Safari iOS`
- `chore(db): migration para agent_runs`
- `docs: atualiza RESTRUCTURE.md com fase 3`

### 8.3 Pull Request

- Toda PR precisa: descrição com critério de aceite, screenshot/log da validação manual, link da task no Trigger.dev (se aplicável)
- Wandson aprova
- Mergeia em main
- Branch é deletada após merge

---

## 9. LIMPEZA E PENDÊNCIAS

### 9.1 Limpeza imediata (Fase 0)

- [ ] Deletar branch `yasmin/dev` após verificar não ter código aproveitável
- [ ] Remover tenants seed: pizza-joao, burger, acai, sushi, tapioca
- [ ] Adicionar coluna `is_active` em `tenants`

### 9.2 Pendências de segurança (Fase 0 ou 1)

- [ ] Rotacionar token Telegram
- [ ] Rotacionar senha VPS
- [ ] Configurar allowlist Telegram para user_id `8745522380` (Wandson)

### 9.3 Aposentadoria gradual

- OpenClaw: desligar na VPS na Fase 4 (depois de migrar LARA + Análise iFood + qualquer outro agente que use OpenClaw)

---

## 10. VALIDAÇÃO DE CADA FASE

Antes de avançar pra próxima fase, Wandson valida:

| Item | Como valida |
|---|---|
| Build não quebrou | `npm run build` no main, sem erro |
| Migrations rodaram | `select * from migrations` mostra todas aplicadas |
| Testes passam | `npm test` retorna verde |
| Chat ao vivo continua funcional | Wandson manda mensagem, recebe resposta |
| Critério de aceite da fase | Checklist 100% preenchido na PR |
| Sem alucinação documentada | Audit log limpo, ou alucinações catalogadas + corrigidas |

**Regra de ouro:** se 1 item falha, fase não fecha. Não há "85% pronto, segue".

---

## 11. AGENTES IA — VISÃO GERAL

| Agente | Função | Fase | Acessa quem |
|---|---|---|---|
| **DELI** | CEO digital, orquestradora | 2 | admin |
| **Análise iFood** | Análise de loja iFood | 2 | admin + marketing |
| **LARA** | Marketing & Conteúdo | 3 | marketing + admin |
| **MAX** | Suporte técnico a sistemas | 4 | atendimento + admin |
| **NOVA** | Automação IA (vendido a clientes) | 5 | admin + marketing |
| **CORA** | Cobrança | 6 | financeiro + admin |
| **BRENO** | Atendimento WhatsApp | 7 | atendimento + admin |
| **SOFIA** | SDR/Prospecção | V2 | marketing + admin |
| **VERA** | BI & Relatórios | V3 | admin |

---

## 12. ANTI-PADRÕES — O QUE NÃO FAZER

Lições aprendidas que viraram regra:

1. **Não declarar "feito" sem rodar de verdade.** Output bruto sempre.
2. **Não confiar em memória pra nomes de pacotes/APIs.** Validar no `node_modules` ou doc oficial.
3. **Não criar features sem critério de aceite.** Foi assim que o chat ficou sem áudio/preview/reply.
4. **Não trocar stack sem motivo concreto.** OpenClaw foi bom pra validar LARA — só sai porque há motivo (manutenibilidade pelo Claude Code).
5. **Não adicionar agente sem mapear gargalo real.** Cada agente cobre uma dor mensurável.
6. **Não pular validação intermediária.** Cada fase tem critério de aceite — não há "pulo".
7. **Não pausar V1 pra refatorar V0.** Já foi decidido — primeiro fundação, depois agentes.
8. **Não misturar n8n / OpenClaw / EvoNexus no novo stack.** Decisão final, sem volta.

---

## 13. PRÓXIMOS PASSOS IMEDIATOS

1. **Wandson valida este documento.** Lê inteiro, marca o que mudar.
2. **Wandson cria branch `feature/fase-0/fundacao`** no repo principal.
3. **Wandson cola o prompt da Fase 0** (arquivo `FASE-0-PROMPT.md`) no Claude Code dentro do repo principal.
4. **Claude Code executa Fase 0.** Wandson valida critério de aceite.
5. **Avança pra Fase 1** após Fase 0 fechada.

---

## 14. CHANGELOG DESTE DOC

| Versão | Data | Mudanças |
|---|---|---|
| 1.0 | 12/05/2026 | Documento inicial após reestruturação completa decidida no chat de 11-12/05 |

---

**FIM DO DOCUMENTO MESTRE.**

Para começar a Fase 0, use o arquivo `FASE-0-PROMPT.md`.
