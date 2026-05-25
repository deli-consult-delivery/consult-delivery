'use strict';

// ════════════════════════════════════════════════════════════════════════════
// G03 — Contratos Digitais
//
// Endpoints:
//   POST /contratos/:id/enviar-assinatura  — gera HTML, faz upload Storage, envia WhatsApp
//   POST /contratos/:id/link-asaas         — cria subscription Asaas
//   POST /contratos/sign                   — público; cliente assina, gera hash SHA256
// ════════════════════════════════════════════════════════════════════════════

const express = require('express');
const crypto  = require('crypto');

const PACOTE_LABELS = {
  light:       'Light',
  performance: 'Performance',
  enterprise:  'Enterprise',
  growth:      'Growth',
};

// ── Gera HTML simples do contrato (sem deps externas) ───────────────────────
function buildContratoHtml(contrato, customerName) {
  const now = new Date().toLocaleDateString('pt-BR');
  const fmtBRL = v => `R$ ${Number(v || 0).toFixed(2).replace('.', ',')}`;
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Contrato de Prestação de Serviços</title>
<style>
  body{font-family:Arial,sans-serif;max-width:760px;margin:40px auto;padding:24px;color:#1a1a1a;line-height:1.6}
  h1{font-size:22px;text-align:center;margin-bottom:4px}
  h2{font-size:14px;text-align:center;color:#555;margin-top:0}
  table{width:100%;border-collapse:collapse;margin:24px 0}
  td,th{padding:8px 12px;border:1px solid #ddd;font-size:13px}
  th{background:#f5f5f5;font-weight:600;text-align:left}
  .footer{margin-top:60px;display:flex;justify-content:space-between}
  .sign-box{border-top:1px solid #333;width:45%;padding-top:8px;font-size:12px;color:#555}
</style>
</head>
<body>
<h1>Contrato de Prestação de Serviços</h1>
<h2>Consult Delivery · ${now}</h2>
<table>
  <tr><th>Campo</th><th>Valor</th></tr>
  <tr><td>Cliente</td><td>${customerName || '—'}</td></tr>
  <tr><td>Pacote</td><td>${PACOTE_LABELS[contrato.pacote] || contrato.pacote}</td></tr>
  <tr><td>Valor Mensal</td><td>${fmtBRL(contrato.valor_mensal)}</td></tr>
  ${contrato.valor_setup ? `<tr><td>Taxa de Setup</td><td>${fmtBRL(contrato.valor_setup)}</td></tr>` : ''}
  ${contrato.percentual_crescimento ? `<tr><td>% Crescimento</td><td>${contrato.percentual_crescimento}%</td></tr>` : ''}
  ${contrato.duracao_meses ? `<tr><td>Duração</td><td>${contrato.duracao_meses} meses</td></tr>` : ''}
  ${contrato.multa_percentual ? `<tr><td>Multa</td><td>${contrato.multa_percentual}%</td></tr>` : ''}
  ${contrato.vigencia_inicio ? `<tr><td>Início de Vigência</td><td>${new Date(contrato.vigencia_inicio).toLocaleDateString('pt-BR')}</td></tr>` : ''}
</table>
<p>Ao assinar este contrato, o contratante concorda com os termos de prestação de serviços da Consult Delivery.</p>
<p><strong>ID do Contrato:</strong> ${contrato.id}</p>
<div class="footer">
  <div class="sign-box">Contratado — Consult Delivery</div>
  <div class="sign-box">Contratante — ${customerName || '—'}</div>
</div>
</body>
</html>`;
}

// ── Factory: recebe helpers do index.js ──────────────────────────────────────
module.exports = function contratosRouter({
  requireJwt,
  supabaseInsert,
  SUPABASE_URL,
  SUPABASE_SERVICE_KEY,
  TRIGGER_SECRET_KEY,
  ASAAS_API_KEY,
}) {
  const router = express.Router();

  // ── Helper: ler contrato com tenant guard ───────────────────────────────────
  async function fetchContrato(id, tenantId) {
    const qs = `id=eq.${encodeURIComponent(id)}&tenant_id=eq.${encodeURIComponent(tenantId)}&limit=1&select=*,customers(name,phone)`;
    const r = await fetch(`${SUPABASE_URL}/rest/v1/contratos?${qs}`, {
      headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` },
    });
    if (!r.ok) throw new Error(`supabase contratos select ${r.status}`);
    const rows = await r.json();
    return rows?.[0] ?? null;
  }

  // ── Helper: atualizar contrato (service role) ───────────────────────────────
  async function updateContrato(id, updates) {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/contratos?id=eq.${encodeURIComponent(id)}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          apikey: SUPABASE_SERVICE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
          Prefer: 'return=representation',
        },
        body: JSON.stringify({ ...updates, updated_at: new Date().toISOString() }),
      }
    );
    if (!r.ok) throw new Error(`supabase contratos update ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const data = await r.json();
    return Array.isArray(data) ? data[0] : data;
  }

  // ── Helper: upload Supabase Storage ────────────────────────────────────────
  async function uploadToStorage(bucket, path, content, contentType) {
    const r = await fetch(
      `${SUPABASE_URL}/storage/v1/object/${encodeURIComponent(bucket)}/${path}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': contentType,
          Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
          apikey: SUPABASE_SERVICE_KEY,
          'x-upsert': 'true',
        },
        body: content,
      }
    );
    if (!r.ok) throw new Error(`storage upload ${r.status}: ${(await r.text()).slice(0, 200)}`);
    return `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`;
  }

  // ── Helper: buscar instância Evolution ─────────────────────────────────────
  async function fetchEvolutionInst(tenantId) {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/evolution_instances?tenant_id=eq.${encodeURIComponent(tenantId)}&ativo=eq.true&limit=1`,
      { headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` } }
    );
    if (!r.ok) return null;
    const rows = await r.json();
    if (rows?.[0]) return rows[0];
    // fallback: qualquer instância ativa
    const r2 = await fetch(
      `${SUPABASE_URL}/rest/v1/evolution_instances?ativo=eq.true&limit=1`,
      { headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` } }
    );
    const rows2 = await r2.json();
    return rows2?.[0] ?? null;
  }

  // ════════════════════════════════════════════════════════════════════════════
  // G03.3 — POST /contratos/:id/enviar-assinatura
  // ════════════════════════════════════════════════════════════════════════════
  router.post('/contratos/:id/enviar-assinatura', requireJwt, async (req, res) => {
    const { id }       = req.params;
    const tenantId     = req.headers['x-tenant-id'];
    const phoneOverride = req.body?.phone;

    if (!tenantId)
      return res.status(400).json({ error: 'header x-tenant-id obrigatório' });
    if (!SUPABASE_SERVICE_KEY)
      return res.status(503).json({ error: 'SUPABASE_SERVICE_KEY não configurado' });

    let contrato;
    try {
      contrato = await fetchContrato(id, tenantId);
    } catch (err) {
      return res.status(500).json({ error: 'erro ao buscar contrato', detail: err.message });
    }
    if (!contrato) return res.status(404).json({ error: 'contrato não encontrado' });
    if (contrato.status === 'assinado')
      return res.status(409).json({ error: 'contrato já assinado' });

    // 1. Gerar HTML do contrato
    const customerName = contrato.customers?.name || null;
    const html         = buildContratoHtml(contrato, customerName);

    // 2. Upload para Supabase Storage
    let pdf_url;
    try {
      const path = `${tenantId}/contrato-${id}.html`;
      pdf_url = await uploadToStorage('contratos', path, html, 'text/html');
    } catch (err) {
      return res.status(500).json({ error: 'erro ao fazer upload do contrato', detail: err.message });
    }

    // 3. Atualizar contrato no DB
    try {
      await updateContrato(id, { pdf_url, status: 'enviado' });
    } catch (err) {
      return res.status(500).json({ error: 'erro ao atualizar contrato', detail: err.message });
    }

    // 4. Enviar WhatsApp (best-effort — não bloqueia retorno)
    let whatsapp_sent = false;
    const phone = phoneOverride || contrato.customers?.phone;
    if (phone) {
      try {
        const inst = await fetchEvolutionInst(tenantId);
        if (inst) {
          const wNumber = phone.replace(/\D/g, '');
          const msg = `Olá! Seu contrato da Consult Delivery está disponível para assinatura:\n${pdf_url}`;
          const r = await fetch(
            `${inst.evolution_url}/message/sendText/${inst.instance_name}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', apikey: inst.api_key },
              body: JSON.stringify({ number: wNumber, text: msg }),
              signal: AbortSignal.timeout(15_000),
            }
          );
          whatsapp_sent = r.ok;
          if (!r.ok) console.warn(`[contratos/enviar-assinatura] whatsapp ${r.status}: ${(await r.text()).slice(0, 200)}`);
        }
      } catch (err) {
        console.warn('[contratos/enviar-assinatura] whatsapp falhou (best-effort):', err.message);
      }
    }

    console.log(`[contratos/enviar-assinatura] contrato ${id} → enviado. pdf_url=${pdf_url} whatsapp=${whatsapp_sent}`);
    res.json({ success: true, pdf_url, whatsapp_sent });
  });

  // ════════════════════════════════════════════════════════════════════════════
  // G03.4a — POST /contratos/:id/link-asaas
  // ════════════════════════════════════════════════════════════════════════════
  router.post('/contratos/:id/link-asaas', requireJwt, async (req, res) => {
    const { id }   = req.params;
    const tenantId = req.headers['x-tenant-id'];

    if (!tenantId)
      return res.status(400).json({ error: 'header x-tenant-id obrigatório' });
    if (!SUPABASE_SERVICE_KEY)
      return res.status(503).json({ error: 'SUPABASE_SERVICE_KEY não configurado' });
    if (!ASAAS_API_KEY)
      return res.status(503).json({ error: 'ASAAS_API_KEY não configurado' });

    let contrato;
    try {
      contrato = await fetchContrato(id, tenantId);
    } catch (err) {
      return res.status(500).json({ error: 'erro ao buscar contrato', detail: err.message });
    }
    if (!contrato) return res.status(404).json({ error: 'contrato não encontrado' });
    if (!['enviado', 'assinado'].includes(contrato.status))
      return res.status(409).json({ error: 'contrato precisa estar enviado ou assinado' });

    // Chamar Asaas POST /subscriptions
    let asaasSub;
    try {
      const asaasBody = {
        customer:   contrato.customer_id || undefined,
        billingType: 'BOLETO',
        value:       Number(contrato.valor_mensal),
        nextDueDate: contrato.vigencia_inicio || new Date().toISOString().slice(0, 10),
        cycle:       'MONTHLY',
        description: `Contrato Consult Delivery — ${PACOTE_LABELS[contrato.pacote]}`,
      };
      const asaasEnv = process.env.ASAAS_ENV === 'sandbox'
        ? 'https://sandbox.asaas.com/api/v3'
        : 'https://api.asaas.com/api/v3';
      const r = await fetch(`${asaasEnv}/subscriptions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          access_token: ASAAS_API_KEY,
        },
        body: JSON.stringify(asaasBody),
        signal: AbortSignal.timeout(20_000),
      });
      if (!r.ok) {
        const detail = await r.text();
        return res.status(502).json({ error: 'Asaas subscriptions falhou', detail: detail.slice(0, 400) });
      }
      asaasSub = await r.json();
    } catch (err) {
      return res.status(500).json({ error: 'erro ao criar subscription Asaas', detail: err.message });
    }

    // Atualizar contrato
    const newStatus = contrato.status === 'assinado' ? 'assinado' : 'enviado';
    try {
      await updateContrato(id, { asaas_subscription_id: asaasSub.id, status: newStatus });
    } catch (err) {
      return res.status(500).json({ error: 'erro ao atualizar contrato', detail: err.message });
    }

    console.log(`[contratos/link-asaas] contrato ${id} → asaas_sub=${asaasSub.id}`);
    res.json({ asaas_subscription_id: asaasSub.id, asaas_url: asaasSub.url ?? null });
  });

  // ════════════════════════════════════════════════════════════════════════════
  // G03.4b — POST /contratos/sign  (PÚBLICO — sem auth)
  // ════════════════════════════════════════════════════════════════════════════
  router.post('/contratos/sign', async (req, res) => {
    const { contract_id, ip: bodyIp, user_agent } = req.body || {};
    const ip = bodyIp || req.ip || 'unknown';

    if (!contract_id)
      return res.status(400).json({ error: 'contract_id é obrigatório' });
    if (!SUPABASE_SERVICE_KEY)
      return res.status(503).json({ error: 'SUPABASE_SERVICE_KEY não configurado' });

    // Verificar contrato existe e está no estado correto
    let contrato;
    try {
      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/contratos?id=eq.${encodeURIComponent(contract_id)}&limit=1&select=id,status,tenant_id`,
        { headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` } }
      );
      if (!r.ok) throw new Error(`supabase select ${r.status}`);
      const rows = await r.json();
      contrato = rows?.[0] ?? null;
    } catch (err) {
      return res.status(500).json({ error: 'erro ao buscar contrato', detail: err.message });
    }
    if (!contrato) return res.status(404).json({ error: 'contrato não encontrado' });
    if (contrato.status === 'assinado')
      return res.status(409).json({ error: 'contrato já foi assinado' });
    if (!['rascunho', 'enviado'].includes(contrato.status))
      return res.status(409).json({ error: 'contrato não pode ser assinado no status atual' });

    // Gerar hash SHA256
    const timestamp = new Date().toISOString();
    const hash = crypto
      .createHash('sha256')
      .update(`${contract_id}:${timestamp}:${ip}`)
      .digest('hex');

    // Atualizar contrato
    try {
      await updateContrato(contract_id, {
        assinado_em:     timestamp,
        assinatura_hash: hash,
        status:          'assinado',
      });
    } catch (err) {
      return res.status(500).json({ error: 'erro ao registrar assinatura', detail: err.message });
    }

    // Disparar task Trigger.dev (best-effort)
    if (TRIGGER_SECRET_KEY) {
      fetch('https://api.trigger.dev/api/v1/runs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${TRIGGER_SECRET_KEY}`,
        },
        body: JSON.stringify({
          taskIdentifier: 'contrato-assinado',
          payload: { contract_id, tenant_id: contrato.tenant_id, assinado_em: timestamp },
        }),
        signal: AbortSignal.timeout(10_000),
      })
        .then(r => { if (!r.ok) r.text().then(t => console.warn('[contratos/sign] trigger falhou:', t.slice(0, 200))); })
        .catch(err => console.warn('[contratos/sign] trigger erro (best-effort):', err.message));
    }

    console.log(`[contratos/sign] contrato ${contract_id} assinado. hash=${hash.slice(0, 12)}…`);
    res.json({ success: true, assinatura_hash: hash, assinado_em: timestamp });
  });

  return router;
};
