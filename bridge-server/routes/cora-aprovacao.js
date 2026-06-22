'use strict';

// POST /api/cora/aprovar/:draft_id   — aprova draft da Cora e envia via WhatsApp
// POST /api/cora/rejeitar/:draft_id  — rejeita draft da Cora
//
// Ambos autenticados via requireJwt. tenant_id vem do body e é validado
// contra tenant_members para evitar IDOR cross-tenant.

const express = require('express');
const { dentroHorarioLegal } = require('../lib/horario-cobranca');

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
      `evolution_instances?tenant_id=eq.${encodeURIComponent(tenantId)}&status=eq.connected&select=evolution_url,api_key,instance_name&limit=1`
    );
    if (!rows?.length) {
      rows = await sbFetch(
        `evolution_instances?status=eq.connected&select=evolution_url,api_key,instance_name&limit=1`
      );
    }
    return rows?.[0] ?? null;
  }

  // ── Helper: garante prefixo 55 para números brasileiros sem DDI ─────────────────────
  // Asaas salva números sem DDI (ex: 94992995662). Evolution espera DDI (5594992995662).
  function normalizePhone(num) {
    if (!num) return num;
    const digits = String(num).replace(/\D/g, '');
    if (digits.startsWith('55') && digits.length >= 12) return digits;
    if (digits.length >= 10 && digits.length <= 11) return `55${digits}`;
    return digits;
  }

  // ── Helper: anexa a assinatura fixa ao final da mensagem (idempotente) ─────────────
  const ASSINATURA_CORA = '*Cora* | Financeiro, Consult Delivery';
  const ASSINATURA_MARKER = '| Financeiro, Consult Delivery';
  function anexarAssinatura(mensagem) {
    const texto = (mensagem || '').trimEnd();
    if (texto.includes(ASSINATURA_MARKER)) return texto;
    return `${texto}\n\n${ASSINATURA_CORA}`;
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
        `agent_drafts?id=eq.${encodeURIComponent(draft_id)}&tenant_id=eq.${encodeURIComponent(tenant_id)}&status=eq.pending&select=id,content,metadata,loja_id&limit=1`
      );
      if (!drafts?.length) {
        return res.status(404).json({ error: 'Draft não encontrado ou já processado' });
      }
      const draft = drafts[0];
      const meta = draft.metadata || {};
      const phone = meta.customer_phone;
      const cobrancaV2Id = meta.cobranca_v2_id ?? null;

      // ?test_phone=5511999999999 redireciona para número de teste (apenas usuários autenticados)
      const rawTestPhone = req.query.test_phone;
      if (rawTestPhone !== undefined && !/^\d{10,15}$/.test(rawTestPhone)) {
        return res.status(400).json({ error: 'test_phone inválido — use apenas dígitos (10-15 caracteres, ex: 5511999999999)' });
      }
      const targetPhone = normalizePhone(rawTestPhone || phone);

      if (!targetPhone) {
        return res.status(400).json({ error: 'customer_phone não está no metadata do draft' });
      }

      // Só é "teste" quando o número difere do cliente real. Passar o telefone do
      // cliente como ?test_phone NÃO contorna a guarda de horário legal.
      const isTestSend = rawTestPhone !== undefined && rawTestPhone !== phone;

      // 2. Guarda de horário legal (Seg–Sex 8–21h · Sáb 8–12h · Dom/feriado: proibido).
      //    Envio de teste para o próprio número é isento. Cobrança automática boleto/PIX
      //    (Asaas) não passa por aqui, então segue sem restrição — conforme o requisito.
      if (!isTestSend) {
        const horario = dentroHorarioLegal();
        if (!horario.permitido) {
          console.warn(`[cora-aprovacao] bloqueado por horário legal: ${horario.motivo}`);
          return res.status(409).json({
            error: 'Fora do horário legal de cobrança',
            motivo: horario.motivo,
            proximaJanela: horario.proximaJanela,
          });
        }
      }

      // 3. Montar mensagem com assinatura fixa da CORA.
      const mensagem = anexarAssinatura(draft.content);

      // 4. Buscar instância Evolution
      const inst = await getEvolutionInst(tenant_id);
      if (!inst?.evolution_url || !inst?.api_key || !inst?.instance_name) {
        return res.status(503).json({ error: 'Nenhuma instância Evolution configurada' });
      }

      // 5. Enviar via Evolution API
      const ew = await fetch(
        `${inst.evolution_url}/message/sendText/${inst.instance_name}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', apikey: inst.api_key },
          body: JSON.stringify({ number: targetPhone, text: mensagem }),
        }
      );
      if (!ew.ok) {
        const detail = (await ew.text()).slice(0, 400);
        console.warn(`[cora-aprovacao] Evolution ${ew.status}: ${detail}`);

        // Detectar número sem WhatsApp (Evolution retorna exists:false)
        let numeroSemWhatsapp = false;
        try {
          const parsed = JSON.parse(detail);
          const msgs = parsed?.response?.message ?? [];
          numeroSemWhatsapp = msgs.some(m => m.exists === false);
        } catch (_) {}

        // Registrar erro no metadata do draft (mantém pending para retry manual)
        try {
          await sbFetch(
            `agent_drafts?id=eq.${encodeURIComponent(draft_id)}&tenant_id=eq.${encodeURIComponent(tenant_id)}`,
            {
              method: 'PATCH',
              body: {
                metadata: {
                  ...meta,
                  last_error: detail,
                  last_error_at: new Date().toISOString(),
                  last_error_status: ew.status,
                  numero_sem_whatsapp: numeroSemWhatsapp,
                },
              },
            }
          );
        } catch (patchErr) {
          console.error('[cora-aprovacao] falha ao salvar erro no draft:', patchErr.message);
        }

        // Registrar em cora_acoes para rastreio e retry pelo agente
        try {
          await supabaseInsert('cora_acoes', {
            tenant_id,
            cobranca_v2_id: cobrancaV2Id,
            tipo:           'erro_envio',
            acao:           numeroSemWhatsapp ? 'numero_sem_whatsapp' : 'falha_whatsapp',
            canal:          'whatsapp',
            agente:         'cora',
            conteudo:       `Evolution ${ew.status}: ${detail}`,
            mensagem_enviada: null,
          });
        } catch (insErr) {
          console.error('[cora-aprovacao] falha ao registrar em cora_acoes:', insErr.message);
        }

        if (numeroSemWhatsapp) {
          return res.status(422).json({
            error: `Número ${targetPhone} não está cadastrado no WhatsApp. Verifique o contato.`,
            code:  'WHATSAPP_NUMBER_NOT_FOUND',
          });
        }
        return res.status(502).json({ error: 'Falha ao enviar via Evolution API' });
      }
      const isTest = req.query.test_phone ? ` (TESTE → ${targetPhone})` : '';
      console.log(`[cora-aprovacao] mensagem enviada → ${targetPhone}${isTest}`);

      // 6. Atualizar draft → sent (filtra por tenant_id p/ não cruzar tenants)
      await sbFetch(
        `agent_drafts?id=eq.${encodeURIComponent(draft_id)}&tenant_id=eq.${encodeURIComponent(tenant_id)}`,
        {
          method: 'PATCH',
          body: {
            status:  'sent',
            sent_at: new Date().toISOString(),
          },
        }
      );

      // 7. Registrar em cora_acoes
      await supabaseInsert('cora_acoes', {
        tenant_id,
        cobranca_v2_id:   cobrancaV2Id,
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
      return res.status(500).json({ error: 'Erro interno ao aprovar o draft' });
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

      // 2. Atualizar draft → rejected (filtra por tenant_id p/ não cruzar tenants)
      await sbFetch(
        `agent_drafts?id=eq.${encodeURIComponent(draft_id)}&tenant_id=eq.${encodeURIComponent(tenant_id)}`,
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
      return res.status(500).json({ error: 'Erro interno ao rejeitar o draft' });
    }
  });

  return router;
};
