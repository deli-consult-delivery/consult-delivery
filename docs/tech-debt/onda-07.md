# Tech Debt — Piloto Onda 07 (Reabrir tarefa F2)

Identificados durante implementação F2 (mai/2026).  
Branch: `feature/piloto-07-f2-reabrir` → merged `main` 2026-05-24

---

## TD#35 — Endpoint reabrir tarefa ausente no Bridge ✅ FECHADO

**Arquivo:** `bridge-server/routes/tarefas.js` + `bridge-server/schemas/tarefas.js`  
**Severidade:** Alta (sem endpoint, UI não conseguia reverter tarefa concluída)  
**Sintoma:** Tarefas com `status='concluida'` não podiam ser revertidas para execução;
não havia endpoint `POST /api/tarefas/:id/reabrir` nem schema `ReabrirSchema`.
Equipe precisava editar o DB manualmente para reabrir uma tarefa.  
**Fix aplicado:**
- `bridge-server/schemas/tarefas.js` — adicionado `ReabrirSchema` (motivo min 3 chars, status_alvo enum aprovada/em_execucao)
- `bridge-server/routes/tarefas.js` — novo endpoint `POST /api/tarefas/:id/reabrir`:
  - Valida status `concluida` (409 se outro status)
  - Faz PATCH em `tarefas_loja` (status, concluida_em=null, executada_em nullable)
  - Insere em `tarefa_aprovacoes` (acao='reaberta', autor_id, nota=motivo)
  - Reabre análise vinculada se estava `concluida` → volta para `enviada_cliente` (non-fatal)
  - Loga em `audit_log` (action='tarefa_reaberta')
- `src/screens/lojas/LojaWorkspace.jsx` — botão amber "↩ Reabrir tarefa" exibido quando `status === 'concluida'`; dispara prompt nativo para motivo
**Status:** ✅ Fechado — commit `15e6c69`, branch `feature/piloto-07-f2-reabrir` mergeada em main 2026-05-24.

---

## Resumo de status

| TD    | Descrição                                             | Severidade | Status    |
|-------|-------------------------------------------------------|------------|-----------|
| TD#35 | Endpoint reabrir tarefa ausente no Bridge             | Alta       | ✅ Fechado `15e6c69` |
