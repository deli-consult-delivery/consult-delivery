DOCUMENTO MESTRE - PLATAFORMA CONSULT DELIVERY v2.0
====================================================
Data de aprovação: 23/04/2026
Última revisão: 13/05/2026
Status: APROVADO - em execução (reestruturação Fase 0 concluída)

⚠️  DOC AUTORITATIVO: RESTRUCTURE.md (raiz do repo)
Em caso de divergência entre este CLAUDE.md e o RESTRUCTURE.md,
o RESTRUCTURE.md vence. Releia-o antes de assumir qualquer decisão
de stack, arquitetura ou fluxo de agente.

====================================================
1. VISÃO GERAL
====================================================

A Plataforma Consult Delivery é um SaaS multi-tenant de gestão para o segmento de delivery.

Objetivos:
- Uso interno primeiro (Consult Delivery)
- Vendida para outras consultorias e donos de loja

Módulos planejados:
- Chat unificado (WhatsApp + interno)
- Gestão de tarefas (Kanban)
- CRM
- Dashboards
- Financeiro
- Integração iFood
- Agentes de IA integrados

====================================================
2. ARQUITETURA APROVADA
====================================================

Frontend: React 18 + Vite + TailwindCSS
Banco de dados: Supabase (auth + realtime + RLS multi-tenant)
Orquestrador IA: Trigger.dev cloud (proj_slexhoelcjwgbopmbzzr) ← NOVO
Orquestrador de desenvolvimento: Claude Code (CLI Anthropic) — Antigravity local + claude-dev.service systemd na VPS (dev 24/7) ← NOVO
Runtime de agente: @anthropic-ai/sdk + web_search_20250305 ← NOVO
Validação: Zod ← NOVO
Bridge Server: Node.js/Express VPS porta 3001 (expandido)
WhatsApp: Evolution API
Payment: Asaas
Secrets: Infisical self-hosted (172.18.0.3:8080)
Deploy: GitHub Actions → GitHub Pages
Domínio: app.consultdelivery.com.br
GitHub: github.com/deli-consult-delivery/consult-delivery

OpenClaw: NÃO USADO — substituído por Claude Code + Trigger.dev (containers legacy podem permanecer na VPS porta 18789, mas não fazem parte do stack ativo)
n8n: NÃO USADO — execução de tarefas é 100% Trigger.dev
EvoNexus: EM AVALIAÇÃO (POC) — instalado em evonexus.evolutionfoundation.com.br (VPS), roda sobre Claude Code SDK; ainda não confirmado se entra na stack final

Bots Telegram ativos:
- @DeliConsultBot — agente analista-ifood (consultoria de lojas)

====================================================
3. STACK DEFINITIVA
====================================================

React 18 + Vite + TailwindCSS + Supabase + Trigger.dev + @anthropic-ai/sdk + Zod + Bridge Server + Evolution API + Asaas + Infisical + GitHub Pages

FORA DA STACK (não usar): n8n, OpenClaw
Em avaliação (POC, não usar em produção): EvoNexus

====================================================
4. INFRAESTRUTURA EXISTENTE
====================================================

VPS: 187.127.25.24 - Ubuntu 24.04 LTS
Docker v29.4 + Compose v5.1.2
Node.js v22.22.2
Bridge Server Node.js/Express porta 3001 (systemd persistente) — expandido Fase 0
Trigger.dev cloud: proj_slexhoelcjwgbopmbzzr (conectado, hello-world validado)
Infisical com secrets: ANTHROPIC_API_KEY, TRIGGER_SECRET_KEY, HEYGEN_API_KEY
GitHub: github.com/deli-consult-delivery/consult-delivery

Integrações validadas: Anthropic (SDK), Trigger.dev, Evolution, Google Drive, Asaas

OpenClaw 2026.5.2: legacy — containers podem permanecer rodando na porta 18789, mas não há agente ativo dependendo dele. Não invocar, não estender.
⚠️  Todo agente novo vai em trigger/ (Trigger.dev) orquestrado via Claude Code.

====================================================
5. AGENTES — IDENTIDADES
====================================================

DELI  - COO digital, orquestradora (ativa no Milestone v1 Fase 1E)
LARA  - CRM food service + régua de disparo — ✅ ATIVA NO OPENCLAW (06/05/2026)
CORA  - cobrança inteligente (Milestone v2)
SOFIA - SDR/prospecção (Milestone v2)
BRENO - atendimento e suporte (futuro)
MAX   - consultor técnico (futuro)
VERA  - BI e relatórios (futuro)

Princípio: DELI é COO, não chatbot. Monitora tudo, aciona especialistas,
propõe ações com semáforo Verde/Amarelo/Vermelho. NUNCA responde clientes.
Ver seção 16 para detalhes de triggers e autonomia.

