---
title: iFood — Operação e Métricas
area: 02-suporte-sistemas/ifood
tags: [ifood, operacao, metricas, cancelamento, tempo-preparo, indicadores, algoritmo]
created: 2026-05-20
updated: 2026-05-20
authors: [claude-code]
status: ativo
visibility: interno
---

# iFood — Operação e Métricas

## Taxa de cancelamento — causa raiz

A taxa de cancelamento é o indicador operacional com maior impacto no ranking e na elegibilidade a programas do iFood. O cálculo considera cancelamentos dos últimos 30 dias sobre o total de pedidos recebidos. O benchmark saudável é abaixo de 1,5%; acima de 3% começa a gerar penalizações visíveis.

As causas mais comuns de cancelamento são: **indisponibilidade de item** (produto no cardápio mas sem estoque físico), **atraso excessivo** (cliente cancela por demora), **loja fechada indevidamente** (recebe pedido fora do horário real de operação) e **erro no pedido** (restaurante não consegue preparar a combinação solicitada). Cada causa tem peso diferente no score do iFood — cancelamentos originados no restaurante pesam mais.

## Tempo médio de preparo

O iFood monitora a diferença entre o tempo de preparo declarado pelo restaurante e o tempo real registrado pelo sistema (do aceite do pedido até o momento em que o entregador coleta). Desvios consistentes — declarar 20 minutos mas preparar em 40 — geram penalidade progressiva.

O tempo de preparo ideal varia por categoria: lanchonetes e hamburguerias tipicamente operam em 15-25 minutos; pizzas em 25-40 minutos; comida japonesa em 20-35 minutos. Declarar um tempo realista (não otimista) e cumpri-lo consistentemente é mais eficiente do que declarar tempo baixo e atrasar.

## Tempo de loja aberta

O iFood registra discrepâncias entre o horário cadastrado e o horário real de operação. Loja que fecha antes do horário cadastrado, ou que abre tardiamente com frequência, recebe penalidades graduais. Durante os picos de demanda (almoço: 11h-14h, jantar: 18h-22h), fechar a loja é especialmente impactante — esses são os períodos de maior tráfego na plataforma.

Restaurantes com disponibilidade alta (abertos em todos os horários cadastrados, incluindo fins de semana e feriados) têm vantagem no ranking durante esses períodos de alta demanda.

## Tempo de espera do motoboy

O tempo que o entregador aguarda na loja após chegar afeta indiretamente a operação. Esperas longas pioram a experiência do entregador parceiro, podem gerar reclamações na plataforma de entregadores e, em casos extremos, pedidos de cancelamento durante a coleta. O iFood monitora esse indicador e pode sinalizar lojas com padrão de espera acima do normal.

## Chamados e reclamações

O volume de chamados abertos por clientes (reclamações de item errado, pedido incompleto, comida fria, etc.) alimenta métricas de qualidade do iFood além da nota de avaliação. Reclamações registradas via SAC do iFood têm peso no score geral da loja. Restaurantes com alto volume de reclamações podem ter recursos bloqueados ou ser excluídos de campanhas.

## Dashboard de métricas (Parceiro iFood)

O painel Parceiro iFood exibe os principais indicadores em tempo real e por período: nota média, volume de pedidos, taxa de cancelamento, ticket médio, tempo médio de preparo e tempo de abertura. Consultores devem acessar esses dados diretamente no painel para diagnóstico preciso — os indicadores variam dia a dia e precisam ser analisados em tendência (7-30 dias), não por snapshot pontual.

⚠️ Stub inicial. Conteúdo aprofundado será adicionado pelo time Consult Delivery.
