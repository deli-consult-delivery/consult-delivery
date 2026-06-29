// routes/loop-autorizar.js — POST /loop/autorizar
//
// Fluxo C (Blueprint v2 §5C): o CEO autoriza (ou recusa) uma demanda de cliente que
// exige execução real. A tarefa nasceu em loop_state='aguardando_autorizacao_ceo'
// (createLoopTask) e NÃO executa até aqui. Esta rota é o gate humano:
//   decisao='autorizar' → loop_state='open'  (executar-tarefa passa a pegá-la)
//   decisao='recusar'   → loop_state='done' + status='cancelled' (encerra sem efeito)
//
// Transição ATÔMICA condicionada a loop_state='aguardando_autorizacao_ceo' (uso único):
// só a 1ª decisão vale. Auth: requireInternalToken (DELI/Hermes via x-internal-token).
'use strict';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

module.exports = ({ requireInternalToken, sbFetch }) => {
  const express = require('express');
  const router = express.Router();

  router.post('/autorizar', requireInternalToken, async (req, res) => {
    try {
      const { task_id, tenant_id, decisao } = req.body || {};
      if (!UUID_RE.test(String(task_id || ''))) {
        return res.status(400).json({ error: 'task_id inválido (uuid)' });
      }
      if (!UUID_RE.test(String(tenant_id || ''))) {
        return res.status(400).json({ error: 'tenant_id inválido (uuid)' });
      }
      if (decisao !== 'autorizar' && decisao !== 'recusar') {
        return res.status(400).json({ error: "decisao deve ser 'autorizar' ou 'recusar'" });
      }

      const patch = decisao === 'autorizar'
        ? { loop_state: 'open' }
        : { loop_state: 'done', status: 'cancelled' };

      // PATCH condicional: só afeta a tarefa que ainda está aguardando (uso único).
      const rows = await sbFetch(
        `client_tasks?id=eq.${encodeURIComponent(task_id)}` +
          `&tenant_id=eq.${encodeURIComponent(tenant_id)}` +
          `&loop_state=eq.aguardando_autorizacao_ceo&select=id,loop_state,status`,
        { method: 'PATCH', body: patch, prefer: 'return=representation' }
      );

      if (!rows?.length) {
        return res.status(409).json({
          error: 'tarefa não está aguardando autorização (já decidida, inexistente ou de outro tenant)',
        });
      }

      return res.json({ task_id, decisao, loop_state: rows[0].loop_state, status: rows[0].status ?? null });
    } catch (e) {
      console.error('[loop-autorizar] erro:', e.message);
      return res.status(500).json({ error: 'erro ao autorizar tarefa', detail: e.message });
    }
  });

  return router;
};
