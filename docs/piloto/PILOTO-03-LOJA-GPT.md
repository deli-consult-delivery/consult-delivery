# PILOTO Onda 03 — Loja-GPT (IA Especialista por Loja)

**Duração estimada:** 1-2 semanas
**Pré-requisitos:**
- Onda 02 mergeada (tarefas funcionando)
- Repo `consult-delivery-knowledge` existente com conteúdo iFood populado (mínimo: `02-suporte-sistemas/ifood/`)
- Tabela `agent_memories` existente
- Tabela `loja_metricas_snapshot` populada com 1+ snapshot por loja

---

## 🎯 Objetivo da Onda

Loja-GPT é um agente compartilhado que conhece TUDO sobre 1 loja específica + base de conhecimento iFood. Substituto do "consultor pesquisando do zero". Cada consultor pergunta, Loja-GPT responde com contexto da loja + citação de fontes.

**Decisão arquitetural confirmada:** UM agente compartilhado, contexto da loja injetado em runtime.

## 📦 O que entrega no fim desta onda

- [ ] 2 migrations (loja_gpt_conversations, loja_gpt_messages)
- [ ] 1 nova task Trigger.dev: `loja-gpt-responder`
- [ ] Helper `trigger/_shared/loja-contexto.ts`
- [ ] Helper `trigger/_shared/knowledge-base.ts` (consulta `consult-delivery-knowledge`)
- [ ] 5-6 endpoints Bridge Server
- [ ] Aba "IA Especialista" do workspace funcional
- [ ] Repo `consult-delivery-knowledge` clonado na VPS + atualização automática
- [ ] Smoke test: pergunta real com resposta correta + citação

## 📐 Arquitetura do Loja-GPT

```
Consultor pergunta no workspace
        ↓
Endpoint POST /api/lojas/:id/loja-gpt
        ↓
Bridge dispara task Trigger.dev: loja-gpt-responder
        ↓
        ├─→ loja-contexto.ts: busca dados da loja, métricas, tarefas
        ├─→ memorias.ts: busca agent_memories da loja (kind=fact|preference|decision)
        ├─→ knowledge-base.ts: lê _index.md + arquivos relevantes do repo iFood
        └─→ histórico: últimas N mensagens da conversa
        ↓
Monta prompt com tudo + pergunta
        ↓
Anthropic API (sonnet-4) com web_search habilitado
        ↓
Resposta com citações
        ↓
Salva em loja_gpt_messages
        ↓
Retorna pro frontend (streaming opcional)
```

## 📐 Schemas SQL

### Migration 01 — Tabela `loja_gpt_conversations`

```sql
BEGIN;

CREATE TABLE IF NOT EXISTS loja_gpt_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loja_id uuid NOT NULL REFERENCES lojas(id) ON DELETE CASCADE,
  iniciada_por uuid REFERENCES auth.users(id),
  
  titulo text, -- gerado pela IA depois das primeiras msgs
  resumo_curto text,
  
  total_messages integer DEFAULT 0,
  ultima_message_em timestamptz,
  arquivada boolean DEFAULT false,
  
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_lgc_loja ON loja_gpt_conversations(loja_id, ultima_message_em DESC);
CREATE INDEX idx_lgc_user ON loja_gpt_conversations(iniciada_por);

ALTER TABLE loja_gpt_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Ver conversas: mesmo tenant"
  ON loja_gpt_conversations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM lojas l
      JOIN user_roles ur ON ur.tenant_id = l.tenant_id
      WHERE l.id = loja_gpt_conversations.loja_id
        AND ur.user_id = auth.uid()
    )
  );

CREATE POLICY "Criar conversa"
  ON loja_gpt_conversations FOR INSERT
  WITH CHECK (iniciada_por = auth.uid());

COMMIT;
```

### Migration 02 — Tabela `loja_gpt_messages`

```sql
BEGIN;

CREATE TABLE IF NOT EXISTS loja_gpt_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES loja_gpt_conversations(id) ON DELETE CASCADE,
  
  role text NOT NULL CHECK (role IN ('user','assistant','tool')),
  conteudo text NOT NULL,
  
  -- Citações e contexto usado
  fontes_consultadas jsonb NOT NULL DEFAULT '[]', -- array de {tipo, arquivo, trecho}
  contexto_loja_snapshot jsonb,           -- snapshot do contexto no momento
  
  -- Custo
  tokens_input integer,
  tokens_output integer,
  custo_usd numeric(10,6),
  duracao_ms integer,
  modelo text,
  
  -- Audit
  autor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL, -- se user
  
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_lgm_conv ON loja_gpt_messages(conversation_id, created_at);

ALTER TABLE loja_gpt_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Ver mensagens via conversation"
  ON loja_gpt_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM loja_gpt_conversations c
      JOIN lojas l ON l.id = c.loja_id
      JOIN user_roles ur ON ur.tenant_id = l.tenant_id
      WHERE c.id = loja_gpt_messages.conversation_id
        AND ur.user_id = auth.uid()
    )
  );

COMMIT;
```

