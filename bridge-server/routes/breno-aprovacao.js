'use strict';

// POST /api/breno/aprovar/:draft_id  — envia draft do Breno (atendimento) via WhatsApp
//
// Espelha cora-aprovacao.js, mas genérico para o Breno: o destino vem do
// metadata gravado pelo trigger breno-responder (modo hibrido) — não há
// horário-legal nem dedup de cobrança, pois é atendimento, não cobrança.
//
// Autenticado via requireJwt (montado no index.js). tenant_id vem do body e é
// validado contra tenant_members para evitar IDOR cross-tenant.

const express = require('express');

module.exports = function buildBrenoAprovacaoRouter({ sbFetch, supabaseInsert }) {
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

  // ── Helper: resolve instância Evolution — por id (metadata) ou fallback connected ──
  async function getEvolutionInst(tenantId, instanceId) {
    if (instanceId) {
      const rows = await sbFetch(
        `evolution_instances?id=eq.${encodeURIComponent(instanceId)}&select=evolution_url,api_key,instance_name&limit=1`
      );
      if (rows?.length) return rows[0];
    }
    // Fallback: instância connected do tenant, depois global (igual o cora faz)
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

  // ════════════════════════════════════════════════════════════════════════════
  // POST /api/breno/aprovar/:draft_id
  // ════════════════════════════════════════════════════════════════════════════
  router.post('/breno/aprovar/:draft_id', async (req, res) => {
    const { draft_id } = req.params;
    const { tenant_id } = req.body || {};

    if (!tenant_id) return res.status(400).json({ error: 'tenant_id obrigatório no body' });

    try {
      // 0. Verificar que o usuário autenticado pertence ao tenant
      await assertTenantMember(req.user?.id, tenant_id);

      // 1. Buscar draft — aceita pending OU approved (o painel pode já ter marcado approved)
      const drafts = await sbFetch(
        `agent_drafts?id=eq.${encodeURIComponent(draft_id)}&tenant_id=eq.${encodeURIComponent(tenant_id)}&status=in.(approved,pending)&select=id,content,metadata,channel,status&limit=1`
      );
      if (!drafts?.length) {
        return res.status(404).json({ error: 'Draft não encontrado ou já processado' });
      }
      const draft = drafts[0];
      const meta = draft.metadata || {};

      // 2. Destino — gravado pelo trigger breno-responder no metadata do draft
      const whatsappChatId = meta.whatsapp_chat_id;
      if (!whatsappChatId) {
        return res.status(400).json({
          error: 'Destino ausente: o draft não tem whatsapp_chat_id no metadata. Foi gerado antes da correção de destino?',
          code:  'MISSING_DESTINATION',
        });
      }
      const conversationId = meta.conversation_id ?? null;

      // 3. Resolver instância Evolution (por metadata.instance_id ou fallback connected)
      const inst = await getEvolutionInst(tenant_id, meta.instance_id);
      if (!inst?.evolution_url || !inst?.api_key || !inst?.instance_name) {
        return res.status(503).json({ error: 'Nenhuma instância Evolution configurada' });
      }

      // 4. Enviar via Evolution API
      let ew;
      try {
        ew = await fetch(
          `${inst.evolution_url}/message/sendText/${inst.instance_name}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', apikey: inst.api_key },
            body: JSON.stringify({ number: whatsappChatId, text: draft.content }),
            signal: AbortSignal.timeout(10_000),
          }
        );
      } catch (fetchErr) {
        console.error(`[breno-aprovacao] erro de rede ao chamar Evolution: ${fetchErr.message}`);
        return res.status(502).json({ error: 'Falha de rede ao enviar via Evolution API' });
      }

      if (!ew.ok) {
        const detail = (await ew.text()).slice(0, 400);
        console.warn(`[breno-aprovacao] Evolution ${ew.status}: ${detail}`);

        // Detectar número sem WhatsApp (Evolution retorna exists:false)
        let numeroSemWhatsapp = false;
        try {
          const parsed = JSON.parse(detail);
          const msgs = parsed?.response?.message ?? [];
          numeroSemWhatsapp = Array.isArray(msgs) && msgs.some(m => m.exists === false);
        } catch (_) {}

        // Registrar erro no metadata do draft (mantém status para retry manual)
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
          console.error('[breno-aprovacao] falha ao salvar erro no draft:', patchErr.message);
        }

        if (numeroSemWhatsapp) {
          return res.status(422).json({
            error: `Número ${whatsappChatId} não está cadastrado no WhatsApp. Verifique o contato.`,
            code:  'WHATSAPP_NUMBER_NOT_FOUND',
          });
        }
        return res.status(502).json({ error: 'Falha ao enviar via Evolution API' });
      }

      // 5. Extrair o id da mensagem retornado pela Evolution (best-effort)
      let whatsappMsgId = null;
      try {
        const sendData = await ew.json();
        whatsappMsgId = sendData?.key?.id ?? null;
      } catch (_) {}

      console.log(`[breno-aprovacao] mensagem enviada → ${whatsappChatId}`);

      // 6. Registrar a mensagem outbound em messages (best-effort — não bloqueia o sucesso)
      if (conversationId) {
        try {
          await supabaseInsert('messages', {
            tenant_id,
            conversation_id: conversationId,
            direction:       'outbound',
            sender_name:     'BRENO',
            content:         draft.content,
            whatsapp_msg_id: whatsappMsgId,
            created_at:      new Date().toISOString(),
          });
        } catch (insErr) {
          console.error('[breno-aprovacao] falha ao inserir em messages:', insErr.message);
        }
      } else {
        console.warn('[breno-aprovacao] conversation_id ausente no metadata — não registrei em messages');
      }

      // 7. Atualizar draft → sent (filtra por tenant_id p/ não cruzar tenants)
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

      // 8. Marcar a conversa como tratada pelo Breno (best-effort)
      if (conversationId) {
        try {
          await sbFetch(
            `conversations?id=eq.${encodeURIComponent(conversationId)}&tenant_id=eq.${encodeURIComponent(tenant_id)}`,
            {
              method: 'PATCH',
              body: { last_breno_handled_at: new Date().toISOString() },
            }
          );
        } catch (convErr) {
          console.error('[breno-aprovacao] falha ao atualizar conversations:', convErr.message);
        }
      }

      console.log(`[breno-aprovacao] draft=${draft_id} aprovado e enviado`);
      return res.json({ ok: true, enviado_para: whatsappChatId });
    } catch (err) {
      if (err.status === 403) return res.status(403).json({ error: 'forbidden' });
      console.error('[breno-aprovacao/aprovar]', err.message);
      return res.status(500).json({ error: 'Erro interno ao aprovar o draft' });
    }
  });

  return router;
};
