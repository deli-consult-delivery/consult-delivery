# Requirements — Módulo Análise iFood

**Projeto:** Módulo Análise iFood — Consult Delivery
**Versão:** v1 (MVP interno)
**Data:** 2026-05-01

---

## v1 Requirements

### Schema & Data Layer

- [ ] **SCHEMA-01**: Migration cria tabela `analises` com campos: `job_id`, `tenant_id`, `cliente_id`, `status` (pending/processing/done/error), `drive_link`, `periodo`, `tipo_analise`, `resultado_json` (JSONB), `html_relatorio` (TEXT), `mensagem_whatsapp`, `error_message`, `whatsapp_sent`, `criado_por`, `created_at`, `updated_at`
- [ ] **SCHEMA-02**: Tabela `analises` tem `REPLICA IDENTITY FULL` + publicada no canal Realtime do Supabase
- [ ] **SCHEMA-03**: RLS na tabela `analises` isola por tenant (consultor vê só análises do seu tenant)
- [ ] **SCHEMA-04**: Index composto `(tenant_id, status)` para queries de polling; index em `job_id` para lookup direto
- [ ] **SCHEMA-05**: Funções em `src/lib/api.js` — `createAnalise`, `getAnalise`, `listAnalises`, `subscribeToAnalise`

### Trigger & Form (Frontend)

- [ ] **TRIGGER-01**: Tela "Análise iFood" acessível pelo menu lateral da plataforma
- [ ] **TRIGGER-02**: Formulário com: seletor de cliente (vem do CRM, filtrado por tenant), campo de link do Google Drive, seletor de período (diária / semanal / mensal) e botão "Iniciar Análise"
- [ ] **TRIGGER-03**: Botão "Iniciar Análise" desabilitado imediatamente após primeiro clique (previne triggers duplicados)
- [ ] **TRIGGER-04**: Frontend faz INSERT na tabela `analises` com status `pending`, recebe `job_id`, então dispara webhook n8n com o `job_id` + dados da loja

### Pipeline n8n

- [ ] **PIPE-01**: Webhook n8n responde imediatamente (Respond: Immediately) com `200 OK + job_id` — não bloqueia o frontend
- [ ] **PIPE-02**: n8n faz PATCH na row para `status = processing` logo após receber o webhook
- [ ] **PIPE-03**: n8n extrai `folder_id` do link do Drive via regex (`/\/folders\/([a-zA-Z0-9_-]{10,})/`)
- [ ] **PIPE-04**: n8n lista arquivos da pasta (máx 15 arquivos, exclui subpastas) usando conta `automacao@consultdelivery.com.br` via OAuth2
- [ ] **PIPE-05**: n8n faz download das imagens (PNG/JPG, rejeita >5MB) e exporta CSVs como texto
- [ ] **PIPE-06**: n8n chama Anthropic API (`claude-sonnet-4-6`, `max_tokens=8096`, tool-use mode para JSON obrigatório) com imagens em base64 + CSVs + system prompt do analista
- [ ] **PIPE-07**: n8n gera HTML do relatório a partir do JSON retornado pelo Claude
- [ ] **PIPE-08**: n8n faz PATCH na row: `status = done`, `resultado_json`, `html_relatorio`, `mensagem_whatsapp`
- [ ] **PIPE-09**: n8n faz INSERT das top-5 prioridades como tarefas na tabela `tasks` do Kanban
- [ ] **PIPE-10**: n8n envia WhatsApp via Evolution API (branch não-fatal — falha não reverte análise); registra `whatsapp_sent = false` em caso de erro
- [ ] **PIPE-11**: Caminho de erro: qualquer falha faz PATCH para `status = error`, `error_message` com mensagem legível

### Relatório & Resultado (Frontend)

- [ ] **REPORT-01**: Frontend assina Realtime na row da análise (filtro por `job_id`); fallback de polling a cada 5s caso WebSocket caia; timeout de 2 minutos exibe erro
- [ ] **REPORT-02**: Estado "Em processamento" mostra spinner com indicadores de etapa (Lendo Drive → Analisando com IA → Salvando resultados)
- [ ] **REPORT-03**: Badge de saúde geral (`saudavel` / `atencao` / `critico`) visível no topo do relatório
- [ ] **REPORT-04**: Relatório HTML renderizado dentro da plataforma (iframe ou container dedicado) após análise concluir
- [ ] **REPORT-05**: Top 5 prioridades exibidas em cards com urgência (hoje / semana / próximo ciclo) e impacto financeiro estimado
- [ ] **REPORT-06**: Estado de erro exibe `error_message` legível + botão "Tentar novamente" que cria nova análise para o mesmo cliente

### Ações Pós-Análise