> **Histórico de decisões (2026-05-21):**
> - `agent_run_id` removido — pode voltar em migration futura se precisar cruzar com `agent_runs`. Não bloqueia Loja-GPT v1.
> - `modelo` adicionado — necessário pra rastreamento de custo por modelo (claude-sonnet-4-6 vs outros).
> - `'system'` removido do CHECK — Anthropic API trata system como parâmetro separado, não como mensagem gravada.
> - `NOT NULL` e `ON DELETE SET NULL` explícitos — hardening defensivo.

---

## 🤖 PROMPT PRA CLAUDE CODE

**Pré-requisitos:**
- Onda 02 mergeada
- Branch: `git checkout -b feature/piloto-03-loja-gpt`
- Repo `consult-delivery-knowledge` clonado na VPS em `/root/consult-delivery-knowledge` com cron de update

**Cola este prompt:**

```
# PILOTO Onda 03 — LOJA-GPT (IA ESPECIALISTA POR LOJA)

## OBJETIVO
Construir agente IA compartilhado que conhece TUDO sobre uma loja específica 
e a plataforma iFood. Cada chamada recebe loja_id e injeta:
- Dados da loja (lojas + métricas)
- Memórias (agent_memories)
- Tarefas em andamento (tarefas_loja)
- Base de conhecimento iFood (consult-delivery-knowledge repo)
- Histórico da conversa atual

## CONTEXTO
- Doc autoritativo: docs/piloto/PILOTO-03-LOJA-GPT.md
- Subagents: @cd-task-creator, @cd-migration-creator, @cd-validator
- Branch: feature/piloto-03-loja-gpt
- Decisão: 1 agente compartilhado, NÃO N agentes
- Anti-padrão crítico: NÃO usar new Anthropic() top-level (use dentro do run())

## INFRAESTRUTURA NECESSÁRIA — VERIFICAR PRIMEIRO

1. Repo consult-delivery-knowledge clonado em /root/consult-delivery-knowledge?
2. Cron */30 * * * * git pull configurado?
3. Pasta 02-suporte-sistemas/ifood/ tem ao menos 5 arquivos populados?

Se NÃO: Wandson precisa fazer manualmente. PERGUNTAR antes de começar.

## TAREFAS

### Tarefa 1 — Reconhecimento
Confirma estado:
- Onda 02 mergeada
- Repo knowledge clonado e atualizado
- agent_memories populado pra teste (ou cria seed)

### Tarefa 2 — 2 migrations (use @cd-migration-creator)
2.1. loja_gpt_conversations
2.2. loja_gpt_messages

### Tarefa 3 — Helper trigger/_shared/loja-contexto.ts
Função: buildLojaContexto(loja_id) retorna:
{
  loja: { nome, segmento, cidade, posicionamento, status, ticket_medio },
  ultima_metrica: snapshot mais recente de loja_metricas_snapshot,
  tarefas_em_aberto: contagens por status,
  memorias: até 20 memórias importance>=5 da loja,
  consultores: lista
}
Token-aware: trunca conteúdo extenso pra <2000 tokens.

### Tarefa 4 — Helper trigger/_shared/knowledge-base.ts
Função: searchKnowledgeBase(query, max_files=3) lê:
1. /root/consult-delivery-knowledge/_index.md (sempre)
2. Identifica áreas relevantes via match de keywords
3. Lê até 3 arquivos da área correta
4. Retorna { fontes: [{ path, conteudo_relevante }], tokens_estimados }

NÃO ler arquivos cegamente — usar índice pra economizar tokens.

### Tarefa 5 — Task trigger/loja-gpt/responder.ts (use @cd-task-creator)

Input Zod:
{
  conversation_id: uuid (cria nova se null),
  loja_id: uuid,
  user_id: uuid,
  tenant_id: uuid,
  pergunta: string
}

run() faz:
1. const client = new Anthropic(); // DENTRO do run()
2. const contexto = await buildLojaContexto(loja_id)
3. const fontes = await searchKnowledgeBase(pergunta)
4. const historico = busca últimas 10 messages da conversation
5. Monta system prompt:
   "Você é Loja-GPT, especialista da loja {nome}. 
   Contexto: {JSON contexto}.
   Base de conhecimento iFood: {trechos fontes}.
   Histórico: {historico}.
   Regras: cite fontes [REF:arquivo]; nunca invente dados; se não souber, diga."
6. Anthropic.messages.create com web_search_20250305 habilitado
7. Salva resposta em loja_gpt_messages com fontes_consultadas
8. Incrementa total_messages da conversation
9. logAgentRun

Output Zod:
{
  message_id: uuid,
  resposta: string,
  fontes: array,
  tokens_input, tokens_output, custo_usd, duracao_ms
}

### Tarefa 6 — Endpoints Bridge

6.1. GET    /api/lojas/:id/loja-gpt/conversations
6.2. GET    /api/loja-gpt/conversations/:id (com messages)
6.3. POST   /api/lojas/:id/loja-gpt/conversations (nova)
6.4. POST   /api/loja-gpt/conversations/:id/messages
       - Recebe pergunta
       - Dispara task loja-gpt/responder
       - AGUARDA conclusão (max 60s)
       - Retorna resposta
6.5. PATCH  /api/loja-gpt/conversations/:id (arquivar)

### Tarefa 7 — Aba "IA Especialista" do workspace

Substituir placeholder Onda 01.

Layout:
- Sidebar esquerda: lista de conversations recentes da loja
- Área principal: chat (similar ao ChatScreen existente)
- Input embaixo com botão enviar
- Streaming opcional ou request síncrono
- Renderizar fontes_consultadas como links/badges:
  [REF: 02-suporte-sistemas/ifood/precificacao.md]
- Botão "Nova conversa"
- Botão "Arquivar"

### Tarefa 8 — Indicador de custo
Mostrar custo total da conversa no header (somatório de custo_usd).
Mostrar custo da última mensagem.

### Tarefa 9 — Sistema prompt
Em trigger/loja-gpt/responder.ts, system prompt segue exatamente:

"Você é Loja-GPT, agente especialista de delivery iFood. Atende consultores 
da Consult Delivery. Você conhece tudo sobre a loja {NOME}, uma {SEGMENTO} 
em {CIDADE}, posicionada como {POSICIONAMENTO}.

CONTEXTO ATUAL DA LOJA:
{contexto_json}

MEMÓRIAS RELEVANTES:
{memorias_formatted}

BASE DE CONHECIMENTO iFOOD:
{fontes_formatted}

REGRAS:
1. SEMPRE cite a fonte ao usar conhecimento da base no formato [REF:caminho]
2. Se não tiver certeza, diga 'não tenho essa informação na base atual'
3. NUNCA invente números, métricas ou datas
4. Considere o estado atual da loja ao recomendar
5. Tom profissional, técnico, prático
6. Respostas concisas (max 300 palavras se não pedirem detalhe)
7. Se a pergunta é sobre outra loja: 'sou especialista apenas da {NOME}'"

### Tarefa 10 — Smoke test E2E

1. Loja-GPT pergunta: "Qual estratégia recomenda pra essa loja agora?"
2. Confere resposta cita: posicionamento, status, métricas
3. Pergunta: "Como reduzir taxa de cancelamento?"
4. Confere resposta cita arquivo da base iFood [REF:...]
5. Pergunta: "Quando essa loja vai bater Super Restaurante?"
6. Confere resposta cita métricas atuais e critério (180 pedidos)
7. Pergunta sobre outra loja → confere recusa
8. Loga custo_usd da conversa

## CRITÉRIO DE ACEITE

- [ ] 2 migrations aplicadas
- [ ] 2 helpers (loja-contexto + knowledge-base) testados
- [ ] Task loja-gpt/responder deployada e funcional
- [ ] 5 endpoints funcionais
- [ ] Aba IA Especialista renderiza
- [ ] Smoke test 8 itens passou
- [ ] Citações [REF:...] aparecem corretamente
- [ ] Custo total tracking funcionando
- [ ] @cd-validator passa
- [ ] Sem regressão

## RESTRIÇÕES
- NUNCA new Anthropic() top-level
- NUNCA expor agent_memories de outra loja
- web_search habilitado mas opcional (modelo decide)
- Custo máximo por mensagem: monitorar, alertar se >$0.50

Começar Tarefa 1. ME PERGUNTAR ao terminar cada uma.
```

