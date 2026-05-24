# T3 — BomDia + Encerramento: Full Docs
S1-G00 Reconhecimento | 2026-05-24

> ISOLAMENTO: EvoNexus ignorado. Foco: /root/consult-delivery + Supabase czyanilrverorwenikqw.
> RECON APENAS — nenhuma alteração de código.
> CORREÇÃO vs T1: agents-state.md diz "HeyGen" — ERRADO. Engine real: OpenRouter/Recraft V4.1.

---

## ARQUITETURA GERAL

```
Trigger.dev Schedule (cron)
    │
    ├─ gerar-imagem schedules (BomDia only, image-only)
    │       └─ bomDiaGerarImagem.trigger({})
    │               → Claude claude-sonnet-4-6: gera dalle_prompt + caption + text_on_image
    │               → OpenRouter / Recraft V4.1: gera imagem (Feed 16:9 + Story 9:16)
    │               → Supabase Storage: upload bucket 'public'
    │               → agent_runs: logAgentRun (agent_id='bom-dia')
    │
    └─ envio-agendado schedules (BomDia + Encerramento, full pipeline)
            → check feriado → check bom_dia_config.auto_send
            → check agent_runs idempotência (26h window)
            → tasks.triggerAndWait("bom-dia-gerar-imagem") ← imagem pode já estar em cache
            → query whatsapp_groups WHERE bom_dia_ativo=true
            → POST Bridge /agents/{bom-dia|encerramento}/send-groups
            → Evolution API sendMedia por grupo
            → agent_runs: logAgentRun (agent_id='bom-dia-scheduler' | 'encerramento-scheduler')
```

**Design intent:** gerar-imagem schedule dispara 5 min antes do envio-agendado schedule.
Imagem é pré-gerada e cacheada em agent_runs. Quando envio-agendado dispara, `triggerAndWait`
retorna do cache imediatamente → fase de envio é mais rápida.

---

## BOM DIA

### Arquivos

| Arquivo | Responsabilidade |
|---------|-----------------|
| `trigger/bom-dia/gerar-imagem.ts` | Gera imagem + caption. Inclui schedules de pré-geração |
| `trigger/bom-dia/envio-agendado.ts` | Pipeline completo: gera se necessário + envia para grupos |

### Schedule tasks (4 total — 2 arquivos)

| Task ID | Cron | UTC | BRT | Origem | Ação |
|---------|------|-----|-----|--------|------|
| `bom-dia-schedule-weekday` | `55 11 * * 1-5` | 11:55 | 08:55 | gerar-imagem.ts | Só gera imagem |
| `bom-dia-schedule-sabado` | `55 10 * * 6` | 10:55 | 07:55 | gerar-imagem.ts | Só gera imagem |
| `bom-dia-envio-agendado-semana` | `0 12 * * 1-5` | 12:00 | 09:00 | envio-agendado.ts | Gera + envia grupos |
| `bom-dia-envio-agendado-sabado` | `0 11 * * 6` | 11:00 | 08:00 | envio-agendado.ts | Gera + envia grupos |

> ⚠️ A separação é intencional: gerar-imagem fires 5min antes para pré-aquecer o cache.

### Config table: bom_dia_config

```sql
SELECT * FROM bom_dia_config;
-- 1 row:
-- tenant_id:    9079bd4d-4df7-4023-90fb-d79c8ba7e900
-- auto_send:    true
-- hora_semana:  09:00:00
-- hora_sabado:  08:00:00
-- updated_at:   2026-05-21
```

> ⚠️ TD#44: `hora_semana` e `hora_sabado` existem na config mas NÃO são consumidas pelo cron.
> O cron é hardcoded (`0 12 * * 1-5`). Alterar a config via UI não muda o horário real de disparo.

### Prompt architecture (BomDia)

Nenhum arquivo `.md` externo de prompt. Tudo embutido em `gerar-imagem.ts`.

**Claude (claude-sonnet-4-6)** recebe:
- Dia da semana + tema + data
- Estilo visual do dia (rotação semanal, 5 estilos A-F)
- Tom do dia (mood, elementos, iluminação — varia por weekday)
- Frase do dia (biblioteca PHRASE_LIBRARY por weekday, rotação por ISO week)
- Paleta de cor (rotação semanal, 6 paletas)
- Calendário editorial (rotação semanal, calendários A-F de temas)
- Feedbacks acumulados (`bom_dia_feedback` — últimos 10 votos)
- Memória/instruções salvas em `tenant_agent_config.config.memory/instructions`

**Claude retorna JSON:**
```json
{
  "dalle_prompt": "... (inglês, para Recraft V4.1)",
  "text_on_image": "... (PT-BR, max 7 palavras)",
  "caption": "... (PT-BR, max 4 linhas WhatsApp)",
  "theme": "... (PT-BR resumido)"
}
```

