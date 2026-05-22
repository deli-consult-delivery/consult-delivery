---
title: Índice Mestre — Consult Delivery Knowledge
area: meta
tags: [indice, navegacao]
created: 2026-05-14
updated: 2026-05-14
authors: [wandson]
status: ativo
visibility: interno
---

# Índice Mestre

**Este arquivo é o primeiro que qualquer IA deve ler antes de buscar conhecimento.** Ele resume a estrutura, os tópicos disponíveis em cada área e onde achar coisa específica.

## Como usar (instruções pra IA)

1. **Sempre leia este arquivo PRIMEIRO** quando o usuário fizer pergunta de domínio
2. Identifique a área relevante (00-empresa, 01-atendimento, etc)
3. Abra **só** o(s) arquivo(s) da área certa — economiza tokens
4. Se não achar, retorne ao índice e busque por tag
5. Se ainda não achar, avise ao usuário: "não encontrei na base. Quer que eu busque em memória dinâmica (Supabase)?"

## Estrutura por área

### 00-empresa/ — Identidade e governança

Visão, missão, valores, equipe, decisões estratégicas duradouras.

| Arquivo | Conteúdo | Status |
|---|---|---|
| `visao-missao-valores.md` | Quem somos, o que fazemos, valores | ⏳ pendente |
| `equipe.md` | Wandson, Wélida, Eduardo — papéis e responsabilidades | ⏳ pendente |
| `politicas-internas.md` | Política de remoto, de cliente, de comunicação | ⏳ pendente |
| `decisoes/` | Pasta com decisões estratégicas (uma por arquivo) | ⏳ pendente |

### 01-atendimento-consultoria/ — Consultoria iFood/99Food/Rappi/etc

Sua oferta principal. Processos de consultoria de delivery.

| Arquivo | Conteúdo | Status |
|---|---|---|
| `oferta-de-servicos.md` | Catálogo do que a Consult oferece | ⏳ pendente |
| `processo-onboarding-cliente.md` | Como onboardar novo cliente | ⏳ pendente |
| `processo-analise-ifood.md` | Como gerar análise iFood | ⏳ pendente |
| `scripts/` | Pasta com scripts WhatsApp por situação | ⏳ pendente |
| `checklists/` | Checklists de cada etapa | ⏳ pendente |
| `cases/` | Cases de cliente (anonimizados) | ⏳ pendente |

### 02-suporte-sistemas/ — Sistemas revendidos e plataformas

Anota AI, Saipos, Cardapio Web, iFood e outros sistemas que a Consult ajuda a usar.

| Arquivo | Conteúdo | Status |
|---|---|---|
| `anota-ai/` | Tutoriais e troubleshooting Anota AI | ⏳ pendente |
| `saipos/` | Tutoriais e troubleshooting Saipos | ⏳ pendente |
| `cardapio-web/` | Tutoriais e troubleshooting Cardapio Web | ⏳ pendente |
| `playbook-suporte.md` | Como atender chamado de suporte | ⏳ pendente |
| `ifood/_index.md` | Sub-índice iFood — algoritmo, super restaurante, promoções, cardápio, operação | ✅ ativo |
| `ifood/algoritmo-relevancia.md` | Fatores de ranking: volume, cancelamento, nota, tempo, fotos | ✅ ativo |
| `ifood/super-restaurante.md` | Critérios do selo Super Restaurante (≥4.7 nota, ≥180 pedidos/mês) | ✅ ativo |
| `ifood/precos-e-promocoes.md` | Cupons, Frete Grátis, Item Patrocinado, pedido mínimo, ticket médio | ✅ ativo |
| `ifood/cardapio-otimizacao.md` | Fotos, descrições ranqueáveis, categorias, combos, complementos | ✅ ativo |
| `ifood/operacao-metricas.md` | Taxa cancelamento, tempo preparo, indicadores que o algoritmo usa | ✅ ativo |

### 03-crm/ — Processos CRM

Gestão de relacionamento com clientes (consultoria) e com clientes dos clientes.