## 📊 Estimativa

| Tarefa | Tempo |
|---|---|
| 1. Reconhecimento | 30min |
| 2. Migrations | 4h |
| 3. loja-contexto helper | 1 dia |
| 4. knowledge-base helper | 1 dia |
| 5. Task responder | 1-2 dias |
| 6. Endpoints | 1 dia |
| 7. Aba IA Especialista | 2 dias |
| 8. Indicador custo | 4h |
| 9. System prompt iterar | 4h |
| 10. Smoke test | 1 dia |

**Total: 7-10 dias úteis** (1.5-2 semanas)

## ⚠️ Riscos específicos desta onda

| Risco | Mitigação |
|---|---|
| Base de conhecimento iFood vazia | Pré-popular: Wandson deve ter mínimo 5 arquivos antes |
| Custo Anthropic explodir | Limite max_tokens=2000, alertar se >$0.50/msg |
| Loja-GPT alucinar | Sistema prompt rigoroso + obrigatoriedade de citar |
| Citações inválidas | Validar [REF:...] no backend antes de retornar |

---

## Status Final — 2026-05-22

**Onda 03 concluída.** Pipeline Loja-GPT validado end-to-end em produção.

### Tarefas

| # | Tarefa | Status | Hash |
|---|---|---|---|
| 1 | Reconhecimento | ✅ Done | — |
| 2 | Migrations 01+02 | ✅ Done | `f33324d` + sync `641a2d1` |
| 3 | Helper buildLojaContexto | ✅ Done | `1a3023d` |
| 4 | Helper searchKnowledgeBase | ✅ Done | `ffb78e9` |
| 4.5 | Refactor claude.ts lazy singleton | ✅ Done | `448fa3e` |
| 5 | Task loja-gpt-responder (Trigger.dev) | ✅ Done | `fefbe69` |
| 6 | 5 endpoints Bridge Server | ✅ Done | `cccc3b2` |
| 7 | TabIaEspecialista (React) | ✅ Done | `59e5904` |
| 8 | Indicador custo BRL | ✅ Done | `fc1ba87` |
| 9 | System prompt | ✅ Done (dentro do `fefbe69`) | — |
| 10 | Smoke E2E | ✅ Done | `bac1880` + `6014f7f` + `f8dd468` + `aa3e056` |

