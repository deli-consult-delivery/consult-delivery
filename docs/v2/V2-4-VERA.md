# V2 Feature 4 — VERA (BI & Relatórios)

**Prompt pra colar no Claude Code no repo `consult-delivery`.**

**Antes de colar:**
1. `cd "C:\Users\Consult Delivery\consult-delivery"`
2. `git checkout -b feature/v2-vera`
3. `claude`
4. Cola o prompt abaixo

---

## ⚠️ DECISÕES PENDENTES ANTES DE COMEÇAR

VERA é BI — depende de saber QUAIS métricas medir e PRA QUEM. Antes de iniciar:

1. **Quem recebe os relatórios?**
   - [ ] Só você (Wandson)?
   - [ ] Wandson + Wélida + Eduardo?
   - [ ] Cliente final (cada cliente vê o próprio)?
   - [ ] Todos os acima?

2. **Periodicidade?**
   - [ ] Diário (relatório matinal 8h)
   - [ ] Semanal (segunda 8h)
   - [ ] Mensal (dia 1)
   - [ ] Todas

3. **Métricas iniciais (mínimo viável)?**
   - [ ] Volume de mensagens por canal
   - [ ] Performance dos agentes (runs, custo, sucesso)
   - [ ] Conversões prospects → clientes (depende SOFIA)
   - [ ] Cobranças (depende CORA + Asaas)
   - [ ] Atividade de Wélida/Eduardo
   - [ ] Outras?

Não inicie sem decidir.

---

