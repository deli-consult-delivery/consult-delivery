# Propostas de melhoria — Régua CSAT (LARA)

> **Só proposta.** Nada aqui foi implementado, nenhum draft novo foi criado, nenhuma copy nova
> está em produção. Baseado na análise de dados reais em `~/.ao/briefs/report-89-csat.md`
> (Karina Doceria, 2026-06-26 a 2026-07-06, 1074 envios, 36 respostas, 3.4%).

## 1. Cadência/horário — mudança com maior potencial de impacto

**Achado dos dados**: a taxa de resposta varia forte por horário de envio.

| Horário de envio (BRT) | Taxa de resposta |
|---|---|
| 8h-14h (manhã/almoço) | 0-3.9% |
| 15h-16h | 1.7-2.2% |
| **17h-19h (noite)** | **6.7-8.3%** |

E por dia da semana: segunda (5.6%) e quarta (5.9%) são os melhores; **sábado é o pior** (1.1%,
apesar de ser o dia de maior volume — 285 envios). Além disso, quem responde faz isso quase
sempre por impulso: mediana de 2-3 minutos entre receber a mensagem e responder (33 de 36
respostas em <1h). Isso sugere que a janela de atenção é curta e concentrada no fim do dia.

**Proposta**: mover o horário do cron de reengajamento de 11h BRT (atual, `csat-reengajamento.ts`)
para o fim da tarde/início da noite (ex.: **18h BRT**), quando a pessoa provavelmente já jantou/
está com o celular na mão e não ocupada com o próprio expediente. Testar também SKIP de sábado
(ou empurrar o envio de sábado pra domingo/segunda) já que é o pior dia — mas cuidado: são só
11 dias de dados de 1 tenant, então isso é uma hipótese a validar com mais volume, não uma
certeza estatística.

**Como testar sem mexer no código de produção agora**: rodar a mesma query de `report-89-csat.md`
periodicamente conforme mais dados chegarem (o volume dobra a cada ~duas semanas no ritmo atual)
e comparar taxa por horário antes/depois de qualquer mudança de cron.

## 2. Copy alternativa — 2-3 variantes para teste A/B (proposta, não implementada)

**Copy atual** (única em uso desde o início, sem variação — `TEMPLATE_PADRAO` em
`trigger/lara/csat-reengajamento.ts`):
> Oi {nome_cliente}! 😊 Vimos que você ainda não avaliou seu último atendimento. Leva menos de 1
> minuto e ajuda muito a gente: {link_avaliacao}

Como nunca houve variação de copy, **não há dado real para dizer qual funciona melhor** — as
variantes abaixo são hipóteses de copywriting, não conclusões de dados.

**Variante A — reciprocidade/curiosidade** (sugere que a opinião dela é aguardada, não "mais uma tarefa"):
> {nome_cliente}, sua opinião sobre o atendimento ainda não chegou até a gente 👀 Leva 10
> segundos: {link_avaliacao}

**Variante B — fricção mínima explícita** (remove a ambiguidade de "quanto tempo vai levar"):
> Oi {nome_cliente}! Só 1 toque já ajuda a gente a melhorar 🌟 Avalie em 10 segundos:
> {link_avaliacao}

**Variante C — urgência social leve, sem pressão** (evita tom de cobrança, mantém leveza):
> {nome_cliente}, ainda dá tempo de contar como foi seu atendimento 🙂 {link_avaliacao}

**Recomendação de teste**: dividir os próximos ~100-150 reengajamentos em 2-3 grupos (A/B/C) via
`metadata.variante` no draft (campo novo, não implementado), medir taxa de resposta por variante
depois de acumular volume suficiente (n pequeno hoje — 100 drafts pending no total — não dá pra
tirar conclusão de uma leva só).

## 3. Follow-up — o que fazer quando o reengajamento também não funciona

A régua atual (`decidirReengajamento`, PR #775) já impõe **máx. 1 reengajamento por pesquisa**
(dedup permanente via `msg_enviada_status='reengajado'`) — decisão correta pra não incomodar quem
já demonstrou desinteresse 2x. Propostas complementares, nenhuma implementada:

- **Fechar o loop silenciosamente**: quando o `public_token_expires_at` vence (7 dias) sem
  resposta nem depois do reengajamento, a linha já vira `status='expirada'` automaticamente (via
  `checkExpired` em `bridge-server/routes/publico-avaliacao.js`) — nenhuma ação nova necessária,
  mas vale deixar isso explícito no dashboard (ex.: badge "expirada sem responder, mesmo com
  reengajamento" para o Wandson enxergar o funil completo, não só pendente→respondida).
- **Não insistir num 3º canal/tentativa** — dado o volume de detratores reais sendo baixo (13 de
  37 respostas = nota 1, ver `report-89-csat.md` §nota), forçar mais uma tentativa arriscaria
  parecer spam pro cliente satisfeito que só não teve tempo de responder, sem necessariamente
  capturar mais detratores (quem dá nota 1 parece responder rápido quando decide responder — não
  é um problema de "não viu a mensagem").
- **Segmentar por perfil de resposta rápida vs. lenta**: como a mediana de quem responde é
  minutos, uma leitura possível é que "quem não respondeu em 24h muito provavelmente nunca vai
  responder à mesma mensagem" — o reengajamento (mensagem NOVA, gancho diferente) é a aposta
  certa por já ser um estímulo diferente, não um lembrete idêntico.

## 4. Ressalva sobre o dado em si (para o Wandson calibrar expectativa)

- **Viés de autosseleção forte**: das 37 respostas, **35% deram nota 1 e 59% deram nota 5** — só
  1 resposta (2.7%) ficou no meio (nota 4), nenhuma nota 2 ou 3. Isso é o padrão clássico de CSAT
  espontâneo (só quem foi muito bem ou muito mal atendido se dá ao trabalho de responder) — subir
  a taxa de resposta pode até "piorar" o CSAT% aparente no curto prazo, porque mais gente "neutra"
  passa a responder e dilui os 5 estrelas. Isso não é um problema da régua, é o comportamento
  normal de pesquisa espontânea — mas vale o Wandson saber antes de usar o número como se fosse
  uma amostra representativa.
- **Amostra pequena e concentrada**: 11 dias de dados, praticamente 100% de 1 único tenant
  (Karina Doceria — Consult Delivery tem só 1 linha, sem `msg_enviada_at`). "Taxa por segmento"
  não é possível hoje por **loja** (campo `loja_id` sempre nulo nos dados via CRM externo/
  DataCrazy) nem por **canal**/**copy** (só 1 canal, 1 copy, sem variação histórica) — só dá pra
  segmentar por horário e dia da semana, que é o que este documento cobre.
