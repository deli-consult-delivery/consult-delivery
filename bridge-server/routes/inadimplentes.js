const express = require('express');

module.exports = function inadimplentesRouter({ requireJwt, SUPABASE_URL, SUPABASE_SERVICE_KEY }) {
  const router = express.Router();

  function sbGet(table, qs) {
    return fetch(`${SUPABASE_URL}/rest/v1/${table}?${qs}`, {
      headers: {
        apikey: SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
      },
    }).then(r => r.json());
  }

  // GET /api/inadimplentes
  router.get('/inadimplentes', requireJwt, async (req, res) => {
    try {
      const tenantId = req.headers['x-tenant-id'];
      if (!tenantId) return res.status(400).json({ error: 'x-tenant-id required' });

      const { dias_atraso, valor_min, status } = req.query;

      const statusFilter = status
        ? `status=eq.${status}`
        : 'status=in.(aberto,negociando,escalonado)';

      const qs = `tenant_id=eq.${tenantId}&${statusFilter}&order=data_vencimento.asc&select=id,customer_name,customer_phone,customer_whatsapp,valor_atual,data_vencimento,status,notas,created_at`;
      const rows = await sbGet('cora_cobrancas', qs);

      if (!Array.isArray(rows)) {
        console.error('[inadimplentes] Supabase error:', rows);
        return res.status(502).json({ error: 'Erro ao consultar Supabase', detail: rows });
      }

      const now = Date.now();
      let result = rows.map(r => ({
        ...r,
        dias_atraso: r.data_vencimento
          ? Math.max(0, Math.floor((now - new Date(r.data_vencimento).getTime()) / 86400000))
          : 0,
      }));

      if (dias_atraso) {
        const d = parseInt(dias_atraso, 10);
        result = result.filter(r => r.dias_atraso >= d);
      }

      if (valor_min) {
        const v = parseFloat(valor_min);
        result = result.filter(r => (r.valor_atual || 0) >= v);
      }

      const total_devido = result.reduce((s, r) => s + (parseFloat(r.valor_atual) || 0), 0);
      const qtd = result.length;

      res.json({ rows: result, kpis: { total_devido, qtd } });
    } catch (err) {
      console.error('[inadimplentes] GET error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/inadimplentes/:id/notificar
  router.post('/inadimplentes/:id/notificar', requireJwt, async (req, res) => {
    try {
      const tenantId = req.headers['x-tenant-id'];
      if (!tenantId) return res.status(400).json({ error: 'x-tenant-id required' });

      const { id } = req.params;
      const { mensagem } = req.body || {};

      const cobRows = await sbGet(
        'cora_cobrancas',
        `id=eq.${id}&tenant_id=eq.${tenantId}&select=customer_name,customer_phone,customer_whatsapp,valor_atual`
      );
      if (!Array.isArray(cobRows) || !cobRows.length) {
        return res.status(404).json({ error: 'Cobrança não encontrada' });
      }
      const cob = cobRows[0];

      const instRows = await sbGet(
        'evolution_instances',
        `tenant_id=eq.${tenantId}&is_active=eq.true&limit=1`
      );
      if (!Array.isArray(instRows) || !instRows.length) {
        return res.status(400).json({ error: 'Sem instância WhatsApp configurada' });
      }
      const inst = instRows[0];

      const phone = (cob.customer_whatsapp || cob.customer_phone || '').replace(/\D/g, '');
      if (!phone) return res.status(400).json({ error: 'Cliente sem telefone cadastrado' });

      const valor = Number(cob.valor_atual || 0).toFixed(2).replace('.', ',');
      const text = mensagem
        || `Olá ${cob.customer_name}, identificamos um débito de R$ ${valor} em aberto. Entre em contato para regularizar. 😊`;

      const wResp = await fetch(
        `${inst.evolution_url}/message/sendText/${inst.instance_name}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', apikey: inst.api_key },
          body: JSON.stringify({ number: phone, text }),
        }
      );
      const wData = await wResp.json().catch(() => ({}));

      if (!wResp.ok) {
        return res.status(502).json({ error: 'WhatsApp falhou', detail: wData });
      }

      res.json({ ok: true, whatsapp: wData });
    } catch (err) {
      console.error('[inadimplentes] POST /notificar error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  return router;
};
