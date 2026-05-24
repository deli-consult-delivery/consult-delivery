# Feature 1 — Loop Confirmação Cliente Pós-Conclusão

**Status:** Planejada | **Onda:** 07 | **Branch:** `feature/piloto-07-loop-revisao`
**Estimativa:** ~10h (~3 dias de trabalho a 2-4h/dia)
**Gerada por:** Feature Discovery Swarm — 2026-05-24

---

## Objetivo

Fechar o ciclo de qualidade no Piloto: quando uma tarefa é marcada concluída,
o cliente é notificado via WhatsApp e tem 48h para confirmar (OK) ou reabrir
(AJUSTAR + motivo). A resposta do cliente redireciona o fluxo automaticamente
— sem intervenção manual da equipe.

## Problema atual

Hoje `marcar-concluida` muda o status para `concluida` imediatamente.
O cliente não é consultado. Reaberturas acontecem por WhatsApp avulso,
fora do sistema, gerando retrabalho manual e perda de rastreabilidade.

## Fluxo após a feature

```
Equipe marca concluída
        ↓
Status → aguardando_revisao_cliente
+ sessão aberta em whatsapp_aprovacao_sessions (48h)
+ mensagem WhatsApp enviada ao cliente
        ↓
    Cliente responde
   ┌────────────────────┐
   OK / OK tudo         AJUSTAR + motivo
   ↓                    ↓
Status → concluida    Status → em_execucao
cliente_aprovado_em   motivo_revisao_cliente salvo
                      draft criado no painel (channel='painel')
```

Se o cliente não responder em 48h → tarefa expira → volta para `em_execucao` automaticamente (scheduled task diária).

## Infraestrutura já existente

- `whatsapp_aprovacao_sessions` — tabela já criada (migration aplicada)
- `trigger/breno/parse-resposta-cliente.ts` — parser OK/AJUSTAR/invalido
- `trigger/breno/processar-webhook.ts` — webhook handler do Breno
- `GET /api/tarefas/loja/:lojaId/relatorio` — retorna dados reais

## Tasks

### F1-T1 — Migration SQL (1h)
**Arquivo:** `supabase/migrations/20260525_001_loop_revisao_cliente.sql`

```sql
-- Novo status no enum
ALTER TYPE tarefas_loja_status ADD VALUE IF NOT EXISTS 'aguardando_revisao_cliente'
  AFTER 'aguardando_aprovacao';

-- Colunas novas na tabela tarefas_loja
ALTER TABLE tarefas_loja
  ADD COLUMN IF NOT EXISTS motivo_revisao_cliente TEXT,
  ADD COLUMN IF NOT EXISTS cliente_aprovado_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cliente_aprovado_por_telefone TEXT;
```

RLS: service_role acesso total + tenant_members SELECT nas sessões.
Função PL/pgSQL `expirar_sessoes_aprovacao()` para uso pelo scheduled task.

**Critério de aceite:** Migration aplica sem erro; novo enum aparece em `pg_enum`.

---

### F1-T2 — Modificar marcar-concluida (2h)
**Arquivo:** `bridge-server/routes/tarefas.js` — endpoint `PATCH /api/tarefas/:id/marcar-concluida`

Mudanças:
1. Aceita `telefone_cliente` no body
2. Se `telefone_cliente` presente: status → `aguardando_revisao_cliente`, cria sessão em `whatsapp_aprovacao_sessions`, envia mensagem Evolution API
3. Se ausente (sem WhatsApp cadastrado): comportamento atual mantido → status `concluida`

**Critério de aceite:** PATCH com `telefone_cliente` cria sessão e retorna status `aguardando_revisao_cliente`.

---

### F1-T3 — Criar aceitar-conclusao (1h)
**Arquivo:** `bridge-server/routes/tarefas.js`

```
POST /api/tarefas/:id/aceitar-conclusao
Auth: INTERNAL_BRIDGE_TOKEN (header X-Internal-Token)
```

