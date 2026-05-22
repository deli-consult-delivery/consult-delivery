# Consult Delivery — Conhecimento Estático

Base de **conhecimento estático** da Consult Delivery. Documentação, processos, manuais, scripts, decisões estratégicas — tudo que muda **pouco** e é referência permanente.

## ⚠️ O que NÃO vai aqui

| Não vai aqui | Vai onde |
|---|---|
| Contexto de cliente específico | Tabela `agent_memories` no Supabase |
| Histórico de ações tomadas | Tabela `agent_memories` (kind=history) |
| Decisões da DELI em runtime | Tabela `agent_memories` (kind=decision) |
| Status atual de cobranças | Tabela `cobrancas` no Supabase |
| Conversas e mensagens | Tabelas `conversations`, `messages` |
| Logs de execução de agentes | Tabela `agent_runs` |

**Regra de ouro:** se muda mais de 1 vez por semana → vai pro Supabase, não pra cá.

## O que VAI aqui

- Manuais de processos repetíveis
- Scripts (mensagens, e-mails, abordagens)
- Cardápio de serviços da Consult Delivery
- Templates de documentos
- Persona/prompt de cada agente IA
- Decisões estratégicas duradouras (não operacionais)
- Política interna, valores, missão
- Tutoriais de sistemas que a Consult revende
- Checklists e playbooks

## Estrutura

```
consult-delivery-knowledge/
├── README.md                          ← este arquivo
├── _index.md                          ← índice mestre (IA lê primeiro)
├── _templates/                        ← templates pra criar notas novas
│
├── 00-empresa/                        ← visão, valores, decisões estratégicas
├── 01-atendimento-consultoria/        ← consultoria iFood/99Food/Rappi/etc
├── 02-suporte-sistemas/               ← sistemas que a Consult revende
├── 03-crm/                            ← processos CRM
├── 04-automacao-ia/                   ← consultoria em automação IA pra clientes
├── 05-marketing/                      ← marketing da Consult Delivery
├── 06-financeiro/                     ← processos financeiros internos
└── 99-agentes/                        ← personas e prompts dos agentes IA
```

## Como usar

### Pra humanos (Wandson, Wélida, Eduardo)

1. **Ler:** clona o repo, abre em qualquer editor (VS Code, Obsidian, Cursor)
2. **Editar:**
   - Cria branch com seu nome (`feature/welida/script-novo-cliente`)
   - Edita o arquivo
   - PR pra `main` — outra pessoa revisa
3. **Buscar:** usa Ctrl+Shift+F no editor (busca em todos os arquivos)

### Pra agentes IA

Agentes acessam via MCP filesystem ou clone local na VPS. Configuração:
- Bridge Server tem clone em `/root/consult-delivery-knowledge/`
- Atualiza com cron: `*/30 * * * * git -C /root/consult-delivery-knowledge pull`
- Agentes consultam via helper `trigger/_shared/conhecimento.ts` (a ser criado)

## Convenções obrigatórias

### Nomenclatura

- Pastas: `kebab-case`, prefixo numérico (`01-`, `02-`)
- Arquivos: `kebab-case.md` (ex: `processo-onboarding-cliente.md`)
- Imagens: `kebab-case.png` em pasta `_assets/` junto do `.md`

### Frontmatter YAML obrigatório

Todo `.md` começa com:

```yaml
---
title: Processo de Onboarding de Cliente Novo
area: 01-atendimento-consultoria
tags: [onboarding, cliente-novo, checklist]
created: 2026-05-14
updated: 2026-05-14
authors: [wandson]
status: ativo  # ativo | rascunho | depreciado | arquivado
visibility: interno  # interno | publico | restrito
agentes_relacionados: [deli, breno]
---
```

### Limite de tamanho

- Arquivos `.md` < 500 linhas. Se passar → quebra em sub-arquivos.
- Imagens otimizadas (< 200 KB)
- Vídeos NÃO ficam aqui (use Drive/YouTube, linka aqui)

### Markdown disciplinado

- Headers em ordem (H1 → H2 → H3, sem pular)
- Listas com `-` (não `*`)
- Code blocks com linguagem (` ```bash`, ` ```sql`, etc)
- Tabelas pra dados estruturados, não prosa

## Status de cada arquivo

Veja `_index.md` pra lista completa atualizada.

## Como popular este repo

**Não tente migrar tudo de uma vez.** Faça assim:

1. **Mês 1:** popular `99-agentes/` (personas e prompts) — alta prioridade
2. **Mês 2:** popular `01-atendimento-consultoria/` (sua oferta principal)
3. **Mês 3+:** demais áreas conforme dor real

**Cada artigo escrito vale 100 artigos não-escritos.** Foque qualidade no que importa.

## Manutenção

- Toda primeira segunda do mês: review de `status: ativo` — algum tá depreciado?
- Toda PR fechada: confere se frontmatter está atualizado
- Toda decisão estratégica nova: registra em `00-empresa/decisoes/`

## Suporte

Dúvida sobre onde colocar? Pergunte ao Wandson ou abre uma issue.
