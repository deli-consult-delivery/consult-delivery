# Módulo Análise iFood — Consult Delivery

## What This Is

Novo módulo da Plataforma Consult Delivery que permite aos consultores disparar análises automatizadas de desempenho iFood para seus clientes. O consultor seleciona um cliente do CRM, cola um link de pasta do Google Drive com os prints e planilhas do iFood, e o sistema processa tudo — análise via Claude API, relatório HTML exibido na plataforma, tarefas criadas no Kanban, e mensagem enviada ao dono da loja via WhatsApp.

## Core Value

O consultor clica em Analisar e recebe um diagnóstico completo + tarefas priorizadas sem trabalho manual de interpretação ou criação de tarefas.

## Requirements

### Validated

- ✓ Autenticação multi-tenant com Supabase RLS — existing
- ✓ CRM com listagem de clientes — existing
- ✓ Kanban board para tarefas — existing
- ✓ Integração WhatsApp via Evolution API — existing
- ✓ n8n configurado no VPS com Google Drive, ClickUp, Evolution e Anthropic — existing
- ✓ Claude API disponível via Infisical (ANTHROPIC_API_KEY) — existing

### Active

- [ ] IFOOD-01: Consultor seleciona cliente do CRM e cola link do Google Drive para disparar análise
- [ ] IFOOD-02: Sistema lê prints e planilhas iFood a partir do link do Drive
- [ ] IFOOD-03: Claude analisa os dados e retorna JSON estruturado com insights, top 5 prioridades e mensagem WhatsApp
- [ ] IFOOD-04: Relatório HTML completo exibido dentro da plataforma após análise
- [ ] IFOOD-05: Tarefas do top 5 criadas automaticamente no Kanban da plataforma
- [ ] IFOOD-06: Mensagem WhatsApp enviada automaticamente ao dono da loja
- [ ] IFOOD-07: Histórico de análises armazenado e consultável por cliente
- [ ] IFOOD-08: Suporte a 6–20 clientes sem degradação de performance

### Out of Scope

- Interface de edição de regras YAML — Wandson edita diretamente no n8n/Supabase por ora
- Integração ClickUp — substituída pelo Kanban interno da plataforma
- Análise automática por agendamento — disparo manual apenas no v1
- Exportação PDF — v2
- Portal do cliente (dono da loja acessa seu próprio relatório) — v2

## Context

- **Plataforma existente:** Vite + React 18 + Supabase (Auth + Postgres + Realtime + RLS), deploy Vercel
- **VPS 193.202.85.82:** Docker, n8n, Evolution API, OpenClaw, Infisical com secrets
- **Orquestração:** n8n no VPS recebe webhook da plataforma, processa tudo e salva resultado no Supabase
- **Escala atual:** 6–20 clientes usando análise iFood, crescendo
- **Sistema de regras:** YAML por nicho (marmita, salgado, açaí etc.) — fixo no system prompt do n8n por ora
- **Responsável de desenvolvimento:** Wandson (2–4h/dia) — Yasmin trabalhando no chat unificado em paralelo
- **Período:** Maio 2026

## Constraints

- **Stack:** Sem adicionar novas dependências no frontend — usar o que já existe (React + Supabase)
- **Orquestração:** n8n no VPS, não Edge Functions — aproveita integrações já configuradas (Drive, Evolution, Anthropic)
- **Disponibilidade:** Wandson 2–4h/dia — fases precisam ser pequenas e entregáveis independentemente
- **Budget:** Stack atual ≤ R$800/mês — Claude Haiku para análises (~R$0,10/análise, custo desprezível)
- **Timeout n8n:** Análise pode levar 30–60s — frontend precisa de polling assíncrono, não chamada síncrona

## Key Decisions

| Decisão | Racional | Resultado |
|---------|----------|-----------|
| n8n orquestra (não Edge Functions) | Google Drive, Evolution e Anthropic já integrados no n8n | — Confirmado |
| Tarefas vão para Kanban da plataforma | ClickUp sendo substituído pelo Kanban interno | — Confirmado |
| Regras YAML fixas no system prompt | Apenas Wandson gerencia, não precisa de UI | — Confirmado |
| Input via link do Google Drive | Consultores já organizam arquivos no Drive por cliente | — Confirmado |
| Polling assíncrono para resultado | n8n pode levar 30–60s, evita timeout de requisição HTTP | — Pendente validação |

## Evolution

Este documento evolui a cada transição de fase e marco de milestone.

**Após cada transição de fase** (via `/gsd-transition`):
1. Requirements invalidados? → Mover para Out of Scope com razão
2. Requirements validados? → Mover para Validated com referência da fase
3. Novos requirements surgiram? → Adicionar em Active
4. Decisões a registrar? → Adicionar em Key Decisions
5. "What This Is" ainda preciso? → Atualizar se derivou

**Após cada milestone** (via `/gsd-complete-milestone`):
1. Revisão completa de todas as seções
2. Core Value check — ainda a prioridade certa?
3. Auditar Out of Scope — razões ainda válidas?
4. Atualizar Context com estado atual

---
*Última atualização: 2026-05-01 — inicialização do projeto*
