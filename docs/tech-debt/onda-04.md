# Tech Debt — Piloto Onda 04 (WhatsApp Aprovação de Tarefas)

Identificados durante implementação T6–T10 (mai/2026).  
Branch: `feature/piloto-04-whatsapp-loom`

---

## TD#16 — Bridge `enviar-whatsapp` sem atomicidade

**Arquivo:** `bridge-server/routes/analises.js` (rota POST `…/enviar-whatsapp`)  
**Severidade:** Média  
**Sintoma:** Se `sendText` falhar após INSERT na sessão e PATCH no status da análise,
fica uma sessão órfã ativa e o status `enviada_cliente` sem mensagem enviada.
Retry pelo usuário duplica sessões.  
**Fix sugerido:** Mover `sendText` para DEPOIS dos dois INSERTs; adicionar rollback
(DELETE sessão + PATCH status de volta) em caso de falha no envio.  
**Status:** Aberto

---

## TD#17 — Redundância `.eq()` + `.or()` no handler T6

**Arquivo:** `supabase/functions/evolution-webhook/index.ts` (função `handleMessagesUpsert`, bloco T6 ~linha 413)  
**Severidade:** Baixa  
**Sintoma:** A query usa `.or(numFilter).eq('status', 'ativa')` mas o `numFilter`
poderia ser substituído por uma lógica mais limpa via `.in()` quando há dois números.  
**Fix sugerido:** Extrair `normalizeBrPhone(num)` como helper compartilhado;
usar `.in('numero_destino', [senderNum, senderNumAlt].filter(Boolean))`.  
**Status:** Aberto (não bloqueia funcionalidade)

---

## TD#18 — Silent fail INSERT `tarefa_aprovacoes` com colunas inexistentes ✅ FIXADO

**Arquivo:** `supabase/functions/evolution-webhook/index.ts`  
**Severidade:** Alta (foi bloqueante)  
**Sintoma:** INSERTs usavam `feita_por_tipo` e `feita_via` que não existem na tabela.
Supabase JS v2 não lança exceção — retorna `{ data: null, error: {...} }` silenciosamente.
Nenhuma aprovação era registrada no banco.  
**Fix aplicado:** Removidas colunas inexistentes; substituídas por `nota: 'via WhatsApp'`.
Deploy: evolution-webhook v41 (2026-05-23).  
**Status:** ✅ Fechado — commit `6076e7b`

---

## TD#19 — `numero_destino` gravado em formato inconsistente (12 vs 13 dígitos BR)

**Arquivo:** `bridge-server/routes/analises.js` (rota POST `…/enviar-whatsapp`)  
**Severidade:** Alta (foi bloqueante)  
**Sintoma:** O Bridge recebe o número do caller em 13 dígitos (`5594984367456`) e grava
assim em `whatsapp_aprovacao_sessions.numero_destino`. Porém a Evolution API envia o JID
em 12 dígitos (`559484367456@s.whatsapp.net`) para números de celular BR antigos.
A query `.eq('numero_destino', senderNum)` nunca encontrava a sessão.  
**Fix aplicado (paliativo):** Edge function v41 agora tenta ambos os formatos via `.or()`.  
**Fix definitivo pendente:** Bridge deve normalizar para 12 dígitos (formato Evolution)
antes de gravar `numero_destino`. Assim a query pode usar `.eq()` simples.  
**Status:** Parcialmente corrigido (paliativo na edge function); fix raiz no Bridge pendente.

---

## TD#20 — Sessão não encerra automaticamente após `OK tudo`

**Tabela:** `whatsapp_aprovacao_sessions`  
**Severidade:** Média  
**Sintoma:** Após processamento de `OK tudo`, a sessão permanece `status='ativa'`.
Não existe coluna `encerrada_em` na tabela.
Isso permite que mensagens subsequentes do mesmo número continuem sendo roteadas
para o handler T6 mesmo após todas as tarefas aprovadas.  
**Fix sugerido:**
1. Adicionar coluna `encerrada_em TIMESTAMPTZ` à tabela.
2. Em `handleAprovacaoSession`, após `aprovar_tudo = true` ou quando todas as tarefas
   de uma sessão forem respondidas, fazer UPDATE `status='encerrada', encerrada_em=NOW()`.  
**Status:** Aberto

---

## TD#21 — `internal_notifications` INSERT com `kind='agent'` inválido ✅ FIXADO

**Arquivo:** `supabase/functions/evolution-webhook/index.ts` (função `handleAprovacaoSession`)  
**Severidade:** Média  
**Sintoma:** O código inseria `kind: 'agent'` em `internal_notifications`, mas o CHECK
constraint aceita apenas: `agent_invoked, agent_completed, agent_failed, draft_pending,
draft_approved, draft_rejected, deli_proposal, deli_alert, system, channel_message`.
O INSERT falhava silenciosamente — nenhuma notificação interna chegava à equipe.  
**Fix aplicado:** Alterado para `kind: 'agent_completed'`.
Deploy: evolution-webhook v42 (2026-05-23).  
**Status:** ✅ Fechado

---

## Resumo de status

| TD   | Descrição                                    | Severidade | Status          |
|------|----------------------------------------------|------------|-----------------|
| TD#16 | Bridge sem atomicidade                       | Média      | Aberto          |
| TD#17 | Redundância `.eq()` + `.or()`                | Baixa      | Aberto          |
| TD#18 | Silent fail INSERT colunas inexistentes      | Alta       | ✅ Fechado v41   |
| TD#19 | numero_destino 12 vs 13 dígitos              | Alta       | Parcial (paliativo) |
| TD#20 | Sessão não encerra após OK tudo              | Média      | Aberto          |
| TD#21 | `kind='agent'` inválido em notifications    | Média      | ✅ Fechado v42  |
