'use strict';
const express = require('express');

let cache = null;
let cacheAt = 0;
const CACHE_TTL = 5 * 60 * 1000;

module.exports = function buildAsaasSaldoRouter() {
  const router = express.Router();

  router.get('/asaas/saldo', async (req, res) => {
    const ASAAS_API_KEY = process.env.ASAAS_API_KEY;
    if (!ASAAS_API_KEY) {
      return res.status(503).json({ error: 'ASAAS_API_KEY não configurado' });
    }
    if (cache && Date.now() - cacheAt < CACHE_TTL) {
      return res.json(cache);
    }
    try {
      const r = await fetch('https://api.asaas.com/v3/finance/balance', {
        headers: {
          'Content-Type': 'application/json',
          'access_token': ASAAS_API_KEY,
        },
      });
      if (!r.ok) {
        const detail = (await r.text()).slice(0, 200);
        return res.status(r.status).json({ error: `Asaas ${r.status}: ${detail}` });
      }
      const data = await r.json();
      cache = data;
      cacheAt = Date.now();
      return res.json(data);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

  return router;
};
