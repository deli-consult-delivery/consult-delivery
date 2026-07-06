'use strict';

// POST /api/gestor/aprovar/:draft_id  — aprova e EXECUTA um draft do GESTOR (Consultor de iFood)
// POST /api/gestor/rejeitar/:draft_id — rejeita sem executar
//
// Espelha breno-aprovacao.js (auth: requireJwt montado no index.js + assertTenantMember).
// Despacha por channel:
//   'whatsapp'     → Evolution API (relatórios/alertas em grupo/PV, ver lib/evolution-send.js)
//   'portal_ifood' → runners preencher+enviar do ifood-portal-worker, via a própria rota
//                    interna POST /api/portal-worker/run (mesmo processo — reusa o mutex
//                    in-process do runner de portal, que só permite 1 sessão por vez).
//
// NÃO toca na lógica anti-TOCTOU de enviarResposta (ifood-portal-worker/index.js): o texto
// aprovado do draft é repassado como env TEXTO_APROVADO — se divergir do campo no drawer no
// momento do envio, o worker aborta sozinho.

const express = require('express');
const { sendEvolutionText } = require('../lib/evolution-send');

const PORT = process.env.PORT || 3001;
const INTERNAL_BRIDGE_TOKEN = process.env.INTERNAL_BRIDGE_TOKEN;
const PORTAL_TIMEOUT_MS = 190_000; // folga sobre o TIMEOUT_MS (180s) do runner de portal