--- LARA — Referências ---
Diagrama de fluxo:  docs/fluxos/lara-regua.md
Agente OpenClaw:    .openclaw/agents/lara/ (system_prompt.md, base_regras.yaml, nexus_subagents_spec.md)
Bridge Server:      bridge-server/docs/lara-endpoints.md
Migration:          supabase/migrations/20260506_001_lara_regua.sql
Usuária principal:  Wélida (role: marketing) — invoca, aprova drafts
Audiência LARA:     equipe interna APENAS. Nunca responde cliente final.
Sub-agentes Nexus:  NEXUS-PESQUISA / NEXUS-RÉGUA / NEXUS-MÍDIA (async, callback HMAC-SHA256)
Secrets a criar:    NEXUS_API_KEY, NEXUS_BASE_URL, NEXUS_CALLBACK_SECRET, INTERNAL_BRIDGE_TOKEN (Infisical)

====================================================
6. ROADMAP
====================================================

Milestone v1 — Operacional Interno (até 22/05/2026)
----------------------------------------------------
Fase 1A - Fundação: RBAC + Memória Central + WhatsApp + Drafts/DELI (migrations)
Fase 1B - RBAC aplicado: RequireRole/RequireAgent no React + middleware Bridge Server
Fase 1C - Telas reais: CoraScreen e ReportsScreen sem mock + tela DraftsPendentes
Fase 1D - ClickUp Light: Sidebar hierárquica + TasksScreen multi-view (Lista/Board/Calendário)
Fase 1E - DELI ativa: agente no OpenClaw + escutando Realtime + DeliPainel
Fase 1F - WhatsApp evoluído: webhook grupo/PV/menção + identificação de remetente
Fase 1G - AgentsPage como painel de controle real + notificações

Milestone v2 — ClickUp Médio + Crescimento (jun-jul/2026)
----------------------------------------------------------
Custom fields, Automations, Dashboard builder
CRM completo, SOFIA e LARA ativos, Asaas integrado

Milestone v3 — Revenda (ago/2026+)
------------------------------------
Onboarding self-service, planos/billing, white-label, marketplace de agentes

====================================================
7. EQUIPE
====================================================

Wandson Silva - CEO, único dev (Yasmin saiu em 05/2026), aprova decisões
Wélida        - marketing e CRM (role: marketing)
Eduardo       - atendimento, consultoria e suporte (role: atendimento)
DELI          - COO digital, agente IA (Fase 2 — Trigger.dev)

Emails: @consultdelivery.com.br

====================================================
8. SEMÁFORO DE AUTONOMIA
====================================================

Verde: DELI executa e reporta
Amarelo: DELI propõe, Wandson aprova com 'ok'
Vermelho: aprovação explícita 'APROVADO VERMELHO apr-xxx'

====================================================
9. ORÇAMENTO
====================================================

Orçamento máximo stack: R$ 800/mês
Estimativa atual: R$ 430-630/mês
- Supabase Pro: R$ 130
- Claude API: R$ 300-500
- GitHub Pages: gratuito

====================================================
10. FLUXO GIT — TRABALHO EM EQUIPE
====================================================

REGRA PRINCIPAL: Nunca trabalhar direto no branch main.
Cada pessoa cria seu próprio branch antes de começar qualquer tarefa.

----------------------------------------------------
COMO WANDSON COMEÇA UMA TAREFA
----------------------------------------------------

1. Abrir o terminal no Antigravity (ou qualquer terminal)
2. Rodar:

   git checkout main
   git pull origin main
   git checkout -b wandson/nome-da-tarefa

   Exemplo: git checkout -b wandson/dashboard-supabase

3. Abrir o Claude Code normalmente — ele vai trabalhar nesse branch
4. Ao terminar, commitar e empurrar:

   git push -u origin wandson/nome-da-tarefa

5. Ir no GitHub → abrir Pull Request → Yasmin revisa → Merge

----------------------------------------------------
COMO YASMIN COMEÇA UMA TAREFA
----------------------------------------------------

1. Abrir o terminal
2. Rodar:

   git checkout main
   git pull origin main
   git checkout -b yasmin/nome-da-tarefa

   Exemplo: git checkout -b yasmin/chat-realtime

3. Abrir o Claude Code — ele vai trabalhar nesse branch
4. Ao terminar, commitar e empurrar:

   git push -u origin yasmin/nome-da-tarefa

5. Abrir Pull Request no GitHub → Wandson aprova → Merge

----------------------------------------------------
NOMES DE BRANCH — PADRÃO
----------------------------------------------------

wandson/dashboard-kpis
wandson/login-real
yasmin/chat-ao-vivo
yasmin/kanban-drag-drop
fix/bug-topbar
hotfix/login-erro

----------------------------------------------------
REGRAS PARA O CLAUDE CODE
----------------------------------------------------

Ao iniciar uma sessão, SEMPRE verificar em qual branch está:

   git branch --show-current

Se estiver em main: PARAR e pedir para o usuário criar um branch.
Nunca fazer commit direto no main.
Nunca fazer push --force no main.

Antes de qualquer trabalho novo, rodar:

   git pull origin main

para garantir que o branch está atualizado com o que a outra pessoa fez.

----------------------------------------------------
RESOLVENDO CONFLITO (se acontecer)
----------------------------------------------------

