'use strict';

// POST /api/cora/aprovar/:draft_id   — aprova draft da Cora e envia via WhatsApp
// POST /api/cora/rejeitar/:draft_id  — rejeita draft da Cora
//
// Ambos autenticados via requireJwt. tenant_id vem do body e é validado
// contra tenant_members para evitar IDOR cross-tenant.

const express = require('express');

module.exports = function buildCoraAprovacaoRouter({ sbFetch, supabaseInsert }) {
  const router = express.Router();

  // ── Helper: verifica se o usuário pertence ao tenant ─────────────────────────
  async function assertTenantMember(userId, tenantId) {
    if (!userId || userId === 'dev') return; // dev mode sem validação
    const rows = await sbFetch(
      `tenant_members?user_id=eq.${encodeURIComponent(userId)}&tenant_id=eq.${encodeURIComponent(tenantId)}&select=role&limit=1`
    );
    if (!rows?.length) {
      const err = new Error('forbidden');
      err.status = 403;
      throw err;
    }
  }

  // ── Helper: busca instância Evolution (tenant-specific ou fallback global) ────
  async function getEvolutionInst(tenantId) {
    let rows = await sbFetch(
      `evolution_instances?tenant_id=eq.${encodeURIComponent(tenantId)}&ativo=eq.true&select=evolution_url,api_key,instance_name&limit=1`
    );
    if (!rows?.length) {
      rows = await sbFetch(
        `evolution_instances?ativo=eq.true&select=evolution_url,api_key,instance_name&limit=1`
      );
    }
    return rows?.[0] ?? null;
  }

  // ════════════════════════════════════════════════════════════════════════════
  // POST /api/cora/aprovar/:draft_id
  // ════════════════════════════════════════════════════════════════════════════
  router.post('/cora/aprovar/:draft_id', async (req, res) => {
    const { draft_id } = req.params;
    const { tenant_id } = req.body || {};

    if (!tenant_id) return res.status(400).json({ error: 'tenant_id obrigatório no body' });

    try {
      // 0. Verificar que o usuário autenticado pertence ao tenant
      await assertTenantMember(req.user?.id, tenant_id);

      // 1. Buscar draft pendente
      const drafts = await sbFetch(
        `agent_drafts?id=eq.${encodeURIComponent(draft_id)}&tenant_id=eq.${encodeURIComponent(tenant_id)}&status=eq.pending&select=id,body,metadata&limit=1`
      );
      if (!drafts?.length) {
        return res.status(404).json({ error: 'Draft não encontrado ou já processado' });
      }
      const draft = drafts[0];
      const meta = draft.metadata || {};
      const mensagem = draft.body;
      const phone = meta.customer_phone;
      const cobrancaV2Id = meta.cobranca_v2_id ?? null;

      // ?test_phone=5511999999999 redireciona para número de teste (apenas usuários autenticados)
      const rawTestPhone = req.query.test_phone;
      if (rawTestPhone !== undefined && !/^\d{10,15}$/.test(rawTestPhone)) {
        return res.status(400).json({ error: 'test_phone inválido — use apenas dígitos (10-15 caracteres, ex: 5511999999999)' });
      }
      const targetPhone = rawTestPhone || phone;

      if (!targetPhone) {
        return res.status(400).json({ error: 'customer_phone não está no metadata do draft' });
      }

      // 2. Buscar instância Evolution
      const inst = await getEvolutionInst(tenant_id);
      if (!inst?.evolution_url || !inst?.api_key || !inst?.instance_name) {
        return res.status(503).json({ error: 'Nenhuma instância Evolution configurada' });
      }

      // 3. Enviar via Evolution API
      const ew = await fetch(
        `${inst.evolution_url}/message/sendText/${inst.instance_name}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', apikey: inst.api_key },
          body: JSON.stringify({ number: targetPhone, text: mensagem }),
        }
      );
      if (!ew.ok) {
        const detail = (await ew.text()).slice(0, 200);
        console.warn(`[cora-aprovacao] Evolution ${ew.status}: ${detail}`);
        return res.status(502).json({ error: 'Falha ao enviar via Evolution API', detail });
      }
      const isTest = req.query.test_phone ? ` (TESTE → ${targetPhone})` : '';
      console.log(`[cora-aprovacao] mensagem enviada → ${targetPhone}${isTest}`);

      // 4. Atualizar draft → sent
      await sbFetch(
        `agent_drafts?id=eq.${encodeURIComponent(draft_id)}`,
        {
          method: 'PATCH',
          body: {
            status:  'sent',
            sent_at: new Date().toISOString(),
          },
        }
      );

      // 5. Registrar em cora_acoes
      await supabaseInsert('cora_acoes', {
        tenant_id,
        cobranca_v2_id:   cobrancaV2Id,
        cobranca_id:      null,
        tipo:             'mensagem_enviada',
        acao:             'aprovado_e_enviado',
        canal:            'whatsapp',
        agente:           'cora',
        conteudo:         mensagem,
        mensagem_enviada: mensagem,
      });

      console.log(`[cora-aprovacao] draft=${draft_id} aprovado e enviado`);
      return res.json({ ok: true, enviado_para: targetPhone, test_mode: !!req.query.test_phone });
    } catch (err) {
      if (err.status === 403) return res.status(403).json({ error: 'forbidden' });
      console.error('[cora-aprovacao/aprovar]', err.message);
      return res.status(500).json({ error: err.message });
    }
  });

  // ════════════════════════════════════════════════════════════════════════════
  // POST /api/cora/rejeitar/:draft_id
  // ════════════════════════════════════════════════════════════════════════════
  router.post('/cora/rejeitar/:draft_id', async (req, res) => {
    const { draft_id } = req.params;
    const { tenant_id, motivo } = req.body || {};

    if (!tenant_id) return res.status(400).json({ error: 'tenant_id obrigatório no body' });

    try {
      // 0. Verificar que o usuário autenticado pertence ao tenant
      await assertTenantMember(req.user?.id, tenant_id);

      // 1. Buscar draft pendente
      const drafts = await sbFetch(
        `agent_drafts?id=eq.${encodeURIComponent(draft_id)}&tenant_id=eq.${encodeURIComponent(tenant_id)}&status=eq.pending&select=id,metadata&limit=1`
      );
      if (!drafts?.length) {
        return res.status(404).json({ error: 'Draft não encontrado ou já processado' });
      }
      const draft = drafts[0];
      const meta = draft.metadata || {};

      // 2. Atualizar draft → rejected
      await sbFetch(
        `agent_drafts?id=eq.${encodeURIComponent(draft_id)}`,
        {
          method: 'PATCH',
          body: {
            status:   'rejected',
            metadata: { ...meta, motivo_rejeicao: motivo ?? null },
          },
        }
      );

      // 3. Registrar em cora_acoes
      await supabaseInsert('cora_acoes', {
        tenant_id,
        cobranca_v2_id:   meta.cobranca_v2_id ?? null,
        cobranca_id:      null,
        tipo:             'draft_rejeitado',
        acao:             'draft_rejeitado',
        canal:            'whatsapp',
        agente:           'cora',
        conteudo:         motivo ?? 'rejeitado sem motivo',
        mensagem_enviada: null,
      });

      console.log(`[cora-aprovacao] draft=${draft_id} rejeitado`);
      return res.json({ ok: true });
    } catch (err) {
      if (err.status === 403) return res.status(403).json({ error: 'forbidden' });
      console.error('[cora-aprovacao/rejeitar]', err.message);
      return res.status(500).json({ error: err.message });
    }
  });

  return router;
};
