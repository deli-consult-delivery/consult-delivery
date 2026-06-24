'use strict';

// PATCH /api/cora/cobrancas/:id/ignorar  — marca cobrança como isenta (não cobrar)
// POST  /api/cora/cobrancas/:id/marcar-pago — registra pagamento manual (PIX externo)
//
// Ambos autenticados via requireJwt. tenant_id vem do body e é validado
// contra tenant_members para evitar IDOR cross-tenant.

const express = require('express');

module.exports = function buildCoraGestaoRouter({ sbFetch, supabaseInsert }) {
  const router = express.Router();

  async function assertTenantMember(userId, tenantId) {
    if (!userId || userId === 'dev') return;
    const rows = await sbFetch(
      `tenant_members?user_id=eq.${encodeURIComponent(userId)}&tenant_id=eq.${encodeURIComponent(tenantId)}&select=role&limit=1`
    );
    if (!rows?.length) {
      const err = new Error('forbidden');
      err.status = 403;
      throw err;
    }
  }

  // ════════════════════════════════════════════════════════════════════════════
  // PATCH /api/cora/cobrancas/:id/ignorar
  // Body: { tenant_id, ignorar: true|false, motivo? }
  // ════════════════════════════════════════════════════════════════════════════
  router.patch('/cora/cobrancas/:id/ignorar', async (req, res) => {
    const { id } = req.params;
    const { tenant_id, ignorar, motivo } = req.body || {};

    if (!tenant_id) return res.status(400).json({ error: 'tenant_id obrigatório no body' });
    if (typeof ignorar !== 'boolean') return res.status(400).json({ error: 'ignorar deve ser true ou false' });

    try {
      await assertTenantMember(req.user?.id, tenant_id);

      // Verifica que a cobrança pertence ao tenant
      const rows = await sbFetch(
        `cobrancas?id=eq.${encodeURIComponent(id)}&tenant_id=eq.${encodeURIComponent(tenant_id)}&select=id,customer_name,status&limit=1`
      );
      if (!rows?.length) return res.status(404).json({ error: 'Cobrança não encontrada' });

      // Atualiza isenção
      await sbFetch(
        `cobrancas?id=eq.${encodeURIComponent(id)}&tenant_id=eq.${encodeURIComponent(tenant_id)}`,
        {
          method: 'PATCH',
          body: {
            ignorar_cobranca: ignorar,
            ignorar_motivo:   ignorar ? (motivo ?? null) : null,
          },
        }
      );

      // Ao ignorar: rejeita drafts pendentes desta cobrança específica para que
      // não apareçam na fila de aprovação
      if (ignorar) {
        await sbFetch(
          `agent_drafts?tenant_id=eq.${encodeURIComponent(tenant_id)}&agent_name=eq.cora&status=eq.pending&metadata->>cobranca_v2_id=eq.${encodeURIComponent(id)}`,
          { method: 'PATCH', body: { status: 'rejected' } }
        );
      }

      // Registra auditoria
      await supabaseInsert('cora_acoes', {
        tenant_id,
        cobranca_v2_id: id,
        tipo:           ignorar ? 'ignorar_cobranca' : 'reativar_cobranca',
        acao:           ignorar ? 'marcado_como_isento' : 'isencao_removida',
        canal:          'painel',
        agente:         'humano',
        conteudo:       motivo ?? (ignorar ? 'isento sem motivo' : 'cobrança reativada'),
        mensagem_enviada: null,
      });

      console.log(`[cora-gestao] cobranca=${id} ignorar_cobranca=${ignorar}`);
      return res.json({ ok: true, ignorar_cobranca: ignorar });
    } catch (err) {
      if (err.status === 403) return res.status(403).json({ error: 'forbidden' });
      console.error('[cora-gestao/ignorar]', err.message);
      return res.status(500).json({ error: 'Erro interno ao atualizar isenção' });
    }
  });

  // ════════════════════════════════════════════════════════════════════════════
  // POST /api/cora/cobrancas/:id/marcar-pago
  // Body: { tenant_id, observacao? }
  // ════════════════════════════════════════════════════════════════════════════
  router.post('/cora/cobrancas/:id/marcar-pago', async (req, res) => {
    const { id } = req.params;
    const { tenant_id, observacao } = req.body || {};

    if (!tenant_id) return res.status(400).json({ error: 'tenant_id obrigatório no body' });

    try {
      await assertTenantMember(req.user?.id, tenant_id);

      // Verifica que a cobrança pertence ao tenant e não está já quitada
      const rows = await sbFetch(
        `cobrancas?id=eq.${encodeURIComponent(id)}&tenant_id=eq.${encodeURIComponent(tenant_id)}&select=id,status,customer_name,valor,asaas_charge_id&limit=1`
      );
      if (!rows?.length) return res.status(404).json({ error: 'Cobrança não encontrada' });
      const cob = rows[0];

      if (cob.status === 'received') {
        return res.status(409).json({ error: 'Cobrança já está marcada como recebida' });
      }

      const agora = new Date().toISOString();

      // 1. Atualiza status da cobrança para received
      await sbFetch(
        `cobrancas?id=eq.${encodeURIComponent(id)}&tenant_id=eq.${encodeURIComponent(tenant_id)}`,
        {
          method: 'PATCH',
          body: {
            status:         'received',
            payment_date:   agora.slice(0, 10),
            ignorar_cobranca: true,
            ignorar_motivo:   'pago_manual_pix',
          },
        }
      );

      // 2. Chama Asaas API para dar baixa manual na fatura (receiveInCash)
      if (cob.asaas_charge_id) {
        const asaasApiKey = process.env.ASAAS_API_KEY;
        if (asaasApiKey) {
          try {
            const asaasRes = await fetch(
              `https://api.asaas.com/v3/payments/${encodeURIComponent(cob.asaas_charge_id)}/receiveInCash`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'access_token': asaasApiKey },
                body: JSON.stringify({ paymentDate: agora.slice(0, 10), value: Number(cob.valor) }),
              }
            );
            if (!asaasRes.ok) {
              const detail = (await asaasRes.text()).slice(0, 300);
              console.warn(`[cora-gestao/marcar-pago] Asaas receiveInCash ${asaasRes.status}: ${detail}`);
            } else {
              console.log(`[cora-gestao/marcar-pago] Asaas baixa registrada para ${cob.asaas_charge_id}`);
            }
          } catch (asaasErr) {
            // Não falha a operação local — a baixa interna já foi registrada
            console.warn(`[cora-gestao/marcar-pago] Erro ao chamar Asaas: ${asaasErr.message}`);
          }
        } else {
          console.warn('[cora-gestao/marcar-pago] ASAAS_API_KEY não configurado — baixa não enviada ao Asaas');
        }
      }

      // 3. Insere evento de pagamento
      await supabaseInsert('cobranca_eventos', {
        tenant_id,
        cobranca_id:  id,
        event_type:   'payment_received',
        triggered_by: 'manual',
        metadata:     { observacao: observacao ?? null, marcado_por: req.user?.id ?? null },
      });

      // 4. Rejeita apenas os drafts pendentes desta cobrança específica
      await sbFetch(
        `agent_drafts?tenant_id=eq.${encodeURIComponent(tenant_id)}&agent_name=eq.cora&status=eq.pending&metadata->>cobranca_v2_id=eq.${encodeURIComponent(id)}`,
        { method: 'PATCH', body: { status: 'rejected' } }
      );

      // 5. Registra auditoria
      await supabaseInsert('cora_acoes', {
        tenant_id,
        cobranca_v2_id:   id,
        tipo:             'marcar_pago_manual',
        acao:             'pagamento_manual_registrado',
        canal:            'painel',
        agente:           'humano',
        conteudo:         observacao ?? 'pagamento manual via PIX',
        mensagem_enviada: null,
      });

      console.log(`[cora-gestao] cobranca=${id} marcada como paga manualmente`);
      return res.json({ ok: true, status: 'received', payment_date: agora.slice(0, 10) });
    } catch (err) {
      if (err.status === 403) return res.status(403).json({ error: 'forbidden' });
      console.error('[cora-gestao/marcar-pago]', err.message);
      return res.status(500).json({ error: 'Erro interno ao marcar pagamento' });
    }
  });

  return router;
};
