# Sprint — Refatoração Chat Unificado → Chat Ao Vivo

**Data:** 05/05/2026
**Aprovado por:** Wandson Silva (CEO)
**Status:** Pronto para execução pelo Claude Code
**Faseamento:** 3 sprints sequenciais
**Estimativa total:** 14-18 dias úteis (3 sprints de ~5-6 dias cada)
**Milestone alvo:** V2 — Etapa 2A (após fechar 1E DELI Realtime)

---

## Sumário

1. [Contexto e Objetivo](#1-contexto-e-objetivo)
2. [Decisões arquiteturais aprovadas](#2-decisões-arquiteturais-aprovadas)
3. [Análise comparativa — referência vs atual](#3-análise-comparativa--referência-vs-atual)
4. [Mapeamento completo de recursos](#4-mapeamento-completo-de-recursos)
5. [Sprint 1 — Renomeação + Layout 3-colunas + Perfil base](#5-sprint-1--renomeação--layout-3-colunas--perfil-base)
6. [Sprint 2 — Departamentos + Tags + Histórico + Timeline](#6-sprint-2--departamentos--tags--histórico--timeline)
7. [Sprint 3 — Ações + IFood + Workflow + Compositor avançado](#7-sprint-3--ações--ifood--workflow--compositor-avançado)
8. [Schema de migrations](#8-schema-de-migrations)
9. [Critérios de aceite por sprint](#9-critérios-de-aceite-por-sprint)
10. [Riscos e mitigações](#10-riscos-e-mitigações)
11. [Checklist final](#11-checklist-final)

---

## 1. Contexto e Objetivo

A tela atual `Chat Unificado` da plataforma Consult Delivery é funcional mas básica — entrega o WhatsApp bidirecional (entregue na Etapa 1F da V1) mas falta a profundidade operacional que o time já está acostumado a usar em outra ferramenta legada chamada **Chat Ao Vivo**.

**Objetivo:** Refatorar a tela para replicar a experiência operacional do Chat Ao Vivo (referência), mantendo 100% a identidade visual da Consult Delivery (logo foguete vermelho, cores atuais, dark mode, componentes Shadcn/Tailwind já existentes).

**Diferencial:** Continua sendo Chat Ao Vivo + WhatsApp + Grupos + Interno + Agentes IA num só lugar — algo que o ClickUp não tem.

---

## 2. Decisões arquiteturais aprovadas

| Decisão | Aprovada |
|---|---|
| Faseamento em 3 sprints (não tudo de uma vez) | ✅ |
| Renomear "Chat Unificado" → "Chat Ao Vivo" em sidebar, breadcrumbs, código (paths/rotas), labels | ✅ |
| Departamentos **complementam** RBAC (não substituem). RBAC = quem é a pessoa, Departamento = onde a conversa está roteada | ✅ |
| Painel direito integra com `customers`/`lojas` (já existentes) + tabelas auxiliares novas (`lead_notes`, `lead_tags`, `conversation_actions`, `conversation_history`) | ✅ |
| Tabela `conversations` mantém estrutura atual; ganha colunas novas (`department_id`, `status`, `closed_at`, `closed_by`) | ✅ |
| Sistema de departamentos é **independente** do RBAC: uma pessoa tem 1 papel mas pode ser membro de N departamentos | ✅ |

### Princípios não-negociáveis

1. **Multi-tenant em todas as tabelas novas** — `tenant_id` obrigatório, RLS validando.
2. **Migrations versionadas em Git** — nunca alterar schema direto no painel Supabase.
3. **Nada de mock** — toda tela puxa dado real do banco.
4. **Compatibilidade com Etapa 1F (WhatsApp bidirecional)** — não quebrar webhook Evolution → Edge Function existente.
5. **DELI continua não respondendo cliente** — refatoração não muda regra dos drafts.

---

## 3. Análise comparativa — referência vs atual

### Imagem 1 (referência — Chat Ao Vivo antigo)

**Estrutura:** 4 colunas (sidebar global + lista conversas + janela conversa + painel lead)

**Recursos identificados:**

#### Sidebar global (extrema esquerda)
- Logo
- Dashboard
- Filtros
- Contatos
- Pipelines/funis
- Chat (atual)
- Calendário
- Notificações
- Ajuda
- Configurações

#### Painel de conversas (lista)
- Busca por contato
- Cards de conversa com:
  - Foto/avatar
  - Nome
  - Preview da última mensagem
  - Data
  - Badge de status (`Finalizada`, `Em andamento`, etc)
  - **Tags coloridas** (`propietari...`, `Promoção`, `BlackFrid...`, `+6`)
  - **Ícone de cronômetro** (timer/SLA de atraso)

#### Janela de conversa (centro)
- Header com:
  - Avatar + Nome do contato
  - **Indicador de departamento atual** (`Wandson | Mkt` com dropdown pra trocar)
  - Botão **Reabrir** (quando finalizada)
  - Menu de ações (...)
  - ID da conversa (#c7100)
- Mensagens com:
  - Avatar + Nome do remetente colorido
  - Horário
  - Bubble
- **Eventos do sistema** centralizados na timeline:
  - `13 de abr. 12:48 - Wandson Silva finalizou o atendimento`
  - `14 de abr. 19:01 - moveu para o departamento Atendimento`
  - `14 de abr. 19:01 - moveu para o departamento Marketing`
  - `15 de abr. 10:37 - Wandson Silva moveu para o departamento`
- **Separador de data** (`14 de abr.`)
- **Mensagens marcadas como Automação** (label `Automação • 11:25` + ícone bot)
- Compositor com ícones:
  - Anexo (+)
  - Template/atalho rápido
  - Agendar mensagem
  - Citação/resposta rápida
  - Áudio (microfone)
  - Transcrição/Whisper
  - Campo texto
  - Emoji

#### Painel direito (perfil do lead) — **TODO COLLAPSIBLE**
- **Header:** Avatar + Nome + link externo + botão `+ Adicionar tags`
- **Ações** (sempre visível no topo):
  - `+ Adicionar negócio`
  - `+ Executar automação`
  - `+ Adicionar lista`
- **Perfil:**
  - Nome, Email, Telefone (bandeira BR), Empresa, Site, Documento (CPF/CNPJ), Data de Nascimento
- **Notas:** textarea livre
- **Endereço:** rua, número, bairro, cidade, estado, CEP
- **Dados do Lead:** custom fields adicionáveis
- **IFood:** integração específica (URL loja, métricas resumidas, link)
- **Histórico:** filtro + botão Adicionar — registra ações executadas (Tag `RecebeuBoasVindas`)

#### Bot flutuante (IA)
- Ícone azul flutuante no canto inferior direito → chat com IA assistente

---

### Imagem 2 (atual — Chat Unificado da Consult Delivery)

**Estrutura:** 2 colunas (lista conversas + janela conversa). **Falta painel direito inteiro.**

**O que JÁ TEM (manter):**
- ✅ Sidebar global (foguete + ícones)
- ✅ Filtros de canal (`WhatsApp` / `Grupos` / `Interno` / `Todas`)
- ✅ Cards de conversa com badges de status (`Atendimento Iniciado` / `Aguardando Atendimento`)
- ✅ Indicadores de mensagem nova (•)
- ✅ Topbar global (logo, busca, tenant switcher, notificações, tema, avatar)
- ✅ Realtime conectado (badge verde "WhatsApp conectado — dados em tempo real")
- ✅ Compositor básico (anexo, emoji, áudio, comando `/`)
- ✅ Botão `Finalizar` no header da conversa

**O que FALTA (implementar):**
- ❌ Painel direito completo (Perfil/Notas/Tags/Endereço/Dados/IFood/Histórico/Ações)
- ❌ Sistema de departamentos + transferência entre eles
- ❌ Tags coloridas em conversas e contatos
- ❌ Listas (segmentação de leads)
- ❌ Eventos do sistema na timeline (finalizou, transferiu departamento)
- ❌ Workflow de status (`Aberta` → `Em Atendimento` → `Aguardando` → `Finalizada` + `Reabrir`)
- ❌ Botão "Reabrir" quando finalizada
- ❌ Indicador de departamento no header da conversa com dropdown
- ❌ Compositor avançado (templates, agendar, citação, transcrição)
- ❌ Mensagens marcadas como `Automação`
- ❌ Histórico de ações (tag aplicada, depto trocado, automação executada)

---

## 4. Mapeamento completo de recursos

### Recursos por categoria

#### A. Identidade e nomenclatura
- A1. Renomear sidebar item "Chat Unificado" → **"Chat Ao Vivo"**
- A2. Atualizar breadcrumb: `Plataforma > Chat Unificado` → `Plataforma > Chat Ao Vivo`
- A3. Renomear rota `/chat-unificado` → `/chat-ao-vivo` (com redirect legacy)
- A4. Renomear paths internos: `ChatUnificadoPage.tsx` → `ChatAoVivoPage.tsx`, `useChatUnificado` → `useChatAoVivo`, etc
- A5. Atualizar referências em CLAUDE.md, docs, RESTRUCTURING_REVISED.md

#### B. Layout 3-colunas + painel direito
- B1. Criar `ChatLayout.tsx` com 3 colunas redimensionáveis (lista | conversa | painel lead)
- B2. Criar `LeadPanel.tsx` (painel direito) com seções collapsibles
- B3. Componente `LeadPanelHeader` (avatar + nome + tags + ações rápidas)
- B4. Seção `LeadProfile` (Nome, Email, Telefone, Empresa, Site, Documento, Aniversário)
- B5. Seção `LeadNotes` (textarea com auto-save debounced)
- B6. Seção `LeadAddress` (CEP com autocomplete via ViaCEP)
- B7. Toggle de painel direito (esconder/mostrar) para mobile

#### C. Sistema de departamentos
- C1. Tabela `departments` (tenant-scoped)
- C2. Tabela `department_members` (user_id, department_id) — N:N
- C3. Coluna `conversations.department_id` (FK)
- C4. Componente `DepartmentSelector` no header da conversa (dropdown)
- C5. Action de transferência (`transferConversation(conversationId, departmentId)`)
- C6. Evento `department_changed` registrado em `conversation_events`
- C7. Filtro de conversas por departamento na lista
- C8. Página de admin para gerenciar departamentos (criar/editar/desativar)
- C9. Permissão `departments:manage` (RBAC) → quem pode editar deptos
- C10. **Departamentos seed iniciais:** Atendimento, Marketing, Vendas, Financeiro, Suporte

#### D. Tags e Listas
- D1. Tabela `lead_tags` (id, tenant_id, name, color, created_at)
- D2. Tabela `customer_tags` (customer_id, tag_id) — N:N
- D3. Tabela `conversation_tags` (conversation_id, tag_id) — N:N (tags na conversa também)
- D4. Componente `TagPicker` (popover com criar/buscar tag)
- D5. Componente `TagBadge` (com cor)
- D6. Tabela `lead_lists` (id, tenant_id, name, description)
- D7. Tabela `lead_list_members` (list_id, customer_id)
- D8. Componente `ListPicker` (mesmo padrão do TagPicker)
- D9. Página `/listas` para criar/gerenciar listas
- D10. Filtro na lista de conversas por tag e por lista

#### E. Eventos do sistema na timeline
- E1. Tabela `conversation_events` (id, conversation_id, event_type, actor_id, actor_type, metadata, ts)
- E2. Tipos de evento: `created`, `assigned`, `unassigned`, `transferred`, `tagged`, `untagged`, `closed`, `reopened`, `note_added`, `automation_executed`
- E3. Componente `TimelineEvent` (renderiza diferente por tipo)
- E4. Mesclar `whatsapp_messages` + `conversation_events` na renderização cronológica
- E5. Trigger automático: ao mudar `conversations.department_id` → INSERT em `conversation_events`
- E6. Trigger automático: ao mudar `conversations.status` → INSERT em `conversation_events`

#### F. Workflow de status
- F1. Coluna `conversations.status` ENUM (`open`, `in_progress`, `waiting`, `closed`, `archived`)
- F2. Coluna `conversations.closed_at`, `conversations.closed_by`, `conversations.close_reason`
- F3. Botão `Finalizar` → muda status para `closed` + abre modal de motivo opcional
- F4. Botão `Reabrir` → muda status para `in_progress` quando `closed`
- F5. Renderização condicional do botão (Finalizar vs Reabrir) no header
- F6. Filtros na lista: `Abertas`, `Em atendimento`, `Aguardando`, `Finalizadas`, `Todas`
- F7. Auto-status: ao agente IA responder → `waiting`; ao humano responder → `in_progress`

#### G. Custom fields (Dados do Lead)
- G1. Tabela `lead_custom_fields` (tenant-scoped, definição de campos)
- G2. Tabela `customer_field_values` (customer_id, field_id, value JSONB)
- G3. Página de admin `/configuracoes/campos-lead`
- G4. Renderização dinâmica na seção `LeadCustomFields`
- G5. Tipos suportados: text, number, date, select, multiselect, boolean, url

#### H. Integração IFood (painel direito)
- H1. Reusar tabela `lojas` (já existe)
- H2. Componente `LeadIFoodSection` busca `lojas` linkada ao customer
- H3. Mostra: nome loja, status, ticket médio, faturamento mês, link iFood
- H4. Botão "Ver análise completa" → abre `/analise-ifood/{loja_id}`
- H5. Coluna `customers.loja_id` (FK opcional)

#### I. Ações no lead
- I1. Botão `+ Adicionar negócio` → abre modal com formulário (CRM básico, depende V2)
- I2. Botão `+ Executar automação` → abre modal com listagem de automações n8n disponíveis
- I3. Botão `+ Adicionar lista` → abre `ListPicker`
- I4. Tabela `customer_actions` (id, customer_id, action_type, payload, executed_by, executed_at)
- I5. Toda ação registrada em `conversation_events`

#### J. Histórico do lead
- J1. Reusar `conversation_events` filtrado por customer_id
- J2. Componente `LeadHistory` na seção painel direito
- J3. Filtro por tipo de evento
- J4. Botão `+ Adicionar` evento manual (anotação datada)

#### K. Compositor avançado
- K1. Botão `Templates` → abre popover com templates de mensagem
- K2. Tabela `message_templates` (tenant-scoped, name, body, variables JSONB)
- K3. Botão `Agendar` → modal de scheduling (envia em data futura)
- K4. Tabela `scheduled_messages` (id, conversation_id, body, send_at, status)
- K5. Cron via Edge Function que processa `scheduled_messages` a cada 1 min
- K6. Botão `Citar` → cita mensagem anterior
- K7. Mensagens com flag `is_automation` → renderizam com label `Automação • hora` + ícone bot
- K8. Coluna `whatsapp_messages.source` ENUM (`human`, `automation`, `agent_ia`, `template`)

#### L. UX detalhes
- L1. Cards de conversa com tags coloridas truncadas (`+N` quando >3)
- L2. Cronômetro/SLA visual quando conversa fica >30min sem resposta
- L3. Avatar com badge de canal (whatsapp/grupo/interno)
- L4. Hover na conversa → quick actions (atribuir, finalizar, marcar lida)
- L5. Atalhos de teclado: `j/k` (próx/ant conversa), `r` (responder), `e` (finalizar), `t` (tag)

---

## 5. Sprint 1 — Renomeação + Layout 3-colunas + Perfil base

**Duração:** 5 dias úteis
**Objetivo:** Reestruturação visual + nomenclatura nova + painel direito mínimo viável

### Escopo

| Recurso | Categoria |
|---|---|
| A1-A5: Renomeação completa | Identidade |
| B1-B7: Layout 3-colunas + LeadPanel base | Layout |
| Seções: Perfil + Notas + Endereço | Painel direito |
| F1-F5: Workflow de status básico (Finalizar/Reabrir) | Status |
| Eventos: `created`, `closed`, `reopened` | Timeline |

### Migrations

- `20260520_001_rename_chat_unificado.sql` — renomeia constraints/índices que tem `unificado` no nome
- `20260520_002_conversations_status_workflow.sql` — adiciona ENUM status, closed_at, closed_by, close_reason
- `20260520_003_conversation_events.sql` — cria tabela base de eventos
- `20260520_004_lead_notes_and_address.sql` — cria `customer_notes`, `customer_addresses`

### Componentes novos

- `ChatLayout.tsx` (3 colunas redimensionáveis com `react-resizable-panels`)
- `LeadPanel.tsx`
- `LeadPanelHeader.tsx`
- `LeadProfileSection.tsx`
- `LeadNotesSection.tsx`
- `LeadAddressSection.tsx`
- `ConversationStatusBadge.tsx`
- `ReopenButton.tsx`
- `TimelineEvent.tsx` (suportando 3 tipos iniciais)

### Telas afetadas

- `/chat-unificado` → `/chat-ao-vivo` (com redirect)
- Sidebar item renomeado
- Breadcrumb atualizado

### Critérios de aceite (Sprint 1)

- [ ] Rota antiga `/chat-unificado` redireciona pra `/chat-ao-vivo` (HTTP 301)
- [ ] Nenhum arquivo no repo contém string `chat-unificado` ou `ChatUnificado` (exceto migrations históricas)
- [ ] Layout 3-colunas funciona em desktop, painel direito colapsa em mobile
- [ ] Selecionar uma conversa carrega perfil real do `customers` no painel direito
- [ ] Editar nota → salva em `customer_notes` com debounce 1s
- [ ] Botão `Finalizar` muda status para `closed` + registra evento `closed`
- [ ] Botão `Reabrir` aparece quando `closed` + muda para `in_progress` + registra evento `reopened`
- [ ] Eventos aparecem centralizados na timeline com formato `dd de mmm. hh:mm - {ator} {ação}`
- [ ] Validação manual com Wandson + Yasmin
- [ ] Migrations aplicadas no Supabase de DEV antes de PROD
- [ ] PR mergeado em `main` com squash commit

---

## 6. Sprint 2 — Departamentos + Tags + Histórico + Timeline

**Duração:** 5-6 dias úteis
**Objetivo:** Sistema operacional de roteamento e organização

### Escopo

| Recurso | Categoria |
|---|---|
| C1-C10: Sistema completo de departamentos | Departamentos |
| D1-D10: Tags + Listas | Organização |
| E1-E6: Timeline avançada (todos eventos) | Timeline |
| J1-J4: Histórico do lead | Painel direito |
| F6-F7: Filtros e auto-status | Status |

### Migrations

- `20260527_005_departments.sql` — tabelas `departments`, `department_members`, FK em `conversations`
- `20260527_006_tags_and_lists.sql` — `lead_tags`, `customer_tags`, `conversation_tags`, `lead_lists`, `lead_list_members`
- `20260527_007_conversation_events_full.sql` — adiciona triggers automáticos para todos os eventos
- `20260527_008_seed_departments.sql` — seed: Atendimento, Marketing, Vendas, Financeiro, Suporte

### Componentes novos

- `DepartmentSelector.tsx` (dropdown no header da conversa)
- `DepartmentManagementPage.tsx` (admin)
- `TagPicker.tsx`
- `TagBadge.tsx`
- `ListPicker.tsx`
- `ListManagementPage.tsx`
- `LeadHistorySection.tsx`
- `ConversationFiltersBar.tsx` (filtros: depto + tag + lista + status)

### Critérios de aceite (Sprint 2)

- [ ] Migrations aplicadas + 5 departamentos seed criados no tenant `consult`
- [ ] Dropdown de departamento aparece no header da conversa, troca persiste em `conversations.department_id`
- [ ] Trocar departamento gera evento `transferred` na timeline com nome do depto antigo e novo
- [ ] Tags coloridas aparecem nos cards de conversa (truncadas em `+N`)
- [ ] `TagPicker` permite criar tag nova com seletor de cor
- [ ] Aplicar tag em customer → reflete em todas as conversas do customer
- [ ] Filtros funcionais: por departamento, por tag, por lista, por status
- [ ] Histórico do lead mostra todos os eventos relacionados (cross-conversation)
- [ ] RLS valida tenant em TODAS as tabelas novas
- [ ] Páginas admin `/configuracoes/departamentos` e `/configuracoes/listas` funcionando
- [ ] Permissão `departments:manage` validada via `RequireRole`

---

## 7. Sprint 3 — Ações + IFood + Workflow + Compositor avançado

**Duração:** 5-6 dias úteis
**Objetivo:** Profundidade operacional e integrações

### Escopo

| Recurso | Categoria |
|---|---|
| H1-H5: Integração IFood no painel | Integração |
| I1-I5: Botões Ações (Negócio/Automação/Lista) | Ações |
| G1-G5: Custom fields | Dados do Lead |
| K1-K8: Compositor avançado completo | Compositor |
| L1-L5: UX details | Polimento |

### Migrations

- `20260603_009_lead_custom_fields.sql` — `lead_custom_fields`, `customer_field_values`
- `20260603_010_message_templates.sql` — `message_templates` + RLS
- `20260603_011_scheduled_messages.sql` — `scheduled_messages` + cron
- `20260603_012_customer_actions.sql` — `customer_actions` (log de ações)
- `20260603_013_messages_source.sql` — adiciona ENUM `source` em `whatsapp_messages`
- `20260603_014_link_customers_lojas.sql` — adiciona `customers.loja_id`

### Edge Functions novas

- `process-scheduled-messages` — cron a cada 1 min, processa fila de agendadas
- `execute-n8n-automation` — proxy seguro para invocar webhook n8n com auditoria

### Componentes novos

- `LeadIFoodSection.tsx`
- `LeadCustomFieldsSection.tsx`
- `LeadActionsSection.tsx` (3 botões topo do painel)
- `AddDealModal.tsx`
- `ExecuteAutomationModal.tsx` (lista n8n flows + executar)
- `MessageTemplatesPicker.tsx`
- `ScheduleMessageModal.tsx`
- `MessageBubbleAutomation.tsx` (variante para `is_automation`)
- `ConversationSLAIndicator.tsx` (cronômetro de atraso)

### Critérios de aceite (Sprint 3)

- [ ] Painel direito mostra seção IFood quando customer tem `loja_id` linkada
- [ ] Botão "Ver análise completa" abre `/analise-ifood/{loja_id}` em nova aba
- [ ] Custom fields configuráveis em `/configuracoes/campos-lead`
- [ ] 5 tipos de campo funcionando (text/number/date/select/boolean)
- [ ] Botão `+ Adicionar negócio` abre modal e registra em `customer_actions`
- [ ] Botão `+ Executar automação` lista flows n8n disponíveis e executa via Edge Function
- [ ] Toda ação executada gera evento na `conversation_events` + entrada em `customer_actions`
- [ ] Templates de mensagem funcionam com variáveis `{{nome}}`, `{{loja}}`, etc
- [ ] Agendar mensagem persiste em `scheduled_messages` + cron envia no horário
- [ ] Mensagens com `source = 'automation'` renderizam com label `Automação • hora` + ícone bot
- [ ] Cronômetro/SLA aparece em conversas sem resposta há >30 min
- [ ] Atalhos de teclado funcionando (j/k/r/e/t)
- [ ] Documentação atualizada em CLAUDE.md sobre Chat Ao Vivo

---

## 8. Schema de migrations

### Resumo das 14 migrations propostas

| Sprint | Arquivo | Descrição |
|---|---|---|
| 1 | `20260520_001_rename_chat_unificado.sql` | Renomeia índices/constraints |
| 1 | `20260520_002_conversations_status_workflow.sql` | ENUM status + closed_* |
| 1 | `20260520_003_conversation_events.sql` | Tabela base de eventos |
| 1 | `20260520_004_lead_notes_and_address.sql` | Notas + endereço |
| 2 | `20260527_005_departments.sql` | Departments + members + FK |
| 2 | `20260527_006_tags_and_lists.sql` | Tags + Lists + N:N |
| 2 | `20260527_007_conversation_events_full.sql` | Triggers todos eventos |
| 2 | `20260527_008_seed_departments.sql` | Seed 5 deptos |
| 3 | `20260603_009_lead_custom_fields.sql` | Custom fields |
| 3 | `20260603_010_message_templates.sql` | Templates msg |
| 3 | `20260603_011_scheduled_messages.sql` | Agendamento |
| 3 | `20260603_012_customer_actions.sql` | Log ações |
| 3 | `20260603_013_messages_source.sql` | ENUM source |
| 3 | `20260603_014_link_customers_lojas.sql` | FK loja |

### Tabelas novas (totais)

- `customer_notes`
- `customer_addresses`
- `conversation_events`
- `departments`
- `department_members`
- `lead_tags`
- `customer_tags`
- `conversation_tags`
- `lead_lists`
- `lead_list_members`
- `lead_custom_fields`
- `customer_field_values`
- `message_templates`
- `scheduled_messages`
- `customer_actions`

### Tabelas alteradas

- `conversations` (+`department_id`, +`status`, +`closed_at`, +`closed_by`, +`close_reason`)
- `whatsapp_messages` (+`source` ENUM)
- `customers` (+`loja_id` FK opcional)

### RLS — política padrão

Todas as tabelas novas seguem o template:

```sql
ALTER TABLE {tabela} ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON {tabela}
  FOR ALL
  USING (tenant_id = (SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid() LIMIT 1));
```

---

## 9. Critérios de aceite por sprint

(Detalhados em cada seção. Resumo:)

### Sprint 1 — saída esperada
- Tela renomeada e re-rotulada em todo lugar
- Layout 3-colunas funcional
- Painel direito com Perfil + Notas + Endereço puxando dados reais
- Status workflow básico (Aberta/Finalizada/Reaberta) com timeline

### Sprint 2 — saída esperada
- Departamentos operacionais com transferência registrada
- Tags coloridas + Listas funcionais
- Timeline completa com todos os tipos de evento
- Filtros poderosos na lista de conversas

### Sprint 3 — saída esperada
- Integração IFood profunda no painel lead
- Ações executáveis (negócio, automação, lista) com log
- Custom fields configuráveis
- Compositor avançado com templates + agendamento + bot label

---

## 10. Riscos e mitigações

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| Quebrar webhook Evolution na renomeação | Média | Alto | Manter `chat-unificado` como rota redirect 301; testar webhook em DEV antes de prod |
| Yasmin trabalhando em paralelo no `yasmin/dev` causa conflito | Alta | Médio | Coordenar rebase ANTES do Sprint 1 começar; comunicar branches em uso |
| Performance da timeline com muitos eventos | Média | Médio | Index em `conversation_events(conversation_id, ts DESC)`; paginação 50 eventos |
| RLS quebrada em alguma tabela nova | Média | **Crítico** | Teste obrigatório com 2 tenants antes de PR |
| Agendamento de mensagens falha silenciosa | Média | Médio | Logs estruturados + retry com backoff; alerta DELI quando >5 mensagens em `failed` |
| Departamento substitui RBAC por engano | Baixa | **Crítico** | Documentar nesta sprint que são complementares; teste de auth em ambos |
| Cansaço/pressa gera alucinações como em 04/05 | Alta | **Crítico** | Output bruto > resumo confiante; validação SQL real antes de aceitar entrega |

---

## 11. Checklist final

### Antes de começar Sprint 1
- [ ] Etapa 1E (DELI Realtime) finalizada e mergeada
- [ ] V1 oficialmente fechada
- [ ] Yasmin fez rebase do `yasmin/dev` no `main` atualizado
- [ ] Backup do Supabase de PROD realizado
- [ ] Branch `feature/chat-ao-vivo-sprint-1` criado a partir de `main`
- [ ] Documento atual revisado por Wandson

### Durante cada sprint
- [ ] Migrations aplicadas em DEV antes de PROD
- [ ] Testes manuais com 2 tenants (validar RLS)
- [ ] Critérios de aceite assinados por Wandson
- [ ] PR revisado por Yasmin
- [ ] Squash merge em `main`
- [ ] Tag de versão (`v2.0-sprint1`, `v2.0-sprint2`, `v2.0-sprint3`)

### Após Sprint 3
- [ ] Atualizar CLAUDE.md (seção de Chat Ao Vivo)
- [ ] Atualizar `docs/fluxos/` com diagrama Mermaid novo
- [ ] Atualizar WikiBrain com nova página `Chat Ao Vivo`
- [ ] Retrospectiva (o que funcionou, o que não)
- [ ] Onboardar primeiro cliente real usando a nova tela

---

## Skills obrigatórias durante execução

Conforme CLAUDE.md seção 11:

1. **GSD** — Rodar `/gsd-discuss-phase` antes de iniciar cada Sprint. Capturar decisões com `/gsd-capture`. `/gsd-code-review` antes de PR.
2. **Graphify** — Antes de mexer em arquivo existente, consultar `graphify-out/graph.json`. Re-mapear depois de Sprint 2 e Sprint 3.
3. **WikiBrain** — Atualizar `WikiBrain/wiki/` com decisões e aprendizados após cada Sprint. Append em `log.md` ao final de cada sessão.

---

*Documento finalizado em 05/05/2026. Pronto para execução pelo Claude Code com supervisão de Wandson Silva.*
