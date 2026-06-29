// routes/evolution-status.js — GET /api/evolution/status
//
// Leitura do estado da conexão WhatsApp (Evolution) por tenant, a partir da tabela
// `evolution_instances` (coluna `status`, ex.: 'connected'). NÃO chama a Evolution API
// nem envia nada — só lê o estado já mantido. Envio a cliente é draft + aprovação,
// fora desta rota. Auth: requireJwtOrInternal (Console via JWT, Hermes via x-internal-token).
'use strict';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

module.exports = ({ requireJwtOrInternal, sbFetch }) => {
  const express = require('express');
  const router = express.Router();

  router.get('/evolution/status', requireJwtOrInternal, async (req, res) => {
    try {
      const { tenant_id } = req.query;
      let q = 'evolution_instances?select=instance_name,status,tenant_id&limit=50';
      if (tenant_id) {
        if (!UUID_RE.test(String(tenant_id))) {
          return res.status(400).json({ error: 'tenant_id inválido (uuid)' });
        }
        q += `&tenant_id=eq.${encodeURIComponent(tenant_id)}`;
      }
      const rows = await sbFetch(q);
      const instances = Array.isArray(rows) ? rows : [];
      const connected = instances.some((r) => r.status === 'connected');
      return res.json({ connected, count: instances.length, instances });
    } catch (e) {
      console.error('[evolution-status] erro:', e.message);
      return res.status(500).json({ error: 'erro ao ler status do WhatsApp', detail: e.message });
    }
  });

  return router;
};
