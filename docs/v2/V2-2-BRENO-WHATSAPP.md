# V2 Feature 2 — BRENO + WhatsApp Automático

**Prompt pra colar no Claude Code no repo `consult-delivery`.**

**Antes de colar:**
1. `cd "C:\Users\Consult Delivery\consult-delivery"`
2. `git checkout -b feature/v2-breno-whatsapp` (ou worktree própria)
3. `claude`
4. Cola o prompt abaixo

---

```
# OBJETIVO
Conectar BRENO ao WhatsApp via webhook Evolution. Quando mensagem nova 
chega de cliente, sistema:
1. Verifica modo do tenant (humano|hibrido|ia)
2. Em modo IA: BRENO responde automaticamente
3. Em modo híbrido: BRENO responde mas marca pra revisão
4. Em modo humano: BRENO só sugere, Eduardo aprova manualmente
5. Logs completos pra auditoria

# CONTEXTO
- Doc autoritativo: RESTRUCTURE.md
- Subagents disponíveis: @cd-task-creator, @cd-migration-creator, @cd-validator
- BRENO já tem 2 tasks built mas NUNCA executadas em produção:
  - trigger/breno/responder.ts
  - trigger/breno/resumir-conversa.ts
- Evolution API já configurada (Bridge Server porta 3001)
- Webhook Evolution: já existe receiver para chat ao vivo

# IMPORTANTE — Riscos assumidos
- As 2 tasks existentes têm `new Anthropic()` no top-level (anti-padrão).
- Recomendação: corrigir nesta feature já que vamos mexer aí.
- BRENO nunca foi executado — pode estar quebrado de origem.

# TAREFAS

## Tarefa 1 — Smoke test das 2 tasks existentes
Disparar UMA vez no dashboard cada task com input real (mensagem fictícia 
de cliente). Documentar output bruto.

## Tarefa 2 — Mapeamento do webhook Evolution atual
LER o código atual que recebe webhooks Evolution (provavelmente em 
Bridge Server bridge/routes/webhooks.js ou similar). Documentar:
- Estrutura do payload recebido
- Como é roteado pra chat ao vivo
- Onde dá pra plugar BRENO sem quebrar fluxo existente

## Tarefa 3 — Schema (use @cd-migration-creator)

### 3.1. Tabela breno_interactions
- id uuid PK
- tenant_id uuid FK tenants
- conversation_id uuid FK conversations (existe)
- inbound_message_id text (id da msg que disparou BRENO)
- outbound_message_id text NULL (id da resposta enviada)
- mode text (humano|hibrido|ia) — modo no momento da decisão
- breno_response text (o que BRENO gerou)
- action_taken text (sent|suggested|skipped)
- agent_run_id uuid FK agent_runs
- requires_review boolean DEFAULT false
- reviewed_at timestamptz NULL
- reviewed_by uuid FK auth.users NULL
- created_at timestamptz
- RLS: tenant_id

### 3.2. Coluna em conversations
- last_breno_handled_at timestamptz NULL
- breno_paused boolean DEFAULT false (se Eduardo assumiu manualmente)

## Tarefa 4 — Refatorar tasks BRENO (use @cd-task-creator)
- Mover `new Anthropic()` pra dentro de run()
- Adicionar logAgentRun
- Receber tenant_id
- Buscar histórico das últimas 20 mensagens da conversa pra contexto
- Verificar modo do tenant antes de decidir ação
- Salvar em breno_interactions

## Tarefa 5 — Lógica de routing no Bridge Server
Modificar receiver de webhook Evolution pra:
1. Receber msg como hoje (não quebrar chat ao vivo)
2. ADICIONALMENTE: verificar se deve disparar BRENO
   - Conversa ainda não tem responsável humano atribuído?
   - breno_paused = false?
   - Modo do tenant != humano OR (modo == humano AND auto_suggest = true)?
3. Se sim: dispara task breno-responder via Trigger.dev
4. Não bloqueia — fire-and-forget (Trigger.dev cuida do retry)

## Tarefa 6 — Envio de resposta via Evolution
Em breno-responder.ts:
- Quando ação == sent (modo ia ou híbrido):
  - Chama Evolution API sendText
  - Salva outbound_message_id
- Quando ação == suggested (modo humano):
  - NÃO envia
  - Marca requires_review = true
  - Cria notificação pra Eduardo no painel

## Tarefa 7 — UI ajustes em /chat
- Indicador visual de mensagens enviadas por BRENO (badge)
- Se requires_review = true: destaque visual + botão "Aprovar e enviar" / "Rejeitar"
- Toggle "Pausar BRENO nesta conversa" (seta breno_paused = true)
- Histórico de ações BRENO no painel lateral da conversa

## Tarefa 8 — Tela /agentes/breno
- Dashboard: total de mensagens hoje/semana, taxa de resposta automática, tempo médio
- Lista de interactions recentes
- Filtro por ação (sent/suggested/skipped)
- Permite ver detalhes de cada interaction (mensagem cliente + resposta BRENO)

## Tarefa 9 — Documentação
- Atualizar RESTRUCTURE.md
- docs/agentes/breno.md com fluxos
- Atualizar CLAUDE.md se necessário

# CRITÉRIO DE ACEITE

- [ ] Smoke test das 2 tasks documentado
- [ ] Schema breno_interactions criado e aplicado
- [ ] Coluna last_breno_handled_at e breno_paused em conversations
- [ ] 2 tasks BRENO refatoradas (sem anti-padrão + logAgentRun + modos)
- [ ] Bridge Server roteando webhook Evolution → BRENO sem quebrar chat existente
- [ ] Envio de resposta via Evolution funcionando (smoke test com número de teste)
- [ ] UI chat com indicador BRENO + botões de revisão
- [ ] UI /agentes/breno renderiza dados reais
- [ ] Smoke test E2E: cliente fictício envia msg → BRENO responde → aparece no chat
- [ ] Toggle "Pausar BRENO" funciona
- [ ] @cd-validator passa
- [ ] Chat ao vivo manual continua funcionando (regressão)

# RESTRIÇÕES

- NÃO quebrar chat ao vivo atual (Eduardo usa diariamente)
- NÃO enviar mensagens reais sem confirmação Wandson (usar número teste)
- BRENO NUNCA responde se conversa já tem humano atribuído (regra fixa)
- Se BRENO falhar ao gerar resposta: fallback → marca como suggested + notifica Eduardo
- Sem alterações em outros agentes

# USO DOS SUBAGENTS

- @cd-task-creator pra tasks
- @cd-migration-creator pra migrations
- @cd-validator obrigatório antes de PR

# OUTPUT BRUTO SEMPRE

Especialmente importante neste caso porque BRENO interage com cliente real.
Antes de enviar QUALQUER mensagem real: print do que vai enviar + aprovação Wandson.

Começar pela Tarefa 1. ME PERGUNTAR ao terminar cada tarefa.
```

---

## Checklist de validação

Antes de mergear `feature/v2-breno-whatsapp`:

- [ ] @cd-validator rodado, relatório na PR
- [ ] Smoke test E2E: msg fictícia → BRENO → resposta no WhatsApp teste
- [ ] Modos humano/híbrido/IA todos testados manualmente
- [ ] Chat ao vivo manual funciona (Eduardo confirma)
- [ ] BRENO NÃO responde em conversa com humano atribuído (regra dura)
- [ ] Migrations aplicadas em DEV e PROD
- [ ] Sem regressão em outros agentes (DELI, LARA, CORA, MAX, NOVA)

## Estimativa

- Tarefa 1 (smoke): 30min
- Tarefa 2 (mapping): 1-2h
- Tarefas 3-6 (código): 2-3 dias
- Tarefas 7-8 (UI): 1-2 dias
- Tarefa 9 (docs): 1h
- Validação + PR: 1 dia

**Total: 4-7 dias úteis** (1 semana com folga)