### Smoke E2E — Resultados

Executado contra loja **Varanda's Restaurante & Pizzaria** (`6a8c6978-8575-45a2-b971-00bd9a81c754`), tenant `consult`.

- ✅ GET conversations — 200, lista vazia inicial
- ✅ POST conversation — 201, persistido em `loja_gpt_conversations`
- ✅ POST messages — 200 em 21s, task `loja-gpt-responder` executou Anthropic Sonnet 4.6
- ✅ KB consultada com 3 fontes citadas no output: `algoritmo-relevancia.md`, `operacao-metricas.md`, `_index.md`
- ✅ Resposta cita explicitamente `[REF:02-suporte-sistemas/ifood/algoritmo-relevancia.md]`
- ✅ Custo registrado: `$0.017148` / mensagem (3251 tokens input / 493 output)
- ✅ PATCH archive — 200, `arquivada: true`
- ✅ Regra de negócio: POST em arquivada → 422
- ✅ FK `agent_runs.agent_id → agents.id` satisfeita (agent `loja-gpt` registrado)

### Decisões Arquiteturais Tomadas no Smoke

1. **KB no bundle do Trigger.dev cloud** — solução intermediária: copiar `consult-delivery-knowledge` para `trigger/knowledge-base/` no repo principal, usar `additionalFiles` em `trigger.config.ts` pra forçar inclusão dos `.md`. Path final: `/app/trigger/knowledge-base` (via env var `KNOWLEDGE_BASE_PATH`).
2. **Agent `loja-gpt` registrado** na tabela `agents` (id text, letter `L`, color `#8B5CF6`, default_modo `ia`).
3. **`_index.md` da KB** corrigido pra usar paths completos `02-suporte-sistemas/ifood/...` ao invés de `ifood/...`.

---

## Tech Debt — Onda 04

### Alta prioridade

