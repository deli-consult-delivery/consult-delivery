# Piloto Onda 05 — Planning

**Data:** 2026-05-23  
**Antecede:** Onda 04 (WhatsApp Aprovação) — mergeada em `main` (commit `c5f3afc`)  
**Branch nova:** `feature/piloto-05-*`  
**Status:** Planejamento aberto

---

## Contexto

Onda 04 entregou E2E o fluxo de aprovação de tarefas via WhatsApp:
- Cliente recebe mensagem com lista de tarefas pendentes
- Responde via WhatsApp com ação (aprovar/rejeitar/duvida/aprovar_tudo/rejeitar_tudo)
- Plataforma registra aprovações em `tarefa_aprovacoes`
- Notificação interna via `internal_notifications`
- `CardSessaoWhatsapp` exibe interações em tempo real

**Prioridade máxima de Onda 05:** Onboardar o primeiro cliente real.  
Candidate: Varanda's (feedback pendente de coleta).  
Objetivo: validar fluxo completo com dados e número real antes de escalar.

---

## Tech Debts herdados da Onda 04

### P0 — Bloqueia primeiro cliente real

#### TD#20 — Sessão não encerra após `OK tudo`
**Arquivo:** `supabase/functions/evolution-webhook/index.ts`, `handleAprovacaoSession`  
**Impacto:** Mensagens pós-aprovação do mesmo número continuam sendo roteadas ao handler T6.  
**Fix:**
1. Migration: `ALTER TABLE whatsapp_aprovacao_sessions ADD COLUMN encerrada_em TIMESTAMPTZ;`
2. Em `handleAprovacaoSession`: após `aprovar_tudo=true` ou todas tarefas respondidas → `UPDATE status='encerrada', encerrada_em=NOW()`  
**Estimativa:** 1-2h

#### TD#25 — Runtime check de colunas inexistentes antes de queries Supabase
**Impacto transversal:** Padrão silencioso de falha Supabase JS v2 causou TD#18 e TD#23. Sem proteção, qualquer nova feature pode introduzir o mesmo bug sem que nenhum teste falhe.  
**Fix:** Utilitário `assertColumns(table, [...cols])` que faz SELECT de information_schema em dev e loga warning em prod. Chamar nos pontos críticos de INSERT/SELECT de novas tabelas.  
**Estimativa:** 2h

#### TD#26 — Outbound: consolidar em `whatsapp_messages` (hoje vai para `messages` via echo)
**Impacto:** `CardSessaoWhatsapp` e futuros componentes precisam ler de duas tabelas para timeline completa.  
**Contexto:** `evoSendText` não insere diretamente. Echo via `SEND_MESSAGE` webhook vai para `messages` (tabela antiga). Inbound vai para `whatsapp_messages` (nova).  
**Fix:** Interceptar `SEND_MESSAGE` webhook em `handleSendMessage` e redirecionar para `whatsapp_messages` com `outbound=true`, mantendo retrocompatibilidade com `messages` via flag de migration.  
**Estimativa:** 3h

---

### P1 — Estabilidade antes de escalar

#### TD#16 — Bridge `enviar-whatsapp` sem atomicidade
**Arquivo:** `bridge-server/routes/analises.js`  
**Impacto:** Se `sendText` falha após INSERT sessão + PATCH status, fica sessão órfã ativa.  
**Fix:** Mover `sendText` para depois dos INSERTs; rollback (DELETE sessão + PATCH status) em caso de falha.  
**Estimativa:** 2h

#### TD#19 — `numero_destino` formato inconsistente (12 vs 13 dígitos)
**Arquivo:** `bridge-server/routes/analises.js`  
**Impacto:** Query `.eq('numero_destino', senderNum)` pode falhar quando dígito 9 está/não está presente.  
**Fix definitivo:** Normalizar para 12 dígitos no Bridge antes de gravar. Remover `.or()` paliativo da edge function.  
**Estimativa:** 1h

#### TD#22 — `OK tudo` sobrescreve tarefas já rejeitadas
**Arquivo:** `supabase/functions/evolution-webhook/index.ts`, `handleAprovacaoSession`  
**Impacto:** Cliente rejeita tarefas individualmente, depois manda "ok tudo" → sistema aprova todas, incluindo as rejeitadas.  
**Fix:** Ao processar `aprovar_tudo`, filtrar tarefas que já têm `tarefa_aprovacoes` com `acao='rejeitada'` e não sobrescrever.  
**Estimativa:** 1h

---

### P2 — Melhorias qualidade de vida

#### TD#17 — Query redundante `.eq()` + `.or()` no handler T6
**Arquivo:** `supabase/functions/evolution-webhook/index.ts`  
**Fix:** Extrair `normalizeBrPhone(num)` como helper; usar `.in('numero_destino', [...])`.  
**Estimativa:** 30min

#### TD#24 — Coluna `is_active` ausente em `lojas`
**Impacto:** Lojas de teste ficam listadas na UI misturadas com lojas reais. Não há como desativar sem exclusão física.  
**Fix:**
1. Migration: `ALTER TABLE lojas ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT true;`
2. Filtrar `WHERE is_active=true` nas queries de listagem.  
**Estimativa:** 1h

---

## Novo feature: Onboarding primeiro cliente real

**Objetivo:** Validar fluxo com Varanda's (ou outro cliente real confirmado)  
**Pré-requisitos:**
- [ ] TD#20 resolvido (sessão encerra)
- [ ] TD#19 resolvido (telefone correto)
- [ ] Numero Evolution configurado para o número real do cliente
- [ ] Análise real gerada com tarefas reais
- [ ] Aprovação enviada para WhatsApp real do dono

**Critério de aceite:**  
Dono recebe mensagem WhatsApp com tarefas, responde, plataforma registra aprovação, equipe vê no `CardSessaoWhatsapp` sem erros.

---

## Ordem de execução sugerida

```
1. TD#20 — encerramento automático de sessão        [P0, desbloqueia cliente real]
2. TD#19 — normalizar numero_destino no Bridge      [P0/P1, garante lookup correto]
3. TD#22 — OK tudo respeita rejeitadas              [P1, integridade de dados]
4. TD#16 — atomicidade Bridge                       [P1, evita sessões órfãs]
5. TD#26 — outbound em whatsapp_messages            [P0 para timeline unificada]
6. Onboarding cliente real                           [Prioridade máxima]
7. TD#24 — is_active em lojas                       [P2, cleanup]
8. TD#17 — query cleanup                            [P2, qualidade código]
9. TD#25 — runtime check utilitário                 [P0 preventivo, pode ser paralelo]
```

---

## Tech debts por prioridade (índice rápido)

| TD    | Prioridade | Estimativa | Arquivo principal |
|-------|-----------|------------|-------------------|
| TD#20 | P0        | 1-2h       | evolution-webhook/index.ts |
| TD#25 | P0        | 2h         | novo utilitário shared |
| TD#26 | P0        | 3h         | evolution-webhook/index.ts + migration |
| TD#16 | P1        | 2h         | bridge-server/routes/analises.js |
| TD#19 | P1        | 1h         | bridge-server/routes/analises.js |
| TD#22 | P1        | 1h         | evolution-webhook/index.ts |
| TD#17 | P2        | 30min      | evolution-webhook/index.ts |
| TD#24 | P2        | 1h         | migration + TabLojas queries |
