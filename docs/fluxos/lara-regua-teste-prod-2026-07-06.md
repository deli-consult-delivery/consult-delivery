# Teste real da régua CSAT (`lara-csat-reengajamento`) em produção — 2026-07-06

**Objetivo:** disparar a task `lara-csat-reengajamento` direto em produção (sem
`tenant_id`, processando todos os tenants elegíveis) e provar com output bruto
que ela cria drafts pendentes (nunca envia), sem duplicar por avaliação.
**Nenhum draft foi aprovado ou enviado** — ficam na fila do Wandson (gated,
conforme `CLAUDE.md` § DRAFTS).

Mandato explícito de teste em prod autorizado nesta sessão. Deploy vigente no
momento do teste: `20260706.68` (confirmado em `report-88-deploy.md`).

---

## O que a task faz (lido em `trigger/lara/csat-reengajamento.ts`, origin/main)

- Busca até 50 `atendimento_avaliacoes` com `status='pendente'`, enviadas há
  ≥ 3 dias (`REENGAJAMENTO_DIAS_MIN`), com token de avaliação ainda válido, e
  **excluindo** quem já tem `msg_enviada_status='reengajado'` (fix de
  starvation do PR #781 — sem isso, a mesma janela das 50 mais antigas nunca
  varre o resto da fila em volume alto).
- Para cada avaliação elegível: checa dedup via `agent_drafts`
  (`agent_name='lara'`, `metadata->>tipo='csat_reengajamento'`,
  `metadata->>avaliacao_id=<id>`) — se já existe, pula (`ja_reengajado`).
  Erro na checagem de dedup vira `falha`, nunca "fail-open" criando 2º draft.
- Se elegível: cria 1 `agent_drafts` (`status='pending'`,
  `autonomy_level='amarelo'`, canal `whatsapp`, nunca envia) e marca a
  avaliação como `msg_enviada_status='reengajado'`.
- Roda 1x/dia via `laraCsatReengajamentoSchedule` (cron `0 14 * * *` = 11h
  BRT) **e** aceita disparo manual/teste (`tenant_id` opcional, ausente =
  processa todos) via a task de negócio separada `lara-csat-reengajamento`.

---

## Disparo (output bruto)

Rodado de dentro da VPS via SSH, `TRIGGER_SECRET_KEY` lido em runtime do
`bridge-server/.env` (nunca impresso/copiado, scripts apagados ao final —
mesmo padrão do E2E do loop AI-First, PR #777).

```
POST https://api.trigger.dev/api/v1/tasks/lara-csat-reengajamento/trigger
payload: {}
HTTP 200 {"id":"run_cmr9fgvyf8e7d0pn9guzsim6t","isCached":false}
```

## Run completo (`GET /api/v3/runs/{runId}`)

```json
{
  "id": "run_cmr9fgvyf8e7d0pn9guzsim6t",
  "taskIdentifier": "lara-csat-reengajamento",
  "version": "20260706.68",
  "status": "COMPLETED",
  "durationMs": 26001,
  "isSuccess": true,
  "payload": {},
  "output": {
    "total_candidatos": 50,
    "drafts_criados": 50,
    "pulados": 0,
    "falhas": 0
  }
}
```

`50/50` candidatos viraram draft, `0` pulados, `0` falhas — todos os 50
pertencem ao mesmo `tenant_id` (`e9fdaa66-cbe7-4dff-905b-afc4b10219ff`), lista
completa de `avaliacao_id`s no run bruto (não reproduzida aqui por tamanho).

⚠️ **Sem cap silencioso:** a query tem `limit(50)` — isto é, pode existir
mais fila além desses 50 (não sabemos quantos candidatos totais existem sem
o limite; o próximo disparo, manual ou pelo schedule diário, pega a próxima
leva de até 50, já que os processados saem da query fonte via
`msg_enviada_status='reengajado'`).

---

## Verificação via SELECT (output bruto)

**1. Drafts pendentes/amarelo do tipo `csat_reengajamento` (todos os runs de
hoje — o schedule das 11h BRT já tinha rodado antes do nosso disparo manual
às ~13h21 BRT):**
```
count: 100
```
Dos quais **50 têm `metadata->>run_id` = `run_cmr9fgvyf8e7d0pn9guzsim6t`**
(o disparo desta sessão) — os outros 50 são do run anterior
(`run_cmr9afxt35lch0in14bfu0qk7`, schedule diário).

**2. Dedup — nenhuma avaliação com mais de 1 draft:**
```
duplicados encontrados: 0
```
Confirma que a régua não duplica reengajamento pra mesma avaliação, mesmo
rodando 2x no mesmo dia (schedule + disparo manual).

**3. `atendimento_avaliacoes.msg_enviada_status='reengajado'` (marcação):**
```
count: 100
```
Bate exatamente com o total de drafts (100) — 1:1, toda avaliação que gerou
draft foi marcada, nenhuma ficou sem marcação (o que causaria reprocessamento
indevido no próximo run).

**4. Status de TODOS os drafts do tipo `csat_reengajamento` (qualquer
status, não só pending) — confere que nenhum foi aprovado/enviado:**
```json
{"pending": 100}
```
100/100 em `pending`. Nenhum `sent`, nenhum `approved`, nenhum `rejected`.
(Snapshot no momento desta verificação, logo após o run — não cobre uma
linha ter sido deletada em vez de mudar de status, nem um envio por caminho
paralelo fora de `agent_drafts`; a própria task só faz `insert` em
`agent_drafts`, nunca chama Evolution/WhatsApp, então não há caminho de
envio interno a essa execução.)

**5. Amostra (3 de 100 drafts, para conferir o shape real gravado):**
```json
[
  {
    "id": "fb7f766b-b2cf-4808-afd3-9d61a83ef9cd",
    "metadata": {
      "tipo": "csat_reengajamento",
      "run_id": "run_cmr9afxt35lch0in14bfu0qk7",
      "avaliacao_id": "7718ca3d-8c82-4f8f-a1c4-5ebbaa68250e",
      "dias_sem_resposta": 6
    }
  }
]
```

---

## Conclusão

**Nenhum draft foi aprovado ou enviado nesta sessão** — os 100 drafts
(50 do schedule automático de hoje + 50 do disparo manual desta sessão)
seguem `status='pending'`, aguardando aprovação humana (autonomy `amarelo`),
conforme a regra de DRAFTS do `CLAUDE.md` raiz.

Resultado da régua CSAT: **funciona como projetado** — cria draft por
avaliação elegível, nunca duplica (dedup confirmado com 0 colisões mesmo
rodando 2x no dia), marca a linha-fonte corretamente, e não há nenhum sinal
de auto-envio.

Scripts temporários usados na VPS (leitura de `TRIGGER_SECRET_KEY`/
`SUPABASE_SERVICE_ROLE_KEY` em runtime) foram removidos ao final.