**Recraft V4.1 Utility** via OpenRouter:
- Endpoint: `https://openrouter.ai/api/v1/chat/completions`
- Model: `recraft/recraft-v4.1-utility`
- Feed: `1820x1024` (16:9)
- Story: `1024x1820` (9:16)
- Timeout por request: `AbortSignal.timeout(90_000)` (90s)
- Retry: 3 tentativas com delay 3s × attempt

**Upload:** Supabase Storage bucket `public`
- Path feed: `bom-dia/{date}-{runId8}-feed-1920x1080.webp`
- Path story: `bom-dia/{date}-{runId8}-story-1080x1920.webp`

**Idempotência:** verifica `agent_runs` WHERE `agent_id='bom-dia'` AND `status='success'`
AND `created_at >= now() - 26h`. Se output.date == hoje → retorna cache (não regera).
Bypass: `force_new=true`, `custom_theme`, `custom_brief`, ou `weekday_override`.

### Tabelas consumidas (BomDia)

| Tabela | Uso |
|--------|-----|
| `bom_dia_config` | auto_send, hora config (hora não usada no cron) |
| `bom_dia_feedback` | últimos 10 feedbacks (thumbs_up/down) para orientar geração |
| `tenant_agent_config` | memory, instructions, calendar_id por tenant |
| `agent_runs` | idempotência + audit log |
| `whatsapp_groups` | `WHERE bom_dia_ativo=true` — lista de grupos para envio |
| `evolution_instances` | Bridge seleciona instância ativa |

---

## ENCERRAMENTO

### Arquivos

| Arquivo | Responsabilidade |
|---------|-----------------|
| `trigger/encerramento/gerar-imagem.ts` | Gera imagem + caption (sem schedule embutido) |
| `trigger/encerramento/envio-agendado.ts` | Pipeline completo: gera + envia para grupos |

### Schedule tasks (2 total — apenas envio-agendado.ts)

| Task ID | Cron | UTC | BRT | Ação |
|---------|------|-----|-----|------|
| `encerramento-envio-agendado-semana` | `0 21 * * 1-5` | 21:00 | 18:00 | Gera + envia grupos |
| `encerramento-envio-agendado-sabado` | `0 15 * * 6` | 15:00 | 12:00 | Gera + envia grupos |

> Diferença vs BomDia: Encerramento NÃO tem schedules em gerar-imagem.ts.
> Não há separação de pré-geração. Pipeline único no envio-agendado.

### Config table: encerramento_config

```sql
SELECT * FROM encerramento_config;
-- 1 row:
-- tenant_id:  9079bd4d-4df7-4023-90fb-d79c8ba7e900
-- auto_send:  true
-- updated_at: 2026-05-22
-- (sem colunas hora_semana / hora_sabado)
```

> Diferença vs bom_dia_config: não tem hora columns. Horários 100% hardcoded no cron.

### Prompt architecture (Encerramento)

Mesmo padrão do BomDia, com diferenças:

- **Tema:** 6 temas por dia (DAILY_THEME weekday→text, foco em encerramento/descanso)
- **Tom:** CLOSING_TONE por dia (mood de fim de expediente)
- **Estilos visuais:** 4 estilos (A: Pôr do Sol Urbano, B: Noite Chegando, C: Minimalista Quente, D: Flat Entardecer)
- **Cor accent:** laranja `#f97316` (vs vermelho `#B70C00` do BomDia)
- **Caption:** `"Boa noite!"` / `"Bom fim de semana!"` + horário de retorno
- **Retry Anthropic:** `withOverloadedRetry()` (4 tentativas com delay 15s para erro 529) — AUSENTE no BomDia
- **Sem feedback loop:** não lê `bom_dia_feedback` equivalente

---

## RUNS BRUTOS — ÚLTIMOS 20 (BomDia + Encerramento)