- Status → `concluida`
- Seta `cliente_aprovado_em = NOW()` e `cliente_aprovado_por_telefone`
- Fecha sessão (`status = 'aceita'`)

**Critério de aceite:** POST fecha sessão e muda status para `concluida`.

---

### F1-T4 — Criar reabrir (1h)
**Arquivo:** `bridge-server/routes/tarefas.js`

```
POST /api/tarefas/:id/reabrir
Auth: INTERNAL_BRIDGE_TOKEN
Body: { motivo, telefone_cliente }
```

- Status → `em_execucao`
- Salva `motivo_revisao_cliente`
- Fecha sessão (`status = 'reaberta'`)
- Cria `agent_drafts` com `channel = 'painel'` notificando a equipe

**Critério de aceite:** POST reabre tarefa e cria draft visível no painel.

---

### F1-T5 — Handler webhook Breno (2h)
**Arquivo:** `trigger/breno/processar-webhook.ts`

Nova função `handleRespostaAprovacao(telefone, mensagem, tenantId)`:
1. Busca sessão aberta e não expirada para o telefone
2. Se não encontrar → retorna `false` (mensagem segue fluxo normal)
3. Chama `parseRespostaCliente(mensagem)`
4. Tipo `invalido` → responde "Não entendi, responda OK ou AJUSTAR + motivo"
5. Tipo `aprovacao` → chama `aceitar-conclusao` via fetch interno com `INTERNAL_BRIDGE_TOKEN`
6. Tipo `rejeicao` → chama `reabrir` com o motivo extraído

Inserir no topo do handler principal: `if (await handleRespostaAprovacao(...)) return;`

**Critério de aceite:** Mensagem "OK" de telefone com sessão aberta fecha a tarefa; "AJUSTAR: texto" reabre com o motivo.

---

### F1-T6 — Task expirar sessões (1h)
**Arquivo:** `trigger/breno/expirar-sessoes-aprovacao.ts`

```typescript
export const expirarSessoesAprovacao = schedules.task({
  id: "breno-expirar-sessoes-aprovacao",
  cron: "0 3 * * *", // 03:00 UTC diário
  run: async (payload) => { ... }
});
```

Zod schemas: `ExpirarSessoesInput` (tenant_id?, dry_run), `ExpirarSessoesOutput` (sessoes_expiradas, tarefas_revertidas, drafts_criados, erros).

Para cada sessão expirada: `status → em_execucao` + draft no painel + `logAgentRun()`.

**Critério de aceite:** Task aparece no dashboard Trigger.dev e dry_run retorna contagem correta.

---

### F1-T7 — UI badge + coluna Kanban (2h)
**Arquivo:** `src/screens/TarefasClientesScreen.jsx`

1. Badge âmbar "Aguardando Cliente" para status `aguardando_revisao_cliente`
2. Nova coluna no Kanban entre "Aguardando Aprovação" e "Concluída"
3. Countdown regressivo via `expira_em` da sessão (lido via Supabase Realtime)
4. Botão "Reenviar lembrete" → chama `POST /api/tarefas/:id/reenviar-lembrete` (futuro)

**Critério de aceite:** Tarefa em `aguardando_revisao_cliente` aparece na coluna correta com badge âmbar e timer.

---

## Critério de aceite da feature completa

1. Equipe marca concluída com telefone → WhatsApp enviado, status `aguardando_revisao_cliente`
2. Cliente responde "OK" → status `concluida`, `cliente_aprovado_em` preenchido
3. Cliente responde "AJUSTAR: texto" → status `em_execucao`, motivo salvo, draft no painel
4. Sem resposta em 48h → scheduled task reverte para `em_execucao`
5. Kanban mostra coluna e badge corretamente

## Segurança

- Endpoints `aceitar-conclusao` e `reabrir` validados por `INTERNAL_BRIDGE_TOKEN` (Infisical)
- Sessões têm `tenant_id` — webhook só lê sessão do tenant correto
- RLS bloqueia acesso cross-tenant em `whatsapp_aprovacao_sessions`
