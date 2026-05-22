---
title: iFood — Algoritmo de Relevância e Ranking
area: 02-suporte-sistemas/ifood
tags: [ifood, ranking, algoritmo, visibilidade, posicionamento]
created: 2026-05-20
updated: 2026-05-20
authors: [claude-code]
status: ativo
visibility: interno
---

# iFood — Algoritmo de Relevância e Ranking

## Visão geral do ranking

O iFood utiliza um algoritmo proprietário para determinar a ordem em que restaurantes aparecem para clientes nas listagens. A posição de um restaurante não é estática — varia por horário, localização do cliente, histórico do usuário e desempenho operacional recente. Restaurantes com melhor ranqueamento recebem mais impressões, mais cliques e mais pedidos.

O algoritmo avalia principalmente três dimensões: **desempenho operacional** (o que a loja entrega), **qualidade percebida** (o que clientes avaliam) e **completude do perfil** (o que a plataforma consegue exibir). Melhorias em qualquer uma dessas dimensões tendem a impactar positivamente a posição.

## Fatores principais conhecidos

**Volume de pedidos** é um dos sinais mais fortes. Restaurantes que recebem mais pedidos tendem a aparecer mais — o algoritmo interpreta alto volume como sinal de demanda real e relevância para aquele segmento/região. Isso cria um ciclo: mais visibilidade → mais pedidos → mais visibilidade. Para restaurantes novos ou em queda, quebrar esse ciclo exige ações de promoção (cupons, frete grátis) para gerar volume inicial.

**Taxa de cancelamento** é fator crítico negativo. Cancelamentos frequentes — especialmente por indisponibilidade de item ou atraso excessivo — penalizam diretamente o posicionamento. O iFood classifica cancelamentos por causa: cancelados pelo restaurante têm impacto maior do que cancelados pelo cliente ou pelo entregador. Manter taxa abaixo de 1,5% é considerado essencial para manter boa posição.

**Nota média** (avaliação dos clientes) impacta visibilidade diretamente. Restaurantes abaixo de 4,0 podem ser ocultados de determinadas listagens. A janela de cálculo é geralmente os últimos 30-60 dias de avaliações, não o histórico completo — isso significa que recuperação de nota é possível em algumas semanas com foco em experiência do cliente.

## Fatores secundários conhecidos

**Tempo de preparo declarado vs. real**: o iFood compara o tempo que o restaurante declarou no cadastro com o tempo real registrado pelos entregadores. Desvios frequentes (declarar 25min, entregar em 50min) geram penalidades. Tempo de preparo realista e consistente melhora a experiência e o ranking.

**Fotos e descrições dos itens**: itens sem foto têm taxa de conversão (clique → pedido) significativamente menor. O algoritmo interpreta baixa conversão como sinal de menor relevância. Itens com foto profissional e descrição clara performam melhor. A plataforma também usa as descrições para indexar o restaurante em buscas por categoria ou prato.

**Completude do perfil**: logo, foto de capa, horários corretos, endereço preciso, categorias preenchidas e ao menos 80% do cardápio com foto são fatores que o iFood considera para habilitar funcionalidades premium e melhorar posicionamento geral.

## Feedback loop do ranking

O sistema cria um ciclo auto-reforçador difícil de quebrar sem intervenção: restaurantes mal posicionados recebem menos pedidos → menos reviews → dados insuficientes para o algoritmo → mantidos em posições baixas. A estratégia recomendada para restaurantes em queda é atacar primeiro os fatores negativos (taxa de cancelamento, nota baixa) antes de investir em promoções, pois investimento em visibilidade sobre base operacional fraca desperdiça budget.

⚠️ Stub inicial. Conteúdo aprofundado será adicionado pelo time Consult Delivery.
