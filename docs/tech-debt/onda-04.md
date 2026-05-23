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

## TD#23 — `CardSessaoWhatsapp` query com colunas inexistentes ✅ FIXADO

**Arquivo:** `src/screens/lojas/TabAnalises.jsx` (função `CardSessaoWhatsapp`, ~linha 734)  
**Severidade:** Alta (interações sempre vazias no UI)  
**Sintoma:** O componente fazia `.select('id,acao,comentario,created_at')` e `.eq('feita_via','whatsapp')`.
Nenhuma das duas colunas (`comentario`, `feita_via`) existe em `tarefa_aprovacoes`.
Supabase JS v2 retornava erro silencioso → `rows = null` → `interacoes = []`.
A seção "Interações via WhatsApp" exibia "Nenhuma resposta recebida ainda." mesmo com 22 aprovações no DB.  
**Fix aplicado:** `.select('id,acao,nota,created_at')`, removido `.eq('feita_via','whatsapp')`,
`i.comentario` → `i.nota` no JSX. Query corrigida retorna 22 rows (aprovada=20, rejeitada=1, duvida=1).  
**Status:** ✅ Fechado — commit na branch feature/piloto-04-whatsapp-loom

---

## TD#24 — Coluna `is_active` ausente em `lojas`

**Tabela:** `lojas`  
**Severidade:** Baixa  
**Sintoma:** Não existe coluna `is_active` na tabela `lojas`. Lojas de teste (ex: "Smoke Onda 04") não podem ser desativadas sem exclusão física — o que apaga histórico de análises e sessões WhatsApp vinculadas.  
**Fix sugerido:**
1. Migration: `ALTER TABLE lojas ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT true;`
2. Adicionar ao `ListLojas` query: `WHERE is_active = true` por padrão.
3. Atualizar RLS policies se necessário.  
**Status:** Aberto

---

## TD#27 — Silent fail INSERT `analises` com `tenant_id` ausente ✅ FIXADO

**Arquivo:** `bridge-server/routes/analises.js` (rota POST `/api/lojas/:id/analises`)  
**Severidade:** Alta (foi bloqueante)  
**Sintoma:** `assertLojaAccess` retorna `tenantId` mas o objeto row passado ao INSERT em
`analises` não incluía a coluna `tenant_id`, causando violação NOT NULL no Supabase.
O Bridge retornava 500 mas sem log claro identificando a coluna ausente. O erro só foi
encontrado comparando o schema da tabela com o objeto inserido.  
**Raiz:** INSERT construído manualmente sem listar todas as colunas NOT NULL; `tenant_id`
era obtido na função mas não propagado para o objeto row.  
**Fix aplicado:** Adicionado `tenant_id: tenantId` ao objeto row (linha 110 do arquivo).
Deploy: Bridge commit `8c1d88c` (2026-05-23).  
**Status:** ✅ Fechado

---

## TD#28 — G6 fechamento de análise ignora tarefas rejeitadas ✅ FIXADO

**Arquivo:** `bridge-server/routes/tarefas.js` (handler POST `/api/tarefas/:id/concluir`, G6 ~linha 611)  
**Severidade:** Alta (G6 jamais dispara quando há ≥1 tarefa rejeitada)  
**Sintoma:** Condição `countConcluidas >= analise.total_tarefas_geradas` conta apenas tarefas
`concluida`. Se houver 1+ rejeitada, o total `concluida` nunca alcança `total_tarefas_geradas`
e a análise permanece aberta para sempre — mensagem `🎉 Parabéns` nunca é enviada.  
**Raiz:** Tarefa rejeitada é estado terminal (não vira `concluida`), mas a condição G6
não previa esse cenário.  
**Fix aplicado:** Adiciona query paralela para `rejeitada` e muda condição para
`(countConcluidas + countRejeitadasG6) >= analise.total_tarefas_geradas`.
Deploy: Bridge commit `feature/piloto-05-fechamento-jornada` (2026-05-23).  
**Status:** ✅ Fechado

---

## TD#31 — UX state machine 3 etapas para concluir tarefa ✅ FIXADO

**Arquivo:** `bridge-server/routes/tarefas.js`, `src/screens/lojas/LojaWorkspace.jsx`  
**Severidade:** Alta (bloqueante para operação com cliente real)  
**Sintoma:** Concluir uma tarefa exigia 3 cliques separados: Iniciar execução → Submeter para
validação → Concluir. Dados de smoke mostraram 3s entre cada passo — fricção pura. O estado
`aguardando_validacao` foi desenhado para revisão do cliente mas nunca foi implementado.  
**Fix aplicado:**
1. `T3 — _notificarConclusao`: lógica G5+G6 extraída do handler `/concluir` em helper reutilizável.
2. `T1 — /marcar-concluida`: novo endpoint compound faz `aprovada → em_execucao → aguardando_validacao → concluida` em 1 request, com rollback best-effort em caso de erro.
3. `T2 — UI 1-clique`: card `aprovada` mostra botão verde "✅ Marcar concluída"; estados intermediários mostram badge de texto estático.
Deploy: Bridge commits `9c7bc23` + `ea147d7` (feature/piloto-06-marcar-concluida, 2026-05-23).  
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
| TD#31 | UX state machine 3 etapas (Onda 06)          | Alta       | ✅ Fechado (onda-06) |
| TD#23 | `CardSessaoWhatsapp` colunas inexistentes    | Alta       | ✅ Fechado v43  |
| TD#24 | Coluna `is_active` ausente em `lojas`        | Baixa      | Aberto          |
| TD#27 | Silent fail INSERT `analises` `tenant_id`   | Alta       | ✅ Fechado 8c1d88c |
| TD#28 | G6 não dispara com tarefas rejeitadas        | Alta       | ✅ Fechado (onda-05) |
