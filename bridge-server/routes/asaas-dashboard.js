'use strict';
const express = require('express');

const ASAAS_BASE = 'https://api.asaas.com/v3';

async function fetchAllPayments(apiKey, params) {
  const items = [];
  let offset = 0;
  const limit = 100;

  while (true) {
    const qs = new URLSearchParams({ ...params, limit: String(limit), offset: String(offset) });
    const r = await fetch(`${ASAAS_BASE}/payments?${qs}`, {
      headers: { 'Content-Type': 'application/json', access_token: apiKey },
    });
    if (!r.ok) {
      const detail = (await r.text()).slice(0, 200);
      throw new Error(`Asaas ${r.status}: ${detail}`);
    }
    const data = await r.json();
    const batch = Array.isArray(data.data) ? data.data : [];
    items.push(...batch);
    if (batch.length < limit) break;
    offset += limit;
  }

  return items;
}

function aggregatePayments(items) {
  let total = 0;
  let netTotal = 0;
  const clientSet = new Set();
  let invoices = 0;

  for (const item of items) {
    total += Number(item.value) || 0;
    netTotal += Number(item.netValue) || 0;
    if (item.customer) clientSet.add(item.customer);
    invoices += 1;
  }

  return { total, netTotal, clients: clientSet.size, invoices };
}

module.exports = function buildAsaasDashboardRouter() {
  const router = express.Router();

  router.get('/asaas/situacao-mes', async (req, res) => {
    const ASAAS_API_KEY = process.env.ASAAS_API_KEY;
    if (!ASAAS_API_KEY) {
      return res.status(503).json({ error: 'ASAAS_API_KEY não configurado' });
    }

    const mes = req.query.mes || new Date().toISOString().slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(mes)) {
      return res.status(400).json({ error: 'Parâmetro mes deve ser YYYY-MM' });
    }

    const [year, month] = mes.split('-').map(Number);
    const firstDay = `${mes}-01`;
    const lastDay = new Date(year, month, 0).toISOString().slice(0, 10);

    try {
      const [recebidas, confirmadas, aguardando, vencidas] = await Promise.all([
        fetchAllPayments(ASAAS_API_KEY, {
          status: 'RECEIVED',
          'paymentDate[ge]': firstDay,
          'paymentDate[le]': lastDay,
        }),
        fetchAllPayments(ASAAS_API_KEY, {
          status: 'CONFIRMED',
          'confirmedDate[ge]': firstDay,
          'confirmedDate[le]': lastDay,
        }),
        fetchAllPayments(ASAAS_API_KEY, {
          status: 'PENDING',
          'dueDate[ge]': firstDay,
          'dueDate[le]': lastDay,
        }),
        fetchAllPayments(ASAAS_API_KEY, {
          status: 'OVERDUE',
          'dueDate[ge]': firstDay,
          'dueDate[le]': lastDay,
        }),
      ]);

      return res.json({
        mes,
        recebidas: aggregatePayments(recebidas),
        confirmadas: aggregatePayments(confirmadas),
        aguardando: aggregatePayments(aguardando),
        vencidas: aggregatePayments(vencidas),
      });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

  return router;
};
