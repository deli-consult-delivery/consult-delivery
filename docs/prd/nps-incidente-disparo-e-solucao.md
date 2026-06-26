# NPS/CSAT DataCrazy — Incidente de disparo em massa e solução para produção

Última atualização: 2026-06-26 · Status: **PAUSADO em produção até implementar a solução**

## 1. O que aconteceu (incidente 2026-06-26)

Ao tirar o piloto (remover a whitelist `piloto_telefone_teste`), o poller disparou
pesquisa para **~310 conversas reais** da Karina Doceria em poucos minutos
(04:05–04:19 UTC), em vez de só para conversas recém-finalizadas.

Ações de contenção tomadas:
- Flags `nps_auto_envio=false`, `csat_auto_envio=false` no `avaliacao_config`.
- 3 schedules desativados no Trigger.dev e **comentados no código** (PR #559) para
  serem à prova de deploy: `datacrazy-nps-poller-cron`, `nps-enviar-cron`,
  `csat-enviar-avaliacao-cron`.
- As 309 conversas reabertas pelas mensagens foram **re-finalizadas** via
  `POST /api/v1/conversations/{id}/finish` (script em lote, 309/309 OK).

## 2. Causa raiz

O DataCrazy **não expõe um timestamp de finalização** da conversa:
- Campos disponíveis: `finished` (bool), `updatedAt`, `lastMessageDate`,
  `lastReceivedMessageDate`, `lastSendedMessageDate`, `statuses` (= `["finished"]`, sem data).
- **Não existem** `finishedAt`/`closedAt`/`endedAt`.

O poller usava como proxy de "recém-finalizada": `finished===true` + `updatedAt`
nos últimos 7 min. Num CRM movimentado, há **centenas** de conversas finished e
muitas têm `updatedAt` recente → ao remover a whitelist, varreu o backlog inteiro.

Agravante: `csat-enviar-avaliacao-cron` (a cada 15 min) era um sender separado que
**não respeitava** o flag `csat_auto_envio` — continuou enviando após desligarmos o flag.

## 3. O que JÁ está correto (testado no piloto)

- **Dispatcher unificado** (`datacrazy-nps-poller`): 1º atendimento → CSAT; 2º+ →
  NPS se fora 30d, senão CSAT. Nunca os dois. (PRs #549, #556)
- `external_ref` = `conv.id:updatedAt` (único por finalização). (#558)
- `origem` CSAT = `crm_externo` (constraint). (#557)
- Idempotência app-level de 120 min (janelas de cron sobrepostas).
- Alerta de detrator com fallback p/ instância Evolution da CD → WhatsApp do Wandson. (#555)
- Branding do tenant em todos os estados + upload de logo no painel. (#552, #554)
- Logo da Karina no Storage e `tenants.logo_url` setado.

**O que falta é só o GATILHO de disparo confiável.**

## 4. Soluções para o gatilho (decisão pendente)

### Opção A — Baseline + high-water mark (RECOMENDADA: rápida, sem dependência externa)
Adicionar `avaliacao_config.nps_baseline_at timestamptz`.
- No go-live, setar `nps_baseline_at = now()`.
- O poller só processa conversa cujo `updatedAt > nps_baseline_at`.
- Efeito: todo o backlog de conversas já finalizadas (updatedAt < baseline) é
  **suprimido**; só finalizações **após** o go-live geram pesquisa.
- Cliente novo que finaliza depois do go-live → CSAT (1º). Próximo pedido → NPS.
- Cliente antigo só é pesquisado quando **re-finalizar** (novo pedido).
- Risco residual: se uma conversa finished tiver `updatedAt` avançado sem
  re-finalização real (ex.: nota/tag/automação), pode gerar 1 pesquisa indevida.
  Mitigável combinando com o dedup de 120 min + cooldown 30d.

### Opção B — Webhook de evento "finished" (mais robusta, depende do DataCrazy)
DataCrazy notifica nosso bridge quando uma conversa é finalizada → disparo por
evento, sem polling. **Bloqueio atual:** gestão de webhook NÃO está na API v1
(`GET /webhooks|hooks|integrations|...` → todos 404). Precisa configurar no
**painel do DataCrazy** ou abrir chamado no suporte deles perguntando:
"Vocês disparam webhook em evento de conversa finalizada? Como configurar a URL?"

### Recomendação
Implementar **A** agora (destrava produção com segurança) e buscar **B** em paralelo
(robustez de longo prazo). Antes de reativar: testar A com a whitelist do Wandson,
confirmar que o backlog NÃO dispara, e só então remover a whitelist.

## 5. Checklist para voltar à produção
1. [ ] Implementar `nps_baseline_at` no schema + filtro no poller.
2. [ ] Reativar os 3 crons no código (descomentar) — ou só o dispatcher.
3. [ ] `nps_baseline_at = now()`, whitelist = Wandson, testar: backlog não dispara, finalização nova dispara.
4. [ ] Remover whitelist, monitorar 1º ciclo real (volume baixo esperado).
5. [ ] (Paralelo) Investigar webhook no painel/suporte DataCrazy.