```
# OBJETIVO
Implementar VERA — Agente de BI e Relatórios. VERA gera relatórios 
periódicos automaticamente, detecta anomalias e responde perguntas sobre 
métricas em linguagem natural.

# CONTEXTO
- Doc autoritativo: RESTRUCTURE.md
- Subagents: @cd-task-creator, @cd-migration-creator, @cd-validator
- VERA é ZERO CÓDIGO — vamos criar do zero
- Dados-fonte: tudo no Supabase (agent_runs, conversations, messages, 
  cobrancas, prospects, clientes)
- VERA é **read-only** — só lê dados, nunca escreve nada além de seus 
  próprios relatórios

# IMPORTANTE — Configuração antes
Wandson, ME RESPONDA antes de começar:

1. Quem recebe relatórios?
2. Periodicidade?
3. Top 5 métricas que importam pra você?

Salvar respostas em docs/agentes/vera-config.md.

# TAREFAS

## Tarefa 0 — Captura de configuração
Perguntar Wandson as 3 perguntas acima. Salvar em docs/agentes/vera-config.md.
NÃO seguir sem isso.

## Tarefa 1 — Schema (use @cd-migration-creator)

### 1.1. Tabela vera_reports
- id uuid PK
- tenant_id uuid FK tenants
- tipo text (diario|semanal|mensal|customizado|anomalia)
- periodo_inicio timestamptz
- periodo_fim timestamptz
- titulo text
- resumo_executivo text
- conteudo_markdown text (relatório completo)
- conteudo_html text NULL (renderizado)
- metricas jsonb (dados estruturados)
- destinatarios text[] (emails ou user_ids)
- agent_run_id uuid FK agent_runs
- created_at timestamptz
- read_at timestamptz NULL
- RLS: tenant_id

### 1.2. Tabela vera_metricas_snapshot
Snapshot diário das métricas-chave (pra histórico e séries temporais).
- id uuid PK
- tenant_id uuid FK tenants
- data date
- metricas jsonb (snapshot do dia)
- created_at timestamptz
- UNIQUE (tenant_id, data)
- RLS: tenant_id

### 1.3. Tabela vera_anomalias
- id uuid PK
- tenant_id uuid FK tenants
- detectada_em timestamptz
- metrica text (qual KPI saiu do normal)
- valor_esperado numeric
- valor_observado numeric
- severidade text (info|warning|critical)
- explicacao text (VERA explica o porquê)
- notificado boolean DEFAULT false
- resolvida boolean DEFAULT false
- RLS: tenant_id

## Tarefa 2 — Views SQL pra agregação

Criar views materializadas (refresh diário) pra performance:

### 2.1. view_metricas_agentes_dia
Pra cada (tenant_id, data, agent_slug):
- num_runs
- num_success
- num_failed
- custo_total_usd
- duracao_media_ms

### 2.2. view_metricas_conversas_dia
Pra cada (tenant_id, data):
- num_conversas_novas
- num_mensagens_inbound
- num_mensagens_outbound
- num_respostas_breno (auto)
- num_respostas_humano
- tempo_medio_resposta_seg

### 2.3. view_metricas_negocio_dia
Pra cada (tenant_id, data):
- num_prospects_novos
- num_prospects_qualificados
- num_clientes_novos
- num_cobrancas_geradas
- valor_cobrancas_recebidas
- valor_cobrancas_pendentes

## Tarefa 3 — Tasks VERA (use @cd-task-creator)

### 3.1. vera-snapshot-diario
Schedule: cron diário 6h.
- Atualiza views materializadas
- Captura métricas do dia anterior
- Insere em vera_metricas_snapshot

### 3.2. vera-relatorio-diario
Schedule: cron diário 7h.
- Lê snapshot do dia anterior + 7 dias antes (comparativo)
- LLM gera resumo executivo em linguagem natural
- Identifica destaques (positivos e negativos)
- Salva em vera_reports
- Envia email pros destinatarios via SendGrid/Resend (verificar qual está configurado)

### 3.3. vera-relatorio-semanal
Schedule: cron segunda 8h.
- Lê 7 dias de snapshots
- Comparativo com semana anterior
- Gera gráficos em markdown (sparklines com biblioteca como chart.js ou recharts)
- Envia por email

### 3.4. vera-detectar-anomalia
Schedule: cron a cada 4h.
- Compara métricas das últimas 4h com média móvel de 14 dias
- Se desvio > 2 sigmas: cria anomalia
- LLM gera explicação contextual
- Se severidade = critical: notificação imediata pelo painel

### 3.5. vera-responder-pergunta
Síncrono (chamado pelo dashboard).
Input: { tenant_id, pergunta: string }
- LLM lê schema + views
- Gera SQL pra responder
- VALIDA SQL (apenas SELECT, nada de DROP/DELETE/UPDATE)
- Executa
- LLM interpreta resultado e responde em texto natural
- Inclui gráfico se apropriado

## Tarefa 4 — UI /agentes/vera

### 4.1. Tela principal
- Cards com KPIs do dia (comparativo com ontem/semana passada)
- Gráficos: tendência de 14 dias (recharts)
- Lista de últimos relatórios gerados
- Alertas de anomalias ativas

### 4.2. Tela de relatório individual
- Markdown renderizado
- Botão "Exportar PDF" (use pdf-skill se necessário)
- Botão "Enviar por email" (forçar envio se não foi automático)

### 4.3. Chat com VERA
- Pergunta em linguagem natural ("quantos clientes novos esta semana?")
- VERA responde com texto + gráfico inline
- Histórico de perguntas anteriores

## Tarefa 5 — Notificações
- Anomalias críticas: notificação no painel (canto superior direito)
- Relatórios prontos: badge nos cards
- Email automático conforme configuração

## Tarefa 6 — Permissões
- VERA respeita RBAC:
  - Admin: tudo
  - Marketing/Atendimento: relatórios da sua área
  - Financeiro: relatórios financeiros + cobranças
  - Viewer: read-only de relatórios públicos

## Tarefa 7 — Documentação
- docs/agentes/vera.md (fluxos, schedules, métricas)
- docs/agentes/vera-config.md (criado na Tarefa 0)
- Atualizar RESTRUCTURE.md
- Atualizar CLAUDE.md

# CRITÉRIO DE ACEITE

- [ ] Configuração VERA documentada (destinatários, periodicidade, KPIs)
- [ ] 3 migrations criadas e aplicadas
- [ ] 3 views materializadas criadas
- [ ] 5 tasks VERA implementadas
- [ ] Schedules ativas no Trigger.dev
- [ ] Email pelo menos 1 vez enviado (smoke test)
- [ ] UI /agentes/vera renderiza
- [ ] Chat com VERA responde pergunta simples (smoke test)
- [ ] Detecção de anomalia testada com dado artificial
- [ ] @cd-validator passa
- [ ] Sem regressão

# RESTRIÇÕES

- VERA é READ-ONLY. NUNCA escreve em tabelas que não sejam vera_*
- VERA NUNCA expõe dados de tenant diferente (RLS rigoroso)
- vera-responder-pergunta VALIDA SQL gerado (whitelist SELECT, blacklist tudo mais)
- Custo controlado: snapshot diário é cache pesado, evitar reler dados antigos
- Anomalias críticas notificam UMA VEZ, não spam

# USO DOS SUBAGENTS

- @cd-task-creator pra 5 tasks
- @cd-migration-creator pra 3 migrations + 3 views
- @cd-validator obrigatório

# OUTPUT BRUTO

Pra cada relatório gerado: mostrar markdown completo no output. 
Pra cada anomalia detectada: mostrar SQL que detectou + valores comparativos.

Começar pela Tarefa 0 (config). ME PERGUNTAR ao terminar cada tarefa.
```

---

## Estimativa

- Tarefa 0 (config): 30min-1h (Wandson responde)
- Tarefa 1 (schema): 1-2 dias
- Tarefa 2 (views SQL): 1-2 dias
- Tarefa 3 (5 tasks): 4-5 dias
- Tarefas 4-5 (UI + notif): 3-4 dias
- Tarefa 6 (permissões): 1 dia
- Tarefa 7 (docs): 2-3h
- Validação + PR: 1-2 dias

**Total: 11-17 dias úteis** (2-3 semanas)