Se o git pull trouxer conflito:
1. Abrir o arquivo conflitado no editor
2. Escolher qual versão manter (ou misturar as duas)
3. Remover as marcações <<<<<<, =======, >>>>>>>
4. git add . && git commit -m "resolve conflito em X"

================================================================================

ROADMAP 30 DIAS - MVP PLATAFORMA CONSULT DELIVERY
==================================================
Período: 23/04/2026 a 22/05/2026
Total: 40 tasks | 4 fases

==================================================
FASE 1 — FUNDAÇÃO (Dias 1-7 | 23/04 a 29/04)
==================================================

TASK-101 | Criar conta Lovable + projeto inicial
Responsável: Wandson
Estimativa: 1h
Semáforo: Verde
Descrição: Criar conta Lovable Pro, iniciar projeto "plataforma-consult-delivery", conectar ao GitHub

TASK-102 | Configurar Supabase
Responsável: Yasmin
Estimativa: 2h
Semáforo: Verde
Descrição: Criar projeto Supabase "consult-delivery-prod", configurar Auth, ativar Realtime

TASK-103 | Aplicar schema multi-tenant no Supabase
Responsável: Yasmin + Claude
Estimativa: 3h
Semáforo: Amarelo
Descrição: Criar tabelas: tenants, users, conversations, messages, tasks, invoices com RLS ativo

TASK-104 | Conectar Lovable ao Supabase
Responsável: Yasmin
Estimativa: 1h
Semáforo: Verde
Descrição: Integrar Lovable com projeto Supabase via chaves de API

TASK-105 | Configurar autenticação e papéis
Responsável: Yasmin
Estimativa: 3h
Semáforo: Amarelo
Descrição: Login/logout, roles (admin, consultor, operador), proteção de rotas

TASK-106 | Dashboard home (tela inicial)
Responsável: Yasmin
Estimativa: 2h
Semáforo: Verde
Descrição: Tela de boas-vindas com cards de módulos, menu lateral, header com usuário

TASK-107 | Deploy inicial na Vercel
Responsável: Yasmin + Wandson
Estimativa: 1h
Semáforo: Verde
Descrição: Conectar repositório GitHub à Vercel, primeiro deploy, URL de acesso

MARCO FASE 1: Toda a equipe consegue logar e navegar na plataforma

==================================================
FASE 2 — CHAT UNIFICADO (Dias 8-14 | 30/04 a 06/05)
==================================================

TASK-201 | Configurar webhook Evolution → Supabase
Responsável: Wandson + Claude
Estimativa: 2h
Semáforo: Amarelo
Descrição: Criar endpoint no Supabase Edge Function que recebe webhook da Evolution API

TASK-202 | Tabela de conversas e mensagens
Responsável: Yasmin + Claude
Estimativa: 2h
Semáforo: Verde
Descrição: SQL para conversations e messages com campos corretos e RLS

TASK-203 | Interface de chat (lista de conversas)
Responsável: Yasmin
Estimativa: 4h
Semáforo: Verde
Descrição: Tela com lista de contatos/conversas, badge de não lidas, busca

TASK-204 | Janela de mensagens com realtime
Responsável: Yasmin
Estimativa: 4h
Semáforo: Amarelo
Descrição: Mensagens em tempo real via Supabase Realtime, scroll, timestamp, status

TASK-205 | Enviar mensagem WhatsApp pela plataforma
Responsável: Yasmin + Claude
Estimativa: 3h
Semáforo: Amarelo
Descrição: Botão enviar → chama Evolution API → mensagem sai pelo WhatsApp real

TASK-206 | Chat interno entre equipe
Responsável: Yasmin
Estimativa: 3h
Semáforo: Verde
Descrição: Canal interno (sem WhatsApp), notificações, @menções básicas

TASK-207 | Atribuição de conversa a consultor
Responsável: Yasmin
Estimativa: 2h
Semáforo: Verde
Descrição: Dropdown para atribuir conversa, filtro "minhas conversas"

TASK-208 | Notas internas na conversa
Responsável: Yasmin
Estimativa: 1h
Semáforo: Verde
Descrição: Campo de nota interna visível só para equipe, não enviado ao cliente

MARCO FASE 2: WhatsApp real entra e sai pela plataforma

==================================================
FASE 3 — TAREFAS + INFRA CORA (Dias 15-21 | 07/05 a 13/05)
==================================================

TASK-301 | Tabela de tasks no Supabase
Responsável: Yasmin + Claude
Estimativa: 1h
Semáforo: Verde
Descrição: SQL para tasks com campos: título, descrição, responsável, status, prazo, tenant_id

TASK-302 | Interface Kanban (3 colunas)
Responsável: Yasmin
Estimativa: 4h
Semáforo: Verde
Descrição: Board com colunas A fazer / Fazendo / Feito, drag-and-drop, criar task

TASK-303 | Filtros e buscas no Kanban
Responsável: Yasmin
Estimativa: 2h
Semáforo: Verde
Descrição: Filtrar por responsável, prazo, prioridade; busca por título

TASK-304 | Migrar tasks do ClickUp para plataforma
Responsável: Wandson + DELI
Estimativa: 2h
Semáforo: Amarelo
Descrição: Exportar tasks existentes do ClickUp e importar na plataforma