module.exports = function buildGestorAprovacaoRouter({ sbFetch, supabaseInsert, fetchFn }) {
  const router = express.Router();
  const doFetch = fetchFn || fetch;

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

  // ── Helper: chama a própria rota interna do portal-worker (in-process) ───────
  async function runPortalWorker(runner, loja, env) {
    let resp;
    try {
      resp = await doFetch(`http://127.0.0.1:${PORT}/api/portal-worker/run`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'x-internal-token': INTERNAL_BRIDGE_TOKEN },
        body:    JSON.stringify({ runner, loja, env }),
        signal:  AbortSignal.timeout(PORTAL_TIMEOUT_MS),
      });
    } catch (fetchErr) {
      return { httpOk: false, exitCode: null, stdout: '', stderr: `[fetch error] ${fetchErr.message}` };
    }
    const data = await resp.json().catch(() => ({}));
    return { httpOk: resp.ok, exitCode: data.exitCode, stdout: data.stdout, stderr: data.stderr };
  }

  // ── Helper: resolve o nome da loja no Portal (garantirLoja precisa dele) ─────
  async function getLojaPortalNome(lojaId) {
    if (!lojaId) return null;
    const rows = await sbFetch(
      `lojas?id=eq.${encodeURIComponent(lojaId)}&select=ifood_portal_nome&limit=1`
    );
    return rows?.[0]?.ifood_portal_nome ?? null;
  }

  // ════════════════════════════════════════════════════════════════════════════
  // POST /api/gestor/aprovar/:draft_id
  // ════════════════════════════════════════════════════════════════════════════
  router.post('/gestor/aprovar/:draft_id', async (req, res) => {
    req.setTimeout(2 * PORTAL_TIMEOUT_MS + 10_000); // 2 runners sequenciais (preencher+enviar)
    const { draft_id } = req.params;
    const { tenant_id } = req.body || {};

    if (!tenant_id) return res.status(400).json({ error: 'tenant_id obrigatório no body' });

    try {
      // 0. Verificar que o usuário autenticado pertence ao tenant
      await assertTenantMember(req.user?.id, tenant_id);

      // 1. Buscar draft — precisa estar pending e ser do gestor (evita cruzar com outros agentes)
      const drafts = await sbFetch(
        `agent_drafts?id=eq.${encodeURIComponent(draft_id)}&tenant_id=eq.${encodeURIComponent(tenant_id)}&agent_name=eq.gestor&status=eq.pending&select=id,content,channel,target_id,loja_id,metadata&limit=1`
      );
      if (!drafts?.length) {
        return res.status(409).json({ error: 'Draft não encontrado, não é do gestor, ou já processado' });
      }
      const draft = drafts[0];
      const meta = draft.metadata || {};

      let despacho;

      // 2a. WhatsApp — relatórios/alertas do gestor
      if (draft.channel === 'whatsapp') {
        const numero = meta.whatsapp_chat_id || draft.target_id;
        if (!numero) {
          return res.status(400).json({
            error: 'Destino ausente: o draft não tem whatsapp_chat_id no metadata nem target_id.',
            code:  'MISSING_DESTINATION',
          });
        }
        const r = await sendEvolutionText({ tenantId: tenant_id, number: numero, text: draft.content, sbFetch });
        if (!r.ok) {
          return res.status(502).json({ error: 'Falha ao enviar via Evolution API', detail: r.detail });
        }
        despacho = { canal: 'whatsapp', destino: numero };

      // 2b. Portal iFood — resposta de avaliação
      } else if (draft.channel === 'portal_ifood') {
        const pedido = meta.pedido;
        if (!pedido) {
          return res.status(400).json({ error: 'metadata incompleto: pedido ausente', code: 'MISSING_METADATA' });
        }
        const loja = meta.loja_portal || (await getLojaPortalNome(draft.loja_id));
        if (!loja) {
          return res.status(400).json({
            error: 'Nome da loja no Portal não resolvido (lojas.ifood_portal_nome ausente e sem metadata.loja_portal)',
            code:  'MISSING_LOJA_PORTAL',
          });
        }

        const preencher = await runPortalWorker('preencher', loja, { PEDIDO: String(pedido), TEXTO_APROVADO: draft.content });
        if (!preencher.httpOk || preencher.exitCode !== 0) {
          return res.status(502).json({
            error:  'Falha ao preencher a resposta no portal',
            stdout: preencher.stdout,
            stderr: preencher.stderr,
          });
        }

        // reviewId retornado por preencherResposta (best-effort, cruza o envio com o drawer certo)
        let reviewId = null;
        const m = /RESULTADO=(\{.*\})/.exec(preencher.stdout || '');
        if (m) {
          try { reviewId = JSON.parse(m[1])?.reviewId ?? null; } catch (_) { /* best-effort */ }
        }

        const enviarEnv = { TEXTO_APROVADO: draft.content, CONFIRMAR_ENVIO: '1' };
        if (reviewId) enviarEnv.REVIEW_ID = reviewId;

        const enviar = await runPortalWorker('enviar', loja, enviarEnv);
        if (!enviar.httpOk || enviar.exitCode !== 0) {
          return res.status(502).json({
            error:  'Falha ao publicar a resposta no portal',
            stdout: enviar.stdout,
            stderr: enviar.stderr,
          });
        }
        despacho = { canal: 'portal_ifood', loja, pedido };

      } else {
        return res.status(400).json({ error: `channel não suportado: ${draft.channel}` });
      }

      // 3. Draft → sent (filtra por tenant_id p/ não cruzar tenants)
      await sbFetch(
        `agent_drafts?id=eq.${encodeURIComponent(draft_id)}&tenant_id=eq.${encodeURIComponent(tenant_id)}`,
        {
          method: 'PATCH',
          body: {
            status:      'sent',
            reviewer_id: req.user?.id ?? null,
            reviewed_at: new Date().toISOString(),
            sent_at:     new Date().toISOString(),
          },
        }
      );

      // 4. client_timeline (best-effort — não bloqueia o sucesso)
      if (supabaseInsert) {
        await supabaseInsert('client_timeline', {
          tenant_id,
          loja_id:    draft.loja_id ?? null,
          agent_name: 'gestor',
          event_type: 'draft_enviado',
          title:      `Gestor: draft enviado via ${despacho.canal}${despacho.loja ? ' — ' + despacho.loja : ''}`,
          payload:    { draft_id, canal: despacho.canal },
        }).catch((e) => console.error('[gestor-aprovacao] falha ao inserir em client_timeline:', e.message));
      }

      console.log(`[gestor-aprovacao] draft=${draft_id} aprovado e enviado via ${despacho.canal}`);
      return res.json({ ok: true, ...despacho });
    } catch (err) {
      if (err.status === 403) return res.status(403).json({ error: 'forbidden' });
      console.error('[gestor-aprovacao/aprovar]', err.message);
      return res.status(500).json({ error: 'Erro interno ao aprovar o draft' });
    }
  });

  // ════════════════════════════════════════════════════════════════════════════
  // POST /api/gestor/rejeitar/:draft_id
  // ════════════════════════════════════════════════════════════════════════════
  router.post('/gestor/rejeitar/:draft_id', async (req, res) => {
    const { draft_id } = req.params;
    const { tenant_id } = req.body || {};

    if (!tenant_id) return res.status(400).json({ error: 'tenant_id obrigatório no body' });

    try {
      await assertTenantMember(req.user?.id, tenant_id);

      const drafts = await sbFetch(
        `agent_drafts?id=eq.${encodeURIComponent(draft_id)}&tenant_id=eq.${encodeURIComponent(tenant_id)}&agent_name=eq.gestor&status=eq.pending&select=id&limit=1`
      );
      if (!drafts?.length) {
        return res.status(409).json({ error: 'Draft não encontrado, não é do gestor, ou já processado' });
      }

      await sbFetch(
        `agent_drafts?id=eq.${encodeURIComponent(draft_id)}&tenant_id=eq.${encodeURIComponent(tenant_id)}`,
        {
          method: 'PATCH',
          body: {
            status:      'rejected',
            reviewer_id: req.user?.id ?? null,
            reviewed_at: new Date().toISOString(),
          },
        }
      );

      console.log(`[gestor-aprovacao] draft=${draft_id} rejeitado`);
      return res.json({ ok: true });
    } catch (err) {
      if (err.status === 403) return res.status(403).json({ error: 'forbidden' });
      console.error('[gestor-aprovacao/rejeitar]', err.message);
      return res.status(500).json({ error: 'Erro interno ao rejeitar o draft' });
    }
  });

  return router;
};
