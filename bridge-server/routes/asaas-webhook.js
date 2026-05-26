// bridge-server/routes/asaas-webhook.js
// POST /api/asaas/webhook — receiver público de eventos Asaas ligados a contratos
// Valida asaas-access-token, registra em asaas_eventos, atualiza contratos.pagamento_status

'use strict';

const CONTRATO_STATUS_MAP = {
  PAYMENT_CONFIRMED:            'em_dia',
  PAYMENT_RECEIVED:             'em_dia',
  PAYMENT_OVERDUE:              'atrasado',
  PAYMENT_CHARGEBACK_REQUESTED: 'atrasado',
  PAYMENT_CHARGEBACK_DISPUTE:   'atrasado',
  PAYMENT_AWAITING_CHARGEBACK_REVERSAL: 'atrasado',
  PAYMENT_DELETED:              'cancelado',
  PAYMENT_REFUNDED:             'cancelado',
};

module.exports = function ({ supabaseInsert, supabaseSelect, supabaseUpdate, ASAAS_WEBHOOK_SECRET }) {
  const router = require('express').Router();

  router.post('/asaas/webhook', async (req, res) => {
    // 1. Validar token
    const token = req.headers['asaas-access-token'] || req.headers['x-asaas-access-token'] || '';
    if (!ASAAS_WEBHOOK_SECRET) {
      console.warn('[asaas-webhook] ASAAS_WEBHOOK_SECRET não configurado');
      return res.status(500).json({ error: 'webhook secret não configurado' });
    }
    if (token !== ASAAS_WEBHOOK_SECRET) {
      console.warn(`[asaas-webhook] token inválido: "${token.slice(0, 8)}..."`);
      return res.status(401).json({ error: 'token inválido' });
    }

    const { event, payment } = req.body || {};
    if (!event || !payment?.id) {
      return res.status(400).json({ error: 'payload inválido: faltam event ou payment.id' });
    }

    console.log(`[asaas-webhook] evento=${event} charge=${payment.id}`);

    // Responde 200 imediatamente
    res.json({ ok: true, received: event });

    setImmediate(async () => {
      try {
        // 2. Encontra contrato pelo asaas_subscription_id (via payment.subscription)
        //    Fallback: tenta pelo charge_id diretamente (cobranças avulsas)
        let contrato = null;
        const subscriptionId = payment.subscription;

        if (subscriptionId) {
          contrato = await supabaseSelect('contratos', { asaas_subscription_id: subscriptionId });
        }

        // 3. Insere em asaas_eventos
        const eventoRow = {
          tenant_id:       contrato?.tenant_id ?? null,
          contrato_id:     contrato?.id ?? null,
          asaas_charge_id: payment.id,
          evento_tipo:     event,
          payload:         req.body,
        };

        if (!eventoRow.tenant_id) {
          // sem contrato vinculado: loga mas não insere (tenant_id NOT NULL)
          console.warn(`[asaas-webhook] contrato não encontrado para subscription=${subscriptionId}, charge=${payment.id} — evento não persistido`);
          return;
        }

        await supabaseInsert('asaas_eventos', eventoRow);
        console.log(`[asaas-webhook] asaas_evento inserido: charge=${payment.id} contrato=${contrato.id}`);

        // 4. Atualiza pagamento_status no contrato
        const newStatus = CONTRATO_STATUS_MAP[event] ?? null;
        if (newStatus) {
          const updates = {
            pagamento_status: newStatus,
            updated_at: new Date().toISOString(),
          };
          if (newStatus === 'em_dia' && payment.paymentDate) {
            updates.ultimo_pagamento_em = payment.paymentDate;
          }
          if (payment.dueDate) {
            updates.proxima_cobranca = payment.dueDate;
          }
          await supabaseUpdate('contratos', { id: contrato.id }, updates);
          console.log(`[asaas-webhook] contrato ${contrato.id} pagamento_status → ${newStatus}`);
        }

        // 5. Notifica equipe interna
        if (newStatus) {
          const kindMap = { em_dia: 'system', atrasado: 'deli_alert', cancelado: 'deli_alert' };
          const titleMap = {
            em_dia:    'Pagamento confirmado',
            atrasado:  'Pagamento atrasado',
            cancelado: 'Cobrança cancelada',
          };
          await supabaseInsert('internal_notifications', {
            tenant_id:   contrato.tenant_id,
            kind:        kindMap[newStatus] || 'system',
            title:       titleMap[newStatus] || event,
            body:        `Contrato ${contrato.id.slice(0, 8)} — ${event} (R$ ${payment.value ?? '?'})`,
            link:        `/contratos`,
            metadata:    { asaas_charge_id: payment.id, evento_tipo: event },
          });
        }
      } catch (err) {
        console.error('[asaas-webhook] erro no processamento assíncrono:', err.message);
      }
    });
  });

  return router;
};