- [ ] **ACTION-01**: Botão "Criar Tarefas no Kanban" mostra modal de preview das top-5 tarefas antes de confirmar (tarefas já foram criadas pelo n8n — botão é para navegar ou revisar)
- [ ] **ACTION-02**: Botão "Enviar WhatsApp" mostra preview da `mensagem_whatsapp` gerada pelo Claude; consultor confirma antes de enviar; chama Edge Function que aciona Evolution API
- [ ] **ACTION-03**: Flag `whatsapp_sent` atualizada para `true` após envio confirmado

### Histórico

- [ ] **HIST-01**: Aba ou seção "Histórico de Análises" por cliente exibe lista com: data, tipo, badge saúde, quem disparou
- [ ] **HIST-02**: Consultor pode abrir qualquer análise anterior e ver o relatório HTML completo
- [ ] **HIST-03**: Análise anterior aparece no contexto da próxima (campo `evolucao` do JSON mostra melhorou/piorou)

### Infraestrutura de Resiliência

- [ ] **INFRA-01**: pg_cron (ou workflow n8n agendado) define `status = error` para rows presas em `processing` por mais de 5 minutos
- [ ] **INFRA-02**: Nó HTTP Request n8n tem "Retry on fail" ativado (3 tentativas, intervalo 10s) para chamada Anthropic
- [ ] **INFRA-03**: Workflow separado n8n Error Trigger captura falhas não tratadas e escreve `status = error` na row correspondente

---

## v2 Requirements (diferidos)

- Comparativo visual entre análises (gráficos de evolução por KPI)
- Disparo em lote para todos os clientes de uma vez
- Análises agendadas automaticamente (semanais/mensais)
- Export PDF do relatório
- Portal do cliente (dono da loja acessa seus próprios relatórios)
- Notificação WhatsApp para o consultor quando análise finaliza
- Interface de edição das regras YAML por nicho
- Filtros e busca no histórico de análises

---

## Out of Scope (v1)

- **Integração ClickUp** — substituída pelo Kanban interno da plataforma
- **Upload direto de arquivos** — consultores já usam Drive; link é suficiente
- **Interface de edição do system prompt** — Wandson gerencia diretamente no n8n
- **Multi-idioma** — plataforma é PT-BR only
- **API pública** — acesso apenas pela interface da plataforma

---

## Traceability

| REQ-ID | Phase | Status |
|--------|-------|--------|
| SCHEMA-01 | Phase 1 — Foundation | Pending |
| SCHEMA-02 | Phase 1 — Foundation | Pending |
| SCHEMA-03 | Phase 1 — Foundation | Pending |
| SCHEMA-04 | Phase 1 — Foundation | Pending |
| SCHEMA-05 | Phase 1 — Foundation | Pending |
| TRIGGER-01 | Phase 1 — Foundation | Pending |
| TRIGGER-02 | Phase 1 — Foundation | Pending |
| TRIGGER-03 | Phase 1 — Foundation | Pending |
| TRIGGER-04 | Phase 1 — Foundation | Pending |
| PIPE-01 | Phase 2 — Pipeline n8n | Pending |
| PIPE-02 | Phase 2 — Pipeline n8n | Pending |
| PIPE-03 | Phase 2 — Pipeline n8n | Pending |
| PIPE-04 | Phase 2 — Pipeline n8n | Pending |
| PIPE-05 | Phase 2 — Pipeline n8n | Pending |
| PIPE-06 | Phase 2 — Pipeline n8n | Pending |
| PIPE-07 | Phase 2 — Pipeline n8n | Pending |
| PIPE-08 | Phase 2 — Pipeline n8n | Pending |
| PIPE-09 | Phase 2 — Pipeline n8n | Pending |
| PIPE-10 | Phase 2 — Pipeline n8n | Pending |
| PIPE-11 | Phase 2 — Pipeline n8n | Pending |
| INFRA-01 | Phase 2 — Pipeline n8n | Pending |
| INFRA-02 | Phase 2 — Pipeline n8n | Pending |
| INFRA-03 | Phase 2 — Pipeline n8n | Pending |
| REPORT-01 | Phase 3 — Report & Actions UI | Pending |
| REPORT-02 | Phase 3 — Report & Actions UI | Pending |
| REPORT-03 | Phase 3 — Report & Actions UI | Pending |
| REPORT-04 | Phase 3 — Report & Actions UI | Pending |
| REPORT-05 | Phase 3 — Report & Actions UI | Pending |
| REPORT-06 | Phase 3 — Report & Actions UI | Pending |
| ACTION-01 | Phase 3 — Report & Actions UI | Pending |
| ACTION-02 | Phase 3 — Report & Actions UI | Pending |
| ACTION-03 | Phase 3 — Report & Actions UI | Pending |
| HIST-01 | Phase 3 — Report & Actions UI | Pending |
| HIST-02 | Phase 3 — Report & Actions UI | Pending |
| HIST-03 | Phase 3 — Report & Actions UI | Pending |