TASK-305 | Preparar VPS para agentes
Responsável: DELI + Claude
Estimativa: 3h
Semáforo: Amarelo
Descrição: Criar estrutura de pastas, configurar cron jobs, testar conexão Supabase↔VPS

TASK-306 | Script CORA base (análise de inadimplência)
Responsável: Claude + DELI
Estimativa: 4h
Semáforo: Amarelo
Descrição: Script Python que lê tabela invoices, identifica inadimplentes, gera lista de ação

TASK-307 | Notificações básicas na plataforma
Responsável: Yasmin
Estimativa: 2h
Semáforo: Verde
Descrição: Sino de notificações, badge contador, lista de alertas

MARCO FASE 3: Kanban adotado pela equipe + CORA gerando listas de ação

==================================================
FASE 4 — CORA + GO-LIVE (Dias 22-30 | 14/05 a 22/05)
==================================================

TASK-401 | Painel CORA no Lovable
Responsável: Yasmin
Estimativa: 4h
Semáforo: Verde
Descrição: Tela listando inadimplentes, valor, dias de atraso, botão de ação

TASK-402 | Fluxo de aprovação CORA → envio
Responsável: Yasmin + Claude
Estimativa: 3h
Semáforo: Amarelo
Descrição: Wandson aprova na tela → CORA envia cobrança via WhatsApp automaticamente

TASK-403 | Integração Asaas (migrar sandbox → prod)
Responsável: Wandson + Claude
Estimativa: 2h
Semáforo: Vermelho
Descrição: Migrar chaves Asaas para produção, testar cobrança real

TASK-404 | Relatório simples de cobranças
Responsável: Yasmin
Estimativa: 2h
Semáforo: Verde
Descrição: Tela mostrando: enviadas, pagas, pendentes, taxa de recuperação

TASK-405 | Polimento visual geral
Responsável: Yasmin
Estimativa: 4h
Semáforo: Verde
Descrição: Revisão de cores, espaçamentos, responsividade mobile, loading states

TASK-406 | Testes com equipe real
Responsável: Wandson + equipe
Estimativa: 4h
Semáforo: Verde
Descrição: Eduardo e Hélida usam a plataforma por 2 dias e reportam bugs/feedbacks

TASK-407 | Correção de bugs críticos
Responsável: Yasmin
Estimativa: 4h
Semáforo: Verde
Descrição: Resolver os bugs encontrados nos testes

TASK-408 | Documentação básica de uso
Responsável: Claude + Wandson
Estimativa: 2h
Semáforo: Verde
Descrição: Guia de uso para a equipe: como usar chat, tarefas e CORA

TASK-409 | Onboarding oficial da equipe
Responsável: Wandson
Estimativa: 1h
Semáforo: Verde
Descrição: Reunião de apresentação da plataforma para Eduardo e Hélida

TASK-410 | Go-live oficial + Retrospectiva
Responsável: Wandson + equipe
Estimativa: 2h
Semáforo: Verde
Descrição: Plataforma vira ferramenta oficial. Retrô de 30 dias. Planejamento v2.

MARCO FASE 4: Plataforma é a ferramenta oficial da Consult Delivery

==================================================
TAREFAS QUE PODEM SER CORTADAS SE APERTAR
==================================================

TASK-208 (Notas internas) - baixo impacto
TASK-303 (Filtros Kanban) - funciona sem
TASK-307 (Notificações) - pode ficar para v2
TASK-404 (Relatório cobranças) - pode ficar para v2
TASK-408 (Documentação) - pode ser feita depois

==================================================
IDs DE PASTAS DO DRIVE
==================================================

DELI (raiz): 1BDATwmJQgSkhgZ49WG2xckHesLLoKCZf
Plataforma Consult Delivery: 1a_SDeqVo4xrJUCKS73t6qgglwNFlDeB_
00-Contexto-e-Visao: 1T5BUGt5XvancZYXr4n3cE_aJ2x5FrJSg
01-Roadmap-e-Tasks: 1nsqu6of5gmb3l1SfqsfUza3Izb74Ggap
02-Guias-de-Tasks-Detalhados: 1I-VkH-nSEMU5sHWO1gxuZRaUP5UxVeBc
03-Design-e-Marca: 1lyM7yTbRie4uCsjh9I1vi6Rs8rXpIrxs
04-Prompts-Lovable: 1-VrtdZXqOWSs6397fVWihBwEt1wQKDWh
05-SQL-Supabase: 1_A4I-w711_cSFrgbDClme4d801N6K2Q3
06-Jornal-de-Decisoes: 1MTD2SVJKgvOYoM-di-JfZ2H1cSaMFKKN
07-Feedback-Equipe: 1doGUrM3FfsaXlSPc8u9_TLK6Pmdb0Cs9
08-Assets-e-Midia: 1S31yRxUwl1MBAvc447oestDyBylhA5Wd

================================================================================

TASK-101 — CRIAR CONTA LOVABLE + PROJETO INICIAL
=================================================
Responsável: Wandson
Estimativa: 1h
Semáforo: Verde
Status: PENDENTE