| Arquivo | Conteúdo | Status |
|---|---|---|
| `processo-prospec-leads.md` | Como prospectar | ⏳ pendente |
| `processo-conversao.md` | Como converter lead em cliente | ⏳ pendente |
| `processo-fidelizacao.md` | Como manter cliente ativo | ⏳ pendente |
| `processo-churn.md` | Como agir quando cliente quer cancelar | ⏳ pendente |

### 04-automacao-ia/ — Consultoria em Automação IA

Oferta de Automação IA que a Consult vende pra clientes finais (associada ao agente NOVA).

| Arquivo | Conteúdo | Status |
|---|---|---|
| `oferta-automacao-ia.md` | O que a Consult vende em automação IA | ⏳ pendente |
| `processo-discovery.md` | Como mapear necessidade do cliente | ⏳ pendente |
| `templates/` | Templates de automações comuns | ⏳ pendente |
| `casos-de-uso/` | Casos resolvidos | ⏳ pendente |

### 05-marketing/ — Marketing da Consult

Conteúdo, posicionamento, campanhas.

| Arquivo | Conteúdo | Status |
|---|---|---|
| `posicionamento.md` | Como a Consult se posiciona no mercado | ⏳ pendente |
| `personas.md` | Personas-alvo da Consult | ⏳ pendente |
| `tom-de-voz.md` | Como a Consult fala | ⏳ pendente |
| `templates-bom-dia.md` | Templates pro Superagente de Bom Dia | ⏳ pendente |
| `calendario-editorial.md` | Calendário de conteúdo | ⏳ pendente |

### 06-financeiro/ — Processos internos

Cobrança, pricing, regras financeiras.

| Arquivo | Conteúdo | Status |
|---|---|---|
| `precificacao.md` | Como precificar serviços da Consult | ⏳ pendente |
| `politica-cobranca.md` | Quando e como cobrar inadimplente | ⏳ pendente |
| `regras-asaas.md` | Configuração e regras Asaas | ⏳ pendente |

### 99-agentes/ — Personas e prompts dos agentes IA

⚠️ **Alta prioridade** — popular primeiro.

| Arquivo | Conteúdo | Status |
|---|---|---|
| `deli/persona.md` | Quem é a DELI, como age | ⏳ pendente |
| `deli/system-prompt.md` | System prompt usado em runtime | ⏳ pendente |
| `deli/regras-orquestracao.md` | Quando DELI delega pra qual agente | ⏳ pendente |
| `lara/persona.md` | LARA — Marketing | ⏳ pendente |
| `cora/persona.md` | CORA — Cobrança | ⏳ pendente |
| `breno/persona.md` | BRENO — Atendimento | ⏳ pendente |
| `max/persona.md` | MAX — Suporte | ⏳ pendente |
| `nova/persona.md` | NOVA — Automação IA | ⏳ pendente |
| `analise-ifood/instrucoes.md` | Como Analisador iFood opera | ⏳ pendente |
| `loja-gpt/system-prompt.md` | System prompt do agente Loja-GPT (Onda 03) | ✅ ativo |

## Tags principais (busca cross-area)

- `#onboarding` — tudo sobre receber novo cliente
- `#cobranca` — processos financeiros e CORA
- `#whatsapp` — scripts e processos do canal
- `#ifood`, `#99food`, `#rappi` — específico por plataforma
- `#urgente` — casos críticos
- `#template` — modelos prontos
- `#vip` — clientes especiais

## Convenção de status

| Status | Significado |
|---|---|
| ✅ ativo | Em uso, autoritativo |
| ⏳ pendente | Ainda não escrito |
| 📝 rascunho | Sendo escrito, não usar como referência |
| ⚠️ depreciado | Não usar mais, mantido pra histórico |
| 🗄️ arquivado | Movido pra `_archive/`, fora da busca |

## Atualizações

Quando adicionar/editar arquivo, **atualize este índice na mesma PR**. Sem isso, o conteúdo fica invisível pra IA.
