DOCUMENTO MESTRE - PLATAFORMA CONSULT DELIVERY v1.0
====================================================
Data de aprovação: 23/04/2026
Status: APROVADO - em execução

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

Frontend: Lovable
Banco de dados: Supabase (auth + realtime + RLS multi-tenant)
Agentes IA: VPS 193.202.85.82 via OpenClaw (porta 18789)
IA: Claude API (claude-sonnet-4-20250514)
WhatsApp: Evolution API
Automações: n8n
Payment: Asaas
Secrets: Infisical self-hosted (172.18.0.3:8080)
Deploy: Vercel
GitHub: consult-delivery-os/deli-os

====================================================
3. STACK DEFINITIVA
====================================================

Lovable + Supabase + VPS + Claude API + Evolution API + n8n + Infisical + GitHub + Vercel

====================================================
4. INFRAESTRUTURA EXISTENTE
====================================================

VPS: 193.202.85.82 - 8GB RAM / 6 vCPUs / 60GB
Docker v29.4 + Compose v5.1.2
Node.js v22.22.2
Ollama instalado
OpenClaw rodando porta 18789
Infisical com secrets: ANTHROPIC_API_KEY, HEYGEN_API_KEY
GitHub com 146 objetos já pushados

Integrações validadas: Anthropic, Evolution, n8n, Google Drive, Calendar, ClickUp, HeyGen, Metricool

====================================================
5. AGENTES EXISTENTES
====================================================

DELI - COO digital, orquestradora
LARA - marketing e conteúdo
CORA - cobrança inteligente (entra no MVP v1)
SOFIA - SDR/prospecção
BRENO - atendimento e suporte
MAX - consultor técnico
VERA - BI e relatórios

====================================================
6. MVP v1 - 30 DIAS (23/04/2026 a 22/05/2026)
====================================================

4 entregas prioritárias:
1. Autenticação multi-usuário (login, papéis, permissões)
2. Chat unificado (WhatsApp via Evolution + interno)
3. Kanban de tarefas (substituto ClickUp interno)
4. Integração da CORA (cobrança inteligente)

Capacidade: Wandson 2-4h/dia + Yasmin tempo integral
Divisão por módulo

====================================================
7. EQUIPE
====================================================

Wandson Silva - CEO, aprova decisões, visão estratégica
Yasmin - dev frontend (Lovable, tempo integral)
Eduardo - colaborador interno
Hélida - colaboradora interna
DELI - orquestradora IA, VPS

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
Estimativa atual: R$ 560-760/mês
- Lovable Pro: R$ 130
- Supabase Pro: R$ 130
- Claude API: R$ 300-500

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
yasmin/chat-unificado
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