=================================================
OBJETIVO
=================================================
Criar a conta Lovable Pro, iniciar o projeto da plataforma e conectar ao GitHub da Consult Delivery.

=================================================
PRÉ-REQUISITOS
=================================================
- Conta Google ativa (para cadastro)
- Cartão de crédito internacional (para Lovable Pro ~R$130/mês)
- Acesso ao GitHub: consult-delivery-os/deli-os

=================================================
PASSO A PASSO
=================================================

PASSO 1 — Criar conta Lovable
1. Acesse: https://lovable.dev
2. Clique em "Get Started" ou "Sign Up"
3. Use "Continue with Google" com sua conta Google
4. Confirme o e-mail se necessário

PASSO 2 — Assinar o plano Pro
1. Após entrar, vá em Settings → Billing
2. Escolha o plano "Pro" (~$25/mês)
3. Informe o cartão de crédito
4. Confirme a assinatura

PASSO 3 — Criar o projeto
1. Na tela principal, clique em "New Project"
2. Nome do projeto: plataforma-consult-delivery
3. Descrição: Plataforma SaaS de gestão para delivery - Consult Delivery
4. Clique em "Create Project"

PASSO 4 — Primeiro prompt no Lovable
Cole esse prompt exato no chat do Lovable:

"Crie uma aplicação SaaS de gestão para consultoria de delivery chamada Plataforma Consult Delivery. 
A aplicação deve ter:
- Tela de login e cadastro profissional
- Menu lateral com: Dashboard, Chat, Tarefas, CRM, Relatórios, Configurações
- Dashboard inicial com cards mostrando: conversas ativas, tarefas pendentes, clientes e receita do mês
- Design moderno, cores escuras com laranja como cor de destaque
- Layout responsivo (funciona no celular e computador)
- Estrutura preparada para múltiplos usuários com diferentes permissões (admin, consultor, operador)"

PASSO 5 — Conectar ao GitHub
1. No Lovable, vá em Settings → GitHub
2. Clique em "Connect GitHub"
3. Autorize o acesso
4. Selecione o repositório: consult-delivery-os/deli-os
5. Configure: branch main, auto-sync ativado

=================================================
CRITÉRIO DE ACEITE
=================================================
- Conta Lovable Pro ativa
- Projeto criado com nome correto
- Primeira tela gerada (login + dashboard básico)
- Conectado ao GitHub
- URL de preview funcionando

=================================================
PROBLEMAS COMUNS
=================================================

Problema: "Cartão recusado"
Solução: Use cartão com função internacional ativa. Tente Nubank ou C6 Bank.

Problema: "Não consigo conectar GitHub"
Solução: No GitHub, vá em Settings → Applications → Authorize Lovable

Problema: "O design ficou feio"
Solução: Adicione no prompt: "use Shadcn/UI components, clean and professional design"

=================================================
PRÓXIMO PASSO APÓS CONCLUIR
=================================================
Avise a Yasmin que pode iniciar TASK-102 (Supabase).
Envie para o Claude: "TASK-101 concluída" com print da tela.

================================================================================

====================================================
11. SKILLS OBRIGATÓRIAS NESTE PROJETO
====================================================

Este projeto usa três skills que DEVEM ser aproveitadas em todas as sessões:

────────────────────────────────────────────────────
GSD (Get Shit Done) — gestão de fases e workflow
────────────────────────────────────────────────────

ANTES de iniciar qualquer trabalho de implementação:
- Rodar `/gsd-discuss-phase` pra entender contexto da fase atual
- Verificar em qual milestone estamos

DURANTE o trabalho:
- Após mudanças significativas: `/gsd-capture` pra registrar
- Para revisão de código: `/gsd-code-review` antes de PR

AO FINALIZAR:
- `/gsd-complete-milestone` pra marcar conclusão de fase

NÃO usar GSD para:
- Tarefas conversacionais simples
- Dúvidas pontuais que não geram código

────────────────────────────────────────────────────
GRAPHIFY — mapa de conhecimento do projeto
────────────────────────────────────────────────────

ANTES de responder qualquer pergunta sobre:
- Arquitetura ("como funciona X?")
- Dependências ("o que depende de Y?")
- Refatoração ("se eu mudar Z, o que quebra?")
- Estrutura ("onde está implementado W?")

REGRA: SEMPRE consultar `graphify-out/graph.json` PRIMEIRO antes de reler arquivos do zero.

Comandos disponíveis:
- `/graphify .` — re-mapear projeto após grandes mudanças
- Visualização: abrir `graphify-out/graph.html` no navegador

NÃO reler 10 arquivos do zero quando o grafo já tem a resposta. Isso queima tokens à toa.

────────────────────────────────────────────────────
WIKI-BRAIN — segundo cérebro do projeto
────────────────────────────────────────────────────

Vault em `WikiBrain/` (raw/ ignorado por LGPD).

ANTES de pesquisar conceito ou metodologia já usada antes:
- Consultar `WikiBrain/wiki/` (páginas extraídas das transcrições)
- Buscar no `WikiBrain/wiki/index.md` se há página relevante

