# PILOTO Onda 06 — Planning

**Status:** Rascunho  
**Data:** 2026-05-23  
**Contexto:** Pós-merge Onda 05. Primeira onda com cliente real: Varanda's.

---

## Objetivo

Onboardar o primeiro cliente real (Varanda's) no fluxo completo:
análise → WhatsApp → aprovação → tarefas concluídas → análise fechada.

**Critério de aceite:** 1 análise real com cliente real, ciclo completo,
sem intervenção manual em prod.

---

## Tech Debts Priorizados

### P0 — Bloqueantes para consultor real

| TD   | Descrição | Impacto |
|------|-----------|---------|
| TD#31 | UX state machine 3 etapas (iniciar → submeter → concluir) | Consultor precisa clicar 3x por tarefa — insustentável com 12+ tarefas. Simplificar para 1 clique "Concluir" que faz as 3 transições internamente ou colapsar em UI. |

### P1 — Importantes para qualidade da entrega ao cliente

| TD   | Descrição | Impacto |
|------|-----------|---------|
| TD#29 | Texto G6 usa `total_tarefas_geradas` em vez de count real concluídas | Mensagem `🎉 Parabéns! Todas as 12 tarefas` pode ser imprecisa se houver rejeitadas. Usar `countConcluidas` real. |
| TD#30 | Throttle msgs Evolution rate-limit | G5 dispara 1 msg/tarefa. Com 12 tarefas, 12 msgs em ~30s. Evolution pode rate-limitar. Adicionar delay configurable ou agrupar num único resumo. |
| TD#24 | Coluna `is_active` ausente em `lojas` | Lojas de smoke acumulam sem forma de desativar. Migration simples + filtro na listagem. |

### P2 — Qualidade de código, não bloqueantes

| TD   | Descrição |
|------|-----------|
| TD#17 | Redundância `.eq()` + `.or()` no handler T6 — extrair `normalizeBrPhone` como helper. |
| TD#25 | Runtime check env vars na inicialização do Bridge Server em vez de lazy. |
| TD#26 | Outbound/inbound messages — consolidar lógica de roteamento WhatsApp. |

---

## Funcionalidades Novas (Onda 06)

### F1 — Concluir em 1 clique (decorrente TD#31)
- UI: botão único "✅ Concluir tarefa" no card da tarefa
- Bridge: rota POST `/api/tarefas/:id/concluir-direto` que executa
  `aprovada → em_execucao → aguardando_validacao → concluida` num único request
- Alternativa: colapsar transições intermediárias no frontend com polling

### F2 — Painel de status da análise em tempo real
- TabAnalises: barra de progresso `X/Y tarefas concluídas`
- Realtime subscription em `tarefas_loja` para atualizar sem reload

### F3 — Desativar loja (TD#24)
- Migration: `ALTER TABLE lojas ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT true`
- UI: toggle em SettingsScreen da loja
- Query: filtrar `is_active = true` em ListLojas

---

## Onboarding Varanda's

- [ ] Criar loja real no Supabase (nome, WhatsApp, tenant_id correto)
- [ ] Confirmar número WhatsApp do responsável
- [ ] Criar análise real (loom_url ou transcrição manual)
- [ ] Processar com `analise-gerar-relatorio`
- [ ] Revisar tarefas geradas antes de enviar
- [ ] Enviar via WhatsApp e monitorar respostas
- [ ] Acompanhar aprovações em `CardSessaoWhatsapp`
- [ ] Concluir tarefas à medida que executar
- [ ] Aguardar G6 fechar análise

---

## Smoke Lojas Pendentes (não deletar ainda)

Lojas de teste sem histórico de cliente real — manter por 30 dias:

| ID | Nome | Criada em |
|----|------|-----------|
| `47ea2d77` | Smoke Onda 04 | 2026-05-23 |
| `18f9563f` | Smoke Onda 05 | 2026-05-23 |
| `fe5bca5f` | Smoke Onda 05 v2 | 2026-05-23 |

Decisão de deleção: Wandson após 2026-06-23. Aguarda `is_active` (TD#24) pra desativar em vez de deletar.

---

## Estimativa

| Item | Esforço |
|------|---------|
| TD#31 "Concluir em 1 clique" | 2-3h |
| TD#24 is_active migration + UI | 1h |
| TD#29 texto G6 | 30min |
| TD#30 throttle G5 | 1h |
| F2 painel progresso realtime | 2h |
| Onboarding Varanda's (1ª análise) | 1-2h |

**Total estimado:** ~8-10h (1-2 sessões)