1. **CI/CD auto-deploy do Trigger.dev de `main`** sobrescreve deploys de feature branches. Qualquer Onda futura vai bater nisso. Soluções possíveis: filtrar workflow por branch, exigir approval manual, ou só rodar deploy após merge.
2. **Branches locais divergentes na VPS** sem governança (descoberto durante smoke: `feature/piloto-03-loja-gpt` tinha 17 commits órfãos com features BomDia/Encerramento; `feature/v2-cora-asaas` 168 commits ahead do origin). Trabalho preservado em `origin/backup/vps-bomdia-encerramento-2026-05-22`. Investigar quem está commitando direto na VPS sem push.
3. **KB duplicada** em 2 repos (`consult-delivery-knowledge` separado + `consult-delivery/trigger/knowledge-base` no bundle). Sync manual frágil. Migrar pra git submodule ou refatorar `searchKnowledgeBase` pra fetch HTTP do GitHub raw.

### Média prioridade

4. **Polling síncrono 60s** em POST /messages bloqueia worker do Bridge. Migrar pra fire-and-forget + Supabase Realtime em `loja_gpt_messages`.
5. **Race condition no SELECT+UPDATE** de `custo_total_usd` em `loja_gpt_conversations`. Usar increment atômico via RPC SQL.

### Baixa prioridade

6. **GitHub Actions `deploy.yml`** só dispara em main — frontend de feature branches sem live preview.
7. **JWT Supabase TTL 1h** — sessão de smoke precisou relogar 3x. Considerar refresh token automático no Bridge.
8. **`react-markdown`** pra render rico das respostas IA (atualmente `formatWhatsApp` mínimo).
9. **Cleanup periódico de conversas vazias** (D3A cria conv ao clicar "Nova", podem acumular órfãs).
10. **`agent_runs.input`** quando `conversation_id` é null no disparo — registro órfão no audit.

### Cosmético

11. Hover do botão Arquivar via ref callback manipulando DOM no parent — refatorar pra CSS class ou React state.
12. Animação `lgpt-bounce` referenciada em TypingIndicator — validar keyframes em `src/index.css`.
13. Hardcoded `USD_TO_BRL = 5.3` no TabIaEspecialista — atualizar periodicamente ou puxar de API.
14. Endpoint `GET /agents/loja-gpt-responder/runs/:run_id` mencionado na resposta 202 do Bridge — não foi implementado nesta Onda, smoke recomendado manual.

---

## Pendências de Cleanup

- 5 conversas de teste criadas no smoke em `loja_gpt_conversations` (loja Varanda's) — podem ser arquivadas ou deletadas.
- VPS está no checkout temporário de `feature/piloto-03-loja-gpt` (não em `main`). Próxima sessão: decidir merge feature→main ou reset pro main da VPS.
- Branch `backup/vps-bomdia-encerramento-2026-05-22` no origin preserva trabalho órfão da VPS — decidir destino (merge em main, descartar, ou virar PR separada).

---

## Update Pós-Merge — Bug crítico em produção (2026-05-22, +1h após merge)

Após merge `feature/piloto-03-loja-gpt` → `main` (commit `4ece67d`) e Pages deploy, usuário (Wandson testando na loja interna CONSULTORIA - VARANDAS) reportou: **mensagens persistiam no DB mas UI mostrava placeholder vazio "Loja-GPT pronto para responder"** mesmo após reload.

### Diagnóstico

- ✅ Bridge endpoint `GET /api/loja-gpt/conversations/:id` retornava JSON correto:
```json
  { "conversation": { "id": "...", "messages": [...] } }
```
- ❌ Componente `TabIaEspecialista.jsx` linha 685 lia `data.messages` (sem o nível `conversation`), caindo sempre no fallback `|| []`.

### Fix

Commit `72b4368` (1 linha):

```diff
-      setMessages(data.messages || []);
+      setMessages(data.conversation?.messages || []);
```

### Validado em produção

Após Pages deploy, screenshots confirmam:
- Mensagens user + assistant renderizadas
- Markdown formatado (negrito, emojis, listas)
- 3 fontes citadas no rodapé das respostas
- Optimistic update do user funcionando
- Timestamps consistentes

### Lição aprendida

**Smoke E2E (Tarefa 10) validou Bridge + Trigger.dev + DB + KB, mas NÃO validou render da UI** — apenas HTTP status codes via cURL. O bug do unwrap só apareceu em uso real através do app.

### Tech Debt adicional pra Onda 04

**#15. Smoke E2E precisa incluir validação visual da UI** — não só HTTP status. Possíveis abordagens:
- Playwright/Cypress E2E test que clica numa conversa e verifica que mensagens renderizam
- Manual checklist: "abrir app + clicar conversa + verificar render" como passo obrigatório do smoke
- Validar render via screenshot diff automatizado