```
agent_id                 | status  | created_at UTC              | output_preview
-------------------------|---------|-----------------------------|-----------------
encerramento-scheduler   | failed  | 2026-05-23 15:02:40         | {"error":"The operation was aborted due to timeout","groups_count":0}
encerramento-scheduler   | failed  | 2026-05-23 15:02:39         | {"error":"The operation was aborted due to timeout"}
encerramento             | success | 2026-05-23 15:02:07         | date=2026-05-23, theme="Sábado ao meio-dia...", caption="Bom fim de semana! ☀️..."
bom-dia-scheduler        | failed  | 2026-05-23 11:01:25         | {"error":"The operation was aborted due to timeout","groups_count":0}
bom-dia-scheduler        | failed  | 2026-05-23 11:01:25         | {"error":"The operation was aborted due to timeout"}
bom-dia                  | success | 2026-05-23 10:56:02         | date=2026-05-23, theme="Descanso ativo...", caption="Bom dia! 🧭..."
encerramento-scheduler   | failed  | 2026-05-22 21:01:16         | {"error":"The operation was aborted due to timeout","groups_count":0}
encerramento-scheduler   | failed  | 2026-05-22 21:01:16         | {"error":"The operation was aborted due to timeout"}
encerramento             | success | 2026-05-22 18:10:26         | date=2026-05-22, theme="Sexta encerrada — semana conquistada..."
encerramento             | success | 2026-05-22 14:50:40         | (manual regeneração)
encerramento             | success | 2026-05-22 14:07:59         | (manual regeneração)
encerramento-scheduler   | success | 2026-05-22 14:06:47         | groups_count=1, sent=1 ← ÚLTIMO ENVIO BEM-SUCEDIDO
encerramento-scheduler   | success | 2026-05-22 14:06:46         | groups_sent=1, img_url=storage/encerramento/2026-05-22-...webp
encerramento-scheduler   | success | 2026-05-22 14:04:51         | (retry do mesmo run, groups_count=1)
encerramento-scheduler   | success | 2026-05-22 14:04:50         | groups_sent=1
encerramento-scheduler   | success | 2026-05-22 14:01:49         | results=[], tenants_processed=0 (sem config naquele momento)
encerramento-scheduler   | success | 2026-05-22 13:27:28         | results=[], tenants_processed=0
encerramento-scheduler   | success | 2026-05-22 13:23:08         | results=[], tenants_processed=0
encerramento             | success | 2026-05-22 13:13:48         | (manual)
bom-dia-scheduler        | success | 2026-05-22 12:00:49         | groups_count=1 ← ÚLTIMO ENVIO BOM DIA BEM-SUCEDIDO
```

**Padrão de falha confirmado:**
- Scheduler tenta chamar Bridge → Bridge chama Evolution API → timeout 30s → Trigger.dev aborta
- Runs manuais (`bom-dia`, `encerramento`) sempre geram imagem com sucesso (não chamam Bridge)
- Último envio bem-sucedido automático: **BomDia = 2026-05-22 12:00 UTC / Encerramento = 2026-05-22 14:06 UTC**
- Desde 2026-05-23: ambos os schedulers falhando em 100% das tentativas

---

## COMPARATIVO BOM DIA × ENCERRAMENTO

| Dimensão | BomDia | Encerramento |
|----------|--------|-------------|
| Schedules embutidos em gerar-imagem.ts | ✅ 2 (pré-geração) | ❌ não tem |
| Schedules em envio-agendado.ts | ✅ 2 (pipeline completo) | ✅ 2 (pipeline completo) |
| Total de schedule tasks | **4** | **2** |
| Hora config em DB | hora_semana + hora_sabado (NÃO consumida) | sem hora columns |
| Cor accent | Vermelho #B70C00 | Laranja #f97316 |
| Estilos visuais | 5 (A-E) + 6 paletas + 6 calendários | 4 (A-D), sem paleta, sem calendário editorial |
| Feedback loop | ✅ bom_dia_feedback | ❌ não tem |
| Retry Anthropic 529 | ❌ não tem | ✅ withOverloadedRetry(4) |
| Image engine | OpenRouter / Recraft V4.1 | OpenRouter / Recraft V4.1 |
| Timeout Recraft | 90s com 3 retries | 90s com 3 retries |
| Storage paths | `bom-dia/{date}-{id}-{format}.webp` | `encerramento/{date}-{id}-{format}.webp` |

---

## TECH DEBTS IDENTIFICADOS EM T3

| TD | Severidade | Descrição |
|----|-----------|-----------|
| TD#36 | 🔴 Alta | (já registrado em T1) Scheduler timeout Bridge→Evolution |
| TD#44 | 🟡 Média | `bom_dia_config.hora_semana/hora_sabado` existem mas NÃO são consumidas pelo cron — hardcoded |
| TD#45 | 🟡 Média | BomDia tem 4 schedule tasks (2 gerar-imagem + 2 envio-agendado). Se ambas estiverem ativas no Trigger.dev cloud, gerar-imagem dispara 5min antes — design intencional, mas não documentado |
| TD#46 | 🔵 Observação | T1 doc (agents-state.md) afirma "geração HeyGen" — INCORRETO. Engine real: OpenRouter/Recraft V4.1 |
| TD#47 | 🔵 Observação | Encerramento não tem `withOverloadedRetry` no gerar-imagem.ts para Recraft — inconsistência com BomDia (BomDia também não, mas Encerramento tem para Claude) |

---

## CORREÇÃO DO T1

`docs/deli-memory/recon/agents-state.md` linha 121:
```
Prompt-base | Não encontrado `.md` externo — geração de imagem HeyGen   ← ERRADO
```
Correção:
```
Engine de imagem: OpenRouter API (https://openrouter.ai/api/v1/chat/completions)
Modelo: recraft/recraft-v4.1-utility
Caption/prompt: Claude claude-sonnet-4-6 embutido em gerar-imagem.ts (sem .md externo)
```

---

*Gerado em: 2026-05-24 | S1-G00 T3*