PARA novas transcrições/conhecimento:
- Adicionar em `WikiBrain/raw/` (LGPD: não commitar dados de cliente)
- Pedir ingest com: "ingest the new file in raw/"

────────────────────────────────────────────────────
ORDEM RECOMENDADA EM CADA SESSÃO
────────────────────────────────────────────────────

1. Verificar fase atual (GSD)
2. Consultar grafo (graphify) se a pergunta envolve código existente
3. Consultar wiki-brain se a pergunta envolve metodologia ou conhecimento de domínio
4. Só ENTÃO partir para edição/escrita

────────────────────────────────────────────────────

================================================================================

====================================================
12. CONVENÇÃO DE DIAGRAMAS
====================================================

Diagramas formais e versionados (que o time inteiro consulta):
→ Mermaid em docs/fluxos/
→ Texto markdown, renderiza no GitHub e VS Code
→ Diff do git mostra mudanças linha a linha
→ Pode ser editado diretamente pelo Claude Code

Rascunhos rápidos (pensar, brainstormar):
→ Excalidraw via plugin do Obsidian (vault WikiBrain)
→ Exports PNG/SVG vão pra docs/rascunhos/ se quiser commitar
→ Não substituem o Mermaid (são pra ideação)

Workflow recomendado:
1. Bate ideia → desenha rápido no Excalidraw
2. Aprova mentalmente → pede pro Claude Code converter pra Mermaid
3. Mermaid fica em docs/fluxos/, versionado, time todo vê

Arquivos existentes:
- docs/fluxos/arquitetura.md    — stack completa (Frontend, VPS, agentes, integrações)
- docs/fluxos/analise-ifood.md  — fluxo do módulo Análise iFood
- docs/rascunhos/               — exports Excalidraw (PNG/SVG)

================================================================================

====================================================
13. RBAC — PAPÉIS E PERMISSÕES
====================================================

Toda ação sensível é protegida por papéis. Schema em:
supabase/migrations/20260504_001_rbac.sql

Papéis disponíveis (dentro de cada tenant):
- admin       → acesso total
- dev         → chat, kanban, crm (view), reports, analista-ifood — SEM financeiro
- marketing   → chat, kanban, crm, reports, lara — SEM financeiro
- atendimento → chat, grupos_whatsapp, kanban, analise_ifood (view), analista-ifood
- financeiro  → cobranca, inadimplencias, cora — SEM dev/marketing
- viewer      → kanban (view), reports (view) — sem execução
- deli_owner  → deli (invoke, approve_drafts), approve_high_autonomy

No React: usar <RequireRole resource="x" action="y"> e <RequireAgent agent="x">
No Bridge Server: middleware requireAgentAccess valida JWT + user_agent_access
Toda ação é logada em audit_log.

====================================================
14. MEMÓRIA CENTRAL DOS AGENTES
====================================================

Fatos sobre clientes vivem no Supabase, NÃO em memory/*.md na VPS.
Schema em: supabase/migrations/20260504_002_memoria_central.sql

Tabelas principais:
- lojas          → loja iFood associada a um customer (cliente)
- client_facts   → fatos key-value por loja (qualquer agente lê/escreve)
- client_timeline → linha do tempo imutável de eventos por loja
- loja_metricas  → snapshot diário de métricas (populado pelo n8n)

Agentes leem contexto ANTES de agir:
  SELECT * FROM client_facts WHERE loja_id = $1;
  SELECT * FROM client_timeline WHERE loja_id = $1 ORDER BY ts DESC LIMIT 20;

Agentes registram fatos novos:
  INSERT INTO client_facts ... ON CONFLICT DO UPDATE SET value = ..., ts = NOW();

====================================================
15. MODELO WHATSAPP
====================================================

Realidade da operação:
- 1 número oficial Evolution API
- 1 grupo por loja cliente (ex: "Consultoria - Pizza do Zé")
- PVs separados (cliente que chama no PV = conversa independente)
- Múltiplos remetentes no grupo: dono, esposa, sócio, gerente, equipe Consult
- DELI MONITORA mas NUNCA RESPONDE grupos/PVs de cliente
- Agentes só agem quando MENCIONADOS no grupo (ex: "@analista faz análise")
- Resumo sob demanda: "@DELI resume últimos 3 dias" → vai para canal INTERNO

Schema em: supabase/migrations/20260504_003_whatsapp.sql
Tabelas: whatsapp_contacts, whatsapp_groups, whatsapp_group_members, whatsapp_messages

Edge Function evolution-webhook diferencia:
- JID terminando em @g.us → grupo → associar a whatsapp_groups + loja
- JID terminando em @s.whatsapp.net → PV individual
- Detecta menção a agente (regex) → enfileira invoke no Bridge Server

====================================================
16. DRAFTS E DELI
====================================================

NENHUM agente envia mensagem para CLIENTE sem aprovação humana.
Fluxo: Agente cria draft → notifica humano → humano aprova/edita/rejeita → sistema envia

Exceção: channel = 'telegram_interno' ou 'painel' → vai direto (é para a equipe).

Schema em: supabase/migrations/20260504_004_drafts_deli.sql
Tabelas: agent_drafts, deli_triggers, deli_pending_approvals, deli_actions_log

DELI usa semáforo de autonomia:
  Verde    → DELI executa e reporta (ex: atualizar timeline, gerar resumo interno)
  Amarelo  → DELI propõe, Wandson aprova com 'ok'
  Vermelho → aprovação explícita 'APROVADO VERMELHO apr-xxx'

Triggers iniciais (seed em deli_triggers):
  - Verde:   cliente sumiu 7 dias → notifica equipe internamente
  - Verde:   mensagem recebida → atualizar client_timeline
  - Amarelo: métrica caiu 20%+ → invocar analista-ifood + propor draft para cliente
  - Vermelho: mudança em config OpenClaw → aguardar APROVADO VERMELHO

====================================================
17. VISÃO CLICKUP — REFERÊNCIA UX
====================================================

A plataforma é INSPIRADA no ClickUp em nível MÉDIO.
ClickUp é referência de UX e funcionalidade. NÃO de estética.
Identidade visual Consult Delivery (logo foguete vermelho, cores, dark mode) é preservada 100%.

O que copiar:
  ✅ Multi-views: Lista, Board (Kanban), Calendário
  ✅ Sidebar hierárquica com agrupamento por cliente
  ✅ TopbarFilter (cliente, prioridade, responsável, prazo)
  ✅ Task cards compactos
  ✅ Custom fields (Milestone v2)
  ✅ Automations rules (Milestone v2)
  ✅ Dashboard builder (Milestone v2)

O que NÃO copiar (fora do escopo):
  ❌ Goals, Whiteboards, Docs colaborativos, Mind Maps, Gantt, Time tracking

Diferencial exclusivo sobre o ClickUp:
  ⭐ Chat WhatsApp integrado (o ClickUp não tem)

================================================================================

Diagramas formais e versionados (que o time inteiro consulta):
→ Mermaid em docs/fluxos/
→ Texto markdown, renderiza no GitHub e VS Code
→ Diff do git mostra mudanças linha a linha
→ Pode ser editado diretamente pelo Claude Code

Rascunhos rápidos (pensar, brainstormar):
→ Excalidraw via plugin do Obsidian (vault WikiBrain)
→ Exports PNG/SVG vão pra docs/rascunhos/ se quiser commitar
→ Não substituem o Mermaid (são pra ideação)

Workflow recomendado:
1. Bate ideia → desenha rápido no Excalidraw
2. Aprova mentalmente → pede pro Claude Code converter pra Mermaid
3. Mermaid fica em docs/fluxos/, versionado, time todo vê

Arquivos existentes:
- docs/fluxos/arquitetura.md    — stack completa (Frontend, VPS, agentes, integrações)
- docs/fluxos/analise-ifood.md  — fluxo do módulo Análise iFood
- docs/rascunhos/               — exports Excalidraw (PNG/SVG)

====================================================
18. STACK PÓS-REESTRUTURAÇÃO (Fase 0 — 13/05/2026)
====================================================

Decisão tomada em 12/05/2026. Autoritativo: RESTRUCTURE.md

ORQUESTRADOR DE AGENTES: Trigger.dev cloud
- Tasks TypeScript em trigger/
- Retry, scheduling, composição nativas
- Dashboard de runs em cloud.trigger.dev
- Projeto: proj_slexhoelcjwgbopmbzzr

RUNTIME DE AGENTE: @anthropic-ai/sdk
- import Anthropic from "@anthropic-ai/sdk"
- Ferramenta web_search_20250305 habilitada
- Modelo padrão: claude-sonnet-4-6
- Wrapper em trigger/_shared/claude.ts

VALIDAÇÃO DE OUTPUT: Zod
- Todo input/output de task tem schema Zod
- Nomenclatura: PascalCase + Input/Output (ex: DeliConversaInput)

PADRÃO DE TASK (seguir sempre):
  export const minhaTask = task({
    id: "agente-acao",
    retry: { maxAttempts: 3 },
    run: async (payload) => {
      const input = InputSchema.parse(payload);
      // lógica...
      await logAgentRun({ runId: ctx.run.id, ... });
      return OutputSchema.parse(result);
    }
  });

ORQUESTRADOR DE DESENVOLVIMENTO: Claude Code (CLI Anthropic)
- Sessão local: terminal Antigravity (dev no PC do Wandson)
- Sessão remota: VPS systemd `claude-dev.service` — Claude Code roda 24/7 mesmo com PC desligado
- Garante continuidade de fluxos de dev e automação sem depender da máquina local

OPENCLAW: legacy — fora do stack ativo
- Containers podem permanecer na VPS porta 18789, mas não há agente ativo dependendo dele
- Não invocar, não estender, não criar agente novo nele

N8N: não usado — execução de tarefas é 100% Trigger.dev
EVONEXUS: em avaliação (POC) — instalado em evonexus.evolutionfoundation.com.br, roda sobre Claude Code SDK. Não usar em produção até validação.

Arquivos-chave criados na Fase 0:
- trigger.config.ts                          — config Trigger.dev
- trigger/_shared/claude.ts                  — wrapper SDK Anthropic
- trigger/_shared/supabase.ts                — lazy singleton Supabase
- trigger/_shared/schemas.ts                 — Zod schemas comuns
- trigger/_shared/audit.ts                   — logAgentRun()
- trigger/_examples/hello-world.ts           — task de sanidade
- docs/architecture/agent-communication.md   — fluxo Frontend↔Bridge↔Trigger
- bridge-server/README.md                    — doc endpoints Bridge

====================================================
19. ANTI-PADRÕES — O QUE NÃO FAZER
====================================================

Lições aprendidas. Violar qualquer uma é defeito grave, não estilo.

1. Não declarar "feito" sem rodar de verdade.
   → Output bruto sempre: SQL executado, JSON retornado, screenshot do run.

2. Não confiar em memória para nomes de pacotes/APIs.
   → Validar em node_modules ou documentação oficial antes de afirmar.

3. Não criar features sem critério de aceite.
   → Foi assim que o chat ficou sem áudio/preview/reply.

4. Não usar throw no topo de módulo em tasks Trigger.dev.
   → O worker importa todos os arquivos. Throw no import derruba o worker.
   → Env vars em lazy getter (getSupabase()) ou dentro da função run().

5. Não adicionar agente sem mapear gargalo real.
   → Cada agente cobre uma dor mensurável com critério de aceite.

6. Não pular validação intermediária entre fases.
   → Cada fase tem critério de aceite — não há "pulo".

7. Não criar agente novo fora de trigger/ (Trigger.dev) orquestrado via Claude Code.
   → OpenClaw é legacy: containers podem rodar, mas não invocar nem estender.
   → n8n não é usado: execução de tarefas é 100% Trigger.dev.
   → EvoNexus está em POC: não usar em produção até validação.

8. Não fazer commit direto em main.
   → Sempre branch feature/fase-X/nome, PR, merge.

9. Não rodar migrations sem validar o SQL antes.
   → Migrations são irreversíveis em produção. Mostrar SQL, aprovar, rodar.

10. Não confiar no resultado do Claude sem testar manualmente.
    → Critério mínimo: 1 teste manual + log/output real antes de "feito".

================================================================================

## Context Navigation (Wiki-Brain)

You have access to a personal wiki at `C:\Users\Consult Delivery\consult-delivery\WikiBrain`. This is the user's
compounding knowledge base. Use it as your primary context source.

When you need to understand the codebase, docs, past work, or any stored
knowledge:

1. **ALWAYS query the knowledge graph first:** `graphify query "your question"`
   (run from `C:\Users\Consult Delivery\consult-delivery\WikiBrain`).
2. **Use `C:\Users\Consult Delivery\consult-delivery\WikiBrain\wiki\index.md`** as your navigation entrypoint for
   browsing the wiki structure.
3. **Use `C:\Users\Consult Delivery\consult-delivery\WikiBrain\graphify-out\wiki\index.md`** if it exists — it's
   the auto-generated Graphify wiki index.
4. **Only read raw files in `C:\Users\Consult Delivery\consult-delivery\WikiBrain\raw\`** if the user explicitly
   says "read the raw file" or the graph query doesn't have the answer.

## Wiki-Brain Session Rules

**Ingesting sources.** When the user drops a file into `C:\Users\Consult Delivery\consult-delivery\WikiBrain\raw\`
and asks you to ingest it, follow `/wiki-brain ingest` — read the source,
summarize, create/update wiki pages, cross-link aggressively, update
`wiki\index.md`, append to `log.md`.

**Every session must end with a log entry.** Before ending a session, append
one line to `C:\Users\Consult Delivery\consult-delivery\WikiBrain\log.md` in this exact format:

```
## [YYYY-MM-DD HH:MM] session | <3-8 word session title>
Touched: <comma-separated wiki pages, or "none">
```

**If the session produced durable knowledge** (decisions made, things learned,
project state changed, problems solved) — update or create relevant wiki
pages with that knowledge before ending. Cross-link with `[[Page Name]]`.
Update `wiki\index.md`.

**If the session was trivial** (one-off fix, routine task, exploratory
chatter) — skip the wiki update. Just append the log line.

**Never modify files in `raw\`.** Sources are immutable.
**Claude owns `wiki\` entirely.** Update it, don't ask permission for each page — just report what changed.
**Always update `wiki\index.md`** when you create or rename a wiki page.
**Cross-link aggressively.** `[[Page Name]]` Obsidian syntax. A page with no inbound links is a dead-end.

## Wiki-Brain Commands Available

- `/wiki-brain` — status menu
- `/wiki-brain ingest <file>` — ingest a source
- `/wiki-brain query "<q>"` — query the graph + wiki
- `/wiki-brain lint` — health-check the wiki
- `/wiki-brain rebuild` — force a Graphify rebuild
- `/wiki-brain doctor` — verify install
- `/recall` — show last 5 activities + read linked pages
